import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { codeSteps, deckPlugin, deckSettings, pickLayout, slideDirective } from '../js/reader/deck.js';
import { readFrontMatter } from '../js/reader/frontmatter.js';

const vendored = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../src/aniflow/vendor/markdown-it.min.js', import.meta.url), 'utf8'))(vendored, vendored.exports);
const render = (source) => vendored.exports({ html: true }).use(deckPlugin).render(source);

test('slideDirective reads layouts, flags and options from allow lists', () => {
  assert.deepEqual(slideDirective('<!-- slide: layout=columns bg=accent reveal transition=fade story=2 -->'), {
    kind: 'slide',
    options: { layout: 'columns', bg: 'accent', reveal: true, transition: 'fade', story: 2 },
    problems: [],
  });
  assert.deepEqual(slideDirective('<!-- slide: quote flip -->').options, { layout: 'quote', flip: true });
  assert.deepEqual(slideDirective('<!-- slide -->').options, {});
  assert.equal(slideDirective('<!-- slide: bg=./night.png -->').options.image, './night.png');
});

test('slideDirective reports unknown values and refuses unsafe pictures', () => {
  const bad = slideDirective('<!-- slide: layout=hero bg=red() class=x story=0 -->');
  assert.deepEqual(bad.options, {});
  assert.equal(bad.problems.length, 4);
  assert.match(bad.problems[0], /unknown layout: hero/);
  assert.equal(slideDirective('<!-- slide: bg="a b.png" -->').options.image, undefined);
  assert.equal(slideDirective('<!-- slide: bg=javascript:alert(1) -->').options.image, undefined);
  assert.deepEqual(slideDirective('<!-- column: wide -->').problems, ['column takes no options: wide']);
});

test('slideDirective leaves ordinary comments alone and keeps notes', () => {
  assert.equal(slideDirective('<!-- a plain comment -->'), null);
  assert.equal(slideDirective('<!-- slideshow -->'), null);
  assert.equal(slideDirective('<!-- notes are below -->'), null);
  assert.equal(slideDirective('<!-- notes:\nSay **this**.\n-->').notes, 'Say **this**.');
});

test('deckSettings takes presets and reports the rest', () => {
  const front = readFrontMatter('---\naccent: Violet\nfont: comic\nnumbers: yes\nautoplay: off\nlogo: ./logo.svg\naspect: 4:3\ntitle: Talk\n---\n');
  const { settings, problems } = deckSettings(front.entries);
  assert.equal(settings.accent, 'violet');
  assert.equal(settings.font, undefined);
  assert.equal(settings.numbers, true);
  assert.equal(settings.autoplay, false);
  assert.equal(settings.logo, './logo.svg');
  assert.equal(settings.aspect, '4:3');
  assert.equal(settings.title, 'Talk');
  assert.deepEqual(problems, ['font: comic is not one of modern, classic, mono, rounded']);
  assert.match(deckSettings(readFrontMatter('---\nlogo: x(y)\n---\n').entries).problems[0], /logo/);
});

test('codeSteps parses line ranges and rejects anything else', () => {
  assert.deepEqual(codeSteps('1-3|5|all'), [[[1, 3]], [[5, 5]], null]);
  assert.deepEqual(codeSteps('2,4-5'), [[[2, 2], [4, 5]]]);
  assert.equal(codeSteps('3-1'), null);
  assert.equal(codeSteps('0'), null);
  assert.equal(codeSteps('title="x"'), null);
});

test('pickLayout picks a layout from what the slide holds', () => {
  assert.equal(pickLayout({ first: true, heading: 'h1', kinds: ['p'], words: 8 }), 'cover');
  assert.equal(pickLayout({ heading: 'h2', kinds: [] }), 'section');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['quote'] }), 'quote');
  assert.equal(pickLayout({ kinds: ['picture'] }), 'full');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['picture', 'p'], words: 20 }), 'split');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['diagram'] }), 'full');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['p'], stat: true, words: 10 }), 'stat');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['list'], cards: 3 }), 'grid');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['columns', 'p'] }), 'columns');
  assert.equal(pickLayout({ heading: 'h2', kinds: ['p', 'list', 'code'], words: 50 }), 'title');
});

test('deckPlugin splits columns at every mark and keeps notes outside them', () => {
  const html = render('## Two\n\nleft\n\n<!-- column -->\n\nmiddle\n\n<!-- column -->\n\nright\n\n<!-- notes: say it -->\n\n## Next\n');
  const columns = html.slice(html.indexOf('<div class="slide-columns"'), html.indexOf('<aside'));
  assert.match(columns, /data-columns="3"/);
  assert.equal(columns.split('<div class="slide-column">').length - 1, 3);
  assert.ok(columns.indexOf('left') < columns.indexOf('middle') && columns.indexOf('middle') < columns.indexOf('right'));
  assert.match(html, /<aside class="slide-notes"[^>]*><p>say it<\/p>\n<\/aside>/);
  assert.ok(html.indexOf('<h2>Next</h2>') > html.lastIndexOf('</div></div>'));
});

test('deckPlugin escapes problems and adds a cover from front matter', () => {
  const html = render('---\ntitle: A <b> talk\nauthor: Me\n---\n\n<!-- slide: layout=<x> -->\n\n## One\n\n## Two\n');
  assert.match(html, /data-problem="unknown layout: &lt;x&gt;/);
  assert.match(html, /<p class="slide-cover-title">A &lt;b&gt; talk<\/p><p class="slide-cover-byline">Me<\/p>/);
  assert.doesNotMatch(render('# Talk\n\n## One\n'), /slide-autocover/);
});
