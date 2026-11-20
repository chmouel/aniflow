import http.client
import json
import re
import shutil
import sys
import threading
import time
import urllib.parse
from urllib.parse import urlsplit

import pytest

from aniflow import cli, comments, oauth, page, web


def test_init_creates_selected_template_without_overwriting(
    tmp_path, monkeypatch, capsys
):
    target = tmp_path / "talk.md"
    monkeypatch.setattr(
        sys, "argv", ["aniflow", "--init", str(target), "--style", "keynote"]
    )
    cli.main()
    assert "style: keynote" in target.read_text(encoding="utf-8")
    assert "Created" in capsys.readouterr().out
    with pytest.raises(SystemExit) as error:
        cli.main()
    assert error.value.code == 2
    assert "style: keynote" in target.read_text(encoding="utf-8")


def test_init_rejects_invalid_combinations(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "argv", ["aniflow", "--style", "minimal"])
    with pytest.raises(SystemExit):
        cli.main()
    monkeypatch.setattr(
        sys, "argv", ["aniflow", "--init", str(tmp_path / "talk.md"), "--spec"]
    )
    with pytest.raises(SystemExit):
        cli.main()
    assert not (tmp_path / "talk.md").exists()


def test_packaged_template_catalogue():
    folder = cli.SPEC.parent / "templates"
    catalogue = json.loads((folder / "catalogue.json").read_text(encoding="utf-8"))
    assert {deck["id"] for deck in catalogue} == {
        "keynote",
        "conference",
        "minimal",
        "showcase",
        "walkthrough",
    }
    for deck in catalogue:
        assert (folder / deck["file"]).read_text(encoding="utf-8").startswith("---\n")
    walkthrough = (folder / "walkthrough.md").read_text(encoding="utf-8")
    pictures = re.findall(r"!\[Pencil sketch[^]]*\]\(([^)]+)\)", walkthrough)
    assert len(pictures) == 12
    for name in pictures:
        data = (folder / name).read_bytes()
        assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def test_share_warns_about_local_logos():
    text = '---\nlogo: "./logo.svg"\nlogo-dark: https://example.com/white.svg\n---\n'
    assert cli.offline_pictures(text) == ["./logo.svg"]


def json_block(body, name):
    block = body.decode().split(f'<script type="application/json" id="{name}">')[1]
    return json.loads(block.split("</script>", 1)[0])


@pytest.fixture
def local_docs(tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    (root / "README.md").write_text(
        "# Hello\n\n[Guide](guides/start.md#first)\n", encoding="utf-8"
    )
    (root / "guides").mkdir()
    (root / "guides" / "start.md").write_text(
        "# First\n\n![Picture](../images/picture.svg)\n", encoding="utf-8"
    )
    (root / "guides" / "é space.markdown").write_text("# Unicode\n", encoding="utf-8")
    (root / "images").mkdir()
    (root / "images" / "picture.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8"
    )
    (root / "script.js").write_text("alert(1)", encoding="utf-8")
    (root / ".secret.md").write_text("secret", encoding="utf-8")
    (root / ".private").mkdir()
    (root / ".private" / "note.md").write_text("secret", encoding="utf-8")
    (root / "secret-alias.md").symlink_to(root / ".secret.md")
    (tmp_path / "outside.md").write_text("outside", encoding="utf-8")
    (root / "escape.md").symlink_to(tmp_path / "outside.md")
    (root / "escape-dir").symlink_to(tmp_path, target_is_directory=True)
    return root


@pytest.fixture
def aniflow_servers(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    running = []

    def start(root, **options):
        httpd = cli.Server(("127.0.0.1", 0), root, **options)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        running.append((httpd, thread))

        def request(path, method="GET", headers=None, body=None):
            connection = http.client.HTTPConnection(*httpd.server_address, timeout=5)
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            headers = {}
            for name, value in response.getheaders():
                if name == "Set-Cookie":
                    headers.setdefault("Set-Cookie", []).append(value)
                else:
                    headers[name] = value
            result = response.status, headers, response.read()
            connection.close()
            return result

        return request

    yield start
    for httpd, thread in running:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


@pytest.fixture
def aniflow_server(local_docs, aniflow_servers):
    return aniflow_servers(local_docs)


def test_browse_folders_and_markdown(aniflow_server):
    status, headers, _ = aniflow_server("/")
    assert status == 302 and headers["Location"] == "/files/"
    status, _, body = aniflow_server("/files/")
    assert status == 200
    assert b'href="/files/guides/"' in body
    assert b'href="/files/README.md"' in body
    assert body.index(b'href="/files/guides/"') < body.index(b'href="/files/README.md"')
    assert b"script.js" not in body
    assert b"secret" not in body and b"escape" not in body
    status, headers, _ = aniflow_server("/files/guides")
    assert status == 302 and headers["Location"] == "/files/guides/"
    status, _, body = aniflow_server("/files/guides/")
    assert status == 200
    assert b'href="/files/"' in body
    assert b'href="/files/guides/%C3%A9%20space.markdown"' in body
    assert aniflow_server("/files/guides/%C3%A9%20space.markdown")[0] == 200


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("", ""),
        ("/", ""),
        ("//", ""),
        ("/pub", "/pub"),
        ("/pub/", "/pub"),
        ("/a/b//", "/a/b"),
    ],
)
def test_path_prefix_normalises(value, expected):
    assert cli.path_prefix(value) == expected


