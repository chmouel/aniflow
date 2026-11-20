"""Line comments on a markdown file, kept in a JSON file beside it or in a cache.

Each comment quotes the lines it was written on, so it can follow them when the file
changes, or be marked outdated when they are gone.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
from collections.abc import Callable
from pathlib import Path
from urllib.parse import parse_qs

COMMENTS_MAX = 200
COMMENT_MAX_CHARS = 4000
COMMENT_MAX_LINES = 200
COMMENT_TARGET_MAX = 120
COMMENT_TARGET_KINDS = ("node", "edge", "diagram")
LOCK = threading.Lock()


def target_valid(target: object) -> bool:
    """A diagram comment's target: the box, arrow or whole diagram it is about."""
    return (
        isinstance(target, dict)
        and set(target) <= {"kind", "id", "label", "diagram"}
        and target.get("kind") in COMMENT_TARGET_KINDS
        and all(
            isinstance(target.get(key, ""), str)
            and len(target.get(key, "")) <= COMMENT_TARGET_MAX
            for key in ("id", "label")
        )
        and isinstance(target.get("diagram"), int)
        and not isinstance(target.get("diagram"), bool)
        and 1 <= target["diagram"] <= 999
    )


def entry_valid(entry: object) -> bool:
    return (
        isinstance(entry, dict)
        and ("target" not in entry or target_valid(entry["target"]))
        and isinstance(entry.get("id"), str)
        and isinstance(entry.get("body"), str)
        and isinstance(entry.get("author", ""), str)
        and isinstance(entry.get("author_id", 0), int)
        and ("parent" not in entry or isinstance(entry["parent"], str))
        and isinstance(entry.get("quote"), list)
        and all(isinstance(line, str) for line in entry["quote"])
        and all(
            isinstance(entry.get(key), int) and not isinstance(entry.get(key), bool)
            for key in ("start", "end")
        )
        and 1 <= entry["start"] <= entry["end"]
    )


def load(storage: Path) -> list[dict]:
    try:
        data = json.loads(storage.read_text("utf-8"))
    except (OSError, ValueError):
        return []
    return (
        [entry for entry in data if entry_valid(entry)]
        if isinstance(data, list)
        else []
    )


def save(
    storage: Path,
    entries: list[dict],
    *,
    create_parents: bool = True,
    allowed: Callable[[Path], bool] | None = None,
) -> None:
    """Write the comments, or remove the file when none are left.

    allowed is asked about the folder before anything is written there.
    """
    if not entries:
        storage.unlink(missing_ok=True)
        return
    storage.parent.mkdir(parents=create_parents, exist_ok=True)
    if storage.parent.is_symlink() or (allowed and not allowed(storage.parent)):
        raise OSError(f"{storage.parent} is not a place for comments")
    temporary = storage.with_name(f".{storage.name}.{secrets.token_hex(4)}.part")
    try:
        temporary.write_text(json.dumps(entries, indent=1), "utf-8")
        os.replace(temporary, storage)
    finally:
        temporary.unlink(missing_ok=True)


def markdown_lines(path: Path) -> list[str]:
    """Source lines as markdown-it numbers them."""
    text = path.read_text("utf-8", errors="replace")
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def anchor(entry: dict, lines: list[str]) -> dict:
    """Where the comment's quoted lines are now: same place, moved, or gone (outdated)."""
    start, end, quoted = entry["start"], entry["end"], entry["quote"]
    shown = {
        key: entry[key]
        for key in (
            "id",
            "body",
            "quote",
            "target",
            "created",
            "updated",
            "author",
            "author_id",
            "parent",
        )
        if key in entry
    }
    if lines[start - 1 : end] == quoted:
        return {**shown, "start": start, "end": end, "outdated": False}
    size = len(quoted)
    found = [
        index + 1
        for index in range(len(lines) - size + 1)
        if size and lines[index : index + size] == quoted
    ]
    if found:
        moved = min(found, key=lambda line: abs(line - start))
        return {**shown, "start": moved, "end": moved + size - 1, "outdated": False}
    last = max(1, len(lines))
    start = min(start, last)
    return {
        **shown,
        "start": start,
        "end": min(max(end, start), last),
        "outdated": True,
    }


def view(path: Path, storage: Path) -> dict[str, object]:
    lines = markdown_lines(path)
    with LOCK:
        entries = load(storage)
    comments = sorted(
        (anchor(entry, lines) for entry in entries),
        key=lambda comment: (
            comment["start"],
            comment["end"],
            comment.get("created", 0),
        ),
    )
    return {"name": path.name, "lines": len(lines), "comments": comments}


