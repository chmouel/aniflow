from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
import webbrowser
import zlib
from datetime import UTC, datetime
from http.cookies import CookieError, SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from aniflow import export, oauth, page, tokens, web
from aniflow.brand import BRAND_CSS, DEFAULT, favicon, masthead
from aniflow.themes import THEME_READER_CSS, theme_script, theme_select
from aniflow.ui import (
    DIRECTORY_CSS,
    EDITOR_CSS,
    EDITOR_JS,
    FOLDER_ICON,
    FOLDER_MENU_ICON,
    GITHUB_MARK,
    KEY_ICON,
    NEW_NOTE_JS,
    NOTE_ICON,
    SEARCH_ICON,
    SIGNOUT_ICON,
    TOKENS_CSS,
    TOKENS_JS,
    TRASH_ICON,
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


# Pictures dropped at the top of the served folder are used without being named: the
# first of these that exists.
LOGO_NAMES = ("logo.svg", "logo.png")
ICON_NAMES = ("favicon.svg", "favicon.png", "favicon.ico")


def logo_url(
    root: Path, value: str = "", base: str = "", names: tuple[str, ...] = LOGO_NAMES
) -> str:
    """Where the browser fetches a picture (the masthead logo, or the tab icon with
    ICON_NAMES): a path inside the served folder, an https URL or a data: picture, and
    nothing else. Without a value, names at the top of the folder are looked for, so
    dropping one there is enough."""
    if not value:
        value = next((name for name in names if (root / name).is_file()), "")
        if not value:
            return ""
    if value.startswith(("data:image/", "https://")):
        return value
    path = local_path(root, value)
    if path is None or not path.is_file():
        raise ValueError(f"no logo at {value}")
    return base + FILES + quote(path.relative_to(root).as_posix())


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


# Writing from the web, with --user-folders: each signed-in member owns <root>/<login>/,
# and a folder holding this hidden file (and everything under it) is open to all of them.
SHARED_MARK = ".aniflow-shared"
NOTE_MAX_BYTES = 1024**2
# Every write of a note, from the editor or the API, checks its version and writes under
# this lock, so two saves opened at the same version cannot both land.
NOTES_LOCK = threading.Lock()
WELCOME = Path(__file__).with_name("templates") / "welcome.md"
LOGIN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})")
DIAGRAM_EXAMPLE = """```mermaid
flowchart LR
  A[Start] --> B[Do the work]
  B --> C[Done]

%% play: How it goes
%% A -> B : begin | The first step
%% B -> C : finish | And it is done
```"""


def note_path(root: Path, key: str) -> Path | None:
    """A Markdown file the web may write: inside a folder under root (never at the top),
    no hidden part, and no symlink leading out, whether it exists yet or not."""
    relative = Path(key)
    if not key or relative.is_absolute() or "\\" in key or "\x00" in key:
        return None
    if any(part in (".", "..") or part.startswith(".") for part in relative.parts):
        return None
    if len(relative.parts) < 2 or not web.is_markdown(relative.name):
        return None
    path = root / relative
    # A link anywhere on the way, not only at the end, could lead into someone else's
    # folder while the path still names your own.
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return None
    try:
        existing = path.parent
        while not existing.exists():
            existing = existing.parent
        existing.resolve().relative_to(root)
        if path.is_symlink() or (path.exists() and not path.is_file()):
            return None
    except (OSError, ValueError, RuntimeError):
        return None
    return path


def may_write(root: Path, path: Path, session: dict | None) -> bool:
    """Whether this signed-in account may change path: its own folder, a shared one, or
    anything for the admin."""
    if not session:
        return False
    if session.get("admin"):
        return True
    relative = path.relative_to(root)
    if relative.parts[0].lower() == str(session.get("login", "")).lower():
        return True
    folder = path.parent
    while folder != root:
        if (folder / SHARED_MARK).is_file():
            return True
        folder = folder.parent
    return False


def note_version(path: Path) -> str:
    """What the editor saw: a later save from it must match, so it never overwrites a
    change made meanwhile. Empty for a note that does not exist yet."""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except FileNotFoundError:
        return ""