@pytest.mark.parametrize("value", ["pub", "https://share.example/pub", "//host/pub"])
def test_path_prefix_rejects_a_relative_path_or_a_host(value):
    with pytest.raises(ValueError):
        cli.path_prefix(value)


def test_base_prefixes_every_url(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs, base="/pub")
    status, headers, _ = request("/")
    assert status == 302 and headers["Location"] == "/pub/files/"
    status, _, body = request("/pub/files/")
    assert status == 200
    assert b'href="/pub/files/README.md"' in body
    assert b'href="/pub/static/page.css"' in body
    assert b'href="/pub/vendor/github-markdown.css"' in body
    assert b'href="/pub/help"' in body
    status, headers, body = request("/pub/files/guides/start.md")
    assert status == 200
    options = json_block(body, "aniflow-options")
    assert options["base"] == "/pub"
    assert options["root"] == "/pub/files/"
    assert options["mermaid"] == "/pub/vendor/mermaid.min.js"
    assert options["comments"]["url"] == "/pub/comments/file/guides/start.md"
    for script in re.findall(rb'(?:src|href)="([^"]+)"', body):
        value = script.decode()
        if value.startswith("/"):
            assert value.startswith("/pub/"), value
    assert request("/pub/static/aniflow.css")[0] == 200
    assert request("/pub/icons/agent.svg")[0] == 200
    assert request("/pub/comments/file/guides/start.md")[0] == 200
    assert request("/pub/files/guides")[0] == 302


def test_base_also_answers_prefix_free_paths(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs, base="/pub")
    assert request("/")[0] == 302
    assert request("/files/")[0] == 200
    assert request("/static/page.css")[0] == 200
    assert request("/icons/agent.svg")[0] == 200
    # Nothing outside the base prefix is invented: a lookalike stays a 404.
    assert request("/public/files/")[0] == 404


def test_brand_names_the_page_and_the_tab(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs, base="/pub", brand_name="Chmouel's Notes")
    _, _, body = request("/pub/files/")
    assert b"\xc2\xb7 Chmouel&#x27;s Notes</title>" in body
    assert b'href="/pub/files/">Chmouel&#x27;s Notes</a>' in body
    assert b'class="brand-word">Chmouel&#x27;s Notes</span>' in body
    assert b"aniflow-letters" not in body
    assert b'<link rel="icon" href="data:image/svg+xml,' in body
    _, _, one = request("/pub/files/guides/start.md")
    assert b'class="brand-word">Chmouel&#x27;s Notes</span>' in one


