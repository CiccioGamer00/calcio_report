# StoreKit Sandbox candidate — 17 October 2026

This candidate targets only calcio-report-test.stemoro84.workers.dev and
calcio_users_test. Production payment links remain empty. StoreKit checkout is
gated by the authenticated test backend /apple/token endpoint.

## Backend prerequisite completed

Apple TEST delivery returned SUCCESS; replay through the Worker returned HTTP 200
with ok:true and ignored:true. Owner removed the temporary error diagnostic and
confirmed the same response after redeploying. This proves notification transport
and TEST acknowledgement, not purchase reconciliation or entitlement persistence.

## Current device acceptance — 19 October 2026

Latest installed build: **1.0 (21.1)**. Owner confirmed on October 17:

- First successful Sandbox purchase on 18.1 granted PRO for 30 days.
- Logout/login preserved the purchase; restore did not add another 30 days.
- After updating to 21.1 and logout/login, PRO persisted and Indicators opened.
- Explicit restore on a different Calcio Report account with the same Apple
  account reported that purchases belong to another account; it remained TRIAL.

Do not repeat those checks as if they had never passed. No newer build delivered.
The fresh-purchase overlay fix is included in 21.1 but is not yet device-accepted
without logout/login. Price now appears in Apple's final confirmation sheet;
explicit cancellation feedback was added. The owner has not run the next checks.

## Remaining checks, in order

1. On a disposable Calcio Report test account, complete one NEW Sandbox purchase
   in 21.1. Immediately open Indicators without logout/login or restarting.
   Expected: PRO badge and unlocked panel in the same session. A restore of an
   existing purchase is not evidence for this fresh-purchase check. If Apple
   returns a purchase owned by another account, record that result and stop;
   do not repeatedly purchase or change ownership to force this scenario.
2. Cancel Apple's sheet and confirm the explicit cancellation message and
   unchanged access/expiry. Cancellation itself passed on 18.1; this checks the
   new 21.1 feedback.
3. Interrupted delivery/reconnect on a disposable account: after Apple success,
   a temporary verification failure must recover via resume/restore with only
   one grant. Do not buy again to recover an already-confirmed purchase.
4. Refund/revocation and stale replay: verify the real Apple Sandbox path removes
   only the affected grant and restore cannot revive a refunded transaction.
5. Deleted-account/re-registration isolation, using explicitly disposable
   accounts only. Never delete the owner's working account.

Automated recovery tests are separate from these device acceptance checks.
Support lookup procedure: `docs/apple-support.md` (read-only, test database only).

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