def write_note(path: Path, text: str) -> str:
    """Replace the note in one step, so a reader never sees half of it, and return the
    version of what was written."""
    data = text.encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(4)}.part")
    temporary.write_bytes(data)
    os.replace(temporary, path)
    return hashlib.sha256(data).hexdigest()


def user_folder(root: Path, login: str) -> Path | None:
    """The member's own folder, made on first sign-in with a welcome note in it."""
    if not LOGIN.fullmatch(login):
        return None
    folder = root / login.lower()
    if not folder.exists():
        folder.mkdir()
        write_note(
            folder / "welcome.md", WELCOME.read_text("utf-8").replace("{login}", login)
        )
    return folder if folder.is_dir() and not folder.is_symlink() else None


def day_of(stamp: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(stamp))


def token_db() -> Path:
    """Where the API tokens live: one database for the machine, beside the comments."""
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return cache / "aniflow" / "tokens.db"


def account_menu(
    base: str, session: dict | None, here: str, folders: bool = False
) -> str:
    """The GitHub account at the end of the bar: a sign-in link back to here, or who is
    signed in with a way out. Empty when the server has no sign-in."""
    back = quote(here, safe="")
    if not session:
        return (
            f'<a class="account-signin" href="{base}/auth/github/start?next={back}">'
            f"{GITHUB_MARK}<span>Sign in</span></a>"
        )
    login = html.escape(session.get("login", ""))
    avatar = f"https://avatars.githubusercontent.com/u/{int(session.get('id', 0))}?s=64"
    return (
        '<details class="aniflow-menu account"><summary>'
        f'<img class="account-avatar" src="{avatar}" alt="">'
        f'<span class="account-login">{login}</span></summary><div class="menu-items">'
        f'<div class="account-who"><img src="{avatar}" alt="">'
        f"<span>Signed in as <b>{login}</b></span></div>"
        + (
            f'<a href="{base}{FILES}{quote(session.get("login", "").lower())}/">'
            f"{FOLDER_MENU_ICON}My folder</a>"
            f'<a href="{base}/tokens">{KEY_ICON}API tokens</a>'
            if folders
            else ""
        )
        + f'<a href="https://github.com/{quote(session.get("login", ""))}" rel="noopener">'
        f"{GITHUB_MARK}GitHub profile</a>"
        '<hr class="menu-sep">'
        f'<a class="menu-signout" href="{base}/auth/logout?next={back}">'
        f"{SIGNOUT_ICON}Sign out</a></div></details>"
    )


