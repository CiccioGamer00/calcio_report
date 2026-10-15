# Apple PRO purchases — implementation checkpoint

2026-10-14. Work branch: `mobile/ios-preparation`, draft PR #14.

## Sandbox purchase delivery candidate — 2026-10-15

The source-aware entitlement ledger, fresh Apple transaction reconciliation,
authenticated verification transport and test-only Worker routes are implemented.
No new deployment or TestFlight upload has been performed; 12.1 remains latest.

- pro-entitlements.mjs captures the existing non-Apple expiry once, records immutable
  grant/status events and atomically updates paid_until using D1 batch + revision CAS.
  Duplicate/reordered deliveries do not add time. Refunds remove the Apple grant
  from chronological replay, preserving other sources' durations. A newer verified
  active status can reverse a refund; a tied status favors revocation.
- apple-pro-delivery.mjs first records immutable purchase ownership, then atomically
  applies the grant and current status. Interrupted delivery can safely retry.
- Node verifier reconciles each device/notification transaction with Apple's
  getTransactionInfo and verifies the returned JWS. Dedicated HMAC authenticates
  timestamp, method, path and body hash; no football-relay key reuse.
- Separate worker/apple-entry.mjs adds authenticated GET /apple/token and POST
  /apple/transaction, plus verified POST /apple/notifications. Expired trials may
  buy. Deleted owners' notifications are acknowledged without granting a new account.
- The entry is test/Sandbox-only and disabled by default. When enabled it blocks
  legacy Stripe/redeem/admin expiry writes in this isolated deployment. Those
  production writers still need migration (including admin negative adjustments).
  An unexpected direct expiry write is detected and never silently overwritten.

Validation: 71 repository tests + 9 verifier tests pass locally. Tests use actual
SQLite transactions and real Apple-library rejection checks, with mocked Apple API
responses for successful flows. Genuine Sandbox signatures, OCSP connectivity,
remote D1 contention and device StoreKit behavior remain untested.

Remaining: native StoreKit bridge/UI; service hosting + dedicated server API key,
HTTPS hostname and secret; staged test DB schema application and test Worker bundle;
notification URL/rate limiting and missed-notification reconciliation; retention
policy and production payment-writer migration. These are not a ready-to-upload app.
See services/apple-verifier/README.md for the prepared service interface.

## Apple verifier and administrative checkpoint — 2026-10-14 evening

Screenshot confirms Paid Apps and Free Apps agreements ACTIVE, bank account ACTIVE,
and a green DSA requirements-satisfied banner. Owner reports selecting non-trader;
this records the UI state, not a legal/tax determination. No further bank-processing
wait is needed. Tax-form rows were below the screenshot and are not individually verified.

Added isolated services/apple-verifier Node module using the official Apple library
3.1.0, pinned dependencies and Apple Root CA G3. Online certificate checks are
mandatory; deployment/environment mismatches fail closed. Transactions and nested
notification transactions are signature-verified. No HTTP route or deployment yet.
Four real-library rejection tests pass; existing repository suite remains 60/60.
Valid Apple Sandbox delivery and online OCSP acceptance remain untested.

Next: authenticated verification transport, current refund reconciliation and atomic
source-aware PRO grants, then StoreKit bridge/device tests. No new TestFlight build;
latest owner-accepted build is still 1.0 (12.1). Native purchases remain disabled.
No main merge, production change or App Store submission.

## Apple purchase persistence foundation — 2026-10-14

Added `worker/apple-purchase-ledger.mjs` and staged schema
`worker/schema/apple-purchase-ledger.sql`. Neither is wired to the Worker or
applied to any remote database. Account tokens are server-generated random UUIDs,
unique per account/environment. Expired trials are eligible; missing, disabled
or deleted accounts are not. Deletion retires tokens while retaining opaque
ownership records, so re-registration with the same email cannot reclaim them.

