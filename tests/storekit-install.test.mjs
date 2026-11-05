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
    for (const script of ['install-app-icon.mjs', 'install-privacy-manifest.mjs']) {
      await cp(new URL('../scripts/' + script, import.meta.url), join(root, 'scripts', script));
    }
    await cp(new URL('../mobile/native/PrivacyInfo.xcprivacy', import.meta.url), join(root, 'mobile/native/PrivacyInfo.xcprivacy'));
    await mkdir(join(root, 'assets/branding'), { recursive: true });
    await cp(new URL('../assets/branding/calcio-report-icon.png', import.meta.url), join(root, 'assets/branding/calcio-report-icon.png'));
    const catalog = join(app, 'Assets.xcassets/AppIcon.appiconset');
    await mkdir(catalog, { recursive: true });
    await writeFile(join(catalog, 'Contents.json'), '{"images":[]}');
    const project = join(root, 'mobile/ios/App/App.xcodeproj/project.pbxproj');
    await mkdir(join(root, 'mobile/ios/App/App.xcodeproj'), { recursive: true });
    await writeFile(project, '/* Begin PBXBuildFile section */\n/* Begin PBXFileReference section */\n\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n');
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
    const installedProject = await readFile(project, 'utf8');
    assert.equal(installedProject.split('CACA00000000000000000001').length, 4);
    assert.equal(installedProject.split('CACA00000000000000000002').length, 3);
    assert.deepEqual(await readFile(join(app, 'PrivacyInfo.xcprivacy')), await readFile(join(root, 'mobile/native/PrivacyInfo.xcprivacy')));
    assert.deepEqual(await readFile(join(catalog, 'CalcioReport.png')), await readFile(join(root, 'assets/branding/calcio-report-icon.png')));
    run();
    assert.equal(await readFile(join(app, 'AppDelegate.swift'), 'utf8'), delegate);
    assert.equal(await readFile(join(app, 'SceneDelegate.swift'), 'utf8'), scene);
    assert.equal(await readFile(project, 'utf8'), installedProject);
    await writeFile(join(app, 'SceneDelegate.swift'), 'window?.rootViewController = UnknownController()\n');
    assert.throws(run, /Unexpected SceneDelegate root controller/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
