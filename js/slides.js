import { host } from './host.js';
import { diagramIcon } from './diagram/icons.js';
import { setDiagramSpeed } from './diagram/speed.js';
import { scheduleTrack } from './reader/show.js';

export let slideAt = -1;
export let slideDock = null;
export let slideFull = false;
export let slideIdle = 0;
export const isHeading = (element) => /^H[1-6]$/.test(element.tagName);
export function slideGroups() {
  const blocks = [...host.article.children].filter((element) => !element.matches('.frontmatter, .frontmatter-raw, .review-gutter'));
  const level = blocks.some((element) => element.tagName === 'H2') ? 'H2'
    : blocks.filter((element) => element.tagName === 'H1').length > 1 ? 'H1' : '';
  if (!level) return [];
  const groups = [[]];
  for (const element of blocks) {
    if (element.tagName === level && groups[groups.length - 1].length) groups.push([]);
    groups[groups.length - 1].push(element);
  }
  return groups.filter((group) => group.some((element) => element.textContent.trim() || element.querySelector('img, svg')));
}
export const slideStory = () => [...host.article.querySelectorAll('.slide-on .diagram-stage')].map((stage) => stage.diagramPlay).find(Boolean);
export function buildDock() {
  slideDock = document.createElement('div');
  slideDock.className = 'slide-dock';
  slideDock.innerHTML = '<div class="slide-rail"></div><div class="slide-controls">'
    + '<button type="button" data-slide="-1" aria-label="Previous slide" title="Previous slide">' + diagramIcon('left') + '</button>'
    + '<span class="slide-count" aria-live="polite"></span>'
    + '<button type="button" data-slide="1" aria-label="Next slide" title="Next slide">' + diagramIcon('right') + '</button>'
    + '<button type="button" data-slide="0" aria-label="Leave presentation" title="Leave (Esc)">' + diagramIcon('close') + '</button></div>';
  for (const button of slideDock.querySelectorAll('[data-slide]')) {
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const direction = Number(button.dataset.slide);
      direction ? slideMove(direction) : stopPresenting();
    });
  }
  document.body.append(slideDock);
}
export function paintDock(groups) {
  const rail = slideDock.querySelector('.slide-rail');
  if (rail.childElementCount !== groups.length) {
    rail.replaceChildren(...groups.map((group, index) => {
      const tick = document.createElement('button');
      tick.type = 'button';
      const heading = group.find(isHeading);
      tick.title = heading ? heading.textContent.replace(/^#/, '').trim() : 'Slide ' + (index + 1);
      tick.setAttribute('aria-label', 'Slide ' + (index + 1) + ': ' + tick.title);
      tick.addEventListener('pointerdown', (event) => event.preventDefault());
      tick.addEventListener('click', () => present(index, index - slideAt));
      return tick;
    }));
  }
  [...rail.children].forEach((tick, index) => {
    tick.classList.toggle('done', index < slideAt);
    if (index === slideAt) tick.setAttribute('aria-current', 'step');
    else tick.removeAttribute('aria-current');
  });
  slideDock.querySelector('.slide-count').textContent = (slideAt + 1) + ' / ' + groups.length;
}
export function present(at, direction) {
  const groups = slideGroups();
  if (!groups.length || at < 0 || at >= groups.length) return false;
  if (slideAt < 0) {
    document.body.classList.add('presenting');
    if (!slideDock) buildDock();
    host.presentButton?.setAttribute('aria-pressed', 'true');
  }
  for (const element of host.article.querySelectorAll(':scope > .slide-on')) element.classList.remove('slide-on');
  for (const element of groups[at]) element.classList.add('slide-on');
  // A diagram with little else on its slide takes the whole screen.
  const diagrams = groups[at].filter((element) => element.matches('.mermaid-diagram, .highlight-source-mermaid'));
  const words = groups[at].filter((element) => !diagrams.includes(element) && !isHeading(element))
    .reduce((sum, element) => sum + element.textContent.trim().length, 0);
  document.body.classList.toggle('slide-solo', diagrams.length === 1 && words < 240);
  host.article.classList.remove('slide-enter');
  if (direction && slideAt >= 0) {
    host.article.style.setProperty('--slide-from', (direction > 0 ? 18 : -18) + 'px');
    void host.article.offsetWidth;
    host.article.classList.add('slide-enter');
  }
  slideAt = at;
  scrollTo(0, 0);
  history.replaceState(null, '', '#slide=' + (at + 1));
  paintDock(groups);
  slideWake();
  return true;
}
export function slideMove(direction) {
  if (slideStory()?.walk(direction > 0)) return;
  present(slideAt + direction, direction);
}
export function stopPresenting() {
  if (slideAt < 0) return;
  const first = host.article.querySelector(':scope > .slide-on');
  for (const element of host.article.querySelectorAll(':scope > .slide-on')) element.classList.remove('slide-on');
  host.article.classList.remove('slide-enter');
  clearTimeout(slideIdle);
  document.body.classList.remove('presenting', 'slide-solo', 'slide-idle');
  host.presentButton?.setAttribute('aria-pressed', 'false');
  slideAt = -1;
  history.replaceState(null, '', location.pathname + location.search);
  if (slideFull && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  slideFull = false;
  first?.scrollIntoView({ block: 'start' });
  scheduleTrack();
}
export function slideWake() {
  document.body.classList.remove('slide-idle');
  clearTimeout(slideIdle);
  if (slideAt >= 0) slideIdle = setTimeout(() => document.body.classList.add('slide-idle'), 2500);
}

export function initSlides() {
  if (host.presentButton) {
    host.presentButton.hidden = slideGroups().length < 2;
    host.presentButton.addEventListener('click', () => {
      if (slideAt >= 0) {
        stopPresenting();
        return;
      }
      // Start from the section being read.
      let at = 0;
      slideGroups().forEach((group, index) => { if (group[0].getBoundingClientRect().top <= 96) at = index; });
      if (!present(at)) return;
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        slideFull = true;
        document.documentElement.requestFullscreen().catch(() => { slideFull = false; });
      }
    });
    const fromHash = () => {
      const wanted = /^#slide=(\d+)$/.exec(location.hash);
      if (wanted && Number(wanted[1]) - 1 !== slideAt) present(Number(wanted[1]) - 1);
    };
    fromHash();
    addEventListener('hashchange', fromHash);
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement || !slideFull) return;
      slideFull = false;
      stopPresenting();
    });
    addEventListener('pointermove', () => { if (slideAt >= 0) slideWake(); }, { passive: true });
    // Capture, so a focused diagram's own keys do not walk the story a second time.
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      if (slideAt < 0) {
        if (event.key === 'p' && !host.presentButton.hidden) {
          event.preventDefault();
          host.presentButton.click();
        }
        return;
      }
      if ((event.key === ' ' || event.key === 'Enter') && event.target.closest?.('button')) return;
      const key = event.key;
      if (key === ' ' && !event.shiftKey && slideStory()) slideStory().toggle();
      else if ((key === 'ArrowRight' && !event.shiftKey) || key === 'PageDown' || key === 'j' || (key === ' ' && !event.shiftKey)) slideMove(1);
      else if ((key === 'ArrowLeft' && !event.shiftKey) || key === 'PageUp' || key === 'k' || (key === ' ' && event.shiftKey)) slideMove(-1);
      else if ((key === '<' || key === '>') && slideStory()) setDiagramSpeed(key === '>' ? 1 : -1);
      else if (key === 'Home') present(0, -1);
      else if (key === 'End') present(slideGroups().length - 1, 1);
      else return;
      event.preventDefault();
      event.stopPropagation();
      slideWake();
    }, true);
    // After the page's other Escape handlers, which clear a drawing or a spotlight first.
    addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || slideAt < 0 || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      stopPresenting();
    });
    let swipe = null;
    document.addEventListener('touchstart', (event) => {
      swipe = slideAt >= 0 && event.touches.length === 1 && !event.target.closest('.diagram-stage, pre, table, .slide-dock')
        ? [event.touches[0].clientX, event.touches[0].clientY] : null;
    }, { passive: true });
    document.addEventListener('touchend', (event) => {
      if (!swipe) return;
      const dx = event.changedTouches[0].clientX - swipe[0], dy = event.changedTouches[0].clientY - swipe[1];
      swipe = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) slideMove(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
}
