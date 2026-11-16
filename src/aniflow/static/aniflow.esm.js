/* aniflow, Apache-2.0, https://github.com/chmouel/aniflow */

// js/host.js
var host = { save: null };

// js/diagram/busy.js
var checks = [];
function addBusyCheck(check) {
  checks.push(check);
}
function isBusy() {
  return checks.some((check) => check());
}
var diagramsBusy = 0;
var diagramBusyWrapped = false;
function diagramBusy(on) {
  diagramsBusy += on ? 1 : -1;
  if (diagramBusyWrapped) return;
  diagramBusyWrapped = true;
  addBusyCheck(() => diagramsBusy > 0);
}

// js/diagram/parse.js
function diagramLines(source, kinds) {
  const lines = source.split(/\r?\n/);
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at++;
  if (lines[at] && lines[at].trim() === "---") {
    at++;
    while (at < lines.length && lines[at].trim() !== "---") at++;
    at++;
  }
  const head = lines.slice(at).map((line) => line.trim()).find((line) => line && !line.startsWith("%%"));
  return head && kinds.test(head) ? lines.slice(at) : null;
}
var flowchartLines = (source) => diagramLines(source, /^(?:flowchart|graph)\b/);
var WAIT_MAX = 1e4;
function playScript(source, base) {
  const lines = diagramLines(source, /^(?:flowchart|graph|sequenceDiagram)\b/);
  if (!lines) return [];
  const offset = (base || 0) + source.split(/\r?\n/).length - lines.length + 1;
  const scenarios = [];
  let current2 = null;
  let hold = null;
  const story = () => {
    if (!current2) {
      current2 = { title: "Walkthrough", steps: [], tail: null };
      scenarios.push(current2);
    }
    return current2;
  };
  lines.forEach((line, at) => {
    const comment = /^\s*%%(?!\{)\s*(.*?)\s*$/.exec(line);
    if (!comment) return;
    const text = comment[1];
    const title = /^play\s*:\s*(.*)$/i.exec(text);
    if (title) {
      if (current2 && hold) current2.tail = hold;
      hold = null;
      current2 = { title: title[1] || "Scenario " + (scenarios.length + 1), steps: [], tail: null };
      scenarios.push(current2);
      return;
    }
    let step = null;
    const bar = text.indexOf("|");
    const body = bar < 0 ? text : text.slice(0, bar).trim();
    const caption = bar < 0 ? "" : text.slice(bar + 1).trim();
    const where = { caption, text, line: offset + at };
    if (/^wait\b/i.test(body)) {
      const wait = /^wait\s+(\d+)\s*(?:ms)?$/i.exec(body);
      if (!wait) step = Object.assign({ bad: "wait needs a number of milliseconds" }, where);
      else {
        story();
        hold = { ms: Math.min(WAIT_MAX, (hold ? hold.ms : 0) + Number(wait[1])), caption: caption || (hold ? hold.caption : "") };
        return;
      }
    }
    const move = /^([^:]+?)\s*-+>\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(body);
    const skip = /^skip\s+(.+)$/i.exec(body);
    const names = (list) => {
      const found = [];
      for (const word of list.replace(/\s*@\s*/g, "@").split(/[\s,&]+/).filter(Boolean)) {
        const [name, edge] = word.split("@");
        if (name) found.push({ name, edge: edge || "" });
        else if (found.length && edge) found[found.length - 1].edge = edge;
      }
      return found;
    };
    if (!step && move) step = Object.assign({ from: names(move[1]), to: names(move[2]), label: move[3] || "" }, where);
    else if (!step && skip) step = Object.assign({ skip: skip[1].split(/[\s,]+/).filter(Boolean) }, where);
    if (!step) return;
    step.hold = hold;
    hold = null;
    story().steps.push(step);
  });
  if (current2 && hold) current2.tail = hold;
  return scenarios.filter((scenario) => scenario.steps.length);
}

// js/diagram/graph.js
var SVG_NS = "http://www.w3.org/2000/svg";
function diagramNodes(svg) {
  const nodes = /* @__PURE__ */ new Map();
  for (const group of svg.querySelectorAll(":is(g.node, g.image-shape)[id]")) {
    const match = /-flowchart-(.+)-\d+$/.exec(group.id);
    if (match && !nodes.has(match[1])) nodes.set(match[1], group);
  }
  return nodes;
}
async function diagramEdges(source) {
  if (!flowchartLines(source)) return null;
  try {
    const parsed = await mermaid.mermaidAPI.getDiagramFromText(source);
    return parsed.db.getEdges().filter((edge) => edge.id).map((edge) => ({ id: String(edge.id), from: edge.start, to: edge.end }));
  } catch (error) {
    return null;
  }
}
function diagramLinks(svg, nodes, edges) {
  const ends = new Map((edges || []).map((edge) => [edge.id, edge]));
  const links = [];
  for (const path of svg.querySelectorAll("path[data-edge][data-id]")) {
    const id = path.dataset.id;
    let from = ends.get(id)?.from;
    let to = ends.get(id)?.to;
    if (!edges) {
      for (const name of nodes.keys()) {
        if (!id.startsWith("L_" + name + "_")) continue;
        const rest = id.slice(name.length + 3);
        to = [...nodes.keys()].find((end) => rest.startsWith(end + "_") && /^\d+$/.test(rest.slice(end.length + 1)));
        if (to) {
          from = name;
          break;
        }
      }
    }
    if (!from || !to || !nodes.has(from) || !nodes.has(to)) continue;
    const label = svg.querySelector('g.edgeLabels [data-id="' + CSS.escape(id) + '"]');
    links.push({ id, from, to, path, label: label && (label.closest("g.edgeLabel") || label) });
  }
  return links;
}

// js/diagram/hash.js
function diagramHash(stage) {
  const number = stage.dataset.diagram;
  if (!number) return "";
  const parts = ["diagram=" + number];
  const at = stage.diagramPlay?.where();
  if (at) {
    parts.push("story=" + at.story);
    if (at.step !== null) parts.push("step=" + at.step);
  }
  const lit = stage.diagramFocus?.get() || [];
  if (lit.length) parts.push("focus=" + lit.map(encodeURIComponent).join(","));
  return "#" + parts.join("&");
}
function diagramFromHash(stage) {
  if (!location.hash.startsWith("#diagram=")) return false;
  const wanted = new URLSearchParams(location.hash.slice(1));
  if (wanted.get("diagram") !== stage.dataset.diagram) return false;
  const number = (name) => /^\d+$/.test(wanted.get(name) || "") ? Number(wanted.get(name)) : null;
  if (stage.diagramPlay && (number("story") !== null || number("step") !== null)) stage.diagramPlay.restore(number("story") || 1, number("step"));
  if (stage.diagramFocus) stage.diagramFocus.set((wanted.get("focus") || "").split(",").filter(Boolean));
  stage.closest(".mermaid-diagram")?.scrollIntoView({ block: "center" });
  stage.diagramFull?.();
  return true;
}

// js/diagram/images.js
var DIAGRAM_IMAGE = /(\bimg\s*:\s*)(?:(["'])(.*?)\2|([^\s,}"']+))/g;
var DIAGRAM_IMAGE_SAFE = /^(?:https:\/\/|\/(?![\/\\])|data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,])/i;
var DIAGRAM_IMAGE_MISSING = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#888" stroke-width="2" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="4" stroke-dasharray="4 3"/><path d="M11 33l9-10 7 7 4-4 6 7"/><circle cx="31" cy="18" r="3"/></svg>');
function diagramImageUrl(value) {
  const url = host.resolveImage(value);
  if (url) return url;
  return DIAGRAM_IMAGE_SAFE.test(value) && !/["'{}\s]/.test(value) ? value : null;
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("timed out")), 8e3);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("did not load"));
    };
    image.src = url;
  });
}
async function diagramImages(source) {
  const shapes = /@\{[^}]*\}/g;
  if (!flowchartLines(source)) return { source, problems: [] };
  const wanted = /* @__PURE__ */ new Map();
  for (const shape of source.matchAll(shapes)) {
    for (const match of shape[0].matchAll(DIAGRAM_IMAGE)) {
      const value = match[3] ?? match[4];
      if (!wanted.has(value)) wanted.set(value, diagramImageUrl(value));
    }
  }
  if (!wanted.size) return { source, problems: [] };
  const problems = [];
  await Promise.all([...wanted].map(async ([value, url]) => {
    if (!url) {
      problems.push(value + " (not allowed)");
      wanted.set(value, DIAGRAM_IMAGE_MISSING);
      return;
    }
    try {
      await loadImage(url);
    } catch (error) {
      problems.push(value + " (" + error.message + ")");
      wanted.set(value, DIAGRAM_IMAGE_MISSING);
    }
  }));
  const rewritten = source.replace(shapes, (shape) => shape.replace(
    DIAGRAM_IMAGE,
    (match, key, quote, quoted, bare) => key + '"' + wanted.get(quoted ?? bare) + '"'
  ));
  return { source: rewritten, problems };
}

// js/diagram/icons.js
var DIAGRAM_ICONS = {
  out: '<path d="M3 8h10"/>',
  in: '<path d="M3 8h10M8 3v10"/>',
  fit: '<path d="M13 8a5 5 0 1 1-1.46-3.54M13.5 2v3h-3"/>',
  full: '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  play: '<path d="M5 3.2v9.6L12.6 8z"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.2"/>',
  share: '<path d="M8 2.5v7.5M5 5.2l3-2.7 3 2.7M4.5 8H3.5v5.5h9V8h-1"/>',
  back: '<path d="M10.5 3.5L6 8l4.5 4.5M4 3.5v9"/>',
  next: '<path d="M5.5 3.5L10 8l-4.5 4.5M12 3.5v9"/>',
  left: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  right: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  pen: '<path d="M10.5 2.8l2.7 2.7-7.4 7.4-3.3.6.6-3.3z"/><path d="M9 4.3l2.7 2.7"/>',
  follow: '<path d="M2.5 5.5h2.2l1.1-1.7h4.4l1.1 1.7h2.2v7h-11z"/><circle cx="8" cy="9" r="2.1"/>',
  warn: '<path d="M8 2.2l6 10.6H2z"/><path d="M8 6.6v2.8M8 11.1v.1"/>',
  theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/>',
  comment: '<path d="M2.5 3.5h11v7.2H8.2l-3.2 2.6v-2.6H2.5z"/><path d="M5 6.3h6M5 8.3h4"/>'
};
var diagramIcon = (name) => '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' + DIAGRAM_ICONS[name] + "</svg>";

// js/reader/code.js
var COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  }
}
function frameCode() {
  for (const pre of host.article.querySelectorAll("pre")) {
    if (pre.closest(".code-block, .mermaid-diagram")) continue;
    const box = pre.closest(".highlight, .snippet-clipboard-content") || pre;
    if (box.classList.contains("highlight-source-mermaid")) continue;
    const kind = [...box.classList].map((name) => /^highlight-(?:source|text)-(.+)$/.exec(name)).find(Boolean);
    const figure = document.createElement("figure");
    figure.className = "code-block";
    const head = document.createElement("div");
    head.className = "code-block-head";
    const label = document.createElement("span");
    label.textContent = kind ? kind[1] : "text";
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = COPY_ICON + "<span>Copy</span>";
    let reset = 0;
    button.addEventListener("click", async () => {
      const done = await copyText(pre.textContent);
      button.classList.toggle("copied", done);
      button.lastChild.textContent = done ? "Copied" : "Copy failed";
      clearTimeout(reset);
      reset = setTimeout(() => {
        button.classList.remove("copied");
        button.lastChild.textContent = "Copy";
      }, 1600);
    });
    head.append(label, button);
    const body = document.createElement("div");
    body.className = "code-body";
    box.replaceWith(figure);
    body.append(box);
    figure.append(head, body);
  }
}

