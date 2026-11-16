import http.client
import io
import json
import os
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import pytest

from aniflow import cli, export


def keep_temporary_profiles(monkeypatch, folder):
    """The profile folders run() makes, all under folder so a test can see them go."""
    made = []
    real = tempfile.mkdtemp

    def keep(*args, **kwargs):
        path = real(*args, dir=folder, **kwargs)
        made.append(Path(path))
        return path

    monkeypatch.setattr(export.tempfile, "mkdtemp", keep)
    return made


def json_block(body, name):
    block = body.decode().split(f'<script type="application/json" id="{name}">')[1]
    return json.loads(block.split("</script>", 1)[0])


def test_chrome_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("ANIFLOW_CHROME", "/opt/chrome")
    assert export.chrome() == "/opt/chrome"


def test_chrome_falls_back_to_the_installed_browsers(monkeypatch):
    monkeypatch.delenv("ANIFLOW_CHROME", raising=False)
    monkeypatch.setattr(
        export.shutil,
        "which",
        lambda name: "/usr/bin/" + name if name == "chromium" else None,
    )
    assert export.chrome() == "/usr/bin/chromium"
    monkeypatch.setattr(export.shutil, "which", lambda name: None)
    assert export.chrome() is None


def test_command_carries_the_export_flags(tmp_path):
    profile = tmp_path / "profile"
    command = export.command("/usr/bin/chrome", "http://127.0.0.1:9/doc/x", profile)
    assert command[0] == "/usr/bin/chrome"
    assert command[-2] == f"--user-data-dir={profile}"
    assert command[-1] == "http://127.0.0.1:9/doc/x"
    for flag in (
        "--headless=new",
        "--mute-audio",
        "--disable-background-timer-throttling",
    ):
        assert flag in command
    assert ("--no-sandbox" in command) is (os.geteuid() == 0)


def test_bare_mermaid_is_fenced_and_markdown_is_left_alone():
    diagram = "flowchart LR\n  A --> B\n\n%% play: Go\n%% A -> B : one\n"
    assert export.fenced(diagram, "walk.mmd") == (
        "```mermaid\n" + diagram.strip("\n") + "\n```\n"
    )
    assert export.fenced(diagram, "walk.md").startswith("```mermaid")
    markdown = "# Walk\n\n```mermaid\nflowchart LR\n```\n"
    assert export.fenced(markdown, "walk.md") == markdown
    prose = "# Walk\n\nA flowchart is a drawing.\n"
    assert export.fenced(prose, "walk.md") == prose


def test_document_reads_a_file_and_keeps_its_folder(tmp_path):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    assert export.document(source) == ("# Walk\n", tmp_path, "walk.md")


