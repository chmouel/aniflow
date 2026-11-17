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
                  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
                  await new Promise(resolve => setTimeout(resolve, 100));
                  return {before, playing: stage.diagramPlay.playing(),
                    pictures: stage.closest('.mermaid-diagram').title};
                })()""",
            )
            assert story and not story["before"] and story["playing"]
            assert "Pictures not shown" not in story["pictures"]

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
