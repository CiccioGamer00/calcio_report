import copy
import hashlib
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
spec = importlib.util.spec_from_file_location('delivery', ROOT / 'scripts/prepare-ios-upload.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.plan = delivery.load_plan(ROOT / 'deploy/app-store-candidate.json')
        p = self.plan
        repo = dict(id=p['repositoryId'], full_name=p['repository'])
        self.run = dict(id=p['sourceRunId'], conclusion='success', event='push', head_sha=p['sourceCommit'],
                        head_branch=p['branch'], repository=repo, head_repository=repo)
        self.artifact = dict(id=p['artifactId'], name=p['artifactName'], expired=False, digest=p['artifactDigest'],
                             workflow_run=dict(id=p['sourceRunId'], head_sha=p['sourceCommit'],
                                               repository_id=p['repositoryId'], head_repository_id=p['repositoryId']))

    def candidate(self, backend='https://api.calcioreport.com'):
        p = self.plan
        ipa = self.folder / 'CalcioReport-production.ipa'
        info = dict(CFBundleIdentifier=p['bundleId'], CFBundleVersion=p['build'], CFBundleShortVersionString=p['version'])
        config = dict(baseUrl=backend, headers={}, paymentUrl='', paypalUrl='')
        with zipfile.ZipFile(ipa, 'w') as z:
            z.writestr('Payload/App.app/Info.plist', plistlib.dumps(info))
            z.writestr('Payload/App.app/public/config.js', 'window.API_CONFIG = ' + json.dumps(config) + ';\n')
        metadata = dict(commit=p['sourceCommit'], bundleId=p['bundleId'], version=p['version'], build=p['build'],
                        backend='production', mobileProfile='production', payments='server-gated',
                        externalPayments='disabled', appleUpload=False, appStoreCandidate=True,
                        sha256=hashlib.sha256(ipa.read_bytes()).hexdigest())
        (self.folder / 'build.json').write_text(json.dumps(metadata))
        return metadata

    def test_matching_production_candidate_and_pinned_run_are_accepted(self):
        delivery.validate_source(self.plan, self.run, self.artifact)
        self.candidate()
        self.assertEqual(delivery.verify_candidate(self.plan, self.folder).name, 'CalcioReport-production.ipa')

    def test_failed_run_wrong_branch_fork_and_commit_are_rejected(self):
        for change in [dict(conclusion='failure'), dict(head_branch='main'), dict(head_sha='c' * 40),
                       dict(event='pull_request'), dict(id=1),
                       dict(head_repository=dict(id=9, full_name='other/fork'))]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_source(self.plan, {**self.run, **change}, self.artifact)

    def test_expired_replaced_and_unrelated_artifacts_are_rejected(self):
        for change in [dict(expired=True), dict(id=1), dict(name='internal-ipa'),
                       dict(digest='sha256:' + '0' * 64), dict(workflow_run={})]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_source(self.plan, self.run, {**self.artifact, **change})

    def test_internal_manifest_and_stale_build_never_enter_delivery(self):
        original = self.candidate()
        for change in [dict(backend='review'), dict(mobileProfile='review'), dict(appStoreCandidate=False),
                       dict(appleUpload=True), dict(build='27.1'), dict(commit='a' * 40), dict(appleUpload=0)]:
            (self.folder / 'build.json').write_text(json.dumps({**original, **change}))
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.verify_candidate(self.plan, self.folder)

    def test_tampered_ipa_and_rehashed_wrong_backend_are_rejected(self):
        self.candidate()
        with (self.folder / 'CalcioReport-production.ipa').open('ab') as f:
            f.write(b'tampered')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            delivery.verify_candidate(self.plan, self.folder)
        self.candidate('https://calcio-report-review.stemoro84.workers.dev')
        with self.assertRaisesRegex(ValueError, 'backend'):
            delivery.verify_candidate(self.plan, self.folder)

    def test_upload_cannot_be_requested_by_a_validation_event(self):
        event = self.folder / 'event.json'
        event.write_text(json.dumps(dict(after='b' * 40, head_commit=dict(message='release: validate App Store candidate ' + self.plan['build']))))
        env = {k:v for k,v in os.environ.items() if not k.startswith(('GITHUB_', 'APP_STORE_CONNECT_', 'RUNNER_'))}
        env.update(GITHUB_REPOSITORY=self.plan['repository'], GITHUB_REF='refs/heads/' + self.plan['branch'],
                   GITHUB_EVENT_NAME='push', GITHUB_EVENT_PATH=str(event), GITHUB_SHA='b' * 40, GITHUB_RUN_ATTEMPT='1')
        result = subprocess.run(['bash', 'scripts/apple-app-store.sh', 'upload'], cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Explicit matching delivery request required', result.stderr)
        # The same event may validate, but still cannot access Apple without runner credentials.
        result = subprocess.run(['bash', 'scripts/apple-app-store.sh', 'validate'], cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('macOS runner required', result.stderr)


if __name__ == '__main__':
    unittest.main()
