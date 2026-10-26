import { readFile, writeFile } from 'node:fs/promises';

// The generated Xcode project already compiles AppDelegate.swift. Append the
// local plugin there, then register its bridge controller in the storyboard.
// Fail closed if Capacitor changes either template; rerunning is idempotent.
const app = new URL('../mobile/ios/App/App/', import.meta.url);
const source = await readFile(new URL('../mobile/native/CRStoreKit.swift', import.meta.url), 'utf8');
const marker = '// BEGIN CALCIO REPORT STOREKIT';
const delegatePath = new URL('AppDelegate.swift', app);
let delegate = await readFile(delegatePath, 'utf8');
if (!delegate.includes('import Capacitor') || !delegate.includes('class AppDelegate:')) throw Error('Unexpected AppDelegate template');
if (delegate.includes(marker)) delegate = delegate.slice(0, delegate.indexOf(marker));
await writeFile(delegatePath, `${delegate.trimEnd()}\n\n${marker}\n${source}`);
const storyboardPath = new URL('Base.lproj/Main.storyboard', app);
let storyboard = await readFile(storyboardPath, 'utf8');
const original = 'customClass="CAPBridgeViewController" customModule="Capacitor"';
const replacement = 'customClass="CRBridgeViewController" customModule="App" customModuleProvider="target"';
if (storyboard.includes(original)) storyboard = storyboard.replace(original, replacement);
else if (!storyboard.includes(replacement)) throw Error('Unexpected bridge storyboard');
await writeFile(storyboardPath, storyboard);
// Capacitor 8 starts its window from SceneDelegate, bypassing Main.storyboard.
// Patch the actual root controller too; fail closed on template changes.
const scenePath = new URL('SceneDelegate.swift', app);
let scene = await readFile(scenePath, 'utf8');
const oldRoot = 'window?.rootViewController = CAPBridgeViewController()';
const newRoot = 'window?.rootViewController = CRBridgeViewController()';
if (scene.split(oldRoot).length === 2) scene = scene.replace(oldRoot, newRoot);
else if (scene.split(newRoot).length !== 2) throw Error('Unexpected SceneDelegate root controller');
await writeFile(scenePath, scene);
console.log('StoreKit bridge installed in generated iOS project.');

await import('./install-app-icon.mjs');
