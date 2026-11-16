import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { diagramExport } = await import('../js/index.js');
const { diagramVideoType } = await import('../js/diagram/share.js');

globalThis.Element = class Element {};

function stageWith(hook) {
  const stage = new globalThis.Element();
  stage.diagramExport = hook;
  return stage;
}

test('diagramExport asks for the kind it was given', async () => {
  const kinds = [];
  const stage = stageWith(async (kind) => {
    kinds.push(kind);
    return { name: 'walk.' + kind, blob: {} };
  });
  assert.equal((await diagramExport(stage, 'mp4')).name, 'walk.mp4');
  assert.equal((await diagramExport(stage, 'webm')).name, 'walk.webm');
  assert.equal((await diagramExport(stage, 'gif')).name, 'walk.gif');
  assert.deepEqual(kinds, ['mp4', 'webm', 'gif']);
  await assert.rejects(() => diagramExport(stage, 'video'), /not an export kind/);
});

test('diagramExport keeps a real failure and reserves null for a cancel', async () => {
  const failed = stageWith(async () => {
    throw new Error('the save failed');
  });
  await assert.rejects(() => diagramExport(failed, 'mp4'), /the save failed/);
  const cancelled = stageWith(async () => null);
  await assert.rejects(() => diagramExport(cancelled, 'gif'), /cancelled/);
});

test('an explicit video format never falls back to the other container', () => {
  const before = {
    MediaRecorder: globalThis.MediaRecorder,
    HTMLCanvasElement: globalThis.HTMLCanvasElement,
  };
  globalThis.HTMLCanvasElement = { prototype: { captureStream() {} } };
  globalThis.MediaRecorder = {
    isTypeSupported: (type) => type.startsWith('video/webm'),
  };
  try {
    assert.equal(diagramVideoType('mp4'), '');
    assert.equal(diagramVideoType('webm'), 'video/webm;codecs=vp9');
    assert.equal(diagramVideoType('video'), 'video/webm;codecs=vp9');
    globalThis.MediaRecorder = { isTypeSupported: (type) => type.startsWith('video/mp4') };
    assert.equal(diagramVideoType('mp4'), 'video/mp4;codecs=avc1.640028');
    assert.equal(diagramVideoType('webm'), '');
    assert.equal(diagramVideoType('video'), 'video/mp4;codecs=avc1.640028');
  } finally {
    globalThis.MediaRecorder = before.MediaRecorder;
    globalThis.HTMLCanvasElement = before.HTMLCanvasElement;
  }
});
