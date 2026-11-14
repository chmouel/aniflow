import { host } from '../host.js';

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
    label.textContent = kind ? kind[1] : 'text';
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
    head.append(label, button);
    const body = document.createElement('div');
    body.className = 'code-body';
    box.replaceWith(figure);
    body.append(box);
    figure.append(head, body);
  }
}
