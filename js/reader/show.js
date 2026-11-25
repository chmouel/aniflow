import { host } from '../host.js';
import { drawDiagrams } from '../diagram/draw.js';
import { frameCode } from './code.js';
import { slug as headingSlug } from './slug.js';

export let tracked = [];
export let current = null;
export function track() {
  const end = document.documentElement.scrollHeight - innerHeight;
  if (host.bar) host.bar.style.setProperty('--progress', end > 0 ? Math.min(1, scrollY / end).toFixed(4) : '0');
  let found = tracked[0] || null;
  if (end > 0 && scrollY >= end - 2) found = tracked[tracked.length - 1] || null;
  else for (const item of tracked) {
    if (item.heading.getBoundingClientRect().top > 96) break;
    found = item;
  }
  if (found === current) return;
  if (current) current.link.removeAttribute('aria-current');
  current = found;
  if (!current) return;
  current.link.setAttribute('aria-current', 'location');
  if (host.toc && host.toc.scrollHeight > host.toc.clientHeight) {
    const top = current.link.offsetTop;
    if (top < host.toc.scrollTop || top > host.toc.scrollTop + host.toc.clientHeight - 40) host.toc.scrollTop = top - host.toc.clientHeight / 3;
  }
}
export let tracking = false;
export function scheduleTrack() {
  if (tracking) return;
  tracking = true;
  requestAnimationFrame(() => {
    tracking = false;
    track();
  });
}
export function show(content) {
  if (host.onShow) host.onShow();
  for (const image of content.querySelectorAll('img[src]')) {
    const url = host.resolveImage(image.getAttribute('src'));
    if (url) image.setAttribute('src', url);
  }
  for (const link of content.querySelectorAll('a[href]')) {
    const url = host.resolveLink(link.getAttribute('href'));
    if (url) link.setAttribute('href', url);
  }
  // Listeners a diagram puts on document or window take this signal, so a re-render drops them.
  host.render?.abort();
  host.render = new AbortController();
  host.article.replaceChildren(content);

  const seen = new Map();
  const entries = [];
  for (const heading of host.article.querySelectorAll(':is(h1, h2, h3, h4, h5, h6):not(.sr-only)')) {
    const text = heading.textContent.trim();
    let slug = headingSlug(text);
    const used = seen.get(slug) || 0;
    seen.set(slug, used + 1);
    if (used) slug += '-' + used;
    heading.id = slug;
    const anchor = document.createElement('a');
    anchor.className = 'anchor';
    anchor.href = '#' + slug;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', 'Link to ' + text);
    heading.prepend(anchor);
    const level = Number(heading.tagName[1]);
    if (level <= 3) entries.push({ slug: slug, text: text, level: level });
  }

  if (host.toc) {
    const list = host.toc.querySelector('ol');
    list.replaceChildren();
    tracked = [];
    current = null;
    const top = Math.min(...entries.map((entry) => entry.level));
    for (const entry of entries) {
      const item = document.createElement('li');
      item.style.paddingLeft = (entry.level - top) * 14 + 'px';
      const link = document.createElement('a');
      link.href = '#' + entry.slug;
      link.textContent = entry.text;
      item.append(link);
      list.append(item);
      tracked.push({ heading: document.getElementById(entry.slug), link: link });
    }
    host.toc.hidden = entries.length < 3;
  }
  dressLinks();
  for (const image of host.article.querySelectorAll('img')) {
    if (!image.hasAttribute('loading')) image.loading = document.body.classList.contains('presenting') ? 'eager' : 'lazy';
    image.decoding = 'async';
  }
  for (const table of host.article.querySelectorAll('table')) table.classList.toggle('long-table', table.rows.length > 16);
  noteMeta();
  backlinks();
  frameCode();
  drawDiagrams();
  scheduleTrack();
}

// Links to another site open in a new tab and carry an arrow.
function dressLinks() {
  for (const link of host.article.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch (error) { continue; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) continue;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.classList.add('external');
  }
}

// "4 min read · Updated 3 Mar 2026" under the title.
function noteMeta() {
  const words = (host.article.textContent.match(/[\p{L}\p{N}]+/gu) || []).length;
  const parts = [];
  if (words >= 200) parts.push(Math.ceil(words / 220) + ' min read');
  const when = host.modified ? new Date(host.modified) : null;
  if (when && !Number.isNaN(when.getTime())) {
    parts.push('Updated ' + when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  }
  if (!parts.length) return;
  const line = document.createElement('p');
  line.className = 'note-meta';
  line.textContent = parts.join(' · ');
  if (when) line.title = when.toLocaleString();
  const title = [...host.article.children].find((element) => element.tagName === 'H1');
  if (title) title.after(line);
  else host.article.prepend(line);
}

// The notes that link here, as the server found them.
function backlinks() {
  if (!host.backlinks?.length) return;
  const section = document.createElement('section');
  section.className = 'backlinks';
  const head = document.createElement('p');
  head.className = 'backlinks-title';
  head.textContent = 'Linked from';
  const list = document.createElement('ul');
  for (const item of host.backlinks) {
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    const entry = document.createElement('li');
    entry.append(link);
    list.append(entry);
  }
  section.append(head, list);
  host.article.append(section);
}

// A click on a picture shows it at full size.
function zoomPicture(event) {
  const image = event.target.closest?.('img');
  if (!image || !host.article.contains(image) || image.closest('a, .mermaid-diagram, .diagram-stage, .code-block')) return;
  if (document.body.classList.contains('presenting') || document.body.classList.contains('reviewing')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-zoom';
  const big = document.createElement('img');
  big.src = image.currentSrc || image.src;
  big.alt = image.alt;
  dialog.append(big);
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export function initShow() {
  addEventListener('scroll', scheduleTrack, { passive: true });
  addEventListener('resize', scheduleTrack);
  host.article.addEventListener('click', zoomPicture);
  if (host.toc) {
    const wide = matchMedia('(min-width:1240px)');
    const openRail = () => { if (wide.matches) host.toc.open = true; };
    wide.addEventListener('change', openRail);
    openRail();
  }
}