// js/diagram/comments.js
var NOTE_KINDS = { node: "Box", edge: "Arrow", diagram: "Diagram" };
function diagramComments(stage, svg, after, about) {
  const url = host.commentsUrl;
  const base = Number(about.line) || 0;
  const last = Number(about.lineEnd) || 0;
  if (!url || !base || !last) return null;
  const max = host.commentMax;
  const nodes = diagramNodes(svg);
  const names = new Map([...nodes].map(([name, group]) => [group, name]));
  const links = diagramLinks(svg, nodes, about.edges);
  const source = about.source.split(/\r?\n/);
  const make = (tag, className, text) => {
    const element2 = document.createElement(tag);
    if (className) element2.className = className;
    if (text !== void 0) element2.textContent = text;
    if (tag === "button") element2.type = "button";
    return element2;
  };
  const clean = (text, fallback) => (text || "").replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
  const nodeName = (name) => clean(nodes.get(name)?.textContent, name);
  const escaped = (name) => name.replace(/\W/g, "\\$&");
  const word = (name) => new RegExp("(?:^|[^\\w-])" + escaped(name) + "(?![\\w-])");
  const code = (text) => text.trim() && !text.trim().startsWith("%%");
  const full = () => Boolean(stage.closest("dialog.diagram-dialog[open]"));
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
      const declared = new RegExp("(?:^|[^\\w-])" + escaped(link.id) + "@");
      const line = lineWhere((text) => declared.test(text));
      if (line !== base) return line;
    }
    const from = word(link.from), to = word(link.to);
    const nth = links.filter((other) => other.from === link.from && other.to === link.to).indexOf(link);
    let seen = 0;
    const at = source.findIndex((text) => code(text) && from.test(text) && to.test(text) && /--|==|-\.|~~/.test(text) && seen++ === nth);
    return at < 0 ? nodeLine(link.from) : base + 1 + at;
  }
  const nodeTarget = (name) => ({ kind: "node", id: name, label: nodeName(name), line: nodeLine(name), parts: [nodes.get(name)] });
  function edgeTarget(link) {
    const said = clean(link.label?.textContent, "");
    const label = clean(nodeName(link.from) + " \u2192 " + nodeName(link.to) + (said ? " (" + said + ")" : ""), link.id);
    return { kind: "edge", id: link.id, label, line: edgeLine(link), parts: [link.path, link.label].filter(Boolean) };
  }
  const whole = () => ({ kind: "diagram", id: "", label: "", line: base, parts: [] });
  const keyOf = (target) => target.kind + ":" + (target.id || "");
  const describe = (target) => target.kind === "diagram" ? "Whole diagram" : NOTE_KINDS[target.kind] + " \u201C" + target.label + "\u201D" + (target.lost ? ", no longer drawn" : "");
  const samples = /* @__PURE__ */ new Map();
  function along(link) {
    let points = samples.get(link);
    if (!points) {
      const total = link.path.getTotalLength();
      const count2 = Math.max(2, Math.ceil(total / 6));
      points = [];
      for (let at = 0; at <= count2; at++) points.push(link.path.getPointAtLength(total * at / count2));
      samples.set(link, points);
    }
    return points;
  }
  function pick(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under || !stage.contains(under) || under.closest(".diagram-tools, .diagram-caption")) return null;
    const pin = under.closest(".diagram-pin");
    if (pin) return { pin: pin.dataset.key };
    const inside = (element2) => {
      const rect = element2.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const group = under.closest(":is(g.node, g.image-shape)") || [...names.keys()].find(inside);
    if (group && names.has(group)) return nodeTarget(names.get(group));
    const label = under.closest("g.edgeLabel");
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
    if (target.kind === "node" && nodes.has(target.id)) return nodeTarget(target.id);
    const link = target.kind === "edge" && links.find((other) => other.id === target.id);
    if (link) return edgeTarget(link);
    if (target.kind === "diagram") return whole();
    return { kind: target.kind, id: target.id || "", label: target.label || target.id || "", line: comment.start, parts: [], lost: true };
  }
  const toggle = make("button", "note-toggle");
  toggle.innerHTML = diagramIcon("comment");
  const count = make("span", "count");
  count.hidden = true;
  toggle.append(count);
  toggle.setAttribute("aria-pressed", "false");
  after.after(toggle);
  const panel = make("aside", "diagram-notes");
  panel.setAttribute("aria-label", "Diagram comments");
  const head = make("header");
  const title = make("h2", "", "Comments");
  const closeButton = make("button", "diagram-notes-close");
  closeButton.innerHTML = diagramIcon("close");
  closeButton.title = "Close comments";
  closeButton.setAttribute("aria-label", "Close comments");
  head.append(title, closeButton);
  const hint = make("p", "diagram-notes-hint", nodes.size ? "Click a box or an arrow to comment on it, or the background for the whole diagram." : "Click the diagram to comment on it.");
  const list = make("div", "diagram-notes-list");
  const foot = make("footer");
  const status = make("span", "diagram-notes-status");
  status.setAttribute("role", "status");
  const copyAll = make("button", "", "Copy all");
  copyAll.title = "Copy every comment on the page as a prompt";
  const copyOne = make("button", "primary", "Copy for agent");
  copyOne.title = "Copy the comments on this diagram as a prompt";
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
    status.textContent = text.replace(/^!/, "");
    status.classList.toggle("error", text.startsWith("!"));
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = "";
    }, 3500);
  }
  function ago(date) {
    const seconds = (date.getTime() - Date.now()) / 1e3;
    const format = new Intl.RelativeTimeFormat(void 0, { numeric: "auto" });
    for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return "just now";
  }
  const mark = (parts, name, on) => {
    for (const part of parts) part.classList.toggle(name, on);
  };
  function hover(parts) {
    mark(hovered, "note-hover", false);
    hovered = parts;
    mark(hovered, "note-hover", true);
  }
  function choose(parts) {
    mark(picked, "note-picked", false);
    picked = parts;
    mark(picked, "note-picked", true);
  }
  async function call(address, options) {
    const response = await fetch(address, Object.assign({ cache: "no-store" }, options));
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
    const view = await call(url.replace("/comments/", "/comments/" + action + "/") + query, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === void 0 ? "" : JSON.stringify(body)
    });
    await load(view);
    dispatchEvent(new CustomEvent("aniflow-comments"));
  }
  function editor(text, label, action, save, cancel) {
    const form = make("form", "diagram-note-form");
    const area = make("textarea");
    area.value = text;
    area.rows = 3;
    area.maxLength = max;
    area.placeholder = "Leave a comment";
    area.setAttribute("aria-label", label);
    const row = make("div", "review-actions");
    const keys = make("span", "diagram-note-keys", /Mac|iP/.test(navigator.platform) ? "\u2318 Enter to save" : "Ctrl+Enter to save");
    const cancelButton = make("button", "", "Cancel");
    const submit = make("button", "primary", action);
    submit.type = "submit";
    row.append(keys, cancelButton, submit);
    form.append(area, row);
    form.addEventListener("submit", async (event) => {
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
        say("!Saving failed: " + (error.message || error));
      }
    });
    area.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    cancelButton.addEventListener("click", cancel);
    return { form, area };
  }
  function closeDraft() {
    draft = null;
    choose([]);
  }
  function compose(target) {
    closeDraft();
    const box = make("section", "diagram-note draft");
    const top = make("header");
    top.append(make("span", "diagram-note-new", "New"), make("span", "diagram-note-what", describe(target)));
    const { form, area } = editor("", "Comment on " + describe(target), "Comment", async (text) => {
      const named = { kind: target.kind, id: target.id, label: target.label, diagram: about.index };
      await send("add", "", { start: target.line, end: target.line, body: text, target: named });
      closeDraft();
      draw();
      say("Comment added");
    }, () => {
      closeDraft();
      draw();
    });
    box.append(top, form);
    draft = { target, element: box };
    choose(target.parts);
    draw();
    box.scrollIntoView({ block: "nearest" });
    area.focus({ preventScroll: true });
  }
  function entry(comment) {
    const item = make("article", "diagram-note-entry" + (comment.outdated ? " outdated" : ""));
    const meta = make("div", "diagram-note-meta");
    const stamp = new Date((comment.updated || comment.created) * 1e3);
    const when = make("time", "", ago(stamp) + (comment.updated > comment.created + 1 ? ", edited" : ""));
    when.dateTime = stamp.toISOString();
    when.title = stamp.toLocaleString();
    meta.append(when);
    if (comment.outdated) {
      const tag = make("span", "diagram-note-outdated", "Outdated");
      tag.title = "The diagram changed here after this comment. It was written on:\n" + comment.quote.join("\n");
      meta.append(tag);
    }
    const actions = make("span", "review-tools");
    const edit = make("button", "", "Edit");
    const remove = make("button", "", "Delete");
    actions.append(edit, remove);
    meta.append(actions);
    const body = make("p", "diagram-note-body", comment.body);
    item.append(meta, body);
    edit.addEventListener("click", () => {
      if (item.querySelector("form")) return;
      const done = () => {
        form.remove();
        body.hidden = false;
        edit.disabled = false;
      };
      const { form, area } = editor(comment.body, "Edit the comment", "Save", async (text) => {
        await send("edit", "?id=" + encodeURIComponent(comment.id), { body: text });
        say("Comment saved");
      }, done);
      body.hidden = true;
      edit.disabled = true;
      body.after(form);
      area.focus();
    });
    let armed = 0;
    remove.addEventListener("click", async () => {
      if (!armed) {
        remove.textContent = "Confirm";
        remove.classList.add("danger");
        armed = setTimeout(() => {
          armed = 0;
          remove.textContent = "Delete";
          remove.classList.remove("danger");
        }, 3e3);
        return;
      }
      clearTimeout(armed);
      remove.disabled = true;
      try {
        await send("delete", "?id=" + encodeURIComponent(comment.id));
        say("Comment deleted");
      } catch (error) {
        remove.disabled = false;
        say("!Deleting failed: " + (error.message || error));
      }
    });
    return item;
  }
  function thread(group, number) {
    const box = make("section", "diagram-note");
    box.dataset.key = group.key;
    const top = make("header");
    const what = make("button", "diagram-note-what", describe(group.target));
    what.title = "Show it on the diagram";
    what.addEventListener("click", () => light(group.key));
    const reply = make("button", "diagram-note-reply", "Reply");
    reply.addEventListener("click", () => compose(group.target));
    top.append(make("span", "diagram-note-pin", String(number)), what, reply);
    box.append(top);
    for (const comment of group.comments) box.append(entry(comment));
    box.addEventListener("pointerenter", () => hover(group.target.parts));
    box.addEventListener("pointerleave", () => hover([]));
    return box;
  }
  function threads() {
    const found = /* @__PURE__ */ new Map();
    for (const comment of [...comments].sort((a, b) => a.start - b.start || a.created - b.created)) {
      const target = targetOf(comment);
      const key = keyOf(target);
      if (!found.has(key)) found.set(key, { key, target, comments: [] });
      found.get(key).comments.push(comment);
    }
    return [...found.values()];
  }
  function pinSpot(target) {
    const inverse = svg.getScreenCTM()?.inverse();
    if (!inverse || !target.parts.length) return { x: about.home.x + 12, y: about.home.y + 12 };
    let x, y;
    if (target.kind === "edge" && !target.parts[1]) {
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
    for (const pin of pins.children) pin.firstChild.setAttribute("transform", "scale(" + scale + ")");
  }
  function drawPins() {
    pins?.remove();
    pins = null;
    if (!full() || !groups.length) return;
    pins = document.createElementNS(SVG_NS, "g");
    pins.setAttribute("class", "diagram-pins");
    groups.forEach((group, at) => {
      const spot = pinSpot(group.target);
      const pin = document.createElementNS(SVG_NS, "g");
      pin.setAttribute("class", "diagram-pin");
      pin.setAttribute("transform", "translate(" + spot.x + " " + spot.y + ")");
      pin.dataset.key = group.key;
      const inner = document.createElementNS(SVG_NS, "g");
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("r", "11");
      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = String(at + 1);
      const tip = document.createElementNS(SVG_NS, "title");
      tip.textContent = describe(group.target) + ": " + group.comments.length + (group.comments.length === 1 ? " comment" : " comments");
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
    const label = active ? "Stop commenting" : "Comment on the diagram" + (comments.length ? ", " + comments.length + " so far" : "");
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    drawPins();
    if (!active) return;
    title.textContent = comments.length ? "Comments (" + comments.length + ")" : "Comments";
    copyOne.disabled = !comments.length;
    list.replaceChildren();
    if (draft) list.append(draft.element);
    groups.forEach((group, at) => list.append(thread(group, at + 1)));
    if (!groups.length && !draft) list.append(make("p", "diagram-notes-empty", "No comments on this diagram yet."));
  }
  function light(key) {
    const group = groups.find((other) => other.key === key);
    if (!group) return;
    for (const element2 of panel.querySelectorAll(".diagram-note.lit")) element2.classList.remove("lit");
    for (const element2 of svg.querySelectorAll(".note-lit")) element2.classList.remove("note-lit");
    const card = [...list.children].find((element2) => element2.dataset.key === key);
    card?.classList.add("lit");
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    mark(group.target.parts, "note-lit", true);
    pins?.querySelector('[data-key="' + CSS.escape(key) + '"]')?.classList.add("lit");
    setTimeout(() => {
      card?.classList.remove("lit");
      mark(group.target.parts, "note-lit", false);
      pins?.querySelector(".lit")?.classList.remove("lit");
    }, 1600);
  }
  function open() {
    if (active || !full()) return Promise.resolve();
    active = true;
    stage.diagramDraw?.(false);
    stage.diagramFocus?.set([]);
    const dialog = stage.closest("dialog");
    stage.classList.add("commenting");
    dialog.classList.add("commenting");
    dialog.append(panel);
    toggle.setAttribute("aria-pressed", "true");
    draw();
    return load().catch((error) => say("!Loading failed: " + (error.message || error)));
  }
  function close() {
    if (!active) return;
    active = false;
    closeDraft();
    hover([]);
    stage.classList.remove("commenting", "note-aim");
    panel.closest("dialog")?.classList.remove("commenting");
    panel.remove();
    toggle.setAttribute("aria-pressed", "false");
    draw();
  }
  async function copyPrompt(address) {
    try {
      const response = await fetch(address, { cache: "no-store" });
      if (!response.ok) throw new Error(response.statusText);
      say(await copyText(await response.text()) ? "Copied, paste it to your agent" : "!Copy failed");
    } catch (error) {
      say("!Copy failed: " + (error.message || error));
    }
  }
  toggle.addEventListener("click", () => active ? close() : open());
  closeButton.addEventListener("click", close);
  copyOne.addEventListener("click", () => copyPrompt(url + "?format=prompt&lines=" + base + "-" + last));
  copyAll.addEventListener("click", () => copyPrompt(url + "?format=prompt"));
  let start = null;
  stage.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
  }, true);
  stage.addEventListener("pointermove", (event) => {
    if (!active || event.buttons || event.pointerType !== "mouse") return;
    const target = pick(event.clientX, event.clientY);
    hover(target && target.parts ? target.parts : []);
    stage.classList.toggle("note-aim", Boolean(target && (target.pin || target.parts.length)));
  });
  stage.addEventListener("pointerleave", () => hover([]));
  stage.addEventListener("click", (event) => {
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
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !active || event.defaultPrevented || !stage.isConnected) return;
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
    shown: () => load().catch(() => {
    }),
    hidden() {
      close();
      pins?.remove();
      pins = null;
    },
    off: close,
    zoom
  };
}

// js/diagram/focus.js
function focusDiagram(stage, svg, edges) {
  const nodes = diagramNodes(svg);
  if (!nodes.size) return;
  const names = new Map([...nodes].map(([name, group]) => [group, name]));
  const links = diagramLinks(svg, nodes, edges).map((link) => ({ from: link.from, to: link.to, parts: [link.path, link.label].filter(Boolean) }));
  stage.classList.add("focusable");
  const selected = /* @__PURE__ */ new Set();
  let held = false;
  function paint() {
    for (const element2 of svg.querySelectorAll(".focus-on, .focus-near")) element2.classList.remove("focus-on", "focus-near");
    for (const name of selected) nodes.get(name).classList.add("focus-on");
    for (const link of links) {
      if (!selected.has(link.from) && !selected.has(link.to)) continue;
      for (const part of link.parts) part.classList.add("focus-near");
      for (const end of [link.from, link.to]) if (!selected.has(end)) nodes.get(end).classList.add("focus-near");
    }
    stage.classList.toggle("focusing", selected.size > 0);
    if (held !== selected.size > 0) diagramBusy(held = !held);
  }
  let start = null;
  stage.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
  }, true);
  stage.addEventListener("click", (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!under || !stage.contains(under) || under.closest(".diagram-tools, .diagram-pins") || stage.classList.contains("commenting")) return;
    const inside = (element2) => {
      const rect = element2.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const group = under.closest(":is(g.node, g.image-shape)") || [...names.keys()].find(inside);
    const name = group && names.get(group);
    if (!name) selected.clear();
    else if (event.shiftKey || event.ctrlKey || event.metaKey) selected.has(name) ? selected.delete(name) : selected.add(name);
    else if (selected.has(name) && selected.size === 1) selected.clear();
    else {
      selected.clear();
      selected.add(name);
    }
    paint();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !selected.size || !stage.isConnected) return;
    const dialog = stage.closest("dialog");
    if (!dialog && document.querySelector("dialog[open]")) return;
    event.preventDefault();
    selected.clear();
    paint();
  }, { signal: host.render?.signal });
  return {
    get: () => [...selected],
    set(wanted) {
      selected.clear();
      for (const name of wanted) if (nodes.has(name)) selected.add(name);
      paint();
    }
  };
}

// js/diagram/gif.js
function gifWriter(width, height) {
  const parts = [];
  const bytes = (...values) => parts.push(Uint8Array.from(values));
  const word = (value) => [value & 255, value >> 8 & 255];
  const ascii = (text) => [...text].map((letter) => letter.charCodeAt(0));
  bytes(...ascii("GIF89a"), ...word(width), ...word(height), 0, 0, 0);
  bytes(33, 255, 11, ...ascii("NETSCAPE2.0"), 3, 1, 0, 0, 0);
  let previous = null;
  let pending = null;
  function changed(after) {
    if (!previous) return { x: 0, y: 0, w: width, h: height };
    const before32 = new Uint32Array(previous.buffer, previous.byteOffset, width * height);
    const after32 = new Uint32Array(after.buffer, after.byteOffset, width * height);
    let top = -1;
    let bottom = -1;
    let left = width;
    let right = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (before32[row + x] === after32[row + x]) continue;
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    return top < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }
  function quantize(pixels, rect) {
    const count = rect.w * rect.h;
    const keys = new Uint16Array(count);
    const counts = new Uint32Array(32768);
    const sums = new Uint32Array(32768 * 3);
    let at = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const key = red >> 3 << 10 | green >> 3 << 5 | blue >> 3;
        keys[at++] = key;
        counts[key]++;
        sums[key * 3] += red;
        sums[key * 3 + 1] += green;
        sums[key * 3 + 2] += blue;
      }
    }
    const used = [];
    for (let key = 0; key < 32768; key++) if (counts[key]) used.push(key);
    used.sort((first, second) => counts[second] - counts[first]);
    const kept = used.slice(0, 256);
    const bits = Math.max(1, Math.ceil(Math.log2(kept.length)));
    const palette = new Uint8Array(3 << bits);
    const lookup = new Int16Array(32768);
    kept.forEach((key, slot) => {
      for (let channel = 0; channel < 3; channel++) palette[slot * 3 + channel] = Math.round(sums[key * 3 + channel] / counts[key]);
      lookup[key] = slot;
    });
    for (const key of used.slice(256)) {
      const red = sums[key * 3] / counts[key];
      const green = sums[key * 3 + 1] / counts[key];
      const blue = sums[key * 3 + 2] / counts[key];
      let best = 0;
      let distance = Infinity;
      for (let slot = 0; slot < kept.length; slot++) {
        const dr = palette[slot * 3] - red;
        const dg = palette[slot * 3 + 1] - green;
        const db = palette[slot * 3 + 2] - blue;
        const here = dr * dr + dg * dg + db * db;
        if (here < distance) {
          distance = here;
          best = slot;
        }
      }
      lookup[key] = best;
    }
    const indices = new Uint8Array(count);
    for (let index = 0; index < count; index++) indices[index] = lookup[keys[index]];
    return { palette, indices, bits };
  }
  function lzw(indices, minimum) {
    const out = [];
    const clear = 1 << minimum;
    const stop = clear + 1;
    let size = minimum + 1;
    let next = stop + 1;
    let dictionary = /* @__PURE__ */ new Map();
    let buffer = 0;
    let filled = 0;
    const emit = (code) => {
      buffer |= code << filled;
      filled += size;
      while (filled >= 8) {
        out.push(buffer & 255);
        buffer >>>= 8;
        filled -= 8;
      }
    };
    emit(clear);
    let prefix = indices[0];
    for (let at = 1; at < indices.length; at++) {
      const symbol = indices[at];
      const key = prefix << 8 | symbol;
      const known = dictionary.get(key);
      if (known !== void 0) {
        prefix = known;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        dictionary.set(key, next++);
        if (next > 1 << size && size < 12) size++;
      } else {
        emit(clear);
        dictionary = /* @__PURE__ */ new Map();
        size = minimum + 1;
        next = stop + 1;
      }
      prefix = symbol;
    }
    emit(prefix);
    emit(stop);
    if (filled > 0) out.push(buffer & 255);
    return Uint8Array.from(out);
  }
  function write(frame) {
    const { palette, indices, bits } = quantize(frame.pixels, frame.rect);
    const delay = Math.max(2, Math.round(frame.delay / 10));
    bytes(33, 249, 4, 4, ...word(delay), 0, 0);
    bytes(44, ...word(frame.rect.x), ...word(frame.rect.y), ...word(frame.rect.w), ...word(frame.rect.h), 128 | bits - 1);
    parts.push(palette);
    const minimum = Math.max(2, bits);
    const data = lzw(indices, minimum);
    bytes(minimum);
    for (let at = 0; at < data.length; at += 255) {
      const chunk = data.subarray(at, at + 255);
      bytes(chunk.length);
      parts.push(chunk);
    }
    bytes(0);
  }
  return {
    add(pixels, delay) {
      const rect = changed(pixels);
      if (!rect) {
        pending.delay += delay;
        return;
      }
      if (pending) write(pending);
      pending = { pixels, rect, delay };
      previous = pixels;
    },
    finish() {
      if (pending) write(pending);
      pending = null;
      bytes(59);
      return new Blob(parts, { type: "image/gif" });
    }
  };
}

