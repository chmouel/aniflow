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
from http.cookies import CookieError, SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from aniflow import export, oauth, page, web
from aniflow.brand import BRAND_CSS, brand
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
# What --base accepts after its trailing slashes are gone: a plain path, no scheme or host.
BASE_PREFIX = re.compile(r"(?:/[A-Za-z0-9._~%!$&'()*+,;=:@-]+)+")


def share_url(text: str) -> str:
    """The try page link holding text, deflated and base64url encoded in #src= as try.js reads it."""
    packer = zlib.compressobj(9, zlib.DEFLATED, -15)
    packed = packer.compress(text.encode("utf-8")) + packer.flush()
    return TRY_URL + "#src=" + base64.urlsafe_b64encode(packed).decode().rstrip("=")


def offline_pictures(text: str) -> list[str]:
    """Pictures the try page cannot load: anything besides built-in icons, https and data URLs."""
    found = [a or b for a, b in PICTURE.findall(text)]
    lines = text.splitlines()
    if lines and lines[0].strip() == "---":
        for line in lines[1:201]:
            if line.strip() in {"---", "..."}:
                break
            match = re.match(
                r"""^logo(?:-dark)?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))""", line
            )
            if match:
                found.append(
                    next(value for value in match.groups() if value is not None)
                )
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


def path_prefix(value: str) -> str:
    """--base normalised: "" for the root, otherwise "/pub" with no trailing slash. A scheme,
    a host or a relative path is refused."""
    prefix = value.strip().rstrip("/")
    if not prefix:
        return ""
    if not BASE_PREFIX.fullmatch(prefix):
        raise ValueError(f"--base must be a path such as /pub, not {value!r}")
    return prefix


def file_url(root: Path, path: Path, base: str = "") -> str:
    relative = path.relative_to(root).as_posix()
    if relative == ".":
        return base + FILES
    return base + FILES + quote(relative) + ("/" if path.is_dir() else "")


def breadcrumbs(root: Path, path: Path, base: str = "") -> list[tuple[str, str]]:
    return [
        (
            root.name if parent == Path(".") else parent.name,
            file_url(root, root / parent, base),
        )
        for parent in reversed(path.relative_to(root).parents)
    ]