def directory_page(
    root: Path,
    path: Path,
    base: str = "",
    brand_name: str = DEFAULT,
    logo: str = "",
    icon: str = "",
    account: str = "",
    new_note: bool = False,
) -> tuple[bytes, str]:
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
    new_box = (
        '<div class="new-note"><input id="new-note-name" placeholder="name.md" '
        'aria-label="Name of the new note" autocomplete="off">'
        '<button type="button" id="new-note">New note</button></div>'
        if new_note
        else ""
    )
    new_script = f'<script nonce="{nonce}">{NEW_NOTE_JS}</script>' if new_note else ""
    # The demo is for a folder with nothing to read yet; once there are notes it is noise.
    demo = (
        ""
        if entries
        else f'<a class="browser-demo" href="{base}/help"><span class="demo-play" aria-hidden="true"></span>'
        "<span><strong>Try animated diagrams</strong><span>Play the demo, then make your own.</span></span>"
        f"{NEXT_ICON}</a>"
    )
    body = f"""<!doctype html>
<html lang="en" data-theme-default="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>{html.escape(title)} · {html.escape(brand_name)}</title>
<link rel="icon" href="{html.escape(favicon(brand_name, icon or logo))}">{theme_script(nonce)}
<link rel="stylesheet" href="{base}/vendor/github-markdown.css">
<link rel="stylesheet" href="{base}/static/page.css">
<style>{THEME_READER_CSS}{BRAND_CSS}{UI_CSS}{DIRECTORY_CSS}</style>
</head><body class="aniflow-local aniflow-browser"><header class="bar"><a href="{base}{FILES}">{html.escape(brand_name)}</a><span class="name">{title}</span>
<nav><a href="{base}/help">Demo &amp; help</a>{theme_select(nonce)}{account}</nav></header>
<main class="browser-shell"><div class="browser-masthead">{masthead(base, brand_name, logo)}
{demo}</div>
<nav class="browser-trail" aria-label="Folders"><ol>{trail}</ol></nav>
<div class="browser-heading"><div><h1>{title}</h1><p class="folder-summary">{description}</p></div>{new_box}{parent}</div>
{content}</main><script nonce="{nonce}">{UI_JS}</script>{new_script}</body></html>"""
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
    brand_name: str = DEFAULT,
    logo: str = "",
    icon: str = "",
    account: str = "",
    edit: str = "",
    delete: dict[str, str] | None = None,
) -> tuple[bytes, str]:
    """A markdown file in the reader, with links kept under root_url. edit is the editor's
    URL, for a note the reader may change."""
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
    if delete:
        menu_links += (
            '<hr class="menu-sep">'
            f'<button type="button" class="menu-danger"'
            f' data-delete-url="{html.escape(delete["url"])}"'
            f' data-version="{html.escape(delete["version"])}"'
            f' data-folder="{html.escape(delete["folder"])}"'
            f' data-name="{html.escape(delete["name"])}">'
            f"{TRASH_ICON}Delete</button>"
        )
    edit_link = (
        f'<a class="reader-edit" href="{html.escape(edit)}">Edit</a>' if edit else ""
    )
    actions = (
        edit_link
        + help_link
        + (
            f'<details class="aniflow-menu"><summary>More</summary><div class="menu-items">{menu_links}</div></details>'
            if menu_links
            else ""
        )
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
        account=account,
        top=masthead(base, brand_name, logo),
        favicon=favicon(brand_name, icon or logo),
        style=BRAND_CSS + UI_CSS,
        body_class="aniflow-local",
        after=f'<script nonce="{nonce}">{UI_JS}</script>',
    )
    return body, nonce


