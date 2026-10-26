import importlib.util
import json
import os
import plistlib
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ipa', ROOT / 'scripts/verify-ios-artifact.py')
ipa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def make_ipa(self, profile='production', **changes):
        config = dict(baseUrl=ipa.ORIGINS[profile], headers={}, paymentUrl='', paypalUrl='')
        config.update(changes)
        info = dict(CFBundleIdentifier='com.calcioreport.app', CFBundleVersion='28.1', CFBundleShortVersionString='1.0')
        path = self.root / 'candidate.ipa'
        with zipfile.ZipFile(path, 'w') as z:
            z.writestr('Payload/App.app/Info.plist', plistlib.dumps(info, fmt=plistlib.FMT_BINARY))
            z.writestr('Payload/App.app/public/config.js', 'window.API_CONFIG = ' + json.dumps(config) + ';\n')
        return path

    def test_each_profile_accepts_only_its_own_backend(self):
        for packaged in ipa.ORIGINS:
            path = self.make_ipa(packaged)
            for requested in ipa.ORIGINS:
                with self.subTest(packaged=packaged, requested=requested):
                    if packaged == requested:
                        self.assertEqual(ipa.verify_ipa(path, requested, '28.1')['CFBundleVersion'], '28.1')
                    else:
                        with self.assertRaisesRegex(ValueError, 'backend'):
                            ipa.verify_ipa(path, requested, '28.1')

    def test_payment_urls_and_headers_are_rejected(self):
        for changes in [dict(paymentUrl='https://checkout.example'), dict(paypalUrl='https://paypal.example'), dict(headers={'Authorization': 'unexpected'})]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ipa.verify_ipa(self.make_ipa(**changes), 'production', '28.1')

    def test_wrong_build_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'build number'):
            ipa.verify_ipa(self.make_ipa(), 'production', '27.1')

    def test_backend_mentioned_in_comment_is_not_accepted(self):
        path = self.make_ipa('sandbox')
        with zipfile.ZipFile(path, 'r') as z:
            contents = {name: z.read(name) for name in z.namelist()}
        contents['Payload/App.app/public/config.js'] += b'// https://api.calcioreport.com'
        with zipfile.ZipFile(path, 'w') as z:
            for name, data in contents.items():
                z.writestr(name, data)
        with self.assertRaises(ValueError):
            ipa.verify_ipa(path, 'production', '28.1')

    def test_failure_does_not_retain_artifact(self):
        self.make_ipa('review')
        output = self.root / 'retained'
        result = self.run_cli(output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())

    def run_cli(self, output):
        return subprocess.run(['python3', str(ROOT / 'scripts/verify-ios-artifact.py'), '--export-dir', str(self.root), '--output-dir', str(output), '--profile', 'production', '--commit', 'a' * 40, '--expected-build', '28.1'], capture_output=True, text=True)

    def test_production_manifest_is_not_an_internal_upload_manifest(self):
        self.make_ipa()
        output = self.root / 'retained'
        result = self.run_cli(output)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((output / 'build.json').read_text())
        self.assertEqual(manifest['backend'], 'production')
        self.assertEqual(manifest['payments'], 'server-gated')
        self.assertTrue(manifest['appStoreCandidate'])
        self.assertFalse(manifest['appleUpload'])
        self.assertTrue((output / 'CalcioReport-production.ipa').exists())
        self.assertFalse((output / 'CalcioReport-test.ipa').exists())

    def test_production_signing_cannot_start_without_explicit_candidate_request(self):
        env = {key: value for key, value in os.environ.items() if not key.startswith(('CR_', 'GITHUB_', 'IOS_'))}
        env.update(CR_MOBILE_PROFILE='production', GITHUB_EVENT_NAME='workflow_dispatch', GITHUB_REPOSITORY='CiccioGamer00/calcio_report', GITHUB_REF='refs/heads/release/apple-production-preparation')
        result = subprocess.run(['bash', str(ROOT / 'scripts/check-ios-signing.sh')], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Production IPA requires', result.stderr)

    def test_internal_manifests_preserve_existing_upload_contract(self):
        for profile, backend in [('sandbox', 'test'), ('review', 'review')]:
            with self.subTest(profile=profile):
                self.make_ipa(profile)
                output = self.root / profile
                result = subprocess.run(['python3', str(ROOT / 'scripts/verify-ios-artifact.py'), '--export-dir', str(self.root), '--output-dir', str(output), '--profile', profile, '--commit', 'a' * 40, '--expected-build', '28.1'], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                manifest = json.loads((output / 'build.json').read_text())
                self.assertEqual(manifest['backend'], backend)
                self.assertEqual(manifest['payments'], 'disabled')
                self.assertEqual(manifest['mobileProfile'], profile)
                self.assertFalse(manifest['appStoreCandidate'])
                self.assertTrue((output / 'CalcioReport-test.ipa').exists())

    def test_export_options_separate_internal_testing_and_store_candidate(self):
        source = (ROOT / 'scripts/check-ios-signing.sh').read_text()
        export_script = source.split("python3 - <<'PYEXPORT'\n", 1)[1].split('\nPYEXPORT', 1)[0]
        (self.root / 'identity').write_text('synthetic-certificate')
        (self.root / 'uuid').write_text('synthetic-profile')
        for kind, internal in [('test', True), ('production', False)]:
            with self.subTest(kind=kind):
                env = dict(os.environ, SIGN_DIR=str(self.root), CR_IOS_CANDIDATE_KIND=kind)
                result = subprocess.run(['python3', '-c', export_script], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                options = plistlib.loads((self.root / 'export-options.plist').read_bytes())
                self.assertIs(options['testFlightInternalTestingOnly'], internal)
                self.assertEqual(options['destination'], 'export')


if __name__ == '__main__':
    unittest.main()
