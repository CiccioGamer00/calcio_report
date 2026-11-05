import importlib.util
import plistlib
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('resources', ROOT / 'scripts/verify-ios-release-resources.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResourceTests(unittest.TestCase):
    def candidate(self, folder, remove=None, tracking=False):
        base = 'Payload/App.app/'
        files = {
            'Info.plist': plistlib.dumps({'CFBundleIcons': {'CFBundlePrimaryIcon': {'CFBundleIconName': 'AppIcon', 'CFBundleIconFiles': ['AppIcon60x60']}}}),
            'PrivacyInfo.xcprivacy': (ROOT / 'mobile/native/PrivacyInfo.xcprivacy').read_bytes(),
            'SDK.bundle/PrivacyInfo.xcprivacy': plistlib.dumps({'NSPrivacyTracking': tracking, 'NSPrivacyTrackingDomains': []}),
            'AppIcon60x60@3x.png': b'\x89PNG\r\n\x1a\nsynthetic',
            'Assets.car': b'synthetic catalog',
            'public/privacy.html': (ROOT / 'privacy.html').read_bytes(),
            'public/support.html': (ROOT / 'support.html').read_bytes(),
            'public/index.html': (ROOT / 'index.html').read_bytes(),
        }
        if remove:
            del files[remove]
        path = Path(folder) / 'app.ipa'
        with zipfile.ZipFile(path, 'w') as z:
            for name, data in files.items():
                z.writestr(base + name, data)
        return path

    def test_complete_package(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertTrue(module.verify_resources(self.candidate(folder))['legalPagesMatchSource'])

    def test_missing_manifest_or_icon_resources_rejected(self):
        for name in ['PrivacyInfo.xcprivacy', 'SDK.bundle/PrivacyInfo.xcprivacy', 'Assets.car', 'AppIcon60x60@3x.png']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):
                    module.verify_resources(self.candidate(folder, remove=name))

    def test_sdk_tracking_rejected(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, 'tracking'):
            module.verify_resources(self.candidate(folder, tracking=True))

    def test_outdated_policy_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.candidate(folder)
            with zipfile.ZipFile(path) as z:
                files = {n:z.read(n) for n in z.namelist()}
            files['Payload/App.app/public/privacy.html'] = b'outdated policy'
            with zipfile.ZipFile(path, 'w') as z:
                for n,data in files.items(): z.writestr(n,data)
            with self.assertRaisesRegex(ValueError, 'legal page'):
                module.verify_resources(path)
