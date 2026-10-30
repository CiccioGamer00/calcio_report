#!/usr/bin/env python3
"""Download one pinned, successful Production artifact and verify it for delivery."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location('ipa_check', Path(__file__).with_name('verify-ios-artifact.py'))
ipa_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa_check)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_plan(path):
    plan = json.loads(Path(path).read_text())
    require(plan.get('repository') == 'CiccioGamer00/calcio_report', 'Wrong source repository')
    require(plan.get('repositoryId') == 1152318922, 'Wrong repository identity')
    require(plan.get('branch') == 'release/apple-production-preparation', 'Wrong source branch')
    for field in ['sourceRunId', 'artifactId']:
        require(type(plan.get(field)) is int and plan[field] > 0, 'Invalid source identifier')
    require(bool(re.fullmatch(r'[a-f0-9]{40}', plan.get('sourceCommit', ''))), 'Invalid source commit')
    require(bool(re.fullmatch(r'sha256:[a-f0-9]{64}', plan.get('artifactDigest', ''))), 'Invalid artifact digest')
    require(bool(re.fullmatch(r'calcio-report-production-ipa-[0-9]+-[0-9]+', plan.get('artifactName', ''))), 'Invalid artifact name')
    require(plan.get('bundleId') == 'com.calcioreport.app', 'Wrong planned bundle')
    require(bool(re.fullmatch(r'[0-9]+\.[0-9]+', plan.get('build', ''))), 'Invalid planned build')
    require(bool(re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,2}', plan.get('version', ''))), 'Invalid planned version')
    return plan


def validate_source(plan, run, artifact):
    require(run.get('id') == plan['sourceRunId'] and run.get('conclusion') == 'success', 'Source run not successful')
    require(run.get('event') == 'push', 'Unexpected source event')
    require(run.get('head_sha') == plan['sourceCommit'] and run.get('head_branch') == plan['branch'], 'Source commit/branch mismatch')
    for field in ['repository', 'head_repository']:
        repo = run.get(field, {})
        require(repo.get('id') == plan['repositoryId'] and repo.get('full_name') == plan['repository'], 'Untrusted source repository')
    require(artifact.get('id') == plan['artifactId'] and artifact.get('name') == plan['artifactName'], 'Wrong source artifact')
    require(artifact.get('expired') is False, 'Expired artifact')
    require(artifact.get('digest') == plan['artifactDigest'], 'Artifact digest mismatch')
    origin = artifact.get('workflow_run', {})
    require(origin.get('id') == plan['sourceRunId'] and origin.get('head_sha') == plan['sourceCommit'], 'Artifact run mismatch')
    require(origin.get('repository_id') == plan['repositoryId'] and origin.get('head_repository_id') == plan['repositoryId'], 'Artifact repository mismatch')


def verify_candidate(plan, root):
    root = Path(root)
    require(sorted(p.name for p in root.glob('*.ipa')) == ['CalcioReport-production.ipa'], 'Expected one Production IPA')
    metadata = json.loads((root / 'build.json').read_text())
    expected = {'commit':plan['sourceCommit'], 'bundleId':plan['bundleId'], 'version':plan['version'],
                'build':plan['build'], 'backend':'production', 'mobileProfile':'production',
                'payments':'server-gated', 'externalPayments':'disabled', 'appleUpload':False, 'appStoreCandidate':True}
    for key, value in expected.items():
        require(type(metadata.get(key)) is type(value) and metadata[key] == value, 'Candidate manifest mismatch: ' + key)
    ipa = root / 'CalcioReport-production.ipa'
    require(metadata.get('sha256') == hashlib.sha256(ipa.read_bytes()).hexdigest(), 'IPA checksum mismatch')
    info = ipa_check.verify_ipa(ipa, 'production', plan['build'])
    require(info.get('CFBundleShortVersionString') == plan['version'], 'Packaged version mismatch')
    return ipa


def api(resource):
    result = subprocess.run(['gh', 'api', resource], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', default='deploy/app-store-candidate.json')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    plan = load_plan(args.plan)
    run = api('repos/' + plan['repository'] + '/actions/runs/' + str(plan['sourceRunId']))
    artifact = api('repos/' + plan['repository'] + '/actions/artifacts/' + str(plan['artifactId']))
    validate_source(plan, run, artifact)
    require(not args.output.exists(), 'Output directory already exists')
    subprocess.run(['gh', 'run', 'download', str(plan['sourceRunId']), '--repo', plan['repository'],
                    '--name', plan['artifactName'], '--dir', str(args.output)], check=True)
    verify_candidate(plan, args.output)
    print('Pinned Production IPA verified: ' + plan['version'] + ' (' + plan['build'] + '). No Apple upload.')


if __name__ == '__main__':
    main()
