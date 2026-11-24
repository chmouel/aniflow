"""Remote CLI client and agent skill manager for aniflow.

Talks to an aniflow server over HTTP using an API token saved by `aniflow login`
(or ANIFLOW_URL / ANIFLOW_TOKEN in the environment). Stdlib only.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from aniflow.privacy import set_front_private

COMMANDS = frozenset(
    {
        "login",
        "whoami",
        "ls",
        "search",
        "push",
        "pull",
        "rm",
        "private",
        "comments",
        "skill",
    }
)
TIMEOUT = 30
AGENT = "aniflow-cli"


def config_path() -> Path:
    base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "aniflow" / "config.json"


def load_config() -> dict[str, str]:
    path = config_path()
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    return (
        {k: str(v) for k, v in data.items() if isinstance(v, str)}
        if isinstance(data, dict)
        else {}
    )


def save_config(data: dict[str, str]) -> Path:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
    os.replace(tmp, path)
    return path


def normalize_url(raw: str) -> str:
    """Turn any pasted aniflow URL (a note, /files/, /tokens, bare host) into the server base."""
    value = raw.strip()
    if not value:
        return ""
    if "://" not in value:
        host = value.split("/", 1)[0].split(":", 1)[0].lower()
        scheme = "http" if host in ("localhost", "127.0.0.1", "::1") else "https"
        value = f"{scheme}://{value}"
    parts = urllib.parse.urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(f"not a valid server URL: {raw!r}")
    path = parts.path.rstrip("/")
    for marker in ("/files", "/tokens", "/api", "/help", "/auth", "/comments"):
        idx = path.find(marker)
        if idx != -1 and (
            idx + len(marker) == len(path) or path[idx + len(marker)] == "/"
        ):
            path = path[:idx]
            break
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, path.rstrip("/"), "", "")
    )


def settings(args: argparse.Namespace) -> tuple[str, str, str]:
    """Effective (url, token, folder) from flags -> env -> saved config."""
    saved = load_config()
    url = (
        getattr(args, "url", "")
        or os.environ.get("ANIFLOW_URL", "")
        or saved.get("url", "")
    )
    token = (
        getattr(args, "token", "")
        or os.environ.get("ANIFLOW_TOKEN", "")
        or saved.get("token", "")
    )
    folder = (
        getattr(args, "folder", "")
        or os.environ.get("ANIFLOW_FOLDER", "")
        or saved.get("folder", "")
    )
    return (normalize_url(url) if url else ""), token.strip(), folder.strip("/")


def request(
    method: str,
    url: str,
    *,
    token: str = "",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    sent = {"User-Agent": AGENT, **(headers or {})}
    if token:
        sent["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=sent, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return (
                resp.status,
                {k.lower(): v for k, v in resp.headers.items()},
                resp.read(),
            )
    except urllib.error.HTTPError as error:
        data = error.read()
        msg = data.decode("utf-8", errors="replace").strip()
        try:
            parsed = json.loads(data)
            if isinstance(parsed, dict) and parsed.get("error"):
                msg = str(parsed["error"])
        except ValueError:
            pass
        raise SystemExit(f"aniflow: {error.code} {msg or error.reason}") from None
    except urllib.error.URLError as error:
        raise SystemExit(f"aniflow: could not reach {url}: {error.reason}") from None


def need_url(url: str) -> str:
    if not url:
        raise SystemExit(
            "aniflow: no server configured — run `aniflow login` or set ANIFLOW_URL"
        )
    return url


def need_token(token: str) -> str:
    if not token:
        raise SystemExit(
            "aniflow: no API token — run `aniflow login` or set ANIFLOW_TOKEN"
        )
    return token


def split_url_target(raw: str) -> tuple[str, str] | None:
    """If raw is a full aniflow URL pointing at a note or folder, return (base_url, path)."""
    value = raw.strip()
    if not value.startswith(("http://", "https://")):
        return None
    parts = urllib.parse.urlsplit(value)
    if not parts.netloc:
        return None
    path = parts.path
    for marker in ("/files/", "/api/notes/"):
        idx = path.find(marker)
        if idx != -1:
            base = urllib.parse.urlunsplit(
                (parts.scheme, parts.netloc, path[:idx].rstrip("/"), "", "")
            )
            rel = urllib.parse.unquote(path[idx + len(marker) :])
            return base, rel
    return normalize_url(value), ""


def resolve_remote(target: str, folder: str, local_name: str = "") -> str:
    """Turn a shorthand remote name into <folder>/<name>.md."""
    cleaned = target.strip().lstrip("/")
    if not cleaned:
        if not local_name:
            raise SystemExit("aniflow: specify a remote path (e.g. folder/note.md)")
        cleaned = f"{folder}/{local_name}" if folder else local_name
    elif cleaned.endswith("/"):
        if not local_name:
            raise SystemExit("aniflow: specify a filename")
        cleaned = cleaned + local_name
    elif "/" not in cleaned and folder:
        cleaned = f"{folder}/{cleaned}"
    if not cleaned.lower().endswith((".md", ".markdown")):
        cleaned += ".md"
    return cleaned


def web_url(base_url: str, remote_path: str) -> str:
    encoded = "/".join(urllib.parse.quote(part) for part in remote_path.split("/"))
    return f"{base_url}/files/{encoded}"


def cmd_login(args: argparse.Namespace) -> int:
    saved = load_config()
    raw_url = args.server or args.url or ""
    if not raw_url:
        default = saved.get("url", "")
        prompt = (
            f"Server URL [{default}]: "
            if default
            else "Server URL (e.g. https://share.chmouel.com/pub): "
        )
        try:
            raw_url = input(prompt).strip() or default
        except EOFError:
            raw_url = default
    try:
        url = normalize_url(raw_url)
    except ValueError as error:
        raise SystemExit(f"aniflow: {error}") from None
    if not url:
        raise SystemExit("aniflow: server URL is required")

    token = (args.token or "").strip()
    if not token:
        print(f"Create a token at {url}/tokens", file=sys.stderr)
        try:
            token = getpass.getpass("API token: ").strip()
        except EOFError:
            token = ""
    if not token:
        raise SystemExit("aniflow: API token is required")

    _, _, data = request("GET", f"{url}/api/me", token=token)
    me = json.loads(data)
    folder = (args.folder or me.get("folder") or "").strip("/")
    path = save_config({"url": url, "token": token, "folder": folder})
    if args.json:
        print(
            json.dumps(
                {
                    "url": url,
                    "login": me["login"],
                    "folder": folder,
                    "shared": me.get("shared", []),
                    "config": str(path),
                }
            )
        )
    else:
        shared = ", ".join(me.get("shared", [])) or "none"
        print(f"Signed in as {me['login']} at {url}")
        print(f"Default folder: {folder}/  (shared: {shared})")
        print(f"Saved to {path}")
    return 0


def cmd_whoami(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    url, token = need_url(url), need_token(token)
    _, _, data = request("GET", f"{url}/api/me", token=token)
    me = json.loads(data)
    out = {"url": url, "default_folder": folder or me.get("folder", ""), **me}
    if args.json:
        print(json.dumps(out))
    else:
        shared = ", ".join(me.get("shared", [])) or "none"
        role = " (admin)" if me.get("admin") else ""
        print(f"{me['login']}{role} @ {url}")
        print(f"folder: {out['default_folder']}/  shared: {shared}")
    return 0


def cmd_ls(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    target = args.path if args.path is not None else folder
    if target and (parsed := split_url_target(target)):
        url, target = parsed[0] or url, parsed[1]
    url = need_url(url)
    target = target.strip("/")
    encoded = (
        "/".join(urllib.parse.quote(part) for part in target.split("/"))
        if target
        else ""
    )
    endpoint = f"{url}/api/notes/{encoded}" if encoded else f"{url}/api/notes"
    _, _, data = request("GET", endpoint, token=token)
    listing = json.loads(data)
    if args.json:
        print(json.dumps(listing))
        return 0
    for item in listing.get("folders", []):
        tags = [name for name in ("shared", "private") if item.get(name)]
        tag = f" ({', '.join(tags)})" if tags else ""
        print(f"{item['path']}/{tag}")
    for item in listing.get("notes", []):
        print(f"{item['path']}{' (private)' if item.get('private') else ''}")
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    url, token, _ = settings(args)
    url = need_url(url)
    params = {"q": args.query}
    if args.folder:
        params["folder"] = args.folder.strip("/")
    endpoint = f"{url}/api/search?{urllib.parse.urlencode(params)}"
    _, _, data = request("GET", endpoint, token=token)
    answer = json.loads(data)
    if args.json:
        print(json.dumps(answer))
        return 0
    results = answer.get("results", [])
    if not results:
        print("No matches.", file=sys.stderr)
        return 0
    for item in results:
        print(item["path"])
        for match in item.get("matches", []):
            print(f"  {match['line']}: {match['text']}")
    return 0


def cmd_push(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    raw_remote = args.remote or ""
    if raw_remote and (parsed := split_url_target(raw_remote)):
        url, raw_remote = parsed[0] or url, parsed[1]
    url, token = need_url(url), need_token(token)
    if args.file == "-":
        raw = sys.stdin.buffer.read()
        local_name = ""
    else:
        src = Path(args.file)
        if not src.is_file():
            raise SystemExit(f"aniflow: not a file: {args.file}")
        raw = src.read_bytes()
        local_name = src.name
    if args.private:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise SystemExit("aniflow: --private needs a UTF-8 note") from None
        raw = set_front_private(text, True).encode("utf-8")
    remote = resolve_remote(raw_remote, folder, local_name)
    encoded = "/".join(urllib.parse.quote(part) for part in remote.split("/"))
    headers = {"Content-Type": "text/markdown; charset=utf-8"}
    if args.if_match:
        headers["If-Match"] = args.if_match
    status, _, data = request(
        "PUT", f"{url}/api/notes/{encoded}", token=token, body=raw, headers=headers
    )
    answer = json.loads(data)
    out = {
        "path": remote,
        "status": status,
        "version": answer.get("version", ""),
        "view": web_url(url, remote),
        "private": bool(answer.get("private")),
    }
    if answer.get("was_private") and not out["private"]:
        print(
            f"aniflow: warning: {remote} was private and is now public; push it with "
            "--private to keep it hidden",
            file=sys.stderr,
        )
    if args.json:
        print(json.dumps(out))
    else:
        print(out["view"])
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    raw_remote = args.remote
    if parsed := split_url_target(raw_remote):
        url, raw_remote = parsed[0] or url, parsed[1]
    url = need_url(url)
    remote = resolve_remote(raw_remote, folder)
    encoded = "/".join(urllib.parse.quote(part) for part in remote.split("/"))
    _, headers, data = request("GET", f"{url}/api/notes/{encoded}", token=token)
    version = headers.get("etag", "").strip('"')
    if args.json:
        print(
            json.dumps(
                {
                    "path": remote,
                    "version": version,
                    "view": web_url(url, remote),
                    "text": data.decode("utf-8", errors="replace"),
                }
            )
        )
        return 0
    if not args.dest or args.dest == "-":
        sys.stdout.buffer.write(data)
    else:
        dest = Path(args.dest)
        if dest.is_dir():
            dest = dest / Path(remote).name
        dest.write_bytes(data)
        print(f"Wrote {dest}", file=sys.stderr)
    return 0


def cmd_rm(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    raw_remote = args.remote
    if parsed := split_url_target(raw_remote):
        url, raw_remote = parsed[0] or url, parsed[1]
    url, token = need_url(url), need_token(token)
    remote = resolve_remote(raw_remote, folder)
    encoded = "/".join(urllib.parse.quote(part) for part in remote.split("/"))
    headers = {"If-Match": args.if_match} if args.if_match else {}
    request("DELETE", f"{url}/api/notes/{encoded}", token=token, headers=headers)
    if args.json:
        print(json.dumps({"deleted": True, "path": remote}))
    else:
        print(f"Deleted {remote}")
    return 0


def cmd_private(args: argparse.Namespace) -> int:
    """Hide a note or folder from readers who are not signed in, or open it again."""
    url, token, folder = settings(args)
    raw_remote = args.remote
    if parsed := split_url_target(raw_remote):
        url, raw_remote = parsed[0] or url, parsed[1]
    url, token = need_url(url), need_token(token)
    if raw_remote.strip().lower().endswith((".md", ".markdown")):
        remote = resolve_remote(raw_remote, folder)
    else:
        remote = raw_remote.strip().strip("/")
        if not remote:
            raise SystemExit("aniflow: the top folder cannot be made private from here")
    encoded = "/".join(urllib.parse.quote(part) for part in remote.split("/"))
    wanted = not args.off
    _, _, data = request(
        "POST",
        f"{url}/notes/private/{encoded}",
        token=token,
        body=json.dumps({"private": wanted}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    answer = json.loads(data)
    out = {"path": remote, "private": bool(answer.get("private"))}
    if args.json:
        print(json.dumps(out))
    elif out["private"] == wanted:
        print(f"{remote}: {'private' if wanted else 'public'}")
    else:
        print(f"{remote}: still private (a folder above it is private)")
    return 0


def cmd_comments(args: argparse.Namespace) -> int:
    url, token, folder = settings(args)
    raw_remote = args.remote
    if parsed := split_url_target(raw_remote):
        url, raw_remote = parsed[0] or url, parsed[1]
    url = need_url(url)
    remote = resolve_remote(raw_remote, folder)
    encoded = "/".join(urllib.parse.quote(part) for part in remote.split("/"))
    suffix = "" if args.json else "?format=prompt"
    _, _, data = request("GET", f"{url}/comments/file/{encoded}{suffix}", token=token)
    sys.stdout.buffer.write(data)
    return 0


# --- Skill management ---


def bundled_skills_dir() -> Path:
    """Where the packaged skills live: inside the package (wheel) or repo root (editable)."""
    inside = Path(__file__).resolve().parent / "skills"
    if inside.is_dir():
        return inside
    repo = Path(__file__).resolve().parents[2] / "skills"
    if repo.is_dir():
        return repo
    raise SystemExit("aniflow: bundled skills directory not found")


def bundled_skills() -> dict[str, Path]:
    root = bundled_skills_dir()
    return {
        child.name: child
        for child in sorted(root.iterdir())
        if child.is_dir() and (child / "SKILL.md").is_file()
    }


def skill_target(args: argparse.Namespace) -> Path:
    if getattr(args, "target", ""):
        return Path(args.target).expanduser()
    if getattr(args, "claude", False):
        return Path.home() / ".claude" / "skills"
    if getattr(args, "project", False):
        return Path.cwd() / ".agents" / "skills"
    return Path.home() / ".agents" / "skills"


def cmd_skill(args: argparse.Namespace) -> int:
    available = bundled_skills()
    dest_root = skill_target(args)
    if args.skill_action == "list":
        rows = [
            {
                "name": name,
                "installed": (dest_root / name / "SKILL.md").is_file(),
                "path": str(dest_root / name),
            }
            for name in available
        ]
        if args.json:
            print(json.dumps({"target": str(dest_root), "skills": rows}))
        else:
            for row in rows:
                state = "installed" if row["installed"] else "not installed"
                print(f"{row['name']:20s} {state}  ({row['path']})")
        return 0
    if args.skill_action == "show":
        if args.name not in available:
            raise SystemExit(
                f"aniflow: unknown skill {args.name!r} (available: {', '.join(available)})"
            )
        sys.stdout.write((available[args.name] / "SKILL.md").read_text("utf-8"))
        return 0
    if args.skill_action == "install":
        wanted = args.names or list(available)
        for name in wanted:
            if name not in available:
                raise SystemExit(
                    f"aniflow: unknown skill {name!r} (available: {', '.join(available)})"
                )
        dest_root.mkdir(parents=True, exist_ok=True)
        installed, skipped = [], []
        for name in wanted:
            dest = dest_root / name
            if dest.is_symlink():
                skipped.append({"name": name, "path": str(dest), "reason": "symlink"})
                continue
            if dest.is_file():
                dest.unlink()
            elif dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(available[name], dest)
            installed.append({"name": name, "path": str(dest)})
        if args.json:
            print(json.dumps({"installed": installed, "skipped": skipped}))
        else:
            for item in installed:
                print(f"Installed {item['name']} -> {item['path']}")
            for item in skipped:
                print(f"Skipped {item['name']} -> {item['path']} ({item['reason']})")
        return 0
    if args.skill_action == "remove":
        dest = dest_root / args.name
        if not dest.exists() and not dest.is_symlink():
            raise SystemExit(f"aniflow: {args.name} is not installed in {dest_root}")
        if dest.is_symlink() or dest.is_file():
            dest.unlink()
        else:
            shutil.rmtree(dest)
        if args.json:
            print(json.dumps({"removed": args.name, "path": str(dest)}))
        else:
            print(f"Removed {dest}")
        return 0
    return 1


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--url", default="", help="server base URL (or ANIFLOW_URL)")
    common.add_argument("--token", default="", help="API token (or ANIFLOW_TOKEN)")
    common.add_argument(
        "--json", action="store_true", help="machine-readable JSON output"
    )

    parser = argparse.ArgumentParser(
        prog="aniflow",
        description="Remote client and skill manager for aniflow.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("login", parents=[common], help="sign in with an API token")
    p.add_argument(
        "server",
        nargs="?",
        default="",
        metavar="url",
        help="server URL (any page URL works)",
    )
    p.add_argument("--folder", default="", help="default remote folder")
    p.set_defaults(func=cmd_login)

    p = sub.add_parser(
        "whoami", parents=[common], help="show the signed-in account and folders"
    )
    p.set_defaults(func=cmd_whoami)

    p = sub.add_parser(
        "ls", parents=[common], help="list folders and notes on the server"
    )
    p.add_argument(
        "path",
        nargs="?",
        default=None,
        help="folder to list (default: your folder; / for root)",
    )
    p.set_defaults(func=cmd_ls)

    p = sub.add_parser(
        "search", parents=[common], help="search notes by filename or content"
    )
    p.add_argument("query", help="text to search for")
    p.add_argument("folder", nargs="?", default="", help="limit search to one folder")
    p.set_defaults(func=cmd_search)

    p = sub.add_parser(
        "push", parents=[common], help="upload or update a note (use - for stdin)"
    )
    p.add_argument("file", help="local Markdown file, or - to read from stdin")
    p.add_argument(
        "remote", nargs="?", default="", help="remote path, e.g. plan.md or pac/plan.md"
    )
    p.add_argument(
        "--if-match", default="", help="ETag/version to guard against overwriting"
    )
    p.add_argument(
        "--private",
        action="store_true",
        help="mark the note private (front matter private: true): signed-in readers only",
    )
    p.set_defaults(func=cmd_push)

    p = sub.add_parser(
        "pull", parents=[common], help="download a note (stdout by default)"
    )
    p.add_argument("remote", help="remote path, e.g. plan.md or pac/plan.md")
    p.add_argument(
        "dest", nargs="?", default="", help="file or folder to write (default: stdout)"
    )
    p.set_defaults(func=cmd_pull)

    p = sub.add_parser("rm", parents=[common], help="delete a remote note")
    p.add_argument("remote", help="remote path, e.g. plan.md or pac/plan.md")
    p.add_argument(
        "--if-match",
        default="",
        help="ETag/version to guard against deleting a changed note",
    )
    p.set_defaults(func=cmd_rm)

    p = sub.add_parser(
        "private",
        parents=[common],
        help="make a note or folder private (signed-in readers only), or --off to open it",
    )
    p.add_argument("remote", help="note (pac/plan.md) or folder (pac/team) to change")
    p.add_argument("--off", action="store_true", help="make it public again")
    p.set_defaults(func=cmd_private)

    p = sub.add_parser(
        "comments", parents=[common], help="read review comments on a remote note"
    )
    p.add_argument("remote", help="remote path, e.g. plan.md or pac/plan.md")
    p.set_defaults(func=cmd_comments)

    skill_common = argparse.ArgumentParser(add_help=False)
    skill_common.add_argument(
        "--target", default="", help="install directory (default: ~/.agents/skills)"
    )
    skill_common.add_argument(
        "--claude", action="store_true", help="use ~/.claude/skills"
    )
    skill_common.add_argument(
        "--project", action="store_true", help="use ./.agents/skills"
    )
    skill_common.add_argument(
        "--json", action="store_true", help="machine-readable JSON output"
    )

    sk = sub.add_parser("skill", help="manage bundled agent skills")
    sk_sub = sk.add_subparsers(dest="skill_action", required=True)
    sk_sub.add_parser(
        "list", parents=[skill_common], help="list bundled skills"
    ).set_defaults(func=cmd_skill)
    p = sk_sub.add_parser(
        "install", parents=[skill_common], help="install or update bundled skills"
    )
    p.add_argument("names", nargs="*", help="skill names (default: all)")
    p.set_defaults(func=cmd_skill)
    p = sk_sub.add_parser("show", help="print a bundled skill's SKILL.md")
    p.add_argument("name", help="skill name")
    p.set_defaults(func=cmd_skill, json=False)
    p = sk_sub.add_parser(
        "remove", parents=[skill_common], help="remove an installed skill"
    )
    p.add_argument("name", help="skill name")
    p.set_defaults(func=cmd_skill)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
