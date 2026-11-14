import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontMatter } from '../js/reader/frontmatter.js';

test('readFrontMatter reads keys, lists and the line count', () => {
  const front = readFrontMatter('---\ntitle: "Hi"\ntags:\n  - a\n  - b\n---\n# Body');
  assert.equal(front.lines, 6);
  assert.deepEqual(front.entries.map((entry) => entry.key), ['title', 'tags']);
});

test('readFrontMatter ignores a rule or an unclosed block', () => {
  assert.equal(readFrontMatter('---\n\nJust a rule\n'), null);
  assert.equal(readFrontMatter('---\ntitle: x\n# never closed'), null);
  assert.equal(readFrontMatter('# Title\n---\na: b\n---'), null);
});
