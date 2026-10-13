# Apple PRO purchases — implementation checkpoint

2026-10-13. Work branch: `mobile/ios-preparation`, draft PR #14.

## Product

One payment buys 30 days of PRO, without automatic renewal. App Store type:
Non-Renewing Subscription. Selected product ID: `com.calcioreport.app.pro30`;
bundle ID: `com.calcioreport.app`. The product has NOT been confirmed as created.
Owner approved the launch price on 2026-10-13 at 18:53 Europe/Rome:
EUR 9.99 for 30 days, no automatic renewal; keep the existing seven-day trial.
Target Italian storefront price: EUR 9.99. This is a commercial decision, NOT
confirmation that the price has been saved in App Store Connect. Other storefront
prices remain subject to Apple's localized price configuration. Never hardcode
the checkout price in the UI; display StoreKit's localized product price.

App Store Connect entry values:
- Reference name: `PRO 30 giorni`
- Product ID: `com.calcioreport.app.pro30`
- Italian display name: `PRO 30 giorni`
- Italian description: `Accesso alle funzioni PRO per 30 giorni, senza rinnovo automatico.`
- Italian customer price: `9,99 EUR`

Product creation, pricing, localization, agreements and sandbox availability
still need verification in the owner's App Store Connect account.

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

1. Create the product with the selected ID and approved price in App Store Connect. Apple UI:
   Calcio Report > Monetization > Subscriptions > Non-Renewing Subscriptions >
   Manage > +. Reference name: `PRO 30 giorni`. Do not create an auto-renewing plan.
   Product IDs are immutable after saving; copy the selected ID exactly.
2. Implement server verification using Apple's signed-data verifier and trusted
   Apple root certificates. Decide deployment packaging explicitly: current
   Worker is a single file, whereas Apple's Node library needs dependencies and
   runtime support. Do not substitute decode-only JWT parsing. A separate verifier
   on the existing Node relay is a candidate, not an approved production change.
   Check runtime support, authentication and sandbox isolation before choosing it.
3. Generate and persist a random appAccountToken UUID for each immutable account.
   Require a valid login (including expired TRIAL users) to fetch the token and
   purchase; do not use the paid-access gate for purchase routes. Refresh account
   state before crediting and inside the DB transaction to handle concurrent deletion.
4. Add a D1 purchase ledger keyed by (environment, transactionId), with immutable
   ownership and atomic grant application. Duplicate requests, notifications and
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
