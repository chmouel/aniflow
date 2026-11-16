"""`aniflow --export`: a document's diagrams rendered into files by headless Chrome.

The page is served from a one-shot local server on 127.0.0.1: it renders the
document, runs the walkthrough of each diagram, and POSTs each file back to that
same server, which writes it into the output directory.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from aniflow import page, web

KINDS = ("gif", "mp4", "webm", "png")
CHROME_NAMES = (
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
)
CHROME_FLAGS = (
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--mute-audio",
    "--hide-scrollbars",
    "--window-size=1400,1000",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
)
MAX_BODY = 256 * 1024**2
TIMEOUT = 900
POLL = 0.2
GRACE = 2.0
MERMAID_SUFFIXES = {".mmd", ".mermaid"}
MERMAID_START = re.compile(
    r"(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram"
    r"|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline"
    r"|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta|C4\w+)\b"
)

# Runs after the reader has drawn the page: waits for the diagrams, exports each
# selected one through the public library and posts the bytes back. Every message
# it shows is set with textContent.
EXPORT_JS = r"""
(() => {
  const job = JSON.parse(document.getElementById('aniflow-export').textContent);
  const pad = (value) => String(value).padStart(2, '0');
  const stages = () => [...document.querySelectorAll('.diagram-stage[data-diagram]')];
  const indexOf = (stage) => Number(stage.dataset.diagram);
  // A block keeps its title and never becomes a stage when Mermaid cannot draw it, so it is
  // reported by position among the document's Mermaid blocks, which is the stage number.
  const failed = () => [...document.querySelectorAll('.mermaid-diagram, .highlight-source-mermaid')]
    .flatMap((block, at) => block.classList.contains('highlight-source-mermaid')
      ? [{ diagram: at + 1, message: (block.title || 'it did not render').replace(/^Mermaid: /, '').replace(/\s+/g, ' ') }]
      : []);
  const warnings = () => [...document.querySelectorAll('.diagram-problems li')].map((item) => item.textContent);
  const why = () => {
    const found = [...failed().map((row) => row.message), ...warnings()];
    return found.length ? ' (' + found.join('; ') + ')' : '';
  };
  const next = () => new Promise((resolve) => setTimeout(resolve, 200));
  let settled = false;
  const post = (url, body, type) => fetch(url, {
    method: 'POST',
    body: body,
    headers: { 'Content-Type': type || 'application/json' },
  }).then((response) => {
    if (!response.ok) throw new Error('the export server answered ' + response.status);
  });
  const tell = (url, payload) => {
    if (settled) return Promise.resolve();
    settled = true;
    return post(url, JSON.stringify(payload)).catch(() => {});
  };
  const fail = (error) => tell(job.error, { message: String((error && error.message) || error) });
  const timer = setTimeout(() => fail('the export took longer than ' + Math.round(job.timeout / 1000) + ' seconds'), job.timeout);
  async function drawn() {
    const deadline = Date.now() + job.timeout;
    while (document.querySelectorAll('.highlight-source-mermaid:not([title])').length) {
      if (Date.now() > deadline) throw new Error('the diagrams did not finish rendering' + why());
      await next();
    }
    const found = stages();
    if (!found.length) throw new Error('this document has no diagrams to export' + why());
    return found;
  }
  // --check: what would not draw or play, by document line, and no files.
  const problems = () => [...document.querySelectorAll('.diagram-problems li')].map((item) => ({
    line: Number(item.dataset.line) || 0,
    story: (item.querySelector('small')?.textContent || '').replace(/ · line \d+$/, ''),
    reason: item.querySelector('span')?.textContent || '',
    text: item.querySelector('code')?.textContent || '',
  }));
  const pictures = () => [...document.querySelectorAll('.mermaid-diagram[title*="Pictures not shown: "]')].map((holder) => ({
    line: Number(holder.dataset.line) || 0,
    message: holder.title.split('Pictures not shown: ')[1],
  }));
  const lines = (rows) => {
    const blocks = [...document.querySelectorAll('.mermaid-diagram, .highlight-source-mermaid')];
    return rows.map((row) => Object.assign({ line: Number(blocks[row.diagram - 1]?.dataset.line) || 0 }, row));
  };
  async function check() {
    const deadline = Date.now() + job.timeout;
    while (document.querySelectorAll('.highlight-source-mermaid:not([title])').length) {
      if (Date.now() > deadline) throw new Error('the diagrams did not finish rendering' + why());
      await next();
    }
    await tell(job.done, { failures: lines(failed()), problems: problems(), pictures: pictures() });
  }
  async function run() {
    if (job.kind === 'check') return check();
    const all = await drawn();
    const wanted = job.diagrams && job.diagrams.length ? job.diagrams : all.map(indexOf);
    const missing = wanted.filter((index) => !all.some((stage) => indexOf(stage) === index));
    if (missing.length) throw new Error('there is no diagram ' + missing.join(', ') + ' in this document' + why());
    const skipped = [];
    for (const index of wanted) {
      const stage = all.find((candidate) => indexOf(candidate) === index);
      if (job.kind !== 'png' && !stage.diagramPlay) {
        skipped.push({ diagram: index });
        continue;
      }
      const saved = await Aniflow.diagramExport(stage, job.kind);
      await post(job.blob + '?name=' + encodeURIComponent(pad(index) + '-' + saved.name), saved.blob, saved.blob.type);
      await next();
    }
    await tell(job.done, { skipped: skipped, failures: failed(), warnings: warnings() });
  }
  run().then(() => clearTimeout(timer), (error) => {
    clearTimeout(timer);
    fail(error);
  });
})();
"""


def chrome() -> str | None:
    """The Chrome or Chromium to drive: $ANIFLOW_CHROME, else the first one installed."""
    chosen = os.environ.get("ANIFLOW_CHROME")
    if chosen:
        return chosen
    for name in CHROME_NAMES:
        found = shutil.which(name)
        if found:
            return found
    return None


def command(browser: str, url: str, profile: Path) -> list[str]:
    """The Chrome command line for one export; --no-sandbox only where Chrome needs it."""
    flags = list(CHROME_FLAGS)
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        flags.append("--no-sandbox")
    return [browser, *flags, f"--user-data-dir={profile}", url]


def fenced(text: str, name: str) -> str:
    """A bare Mermaid diagram becomes a fenced block; Markdown is left as it is."""
    if "```" in text:
        return text
    suffix = Path(name).suffix.lower()
    if suffix not in MERMAID_SUFFIXES and not MERMAID_START.match(text.lstrip()):
        return text
    return "```mermaid\n" + text.strip("\n") + "\n```\n"


def document(target: str | Path) -> tuple[str, Path, str]:
    """The Markdown to render, the folder its pictures live in, and the name the page
    is served under so the library slugs it into the file names."""
    if str(target) == "-":
        return fenced(sys.stdin.read(), "stdin.md"), Path.cwd(), "stdin.md"
    path = Path(target)
    return fenced(path.read_text("utf-8"), path.name), path.parent, path.name


def write_unique(folder: Path, name: str, body: bytes) -> Path:
    """Writes body into the first free name under folder and returns where it landed.

    The name is reduced to its basename and every candidate is created exclusively, so a
    dangling symlink or a parallel upload can never take it over.
    """
    base = Path(name.replace("\\", "/")).name
    if base in ("", ".", ".."):
        base = "diagram"
    stem, suffix = Path(base).stem, Path(base).suffix
    count = 1
    while True:
        path = folder / (base if count == 1 else f"{stem}-{count}{suffix}")
        count += 1
        created = False
        try:
            with open(path, "xb") as handle:
                created = True
                handle.write(body)
        except FileExistsError:
            continue
        except OSError:
            # Only the file just created goes, never one that was already there.
            if created:
                path.unlink(missing_ok=True)
            raise
        return path


def hidden(parts: tuple[str, ...]) -> bool:
    """A hidden name is never listed or served, the way cli.local_path() refuses them."""
    return any(part.startswith(".") for part in parts)


def inside(folder: Path, relative: str) -> Path | None:
    """A picture or other file next to the document, never one outside its folder and
    never a hidden one."""
    part = Path(relative)
    if part.is_absolute() or "\\" in relative or "\x00" in relative:
        return None
    if ".." in part.parts or hidden(part.parts):
        return None
    try:
        root = folder.resolve()
        target = (folder / part).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            return None
        if hidden(target.relative_to(root).parts):
            return None
    except (OSError, ValueError, RuntimeError):
        return None
    return target


class ExportServer(ThreadingHTTPServer):
    """One run's server: the export page, its files, and the sinks it posts back to."""

    daemon_threads = True

    def __init__(
        self,
        text: str,
        folder: Path,
        name: str,
        outdir: Path,
        kind: str,
        diagrams: list[int] | None = None,
    ):
        self.token = secrets.token_urlsafe(16)
        self.text = text
        self.folder = folder
        self.name = name
        self.outdir = outdir
        self.kind = kind
        self.diagrams = diagrams or []
        self.written: list[Path] = []
        self.skipped: list[str] = []
        self.failures: list[dict[str, object]] = []
        self.warnings: list[str] = []
        self.problems: list[dict[str, object]] = []
        self.pictures: list[dict[str, object]] = []
        self.error = ""
        self.stop = threading.Event()
        self.doc_path = f"/doc/{self.token}/{quote(name)}"
        self.prefix = f"/doc/{self.token}/"
        self.blob_url = f"/blob/{self.token}/"
        self.done_url = f"/done/{self.token}"
        self.error_url = f"/error/{self.token}"
        super().__init__(("127.0.0.1", 0), ExportHandler)

    def reader(self) -> tuple[bytes, str]:
        nonce = secrets.token_urlsafe(16)
        job = {
            "kind": self.kind,
            "diagrams": self.diagrams,
            "blob": self.blob_url,
            "done": self.done_url,
            "error": self.error_url,
            "timeout": TIMEOUT * 1000,
        }
        body = page.reader_page(
            title=self.name,
            text=self.text,
            nonce=nonce,
            back=("Export", self.doc_path),
            options=page.reader_options(root=self.prefix),
            # The page posts the bytes itself; a no-op save keeps Chrome from downloading
            # a copy of every diagram as well.
            before=(
                f'<script nonce="{nonce}">window.aniflowPage = {{ save: () => {{}} }};'
                "</script>"
            ),
            after=(
                '<script type="application/json" id="aniflow-export">'
                + page.json_script(job)
                + f'</script><script nonce="{nonce}">{EXPORT_JS}</script>'
            ),
        )
        return body, nonce


