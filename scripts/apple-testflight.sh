#!/bin/bash
# Validate the isolated IPA. Upload only with an explicit manual workflow input.
set -euo pipefail
umask 077
MODE=${1:-validate}
[[ "$MODE" == validate || "$MODE" == upload ]] || { echo 'Invalid mode' >&2; exit 1; }
: "${RUNNER_TEMP:?GitHub-hosted macOS runner required}"
: "${APP_STORE_CONNECT_KEY_ID:?Missing Apple key ID}"
: "${APP_STORE_CONNECT_ISSUER_ID:?Missing Apple issuer ID}"
: "${APP_STORE_CONNECT_PRIVATE_KEY:?Missing Apple private key}"
APPLE_DIR=$(mktemp -d "$RUNNER_TEMP/calcio-apple.XXXXXX")
trap 'rm -rf "$APPLE_DIR"' EXIT
export APPLE_DIR
# Reject a different/unverified artifact before making any authenticated request.
python3 - <<'PY'
import hashlib, json, os, re
from pathlib import Path
root = Path(os.environ['RUNNER_TEMP']) / 'calcio-ipa'
info = json.loads((root / 'build.json').read_text())
assert info['commit'] == os.environ['GITHUB_SHA'], 'IPA commit mismatch'
assert info['bundleId'] == 'com.calcioreport.app', 'Wrong bundle'
assert info['backend'] == 'test' and info['payments'] == 'disabled', 'Test build required'
assert info['sha256'] == hashlib.sha256((root / 'CalcioReport-test.ipa').read_bytes()).hexdigest(), 'IPA checksum mismatch'
assert re.fullmatch(r'[A-Za-z0-9]{10}', os.environ['APP_STORE_CONNECT_KEY_ID']), 'Invalid key ID format'
assert re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', os.environ['APP_STORE_CONNECT_ISSUER_ID']), 'Invalid issuer ID format'
key = os.environ['APP_STORE_CONNECT_PRIVATE_KEY'].strip()
assert key.startswith('-----BEGIN PRIVATE KEY-----') and key.endswith('-----END PRIVATE KEY-----'), 'Expected downloaded P8 contents'
folder = Path(os.environ['APPLE_DIR']) / 'private_keys'
folder.mkdir()
(folder / ('AuthKey_' + os.environ['APP_STORE_CONNECT_KEY_ID'] + '.p8')).write_text(key + '\n')
PY
unset APP_STORE_CONNECT_PRIVATE_KEY
cd "$APPLE_DIR"
# altool discovers ./private_keys/AuthKey_<ID>.p8; no credentials in artifacts.
xcrun altool --validate-app -f "$RUNNER_TEMP/calcio-ipa/CalcioReport-test.ipa" \
  -t ios --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
echo '### Apple IPA validation passed' >> "$GITHUB_STEP_SUMMARY"
if [[ "$MODE" == upload ]]; then
  [[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/mobile/ios-preparation ]] || {
    echo 'Upload requires manual dispatch on the iOS branch.' >&2; exit 1;
  }
  xcrun altool --upload-app -f "$RUNNER_TEMP/calcio-ipa/CalcioReport-test.ipa" \
    -t ios --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
  echo 'Uploaded for internal TestFlight processing. No review submission or tester invitations.' >> "$GITHUB_STEP_SUMMARY"
else
  echo 'Validation only. No TestFlight upload or App Store submission.' >> "$GITHUB_STEP_SUMMARY"
fi
