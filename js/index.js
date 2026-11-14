import { host } from './host.js';
import { addBusyCheck, isBusy } from './diagram/busy.js';
import { diagramFromHash } from './diagram/hash.js';
import { diagramLines, flowchartLines, playScript } from './diagram/parse.js';
import { setDiagramSpeed } from './diagram/speed.js';
import { readFrontMatter } from './reader/frontmatter.js';
import { directoryUrl, renderLocal } from './reader/render.js';
import { initReview } from './reader/review.js';
import { initShow, show } from './reader/show.js';
import { initSlides } from './slides.js';

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
      host.source = source ?? '';
      show(renderLocal());
    },
  };
}

// Keeps links and pictures that point inside the served directory root, for resolveLink/resolveImage.
export const directoryResolver = (root) => (value) => directoryUrl(value, root);

export {
  addBusyCheck,
  diagramLines,
  flowchartLines,
  isBusy as busy,
  playScript as parse,
  readFrontMatter,
  setDiagramSpeed as setSpeed,
};
