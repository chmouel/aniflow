from __future__ import annotations

import argparse
import base64
import hashlib
import html
import os
import re
import secrets
import socket
import sys
import webbrowser
import zlib
from datetime import UTC, datetime
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from aniflow import export, page, web
from aniflow.brand import BRAND, BRAND_CSS
from aniflow.themes import THEME_READER_CSS, theme_script, theme_select
from aniflow.ui import (
    DIRECTORY_CSS,
    FOLDER_ICON,
    NOTE_ICON,
    SEARCH_ICON,
    UI_CSS,
    UI_JS,
    human_size,
)

FILES = "/files/"
HELP = Path(__file__).with_name("help.md")
SPEC = Path(__file__).with_name("spec.md")
TRY_URL = "https://chmouel.github.io/aniflow/try/"
SHARE_LONG = 8000
PICTURE = re.compile(r"""\bimg:\s*["']([^"']+)["']|!\[[^\]]*\]\(\s*<?([^)\s>]+)""")


def share_url(text: str) -> str:
    """The try page link holding text, deflated and base64url encoded in #src= as try.js reads it."""
    packer = zlib.compressobj(9, zlib.DEFLATED, -15)
    packed = packer.compress(text.encode("utf-8")) + packer.flush()
    return TRY_URL + "#src=" + base64.urlsafe_b64encode(packed).decode().rstrip("=")


def offline_pictures(text: str) -> list[str]:
    """Pictures the try page cannot load: anything besides built-in icons, https and data URLs."""
    found = (a or b for a, b in PICTURE.findall(text))
    return sorted(
        {
            value
            for value in found
            if not value.startswith(("/icons/", "https://", "data:image/"))
        }
    )


NEXT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'


def local_path(root: Path, key: str) -> Path | None:
    relative = Path(key)
    if relative.is_absolute() or "\\" in key or "\x00" in key:
        return None
    if any(part.startswith(".") for part in relative.parts):
        return None
    path = root / relative
    try:
        resolved = path.resolve().relative_to(root)
        if any(part.startswith(".") for part in resolved.parts):
            return None
        return path if path.is_file() or path.is_dir() else None
    except (OSError, ValueError, RuntimeError):
        return None


def file_url(root: Path, path: Path) -> str:
    relative = path.relative_to(root).as_posix()
    if relative == ".":
        return FILES
    return FILES + quote(relative) + ("/" if path.is_dir() else "")


def breadcrumbs(root: Path, path: Path) -> list[tuple[str, str]]:
    return [
        (
            root.name if parent == Path(".") else parent.name,
            file_url(root, root / parent),
        )
        for parent in reversed(path.relative_to(root).parents)
    ]


