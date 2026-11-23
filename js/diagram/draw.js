import { host } from '../host.js';
import { diagramEdges } from './graph.js';
import { diagramFromHash } from './hash.js';
import { diagramImages } from './images.js';
import { playScript } from './parse.js';
import { diagramDialog, panZoom } from './stage.js';
import { diagramColours } from './theme.js';

export let diagramCount = 0;

// A block's data-story picks the story shown first, by number or title; data-autoplay plays it
// once the diagram is mostly on screen.
function storyNumber(wanted, scenarios) {
  if (!wanted) return 0;
  if (/^\d+$/.test(wanted)) return Number(wanted);
  const found = scenarios.findIndex((scenario) => scenario.title.toLowerCase() === wanted.trim().toLowerCase());
  return found + 1;
}

// host.mermaid may be a function for a page whose window.mermaid is another library's.
let loading = null;
function loadMermaid() {
  const factory = typeof host.mermaid === 'function';
  if (!factory && window.mermaid) return Promise.resolve(window.mermaid);
  return loading ||= (factory ? Promise.resolve().then(host.mermaid) : mermaidScript()).catch((error) => {
    loading = null;
    throw error;
  });
}

function mermaidScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    if (host.nonce) script.nonce = host.nonce;
    script.src = host.mermaid;
    script.onload = () => resolve(window.mermaid);
    script.onerror = () => {
      script.remove();
      reject(new Error('mermaid did not load'));
    };
    document.head.append(script);
  });
}

// A stage's listeners take host.render's signal when it is built, so this ties them to render.
function withRender(render, build) {
  const outer = host.render;
  host.render = render;
  try { return build(); } finally { host.render = outer; }
}

function autoplay(stage) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const watcher = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    if (stage.isConnected && !stage.diagramPlay.playing() && !stage.diagramPlay.where().step) stage.diagramPlay.toggle();
  }, { threshold: 0.6 });
  watcher.observe(stage);
  host.render?.signal.addEventListener('abort', () => watcher.disconnect(), { once: true });
}

// With host.lazy, Mermaid is fetched once the first diagram comes near the screen. If the part
// is dropped first, the watcher goes and the promise never settles.
function nearScreen(blocks, signal) {
  if (!host.lazy || !('IntersectionObserver' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    if (signal?.aborted) return;
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      resolve();
    }, { rootMargin: '600px 0px' });
    for (const block of blocks) watcher.observe(block.closest('.aniflow-figure') || block);
    signal?.addEventListener('abort', () => watcher.disconnect(), { once: true });
  });
}

export function drawDiagrams(root = host.article, render = host.render) {
  const diagrams = [...root.querySelectorAll('.highlight-source-mermaid')];
  if (!diagrams.length) return;
  const draw = async (mermaid) => {
    const dark = host.dark ? Boolean(host.dark()) : document.documentElement.dataset.mode === 'dark';
    let themeVariables = null;
    try { themeVariables = diagramColours(dark, root); } catch (error) { /* mermaid's own palette */ }
    mermaid.initialize(themeVariables
      ? { startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables }
      : { startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    for (const [position, block] of diagrams.entries()) {
      if (render?.signal.aborted) return;
      if (!block.isConnected) continue;
      const id = 'mermaid-' + diagramCount++;
      let holder;
      const fallback = block.closest('.aniflow-figure')?.querySelector('.aniflow-fallback');
      const source = block.textContent;
      try {
        const scenarios = playScript(source, Number(block.dataset.line) || 0);
        const pictures = await diagramImages(source, block);
        const edges = await diagramEdges(pictures.source, mermaid);
        const result = await mermaid.render(id, pictures.source);
        if (!block.isConnected || render?.signal.aborted) {
          document.getElementById('d' + id)?.remove();
          continue;
        }
        holder = document.createElement('div');
        holder.className = 'mermaid-diagram';
        if (block.dataset.line) {
          holder.dataset.line = block.dataset.line;
          holder.dataset.lineEnd = block.dataset.lineEnd;
        }
        holder.append(new DOMParser().parseFromString(result.svg, 'text/html').body.firstElementChild);
        holder.diagramBlock = block;
        block.before(holder);
        holder.style.visibility = 'hidden';
        if (block.classList.contains('slide-on')) holder.classList.add('slide-on');
        const stage = withRender(render, () => {
          panZoom(holder, scenarios, edges, { source, line: block.dataset.line, lineEnd: block.dataset.lineEnd, index: position + 1 });
          const stage = holder.querySelector(':scope > .diagram-stage');
          if (fallback && !stage) throw new Error('Diagram stage did not initialize');
          if (stage) {
            stage.dataset.diagram = String(position + 1);
            const story = storyNumber(block.dataset.story, scenarios);
            if (stage.diagramPlay && story) stage.diagramPlay.restore(story, null);
            const wanted = stage.diagramPlay && !block.diagramPlayed && (host.autoplay || 'autoplay' in block.dataset);
            if (!diagramFromHash(stage) && wanted) {
              block.diagramPlayed = true;
              autoplay(stage);
            }
          }
          return stage;
        });
        if (stage && holder.classList.contains('slide-on')) host.onSlideDiagram?.();
        if (pictures.problems.length) holder.title += '\nPictures not shown: ' + pictures.problems.join(', ');
        if (host.onDiagram) host.onDiagram();
        holder.style.visibility = '';
        block.remove();
        if (fallback) fallback.hidden = true;
      } catch (error) {
        document.getElementById('d' + id)?.remove();
        holder?.remove();
        if (fallback) fallback.hidden = false;
        block.title = 'Mermaid: ' + (error.message || error);
      }
    }
  };
  const ready = window.mermaid && typeof host.mermaid !== 'function' ? Promise.resolve() : nearScreen(diagrams, render?.signal);
  ready.then(loadMermaid).then(draw).catch(console.error);
}

// Puts back the blocks drawn under root and draws them again, for a page whose theme changed.
export function redrawDiagrams(root = host.article, render = host.render) {
  if (diagramDialog?.open) diagramDialog.close();
  for (const holder of root.querySelectorAll('.mermaid-diagram')) {
    const fallback = holder.closest('.aniflow-figure')?.querySelector('.aniflow-fallback');
    if (fallback) fallback.hidden = false;
    if (holder.diagramBlock) holder.replaceWith(holder.diagramBlock);
  }
  drawDiagrams(root, render);
}
