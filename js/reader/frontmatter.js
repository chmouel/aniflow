// Front matter: a YAML block between --- lines at the very top of the file, shown as a
// small properties panel. Only a subset of YAML is read; anything else is shown as written.
export const FRONT_KEY = /^([A-Za-z0-9_][\w .\/-]*?)[ \t]*:(?:[ \t]+(.*?))?[ \t]*$/;
export const FRONT_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
export const FRONT_LIMIT = 200;

export function readFrontMatter(text) {
  const lines = text.split('\n', FRONT_LIMIT + 2);
  if (!/^---[ \t]*$/.test(lines[0])) return null;
  let close = 1;
  while (close < lines.length && close <= FRONT_LIMIT && !/^(?:---|\.\.\.)[ \t]*$/.test(lines[close])) close++;
  if (close >= lines.length || close > FRONT_LIMIT) return null;
  const inner = lines.slice(1, close);
  const first = inner.find((line) => line.trim() && !/^\s*#/.test(line));
  if (!first || /^\s/.test(first) || !FRONT_KEY.test(first)) return null;
  return { lines: close + 1, yaml: inner.join('\n'), entries: frontEntries(inner) };
}

export function frontEntries(lines) {
  const entries = [];
  for (const line of lines) {
    const key = /^\s/.test(line) ? null : FRONT_KEY.exec(line);
    if (key) entries.push({ key: key[1], inline: key[2] || '', rest: [] });
    else if (!line.trim() || /^\s*#/.test(line)) entries.length && entries[entries.length - 1].rest.push(line);
    else if (entries.length) entries[entries.length - 1].rest.push(line);
    else return null;
  }
  return entries.map(frontValue);
}

export function frontUnquote(text) {
  text = text.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return text.slice(1, -1).replace(/\\(.)/g, (all, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  if (/^'(?:[^']|'')*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  return text.replace(/\s+#.*$/, '');
}

export function frontSplit(text) {
  const items = [];
  let current = '', quote = '';
  for (const c of text) {
    if (quote) { if (c === quote) quote = ''; current += c; }
    else if (c === '"' || c === "'") { quote = c; current += c; }
    else if (c === ',') { items.push(current); current = ''; }
    else current += c;
  }
  if (current.trim() || items.length) items.push(current);
  return items.map(frontUnquote).filter((item) => item !== '');
}

export function frontValue({ key, inline, rest }) {
  const trimmed = inline.trim();
  const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:\s+#.*)?$/.exec(trimmed);
  const value = quoted ? quoted[1] : trimmed.replace(/(?:^|\s+)#.*$/, '');
  const body = rest.filter((line) => line.trim() && !/^\s*#/.test(line));
  const indent = body.length ? Math.min(...body.map((line) => /^\s*/.exec(line)[0].length)) : 0;
  const block = rest.map((line) => line.slice(indent)).join('\n').replace(/\s+$/, '');
  const raw = () => ({ key, kind: 'raw', value: [value, block].filter(Boolean).join('\n') });
  if (/^[|>][+-]?\d*$/.test(value)) {
    return { key, kind: 'text', value: value[0] === '>' ? block.replace(/([^\n])\n(?=[^\n])/g, '$1 ') : block };
  }
  if (!value.trim()) {
    if (!body.length) return { key, kind: 'empty' };
    if (body.every((line) => /^\s*-(?:\s+|$)/.test(line))) {
      return { key, kind: 'list', value: body.map((line) => frontUnquote(line.replace(/^\s*-\s*/, ''))).filter((item) => item !== '') };
    }
    return raw();
  }
  if (/^\[.*\]$/.test(value.trim()) && !body.length) return { key, kind: 'list', value: frontSplit(value.trim().slice(1, -1)) };
  if (/^[{&*!]/.test(value.trim())) return raw();
  if (body.length) {
    if (/^["']/.test(value.trim())) return raw();
    return { key, kind: 'scalar', value: [value, ...body].map((line) => line.trim()).join(' ') };
  }
  return { key, kind: 'scalar', value: frontUnquote(value) };
}

export const frontEscape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function frontDate(text) {
  const match = FRONT_DATE.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const date = hour === undefined
    ? new Date(Number(year), Number(month) - 1, Number(day))
    : zone
      ? new Date(text.replace(' ', 'T'))
      : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second || 0));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(month) - 1) return null;
  const style = hour === undefined ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' };
  return '<time datetime="' + frontEscape(text.replace(' ', 'T')) + '" title="' + frontEscape(text) + '">' + frontEscape(new Intl.DateTimeFormat(undefined, style).format(date)) + '</time>';
}

export function frontScalar(text) {
  if (text === '' || /^(?:null|~)$/i.test(text)) return '<span class="frontmatter-empty">empty</span>';
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(text)) return 'Embedded image';
  if (/^(?:true|false)$/i.test(text)) return /^t/i.test(text) ? 'Yes' : 'No';
  const date = frontDate(text);
  if (date) return date;
  if (/^https?:\/\/\S+$/i.test(text)) {
    const label = text.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return '<a href="' + frontEscape(text) + '" title="' + frontEscape(text) + '">' + frontEscape(label) + '</a>';
  }
  return frontEscape(text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (all, target, alias) => alias || target));
}

export function frontPanel(front, map) {
  const where = map ? ' data-line="' + (map[0] + 1) + '" data-line-end="' + map[1] + '"' : '';
  if (!front.entries || !front.entries.length) {
    return '<div class="frontmatter frontmatter-raw"' + where + '><pre><code>' + frontEscape(front.yaml) + '</code></pre></div>\n';
  }
  let html = '<dl class="frontmatter"' + where + '>';
  for (const entry of front.entries) {
    const tags = /^tags?$/i.test(entry.key);
    let items = entry.kind === 'list' ? entry.value : null;
    if (tags && entry.kind === 'scalar') items = entry.value.split(/[\s,]+/).filter(Boolean);
    let value;
    if (items) {
      value = items.length
        ? '<span class="frontmatter-list">' + items.map((item) => '<span class="frontmatter-pill' + (tags ? ' frontmatter-tag' : '') + '">' + (tags ? frontEscape('#' + item.replace(/^#/, '')) : frontScalar(item)) + '</span>').join('') + '</span>'
        : '<span class="frontmatter-empty">empty</span>';
    } else if (entry.kind === 'text') value = '<span class="frontmatter-text">' + frontEscape(entry.value) + '</span>';
    else if (entry.kind === 'raw') value = '<code class="frontmatter-code">' + frontEscape(entry.value) + '</code>';
    else if (entry.kind === 'empty') value = '<span class="frontmatter-empty">empty</span>';
    else value = frontScalar(entry.value);
    html += '<dt>' + frontEscape(entry.key) + '</dt><dd>' + value + '</dd>';
  }
  return html + '</dl>\n';
}

export function frontMatterPlugin(markdown) {
  markdown.block.ruler.before('table', 'aniflow_frontmatter', (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.parentType !== 'root' || state.sCount[0] !== 0) return false;
    const front = readFrontMatter(state.src);
    if (!front || front.lines > endLine) return false;
    if (silent) return true;
    const token = state.push('front_matter', '', 0);
    token.block = true;
    token.map = [0, front.lines];
    token.meta = front;
    state.line = front.lines;
    return true;
  });
  markdown.renderer.rules.front_matter = (tokens, index) => frontPanel(tokens[index].meta, tokens[index].map);
}

export function updateFrontMatter(source, changes) {
  const front = readFrontMatter(source);
  if (/^---[ \t]*(?:\r?\n|$)/.test(source) && !front) throw new Error('Fix the front matter before changing settings.');
  if (front && !front.entries) throw new Error('Fix the front matter before changing settings.');
  if (front) {
    for (const key of Object.keys(changes)) {
      const entries = front.entries.filter((entry) => entry.key === key);
      if (entries.length > 1 || entries.some((entry) => !['scalar', 'empty'].includes(entry.kind))) throw new Error('Fix the ' + key + ' setting before changing it.');
    }
  }
  const lines = source.split('\n');
  if (!front) lines.unshift('---', '---');
  let end = front ? front.lines - 1 : 1;
  for (const [key, value] of Object.entries(changes)) {
    const pattern = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*:');
    const at = lines.findIndex((line, index) => index > 0 && index < end && pattern.test(line));
    if (at >= 0) {
      for (let i = at + 1; i < end && !FRONT_KEY.test(lines[i]); i++) {
        if (/^[ \t]+\S/.test(lines[i]) && !/^[ \t]*#/.test(lines[i])) throw new Error('Fix the ' + key + ' setting before changing it.');
      }
    }
    if (!value) {
      if (at >= 0) { lines.splice(at, 1); end--; }
      continue;
    }
    const quoted = JSON.stringify(value);
    let suffix = '';
    if (at >= 0) {
      const line = lines[at];
      let quote = '';
      for (let i = line.indexOf(':') + 1; i < line.length; i++) {
        const char = line[i];
        if (quote === '"' && char === '\\') { i++; continue; }
        if (quote === "'" && char === "'" && line[i + 1] === "'") { i++; continue; }
        if (quote && char === quote) quote = '';
        else if (!quote && (char === '"' || char === "'")) quote = char;
        else if (!quote && char === '#' && /\s/.test(line[i - 1])) { suffix = ' ' + line.slice(i); break; }
      }
    }
    const line = key + ': ' + quoted + suffix;
    if (at >= 0) lines[at] = line;
    else { lines.splice(end, 0, line); end++; }
  }
  return lines.join('\n');
}