// js/diagram/picture.js
var XLINK_NS = "http://www.w3.org/1999/xlink";
var PICTURE_SHAPE = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "opacity", "filter", "visibility"];
var PICTURE_TEXT = ["font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "color", "margin-top", "margin-bottom"];
async function diagramImageData(svg) {
  const found = /* @__PURE__ */ new Map();
  for (const image of svg.querySelectorAll("image")) {
    const href = image.getAttribute("href") || image.getAttributeNS(XLINK_NS, "href");
    if (!href || found.has(href)) continue;
    if (href.startsWith("data:")) {
      found.set(href, href);
      continue;
    }
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) throw new Error("other site");
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status);
      const blob = await response.blob();
      found.set(href, await new Promise((resolve, reject) => {
        const reader2 = new FileReader();
        reader2.onload = () => resolve(reader2.result);
        reader2.onerror = reject;
        reader2.readAsDataURL(blob);
      }));
    } catch (error) {
      found.set(href, DIAGRAM_IMAGE_MISSING);
    }
  }
  return found;
}
function diagramPicture(svg, home, size, images, still) {
  const copy = svg.cloneNode(true);
  const from = svg.querySelectorAll("*");
  const to = copy.querySelectorAll("*");
  for (let at = 0; at < from.length; at++) {
    const element2 = from[at];
    let names = null;
    if (element2 instanceof SVGTextContentElement) names = PICTURE_SHAPE.concat(PICTURE_TEXT);
    else if (element2 instanceof SVGGraphicsElement) names = PICTURE_SHAPE;
    else if (element2 instanceof HTMLElement) names = PICTURE_TEXT;
    if (!names) continue;
    const computed = getComputedStyle(element2);
    for (const name of names) to[at].style.setProperty(name, computed.getPropertyValue(name), "important");
  }
  copy.setAttribute("viewBox", [home.x, home.y, home.w, home.h].join(" "));
  copy.setAttribute("width", String(size.w));
  copy.setAttribute("height", String(size.h));
  copy.removeAttribute("style");
  for (const ink of copy.querySelectorAll(still ? ".diagram-ink :is(.ink-laser, circle)" : ".diagram-ink")) ink.remove();
  copy.querySelector(".diagram-pins")?.remove();
  for (const image of copy.querySelectorAll("image")) {
    const href = image.getAttribute("href") || image.getAttributeNS(XLINK_NS, "href");
    image.removeAttributeNS(XLINK_NS, "href");
    image.setAttribute("href", images.get(href) || DIAGRAM_IMAGE_MISSING);
  }
  const picture = new Image();
  picture.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  return picture.decode().then(() => picture);
}
async function diagramCanvas(svg, home, limit, captioned, still) {
  const PAD = 24;
  const scale = Math.min(still ? Infinity : 2, (limit - 2 * PAD) / Math.max(home.w, home.h), Math.sqrt((still ? 8e6 : 19e5) / (home.w * home.h)));
  const size = { w: home.w * scale, h: home.h * scale };
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const element2 = document.createElement("canvas");
  element2.width = even(size.w + 2 * PAD);
  const fontSize = Math.round(Math.max(15, Math.min(30, element2.width / 40)));
  const band = captioned ? Math.round(fontSize * 2 * 1.35 + PAD) : 0;
  element2.height = even(size.h + 2 * PAD + band);
  const context = element2.getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(host.article);
  const colour = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const background = colour("--bgColor-default", getComputedStyle(document.body).backgroundColor);
  const ink = colour("--fgColor-default", getComputedStyle(document.body).color);
  const rule = colour("--borderColor-muted", ink);
  const font = "500 " + fontSize + "px system-ui, -apple-system, sans-serif";
  const images = await diagramImageData(svg);
  function lines(text) {
    const room = element2.width - 2 * PAD;
    const result = [""];
    for (const word of text.split(/\s+/)) {
      const last = result.length - 1;
      const joined = result[last] ? result[last] + " " + word : word;
      if (!result[last] || context.measureText(joined).width <= room) result[last] = joined;
      else result.push(word);
    }
    if (result.length > 2) {
      let second = result[1];
      while (second && context.measureText(second + "\u2026").width > room) second = second.slice(0, -1);
      result.splice(1, result.length, second.trimEnd() + "\u2026");
    }
    return result;
  }
  return {
    element: element2,
    width: element2.width,
    height: element2.height,
    async draw(text) {
      const picture = await diagramPicture(svg, home, size, images, still);
      context.fillStyle = background;
      context.fillRect(0, 0, element2.width, element2.height);
      context.drawImage(picture, (element2.width - size.w) / 2, (element2.height - band - size.h) / 2, size.w, size.h);
      if (!band || !text) return;
      const top = element2.height - band;
      context.fillStyle = rule;
      context.fillRect(PAD, top, element2.width - 2 * PAD, 1);
      context.font = font;
      context.fillStyle = ink;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const rows = lines(text);
      const height = fontSize * 1.35;
      const first = top + band / 2 - (rows.length - 1) * height / 2;
      rows.forEach((row, at) => context.fillText(row, element2.width / 2, first + at * height));
    },
    pixels: () => context.getImageData(0, 0, element2.width, element2.height).data
  };
}

// js/diagram/share.js
var VIDEO_TYPES = {
  mp4: ["video/mp4;codecs=avc1.640028", "video/mp4"],
  webm: ["video/webm;codecs=vp9", "video/webm"]
};
function diagramVideoType(kind) {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) return "";
  const types = kind === "mp4" ? VIDEO_TYPES.mp4 : kind === "webm" ? VIDEO_TYPES.webm : [...VIDEO_TYPES.mp4, ...VIDEO_TYPES.webm];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}
function diagramExportName(title, extension) {
  const slug = (text) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let page = location.pathname.split("/").pop() || "";
  try {
    page = decodeURIComponent(page);
  } catch (error) {
  }
  page = page.replace(/\.(md|markdown)$/i, "");
  return ([slug(page), slug(title || "")].filter(Boolean).join("-").slice(0, 120) || "diagram") + "." + extension;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6e4);
}
function diagramShare(stage, svg, tools) {
  const group = document.createElement("div");
  group.className = "diagram-share";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "play-record";
  button.innerHTML = diagramIcon("share");
  const menu = document.createElement("div");
  menu.className = "diagram-export";
  menu.hidden = true;
  group.append(button, menu);
  tools.prepend(group);
  const share = {
    button,
    title: "Share or save this diagram",
    name: () => "",
    choose: null,
    cancel: () => false,
    label(text) {
      button.title = text || share.title;
      button.setAttribute("aria-label", button.title);
    },
    choice(kind, text, note) {
      const element2 = document.createElement("button");
      element2.type = "button";
      element2.dataset.kind = kind;
      element2.dataset.note = note;
      element2.textContent = text;
      const small = document.createElement("small");
      small.textContent = note;
      element2.append(small);
      menu.append(element2);
      return element2;
    }
  };
  share.link = share.choice("link", "Copy link", "To this diagram and spotlight");
  share.choice("png", "PNG", "What you see right now");
  share.label();
  async function savePicture() {
    const box = svg.viewBox.baseVal;
    const caption = stage.querySelector(":scope > .diagram-caption");
    const text = caption && !caption.hidden ? caption.textContent : "";
    const name = diagramExportName(share.name(), "png");
    try {
      const canvas = await diagramCanvas(svg, { x: box.x, y: box.y, w: box.width, h: box.height }, 2400, Boolean(text), true);
      await canvas.draw(text);
      const blob = await new Promise((resolve) => canvas.element.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("the browser made no picture");
      await host.save(name, blob);
      share.label();
      return { name, blob };
    } catch (error) {
      share.label("Could not save the PNG: " + (error.message || error));
      throw error;
    }
  }
  stage.diagramPicture = savePicture;
  button.addEventListener("click", () => {
    if (share.cancel()) return;
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener("click", async (event) => {
    const choice = event.target.closest("button[data-kind]");
    if (!choice) return;
    if (choice.dataset.kind === "link") {
      const note = choice.querySelector("small");
      const hash = diagramHash(stage);
      if (!hash) return;
      history.replaceState(history.state, "", location.pathname + location.search + hash);
      note.textContent = await copyText(location.href) ? "Copied" : "Could not copy, the address bar has it";
      setTimeout(() => {
        menu.hidden = true;
        note.textContent = choice.dataset.note;
      }, 900);
      return;
    }
    menu.hidden = true;
    if (choice.dataset.kind === "png") savePicture().catch(() => {
    });
    else if (share.choose) share.choose(choice.dataset.kind);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !group.contains(event.target)) menu.hidden = true;
  }, { signal: host.render?.signal });
  group.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.hidden) return;
    event.stopPropagation();
    event.preventDefault();
    menu.hidden = true;
    button.focus();
  });
  return share;
}

// js/diagram/speed.js
var DIAGRAM_SPEEDS = [0.5, 0.75, 1, 1.5, 2];
var DIAGRAM_PACE = 0.6;
var diagramSpeed = DIAGRAM_SPEEDS.includes(Number(localStorage.getItem("aniflow-diagram-speed"))) ? Number(localStorage.getItem("aniflow-diagram-speed")) : 1;
var diagramRate = () => diagramSpeed * DIAGRAM_PACE;
function setDiagramSpeed(by) {
  const at = DIAGRAM_SPEEDS.indexOf(diagramSpeed);
  diagramSpeed = by ? DIAGRAM_SPEEDS[Math.max(0, Math.min(DIAGRAM_SPEEDS.length - 1, at + by))] : DIAGRAM_SPEEDS[(at + 1) % DIAGRAM_SPEEDS.length];
  localStorage.setItem("aniflow-diagram-speed", String(diagramSpeed));
  dispatchEvent(new Event("aniflow-diagram-speed"));
}

// js/diagram/warnings.js
function diagramWarnings(stage, tools, scenarios) {
  const rows = scenarios.flatMap((scenario) => scenario.problems.map((problem) => Object.assign({ story: scenario.title }, problem)));
  if (!rows.length) return;
  const group = document.createElement("div");
  group.className = "diagram-warnings";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "play-warn";
  button.innerHTML = diagramIcon("warn");
  const count = document.createElement("span");
  count.textContent = String(rows.length);
  button.append(count);
  const text = rows.length === 1 ? "1 walkthrough step cannot play" : rows.length + " walkthrough steps cannot play";
  button.title = text;
  button.setAttribute("aria-label", text);
  button.setAttribute("aria-expanded", "false");
  const list = document.createElement("ul");
  list.className = "diagram-problems";
  list.hidden = true;
  for (const row of rows) {
    const item = document.createElement("li");
    item.dataset.line = String(row.line);
    const where = document.createElement("small");
    where.textContent = row.story + " \xB7 line " + row.line;
    const reason = document.createElement("span");
    reason.textContent = row.reason;
    const source = document.createElement("code");
    source.textContent = "%% " + row.text;
    item.append(where, reason, source);
    list.append(item);
  }
  group.append(button, list);
  tools.prepend(group);
  const show2 = (open) => {
    list.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => show2(list.hidden));
  document.addEventListener("pointerdown", (event) => {
    if (!list.hidden && !group.contains(event.target)) show2(false);
  }, { signal: host.render?.signal });
  group.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || list.hidden) return;
    event.stopPropagation();
    event.preventDefault();
    show2(false);
    button.focus();
  });
  console.warn("Diagram walkthrough: " + text + "\n" + rows.map((row) => row.story + ", line " + row.line + ": " + row.reason + " (%% " + row.text + ")").join("\n"));
}

