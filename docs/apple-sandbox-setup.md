# Evening handoff: Apple Sandbox test setup

This candidate is on mobile/ios-preparation / draft PR14. Production and the
football relay must remain unchanged. TestFlight 12.1 remains the uploaded baseline.
The StoreKit candidate requires the following backend setup before a purchase
test can succeed. No new Apple build has been uploaded by these changes.

## Resume here — October 16

Completed remotely by the owner on October 15: isolated verifier installation,
protected Apple In-App Purchase key and shared secret, systemd service, HTTPS via
Caddy, and both D1 schemas. Public /health returned ok:true. D1 inventory showed
4 tables, 5 triggers and 1 index. On October 16 the owner reported the four text
variables entered, with APPLE_SANDBOX_ENABLED requested as 0. Do not repeat setup.

Evening sequence (test environment only):

1. Check saved Worker text variables against the table below; keep the flag at 0.
2. Copy the existing APPLE_VERIFIER_SECRET from the protected server environment
   into a Cloudflare **Secret** of the same name. Do not create a different value,
   paste it in chat, screenshot it, or copy the Apple private key into Cloudflare.
3. Confirm DB points to calcio_users_test and preserve existing auth, email and
   relay configuration. Deploy worker/dist/apple-test-worker.mjs, generated from
   the current candidate. With the flag still 0, GET /apple/token must return
   HTTP 503 with APPLE_PURCHASES_DISABLED. Confirm existing login still works.
4. Configure appropriate edge limits for Apple routes. Set the flag to 1 only
   once verifier transport, database and Worker configuration are ready. An
   unauthenticated GET /apple/token should return 401; a signed-in test account
   should receive its Sandbox account token. Never paste login tokens in chat.
5. Configure the Sandbox notification URL, send Apple's TEST notification and
   confirm acknowledgement. A TEST notification does not prove purchase delivery.
6. After backend readiness, run the existing manual signing workflow with
   upload_testflight=true for this branch. Wait for successful upload and Apple
   processing before asking the owner to install. Run device checks below.

Local preparation was repeated October 16: 78 root tests + 9 verifier tests,
Worker bundle/syntax and disabled/config/CORS smoke checks, mobile web build and
StoreKit installer passed. The bundle is generated and ignored by Git; rebuild
with the command below if this workspace is no longer available. Native signing
was previously validated on GitHub; no new signed build or upload is claimed.
Real Apple API authentication, OCSP and transaction delivery remain untested.

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
