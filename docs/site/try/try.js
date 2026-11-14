// The playground: a textarea whose Markdown is rendered by the aniflow library as you type.
const examples = [
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

// The reader only puts a Mermaid error in the block's tooltip; here it is written out under the block.
new MutationObserver(() => {
  for (const block of document.querySelectorAll('#preview .highlight-source-mermaid[title^="Mermaid:"]')) {
    if (block.nextElementSibling?.classList.contains('try-error')) continue;
    const note = document.createElement('p');
    note.className = 'try-error';
    note.textContent = block.title;
    block.after(note);
  }
}).observe(document.getElementById('preview'), { subtree: true, attributes: true, attributeFilter: ['title'] });

const page = Aniflow.reader({
  article: '#preview',
  source: '',
  mermaid: '../lib/vendor/mermaid.min.js',
  resolveImage: (url) => (url.startsWith('/icons/') ? '../lib' + url : null),
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