def prompt(view: dict, app: str = "aniflow") -> str:
    """The comments as one block of text to paste back to whoever wrote the file."""
    name = view["name"]
    if not view["comments"]:
        return f"No review comments on {name}.\n"
    parts = [f"Review comments on {name} ({app}):"]
    replies: dict[str, list[dict]] = {}
    roots = []
    for comment in view["comments"]:
        if parent := comment.get("parent"):
            replies.setdefault(parent, []).append(comment)
        else:
            roots.append(comment)
    for comment in roots:
        where = (
            str(comment["start"])
            if comment["start"] == comment["end"]
            else f"{comment['start']}-{comment['end']}"
        )
        head = f"{name}:{where}"
        if target := comment.get("target"):
            about = f"diagram {target['diagram']}"
            label = target.get("label") or target.get("id")
            if target["kind"] != "diagram" and label:
                kind = "box" if target["kind"] == "node" else "arrow"
                about += f", {kind} {json.dumps(label, ensure_ascii=False)}"
            head += f" ({about})"
        if comment["outdated"]:
            head += " (outdated: these lines changed since the comment)"
        quoted = "\n".join(f"> {line}".rstrip() for line in comment["quote"])
        block = f"{head}\n{quoted}\n{comment['body'].strip()}"
        for reply in sorted(
            replies.get(comment["id"], []), key=lambda r: r.get("created", 0)
        ):
            who = f"@{reply['author']}: " if reply.get("author") else ""
            block += f"\n  ↳ {who}{reply['body'].strip()}"
        parts.append(block)
    return "\n\n".join(parts) + "\n"


def in_lines(view: dict, query: str) -> dict:
    """With ?lines=A-B, only the comments that start inside those lines, as one diagram's fence."""
    wanted = (parse_qs(query).get("lines") or [""])[-1]
    match = re.fullmatch(r"(\d{1,7})-(\d{1,7})", wanted)
    if not match:
        return view
    first, last = int(match[1]), int(match[2])
    kept = [c for c in view["comments"] if first <= c["start"] <= last]
    return {**view, "comments": kept}


def change(
    path: Path,
    action: str,
    comment_id: str,
    data: object,
    storage: Path,
    *,
    author: str = "",
    author_id: int = 0,
    admin: bool = False,
    create_parents: bool = True,
    allowed: Callable[[Path], bool] | None = None,
) -> str | None:
    """Add, edit or delete a comment. Returns an error message, or None when done.

    author and author_id name who is asking: a comment belongs to the account that wrote
    it, and only that account, or admin, may change it afterwards."""
    if action != "delete":
        if not isinstance(data, dict) or not isinstance(data.get("body"), str):
            return "body must be a string"
        body = data["body"].strip()
        if not body:
            return "the comment is empty"
        if len(body) > COMMENT_MAX_CHARS:
            return f"comments are limited to {COMMENT_MAX_CHARS} characters"
    now = time.time()
    lines = markdown_lines(path)
    with LOCK:
        entries = load(storage)
        if action == "add":
            if len(entries) >= COMMENTS_MAX:
                return f"a file holds at most {COMMENTS_MAX} comments"
            parent_id = data.get("parent")
            if parent_id is not None:
                if not isinstance(parent_id, str) or not parent_id:
                    return "parent must be a comment id"
                parent = next(
                    (entry for entry in entries if entry["id"] == parent_id), None
                )
                if parent is None:
                    return "parent comment not found"
                if parent.get("parent"):
                    return "replies cannot be nested"
                entry = {
                    "id": secrets.token_hex(6),
                    "parent": parent_id,
                    "start": parent["start"],
                    "end": parent["end"],
                    "quote": list(parent["quote"]),
                    "body": body,
                    "created": now,
                    "updated": now,
                }
                if "target" in parent:
                    entry["target"] = parent["target"]
            else:
                start, end = data.get("start"), data.get("end", data.get("start"))
                if not all(
                    isinstance(value, int) and not isinstance(value, bool)
                    for value in (start, end)
                ):
                    return "start and end must be line numbers"
                if not 1 <= start <= end <= len(lines):
                    return f"lines must be between 1 and {len(lines)}"
                if end - start + 1 > COMMENT_MAX_LINES:
                    return f"a comment covers at most {COMMENT_MAX_LINES} lines"
                target = data.get("target")
                if target is not None and not target_valid(target):
                    return "target must name a node, edge or diagram"
                entry = {
                    "id": secrets.token_hex(6),
                    "start": start,
                    "end": end,
                    "quote": lines[start - 1 : end],
                    "body": body,
                    "created": now,
                    "updated": now,
                }
                if target is not None:
                    entry["target"] = target
            if author:
                entry["author"] = author
            if author_id:
                entry["author_id"] = author_id
            entries.append(entry)
        else:
            index = next(
                (
                    index
                    for index, entry in enumerate(entries)
                    if entry["id"] == comment_id
                ),
                None,
            )
            if index is None:
                return "not found"
            if not admin and entries[index].get("author_id", 0) != author_id:
                return "not yours"
            if action == "delete":
                removed = entries[index]["id"]
                entries = [
                    entry
                    for entry in entries
                    if entry["id"] != removed and entry.get("parent") != removed
                ]
            else:
                entries[index] = {**entries[index], "body": body, "updated": now}
        save(storage, entries, create_parents=create_parents, allowed=allowed)
    return None
