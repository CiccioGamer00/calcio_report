// Allowlisted packaged assets; Sandbox remains the default delivery profile.
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from '../mobile/node_modules/esbuild/lib/main.js';
import { resolveBuildProfile } from '../mobile/src/build-profile.mjs';
import { patchApp } from '../mobile/src/patch-frontend.mjs';
const profile = resolveBuildProfile(process.env.CR_MOBILE_PROFILE);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'mobile/www');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'privacy.html', 'support.html', 'style.css', 'app.js', 'js', 'assets/branding']) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true });
}
await writeFile(path.join(output, 'config.js'), `window.API_CONFIG = ${JSON.stringify({
  baseUrl: profile.baseUrl,
  headers: {}, telegramUrl: '', supportEmail: 'support@calcioreport.com', paymentUrl: '', paypalUrl: ''
}, null, 2)};\n`);
await cp(path.join(root, 'mobile/assets'), path.join(output, 'native'), { recursive: true });
await build({ entryPoints: [path.join(root, 'mobile/src/bootstrap.js')], bundle: true,
  define: { __CR_MOBILE_PROFILE__: JSON.stringify(profile.name) },
  format: 'iife', platform: 'browser', target: 'safari15',
  outfile: path.join(output, 'native/bootstrap.js') });
await writeFile(path.join(output, 'app.js'), patchApp(await readFile(path.join(root, 'app.js'), 'utf8')));
const api = await readFile(path.join(output, 'js/api.js'), 'utf8');
if (!api.includes('localStorage.getItem("CR_TOKEN")')) throw new Error('Native API token hook changed');
await writeFile(path.join(output, 'js/api.js'), api.replace('localStorage.getItem("CR_TOKEN")', 'window.CRSession.token'));
let html = await readFile(path.join(output, 'index.html'), 'utf8');
html = html.replace('<script src="app.js', '<script src="native/bootstrap.js"></script>\n<script src="app.js')
  .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('</head>', '<link rel="stylesheet" href="native/native.css" />\n</head>')
  .replace('</body>', '<script src="native/native.js"></script>\n</body>');
await writeFile(path.join(output, 'index.html'), html);
// Fail packaging if a referenced local entry asset is missing.
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = match[1].split('?')[0];
  if (/^(?:[a-z]+:|\/\/)/i.test(asset)) continue;
  await readFile(path.join(output, asset));
}
console.log(`Mobile ${profile.name} assets packaged; external payment links disabled. Not a release approval.`);
