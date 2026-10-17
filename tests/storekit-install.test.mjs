import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('StoreKit installer connects the scene root, remains idempotent and rejects unknown roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-storekit-'));
  try {
    const app = join(root, 'mobile/ios/App/App');
    await mkdir(join(app, 'Base.lproj'), { recursive: true });
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'mobile/native'), { recursive: true });
    await cp(new URL('../scripts/install-storekit.mjs', import.meta.url), join(root, 'scripts/install-storekit.mjs'));
    await cp(new URL('../mobile/native/CRStoreKit.swift', import.meta.url), join(root, 'mobile/native/CRStoreKit.swift'));
    await writeFile(join(app, 'AppDelegate.swift'), 'import Capacitor\nclass AppDelegate: UIResponder {}\n');
    await writeFile(join(app, 'Base.lproj/Main.storyboard'), '<viewController customClass="CAPBridgeViewController" customModule="Capacitor"/>');
    await writeFile(join(app, 'SceneDelegate.swift'), 'window?.rootViewController = CAPBridgeViewController()\n');
    const run = () => execFileSync(process.execPath, [join(root, 'scripts/install-storekit.mjs')], { stdio: 'pipe' });
    run();
    const scene = await readFile(join(app, 'SceneDelegate.swift'), 'utf8');
    assert.match(scene, /rootViewController = CRBridgeViewController\(\)/);
    const delegate = await readFile(join(app, 'AppDelegate.swift'), 'utf8');
    assert.match(delegate, /registerPluginInstance\(CRStoreKitPlugin\(\)\)/);
    run();
    assert.equal(await readFile(join(app, 'AppDelegate.swift'), 'utf8'), delegate);
    assert.equal(await readFile(join(app, 'SceneDelegate.swift'), 'utf8'), scene);
    await writeFile(join(app, 'SceneDelegate.swift'), 'window?.rootViewController = UnknownController()\n');
    assert.throws(run, /Unexpected SceneDelegate root controller/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
