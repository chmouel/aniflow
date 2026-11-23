import { host } from '../host.js';
import { drawDiagrams, redrawDiagrams } from './draw.js';
import { diagramFromHash } from './hash.js';
import { saveBlob } from './share.js';

const element = (value) => typeof value === 'string' ? document.querySelector(value) : value || null;
const none = () => null;

// Draws the Mermaid blocks already on a page, for a site that renders its own Markdown. A block
// is a .highlight-source-mermaid element holding the diagram source as text; data-story and
// data-autoplay on it choose the story shown first and play it once it is on screen.
// A page that renders parts later draws each with draw(element, signal); aborting the signal
// drops that part's listeners.
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
    pageName: options.pageName || null,
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
  const life = new AbortController();
  const part = (signal) => signal ? { signal } : host.render;
  fresh();
  drawDiagrams();
  addEventListener('hashchange', () => {
    for (const stage of root.querySelectorAll('.diagram-stage[data-diagram]')) if (diagramFromHash(stage)) break;
  }, { signal: life.signal });
  return {
    // With element, abort that part's old signal before calling.
    redraw(element, signal) {
      if (element) return redrawDiagrams(element, part(signal));
      fresh();
      redrawDiagrams();
    },
    draw(element, signal) {
      drawDiagrams(element, part(signal));
    },
    close() {
      life.abort();
      host.render?.abort();
    },
  };
}
