import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.window = globalThis;
const { host } = await import('../js/host.js');
const { directoryUrl } = await import('../js/reader/render.js');
const { githubFlavour } = await import('../js/reader/github.js');
const { parseWikilink, wikilinkPlugin } = await import('../js/reader/wikilink.js');
const { slug } = await import('../js/reader/slug.js');

const vendored = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../src/aniflow/vendor/markdown-it.min.js', import.meta.url), 'utf8'))(vendored, vendored.exports);
const markdown = () => vendored.exports({ html: true });

test('parseWikilink splits target, heading and label', () => {
  assert.deepEqual(parseWikilink('Topic'), { target: 'Topic', heading: '', label: '' });
  assert.deepEqual(parseWikilink(' a/Topic # Install | start here '), { target: 'a/Topic', heading: 'Install', label: 'start here' });
  assert.deepEqual(parseWikilink('Topic\\|label'), { target: 'Topic', heading: '', label: 'label' });
  assert.deepEqual(parseWikilink('#Only heading'), { target: '', heading: 'Only heading', label: '' });
});

test('slug names headings the way wikilinks point at them', () => {
  assert.equal(slug('Hello, World!'), 'hello-world');
  assert.equal(slug('  Été  à Paris '), 'été--à-paris');
  assert.equal(slug('???'), 'section');
});

test('wikilinks render from the server map, and missing ones as text', () => {
  host.wikilinks = { Topic: '/files/a/Topic.md', 'flow.png': '/files/a/images/flow.png' };
  const render = (source) => markdown().use(wikilinkPlugin).render(source);
  assert.match(render('[[Topic]]'), /<a class="wikilink" href="\/files\/a\/Topic.md">Topic<\/a>/);
  assert.match(render('[[Topic#Get Started|go]]'), /href="\/files\/a\/Topic.md#get-started">go</);
  assert.match(render('[[#Install]]'), /href="#install">Install</);
  assert.match(render('[[Nope]]'), /<span class="wikilink-missing"[^>]*>Nope<\/span>/);
  assert.match(render('![[flow.png|300]]'), /<img src="\/files\/a\/images\/flow.png" alt="flow.png" width="300">/);
  assert.match(render('[[<b>x</b>]]'), /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(render('`[[Topic]]`'), /wikilink/);
  host.wikilinks = null;
  assert.match(render('[[My Note]]'), /href="My%20Note.md"/);
});

test('fence info gives code a title and marked lines', () => {
  const render = (source) => markdown().use(githubFlavour).render(source);
  const titled = render('```go title="main.go" {2,4-5}\nx\n```\n');
  assert.match(titled, /data-steps="2,4-5"/);
  assert.match(titled, /data-title="main.go"/);
  assert.match(titled, /highlight-source-go/);
  assert.match(render("```title='a <b>.txt'\nx\n```\n"), /<pre class="notranslate"[^>]* data-title="a &lt;b&gt;.txt"><code>/);
  assert.match(render('```{1}\nx\n```\n'), /<pre class="notranslate"[^>]*><code>x/);
});

test('a lone titled picture becomes a figure', () => {
  const render = (source) => markdown().use(githubFlavour).render(source);
  assert.match(render('![Alt](a.png "A <caption>")\n'), /<figure[^>]*><img src="a.png" alt="Alt" title="A &lt;caption&gt;"><figcaption>A &lt;caption&gt;<\/figcaption><\/figure>/);
  assert.match(render('![Alt](a.png)\n'), /<p[^>]*><img/);
  assert.match(render('Text ![Alt](a.png "t")\n'), /<p[^>]*>Text/);
});

test('directoryUrl agrees with the server on which note a link opens', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/note-links.json', import.meta.url), 'utf8'));
  for (const { note, href, base = '', expect } of cases) {
    const root = base + '/files/';
    globalThis.location = new URL('http://127.0.0.1:8792' + root + note.split('/').map(encodeURIComponent).join('/'));
    const url = directoryUrl(href, root, base);
    let found = null;
    if (url && url.startsWith(location.origin)) {
      const path = new URL(url).pathname;
      const rel = decodeURIComponent(path.slice(root.length));
      if (path.startsWith(root) && /\.(?:md|markdown)$/i.test(rel)) found = rel;
    }
    assert.equal(found, expect, `${note} -> ${href}`);
  }
});
