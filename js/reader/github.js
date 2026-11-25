import { host } from '../host.js';
import { codeSteps } from './deck.js';

// Obsidian callout types drawn with the closest of GitHub's five alert styles.
export const CALLOUTS = {
  note: 'note', info: 'note', todo: 'note', abstract: 'note', summary: 'note', tldr: 'note',
  tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
  important: 'important', question: 'important', help: 'important', faq: 'important',
  example: 'important', quote: 'important', cite: 'important',
  warning: 'warning', caution: 'warning', attention: 'warning', failure: 'warning',
  fail: 'warning', missing: 'warning', bug: 'warning',
  danger: 'caution', error: 'caution',
};
export const CALLOUT_MARK = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/;

// GitHub's alert titles and octicons, so github-markdown.css styles them as on github.com.
export const ALERTS = {
  note: ['Note', 'info', 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'],
  tip: ['Tip', 'light-bulb', 'M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z'],
  important: ['Important', 'report', 'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z'],
  warning: ['Warning', 'alert', 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z'],
  caution: ['Caution', 'stop', 'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'],
};
export const ALERT_MARK = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;
export const TASK_MARK = /^\[([ xX])\][ \t]+/;

// Task lists, alerts and table alignment, written the way GitHub's renderer writes them.
export function githubFlavour(markdown) {
  markdown.core.ruler.push('aniflow_github', (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if ((token.type === 'th_open' || token.type === 'td_open') && token.attrGet('style')) {
        const align = /text-align:(left|right|center)/.exec(token.attrGet('style'));
        token.attrs = token.attrs.filter((attr) => attr[0] !== 'style');
        if (align) token.attrSet('align', align[1]);
      }
      const inline = tokens[index + 2];
      if (!inline || inline.type !== 'inline' || tokens[index + 1].type !== 'paragraph_open') continue;
      const children = inline.children || [];
      if (token.type === 'blockquote_open') {
        const match = (host.callouts ? CALLOUT_MARK : ALERT_MARK).exec(inline.content);
        if (!match) continue;
        const type = match[1].toLowerCase();
        const kind = host.callouts ? CALLOUTS[type] || 'note' : type;
        const title = host.callouts ? match[3].trim() || type[0].toUpperCase() + type.slice(1) : ALERTS[kind][0];
        const fold = host.callouts ? match[2] : '';
        let depth = 0, close = index;
        for (; close < tokens.length; close++) {
          if (tokens[close].type === 'blockquote_open') depth++;
          else if (tokens[close].type === 'blockquote_close' && --depth === 0) break;
        }
        token.meta = { alert: kind, title: title, fold: fold };
        tokens[close].meta = { alert: kind, fold: fold };
        const marker = match[0].trim();
        let consumed = '';
        while (children.length && children[0].type === 'text' && consumed.length < marker.length) consumed += children.shift().content;
        if (children.length && /^(soft|hard)break$/.test(children[0].type)) children.shift();
        if (!children.length) tokens[index + 1].hidden = tokens[index + 3].hidden = true;
      } else if (token.type === 'list_item_open') {
        const match = TASK_MARK.exec(inline.content);
        if (!match || !children.length || children[0].type !== 'text' || !children[0].content.startsWith(match[0])) continue;
        children[0].content = children[0].content.slice(match[0].length);
        const box = new state.Token('html_inline', '', 0);
        box.content = '<input type="checkbox" class="task-list-item-checkbox" disabled' + (match[1] === ' ' ? '' : ' checked') + '> ';
        children.unshift(box);
        token.attrJoin('class', 'task-list-item');
        for (let back = index - 1; back >= 0; back--) {
          const list = tokens[back];
          if (list.level === token.level - 1 && /^(bullet|ordered)_list_open$/.test(list.type)) {
            if (!(list.attrGet('class') || '').includes('contains-task-list')) list.attrJoin('class', 'contains-task-list');
            break;
          }
        }
      }
    }
  });
  // Source line ranges (1-based, inclusive) for review comments. A tight list hides its
  // paragraphs, so their range goes on the list item.
  markdown.core.ruler.push('aniflow_lines', (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!token.map || !/^(paragraph_open|heading_open|tr_open|hr|dt_open)$/.test(token.type)) continue;
      const target = token.hidden ? tokens[index - 1] : token;
      if (!target || (token.hidden && !/^(list_item_open|dd_open)$/.test(target.type))) continue;
      target.attrSet('data-line', String(token.map[0] + 1));
      target.attrSet('data-line-end', String(Math.max(token.map[1], token.map[0] + 1)));
    }
  });
  // A paragraph holding one titled picture becomes a figure, the title its caption.
  markdown.core.ruler.push('aniflow_figure', (state) => {
    const tokens = state.tokens;
    for (let index = 0; index + 2 < tokens.length; index++) {
      const [open, inline, close] = [tokens[index], tokens[index + 1], tokens[index + 2]];
      if (open.type !== 'paragraph_open' || open.hidden || inline.type !== 'inline' || close.type !== 'paragraph_close') continue;
      const children = (inline.children || []).filter((child) => !(child.type === 'text' && !child.content.trim()));
      if (children.length !== 1 || children[0].type !== 'image' || !children[0].attrGet('title')) continue;
      open.tag = close.tag = 'figure';
      const caption = new state.Token('aniflow_figcaption', '', 0);
      caption.content = children[0].attrGet('title');
      inline.children.push(caption);
    }
  });
  markdown.renderer.rules.aniflow_figcaption = (tokens, index) => '<figcaption>' + markdown.utils.escapeHtml(tokens[index].content) + '</figcaption>';
  const lines = (token, first) => token.map
    ? ' data-line="' + (token.map[0] + 1) + '" data-line-end="' + token.map[1] + '" data-code="' + first + '"'
    : '';
  const rules = markdown.renderer.rules;
  rules.code_block = (tokens, index) => {
    const token = tokens[index];
    return '<pre' + lines(token, token.map ? token.map[0] + 1 : 0) + '><code>' + markdown.utils.escapeHtml(token.content.replace(/\n$/, '')) + '</code></pre>\n';
  };
  rules.blockquote_open = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta;
    if (!meta || !meta.alert) return self.renderToken(tokens, index, options);
    const [, icon, path] = ALERTS[meta.alert];
    const svg = '<svg class="octicon octicon-' + icon + ' mr-2" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="' + path + '"></path></svg>';
    const title = markdown.utils.escapeHtml(meta.title);
    const classes = 'markdown-alert markdown-alert-' + meta.alert;
    // A foldable callout ([!type]- or [!type]+) opens closed or open.
    if (meta.fold) return '<details class="' + classes + '"' + (meta.fold === '+' ? ' open' : '') + '><summary class="markdown-alert-title">' + svg + title + '</summary>\n';
    return '<div class="' + classes + '"><p class="markdown-alert-title">' + svg + title + '</p>\n';
  };
  rules.blockquote_close = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta;
    if (!meta || !meta.alert) return self.renderToken(tokens, index, options);
    return meta.fold ? '</details>\n' : '</div>\n';
  };
  rules.fence = (tokens, index) => {
    const token = tokens[index];
    const text = token.content.replace(/\n$/, '');
    const first = token.info.trim().split(/\s+/)[0] || '';
    const language = /^(?:title=|\{)/.test(first) ? '' : first.toLowerCase().replace(/[^a-z0-9_+#.-]/g, '');
    const where = lines(token, token.map ? token.map[0] + 2 : 0);
    // ```js {1-3|5} highlights those lines one step at a time while presenting; a single step
    // ({1,4-6}) also marks them while reading.
    const marked = /\{([^{}"']*)\}/.exec(token.info);
    const named = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(token.info);
    const title = named ? (named[1] ?? named[2] ?? named[3]).trim() : '';
    const titled = title ? ' data-title="' + markdown.utils.escapeHtml(title) + '"' : '';
    const steps = (marked && codeSteps(marked[1]) ? ' data-steps="' + markdown.utils.escapeHtml(marked[1].replace(/\s+/g, '')) + '"' : '') + titled;
    if (!language) return '<pre class="notranslate"' + where + titled + '><code>' + markdown.utils.escapeHtml(text) + '</code></pre>\n';
    const body = language !== 'mermaid' && window.hljs && hljs.getLanguage(language)
      ? hljs.highlight(text, { language: language, ignoreIllegals: true }).value
      : markdown.utils.escapeHtml(text);
    // The highlight-source-* wrapper is what the mermaid step below looks for.
    return '<div class="highlight highlight-source-' + language + '"' + where + steps + '><pre class="notranslate">' + body + '</pre></div>\n';
  };
  if (rules.footnote_ref) {
    rules.footnote_caption = (tokens, index) => String(tokens[index].meta.id + 1);
    const footnoteRef = rules.footnote_ref;
    rules.footnote_ref = (...args) => footnoteRef(...args).replace('<a ', '<a data-footnote-ref aria-describedby="footnote-label" ');
    rules.footnote_block_open = () => '<section class="footnotes" data-footnotes>\n<h2 id="footnote-label" class="sr-only">Footnotes</h2>\n<ol>\n';
    rules.footnote_block_close = () => '</ol>\n</section>\n';
  }
}

// Raw HTML in the file is untrusted: DOMPurify drops scripts, handlers and javascript: URLs,
// and the fragment stays in its inert document until its links are rewritten below.
export function sanitize(markup) {
  return DOMPurify.sanitize(markup, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style'],
  });
}
