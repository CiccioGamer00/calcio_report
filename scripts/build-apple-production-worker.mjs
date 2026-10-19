// Candidate bundle only. Production purchases are source-gated, not deploy-ready.
import { build } from '../mobile/node_modules/esbuild/lib/main.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../worker/dist/', import.meta.url), { recursive: true });
await build({ entryPoints: [root + 'worker/apple-production-entry.mjs'], bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022',
  outfile: root + 'worker/dist/apple-production-candidate.mjs' });
console.log('Production candidate bundled. Apple routes remain disabled: live migration and remote review validation required. Do not deploy.');
