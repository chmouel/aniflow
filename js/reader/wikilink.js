import { host } from '../host.js';
import { slug } from './slug.js';

const PICTURE = /\.(?:png|jpe?g|gif|webp|svg|avif)$/i;
// A target ending in one of these names a file; anything else is a note name (as on the server).
const FILE = /\.(?:md|markdown|png|jpe?g|gif|webp|svg|avif|pdf)$/i;

// [[target#heading|label]] or ![[picture.png|300]]. A pipe may be escaped as \| inside tables.
export function parseWikilink(body) {
  const text = body.replace(/\\\|/g, '|');
  const bar = text.indexOf('|');
  const link = (bar < 0 ? text : text.slice(0, bar)).trim();
  const label = bar < 0 ? '' : text.slice(bar + 1).trim();
  const hash = link.indexOf('#');
  return {
    target: (hash < 0 ? link : link.slice(0, hash)).trim(),
    heading: hash < 0 ? '' : link.slice(hash + 1).trim(),
    label,
  };
}

// Where a target goes: the server's answer when it sent one, else the name as a path beside the
// note (for pages rendered without an aniflow server). null when the server found nothing.
export function wikilinkUrl(target) {
  if (host.wikilinks) return Object.hasOwn(host.wikilinks, target) ? host.wikilinks[target] : null;
  const path = FILE.test(target) ? target : target + '.md';
  return path.split('/').map(encodeURIComponent).join('/');
}

export function wikilinkPlugin(markdown) {
  markdown.inline.ruler.before('link', 'aniflow_wikilink', (state, silent) => {
    const start = state.pos;
    const embed = state.src.charCodeAt(start) === 0x21;
    const open = start + (embed ? 1 : 0);
    if (state.src.charCodeAt(open) !== 0x5b || state.src.charCodeAt(open + 1) !== 0x5b) return false;
    const close = state.src.indexOf(']]', open + 2);
    if (close < 0) return false;
    const body = state.src.slice(open + 2, close);
    if (!body.trim() || /[\[\]\n]/.test(body)) return false;
    if (!silent) {
      const token = state.push('aniflow_wikilink', '', 0);
      token.meta = { ...parseWikilink(body), embed };
    }
    state.pos = close + 2;
    return true;
  });
  markdown.renderer.rules.aniflow_wikilink = (tokens, index) => {
    const { target, heading, label, embed } = tokens[index].meta;
    const escape = markdown.utils.escapeHtml;
    const fragment = heading ? '#' + encodeURIComponent(slug(heading)) : '';
    const url = target ? wikilinkUrl(target) : '';
    if (embed && PICTURE.test(target)) {
      const width = /^(\d{1,4})(?:x(\d{1,4}))?$/.exec(label);
      if (url === null) return '<span class="wikilink-missing" title="No picture by that name">' + escape(target) + '</span>';
      const size = width ? ' width="' + width[1] + '"' + (width[2] ? ' height="' + width[2] + '"' : '') : '';
      return '<img src="' + escape(url) + '" alt="' + escape(width ? target : label || target) + '"' + size + '>';
    }
    const text = label || (heading && target ? target + ' › ' + heading : heading || target);
    if (url === null) return '<span class="wikilink-missing" title="No note by that name">' + escape(text) + '</span>';
    return '<a class="wikilink" href="' + escape(url + fragment) + '">' + escape(text) + '</a>';
  };
}