// js/diagram/player.js
function playDiagram(stage, svg, tools, scripts, home, share, edges) {
  const sequence = svg.getAttribute("aria-roledescription") === "sequence";
  const parts = /* @__PURE__ */ new Map();
  const messages = [];
  let nodes = null;
  if (sequence) {
    nodes = /* @__PURE__ */ new Map();
    const lifelines = [];
    for (const element2 of svg.querySelectorAll("rect.actor[name], g.actor-man[name], line.actor-line[name]")) {
      const name = element2.getAttribute("name");
      const part = element2.tagName === "rect" ? element2.parentNode : element2;
      if (element2.tagName === "line") lifelines.push({ name, x: Number(element2.getAttribute("x1")) });
      if (!nodes.has(name)) {
        nodes.set(name, part);
        parts.set(part, []);
      }
      part.classList.add("play-actor");
      parts.get(nodes.get(name)).push(part);
    }
    const nearest = (x) => lifelines.reduce((best, line) => Math.abs(line.x - x) < Math.abs(best.x - x) ? line : best).name;
    if (lifelines.length) {
      for (const path of svg.querySelectorAll(":is(line, path):is(.messageLine0, .messageLine1)")) {
        const texts = [];
        for (let before = path.previousElementSibling; before && before.matches("text.messageText"); before = before.previousElementSibling) texts.unshift(before);
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(path.getTotalLength());
        messages.push({ from: nearest(start.x), to: nearest(end.x), path, texts });
      }
    }
  } else nodes = diagramNodes(svg);
  const each = (node, change) => {
    for (const part of parts.get(node) || [node]) change(part);
  };
  const links = sequence ? [] : diagramLinks(svg, nodes, edges);
  const named = new Map(links.map((link) => [link.id, link]));
  const edgeFor = (from, to, id) => {
    if (id) {
      const link = named.get(id);
      if (!link) return { problem: "no edge with the id " + id };
      if (link.from === from && link.to === to) return { path: link.path, reverse: false };
      if (link.from === to && link.to === from) return { path: link.path, reverse: true };
      return { problem: "edge " + id + " does not join " + from + " and " + to };
    }
    const forward = links.find((link) => link.from === from && link.to === to);
    const back = forward || links.find((link) => link.from === to && link.to === from);
    return back ? { path: back.path, reverse: !forward } : { problem: "no edge between " + from + " and " + to };
  };
  const box = sequence ? "participant" : "box";
  const resolved = scripts.map((script) => {
    const steps = [];
    const problems = [];
    let cursor = 0;
    let hold = null;
    const drop = (step, reason) => {
      problems.push({ line: step.line, text: step.text, reason });
      hold = step.hold || hold;
    };
    for (const step of script.steps) {
      if (step.bad) {
        drop(step, step.bad);
        continue;
      }
      if (step.skip) {
        const found = step.skip.map((name) => nodes.get(name)).filter(Boolean);
        const missing2 = step.skip.filter((name) => !nodes.has(name));
        if (missing2.length) problems.push({ line: step.line, text: step.text, reason: "no " + box + " named " + missing2.join(", ") });
        if (found.length) {
          steps.push({ skip: found, caption: step.caption, hold: step.hold || hold });
          hold = null;
        } else hold = step.hold || hold;
        continue;
      }
      const missing = [...step.from, ...step.to].map((end) => end.name).filter((name) => !nodes.has(name));
      if (missing.length) {
        drop(step, "no " + box + " named " + [...new Set(missing)].join(", "));
        continue;
      }
      if (step.from.length > 1 && step.to.length > 1) {
        drop(step, "several boxes on both sides; write one step per edge");
        continue;
      }
      if (sequence && [...step.from, ...step.to].some((end) => end.edge)) {
        drop(step, "edge ids only work in flowcharts");
        continue;
      }
      const taken = /* @__PURE__ */ new Set();
      let problem = "";
      const moves = step.from.flatMap((from) => step.to.map((to) => {
        if (problem) return null;
        if (from.edge && to.edge && from.edge !== to.edge) {
          problem = "two edge ids for " + from.name + " and " + to.name;
          return null;
        }
        if (sequence) {
          const order = messages.map((message, at2) => (at2 + cursor) % messages.length);
          const at = order.find((at2) => !taken.has(at2) && messages[at2].from === from.name && messages[at2].to === to.name);
          if (at === void 0) {
            problem = "no message from " + from.name + " to " + to.name;
            return null;
          }
          taken.add(at);
          return { from: nodes.get(from.name), to: nodes.get(to.name), path: messages[at].path, texts: messages[at].texts, reverse: false, at };
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
      steps.push({ moves, label: step.label, caption: step.caption, hold: step.hold || hold });
      hold = null;
    }
    return { title: script.title, steps, problems, tail: hold || script.tail };
  });
  diagramWarnings(stage, tools, resolved);
  const scenarios = resolved.filter((scenario2) => scenario2.steps.length);
  if (!scenarios.length) return;
  const controls = document.createElement("div");
  controls.className = "diagram-play";
  let picker = null;
  if (scenarios.length > 1) {
    picker = document.createElement("select");
    picker.name = "scenario";
    picker.setAttribute("aria-label", "Scenario");
    scenarios.forEach((scenario2, index2) => picker.add(new Option(scenario2.title, String(index2))));
    controls.append(picker);
  }
  const make = (icon, label2, name) => {
    const element2 = document.createElement("button");
    element2.type = "button";
    element2.className = name;
    element2.innerHTML = diagramIcon(icon);
    element2.title = label2;
    element2.setAttribute("aria-label", label2);
    controls.append(element2);
    return element2;
  };
  const backButton = make("back", "Previous step", "play-back");
  const playButton = make("play", "Play", "play-toggle");
  const nextButton = make("next", "Next step", "play-next");
  const stopButton = make("stop", "Stop", "play-stop");
  const speedButton = document.createElement("button");
  speedButton.type = "button";
  speedButton.className = "play-speed";
  controls.append(speedButton);
  const showSpeed = () => {
    speedButton.textContent = diagramSpeed + "\xD7";
    const text = "Speed " + diagramSpeed + "\xD7 (< and > change it)";
    speedButton.title = text;
    speedButton.setAttribute("aria-label", text);
  };
  showSpeed();
  speedButton.addEventListener("click", () => setDiagramSpeed(0));
  addEventListener("aniflow-diagram-speed", showSpeed, { signal: host.render?.signal });
  const rail = document.createElement("div");
  rail.className = "play-rail";
  rail.setAttribute("aria-hidden", "true");
  controls.append(rail);
  const recordButton = share.button;
  share.title = "Share or save this story";
  share.label();
  share.link.dataset.note = share.link.querySelector("small").textContent = "To this story, step and spotlight";
  share.choice("gif", "GIF", "Loops, plays anywhere");
  const videoType = diagramVideoType("video");
  if (videoType) share.choice("video", "Video", videoType.startsWith("video/mp4") ? "MP4, smaller and smoother" : "WebM, smaller and smoother");
  const mimeFor = (kind) => kind === "gif" ? "" : kind === "video" ? videoType : diagramVideoType(kind);
  const exportLabel = (kind) => kind === "gif" ? "GIF" : kind === "mp4" ? "MP4" : kind === "webm" ? "WebM" : "video";
  tools.prepend(controls);
  const caption = document.createElement("div");
  caption.className = "diagram-caption";
  caption.setAttribute("aria-live", "polite");
  caption.hidden = true;
  stage.append(caption);
  const say = (text) => {
    caption.textContent = text || "";
    caption.hidden = !text;
  };
  let timeline = [];
  let index = 0;
  let elapsed = 0;
  let playing = false;
  let finished = false;
  let frame = 0;
  let last = 0;
  const active = /* @__PURE__ */ new Set();
  let tokens = [];
  let reached = 0;
  let waiting = false;
  let stepping = false;
  const scenario = () => scenarios[picker ? Number(picker.value) : 0];
  function label(icon, text) {
    playButton.innerHTML = diagramIcon(icon);
    playButton.title = text;
    playButton.setAttribute("aria-label", text);
  }
  function sync() {
    label(playing ? "pause" : "play", playing ? "Pause" : finished ? "Replay" : timeline.length ? "Resume" : "Play");
    stopButton.hidden = !timeline.length;
    backButton.hidden = !timeline.length || !reached && !index && !elapsed;
    const total = scenario().steps.length;
    const shown = Math.min(total, reached + 1);
    const next = finished ? "Next step (from the start)" : "Next step (" + shown + " of " + total + ")";
    nextButton.title = next;
    nextButton.setAttribute("aria-label", next);
    controls.classList.toggle("playing", playing);
    drawRail();
  }
  function drawRail() {
    const steps = scenario().steps;
    if (rail.children.length !== steps.length || rail.dataset.story !== String(scenario().title)) {
      rail.dataset.story = String(scenario().title);
      rail.replaceChildren(...steps.map((step, at) => {
        const tick2 = document.createElement("span");
        tick2.title = "Step " + (at + 1) + (step.caption ? ": " + step.caption : step.label ? ": " + step.label : "");
        tick2.addEventListener("click", () => jump(at));
        return tick2;
      }));
    }
    rail.hidden = steps.length < 2;
    controls.classList.toggle("stepped", !rail.hidden);
    const played = !timeline.length ? 0 : finished ? steps.length : reached;
    [...rail.children].forEach((tick2, at) => {
      tick2.classList.toggle("done", at < played);
      tick2.classList.toggle("now", playing && !waiting && at === reached && !finished);
    });
  }
  function badge(node) {
    if (sequence || node.querySelector(":scope > .play-check")) return;
    const frame2 = node.classList.contains("image-shape") ? node.querySelector(":scope > g") : null;
    let box2 = node.getBBox();
    if (frame2) {
      const corner = svg.createSVGPoint();
      const inner = frame2.getBBox();
      corner.x = inner.x + inner.width;
      corner.y = inner.y;
      const at = corner.matrixTransform(node.getCTM().inverse().multiply(frame2.getCTM()));
      box2 = { x: at.x - inner.width, y: at.y, width: inner.width };
    }
    const mark = document.createElementNS(SVG_NS, "g");
    mark.setAttribute("class", "play-check");
    mark.setAttribute("transform", "translate(" + (box2.x + box2.width - 2) + " " + (box2.y + 2) + ")");
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "8");
    const tick2 = document.createElementNS(SVG_NS, "path");
    tick2.setAttribute("d", "M-3.6 0.2l2.4 2.4 4.8-5");
    mark.append(circle, tick2);
    node.append(mark);
  }
  function setActive(node) {
    each(node, (part) => {
      part.classList.remove("play-done", "play-skipped");
      part.classList.add("play-active");
    });
    node.querySelector(":scope > .play-check")?.remove();
    active.add(node);
  }
  function setDone(node) {
    each(node, (part) => {
      part.classList.remove("play-active");
      part.classList.add("play-done");
    });
    badge(node);
    active.delete(node);
  }
  function clearMarks() {
    for (const element2 of svg.querySelectorAll(".play-active, .play-done, .play-skipped, .play-edge, .play-edge-done")) {
      element2.classList.remove("play-active", "play-done", "play-skipped", "play-edge", "play-edge-done");
    }
    for (const element2 of svg.querySelectorAll(".play-check")) element2.remove();
    for (const dot of tokens) dot.remove();
    tokens = [];
    active.clear();
    say("");
  }
  function makeToken(text) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "play-token");
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "6");
    group.append(dot);
    svg.append(group);
    if (text) {
      const tag = document.createElementNS(SVG_NS, "g");
      tag.setAttribute("class", "play-tag");
      const back = document.createElementNS(SVG_NS, "rect");
      const words = document.createElementNS(SVG_NS, "text");
      words.textContent = text;
      words.setAttribute("text-anchor", "middle");
      words.setAttribute("y", "-14");
      tag.append(back, words);
      group.append(tag);
      const box2 = words.getBBox();
      back.setAttribute("x", String(box2.x - 6));
      back.setAttribute("y", String(box2.y - 3));
      back.setAttribute("width", String(box2.width + 12));
      back.setAttribute("height", String(box2.height + 6));
      back.setAttribute("rx", "5");
    }
    return group;
  }
  function area(elements) {
    const root = svg.getScreenCTM();
    if (!root) return null;
    const inverse = root.inverse();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const element2 of elements) {
      const own = element2 && element2.getScreenCTM();
      if (!own) continue;
      const box2 = element2.getBBox();
      const to = inverse.multiply(own);
      for (const [x, y] of [[box2.x, box2.y], [box2.x + box2.width, box2.y], [box2.x, box2.y + box2.height], [box2.x + box2.width, box2.y + box2.height]]) {
        const point = new DOMPoint(x, y).matrixTransform(to);
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    }
    return left < Infinity ? { x: left, y: top, width: right - left, height: bottom - top } : null;
  }
  const stepArea = (step) => area(step.skip || step.moves.flatMap((move) => sequence ? [move.path, ...move.texts] : [move.from, move.to, move.path]));
  function look(step) {
    if (playing && !exporting) stage.diagramCamera?.look(stepArea(step));
  }
  function aim() {
    const steps = scenario().steps;
    if (!timeline.length || finished || exporting) return;
    stage.diagramCamera?.look(stepArea(steps[Math.min(reached, steps.length - 1)]));
  }
  const lit = (move) => [move.path, ...move.texts || []];
  function build(calm) {
    const segments = [];
    const DWELL = calm ? 650 : 420;
    const wait = (hold) => {
      if (hold && hold.ms) segments.push({ duration: hold.ms * DIAGRAM_PACE, start: () => {
        if (hold.caption) say(hold.caption);
      } });
    };
    for (const step of scenario().steps) {
      wait(step.hold);
      if (step.skip) {
        segments.push({ duration: calm ? 400 : 320, stop: true, start: () => {
          say(step.caption);
          look(step);
          for (const node of step.skip) {
            each(node, (part) => {
              part.classList.remove("play-active", "play-done");
              part.classList.add("play-skipped");
            });
            node.querySelector(":scope > .play-check")?.remove();
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
      const runs = step.moves.map((move) => {
        const length = move.path.getTotalLength();
        return { move, length, duration: calm ? 300 : Math.min(1700, Math.max(550, length * 3.2)) };
      });
      const longest = Math.max(...runs.map((run) => run.duration));
      const arrive = (run) => {
        if (run.arrived) return;
        run.arrived = true;
        run.token?.remove();
        tokens = tokens.filter((dot) => dot !== run.token);
        run.token = null;
        for (const element2 of lit(run.move)) {
          element2.classList.remove("play-edge");
          element2.classList.add("play-edge-done");
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
            for (const element2 of lit(run.move)) {
              element2.classList.remove("play-edge-done");
              element2.classList.add("play-edge");
            }
            if (calm) return;
            const own = run.move.path.getScreenCTM();
            const root = svg.getScreenCTM();
            run.matrix = own && root ? root.inverse().multiply(own) : new DOMMatrix();
            run.token = makeToken(at ? "" : step.label);
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
            run.token.setAttribute("transform", "translate(" + placed.x + " " + placed.y + ")");
          }
        },
        end: () => {
          for (const run of runs) arrive(run);
        }
      });
    }
    wait(scenario().tail);
    segments.push({ duration: DWELL, start: () => {
      for (const node of [...active]) setDone(node);
    } });
    return segments;
  }
  function enter(segment) {
    segment.start();
    if (segment.frame) segment.frame(0);
  }
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
        return "step";
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
    if (done === "step") {
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
    if (finished || !timeline.length) restart(!motion && matchMedia("(prefers-reduced-motion: reduce)").matches);
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
  function stepBack() {
    if (!timeline.length) return;
    const target = finished ? scenario().steps.length - 1 : waiting || !playing && !elapsed ? reached - 1 : reached;
    pause();
    restart(matchMedia("(prefers-reduced-motion: reduce)").matches);
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
  let exporting = null;
  function exportProgress() {
    if (!exporting) return;
    const done = timeline.length ? Math.min(99, Math.floor(100 * index / timeline.length)) : 0;
    recordButton.textContent = done + "%";
  }
  function exportEnd(error) {
    if (!exporting) return;
    const kind = exporting.kind;
    exporting = null;
    busy(false);
    stage.classList.remove("recording");
    recordButton.classList.remove("busy");
    recordButton.innerHTML = diagramIcon("share");
    for (const element2 of [backButton, playButton, nextButton, stopButton, speedButton]) element2.disabled = false;
    if (picker) picker.disabled = false;
    share.label(error ? "Could not save the " + exportLabel(kind) + ": " + (error.message || error) : "");
    sync();
  }
  async function exportScenario(kind) {
    if (exporting) return null;
    const mime = mimeFor(kind);
    exporting = { kind, cancelled: false };
    const job = exporting;
    pause();
    busy(true);
    for (const element2 of [backButton, playButton, nextButton, stopButton, speedButton]) element2.disabled = true;
    if (picker) picker.disabled = true;
    recordButton.classList.add("busy");
    recordButton.textContent = "0%";
    recordButton.title = "Cancel";
    recordButton.setAttribute("aria-label", "Cancel saving");
    let saved = null;
    let name = "";
    try {
      if (kind !== "gif" && !mime) throw new Error("this browser cannot record " + exportLabel(kind) + " video");
      name = diagramExportName(scenario().title, kind === "gif" ? "gif" : mime.startsWith("video/mp4") ? "mp4" : "webm");
      const captioned = scenario().steps.some((step) => step.caption);
      const canvas = await diagramCanvas(svg, home, kind === "gif" ? 960 : 1920, captioned);
      if (kind === "gif") {
        stage.classList.add("recording");
        const STEP = 60;
        const gif = gifWriter(canvas.width, canvas.height);
        restart(false);
        for (; ; ) {
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
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
        const chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
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
        for (const track2 of stream.getTracks()) track2.stop();
        if (job.cancelled) stop();
        else saved = new Blob(chunks, { type: recorder.mimeType || mime });
      }
      if (saved) await host.save(name, saved);
      exportEnd();
    } catch (error) {
      exportEnd(error);
      throw error;
    }
    return saved ? { name, blob: saved } : null;
  }
  function where() {
    const total = scenario().steps.length;
    return {
      story: (picker ? Number(picker.value) : 0) + 1,
      step: !timeline.length ? null : finished ? total : reached
    };
  }
  function restore(story, step) {
    if (exporting) return;
    if (picker && story >= 1 && story <= scenarios.length) picker.value = String(story - 1);
    stop();
    if (step === null) return;
    const total = scenario().steps.length;
    restart(matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (step >= total) {
      while (advance(Infinity) !== true) ;
      finished = true;
    } else for (let at = 0; at < step; at++) advance(Infinity, true);
    sync();
  }
  function jump(at) {
    if (exporting) return;
    restore((picker ? Number(picker.value) : 0) + 1, at);
    stepNext();
  }
  playButton.addEventListener("click", () => playing ? pause() : play());
  backButton.addEventListener("click", stepBack);
  nextButton.addEventListener("click", stepNext);
  stopButton.addEventListener("click", stop);
  share.name = () => scenario().title;
  share.choose = (kind) => {
    exportScenario(kind).catch(() => {
    });
  };
  stage.diagramExport = (kind) => exportScenario(kind);
  share.cancel = () => {
    if (!exporting) return false;
    exporting.cancelled = true;
    return true;
  };
  if (picker) picker.addEventListener("change", () => {
    stop();
    play();
  });
  stage.addEventListener("keydown", (event) => {
    const space = event.key === " " && !event.shiftKey && !event.target.closest("button");
    const forward = event.key === "PageDown" || event.key === "j" || event.key === "ArrowRight" && !event.shiftKey;
    const backward = event.key === "PageUp" || event.key === "k" || event.key === "ArrowLeft" && !event.shiftKey;
    const speed = event.key === ">" ? 1 : event.key === "<" ? -1 : 0;
    if (!forward && !backward && !space && !speed || exporting || event.ctrlKey || event.metaKey || event.altKey || event.target.closest("select")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (speed) setDiagramSpeed(speed);
    else if (space) playing ? pause() : play();
    else forward ? stepNext() : stepBack();
  });
  function walk(forward) {
    if (exporting) return false;
    if (forward) {
      if (finished) return false;
      stepNext();
      return true;
    }
    if (!timeline.length || !reached && !elapsed && !playing) return false;
    stepBack();
    return true;
  }
  sync();
  return { where, restore, aim, walk, playing: () => playing, finished: () => finished, toggle: () => playing ? pause() : play() };
}

// js/diagram/stage.js
var diagramDialog = null;
function panZoom(holder, scenarios, edges, about) {
  const svg = holder.querySelector(":scope > svg");
  const box = svg && svg.viewBox.baseVal;
  if (!box || !box.width || !box.height) return;
  const home = { x: box.x, y: box.y, w: box.width, h: box.height };
  const MAX = 12;
  let view = Object.assign({}, home);
  const stage = document.createElement("div");
  stage.className = "diagram-stage";
  const tools = document.createElement("div");
  tools.className = "diagram-tools";
  const button = (name, label) => {
    const element2 = document.createElement("button");
    element2.type = "button";
    element2.title = label;
    element2.setAttribute("aria-label", label);
    element2.innerHTML = diagramIcon(name);
    tools.append(element2);
    return element2;
  };
  const penButton = button("pen", "Draw on the diagram");
  const followButton = scenarios.length ? button("follow", "Follow the story") : null;
  const outButton = button("out", "Zoom out");
  const inButton = button("in", "Zoom in");
  const fitButton = button("fit", "Fit");
  const fullButton = button("full", "Full screen");
  stage.append(tools, svg);
  holder.append(stage);
  const share = diagramShare(stage, svg, tools);
  stage.diagramPlay = scenarios.length ? playDiagram(stage, svg, tools, scenarios, home, share, edges) : null;
  stage.diagramFocus = focusDiagram(stage, svg, edges) || null;
  stage.diagramNotes = about ? diagramComments(stage, svg, penButton, Object.assign({ edges, home }, about)) : null;
  holder.title = "Drag to move, Ctrl+scroll or pinch to zoom" + (stage.classList.contains("focusable") ? ", click a box to highlight it" : "");
  const full = () => Boolean(diagramDialog && diagramDialog.open && diagramDialog.contains(stage));
  const zoomed = () => view.w < home.w - 1e-9;
  function apply() {
    svg.setAttribute("viewBox", [view.x, view.y, view.w, view.h].join(" "));
    stage.diagramNotes?.zoom();
    stage.classList.toggle("zoomed", zoomed());
    outButton.disabled = fitButton.disabled = !zoomed();
    inButton.disabled = view.w <= home.w / MAX + 1e-9;
  }
  function clamp(box2 = view) {
    box2.x = Math.min(Math.max(box2.x, home.x), home.x + home.w - box2.w);
    box2.y = Math.min(Math.max(box2.y, home.y), home.y + home.h - box2.h);
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
  let glide = 0;
  let following = followButton !== null && localStorage.getItem("aniflow-diagram-follow") === "1";
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
    if (!following || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!rect) {
      if (zoomed() || glide) glideTo(home);
      return;
    }
    const aspect = home.h / home.w;
    const pad = Math.min(home.w, home.h) / 8;
    const w = Math.min(home.w, Math.max(rect.width + pad, (rect.height + pad) / aspect, home.w / 3));
    const target = { x: rect.x + rect.width / 2 - w / 2, y: rect.y + rect.height / 2 - w * aspect / 2, w, h: w * aspect };
    clamp(target);
    glideTo(target);
  }
  function syncFollow() {
    if (!followButton) return;
    const text = following ? "Stop following the story" : "Follow the story";
    followButton.title = text;
    followButton.setAttribute("aria-label", text);
    followButton.setAttribute("aria-pressed", String(following));
  }
  if (followButton) {
    followButton.classList.add("follow");
    syncFollow();
    followButton.addEventListener("click", () => {
      following = !following;
      localStorage.setItem("aniflow-diagram-follow", following ? "1" : "0");
      syncFollow();
      if (!following) reset();
      else stage.diagramPlay?.aim();
    });
  }
  stage.diagramCamera = { look };
  outButton.addEventListener("click", () => zoomAt(1 / 1.5, ...center()));
  inButton.addEventListener("click", () => zoomAt(1.5, ...center()));
  fitButton.addEventListener("click", reset);
  function openFull() {
    if (!diagramDialog) {
      diagramDialog = document.createElement("dialog");
      diagramDialog.className = "diagram-dialog";
      diagramDialog.setAttribute("aria-label", "Diagram");
      document.body.append(diagramDialog);
      addBusyCheck(() => diagramDialog.open);
    }
    holder.style.minHeight = holder.offsetHeight + "px";
    diagramDialog.append(stage);
    fullButton.innerHTML = diagramIcon("close");
    fullButton.title = "Close";
    fullButton.setAttribute("aria-label", "Close");
    diagramDialog.addEventListener("close", () => {
      stage.diagramNotes?.hidden();
      holder.append(stage);
      holder.style.minHeight = "";
      fullButton.innerHTML = diagramIcon("full");
      fullButton.title = "Full screen";
      fullButton.setAttribute("aria-label", "Full screen");
      reset();
    }, { once: true });
    diagramDialog.showModal();
    reset();
    fullButton.focus();
    stage.diagramNotes?.shown();
  }
  fullButton.addEventListener("click", () => full() ? diagramDialog.close() : openFull());
  stage.diagramFull = () => {
    if (full()) return;
    if (!diagramDialog || !diagramDialog.open) {
      openFull();
      return;
    }
    diagramDialog.addEventListener("close", openFull, { once: true });
    diagramDialog.close();
  };
  stage.addEventListener("keydown", (event) => {
    if (!full() || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = 60;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (event.key === "+" || event.key === "=") zoomAt(1.5, ...center());
    else if (event.key === "-") zoomAt(1 / 1.5, ...center());
    else if (event.key === "0") reset();
    else if (moves[event.key]) panBy(...moves[event.key]);
    else return;
    event.preventDefault();
  });
  stage.addEventListener("wheel", (event) => {
    if (!full() && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
    zoomAt(Math.exp(-Math.max(-100, Math.min(100, delta)) * (event.ctrlKey ? 0.01 : 25e-4)), event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener("dblclick", (event) => {
    if (event.target.closest(".diagram-tools")) return;
    zoomAt(event.shiftKey ? 1 / 2 : 2, event.clientX, event.clientY);
  });
  const SVG_NS2 = "http://www.w3.org/2000/svg";
  let drawing = false;
  let ink = null;
  let laser = [];
  let laserFrame = 0;
  function inkLayer() {
    if (!ink || !ink.isConnected) {
      ink = document.createElementNS(SVG_NS2, "g");
      ink.setAttribute("class", "diagram-ink");
      svg.append(ink);
    }
    return ink;
  }
  function toDiagram(event) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }
  function inkPath(name, width) {
    const path = document.createElementNS(SVG_NS2, "path");
    path.setAttribute("class", name);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    inkLayer().append(path);
    return path;
  }
  const pathData = (points) => points.map((point, at) => (at ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join("");
  function drawLaser() {
    laserFrame = 0;
    const now = performance.now();
    laser = laser.filter((point) => now - point.t < 320);
    let trail = ink && ink.querySelector(".ink-laser");
    let head = ink && ink.querySelector("circle");
    if (!laser.length || !drawing) {
      trail?.remove();
      head?.remove();
      laser = [];
      return;
    }
    if (!trail) trail = inkPath("ink-laser", 5);
    if (!head) head = inkLayer().appendChild(document.createElementNS(SVG_NS2, "circle"));
    const last = laser[laser.length - 1];
    const matrix = svg.getScreenCTM();
    trail.setAttribute("d", pathData(laser));
    head.setAttribute("cx", last.x);
    head.setAttribute("cy", last.y);
    head.setAttribute("r", String(5 / (matrix && matrix.a ? matrix.a : 1)));
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
    stage.classList.toggle("drawing", on);
    penButton.setAttribute("aria-pressed", String(on));
    const text = on ? "Stop drawing and clear" : "Draw on the diagram";
    penButton.title = text;
    penButton.setAttribute("aria-label", text);
    if (!on) clearInk();
  }
  penButton.classList.add("pen");
  penButton.setAttribute("aria-pressed", "false");
  penButton.addEventListener("click", () => setDrawing(!drawing));
  stage.diagramDraw = setDrawing;
  stage.addEventListener("pointermove", (event) => {
    if (!drawing || pointers.size > 1 || event.target.closest?.(".diagram-tools")) return;
    const point = toDiagram(event);
    if (!point) return;
    laser.push({ x: point.x, y: point.y, t: performance.now() });
    if (!laserFrame) laserFrame = requestAnimationFrame(drawLaser);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ink || !ink.querySelector(".ink-stroke") || !stage.isConnected) return;
    if (!stage.closest("dialog") && document.querySelector("dialog[open]")) return;
    event.preventDefault();
    for (const stroke of ink.querySelectorAll(".ink-stroke")) stroke.remove();
  }, { signal: host.render?.signal });
  const pointers = /* @__PURE__ */ new Map();
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".diagram-tools")) return;
    if (drawing) {
      for (const point of pointers.values()) {
        point.stroke?.remove();
        point.stroke = null;
        point.passive = false;
      }
      const at = toDiagram(event);
      const stroke = !pointers.size && at ? inkPath("ink-stroke", 3) : null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, stroke, points: at ? [at] : [] });
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.pointerType === "touch" && !zoomed() && !full() && !pointers.size) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, passive: true });
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    if (event.pointerType === "mouse") event.preventDefault();
  });
  stage.addEventListener("pointermove", (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    if (last.stroke) {
      const at = toDiagram(event);
      if (at) last.points.push(at);
      last.stroke.setAttribute("d", pathData(last.points));
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
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  apply();
}

// js/diagram/theme.js
function diagramColours(dark) {
  const style = getComputedStyle(host.article);
  const context = document.createElement("canvas").getContext("2d");
  const rgb = (name) => {
    context.fillStyle = "#808080";
    context.fillStyle = style.getPropertyValue(name).trim() || "#808080";
    const value = context.fillStyle;
    if (value[0] === "#") return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
    return value.match(/[\d.]+/g).slice(0, 3).map(Number);
  };
  const hex = (colour) => "#" + colour.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("");
  const mix = (front, back2, amount) => front.map((part, index) => part * amount + back2[index] * (1 - amount));
  const back = rgb("--bgColor-muted");
  const ink = rgb("--fgColor-default");
  const muted = rgb("--fgColor-muted");
  const accent = rgb("--fgColor-accent");
  const line = rgb("--borderColor-default");
  const node = hex(mix(accent, back, dark ? 0.2 : 0.14));
  return {
    darkMode: dark,
    background: hex(back),
    mainBkg: node,
    primaryColor: node,
    primaryBorderColor: hex(mix(accent, back, 0.65)),
    primaryTextColor: hex(ink),
    secondaryColor: hex(mix(muted, back, 0.16)),
    secondaryBorderColor: hex(line),
    secondaryTextColor: hex(ink),
    tertiaryColor: hex(mix(ink, back, 0.05)),
    tertiaryBorderColor: hex(line),
    tertiaryTextColor: hex(ink),
    textColor: hex(ink),
    lineColor: hex(muted),
    clusterBkg: hex(mix(ink, back, 0.04)),
    clusterBorder: hex(line),
    edgeLabelBackground: hex(back),
    noteBkgColor: hex(mix(accent, back, 0.08)),
    noteBorderColor: hex(line),
    noteTextColor: hex(ink),
    fontFamily: style.fontFamily,
    fontSize: "15px",
    dropShadow: "none",
    useGradient: false
  };
}

// js/diagram/draw.js
var diagramCount = 0;
function storyNumber(wanted, scenarios) {
  if (!wanted) return 0;
  if (/^\d+$/.test(wanted)) return Number(wanted);
  const found = scenarios.findIndex((scenario) => scenario.title.toLowerCase() === wanted.trim().toLowerCase());
  return found + 1;
}
function autoplay(stage) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const watcher = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    if (stage.isConnected && !stage.diagramPlay.playing() && !stage.diagramPlay.where().step) stage.diagramPlay.toggle();
  }, { threshold: 0.6 });
  watcher.observe(stage);
  host.render?.signal.addEventListener("abort", () => watcher.disconnect(), { once: true });
}
function nearScreen(blocks) {
  if (!host.lazy || !("IntersectionObserver" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      resolve();
    }, { rootMargin: "600px 0px" });
    for (const block of blocks) watcher.observe(block);
  });
}
function drawDiagrams() {
  const diagrams2 = [...host.article.querySelectorAll(".highlight-source-mermaid")];
  if (!diagrams2.length) return;
  const draw = async () => {
    const dark = host.dark ? Boolean(host.dark()) : document.documentElement.dataset.mode === "dark";
    let themeVariables = null;
    try {
      themeVariables = diagramColours(dark);
    } catch (error) {
    }
    mermaid.initialize(themeVariables ? { startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables } : { startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
    for (const [position, block] of diagrams2.entries()) {
      if (!block.isConnected) continue;
      const id = "mermaid-" + diagramCount++;
      try {
        const scenarios = playScript(block.textContent, Number(block.dataset.line) || 0);
        const pictures = await diagramImages(block.textContent);
        const edges = await diagramEdges(pictures.source);
        const result = await mermaid.render(id, pictures.source);
        if (!block.isConnected) {
          document.getElementById("d" + id)?.remove();
          continue;
        }
        const holder = document.createElement("div");
        holder.className = "mermaid-diagram";
        if (block.dataset.line) {
          holder.dataset.line = block.dataset.line;
          holder.dataset.lineEnd = block.dataset.lineEnd;
        }
        holder.innerHTML = result.svg;
        holder.diagramBlock = block;
        block.replaceWith(holder);
        if (block.classList.contains("slide-on")) holder.classList.add("slide-on");
        panZoom(holder, scenarios, edges, { source: block.textContent, line: block.dataset.line, lineEnd: block.dataset.lineEnd, index: position + 1 });
        const stage = holder.querySelector(":scope > .diagram-stage");
        if (stage) {
          stage.dataset.diagram = String(position + 1);
          const story = storyNumber(block.dataset.story, scenarios);
          if (stage.diagramPlay && story) stage.diagramPlay.restore(story, null);
          const wanted = stage.diagramPlay && !block.diagramPlayed && (host.autoplay || "autoplay" in block.dataset);
          if (!diagramFromHash(stage) && wanted) {
            block.diagramPlayed = true;
            autoplay(stage);
          }
        }
        if (stage && holder.classList.contains("slide-on")) host.onSlideDiagram?.();
        if (pictures.problems.length) holder.title += "\nPictures not shown: " + pictures.problems.join(", ");
        if (host.onDiagram) host.onDiagram();
      } catch (error) {
        document.getElementById("d" + id)?.remove();
        block.title = "Mermaid: " + (error.message || error);
      }
    }
  };
  if (window.mermaid) {
    draw();
    return;
  }
  nearScreen(diagrams2).then(() => {
    if (window.mermaid) return draw();
    const script = document.createElement("script");
    if (host.nonce) script.nonce = host.nonce;
    script.src = host.mermaid;
    script.onload = draw;
    document.head.append(script);
  });
}
function redrawDiagrams() {
  if (diagramDialog?.open) diagramDialog.close();
  for (const holder of host.article.querySelectorAll(".mermaid-diagram")) {
    if (holder.diagramBlock) holder.replaceWith(holder.diagramBlock);
  }
  drawDiagrams();
}

// js/reader/frontmatter.js
var FRONT_KEY = /^([A-Za-z0-9_][\w .\/-]*?)[ \t]*:(?:[ \t]+(.*?))?[ \t]*$/;
var FRONT_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
var FRONT_LIMIT = 200;
function readFrontMatter(text) {
  const lines = text.split("\n", FRONT_LIMIT + 2);
  if (!/^---[ \t]*$/.test(lines[0])) return null;
  let close = 1;
  while (close < lines.length && close <= FRONT_LIMIT && !/^(?:---|\.\.\.)[ \t]*$/.test(lines[close])) close++;
  if (close >= lines.length || close > FRONT_LIMIT) return null;
  const inner = lines.slice(1, close);
  const first = inner.find((line) => line.trim() && !/^\s*#/.test(line));
  if (!first || /^\s/.test(first) || !FRONT_KEY.test(first)) return null;
  return { lines: close + 1, yaml: inner.join("\n"), entries: frontEntries(inner) };
}
function frontEntries(lines) {
  const entries = [];
  for (const line of lines) {
    const key = /^\s/.test(line) ? null : FRONT_KEY.exec(line);
    if (key) entries.push({ key: key[1], inline: key[2] || "", rest: [] });
    else if (!line.trim() || /^\s*#/.test(line)) entries.length && entries[entries.length - 1].rest.push(line);
    else if (entries.length) entries[entries.length - 1].rest.push(line);
    else return null;
  }
  return entries.map(frontValue);
}
function frontUnquote(text) {
  text = text.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return text.slice(1, -1).replace(/\\(.)/g, (all, c) => c === "n" ? "\n" : c === "t" ? "	" : c);
  if (/^'(?:[^']|'')*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  return text.replace(/\s+#.*$/, "");
}
function frontSplit(text) {
  const items = [];
  let current2 = "", quote = "";
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = "";
      current2 += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      current2 += c;
    } else if (c === ",") {
      items.push(current2);
      current2 = "";
    } else current2 += c;
  }
  if (current2.trim() || items.length) items.push(current2);
  return items.map(frontUnquote).filter((item) => item !== "");
}
function frontValue({ key, inline, rest }) {
  const trimmed = inline.trim();
  const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:\s+#.*)?$/.exec(trimmed);
  const value = quoted ? quoted[1] : trimmed.replace(/(?:^|\s+)#.*$/, "");
  const body = rest.filter((line) => line.trim() && !/^\s*#/.test(line));
  const indent = body.length ? Math.min(...body.map((line) => /^\s*/.exec(line)[0].length)) : 0;
  const block = rest.map((line) => line.slice(indent)).join("\n").replace(/\s+$/, "");
  const raw = () => ({ key, kind: "raw", value: [value, block].filter(Boolean).join("\n") });
  if (/^[|>][+-]?\d*$/.test(value)) {
    return { key, kind: "text", value: value[0] === ">" ? block.replace(/([^\n])\n(?=[^\n])/g, "$1 ") : block };
  }
  if (!value.trim()) {
    if (!body.length) return { key, kind: "empty" };
    if (body.every((line) => /^\s*-(?:\s+|$)/.test(line))) {
      return { key, kind: "list", value: body.map((line) => frontUnquote(line.replace(/^\s*-\s*/, ""))).filter((item) => item !== "") };
    }
    return raw();
  }
  if (/^\[.*\]$/.test(value.trim()) && !body.length) return { key, kind: "list", value: frontSplit(value.trim().slice(1, -1)) };
  if (/^[{&*!]/.test(value.trim())) return raw();
  if (body.length) {
    if (/^["']/.test(value.trim())) return raw();
    return { key, kind: "scalar", value: [value, ...body].map((line) => line.trim()).join(" ") };
  }
  return { key, kind: "scalar", value: frontUnquote(value) };
}
var frontEscape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function frontDate(text) {
  const match = FRONT_DATE.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const date = hour === void 0 ? new Date(Number(year), Number(month) - 1, Number(day)) : zone ? new Date(text.replace(" ", "T")) : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second || 0));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(month) - 1) return null;
  const style = hour === void 0 ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" };
  return '<time datetime="' + frontEscape(text.replace(" ", "T")) + '" title="' + frontEscape(text) + '">' + frontEscape(new Intl.DateTimeFormat(void 0, style).format(date)) + "</time>";
}
function frontScalar(text) {
  if (text === "" || /^(?:null|~)$/i.test(text)) return '<span class="frontmatter-empty">empty</span>';
  if (/^(?:true|false)$/i.test(text)) return /^t/i.test(text) ? "Yes" : "No";
  const date = frontDate(text);
  if (date) return date;
  if (/^https?:\/\/\S+$/i.test(text)) {
    const label = text.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return '<a href="' + frontEscape(text) + '" title="' + frontEscape(text) + '">' + frontEscape(label) + "</a>";
  }
  return frontEscape(text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (all, target, alias) => alias || target));
}
function frontPanel(front, map) {
  const where = map ? ' data-line="' + (map[0] + 1) + '" data-line-end="' + map[1] + '"' : "";
  if (!front.entries || !front.entries.length) {
    return '<div class="frontmatter frontmatter-raw"' + where + "><pre><code>" + frontEscape(front.yaml) + "</code></pre></div>\n";
  }
  let html = '<dl class="frontmatter"' + where + ">";
  for (const entry of front.entries) {
    const tags = /^tags?$/i.test(entry.key);
    let items = entry.kind === "list" ? entry.value : null;
    if (tags && entry.kind === "scalar") items = entry.value.split(/[\s,]+/).filter(Boolean);
    let value;
    if (items) {
      value = items.length ? '<span class="frontmatter-list">' + items.map((item) => '<span class="frontmatter-pill' + (tags ? " frontmatter-tag" : "") + '">' + (tags ? frontEscape("#" + item.replace(/^#/, "")) : frontScalar(item)) + "</span>").join("") + "</span>" : '<span class="frontmatter-empty">empty</span>';
    } else if (entry.kind === "text") value = '<span class="frontmatter-text">' + frontEscape(entry.value) + "</span>";
    else if (entry.kind === "raw") value = '<code class="frontmatter-code">' + frontEscape(entry.value) + "</code>";
    else if (entry.kind === "empty") value = '<span class="frontmatter-empty">empty</span>';
    else value = frontScalar(entry.value);
    html += "<dt>" + frontEscape(entry.key) + "</dt><dd>" + value + "</dd>";
  }
  return html + "</dl>\n";
}
function frontMatterPlugin(markdown2) {
  markdown2.block.ruler.before("table", "aniflow_frontmatter", (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.parentType !== "root" || state.sCount[0] !== 0) return false;
    const front = readFrontMatter(state.src);
    if (!front || front.lines > endLine) return false;
    if (silent) return true;
    const token = state.push("front_matter", "", 0);
    token.block = true;
    token.map = [0, front.lines];
    token.meta = front;
    state.line = front.lines;
    return true;
  });
  markdown2.renderer.rules.front_matter = (tokens, index) => frontPanel(tokens[index].meta, tokens[index].map);
}

// js/reader/github.js
var CALLOUTS = {
  note: "note",
  info: "note",
  todo: "note",
  abstract: "note",
  summary: "note",
  tldr: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  check: "tip",
  done: "tip",
  important: "important",
  question: "important",
  help: "important",
  faq: "important",
  example: "important",
  quote: "important",
  cite: "important",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "warning",
  fail: "warning",
  missing: "warning",
  bug: "warning",
  danger: "caution",
  error: "caution"
};
var CALLOUT_MARK = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/;
var ALERTS = {
  note: ["Note", "info", "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"],
  tip: ["Tip", "light-bulb", "M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"],
  important: ["Important", "report", "M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"],
  warning: ["Warning", "alert", "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"],
  caution: ["Caution", "stop", "M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"]
};
var ALERT_MARK = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;
var TASK_MARK = /^\[([ xX])\][ \t]+/;
function githubFlavour(markdown2) {
  markdown2.core.ruler.push("aniflow_github", (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if ((token.type === "th_open" || token.type === "td_open") && token.attrGet("style")) {
        const align = /text-align:(left|right|center)/.exec(token.attrGet("style"));
        token.attrs = token.attrs.filter((attr) => attr[0] !== "style");
        if (align) token.attrSet("align", align[1]);
      }
      const inline = tokens[index + 2];
      if (!inline || inline.type !== "inline" || tokens[index + 1].type !== "paragraph_open") continue;
      const children = inline.children || [];
      if (token.type === "blockquote_open") {
        const match = (host.callouts ? CALLOUT_MARK : ALERT_MARK).exec(inline.content);
        if (!match) continue;
        const type = match[1].toLowerCase();
        const kind = host.callouts ? CALLOUTS[type] || "note" : type;
        const title = host.callouts ? match[3].trim() || type[0].toUpperCase() + type.slice(1) : ALERTS[kind][0];
        const fold = host.callouts ? match[2] : "";
        let depth = 0, close = index;
        for (; close < tokens.length; close++) {
          if (tokens[close].type === "blockquote_open") depth++;
          else if (tokens[close].type === "blockquote_close" && --depth === 0) break;
        }
        token.meta = { alert: kind, title, fold };
        tokens[close].meta = { alert: kind, fold };
        const marker = match[0].trim();
        let consumed = "";
        while (children.length && children[0].type === "text" && consumed.length < marker.length) consumed += children.shift().content;
        if (children.length && /^(soft|hard)break$/.test(children[0].type)) children.shift();
        if (!children.length) tokens[index + 1].hidden = tokens[index + 3].hidden = true;
      } else if (token.type === "list_item_open") {
        const match = TASK_MARK.exec(inline.content);
        if (!match || !children.length || children[0].type !== "text" || !children[0].content.startsWith(match[0])) continue;
        children[0].content = children[0].content.slice(match[0].length);
        const box = new state.Token("html_inline", "", 0);
        box.content = '<input type="checkbox" class="task-list-item-checkbox" disabled' + (match[1] === " " ? "" : " checked") + "> ";
        children.unshift(box);
        token.attrJoin("class", "task-list-item");
        for (let back = index - 1; back >= 0; back--) {
          const list = tokens[back];
          if (list.level === token.level - 1 && /^(bullet|ordered)_list_open$/.test(list.type)) {
            if (!(list.attrGet("class") || "").includes("contains-task-list")) list.attrJoin("class", "contains-task-list");
            break;
          }
        }
      }
    }
  });
  markdown2.core.ruler.push("aniflow_lines", (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!token.map || !/^(paragraph_open|heading_open|tr_open|hr)$/.test(token.type)) continue;
      const target = token.hidden ? tokens[index - 1] : token;
      if (!target || token.hidden && target.type !== "list_item_open") continue;
      target.attrSet("data-line", String(token.map[0] + 1));
      target.attrSet("data-line-end", String(Math.max(token.map[1], token.map[0] + 1)));
    }
  });
  const lines = (token, first) => token.map ? ' data-line="' + (token.map[0] + 1) + '" data-line-end="' + token.map[1] + '" data-code="' + first + '"' : "";
  const rules = markdown2.renderer.rules;
  rules.code_block = (tokens, index) => {
    const token = tokens[index];
    return "<pre" + lines(token, token.map ? token.map[0] + 1 : 0) + "><code>" + markdown2.utils.escapeHtml(token.content.replace(/\n$/, "")) + "</code></pre>\n";
  };
  rules.blockquote_open = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta;
    if (!meta || !meta.alert) return self.renderToken(tokens, index, options);
    const [, icon, path] = ALERTS[meta.alert];
    const svg = '<svg class="octicon octicon-' + icon + ' mr-2" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="' + path + '"></path></svg>';
    const title = markdown2.utils.escapeHtml(meta.title);
    const classes = "markdown-alert markdown-alert-" + meta.alert;
    if (meta.fold) return '<details class="' + classes + '"' + (meta.fold === "+" ? " open" : "") + '><summary class="markdown-alert-title">' + svg + title + "</summary>\n";
    return '<div class="' + classes + '"><p class="markdown-alert-title">' + svg + title + "</p>\n";
  };
  rules.blockquote_close = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta;
    if (!meta || !meta.alert) return self.renderToken(tokens, index, options);
    return meta.fold ? "</details>\n" : "</div>\n";
  };
  rules.fence = (tokens, index) => {
    const token = tokens[index];
    const text = token.content.replace(/\n$/, "");
    const language = (token.info.trim().split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z0-9_+#.-]/g, "");
    const where = lines(token, token.map ? token.map[0] + 2 : 0);
    if (!language) return '<pre class="notranslate"' + where + "><code>" + markdown2.utils.escapeHtml(text) + "</code></pre>\n";
    const body = language !== "mermaid" && window.hljs && hljs.getLanguage(language) ? hljs.highlight(text, { language, ignoreIllegals: true }).value : markdown2.utils.escapeHtml(text);
    return '<div class="highlight highlight-source-' + language + '"' + where + '><pre class="notranslate">' + body + "</pre></div>\n";
  };
  if (rules.footnote_ref) {
    rules.footnote_caption = (tokens, index) => String(tokens[index].meta.id + 1);
    const footnoteRef = rules.footnote_ref;
    rules.footnote_ref = (...args) => footnoteRef(...args).replace("<a ", '<a data-footnote-ref aria-describedby="footnote-label" ');
    rules.footnote_block_open = () => '<section class="footnotes" data-footnotes>\n<h2 id="footnote-label" class="sr-only">Footnotes</h2>\n<ol>\n';
    rules.footnote_block_close = () => "</ol>\n</section>\n";
  }
}
function sanitize(markup) {
  return DOMPurify.sanitize(markup, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style", "form", "button", "textarea", "select"],
    FORBID_ATTR: ["style"]
  });
}

// js/reader/render.js
var markdown = null;
function renderLocal() {
  try {
    if (!markdown) {
      markdown = window.markdownit({ html: true, linkify: true, breaks: host.breaks });
      markdown.linkify.set({ fuzzyLink: false });
      if (window.markdownitFootnote) markdown.use(window.markdownitFootnote);
      if (window.markdownitEmoji) markdown.use(window.markdownitEmoji);
      frontMatterPlugin(markdown);
      githubFlavour(markdown);
      for (const plugin of host.plugins) plugin(markdown);
    }
    return sanitize(markdown.render(host.preprocess(host.source)));
  } catch (error) {
    console.error("markdown rendering failed", error);
    const pre = document.createElement("pre");
    pre.textContent = host.source;
    const fragment = document.createDocumentFragment();
    fragment.append(pre);
    return fragment;
  }
}
function directoryUrl(value, root) {
  if (!value || value.includes("\\") || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) return null;
  if (value.startsWith("/icons/")) return value;
  const rooted = value.startsWith("/") && !value.startsWith(root) ? root + value.slice(1) : value;
  const url = new URL(rooted, location.href);
  return url.origin === location.origin && url.pathname.startsWith(root) ? url.href : null;
}

// js/reader/review.js
function initReview() {
  if (host.commentsUrl && host.reviewToggle && host.dock) {
    let make = function(tag, className, text) {
      const element2 = document.createElement(tag);
      if (className) element2.className = className;
      if (text !== void 0) element2.textContent = text;
      if (tag === "button") element2.type = "button";
      return element2;
    }, ago = function(date) {
      const seconds = (date.getTime() - Date.now()) / 1e3;
      const format = new Intl.RelativeTimeFormat(void 0, { numeric: "auto" });
      for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
      }
      return "just now";
    }, notify = function(text) {
      message = text;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => {
        message = "";
        updateDock();
      }, 3e3);
      updateDock();
    }, redraw = function() {
      const count = view.comments.length;
      badge.textContent = String(count);
      badge.hidden = !count;
      const label = count ? reviewName + ", " + plural(count) : reviewName;
      host.reviewToggle.setAttribute("aria-label", label);
      host.reviewToggle.title = label;
      if (!reviewing) return;
      buildMarks();
      drawThreads();
      paint();
    }, collect = function() {
      const found = [];
      for (const element2 of host.article.querySelectorAll("[data-line]")) {
        if (element2.closest(".code-body, .review-thread, .review-composer")) continue;
        const start = Number(element2.dataset.line);
        if (start) found.push({ element: element2, start, end: Number(element2.dataset.lineEnd) || start, code: false });
      }
      for (const box of host.article.querySelectorAll(".code-body [data-code]")) {
        const first = Number(box.dataset.code);
        const pre = box.matches("pre") ? box : box.querySelector("pre");
        if (!first || !pre) continue;
        const count = pre.textContent.replace(/\n$/, "").split("\n").length;
        const last = Math.min(first + count - 1, Number(box.dataset.lineEnd) || Infinity);
        for (let line = first; line <= last; line++) {
          found.push({ element: box, start: line, end: line, code: true, body: box.closest(".code-body") });
        }
      }
      return found.sort((a, b) => a.start - b.start || a.end - b.end);
    }, buildMarks = function() {
      gutter.replaceChildren();
      for (const old of host.article.querySelectorAll(".code-gutter")) old.remove();
      const commented = view.comments.filter((comment) => !comment.outdated);
      marks = collect();
      const columns = /* @__PURE__ */ new Map();
      for (const mark of marks) {
        const button = make("button", "review-line", String(mark.start));
        button.dataset.start = mark.start;
        button.dataset.end = mark.end;
        button.setAttribute("aria-label", range(mark.start, mark.end));
        if (mark.end > mark.start) button.title = range(mark.start, mark.end);
        if (commented.some((comment) => comment.start <= mark.end && comment.end >= mark.start)) button.classList.add("commented");
        mark.button = button;
        if (mark.code) {
          let column = columns.get(mark.body);
          if (!column) {
            column = make("div", "code-gutter");
            mark.body.prepend(column);
            columns.set(mark.body, column);
          }
          column.append(button);
        } else {
          gutter.append(button);
        }
      }
      host.article.append(gutter);
      place();
    }, place = function() {
      if (!reviewing) return;
      const top = host.article.getBoundingClientRect().top;
      for (const mark of marks) {
        if (mark.code) continue;
        const box = mark.element.getBoundingClientRect();
        mark.button.hidden = !box.height;
        if (!box.height) continue;
        const row = mark.element.tagName === "TR";
        const style = getComputedStyle(row ? mark.element.cells[0] || mark.element : mark.element);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const offset = mark.element.tagName === "HR" ? box.height / 2 - 12 : (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0) + (line - 24) / 2;
        mark.button.style.top = box.top - top + offset + "px";
      }
      drawBands();
    }, drawBands = function() {
      for (const band of host.article.querySelectorAll(".code-band")) band.remove();
      const spans = /* @__PURE__ */ new Map();
      for (const mark of marks) {
        if (!mark.code || !inside(mark)) continue;
        const span = spans.get(mark.body) || [mark.button, mark.button];
        span[1] = mark.button;
        spans.set(mark.body, span);
      }
      for (const [body, [first, last]] of spans) {
        const band = make("div", "code-band");
        band.style.top = first.offsetTop + "px";
        band.style.height = last.offsetTop + last.offsetHeight - first.offsetTop + "px";
        body.append(band);
      }
    }, paint = function() {
      for (const element2 of host.article.querySelectorAll(".review-selected")) element2.classList.remove("review-selected");
      for (const mark of marks) {
        const on = inside(mark);
        mark.button.classList.toggle("selected", on);
        mark.button.setAttribute("aria-pressed", String(on));
        if (on && !mark.code) mark.element.classList.add("review-selected");
      }
      drawBands();
      updateDock();
    }, remember = function() {
      const hash = selection ? "#L" + selection.start + (selection.end > selection.start ? "-L" + selection.end : "") : "";
      if (hash || /^#L\d/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + hash);
    }, choose = function(start, end, extend) {
      if (extend && selection) {
        const anchor = selection.anchor;
        selection = { start: Math.min(anchor.start, start), end: Math.max(anchor.end, end), anchor };
      } else {
        selection = { start, end, anchor: { start, end } };
      }
      remember();
      paint();
    }, clear = function() {
      selection = null;
      remember();
      paint();
    }, updateDock = function() {
      const count = view.comments.length;
      host.dock.classList.toggle("error", message.startsWith("!"));
      if (message) dockText.textContent = message.replace(/^!/, "");
      else if (selection) dockText.textContent = range(selection.start, selection.end) + " selected";
      else if (count) dockText.textContent = plural(count);
      else dockText.textContent = coarse.matches ? "Tap a line number" : "Click a line number, shift-click for a range";
      commentButton.hidden = !selection || Boolean(composer);
      clearButton.hidden = !selection;
      copyButton.hidden = Boolean(selection) || !count;
    }, spot = function(line) {
      let best = null;
      for (const mark of marks) if (mark.start <= line) best = mark;
      return best || marks[0] || null;
    }, slot = function(mark, start) {
      const element2 = mark.element;
      if (mark.code) return [element2.closest(".code-block"), "after"];
      if (element2.tagName === "TR") return [element2.closest("table"), "after"];
      const own = element2.tagName === "LI" ? element2 : element2.parentElement?.tagName === "LI" ? element2.parentElement : null;
      if (!own) return [element2, "after"];
      let item = own;
      let list = null;
      while (item && start < lineOf(item) && lineOf(item.parentElement.firstElementChild) >= start) {
        list = item.parentElement;
        item = list.parentElement?.tagName === "LI" ? list.parentElement : null;
      }
      if (list) return [list, "after"];
      if (element2 !== own) return [element2, "after"];
      const nested = own.querySelector(":scope > ul, :scope > ol");
      return nested ? [nested, "before"] : [own, "append"];
    }, insertAt = function([node, how], content) {
      if (how === "before") node.before(content);
      else if (how === "append") node.append(content);
      else node.after(content);
    }, editor = function(text, label, action, save, cancel) {
      const form = make("form", "review-form");
      const area = make("textarea");
      area.value = text;
      area.rows = 4;
      area.maxLength = commentMax;
      area.placeholder = "Leave a comment";
      area.setAttribute("aria-label", label);
      const row = make("div", "review-actions");
      const hint = make("span", "review-hint", /Mac|iP/.test(navigator.platform) ? "\u2318 Enter to save" : "Ctrl+Enter to save");
      const cancelButton = make("button", "", "Cancel");
      const submit = make("button", "primary", action);
      submit.type = "submit";
      row.append(hint, cancelButton, submit);
      form.append(area, row);
      form.addEventListener("submit", async (event) => {
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
          notify("!Saving failed: " + (error.message || error));
        }
      });
      area.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          form.requestSubmit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      });
      cancelButton.addEventListener("click", cancel);
      return { form, area };
    }, closeComposer = function() {
      if (composer) composer.remove();
      composer = null;
      updateDock();
    }, compose = function() {
      if (!selection) return;
      closeComposer();
      const target = { start: selection.start, end: selection.end };
      const mark = spot(target.end);
      if (!mark) return;
      const holder = make("div", "review-composer");
      holder.append(make("p", "review-composer-title", "Comment on " + range(target.start, target.end).toLowerCase()));
      const { form, area } = editor("", "Comment on " + range(target.start, target.end).toLowerCase(), "Comment", async (text) => {
        await post("add", "", { start: target.start, end: target.end, body: text });
        closeComposer();
        clear();
        notify("Comment added");
      }, closeComposer);
      holder.append(form);
      insertAt(slot(mark, target.start), holder);
      composer = holder;
      updateDock();
      area.focus({ preventScroll: true });
      holder.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, card = function(comment) {
      const item = make("section", "review-comment" + (comment.outdated ? " outdated" : ""));
      const head = make("header");
      const about = comment.target ? comment.target.label ? ", " + comment.target.label : ", diagram" : "";
      const where = make("button", "review-where", range(comment.start, comment.end) + about);
      where.setAttribute("aria-label", "Select " + range(comment.start, comment.end).toLowerCase());
      where.addEventListener("click", () => choose(comment.start, comment.end, false));
      const stamp = new Date((comment.updated || comment.created) * 1e3);
      const when = make("time", "", ago(stamp) + (comment.updated > comment.created + 1 ? ", edited" : ""));
      when.dateTime = stamp.toISOString();
      when.title = stamp.toLocaleString();
      const tools = make("span", "review-tools");
      const edit = make("button", "", "Edit");
      const remove = make("button", "", "Delete");
      tools.append(edit, remove);
      head.append(where, when, tools);
      item.append(head);
      if (comment.outdated) {
        item.append(make("p", "review-note", "These lines changed after the comment. It was written on:"));
        item.append(make("pre", "review-quote", comment.quote.join("\n")));
      }
      const body = make("p", "review-body", comment.body);
      item.append(body);
      edit.addEventListener("click", () => {
        if (item.querySelector("form")) return;
        const done = () => {
          form.remove();
          body.hidden = false;
          edit.disabled = false;
        };
        const { form, area } = editor(comment.body, "Edit the comment on " + range(comment.start, comment.end).toLowerCase(), "Save", async (text) => {
          await post("edit", "?id=" + encodeURIComponent(comment.id), { body: text });
          notify("Comment saved");
        }, done);
        body.hidden = true;
        edit.disabled = true;
        body.after(form);
        area.focus();
      });
      let armed = 0;
      remove.addEventListener("click", async () => {
        if (!armed) {
          remove.textContent = "Confirm delete";
          remove.classList.add("danger");
          armed = setTimeout(() => {
            armed = 0;
            remove.textContent = "Delete";
            remove.classList.remove("danger");
          }, 3e3);
          return;
        }
        clearTimeout(armed);
        remove.disabled = true;
        try {
          await post("delete", "?id=" + encodeURIComponent(comment.id));
          notify("Comment deleted");
        } catch (error) {
          remove.disabled = false;
          notify("!Deleting failed: " + (error.message || error));
        }
      });
      return item;
    }, drawThreads = function() {
      for (const old of host.article.querySelectorAll(".review-thread")) old.remove();
      const groups = [];
      for (const comment of view.comments) {
        const mark = spot(comment.end);
        if (!mark) continue;
        const where = slot(mark, comment.start);
        let group = groups.find((other) => other.where[0] === where[0] && other.where[1] === where[1]);
        if (!group) groups.push(group = { where, end: 0, comments: [] });
        group.end = Math.max(group.end, comment.end);
        group.comments.push(comment);
      }
      for (const group of groups.sort((a, b) => b.end - a.end)) {
        const thread = make("div", "review-thread");
        for (const comment of group.comments) thread.append(card(comment));
        insertAt(group.where, thread);
      }
    }, enter = function() {
      reviewing = true;
      host.article.classList.add("reviewing");
      document.body.classList.add("reviewing");
      host.dock.hidden = false;
      host.reviewToggle.setAttribute("aria-pressed", "true");
      buildMarks();
      drawThreads();
      paint();
    }, leave = function() {
      reviewing = false;
      closeComposer();
      selection = null;
      remember();
      gutter.remove();
      for (const element2 of host.article.querySelectorAll(".code-gutter, .code-band, .review-thread")) element2.remove();
      for (const element2 of host.article.querySelectorAll(".review-selected")) element2.classList.remove("review-selected");
      marks = [];
      host.article.classList.remove("reviewing");
      document.body.classList.remove("reviewing");
      host.dock.hidden = true;
      host.reviewToggle.setAttribute("aria-pressed", "false");
    }, follow = function() {
      const wanted = /^#L(\d+)(?:-L(\d+))?$/.exec(location.hash);
      if (!wanted) return;
      if (!reviewing) enter();
      const start = Math.max(1, Math.min(Number(wanted[1]), view.lines || 1));
      choose(start, Math.max(start, Math.min(Number(wanted[2] || start), view.lines || start)), false);
      const first = marks.find(inside);
      if (first) (first.code ? first.button : first.element).scrollIntoView({ block: "center" });
    };
    const reviewName = host.reviewName;
    if (reviewName === "Comments") {
      const label = document.createElement("span");
      label.textContent = "Comments";
      host.reviewToggle.insertBefore(label, host.reviewToggle.querySelector(".count"));
    }
    const coarse = matchMedia("(pointer: coarse)");
    const commentMax = host.commentMax;
    const badge = host.reviewToggle.querySelector(".count");
    const dockText = host.dock.querySelector(".review-dock-text");
    const commentButton = host.dock.querySelector('[data-review="comment"]');
    const clearButton = host.dock.querySelector('[data-review="clear"]');
    const copyButton = host.dock.querySelector('[data-review="copy"]');
    const gutter = document.createElement("div");
    gutter.className = "review-gutter";
    let reviewing = false;
    let view = { lines: 0, comments: [] };
    let promptText = "";
    let selection = null;
    let marks = [];
    let composer = null;
    let message = "";
    let messageTimer = 0;
    const range = (start, end) => start === end ? "Line " + start : "Lines " + start + "\u2013" + end;
    const plural = (count) => count + (count === 1 ? " comment" : " comments");
    addBusyCheck(() => Boolean(composer) || Boolean(host.article.querySelector(".review-comment form")));
    async function call(url, options) {
      const response = await fetch(url, Object.assign({ cache: "no-store" }, options));
      const answer = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(answer.error || response.statusText);
      return answer;
    }
    async function loadPrompt() {
      const response = await fetch(host.commentsUrl + "?format=prompt", { cache: "no-store" });
      promptText = response.ok ? await response.text() : "";
    }
    async function refresh() {
      view = await call(host.commentsUrl);
      await loadPrompt();
      redraw();
    }
    async function post(action, query, body) {
      view = await call(host.commentsUrl.replace("/comments/", "/comments/" + action + "/") + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === void 0 ? "" : JSON.stringify(body)
      });
      await loadPrompt();
      redraw();
    }
    const inside = (mark) => Boolean(selection) && mark.start <= selection.end && mark.end >= selection.start;
    const lineOf = (element2) => Number(element2?.dataset.line || element2?.querySelector("[data-line]")?.dataset.line || 0);
    host.onShow = () => {
      if (reviewing) leave();
    };
    host.onDiagram = () => {
      if (!reviewing) return;
      buildMarks();
      paint();
    };
    host.reviewToggle.hidden = false;
    host.reviewToggle.addEventListener("click", () => reviewing ? leave() : enter());
    host.article.addEventListener("mousedown", (event) => {
      if (event.shiftKey && event.target.closest(".review-line")) event.preventDefault();
    });
    host.article.addEventListener("click", (event) => {
      const button = event.target.closest(".review-line");
      if (!button || !reviewing) return;
      const start = Number(button.dataset.start), end = Number(button.dataset.end);
      const touch = coarse.matches && Boolean(selection);
      if (touch && start >= selection.start && end <= selection.end) clear();
      else choose(start, end, event.shiftKey || touch);
    });
    commentButton.addEventListener("click", compose);
    clearButton.addEventListener("click", clear);
    host.dock.querySelector('[data-review="done"]').addEventListener("click", leave);
    copyButton.addEventListener("click", async () => {
      const done = promptText ? await copyText(promptText) : false;
      notify(done ? "Copied " + plural(view.comments.length) + " as a prompt" : "!Copy failed");
    });
    document.addEventListener("keydown", (event) => {
      if (reviewing && event.key === "Escape" && selection && !composer && !event.target.closest("textarea")) clear();
    });
    new ResizeObserver(() => {
      if (reviewing) requestAnimationFrame(place);
    }).observe(host.article);
    addEventListener("hashchange", follow);
    addEventListener("aniflow-comments", () => refresh().catch((error) => console.error("comments", error)));
    refresh().catch((error) => console.error("comments", error)).then(follow);
  }
}

