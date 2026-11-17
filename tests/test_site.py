import functools
import http.server
import os
import subprocess
import threading
from pathlib import Path

import pytest

from aniflow import export


@pytest.mark.skipif(
    export.chrome() is None, reason="Chrome or Chromium is not installed"
)
def test_gallery_and_template_editor(tmp_path):
    root = Path(__file__).resolve().parents[1]
    subprocess.run(["bash", str(root / "docs/site/assemble.sh")], check=True, cwd=root)
    (tmp_path / "aniflow").symlink_to(root / "docs/site", target_is_directory=True)
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=tmp_path
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with open(os.devnull, "w") as log:
        process, client = export.launch(export.chrome(), "about:blank", tmp_path, log)
        try:
            target = next(
                item
                for item in client.send("Target.getTargets")["targetInfos"]
                if item["type"] == "page"
            )
            session = client.send(
                "Target.attachToTarget",
                {"targetId": target["targetId"], "flatten": True},
            )["sessionId"]
            client.send("Page.enable", session=session)
            client.send("Runtime.enable", session=session)

            def navigate(path):
                url = f"http://127.0.0.1:{server.server_port}/aniflow/{path}"
                client.send("Page.navigate", {"url": url}, session)
                client.wait_event("Page.loadEventFired", session)

            navigate("")
            assert client.evaluate(
                session,
                "[...document.querySelectorAll('a')].some(a => a.getAttribute('href') === 'gallery/view.html?deck=walkthrough')",
            )
            navigate("gallery/")
            titles = client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 100 && !document.querySelector('.gallery-item'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  localStorage.setItem('aniflow-try', 'Existing draft');
                  return [...document.querySelectorAll('.gallery-item h2')].map(el => el.textContent);
                })()""",
            )
            assert titles == [
                "Keynote",
                "Conference",
                "Minimal",
                "Feature showcase",
                "Animated diagram walkthroughs",
            ]
            assert (
                client.evaluate(
                    session,
                    """(async () => {
                  const source = await (await fetch('../lib/templates/walkthrough.md')).text();
                  return (source.match(/data:image\\/webp;base64,/g) || []).length;
                })()""",
                )
                == 12
            )

            navigate("gallery/view.html?deck=walkthrough#slide=3")
            walkthrough = client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 100 && !document.body.classList.contains('presenting'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  return {
                    presenting: document.body.classList.contains('presenting'),
                    slides: Aniflow.slideCount(),
                    heading: document.querySelector('.slide-cover-title')?.textContent,
                  };
                })()""",
            )
            assert walkthrough["presenting"]
            assert walkthrough["slides"] >= 20
            assert walkthrough["heading"] == "Animated diagram walkthroughs"
            assert client.evaluate(
                session,
                """(async () => {
                  let images;
                  for (let n = 0; n < 100; n++) {
                    images = [...document.querySelectorAll('#deck img[src^="data:image/webp;base64,"]')];
                    if (images.length === 12 && images.every(img => img.naturalWidth)) break;
                    await new Promise(resolve => setTimeout(resolve, 50));
                  }
                  return images.length === 12 && images.every(img => img.naturalWidth > 0);
                })()""",
            )

            story = client.evaluate(
                session,
                """(async () => {
                  let stage;
                  for (let n = 0; n < 100; n++) {
                    stage = document.querySelector('.slide-on .diagram-stage');
                    if (stage?.diagramPlay) break;
                    await new Promise(resolve => setTimeout(resolve, 50));
                  }
                  if (!stage?.diagramPlay) return null;
                  const before = stage.diagramPlay.playing();
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                  await new Promise(resolve => setTimeout(resolve, 100));
                  return {before, playing: stage.diagramPlay.playing(),
                    pictures: stage.closest('.mermaid-diagram').title};
                })()""",
            )
            assert story and not story["before"] and story["playing"]
            assert "Pictures not shown" not in story["pictures"]
            navigation = client.evaluate(
                session,
                """(() => {
                  const stage = document.querySelector('.slide-on .diagram-stage');
                  stage.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
                  return {hash: location.hash, paused: !stage.diagramPlay.playing()};
                })()""",
            )
            assert navigation == {"hash": "#slide=4", "paused": True}
            assert (
                client.evaluate(
                    session,
                    """(() => {
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
                  return location.hash;
                })()""",
                )
                == "#slide=3"
            )
            steps = client.evaluate(
                session,
                """(() => {
                  const stage = document.querySelector('.slide-on .diagram-stage');
                  const play = stage.diagramPlay;
                  stage.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                  const forward = play.playing();
                  stage.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', shiftKey: true, bubbles: true}));
                  return {forward, back: !play.playing(), hash: location.hash};
                })()""",
            )
            assert steps == {"forward": True, "back": True, "hash": "#slide=3"}
            backwards = client.evaluate(
                session,
                """(() => {
                  const stage = document.querySelector('.slide-on .diagram-stage');
                  const play = stage.diagramPlay;
                  stage.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                  stage.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
                  return {hash: location.hash, paused: !play.playing()};
                })()""",
            )
            assert backwards == {"hash": "#slide=2", "paused": True}
            client.evaluate(
                session,
                """(async () => {
                  location.hash = '#slide=3';
                  for (let n = 0; n < 40 && !document.querySelector('.slide-on .diagram-stage'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                })()""",
            )

            client.send(
                "Emulation.setDeviceMetricsOverride",
                {"width": 430, "height": 900, "deviceScaleFactor": 1, "mobile": True},
                session,
            )
            client.send(
                "Emulation.setTouchEmulationEnabled",
                {"enabled": True, "maxTouchPoints": 2},
                session,
            )
            client.evaluate(
                session,
                "document.querySelector('.slide-on .diagram-stage').diagramPlay.restore(1, null)",
            )

            def tap(x, y):
                client.send(
                    "Input.dispatchTouchEvent",
                    {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]},
                    session,
                )
                client.send(
                    "Input.dispatchTouchEvent",
                    {"type": "touchEnd", "touchPoints": []},
                    session,
                )

            client.evaluate(
                session,
                """(() => {
                  window.touchForward = document.querySelector('.slide-on .diagram-stage').diagramPlay;
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                })()""",
            )
            assert client.evaluate(session, "window.touchForward.playing()")
            tap(400, 450)
            assert (
                client.evaluate(
                    session,
                    """(async () => {
                  for (let n = 0; n < 40 && location.hash !== '#slide=4'; n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  return location.hash;
                })()""",
                )
                == "#slide=4"
            )
            assert client.evaluate(session, "!window.touchForward.playing()")
            client.evaluate(session, "location.hash = '#slide=3'")
            client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 40 && !document.querySelector('.slide-on .diagram-stage'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  document.querySelector('.slide-on .diagram-stage').diagramPlay.restore(1, null);
                })()""",
            )
            play_button = client.evaluate(
                session,
                """(() => {
                  const r = document.querySelector('.slide-on .play-toggle').getBoundingClientRect();
                  return {x: r.x + r.width / 2, y: r.y + r.height / 2};
                })()""",
            )
            tap(play_button["x"], play_button["y"])
            assert client.evaluate(
                session,
                """(async () => {
                  const play = document.querySelector('.slide-on .diagram-stage').diagramPlay;
                  for (let n = 0; n < 40 && !play.playing(); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  return play.playing();
                })()""",
            )
            client.evaluate(
                session,
                "window.touchStory = document.querySelector('.slide-on .diagram-stage').diagramPlay",
            )
            tap(30, 450)
            assert (
                client.evaluate(
                    session,
                    """(async () => {
                  for (let n = 0; n < 40 && location.hash !== '#slide=2'; n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  return location.hash;
                })()""",
                )
                == "#slide=2"
            )
            assert client.evaluate(session, "!window.touchStory.playing()")
            client.evaluate(session, "location.hash = '#slide=3'")
            client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 40 && !document.querySelector('.slide-on .diagram-stage'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                })()""",
            )
            client.send(
                "Input.dispatchTouchEvent",
                {"type": "touchStart", "touchPoints": [{"x": 400, "y": 450}]},
                session,
            )
            client.send(
                "Input.dispatchTouchEvent",
                {"type": "touchMove", "touchPoints": [{"x": 340, "y": 450}]},
                session,
            )
            client.send(
                "Input.dispatchTouchEvent",
                {"type": "touchEnd", "touchPoints": []},
                session,
            )
            assert client.evaluate(
                session,
                "!document.querySelector('.slide-on .diagram-stage').diagramPlay.playing() && location.hash === '#slide=3'",
            )
            client.send("Emulation.clearDeviceMetricsOverride", session=session)
            client.send(
                "Emulation.setTouchEmulationEnabled", {"enabled": False}, session
            )
            client.evaluate(
                session,
                """(async () => {
                  location.hash = '#slide=1';
                  for (let n = 0; n < 40 && !document.querySelector('.slide-on .slide-cover-title'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                })()""",
            )

            def click(x, y):
                for kind in ("mousePressed", "mouseReleased"):
                    client.send(
                        "Input.dispatchMouseEvent",
                        {
                            "type": kind,
                            "x": x,
                            "y": y,
                            "button": "left",
                            "clickCount": 1,
                        },
                        session,
                    )

            click(1300, 450)
            assert client.evaluate(session, "location.hash") == "#slide=2"
            click(100, 450)
            assert client.evaluate(session, "location.hash") == "#slide=1"

            client.evaluate(
                session,
                """(async () => {
                  location.hash = '#slide=3';
                  for (let n = 0; n < 40 && !document.querySelector('.slide-on .diagram-stage'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  window.mouseStory = document.querySelector('.slide-on .diagram-stage').diagramPlay;
                  window.mouseStory.restore(1, null);
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                })()""",
            )
            assert client.evaluate(session, "window.mouseStory.playing()")
            click(1300, 450)
            assert client.evaluate(session, "location.hash") == "#slide=4"
            assert client.evaluate(session, "!window.mouseStory.playing()")

            navigate("gallery/view.html?deck=showcase#slide=4")
            reveals = client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 100 && !document.body.classList.contains('presenting'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
                  const forward = location.hash;
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', shiftKey: true, bubbles: true}));
                  return {forward, back: location.hash};
                })()""",
            )
            assert reveals == {"forward": "#slide=4&step=1", "back": "#slide=4"}
            client.evaluate(
                session,
                """(() => {
                  const open = window.open;
                  window.open = (...args) => (window.testPresenter = open(...args));
                })()""",
            )
            client.send(
                "Input.dispatchKeyEvent",
                {
                    "type": "keyDown",
                    "key": "s",
                    "code": "KeyS",
                    "windowsVirtualKeyCode": 83,
                },
                session,
            )
            client.send(
                "Input.dispatchKeyEvent",
                {
                    "type": "keyUp",
                    "key": "s",
                    "code": "KeyS",
                    "windowsVirtualKeyCode": 83,
                },
                session,
            )
            presenter = client.evaluate(
                session,
                """(async () => {
                  for (let n = 0; n < 40 && !window.testPresenter?.document.querySelector('[data-go="1"]'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  const button = window.testPresenter?.document.querySelector('[data-go="1"]');
                  if (!button) return null;
                  button.click();
                  return location.hash;
                })()""",
            )
            assert presenter == "#slide=5"
            client.evaluate(session, "window.testPresenter.close()")

            navigate("try/?template=keynote")
            state = client.evaluate(
                session,
                """(async () => {
                  const source = document.querySelector('#source');
                  for (let n = 0; n < 100 && source.disabled; n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  const style = document.querySelector('[data-setting=style]');
                  style.value = 'minimal';
                  style.dispatchEvent(new Event('change'));
                  const footer = document.querySelector('[data-setting=footer]');
                  footer.value = 'My event';
                  footer.dispatchEvent(new Event('change'));
                  document.querySelector('#save-brand').click();
                  footer.value = '';
                  footer.dispatchEvent(new Event('change'));
                  document.querySelector('#apply-brand').click();
                  return {
                    changed: source.value.includes('style: "minimal"'),
                    brand: source.value.includes('footer: "My event"'),
                    body: source.value.includes('## Thank you'),
                    saved: localStorage.getItem('aniflow-try-keynote') === source.value,
                    existing: localStorage.getItem('aniflow-try') === 'Existing draft',
                  };
                })()""",
            )
            assert all(state.values()), state
            navigate("gallery/view.html?deck=missing#slide=1")
            assert client.evaluate(
                session,
                """(async () => {
                  const status = document.querySelector('#viewer-status');
                  for (let n = 0; n < 100 && !status.textContent.includes('not found'); n++)
                    await new Promise(resolve => setTimeout(resolve, 50));
                  return status.textContent;
                })()""",
            ).startswith("Presentation not found")
        finally:
            process.terminate()
            process.wait(timeout=10)
            os.close(client.reader)
            os.close(client.writer)
            server.shutdown()
            server.server_close()
            thread.join()
