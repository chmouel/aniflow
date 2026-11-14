import assert from 'node:assert/strict';
import test from 'node:test';
import { directoryUrl } from '../js/reader/render.js';

globalThis.location = new URL('http://127.0.0.1:8792/files/guides/start.md');

test('directoryUrl keeps links under the served root', () => {
  const root = '/files/';
  assert.equal(directoryUrl('other.md#top', root), 'http://127.0.0.1:8792/files/guides/other.md#top');
  assert.equal(directoryUrl('/images/a.svg', root), 'http://127.0.0.1:8792/files/images/a.svg');
  assert.equal(directoryUrl('/files/images/a.svg', root), 'http://127.0.0.1:8792/files/images/a.svg');
  assert.equal(directoryUrl('/icons/agent.svg', root), '/icons/agent.svg');
  assert.equal(directoryUrl('../../etc/passwd', root), null);
  assert.equal(directoryUrl('https://example.com/x', root), null);
  assert.equal(directoryUrl('#section', root), null);
});
