# Apple signed-data verification (not deployed)

Internal Node 24 module using Apple's server library, pinned in package-lock.json.
Isolated from the existing football relay: importing this module does not start a
server, change the relay, grant PRO or expose a public verification endpoint.

Run `npm ci` and `npm test` from this directory. CI runs the same checks.

`createAppleVerifier({deployment:'test', environment:'Sandbox'})` returns
`transaction(jws)` and `notification(jws)`. Production requires deployment
`production`, environment `Production` and the numeric **app** Apple ID (not the
in-app product ID). Configuration must come from the server, never the caller.
Bundle identity is fixed to com.calcioreport.app. No local/Xcode bypass exists.

Apple SignedDataVerifier checks signatures, certificate chains, bundle identity
and environment. Online certificate revocation checks are always enabled; errors
must remain failures/retryable delivery, not a reason to switch to offline checks.
Notifications also verify any nested signedTransactionInfo independently.

The committed public Apple Root CA G3 certificate was retrieved on 2026-10-14:
https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
DER SHA256: 63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179.
PEM conversion preserves the certificate. Additional roots require an explicit
trusted Apple PKI update; never load request-supplied trust roots.

The four tests use the real library to reject malformed/oversized input,
environment misconfiguration, forged signatures and fake certificate chains.
They do not demonstrate successful Apple Sandbox verification or OCSP network
availability. A genuine device transaction is still needed for acceptance.

## Prepared transport and Sandbox integration (2026-10-15)

`npm start` starts the dedicated service on 127.0.0.1:8790 (PORT overrides).
It must be reverse-proxied over HTTPS on its own hostname. It does not alter the
football relay. Required environment configuration:

- APPLE_DEPLOYMENT=test and APPLE_ENVIRONMENT=Sandbox
- APPLE_SIGNING_KEY_FILE: protected local path to an authorized App Store Server API
  signing key, plus APPLE_KEY_ID and APPLE_ISSUER_ID. Do not paste keys into chat.
- APPLE_VERIFIER_SECRET: dedicated random 32-byte secret encoded as 64 hex characters.
  Both peers use the hex string as HMAC key bytes, not hex-decoded bytes.
- APPLE_APP_ID is required only for Production by the verifier library; the Worker
  entry point in this candidate cannot enable Production purchases.

POST /v1/transaction and /v1/notification accept JSON `{signedPayload}` with
x-cr-timestamp (epoch milliseconds, 30-second skew) and x-cr-signature (hex HMAC
SHA256). Canonical input is timestamp, POST, exact path, SHA256(body) in lowercase
hex, separated by newlines. Body limit 192 KiB; four in-flight requests maximum.
No redirects, payload logs or raw Apple errors. GET /health reveals only liveness.
Verified notifications without a transaction are acknowledged with ignored:true.

The service validates the supplied JWS, fetches current getTransactionInfo from
Apple, verifies the new JWS and compares immutable purchase facts/ownership.
The current payload includes revocation state. Apple API calls have a 10-second
abort deadline; Apple's certificate verifier has its own OCSP deadline. Worker
transport uses a 15-second deadline and treats failure as retryable, never delivered.
Slow OCSP may therefore cause a safe retry; real network acceptance is still needed.

`worker/apple-entry.mjs` is the separate candidate for the isolated test Worker.
It needs APPLE_SANDBOX_ENABLED=1, APPLE_DEPLOYMENT=test,
APPLE_ENVIRONMENT=Sandbox, APPLE_VERIFIER_URL (HTTPS origin), the dedicated secret,
and the existing isolated DB/auth/relay settings. Apply the staged SQL schemas in
order: apple-purchase-ledger.sql, pro-entitlements.sql. Neither has been applied.
Bundle this entry and its imports before deploying; do not paste only the entry
file into the dashboard. The normal worker.js deployment does not enable purchases.

Public candidate routes: authenticated GET /apple/token, authenticated POST
/apple/transaction, and POST /apple/notifications verified through the private
service. Configure Apple Sandbox notification URL and edge rate limits before
exposure. TEST/no-transaction notifications may be acknowledged only after their
signature has been verified. Runtime API keys, hostname, deployment and valid
Sandbox purchases are not yet configured or verified.

The entitlement candidate captures existing paid_until as a baseline. Grants are
replayed in purchase-time order; refund removes only the Apple grant, and a newer
verified status may reverse it. Other-source durations remain present in replay;
this can move later grants' start/end dates. Restoring an old purchase never moves
its purchase time to now. Duplicate grant IDs preserve exact ownership/facts.
Ledger writes and expiry changes commit atomically; external legacy expiry writes
cause a conflict. The Sandbox wrapper blocks the old Stripe/redeem/admin grant
and adjustment routes when enabled. Production migration, negative adjustments,
missed-notification polling and retention/deletion policy remain pending.

Nine verifier/transport tests pass. Successful reconciliation uses mocked Apple
responses; rejected forged signatures use the actual Apple library. The root
repository's 71 tests include SQLite accounting, rollback, concurrency, session
ownership and notification scenarios. No genuine Apple API or device test yet.

Official library reference: https://github.com/apple/app-store-server-library-node
