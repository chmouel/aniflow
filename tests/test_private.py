import json

import pytest

import test_cli
from aniflow import cli, oauth, tokens


@pytest.fixture
def local_docs(tmp_path):
    return test_cli.local_docs.__wrapped__(tmp_path)


@pytest.fixture
def aniflow_servers(tmp_path, monkeypatch):
    yield from test_cli.aniflow_servers.__wrapped__(tmp_path, monkeypatch)


@pytest.mark.parametrize("value", ["true", "yes", "ON", "1", '"true"', "'yes'"])
def test_private_front_matter(value):
    assert cli.front_private(f"---\nprivate: {value}\n---\n# Secret")


@pytest.mark.parametrize(
    "source",
    [
        "---\nprivate: false\n---\n",
        "---\nprivate: off\n---\n",
        "---\n  private: true\n---\n",
        "\n---\nprivate: true\n---\n",
        "---\nprivate: true\n",
        "# Public\nprivate: true\n",
    ],
)
def test_public_front_matter(source):
    assert not cli.front_private(source)


def test_private_reads_and_gate(local_docs, aniflow_servers):
    note = local_docs / "guides" / "secret.md"
    note.write_text("---\nprivate: true\n---\nCONFIDENTIAL\n")
    request = aniflow_servers(local_docs, signin=oauth.SignIn("id", "secret", "key"))
    status, headers, body = request("/files/guides/secret.md")
    assert status == 401
    assert headers["Cache-Control"] == "no-store"
    assert b"You shall not pass" in body
    assert b"Sign in with GitHub" in body
    assert b"CONFIDENTIAL" not in body
    assert b"secret.md</title>" not in body
    assert b"secret.md" not in request("/files/guides/")[2]
    for path in ("/files/guides/secret.md?raw", "/comments/file/guides/secret.md"):
        assert request(path)[0] == 404
    assert not json.loads(request("/api/search?q=CONFIDENTIAL")[2])["results"]
    cookie = oauth.seal({"id": 1, "login": "alice", "exp": 9999999999}, "key")
    assert (
        request(
            "/files/guides/secret.md",
            headers={"Cookie": f"{oauth.SESSION_COOKIE}={cookie}"},
        )[0]
        == 200
    )


def test_private_folder_and_alias(local_docs, aniflow_servers):
    folder = local_docs / "guides"
    (folder / cli.PRIVATE_MARK).touch()
    (folder / "image.png").write_bytes(b"private image")
    (local_docs / "alias").symlink_to(folder, target_is_directory=True)
    request = aniflow_servers(local_docs)
    for path in ("/files/guides/", "/files/guides", "/files/alias/start.md"):
        assert request(path)[0] == 401
    assert request("/files/guides/image.png")[0] == 404
    assert b"guides" not in request("/files/")[2]
    assert b"alias" not in request("/files/")[2]


def test_private_toggles(local_docs, aniflow_servers):
    folder = local_docs / "alice"
    folder.mkdir()
    note = folder / "note.md"
    note.write_text("# Note\n")
    request = aniflow_servers(
        local_docs, signin=oauth.SignIn("id", "secret", "key"), user_folders=True
    )
    cookie = oauth.seal({"id": 1, "login": "alice", "exp": 9999999999}, "key")
    headers = {
        "Cookie": f"{oauth.SESSION_COOKIE}={cookie}",
        "Content-Type": "application/json",
    }
    url = "/notes/private/alice/note.md"
    assert request(url, "POST", body='{"private":true}')[0] == 401
    for wanted in (True, False):
        assert request(url, "POST", headers, json.dumps({"private": wanted}))[0] == 200
        assert cli.note_private(note) == wanted
        assert request("/files/alice/note.md")[0] == (401 if wanted else 200)
    assert note.read_text() == "# Note\n"
    assert (
        request("/notes/private/alice/", "POST", headers, '{"private":true}')[0] == 200
    )
    assert (folder / cli.PRIVATE_MARK).is_file()
    assert request("/notes/private/", "POST", headers, '{"private":true}')[0] == 404


def test_private_api_token_access(local_docs, aniflow_servers):
    note = local_docs / "guides" / "secret.md"
    note.write_text("---\nprivate: true\n---\nCONFIDENTIAL\n")
    request = aniflow_servers(
        local_docs, signin=oauth.SignIn("id", "secret", "key"), user_folders=True
    )
    token = tokens.Tokens(cli.token_db()).create(1, "alice", "test")
    headers = {"Authorization": f"Bearer {token['token']}"}
    assert request("/api/notes/guides/secret.md")[0] == 404
    assert request("/api/notes/guides/secret.md", headers=headers)[0] == 200
    anonymous = json.loads(request("/api/notes/guides")[2])
    assert "secret.md" not in {entry["name"] for entry in anonymous["notes"]}
    results = json.loads(request("/api/search?q=CONFIDENTIAL", headers=headers)[2])
    assert results["results"][0]["path"] == "guides/secret.md"
    cookie = oauth.seal({"id": 1, "login": "alice", "exp": 9999999999}, "key")
    status = request(
        "/notes/private/guides/secret.md",
        "POST",
        {"Cookie": f"{oauth.SESSION_COOKIE}={cookie}"},
        '{"private":false}',
    )[0]
    assert status == 403


def test_large_front_matter_fails_closed(tmp_path):
    path = tmp_path / "note.md"
    path.write_text("---\nsummary: " + "x" * 9000 + "\nprivate: true\n---\n")
    assert cli.is_private(tmp_path, path)
