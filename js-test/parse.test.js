import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramLines, playScript, WAIT_MAX } from '../js/diagram/parse.js';

test('diagramLines skips a config block and only takes the asked kinds', () => {
  const source = '---\ntitle: x\n---\nflowchart LR\n  A --> B';
  assert.deepEqual(diagramLines(source, /^flowchart\b/), ['flowchart LR', '  A --> B']);
  assert.equal(diagramLines('pie\n  "a": 1', /^flowchart\b/), null);
});

test('playScript reads stories, moves, captions, skips and waits', () => {
  const source = [
    'flowchart LR',
    '  A --> B',
    '  %% play: First',
    '  %% A -> B : send | the caption',
    '  %% wait 500',
    '  %% A, B -> C @ok',
    '  %% skip D E',
    '  %% wait 200',
  ].join('\n');
  const [story] = playScript(source, 10);
  assert.equal(story.title, 'First');
  assert.equal(story.steps.length, 3);
  const [send, join, skip] = story.steps;
  assert.deepEqual(send.from, [{ name: 'A', edge: '' }]);
  assert.equal(send.label, 'send');
  assert.equal(send.caption, 'the caption');
  assert.equal(send.line, 14);
  assert.deepEqual(join.hold, { ms: 500, caption: '' });
  assert.deepEqual(join.from.map((n) => n.name), ['A', 'B']);
  assert.deepEqual(join.to, [{ name: 'C', edge: 'ok' }]);
  assert.deepEqual(skip.skip, ['D', 'E']);
  assert.deepEqual(story.tail, { ms: 200, caption: '' });
});

test('playScript caps waits, flags bad ones and drops empty stories', () => {
  const stories = playScript('flowchart LR\n%% play: Empty\n%% play: Next\n%% wait soon\n%% wait 99999\n%% A -> B', 0);
  assert.deepEqual(stories.map((s) => s.title), ['Next']);
  const [bad, move] = stories[0].steps;
  assert.match(bad.bad, /milliseconds/);
  assert.equal(move.hold.ms, WAIT_MAX);
});

test('playScript reads sequence diagrams and ignores other kinds', () => {
  assert.equal(playScript('sequenceDiagram\n%% A -> B', 0)[0].title, 'Walkthrough');
  assert.deepEqual(playScript('pie\n%% A -> B', 0), []);
});
