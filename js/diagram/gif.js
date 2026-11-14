// An animated GIF: each frame stores only the rectangle that changed, with its own palette of
// the 256 most common colours (5 bits per channel), and the rest mapped to the nearest one.
export function gifWriter(width, height) {
  const parts = [];
  const bytes = (...values) => parts.push(Uint8Array.from(values));
  const word = (value) => [value & 255, (value >> 8) & 255];
  const ascii = (text) => [...text].map((letter) => letter.charCodeAt(0));
  bytes(...ascii('GIF89a'), ...word(width), ...word(height), 0, 0, 0);
  bytes(0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0);
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
        const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
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
    return { palette: palette, indices: indices, bits: bits };
  }

  function lzw(indices, minimum) {
    const out = [];
    const clear = 1 << minimum;
    const stop = clear + 1;
    let size = minimum + 1;
    let next = stop + 1;
    let dictionary = new Map();
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
      const key = (prefix << 8) | symbol;
      const known = dictionary.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        dictionary.set(key, next++);
        if (next > 1 << size && size < 12) size++;
      } else {
        emit(clear);
        dictionary = new Map();
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
    bytes(0x21, 0xf9, 4, 0x04, ...word(delay), 0, 0);
    bytes(0x2c, ...word(frame.rect.x), ...word(frame.rect.y), ...word(frame.rect.w), ...word(frame.rect.h), 0x80 | (bits - 1));
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
      pending = { pixels: pixels, rect: rect, delay: delay };
      previous = pixels;
    },
    finish() {
      if (pending) write(pending);
      pending = null;
      bytes(0x3b);
      return new Blob(parts, { type: 'image/gif' });
    },
  };
}
