import assert from 'node:assert/strict';
import test from 'node:test';
import { gifWriter } from '../js/diagram/gif.js';

// Reads back the colour of every pixel of each frame's rectangle, so the LZW stream is checked end to end.
function decode(bytes) {
  let at = 13;
  const frames = [];
  while (bytes[at] !== 0x3b) {
    if (bytes[at] === 0x21) {
      at += 2;
      while (bytes[at]) at += bytes[at] + 1;
      at++;
      continue;
    }
    const w = bytes[at + 5] | (bytes[at + 6] << 8);
    const h = bytes[at + 7] | (bytes[at + 8] << 8);
    const packed = bytes[at + 9];
    const size = 2 << (packed & 7);
    const palette = bytes.subarray(at + 10, at + 10 + size * 3);
    at += 10 + size * 3;
    const minimum = bytes[at++];
    const data = [];
    while (bytes[at]) { data.push(...bytes.subarray(at + 1, at + 1 + bytes[at])); at += bytes[at] + 1; }
    at++;
    const clear = 1 << minimum;
    let width = minimum + 1;
    let table = [];
    const reset = () => { table = Array.from({ length: clear + 2 }, (_, i) => [i]); width = minimum + 1; };
    reset();
    const out = [];
    let previous = null;
    let bit = 0;
    for (;;) {
      let code = 0;
      for (let i = 0; i < width; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) { reset(); previous = null; continue; }
      if (code === clear + 1) break;
      const entry = code < table.length ? table[code] : [...previous, previous[0]];
      out.push(...entry);
      if (previous) table.push([...previous, entry[0]]);
      if (table.length === 1 << width && width < 12) width++;
      previous = entry;
    }
    frames.push({ w, h, colours: out.map((i) => [...palette.subarray(i * 3, i * 3 + 3)]) });
  }
  return frames;
}

test('gifWriter round-trips frames and stores only the changed rectangle', async () => {
  const width = 6;
  const height = 4;
  const frame = (paint) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) pixels.set([...paint(i % width, Math.floor(i / width)), 255], i * 4);
    return pixels;
  };
  const red = [248, 0, 0];
  const blue = [0, 0, 248];
  const gif = gifWriter(width, height);
  gif.add(frame((x) => (x < 3 ? red : blue)), 100);
  gif.add(frame((x, y) => (x === 4 && y === 2 ? red : x < 3 ? red : blue)), 100);
  gif.add(frame((x, y) => (x === 4 && y === 2 ? red : x < 3 ? red : blue)), 100);
  const bytes = new Uint8Array(await gif.finish().arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), 'GIF89a');
  const frames = decode(bytes);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].colours.length, width * height);
  assert.deepEqual(frames[0].colours[0], red);
  assert.deepEqual(frames[0].colours[5], blue);
  assert.deepEqual([frames[1].w, frames[1].h], [1, 1]);
  assert.deepEqual(frames[1].colours, [red]);
});
