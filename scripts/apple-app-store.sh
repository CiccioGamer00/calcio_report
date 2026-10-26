#!/bin/bash
# Deliver a verified, existing Production IPA. No build, merge or review submission.
set -euo pipefail
umask 077
MODE=${1:-validate}
[[ "$MODE" == validate || "$MODE" == upload ]] || { echo 'Invalid delivery mode' >&2; exit 1; }
export DELIVERY_MODE="$MODE"
python3 - <<'PYGATE'
import json, os
from pathlib import Path
plan = json.loads(Path('deploy/app-store-candidate.json').read_text())
if os.environ.get('GITHUB_REPOSITORY') != plan['repository'] or os.environ.get('GITHUB_REF') != 'refs/heads/' + plan['branch']:
    raise SystemExit('Wrong delivery repository/branch')
event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
kind = os.environ.get('GITHUB_EVENT_NAME')
mode = os.environ['DELIVERY_MODE']
if kind == 'push':
    expected = 'release: ' + ('upload' if mode == 'upload' else 'validate') + ' App Store candidate ' + plan['build']
    allowed = (event.get('head_commit', {}).get('message') == expected and
               event.get('after') == os.environ.get('GITHUB_SHA') and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
elif kind == 'workflow_dispatch':
    allowed = event.get('inputs', {}).get('delivery_mode') == mode
else:
    allowed = False
if not allowed:
    raise SystemExit('Explicit matching delivery request required')
PYGATE
: "${RUNNER_TEMP:?macOS runner required}"
: "${APP_STORE_CONNECT_KEY_ID:?Missing Apple key ID}"
: "${APP_STORE_CONNECT_ISSUER_ID:?Missing Apple issuer ID}"
: "${APP_STORE_CONNECT_PRIVATE_KEY:?Missing Apple private key}"
python3 - <<'PYVERIFY'
import importlib.util, os
from pathlib import Path
spec = importlib.util.spec_from_file_location('delivery', 'scripts/prepare-ios-upload.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify_candidate(module.load_plan('deploy/app-store-candidate.json'), Path(os.environ['RUNNER_TEMP']) / 'calcio-production-delivery')
PYVERIFY
APPLE_DIR=$(mktemp -d "$RUNNER_TEMP/calcio-production-apple.XXXXXX")
trap 'rm -rf "$APPLE_DIR"' EXIT
export APPLE_DIR
python3 - <<'PYKEY'
import os, re
from pathlib import Path
if not re.fullmatch(r'[A-Za-z0-9]{10}', os.environ['APP_STORE_CONNECT_KEY_ID']):
    raise SystemExit('Invalid Apple key ID')
if not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', os.environ['APP_STORE_CONNECT_ISSUER_ID']):
    raise SystemExit('Invalid Apple issuer ID')
key = os.environ['APP_STORE_CONNECT_PRIVATE_KEY'].strip()
if not (key.startswith('-----BEGIN PRIVATE KEY-----') and key.endswith('-----END PRIVATE KEY-----')):
    raise SystemExit('Invalid Apple signing key format')
folder = Path(os.environ['APPLE_DIR']) / 'private_keys'
folder.mkdir()
(folder / ('AuthKey_' + os.environ['APP_STORE_CONNECT_KEY_ID'] + '.p8')).write_text(key + '\n')
PYKEY
unset APP_STORE_CONNECT_PRIVATE_KEY
cd "$APPLE_DIR"
IPA="$RUNNER_TEMP/calcio-production-delivery/CalcioReport-production.ipa"
xcrun altool --validate-app -f "$IPA" -t ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
echo '### Production IPA validation with Apple passed' >> "$GITHUB_STEP_SUMMARY"
if [[ "$MODE" == upload ]]; then
  xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
  echo 'Uploaded existing Production candidate for App Store Connect processing. No App Review submission or public release.' >> "$GITHUB_STEP_SUMMARY"
else
  echo 'Validation only: no App Store Connect upload, App Review submission or release.' >> "$GITHUB_STEP_SUMMARY"
fi