def directory_page(root: Path, path: Path) -> tuple[bytes, str]:
    entries = []
    for child in path.iterdir():
        try:
            folder = child.is_dir()
            if not folder and not web.is_markdown(child.name):
                continue
            if local_path(root, child.relative_to(root).as_posix()) is not None:
                entries.append((child, folder, child.stat()))
        except OSError:
            continue
    entries.sort(key=lambda entry: (not entry[1], entry[0].name.casefold()))
    folder_rows, document_rows = [], []
    for child, folder, stat in entries:
        name = html.escape(child.name)
        link = f'<a href="{html.escape(file_url(root, child))}" data-name="{name}">'
        attributes = f'data-modified="{stat.st_mtime}"'
        if folder:
            folder_rows.append(
                f'<li {attributes}>{link}<span class="folder-symbol" aria-hidden="true">{FOLDER_ICON}</span>'
                f'<span class="file-label">{name}</span><span class="entry-arrow">{NEXT_ICON}</span></a></li>'
            )
        else:
            modified = datetime.fromtimestamp(stat.st_mtime, UTC)
            document_rows.append(
                f'<li {attributes}>{link}<span class="document-symbol" aria-hidden="true">{NOTE_ICON}</span>'
                f'<span class="file-label">{html.escape(child.stem)}<span class="file-extension">{html.escape(child.suffix)}</span></span>'
                f'<time datetime="{modified.isoformat()}" class="file-modified">{modified.strftime("%d %b %Y")}</time>'
                f'<span class="file-size">{human_size(stat.st_size)}</span>'
                f'<span class="entry-arrow">{NEXT_ICON}</span></a></li>'
            )
    folders, documents = len(folder_rows), len(document_rows)
    groups = "".join(
        f'<section class="directory-group" aria-labelledby="{kind}-heading">'
        f'<h2 id="{kind}-heading">{label}<span class="group-count">{len(rows)}</span></h2>'
        + (
            '<div class="directory-columns" aria-hidden="true"><span>Document</span><span>Modified</span><span>Size</span></div>'
            if kind == "documents"
            else ""
        )
        + f'<ul class="directory-list {kind}-list">{"".join(rows)}</ul></section>'
        for kind, label, rows in (
            ("folders", "Folders", folder_rows),
            ("documents", "Documents", document_rows),
        )
        if rows
    )
    ancestors = breadcrumbs(root, path)
    trail = "".join(
        f'<li><a href="{html.escape(url)}">{html.escape("Files" if url == FILES else label)}</a></li>'
        for label, url in ancestors
    )
    title = html.escape(path.name or str(path))
    trail += f'<li aria-current="page">{title if ancestors else "Files"}</li>'
    parent = (
        f'<a class="folder-up" href="{html.escape(file_url(root, path.parent))}">{NEXT_ICON}Up one folder</a>'
        if path != root
        else ""
    )
    nonce = secrets.token_urlsafe(16)
    content = (
        f'<div class="browser-toolbar"><label class="folder-filter">{SEARCH_ICON}'
        '<span class="sr-only">Find in this folder</span>'
        '<input type="search" id="folder-search" placeholder="Find a file or folder…" autocomplete="off" aria-controls="directory-groups"></label>'
        '<label class="folder-sort"><span>Sort by</span><select id="folder-sort">'
        '<option value="name">Name</option><option value="modified">Last modified</option></select></label></div>'
        '<p class="folder-status sr-only" id="folder-status" role="status"></p>'
        f'<div id="directory-groups">{groups}</div>'
        '<div class="browser-empty" id="folder-no-results" hidden><span class="empty-symbol" aria-hidden="true">'
        f"{SEARCH_ICON}</span><h2>No matches in this folder</h2>"
        "<p>Try a shorter name, or clear the search to see everything.</p>"
        '<button type="button" id="folder-clear">Clear search</button></div>'
        if entries
        else f'<div class="browser-empty"><span class="empty-symbol" aria-hidden="true">{FOLDER_ICON}</span>'
        "<h2>No Markdown files or folders here.</h2><p>Save a .md file in this folder, then refresh to open it.</p>"
        '<a href="/help">Try the demo while you’re here</a></div>'
    )
    description = f'{folders} {"folder" if folders == 1 else "folders"} <span aria-hidden="true">/</span> {documents} {"document" if documents == 1 else "documents"}'
    body = f"""<!doctype html>
<html lang="en" data-theme-default="auto"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>{title} · aniflow</title>
<link rel="icon" href="data:,">{theme_script(nonce)}
<link rel="stylesheet" href="/vendor/github-markdown.css">
<link rel="stylesheet" href="/static/page.css">
<style>{THEME_READER_CSS}{BRAND_CSS}{UI_CSS}{DIRECTORY_CSS}</style>
</head><body class="aniflow-local aniflow-browser"><header class="bar"><a href="{FILES}">aniflow</a><span class="name">{title}</span>
<nav><a href="/help">Demo &amp; help</a>{theme_select(nonce)}</nav></header>
<main class="browser-shell"><div class="browser-masthead">{BRAND}
<a class="browser-demo" href="/help"><span class="demo-play" aria-hidden="true"></span>
<span><strong>Try animated diagrams</strong><span>Play the demo, then make your own.</span></span>{NEXT_ICON}</a></div>
<nav class="browser-trail" aria-label="Folders"><ol>{trail}</ol></nav>
<div class="browser-heading"><div><h1>{title}</h1><p class="folder-summary">{description}</p></div>{parent}</div>
{content}</main><script nonce="{nonce}">{UI_JS}</script></body></html>"""
    return body.encode("utf-8"), nonce