def test_logo_replaces_the_wordmark(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs, base="/pub", brand_name="Chmouel's Notes")
    _, _, body = request("/pub/files/")
    assert b'class="brand-logo"' not in body
    # Dropped in while the server runs: the next page has it.
    (local_docs / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    assert cli.logo_url(local_docs, "", "/pub") == "/pub/files/logo.svg"
    _, _, body = request("/pub/files/")
    assert b'<img class="brand-logo" src="/pub/files/logo.svg" alt="">' in body
    assert b'<link rel="icon" href="/pub/files/logo.svg">' in body
    assert b"aniflow-letters" not in body


def test_favicon_comes_before_the_logo(local_docs, aniflow_servers):
    (local_docs / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    request = aniflow_servers(local_docs, base="/pub", brand_name="Notes")
    _, _, body = request("/pub/files/")
    assert b'<link rel="icon" href="/pub/files/logo.svg">' in body
    (local_docs / "favicon.ico").write_bytes(b"\0\0\1\0")
    _, _, body = request("/pub/files/")
    assert b'<link rel="icon" href="/pub/files/favicon.ico">' in body
    _, _, page_body = request("/pub/files/guides/start.md")
    assert b'<link rel="icon" href="/pub/files/favicon.ico">' in page_body
    status, headers, _ = request("/pub/files/favicon.ico")
    assert status == 200 and "Content-Disposition" not in headers
    # Given on the command line, the favicon wins over the one in the folder.
    pinned = aniflow_servers(local_docs, icon="https://example.com/i.png")
    _, _, body = pinned("/files/")
    assert b'<link rel="icon" href="https://example.com/i.png">' in body


def test_logo_must_stay_inside_the_folder(local_docs):
    with pytest.raises(ValueError):
        cli.logo_url(local_docs, "../secret.svg", "/pub")
    with pytest.raises(ValueError):
        cli.logo_url(local_docs, "/etc/passwd", "/pub")
    assert cli.logo_url(local_docs, "https://example.com/a.svg", "/pub") == (
        "https://example.com/a.svg"
    )
    assert cli.logo_url(local_docs, "data:image/svg+xml,<svg/>", "") == (
        "data:image/svg+xml,<svg/>"
    )
    assert cli.logo_url(local_docs, "", "") == ""


def test_no_comments_hides_the_review_ui(local_docs, aniflow_servers):
    request = aniflow_servers(local_docs, comments=False)
    _, _, body = request("/files/guides/start.md")
    options = json_block(body, "aniflow-options")
    assert "comments" not in options
    assert b'data-review="toggle"' not in body
    assert request("/comments/file/guides/start.md")[0] == 404
    status, _, _ = request("/comments/add/file/guides/start.md", method="POST")
    assert status == 404


def test_reader_page(aniflow_server):
    status, headers, body = aniflow_server("/files/guides/start.md")
    assert status == 200
    assert b'href="/files/guides/"' in body
    assert b'id="theme-select"' in body
    options = json_block(body, "aniflow-options")
    assert options["root"] == "/files/"
    assert options["comments"]["url"] == "/comments/file/guides/start.md"
    policy = headers["Content-Security-Policy"]
    nonce = policy.split("'nonce-")[1].split("'")[0]
    assert "'self'" not in policy.split("script-src ")[1].split(";")[0]
    for script in re.findall(rb"<script([^>]*)>", body):
        assert b"application/json" in script or f'nonce="{nonce}"'.encode() in script
    for name in (*page.MARKDOWN_SCRIPTS, "github-markdown.css", "mermaid.min.js"):
        assert aniflow_server("/vendor/" + name)[0] == 200
    for name in ("aniflow.min.js", "aniflow.css", "page.css"):
        assert aniflow_server("/static/" + name)[0] == 200


def test_reader_path_sits_in_the_bar(aniflow_server):
    _, _, body = aniflow_server("/files/guides/start.md")
    bar = body.split(b"</header>")[0]
    assert b'<nav class="bar-trail" aria-label="Folders">' in bar
    assert b'href="/files/guides/"' in bar
    assert b'<b aria-current="page">start.md</b>' in bar
    assert b'<span class="name">' not in bar
    assert b'class="crumbs"' not in body
    _, _, help_body = aniflow_server("/help")
    assert b'<span class="name">aniflow help</span>' in help_body


def cookie_wanted(headers, name):
    for value in headers.get("Set-Cookie", []):
        if value.startswith(name + "="):
            return value.split(";", 1)[0]
    return ""


@pytest.fixture
def github(monkeypatch):
    """GitHub's two calls, answered without the network."""
    accounts = {
        "code-alice": (1, "alice"),
        "code-bob": (2, "bob"),
        "code-boss": (9, "boss"),
    }

    monkeypatch.setattr(oauth, "exchange", lambda code, *rest: "token-" + code)
    monkeypatch.setattr(
        oauth,
        "user",
        lambda token: {
            "id": accounts[token.removeprefix("token-")][0],
            "login": accounts[token.removeprefix("token-")][1],
            "name": "",
        },
    )
    return accounts


def sign_in(request, who="alice"):
    """Walk the redirect and the callback, and give back the session cookie it sets."""
    status, headers, _ = request("/auth/github/start?next=/files/README.md")
    assert status == 302 and headers["Location"].startswith(oauth.AUTHORIZE)
    state = cookie_wanted(headers, oauth.STATE_COOKIE)
    assert state
    state_value = urllib.parse.parse_qs(urlsplit(headers["Location"]).query)["state"][0]
    status, headers, _ = request(
        f"/auth/github/callback?code=code-{who}&state={state_value}",
        headers={"Cookie": state},
    )
    assert status == 302 and headers["Location"] == "/files/README.md"
    return cookie_wanted(headers, oauth.SESSION_COOKIE)


def signin_servers(local_docs, aniflow_servers):
    return aniflow_servers(
        local_docs,
        signin=oauth.SignIn("client-id", "client-secret", "signing-key", admin="boss"),
    )


def test_oauth_cookies_are_signed_and_scoped():
    sealed = oauth.seal({"login": "alice", "exp": 1}, "key")
    assert oauth.unseal(sealed, "key") == {"login": "alice", "exp": 1}
    assert oauth.unseal(sealed, "other") is None
    assert oauth.unseal(sealed[:-1] + "x", "key") is None
    header = oauth.cookie("aniflow-user", "v", path="/pub/", max_age=0, secure=True)
    for wanted in ("Path=/pub/", "HttpOnly", "SameSite=Lax", "Secure", "Max-Age=0"):
        assert wanted in header


@pytest.mark.parametrize(
    ("wanted", "expected"),
    [
        ("/pub/files/a.md", "/pub/files/a.md"),
        ("/pub/", "/pub/"),
        ("/files/a.md", "/pub/files/"),
        ("//evil.example/x", "/pub/files/"),
        ("https://evil.example/x", "/pub/files/"),
        ("", "/pub/files/"),
    ],
)
def test_signin_returns_only_inside_the_base(wanted, expected):
    assert oauth.next_path(wanted, "/pub") == expected


def test_signin_rejects_a_state_it_did_not_issue(github, local_docs, aniflow_servers):
    request = signin_servers(local_docs, aniflow_servers)
    status, headers, body = request(
        "/auth/github/callback?code=code-alice&state=guessed",
        headers={
            "Cookie": oauth.STATE_COOKIE
            + "="
            + oauth.seal(
                {"state": "other", "next": "/files/", "exp": time.time() + 60},
                "signing-key",
            )
        },
    )
    assert status == 400 and b"sign-in failed" in body
    assert not cookie_wanted(headers, oauth.SESSION_COOKIE)
    # An expired state is no better.
    status, _, _ = request(
        "/auth/github/callback?code=code-alice&state=fine",
        headers={
            "Cookie": oauth.STATE_COOKIE
            + "="
            + oauth.seal(
                {"state": "fine", "next": "/files/", "exp": time.time() - 1},
                "signing-key",
            )
        },
    )
    assert status == 400


def test_signed_out_reader_is_offered_a_sign_in(github, local_docs, aniflow_servers):
    request = signin_servers(local_docs, aniflow_servers)
    _, _, body = request("/files/README.md")
    options = json_block(body, "aniflow-options")["comments"]
    assert options["signin"] == "/auth/github/start"
    assert options["signout"] == "/auth/logout"
    assert "me" not in options
    status, _, answer = request(
        "/comments/add/file/README.md",
        method="POST",
        body='{"start":1,"end":1,"body":"hi"}',
    )
    assert status == 401
    assert json.loads(answer)["signin"] == "/auth/github/start"


def test_signed_in_reader_names_the_comment_author(github, local_docs, aniflow_servers):
    request = signin_servers(local_docs, aniflow_servers)
    cookie = sign_in(request)
    session = {"Cookie": cookie}
    _, _, body = request("/files/README.md", headers=session)
    assert json_block(body, "aniflow-options")["comments"]["me"]["login"] == "alice"
    status, _, answer = request(
        "/comments/add/file/README.md",
        method="POST",
        headers={**session, "Content-Type": "application/json"},
        body='{"start":1,"end":1,"body":"hi"}',
    )
    assert status == 200
    comment = json.loads(answer)["comments"][0]
    assert comment["author"] == "alice" and comment["author_id"] == 1
    # Bob reads the comment but cannot touch it; Alice can; boss can.
    bob = {"Cookie": sign_in(request, "bob")}
    status, _, answer = request(
        f"/comments/edit/file/README.md?id={comment['id']}",
        method="POST",
        headers={**bob, "Content-Type": "application/json"},
        body='{"body":"mine now"}',
    )
    assert status == 403
    status, _, answer = request(
        f"/comments/edit/file/README.md?id={comment['id']}",
        method="POST",
        headers={**session, "Content-Type": "application/json"},
        body='{"body":"edited"}',
    )
    assert status == 200 and json.loads(answer)["comments"][0]["body"] == "edited"
    boss = {"Cookie": sign_in(request, "boss")}
    status, _, _ = request(
        f"/comments/delete/file/README.md?id={comment['id']}",
        method="POST",
        headers=boss,
    )
    assert status == 200


def test_forwarded_host_is_allowed_by_name(local_docs, aniflow_servers):
    plain = aniflow_servers(local_docs)
    status, _, _ = plain("/files/README.md", headers={"Host": "share.example.com"})
    assert status == 403
    proxied = aniflow_servers(local_docs, hosts=frozenset({"share.example.com"}))
    status, _, _ = proxied("/files/README.md", headers={"Host": "share.example.com"})
    assert status == 200
    # The origin check follows the host, whatever scheme the proxy terminated.
    status, _, _ = proxied(
        "/comments/add/file/README.md",
        method="POST",
        headers={"Host": "share.example.com", "Origin": "https://share.example.com"},
        body='{"start":1,"end":1,"body":"hi"}',
    )
    assert status == 200
    status, _, _ = proxied(
        "/comments/add/file/README.md",
        method="POST",
        headers={"Host": "share.example.com", "Origin": "https://evil.example"},
        body='{"start":1,"end":1,"body":"hi"}',
    )
    assert status == 403


def test_sign_out_clears_the_cookie(github, local_docs, aniflow_servers):
    request = signin_servers(local_docs, aniflow_servers)
    status, headers, _ = request("/auth/logout")
    assert status == 302
    assert "Max-Age=0" in cookie_wanted(headers, oauth.SESSION_COOKIE) or any(
        "Max-Age=0" in value for value in headers["Set-Cookie"]
    )


def test_source_is_escaped_and_reread(aniflow_server, local_docs):
    source = "# Updated\n\n</script><script>alert(1)</script> & <b>\n"
    (local_docs / "README.md").write_text(source, encoding="utf-8")
    _, _, body = aniflow_server("/files/README.md")
    assert b"<script>alert(1)" not in body
    assert json_block(body, "markdown-source") == source
    status, headers, body = aniflow_server("/files/README.md?raw")
    assert status == 200 and body.decode() == source
    assert headers["Content-Type"] == "text/plain; charset=utf-8"


def test_assets_are_served_safely(aniflow_server):
    for path in ("/files/images/picture.svg", "/icons/agent.svg"):
        status, headers, body = aniflow_server(path)
        assert status == 200 and b"<svg" in body
        assert headers["Content-Type"] == "image/svg+xml"
        assert headers["Content-Security-Policy"] == "sandbox"
        assert headers["X-Content-Type-Options"] == "nosniff"
    status, headers, body = aniflow_server("/files/script.js")
    assert status == 200 and body == b"alert(1)"
    assert headers["Content-Disposition"].startswith("attachment;")


@pytest.mark.parametrize(
    "path",
    [
        "/files/missing.md",
        "/files/.secret.md",
        "/files/%2ehidden.md",
        "/files/.private/note.md",
        "/files/%2e%2e/outside.md",
        "/files/guides/%2e%2e/%2e%2e/outside.md",
        "/files/%2Fetc/passwd",
        "/files/%00.md",
        "/files/escape.md",
        "/files/escape-dir/outside.md",
        "/files/secret-alias.md",
        "/vendor/../server.py",
        "/vendor/LICENSE.mermaid",
        "/icons/../server.py",
        "/clip",
        "/shots",
        "/notes",
        "/state",
    ],
)
def test_unavailable_paths_are_404(aniflow_server, path):
    assert aniflow_server(path)[0] == 404


def test_requests_are_read_only_and_host_checked(aniflow_server, local_docs):
    assert aniflow_server("/files/", headers={"Host": "evil.example"})[0] == 403
    assert (
        aniflow_server("/vendor/mermaid.min.js", headers={"Host": "evil.example"})[0]
        == 403
    )
    status, headers, _ = aniflow_server("/upload?name=x", method="POST")
    assert status == 405 and headers["Allow"] == "GET"
    assert (
        aniflow_server(
            "/clip", method="POST", headers={"Origin": "https://evil.example"}
        )[0]
        == 403
    )
    assert not (local_docs / "x").exists()


def test_directory_names_are_escaped(aniflow_server, local_docs):
    (local_docs / '<img src=x onerror="alert(1)">.md').write_text(
        "# Safe", encoding="utf-8"
    )
    _, _, body = aniflow_server("/files/")
    assert b'<img src=x onerror="alert(1)">' not in body
    assert b"&lt;img" in body


def test_empty_directory(aniflow_server, local_docs):
    (local_docs / "empty").mkdir()
    status, _, body = aniflow_server("/files/empty/")
    assert status == 200 and b"No Markdown files or folders here." in body
    assert b'class="browser-demo"' in body
    # A folder with notes in it keeps the demo to the bar's link.
    _, _, body = aniflow_server("/files/")
    assert b'class="browser-demo"' not in body


@pytest.mark.parametrize("path", ["/files/", "/files/guides/", "/files/README.md"])
def test_help_is_linked_from_folders_and_documents(aniflow_server, path):
    status, _, body = aniflow_server(path)
    assert status == 200
    assert b'href="/help"' in body


def test_help_works_without_files_or_configuration(aniflow_server, local_docs):
    for path in local_docs.iterdir():
        if path.is_file() or path.is_symlink():
            path.unlink()
        else:
            shutil.rmtree(path)
    before = set(local_docs.rglob("*"))
    status, headers, body = aniflow_server("/help")
    assert status == 200
    assert json_block(body, "aniflow-options")["root"] == "/"
    assert b'href="/help?raw=1"' in body
    assert b'href="/files/"' in body
    assert "script-src 'nonce-" in headers["Content-Security-Policy"]
    assert json_block(body, "markdown-source") == cli.HELP.read_text("utf-8")
    assert set(local_docs.rglob("*")) == before


def test_help_source_and_icon_catalog(aniflow_server):
    status, headers, body = aniflow_server("/help?raw")
    assert status == 200
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert body == cli.HELP.read_bytes()
    status, _, body = aniflow_server("/icons/")
    assert status == 200
    assert json.loads(body) == {"icons": sorted(web.ICON_NAMES)}


def test_help_obeys_request_checks(aniflow_server):
    assert aniflow_server("/help", headers={"Host": "evil.example"})[0] == 403
    assert aniflow_server("/help", method="POST")[0] == 405


def test_main_uses_available_port(local_docs, monkeypatch, capsys):
    monkeypatch.chdir(local_docs)
    monkeypatch.setattr("sys.argv", ["aniflow"])

    def stop(httpd):
        assert httpd.root == local_docs
        assert httpd.server_address[0] == "127.0.0.1"
        assert httpd.server_address[1] > 0
        raise KeyboardInterrupt

    monkeypatch.setattr(cli.Server, "serve_forever", stop)
    cli.main()
    output = capsys.readouterr().out
    assert re.search(r"http://127\.0\.0\.1:[1-9]\d*", output)


def test_main_rejects_missing_directory(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aniflow", str(tmp_path / "missing")])
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    assert "not a directory" in capsys.readouterr().err


@pytest.mark.parametrize(
    "extra",
    [
        [],
        ["--github-oauth", "client"],
    ],
)
def test_public_comments_need_github(tmp_path, monkeypatch, capsys, extra):
    monkeypatch.delenv("ANIFLOW_GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("ANIFLOW_GITHUB_SECRET", raising=False)
    monkeypatch.delenv("ANIFLOW_SIGNIN_SECRET", raising=False)
    monkeypatch.setattr(
        "sys.argv", ["aniflow", str(tmp_path), "--allow-host", "share.example", *extra]
    )
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    err = capsys.readouterr().err
    # Without a client id it names the fix; with one it still needs the secrets.
    assert ("--github-oauth" in err) if not extra else ("ANIFLOW_GITHUB_SECRET" in err)


def test_spec_prints_reference_without_serving(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aniflow", str(tmp_path / "missing"), "--spec"])

    def unexpected_server(*args, **kwargs):
        pytest.fail("--spec must not start a server")

    monkeypatch.setattr(cli, "Server", unexpected_server)
    cli.main()
    output = capsys.readouterr().out
    for directive in ("%% play:", "%% skip", "%% wait", "@ok"):
        assert directive in output
    listed = set(
        re.findall(
            r"`([a-z-]+)`", output.split("### Built-in icons")[1].split("\n## ")[0]
        )
    )
    assert listed == web.ICON_NAMES


def post_comment(request, action, target, data=None, query="", headers=None):
    return request(
        f"/comments/{action}/{target}{query}",
        method="POST",
        body=json.dumps(data).encode() if data is not None else b"",
        headers=headers,
    )


def test_comments_crud_and_feedback(aniflow_server, local_docs, tmp_path):
    before = {
        path: path.read_bytes() for path in local_docs.rglob("*") if path.is_file()
    }
    status, _, body = post_comment(
        aniflow_server,
        "add",
        "file/README.md",
        {"start": 1, "end": 1, "body": "<script>Keep as text</script>"},
    )
    assert status == 200
    [comment] = json.loads(body)["comments"]
    assert comment["quote"] == ["# Hello"]
    assert comment["body"] == "<script>Keep as text</script>"
    status, _, body = post_comment(
        aniflow_server,
        "edit",
        "file/README.md",
        {"body": "A clearer title"},
        query="?id=" + comment["id"],
    )
    assert (
        status == 200 and json.loads(body)["comments"][0]["body"] == "A clearer title"
    )
    status, _, body = aniflow_server("/comments/file/README.md?format=prompt")
    assert status == 200
    assert b"Review comments on README.md (aniflow):" in body
    assert b"A clearer title" in body and b"# Hello" in body
    assert len(list((tmp_path / "cache/aniflow/comments").rglob("*.json"))) == 1
    assert {
        path: path.read_bytes() for path in local_docs.rglob("*") if path.is_file()
    } == before
    status, _, body = post_comment(
        aniflow_server,
        "delete",
        "file/README.md",
        query="?id=" + comment["id"],
    )
    assert status == 200 and json.loads(body)["comments"] == []


def test_diagram_comment_target_in_cache_storage(aniflow_server):
    target = {"kind": "edge", "id": "A-B", "label": "A → B", "diagram": 2}
    status, _, body = post_comment(
        aniflow_server,
        "add",
        "file/README.md",
        {"start": 1, "end": 1, "body": "Dashed?", "target": target},
    )
    assert status == 200 and json.loads(body)["comments"][0]["target"] == target
    _, _, body = aniflow_server("/comments/file/README.md?format=prompt")
    assert 'README.md:1 (diagram 2, arrow "A → B")' in body.decode()


def test_comments_persist_and_are_separate_by_root_and_document(
    aniflow_server,
    aniflow_servers,
    local_docs,
    tmp_path,
):
    for target in ("help", "file/README.md", "file/guides/%C3%A9%20space.markdown"):
        assert (
            post_comment(aniflow_server, "add", target, {"start": 1, "body": target})[0]
            == 200
        )
    restarted = aniflow_servers(local_docs)
    other_root = tmp_path / "other"
    other_root.mkdir()
    (other_root / "README.md").write_text("# Hello\n")
    other = aniflow_servers(other_root)
    for target in ("help", "file/README.md", "file/guides/%C3%A9%20space.markdown"):
        status, _, body = restarted("/comments/" + target)
        assert status == 200 and json.loads(body)["comments"][0]["body"] == target
    assert json.loads(other("/comments/file/README.md")[2])["comments"] == []
    assert json.loads(other("/comments/help")[2])["comments"] == []
    help_options = json_block(restarted("/help")[2], "aniflow-options")
    assert help_options["comments"]["url"] == "/comments/help"


@pytest.mark.parametrize(
    "target",
    [
        "file/missing.md",
        "file/script.js",
        "file/.secret.md",
        "file/.private/note.md",
        "file/%2e%2e/outside.md",
        "file/escape.md",
        "file/secret-alias.md",
        "file/escape-dir/outside.md",
        "file/guides/",
        "file/%00.md",
        "other",
    ],
)
def test_comments_reject_unavailable_sources(aniflow_server, target):
    assert aniflow_server("/comments/" + target)[0] == 404
    assert (
        post_comment(aniflow_server, "add", target, {"start": 1, "body": "x"})[0] == 404
    )


def test_comments_validate_requests(aniflow_server):
    target = "file/README.md"
    for data in (
        [],
        {"start": 1, "body": ""},
        {"start": 0, "body": "x"},
        {"start": True, "body": "x"},
        {"start": 1, "end": 100, "body": "x"},
        {"start": 1, "body": "x" * (comments.COMMENT_MAX_CHARS + 1)},
    ):
        assert post_comment(aniflow_server, "add", target, data)[0] == 400
    assert (
        aniflow_server("/comments/add/" + target, method="POST", body=b"{invalid")[0]
        == 400
    )
    assert (
        aniflow_server("/comments/add/" + target, method="POST", body=b"x" * 20000)[0]
        == 413
    )
    assert (
        post_comment(
            aniflow_server, "edit", target, {"body": "x"}, query="?id=missing"
        )[0]
        == 404
    )
    assert post_comment(aniflow_server, "delete", target, query="?id=missing")[0] == 404
    assert post_comment(aniflow_server, "unknown", target)[0] == 404
    assert (
        post_comment(
            aniflow_server,
            "add",
            target,
            {"start": 1, "body": "x"},
            headers={"Origin": "https://evil.example"},
        )[0]
        == 403
    )
    assert (
        aniflow_server("/comments/" + target, headers={"Host": "evil.example"})[0]
        == 403
    )
    assert json.loads(aniflow_server("/comments/" + target)[2])["comments"] == []


def test_comments_follow_source_edits(aniflow_server, local_docs):
    post_comment(
        aniflow_server, "add", "file/README.md", {"start": 1, "body": "Follow this"}
    )
    path = local_docs / "README.md"
    path.write_text("New opening\n\n# Hello\n")
    [comment] = json.loads(aniflow_server("/comments/file/README.md")[2])["comments"]
    assert comment["start"] == 3 and not comment.get("outdated")
    path.write_text("New opening\n\n# Changed\n")
    [comment] = json.loads(aniflow_server("/comments/file/README.md")[2])["comments"]
    assert comment["outdated"] is True
    path.unlink()
    assert aniflow_server("/comments/file/README.md")[0] == 404


def test_comment_cache_is_not_served(aniflow_server, tmp_path):
    post_comment(
        aniflow_server, "add", "help", {"start": 1, "body": "Private feedback"}
    )
    [storage] = (tmp_path / "cache/aniflow/comments").rglob("*.json")
    for path in (
        "/comments/" + storage.name,
        "/files/.comments/" + storage.name,
        "/files/%2e%2e/cache/" + storage.name,
    ):
        assert aniflow_server(path)[0] == 404


def test_share_prints_try_link(tmp_path, monkeypatch, capsys):
    import base64
    import zlib

    text = '# Ünïcode\n\n```mermaid\nflowchart LR\n  A@{ img: "me.png" } --> B@{ img: "/icons/user.svg" }\n```\n'
    source = tmp_path / "walk.md"
    source.write_text(text, "utf-8")
    monkeypatch.setattr("sys.argv", ["aniflow", "--share", str(source)])
    monkeypatch.setattr(cli, "Server", lambda *a, **k: pytest.fail("no server"))
    cli.main()
    captured = capsys.readouterr()
    url = captured.out.strip()
    assert url.startswith(cli.TRY_URL + "#src=")
    packed = url.split("#src=")[1]
    packed += "=" * (-len(packed) % 4)
    assert zlib.decompress(base64.urlsafe_b64decode(packed), -15).decode() == text
    assert "me.png" in captured.err and "user.svg" not in captured.err


def test_open_needs_share(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aniflow", "--open"])
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    assert "--open goes with --share" in capsys.readouterr().err