// js/reader/show.js
var tracked = [];
var current = null;
function track() {
  const end = document.documentElement.scrollHeight - innerHeight;
  if (host.bar) host.bar.style.setProperty("--progress", end > 0 ? Math.min(1, scrollY / end).toFixed(4) : "0");
  let found = tracked[0] || null;
  if (end > 0 && scrollY >= end - 2) found = tracked[tracked.length - 1] || null;
  else for (const item of tracked) {
    if (item.heading.getBoundingClientRect().top > 96) break;
    found = item;
  }
  if (found === current) return;
  if (current) current.link.removeAttribute("aria-current");
  current = found;
  if (!current) return;
  current.link.setAttribute("aria-current", "location");
  if (host.toc && host.toc.scrollHeight > host.toc.clientHeight) {
    const top = current.link.offsetTop;
    if (top < host.toc.scrollTop || top > host.toc.scrollTop + host.toc.clientHeight - 40) host.toc.scrollTop = top - host.toc.clientHeight / 3;
  }
}
var tracking = false;
function scheduleTrack() {
  if (tracking) return;
  tracking = true;
  requestAnimationFrame(() => {
    tracking = false;
    track();
  });
}
function show(content) {
  if (host.onShow) host.onShow();
  for (const image of content.querySelectorAll("img[src]")) {
    const url = host.resolveImage(image.getAttribute("src"));
    if (url) image.setAttribute("src", url);
  }
  for (const link of content.querySelectorAll("a[href]")) {
    const url = host.resolveLink(link.getAttribute("href"));
    if (url) link.setAttribute("href", url);
  }
  host.render?.abort();
  host.render = new AbortController();
  host.article.replaceChildren(content);
  const seen = /* @__PURE__ */ new Map();
  const entries = [];
  for (const heading of host.article.querySelectorAll(":is(h1, h2, h3, h4, h5, h6):not(.sr-only)")) {
    const text = heading.textContent.trim();
    let slug = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-") || "section";
    const used = seen.get(slug) || 0;
    seen.set(slug, used + 1);
    if (used) slug += "-" + used;
    heading.id = slug;
    const anchor = document.createElement("a");
    anchor.className = "anchor";
    anchor.href = "#" + slug;
    anchor.textContent = "#";
    anchor.setAttribute("aria-label", "Link to " + text);
    heading.prepend(anchor);
    const level = Number(heading.tagName[1]);
    if (level <= 3) entries.push({ slug, text, level });
  }
  if (host.toc) {
    const list = host.toc.querySelector("ol");
    list.replaceChildren();
    tracked = [];
    current = null;
    const top = Math.min(...entries.map((entry) => entry.level));
    for (const entry of entries) {
      const item = document.createElement("li");
      item.style.paddingLeft = (entry.level - top) * 14 + "px";
      const link = document.createElement("a");
      link.href = "#" + entry.slug;
      link.textContent = entry.text;
      item.append(link);
      list.append(item);
      tracked.push({ heading: document.getElementById(entry.slug), link });
    }
    host.toc.hidden = entries.length < 3;
  }
  frameCode();
  drawDiagrams();
  scheduleTrack();
}
function initShow() {
  addEventListener("scroll", scheduleTrack, { passive: true });
  addEventListener("resize", scheduleTrack);
  if (host.toc) {
    const wide = matchMedia("(min-width:1240px)");
    const openRail = () => {
      if (wide.matches) host.toc.open = true;
    };
    wide.addEventListener("change", openRail);
    openRail();
  }
}