def test_document_reads_stdin(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.stdin", io.StringIO("flowchart LR\n  A --> B\n"))
    text, folder, name = export.document("-")
    assert (folder, name) == (tmp_path, "stdin.md")
    assert text.startswith("```mermaid")


def test_output_names_are_unique_and_never_a_path(tmp_path):
    assert export.write_unique(tmp_path, "01-walk-ship.gif", b"a").name == (
        "01-walk-ship.gif"
    )
    assert export.write_unique(tmp_path, "01-walk-ship.gif", b"b").name == (
        "01-walk-ship-2.gif"
    )
    assert export.write_unique(tmp_path, "01-walk-ship.gif", b"c").name == (
        "01-walk-ship-3.gif"
    )
    assert export.write_unique(tmp_path, "../../etc/passwd", b"x").parent == tmp_path
    assert export.write_unique(tmp_path, "..", b"x").name == "diagram"


def test_a_dangling_symlink_is_never_written_through(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    outside = tmp_path / "escaped.gif"
    (out / "01-walk-ship.gif").symlink_to(outside)
    written = export.write_unique(out, "01-walk-ship.gif", b"GIF89a")
    assert written == out / "01-walk-ship-2.gif"
    assert written.read_bytes() == b"GIF89a"
    assert not outside.exists()


@pytest.fixture
def export_server(tmp_path):
    folder = tmp_path / "docs"
    folder.mkdir()
    (folder / "walk.md").write_text("# Walk\n", encoding="utf-8")
    (folder / "tile.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    outdir = tmp_path / "out"
    outdir.mkdir()
    server = export.ExportServer(
        "# Walk\n", folder, "walk.md", outdir, "png", diagrams=[1]
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def request(path, method="GET", headers=None, body=None):
        connection = http.client.HTTPConnection(*server.server_address, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    yield server, request
    server.stop.set()
    server.shutdown()
    server.server_close()
    thread.join()


def test_export_page_carries_the_job_and_its_pictures(export_server):
    server, request = export_server
    status, headers, body = request(server.doc_path)
    assert status == 200
    assert json_block(body, "markdown-source") == "# Walk\n"
    assert json_block(body, "aniflow-options")["root"] == server.prefix
    job = json_block(body, "aniflow-export")
    assert (job["kind"], job["diagrams"]) == ("png", [1])
    assert job["blob"] == server.blob_url and job["done"] == server.done_url
    policy = headers["Content-Security-Policy"]
    nonce = policy.split("'nonce-")[1].split("'")[0]
    assert f'<script nonce="{nonce}">' in body.decode()
    assert "Aniflow.diagramExport" in body.decode()
    status, headers, body = request(server.prefix + "tile.svg")
    assert status == 200 and b"<svg" in body
    assert headers["Content-Security-Policy"] == "sandbox"
    assert request(server.prefix + "..%2F..%2Fetc%2Fpasswd")[0] == 404
    assert request(server.prefix + "walk.md?raw=1")[0] == 200


def test_export_server_refuses_requests_without_the_token(export_server, tmp_path):
    server, request = export_server
    assert request("/blob/?name=01-walk.gif", method="POST", body=b"GIF89a")[0] == 404
    assert request("/blob/other/", method="POST", body=b"GIF89a")[0] == 404
    assert request("/done/other", method="POST", body=b"{}")[0] == 404
    assert request("/error/other", method="POST", body=b"{}")[0] == 404
    assert server.written == [] and not server.stop.is_set()
    assert (
        request(
            server.blob_url + "?name=01-walk.gif",
            method="POST",
            body=b"GIF89a",
            headers={"Host": "evil.example"},
        )[0]
        == 403
    )
    assert (
        request(
            server.blob_url + "?name=01-walk.gif",
            method="POST",
            body=b"GIF89a",
            headers={"Origin": "https://evil.example"},
        )[0]
        == 403
    )
    assert server.written == []


def test_export_server_writes_what_the_page_posts(export_server, tmp_path):
    server, request = export_server
    status, _, body = request(
        server.blob_url + "?name=01-walk-ship.gif", method="POST", body=b"GIF89a"
    )
    assert status == 200 and json.loads(body)["ok"] is True
    written = tmp_path / "out" / "01-walk-ship.gif"
    assert written.read_bytes() == b"GIF89a"
    assert server.written == [written]
    status, _, _ = request(
        server.blob_url + "?name=01-walk-ship.gif", method="POST", body=b"GIF89a"
    )
    assert status == 200 and (tmp_path / "out" / "01-walk-ship-2.gif").exists()
    assert request(server.blob_url, method="POST", body=b"")[0] == 400


def test_export_server_never_writes_through_its_own_symlink(export_server, tmp_path):
    server, request = export_server
    outside = tmp_path / "escaped.gif"
    (tmp_path / "out" / "01-walk.gif").symlink_to(outside)
    status, _, _ = request(
        server.blob_url + "?name=01-walk.gif", method="POST", body=b"GIF89a"
    )
    assert status == 200
    assert server.written == [tmp_path / "out" / "01-walk-2.gif"]
    assert server.written[0].read_bytes() == b"GIF89a"
    assert not outside.exists()


def test_export_server_gives_parallel_uploads_a_name_each(export_server):
    server, request = export_server
    bodies = [b"GIF89a" + bytes([number]) for number in range(8)]

    def upload(body):
        request(server.blob_url + "?name=01-walk.gif", method="POST", body=body)

    threads = [threading.Thread(target=upload, args=(body,)) for body in bodies]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(server.written) == len(bodies)
    assert len(set(server.written)) == len(bodies)
    assert sorted(path.read_bytes() for path in server.written) == sorted(bodies)


def test_export_server_refuses_hidden_files(export_server):
    server, request = export_server
    (server.folder / ".env").write_text("SECRET=1", encoding="utf-8")
    (server.folder / "visible.md").symlink_to(".env")
    (server.folder / ".git").mkdir()
    (server.folder / ".git" / "config").write_text("x", encoding="utf-8")
    for hidden in (".env", "visible.md", ".git/config"):
        assert request(server.prefix + hidden)[0] == 404
    assert request(server.prefix + "tile.svg")[0] == 200
    assert request(server.prefix + "walk.md?raw=1")[0] == 200


def test_export_server_records_skips_and_errors(export_server):
    server, request = export_server
    status, _, _ = request(
        server.done_url,
        method="POST",
        body=json.dumps({"skipped": [{"diagram": 2}]}).encode(),
    )
    assert status == 200 and server.skipped == ["2"] and server.stop.is_set()


def test_export_server_stops_on_an_error(export_server):
    server, request = export_server
    status, _, _ = request(
        server.error_url, method="POST", body=b'{"message": "no diagrams"}'
    )
    assert status == 200 and server.error == "no diagrams" and server.stop.is_set()
    assert request(server.error_url, method="POST", body=b"{oops")[0] == 400


def test_export_refuses_a_directory(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aniflow", "--export", "gif", str(tmp_path)])
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    assert "needs a Markdown file" in capsys.readouterr().err


def test_export_refuses_a_missing_file(tmp_path, monkeypatch, capsys):
    missing = tmp_path / "missing.md"
    monkeypatch.setattr("sys.argv", ["aniflow", "--export", "png", str(missing)])
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    assert "not a file" in capsys.readouterr().err


def test_export_needs_chrome(tmp_path, monkeypatch, capsys):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    monkeypatch.setattr(export, "chrome", lambda: None)
    monkeypatch.setattr("sys.argv", ["aniflow", "--export", "gif", str(source)])
    with pytest.raises(SystemExit, match="2"):
        cli.main()
    assert "ANIFLOW_CHROME" in capsys.readouterr().err


def test_export_refuses_open_and_bad_values(tmp_path, monkeypatch, capsys):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    for argv, message in (
        (["--export", "gif", str(source), "--open"], "--open goes with --share"),
        (["--export", "gif", str(source), "--diagram", "0"], "counts from 1"),
        (["--out", "somewhere"], "--out goes with --export"),
        (["--diagram", "2"], "--diagram goes with --export"),
    ):
        monkeypatch.setattr("sys.argv", ["aniflow", *argv])
        with pytest.raises(SystemExit, match="2"):
            cli.main()
        assert message in capsys.readouterr().err


def test_export_hands_the_run_to_the_export_module(tmp_path, monkeypatch):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    out = tmp_path / "out"
    calls = []
    monkeypatch.setattr(export, "chrome", lambda: "/usr/bin/chrome")
    monkeypatch.setattr(export, "run", lambda *args: calls.append(args) or 0)
    monkeypatch.setattr(
        "sys.argv",
        [
            "aniflow",
            "--export",
            "mp4",
            str(source),
            "-o",
            str(out),
            "--diagram",
            "2",
        ],
    )
    with pytest.raises(SystemExit) as stopped:
        cli.main()
    assert stopped.value.code == 0
    assert calls == [(str(source), "mp4", str(out), 2)]


def test_terminate_kills_the_group_after_its_leader_exited(tmp_path):
    pidfile = tmp_path / "child.pid"
    script = tmp_path / "leader.sh"
    script.write_text(
        "#!/bin/sh\ntrap '' TERM\nsleep 60 &\necho $! > \"$1\"\nexit 0\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    process = subprocess.Popen([str(script), str(pidfile)], start_new_session=True)
    try:
        assert process.wait(timeout=10) == 0
        child = int(pidfile.read_text().strip())
        assert export.group_alive(process.pid)
        export.terminate(process, grace=0.5)
        assert not export.group_alive(process.pid)
        time.sleep(0.1)
        with pytest.raises(ProcessLookupError):
            os.kill(child, 0)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=10)


@pytest.mark.skipif(not Path("/bin/sh").exists(), reason="needs a shell")
def test_export_reports_a_browser_that_exits_early(tmp_path, monkeypatch, capsys):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    browser = tmp_path / "fake-chrome"
    browser.write_text(
        "#!/bin/sh\necho 'chrome: no such profile' >&2\nexit 3\n", encoding="utf-8"
    )
    browser.chmod(0o755)
    profiles = keep_temporary_profiles(monkeypatch, tmp_path)
    monkeypatch.setenv("ANIFLOW_CHROME", str(browser))
    started = time.monotonic()
    assert export.run(source, "gif", tmp_path / "out") == 1
    assert time.monotonic() - started < 20
    err = capsys.readouterr().err
    assert "exited with status 3" in err
    assert "chrome: no such profile" in err
    assert profiles and not any(path.exists() for path in profiles)


def test_export_reports_a_browser_that_cannot_start(tmp_path, monkeypatch, capsys):
    source = tmp_path / "walk.md"
    source.write_text("# Walk\n", encoding="utf-8")
    profiles = keep_temporary_profiles(monkeypatch, tmp_path)

    def refuses(*args, **kwargs):
        raise OSError(13, "Permission denied")

    monkeypatch.setattr(export.subprocess, "Popen", refuses)
    monkeypatch.setenv("ANIFLOW_CHROME", "/usr/bin/chrome")
    assert export.run(source, "gif", tmp_path / "out") == 1
    assert "cannot start" in capsys.readouterr().err
    assert profiles and not any(path.exists() for path in profiles)


def test_the_export_page_keeps_the_format_it_was_given(tmp_path):
    server = export.ExportServer("# Walk\n", tmp_path, "walk.md", tmp_path, "mp4")
    try:
        body, _ = server.reader()
    finally:
        server.server_close()
    assert json_block(body, "aniflow-export")["kind"] == "mp4"
    assert b"Aniflow.diagramExport(stage, job.kind)" in body
    assert b"window.aniflowPage = { save: () => {} }" in body


@pytest.mark.skipif(
    os.environ.get("ANIFLOW_EXPORT_E2E") != "1" or export.chrome() is None,
    reason="set ANIFLOW_EXPORT_E2E=1 with Chrome installed",
)
@pytest.mark.parametrize(
    ("kind", "prefix"),
    [
        ("gif", b"GIF89a"),
        ("png", b"\x89PNG\r\n\x1a\n"),
        ("webm", b"\x1a\x45\xdf\xa3"),
        ("mp4", b""),
    ],
)
def test_export_end_to_end_writes_kind(tmp_path, capsys, kind, prefix):
    source = tmp_path / "walk.md"
    source.write_text(
        "# Walk\n\n```mermaid\nflowchart LR\n  A[Issue] --> B[Ship]\n\n"
        "%% play: Fix a bug\n%% A -> B : A reader reports it.\n```\n",
        encoding="utf-8",
    )
    out = tmp_path / "out"
    assert export.run(source, kind, out) == 0
    written = sorted(out.iterdir())
    assert [path.name for path in written] == [f"01-walk-fix-a-bug.{kind}"]
    data = written[0].read_bytes()
    if kind == "mp4":
        assert b"ftyp" in data[:64]
    else:
        assert data.startswith(prefix)
    assert written[0].stat().st_size > 1000
    captured = capsys.readouterr()
    assert str(written[0]) in captured.out
    assert "wrote" in captured.err
