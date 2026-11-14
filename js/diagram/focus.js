import { host } from '../host.js';
import { diagramBusy } from './busy.js';
import { diagramLinks, diagramNodes } from './graph.js';

// Clicking a box puts it in the spotlight: the box and its arrows stay bright, the rest dims.
// Shift, Ctrl or Cmd adds boxes; clicking the lone box, the background or Escape clears it.
export function focusDiagram(stage, svg, edges) {
  const nodes = diagramNodes(svg);
  if (!nodes.size) return;
  const names = new Map([...nodes].map(([name, group]) => [group, name]));
  const links = diagramLinks(svg, nodes, edges).map((link) => ({ from: link.from, to: link.to, parts: [link.path, link.label].filter(Boolean) }));
  stage.classList.add('focusable');
  const selected = new Set();
  let held = false;
  function paint() {
    for (const element of svg.querySelectorAll('.focus-on, .focus-near')) element.classList.remove('focus-on', 'focus-near');
    for (const name of selected) nodes.get(name).classList.add('focus-on');
    for (const link of links) {
      if (!selected.has(link.from) && !selected.has(link.to)) continue;
      for (const part of link.parts) part.classList.add('focus-near');
      for (const end of [link.from, link.to]) if (!selected.has(end)) nodes.get(end).classList.add('focus-near');
    }
    stage.classList.toggle('focusing', selected.size > 0);
    if (held !== selected.size > 0) diagramBusy(held = !held);
  }
  let start = null;
  stage.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; }, true);
  stage.addEventListener('click', (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    // Pointer capture makes the stage the click target, so look under the pointer instead.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!under || !stage.contains(under) || under.closest('.diagram-tools, .diagram-pins') || stage.classList.contains('commenting')) return;
    const inside = (element) => {
      const rect = element.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    // A picture box has a gap between its image and its label, which still counts as the box.
    const group = under.closest(':is(g.node, g.image-shape)') || [...names.keys()].find(inside);
    const name = group && names.get(group);
    if (!name) selected.clear();
    else if (event.shiftKey || event.ctrlKey || event.metaKey) selected.has(name) ? selected.delete(name) : selected.add(name);
    else if (selected.has(name) && selected.size === 1) selected.clear();
    else {
      selected.clear();
      selected.add(name);
    }
    paint();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !selected.size || !stage.isConnected) return;
    const dialog = stage.closest('dialog');
    if (!dialog && document.querySelector('dialog[open]')) return;
    event.preventDefault();
    selected.clear();
    paint();
  }, { signal: host.render?.signal });
  return {
    get: () => [...selected],
    set(wanted) {
      selected.clear();
      for (const name of wanted) if (nodes.has(name)) selected.add(name);
      paint();
    },
  };
}
