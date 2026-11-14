# aniflow

A Markdown reader that plays Mermaid diagrams as animated walkthroughs. The
repo holds two things that ship together:

- a JavaScript library (ES modules under `js/`, bundled by esbuild), the
  reader itself
- a Python package (`src/aniflow/`): the `aniflow` command, which serves a
  folder of Markdown read only, and the server pieces sharei builds its own
  reader on

The built JS and CSS are committed under `src/aniflow/static/` and ship in
the wheel, so `uvx --from git+...` works without Node.

## Files

- `js/index.js`: the public API. `reader(options)` copies the options into
  the shared `host` object (`js/host.js`), renders, then wires slides,
  review and diagram deep links. Also exports `directoryResolver(root)`,
  `addBusyCheck`, `busy`, `parse` (`playScript`), `diagramLines`,
  `flowchartLines`, `readFrontMatter` and `setSpeed`.
- `js/host.js`: page settings every module reads (`host.article`,
  `host.nonce`, `host.mermaid`, `host.resolveImage`, `host.commentsUrl`...).
  Only `reader()` writes it.
- `js/reader/`: `render.js` (the markdown-it pipeline and
  `directoryUrl()`), `frontmatter.js`, `github.js` (task lists, alerts,
  callouts, `sanitize()` through DOMPurify), `code.js` (copy buttons),
  `show.js` (TOC rail, progress line), `review.js` (line review and
  comments).
- `js/diagram/`: the walkthrough engine, see below.
- `js/slides.js`: presentation mode.
- `js/css/`: `page.css` (the page around the reader: bar, layout, notice),
  `markdown.css` and `reader.css` (the document, diagrams, slides). The
  build joins the last two into `aniflow.css`.
- `build.mjs`: esbuild to `aniflow.min.js` (IIFE, global `Aniflow`),
  `aniflow.esm.js`, `aniflow.css`, `page.css`. `--check` fails when the
  committed files differ from a fresh build.
- `js-test/`: `node --test` unit tests for the pure parts (story parsing,
  front matter, the GIF encoder).
- `src/aniflow/cli.py`: the `aniflow` command (`main`), its `Server` and
  `Handler`, the directory page and the reader page with aniflow's own
  chrome. `aniflow --spec` prints `spec.md` and exits.
- `src/aniflow/web.py`: `Handler`, a `BaseHTTPRequestHandler` with the
  request checks (`request_allowed()`, `host_allowed()`,
  `origin_allowed()`; `allowed_hosts()` and `allowed_origins()` are for a
  subclass to widen), the send helpers (`send_file` answers a single
  `Range`), `send_asset()` for `/vendor/`, `/static/` and `/icons/`,
  `send_local_file()`, and the comment routes (`send_comments`,
  `handle_comment`). Also `vector_headers`, `is_markdown`, `ICON_NAMES`.
- `src/aniflow/page.py`: `reader_page()` builds the HTML document,
  `reader_options()` the JSON options, `reader_headers()` the CSP.
  `BOOT_JS` reads `#markdown-source` and `#aniflow-options`, merges
  `window.aniflowPage` (hooks an embedding app sets in an earlier script)
  and calls `Aniflow.reader`.
- `src/aniflow/comments.py`: the review comments model: `view()`,
  `change()`, `anchor()`, `prompt()`, `in_lines()`, `target_valid()` and the
  limits. Storage is a JSON file the caller chooses.
- `src/aniflow/themes.py`: `THEMES`, `READER_THEMES`, the theme CSS and
  `theme_script(nonce, key)`, which applies the choice kept in localStorage
  under `key` (`aniflow-theme` here, sharei passes its own).
- `src/aniflow/brand.py`, `ui.py`: the aniflow logo and the file browser.
- `src/aniflow/help.md`: the `/help` demo and walkthrough.
- `src/aniflow/spec.md`: the walkthrough syntax reference for agents.
  Update it with every change to the `%%` syntax, picture rules or built-in
  icons; a test checks that its icon table matches `ICON_NAMES`.
- `src/aniflow/vendor/`: markdown-it with its footnote and emoji plugins,
  DOMPurify, highlight.js, github-markdown.css and mermaid, each with its
  licence. Only the names in `web.VENDOR_TYPES` are served.