def editor_page(
    root: Path,
    note: Path,
    base: str,
    brand_name: str,
    logo: str,
    icon: str,
    account: str,
) -> tuple[bytes, str]:
    """The web editor for one note: its Markdown beside the page it renders to."""
    nonce = secrets.token_urlsafe(16)
    exists = note.is_file()
    text = note.read_text("utf-8", errors="replace") if exists else f"# {note.stem}\n\n"
    key = quote(note.relative_to(root).as_posix())
    folder = file_url(root, note.parent, base) if note.parent.is_dir() else base + FILES
    data = {
        "name": note.name,
        "exists": exists,
        "version": note_version(note),
        "save": f"{base}/notes/save/{key}",
        "remove": f"{base}/notes/delete/{key}",
        "folder": folder,
        "example": DIAGRAM_EXAMPLE,
    }
    controls = (
        '<span class="editor-status" id="editor-status" role="status"></span>'
        '<button type="button" id="editor-diagram" title="Insert an animated diagram">'
        "Insert diagram</button>"
        + (
            '<button type="button" class="editor-delete" id="editor-delete">Delete</button>'
            if exists
            else ""
        )
        + '<button type="button" class="editor-save" id="editor-save" title="Ctrl+S">'
        "Save</button>"
    )
    editor = (
        '<div class="editor"><textarea id="editor-text" spellcheck="true" '
        f'aria-label="Markdown of {html.escape(note.name)}">{html.escape(text)}</textarea></div>'
    )
    body = page.reader_page(
        title=f"Editing {note.name}",
        text=text,
        nonce=nonce,
        back=(("View", file_url(root, note, base)) if exists else ("Folder", folder)),
        options=page.reader_options(root=base + FILES, base=base),
        base=base,
        actions=controls,
        account=account,
        theme=True,
        top=editor,
        favicon=favicon(brand_name, icon or logo),
        style=BRAND_CSS + UI_CSS + EDITOR_CSS,
        body_class="aniflow-local aniflow-editing",
        after=(
            f'<script type="application/json" id="aniflow-editor">{page.json_script(data)}</script>'
            f'<script nonce="{nonce}">{UI_JS}{EDITOR_JS}</script>'
        ),
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
        hosts: frozenset[str] = frozenset(),
        brand_name: str = DEFAULT,
        logo: str = "",
        icon: str = "",
        user_folders: bool = False,
    ):
        self.root = root.resolve()
        self.base = base
        self.comments = comments
        self.signin = signin
        self.hosts = hosts
        self.brand_name = brand_name
        self.chosen_logo = logo
        self.chosen_icon = icon
        self.user_folders = user_folders
        identity = hashlib.sha256(os.fsencode(self.root)).hexdigest()
        cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        self.comments_root = cache / "aniflow" / "comments" / identity
        self.tokens = (
            tokens.Tokens(token_db()) if user_folders and signin is not None else None
        )
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        super().__init__(address, Handler)

    @property
    def logo(self) -> str:
        """The --logo picture, or a logo.svg/logo.png in the folder, looked for on every
        page so one dropped there while the server runs shows up on the next load."""
        return self.chosen_logo or logo_url(self.root, "", self.base)

    @property
    def icon(self) -> str:
        """The --favicon picture, or a favicon.svg/png/ico in the folder, looked up like
        the logo. Empty means the tab gets the logo, or the name's first letter."""
        return self.chosen_icon or logo_url(self.root, "", self.base, ICON_NAMES)

    def url(self, path: str) -> str:
        """A path under the base prefix this server was started with."""
        return self.base + path

    def comments_url(self, key: str) -> str:
        """The comments endpoint for key, or "" when the server does not take comments."""
        return self.url("/comments/" + key) if self.comments else ""


