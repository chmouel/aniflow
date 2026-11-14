// The playground: a textarea whose Markdown is rendered by the aniflow library as you type.
const examples = [
  {
    name: 'Tour (slides)',
    source: `# A tour of aniflow

Press **Present** or <kbd>P</kbd>, then use the arrow keys. Each \`##\` heading is a slide, and on a slide with a diagram the arrows walk its story first.

Everything here is the Markdown on the left. Change a line and the preview follows.

## A story

\`\`\`mermaid
flowchart LR
  I@{ img: "/icons/issue.svg", label: "Issue", w: 56, h: 56, constraint: "on" }
  A@{ img: "/icons/agent.svg", label: "Agent", w: 56, h: 56, constraint: "on" }
  M@{ img: "/icons/model.svg", label: "Model", w: 56, h: 56, constraint: "on" }
  P@{ img: "/icons/pipeline.svg", label: "CI", w: 56, h: 56, constraint: "on" }
  S@{ img: "/icons/release.svg", label: "Release", w: 56, h: 56, constraint: "on" }
  I --> A
  A <--> M
  A --> P --> S

%% play: Ship a fix
%% I -> A : #42 | A reader reports that exports crop the last row.
%% A -> M : prompt | The agent asks the model for a patch.
%% M -> A : diff | The model answers with a two-line fix.
%% A -> P : PR | CI runs the tests on the pull request.
%% P -> S : green | Everything passes and the fix ships.
\`\`\`

Labels ride on the dot. Captions show under the diagram.

## Fan out, then meet

\`\`\`mermaid
flowchart LR
  C@{ img: "/icons/commit.svg", label: "Commit", w: 52, h: 52, constraint: "on" }
  T@{ img: "/icons/test.svg", label: "Tests", w: 52, h: 52, constraint: "on" }
  L@{ img: "/icons/inspect.svg", label: "Lint", w: 52, h: 52, constraint: "on" }
  B@{ img: "/icons/build.svg", label: "Build", w: 52, h: 52, constraint: "on" }
  G@{ img: "/icons/merge.svg", label: "Merge", w: 52, h: 52, constraint: "on" }
  C --> T & L & B
  T & L & B --> G

%% play: Checks
%% C -> T, L, B | One push starts three jobs at once.
%% T, L, B -> G | Each finishes at its own pace, then they meet.
\`\`\`

\`A -> B, C\` sends one dot down each edge. \`A, B -> C\` brings them together.

## Two stories, skip and wait

\`\`\`mermaid
flowchart LR
  G@{ img: "/icons/repository.svg", label: "Repo", w: 48, h: 48, constraint: "on" }
  B@{ img: "/icons/pipeline.svg", label: "Build", w: 48, h: 48, constraint: "on" }
  C@{ img: "/icons/cluster.svg", label: "Cluster", w: 48, h: 48, constraint: "on" }
  U@{ img: "/icons/users.svg", label: "Users", w: 48, h: 48, constraint: "on" }
  W@{ img: "/icons/alert.svg", label: "Alert", w: 48, h: 48, constraint: "on" }
  G --> B --> C --> U
  C --> W --> G

%% play: Deploy
%% skip W | The alert has no part in a good deploy.
%% G -> B : v2 | A tag starts the build.
%% B -> C : image | The new image rolls out.
%% C -> U | Users get version 2.
%% wait 1200

%% play: Roll back
%% C -> U, W : 500s | Users hit errors and the alert fires.
%% W -> G : revert | Someone reverts the tag.
%% G -> B : v1
%% B -> C : v1
%% C -> U | Version 1 is back.
\`\`\`

Pick the story from the menu in the diagram toolbar.

## Pick an edge by its id

\`\`\`mermaid
flowchart LR
  P@{ img: "/icons/pipeline.svg", label: "Run", w: 52, h: 52, constraint: "on" }
  R@{ img: "/icons/report.svg", label: "Report", w: 52, h: 52, constraint: "on" }
  T@{ img: "/icons/notification.svg", label: "Team", w: 52, h: 52, constraint: "on" }
  P ok@-->|pass| R
  P bad@-->|flaky| R
  R --> T

%% play: Retry
%% P -> R @bad : red | A flaky test fails the first run.
%% P -> R @ok : green | The retry passes.
%% R -> T | The team gets one clean report.
\`\`\`

Two edges join the same boxes, so each step names the one it takes.

## Sequence diagrams

\`\`\`mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub
  participant CI
  Dev->>GH: push
  GH->>CI: webhook
  CI->>GH: status
  GH->>Dev: notification

%% play: Push
%% Dev -> GH | You push a commit.
%% GH -> CI : event | GitHub tells CI about it.
%% CI -> GH : green | The result goes back to GitHub.
%% GH -> Dev | You get a notification.
\`\`\`

## Plain Markdown works too

| Key | Does |
| --- | --- |
| Arrows | step the story, then the slides |
| Space | play or pause |
| < and > | slower or faster |
| Esc | leave |

- [x] tables and task lists
- [x] GitHub alerts and code blocks

> [!TIP]
> Click a box in a diagram to spotlight it and its neighbours.

## Your turn

Edit the text on the left, or pick another example. **Copy link** gives you a link with your text inside it, and the diagram's share button saves a PNG, GIF or video.

On your own machine, the \`aniflow\` command serves a folder of Markdown files the same way.
`,
  },
  {
    name: 'Ship a fix',
    source: `# Ship a fix

A bug report goes from issue to release. Press play.

\`\`\`mermaid
flowchart LR
  I@{ img: "/icons/issue.svg", label: "Issue", w: 56, h: 56, constraint: "on" }
  A@{ img: "/icons/agent.svg", label: "Agent", w: 56, h: 56, constraint: "on" }
  M@{ img: "/icons/model.svg", label: "Model", w: 56, h: 56, constraint: "on" }
  P@{ img: "/icons/pipeline.svg", label: "CI", w: 56, h: 56, constraint: "on" }
  R@{ img: "/icons/reviewer.svg", label: "Review", w: 56, h: 56, constraint: "on" }
  S@{ img: "/icons/release.svg", label: "Release", w: 56, h: 56, constraint: "on" }
  I --> A
  A <--> M
  A --> P --> R --> S

%% play: Ship a fix
%% I -> A : #42 | A reader reports that exports crop the last row.
%% A -> M : prompt | The agent asks the model for a patch.
%% M -> A : diff | The model answers with a two-line fix.
%% A -> P : PR | The agent opens a pull request and CI runs the tests.
%% P -> R : green | Every check passes, so a reviewer takes a look.
%% R -> S : merge | The fix is merged and goes out in the next release.
%% wait 1500
\`\`\`
`,
  },
  {
    name: 'Two stories',
    source: `# Deploy and roll back

One diagram, two stories. Pick one from the menu in the toolbar.

\`\`\`mermaid
flowchart LR
  G@{ img: "/icons/repository.svg", label: "Repo", w: 48, h: 48, constraint: "on" }
  B@{ img: "/icons/pipeline.svg", label: "Build", w: 48, h: 48, constraint: "on" }
  C@{ img: "/icons/cluster.svg", label: "Cluster", w: 48, h: 48, constraint: "on" }
  U@{ img: "/icons/user.svg", label: "Users", w: 48, h: 48, constraint: "on" }
  W@{ img: "/icons/alert.svg", label: "Alert", w: 48, h: 48, constraint: "on" }
  G --> B --> C --> U
  C --> W --> G

%% play: Deploy
%% skip W
%% G -> B : v2 | A tag starts the build.
%% B -> C : image | The new image rolls out.
%% C -> U | Users get version 2.
%% wait 1000

%% play: Roll back
%% C -> U, W : 500s | Users hit errors and the alert fires.
%% W -> G : revert | Someone reverts the tag.
%% G -> B : v1
%% B -> C : v1
%% C -> U | Version 1 is back for everyone.
\`\`\`
`,
  },
  {
    name: 'Sequence diagram',
    source: `# A push, step by step

\`\`\`mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub
  participant CI
  Dev->>GH: push
  GH->>CI: webhook
  CI->>GH: status
  GH->>Dev: notification

%% play: Push
%% Dev -> GH | You push a commit.
%% GH -> CI : event | GitHub tells CI about it.
%% CI -> GH : green | The check result goes back to GitHub.
%% GH -> Dev | You get a notification.
\`\`\`
`,
  },
];