The internal record function consumes only trusted verifier output, runs the
existing policy and rechecks account identity/status inside a D1 batch. The
(environment, transactionId) key makes repeated delivery insert once; conflicting
ownership or purchase facts fail closed. Separate purchases may share an original
transaction ID. No email, bank details, tax identifiers or raw JWS are stored.

`state: recorded` is NOT a grant or permission to finish a StoreKit transaction.
No paid_until update, refund resolution, HTTP endpoint, Apple signature verifier
or native payment flow is implemented here. Source-aware grants and refund events
must be added before delivery can be acknowledged. Retention duration and deletion
policy for the opaque ownership records must be finalized before deployment.

Eight new tests use real in-memory SQLite with a transactional D1 API adapter:
duplicates/interleaved requests, ownership conflicts, account deletion/recreation,
account-change races, rollback/retry, payload rejection and environment separation.
All 60 repository tests pass locally on Node 24.19.0. These tests do not
substitute for remote D1 concurrency or Apple Sandbox testing.

Owner reported completion of tax forms on 2026-10-13 ("only bank account missing"); final Apple acceptance and Paid Apps Agreement activation are not yet verified.
Bank entry postponed until the evening of 2026-10-14. Owner plans to use their
usual personal bank account rather than personal Revolut; account suitability
and bank details are not verified. DSA completion is also not independently
confirmed. Do not store any banking/tax identifiers in the repository.

No new TestFlight build, remote schema change, main merge, production deploy or
App Store submission. Native payment UI remains disabled.

## App Store product configured — 2026-10-13 19:05 Europe/Rome

Owner screenshots confirm creation of non-renewing PRO 30 giorni,
product ID com.calcioreport.app.pro30, Apple product ID 6822393280.
Italy EUR 9.99 was shown in the pricing wizard and the resulting price schedule
appears on the product page. Owner confirmed saving the Italian localization:
PRO 30 giorni / PRO per 30 giorni, senza rinnovo automatico.
The earlier suggested description exceeded Apple's displayed character limit;
use this shorter version. Owner also confirmed saving Italy-only availability
and disabling automatic availability in future territories. Availability scope
is owner-reported, not independently queried through Apple APIs.

At this historical checkpoint, Paid Apps Agreement/banking/tax status was
unverified. See the 2026-10-14 checkpoint above for owner-reported progress.
Review screenshot and submission remain pending.
The product is not evidence of working purchases: signature verification, ledger,
StoreKit bridge and sandbox device tests remain outstanding. No app review
submission, production change or new TestFlight upload in this checkpoint.

## Product

One payment buys 30 days of PRO, without automatic renewal. App Store type:
Non-Renewing Subscription. Selected product ID: `com.calcioreport.app.pro30`;
bundle ID: `com.calcioreport.app`. Product creation confirmed by owner screenshots (Apple product ID 6822393280).
Owner approved the launch price on 2026-10-13 at 18:53 Europe/Rome:
EUR 9.99 for 30 days, no automatic renewal; keep the existing seven-day trial.
Italian storefront price: EUR 9.99, configured as shown in the owner screenshots.
Availability is Italy-only according to the owner. Other storefront prices remain
subject to Apple's localized price configuration. Never hardcode
the checkout price in the UI; display StoreKit's localized product price.

App Store Connect entry values:
- Reference name: `PRO 30 giorni`
- Product ID: `com.calcioreport.app.pro30`
- Italian display name: `PRO 30 giorni`
- Italian description: `PRO per 30 giorni, senza rinnovo automatico`
- Italian customer price: `9,99 EUR`

Product creation, pricing and localization were confirmed on 2026-10-13.
Agreement activation and sandbox product availability still need verification.

## Implemented, not enabled

