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
# GitHub's markdown colours keyed on html[data-mode], so the demo stays light
# whatever the visitor's system prefers.
PYTHONPATH=../../src python3 -c 'from aniflow.themes import theme_reader_css; print(theme_reader_css())' >lib/modes.css
