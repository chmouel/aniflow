import { host } from './host.js';
import { diagramIcon } from './diagram/icons.js';
import { setDiagramSpeed } from './diagram/speed.js';
import { scheduleTrack } from './reader/show.js';
import { readFrontMatter } from './reader/frontmatter.js';
import { codeSteps, deckSettings, pickLayout } from './reader/deck.js';
import { closeOverview, closePresenter, openOverview, openPresenter, overviewOpen, paintPresenter, toggleLaser } from './slides/tools.js';

export let slideAt = -1;
export let slideStep = 0;
export let slideDock = null;
export let slideFull = false;
export let slideIdle = 0;
export let deck = deckSettings([]).settings;
let slideFrame = null;
let steps = [];
let themeBefore = null;
// The hash the page had before presenting, such as a try page #src= link, put back on leaving.
let slideReturn = '';
export const isHeading = (element) => /^H[1-6]$/.test(element.tagName);
const MARKERS = '.slide-mark, .slide-column-mark, .slide-reveal-mark, .slide-notes';
// What a click while presenting should reach instead of turning the page.
const SLIDE_CONTROLS = 'a[href], button, input, select, textarea, summary, label, video, audio, iframe, [contenteditable="true"], [contenteditable=""], .slide-dock, .diagram-tools, .diagram-pins, .diagram-notes, .play-warn';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The article's children cut into slides: at each H2 (or H1 when there are several), and at
// each <!-- slide --> marker, which keeps the heading right after it on its own slide.
export function slideGroups() {
  const blocks = [...host.article.children].filter((element) => !element.matches('.frontmatter, .frontmatter-raw, .review-gutter'));
  const marked = blocks.some((element) => element.matches('.slide-mark'));
  const level = blocks.some((element) => element.tagName === 'H2') ? 'H2'
    : blocks.filter((element) => element.tagName === 'H1').length > 1 ? 'H1' : '';
  if (!level && !marked) return [];
  const groups = [[]];
  let previous = null;
  for (const element of blocks) {
    const opens = element.matches('.slide-mark') || (element.tagName === level && !previous?.matches('.slide-mark'));
    if (opens && groups[groups.length - 1].length) groups.push([]);
    groups[groups.length - 1].push(element);
    previous = element;
  }
  return groups.filter((group) => group.some((element) => !element.matches(MARKERS) && (element.textContent.trim() || element.querySelector('img, svg'))));
}
export const slideTitle = (group, index) => {
  const heading = group.find(isHeading) || group.find((element) => element.matches('.slide-autocover'))?.querySelector('.slide-cover-title');
  if (heading) return heading.textContent.replace(/^#/, '').trim();
  const text = group.find((element) => element.matches('blockquote, p') && element.textContent.trim())?.textContent.trim().replace(/\s+/g, ' ');
  if (!text) return 'Slide ' + (index + 1);
  return text.length > 48 ? text.slice(0, 47).trimEnd() + '…' : text;
};
export const slideStory = () => [...host.article.querySelectorAll('.slide-on .diagram-stage')].map((stage) => stage.diagramPlay).find(Boolean);

function blockKind(element) {
  if (element.matches('.mermaid-diagram, .highlight-source-mermaid')) return 'diagram';
  if (element.matches('.slide-columns')) return 'columns';
  if (element.matches('.slide-autocover')) return 'cover';
  if (element.tagName === 'P') {
    const media = element.querySelectorAll('img, svg, video');
    return media.length === 1 && !element.textContent.trim() ? 'picture' : 'p';
  }
  if (/^[UO]L$/.test(element.tagName)) return 'list';
  if (element.tagName === 'BLOCKQUOTE') return 'quote';
  if (element.matches('.code-block, .highlight, pre')) return 'code';
  if (element.matches('table') || element.querySelector(':scope > table')) return 'table';
  return 'other';
}
const leadNumber = (element) => {
  const lead = element.querySelector(':scope > strong:first-child');
  return Boolean(lead && /\d/.test(lead.textContent) && lead.textContent.length <= 14 && element.textContent.trimStart().startsWith(lead.textContent));
};

// What a slide is made of and the layout it gets: the one its marker names, or one picked
// from its blocks.
export function slideLayout(group, index) {
  const mark = group[0]?.matches('.slide-mark') ? group[0] : null;
  const content = group.filter((element) => !element.matches(MARKERS) && !isHeading(element));
  const kinds = content.map(blockKind);
  const heading = group.find(isHeading);
  const words = content.filter((element) => !element.matches('.mermaid-diagram, .highlight-source-mermaid'))
    .reduce((sum, element) => sum + (element.textContent.trim().match(/\S+/g) || []).length, 0);
  const lists = content.filter((element) => /^[UO]L$/.test(element.tagName));
  const items = lists.flatMap((list) => [...list.children]);
  const texts = content.filter((element) => element.tagName === 'P').concat(items);
  const summary = {
    kinds: kinds,
    heading: heading ? heading.tagName.toLowerCase() : null,
    first: index === 0,
    words: words,
    stat: texts.length > 0 && texts.every(leadNumber),
    cards: items.length && items.every((item) => item.querySelector(':scope > strong:first-child, :scope > p:first-child > strong:first-child')) ? items.length : 0,
    cover: kinds.includes('cover'),
  };
  const layout = mark?.dataset.layout || pickLayout(summary);
  const media = layout === 'split' || layout === 'full'
    ? content.find((element) => ['picture', 'diagram'].includes(blockKind(element))) || null
    : null;
  return { mark, layout, media, heading, content, summary };
}

// Sets one slide's layout, background and per-block placement on a canvas: the article while
// presenting, or a copy of the slide in the overview and presenter window.
export function dressCanvas(canvas, group, index) {
  const info = slideLayout(group, index);
  const { mark, layout, media } = info;
  canvas.dataset.layout = layout;
  const options = mark?.dataset || {};
  for (const name of ['bg', 'dim', 'flip', 'full']) delete canvas.dataset[name];
  canvas.style.removeProperty('background-image');
  canvas.style.removeProperty('grid-template-rows');
  if (options.bg) canvas.dataset.bg = options.bg;
  else if (layout === 'section' && deck.style === 'conference') canvas.dataset.bg = 'accent';
  if (options.dim !== undefined) canvas.dataset.dim = '';
  if (options.flip !== undefined) canvas.dataset.flip = '';
  if (options.image) {
    const url = slidePicture(options.image);
    if (url) {
      canvas.dataset.bg = 'image';
      canvas.style.setProperty('background-image', 'linear-gradient(var(--slide-scrim), var(--slide-scrim)), url(' + JSON.stringify(url) + ')');
    }
  }
  for (const element of group) {
    element.classList.remove('slide-media');
    element.style.removeProperty('grid-row');
  }
  if (media) {
    media.classList.add('slide-media');
    canvas.dataset.full = media.matches('.mermaid-diagram, .highlight-source-mermaid') ? 'diagram' : 'picture';
  }
  if (layout === 'split' && media) {
    // The picture spans every row; the text sits between two flexible rows, so it is centred.
    const text = group.filter((element) => element !== media && !element.matches(MARKERS));
    canvas.style.setProperty('grid-template-rows', '1fr repeat(' + Math.max(1, text.length) + ', auto) 1fr');
    text.forEach((element, at) => element.style.setProperty('grid-row', String(at + 2)));
  }
  canvas.style.setProperty('--slide-cards', String(Math.min(3, info.summary.cards === 4 ? 2 : info.summary.cards || 1)));
  if (info.layout === 'grid') {
    // "**Label**: text" puts the label on its own line, so the separator after it goes.
    for (const label of group.flatMap((element) => [...element.querySelectorAll(':scope > li > strong:first-child, :scope > li > p:first-child > strong:first-child')])) {
      const next = label.nextSibling;
      const separator = next?.nodeType === Node.TEXT_NODE && /^\s*[:,;\u2013\u2014-]\s*/.exec(next.data);
      if (!separator) continue;
      next.splitText(separator[0].length);
      const span = document.createElement('span');
      span.className = 'slide-card-sep';
      next.replaceWith(span);
      span.append(next);
    }
  }
  const sections = slideGroups().slice(0, index + 1).filter((each, at) => slideLayout(each, at).layout === 'section').length;
  canvas.style.setProperty('--slide-section', '"' + String(sections).padStart(2, '0') + '"');
  return info;
}

// A picture path from a marker or the front matter, through the page's own picture rules.
export function slidePicture(value) {
  const resolved = host.resolveImage(value);
  if (resolved) return resolved;
  return /^(?:https:\/\/|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i.test(value) ? value : null;
}

function canvasSize() {
  const portrait = innerWidth < innerHeight && innerWidth < 760;
  if (portrait) return [900, Math.round(Math.max(1200, Math.min(1900, 900 * innerHeight / innerWidth)))];
  return deck.aspect === '4:3' ? [1600, 1200] : [1600, 900];
}
export function scaleCanvas() {
  if (!document.body.classList.contains('presenting')) return;
  const [width, height] = canvasSize();
  const root = document.body.style;
  root.setProperty('--slide-w', width + 'px');
  root.setProperty('--slide-h', height + 'px');
  root.setProperty('--slide-scale', String(Math.min(innerWidth / width, innerHeight / height)));
  document.body.classList.toggle('slide-portrait', width < height);
}

// Shrinks the slide's text until it fits the canvas, down to a floor; what still spills is
// marked for aniflow --check.
export function fitSlide(canvas = host.article) {
  const spills = () => canvas.scrollHeight > canvas.clientHeight + 2 || canvas.scrollWidth > canvas.clientWidth + 2;
  let fit = 1;
  canvas.style.setProperty('--slide-fit', '1');
  while (spills() && fit > 0.62) {
    fit = Math.round((fit - 0.06) * 100) / 100;
    canvas.style.setProperty('--slide-fit', String(fit));
  }
  canvas.toggleAttribute('data-overflow', spills());
  if (canvas === host.article) paintCode();
}

// Reveal items and code steps on the open slide, in document order.
function slideSteps(group) {
  const found = [];
  const marked = group[0]?.matches('.slide-mark') && group[0].dataset.reveal !== undefined;
  const reveal = (element) => {
    if (/^[UO]L$/.test(element.tagName)) found.push(...[...element.children].map((item) => ({ show: item })));
    else found.push({ show: element });
  };
  const walk = (elements) => {
    for (const element of elements) {
      if (element.matches('.slide-columns')) {
        walk([...element.querySelectorAll(':scope > .slide-column > *')]);
        continue;
      }
      if (element.matches('.slide-reveal-mark')) {
        const next = element.nextElementSibling;
        if (next && !next.matches(MARKERS)) reveal(next);
        continue;
      }
      if (marked && /^[UO]L$/.test(element.tagName) && !found.some((step) => step.show?.parentElement === element)) reveal(element);
      for (const code of element.matches('[data-steps]') ? [element] : element.querySelectorAll('[data-steps]')) {
        const ranges = codeSteps(code.dataset.steps) || [];
        for (let at = 1; at < ranges.length; at++) found.push({ code: code, at: at });
      }
    }
  };
  walk(group);
  return found;
}

function paintSteps() {
  const shown = new Set();
  const codeAt = new Map();
  steps.forEach((step, at) => {
    if (at >= slideStep) return;
    if (step.show) shown.add(step.show);
    else codeAt.set(step.code, step.at);
  });
  for (const step of steps) {
    if (step.show) {
      step.show.classList.toggle('slide-hidden', !shown.has(step.show));
      step.show.classList.toggle('slide-latest', step === steps[slideStep - 1]);
    }
  }
  for (const code of host.article.querySelectorAll('.slide-on [data-steps]')) code.dataset.stepAt = String(codeAt.get(code) || 0);
  paintCode();
}

// Dims the lines a code step does not name with a mask, so the highlighted markup is untouched.
function paintCode() {
  for (const code of host.article.querySelectorAll('[data-steps]')) {
    const pre = code.querySelector('pre');
    if (!pre) continue;
    const ranges = slideAt >= 0 && code.closest('.slide-on') ? (codeSteps(code.dataset.steps) || [])[Number(code.dataset.stepAt) || 0] : null;
    if (!ranges) {
      pre.style.removeProperty('mask-image');
      pre.style.removeProperty('-webkit-mask-image');
      continue;
    }
    const style = getComputedStyle(pre);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const top = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
    const dim = 'rgba(0,0,0,.28)', lit = 'rgba(0,0,0,1)';
    const stops = [dim + ' 0px'];
    for (const [first, last] of ranges.slice().sort((a, b) => a[0] - b[0])) {
      const from = top + (first - 1) * line, to = top + last * line;
      stops.push(dim + ' ' + from + 'px', lit + ' ' + from + 'px', lit + ' ' + to + 'px', dim + ' ' + to + 'px');
    }
    stops.push(dim + ' 100%');
    const mask = 'linear-gradient(to bottom, ' + stops.join(', ') + ')';
    pre.style.setProperty('mask-image', mask);
    pre.style.setProperty('-webkit-mask-image', mask);
    if (code.closest('.slide-on')) {
      const [first] = ranges[0];
      const want = top + (first - 1) * line - pre.clientHeight / 3;
      pre.scrollTo({ top: Math.max(0, want), behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
}

export function buildDock() {
  slideDock = document.createElement('div');
  slideDock.className = 'slide-dock';
  const button = (attrs, icon, label) => '<button type="button" ' + attrs + ' aria-label="' + label + '" title="' + label + '">' + diagramIcon(icon) + '</button>';
  slideDock.innerHTML = '<div class="slide-rail"></div><div class="slide-controls">'
    + button('data-slide="-1"', 'left', 'Previous slide (B)')
    + '<span class="slide-count" aria-live="polite"></span>'
    + button('data-slide="1"', 'right', 'Next slide (N)')
    + button('data-tool="overview"', 'grid', 'All slides (O)')
    + button('data-tool="presenter"', 'notes', 'Presenter view (S)')
    + button('data-tool="laser"', 'laser', 'Laser pointer (L)')
    + (window.aniflowTheme ? '<button type="button" class="slide-theme">' + diagramIcon('theme') + '</button>' : '')
    + button('data-slide="0"', 'close', 'Leave (Esc)') + '</div>';
  for (const control of slideDock.querySelectorAll('button')) control.addEventListener('pointerdown', (event) => event.preventDefault());
  for (const control of slideDock.querySelectorAll('[data-slide]')) {
    control.addEventListener('click', () => {
      const direction = Number(control.dataset.slide);
      direction ? present(slideAt + direction, direction) : stopPresenting();
    });
  }
  slideDock.querySelector('[data-tool="overview"]').addEventListener('click', () => (overviewOpen() ? closeOverview() : openOverview()));
  slideDock.querySelector('[data-tool="presenter"]').addEventListener('click', openPresenter);
  slideDock.querySelector('[data-tool="laser"]').addEventListener('click', (event) => event.currentTarget.setAttribute('aria-pressed', String(toggleLaser())));
  const theme = slideDock.querySelector('.slide-theme');
  if (theme) {
    const paint = () => {
      const choice = document.documentElement.dataset.choice;
      const label = 'Theme: ' + (window.aniflowThemes?.[choice]?.[2] || 'Auto');
      theme.title = label;
      theme.setAttribute('aria-label', label + ', change');
    };
    theme.addEventListener('click', () => {
      themeBefore = null;
      const names = ['auto', ...Object.keys(window.aniflowThemes || {})];
      window.aniflowTheme(names[(names.indexOf(document.documentElement.dataset.choice) + 1) % names.length]);
    });
    addEventListener('aniflow-theme', paint);
    paint();
  }
  slideFrame = document.createElement('div');
  slideFrame.className = 'slide-frame';
  slideFrame.setAttribute('aria-hidden', 'true');
  document.body.append(slideDock, slideFrame);
}
export function paintDock(groups) {
  const rail = slideDock.querySelector('.slide-rail');
  if (rail.childElementCount !== groups.length) {
    rail.replaceChildren(...groups.map((group, index) => {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.title = slideTitle(group, index);
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

// Footer, logo and slide number, drawn over the canvas at its scale.
function darkColour(value) {
  const rgb = [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 0.179;
}

export function slideFrameContents(doc, index, count, canvas) {
  const parts = [];
  const footer = doc.createElement('span');
  footer.className = 'slide-footer';
  for (const [name, text] of [['slide-footer-text', deck.footer], ['slide-number', deck.numbers && (index + 1) + ' / ' + count]]) {
    if (!text) continue;
    const span = doc.createElement('span');
    span.className = name;
    span.textContent = text;
    footer.append(span);
  }
  if (footer.childElementCount) parts.push(footer);
  const baseDark = document.documentElement.dataset.mode === 'dark';
  let dark = baseDark;
  if (canvas.dataset.bg === 'inverse') dark = !baseDark;
  if (canvas.dataset.bg === 'accent') {
    dark = /^#[0-9a-f]{6}$/i.test(deck.accent || '') ? darkColour(deck.accent) : !baseDark;
  }
  const logoPath = dark && deck.logoDark ? deck.logoDark : deck.logo;
  const logo = logoPath && slidePicture(logoPath);
  if (logo) {
    const image = doc.createElement('img');
    image.className = 'slide-logo';
    image.alt = '';
    image.src = logo;
    parts.push(image);
  }
  return parts;
}

function paintFrame(groups) {
  slideFrame.replaceChildren(...slideFrameContents(document, slideAt, groups.length, host.article));
}

// A deck can ask for one of the reader's themes while it is presented; leaving puts the
// reader's own back, unless the viewer picked one from the dock in between.
function deckTheme(on) {
  const root = document.documentElement;
  const themes = window.aniflowThemes || { light: ['light'], dark: ['dark'] };
  if (on && deck.theme && themes?.[deck.theme] && root.dataset.theme !== deck.theme) {
    themeBefore = { theme: root.dataset.theme, mode: root.dataset.mode };
    root.dataset.theme = deck.theme;
    root.dataset.mode = themes[deck.theme][0];
    dispatchEvent(new Event('aniflow-theme'));
  } else if (!on && themeBefore) {
    if (themeBefore.theme === undefined) delete root.dataset.theme;
    else root.dataset.theme = themeBefore.theme;
    if (themeBefore.mode === undefined) delete root.dataset.mode;
    else root.dataset.mode = themeBefore.mode;
    themeBefore = null;
    dispatchEvent(new Event('aniflow-theme'));
  }
}

function startPresenting() {
  slideReturn = /^#slide=\d+(?:&step=\d+)?$/.test(location.hash) ? '' : location.hash;
  deck = deckSettings(readFrontMatter(host.source || '')?.entries).settings;
  document.body.classList.add('presenting');
  host.article.classList.add('slide-canvas');
  if (!slideDock) buildDock();
  const body = document.body.dataset;
  for (const [key, value] of [['deckAccent', deck.accent], ['deckFont', deck.font], ['deckStyle', deck.style], ['deckMotion', deck.motion]]) {
    if (value) body[key] = value;
    else delete body[key];
  }
  if (/^#[0-9a-f]{6}$/i.test(deck.accent || '')) {
    document.body.style.setProperty('--slide-accent', deck.accent);
    body.accentDark = String(darkColour(deck.accent));
  } else {
    document.body.style.removeProperty('--slide-accent');
    delete body.accentDark;
  }
  host.presentButton?.setAttribute('aria-pressed', 'true');
  deckTheme(true);
}

function leaveSlide() {
  for (const element of host.article.querySelectorAll(':scope > .slide-on')) element.classList.remove('slide-on');
  for (const element of host.article.querySelectorAll('.slide-hidden, .slide-latest')) element.classList.remove('slide-hidden', 'slide-latest');
  for (const element of host.article.querySelectorAll('.slide-media')) element.classList.remove('slide-media');
  for (const element of host.article.children) {
    element.style.removeProperty('grid-row');
    element.style.removeProperty('--slide-i');
    element.style.removeProperty('view-transition-name');
  }
}

function swapSlide(groups, at, step) {
  leaveSlide();
  for (const element of groups[at]) element.classList.add('slide-on');
  groups[at].filter((element) => !element.matches(MARKERS)).forEach((element, index) => element.style.setProperty('--slide-i', String(index)));
  const { layout } = dressCanvas(host.article, groups[at], at);
  document.body.dataset.slideLayout = layout;
  if (host.article.dataset.bg) document.body.dataset.slideBg = host.article.dataset.bg;
  else delete document.body.dataset.slideBg;
  document.body.classList.toggle('slide-solo', layout === 'full' && host.article.dataset.full === 'diagram');
  slideAt = at;
  steps = slideSteps(groups[at]);
  slideStep = Math.max(0, Math.min(steps.length, step));
  fitSlide();
  paintSteps();
}

// Names the title and the first diagram on both slides, so a morph glides one into the other.
function morphNames(group, on) {
  const heading = group.find(isHeading);
  const diagram = group.find((element) => element.matches('.mermaid-diagram'));
  for (const [element, name] of [[heading, 'slide-title'], [diagram, 'slide-diagram']]) {
    if (!element) continue;
    if (on) element.style.setProperty('view-transition-name', name);
    else element.style.removeProperty('view-transition-name');
  }
}

// A morph swaps slides inside the View Transition callback, a frame later; a press
// arriving before then flushes it, so slideAt is never stale.
let morphing = null;

// step: how many reveal and code steps are already shown; going back opens a slide complete.
export function present(at, direction, step) {
  if (morphing) {
    morphing.transition?.skipTransition();
    morphing.swap();
  }
  const groups = slideGroups();
  if (!groups.length || at < 0 || at >= groups.length) return false;
  const starting = slideAt < 0;
  if (starting) startPresenting();
  scaleCanvas();
  const leaving = slideStory();
  if (leaving?.playing()) leaving.toggle();
  const from = slideAt;
  const want = step ?? (direction < 0 ? Infinity : 0);
  const mark = groups[at][0]?.matches('.slide-mark') ? groups[at][0] : null;
  const auto = deck.motion === 'subtle' ? (['cover', 'section'].includes(slideLayout(groups[at], at).layout) ? 'slide' : 'fade') : 'slide';
  const transition = reduced() || deck.motion === 'none' || starting || !direction ? 'none' : mark?.dataset.transition || deck.transition || auto;
  document.body.dataset.transition = transition;
  host.article.classList.remove('slide-enter');
  const show = () => {
    swapSlide(groups, at, want);
    slideHash();
    paintDock(groups);
    paintFrame(groups);
    slideWake();
    slideAutoplay();
    paintPresenter();
    document.fonts?.ready.then(() => { if (slideAt === at) fitSlide(); });
    for (const image of host.article.querySelectorAll('.slide-on img')) {
      if (!image.complete) image.addEventListener('load', () => { if (slideAt === at) fitSlide(); }, { once: true });
    }
  };
  if (transition === 'morph' && document.startViewTransition && from >= 0) {
    morphNames(groups[from], true);
    const pending = {
      swap() {
        if (morphing !== pending) return;
        morphing = null;
        morphNames(groups[from], false);
        show();
        morphNames(groups[at], true);
      },
    };
    morphing = pending;
    pending.transition = document.startViewTransition(() => pending.swap());
    pending.transition.finished.finally(() => morphNames(groups[at], false));
  } else {
    show();
    if (transition !== 'none') {
      host.article.style.setProperty('--slide-from', (direction > 0 ? 40 : -40) + 'px');
      void host.article.offsetWidth;
      host.article.classList.add('slide-enter');
    }
  }
  scrollTo(0, 0);
  return true;
}
function slideHash() {
  history.replaceState(null, '', '#slide=' + (slideAt + 1) + (slideStep ? '&step=' + slideStep : ''));
}
// A slide's story plays on its own once its reveal steps are shown, unless the front matter
// says autoplay: false; story=N on the slide marker picks which one.
function slideAutoplay() {
  if (slideAt < 0 || reduced() || !deck.autoplay || slideStep < steps.length) return;
  const story = slideStory();
  if (!story || story.playing() || !(story.where().step === null || story.finished())) return;
  const mark = slideGroups()[slideAt]?.[0];
  const wanted = mark?.matches('.slide-mark') ? Number(mark.dataset.story) : 0;
  if (wanted && story.where().story !== wanted) story.restore(wanted, null);
  story.toggle();
}
export function slideMove(direction) {
  if (direction > 0 && slideStep < steps.length) {
    slideStep++;
    paintSteps();
    slideHash();
    slideAutoplay();
    paintPresenter();
    return;
  }
  if (slideStory()?.walk(direction > 0)) return;
  if (direction < 0 && slideStep > 0) {
    slideStep--;
    paintSteps();
    slideHash();
    paintPresenter();
    return;
  }
  present(slideAt + direction, direction);
}
export function stopPresenting() {
  if (slideAt < 0) return;
  morphing?.transition?.skipTransition();
  morphing = null;
  const first = host.article.querySelector(':scope > .slide-on');
  leaveSlide();
  closeOverview();
  closePresenter();
  toggleLaser(false);
  slideDock?.querySelector('[data-tool="laser"]')?.setAttribute('aria-pressed', 'false');
  host.article.classList.remove('slide-enter', 'slide-canvas');
  for (const name of ['layout', 'bg', 'dim', 'flip', 'full']) delete host.article.dataset[name];
  host.article.removeAttribute('data-overflow');
  for (const name of ['background-image', 'grid-template-rows', '--slide-fit', '--slide-cards', '--slide-section', '--slide-from']) host.article.style.removeProperty(name);
  clearTimeout(slideIdle);
  document.body.classList.remove('presenting', 'slide-solo', 'slide-idle', 'slide-portrait');
  for (const name of ['slideLayout', 'slideBg', 'transition', 'deckAccent', 'deckFont', 'deckStyle', 'deckMotion', 'accentDark']) delete document.body.dataset[name];
  document.body.style.removeProperty('--slide-accent');
  host.presentButton?.setAttribute('aria-pressed', 'false');
  slideAt = -1;
  slideStep = 0;
  steps = [];
  paintCode();
  deckTheme(false);
  history.replaceState(null, '', location.pathname + location.search + slideReturn);
  slideReturn = '';
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

// The presenting keys, shared by the page and the presenter window.
export function slideKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
  if (slideAt < 0) {
    if (event.key === 'p' && host.presentButton && !host.presentButton.hidden) {
      event.preventDefault();
      host.presentButton.click();
    }
    return;
  }
  if (event.key === 'Enter' && event.target.closest?.('button')) return;
  const key = event.key;
  if (overviewOpen() && key !== 'o' && key !== 'Escape') return;
  // n, b and Shift+PageDown/PageUp leave the slide even while it has steps left.
  if (key === 'n' || (key === 'PageDown' && event.shiftKey)) present(slideAt + 1, 1);
  else if (key === 'b' || (key === 'PageUp' && event.shiftKey)) present(slideAt - 1, -1);
  else if ((key === 'ArrowRight' && !event.shiftKey) || key === 'ArrowDown' || key === 'PageDown' || key === 'j' || (key === ' ' && !event.shiftKey)) slideMove(1);
  else if ((key === 'ArrowLeft' && !event.shiftKey) || key === 'ArrowUp' || key === 'PageUp' || key === 'k' || (key === ' ' && event.shiftKey)) slideMove(-1);
  else if ((key === '<' || key === '>') && slideStory()) setDiagramSpeed(key === '>' ? 1 : -1);
  else if (key === 'Home') present(0, -1, 0);
  else if (key === 'End') present(slideGroups().length - 1, 1, Infinity);
  else if (key === 'o') overviewOpen() ? closeOverview() : openOverview();
  else if (key === 's') openPresenter();
  else if (key === 'l') slideDock?.querySelector('[data-tool="laser"]')?.setAttribute('aria-pressed', String(toggleLaser()));
  else if (key === 'Escape' && overviewOpen()) closeOverview();
  else return;
  event.preventDefault();
  event.stopPropagation();
  slideWake();
}

export function initSlides() {
  host.onSlideDiagram = () => {
    fitSlide();
    slideAutoplay();
  };
  addEventListener('resize', () => {
    if (slideAt < 0) return;
    const portrait = document.body.classList.contains('slide-portrait');
    scaleCanvas();
    if (portrait !== document.body.classList.contains('slide-portrait')) fitSlide();
  });
  if (host.presentButton) {
    host.presentButton.hidden = slideGroups().length < 2;
    host.presentButton.addEventListener('click', () => {
      if (slideAt >= 0) {
        stopPresenting();
        return;
      }
      // Start from the section being read.
      let at = 0;
      slideGroups().forEach((group, index) => {
        const shown = group.find((element) => !element.matches(MARKERS) && element.getClientRects().length);
        if (shown && shown.getBoundingClientRect().top <= 96) at = index;
      });
      if (!present(at)) return;
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        slideFull = true;
        document.documentElement.requestFullscreen().catch(() => { slideFull = false; });
      }
    });
    const fromHash = () => {
      const wanted = /^#slide=(\d+)(?:&step=(\d+))?$/.exec(location.hash);
      if (!wanted) return;
      const at = Number(wanted[1]) - 1, step = Number(wanted[2] || 0);
      if (at !== slideAt || step !== slideStep) present(at, 0, step);
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
    document.addEventListener('keydown', slideKey, true);
    // After the page's other Escape handlers, which clear a drawing or a spotlight first.
    addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || slideAt < 0 || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      stopPresenting();
    });
    let swipe = null;
    // Like an e-book: a click on the left half of the screen goes back, anywhere else forward,
    // diagrams included. Drags (panning, the pen, selecting text) and the slide's own controls
    // are left alone; a selection that was there before the press does not count.
    let press = null;
    document.addEventListener('pointerdown', (event) => {
      press = slideAt >= 0 && event.isPrimary && event.button === 0
        ? { x: event.clientX, y: event.clientY, moved: false, selection: String(document.getSelection() || '') } : null;
    }, true);
    document.addEventListener('pointermove', (event) => {
      if (press && event.isPrimary && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press.moved = true;
    }, { capture: true, passive: true });
    document.addEventListener('pointercancel', () => { press = null; }, true);
    document.addEventListener('click', (event) => {
      const start = press;
      press = null;
      if (slideAt < 0 || !start || start.moved || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || overviewOpen() || document.querySelector('dialog[open]')) return;
      const selection = String(document.getSelection() || '');
      if (selection && selection !== start.selection) return;
      const under = document.elementFromPoint(event.clientX, event.clientY) || event.target;
      if (under.closest?.(SLIDE_CONTROLS) || under.closest?.('.diagram-stage.drawing, .diagram-stage.commenting')) return;
      event.preventDefault();
      event.stopPropagation();
      slideMove(event.clientX < innerWidth / 2 ? -1 : 1);
      slideWake();
    }, true);
    // A double click is two page turns while presenting, not a diagram zoom.
    document.addEventListener('dblclick', (event) => {
      if (slideAt >= 0 && !event.target.closest?.(SLIDE_CONTROLS)) event.stopPropagation();
    }, true);
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
