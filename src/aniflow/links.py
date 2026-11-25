"""Links between notes: [[wikilinks]] resolved Obsidian style, and the backlinks index.

Nothing here decides who may see what. Callers hand in the notes the reader may read,
and the cache only holds what each note's text says."""

from __future__ import annotations

import posixpath
import re
import threading
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlsplit

FILES = "/files/"
NOTE_SUFFIXES = (".md", ".markdown")
# A target ending in one of these names a file; anything else is a note name.
FILE_SUFFIXES = frozenset(
    {
        ".md",
        ".markdown",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".svg",
        ".avif",
        ".pdf",
    }
)
PICTURE_SUFFIXES = frozenset(
    {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
)
WIKILINK = re.compile(r"!?\[\[([^\[\]\n]+?)\]\]")
MD_LINK = re.compile(r"\]\(\s*(?:<([^<>\n]*)>|([^()\s]+))")
INLINE_CODE = re.compile(r"(`+)(?!`).*?(?<!`)\1(?!`)", re.DOTALL)
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
TITLE = re.compile(r"^title:\s*(.+?)\s*$", re.MULTILINE)
HEADING = re.compile(r"^ {0,3}#\s+(.+?)\s*#*\s*$", re.MULTILINE)
SCHEME = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|#|//)", re.IGNORECASE)
BACKLINKS_MAX = 50


def note_url(base: str, rel: str) -> str:
    """The mounted, encoded URL of a file under the served folder."""
    return base + FILES + quote(rel)


def strip_code(text: str) -> str:
    """text without fenced blocks and inline code spans, where links are only text."""
    kept: list[str] = []
    fence = ""
    for line in text.splitlines():
        opening = FENCE.match(line)
        if fence:
            if (
                opening
                and opening.group(1)[0] == fence[0]
                and len(opening.group(1)) >= len(fence)
            ) and not line.strip().lstrip(fence[0]):
                fence = ""
            continue
        if opening:
            fence = opening.group(1)
            continue
        kept.append(line)
    return INLINE_CODE.sub("", "\n".join(kept))


def parse_wikilink(body: str) -> tuple[str, str]:
    """(target, heading) of the inside of [[...]], split as the reader does."""
    link = body.replace("\\|", "|").split("|", 1)[0].strip()
    target, _, heading = link.partition("#")
    return target.strip(), heading.strip()


def wiki_targets(text: str) -> list[str]:
    """Every distinct [[target]] in a note, outside code, in order."""
    seen: dict[str, None] = {}
    for match in WIKILINK.finditer(strip_code(text)):
        target, _ = parse_wikilink(match.group(1))
        if target:
            seen.setdefault(target)
    return list(seen)


def md_targets(text: str) -> list[str]:
    """The destinations of ordinary [text](target) links, outside code."""
    return [
        match.group(1) if match.group(1) is not None else match.group(2)
        for match in MD_LINK.finditer(strip_code(text))
    ]


def note_title(text: str, path: Path) -> str:
    """The front matter title, else the first # heading, else the file name."""
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end > 0 and (found := TITLE.search(text[:end])):
            return found.group(1).strip("\"'") or path.stem
    for found in HEADING.finditer(strip_code(text)):
        return found.group(1)
    return path.stem


def href_note(href: str, note_rel: str, base: str) -> str | None:
    """The note an ordinary link in note_rel opens, as a path under the served folder,
    following what the reader's directoryUrl() and the browser do with it."""
    root_url = base + FILES
    href = href.strip()
    if not href or "\\" in href or SCHEME.match(href) or href.startswith("/icons/"):
        return None
    if href.startswith("/") and not href.startswith(root_url):
        href = root_url + href[1:]
    try:
        url = urlsplit(urljoin("http://aniflow" + note_url(base, note_rel), href))
    except ValueError:
        return None
    if url.netloc != "aniflow" or not url.path.startswith(root_url):
        return None
    path = url.path
    rel = unquote(path[len(root_url) :])
    return rel if rel.lower().endswith(NOTE_SUFFIXES) else None


def wiki_names(target: str) -> list[str]:
    """The file names a target stands for: a note name gets .md, then .markdown."""
    if Path(target).suffix.lower() in FILE_SUFFIXES:
        return [target]
    return [target + suffix for suffix in NOTE_SUFFIXES]


def resolve_wiki(target: str, note_rel: str, readable: dict[str, Path]) -> str | None:
    """The path under the served folder that [[target]] in note_rel opens, among the
    readable files: beside the note, then from the top, then by name anywhere (the
    note's own folder first, then the shortest path, then alphabetical)."""
    names = wiki_names(target.strip().lstrip("/"))
    folder = posixpath.dirname(note_rel)
    places = [folder]
    if Path(names[0]).suffix.lower() in PICTURE_SUFFIXES:
        places.append(posixpath.join(folder, "images"))
    places.append("")
    for place in places:
        for name in names:
            rel = posixpath.normpath(posixpath.join(place, name))
            if not rel.startswith("..") and rel in readable:
                return rel
    wanted = [name.casefold() for name in names]
    found = [
        rel
        for rel in readable
        if any(
            rel.casefold() == each or rel.casefold().endswith("/" + each)
            for each in wanted
        )
    ]
    if not found:
        return None
    return min(
        found,
        key=lambda rel: (
            posixpath.dirname(rel) != folder,
            rel.count("/"),
            rel.casefold(),
        ),
    )


class NoteIndex:
    """Each note's title and outgoing links, read again only when its size or change
    time moves. Holds what the files say, never who may read them."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.notes: dict[Path, tuple[int, int, str, tuple[tuple[str, str], ...]]] = {}

    def entry(self, path: Path) -> tuple[str, tuple[tuple[str, str], ...]] | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        with self.lock:
            cached = self.notes.get(path)
        if cached and cached[:2] == (stat.st_mtime_ns, stat.st_size):
            return cached[2], cached[3]
        try:
            text = path.read_text("utf-8", errors="replace")
        except OSError:
            return None
        links = tuple(("wiki", target) for target in wiki_targets(text)) + tuple(
            ("md", target) for target in md_targets(text)
        )
        title = note_title(text, path)
        with self.lock:
            self.notes[path] = (stat.st_mtime_ns, stat.st_size, title, links)
        return title, links

    def backlinks(
        self, note_rel: str, readable: dict[str, Path], base: str
    ) -> list[dict[str, str]]:
        """{title, url} of each readable note other than note_rel that links to it."""
        found: list[tuple[str, str]] = []
        name = posixpath.basename(note_rel).casefold()
        for rel, path in readable.items():
            if rel == note_rel or not rel.lower().endswith(NOTE_SUFFIXES):
                continue
            entry = self.entry(path)
            if entry is None:
                continue
            title, links = entry
            for kind, target in links:
                if kind == "wiki":
                    if all(
                        posixpath.basename(each).casefold() != name
                        for each in wiki_names(target)
                    ):
                        continue
                    hit = resolve_wiki(target, rel, readable)
                else:
                    hit = href_note(target, rel, base)
                if hit == note_rel:
                    found.append((title, rel))
                    break
        found.sort(key=lambda item: (item[0].casefold(), item[1]))
        return [
            {"title": title, "url": note_url(base, rel)}
            for title, rel in found[:BACKLINKS_MAX]
        ]
