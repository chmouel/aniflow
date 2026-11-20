"""Personal API tokens: made in the web UI, shown once, and kept only as a hash.

A token stands for the member who made it, with that member's rights and nothing more:
who is admin is decided by the server's configuration at each request, never stored.
"""

from __future__ import annotations

import contextlib
import hashlib
import secrets
import sqlite3
import threading
import time
from pathlib import Path

PREFIX = "aniflow_"
LIFETIME = 90 * 86400
MAX_PER_USER = 10
NAME_MAX = 60
# One process serves the site, so this serializes the count and the insert of create().
LOCK = threading.Lock()
SCHEMA = """CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  login TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created REAL NOT NULL,
  expires REAL NOT NULL,
  last_used REAL
)"""


def digest(token: str) -> str:
    """The stored form. The token holds 256 random bits, so a plain hash is enough."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Tokens:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db, db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(SCHEMA)

    def connect(self) -> contextlib.closing[sqlite3.Connection]:
        return contextlib.closing(sqlite3.connect(self.path, timeout=10))

    def create(self, user_id: int, login: str, name: str) -> dict | str:
        """A new token, returned in clear this once, or why it was refused."""
        name = " ".join(name.split())
        if not name or len(name) > NAME_MAX:
            return f"give the token a name of 1 to {NAME_MAX} characters"
        token = PREFIX + secrets.token_urlsafe(32)
        now = time.time()
        row = {
            "id": secrets.token_hex(8),
            "name": name,
            "created": now,
            "expires": now + LIFETIME,
            "last_used": None,
        }
        with LOCK, self.connect() as db, db:
            (live,) = db.execute(
                "SELECT COUNT(*) FROM tokens WHERE user_id = ? AND expires > ?",
                (user_id, now),
            ).fetchone()
            if live >= MAX_PER_USER:
                return f"you already have {MAX_PER_USER} tokens: revoke one first"
            db.execute(
                "INSERT INTO tokens VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                (row["id"], digest(token), login, user_id, name, now, row["expires"]),
            )
        return {**row, "token": token}

    def mine(self, user_id: int) -> list[dict]:
        """The member's tokens still alive, newest first, without their secret."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT id, name, created, expires, last_used FROM tokens "
                "WHERE user_id = ? AND expires > ? ORDER BY created DESC",
                (user_id, time.time()),
            ).fetchall()
        keys = ("id", "name", "created", "expires", "last_used")
        return [dict(zip(keys, row, strict=True)) for row in rows]

    def revoke(self, user_id: int, token_id: str) -> bool:
        with self.connect() as db, db:
            return (
                db.execute(
                    "DELETE FROM tokens WHERE id = ? AND user_id = ?",
                    (token_id, user_id),
                ).rowcount
                > 0
            )

    def revoke_member(self, who: str) -> int:
        """Every token of a member, by GitHub login or numeric id (a login can change)."""
        with self.connect() as db, db:
            if who.isdigit():
                cursor = db.execute("DELETE FROM tokens WHERE user_id = ?", (int(who),))
            else:
                cursor = db.execute(
                    "DELETE FROM tokens WHERE lower(login) = ?",
                    (who.lstrip("@").lower(),),
                )
            return cursor.rowcount

    def check(self, token: str) -> dict | None:
        """Who a token stands for, when it is one of ours and alive; notes it was used."""
        if not token.startswith(PREFIX):
            return None
        now = time.time()
        with self.connect() as db, db:
            row = db.execute(
                "SELECT id, login, user_id FROM tokens WHERE hash = ? AND expires > ?",
                (digest(token), now),
            ).fetchone()
            if row is None:
                return None
            db.execute("UPDATE tokens SET last_used = ? WHERE id = ?", (now, row[0]))
        return {"id": row[2], "login": row[1], "token": row[0]}
