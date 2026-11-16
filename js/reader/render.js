import { host } from '../host.js';
import { deckPlugin } from './deck.js';
import { frontMatterPlugin } from './frontmatter.js';
import { githubFlavour, sanitize } from './github.js';

export let markdown = null;
export function renderLocal() {
  try {
    if (!markdown) {
      markdown = window.markdownit({ html: true, linkify: true, breaks: host.breaks });
      // Without a scheme, README.md would become a link to a Moldovan domain.
      markdown.linkify.set({ fuzzyLink: false });
      if (window.markdownitFootnote) markdown.use(window.markdownitFootnote);
      if (window.markdownitEmoji) markdown.use(window.markdownitEmoji);
      frontMatterPlugin(markdown);
      githubFlavour(markdown);
      deckPlugin(markdown);
      for (const plugin of host.plugins) plugin(markdown);
    }
    return sanitize(markdown.render(host.preprocess(host.source)));
  } catch (error) {
    console.error('markdown rendering failed', error);
    const pre = document.createElement('pre');
    pre.textContent = host.source;
    const fragment = document.createDocumentFragment();
    fragment.append(pre);
    return fragment;
  }
}

// A link or picture relative to the served directory, kept only when it stays under root.
export function directoryUrl(value, root) {
  if (!value || value.includes('\\') || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) return null;
  if (value.startsWith('/icons/')) return value;
  const rooted = value.startsWith('/') && !value.startsWith(root) ? root + value.slice(1) : value;
  const url = new URL(rooted, location.href);
  return url.origin === location.origin && url.pathname.startsWith(root) ? url.href : null;
}