class Handler(web.Handler):
    server: Server

    def allowed_hosts(self) -> frozenset[str]:
        """Host names a proxy may forward: --allow-host, for a public deployment."""
        return self.server.hosts

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
        held = signin.session(self.cookie(oauth.SESSION_COOKIE)) if signin else None
        return self.with_admin(held)

    def with_admin(self, who: dict | None) -> dict | None:
        """who, with admin decided now from --comments-admin rather than whatever was
        true when the cookie or the token was made."""
        if who is None:
            return None
        admin = self.server.signin.admin if self.server.signin else ""
        return {**who, "admin": bool(admin) and who["login"].lower() == admin}

    def bearer(self) -> dict | None:
        """Who an API token in the Authorization header stands for, if it is alive."""
        if self.server.tokens is None:
            return None
        scheme, _, value = (self.headers.get("Authorization") or "").partition(" ")
        if scheme.lower() != "bearer":
            return None
        return self.with_admin(self.server.tokens.check(value.strip()))

    def writable(self, path: Path) -> bool:
        """Whether whoever is asking may change the note at path from the web."""
        if not self.server.user_folders or self.server.signin is None:
            return False
        note = note_path(
            self.server.root, path.relative_to(self.server.root).as_posix()
        )
        return note is not None and may_write(self.server.root, note, self.session())

    def edit_note(self, key: str) -> None:
        """GET /files/<path>?edit: the editor, for a note the reader may write."""
        if not self.server.user_folders or self.server.signin is None:
            self.send_error(404)
            return
        note = note_path(self.server.root, key)
        if note is None:
            self.send_error(404)
            return
        session = self.session()
        if session is None:
            self.redirect(
                self.server.url("/auth/github/start?next=") + quote(self.path, safe="")
            )
            return
        if not may_write(self.server.root, note, session):
            self.send_bytes(
                b"aniflow: this folder is not yours; you can read it, not change it.\n",
                "text/plain; charset=utf-8",
                {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                status=403,
            )
            return
        try:
            body, nonce = editor_page(
                self.server.root,
                note,
                self.server.base,
                self.server.brand_name,
                self.server.logo,
                self.server.icon,
                self.account(),
            )
        except OSError:
            self.send_error(404)
            return
        self.send_html(body, page.reader_headers(nonce))

    def do_PUT(self) -> None:
        self.api_write("PUT")

    def do_DELETE(self) -> None:
        self.api_write("DELETE")

    def api_write(self, method: str) -> None:
        if not self.request_allowed():
            return
        path = self.under_base(urlsplit(self.path).path)
        if not path.startswith("/api/notes/"):
            self.send_response(405)
            self.send_header("Allow", "GET")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.api_note(method, unquote(path.removeprefix("/api/notes/")))

    def api_note(self, method: str, key: str) -> None:
        """/api/notes/<path>: GET the Markdown (open to all, like the site), PUT it to
        create or replace it and DELETE it, both with an API token. If-Match with the
        ETag of a GET refuses to touch a note changed since."""
        root = self.server.root
        if self.server.tokens is None:
            self.send_json({"error": "not found"}, status=404)
            return
        if method == "GET":
            path = local_path(root, key)
            if path is None or not path.is_file() or not web.is_markdown(path.name):
                self.send_json({"error": "not found"}, status=404)
                return
            data = path.read_bytes()
            self.send_bytes(
                data,
                "text/markdown; charset=utf-8",
                {
                    "ETag": f'"{hashlib.sha256(data).hexdigest()}"',
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )
            return
        who = self.bearer()
        if who is None:
            self.send_json(
                {"error": "send an API token: Authorization: Bearer aniflow_..."},
                status=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            return
        note = note_path(root, key)
        if note is None:
            self.send_json({"error": "not a note this server writes"}, status=404)
            return
        if not may_write(root, note, who):
            self.send_json({"error": "this folder is not yours"}, status=403)
            return
        text = ""
        if method == "PUT":
            body = self.read_body(NOTE_MAX_BYTES)
            if body is None:
                self.send_json({"error": "notes are limited to 1 MB"}, status=413)
                return
            try:
                text = body.decode("utf-8")
            except UnicodeDecodeError:
                self.send_json({"error": "send UTF-8 Markdown"}, status=400)
                return
        wanted = self.headers.get("If-Match")
        wanted = wanted.strip().removeprefix("W/").strip('"') if wanted else None
        try:
            with NOTES_LOCK:
                current = note_version(note)
                if (
                    wanted is not None
                    and wanted != current
                    and not (wanted == "*" and current)
                ):
                    self.send_json(
                        {"error": "the note changed since that version"}, status=412
                    )
                    return
                if method == "DELETE":
                    if not current:
                        self.send_json({"error": "not found"}, status=404)
                        return
                    note.unlink()
                    self.send_response(204)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                version = write_note(note, text)
        except OSError as error:
            self.send_json({"error": f"could not write: {error.strerror}"}, status=500)
            return
        self.send_json(
            {"url": file_url(root, note, self.server.base), "version": version},
            status=200 if current else 201,
            headers={"ETag": f'"{version}"'},
        )

    def change_tokens(self, action: str) -> None:
        """POST /tokens/create {name} or /tokens/revoke {id}, from the signed-in page."""
        if self.server.tokens is None:
            self.send_json({"error": "not found"}, status=404)
            return
        who = self.session()
        if who is None:
            self.send_json({"error": "sign in with GitHub first"}, status=401)
            return
        body = self.read_body(4096)
        try:
            data = json.loads(body or b"null")
        except ValueError:
            data = None
        if not isinstance(data, dict):
            self.send_json({"error": "send JSON"}, status=400)
            return
        if action == "create":
            made = self.server.tokens.create(
                who["id"], who["login"], str(data.get("name", ""))
            )
            if isinstance(made, str):
                self.send_json({"error": made}, status=400)
                return
            self.send_json(made)
            return
        if not self.server.tokens.revoke(who["id"], str(data.get("id", ""))):
            self.send_json({"error": "no such token of yours"}, status=404)
            return
        self.send_json({"revoked": True})

    def tokens_page(self) -> None:
        """GET /tokens: your API tokens, a way to make one, and how to use it."""
        if self.server.tokens is None:
            self.send_error(404)
            return
        who = self.session()
        if who is None:
            self.redirect(
                self.server.url("/auth/github/start?next=") + quote(self.path, safe="")
            )
            return
        base = self.server.base
        rows = (
            "".join(
                f"<tr><td>{html.escape(row['name'])}</td><td>{day_of(row['created'])}</td>"
                f"<td>{day_of(row['last_used']) if row['last_used'] else 'never'}</td>"
                f'<td>{day_of(row["expires"])}</td><td><button type="button" '
                f'data-id="{html.escape(row["id"])}">Revoke</button></td></tr>'
                for row in self.server.tokens.mine(who["id"])
            )
            or '<tr class="token-none"><td colspan="5">No tokens yet.</td></tr>'
        )
        panel = (
            '<section class="tokens"><div class="token-new">'
            '<input id="token-name" maxlength="60" autocomplete="off" '
            'placeholder="What is it for? e.g. laptop sync" aria-label="Token name">'
            '<button type="button" id="token-create">Create token</button></div>'
            '<div class="token-made" id="token-made" hidden><p>Copy it now: it is not '
            'shown again.</p><div><code id="token-value"></code>'
            '<button type="button" id="token-copy">Copy</button></div></div>'
            '<p class="token-status" id="token-status" role="status"></p>'
            "<table><thead><tr><th>Name</th><th>Created</th><th>Last used</th>"
            f'<th>Expires</th><th></th></tr></thead><tbody id="token-rows">{rows}'
            "</tbody></table></section>"
        )
        origin, _ = oauth.origin_of(
            self.headers.get("Host") or "", self.headers.get("X-Forwarded-Proto", "")
        )
        api = f"{origin}{base}/api/notes/{who['login'].lower()}"
        guide = f"""# API tokens

A token lets a script write notes as you, with exactly your rights on the web:
your own folder and the shared ones. It lasts {tokens.LIFETIME // 86400} days,
and you can revoke it here at any time.

```sh
export ANIFLOW_TOKEN=aniflow_...

# create or replace a note
curl -X PUT -H "Authorization: Bearer $ANIFLOW_TOKEN" \\
  --data-binary @plan.md {api}/plan.md

# read it (no token needed: everyone reads everything)
curl {api}/plan.md

# delete it
curl -X DELETE -H "Authorization: Bearer $ANIFLOW_TOKEN" {api}/plan.md
```

A GET answers with an `ETag`. Send it back as `If-Match` on a PUT or DELETE to
refuse the change when someone edited the note in between.
"""
        nonce = secrets.token_urlsafe(16)
        data = {"create": f"{base}/tokens/create", "revoke": f"{base}/tokens/revoke"}
        body = page.reader_page(
            title="API tokens",
            text=guide,
            nonce=nonce,
            back=("Files", base + FILES),
            options=page.reader_options(root=base + FILES, base=base),
            base=base,
            account=self.account(),
            theme=True,
            top=panel,
            favicon=favicon(
                self.server.brand_name, self.server.icon or self.server.logo
            ),
            style=BRAND_CSS + UI_CSS + TOKENS_CSS,
            body_class="aniflow-local",
            after=(
                f'<script type="application/json" id="aniflow-tokens">{page.json_script(data)}</script>'
                f'<script nonce="{nonce}">{UI_JS}{TOKENS_JS}</script>'
            ),
        )
        self.send_html(body, page.reader_headers(nonce))

    def change_note(self, path: str) -> None:
        """POST /notes/save/<path> or /notes/delete/<path>, from the editor."""
        if not self.server.user_folders or self.server.signin is None:
            self.send_json({"error": "not found"}, status=404)
            return
        action, _, key = path.removeprefix("/notes/").partition("/")
        session = self.session()
        if session is None:
            self.send_json({"error": "sign in with GitHub to write"}, status=401)
            return
        note = note_path(self.server.root, unquote(key))
        if note is None:
            self.send_json({"error": "not a note this server writes"}, status=404)
            return
        if not may_write(self.server.root, note, session):
            self.send_json({"error": "this folder is not yours"}, status=403)
            return
        body = self.read_body(NOTE_MAX_BYTES * 2)
        try:
            data = json.loads(body or b"null")
        except ValueError:
            data = None
        if body is None or not isinstance(data, dict):
            self.send_json({"error": "send JSON, under 1 MB"}, status=400)
            return
        text = data.get("text")
        if action != "delete" and (
            not isinstance(text, str) or len(text.encode("utf-8")) > NOTE_MAX_BYTES
        ):
            self.send_json({"error": "text must be a string under 1 MB"}, status=400)
            return
        try:
            with NOTES_LOCK:
                if data.get("version", "") != note_version(note):
                    self.send_json(
                        {
                            "error": "changed since you opened it: copy your text, then reload"
                        },
                        status=409,
                    )
                    return
                if action == "delete":
                    if not note.exists():
                        self.send_json({"error": "not found"}, status=404)
                        return
                    note.unlink()
                    self.send_json({"deleted": True})
                    return
                version = write_note(note, text)
        except OSError as error:
            self.send_json({"error": f"could not write: {error.strerror}"}, status=500)
            return
        self.send_json(
            {
                "version": version,
                "url": file_url(self.server.root, note, self.server.base),
            }
        )

    def account(self) -> str:
        """The bar's GitHub button for this request, when the server offers sign-in."""
        if self.server.signin is None:
            return ""
        return account_menu(
            self.server.base, self.session(), self.path, self.server.user_folders
        )

    def signin_route(self, path: str, parsed: object) -> None:
        """The three routes of the GitHub sign-in: start, callback and sign out."""
        signin = self.server.signin
        if signin is None:
            self.send_error(404)
            return
        base = self.server.base
        state_cookie = self.cookie(oauth.STATE_COOKIE)
        if path == "/auth/logout":
            wanted = (parse_qs(parsed.query).get("next") or [""])[-1]
            self.redirect(
                oauth.next_path(wanted, base),
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
        except oauth.NotMember as error:
            self.send_bytes(
                f"aniflow: {error}, so this account cannot comment here. Reading the "
                f"notes stays open: {target}\n".encode(),
                "text/plain; charset=utf-8",
                {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                status=403,
            )
            return
        except oauth.SignInFailed as error:
            self.send_bytes(
                f"aniflow: sign-in failed: {error}\n".encode(),
                "text/plain; charset=utf-8",
                {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                status=400,
            )
            return
        if self.server.user_folders:
            try:
                user_folder(self.server.root, session["login"])
            except OSError as error:
                self.log_error(
                    "could not make the folder of %s: %s", session["login"], error
                )
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
                    brand_name=self.server.brand_name,
                    logo=self.server.logo,
                    icon=self.server.icon,
                    account=self.account(),
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
        if path.startswith("/api/notes/"):
            self.api_note("GET", unquote(path.removeprefix("/api/notes/")))
            return
        if path == "/tokens":
            self.tokens_page()
            return
        if path.startswith(FILES):
            base = self.server.base
            root = self.server.root
            key = unquote(path.removeprefix(FILES))
            if "edit" in parse_qs(parsed.query, keep_blank_values=True):
                self.edit_note(key)
                return
            local = local_path(root, key)
            if local is not None:
                try:
                    if local.is_dir():
                        if not path.endswith("/"):
                            self.redirect(file_url(root, local, base))
                            return
                        body, nonce = directory_page(
                            root,
                            local,
                            base,
                            self.server.brand_name,
                            self.server.logo,
                            self.server.icon,
                            self.account(),
                            new_note=local != root and self.writable(local / "new.md"),
                        )
                    elif web.is_markdown(local.name) and not raw:
                        can_write = self.writable(local)
                        relative = quote(local.relative_to(root).as_posix())
                        body, nonce = reader_page(
                            base + FILES,
                            local.name,
                            local.read_text("utf-8", errors="replace"),
                            ("Files", file_url(root, local.parent, base)),
                            [
                                ("Help", base + "/help"),
                                ("Raw", file_url(root, local, base) + "?raw=1"),
                            ],
                            self.server.comments_url("file/" + relative),
                            breadcrumbs(root, local, base),
                            base=base,
                            session=self.session(),
                            signin=self.server.signin is not None,
                            brand_name=self.server.brand_name,
                            logo=self.server.logo,
                            icon=self.server.icon,
                            account=self.account(),
                            edit=file_url(root, local, base) + "?edit"
                            if can_write
                            else "",
                            delete={
                                "url": f"{base}/notes/delete/{relative}",
                                "version": note_version(local),
                                "folder": file_url(root, local.parent, base),
                                "name": local.name,
                            }
                            if can_write
                            else None,
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
        if path.startswith(("/notes/save/", "/notes/delete/")):
            self.change_note(path)
            return
        if path in ("/tokens/create", "/tokens/revoke"):
            self.change_tokens(path.removeprefix("/tokens/"))
            return
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
        "--brand",
        metavar="NAME",
        default=DEFAULT,
        help=f"name in the bar, the masthead and the tab icon (default: {DEFAULT})",
    )
    parser.add_argument(
        "--logo",
        metavar="VALUE",
        default="",
        help="picture for the masthead and the tab icon: a path inside the served folder, "
        "an https URL or a data: image (default: logo.svg or logo.png there, if any)",
    )
    parser.add_argument(
        "--favicon",
        metavar="VALUE",
        default="",
        help="tab icon, given like --logo (default: favicon.svg, favicon.png or "
        "favicon.ico there, then the logo, then the name's first letter)",
    )
    parser.add_argument(
        "--allow-host",
        metavar="NAME",
        action="append",
        default=[],
        help="host name the server answers for besides local ones, for a reverse proxy "
        "that forwards the public Host (repeatable)",
    )
    parser.add_argument(
        "--github-org",
        metavar="ORG",
        action="append",
        default=[
            org
            for org in os.environ.get("ANIFLOW_GITHUB_ORGS", "").split(",")
            if org.strip()
        ],
        help="with --github-oauth, only members of this GitHub organisation may sign "
        "in to comment (repeatable; default: ANIFLOW_GITHUB_ORGS, comma separated)",
    )
    parser.add_argument(
        "--user-folders",
        action="store_true",
        help="with --github-oauth, give each signed-in member a folder of their own "
        "to write Markdown in from the web; a folder holding a .aniflow-shared file "
        "is writable by all of them",
    )
    parser.add_argument(
        "--revoke-tokens",
        metavar="MEMBER",
        help="revoke every API token of a member, by GitHub login or numeric id, and "
        "exit (their signed-in browser session is not affected)",
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
    if args.revoke_tokens:
        count = tokens.Tokens(token_db()).revoke_member(args.revoke_tokens)
        print(f"aniflow: revoked {count} token{'' if count == 1 else 's'}")
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
    # A server reachable under a public name takes comments only from signed-in people.
    if args.allow_host and not args.no_comments and not args.github_oauth:
        parser.error(
            "--allow-host serves the comments to the public: add --github-oauth "
            "(or set ANIFLOW_GITHUB_CLIENT_ID), or --no-comments"
        )
    if args.user_folders and not args.github_oauth:
        parser.error(
            "--user-folders needs --github-oauth: writing needs a signed-in account"
        )
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
            orgs=tuple(args.github_org),
        )
    try:
        logo = logo_url(args.directory, args.logo, base)
        icon = args.favicon and logo_url(args.directory, args.favicon, base, ICON_NAMES)
    except ValueError as error:
        parser.error(str(error))
    try:
        httpd = Server(
            (args.host, args.port),
            args.directory,
            base=base,
            comments=not args.no_comments,
            signin=signin,
            user_folders=args.user_folders,
            hosts=frozenset(
                name.strip().lower() for name in args.allow_host if name.strip()
            ),
            brand_name=args.brand.strip() or DEFAULT,
            logo=logo,
            icon=icon,
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
