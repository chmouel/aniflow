import { host } from '../host.js';
import { codeSteps } from './deck.js';

export const COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

// Each code block gets a header with its language and a copy button.
export function frameCode() {
  for (const pre of host.article.querySelectorAll('pre')) {
    if (pre.closest('.code-block, .mermaid-diagram')) continue;
    const box = pre.closest('.highlight, .snippet-clipboard-content') || pre;
    if (box.classList.contains('highlight-source-mermaid')) continue;
    const kind = [...box.classList].map((name) => /^highlight-(?:source|text)-(.+)$/.exec(name)).find(Boolean);
    const figure = document.createElement('figure');
    figure.className = 'code-block';
    const head = document.createElement('div');
    head.className = 'code-block-head';
    const label = document.createElement('span');
    const title = box.dataset.title || pre.dataset.title;
    label.textContent = title || (kind ? kind[1] : 'text');
    if (title) {
      label.className = 'code-title';
      if (kind) label.title = kind[1];
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Copy code');
    button.innerHTML = COPY_ICON + '<span>Copy</span>';
    let reset = 0;
    button.addEventListener('click', async () => {
      const done = await copyText(pre.textContent);
      button.classList.toggle('copied', done);
      button.lastChild.textContent = done ? 'Copied' : 'Copy failed';
      clearTimeout(reset);
      reset = setTimeout(() => {
        button.classList.remove('copied');
        button.lastChild.textContent = 'Copy';
      }, 1600);
    });
    const steps = box.dataset.steps ? codeSteps(box.dataset.steps) : null;
    const tools = document.createElement('span');
    tools.className = 'code-block-tools';
    // Marked lines are placed by line height, which wrapping would throw off.
    if (!steps) tools.append(wrapButton(figure));
    tools.append(button);
    head.append(label, tools);
    const body = document.createElement('div');
    body.className = 'code-body';
    box.replaceWith(figure);
    body.append(box);
    figure.append(head, body);
    figure.classList.toggle('wrapped', !steps && wrapping());
    if (steps && steps.length === 1 && steps[0]) markLines(pre, steps[0]);
  }
}

const WRAP_KEY = 'aniflow-code-wrap';
function wrapping() {
  try { return localStorage.getItem(WRAP_KEY) === '1'; } catch (error) { return false; }
}

const WRAP_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Zm0 4h10a2.75 2.75 0 0 1 0 5.5H9.56l.72.72a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 1.06l-.72.72h2.19a1.25 1.25 0 0 0 0-2.5h-10a.75.75 0 0 1 0-1.5Zm0 4h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1 0-1.5Z"></path></svg>';

// One switch for every block on the page, kept for the next page too.
function wrapButton(figure) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-wrap';
  button.setAttribute('aria-label', 'Wrap long lines');
  button.title = 'Wrap long lines';
  button.innerHTML = WRAP_ICON;
  button.addEventListener('click', () => {
    const on = !figure.classList.contains('wrapped');
    try { localStorage.setItem(WRAP_KEY, on ? '1' : '0'); } catch (error) { /* private mode */ }
    for (const each of host.article.querySelectorAll('.code-block:has(.code-wrap)')) {
      each.classList.toggle('wrapped', on);
      each.querySelector('.code-wrap').setAttribute('aria-pressed', String(on));
    }
  });
  button.setAttribute('aria-pressed', String(wrapping()));
  return button;
}

// Tints the lines a {1,4-6} fence names, as bands one line high from the top of the code.
function markLines(pre, ranges) {
  const style = getComputedStyle(pre);
  const size = parseFloat(style.fontSize) || 13;
  const line = style.lineHeight.endsWith('px') ? parseFloat(style.lineHeight) : (parseFloat(style.lineHeight) || 1.45) * size;
  const top = parseFloat(style.paddingTop) || 0;
  const tint = 'var(--code-mark)', clear = 'transparent';
  const stops = [];
  for (const [first, last] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    const from = top + (first - 1) * line, to = top + last * line;
    stops.push(clear + ' ' + from + 'px', tint + ' ' + from + 'px', tint + ' ' + to + 'px', clear + ' ' + to + 'px');
  }
  pre.classList.add('code-marked');
  pre.style.setProperty('background-image', 'linear-gradient(to bottom, ' + stops.join(', ') + ')');
}
