// Slide decks: the <!-- slide --> family of directives, deck settings from front matter,
// code line steps and the layout a slide gets when it names none. Nothing here touches the
// page, so it runs under node --test.
import { readFrontMatter } from './frontmatter.js';

export const LAYOUTS = ['title', 'cover', 'section', 'center', 'columns', 'split', 'quote', 'stat', 'full', 'grid'];
export const BACKGROUNDS = ['accent', 'muted', 'inverse', 'gradient', 'none'];
export const TRANSITIONS = ['slide', 'fade', 'zoom', 'morph', 'none'];
export const ACCENTS = ['blue', 'violet', 'green', 'amber', 'red'];
export const FONTS = ['modern', 'classic', 'mono', 'rounded'];
export const ASPECTS = ['16:9', '4:3'];
export const SLIDE_FLAGS = ['reveal', 'dim', 'flip'];
export const WORDS_MAX = 90;

const DIRECTIVE = /^<!--[ \t]*(slide|column|reveal|notes)(?=[\s:]|-->)([\s\S]*?)-->\s*$/;
const PICTURE = /^(?:\.{0,2}\/|[\w-][\w./-]*\.(?:png|jpe?g|gif|webp|svg|avif)$|https:\/\/)/i;

// One HTML comment block: {kind, options, notes, problems}, or null when it is an ordinary comment.
export function slideDirective(text) {
  const match = DIRECTIVE.exec(String(text).trim());
  if (!match) return null;
  const kind = match[1];
  let rest = match[2];
  const problems = [];
  if (kind === 'notes') {
    if (!/^\s*:|^[ \t]*\n/.test(rest)) return null;
    return { kind, notes: rest.replace(/^\s*:/, '').replace(/^\s*\n|\s+$/g, '').replace(/^[ \t]+/, ''), problems };
  }
  rest = rest.replace(/^\s*:/, '').trim();
  if (kind !== 'slide') {
    if (rest) problems.push(kind + ' takes no options: ' + rest);
    return { kind, options: {}, problems };
  }
  const options = {};
  for (const word of rest.match(/[\w-]+="[^"]*"|\S+/g) || []) {
    const [key, ...parts] = word.split('=');
    const value = parts.join('=').replace(/^"(.*)"$/, '$1');
    if (!parts.length) {
      if (SLIDE_FLAGS.includes(key)) options[key] = true;
      else if (LAYOUTS.includes(key)) options.layout = key;
      else problems.push('unknown slide option: ' + key);
    } else if (key === 'layout') {
      if (LAYOUTS.includes(value)) options.layout = value;
      else problems.push('unknown layout: ' + value + ' (one of ' + LAYOUTS.join(', ') + ')');
    } else if (key === 'bg') {
      if (BACKGROUNDS.includes(value)) options.bg = value;
      else if (PICTURE.test(value) && !/["'()\\\s]/.test(value)) options.image = value;
      else problems.push('unknown background: ' + value + ' (one of ' + BACKGROUNDS.join(', ') + ' or a picture path)');
    } else if (key === 'transition') {
      if (TRANSITIONS.includes(value)) options.transition = value;
      else problems.push('unknown transition: ' + value + ' (one of ' + TRANSITIONS.join(', ') + ')');
    } else if (key === 'story') {
      if (/^[1-9]\d?$/.test(value)) options.story = Number(value);
      else problems.push('story needs a story number: ' + value);
    } else problems.push('unknown slide option: ' + key);
  }
  return { kind, options, problems };
}

const yes = (value) => /^(?:true|yes|on)$/i.test(String(value).trim());
const no = (value) => /^(?:false|no|off)$/i.test(String(value).trim());

// Deck-wide settings from front matter entries; problems name the key and what it takes.
export function deckSettings(entries) {
  const settings = { autoplay: true, numbers: false, aspect: '16:9' };
  const problems = [];
  for (const entry of entries || []) {
    const value = entry.kind === 'scalar' || entry.kind === 'text' ? String(entry.value).trim() : '';
    const pick = (key, allowed) => {
      if (allowed.includes(value.toLowerCase())) settings[key] = value.toLowerCase();
      else problems.push(key + ': ' + (value || entry.kind) + ' is not one of ' + allowed.join(', '));
    };
    switch (entry.key) {
      case 'accent': pick('accent', ACCENTS); break;
      case 'font': pick('font', FONTS); break;
      case 'aspect': pick('aspect', ASPECTS); break;
      case 'transition': pick('transition', TRANSITIONS); break;
      case 'theme': if (/^[\w-]{1,40}$/.test(value)) settings.theme = value; break;
      case 'numbers': settings.numbers = yes(value); break;
      case 'autoplay': settings.autoplay = !no(value); break;
      case 'footer': if (value) settings.footer = value.slice(0, 160); break;
      case 'logo':
        if (PICTURE.test(value) && !/["'()\\\s]/.test(value)) settings.logo = value;
        else if (value) problems.push('logo: ' + value + ' is not a picture path');
        break;
      case 'title': case 'author': case 'date':
        if (value) settings[entry.key] = value.slice(0, 200);
        break;
      default:
    }
  }
  return { settings, problems };
}

// "1-3|5|all" from a fence's {…}: one array of [first, last] ranges per step, null for every line.
export function codeSteps(text) {
  const steps = [];
  for (const part of String(text).split('|')) {
    const step = part.trim();
    if (step === 'all' || step === '*') {
      steps.push(null);
      continue;
    }
    const ranges = [];
    for (const piece of step.split(',')) {
      const range = /^\s*(\d{1,5})(?:\s*-\s*(\d{1,5}))?\s*$/.exec(piece);
      if (!range) return null;
      const first = Number(range[1]), last = Number(range[2] || range[1]);
      if (!first || last < first) return null;
      ranges.push([first, last]);
    }
    steps.push(ranges);
  }
  return steps.length ? steps : null;
}

// The layout a slide gets when it names none. summary describes the slide's blocks: kinds lists
// them in order, without the heading, notes and markers.
export function pickLayout(summary) {
  const { kinds = [], heading = null, first = false, words = 0, stat = false, cards = 0, cover = false } = summary;
  const only = (...wanted) => kinds.length > 0 && kinds.every((kind) => wanted.includes(kind));
  const count = (kind) => kinds.filter((each) => each === kind).length;
  if (cover) return 'cover';
  if (kinds.includes('columns')) return 'columns';
  if (first && heading === 'h1' && words < 60 && only('p')) return 'cover';
  if (first && heading === 'h1' && !kinds.length) return 'cover';
  if (!kinds.length) return heading ? 'section' : 'title';
  if (only('quote') && count('quote') === 1) return 'quote';
  if (only('picture') && count('picture') === 1) return 'full';
  if (count('diagram') === 1 && only('diagram', 'p') && words < 240) return 'full';
  if (count('picture') === 1 && only('picture', 'p', 'list') && words <= 80) return 'split';
  if (stat && only('p', 'list') && words <= 60) return 'stat';
  if (cards >= 2 && cards <= 6 && only('list') && count('list') === 1) return 'grid';
  return 'title';
}

// Columns open after the slide's heading and close where the slide ends, so <!-- column -->
// only has to mark where the next one starts.
function wrapColumns(state, escape) {
  const tokens = state.tokens;
  const top = tokens.filter((token) => token.level === 0);
  const level = top.some((token) => token.type === 'heading_open' && token.tag === 'h2') ? 'h2'
    : top.filter((token) => token.type === 'heading_open' && token.tag === 'h1').length > 1 ? 'h1' : '';
  const boundary = (token) => token.level === 0 && ((token.type === 'heading_open' && token.tag === level) || token.meta?.slideMark);
  const out = [];
  let region = [];
  const flush = () => {
    const marks = region.filter((token) => token.meta?.column);
    if (!marks.length) {
      out.push(...region);
      region = [];
      return;
    }
    let start = 0;
    while (start < region.length && region[start].meta?.slideMark) start++;
    if (region[start]?.type === 'heading_open') {
      while (start < region.length && region[start].type !== 'heading_close') start++;
      start++;
    }
    const open = new state.Token('html_block', '', 0);
    open.content = '<div class="slide-columns" data-columns="' + escape(String(marks.length + 1)) + '"><div class="slide-column">\n';
    const close = new state.Token('html_block', '', 0);
    close.content = '</div></div>\n';
    let end = region.length;
    while (end > start && region[end - 1].meta?.notes) end--;
    for (const mark of region.slice(start, end)) if (mark.meta?.column) mark.content = '</div><div class="slide-column">' + mark.content;
    out.push(...region.slice(0, start), open, ...region.slice(start, end), close, ...region.slice(end));
    region = [];
  };
  for (const token of tokens) {
    if (boundary(token) && !(region.length && region.every((each) => each.meta?.slideMark))) flush();
    region.push(token);
  }
  flush();
  state.tokens = out;
}

// Turns directive comments into hidden markers the presenter reads, and front matter with a
// title into a cover slide. Values reach the page as escaped attributes only.
export function deckPlugin(markdown) {
  const escape = markdown.utils.escapeHtml;
  const lines = (token) => token.map ? ' data-line="' + (token.map[0] + 1) + '" data-line-end="' + token.map[1] + '"' : '';
  markdown.core.ruler.push('aniflow_slide', (state) => {
    let marks = 0;
    for (const token of state.tokens) {
      if (token.type !== 'html_block' || token.level !== 0) continue;
      const directive = slideDirective(token.content);
      if (!directive) continue;
      const problem = directive.problems.length ? ' data-problem="' + escape(directive.problems.join('; ')) + '"' : '';
      if (directive.kind === 'notes') {
        token.meta = { notes: true };
        token.content = '<aside class="slide-notes"' + lines(token) + '>' + markdown.render(directive.notes) + '</aside>\n';
      } else if (directive.kind === 'column') {
        token.meta = { column: true };
        token.content = '<div class="slide-column-mark"' + lines(token) + problem + '></div>\n';
      } else if (directive.kind === 'reveal') {
        token.content = '<div class="slide-reveal-mark"' + lines(token) + problem + '></div>\n';
      } else {
        marks++;
        token.meta = { slideMark: true };
        const options = directive.options;
        const attrs = ['layout', 'bg', 'image', 'transition', 'story']
          .filter((key) => options[key] !== undefined)
          .map((key) => ' data-' + key + '="' + escape(String(options[key])) + '"').join('')
          + SLIDE_FLAGS.filter((flag) => options[flag]).map((flag) => ' data-' + flag).join('');
        token.content = '<div class="slide-mark"' + lines(token) + attrs + problem + '></div>\n';
      }
    }
    wrapColumns(state, escape);
    const front = readFrontMatter(state.src);
    const { settings } = deckSettings(front?.entries);
    const top = state.tokens.filter((token) => token.level === 0);
    const opening = top.find((token) => token.type !== 'front_matter' && token.type !== 'html_block');
    const decked = marks || top.some((token) => token.type === 'heading_open' && token.tag === 'h2')
      || top.filter((token) => token.type === 'heading_open' && token.tag === 'h1').length > 1;
    if (settings.title && decked && !(opening?.type === 'heading_open' && opening.tag === 'h1')) {
      const cover = new state.Token('html_block', '', 0);
      const byline = [settings.author, settings.date].filter(Boolean).map(escape).join(' · ');
      cover.content = '<div class="slide-mark" data-layout="cover" data-auto></div>'
        + '<div class="slide-autocover"><p class="slide-cover-title">' + escape(settings.title) + '</p>'
        + (byline ? '<p class="slide-cover-byline">' + byline + '</p>' : '') + '</div>'
        + '<div class="slide-mark"></div>\n';
      cover.meta = { slideMark: true };
      const at = state.tokens[0]?.type === 'front_matter' ? 1 : 0;
      state.tokens.splice(at, 0, cover);
    }
  });
}