- `src/aniflow/icons/`: diagram icons at `/icons/<name>.svg`, 48×48 tiles
  built from Lucide (ISC, `LICENSE.lucide`) by `contrib/icons/make_icons.py`.
  Regenerate rather than edit: `npm pack lucide-static`, unpack, then
  `python contrib/icons/make_icons.py <package> src/aniflow/icons`.
- `skills/aniflow-diagrams/SKILL.md`: an agent skill for writing
  walkthroughs that look good. It reads the syntax from `aniflow --spec`
  rather than restating it, so it holds workflow and taste only.
- `docs/diagram-walkthroughs.md`: the design notes and a live demo, with its
  icons in `docs/diagram-icons/`.

## The aniflow command

`/` redirects to `/files/`. `/files/<path>` lists a folder (folders and
Markdown only), renders a Markdown file, or serves any other file through
`send_local_file()` (`?raw` gives Markdown and text as `text/plain`).
`/help` renders `help.md`. `/comments/{help|file/<path>}` reads comments
(`?lines=A-B`, `?format=prompt`), and POST `/comments/{add,edit,delete}/...`
changes them. Comments live in
`$XDG_CACHE_HOME/aniflow/comments/<root hash>/<document hash>.json`, so
source files are never written. Any other POST is a 405.

## Reader internals

The page carries the markdown as an escaped JSON block. `renderLocal()`
renders it with markdown-it, writes GitHub's markup for task lists, alerts,
tables, footnotes and code (`div.highlight.highlight-source-<lang>`, which
the mermaid step looks for) so github-markdown.css styles it, then sanitizes
with DOMPurify. `reader.css` styles the result scoped under `.reader`. Code
blocks get a copy button, the contents become a sticky side rail from
1240px, and a progress line runs under the bar.

An `aniflow_lines` core rule copies markdown-it's `token.map` onto blocks as
`data-line`/`data-line-end` (1-based, inclusive) and `data-code` on code
blocks. YAML front matter at line 1 is claimed by `aniflow_frontmatter` and
drawn as a `dl.frontmatter` panel. The review button turns on a line gutter
built from those attributes; picking lines sets `#Lx-Ly`. Comments are
fetched from and posted to `host.commentsUrl` and drawn with `textContent`.
On read, `comments.anchor()` keeps a comment whose lines still equal its
`quote`, moves it to the single other place the quote appears, or marks it
`outdated`.

`resolveLink` and `resolveImage` turn a relative link or picture into a URL,
or return null to leave it alone. `plugins` are markdown-it plugins and
`preprocess` runs on the text first; sharei passes its Obsidian flavour
through these.

### Diagrams

`drawDiagrams()` (`draw.js`) loads mermaid from `host.mermaid` with
`host.nonce`, and colours its base theme from the page's CSS variables
(`theme.js`). `panZoom()` (`stage.js`) gives each diagram drag to pan,
Ctrl/Cmd+wheel or pinch to zoom and a full-screen `<dialog>` by rewriting the
SVG's `viewBox`. A one-finger touch at the fitted size is left to page
scrolling.

A flowchart's `%% play: title`, `%% A -> B : label`, `%% skip A B` and
`%% wait MS` lines are read by `playScript()` (`parse.js`; mermaid drops
them, so each step keeps its document `line`) and played by `playDiagram()`
(`player.js`). Steps resolve to `g.node` ids (`<svg>-flowchart-<id>-<n>`)
and `path[data-edge]` `data-id`s. `diagramEdges()` gets `{id, from, to}`
for every edge from mermaid's parser (`mermaidAPI.getDiagramFromText`),
since a declared id (`A ok@--> B`) names neither end; `diagramLinks()`
(`graph.js`) pairs paths with ends, falling back to splitting `L_` ids. A
wait becomes the next step's `hold`, a duration-only segment with no
`stop`, so rail ticks, `#step=` and step mode count real steps only. A step
is `{moves: [{from, to, path, reverse}], label, caption}`; several moves
share one segment, each dot timed by its own edge. `active` is a Set.

`sequenceDiagram` blocks play too: participants map to their actor groups
and lifelines (`.play-actor`), and each `messageLine0/1` gets its ends from
the nearest lifelines. Step mode stops at segments flagged `stop` and goes
back by replaying instantly. Its key handler (arrows, j/k, PageUp/PageDown,
Space, `<`/`>`) runs before panZoom's, so a plain arrow steps and
Shift+arrow pans.

