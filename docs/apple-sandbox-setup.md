# Evening handoff: Apple Sandbox test setup

This candidate is on mobile/ios-preparation / draft PR14. Production and the
football relay must remain unchanged. TestFlight 12.1 remains the uploaded baseline.
The StoreKit candidate requires the following backend setup before a purchase
test can succeed. No new Apple build has been uploaded by these changes.

## Resume here — October 17

Infrastructure setup is complete. Do not repeat secret copying, schemas or server
installation. Worker TEST is enabled with Sandbox settings; direct Apple TEST
delivery returned SUCCESS. Signed TEST replay returned HTTP 200 with
ok:true/ignored:true, including after the owner removed temporary error diagnostics
and redeployed on October 17. The Cloudflare client uses redirect:manual and rejects
non-2xx responses; the Node service is separate.

The StoreKit candidate passed 78 root tests, simulator compile, signed archive and
Apple validation (run 39016578833). Owner authorized internal TestFlight upload on
October 17. Release run 39017629802 is in progress; see PROJECT_STATUS.md for its
latest result. Installed baseline is still 12.1 until a replacement is confirmed.

Next: confirm successful upload/Apple processing, install the specified candidate,
and follow mobile/SANDBOX_CHECKLIST.md one step at a time. Start by signing in and
checking the Apple product price; that also exercises authenticated /apple/token.
Actual purchase reconciliation, grants, restore and refund still need device tests.

The sections below describe the original setup for reference; they are not a list
of tasks to repeat on the existing test environment.

## 1. Isolated verification service

The prepared Node service is in services/apple-verifier. Use a separate directory,
process and HTTPS hostname on the server; do not replace the football relay.
First verify availability of Node 24 and how that host manages services/TLS.
Do not upgrade the existing relay runtime merely to run this candidate.

Required configuration (values are intentionally not committed):

| Setting | Value/source |
| --- | --- |
| APPLE_DEPLOYMENT | test |
| APPLE_ENVIRONMENT | Sandbox |
| APPLE_SIGNING_KEY_FILE | Protected path to an authorized Apple server API private key |
| APPLE_KEY_ID | ID associated with that key |
| APPLE_ISSUER_ID | Issuer associated with that key |
| APPLE_VERIFIER_SECRET | New random 32-byte secret represented by 64 hex characters |
| PORT | 8790, if free; service binds only to 127.0.0.1 |

Obtain an appropriate App Store Server API key through App Store Connect. Existing
GitHub upload credentials have not been inspected or assumed reusable. Private
keys and the shared secret must be entered on the server / Cloudflare secrets,
never pasted into chat, placed in public files or committed to GitHub.

From the service directory run npm ci, npm test, then npm start with the protected
environment configured. Configure the server's process manager and HTTPS reverse
proxy separately after inspecting the host. GET /health must return {ok:true}.
This only proves liveness: valid Apple signatures, OCSP access and server API
credentials still require a genuine Sandbox transaction.

## 2. Test database and Worker

Use only calcio_users_test. Preserve the existing test accounts and first inspect
whether the staged tables already exist. Apply these scripts once, in order:

1. worker/schema/apple-purchase-ledger.sql
2. worker/schema/pro-entitlements.sql

From the repository root, after npm ci in mobile:

```sh
node scripts/build-apple-test-worker.mjs
```

Deploy the generated worker/dist/apple-test-worker.mjs to the existing
calcio-report-test Worker only. Do not deploy the unbundled entry or touch
calcio-report-proxy. Preserve DB, auth, email and football-relay bindings/secrets.

Additional test Worker settings:

| Setting | Value |
| --- | --- |
| APPLE_SANDBOX_ENABLED | 1, after setup is complete |
| APPLE_DEPLOYMENT | test |
| APPLE_ENVIRONMENT | Sandbox |
| APPLE_VERIFIER_URL | Dedicated HTTPS origin, without a path/query |
| APPLE_VERIFIER_SECRET | Same dedicated secret as the verification service |

The explicit Sandbox wrapper blocks legacy Stripe/redeem/admin duration-writing
routes while enabled. Existing expiry is captured once as a baseline. A new
source-aware production migration remains separate. Disable APPLE_SANDBOX_ENABLED
to stop new Apple requests; this does not roll back already-granted test access.

## 3. Sandbox notifications

Configure the Apple Sandbox notification URL as:
https://calcio-report-test.stemoro84.workers.dev/apple/notifications

Apply suitable edge request limits before exposing purchase/notification routes;
do not require a user login for Apple's signed notifications. The Worker forwards
them over authenticated transport and verifies signatures before any DB write.
Send Apple's TEST notification and verify acknowledgement. Then test actual refund
delivery. Missed-notification reconciliation/polling is still a production gap.

## 4. Build and device acceptance

GitHub compiles the Swift bridge on macOS, archives/signs and validates the test
IPA. Ordinary commits do not upload to TestFlight. After backend readiness and
green native checks, use the separately authorized upload path for this build.
Apple processing and internal tester availability must be confirmed before asking
the owner to update. Do not reuse the old keyboard-fix release trigger/message.

Device checks (Sandbox purchases, no real charges):

- Existing login/recovery remains functional; PRO shows Apple's localized price.
- Cancelled purchase grants nothing; pending approval is shown without retrying payment.
- Confirmed purchase grants 30 days exactly once, including duplicate delivery.
- Loss of network after Apple confirmation is recovered using unfinished delivery.
- Explicit restore/reinstall keeps the original entitlement rather than adding 30 days.
- Another Calcio Report account cannot claim or finish the original account's purchase.
- Refund notification removes that Apple grant; old receipts cannot re-enable it.
- Deleted account followed by same-email registration cannot reclaim the old purchase.

Do not test production checkout or submit to App Review in this step. Store icon,
review screenshot, retention policy and production payment-source migration are
still required before public release.
