// Builds the reader library into src/aniflow/static/, which ships in the Python package.
// With --check it builds to a temporary folder and fails when the committed files differ.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const committed = 'src/aniflow/static';
const check = process.argv.includes('--check');
const out = check ? mkdtempSync(join(tmpdir(), 'aniflow-')) : committed;
const banner = { js: '/* aniflow, Apache-2.0, https://github.com/chmouel/aniflow */' };

await build({ entryPoints: ['js/index.js'], bundle: true, format: 'iife', globalName: 'Aniflow', minify: true, target: 'es2022', outfile: join(out, 'aniflow.min.js'), banner, legalComments: 'none' });
await build({ entryPoints: ['js/index.js'], bundle: true, format: 'esm', target: 'es2022', outfile: join(out, 'aniflow.esm.js'), banner });
const css = (names) => names.map((name) => readFileSync(join('js/css', name), 'utf8')).join('');
writeFileSync(join(out, 'aniflow.css'), css(['markdown.css', 'diagram.css', 'reader.css']));
writeFileSync(join(out, 'aniflow-diagrams.css'), css(['diagram.css']));
writeFileSync(join(out, 'page.css'), css(['page.css']));

if (check) {
  const stale = readdirSync(out).filter((name) => {
    try { return readFileSync(join(out, name), 'utf8') !== readFileSync(join(committed, name), 'utf8'); } catch { return true; }
  });
  rmSync(out, { recursive: true });
  if (stale.length) {
    console.error('Out of date, run npm run build: ' + stale.join(', '));
    process.exit(1);
  }
}
