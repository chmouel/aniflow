#!/usr/bin/env bash
# Puts the built library, the files it loads and the icons in docs/site/lib,
# so the page can run the live diagram. The Pages workflow runs it too.
set -euo pipefail
cd "$(dirname "$0")"
src=../../src/aniflow
rm -rf lib
mkdir -p lib/vendor
cp "$src"/static/aniflow.min.js "$src"/static/aniflow.css lib/
for file in markdown-it.min.js markdown-it-footnote.min.js markdown-it-emoji.min.js \
  purify.min.js mermaid.min.js github-markdown.css; do
  cp "$src/vendor/$file" lib/vendor/
done
cp "$src"/vendor/LICENSE.* lib/vendor/
cp -r "$src/icons" lib/icons
mkdir -p lib/templates
cp "$src"/templates/* lib/templates/
# Keep the downloadable walkthrough self-contained.
python3 - <<'PY'
from base64 import b64encode
from pathlib import Path

folder = Path('lib/templates')
deck = folder / 'walkthrough.md'
text = deck.read_text(encoding='utf-8')
for name in ('walkthrough-pencil-page.webp', 'walkthrough-pencil-magnifier.webp', 'walkthrough-pencil-plane.webp',
             'walkthrough-pencil-paths.webp', 'walkthrough-pencil-keys.webp',
             'walkthrough-pencil-comments.webp', 'walkthrough-pencil-presentation.webp',
             'walkthrough-pencil-tag.webp', 'walkthrough-pencil-parallel.webp',
             'walkthrough-pencil-stopwatch.webp', 'walkthrough-pencil-drawing.webp',
             'walkthrough-pencil-save.webp'):
    reference = '](' + name + ')'
    if text.count(reference) != 1:
        raise ValueError('Expected one reference to ' + name)
    data = b64encode((folder / name).read_bytes()).decode('ascii')
    text = text.replace(reference, '](data:image/webp;base64,' + data + ')')
deck.write_text(text, encoding='utf-8')
PY
# GitHub's markdown colours keyed on html[data-mode], so the demo stays light
# whatever the visitor's system prefers.
PYTHONPATH=../../src python3 -c 'from aniflow.themes import theme_reader_css; print(theme_reader_css())' >lib/modes.css