const textarea = document.getElementById('source');
const picker = document.getElementById('example');
const shareButton = document.getElementById('share');
const status = document.getElementById('status');
const draftKey = 'aniflow-try';

for (const [index, example] of examples.entries()) picker.add(new Option(example.name, String(index)));
const own = new Option('Your text', '');
own.disabled = true;
picker.add(own);

// Problems from the preview, listed under the editor with document line numbers and marked in it.
const marks = document.getElementById('marks');
const problemsBox = document.getElementById('problems');
const preview = document.getElementById('preview');
const counter = document.getElementById('problem-count');
counter.addEventListener('click', () => {
  if (problems.length) gotoLine(problems[0].line);
  problemsBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

function mermaidProblem(block) {
  const raw = block.title.replace(/^Mermaid: /, '');
  const start = Number(block.dataset.line) || 1;
  const lines = block.textContent.replace(/\n$/, '').split('\n');
  const lastLine = Math.max(1, lines.findLastIndex((line) => line.trim()) + 1);
  const firstLine = Math.max(1, lines.findIndex((line) => line.trim()) + 1);
  let at = Number(/on line (\d+)/.exec(raw)?.[1]) || firstLine;
  let message = raw.split('\n')[0];
  if (/No diagram type detected/i.test(raw)) {
    at = firstLine;
    message = 'The first line has to name the diagram, such as flowchart LR or sequenceDiagram.';
  } else if (/got 'EOF'/.test(raw)) {
    at = lastLine;
    message = 'The diagram stops in the middle of a statement, such as an arrow with nothing after it.';
  } else if (/^Parse error/.test(raw)) {
    const [, context = '', caret = ''] = raw.split('\n');
    const near = context.slice(caret.indexOf('^')).trim().split(/\s+/)[0];
    message = 'Mermaid cannot read this line' + (caret.includes('^') && near ? ', near ' + near + '.' : '.');
  } else if (/^Lexical error/.test(raw)) {
    message = 'Mermaid does not recognise some of the text on this line.';
  }
  at = Math.min(at, lastLine);
  // Mermaid skips blank and %% lines, so an error reported on one belongs to the statement before it.
  while (at > 1 && /^\s*(%%.*)?$/.test(lines[at - 1])) at -= 1;
  return { line: start + at, kind: 'error', message, raw, block };
}

function collectProblems() {
  const found = [];
  for (const block of preview.querySelectorAll('.highlight-source-mermaid[title^="Mermaid:"]')) found.push(mermaidProblem(block));
  for (const item of preview.querySelectorAll('.diagram-problems li[data-line]')) {
    const story = item.querySelector('small')?.textContent.split(' · ')[0];
    found.push({ line: Number(item.dataset.line), kind: 'warn', message: item.querySelector('span')?.textContent + (story ? ' (story "' + story + '")' : '') });
  }
  for (const holder of preview.querySelectorAll('.mermaid-diagram[title*="Pictures not shown"]')) {
    found.push({ line: Number(holder.dataset.line) || 1, kind: 'warn', message: holder.title.trim() + '.' });
  }
  return found.sort((a, b) => a.line - b.line);
}

function gotoLine(line) {
  const lines = textarea.value.split('\n');
  const begin = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(begin, begin + (lines[line - 1] || '').length);
  const style = getComputedStyle(textarea);
  textarea.scrollTop = Math.max(0, (line - 1) * parseFloat(style.lineHeight) - textarea.clientHeight / 3);
  if (textarea.getBoundingClientRect().top < 0) textarea.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function lineButton(line) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'try-line';
  button.textContent = 'Line ' + line;
  button.addEventListener('click', () => gotoLine(line));
  return button;
}

function drawMarks(problems) {
  const style = getComputedStyle(textarea);
  const height = parseFloat(style.lineHeight);
  const top = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
  marks.replaceChildren(...problems.map((problem) => {
    const band = document.createElement('div');
    band.className = 'try-mark ' + problem.kind;
    band.style.top = top + (problem.line - 1) * height - textarea.scrollTop + 'px';
    band.style.height = height + 'px';
    return band;
  }));
}
textarea.addEventListener('scroll', () => { if (marks.childElementCount) drawMarks(problems); });

let problems = [];
function showProblems() {
  problems = collectProblems();
  drawMarks(problems);
  problemsBox.hidden = !problems.length;
  counter.hidden = !problems.length;
  counter.textContent = problems.length === 1 ? '1 problem' : problems.length + ' problems';
  counter.classList.toggle('error', problems.some((problem) => problem.kind === 'error'));
  problemsBox.classList.remove('stale');
  if (!problems.length) {
    problemsBox.replaceChildren();
    return;
  }
  const errors = problems.filter((problem) => problem.kind === 'error').length;
  const head = document.createElement('p');
  head.className = 'try-problems-head';
  head.textContent = problems.length === 1 ? '1 problem' : problems.length + ' problems';
  if (errors) head.textContent += errors === problems.length ? '' : ', ' + errors + ' stopping a diagram from drawing';
  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    item.className = problem.kind;
    const text = document.createElement('span');
    text.textContent = problem.message;
    item.append(lineButton(problem.line), text);
    if (problem.raw) {
      const more = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Mermaid says';
      const pre = document.createElement('pre');
      pre.textContent = problem.raw;
      more.append(summary, pre);
      item.append(more);
    }
    list.append(item);
  }
  problemsBox.replaceChildren(head, list);
  for (const problem of problems) {
    if (!problem.block || problem.block.nextElementSibling?.classList.contains('try-error')) continue;
    const note = document.createElement('p');
    note.className = 'try-error';
    note.append(lineButton(problem.line), document.createTextNode(' ' + problem.message));
    problem.block.after(note);
  }
}

let settle = 0;
new MutationObserver((records) => {
  if (records.every((record) => [...record.addedNodes].every((node) => node.classList?.contains('try-error')))) return;
  clearTimeout(settle);
  settle = setTimeout(showProblems, 150);
}).observe(preview, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

const page = Aniflow.reader({
  article: '#preview',
  source: '',
  mermaid: '../lib/vendor/mermaid.min.js',
  resolveImage: (url) => (url.startsWith('/icons/') ? '../lib' + url : null),
  presentButton: '#present',
});

let shown = null;
function render() {
  if (textarea.value === shown) return;
  shown = textarea.value;
  page.update(shown);
}

let timer = 0;
textarea.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(render, 400);
  problemsBox.classList.add('stale');
  marks.replaceChildren();
  const index = examples.findIndex((example) => example.source === textarea.value);
  picker.value = index < 0 ? '' : String(index);
  try { localStorage.setItem(draftKey, textarea.value); } catch (error) { /* private mode */ }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

// Tab indents. After Escape, Tab moves focus on as usual, so the editor is not a keyboard trap.
let leaving = false;
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { leaving = true; return; }
  if (event.key !== 'Tab' || leaving || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    leaving = false;
    return;
  }
  event.preventDefault();
  textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.dispatchEvent(new Event('input'));
});
textarea.addEventListener('blur', () => { leaving = false; });