`worker/apple-purchase-policy.mjs` checks the business constraints of a transaction
AFTER a trusted Apple signature verifier: deployment/environment pairing,
bundle/product/type/quantity, purchased ownership, account token, immutable account
identity, purchase/signed timestamps and absence of revocation. It preserves exact
transaction ID strings, purchase time and the 30-day duration. It does not trust
a client's expiry. Restore does not change the original purchase timestamp.

Seven new tests cover these boundaries; all 52 repository tests pass locally.
The module is not imported by the deployed Worker. It does NOT verify signatures,
persist transactions, grant PRO, handle refunds of earlier grants, or make
retries idempotent on its own. The iPhone payment button remains disabled.

## Required integration before enabling a sandbox purchase

1. DONE per owner screenshots: create the product with the selected ID and approved price. Apple UI:
   Calcio Report > Monetization > Subscriptions > Non-Renewing Subscriptions >
   Manage > +. Reference name: `PRO 30 giorni`. Do not create an auto-renewing plan.
   Product IDs are immutable after saving; copy the selected ID exactly.
2. Implement server verification using Apple's signed-data verifier and trusted
   Apple root certificates. Decide deployment packaging explicitly: current
   Worker is a single file, whereas Apple's Node library needs dependencies and
   runtime support. Do not substitute decode-only JWT parsing. A separate verifier
   on the existing Node relay is a candidate, not an approved production change.
   Check runtime support, authentication and sandbox isolation before choosing it.
3. Token persistence foundation implemented locally, not integrated/deployed.
   Generate and persist a random appAccountToken UUID for each immutable account.
   Require a valid login (including expired TRIAL users) to fetch the token and
   purchase; do not use the paid-access gate for purchase routes. Refresh account
   state before crediting and inside the DB transaction to handle concurrent deletion.
4. Recording ledger implemented locally, not integrated/deployed. The D1 purchase
   ledger is keyed by (environment, transactionId), with immutable ownership.
   Atomic grant application is still required. Duplicate requests, notifications and
   restore must return the prior outcome without extending access again. Keep
   originalTransactionId as metadata, not the uniqueness key for repeat purchases.
5. Finalize entitlement accounting with Stripe/admin/redeem sources. Existing
   `users.paid_until` is an aggregate and cannot safely identify which duration to
   remove after an Apple refund. Do not subtract 30 days blindly or overwrite
   another provider's entitlement. Define stacking and delayed-purchase delivery
   in a source-aware ledger before wiring credits. Existing Stripe retry/payment
   status weaknesses remain a separate known follow-up.
6. Verify App Store Server Notifications V2 and reconcile revocation/refunds and
   restore against Apple server state. A locally verified historical transaction
   alone is insufficient proof that a purchase remains unrevoked. Retain minimal
   ownership/tombstone data under the documented retention policy; never reassign
   a deleted account's purchase to a new account with the same email.
7. Add StoreKit 2 bridge: localized product loading, appAccountToken purchase option,
   cancellation/pending states, transaction updates and restore/reconciliation.
   Finish delivery only after the backend confirms its durable outcome; retry
   interrupted delivery safely. StoreKit local verification cannot replace server
   verification. Never enable purchase UI while server integration is incomplete.
8. Test on isolated Sandbox/D1: first purchase, repeat purchase, duplicate and
   concurrent delivery, expired trial, interrupted network, pending/cancelled,
   restore/reinstall, refund/revocation, wrong-account restore, deletion/recreation
   and mixed web/Apple entitlement. Then obtain authorization for the new TestFlight
   delivery. Production deployment and App Store submission remain separate gates.

No new secret is required for this policy-only checkpoint. Do not paste private
keys into chat or repository files. Existing App Store upload credentials are not
automatically assumed suitable for purchase-server access.

## Official references checked 2026-10-13

- https://developer.apple.com/help/app-store-connect/manage-subscriptions/create-non-renewing-subscriptions
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/
- https://github.com/apple/app-store-server-library-node

## Persistence references checked 2026-10-14

- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developer.apple.com/documentation/storekit/transaction/appaccounttoken
