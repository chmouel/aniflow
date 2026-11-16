import { host } from '../host.js';
import { diagramCanvas } from '../diagram/picture.js';
import { readFrontMatter } from '../reader/frontmatter.js';
import { deckSettings, WORDS_MAX } from '../reader/deck.js';
import { deck, dressCanvas, fitSlide, present, slideAt, slideGroups, slideKey, slideLayout, slidePicture, slideStep, slideStory, slideTitle, stopPresenting } from '../slides.js';

let overview = null;
let presenter = null;
let presenterStart = 0;
let presenterClock = 0;
let laser = null;
const pictures = new WeakMap();

// A still of a drawn diagram as a data URL, for copies of a slide: a copied SVG would share
// its ids, and so its arrowheads and styles, with the original. Cached per SVG, which a theme
// change redraws.
function stagePicture(stage) {
  const svg = stage.querySelector(':scope > svg');
  if (!svg) return Promise.resolve('');
  if (!pictures.has(svg)) {
    const box = svg.viewBox.baseVal;
    pictures.set(svg, !box?.width ? Promise.resolve('') : diagramCanvas(svg, { x: box.x, y: box.y, w: box.width, h: box.height }, 1600, false, true)
      .then(async (canvas) => {
        await canvas.draw('');
        return canvas.element.toDataURL('image/png');
      })
      .catch(() => ''));
  }
  return pictures.get(svg);
}

// A copy of one slide on its own canvas, width CSS pixels wide. complete shows every reveal
// step; otherwise the copy shows what the open slide shows.
export function slideThumb(index, width, doc = document, complete = true) {
  const group = slideGroups()[index];
  if (!group) return null;
  const size = (name, fallback) => parseFloat(document.body.style.getPropertyValue(name)) || fallback;
  const w = size('--slide-w', 1600), h = size('--slide-h', deck.aspect === '4:3' ? 1200 : 900);
  const thumb = doc.createElement('div');
  thumb.className = 'slide-thumb';
  thumb.style.setProperty('--slide-w', w + 'px');
  thumb.style.setProperty('--slide-h', h + 'px');
  thumb.style.setProperty('--slide-scale', String(width / w));
  thumb.style.setProperty('width', width + 'px');
  thumb.style.setProperty('height', Math.round(width * h / w) + 'px');
  const reader = doc.createElement('div');
  reader.className = 'reader';
  const canvas = doc.createElement('div');
  canvas.className = 'markdown-body slide-canvas';
  const copies = group.map((element) => {
    const copy = element.cloneNode(true);
    copy.classList.add('slide-on');
    copy.style.removeProperty('view-transition-name');
    if (complete) for (const each of [copy, ...copy.querySelectorAll('.slide-hidden, .slide-latest')]) each.classList.remove('slide-hidden', 'slide-latest');
    for (const each of [copy, ...copy.querySelectorAll('[id]')]) each.removeAttribute('id');
    for (const each of copy.querySelectorAll('button, .diagram-tools, .diagram-caption, .play-warn, .code-block-head')) each.remove();
    const holders = copy.matches('.mermaid-diagram') ? [copy] : [...copy.querySelectorAll('.mermaid-diagram')];
    const originals = element.matches('.mermaid-diagram') ? [element] : [...element.querySelectorAll('.mermaid-diagram')];
    holders.forEach((holder, at) => {
      const stage = originals[at]?.querySelector('.diagram-stage');
      const image = doc.createElement('img');
      image.className = 'slide-thumb-diagram';
      image.alt = '';
      holder.replaceChildren(image);
      if (stage) stagePicture(stage).then((url) => { if (url) image.src = url; });
    });
    return copy;
  });
  canvas.append(...copies);
  dressCanvas(canvas, copies, index);
  reader.append(canvas);
  thumb.append(reader);
  return { thumb, canvas };
}

export const overviewOpen = () => Boolean(overview);
export function openOverview() {
  if (overview || slideAt < 0) return;
  overview = document.createElement('div');
  overview.className = 'slide-overview';
  overview.setAttribute('role', 'dialog');
  overview.setAttribute('aria-label', 'All slides');
  const list = document.createElement('div');
  list.className = 'slide-overview-grid';
  overview.append(list);
  document.body.append(overview);
  const width = Math.floor(Math.max(160, Math.min(340, (list.clientWidth - 64 - 3 * 28) / 4)));
  const buttons = slideGroups().map((group, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slide-overview-item';
    if (index === slideAt) button.setAttribute('aria-current', 'step');
    const made = slideThumb(index, width);
    const label = document.createElement('span');
    label.textContent = (index + 1) + '. ' + slideTitle(group, index);
    button.append(made.thumb, label);
    button.addEventListener('click', () => {
      const from = slideAt;
      closeOverview();
      present(index, index - from, index < from ? Infinity : 0);
    });
    list.append(button);
    fitSlide(made.canvas);
    return button;
  });
  list.addEventListener('keydown', (event) => {
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    const across = Math.max(1, Math.round(list.clientWidth / (buttons[0].offsetWidth + 16)));
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: across, ArrowUp: -across }[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[Math.max(0, Math.min(buttons.length - 1, at + move))].focus();
  }, true);
  buttons[slideAt]?.focus();
  buttons[slideAt]?.scrollIntoView({ block: 'center' });
}
export function closeOverview() {
  overview?.remove();
  overview = null;
}

