# aniflow

A Markdown reader that plays Mermaid diagrams as animated walkthroughs. The
repo holds two things that ship together:

- a JavaScript library (ES modules under `js/`, bundled by esbuild), the
  reader itself
- a Python package (`src/aniflow/`): the `aniflow` command, which serves a
  folder of Markdown read only, and the server pieces other apps can build
  their own reader on

The built JS and CSS are committed under `src/aniflow/static/` and ship in
the wheel, so `uvx --from git+...` works without Node.

## Files

- `js/index.js`: the public API. `reader(options)` copies the options into
  the shared `host` object (`js/host.js`), renders, then wires slides,
  review and diagram deep links. `diagrams(options)` animates the Mermaid
  blocks already in a page rendered elsewhere (a static site) and returns
  `{redraw()}`. Also exports `directoryResolver(root)`,
  `diagramExport(stage, kind)` for a gif, mp4, webm or png of one diagram,
  `addBusyCheck`, `busy`, `parse` (`playScript`), `diagramLines`,
  `flowchartLines`, `readFrontMatter` and `setSpeed`.
- `js/host.js`: page settings every module reads (`host.article`,
  `host.nonce`, `host.mermaid`, `host.resolveImage`, `host.commentsUrl`...).
  Only `reader()` and `diagrams()` write it; `host.save(name, blob)` hands
  a finished diagram file to the page behind the reader's `save` option.
- `js/reader/`: `render.js` (the markdown-it pipeline and
  `directoryUrl()`), `frontmatter.js`, `github.js` (task lists, alerts,
  callouts, `sanitize()` through DOMPurify), `code.js` (copy buttons),
  `show.js` (TOC rail, progress line), `review.js` (line review and
  comments), `deck.js` (slide directives, deck front matter, code steps,
  layout picking and the allow lists).
- `js/diagram/`: the walkthrough engine, see below.
- `js/slides.js`: presentation mode. `js/slides/tools.js`: the overview,
  presenter window, laser, `showSlide()` and `deckCheck()` for export and
  `--check`.
- `js/css/`: `page.css` (the page around the reader: bar, layout, notice),
  `markdown.css`, `diagram.css` and `reader.css` (the document, diagrams,
  slides). The
  build joins all three into `aniflow.css`; `diagram.css`
  alone is `aniflow-diagrams.css` for `diagrams()`.
- `build.mjs`: esbuild to `aniflow.min.js` (IIFE, global `Aniflow`),
  `aniflow.esm.js`, `aniflow.css`, `page.css`. `--check` fails when the
  committed files differ from a fresh build.
- `js-test/`: `node --test` unit tests for the pure parts (story parsing,
  front matter, the GIF encoder).
- `src/aniflow/cli.py`: the `aniflow` command (`main`), its `Server` and
  `Handler`, the directory page and the reader page with aniflow's own
  chrome. `aniflow --spec` prints `spec.md` and exits.
  `aniflow --share FILE` (`-` for stdin) prints a `TRY_URL#src=` link,
  raw deflate plus unpadded base64url as `docs/site/try/try.js` decodes
  it, warns on stderr about pictures the site cannot load
  (`offline_pictures()`) and links over `SHARE_LONG`, and exits; `--open`
  also opens it. `aniflow --check FILE...` draws each file in headless
  Chrome (`export.check()`) and prints failed diagrams, dropped steps,
  missing pictures and deck problems (overflow, word count, unknown
  directives, missing backgrounds) as `file:line:`, exiting 1 on any.
  `aniflow --slides pdf|png FILE` drives Chrome over
  `--remote-debugging-pipe` (`export.DevTools`) and writes the deck as one
  PDF of JPEG pages or one PNG per slide. `aniflow --base /pub` mounts the
  server under a path for a reverse proxy: every URL it writes carries the
  prefix, and a request that still has the prefix is accepted as well, so
  the proxy may strip it or not. `--no-comments` drops the review UI and
  answers 404 on the comment routes, for a read-only public deployment.
  `--brand NAME` puts that name in the bar, the masthead and the tab icon, and
  `--logo VALUE` (a path inside the served folder, an https URL or a data:
  image; `logo.svg`/`logo.png` there are picked up on their own) puts a
  picture beside it. `logo_url()` refuses a path that leaves the folder.
  `--allow-host NAME` adds a host name to answer for, and a POST's Origin only
  has to match its host, since a TLS proxy terminates the scheme before it
  arrives.
  `--github-oauth CLIENT_ID` turns on sign-in: writes then need a session
  (`ANIFLOW_GITHUB_SECRET`, `ANIFLOW_SIGNIN_SECRET`), a comment belongs to
  the account that wrote it, and `--comments-admin LOGIN` may change any.
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
- `src/aniflow/oauth.py`: GitHub sign-in for the comment routes, `SignIn`:
  the authorize redirect, the code exchange and the `user` lookup (`urllib`,
  `TIMEOUT`), and the HMAC-sealed cookies in `seal`/`unseal`/`cookie`. A
  session lives in the cookie alone, scoped to the base path, `HttpOnly`,
  `SameSite=Lax`, `Secure` when the proxy reports https. `next_path()` keeps
  the way back inside the base, so the callback cannot be an open redirect.
- `src/aniflow/comments.py`: the review comments model: `view()`,
  `change()`, `anchor()`, `prompt()`, `in_lines()`, `target_valid()` and the
  limits. Storage is a JSON file the caller chooses.
- `src/aniflow/export.py`: `aniflow --export`, which serves a document to
  headless Chrome from a one-shot server on 127.0.0.1 and writes one gif, mp4,
  webm or png per diagram: `chrome()`, `command()`, `ExportServer` and the
  page script that posts the files back.
