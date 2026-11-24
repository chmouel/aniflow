"""Which notes and folders are private, and the front matter line that says so.

Shared by the server, which decides who may read, and the client, which can upload a
note already marked.
"""

from __future__ import annotations

import re

# A folder holding this hidden file, and everything under it, is only for signed-in
# readers. A note says the same in its front matter with `private: true`.
PRIVATE_MARK = ".aniflow-private"
# A note at most this much is read to find its front matter; a block still open at that
# point makes the note private.
FRONT_MATTER_MAX = 8192
FRONT_OPEN = re.compile(r"\ufeff?---[ \t\r]*\Z")
FRONT_CLOSE = re.compile(r"(---|\.\.\.)[ \t\r]*\Z")
PRIVATE_LINE = re.compile(r"private[ \t]*:.*\Z", re.IGNORECASE)
PRIVATE_VALUE = re.compile(r"private[ \t]*:[ \t]*(.*)\Z", re.IGNORECASE)
PRIVATE_TRUTHY = {"true", "yes", "on", "1"}


def front_private(text: str) -> bool:
    """Whether the front matter says private: any top-level `private:` set to true, yes,
    on or 1 (quoted or not). An indented key belongs to another block and does not
    count. A block opened but not closed in text is read to its end, so a cut-off or
    overlong one errs on the private side."""
    lines = text.splitlines()
    if not lines or not FRONT_OPEN.match(lines[0]):
        return False
    for line in lines[1:]:
        if FRONT_CLOSE.match(line):
            break
        found = PRIVATE_VALUE.match(line)
        if found:
            value = found[1].split("#", 1)[0].strip().strip("\"'").strip().lower()
            if value in PRIVATE_TRUTHY:
                return True
    return False


def set_front_private(text: str, wanted: bool) -> str:
    """text with its front matter saying private, or no longer saying it: the line is
    added, replaced or dropped, and an emptied block goes with it."""
    lines = text.split("\n")
    closing = None
    if lines and FRONT_OPEN.match(lines[0]):
        for index in range(1, len(lines)):
            if FRONT_CLOSE.match(lines[index]):
                closing = index
                break
    if wanted:
        if closing is None:
            bom = "\ufeff" if text.startswith("\ufeff") else ""
            return bom + "---\nprivate: true\n---\n" + text.removeprefix(bom)
        for index in range(1, closing):
            if PRIVATE_LINE.match(lines[index]):
                lines[index] = "private: true"
                break
        else:
            lines.insert(1, "private: true")
        return "\n".join(lines)
    if closing is None:
        return text
    kept = [line for line in lines[1:closing] if not PRIVATE_LINE.match(line)]
    if len(kept) == closing - 1:
        return text
    if any(line.strip() and not line.lstrip().startswith("#") for line in kept):
        lines[1:closing] = kept
    else:
        bom = "\ufeff" if lines[0].startswith("\ufeff") else ""
        lines[0 : closing + 1] = []
        if bom and lines:
            lines[0] = bom + lines[0]
    return "\n".join(lines)