// A glowing dot that follows the pointer while presenting.
export function toggleLaser(force) {
  const on = force ?? !laser;
  if (on && !laser) {
    const dot = document.createElement('div');
    dot.className = 'slide-laser';
    dot.hidden = true;
    dot.move = (event) => {
      dot.hidden = false;
      dot.style.setProperty('transform', 'translate(' + event.clientX + 'px, ' + event.clientY + 'px)');
    };
    document.body.append(dot);
    addEventListener('pointermove', dot.move, { passive: true });
    document.body.classList.add('slide-lasering');
    laser = dot;
  } else if (!on && laser) {
    removeEventListener('pointermove', laser.move);
    laser.remove();
    laser = null;
    document.body.classList.remove('slide-lasering');
  }
  return Boolean(laser);
}

// The presenter window: the slide now, the next one, the notes and a timer. It opens blank and
// this page fills and drives it, so it needs no page of its own and works wherever the reader
// does.
export function openPresenter() {
  if (slideAt < 0) return;
  if (presenter && !presenter.closed) {
    presenter.focus();
    return;
  }
  presenter = open('', 'aniflow-presenter', 'popup,width=1180,height=760');
  if (!presenter) return;
  const doc = presenter.document;
  doc.title = 'Presenter: ' + document.title;
  doc.head.replaceChildren(...[...document.querySelectorAll('link[rel="stylesheet"], style')].map((sheet) => sheet.cloneNode(true)));
  doc.body.className = 'slide-presenter';
  doc.body.innerHTML = '<main class="presenter-grid">'
    + '<section class="presenter-now"><div class="presenter-slot"></div></section>'
    + '<section class="presenter-side"><h2>Next</h2><div class="presenter-next"><div class="presenter-slot"></div></div>'
    + '<h2>Notes</h2><div class="presenter-notes markdown-body"></div></section>'
    + '<footer class="presenter-bar"><button type="button" data-go="-1">Back</button><button type="button" data-go="1">Next</button>'
    + '<span class="presenter-count"></span><span class="presenter-step"></span>'
    + '<button type="button" class="presenter-timer" title="Restart the timer">00:00</button><span class="presenter-clock"></span></footer></main>';
  const tick = () => {
    if (!presenter || presenter.closed) {
      clearInterval(presenterClock);
      return;
    }
    const seconds = Math.floor((Date.now() - presenterStart) / 1000);
    doc.querySelector('.presenter-timer').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    doc.querySelector('.presenter-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  for (const button of doc.querySelectorAll('[data-go]')) {
    button.addEventListener('click', () => slideKey(new KeyboardEvent('keydown', { key: button.dataset.go === '1' ? 'ArrowRight' : 'ArrowLeft' })));
  }
  doc.querySelector('.presenter-timer').addEventListener('click', () => {
    presenterStart = Date.now();
    tick();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') presenter.close();
    else if (event.key !== 's') slideKey(event);
  });
  presenter.addEventListener('resize', paintPresenter);
  presenterStart = Date.now();
  clearInterval(presenterClock);
  presenterClock = setInterval(tick, 1000);
  tick();
  presenter.requestAnimationFrame(paintPresenter);
}
export function closePresenter() {
  clearInterval(presenterClock);
  if (presenter && !presenter.closed) presenter.close();
  presenter = null;
}
export function paintPresenter() {
  if (!presenter || presenter.closed || slideAt < 0) return;
  const doc = presenter.document;
  for (const name of ['theme', 'mode', 'choice']) {
    if (document.documentElement.dataset[name]) doc.documentElement.dataset[name] = document.documentElement.dataset[name];
  }
  for (const name of ['deckAccent', 'deckFont']) {
    if (document.body.dataset[name]) doc.body.dataset[name] = document.body.dataset[name];
    else delete doc.body.dataset[name];
  }
  const groups = slideGroups();
  const place = (slot, index, complete) => {
    const ratio = (parseFloat(document.body.style.getPropertyValue('--slide-w')) || 16) / (parseFloat(document.body.style.getPropertyValue('--slide-h')) || 9);
    const room = slot.clientHeight > 40 ? Math.min(slot.clientWidth, slot.clientHeight * ratio) : slot.clientWidth;
    const made = index < groups.length ? slideThumb(index, Math.max(120, Math.floor(room)), doc, complete) : null;
    slot.replaceChildren(...(made ? [made.thumb] : []));
    if (made) fitSlide(made.canvas);
  };
  place(doc.querySelector('.presenter-now .presenter-slot'), slideAt, false);
  place(doc.querySelector('.presenter-next .presenter-slot'), slideAt + 1, true);
  const notes = groups[slideAt].filter((element) => element.matches('.slide-notes'));
  const body = doc.querySelector('.presenter-notes');
  body.replaceChildren(...notes.flatMap((note) => [...note.cloneNode(true).childNodes]));
  if (!notes.length) {
    const empty = doc.createElement('p');
    empty.className = 'presenter-empty';
    empty.textContent = 'No notes for this slide.';
    body.append(empty);
  }
  doc.querySelector('.presenter-count').textContent = (slideAt + 1) + ' / ' + groups.length + ': ' + slideTitle(groups[slideAt], slideAt);
  doc.querySelector('.presenter-step').textContent = slideStep ? 'step ' + slideStep : '';
}

const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function settled() {
  await document.fonts?.ready;
  await Promise.all([...host.article.querySelectorAll('.slide-on img')].map((image) => image.complete ? null : new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  })));
  await frames();
  fitSlide();
  await frames();
}