Deep links (`#diagram=N&story=S&step=K&focus=A,B`, `hash.js`) use the
`where()`/`restore()` API `playDiagram` returns and `focusDiagram`'s
`get()`/`set()`, kept on the stage as `diagramPlay` and `diagramFocus`. A
match opens the diagram full screen through `stage.diagramFull()`.

Labels and captions are set with `textContent` or `fillText`. Unresolved
steps are dropped with a reason and listed by `diagramWarnings()` in a
`.play-warn` badge. Picture nodes render as `g.image-shape`. Before
rendering, `diagramImages()` rewrites each `img:` value through
`host.resolveImage`, keeps https, same-origin paths and `data:image/`, and
turns anything else into `DIAGRAM_IMAGE_MISSING`. Each picture is preloaded
with a timeout, since one failed load makes mermaid reject the diagram.

`focusDiagram()` makes boxes clickable and sets `focus-on`/`focus-near`.
Camera follow (`stage.diagramCamera.look(rect)`) glides the viewBox to the
step, toggled in localStorage `aniflow-diagram-follow`. The pen and laser
draw into a `g.diagram-ink` in diagram coordinates. Diagram comments
(`comments.js`) run in full screen when the page takes comments, in an
`aside.diagram-notes` beside the stage; pins are `g.diagram-pins`. Saving
fires `aniflow-comments` on window so the line review redraws.

The share menu (`share.js`) copies a deep link or saves a PNG, GIF
(`gifWriter()`, stepping the timeline offline) or video (`captureStream()`
and `MediaRecorder`). `diagramPicture()` (`picture.js`) draws a clone of the
SVG with computed styles inlined and pictures as data URLs. A page CSP that
blocks `blob:` images is fine: frames go through `data:` URLs.

Speed is `diagramRate()`, the shared speed (localStorage
`aniflow-diagram-speed`) times `DIAGRAM_PACE`; `setDiagramSpeed()` fires
`aniflow-diagram-speed` on window. `isBusy()` is true while a diagram plays,
draws or shows a dialog; an app that reloads itself checks it first
(`addBusyCheck` adds its own conditions).

Slides (`slides.js`) split the article's direct children on H2, or H1 when
there are several, keep `#slide=N`, and let a diagram's story steps run
before the slide changes.

## Security rules

Keep these when changing code.

- Every request goes through `request_allowed()`: the Host header must name
  this machine (local names, non-global IPs, `allowed_hosts()`), and a POST's
  Origin must be the same origin or in `allowed_origins()`.
- `local_path()` resolves request paths against the served root, then checks
  `relative_to(root)`; hidden names (leading `.`) are never listed or served,
  and symlinks leading out are refused.
- The markdown is untrusted. Everything markdown-it produces goes through
  DOMPurify, and the source is embedded with `<`, `>` and `&` escaped.
  Reader pages use a nonce-only `script-src`, so a served `.js` file can
  never run. Don't add inline handlers or unnonced scripts.
- SVG is served with `vector_headers` (a `sandbox` CSP) everywhere, HTML
  files with `sandbox allow-scripts allow-forms`.
- Comment text and every walkthrough label reach the page through
  `textContent`, never as HTML. Comment storage sits outside the served
  folder.
- `/vendor/`, `/static/` and `/icons/` serve fixed names only, never a path
  joined from the request.

## Conventions

- Python 3.12+, stdlib only, no runtime dependencies.
- Node is only for building and testing; the library has no runtime
  dependencies of its own, and esbuild is the only dev dependency. The page
  provides markdown-it (with footnote and emoji), DOMPurify,
  github-markdown.css and optionally highlight.js; mermaid loads on demand.
- Colours come from CSS variables, never literals.
- Storage keys, events and markdown-it rules use the `aniflow-` /
  `aniflow_` prefix.

## Testing

```sh
npm ci && npm test && npm run check
uv run pytest
uv run ruff format . && uv run ruff check .
```

After changing `js/`, run `npm run build` and commit the files it writes.
CI runs all of the above, pytest on Python 3.12 to 3.14.
`.pre-commit-config.yaml` runs the same at the pre-push stage
(`uvx pre-commit install --hook-type pre-push`).

For UI changes, run `uv run aniflow docs --port 8792` and load pages in
headless Chrome:

```sh
google-chrome-stable --headless=new --window-size=430,900 --screenshot=out.png URL
```

Check the console for errors and CSP violations.
