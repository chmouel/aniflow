import { flowchartLines } from './parse.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function diagramNodes(svg) {
  const nodes = new Map();
  for (const group of svg.querySelectorAll(':is(g.node, g.image-shape)[id]')) {
    const match = /-flowchart-(.+)-\d+$/.exec(group.id);
    if (match && !nodes.has(match[1])) nodes.set(match[1], group);
  }
  return nodes;
}

// Every drawn flowchart edge with its two ends. mermaid's parser knows them, including the
// edges declared with an id (A ok@--> B), whose data-id is that id and names neither end.
export async function diagramEdges(source) {
  if (!flowchartLines(source)) return null;
  try {
    const parsed = await mermaid.mermaidAPI.getDiagramFromText(source);
    return parsed.db.getEdges().filter((edge) => edge.id).map((edge) => ({ id: String(edge.id), from: edge.start, to: edge.end }));
  } catch (error) {
    return null;
  }
}
// Without the parser, generated ids (L_<from>_<to>_<n>) are split against the known node ids.
export function diagramLinks(svg, nodes, edges) {
  const ends = new Map((edges || []).map((edge) => [edge.id, edge]));
  const links = [];
  for (const path of svg.querySelectorAll('path[data-edge][data-id]')) {
    const id = path.dataset.id;
    let from = ends.get(id)?.from;
    let to = ends.get(id)?.to;
    if (!edges) {
      for (const name of nodes.keys()) {
        if (!id.startsWith('L_' + name + '_')) continue;
        const rest = id.slice(name.length + 3);
        to = [...nodes.keys()].find((end) => rest.startsWith(end + '_') && /^\d+$/.test(rest.slice(end.length + 1)));
        if (to) {
          from = name;
          break;
        }
      }
    }
    if (!from || !to || !nodes.has(from) || !nodes.has(to)) continue;
    const label = svg.querySelector('g.edgeLabels [data-id="' + CSS.escape(id) + '"]');
    links.push({ id: id, from: from, to: to, path: path, label: label && (label.closest('g.edgeLabel') || label) });
  }
  return links;
}
