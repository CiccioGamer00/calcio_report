#!/usr/bin/env python3
"""Inspect actual exported resources; does not replace Apple's privacy review."""
import argparse
import hashlib
import json
import plistlib
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify_resources(ipa):
    expected = plistlib.loads((ROOT / 'mobile/native/PrivacyInfo.xcprivacy').read_bytes())
    with zipfile.ZipFile(ipa) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate IPA archive entries')
        infos = [n for n in names if re.fullmatch(r'Payload/[^/]+/Info\.plist', n)]
        if len(infos) != 1:
            raise ValueError('Expected one app')
        base = infos[0].removesuffix('Info.plist')
        app_manifest = base + 'PrivacyInfo.xcprivacy'
        if app_manifest not in names or plistlib.loads(archive.read(app_manifest)) != expected:
            raise ValueError('Missing or mismatched app privacy manifest')
        manifests = {}
        for name in names:
            if name.startswith(base) and name.endswith('/PrivacyInfo.xcprivacy'):
                value = plistlib.loads(archive.read(name))
                if value.get('NSPrivacyTracking') is not False or value.get('NSPrivacyTrackingDomains'):
                    raise ValueError('Unexpected tracking declaration: ' + name)
                manifests[name] = value
        if len(manifests) < 2:
            raise ValueError('Expected bundled SDK privacy manifests')
        info = plistlib.loads(archive.read(infos[0]))
        primary = info.get('CFBundleIcons', {}).get('CFBundlePrimaryIcon', {})
        if primary.get('CFBundleIconName') != 'AppIcon' or not primary.get('CFBundleIconFiles'):
            raise ValueError('Missing compiled AppIcon declaration')
        icon_names = [n for n in names if n.startswith(base + 'AppIcon') and n.endswith('.png') and '/' not in n[len(base):]]
        if not icon_names or base + 'Assets.car' not in names:
            raise ValueError('Missing compiled icon resources')
        for name in icon_names:
            if not archive.read(name).startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Invalid compiled icon PNG')
        for page in ['privacy.html', 'support.html']:
            data = archive.read(base + 'public/' + page)
            if data != (ROOT / page).read_bytes():
                raise ValueError('Mismatched packaged legal page: ' + page)
        index = archive.read(base + 'public/index.html').decode()
        if index.count('href="privacy.html"') < 2 or 'href="support.html"' not in index:
            raise ValueError('Privacy must be accessible from registration and footer')
        # The installer pins the approved source; this check confirms its compiled
        # catalog exists. It does not pretend a binary catalog is a pixel comparison.
        return {'privacyManifests': manifests, 'compiledIcons': icon_names,
                'appIconName': primary['CFBundleIconName'],
                'approvedSourceIconSHA256': hashlib.sha256((ROOT / 'assets/branding/calcio-report-icon.png').read_bytes()).hexdigest(),
                'legalPagesMatchSource': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    report = verify_resources(args.ipa)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print('Exported privacy manifests, compiled icon resources and legal pages verified.')
