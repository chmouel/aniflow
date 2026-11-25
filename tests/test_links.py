import json
import os
from pathlib import Path

import pytest

import test_cli
from aniflow import cli, links, oauth

CASES = json.loads(
    (
        Path(__file__).parent.parent / "js-test" / "fixtures" / "note-links.json"
    ).read_text()
)


@pytest.fixture
def aniflow_servers(tmp_path, monkeypatch):
    yield from test_cli.aniflow_servers.__wrapped__(tmp_path, monkeypatch)


@pytest.mark.parametrize(
    "case", CASES, ids=lambda case: f"{case['note']} {case['href']}"
)
def test_href_note_matches_the_reader(case):
    assert (
        links.href_note(case["href"], case["note"], case.get("base", ""))
        == case["expect"]
    )


def test_link_targets_skip_code():
    text = "[[A]] `[[B]]` [c](c.md)\n\n```\n[[D]] [e](e.md)\n```\n![[p.png|300]] [[F#h|l]]\n"
    assert links.wiki_targets(text) == ["A", "p.png", "F"]
    assert links.md_targets(text) == ["c.md"]


def test_resolve_wiki_order():
    readable = {
        rel: Path(rel)
        for rel in (
            "a/Topic.md",
            "b/Topic.md",
            "Root.md",
            "a/Root.md",
            "deep/x/y/Far.md",
            "z/Far.md",
            "a/images/flow.png",
        )
    }
    assert links.resolve_wiki("Topic", "a/n.md", readable) == "a/Topic.md"
    assert links.resolve_wiki("Topic", "b/n.md", readable) == "b/Topic.md"
    assert links.resolve_wiki("Topic", "c/n.md", readable) == "a/Topic.md"
    assert links.resolve_wiki("b/Topic", "a/n.md", readable) == "b/Topic.md"
    assert links.resolve_wiki("Root", "c/n.md", readable) == "Root.md"
    assert links.resolve_wiki("root", "c/n.md", readable) == "Root.md"
    assert links.resolve_wiki("Far", "c/n.md", readable) == "z/Far.md"
    assert links.resolve_wiki("flow.png", "a/n.md", readable) == "a/images/flow.png"
    assert links.resolve_wiki("../x/Topic", "a/n.md", readable) is None
    assert links.resolve_wiki("Missing", "a/n.md", readable) is None
    readable["c/Long.markdown"] = Path("c/Long.markdown")
    assert links.resolve_wiki("Long", "a/n.md", readable) == "c/Long.markdown"
    readable["Near.md"] = Path("Near.md")
    readable["a/Near.markdown"] = Path("a/Near.markdown")
    assert links.resolve_wiki("Near", "a/n.md", readable) == "a/Near.markdown"


def test_note_index_reads_again_when_a_note_changes(tmp_path):
    (tmp_path / "Topic.md").write_text("# Topic\n")
    other = tmp_path / "other.md"
    other.write_text("# Other\n")
    readable = {"Topic.md": tmp_path / "Topic.md", "other.md": other}
    index = links.NoteIndex()
    assert index.backlinks("Topic.md", readable, "") == []
    other.write_text("# Other\n\nSee [[Topic]].\n")
    stat = other.stat()
    os.utime(other, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10**9))
    assert index.backlinks("Topic.md", readable, "/pub") == [
        {"title": "Other", "url": "/pub/files/other.md"}
    ]


def test_note_options_respect_privacy(tmp_path, aniflow_servers):
    root = tmp_path / "docs"
    (root / "guide").mkdir(parents=True)
    (root / "guide" / "Topic.md").write_text(
        "# Topic\n\n[[Secret]] [[Plan]] [[Nope]]\n"
    )
    (root / "guide" / "Open.md").write_text("# Open\n\n[back](Topic.md)\n")
    (root / "guide" / "Broken.md").write_text("# Broken\n\n[x](< //[>)\n")
    (root / "Secret.md").write_text("---\nprivate: true\n---\n# Secret\n\n[[Topic]]\n")
    alice = root / "users" / "alice"
    alice.mkdir(parents=True)
    (alice / "Plan.md").write_text("# Alice plan\n\n[[Topic]]\n")
    request = aniflow_servers(
        root, signin=oauth.SignIn("id", "secret", "key"), user_folders=True
    )

    def options(login=None):
        headers = {}
        if login:
            sealed = oauth.seal({"id": 1, "login": login, "exp": 9999999999}, "key")
            headers["Cookie"] = f"{oauth.SESSION_COOKIE}={sealed}"
        status, _, body = request("/files/guide/Topic.md", headers=headers)
        assert status == 200
        return test_cli.json_block(body, "aniflow-options")

    anonymous = options()
    assert anonymous["wikilinks"] == {}
    assert anonymous["backlinks"] == [{"title": "Open", "url": "/files/guide/Open.md"}]
    assert anonymous["modified"].endswith("Z") or "+00:00" in anonymous["modified"]
    bob = options("bob")
    assert bob["wikilinks"] == {"Secret": "/files/Secret.md"}
    assert [link["title"] for link in bob["backlinks"]] == ["Open", "Secret"]
    mine = options("alice")
    assert mine["wikilinks"]["Plan"] == "/files/users/alice/Plan.md"
    assert [link["title"] for link in mine["backlinks"]] == [
        "Alice plan",
        "Open",
        "Secret",
    ]


def test_markdown_help_and_plugins_are_served(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs)
    status, _, body = request("/help/markdown")
    assert status == 200 and b"Markdown in aniflow" in body
    status, headers, body = request("/help/markdown?raw")
    assert status == 200 and headers["Content-Type"].startswith("text/plain")
    assert b"[[" in body
    for name in ("mark", "sub", "sup", "deflist"):
        assert request(f"/vendor/markdown-it-{name}.min.js")[0] == 200


@pytest.fixture
def local_docs(tmp_path):
    return test_cli.local_docs.__wrapped__(tmp_path)


def test_markdown_prints_reference_without_serving(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aniflow", "--markdown"])
    monkeypatch.setattr(cli, "Server", lambda *a, **k: pytest.fail("served"))
    cli.main()
    assert "[[" in capsys.readouterr().out
