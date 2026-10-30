#!/bin/bash
# Trusted branches only. Export an IPA; no Apple upload or API key access.
set -euo pipefail
umask 077
# Public candidates are manual-only and cannot enter the internal upload flow.
CR_IOS_CANDIDATE_KIND=test
if [[ "${CR_MOBILE_PROFILE:-sandbox}" == production ]]; then
  if [[ "${CR_IOS_RELEASE_CANDIDATE:-}" != true ||
        ( "${GITHUB_EVENT_NAME:-}" != workflow_dispatch && "${GITHUB_EVENT_NAME:-}" != push ) ||
        "${GITHUB_REPOSITORY:-}" != CiccioGamer00/calcio_report ||
        "${GITHUB_REF:-}" != refs/heads/release/apple-production-preparation ]]; then
    echo 'Production IPA requires the dedicated manual release-candidate workflow.' >&2
    exit 1
  fi
  if [[ "${GITHUB_EVENT_NAME:-}" == push ]]; then
    python3 - <<'PYREQUEST'
import json, os
from pathlib import Path
event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
assert event.get('head_commit', {}).get('message') == 'release: build App Store candidate', 'Explicit candidate build commit required'
assert event.get('after') == os.environ['GITHUB_SHA'], 'Source commit mismatch'
assert os.environ['GITHUB_RUN_ATTEMPT'] == '1', 'Push candidate build cannot be replayed'
PYREQUEST
  fi
  CR_IOS_CANDIDATE_KIND=production
elif [[ "${CR_MOBILE_PROFILE:-sandbox}" != sandbox && "${CR_MOBILE_PROFILE:-}" != review ]]; then
  echo 'Unknown mobile profile.' >&2
  exit 1
fi
export CR_IOS_CANDIDATE_KIND
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
    'testFlightInternalTestingOnly': os.environ['CR_IOS_CANDIDATE_KIND'] != 'production',
    'manageAppVersionAndBuildNumber': False,
    'uploadSymbols': False,
}
(root / 'export-options.plist').write_bytes(plistlib.dumps(options))
PYEXPORT
xcodebuild -quiet -exportArchive -archivePath "$SIGN_DIR/CalcioReport.xcarchive" \
  -exportOptionsPlist "$SIGN_DIR/export-options.plist" -exportPath "$SIGN_DIR/export"
python3 scripts/verify-ios-artifact.py \
  --export-dir "$SIGN_DIR/export" --output-dir "$RUNNER_TEMP/calcio-ipa" \
  --profile "${CR_MOBILE_PROFILE:-sandbox}" --commit "${GITHUB_SHA:?}" \
  --expected-build "${GITHUB_RUN_NUMBER:?}.${GITHUB_RUN_ATTEMPT:?}"
python3 scripts/verify-ios-release-resources.py \
  "$RUNNER_TEMP/calcio-ipa/CalcioReport-$CR_IOS_CANDIDATE_KIND.ipa" \
  --report "$RUNNER_TEMP/calcio-ipa/privacy-resources.json"
echo '### iOS signing and IPA export passed' >> "$GITHUB_STEP_SUMMARY"
echo "Signed $CR_IOS_CANDIDATE_KIND IPA verified. No Apple upload or App Review submission performed." >> "$GITHUB_STEP_SUMMARY"

