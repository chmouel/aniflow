# Embed the library

The built files live in `src/aniflow/static/`: `aniflow.min.js` (a script
that defines the `Aniflow` global), `aniflow.esm.js` (an ES module),
`aniflow.css` (the reader and diagrams), `aniflow-diagrams.css` (the
diagrams alone), and `page.css` (the page around them).

## Full Markdown reader

The reader expects markdown-it with its footnote and emoji plugins, DOMPurify,
and github-markdown.css on the page. highlight.js is optional, and Mermaid is
loaded on demand from the `mermaid` URL.

```html
<article class="markdown-body"></article>
<script src="/vendor/markdown-it.min.js"></script>
<script src="/vendor/markdown-it-footnote.min.js"></script>
<script src="/vendor/markdown-it-emoji.min.js"></script>
<script src="/vendor/purify.min.js"></script>
<script src="/static/aniflow.min.js"></script>
<script>
  Aniflow.reader({
    source: '# Hello\n\nSome *markdown*.',
    mermaid: '/vendor/mermaid.min.js',
  });
</script>
```

`Aniflow.reader()` takes:

- `article`, `toc`, `bar`: elements or selectors for the document, the table
  of contents, and a top bar that shows reading progress
- `source`, `breaks`, `callouts`: the Markdown, whether single newlines break
  lines, and whether Obsidian-style callouts are drawn
- `plugins`, `preprocess`: markdown-it plugins, and a function applied to the
  text first
- `resolveLink`, `resolveImage`: return the URL a relative link or picture
  points at, or null to leave it alone; `Aniflow.directoryResolver(root, base)`
  keeps them under a served folder
- `nonce`: the page's CSP nonce, given to the Mermaid script
- `comments`: `{url, max, name}` to turn on line and diagram review against
  an aniflow-style comments endpoint, with `reviewButton` and `reviewDock`
- `presentButton`: the button that starts slides

Call `Aniflow.reader()` once per page: the markdown-it setup and the event
handlers it installs stay for the life of the page. It returns
`{ update(source) }`, which renders new Markdown into the same article, as
an editor with a live preview needs.

## Diagrams in a page you already render

A static site generator renders the Markdown itself and only needs the
diagrams brought to life. `Aniflow.diagrams()` animates the Mermaid blocks
already on the page and needs neither markdown-it, DOMPurify, nor
github-markdown.css. Load `aniflow-diagrams.css` instead of `aniflow.css`.
A block is any element with the `highlight-source-mermaid` class whose text
is the Mermaid source, as GitHub's own HTML has it:

```html
<div class="highlight highlight-source-mermaid" data-story="Red build">
  <pre>flowchart LR ...</pre>
</div>
<script src="/aniflow/aniflow.min.js"></script>
<script>
  const diagrams = Aniflow.diagrams({
    root: 'main',
    mermaid: '/aniflow/mermaid.min.js',
    dark: () => document.documentElement.classList.contains('dark'),
  });
</script>
```

For a static fallback, wrap the source and visible fallback together:

```html
<div class="aniflow-figure">
  <div class="aniflow-fallback"><img src="diagram.png" alt="Build flow"></div>
  <div class="highlight-source-mermaid" hidden><pre>flowchart LR
    A --&gt; B</pre></div>
</div>
```

Escape the Mermaid source as HTML. The fallback remains visible until the
interactive diagram initializes, and reappears while it redraws or if it
fails. The wrapper is observed for lazy loading.

`Aniflow.diagrams()` takes:

- `root`: the element or selector holding the blocks, `document.body` by
  default
- `mermaid`, `nonce`, `resolveImage`, `save`: as for `reader()`; use
  `resolveImage` to serve the built-in `/icons/` from another path.
  `mermaid` may also be a function returning the mermaid object or a
  promise of it, for a page whose `window.mermaid` is another library's.
  `resolveImage(value, block)` also receives the diagram's block and may
  return a promise
- `pageName`: a function giving the document's name, which starts the
  names of saved PNG, GIF and video files; the page's file name by default
- `dark`: a function that says whether to draw the dark palette, read at
  every draw
- `lazy`: load Mermaid and draw a diagram only when it nears the screen,
  on by default
- `autoplay`: play every diagram once when it comes into view, unless the
  reader asked for reduced motion

`data-story` on a block picks the story shown first, by number or title,
and `data-autoplay` turns autoplay on for that block alone. Diagram colours
come from the Primer variables (`--bgColor-default`, `--fgColor-accent`...)
set on the root, so map the site's palette onto them. The call returns
`{ redraw(), draw(element, signal), close() }`. Call `redraw()` when the
theme changes, and `close()` to drop its listeners when the page goes. A page that renders parts of itself later, like an editor's
preview, calls `draw(element, signal)` for each new part: the diagram's
document and window listeners stop when `signal` aborts.
`redraw(element, signal)` draws one part again under a new signal. The
Obsidian plugin in [`obsidian/`](../obsidian/) uses both.

## Python server modules

The Python package also exposes `aniflow.web`, `aniflow.page`,
`aniflow.comments`, `aniflow.themes`, `aniflow.oauth`, and `aniflow.tokens`
for apps that serve the reader themselves.