class ExportHandler(web.Handler):
    server: ExportServer

    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        if not self.request_allowed():
            return
        path = urlsplit(self.path).path
        if self.send_asset(path):
            return
        if path == self.server.doc_path:
            body, nonce = self.server.reader()
            self.send_html(body, page.reader_headers(nonce))
            return
        if path.startswith(self.server.prefix):
            target = inside(
                self.server.folder, unquote(path[len(self.server.prefix) :])
            )
            if target is not None:
                self.send_local_file(target, raw=False)
                return
        self.send_error(404)

    def do_POST(self) -> None:
        if not self.request_allowed():
            return
        parsed = urlsplit(self.path)
        server = self.server
        if parsed.path == server.blob_url:
            self.receive(parsed.query)
        elif parsed.path in (server.done_url, server.error_url):
            self.complete(parsed.path)
        else:
            self.send_json({"error": "not found"}, status=404)

    def receive(self, query: str) -> None:
        """A file the page made: written under the output directory, never at a path it names."""
        name = (parse_qs(query).get("name") or [""])[-1]
        body = self.read_body(MAX_BODY)
        if body is None:
            self.send_json({"error": "request too large"}, status=413)
            return
        if not name or not body:
            self.send_json({"error": "a name and a file are needed"}, status=400)
            return
        try:
            path = write_unique(self.server.outdir, name, body)
        except OSError as error:
            self.send_json({"error": str(error)}, status=500)
            return
        self.server.written.append(path)
        print(f"aniflow: wrote {path}", file=sys.stderr, flush=True)
        self.send_json({"ok": True, "path": str(path)})

    def complete(self, path: str) -> None:
        """done, with the diagrams that had no story to play, or the error that ended the run."""
        server = self.server
        body = self.read_body(64 * 1024)
        if body is None:
            self.send_json({"error": "request too large"}, status=413)
            return
        payload = {}
        if body:
            try:
                payload = json.loads(body)
            except ValueError:
                self.send_json({"error": "body must be JSON"}, status=400)
                return
        if not isinstance(payload, dict):
            self.send_json({"error": "body must be JSON"}, status=400)
            return
        if path == server.error_url:
            server.error = str(payload.get("message") or "the export failed")
        else:
            for row in payload.get("skipped") or []:
                if isinstance(row, dict):
                    server.skipped.append(str(row.get("diagram", "?")))
            for row in payload.get("failures") or []:
                if isinstance(row, dict):
                    server.failures.append(
                        {
                            "diagram": row.get("diagram", "?"),
                            "line": row.get("line") or 0,
                            "message": str(row.get("message") or "it did not render"),
                        }
                    )
            for item in payload.get("warnings") or []:
                server.warnings.append(str(item))
            for key in ("problems", "pictures"):
                for row in payload.get(key) or []:
                    if isinstance(row, dict):
                        getattr(server, key).append(row)
        server.stop.set()
        self.send_json({"ok": True})


