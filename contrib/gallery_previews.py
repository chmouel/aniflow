"""Render a preview strip for every gallery deck: the cover beside two inner slides.

Needs the installed aniflow, Chrome and ImageMagick 7 (`magick`).
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Inner slides shown beside the cover, 1-based.
PICKS = {"showcase": (3, 5), "minimal": (6, 5), "walkthrough": (3, 8)}
DEFAULT_PICKS = (2, 5)

root = Path(__file__).resolve().parents[1]
templates = root / "src/aniflow/templates"
output = root / "docs/site/gallery/previews"
output.mkdir(parents=True, exist_ok=True)
if not shutil.which("magick"):
    sys.exit("gallery_previews.py needs ImageMagick 7 (magick) on PATH")
catalogue = json.loads((templates / "catalogue.json").read_text(encoding="utf-8"))
wanted = set(sys.argv[1:])
unknown = wanted - {deck["id"] for deck in catalogue}
if unknown:
    sys.exit("unknown gallery decks: " + ", ".join(sorted(unknown)))
for deck in catalogue:
    if wanted and deck["id"] not in wanted:
        continue
    with tempfile.TemporaryDirectory(prefix="aniflow-gallery-") as folder:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "aniflow.cli",
                "--slides",
                "png",
                str(templates / deck["file"]),
                "-o",
                folder,
            ],
            check=True,
        )
        stem = Path(deck["file"]).stem
        cover, top, bottom = (
            str(Path(folder) / f"{stem}-{number:02d}.png")
            for number in (1, *PICKS.get(deck["id"], DEFAULT_PICKS))
        )
        # A 1200x450 strip: the cover at 800x450, then two 392x221 slides stacked
        # beside it, with transparent 8px gaps so the page shows through.
        subprocess.run(
            [
                "magick",
                "-background",
                "none",
                "(",
                cover,
                "-resize",
                "800x450!",
                ")",
                "(",
                top,
                "-resize",
                "392x221!",
                "(",
                bottom,
                "-resize",
                "392x221!",
                "-splice",
                "0x8",
                ")",
                "-append",
                "-splice",
                "8x0",
                ")",
                "+append",
                "-strip",
                "-quality",
                "82",
                str(output / f"{deck['id']}.webp"),
            ],
            check=True,
        )
