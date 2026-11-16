import { host } from './host.js';
import { addBusyCheck, isBusy } from './diagram/busy.js';
import { drawDiagrams, redrawDiagrams } from './diagram/draw.js';
import { diagramFromHash } from './diagram/hash.js';
import { diagramLines, flowchartLines, playScript } from './diagram/parse.js';
import { saveBlob } from './diagram/share.js';
import { setDiagramSpeed } from './diagram/speed.js';
import { readFrontMatter } from './reader/frontmatter.js';
import { directoryUrl, renderLocal } from './reader/render.js';
import { initReview } from './reader/review.js';
import { initShow, show } from './reader/show.js';
import { initSlides, slideGroups, stopPresenting } from './slides.js';
import { deckCheck, showSlide, slideCount } from './slides/tools.js';

const element = (value) => typeof value === 'string' ? document.querySelector(value) : value || null;
const none = () => null;

// Renders options.source (markdown text) into options.article and wires up the table of
// contents, diagrams, slides and line review for the elements given.
export function reader(options = {}) {
  const article = element(options.article || 'article.markdown-body');
  if (!article) throw new Error('aniflow: no article element');
  const comments = options.comments || {};
  Object.assign(host, {
    article,
    source: options.source ?? '',
    toc: element(options.toc),
    bar: element(options.bar),
    nonce: options.nonce || '',
    breaks: Boolean(options.breaks),
    callouts: Boolean(options.callouts),
    plugins: options.plugins || [],
    preprocess: options.preprocess || ((text) => text),
    resolveImage: options.resolveImage || none,
    resolveLink: options.resolveLink || none,
    mermaid: options.mermaid || 'mermaid.min.js',
    commentsUrl: comments.url || '',
    commentMax: comments.max || 4000,
    reviewName: comments.name || 'Review',
    save: options.save || ((name, blob) => saveBlob(blob, name)),
    reviewToggle: element(options.reviewButton),
    dock: element(options.reviewDock),
    presentButton: element(options.presentButton),
    onShow: null,
    onDiagram: null,
  });
  initShow();
  show(renderLocal());
  initSlides();
  initReview();
  // Mermaid takes its colours from the page when it draws, so a theme change draws the diagrams again.
  let drawnTheme = document.documentElement.dataset.theme;
  addEventListener('aniflow-theme', () => {
    if (document.documentElement.dataset.theme === drawnTheme) return;
    drawnTheme = document.documentElement.dataset.theme;
    host.render?.abort();
    host.render = new AbortController();
    redrawDiagrams();
  });
  if (location.hash && !/^#L\d/.test(location.hash)) {
    let target = null;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (error) { /* bad hash */ }
    if (target) target.scrollIntoView();
  }
  addEventListener('hashchange', () => {
    for (const stage of article.querySelectorAll('.diagram-stage[data-diagram]')) if (diagramFromHash(stage)) break;
  });
  return {
    // Renders new markdown into the same article, replacing the diagrams already drawn.
    update(source) {
      stopPresenting();
      host.source = source ?? '';
      show(renderLocal());
      if (host.presentButton) host.presentButton.hidden = slideGroups().length < 2;
    },
  };
}

// Draws the Mermaid blocks already on a page, for a site that renders its own Markdown. A block
// is a .highlight-source-mermaid element holding the diagram source as text; data-story and
// data-autoplay on it choose the story shown first and play it once it is on screen.
export function diagrams(options = {}) {
  const root = element(options.root || document.body);
  if (!root) throw new Error('aniflow: no root element');
  Object.assign(host, {
    article: root,
    nonce: options.nonce || '',
    resolveImage: options.resolveImage || none,
    mermaid: options.mermaid || 'mermaid.min.js',
    dark: options.dark || null,
    lazy: options.lazy !== false,
    autoplay: Boolean(options.autoplay),
    commentsUrl: '',
    save: options.save || ((name, blob) => saveBlob(blob, name)),
    onShow: null,
    onDiagram: null,
    onSlideDiagram: null,
  });
  const fresh = () => {
    host.render?.abort();
    host.render = new AbortController();
  };
  fresh();
  drawDiagrams();
  addEventListener('hashchange', () => {
    for (const stage of root.querySelectorAll('.diagram-stage[data-diagram]')) if (diagramFromHash(stage)) break;
  });
  return {
    // Draws every diagram again, after the page switched between light and dark.
    redraw() {
      fresh();
      redrawDiagrams();
    },
  };
}

// Keeps links and pictures that point inside the served directory root, for resolveLink/resolveImage.
export const directoryResolver = (root) => (value) => directoryUrl(value, root);

// Saves one diagram as a file: kind is gif, mp4, webm, or png for a still of the view it is
// showing. It resolves to {name, blob} and rejects when the diagram could not be drawn or saved.
export async function diagramExport(stage, kind) {
  const element = stage instanceof Element ? stage : document.querySelector(stage);
  if (!element) throw new Error('aniflow: no diagram to export');
  if (!['gif', 'mp4', 'webm', 'png'].includes(kind)) throw new Error('aniflow: ' + kind + ' is not an export kind');
  let result = null;
  if (kind === 'png') {
    if (!element.diagramPicture) throw new Error('aniflow: that diagram is not drawn yet');
    result = await element.diagramPicture();
  } else {
    if (!element.diagramExport) throw new Error('aniflow: that diagram has no walkthrough to save');
    result = await element.diagramExport(kind);
  }
  if (!result) throw new Error('aniflow: the ' + kind + ' was cancelled');
  return result;
}

export {
  addBusyCheck,
  deckCheck,
  diagramLines,
  flowchartLines,
  isBusy as busy,
  playScript as parse,
  readFrontMatter,
  setDiagramSpeed as setSpeed,
  showSlide,
  slideCount,
};