def group_alive(group: int) -> bool:
    """Whether any process is left in a group, even once its leader has exited."""
    if group <= 0:
        return False
    try:
        os.killpg(group, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def terminate(process: subprocess.Popen, grace: float = 5.0) -> None:
    """Ends Chrome and what it started, whether or not it answers SIGTERM.

    command() starts Chrome in a session of its own, so its pid names the whole group and
    keeps naming it after the leader exits: a descendant that outlives the leader still gets
    SIGKILL once the group outlives the grace.
    """
    group = process.pid
    for ending in (signal.SIGTERM, signal.SIGKILL):
        if not group_alive(group):
            break
        try:
            os.killpg(group, ending)
        except OSError:
            break
        deadline = time.monotonic() + grace
        while time.monotonic() < deadline:
            # Reaping the leader keeps its zombie from holding the group open.
            process.poll()
            if not group_alive(group):
                break
            time.sleep(0.05)
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        pass


def log_tail(log: object, lines: int = 12, limit: int = 2000) -> str:
    """The last lines Chrome wrote to the stderr the export captured."""
    if log is None:
        return ""
    try:
        log.flush()
        log.seek(0)
        written = log.read()
    except (OSError, ValueError):
        return ""
    kept = [
        line for line in written.decode("utf-8", "replace").splitlines() if line.strip()
    ]
    return "\n".join(kept[-lines:])[-limit:]


def browser_exit(process: subprocess.Popen, log: object) -> str:
    """Why the run cannot go on once the browser has gone."""
    status = process.returncode
    if status is None:
        what = "the browser stopped"
    elif status < 0:
        what = f"the browser was killed by signal {-status}"
    else:
        what = f"the browser exited with status {status}"
    tail = log_tail(log)
    return what + " before the export finished" + (f":\n{tail}" if tail else "")


def wait_for(server: ExportServer, process: subprocess.Popen, log: object) -> None:
    """Waits for the page's done or error message, giving up when the browser dies first."""
    deadline = time.monotonic() + TIMEOUT + 30
    while not server.stop.wait(POLL):
        if process.poll() is None:
            if time.monotonic() < deadline:
                continue
            server.error = (
                server.error or f"the export timed out after {TIMEOUT} seconds"
            )
            return
        # A last post may still be on its way out when the browser goes.
        if server.stop.wait(GRACE):
            return
        server.error = server.error or browser_exit(process, log)
        return


def finish(process, server, thread, profile) -> None:
    """Ends the run whatever happened, and keeps going when another interrupt arrives."""
    steps = []
    if process is not None:
        steps.append(lambda: terminate(process))
    if thread is not None:
        steps.append(server.shutdown)
        steps.append(server.server_close)
        steps.append(lambda: thread.join(timeout=5))
    if profile is not None:
        steps.append(lambda: shutil.rmtree(profile, ignore_errors=True))
    for step in steps:
        while True:
            try:
                step()
                break
            except KeyboardInterrupt:
                continue
            except OSError:
                break


def render(
    text: str,
    folder: Path,
    name: str,
    outdir: Path | None,
    kind: str,
    diagrams: list[int],
) -> tuple[ExportServer | None, int]:
    """Serves the document to headless Chrome until its page reports back. The server
    holds what it said; None with an exit code when the run could not start."""
    browser = chrome()
    if browser is None:
        print(
            "aniflow: this needs Chrome or Chromium: install one, or set "
            "ANIFLOW_CHROME to its path",
            file=sys.stderr,
        )
        return None, 1
    server = thread = profile = process = None
    code = 0
    with tempfile.TemporaryFile() as log:
        try:
            try:
                server = ExportServer(text, folder, name, outdir, kind, diagrams)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                profile = Path(tempfile.mkdtemp(prefix="aniflow-export-"))
            except OSError as error:
                print(
                    f"aniflow: cannot start the browser run: {error}", file=sys.stderr
                )
                return None, 1
            url = f"http://127.0.0.1:{server.server_address[1]}{server.doc_path}"
            try:
                process = subprocess.Popen(
                    command(browser, url, profile),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=log,
                    start_new_session=True,
                )
            except OSError as error:
                print(f"aniflow: cannot start {browser}: {error}", file=sys.stderr)
                return None, 1
            wait_for(server, process, log)
        except KeyboardInterrupt:
            print("aniflow: cancelled", file=sys.stderr)
            code = 130
        finally:
            finish(process, server, thread, profile)
    return server, code


def check(targets: list[str]) -> int:
    """Draws each document's diagrams in headless Chrome and prints every walkthrough step
    that cannot play, diagram that does not render and picture that does not load as
    file:line: message. Returns 1 when it found any."""
    found = 0
    for target in targets:
        try:
            text, folder, name = document(target)
        except (OSError, UnicodeDecodeError) as error:
            print(f"aniflow: cannot read {target}: {error}", file=sys.stderr)
            found += 1
            continue
        if "```mermaid" not in text:
            continue
        server, code = render(text, folder, name, None, "check", [])
        if server is None or code:
            return code or 1
        where = "<stdin>" if target == "-" else target
        if server.error:
            print(f"{where}: {server.error}")
            found += 1
        for failure in server.failures:
            print(
                f"{where}:{failure['line']}: diagram does not render: {failure['message']}"
            )
        for row in server.problems:
            print(
                f"{where}:{row.get('line', 0)}: {row.get('story', '')}: "
                f"{row.get('reason', '')} ({row.get('text', '')})"
            )
        for row in server.pictures:
            print(
                f"{where}:{row.get('line', 0)}: pictures not shown: {row.get('message', '')}"
            )
        found += len(server.failures) + len(server.problems) + len(server.pictures)
    return 1 if found else 0


def run(
    target: str | Path,
    kind: str,
    out: str | Path | None = None,
    only: int | None = None,
) -> int:
    """Writes one file per diagram into out, or next to the document, and returns the
    exit code."""
    try:
        text, folder, name = document(target)
    except (OSError, UnicodeDecodeError) as error:
        print(f"aniflow: cannot read {target}: {error}", file=sys.stderr)
        return 1
    outdir = Path(out) if out else folder
    try:
        outdir.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        print(f"aniflow: cannot write into {outdir}: {error}", file=sys.stderr)
        return 1
    server, code = render(text, folder, name, outdir, kind, [only] if only else [])
    if server is None:
        return code
    for index in server.skipped:
        print(
            f"aniflow: diagram {index} has no %% play: story, skipped for {kind}",
            file=sys.stderr,
        )
    for warning in server.warnings:
        print(f"aniflow: walkthrough: {warning}", file=sys.stderr)
    for failure in server.failures:
        print(
            f"aniflow: diagram {failure['diagram']} did not render: {failure['message']}",
            file=sys.stderr,
        )
    if server.error:
        print(f"aniflow: {server.error}", file=sys.stderr)
        return 1
    if code:
        return code
    for path in server.written:
        print(path)
    asked = set(server.diagrams) if server.diagrams else None
    unrendered = [
        failure
        for failure in server.failures
        if asked is None or failure["diagram"] in asked
    ]
    if unrendered:
        print(
            f"aniflow: {len(unrendered)} diagram(s) asked for did not render",
            file=sys.stderr,
        )
        return 1
    if not server.written:
        print(f"aniflow: nothing was exported for {kind}", file=sys.stderr)
        return 1
    return 0