// Opens a slide complete, every reveal step shown and its story at the end, for a picture of
// it. Resolves once its pictures have loaded and its text has been fitted.
export async function showSlide(index) {
  document.body.classList.add('slide-export');
  if (!present(index, 0, Infinity)) throw new Error('there is no slide ' + (index + 1));
  const story = slideStory();
  if (story) {
    if (story.playing()) story.toggle();
    story.restore(story.where().story || 1, Infinity);
  }
  await settled();
  return { index: index, title: slideTitle(slideGroups()[index], index) };
}

// What makes a deck look broken, by document line: text that still spills after fitting, too
// many words, bad directives and pictures that do not load. Only a document that is plainly a
// deck is checked: one with a slide directive, notes, columns, reveal or deck front matter;
// any other one with ## sections would read as slides that are far too long.
function pictureLoads(url) {
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), 8000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = url;
  });
}
const DECK_KEYS = ['accent', 'font', 'footer', 'logo', 'numbers', 'aspect', 'transition'];
export async function deckCheck() {
  const problems = [];
  const lineOf = (element) => Number(element?.dataset?.line || element?.querySelector?.('[data-line]')?.dataset.line) || 0;
  const front = readFrontMatter(host.source || '')?.entries || [];
  const explicit = front.some((entry) => DECK_KEYS.includes(entry.key))
    || host.article.querySelector('.slide-mark:not([data-auto]), .slide-notes, .slide-column-mark, .slide-reveal-mark');
  if (!explicit) return problems;
  for (const message of deckSettings(front).problems) problems.push({ line: 1, message: 'front matter: ' + message });
  const groups = slideGroups();
  if (!groups.length) {
    for (const note of host.article.querySelectorAll('.slide-notes')) problems.push({ line: lineOf(note), message: 'speaker notes in a document with no slides' });
    for (const mark of host.article.querySelectorAll('[data-problem]')) problems.push({ line: lineOf(mark), message: mark.dataset.problem });
    return problems;
  }
  for (let index = 0; index < groups.length; index++) {
    await showSlide(index);
    const group = slideGroups()[index];
    const line = lineOf(group.find((element) => !element.matches('.slide-mark') && lineOf(element))) || lineOf(group[0]);
    const where = 'slide ' + (index + 1) + ' (' + slideTitle(group, index) + ')';
    const { mark, layout, media, summary } = slideLayout(group, index);
    for (const element of group.flatMap((each) => [each, ...each.querySelectorAll('[data-problem]')])) {
      if (element.dataset?.problem) problems.push({ line: lineOf(element) || line, message: where + ': ' + element.dataset.problem });
    }
    if (host.article.hasAttribute('data-overflow')) problems.push({ line, message: where + ': does not fit even with smaller text; split it or cut words' });
    else if (summary.words > WORDS_MAX && layout !== 'full') problems.push({ line, message: where + ': ' + summary.words + ' words; keep a slide under ' + WORDS_MAX });
    if (mark?.dataset.layout === 'columns' && !group.some((element) => element.matches('.slide-columns'))) problems.push({ line: lineOf(mark), message: where + ': layout=columns needs a <!-- column --> between the columns' });
    if (['split', 'full'].includes(mark?.dataset.layout) && !media) problems.push({ line: lineOf(mark), message: where + ': layout=' + mark.dataset.layout + ' needs a picture or a diagram on the slide' });
    if (mark?.dataset.image && !await pictureLoads(slidePicture(mark.dataset.image))) problems.push({ line: lineOf(mark), message: where + ': background picture not found: ' + mark.dataset.image });
    for (const image of host.article.querySelectorAll('.slide-on img')) {
      if (image.complete && !image.naturalWidth) problems.push({ line: lineOf(image.closest('[data-line]')) || line, message: where + ': picture not shown: ' + image.getAttribute('src') });
    }
  }
  if (deck.logo && !await pictureLoads(slidePicture(deck.logo))) problems.push({ line: 1, message: 'front matter: logo not found: ' + deck.logo });
  stopPresenting();
  document.body.classList.remove('slide-export');
  return problems.sort((a, b) => a.line - b.line);
}

export const slideCount = () => slideGroups().length;
