import { host } from '../host.js';
import { SVG_NS, diagramLinks, diagramNodes } from './graph.js';
import { diagramIcon } from './icons.js';
import { copyText } from '../reader/code.js';

// In full screen a box, an arrow or the whole diagram takes review comments. Each is an ordinary
// line comment anchored on the source line that declares its target, so it moves and goes
// outdated like any other, and its target names the box or arrow in the prompt.
export const NOTE_KINDS = { node: 'Box', edge: 'Arrow', diagram: 'Diagram' };
export function diagramComments(stage, svg, after, about) {
  const url = host.commentsUrl;
  const base = Number(about.line) || 0;
  const last = Number(about.lineEnd) || 0;
  if (!url || !base || !last) return null;
  const max = host.commentMax;
  const gated = Boolean(host.commentsSignin);
  const me = host.commentsMe;
  const mine = (comment) => !gated || (me && comment.author_id === me.id);
  const nodes = diagramNodes(svg);
  const names = new Map([...nodes].map(([name, group]) => [group, name]));
  const links = diagramLinks(svg, nodes, about.edges);
  const source = about.source.split(/\r?\n/);
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    if (tag === 'button') element.type = 'button';
    return element;
  };
  const clean = (text, fallback) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
  const nodeName = (name) => clean(nodes.get(name)?.textContent, name);
  const escaped = (name) => name.replace(/\W/g, '\\$&');
  const word = (name) => new RegExp('(?:^|[^\\w-])' + escaped(name) + '(?![\\w-])');
  const code = (text) => text.trim() && !text.trim().startsWith('%%');
  const full = () => Boolean(stage.closest('dialog.diagram-dialog[open]'));

  // The fence's own line stands for the whole diagram, and for anything no line names.
  function lineWhere(test) {
    const at = source.findIndex((text) => code(text) && test(text));
    return at < 0 ? base : base + 1 + at;
  }
  function nodeLine(name) {
    const pattern = word(name);
    return lineWhere((text) => pattern.test(text));
  }
  function edgeLine(link) {
    if (!/^L_/.test(link.id)) {
      const declared = new RegExp('(?:^|[^\\w-])' + escaped(link.id) + '@');
      const line = lineWhere((text) => declared.test(text));
      if (line !== base) return line;
    }
    const from = word(link.from), to = word(link.to);
    const nth = links.filter((other) => other.from === link.from && other.to === link.to).indexOf(link);
    let seen = 0;
    const at = source.findIndex((text) => code(text) && from.test(text) && to.test(text) && /--|==|-\.|~~/.test(text) && seen++ === nth);
    return at < 0 ? nodeLine(link.from) : base + 1 + at;
  }
  const nodeTarget = (name) => ({ kind: 'node', id: name, label: nodeName(name), line: nodeLine(name), parts: [nodes.get(name)] });
  function edgeTarget(link) {
    const said = clean(link.label?.textContent, '');
    const label = clean(nodeName(link.from) + ' → ' + nodeName(link.to) + (said ? ' (' + said + ')' : ''), link.id);
    return { kind: 'edge', id: link.id, label: label, line: edgeLine(link), parts: [link.path, link.label].filter(Boolean) };
  }
  const whole = () => ({ kind: 'diagram', id: '', label: '', line: base, parts: [] });
  const keyOf = (target) => target.kind + ':' + (target.id || '');
  const describe = (target) => target.kind === 'diagram' ? 'Whole diagram'
    : NOTE_KINDS[target.kind] + ' “' + target.label + '”' + (target.lost ? ', no longer drawn' : '');

  // Arrows are thin, so a click picks the nearest one within a few pixels, measured on points
  // sampled once along each path and mapped to the screen on every pick.
  const samples = new Map();
  function along(link) {
    let points = samples.get(link);
    if (!points) {
      const total = link.path.getTotalLength();
      const count = Math.max(2, Math.ceil(total / 6));
      points = [];
      for (let at = 0; at <= count; at++) points.push(link.path.getPointAtLength(total * at / count));
      samples.set(link, points);
    }
    return points;
  }
  function pick(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under || !stage.contains(under) || under.closest('.diagram-tools, .diagram-caption')) return null;
    const pin = under.closest('.diagram-pin');
    if (pin) return { pin: pin.dataset.key };
    const inside = (element) => {
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const group = under.closest(':is(g.node, g.image-shape)') || [...names.keys()].find(inside);
    if (group && names.has(group)) return nodeTarget(names.get(group));
    const label = under.closest('g.edgeLabel');
    let best = null;
    let distance = 10;
    for (const link of links) {
      if (label && link.label === label) return edgeTarget(link);
      const matrix = link.path.getScreenCTM();
      if (!matrix) continue;
      for (const point of along(link)) {
        const spot = point.matrixTransform(matrix);
        const away = Math.hypot(spot.x - x, spot.y - y);
        if (away < distance) {
          distance = away;
          best = link;
        }
      }
    }
    return best ? edgeTarget(best) : whole();
  }
  function targetOf(comment) {
    const target = comment.target;
    if (target.kind === 'node' && nodes.has(target.id)) return nodeTarget(target.id);
    const link = target.kind === 'edge' && links.find((other) => other.id === target.id);
    if (link) return edgeTarget(link);
    if (target.kind === 'diagram') return whole();
    return { kind: target.kind, id: target.id || '', label: target.label || target.id || '', line: comment.start, parts: [], lost: true };
  }

  const toggle = make('button', 'note-toggle');
  toggle.innerHTML = diagramIcon('comment');
  const count = make('span', 'count');
  count.hidden = true;
  toggle.append(count);
  toggle.setAttribute('aria-pressed', 'false');
  after.after(toggle);

  const panel = make('aside', 'diagram-notes');
  panel.setAttribute('aria-label', 'Diagram comments');
  const head = make('header');
  const title = make('h2', '', 'Comments');
  const closeButton = make('button', 'diagram-notes-close');
  closeButton.innerHTML = diagramIcon('close');
  closeButton.title = 'Close comments';
  closeButton.setAttribute('aria-label', 'Close comments');
  head.append(title, closeButton);
  const hint = make('p', 'diagram-notes-hint', nodes.size
    ? 'Click a box or an arrow to comment on it, or the background for the whole diagram.'
    : 'Click the diagram to comment on it.');
  const list = make('div', 'diagram-notes-list');
  const foot = make('footer');
  const status = make('span', 'diagram-notes-status');
  status.setAttribute('role', 'status');
  const copyAll = make('button', '', 'Copy all');
  copyAll.title = 'Copy every comment on the page as a prompt';
  const copyOne = make('button', 'primary', 'Copy for agent');
  copyOne.title = 'Copy the comments on this diagram as a prompt';
  foot.append(status, copyAll, copyOne);
  panel.append(head, hint, list, foot);

  let comments = [];
  let groups = [];
  let active = false;
  let draft = null;
  let pins = null;
  let hovered = [];
  let picked = [];
  let statusTimer = 0;

  function say(text) {
    status.textContent = text.replace(/^!/, '');
    status.classList.toggle('error', text.startsWith('!'));
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 3500);
  }
  function ago(date) {
    const seconds = (date.getTime() - Date.now()) / 1000;
    const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return 'just now';
  }
  const mark = (parts, name, on) => { for (const part of parts) part.classList.toggle(name, on); };
  function hover(parts) {
    mark(hovered, 'note-hover', false);
    hovered = parts;
    mark(hovered, 'note-hover', true);
  }
  function choose(parts) {
    mark(picked, 'note-picked', false);
    picked = parts;
    mark(picked, 'note-picked', true);
  }

  async function call(address, options) {
    const response = await fetch(address, Object.assign({ cache: 'no-store' }, options));
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(answer.error || response.statusText);
    return answer;
  }
  async function load(view) {
    view = view || await call(url);
    comments = view.comments.filter((comment) => comment.target && comment.start >= base && comment.start <= last);
    draw();
  }
  async function send(action, query, body) {
    const view = await call(url.replace('/comments/', '/comments/' + action + '/') + query, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    });
    await load(view);
    dispatchEvent(new CustomEvent('aniflow-comments'));
  }

  function editor(text, label, action, save, cancel) {
    const form = make('form', 'diagram-note-form');
    const area = make('textarea');
    area.value = text;
    area.rows = 3;
    area.maxLength = max;
    area.placeholder = 'Leave a comment';
    area.setAttribute('aria-label', label);
    const row = make('div', 'review-actions');
    const keys = make('span', 'diagram-note-keys', /Mac|iP/.test(navigator.platform) ? '⌘ Enter to save' : 'Ctrl+Enter to save');
    const cancelButton = make('button', '', 'Cancel');
    const submit = make('button', 'primary', action);
    submit.type = 'submit';
    row.append(keys, cancelButton, submit);
    form.append(area, row);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!area.value.trim()) {
        area.focus();
        return;
      }
      submit.disabled = true;
      try {
        await save(area.value);
      } catch (error) {
        submit.disabled = false;
        say('!Saving failed: ' + (error.message || error));
      }
    });
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    cancelButton.addEventListener('click', cancel);
    return { form: form, area: area };
  }

  function closeDraft() {
    draft = null;
    choose([]);
  }
  function signInLink(label) {
    const link = make('a', 'review-signin', label);
    link.href = host.commentsSignin + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
    return link;
  }

  function compose(target) {
    closeDraft();
    const box = make('section', 'diagram-note draft');
    const top = make('header');
    top.append(make('span', 'diagram-note-new', 'New'), make('span', 'diagram-note-what', describe(target)));
    if (gated && !me) {
      box.append(top, make('p', 'diagram-note-body', 'Sign in with GitHub to comment on ' + describe(target) + '.'), signInLink('Sign in'));
      draft = { target: target, element: box };
      choose(target.parts);
      draw();
      box.scrollIntoView({ block: 'nearest' });
      return;
    }
    const { form, area } = editor('', 'Comment on ' + describe(target), 'Comment', async (text) => {
      const named = { kind: target.kind, id: target.id, label: target.label, diagram: about.index };
      await send('add', '', { start: target.line, end: target.line, body: text, target: named });
      closeDraft();
      draw();
      say('Comment added');
    }, () => {
      closeDraft();
      draw();
    });
    box.append(top, form);
    draft = { target: target, element: box };
    choose(target.parts);
    draw();
    box.scrollIntoView({ block: 'nearest' });
    area.focus({ preventScroll: true });
  }

  function entry(comment) {
    const item = make('article', 'diagram-note-entry' + (comment.outdated ? ' outdated' : ''));
    const meta = make('div', 'diagram-note-meta');
    const stamp = new Date((comment.updated || comment.created) * 1000);
    const when = make('time', '', ago(stamp) + (comment.updated > comment.created + 1 ? ', edited' : ''));
    when.dateTime = stamp.toISOString();
    when.title = stamp.toLocaleString();
    meta.append(when);
    if (comment.author) meta.append(make('span', 'review-author', comment.author));
    if (comment.outdated) {
      const tag = make('span', 'diagram-note-outdated', 'Outdated');
      tag.title = 'The diagram changed here after this comment. It was written on:\n' + comment.quote.join('\n');
      meta.append(tag);
    }
    const actions = make('span', 'review-tools');
    const edit = make('button', '', 'Edit');
    const remove = make('button', '', 'Delete');
    actions.append(edit, remove);
    if (mine(comment)) meta.append(actions);
    const body = make('p', 'diagram-note-body', comment.body);
    item.append(meta, body);
    edit.addEventListener('click', () => {
      if (item.querySelector('form')) return;
      const done = () => {
        form.remove();
        body.hidden = false;
        edit.disabled = false;
      };
      const { form, area } = editor(comment.body, 'Edit the comment', 'Save', async (text) => {
        await send('edit', '?id=' + encodeURIComponent(comment.id), { body: text });
        say('Comment saved');
      }, done);
      body.hidden = true;
      edit.disabled = true;
      body.after(form);
      area.focus();
    });
    let armed = 0;
    remove.addEventListener('click', async () => {
      if (!armed) {
        remove.textContent = 'Confirm';
        remove.classList.add('danger');
        armed = setTimeout(() => {
          armed = 0;
          remove.textContent = 'Delete';
          remove.classList.remove('danger');
        }, 3000);
        return;
      }
      clearTimeout(armed);
      remove.disabled = true;
      try {
        await send('delete', '?id=' + encodeURIComponent(comment.id));
        say('Comment deleted');
      } catch (error) {
        remove.disabled = false;
        say('!Deleting failed: ' + (error.message || error));
      }
    });
    return item;
  }

  function thread(group, number) {
    const box = make('section', 'diagram-note');
    box.dataset.key = group.key;
    const top = make('header');
    const what = make('button', 'diagram-note-what', describe(group.target));
    what.title = 'Show it on the diagram';
    what.addEventListener('click', () => light(group.key));
    const reply = make('button', 'diagram-note-reply', 'Reply');
    reply.addEventListener('click', () => compose(group.target));
    top.append(make('span', 'diagram-note-pin', String(number)), what, reply);
    box.append(top);
    for (const comment of group.comments) box.append(entry(comment));
    box.addEventListener('pointerenter', () => hover(group.target.parts));
    box.addEventListener('pointerleave', () => hover([]));
    return box;
  }

  function threads() {
    const found = new Map();
    for (const comment of [...comments].sort((a, b) => a.start - b.start || a.created - b.created)) {
      const target = targetOf(comment);
      const key = keyOf(target);
      if (!found.has(key)) found.set(key, { key: key, target: target, comments: [] });
      found.get(key).comments.push(comment);
    }
    return [...found.values()];
  }

  // Pins sit in diagram coordinates so they pan and zoom with it, scaled back to a fixed size.
  function pinSpot(target) {
    const inverse = svg.getScreenCTM()?.inverse();
    if (!inverse || !target.parts.length) return { x: about.home.x + 12, y: about.home.y + 12 };
    let x, y;
    if (target.kind === 'edge' && !target.parts[1]) {
      const path = target.parts[0];
      const middle = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM());
      x = middle.x + 10;
      y = middle.y - 10;
    } else {
      const rect = target.parts[target.parts.length - 1].getBoundingClientRect();
      x = rect.right;
      y = rect.top;
    }
    return new DOMPoint(x, y).matrixTransform(inverse);
  }
  function zoom() {
    if (!pins) return;
    const matrix = svg.getScreenCTM();
    const scale = matrix && matrix.a ? 1 / matrix.a : 1;
    for (const pin of pins.children) pin.firstChild.setAttribute('transform', 'scale(' + scale + ')');
  }
  function drawPins() {
    pins?.remove();
    pins = null;
    if (!full() || !groups.length) return;
    pins = document.createElementNS(SVG_NS, 'g');
    pins.setAttribute('class', 'diagram-pins');
    groups.forEach((group, at) => {
      const spot = pinSpot(group.target);
      const pin = document.createElementNS(SVG_NS, 'g');
      pin.setAttribute('class', 'diagram-pin');
      pin.setAttribute('transform', 'translate(' + spot.x + ' ' + spot.y + ')');
      pin.dataset.key = group.key;
      const inner = document.createElementNS(SVG_NS, 'g');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '11');
      const text = document.createElementNS(SVG_NS, 'text');
      text.textContent = String(at + 1);
      const tip = document.createElementNS(SVG_NS, 'title');
      tip.textContent = describe(group.target) + ': ' + group.comments.length + (group.comments.length === 1 ? ' comment' : ' comments');
      inner.append(dot, text);
      pin.append(inner, tip);
      pins.append(pin);
    });
    svg.append(pins);
    zoom();
  }

  function draw() {
    groups = threads();
    count.textContent = String(comments.length);
    count.hidden = !comments.length;
    const label = active ? 'Stop commenting' : 'Comment on the diagram' + (comments.length ? ', ' + comments.length + ' so far' : '');
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    drawPins();
    if (!active) return;
    title.textContent = comments.length ? 'Comments (' + comments.length + ')' : 'Comments';
    copyOne.disabled = !comments.length;
    list.replaceChildren();
    if (draft) list.append(draft.element);
    groups.forEach((group, at) => list.append(thread(group, at + 1)));
    if (!groups.length && !draft) list.append(make('p', 'diagram-notes-empty', 'No comments on this diagram yet.'));
  }

  function light(key) {
    const group = groups.find((other) => other.key === key);
    if (!group) return;
    for (const element of panel.querySelectorAll('.diagram-note.lit')) element.classList.remove('lit');
    for (const element of svg.querySelectorAll('.note-lit')) element.classList.remove('note-lit');
    const card = [...list.children].find((element) => element.dataset.key === key);
    card?.classList.add('lit');
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    mark(group.target.parts, 'note-lit', true);
    pins?.querySelector('[data-key="' + CSS.escape(key) + '"]')?.classList.add('lit');
    setTimeout(() => {
      card?.classList.remove('lit');
      mark(group.target.parts, 'note-lit', false);
      pins?.querySelector('.lit')?.classList.remove('lit');
    }, 1600);
  }

  function open() {
    if (active || !full()) return Promise.resolve();
    active = true;
    stage.diagramDraw?.(false);
    stage.diagramFocus?.set([]);
    const dialog = stage.closest('dialog');
    stage.classList.add('commenting');
    dialog.classList.add('commenting');
    dialog.append(panel);
    toggle.setAttribute('aria-pressed', 'true');
    draw();
    return load().catch((error) => say('!Loading failed: ' + (error.message || error)));
  }
  function close() {
    if (!active) return;
    active = false;
    closeDraft();
    hover([]);
    stage.classList.remove('commenting', 'note-aim');
    panel.closest('dialog')?.classList.remove('commenting');
    panel.remove();
    toggle.setAttribute('aria-pressed', 'false');
    draw();
  }

  async function copyPrompt(address) {
    try {
      const response = await fetch(address, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.statusText);
      say(await copyText(await response.text()) ? 'Copied, paste it to your agent' : '!Copy failed');
    } catch (error) {
      say('!Copy failed: ' + (error.message || error));
    }
  }

  toggle.addEventListener('click', () => (active ? close() : open()));
  closeButton.addEventListener('click', close);
  copyOne.addEventListener('click', () => copyPrompt(url + '?format=prompt&lines=' + base + '-' + last));
  copyAll.addEventListener('click', () => copyPrompt(url + '?format=prompt'));
  let start = null;
  stage.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; }, true);
  stage.addEventListener('pointermove', (event) => {
    if (!active || event.buttons || event.pointerType !== 'mouse') return;
    const target = pick(event.clientX, event.clientY);
    hover(target && target.parts ? target.parts : []);
    stage.classList.toggle('note-aim', Boolean(target && (target.pin || target.parts.length)));
  });
  stage.addEventListener('pointerleave', () => hover([]));
  stage.addEventListener('click', (event) => {
    if (event.button !== 0 || event.detail > 1 || !full()) return;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const target = pick(event.clientX, event.clientY);
    if (!target) return;
    if (target.pin) {
      const key = target.pin;
      open().then(() => light(key));
    } else if (active) {
      compose(target);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !active || event.defaultPrevented || !stage.isConnected) return;
    event.preventDefault();
    if (draft) {
      closeDraft();
      draw();
    } else {
      close();
    }
  }, { signal: host.render?.signal });
  new ResizeObserver(zoom).observe(stage);

  return {
    shown: () => load().catch(() => {}),
    hidden() {
      close();
      pins?.remove();
      pins = null;
    },
    off: close,
    zoom: zoom,
  };
}
