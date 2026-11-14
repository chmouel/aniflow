import { host } from '../host.js';
import { DIAGRAM_IMAGE_MISSING } from './images.js';

// A saved frame is the diagram as a standalone SVG image. Page CSS does not reach inside an
// image, so the computed styles that matter are copied inline, and pictures become data URLs.
export const XLINK_NS = 'http://www.w3.org/1999/xlink';
export const PICTURE_SHAPE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'filter', 'visibility'];
export const PICTURE_TEXT = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'margin-top', 'margin-bottom'];

export async function diagramImageData(svg) {
  const found = new Map();
  for (const image of svg.querySelectorAll('image')) {
    const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href');
    if (!href || found.has(href)) continue;
    if (href.startsWith('data:')) {
      found.set(href, href);
      continue;
    }
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) throw new Error('other site');
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status);
      const blob = await response.blob();
      found.set(href, await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
    } catch (error) {
      found.set(href, DIAGRAM_IMAGE_MISSING);
    }
  }
  return found;
}

export function diagramPicture(svg, home, size, images, still) {
  const copy = svg.cloneNode(true);
  const from = svg.querySelectorAll('*');
  const to = copy.querySelectorAll('*');
  for (let at = 0; at < from.length; at++) {
    const element = from[at];
    let names = null;
    if (element instanceof SVGTextContentElement) names = PICTURE_SHAPE.concat(PICTURE_TEXT);
    else if (element instanceof SVGGraphicsElement) names = PICTURE_SHAPE;
    else if (element instanceof HTMLElement) names = PICTURE_TEXT;
    if (!names) continue;
    const computed = getComputedStyle(element);
    for (const name of names) to[at].style.setProperty(name, computed.getPropertyValue(name), 'important');
  }
  copy.setAttribute('viewBox', [home.x, home.y, home.w, home.h].join(' '));
  copy.setAttribute('width', String(size.w));
  copy.setAttribute('height', String(size.h));
  copy.removeAttribute('style');
  for (const ink of copy.querySelectorAll(still ? '.diagram-ink :is(.ink-laser, circle)' : '.diagram-ink')) ink.remove();
  copy.querySelector('.diagram-pins')?.remove();
  for (const image of copy.querySelectorAll('image')) {
    const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href');
    image.removeAttributeNS(XLINK_NS, 'href');
    image.setAttribute('href', images.get(href) || DIAGRAM_IMAGE_MISSING);
  }
  const picture = new Image();
  picture.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  return picture.decode().then(() => picture);
}

// limit caps the longer side; the area cap keeps H.264 inside the level it is asked for.
// With captioned, a band under the diagram keeps room for two lines of caption in every frame.
// A still has no video to fit, so it scales a zoomed-in view up to the limit instead of 2x.
export async function diagramCanvas(svg, home, limit, captioned, still) {
  const PAD = 24;
  const scale = Math.min(still ? Infinity : 2, (limit - 2 * PAD) / Math.max(home.w, home.h), Math.sqrt((still ? 8000000 : 1900000) / (home.w * home.h)));
  const size = { w: home.w * scale, h: home.h * scale };
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const element = document.createElement('canvas');
  element.width = even(size.w + 2 * PAD);
  const fontSize = Math.round(Math.max(15, Math.min(30, element.width / 40)));
  const band = captioned ? Math.round(fontSize * 2 * 1.35 + PAD) : 0;
  element.height = even(size.h + 2 * PAD + band);
  const context = element.getContext('2d', { willReadFrequently: true });
  const style = getComputedStyle(host.article);
  const colour = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const background = colour('--bgColor-default', getComputedStyle(document.body).backgroundColor);
  const ink = colour('--fgColor-default', getComputedStyle(document.body).color);
  const rule = colour('--borderColor-muted', ink);
  const font = '500 ' + fontSize + 'px system-ui, -apple-system, sans-serif';
  const images = await diagramImageData(svg);
  function lines(text) {
    const room = element.width - 2 * PAD;
    const result = [''];
    for (const word of text.split(/\s+/)) {
      const last = result.length - 1;
      const joined = result[last] ? result[last] + ' ' + word : word;
      if (!result[last] || context.measureText(joined).width <= room) result[last] = joined;
      else result.push(word);
    }
    if (result.length > 2) {
      let second = result[1];
      while (second && context.measureText(second + '\u2026').width > room) second = second.slice(0, -1);
      result.splice(1, result.length, second.trimEnd() + '\u2026');
    }
    return result;
  }
  return {
    element: element,
    width: element.width,
    height: element.height,
    async draw(text) {
      const picture = await diagramPicture(svg, home, size, images, still);
      context.fillStyle = background;
      context.fillRect(0, 0, element.width, element.height);
      context.drawImage(picture, (element.width - size.w) / 2, (element.height - band - size.h) / 2, size.w, size.h);
      if (!band || !text) return;
      const top = element.height - band;
      context.fillStyle = rule;
      context.fillRect(PAD, top, element.width - 2 * PAD, 1);
      context.font = font;
      context.fillStyle = ink;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const rows = lines(text);
      const height = fontSize * 1.35;
      const first = top + band / 2 - (rows.length - 1) * height / 2;
      rows.forEach((row, at) => context.fillText(row, element.width / 2, first + at * height));
    },
    pixels: () => context.getImageData(0, 0, element.width, element.height).data,
  };
}
