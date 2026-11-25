import http.client
import json
import stat
import threading
import urllib.parse
from urllib.parse import urlsplit

import pytest

from aniflow import cli, client, oauth


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://share.chmouel.com/pub/", "https://share.chmouel.com/pub"),
        (
            "https://share.chmouel.com/pub/files/pac/design.md",
            "https://share.chmouel.com/pub",
        ),
        ("https://share.chmouel.com/pub/tokens", "https://share.chmouel.com/pub"),
        ("share.chmouel.com/pub/files/", "https://share.chmouel.com/pub"),
        ("localhost:8080/pub/files/a.md", "http://localhost:8080/pub"),
        ("http://127.0.0.1:8080/", "http://127.0.0.1:8080"),
    ],
)
def test_normalize_url_accepts_any_page_url(raw, expected):
    assert client.normalize_url(raw) == expected


def test_split_url_target_extracts_base_and_path():
    assert client.split_url_target(
        "https://share.chmouel.com/pub/files/pac/konflux%20plan.md"
    ) == ("https://share.chmouel.com/pub", "pac/konflux plan.md")
    assert client.split_url_target("pac/plan.md") is None


@pytest.fixture
def live_server(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "config"))
    root = tmp_path / "notes"
    (root / "pac").mkdir(parents=True)
    (root / "pac" / cli.SHARED_MARK).write_text("")
    (root / "pac" / "design.md").write_text("# Kueue design\n\nToken refresh plan.\n")
    (root / "pac" / ".secret.md").write_text("hidden secret\n")

    monkeypatch.setattr(oauth, "exchange", lambda code, *rest: "tok-" + code)
    monkeypatch.setattr(
        oauth,
        "user",
        lambda token: {"id": 42, "login": "alice", "name": "Alice"},
    )
    monkeypatch.setattr(cli.Handler, "log_message", lambda *a, **k: None)
    httpd = cli.Server(
        ("127.0.0.1", 0),
        root,
        base="/pub",
        signin=oauth.SignIn("cid", "csec", "skey", path="/pub/", admin="alice"),
        user_folders=True,
    )
    thread = threading.Thread(
        target=httpd.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
    )
    thread.start()
    host, port = httpd.server_address
    base_url = f"http://{host}:{port}/pub"

    # Sign in once via the OAuth flow to create alice's folder and mint an API token.
    def req(path, method="GET", headers=None, body=None):
        conn = http.client.HTTPConnection(host, port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        hdrs = {}
        for k, v in resp.getheaders():
            if k == "Set-Cookie":
                hdrs.setdefault("Set-Cookie", []).append(v)
            else:
                hdrs[k] = v
        data = resp.read()
        conn.close()
        return resp.status, hdrs, data

    _, hdrs, _ = req("/pub/auth/github/start?next=/pub/files/")
    state_cookie = next(
        c.split(";", 1)[0]
        for c in hdrs["Set-Cookie"]
        if c.startswith(oauth.STATE_COOKIE + "=")
    )
    state_val = urllib.parse.parse_qs(urlsplit(hdrs["Location"]).query)["state"][0]
    _, hdrs, _ = req(
        f"/pub/auth/github/callback?code=ok&state={state_val}",
        headers={"Cookie": state_cookie},
    )
    session_cookie = next(
        c.split(";", 1)[0]
        for c in hdrs["Set-Cookie"]
        if c.startswith(oauth.SESSION_COOKIE + "=")
    )
    _, _, data = req(
        "/pub/tokens/create",
        method="POST",
        headers={"Cookie": session_cookie, "Content-Type": "application/json"},
        body=json.dumps({"name": "cli-test"}),
    )
    token = json.loads(data)["token"]
    try:
        yield base_url, token, root
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


def test_client_end_to_end(live_server, tmp_path, capsys, monkeypatch):
    base_url, token, root = live_server

    # Login accepts a pasted deep note URL and saves 0600 config.
    assert (
        client.main(
            ["login", f"{base_url}/files/pac/design.md", "--token", token, "--json"]
        )
        == 0
    )
    out = json.loads(capsys.readouterr().out)
    assert (
        out["url"] == base_url
        and out["login"] == "alice"
        and out["folder"] == "users/alice"
    )
    assert "pac" in out["shared"]
    mode = stat.S_IMODE(client.config_path().stat().st_mode)
    assert mode == 0o600

    # --url works too, and without a URL argument nothing prompts.
    monkeypatch.setattr("builtins.input", lambda prompt: pytest.fail(prompt))
    assert client.main(["login", "--url", base_url, "--token", token, "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["url"] == base_url

    # whoami
    assert client.main(["whoami", "--json"]) == 0
    me = json.loads(capsys.readouterr().out)
    assert me["login"] == "alice" and me["admin"] is True

    # ls root and folder
    assert client.main(["ls", "/", "--json"]) == 0
    listing = json.loads(capsys.readouterr().out)
    names = {f["name"]: f["shared"] for f in listing["folders"]}
    assert names == {"pac": True}  # the users folder is never listed

    # push, pull, if-match, search, comments, rm
    local = tmp_path / "plan.md"
    local.write_text("# My Plan\n\nKueue integration steps.\n", encoding="utf-8")
    assert client.main(["push", str(local), "pac/plan.md", "--json"]) == 0
    pushed = json.loads(capsys.readouterr().out)
    assert pushed["path"] == "pac/plan.md" and pushed["status"] == 201
    assert pushed["view"] == f"{base_url}/files/pac/plan.md"

    # Pull by full pasted URL
    assert client.main(["pull", pushed["view"], "--json"]) == 0
    pulled = json.loads(capsys.readouterr().out)
    assert pulled["version"] == pushed["version"]
    assert "Kueue integration" in pulled["text"]

    # Update with matching --if-match succeeds; stale fails with 412.
    local.write_text("# My Plan v2\n\nUpdated.\n", encoding="utf-8")
    assert (
        client.main(
            [
                "push",
                str(local),
                "pac/plan.md",
                "--if-match",
                pulled["version"],
                "--json",
            ]
        )
        == 0
    )
    updated = json.loads(capsys.readouterr().out)
    assert updated["status"] == 200 and updated["version"] != pulled["version"]
    with pytest.raises(SystemExit, match="412"):
        client.main(
            ["push", str(local), "pac/plan.md", "--if-match", pulled["version"]]
        )

    # Search finds matches and never leaks hidden files.
    assert client.main(["search", "kueue", "--json"]) == 0
    found = json.loads(capsys.readouterr().out)
    assert [r["path"] for r in found["results"]] == ["pac/design.md"]
    assert client.main(["search", "hidden secret", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["results"] == []

    # Comments on a remote note
    assert client.main(["comments", pushed["view"]]) == 0
    assert "No review comments" in capsys.readouterr().out

    # Delete by full URL
    assert client.main(["rm", pushed["view"], "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["deleted"] is True
    assert not (root / "pac" / "plan.md").exists()


def test_skill_install_list_show_remove(tmp_path, capsys):
    target = tmp_path / "skills"
    assert client.main(["skill", "list", "--target", str(target), "--json"]) == 0
    listed = json.loads(capsys.readouterr().out)
    names = {s["name"] for s in listed["skills"]}
    assert {"aniflow-diagrams", "aniflow-notes"} <= names
    assert all(not s["installed"] for s in listed["skills"])

    assert client.main(["skill", "install", "--target", str(target), "--json"]) == 0
    capsys.readouterr()
    assert (target / "aniflow-notes" / "SKILL.md").is_file()
    assert (target / "aniflow-diagrams" / "SKILL.md").is_file()

    assert client.main(["skill", "show", "aniflow-notes"]) == 0
    assert "aniflow push" in capsys.readouterr().out

    assert (
        client.main(
            ["skill", "remove", "aniflow-notes", "--target", str(target), "--json"]
        )
        == 0
    )
    capsys.readouterr()
    assert not (target / "aniflow-notes").exists()

    # Existing symlinks are left untouched on install, and can still be removed explicitly.
    link = target / "aniflow-notes"
    link.symlink_to(tmp_path / "live-dev")
    assert (
        client.main(
            ["skill", "install", "aniflow-notes", "--target", str(target), "--json"]
        )
        == 0
    )
    res = json.loads(capsys.readouterr().out)
    assert res["installed"] == [] and res["skipped"][0]["name"] == "aniflow-notes"
    assert link.is_symlink()
    assert (
        client.main(["skill", "remove", "aniflow-notes", "--target", str(target)]) == 0
    )
    capsys.readouterr()
    assert not link.is_symlink()


def test_client_private_notes_and_folders(live_server, tmp_path, capsys):
    base_url, token, root = live_server
    login = ["--url", base_url, "--token", token]
    note = tmp_path / "plan.md"
    note.write_text("# Plan\n")

    assert (
        client.main(["push", str(note), "pac/plan.md", "--private", "--json", *login])
        == 0
    )
    assert json.loads(capsys.readouterr().out)["private"] is True
    assert (root / "pac" / "plan.md").read_text() == "---\nprivate: true\n---\n# Plan\n"

    assert client.main(["ls", "pac", *login]) == 0
    assert "pac/plan.md (private)" in capsys.readouterr().out

    # Pushing a copy without the line opens the note again, and says so.
    assert client.main(["push", str(note), "pac/plan.md", *login]) == 0
    assert "was private and is now public" in capsys.readouterr().err

    assert client.main(["private", "pac/plan.md", "--json", *login]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "path": "pac/plan.md",
        "private": True,
    }
    assert client.main(["private", "pac/plan.md", "--off", *login]) == 0
    assert capsys.readouterr().out.strip() == "pac/plan.md: public"

    assert client.main(["private", f"{base_url}/files/pac/", *login]) == 0
    assert (root / "pac" / cli.PRIVATE_MARK).is_file()
    assert client.main(["ls", "/", *login]) == 0
    assert "pac/ (shared, private)" in capsys.readouterr().out
    assert client.main(["private", "pac/design.md", "--off", *login]) == 0
    assert "still private" in capsys.readouterr().out
    assert client.main(["private", "pac", "--off", *login]) == 0
    assert not (root / "pac" / cli.PRIVATE_MARK).exists()
