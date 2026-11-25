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
    assert "no-store" in headers["Cache-Control"]
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
    folder = local_docs / "team"
    folder.mkdir(parents=True)
    (folder / cli.SHARED_MARK).touch()
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
    url = "/notes/private/team/note.md"
    assert request(url, "POST", body='{"private":true}')[0] == 401
    for wanted in (True, False):
        assert request(url, "POST", headers, json.dumps({"private": wanted}))[0] == 200
        assert cli.note_private(note) == wanted
        assert request("/files/team/note.md")[0] == (401 if wanted else 200)
    assert note.read_text() == "# Note\n"
    assert (
        request("/notes/private/team/", "POST", headers, '{"private":true}')[0] == 200
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


@pytest.mark.parametrize(
    "source",
    [
        "\ufeff---\nprivate: true\n---\n",
        "---\r\nprivate: true\r\n---\r\n",
        "---\nprivate: false\nprivate: true\n---\n",
        "---\n" + "k: v\n" * 250 + "private: true\n---\n",
        "---\nprivate: true\n",
    ],
)
def test_front_matter_fails_closed(source):
    assert cli.front_private(source)


@pytest.mark.parametrize(
    "source",
    [
        "\ufeff---\nprivate: true\n---\nBody\n",
        "---\r\nprivate: true\r\n---\r\nBody\r\n",
        "---\nprivate: yes\ntitle: x\nprivate: true\n---\nBody\n",
    ],
)
def test_make_public_clears_every_private_line(source):
    text = cli.set_front_private(source, False)
    assert not cli.front_private(text)
    assert "Body" in text


def test_private_pages_are_not_cached(local_docs, aniflow_servers):
    (local_docs / "guides" / cli.PRIVATE_MARK).touch()
    request = aniflow_servers(local_docs, signin=oauth.SignIn("id", "secret", "key"))
    cookie = oauth.seal({"id": 1, "login": "alice", "exp": 9999999999}, "key")
    _, headers, _ = request(
        "/files/guides/start.md",
        headers={"Cookie": f"{oauth.SESSION_COOKIE}={cookie}"},
    )
    assert headers["Cache-Control"] == "private, no-store"
    assert headers["Vary"] == "Cookie, Authorization"
    _, headers, _ = request("/files/README.md")
    assert headers["Vary"] == "Cookie, Authorization"


def test_private_is_shown_when_signed_in(local_docs, aniflow_servers):
    (local_docs / "team").mkdir()
    (local_docs / "team" / cli.SHARED_MARK).touch()
    vault = local_docs / "team" / "vault"
    (vault / "sub").mkdir(parents=True)
    (vault / cli.PRIVATE_MARK).touch()
    (vault / "plan.md").write_text("# Plan\n")
    request = aniflow_servers(
        local_docs, signin=oauth.SignIn("id", "secret", "key"), user_folders=True
    )
    cookie = oauth.seal({"id": 1, "login": "alice", "exp": 9999999999}, "key")
    signed = {"Cookie": f"{oauth.SESSION_COOKIE}={cookie}"}
    body = request("/files/team/vault/", headers=signed)[2]
    assert b'class="folder-privacy"' in body and b"Make public" in body
    assert b'class="folder-private"' in body
    body = request("/files/team/vault/sub/", headers=signed)[2]
    assert b"from a parent folder" in body
    assert b'class="folder-privacy"' not in body
    assert (
        b'class="private-badge"'
        in request("/files/team/vault/plan.md", headers=signed)[2]
    )
    body = request("/files/team/", headers=signed)[2]
    assert b'class="folder-privacy"' in body and b"Make private" in body


def test_personal_folders_are_for_their_owner(local_docs, aniflow_servers):
    alice_dir = local_docs / "users" / "alice"
    (alice_dir / "images").mkdir(parents=True)
    (alice_dir / "plan.md").write_text("# Plan\nSECRET PLAN\n")
    (alice_dir / "images" / "a.png").write_bytes(b"picture")
    (local_docs / "users" / "bob").mkdir()
    (local_docs / "guides" / "peek").symlink_to(alice_dir, target_is_directory=True)
    (alice_dir / "into-bob").symlink_to(
        local_docs / "users" / "bob", target_is_directory=True
    )
    request = aniflow_servers(
        local_docs,
        signin=oauth.SignIn("id", "secret", "key", admin="boss"),
        user_folders=True,
    )

    def cookie(login, uid):
        sealed = oauth.seal({"id": uid, "login": login, "exp": 9999999999}, "key")
        return {"Cookie": f"{oauth.SESSION_COOKIE}={sealed}"}

    alice, bob, boss = cookie("alice", 1), cookie("bob", 2), cookie("boss", 9)
    bob_token = tokens.Tokens(cli.token_db()).create(2, "bob", "t")["token"]
    bearer = {"Authorization": f"Bearer {bob_token}"}
    reads = [
        "/files/users/alice/",
        "/files/users/alice/plan.md",
        "/files/users/alice/plan.md?raw",
        "/files/users/alice/images/a.png",
        "/files/guides/peek/plan.md",
        "/api/notes/users/alice",
        "/api/notes/users/alice/plan.md",
        "/api/search?q=SECRET&folder=users/alice",
        "/comments/file/users/alice/plan.md",
    ]
    for path in reads:
        assert request(path, headers=alice)[0] == 200, path
        for other in (bob, boss, bearer):
            assert request(path, headers=other)[0] == 404, path
    assert b"peek" not in request("/files/guides/", headers=bob)[2]
    assert b"peek" in request("/files/guides/", headers=alice)[2]
    # A link out of alice's folder into bob's opens for neither of them.
    assert request("/files/users/alice/into-bob/", headers=alice)[0] == 404
    # Anonymous readers get the same answer whether the member or the note exists.
    for path in (
        "/files/users/alice/",
        "/files/users/nobody/",
        "/files/users/alice/plan.md",
        "/files/users/alice/missing.md",
    ):
        status, _, body = request(path)
        assert status == 401 and b"SECRET" not in body, path
    for path in ("/files/users/alice/images/a.png", "/files/users/x/images/a.png"):
        assert request(path)[0] == 404
    # The API reports them private, and a member writes create-only on request.
    listing = json.loads(request("/api/notes/users/alice", headers=alice)[2])
    assert all(note["private"] for note in listing["notes"])
    alice_token = tokens.Tokens(cli.token_db()).create(1, "alice", "t")["token"]
    create_only = {"Authorization": f"Bearer {alice_token}", "If-None-Match": "*"}
    assert request("/api/notes/users/alice/plan.md", "PUT", create_only, "x")[0] == 412
    assert request("/api/notes/users/alice/new.md", "PUT", create_only, "x")[0] == 201
