import { host } from '../host.js';
import { addBusyCheck, diagramBusy } from './busy.js';
import { diagramComments } from './comments.js';
import { focusDiagram } from './focus.js';
import { diagramIcon } from './icons.js';
import { playDiagram } from './player.js';
import { diagramShare } from './share.js';

export let diagramDialog = null;

// Zooming and panning rewrite the viewBox, so the diagram stays sharp and keeps its place in the page.
export function panZoom(holder, scenarios, edges, about) {
  const svg = holder.querySelector(':scope > svg');
  const box = svg && svg.viewBox.baseVal;
  if (!box || !box.width || !box.height) return;
  const home = { x: box.x, y: box.y, w: box.width, h: box.height };
  const MAX = 12;
  let view = Object.assign({}, home);

  const stage = document.createElement('div');
  stage.className = 'diagram-stage';
  const tools = document.createElement('div');
  tools.className = 'diagram-tools';
  const button = (name, label) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.title = label;
    element.setAttribute('aria-label', label);
    element.innerHTML = diagramIcon(name);
    tools.append(element);
    return element;
  };
  const penButton = button('pen', 'Draw on the diagram');
  const followButton = scenarios.length ? button('follow', 'Follow the story') : null;
  const outButton = button('out', 'Zoom out');
  const inButton = button('in', 'Zoom in');
  const fitButton = button('fit', 'Fit');
  const fullButton = button('full', 'Full screen');
  stage.append(tools, svg);
  holder.append(stage);
  const share = diagramShare(stage, svg, tools);
  stage.diagramPlay = scenarios.length ? playDiagram(stage, svg, tools, scenarios, home, share, edges) : null;
  stage.diagramFocus = focusDiagram(stage, svg, edges) || null;
  stage.diagramNotes = about ? diagramComments(stage, svg, penButton, Object.assign({ edges: edges, home: home }, about)) : null;
  holder.title = 'Drag to move, Ctrl+scroll or pinch to zoom' + (stage.classList.contains('focusable') ? ', click a box to highlight it' : '');

  const full = () => Boolean(diagramDialog && diagramDialog.open && diagramDialog.contains(stage));
  const zoomed = () => view.w < home.w - 1e-9;
  function apply() {
    svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].join(' '));
    stage.diagramNotes?.zoom();
    stage.classList.toggle('zoomed', zoomed());
    outButton.disabled = fitButton.disabled = !zoomed();
    inButton.disabled = view.w <= home.w / MAX + 1e-9;
  }
  function clamp(box = view) {
    box.x = Math.min(Math.max(box.x, home.x), home.x + home.w - box.w);
    box.y = Math.min(Math.max(box.y, home.y), home.y + home.h - box.h);
  }
  function center() {
    const rect = svg.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  }
  function zoomAt(factor, clientX, clientY) {
    cancelAnimationFrame(glide);
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const width = Math.min(home.w, Math.max(home.w / MAX, view.w / factor));
    const ratio = width / view.w;
    view = { x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio, w: width, h: view.h * ratio };
    clamp();
    apply();
  }
  function panBy(dx, dy) {
    cancelAnimationFrame(glide);
    const matrix = svg.getScreenCTM();
    if (!matrix || !matrix.a) return;
    view.x -= dx / matrix.a;
    view.y -= dy / matrix.d;
    clamp();
    apply();
  }
  function reset() {
    cancelAnimationFrame(glide);
    view = Object.assign({}, home);
    apply();
  }

  // Following a story eases the view onto each step, zoomed in no further than a third of the
  // diagram so its neighbours stay in sight. Any pan or zoom by hand cancels the glide.
  let glide = 0;
  let following = followButton !== null && localStorage.getItem('aniflow-diagram-follow') === '1';
  function glideTo(target) {
    cancelAnimationFrame(glide);
    const from = Object.assign({}, view);
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / 750);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      view = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased, w: from.w + (target.w - from.w) * eased, h: from.h + (target.h - from.h) * eased };
      apply();
      glide = t < 1 ? requestAnimationFrame(frame) : 0;
    };
    glide = requestAnimationFrame(frame);
  }
  function look(rect) {
    if (!following || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!rect) {
      if (zoomed() || glide) glideTo(home);
      return;
    }
    const aspect = home.h / home.w;
    const pad = Math.min(home.w, home.h) / 8;
    const w = Math.min(home.w, Math.max(rect.width + pad, (rect.height + pad) / aspect, home.w / 3));
    const target = { x: rect.x + rect.width / 2 - w / 2, y: rect.y + rect.height / 2 - w * aspect / 2, w: w, h: w * aspect };
    clamp(target);
    glideTo(target);
  }
  function syncFollow() {
    if (!followButton) return;
    const text = following ? 'Stop following the story' : 'Follow the story';
    followButton.title = text;
    followButton.setAttribute('aria-label', text);
    followButton.setAttribute('aria-pressed', String(following));
  }
  if (followButton) {
    followButton.classList.add('follow');
    syncFollow();
    followButton.addEventListener('click', () => {
      following = !following;
      localStorage.setItem('aniflow-diagram-follow', following ? '1' : '0');
      syncFollow();
      if (!following) reset();
      else stage.diagramPlay?.aim();
    });
  }
  stage.diagramCamera = { look: look };

  outButton.addEventListener('click', () => zoomAt(1 / 1.5, ...center()));
  inButton.addEventListener('click', () => zoomAt(1.5, ...center()));
  fitButton.addEventListener('click', reset);
  function openFull() {
    if (!diagramDialog) {
      diagramDialog = document.createElement('dialog');
      diagramDialog.className = 'diagram-dialog';
      diagramDialog.setAttribute('aria-label', 'Diagram');
      document.body.append(diagramDialog);
      addBusyCheck(() => diagramDialog.open);
    }
    holder.style.minHeight = holder.offsetHeight + 'px';
    diagramDialog.append(stage);
    fullButton.innerHTML = diagramIcon('close');
    fullButton.title = 'Close';
    fullButton.setAttribute('aria-label', 'Close');
    diagramDialog.addEventListener('close', () => {
      stage.diagramNotes?.hidden();
      holder.append(stage);
      holder.style.minHeight = '';
      fullButton.innerHTML = diagramIcon('full');
      fullButton.title = 'Full screen';
      fullButton.setAttribute('aria-label', 'Full screen');
      reset();
    }, { once: true });
    diagramDialog.showModal();
    reset();
    fullButton.focus();
    stage.diagramNotes?.shown();
  }
  fullButton.addEventListener('click', () => (full() ? diagramDialog.close() : openFull()));
  stage.diagramFull = () => {
    if (full()) return;
    if (!diagramDialog || !diagramDialog.open) {
      openFull();
      return;
    }
    // The diagram on screen goes back to its place in the page on close, then this one takes over.
    diagramDialog.addEventListener('close', openFull, { once: true });
    diagramDialog.close();
  };

  stage.addEventListener('keydown', (event) => {
    if (!full() || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = 60;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (event.key === '+' || event.key === '=') zoomAt(1.5, ...center());
    else if (event.key === '-') zoomAt(1 / 1.5, ...center());
    else if (event.key === '0') reset();
    else if (moves[event.key]) panBy(...moves[event.key]);
    else return;
    event.preventDefault();
  });

  stage.addEventListener('wheel', (event) => {
    if (!full() && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
    zoomAt(Math.exp(-Math.max(-100, Math.min(100, delta)) * (event.ctrlKey ? 0.01 : 0.0025)), event.clientX, event.clientY);
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (event.target.closest('.diagram-tools')) return;
    zoomAt(event.shiftKey ? 1 / 2 : 2, event.clientX, event.clientY);
  });

  // The pen draws inside the SVG so strokes pan and zoom with the diagram, at a constant width on
  // screen. The laser is a short trail that fades on its own and never reaches an export.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let drawing = false;
  let ink = null;
  let laser = [];
  let laserFrame = 0;
  function inkLayer() {
    if (!ink || !ink.isConnected) {
      ink = document.createElementNS(SVG_NS, 'g');
      ink.setAttribute('class', 'diagram-ink');
      svg.append(ink);
    }
    return ink;
  }
  function toDiagram(event) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }
  function inkPath(name, width) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', name);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    inkLayer().append(path);
    return path;
  }
  const pathData = (points) => points.map((point, at) => (at ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join('');
  function drawLaser() {
    laserFrame = 0;
    const now = performance.now();
    laser = laser.filter((point) => now - point.t < 320);
    let trail = ink && ink.querySelector('.ink-laser');
    let head = ink && ink.querySelector('circle');
    if (!laser.length || !drawing) {
      trail?.remove();
      head?.remove();
      laser = [];
      return;
    }
    if (!trail) trail = inkPath('ink-laser', 5);
    if (!head) head = inkLayer().appendChild(document.createElementNS(SVG_NS, 'circle'));
    const last = laser[laser.length - 1];
    const matrix = svg.getScreenCTM();
    trail.setAttribute('d', pathData(laser));
    head.setAttribute('cx', last.x);
    head.setAttribute('cy', last.y);
    head.setAttribute('r', String(5 / (matrix && matrix.a ? matrix.a : 1)));
    laserFrame = requestAnimationFrame(drawLaser);
  }
  function clearInk() {
    cancelAnimationFrame(laserFrame);
    laserFrame = 0;
    laser = [];
    ink?.remove();
    ink = null;
  }
  function setDrawing(on) {
    if (on === drawing) return;
    drawing = on;
    if (on) stage.diagramNotes?.off();
    diagramBusy(on);
    stage.classList.toggle('drawing', on);
    penButton.setAttribute('aria-pressed', String(on));
    const text = on ? 'Stop drawing and clear' : 'Draw on the diagram';
    penButton.title = text;
    penButton.setAttribute('aria-label', text);
    if (!on) clearInk();
  }
  penButton.classList.add('pen');
  penButton.setAttribute('aria-pressed', 'false');
  penButton.addEventListener('click', () => setDrawing(!drawing));
  stage.diagramDraw = setDrawing;
  stage.addEventListener('pointermove', (event) => {
    if (!drawing || pointers.size > 1 || event.target.closest?.('.diagram-tools')) return;
    const point = toDiagram(event);
    if (!point) return;
    laser.push({ x: point.x, y: point.y, t: performance.now() });
    if (!laserFrame) laserFrame = requestAnimationFrame(drawLaser);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !ink || !ink.querySelector('.ink-stroke') || !stage.isConnected) return;
    if (!stage.closest('dialog') && document.querySelector('dialog[open]')) return;
    event.preventDefault();
    for (const stroke of ink.querySelectorAll('.ink-stroke')) stroke.remove();
  }, { signal: host.render?.signal });

  // One pointer drags, two pinch. Touch at the fitted size is left to the page so it still scrolls.
  // With the pen on, one pointer draws instead, and a second one turns the stroke into a pinch.
  const pointers = new Map();
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.diagram-tools')) return;
    if (drawing) {
      for (const point of pointers.values()) {
        point.stroke?.remove();
        point.stroke = null;
        point.passive = false;
      }
      const at = toDiagram(event);
      const stroke = !pointers.size && at ? inkPath('ink-stroke', 3) : null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, stroke: stroke, points: at ? [at] : [] });
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.pointerType === 'touch' && !zoomed() && !full() && !pointers.size) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, passive: true });
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse') event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    if (last.stroke) {
      const at = toDiagram(event);
      if (at) last.points.push(at);
      last.stroke.setAttribute('d', pathData(last.points));
      last.x = event.clientX;
      last.y = event.clientY;
      return;
    }
    const others = [...pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (others.length === 1) {
      const other = others[0];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before > 0) zoomAt(after / before, (event.clientX + other.x) / 2, (event.clientY + other.y) / 2);
      panBy((event.clientX - last.x) / 2, (event.clientY - last.y) / 2);
    } else if (!others.length && !last.passive) {
      panBy(event.clientX - last.x, event.clientY - last.y);
    }
  });
  const release = (event) => {
    const last = pointers.get(event.pointerId);
    if (last && last.stroke && last.points.length < 2) last.stroke.remove();
    pointers.delete(event.pointerId);
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  apply();
}
