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

// With host.lazy, Mermaid is fetched once the first diagram comes near the screen.
function nearScreen(blocks) {
  if (!host.lazy || !('IntersectionObserver' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      resolve();
    }, { rootMargin: '600px 0px' });
    for (const block of blocks) watcher.observe(block);
  });
}

export function drawDiagrams() {
  const diagrams = [...host.article.querySelectorAll('.highlight-source-mermaid')];
  if (!diagrams.length) return;
  const draw = async () => {
    const dark = host.dark ? Boolean(host.dark()) : document.documentElement.dataset.mode === 'dark';
    let themeVariables = null;
    try { themeVariables = diagramColours(dark); } catch (error) { /* mermaid's own palette */ }
    mermaid.initialize(themeVariables
      ? { startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables }
      : { startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    for (const [position, block] of diagrams.entries()) {
      if (!block.isConnected) continue;
      const id = 'mermaid-' + diagramCount++;
      try {
        const scenarios = playScript(block.textContent, Number(block.dataset.line) || 0);
        const pictures = await diagramImages(block.textContent);
        const edges = await diagramEdges(pictures.source);
        const result = await mermaid.render(id, pictures.source);
        if (!block.isConnected) {
          document.getElementById('d' + id)?.remove();
          continue;
        }
        const holder = document.createElement('div');
        holder.className = 'mermaid-diagram';
        if (block.dataset.line) {
          holder.dataset.line = block.dataset.line;
          holder.dataset.lineEnd = block.dataset.lineEnd;
        }
        holder.innerHTML = result.svg;
        holder.diagramBlock = block;
        block.replaceWith(holder);
        if (block.classList.contains('slide-on')) holder.classList.add('slide-on');
        panZoom(holder, scenarios, edges, { source: block.textContent, line: block.dataset.line, lineEnd: block.dataset.lineEnd, index: position + 1 });
        const stage = holder.querySelector(':scope > .diagram-stage');
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
        if (stage && holder.classList.contains('slide-on')) host.onSlideDiagram?.();
        if (pictures.problems.length) holder.title += '\nPictures not shown: ' + pictures.problems.join(', ');
        if (host.onDiagram) host.onDiagram();
      } catch (error) {
        document.getElementById('d' + id)?.remove();
        block.title = 'Mermaid: ' + (error.message || error);
      }
    }
  };
  if (window.mermaid) {
    draw();
    return;
  }
  nearScreen(diagrams).then(() => {
    if (window.mermaid) return draw();
    const script = document.createElement('script');
    if (host.nonce) script.nonce = host.nonce;
    script.src = host.mermaid;
    script.onload = draw;
    document.head.append(script);
  });
}

// Puts back the blocks drawn under root and draws them again, for a page whose theme changed.
export function redrawDiagrams() {
  if (diagramDialog?.open) diagramDialog.close();
  for (const holder of host.article.querySelectorAll('.mermaid-diagram')) {
    if (holder.diagramBlock) holder.replaceWith(holder.diagramBlock);
  }
  drawDiagrams();
}
