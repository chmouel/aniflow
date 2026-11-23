import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'obsidian/dist');

// Wrapped in a function, mermaid.min.js runs only when a diagram needs it and leaves Obsidian's
// window.mermaid alone.
const bundled = {
  name: 'aniflow-bundled',
  setup(build) {
    build.onResolve({ filter: /^aniflow:/ }, (args) => ({ path: args.path, namespace: 'aniflow' }));
    build.onLoad({ filter: /^aniflow:mermaid$/, namespace: 'aniflow' }, () => {
      const script = readFileSync(join(repo, 'src/aniflow/vendor/mermaid.min.js'), 'utf8');
      const tail = /globalThis\["mermaid"\]\s*=\s*globalThis\.__esbuild_esm_mermaid_nm\["mermaid"\]\.default;?\s*$/;
      if (!tail.test(script)) throw new Error('mermaid.min.js does not end the way the wrapper expects');
      const body = script.replace(tail, '').replace(/^"use strict";/, '');
      return { contents: 'export default function () {\nvar __esbuild_esm_mermaid_nm;\n' + body + '\nreturn __esbuild_esm_mermaid_nm.mermaid.default;\n}\n', loader: 'js' };
    });
    build.onLoad({ filter: /^aniflow:icons$/, namespace: 'aniflow' }, () => {
      const folder = join(repo, 'src/aniflow/icons');
      const icons = {};
      for (const name of readdirSync(folder).filter((name) => name.endsWith('.svg')).sort()) {
        icons[name.slice(0, -4)] = 'data:image/svg+xml;base64,' + readFileSync(join(folder, name)).toString('base64');
      }
      return { contents: 'export default ' + JSON.stringify(icons) + ';\n', loader: 'js' };
    });
  },
};

mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(repo, 'obsidian/main.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['obsidian'],
  logLevel: 'error',
  minify: true,
  legalComments: 'none',
  banner: { js: '/* aniflow for Obsidian, Apache-2.0, https://github.com/chmouel/aniflow. Bundles mermaid (MIT). */' },
  plugins: [bundled],
  outfile: join(out, 'main.js'),
});
const css = ['js/css/diagram.css', 'obsidian/obsidian.css'].map((name) => readFileSync(join(repo, name), 'utf8')).join('');
writeFileSync(join(out, 'styles.css'), css);
copyFileSync(join(repo, 'obsidian/manifest.json'), join(out, 'manifest.json'));

const vault = process.argv.indexOf('--vault');
if (vault > 0) {
  const target = join(process.argv[vault + 1], '.obsidian/plugins/aniflow');
  mkdirSync(target, { recursive: true });
  for (const name of ['main.js', 'styles.css', 'manifest.json']) copyFileSync(join(out, name), join(target, name));
  console.log('Installed in ' + target);
}
