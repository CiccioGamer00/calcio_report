# StoreKit Sandbox candidate — 17 October 2026

This candidate targets only calcio-report-test.stemoro84.workers.dev and
calcio_users_test. Production payment links remain empty. StoreKit checkout is
gated by the authenticated test backend /apple/token endpoint.

## Backend prerequisite completed

Apple TEST delivery returned SUCCESS; replay through the Worker returned HTTP 200
with ok:true and ignored:true. Owner removed the temporary error diagnostic and
confirmed the same response after redeploying. This proves notification transport
and TEST acknowledgement, not purchase reconciliation or entitlement persistence.

## Candidate delivery

TestFlight 1.0 (12.1) predates the StoreKit bridge. This checkpoint requests a fresh
signed archive and Apple validation through the existing path-filtered workflow.
Its ordinary commit message does not authorize or trigger a TestFlight upload.
Record the resulting run, source SHA and build number in PROJECT_STATUS.md.
Only upload after the owner approves the concrete validated candidate.

## First device session — one step at a time

1. Install the specifically delivered candidate in TestFlight, verify its build
   number, then open Calcio Report and sign in to the existing test account.
2. Open PRO and check Apple's localized product price for
   com.calcioreport.app.pro30. If unavailable, record the displayed error and stop.
3. Open the Apple Sandbox purchase sheet and cancel: no new PRO duration.
4. Make one Sandbox purchase. Check backend delivery and exactly one 30-day grant;
   the client must finish the transaction only after state=applied for its ID.
5. Reopen the app and restore: no extra 30 days for the same purchase.

Subsequent acceptance covers interrupted delivery/reconnect, account ownership,
refund and stale replay, and deleted-account/re-registration isolation. Use only
explicitly disposable accounts for deletion checks. Never paste credentials,
raw signed transactions, or session tokens into chat or repository files.

No production checkout, main merge, public release or App Review submission.
