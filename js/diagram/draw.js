import { host } from '../host.js';
import { diagramEdges } from './graph.js';
import { diagramFromHash } from './hash.js';
import { diagramImages } from './images.js';
import { playScript } from './parse.js';
import { panZoom } from './stage.js';
import { diagramColours } from './theme.js';

export let diagramCount = 0;

export function drawDiagrams() {
  const diagrams = [...host.article.querySelectorAll('.highlight-source-mermaid')];
  if (!diagrams.length) return;
  const draw = async () => {
    const dark = document.documentElement.dataset.mode === 'dark';
    let themeVariables = null;
    try { themeVariables = diagramColours(dark); } catch (error) { /* mermaid's own palette */ }
    mermaid.initialize(themeVariables
      ? { startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables }
      : { startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    for (const [position, block] of diagrams.entries()) {
      const id = 'mermaid-' + diagramCount++;
      try {
        const scenarios = playScript(block.textContent, Number(block.dataset.line) || 0);
        const pictures = await diagramImages(block.textContent);
        const edges = await diagramEdges(pictures.source);
        const result = await mermaid.render(id, pictures.source);
        const holder = document.createElement('div');
        holder.className = 'mermaid-diagram';
        if (block.dataset.line) {
          holder.dataset.line = block.dataset.line;
          holder.dataset.lineEnd = block.dataset.lineEnd;
        }
        holder.innerHTML = result.svg;
        block.replaceWith(holder);
        if (block.classList.contains('slide-on')) holder.classList.add('slide-on');
        panZoom(holder, scenarios, edges, { source: block.textContent, line: block.dataset.line, lineEnd: block.dataset.lineEnd, index: position + 1 });
        const stage = holder.querySelector(':scope > .diagram-stage');
        if (stage) {
          stage.dataset.diagram = String(position + 1);
          diagramFromHash(stage);
        }
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
  const script = document.createElement('script');
  if (host.nonce) script.nonce = host.nonce;
  script.src = host.mermaid;
  script.onload = draw;
  document.head.append(script);
}
