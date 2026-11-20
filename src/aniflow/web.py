"""HTTP building blocks shared by the aniflow server and the apps embedding the reader."""

from __future__ import annotations

import codecs
import ipaddress
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import ParseResult, SplitResult, parse_qs, quote, urlparse

from aniflow import comments

PACKAGE = Path(__file__).resolve().parent
VENDOR = PACKAGE / "vendor"
STATIC = PACKAGE / "static"
# Diagram icons built from Lucide by contrib/icons/make_icons.py, served by name only.
ICONS_DIR = PACKAGE / "icons"
ICON_NAMES = frozenset(path.stem for path in ICONS_DIR.glob("*.svg"))
JS = "text/javascript; charset=utf-8"
CSS = "text/css; charset=utf-8"
# Only these files are reachable under /vendor/ and /static/, everything else stays private.
VENDOR_TYPES = {
    "highlight.min.js": JS,
    "markdown-it.min.js": JS,
    "markdown-it-emoji.min.js": JS,
    "markdown-it-footnote.min.js": JS,
    "purify.min.js": JS,
    "github-markdown.css": CSS,
    "mermaid.min.js": JS,
}
STATIC_TYPES = {
    "aniflow.min.js": JS,
    "aniflow.esm.js": JS,
    "aniflow.css": CSS,
    "page.css": CSS,
}
ALLOWED_HOST_SUFFIXES = (
    ".local",
    ".lan",
    ".localdomain",
    ".home",
    ".internal",
    ".ts.net",
)
MARKDOWN_SUFFIXES = {".md", ".markdown"}
# What a browser tab renders as a document. HTML keeps its scripts in an opaque origin;
# an SVG needs none to be drawn.
HTML_CSP = "sandbox allow-scripts allow-forms"
VECTOR_CSP = "sandbox"
INLINE_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
    ".mp4", ".m4v", ".mov", ".webm", ".ogv", ".mp3", ".m4a", ".ogg", ".wav", ".flac",
}  # fmt: skip
TEXT_MAX_BYTES = 2 * 1024**2
# Spelled out because mimetypes misses some of these on a few systems.
AUDIO_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
}


def is_markdown(name: str) -> bool:
    return Path(name).suffix.lower() in MARKDOWN_SUFFIXES


def vector_headers(base: dict[str, str]) -> dict[str, str]:
    """Serve an SVG inline but unable to reach the page: its scripts never run."""
    return {
        **base,
        "Content-Security-Policy": VECTOR_CSP,
        "X-Content-Type-Options": "nosniff",
    }


def looks_like_text(path: Path) -> bool:
    """Cheap check on the first 8 KB: small enough, no NUL, valid UTF-8 so far."""
    try:
        if path.stat().st_size > TEXT_MAX_BYTES:
            return False
        with path.open("rb") as handle:
            head = handle.read(8192)
        codecs.getincrementaldecoder("utf-8")().decode(head, final=False)
    except (OSError, UnicodeDecodeError):
        return False
    return b"\0" not in head


def host_allowed(
    value: str | None, allowed: set[str] | frozenset[str] = frozenset()
) -> bool:
    """A Host header naming this machine: localhost, a non-global address, a local
    domain, or one of the allowed names."""
    if not value:
        return False
    host = value.strip().lower()
    if host.startswith("["):
        end = host.find("]")
        host = host[1:end] if end != -1 else host.lstrip("[")
    else:
        host = host.split(":", 1)[0]
    host = host.rstrip(".")
    if host == "localhost" or host in allowed:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host.endswith(ALLOWED_HOST_SUFFIXES)
    return not address.is_global


def origin_allowed(
    origin: str | None,
    host: str | None,
    allowed: set[str] | frozenset[str] = frozenset(),
) -> bool:
    if not origin:
        return True
    if origin.strip().lower().rstrip("/") in allowed:
        return True
    parsed = urlparse(origin)
    # Only the host is compared: behind a TLS proxy the browser's origin is https while
    # the request arrives on http, and an attacker cannot set Origin at all.
    return (
        parsed.scheme in ("http", "https")
        and parsed.netloc.lower() == (host or "").lower()
    )