- `src/aniflow/themes.py`: `THEMES`, `READER_THEMES`, the theme CSS and
  `theme_script(nonce, key)`, which applies the choice kept in localStorage
  under `key` (`aniflow-theme` here; an embedding app passes its own).
- `src/aniflow/brand.py`, `ui.py`: the aniflow wordmark (`WORDMARK`),
  `masthead()` which trades it for a name or a logo, `favicon()` for the tab
  icon, and the file browser.
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
- `docs/site/`: the GitHub Pages site, plain HTML and CSS with a live
  diagram from `site.js`. `assemble.sh` copies the built library, its vendor
  files, the icons and the `html[data-mode]` colours into the ignored
  `docs/site/lib/`; the `pages` workflow runs it and deploys on pushes to
  main. Preview with `docs/site/assemble.sh` then
  `python3 -m http.server -d docs/site`. `try/` is a playground: a textarea
  feeding `update()`, examples (the first, a slide deck touring every
  feature, loads when there is no link or draft), a draft in localStorage
  `aniflow-try` and share links holding the source deflated into
  `#src=`. It lists Mermaid
  errors, dropped walkthrough steps (`.diagram-problems li[data-line]`) and
  missing pictures under the editor by document line, and marks those lines
  in the textarea. Its Present button (`presentButton`) shows the preview
  as slides, and body `presenting` CSS in `site.css` hides the rest of the
  page.

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
1240px, and a progress line runs under the bar. `reader()` returns
`update(source)`, which sets `host.source` and calls `show()` again. Each
`show()` aborts the previous `host.render` AbortController and makes a new
one; per-diagram document and window listeners pass its `signal`, a player
stops ticking once its stage is disconnected, and `drawDiagrams` skips
blocks replaced mid-render.

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
`preprocess` runs on the text first, so an embedding app can add its own
Markdown flavour through these.

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
match opens the diagram full screen through `stage.diagramFull()`. The site's
hero button holds `diagramPlay` too, calling `playing()` and `toggle()` to run
the demo.

Labels and captions are set with `textContent` or `fillText`. Unresolved
steps are dropped with a reason and listed by `diagramWarnings()` in a
`.play-warn` badge. Picture nodes render as `g.image-shape`. Before
rendering, `diagramImages()` rewrites each `img:` value through
`host.resolveImage`, keeps https, same-origin paths and `data:image/`, and
turns anything else into `DIAGRAM_IMAGE_MISSING`, adding `constraint: "on"`
when the shape lacks it so the picture keeps its ratio. Each picture is preloaded
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
before the slide changes (`slideMove`). Space and Shift+Space call
`slideMove` like the arrows, and a click (not a drag, not on `SLIDE_CONTROLS`)
on the left or right half of the screen does too, captured before a diagram's
own click and double-click handlers. The dock buttons, rail ticks, `n`/`b`
and Shift+PageDown/PageUp call `present()` directly and skip the story;
`present()` pauses a story still playing on the slide it leaves and plays
the new slide's story when it has not started or has finished
(`slideAutoplay`, off with front matter `autoplay: false|no|off`, or under
reduced motion); a diagram drawn later on the open slide calls it through
`host.onSlideDiagram`. The dock's
theme button cycles `window.aniflowThemes` (set by `theme_script`, which
fires `aniflow-theme` on window after each change; `reader()` redraws the
diagrams on it when the effective theme changed) and only exists where
`window.aniflowTheme` does. `reader_page(theme=True)` adds `theme_select()`
to the bar.

Deck settings come from front matter and `<!-- slide: ... -->`,
`<!-- column -->`, `<!-- reveal -->` and `<!-- notes: ... -->` comments,
which the `aniflow_slide` core rule (`deck.js`) turns into `data-slide-*`
attributes checked against allow lists before DOMPurify runs. Each slide
is drawn on a fixed canvas (1600×900, 1600×1200 for 4:3, 900 wide on a
narrow portrait screen) scaled through
`--slide-scale` (`scaleCanvas()`); `fitSlide()` shrinks overflowing text
and flags what still overflows. `slideLayout()` picks a layout when none is
given, `dressCanvas()` adds the backgrounds, footer and numbers. The
arrows walk reveal items, then code steps (```` ```js {1|2-3|all} ````),
then the diagram story, and `#slide=N&step=K` keeps the place. `morph`
uses `document.startViewTransition`. `s` opens the presenter popup, which
the opener paints with `slideThumb()` clones; `o` opens the overview. For
export, the page script in `export.py` sets `window.aniflowSlides`, and
Python steps through `Aniflow.showSlide(i)`, which adds `body.slide-export`.

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
  `textContent`, never as HTML.
- With sign-in on, a comment carries its author's GitHub id and only that
  account, or the admin, may edit or delete it. The session cookie is
  sealed with `ANIFLOW_SIGNIN_SECRET`, so a forged or edited cookie signs
  nobody in. Comment storage sits outside the served
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
CI runs all of the above, pytest on Python 3.12 to 3.14. The end-to-end GIF
export test runs only with `ANIFLOW_EXPORT_E2E=1` and Chrome installed.
`.pre-commit-config.yaml` runs the same at the pre-push stage
(`uvx pre-commit install --hook-type pre-push`).

For UI changes, run `uv run aniflow docs --port 8792` and load pages in
headless Chrome:

```sh
google-chrome-stable --headless=new --window-size=430,900 --screenshot=out.png URL
```

Check the console for errors and CSP violations.
