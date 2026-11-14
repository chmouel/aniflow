import { host } from '../host.js';
import { drawDiagrams } from '../diagram/draw.js';
import { frameCode } from './code.js';

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
    let slug = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-') || 'section';
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
  frameCode();
  drawDiagrams();
  scheduleTrack();
}

export function initShow() {
  addEventListener('scroll', scheduleTrack, { passive: true });
  addEventListener('resize', scheduleTrack);
  if (host.toc) {
    const wide = matchMedia('(min-width:1240px)');
    const openRail = () => { if (wide.matches) host.toc.open = true; };
    wide.addEventListener('change', openRail);
    openRail();
  }
}