def reader_page(
    root_url: str,
    title: str,
    text: str,
    back: tuple[str, str],
    links: list[tuple[str, str]],
    comments: str,
    crumbs: list[tuple[str, str]] | None = None,
) -> tuple[bytes, str]:
    """A markdown file in the reader, with links kept under root_url."""
    nonce = secrets.token_urlsafe(16)
    help_link = (
        '<a class="reader-help" href="/help">Help</a>'
        if any(label == "Help" for label, _ in links)
        else ""
    )
    menu_links = "".join(
        f'<a href="{html.escape(href)}">{html.escape("View Markdown source" if label == "Raw" else label)}</a>'
        for label, href in links
        if label != "Help"
    )
    actions = help_link + (
        f'<details class="aniflow-menu"><summary>More</summary><div class="menu-items">{menu_links}</div></details>'
        if menu_links
        else ""
    )
    trail = (
        '<nav class="crumbs" aria-label="Folders">'
        + "".join(
            f'<a href="{html.escape(href)}">{html.escape(label)}</a><span aria-hidden="true">/</span>'
            for label, href in crumbs
        )
        + f'<b aria-current="page">{html.escape(title)}</b></nav>'
        if crumbs
        else ""
    )
    body = page.reader_page(
        title=title,
        text=text,
        nonce=nonce,
        back=back,
        options=page.reader_options(
            comments=comments, review_name="Comments", root=root_url
        ),
        actions=actions,
        theme=True,
        top=BRAND + trail,
        style=BRAND_CSS + UI_CSS,
        body_class="aniflow-local",
        after=f'<script nonce="{nonce}">{UI_JS}</script>',
    )
    return body, nonce


class Server(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], root: Path):
        self.root = root.resolve()
        identity = hashlib.sha256(os.fsencode(self.root)).hexdigest()
        cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        self.comments_root = cache / "aniflow" / "comments" / identity
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        super().__init__(address, Handler)


