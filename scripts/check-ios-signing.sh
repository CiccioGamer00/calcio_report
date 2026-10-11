#!/bin/bash
# Trusted branch only. Export a test IPA; no Apple upload or API key access.
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?Run on a GitHub-hosted macOS runner}"
: "${IOS_DISTRIBUTION_P12_BASE64:?Missing P12 secret}"
: "${IOS_DISTRIBUTION_P12_PASSWORD:?Missing P12 password}"
: "${IOS_PROVISION_PROFILE_BASE64:?Missing profile secret}"
SIGN_DIR=$(mktemp -d "$RUNNER_TEMP/calcio-signing.XXXXXX")
KEYCHAIN="$SIGN_DIR/signing.keychain-db"
PROFILE_INSTALLED=''
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  if [[ -n "$PROFILE_INSTALLED" ]]; then rm -f "$PROFILE_INSTALLED"; fi
  rm -rf "$SIGN_DIR"
}
trap cleanup EXIT
export SIGN_DIR
python3 - <<'PY'
import base64, os
from pathlib import Path
for variable, filename in [('IOS_DISTRIBUTION_P12_BASE64','distribution.p12'), ('IOS_PROVISION_PROFILE_BASE64','profile.mobileprovision')]:
    try:
        data = base64.b64decode(''.join(os.environ[variable].split()), validate=True)
        if not data: raise ValueError()
    except ValueError:
        raise SystemExit(f'Invalid base64 in {variable}') from None
    (Path(os.environ['SIGN_DIR']) / filename).write_bytes(data)
PY
security cms -D -i "$SIGN_DIR/profile.mobileprovision" > "$SIGN_DIR/profile.plist"
python3 - <<'PY'
import datetime, hashlib, os, plistlib, re
from pathlib import Path
root = Path(os.environ['SIGN_DIR'])
p = plistlib.loads((root / 'profile.plist').read_bytes())
e = p.get('Entitlements', {})
assert p.get('TeamIdentifier') == ['S3Z89L9T94'], 'Wrong Apple team'
assert e.get('application-identifier') == 'S3Z89L9T94.com.calcioreport.app', 'Wrong app profile'
assert e.get('get-task-allow') is False, 'Development profile is not permitted'
assert not p.get('ProvisionedDevices') and not p.get('ProvisionsAllDevices'), 'App Store profile required'
assert p['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Expired profile'
assert re.fullmatch(r'[A-Fa-f0-9-]{36}', p['UUID']), 'Invalid profile UUID'
assert len(p['DeveloperCertificates']) == 1, 'Expected one distribution certificate'
(root / 'uuid').write_text(p['UUID'])
(root / 'identity').write_text(hashlib.sha1(p['DeveloperCertificates'][0]).hexdigest().upper())
print('Profile validated: correct app, team, distribution type and expiration.')
PY
KEYCHAIN_PASSWORD=$(openssl rand -hex 32)
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$SIGN_DIR/distribution.p12" -P "$IOS_DISTRIBUTION_P12_PASSWORD" -t cert -f pkcs12 -k "$KEYCHAIN" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN"
IDENTITY=$(cat "$SIGN_DIR/identity")
security find-identity -v -p codesigning "$KEYCHAIN" > "$SIGN_DIR/identities"
if ! grep -Fq "$IDENTITY" "$SIGN_DIR/identities"; then
  echo 'The profile does not match a valid signing identity in the P12.' >&2
  exit 1
fi
UUID=$(cat "$SIGN_DIR/uuid")
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
PROFILE_INSTALLED="$HOME/Library/MobileDevice/Provisioning Profiles/$UUID.mobileprovision"
cp "$SIGN_DIR/profile.mobileprovision" "$PROFILE_INSTALLED"
unset IOS_DISTRIBUTION_P12_BASE64 IOS_DISTRIBUTION_P12_PASSWORD IOS_PROVISION_PROFILE_BASE64 KEYCHAIN_PASSWORD
xcodebuild -quiet -project mobile/ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$SIGN_DIR/CalcioReport.xcarchive" \
  -derivedDataPath "$SIGN_DIR/derived" \
  CURRENT_PROJECT_VERSION="${GITHUB_RUN_NUMBER:?}.${GITHUB_RUN_ATTEMPT:?}" \
  DEVELOPMENT_TEAM=S3Z89L9T94 CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$IDENTITY" PROVISIONING_PROFILE_SPECIFIER="$UUID" \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" archive
codesign --verify --deep --strict "$SIGN_DIR/CalcioReport.xcarchive/Products/Applications/App.app"
# Export locally with manual signing; never contact Apple to upload this build.
python3 - <<'PYEXPORT'
import os, plistlib
from pathlib import Path
root = Path(os.environ['SIGN_DIR'])
options = {
    'method': 'app-store-connect', 'destination': 'export',
    'teamID': 'S3Z89L9T94', 'signingStyle': 'manual',
    'signingCertificate': (root / 'identity').read_text(),
    'provisioningProfiles': {'com.calcioreport.app': (root / 'uuid').read_text()},
    'testFlightInternalTestingOnly': True,
    'manageAppVersionAndBuildNumber': False,
    'uploadSymbols': False,
}
(root / 'export-options.plist').write_bytes(plistlib.dumps(options))
PYEXPORT
xcodebuild -quiet -exportArchive -archivePath "$SIGN_DIR/CalcioReport.xcarchive" \
  -exportOptionsPlist "$SIGN_DIR/export-options.plist" -exportPath "$SIGN_DIR/export"
python3 - <<'PYVERIFY'
import hashlib, json, os, plistlib, shutil, zipfile
from pathlib import Path
root = Path(os.environ['SIGN_DIR'])
ipas = list((root / 'export').glob('*.ipa'))
assert len(ipas) == 1, 'Expected one exported IPA'
with zipfile.ZipFile(ipas[0]) as z:
    infos = [n for n in z.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('/Info.plist')]
    assert len(infos) == 1, 'Expected one main app'
    info = plistlib.loads(z.read(infos[0]))
    assert info['CFBundleIdentifier'] == 'com.calcioreport.app'
    app = infos[0].removesuffix('Info.plist')
    config = z.read(app + 'public/config.js').decode()
    assert 'https://calcio-report-test.stemoro84.workers.dev' in config
    assert 'https://api.calcioreport.com' not in config
    assert '"paymentUrl": ""' in config and '"paypalUrl": ""' in config
out = Path(os.environ['RUNNER_TEMP']) / 'calcio-ipa'
out.mkdir(exist_ok=False)
target = out / 'CalcioReport-test.ipa'
shutil.copyfile(ipas[0], target)
(out / 'build.json').write_text(json.dumps({
    'commit': os.environ['GITHUB_SHA'], 'bundleId': info['CFBundleIdentifier'],
    'version': info['CFBundleShortVersionString'], 'build': info['CFBundleVersion'],
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'backend': 'test', 'payments': 'disabled', 'appleUpload': False,
}, indent=2) + '\n')
print('IPA export verified: correct bundle, test backend and disabled payment URLs.')
PYVERIFY
echo '### iOS signing and IPA export passed' >> "$GITHUB_STEP_SUMMARY"
echo 'Signed device archive and test IPA verified. Artifact retained for one day. No Apple upload or distribution performed.' >> "$GITHUB_STEP_SUMMARY"
