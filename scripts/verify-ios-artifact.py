#!/usr/bin/env python3
"""Verify the exported IPA before retaining it; never contact Apple."""
import argparse
import hashlib
import json
import plistlib
import re
import shutil
import zipfile
from pathlib import Path

ORIGINS = {
    'sandbox': 'https://calcio-report-test.stemoro84.workers.dev',
    'review': 'https://calcio-report-review.stemoro84.workers.dev',
    'production': 'https://api.calcioreport.com',
}


def verify_ipa(ipa, profile, expected_build):
    if profile not in ORIGINS:
        raise ValueError('Unknown mobile profile')
    with zipfile.ZipFile(ipa) as archive:
        names = archive.namelist()
        infos = [name for name in names if re.fullmatch(r'Payload/[^/]+/Info\.plist', name)]
        if len(infos) != 1:
            raise ValueError('Expected one main app Info.plist')
        info = plistlib.loads(archive.read(infos[0]))
        if info.get('CFBundleIdentifier') != 'com.calcioreport.app':
            raise ValueError('Wrong app bundle')
        if info.get('CFBundleVersion') != expected_build:
            raise ValueError('Wrong app build number')
        if not isinstance(info.get('CFBundleShortVersionString'), str) or not info['CFBundleShortVersionString']:
            raise ValueError('Missing app version')
        config_path = infos[0].removesuffix('Info.plist') + 'public/config.js'
        if names.count(config_path) != 1:
            raise ValueError('Expected one packaged API configuration')
        source = archive.read(config_path).decode('utf-8')
        match = re.fullmatch(r'\s*window\.API_CONFIG\s*=\s*(\{.*\})\s*;\s*', source, re.S)
        if not match:
            raise ValueError('Invalid packaged API configuration')
        config = json.loads(match[1])
        if config.get('baseUrl') != ORIGINS[profile]:
            raise ValueError('Wrong packaged backend')
        if config.get('paymentUrl') != '' or config.get('paypalUrl') != '':
            raise ValueError('External payment links must be disabled')
        if config.get('headers') != {}:
            raise ValueError('Unexpected packaged API headers')
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-dir', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--profile', required=True, choices=ORIGINS)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--expected-build', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
        raise ValueError('Invalid source commit')
    ipas = list(args.export_dir.glob('*.ipa'))
    if len(ipas) != 1:
        raise ValueError('Expected one exported IPA')
    info = verify_ipa(ipas[0], args.profile, args.expected_build)
    production = args.profile == 'production'
    # Do not leave a retained artifact or manifest if any verification failed.
    args.output_dir.mkdir(exist_ok=False)
    target = args.output_dir / ('CalcioReport-production.ipa' if production else 'CalcioReport-test.ipa')
    shutil.copyfile(ipas[0], target)
    metadata = {
        'commit': args.commit, 'bundleId': info['CFBundleIdentifier'],
        'version': info['CFBundleShortVersionString'], 'build': info['CFBundleVersion'],
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'backend': 'production' if production else 'review' if args.profile == 'review' else 'test',
        'mobileProfile': args.profile,
        'payments': 'server-gated' if production else 'disabled',
        'externalPayments': 'disabled', 'appleUpload': False,
        'appStoreCandidate': production,
    }
    (args.output_dir / 'build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('IPA verified: ' + args.profile + ' backend, matching build and disabled external payment links.')


if __name__ == '__main__':
    main()