class Handler(web.Handler):
    server: Server

    def comment_target(self, key: str) -> tuple[Path, Path] | None:
        if key == "help":
            path, identity = HELP, "help"
        elif key.startswith("file/"):
            path = local_path(self.server.root, unquote(key.removeprefix("file/")))
            if path is None or not path.is_file() or not web.is_markdown(path.name):
                return None
            identity = "file/" + path.resolve().relative_to(self.server.root).as_posix()
        else:
            return None
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        return path, self.server.comments_root / f"{digest}.json"

    def redirect(self, location: str) -> None:
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self.request_allowed():
            return
        parsed = urlsplit(self.path)
        raw = "raw" in parse_qs(parsed.query, keep_blank_values=True)
        if parsed.path == "/":
            self.redirect(FILES)
            return
        if parsed.path == "/help":
            if raw:
                self.send_file(
                    HELP,
                    "text/plain; charset=utf-8",
                    {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"},
                )
            else:
                body, nonce = reader_page(
                    "/",
                    "aniflow help",
                    HELP.read_text("utf-8"),
                    ("Files", FILES),
                    [("Raw", "/help?raw=1")],
                    "/comments/help",
                )
                self.send_html(body, page.reader_headers(nonce))
            return
        if parsed.path.startswith("/comments/"):
            target = self.comment_target(parsed.path.removeprefix("/comments/"))
            if target is None:
                self.send_json({"error": "not found"}, status=404)
            else:
                self.send_comments(*target, parsed.query, "aniflow")
            return
        if self.send_asset(parsed.path):
            return
        if parsed.path.startswith(FILES):
            root = self.server.root
            path = local_path(root, unquote(parsed.path.removeprefix(FILES)))
            if path is not None:
                try:
                    if path.is_dir():
                        if not parsed.path.endswith("/"):
                            self.redirect(file_url(root, path))
                            return
                        body, nonce = directory_page(root, path)
                    elif web.is_markdown(path.name) and not raw:
                        body, nonce = reader_page(
                            FILES,
                            path.name,
                            path.read_text("utf-8", errors="replace"),
                            ("Files", file_url(root, path.parent)),
                            [
                                ("Help", "/help"),
                                ("Raw", file_url(root, path) + "?raw=1"),
                            ],
                            "/comments/file/"
                            + quote(path.relative_to(root).as_posix()),
                            breadcrumbs(root, path),
                        )
                    else:
                        self.send_local_file(path, raw=raw)
                        return
                    self.send_html(body, page.reader_headers(nonce))
                    return
                except OSError:
                    pass
        self.send_error(404)

    def do_POST(self) -> None:
        if not self.request_allowed():
            return
        parsed = urlsplit(self.path)
        if parsed.path.startswith("/comments/"):
            _, _, key = parsed.path.removeprefix("/comments/").partition("/")
            target = self.comment_target(key)
            if target is None:
                self.send_json({"error": "not found"}, status=404)
                return
            path, storage = target
            self.handle_comment(parsed, path, storage)
            return
        self.send_response(405)
        self.send_header("Allow", "GET")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Browse local Markdown and interactive flowcharts."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=Path.cwd(),
        help="directory to serve (default: current directory)",
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="address to bind (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="port to listen on (default: an available port)",
    )
    parser.add_argument(
        "--spec",
        action="store_true",
        help="print the diagram walkthrough syntax reference and exit",
    )
    parser.add_argument(
        "--share",
        metavar="FILE",
        help="print a link that opens FILE (or - for stdin) in the online try "
        "page, with the text inside the link, and exit",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="with --share, also open the link in the default browser",
    )
    parser.add_argument(
        "--export",
        metavar="{" + ",".join(export.KINDS) + "}",
        choices=export.KINDS,
        help="render FILE's (or - for stdin) walkthrough diagrams in headless "
        "Chrome, write one file per diagram and exit",
    )
    parser.add_argument(
        "--slides",
        metavar="{" + ",".join(export.SLIDE_KINDS) + "}",
        choices=export.SLIDE_KINDS,
        help="render FILE's (or - for stdin) slides in headless Chrome, write one "
        "PDF or one PNG per slide and exit",
    )
    parser.add_argument(
        "-o",
        "--out",
        metavar="DIR",
        help="with --export or --slides, write the files into DIR "
        "(default: next to FILE)",
    )
    parser.add_argument(
        "--diagram",
        metavar="N",
        type=int,
        help="with --export, only the Nth diagram of the document",
    )
    parser.add_argument(
        "--check",
        metavar="FILE",
        nargs="+",
        help="draw the diagrams and slides of each FILE (or - for stdin) in headless "
        "Chrome, print every step that cannot play, diagram that does not render, "
        "picture that does not load and slide that does not fit as FILE:LINE, and "
        "exit 1 when there is any",
    )
    args = parser.parse_args()
    if args.check:
        if export.chrome() is None:
            parser.error(
                "--check needs Chrome or Chromium: install one, or set "
                "ANIFLOW_CHROME to its path"
            )
        raise SystemExit(export.check(args.check))
    if args.spec:
        sys.stdout.write(SPEC.read_text("utf-8"))
        return
    if args.share:
        try:
            text = (
                sys.stdin.read()
                if args.share == "-"
                else Path(args.share).read_text("utf-8")
            )
        except (OSError, UnicodeDecodeError) as error:
            parser.error(f"cannot read {args.share}: {error}")
        url = share_url(text)
        missing = offline_pictures(text)
        if missing:
            print(
                "aniflow: these pictures will not show on the try page: "
                + ", ".join(missing),
                file=sys.stderr,
            )
        if len(url) > SHARE_LONG:
            print(
                f"aniflow: the link is {len(url)} characters, some chat apps may cut it",
                file=sys.stderr,
            )
        print(url)
        if args.open:
            webbrowser.open(url)
        return
    if args.open:
        parser.error("--open goes with --share")
    if args.export and args.slides:
        parser.error("--export and --slides go one at a time")
    if args.export or args.slides:
        flag = "--export" if args.export else "--slides"
        target = str(args.directory)
        if target != "-" and Path(target).is_dir():
            parser.error(f"{flag} needs a Markdown file, not a directory: {target}")
        if target != "-" and not Path(target).is_file():
            parser.error(f"not a file: {target}")
        if args.slides and args.diagram is not None:
            parser.error("--diagram goes with --export")
        if args.diagram is not None and args.diagram < 1:
            parser.error("--diagram counts from 1")
        if export.chrome() is None:
            parser.error(
                f"{flag} needs Chrome or Chromium: install one, or set "
                "ANIFLOW_CHROME to its path"
            )
        if args.slides:
            raise SystemExit(export.slides(target, args.slides, args.out))
        raise SystemExit(export.run(target, args.export, args.out, args.diagram))
    if args.out:
        parser.error("--out goes with --export or --slides")
    if args.diagram is not None:
        parser.error("--diagram goes with --export")
    if not args.directory.is_dir():
        parser.error(f"not a directory: {args.directory}")
    try:
        httpd = Server((args.host, args.port), args.directory)
    except (OSError, OverflowError) as error:
        parser.error(str(error))
    host = f"[{args.host}]" if ":" in args.host else args.host
    print(
        f"aniflow: serving {httpd.root} at http://{host}:{httpd.server_address[1]}",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
