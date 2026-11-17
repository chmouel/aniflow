import assert from 'node:assert/strict';
import test from 'node:test';
import { frontScalar, readFrontMatter, updateFrontMatter } from '../js/reader/frontmatter.js';

test('readFrontMatter reads keys, lists and the line count', () => {
  const front = readFrontMatter('---\ntitle: "Hi"\ntags:\n  - a\n  - b\n---\n# Body');
  assert.equal(front.lines, 6);
  assert.deepEqual(front.entries.map((entry) => entry.key), ['title', 'tags']);
});

test('front matter displays embedded image values compactly', () => {
  assert.equal(frontScalar('data:image/png;base64,YWJj'), 'Embedded image');
});

test('readFrontMatter ignores a rule or an unclosed block', () => {
  assert.equal(readFrontMatter('---\n\nJust a rule\n'), null);
  assert.equal(readFrontMatter('---\ntitle: x\n# never closed'), null);
  assert.equal(readFrontMatter('# Title\n---\na: b\n---'), null);
});

test('updateFrontMatter preserves unrelated text and comments', () => {
  const source = '---\ntitle: A talk\nstyle : keynote # chosen\nfooter: "Hello # friends" # event\nother: [one, two]\n---\n\n## Hello\n';
  const edited = updateFrontMatter(source, { style: 'minimal', footer: 'New', motion: 'none' });
  assert.equal(edited, '---\ntitle: A talk\nstyle: "minimal" # chosen\nfooter: "New" # event\nother: [one, two]\nmotion: "none"\n---\n\n## Hello\n');
  assert.equal(updateFrontMatter('## Hello\n', { style: 'conference' }), '---\nstyle: "conference"\n---\n## Hello\n');
  assert.throws(() => updateFrontMatter('---\nstyle: one\nstyle: two\n---\n', { style: 'minimal' }), /Fix the style/);
  assert.throws(() => updateFrontMatter('---\nstyle: [one, two]\n---\n', { style: 'minimal' }), /Fix the style/);
  assert.throws(() => updateFrontMatter('---\nstyle: keynote\n  continued\n---\n', { style: 'minimal' }), /Fix the style/);
  assert.throws(() => updateFrontMatter('---\nstyle: unfinished\n', { style: 'minimal' }), /Fix the front matter/);
});