class Handler(BaseHTTPRequestHandler):
    """Request checks and responses. Subclasses route in do_GET/do_POST after
    request_allowed()."""

    def allowed_hosts(self) -> set[str] | frozenset[str]:
        return frozenset()

    def allowed_origins(self) -> set[str] | frozenset[str]:
        return frozenset()

    def request_allowed(self) -> bool:
        host = self.headers.get("Host")
        if not host_allowed(host, self.allowed_hosts()):
            self.send_error(403, "Host not allowed")
            return False
        if not origin_allowed(self.headers.get("Origin"), host, self.allowed_origins()):
            self.send_error(403, "Cross-origin request refused")
            return False
        return True

    def read_body(self, limit: int) -> bytes | None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > limit:
            return None
        return self.rfile.read(length)

    def send_asset(self, path: str) -> bool:
        """The reader's own files under /vendor/, /static/ and /icons/. False when path is not one."""
        folder, _, name = path.lstrip("/").partition("/")
        if folder == "vendor" and name in VENDOR_TYPES:
            self.send_file(
                VENDOR / name, VENDOR_TYPES[name], {"Cache-Control": "no-cache"}
            )
            return True
        if folder == "static" and name in STATIC_TYPES:
            self.send_file(
                STATIC / name, STATIC_TYPES[name], {"Cache-Control": "no-cache"}
            )
            return True
        if folder == "icons":
            if not name:
                self.send_json({"icons": sorted(ICON_NAMES)})
                return True
            stem = name.removesuffix(".svg")
            if name.endswith(".svg") and stem in ICON_NAMES:
                self.send_file(
                    ICONS_DIR / f"{stem}.svg", "image/svg+xml", vector_headers({})
                )
                return True
        return False

    def handle_comment(
        self,
        parsed: ParseResult | SplitResult,
        path: Path | None,
        storage: Path,
        **options,
    ) -> None:
        """POST /comments/<add|edit|delete>/...: options go to comments.change()."""
        action = parsed.path.removeprefix("/comments/").partition("/")[0]
        if action not in ("add", "edit", "delete"):
            self.send_json({"error": "not found"}, status=404)
            return
        if path is None or not is_markdown(path.name):
            self.send_json({"error": "not found"}, status=404)
            return
        data: object = None
        if action != "delete":
            body = self.read_body(comments.COMMENT_MAX_CHARS * 4 + 1024)
            if body is None:
                self.send_json({"error": "request too large"}, status=413)
                return
            try:
                data = json.loads(body)
            except ValueError:
                self.send_json({"error": "body must be JSON"}, status=400)
                return
        comment_id = (parse_qs(parsed.query).get("id") or [""])[-1]
        try:
            error = comments.change(path, action, comment_id, data, storage, **options)
            view = comments.view(path, storage)
        except OSError as failure:
            self.send_json({"error": str(failure)}, status=500)
            return
        if error:
            self.send_json(
                {"error": error},
                status={"not found": 404, "not yours": 403}.get(error, 400),
            )
            return
        self.send_json(view)

    def send_comments(self, path: Path, storage: Path, query: str, app: str) -> None:
        """GET /comments/...: the JSON view, ?lines=A-B to narrow it, ?format=prompt for text."""
        try:
            view = comments.in_lines(comments.view(path, storage), query)
        except OSError:
            self.send_json({"error": "Could not read comments"}, status=500)
            return
        if (parse_qs(query).get("format") or [""])[-1] == "prompt":
            self.send_bytes(
                comments.prompt(view, app).encode("utf-8"),
                "text/plain; charset=utf-8",
                {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            )
        else:
            self.send_json(view)

    def send_html(self, body: bytes, headers: dict[str, str] | None = None) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(
        self,
        payload: dict[str, object],
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(
        self, body: bytes, content_type: str, headers: dict[str, str], status: int = 200
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def send_local_file(self, path: Path, raw: bool) -> None:
        """A file next to the documents: media inline, text as text/plain on request,
        the rest as a download."""
        headers = {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"}
        suffix = path.suffix.lower()
        content_type = (
            AUDIO_TYPES.get(suffix)
            or (
                "image/svg+xml"
                if suffix == ".svg"
                else mimetypes.guess_type(path.name)[0]
            )
            or "application/octet-stream"
        )
        if raw and (suffix in MARKDOWN_SUFFIXES or looks_like_text(path)):
            content_type = "text/plain; charset=utf-8"
        elif suffix in (".html", ".htm"):
            headers["Content-Security-Policy"] = HTML_CSP
        elif suffix == ".svg":
            headers.update(vector_headers({}))
        elif suffix not in INLINE_SUFFIXES:
            headers["Content-Disposition"] = (
                f"attachment; filename*=UTF-8''{quote(path.name)}"
            )
        self.send_file(path, content_type, headers)

    def send_file(self, path: Path, content_type: str, headers: dict[str, str]) -> None:
        size = path.stat().st_size
        start, end = 0, size - 1
        status = 200
        # Video players need a single byte range to seek; anything fancier gets the whole file.
        match = re.fullmatch(
            r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip()
        )
        if match and (match[1] or match[2]):
            if match[1]:
                start = int(match[1])
                end = min(int(match[2]), size - 1) if match[2] else size - 1
            else:
                start = max(size - int(match[2]), 0)
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            status = 206
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        with path.open("rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            try:
                while remaining and (chunk := stream.read(min(128 * 1024, remaining))):
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.client_address[0]} - {format % args}")