function load(text) {
  textarea.value = text;
  render();
}

picker.addEventListener('change', () => {
  const example = examples[Number(picker.value)];
  const edited = !examples.some((item) => item.source === textarea.value);
  if (edited && !confirm('Replace your text with the "' + example.name + '" example?')) {
    picker.value = '';
    return;
  }
  load(example.source);
  try { localStorage.removeItem(draftKey); } catch (error) { /* private mode */ }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

// Links carry the text deflated and base64url encoded in #src=, so they stay short and need no server.
const bytesToBase64Url = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const base64UrlToBytes = (text) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

async function encode(text) {
  return bytesToBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}
async function decode(value) {
  return new TextDecoder().decode(await pipe(base64UrlToBytes(value), new DecompressionStream('deflate-raw')));
}

function say(text) {
  status.textContent = text;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { status.textContent = ''; }, 4000);
}

if (window.CompressionStream && window.DecompressionStream) {
  shareButton.hidden = false;
  shareButton.addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#src=' + await encode(textarea.value);
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      say(url.length > 8000 ? 'Link copied. It is long, so some chat apps may cut it.' : 'Link copied.');
    } catch (error) {
      say('The link is in the address bar.');
    }
  });
}

async function fromHash() {
  const match = /^#src=([\w-]+)$/.exec(location.hash);
  if (!match || !window.DecompressionStream) return false;
  try {
    load(await decode(match[1]));
    picker.value = '';
    return true;
  } catch (error) {
    say('That link could not be read.');
    return false;
  }
}
addEventListener('hashchange', fromHash);

(async () => {
  if (await fromHash()) return;
  let draft = null;
  try { draft = localStorage.getItem(draftKey); } catch (error) { /* private mode */ }
  if (draft) {
    load(draft);
    picker.value = '';
  } else {
    load(examples[0].source);
  }
})();
