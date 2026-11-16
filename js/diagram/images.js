import { host } from '../host.js';
import { flowchartLines } from './parse.js';

// Pictures in flowchart nodes, A@{ img: "logo.png" }. Mermaid fails the whole diagram when one
// does not load, so each is checked first and a missing or refused one becomes a placeholder.
export const DIAGRAM_IMAGE = /(\bimg\s*:\s*)(?:(["'])(.*?)\2|([^\s,}"']+))/g;
export const DIAGRAM_IMAGE_SAFE = /^(?:https:\/\/|\/(?![\/\\])|data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,])/i;
export const DIAGRAM_IMAGE_MISSING = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#888" stroke-width="2" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="4" stroke-dasharray="4 3"/><path d="M11 33l9-10 7 7 4-4 6 7"/><circle cx="31" cy="18" r="3"/></svg>');

export function diagramImageUrl(value) {
  const url = host.resolveImage(value);
  if (url) return url;
  return DIAGRAM_IMAGE_SAFE.test(value) && !/["'{}\s]/.test(value) ? value : null;
}
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('timed out')), 8000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('did not load')); };
    image.src = url;
  });
}

export async function diagramImages(source) {
  const shapes = /@\{[^}]*\}/g;
  if (!flowchartLines(source)) return { source: source, problems: [] };
  const wanted = new Map();
  for (const shape of source.matchAll(shapes)) {
    for (const match of shape[0].matchAll(DIAGRAM_IMAGE)) {
      const value = match[3] ?? match[4];
      if (!wanted.has(value)) wanted.set(value, diagramImageUrl(value));
    }
  }
  if (!wanted.size) return { source: source, problems: [] };
  const problems = [];
  await Promise.all([...wanted].map(async ([value, url]) => {
    if (!url) {
      problems.push(value + ' (not allowed)');
      wanted.set(value, DIAGRAM_IMAGE_MISSING);
      return;
    }
    try { await loadImage(url); } catch (error) {
      problems.push(value + ' (' + error.message + ')');
      wanted.set(value, DIAGRAM_IMAGE_MISSING);
    }
  }));
  // Without constraint "on" mermaid stretches the picture to the label's width.
  const rewritten = source.replace(shapes, (shape) => {
    const drawn = shape.replace(DIAGRAM_IMAGE, (match, key, quote, quoted, bare) => key + '"' + wanted.get(quoted ?? bare) + '"');
    return shape.search(DIAGRAM_IMAGE) < 0 || /\bconstraint\s*:/.test(shape) ? drawn : drawn.replace(/\s*\}$/, ', constraint: "on" }');
  });
  return { source: rewritten, problems: problems };
}
