import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const icon = new URL('../assets/branding/calcio-report-icon.png', import.meta.url);
const catalog = new URL('../mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/', import.meta.url);
const png = await readFile(icon);
// Pin the verified approved asset: header checks alone miss truncated PNGs.
if (createHash('sha256').update(png).digest('hex') !==
    '94afebb60b7aee26f656f9dcd34ff0ae8997ff621ee9c9b874a9f5859edd8ad1') {
  throw Error('App icon integrity check failed');
}
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== 1024 || png.readUInt32BE(20) !== 1024 ||
    png[24] !== 8 || png[25] !== 2) throw Error('App icon must be opaque RGB PNG, 1024x1024');
const contentsURL = new URL('Contents.json', catalog);
const contents = JSON.parse(await readFile(contentsURL, 'utf8'));
if (!Array.isArray(contents.images)) throw Error('Unexpected AppIcon catalog');
await copyFile(icon, new URL('CalcioReport.png', catalog));
await writeFile(contentsURL, JSON.stringify({
  images: [{ filename: 'CalcioReport.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 }
}, null, 2) + '\n');
console.log('Calcio Report app icon installed: opaque RGB 1024x1024.');