def directory_page(root: Path, path: Path, base: str = "") -> tuple[bytes, str]:
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
        link = (
            f'<a href="{html.escape(file_url(root, child, base))}" data-name="{name}">'
        )
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
    ancestors = breadcrumbs(root, path, base)
    trail = "".join(
        f'<li><a href="{html.escape(url)}">{html.escape("Files" if url == base + FILES else label)}</a></li>'
        for label, url in ancestors
    )
    title = html.escape(path.name or str(path))
    trail += f'<li aria-current="page">{title if ancestors else "Files"}</li>'
    parent = (
        f'<a class="folder-up" href="{html.escape(file_url(root, path.parent, base))}">{NEXT_ICON}Up one folder</a>'
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
        f'<a href="{base}/help">Try the demo while you’re here</a></div>'
    )
    description = f'{folders} {"folder" if folders == 1 else "folders"} <span aria-hidden="true">/</span> {documents} {"document" if documents == 1 else "documents"}'
    body = f"""<!doctype html>
<html lang="en" data-theme-default="auto"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>{html.escape(title)} · aniflow</title>
<link rel="icon" href="data:,">{theme_script(nonce)}
<link rel="stylesheet" href="{base}/vendor/github-markdown.css">
<link rel="stylesheet" href="{base}/static/page.css">
<style>{THEME_READER_CSS}{BRAND_CSS}{UI_CSS}{DIRECTORY_CSS}</style>
</head><body class="aniflow-local aniflow-browser"><header class="bar"><a href="{base}{FILES}">aniflow</a><span class="name">{title}</span>
<nav><a href="{base}/help">Demo &amp; help</a>{theme_select(nonce)}</nav></header>
<main class="browser-shell"><div class="browser-masthead">{brand(base)}
<a class="browser-demo" href="{base}/help"><span class="demo-play" aria-hidden="true"></span>
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
    base: str = "",
    session: dict | None = None,
    signin: bool = False,
) -> tuple[bytes, str]:
    """A markdown file in the reader, with links kept under root_url."""
    nonce = secrets.token_urlsafe(16)
    help_link = (
        f'<a class="reader-help" href="{base}/help">Help</a>'
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
        '<nav class="bar-trail" aria-label="Folders">'
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
            comments=comments,
            review_name="Comments",
            root=root_url,
            base=base,
            signin=base + "/auth/github/start" if signin else "",
            signout=base + "/auth/logout" if signin else "",
            me=session,
        ),
        base=base,
        actions=actions,
        theme=True,
        trail=trail,
        top=brand(base),
        style=BRAND_CSS + UI_CSS,
        body_class="aniflow-local",
        after=f'<script nonce="{nonce}">{UI_JS}</script>',
    )
    return body, nonce


class Server(ThreadingHTTPServer):
    def __init__(
        self,
        address: tuple[str, int],
        root: Path,
        base: str = "",
        comments: bool = True,
        signin: oauth.SignIn | None = None,
    ):
        self.root = root.resolve()
        self.base = base
        self.comments = comments
        self.signin = signin
        identity = hashlib.sha256(os.fsencode(self.root)).hexdigest()
        cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        self.comments_root = cache / "aniflow" / "comments" / identity
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        super().__init__(address, Handler)

    def url(self, path: str) -> str:
        """A path under the base prefix this server was started with."""
        return self.base + path

    def comments_url(self, key: str) -> str:
        """The comments endpoint for key, or "" when the server does not take comments."""
        return self.url("/comments/" + key) if self.comments else ""


class Handler(web.Handler):
    server: Server

    def comment_target(self, key: str) -> tuple[Path, Path] | None:
        if not self.server.comments:
            return None
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

    def redirect(self, location: str, cookies: list[str] | None = None) -> None:
        self.send_response(302)
        self.send_header("Location", location)
        for value in cookies or []:
            self.send_header("Set-Cookie", value)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def cookie(self, name: str) -> str:
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie") or "")
        except CookieError:
            return ""
        morsel = jar.get(name)
        return morsel.value if morsel else ""

    def secure(self) -> bool:
        """Whether the browser reached this page over https, as the proxy reports."""
        return self.headers.get("X-Forwarded-Proto", "").strip().lower() == "https"

    def session(self) -> dict | None:
        """Who is asking, when the server offers GitHub sign-in and they signed in."""
        signin = self.server.signin
        return signin.session(self.cookie(oauth.SESSION_COOKIE)) if signin else None

    def signin_route(self, path: str, parsed: object) -> None:
        """The three routes of the GitHub sign-in: start, callback and sign out."""
        signin = self.server.signin
        if signin is None:
            self.send_error(404)
            return
        base = self.server.base
        state_cookie = self.cookie(oauth.STATE_COOKIE)
        if path == "/auth/logout":
            self.redirect(
                self.server.url(FILES),
                [
                    oauth.cookie(
                        oauth.SESSION_COOKIE,
                        "",
                        path=signin.path,
                        max_age=0,
                        secure=self.secure(),
                    )
                ],
            )
            return
        if path == "/auth/github/start":
            host = self.headers.get("Host") or ""
            origin, secure = oauth.origin_of(
                host, self.headers.get("X-Forwarded-Proto", "")
            )
            wanted = (parse_qs(parsed.query).get("next") or [""])[-1]
            url, state = signin.start(origin, base, wanted)
            self.redirect(
                url,
                [
                    oauth.cookie(
                        oauth.STATE_COOKIE,
                        state,
                        path=signin.path,
                        max_age=oauth.STATE_TTL,
                        secure=secure,
                    )
                ],
            )
            return
        query = parse_qs(parsed.query)
        target = signin.target(state_cookie, base)
        try:
            session = signin.finish(
                (query.get("code") or [""])[-1],
                (query.get("state") or [""])[-1],
                state_cookie,
                signin.redirect_uri(
                    oauth.origin_of(
                        self.headers.get("Host") or "",
                        self.headers.get("X-Forwarded-Proto", ""),
                    )[0],
                    base,
                ),
            )
        except oauth.SignInFailed as error:
            self.send_bytes(
                f"aniflow: sign-in failed: {error}\n".encode(),
                "text/plain; charset=utf-8",
                {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                status=400,
            )
            return
        self.redirect(
            target,
            [
                oauth.cookie(
                    oauth.SESSION_COOKIE,
                    oauth.seal(session, signin.secret),
                    path=signin.path,
                    secure=self.secure(),
                ),
                oauth.cookie(
                    oauth.STATE_COOKIE,
                    "",
                    path=signin.path,
                    max_age=0,
                    secure=self.secure(),
                ),
            ],
        )

    def under_base(self, path: str) -> str:
        """path with the base prefix removed, so a proxy may forward it with or without it."""
        base = self.server.base
        if base and path == base:
            return "/"
        if base and path.startswith(base + "/"):
            return path[len(base) :]
        return path

    def do_GET(self) -> None:
        if not self.request_allowed():
            return
        parsed = urlsplit(self.path)
        path = self.under_base(parsed.path)
        raw = "raw" in parse_qs(parsed.query, keep_blank_values=True)
        if path == "/":
            self.redirect(self.server.url(FILES))
            return
        if path == "/help":
            if raw:
                self.send_file(
                    HELP,
                    "text/plain; charset=utf-8",
                    {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"},
                )
            else:
                base = self.server.base
                body, nonce = reader_page(
                    base + "/",
                    "aniflow help",
                    HELP.read_text("utf-8"),
                    ("Files", base + FILES),
                    [("Raw", base + "/help?raw=1")],
                    self.server.comments_url("help"),
                    base=base,
                    session=self.session(),
                    signin=self.server.signin is not None,
                )
                self.send_html(body, page.reader_headers(nonce))
            return
        if path in ("/auth/github/start", "/auth/github/callback", "/auth/logout"):
            self.signin_route(path, parsed)
            return
        if path.startswith("/comments/"):
            target = self.comment_target(path.removeprefix("/comments/"))
            if target is None:
                self.send_json({"error": "not found"}, status=404)
            else:
                self.send_comments(*target, parsed.query, "aniflow")
            return
        if self.send_asset(path):
            return
        if path.startswith(FILES):
            base = self.server.base
            root = self.server.root
            key = unquote(path.removeprefix(FILES))
            local = local_path(root, key)
            if local is not None:
                try:
                    if local.is_dir():
                        if not path.endswith("/"):
                            self.redirect(file_url(root, local, base))
                            return
                        body, nonce = directory_page(root, local, base)
                    elif web.is_markdown(local.name) and not raw:
                        body, nonce = reader_page(
                            base + FILES,
                            local.name,
                            local.read_text("utf-8", errors="replace"),
                            ("Files", file_url(root, local.parent, base)),
                            [
                                ("Help", base + "/help"),
                                ("Raw", file_url(root, local, base) + "?raw=1"),
                            ],
                            self.server.comments_url(
                                "file/" + quote(local.relative_to(root).as_posix())
                            ),
                            breadcrumbs(root, local, base),
                            base=base,
                            session=self.session(),
                            signin=self.server.signin is not None,
                        )
                    else:
                        self.send_local_file(local, raw=raw)
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
        path = self.under_base(parsed.path)
        if path.startswith("/comments/"):
            session = self.session()
            if self.server.signin is not None and session is None:
                self.send_json(
                    {
                        "error": "sign in with GitHub to comment",
                        "signin": self.server.url("/auth/github/start"),
                    },
                    status=401,
                )
                return
            _, _, key = path.removeprefix("/comments/").partition("/")
            target = self.comment_target(key)
            if target is None:
                self.send_json({"error": "not found"}, status=404)
                return
            local, storage = target
            who = session or {}
            self.handle_comment(
                parsed._replace(path=path),
                local,
                storage,
                author=who.get("login", ""),
                author_id=who.get("id", 0),
                admin=who.get("admin", True),
            )
            return
        self.send_response(405)
        self.send_header("Allow", "GET")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Present Markdown, play diagrams and browse local documents."
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
        "--base",
        metavar="PATH",
        default="",
        help="path the server is mounted under, for a reverse proxy that serves it at "
        "a prefix such as /pub (default: the root)",
    )
    parser.add_argument(
        "--no-comments",
        action="store_true",
        help="do not offer review comments, for a read-only public deployment",
    )
    parser.add_argument(
        "--github-oauth",
        metavar="CLIENT_ID",
        default=os.environ.get("ANIFLOW_GITHUB_CLIENT_ID", ""),
        help="GitHub OAuth app the comment routes sign in with; the client secret and "
        "the cookie key come from ANIFLOW_GITHUB_SECRET and ANIFLOW_SIGNIN_SECRET",
    )
    parser.add_argument(
        "--comments-admin",
        metavar="LOGIN",
        default=os.environ.get("ANIFLOW_COMMENTS_ADMIN", ""),
        help="GitHub login allowed to change anyone's comments (default: nobody)",
    )
    parser.add_argument(
        "--spec",
        action="store_true",
        help="print the diagram walkthrough syntax reference and exit",
    )
    parser.add_argument("--init", metavar="FILE", help="create a starter presentation")
    parser.add_argument(
        "--style",
        choices=["keynote", "conference", "minimal"],
        help="presentation style for --init (default: conference)",
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
    if args.style and not args.init:
        parser.error("--style goes with --init")
    if args.init:
        if (
            args.check
            or args.spec
            or args.share
            or args.open
            or args.export
            or args.slides
            or args.out
            or args.diagram is not None
            or args.directory != Path.cwd()
            or args.host != "127.0.0.1"
            or args.port
        ):
            parser.error(
                "--init cannot be combined with other actions or server options"
            )
        template = (
            Path(__file__).with_name("templates") / f"{args.style or 'conference'}.md"
        )
        try:
            source = template.read_text("utf-8")
            with Path(args.init).open("x", encoding="utf-8") as output:
                output.write(source)
        except OSError as error:
            parser.error(f"cannot create {args.init}: {error}")
        print(
            f"Created {args.init}. Run aniflow {Path(args.init).parent} to present it."
        )
        return
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
        base = path_prefix(args.base)
    except ValueError as error:
        parser.error(str(error))
    signin = None
    if args.github_oauth:
        secret = os.environ.get("ANIFLOW_GITHUB_SECRET", "")
        signing = os.environ.get("ANIFLOW_SIGNIN_SECRET", "")
        if not secret or not signing:
            parser.error(
                "--github-oauth needs ANIFLOW_GITHUB_SECRET and ANIFLOW_SIGNIN_SECRET "
                "in the environment"
            )
        signin = oauth.SignIn(
            args.github_oauth,
            secret,
            signing,
            path=base + "/",
            admin=args.comments_admin,
        )
    try:
        httpd = Server(
            (args.host, args.port),
            args.directory,
            base=base,
            comments=not args.no_comments,
            signin=signin,
        )
    except (OSError, OverflowError) as error:
        parser.error(str(error))
    host = f"[{args.host}]" if ":" in args.host else args.host
    print(
        f"aniflow: serving {httpd.root} at http://{host}:{httpd.server_address[1]}{base}/",
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
