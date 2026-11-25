import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';

const here = import.meta.dirname;
const out = resolve(here, '.build');

/** Bundle the picture page: the picker's own source over react-native-web. */
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [resolve(here, 'page.tsx')],
  outfile: resolve(out, 'page.js'),
  alias: {
    'react-native': resolve(here, 'shim/react-native.tsx'),
    'react-native-webview': resolve(here, 'shim/react-native-webview.tsx'),
  },
  bundle: true,
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false', global: 'globalThis' },
  format: 'iife',
  jsx: 'automatic',
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
  logLevel: 'warning',
  target: 'es2021',
});
writeFileSync(
  resolve(out, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="stylesheet" href="page.css">' +
    '<style>html,body,#root{height:100%;margin:0}#root{display:flex;overflow:hidden}</style>' +
    '</head><body><div id="root"></div><script src="page.js"></script></body></html>\n',
);
