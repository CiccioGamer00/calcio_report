// Isolated prototype: allowlisted assets, test backend, no production payments.
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'mobile/www');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'js']) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true });
}
await writeFile(path.join(output, 'config.js'), `window.API_CONFIG = ${JSON.stringify({
  baseUrl: 'https://calcio-report-test.stemoro84.workers.dev',
  headers: {}, telegramUrl: '', supportEmail: '', paymentUrl: '', paypalUrl: ''
}, null, 2)};\n`);
await cp(path.join(root, 'mobile/assets'), path.join(output, 'native'), { recursive: true });
let html = await readFile(path.join(output, 'index.html'), 'utf8');
html = html.replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('</head>', '<link rel="stylesheet" href="native/native.css" />\n</head>')
  .replace('</body>', '<script src="native/native.js"></script>\n</body>');
await writeFile(path.join(output, 'index.html'), html);
// Fail packaging if a referenced local entry asset is missing.
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = match[1].split('?')[0];
  if (/^(?:[a-z]+:|\/\/)/i.test(asset)) continue;
  await readFile(path.join(output, asset));
}
console.log('Mobile prototype packaged: isolated API, payment links disabled.');