// js/slides.js
var slideAt = -1;
var slideDock = null;
var slideFull = false;
var slideIdle = 0;
var slideReturn = "";
var isHeading = (element2) => /^H[1-6]$/.test(element2.tagName);
function slideGroups() {
  const blocks = [...host.article.children].filter((element2) => !element2.matches(".frontmatter, .frontmatter-raw, .review-gutter"));
  const level = blocks.some((element2) => element2.tagName === "H2") ? "H2" : blocks.filter((element2) => element2.tagName === "H1").length > 1 ? "H1" : "";
  if (!level) return [];
  const groups = [[]];
  for (const element2 of blocks) {
    if (element2.tagName === level && groups[groups.length - 1].length) groups.push([]);
    groups[groups.length - 1].push(element2);
  }
  return groups.filter((group) => group.some((element2) => element2.textContent.trim() || element2.querySelector("img, svg")));
}
var slideStory = () => [...host.article.querySelectorAll(".slide-on .diagram-stage")].map((stage) => stage.diagramPlay).find(Boolean);
function buildDock() {
  slideDock = document.createElement("div");
  slideDock.className = "slide-dock";
  slideDock.innerHTML = '<div class="slide-rail"></div><div class="slide-controls"><button type="button" data-slide="-1" aria-label="Previous slide" title="Previous slide (B)">' + diagramIcon("left") + '</button><span class="slide-count" aria-live="polite"></span><button type="button" data-slide="1" aria-label="Next slide" title="Next slide (N)">' + diagramIcon("right") + "</button>" + (window.aniflowTheme ? '<button type="button" class="slide-theme">' + diagramIcon("theme") + "</button>" : "") + '<button type="button" data-slide="0" aria-label="Leave presentation" title="Leave (Esc)">' + diagramIcon("close") + "</button></div>";
  for (const button of slideDock.querySelectorAll("[data-slide]")) {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.slide);
      direction ? present(slideAt + direction, direction) : stopPresenting();
    });
  }
  const theme = slideDock.querySelector(".slide-theme");
  if (theme) {
    const paint = () => {
      const choice = document.documentElement.dataset.choice;
      const label = "Theme: " + (window.aniflowThemes?.[choice]?.[2] || "Auto");
      theme.title = label;
      theme.setAttribute("aria-label", label + ", change");
    };
    theme.addEventListener("pointerdown", (event) => event.preventDefault());
    theme.addEventListener("click", () => {
      const names = ["auto", ...Object.keys(window.aniflowThemes || {})];
      window.aniflowTheme(names[(names.indexOf(document.documentElement.dataset.choice) + 1) % names.length]);
    });
    addEventListener("aniflow-theme", paint);
    paint();
  }
  document.body.append(slideDock);
}
function paintDock(groups) {
  const rail = slideDock.querySelector(".slide-rail");
  if (rail.childElementCount !== groups.length) {
    rail.replaceChildren(...groups.map((group, index) => {
      const tick = document.createElement("button");
      tick.type = "button";
      const heading = group.find(isHeading);
      tick.title = heading ? heading.textContent.replace(/^#/, "").trim() : "Slide " + (index + 1);
      tick.setAttribute("aria-label", "Slide " + (index + 1) + ": " + tick.title);
      tick.addEventListener("pointerdown", (event) => event.preventDefault());
      tick.addEventListener("click", () => present(index, index - slideAt));
      return tick;
    }));
  }
  [...rail.children].forEach((tick, index) => {
    tick.classList.toggle("done", index < slideAt);
    if (index === slideAt) tick.setAttribute("aria-current", "step");
    else tick.removeAttribute("aria-current");
  });
  slideDock.querySelector(".slide-count").textContent = slideAt + 1 + " / " + groups.length;
}
function present(at, direction) {
  const groups = slideGroups();
  if (!groups.length || at < 0 || at >= groups.length) return false;
  if (slideAt < 0) {
    slideReturn = /^#slide=\d+$/.test(location.hash) ? "" : location.hash;
    document.body.classList.add("presenting");
    if (!slideDock) buildDock();
    host.presentButton?.setAttribute("aria-pressed", "true");
  }
  const leaving = slideStory();
  if (leaving?.playing()) leaving.toggle();
  for (const element2 of host.article.querySelectorAll(":scope > .slide-on")) element2.classList.remove("slide-on");
  for (const element2 of groups[at]) element2.classList.add("slide-on");
  const diagrams2 = groups[at].filter((element2) => element2.matches(".mermaid-diagram, .highlight-source-mermaid"));
  const words = groups[at].filter((element2) => !diagrams2.includes(element2) && !isHeading(element2)).reduce((sum, element2) => sum + element2.textContent.trim().length, 0);
  document.body.classList.toggle("slide-solo", diagrams2.length === 1 && words < 240);
  host.article.classList.remove("slide-enter");
  if (direction && slideAt >= 0) {
    host.article.style.setProperty("--slide-from", (direction > 0 ? 18 : -18) + "px");
    void host.article.offsetWidth;
    host.article.classList.add("slide-enter");
  }
  slideAt = at;
  scrollTo(0, 0);
  history.replaceState(null, "", "#slide=" + (at + 1));
  paintDock(groups);
  slideWake();
  slideAutoplay();
  return true;
}
function slideAutoplay() {
  if (slideAt < 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const setting = readFrontMatter(host.source || "")?.entries?.find((entry) => entry.key === "autoplay");
  if (setting && /^(?:false|no|off)$/i.test(String(setting.value ?? "").trim())) return;
  const story = slideStory();
  if (story && !story.playing() && (story.where().step === null || story.finished())) story.toggle();
}
function slideMove(direction) {
  if (slideStory()?.walk(direction > 0)) return;
  present(slideAt + direction, direction);
}
function stopPresenting() {
  if (slideAt < 0) return;
  const first = host.article.querySelector(":scope > .slide-on");
  for (const element2 of host.article.querySelectorAll(":scope > .slide-on")) element2.classList.remove("slide-on");
  host.article.classList.remove("slide-enter");
  clearTimeout(slideIdle);
  document.body.classList.remove("presenting", "slide-solo", "slide-idle");
  host.presentButton?.setAttribute("aria-pressed", "false");
  slideAt = -1;
  history.replaceState(null, "", location.pathname + location.search + slideReturn);
  slideReturn = "";
  if (slideFull && document.fullscreenElement) document.exitFullscreen().catch(() => {
  });
  slideFull = false;
  first?.scrollIntoView({ block: "start" });
  scheduleTrack();
}
function slideWake() {
  document.body.classList.remove("slide-idle");
  clearTimeout(slideIdle);
  if (slideAt >= 0) slideIdle = setTimeout(() => document.body.classList.add("slide-idle"), 2500);
}
function initSlides() {
  host.onSlideDiagram = slideAutoplay;
  if (host.presentButton) {
    host.presentButton.hidden = slideGroups().length < 2;
    host.presentButton.addEventListener("click", () => {
      if (slideAt >= 0) {
        stopPresenting();
        return;
      }
      let at = 0;
      slideGroups().forEach((group, index) => {
        if (group[0].getBoundingClientRect().top <= 96) at = index;
      });
      if (!present(at)) return;
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        slideFull = true;
        document.documentElement.requestFullscreen().catch(() => {
          slideFull = false;
        });
      }
    });
    const fromHash = () => {
      const wanted = /^#slide=(\d+)$/.exec(location.hash);
      if (wanted && Number(wanted[1]) - 1 !== slideAt) present(Number(wanted[1]) - 1);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement || !slideFull) return;
      slideFull = false;
      stopPresenting();
    });
    addEventListener("pointermove", () => {
      if (slideAt >= 0) slideWake();
    }, { passive: true });
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      if (slideAt < 0) {
        if (event.key === "p" && !host.presentButton.hidden) {
          event.preventDefault();
          host.presentButton.click();
        }
        return;
      }
      if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button")) return;
      const key = event.key;
      if (key === "n" || key === "PageDown" && event.shiftKey) present(slideAt + 1, 1);
      else if (key === "b" || key === "PageUp" && event.shiftKey) present(slideAt - 1, -1);
      else if (key === " " && !event.shiftKey && slideStory()) slideStory().toggle();
      else if (key === "ArrowRight" && !event.shiftKey || key === "PageDown" || key === "j" || key === " " && !event.shiftKey) slideMove(1);
      else if (key === "ArrowLeft" && !event.shiftKey || key === "PageUp" || key === "k" || key === " " && event.shiftKey) slideMove(-1);
      else if ((key === "<" || key === ">") && slideStory()) setDiagramSpeed(key === ">" ? 1 : -1);
      else if (key === "Home") present(0, -1);
      else if (key === "End") present(slideGroups().length - 1, 1);
      else return;
      event.preventDefault();
      event.stopPropagation();
      slideWake();
    }, true);
    addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || slideAt < 0 || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      stopPresenting();
    });
    let swipe = null;
    document.addEventListener("touchstart", (event) => {
      swipe = slideAt >= 0 && event.touches.length === 1 && !event.target.closest(".diagram-stage, pre, table, .slide-dock") ? [event.touches[0].clientX, event.touches[0].clientY] : null;
    }, { passive: true });
    document.addEventListener("touchend", (event) => {
      if (!swipe) return;
      const dx = event.changedTouches[0].clientX - swipe[0], dy = event.changedTouches[0].clientY - swipe[1];
      swipe = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) slideMove(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
}

// js/index.js
var element = (value) => typeof value === "string" ? document.querySelector(value) : value || null;
var none = () => null;
function reader(options = {}) {
  const article = element(options.article || "article.markdown-body");
  if (!article) throw new Error("aniflow: no article element");
  const comments = options.comments || {};
  Object.assign(host, {
    article,
    source: options.source ?? "",
    toc: element(options.toc),
    bar: element(options.bar),
    nonce: options.nonce || "",
    breaks: Boolean(options.breaks),
    callouts: Boolean(options.callouts),
    plugins: options.plugins || [],
    preprocess: options.preprocess || ((text) => text),
    resolveImage: options.resolveImage || none,
    resolveLink: options.resolveLink || none,
    mermaid: options.mermaid || "mermaid.min.js",
    commentsUrl: comments.url || "",
    commentMax: comments.max || 4e3,
    reviewName: comments.name || "Review",
    save: options.save || ((name, blob) => saveBlob(blob, name)),
    reviewToggle: element(options.reviewButton),
    dock: element(options.reviewDock),
    presentButton: element(options.presentButton),
    onShow: null,
    onDiagram: null
  });
  initShow();
  show(renderLocal());
  initSlides();
  initReview();
  let drawnTheme = document.documentElement.dataset.theme;
  addEventListener("aniflow-theme", () => {
    if (document.documentElement.dataset.theme === drawnTheme) return;
    drawnTheme = document.documentElement.dataset.theme;
    host.render?.abort();
    host.render = new AbortController();
    redrawDiagrams();
  });
  if (location.hash && !/^#L\d/.test(location.hash)) {
    let target = null;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch (error) {
    }
    if (target) target.scrollIntoView();
  }
  addEventListener("hashchange", () => {
    for (const stage of article.querySelectorAll(".diagram-stage[data-diagram]")) if (diagramFromHash(stage)) break;
  });
  return {
    // Renders new markdown into the same article, replacing the diagrams already drawn.
    update(source) {
      stopPresenting();
      host.source = source ?? "";
      show(renderLocal());
      if (host.presentButton) host.presentButton.hidden = slideGroups().length < 2;
    }
  };
}
function diagrams(options = {}) {
  const root = element(options.root || document.body);
  if (!root) throw new Error("aniflow: no root element");
  Object.assign(host, {
    article: root,
    nonce: options.nonce || "",
    resolveImage: options.resolveImage || none,
    mermaid: options.mermaid || "mermaid.min.js",
    dark: options.dark || null,
    lazy: options.lazy !== false,
    autoplay: Boolean(options.autoplay),
    commentsUrl: "",
    save: options.save || ((name, blob) => saveBlob(blob, name)),
    onShow: null,
    onDiagram: null,
    onSlideDiagram: null
  });
  const fresh = () => {
    host.render?.abort();
    host.render = new AbortController();
  };
  fresh();
  drawDiagrams();
  addEventListener("hashchange", () => {
    for (const stage of root.querySelectorAll(".diagram-stage[data-diagram]")) if (diagramFromHash(stage)) break;
  });
  return {
    // Draws every diagram again, after the page switched between light and dark.
    redraw() {
      fresh();
      redrawDiagrams();
    }
  };
}
var directoryResolver = (root) => (value) => directoryUrl(value, root);
async function diagramExport(stage, kind) {
  const element2 = stage instanceof Element ? stage : document.querySelector(stage);
  if (!element2) throw new Error("aniflow: no diagram to export");
  if (!["gif", "mp4", "webm", "png"].includes(kind)) throw new Error("aniflow: " + kind + " is not an export kind");
  let result = null;
  if (kind === "png") {
    if (!element2.diagramPicture) throw new Error("aniflow: that diagram is not drawn yet");
    result = await element2.diagramPicture();
  } else {
    if (!element2.diagramExport) throw new Error("aniflow: that diagram has no walkthrough to save");
    result = await element2.diagramExport(kind);
  }
  if (!result) throw new Error("aniflow: the " + kind + " was cancelled");
  return result;
}
export {
  addBusyCheck,
  isBusy as busy,
  diagramExport,
  diagramLines,
  diagrams,
  directoryResolver,
  flowchartLines,
  playScript as parse,
  readFrontMatter,
  reader,
  setDiagramSpeed as setSpeed
};
