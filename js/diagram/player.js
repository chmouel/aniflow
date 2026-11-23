import { host } from '../host.js';
import { diagramBusy } from './busy.js';
import { gifWriter } from './gif.js';
import { SVG_NS, diagramLinks, diagramNodes } from './graph.js';
import { showIcon } from './icons.js';
import { diagramCanvas } from './picture.js';
import { diagramExportName, diagramVideoType } from './share.js';
import { DIAGRAM_PACE, diagramRate, diagramSpeed, setDiagramSpeed } from './speed.js';
import { diagramWarnings } from './warnings.js';

export function playDiagram(stage, svg, tools, scripts, home, share, edges) {
  const sequence = svg.getAttribute('aria-roledescription') === 'sequence';
  // A sequence participant is drawn several times (box or stick figure at the top and bottom,
  // and its lifeline), so the first one stands for it and parts lists them all.
  const parts = new Map();
  const messages = [];
  let nodes = null;
  if (sequence) {
    nodes = new Map();
    const lifelines = [];
    for (const element of svg.querySelectorAll('rect.actor[name], g.actor-man[name], line.actor-line[name]')) {
      const name = element.getAttribute('name');
      const part = element.tagName === 'rect' ? element.parentNode : element;
      if (element.tagName === 'line') lifelines.push({ name: name, x: Number(element.getAttribute('x1')) });
      if (!nodes.has(name)) {
        nodes.set(name, part);
        parts.set(part, []);
      }
      part.classList.add('play-actor');
      parts.get(nodes.get(name)).push(part);
    }
    const nearest = (x) => lifelines.reduce((best, line) => (Math.abs(line.x - x) < Math.abs(best.x - x) ? line : best)).name;
    if (lifelines.length) {
      for (const path of svg.querySelectorAll(':is(line, path):is(.messageLine0, .messageLine1)')) {
        const texts = [];
        for (let before = path.previousElementSibling; before && before.matches('text.messageText'); before = before.previousElementSibling) texts.unshift(before);
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(path.getTotalLength());
        messages.push({ from: nearest(start.x), to: nearest(end.x), path: path, texts: texts });
      }
    }
  } else nodes = diagramNodes(svg);
  const each = (node, change) => {
    for (const part of parts.get(node) || [node]) change(part);
  };
  const links = sequence ? [] : diagramLinks(svg, nodes, edges);
  const named = new Map(links.map((link) => [link.id, link]));
  // Without an id, the first edge drawn from one box to the other, either way round.
  const edgeFor = (from, to, id) => {
    if (id) {
      const link = named.get(id);
      if (!link) return { problem: 'no edge with the id ' + id };
      if (link.from === from && link.to === to) return { path: link.path, reverse: false };
      if (link.from === to && link.to === from) return { path: link.path, reverse: true };
      return { problem: 'edge ' + id + ' does not join ' + from + ' and ' + to };
    }
    const forward = links.find((link) => link.from === from && link.to === to);
    const back = forward || links.find((link) => link.from === to && link.to === from);
    return back ? { path: back.path, reverse: !forward } : { problem: 'no edge between ' + from + ' and ' + to };
  };
  const box = sequence ? 'participant' : 'box';

  // Steps that name an unknown node or an edge that is not drawn are dropped and listed by
  // diagramWarnings with their line. A dropped step's wait moves on to the next one.
  const resolved = scripts.map((script) => {
    const steps = [];
    const problems = [];
    let cursor = 0;
    let hold = null;
    const drop = (step, reason) => {
      problems.push({ line: step.line, text: step.text, reason: reason });
      hold = step.hold || hold;
    };
    for (const step of script.steps) {
      if (step.bad) {
        drop(step, step.bad);
        continue;
      }
      if (step.skip) {
        const found = step.skip.map((name) => nodes.get(name)).filter(Boolean);
        const missing = step.skip.filter((name) => !nodes.has(name));
        if (missing.length) problems.push({ line: step.line, text: step.text, reason: 'no ' + box + ' named ' + missing.join(', ') });
        if (found.length) {
          steps.push({ skip: found, caption: step.caption, hold: step.hold || hold });
          hold = null;
        } else hold = step.hold || hold;
        continue;
      }
      const missing = [...step.from, ...step.to].map((end) => end.name).filter((name) => !nodes.has(name));
      if (missing.length) {
        drop(step, 'no ' + box + ' named ' + [...new Set(missing)].join(', '));
        continue;
      }
      if (step.from.length > 1 && step.to.length > 1) {
        drop(step, 'several boxes on both sides; write one step per edge');
        continue;
      }
      if (sequence && [...step.from, ...step.to].some((end) => end.edge)) {
        drop(step, 'edge ids only work in flowcharts');
        continue;
      }
      const taken = new Set();
      let problem = '';
      const moves = step.from.flatMap((from) => step.to.map((to) => {
        if (problem) return null;
        if (from.edge && to.edge && from.edge !== to.edge) {
          problem = 'two edge ids for ' + from.name + ' and ' + to.name;
          return null;
        }
        if (sequence) {
          // The next matching message after the previous step, wrapping round to the top.
          const order = messages.map((message, at) => (at + cursor) % messages.length);
          const at = order.find((at) => !taken.has(at) && messages[at].from === from.name && messages[at].to === to.name);
          if (at === undefined) {
            problem = 'no message from ' + from.name + ' to ' + to.name;
            return null;
          }
          taken.add(at);
          return { from: nodes.get(from.name), to: nodes.get(to.name), path: messages[at].path, texts: messages[at].texts, reverse: false, at: at };
        }
        const edge = edgeFor(from.name, to.name, from.edge || to.edge);
        if (edge.problem) {
          problem = edge.problem;
          return null;
        }
        return { from: nodes.get(from.name), to: nodes.get(to.name), path: edge.path, reverse: edge.reverse };
      }));
      if (problem) {
        drop(step, problem);
        continue;
      }
      if (sequence) cursor = Math.max(...moves.map((move) => move.at)) + 1;
      steps.push({ moves: moves, label: step.label, caption: step.caption, hold: step.hold || hold });
      hold = null;
    }
    return { title: script.title, steps: steps, problems: problems, tail: hold || script.tail };
  });
  diagramWarnings(stage, tools, resolved);
  const scenarios = resolved.filter((scenario) => scenario.steps.length);
  if (!scenarios.length) return;

  const controls = document.createElement('div');
  controls.className = 'diagram-play';
  let picker = null;
  if (scenarios.length > 1) {
    picker = document.createElement('select');
    picker.name = 'scenario';
    picker.setAttribute('aria-label', 'Scenario');
    scenarios.forEach((scenario, index) => picker.add(new Option(scenario.title, String(index))));
    controls.append(picker);
  }
  const make = (icon, label, name) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = name;
    showIcon(element, icon);
    element.title = label;
    element.setAttribute('aria-label', label);
    controls.append(element);
    return element;
  };
  const backButton = make('back', 'Previous step', 'play-back');
  const playButton = make('play', 'Play', 'play-toggle');
  const nextButton = make('next', 'Next step', 'play-next');
  const stopButton = make('stop', 'Stop', 'play-stop');
  const speedButton = document.createElement('button');
  speedButton.type = 'button';
  speedButton.className = 'play-speed';
  controls.append(speedButton);
  const showSpeed = () => {
    speedButton.textContent = diagramSpeed + '×';
    const text = 'Speed ' + diagramSpeed + '× (< and > change it)';
    speedButton.title = text;
    speedButton.setAttribute('aria-label', text);
  };
  showSpeed();
  speedButton.addEventListener('click', () => setDiagramSpeed(0));
  addEventListener('aniflow-diagram-speed', showSpeed, { signal: host.render?.signal });
  const rail = document.createElement('div');
  rail.className = 'play-rail';
  rail.setAttribute('aria-hidden', 'true');
  controls.append(rail);
  const recordButton = share.button;
  share.title = 'Share or save this story';
  share.label();
  share.link.dataset.note = share.link.querySelector('small').textContent = 'To this story, step and spotlight';
  share.choice('gif', 'GIF', 'Loops, plays anywhere');
  // The menu offers one video choice and lets the browser pick the container; an export asks
  // for a container by name and must get it.
  const videoType = diagramVideoType('video');
  if (videoType) share.choice('video', 'Video', videoType.startsWith('video/mp4') ? 'MP4, smaller and smoother' : 'WebM, smaller and smoother');
  const mimeFor = (kind) => kind === 'gif' ? '' : kind === 'video' ? videoType : diagramVideoType(kind);
  const exportLabel = (kind) => kind === 'gif' ? 'GIF' : kind === 'mp4' ? 'MP4' : kind === 'webm' ? 'WebM' : 'video';
  tools.prepend(controls);
  const caption = document.createElement('div');
  caption.className = 'diagram-caption';
  caption.setAttribute('aria-live', 'polite');
  caption.hidden = true;
  stage.append(caption);
  const say = (text) => {
    caption.textContent = text || '';
    caption.hidden = !text;
  };

  let timeline = [];
  let index = 0;
  let elapsed = 0;
  let playing = false;
  let finished = false;
  let frame = 0;
  let last = 0;
  // Several boxes can be lit at once when a step fans out or in.
  const active = new Set();
  let tokens = [];
  // Step mode stops the timeline after each step. waiting means the next segment is not entered yet.
  let reached = 0;
  let waiting = false;
  let stepping = false;

  const scenario = () => scenarios[picker ? Number(picker.value) : 0];
  function label(icon, text) {
    showIcon(playButton, icon);
    playButton.title = text;
    playButton.setAttribute('aria-label', text);
  }
  function sync() {
    label(playing ? 'pause' : 'play', playing ? 'Pause' : finished ? 'Replay' : timeline.length ? 'Resume' : 'Play');
    stopButton.hidden = !timeline.length;
    backButton.hidden = !timeline.length || (!reached && !index && !elapsed);
    const total = scenario().steps.length;
    const shown = Math.min(total, reached + 1);
    const next = finished ? 'Next step (from the start)' : 'Next step (' + shown + ' of ' + total + ')';
    nextButton.title = next;
    nextButton.setAttribute('aria-label', next);
    controls.classList.toggle('playing', playing);
    drawRail();
  }
  // One tick per step: played ones fill in, the one playing is bright, and a click jumps there.
  function drawRail() {
    const steps = scenario().steps;
    if (rail.children.length !== steps.length || rail.dataset.story !== String(scenario().title)) {
      rail.dataset.story = String(scenario().title);
      rail.replaceChildren(...steps.map((step, at) => {
        const tick = document.createElement('span');
        tick.title = 'Step ' + (at + 1) + (step.caption ? ': ' + step.caption : step.label ? ': ' + step.label : '');
        tick.addEventListener('click', () => jump(at));
        return tick;
      }));
    }
    rail.hidden = steps.length < 2;
    controls.classList.toggle('stepped', !rail.hidden);
    const played = !timeline.length ? 0 : finished ? steps.length : reached;
    [...rail.children].forEach((tick, at) => {
      tick.classList.toggle('done', at < played);
      tick.classList.toggle('now', playing && !waiting && at === reached && !finished);
    });
  }

  function badge(node) {
    if (sequence || node.querySelector(':scope > .play-check')) return;
    const frame = node.classList.contains('image-shape') ? node.querySelector(':scope > g') : null;
    let box = node.getBBox();
    if (frame) {
      const corner = svg.createSVGPoint();
      const inner = frame.getBBox();
      corner.x = inner.x + inner.width;
      corner.y = inner.y;
      const at = corner.matrixTransform(node.getCTM().inverse().multiply(frame.getCTM()));
      box = { x: at.x - inner.width, y: at.y, width: inner.width };
    }
    const mark = document.createElementNS(SVG_NS, 'g');
    mark.setAttribute('class', 'play-check');
    mark.setAttribute('transform', 'translate(' + (box.x + box.width - 2) + ' ' + (box.y + 2) + ')');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '8');
    const tick = document.createElementNS(SVG_NS, 'path');
    tick.setAttribute('d', 'M-3.6 0.2l2.4 2.4 4.8-5');
    mark.append(circle, tick);
    node.append(mark);
  }
  function setActive(node) {
    each(node, (part) => {
      part.classList.remove('play-done', 'play-skipped');
      part.classList.add('play-active');
    });
    node.querySelector(':scope > .play-check')?.remove();
    active.add(node);
  }
  function setDone(node) {
    each(node, (part) => {
      part.classList.remove('play-active');
      part.classList.add('play-done');
    });
    badge(node);
    active.delete(node);
  }
  function clearMarks() {
    for (const element of svg.querySelectorAll('.play-active, .play-done, .play-skipped, .play-edge, .play-edge-done')) {
      element.classList.remove('play-active', 'play-done', 'play-skipped', 'play-edge', 'play-edge-done');
    }
    for (const element of svg.querySelectorAll('.play-check')) element.remove();
    for (const dot of tokens) dot.remove();
    tokens = [];
    active.clear();
    say('');
  }

  function makeToken(text) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'play-token');
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '6');
    group.append(dot);
    svg.append(group);
    if (text) {
      const tag = document.createElementNS(SVG_NS, 'g');
      tag.setAttribute('class', 'play-tag');
      const back = document.createElementNS(SVG_NS, 'rect');
      const words = document.createElementNS(SVG_NS, 'text');
      words.textContent = text;
      words.setAttribute('text-anchor', 'middle');
      words.setAttribute('y', '-14');
      tag.append(back, words);
      group.append(tag);
      const box = words.getBBox();
      back.setAttribute('x', String(box.x - 6));
      back.setAttribute('y', String(box.y - 3));
      back.setAttribute('width', String(box.width + 12));
      back.setAttribute('height', String(box.height + 6));
      back.setAttribute('rx', '5');
    }
    return group;
  }

  // The box around some elements in the diagram's own units, which is what the viewBox uses.
  function area(elements) {
    const root = svg.getScreenCTM();
    if (!root) return null;
    const inverse = root.inverse();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const element of elements) {
      const own = element && element.getScreenCTM();
      if (!own) continue;
      const box = element.getBBox();
      const to = inverse.multiply(own);
      for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
        const point = new DOMPoint(x, y).matrixTransform(to);
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    }
    return left < Infinity ? { x: left, y: top, width: right - left, height: bottom - top } : null;
  }
  const stepArea = (step) => area(step.skip || step.moves.flatMap((move) => (sequence ? [move.path, ...move.texts] : [move.from, move.to, move.path])));
  // The camera moves only while a story plays on screen, never while it is rebuilt or saved.
  function look(step) {
    if (playing && !exporting) stage.diagramCamera?.look(stepArea(step));
  }
  function aim() {
    const steps = scenario().steps;
    if (!timeline.length || finished || exporting) return;
    stage.diagramCamera?.look(stepArea(steps[Math.min(reached, steps.length - 1)]));
  }

  const lit = (move) => [move.path, ...(move.texts || [])];
  // The timeline is a list of segments that only advances while playing, so pausing is free.
  function build(calm) {
    const segments = [];
    const DWELL = calm ? 650 : 420;
    // A wait is in milliseconds at 1x, and segments are in the units diagramRate() scales.
    const wait = (hold) => {
      if (hold && hold.ms) segments.push({ duration: hold.ms * DIAGRAM_PACE, start: () => { if (hold.caption) say(hold.caption); } });
    };
    for (const step of scenario().steps) {
      wait(step.hold);
      if (step.skip) {
        segments.push({ duration: calm ? 400 : 320, stop: true, start: () => {
          say(step.caption);
          look(step);
          for (const node of step.skip) {
            each(node, (part) => {
              part.classList.remove('play-active', 'play-done');
              part.classList.add('play-skipped');
            });
            node.querySelector(':scope > .play-check')?.remove();
            active.delete(node);
          }
        } });
        continue;
      }
      const sources = new Set(step.moves.map((move) => move.from));
      segments.push({ duration: DWELL, start: () => {
        say(step.caption);
        look(step);
        for (const node of [...active]) if (!sources.has(node)) setDone(node);
        for (const node of sources) setActive(node);
      } });
      // Each dot keeps the pace of its own edge, so a short edge arrives first and the step
      // lasts as long as the longest one.
      const runs = step.moves.map((move) => {
        const length = move.path.getTotalLength();
        return { move: move, length: length, duration: calm ? 300 : Math.min(1700, Math.max(550, length * 3.2)) };
      });
      const longest = Math.max(...runs.map((run) => run.duration));
      const arrive = (run) => {
        if (run.arrived) return;
        run.arrived = true;
        run.token?.remove();
        tokens = tokens.filter((dot) => dot !== run.token);
        run.token = null;
        for (const element of lit(run.move)) {
          element.classList.remove('play-edge');
          element.classList.add('play-edge-done');
        }
        setActive(run.move.to);
      };
      segments.push({
        duration: longest,
        stop: true,
        start: () => {
          for (const node of sources) setDone(node);
          runs.forEach((run, at) => {
            run.arrived = false;
            run.token = null;
            for (const element of lit(run.move)) {
              element.classList.remove('play-edge-done');
              element.classList.add('play-edge');
            }
            if (calm) return;
            const own = run.move.path.getScreenCTM();
            const root = svg.getScreenCTM();
            run.matrix = own && root ? root.inverse().multiply(own) : new DOMMatrix();
            run.token = makeToken(at ? '' : step.label);
            tokens.push(run.token);
          });
        },
        frame: (progress) => {
          for (const run of runs) {
            if (run.arrived) continue;
            const own = Math.min(1, progress * longest / run.duration);
            if (own >= 1 && progress < 1) {
              arrive(run);
              continue;
            }
            if (!run.token) continue;
            const eased = own < 0.5 ? 2 * own * own : 1 - Math.pow(-2 * own + 2, 2) / 2;
            const point = run.move.path.getPointAtLength(run.length * (run.move.reverse ? 1 - eased : eased));
            const placed = new DOMPoint(point.x, point.y).matrixTransform(run.matrix);
            run.token.setAttribute('transform', 'translate(' + placed.x + ' ' + placed.y + ')');
          }
        },
        end: () => {
          for (const run of runs) arrive(run);
        },
      });
    }
    wait(scenario().tail);
    segments.push({ duration: DWELL, start: () => { for (const node of [...active]) setDone(node); } });
    return segments;
  }

  function enter(segment) {
    segment.start();
    if (segment.frame) segment.frame(0);
  }
  // Moves the timeline on by a number of milliseconds and says whether it reached the end
  // (true), or, with toStep, the end of a step that is not the last one ('step').
  function advance(delta, toStep) {
    if (waiting) {
      waiting = false;
      if (index < timeline.length) enter(timeline[index]);
      drawRail();
    }
    elapsed += delta;
    while (index < timeline.length && elapsed >= timeline[index].duration) {
      const done = timeline[index];
      elapsed -= done.duration;
      if (done.frame) done.frame(1);
      if (done.end) done.end();
      index++;
      if (done.stop) {
        reached++;
        drawRail();
      }
      if (toStep && done.stop && reached < scenario().steps.length) {
        elapsed = 0;
        waiting = true;
        return 'step';
      }
      if (index < timeline.length) enter(timeline[index]);
    }
    if (index >= timeline.length) return true;
    const segment = timeline[index];
    if (segment.frame) segment.frame(elapsed / segment.duration);
    return false;
  }
  function restart(calm) {
    clearMarks();
    timeline = build(calm);
    index = 0;
    elapsed = 0;
    reached = 0;
    waiting = false;
    finished = false;
    enter(timeline[0]);
  }
  function tick(now) {
    frame = 0;
    if (!playing) return;
    if (!stage.isConnected) {
      pause();
      return;
    }
    const done = advance(Math.min(100, now - last) * diagramRate(), stepping);
    last = now;
    if (done === 'step') {
      pause();
      return;
    }
    if (done) {
      finished = true;
      pause();
      if (!exporting) stage.diagramCamera?.look(null);
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  const busy = diagramBusy;
  function play(motion, step) {
    stepping = Boolean(step);
    if (playing) return;
    if (finished || !timeline.length) restart(!motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
    playing = true;
    aim();
    busy(true);
    last = performance.now();
    frame = requestAnimationFrame(tick);
    sync();
  }
  function pause() {
    if (playing) busy(false);
    playing = false;
    cancelAnimationFrame(frame);
    frame = 0;
    sync();
  }
  function stop() {
    pause();
    if (!exporting) stage.diagramCamera?.look(null);
    clearMarks();
    timeline = [];
    index = 0;
    elapsed = 0;
    reached = 0;
    waiting = false;
    finished = false;
    sync();
  }
  // Going back rebuilds the picture from the start, jumping over each step without animation.
  // From the middle of a step, back returns to that step's start.
  function stepBack() {
    if (!timeline.length) return;
    const target = finished ? scenario().steps.length - 1 : waiting || (!playing && !elapsed) ? reached - 1 : reached;
    pause();
    restart(matchMedia('(prefers-reduced-motion: reduce)').matches);
    for (let step = 0; step < target; step++) advance(Infinity, true);
    sync();
  }
  function stepNext() {
    if (playing && !stepping) {
      stepping = true;
      return;
    }
    play(false, true);
  }

  // Saving replays the scenario from the start and draws every frame onto a canvas. A GIF steps
  // the timeline by a fixed amount per frame; a video records while it plays in real time.
  let exporting = null;
  function exportProgress() {
    if (!exporting) return;
    const done = timeline.length ? Math.min(99, Math.floor(100 * index / timeline.length)) : 0;
    recordButton.textContent = done + '%';
  }
  function exportEnd(error) {
    if (!exporting) return;
    const kind = exporting.kind;
    exporting = null;
    busy(false);
    stage.classList.remove('recording');
    recordButton.classList.remove('busy');
    showIcon(recordButton, 'share');
    for (const element of [backButton, playButton, nextButton, stopButton, speedButton]) element.disabled = false;
    if (picker) picker.disabled = false;
    share.label(error ? 'Could not save the ' + exportLabel(kind) + ': ' + (error.message || error) : '');
    sync();
  }
  // Saves the story as a GIF or a video and returns {name, blob}: null when it was cancelled,
  // and the failure is thrown once the button says what went wrong.
  async function exportScenario(kind) {
    if (exporting) return null;
    const mime = mimeFor(kind);
    exporting = { kind: kind, cancelled: false };
    const job = exporting;
    pause();
    busy(true);
    for (const element of [backButton, playButton, nextButton, stopButton, speedButton]) element.disabled = true;
    if (picker) picker.disabled = true;
    recordButton.classList.add('busy');
    recordButton.textContent = '0%';
    recordButton.title = 'Cancel';
    recordButton.setAttribute('aria-label', 'Cancel saving');
    let saved = null;
    let name = '';
    try {
      if (kind !== 'gif' && !mime) throw new Error('this browser cannot record ' + exportLabel(kind) + ' video');
      name = diagramExportName(scenario().title, kind === 'gif' ? 'gif' : mime.startsWith('video/mp4') ? 'mp4' : 'webm');
      const captioned = scenario().steps.some((step) => step.caption);
      const canvas = await diagramCanvas(svg, home, kind === 'gif' ? 960 : 1920, captioned);
      if (kind === 'gif') {
        stage.classList.add('recording');
        const STEP = 60;
        const gif = gifWriter(canvas.width, canvas.height);
        restart(false);
        for (;;) {
          await canvas.draw(caption.textContent);
          if (job.cancelled) break;
          const end = index >= timeline.length;
          gif.add(canvas.pixels(), end ? 2400 : STEP);
          if (end) break;
          advance(STEP * diagramRate());
          exportProgress();
          await new Promise((resolve) => setTimeout(resolve));
        }
        if (job.cancelled) stop();
        else {
          finished = true;
          saved = gif.finish();
        }
      } else {
        await canvas.draw(caption.textContent);
        const stream = canvas.element.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        const chunks = [];
        recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
        const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
        recorder.start();
        stop();
        play(true);
        let hold = 0;
        while (!job.cancelled) {
          await canvas.draw(caption.textContent);
          exportProgress();
          if (finished) {
            hold = hold || performance.now() + 1500;
            if (performance.now() >= hold) break;
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        pause();
        recorder.stop();
        await stopped;
        for (const track of stream.getTracks()) track.stop();
        if (job.cancelled) stop();
        else saved = new Blob(chunks, { type: recorder.mimeType || mime });
      }
      if (saved) await host.save(name, saved);
      exportEnd();
    } catch (error) {
      exportEnd(error);
      throw error;
    }
    return saved ? { name: name, blob: saved } : null;
  }

  function where() {
    const total = scenario().steps.length;
    return {
      story: (picker ? Number(picker.value) : 0) + 1,
      step: !timeline.length ? null : finished ? total : reached,
    };
  }
  // Puts a story at the end of a given number of steps, the way stepping back does.
  function restore(story, step) {
    if (exporting) return;
    if (picker && story >= 1 && story <= scenarios.length) picker.value = String(story - 1);
    stop();
    if (step === null) return;
    const total = scenario().steps.length;
    restart(matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (step >= total) {
      while (advance(Infinity) !== true);
      finished = true;
    } else for (let at = 0; at < step; at++) advance(Infinity, true);
    sync();
  }

  function jump(at) {
    if (exporting) return;
    restore((picker ? Number(picker.value) : 0) + 1, at);
    stepNext();
  }

  playButton.addEventListener('click', () => (playing ? pause() : play()));
  backButton.addEventListener('click', stepBack);
  nextButton.addEventListener('click', stepNext);
  stopButton.addEventListener('click', stop);
  share.name = () => scenario().title;
  share.choose = (kind) => {
    exportScenario(kind).catch(() => {});
  };
  stage.diagramExport = (kind) => exportScenario(kind);
  share.cancel = () => {
    if (!exporting) return false;
    exporting.cancelled = true;
    return true;
  };
  if (picker) picker.addEventListener('change', () => {
    stop();
    play();
  });
  // Right/Left, j/k and the PageDown/PageUp that presentation clickers send walk the story, and
  // Space plays or pauses. Shift+arrows still pan, and Space leaves a focused button to the browser.
  stage.addEventListener('keydown', (event) => {
    const space = event.key === ' ' && !event.shiftKey && !event.target.closest('button');
    const forward = event.key === 'PageDown' || event.key === 'j' || (event.key === 'ArrowRight' && !event.shiftKey);
    const backward = event.key === 'PageUp' || event.key === 'k' || (event.key === 'ArrowLeft' && !event.shiftKey);
    const speed = event.key === '>' ? 1 : event.key === '<' ? -1 : 0;
    if ((!forward && !backward && !space && !speed) || exporting || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('select')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (speed) setDiagramSpeed(speed);
    else if (space) playing ? pause() : play();
    else forward ? stepNext() : stepBack();
  });
  // Presentation mode walks a story before leaving its slide; false means there is nothing left
  // that way.
  function walk(forward) {
    if (exporting) return false;
    if (forward) {
      if (finished) return false;
      stepNext();
      return true;
    }
    if (!timeline.length || (!reached && !elapsed && !playing)) return false;
    stepBack();
    return true;
  }
  sync();
  return { where: where, restore: restore, aim: aim, walk: walk, playing: () => playing, finished: () => finished, toggle: () => (playing ? pause() : play()) };
}
