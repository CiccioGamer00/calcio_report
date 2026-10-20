import { build } from '../mobile/node_modules/esbuild/lib/main.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../worker/dist/', import.meta.url), { recursive: true });
await build({ entryPoints: [root + 'worker/apple-review-entry.mjs'], bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022',
  outfile: root + 'worker/dist/apple-review-worker.mjs' });
console.log('Review-only bundle created for calcio-report-review. No public-account fallback.');
