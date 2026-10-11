# Calcio Report — iOS preparation

Status: proposal, 2026-10-11. No native build, payment integration or submission yet.

## Product and payment decision

Preserve current graphics, football panels, seven-day TRIAL, existing accounts and
one-time 30-day PRO. Recommend Apple In-App Purchase in iOS and existing Stripe
on the web. Apple calls the limited-duration, manually repurchased product a
Non-Renewing Subscription; this does not introduce automatic renewal. Owner
approval of this payment channel and later price/net revenue is still needed.
Existing web PRO should be recognized by the same backend account; Apple guideline
3.1.3(b) permits cross-platform access when the items are also offered as IAP.
Do not assume the current Stripe link can be shipped unchanged worldwide in iOS.
Regional external-payment alternatives have additional terms and are outside this
initial recommended route. No fee percentage is assumed before program review.

## Technical direction

Recommend a Capacitor feasibility prototype reusing the static HTML/CSS/JavaScript
frontend, with packaged assets and the existing Cloudflare API. Do not merely load
the production website through a remote URL. Preserve web deployment independently.
Confirm current stable SDK/plugin versions before implementation; no dependencies
have been installed yet. iOS compilation/signing needs a compatible macOS/Xcode
host (local or hosted). Confirm available build access before buying services.

Audit native origin CORS, keyboard/safe areas, session storage (Keychain bridge),
background/resume handling, recovery links, external navigation and offline/error
states. Apple 4.2 review requires an app experience beyond a repackaged website;
prototype and real-device review are gates, not a guarantee of approval.

## Payment integrity design before implementation

Require a Calcio Report login before native purchase. Bind transaction ownership to
immutable user ID, never the Apple ID email or a client-provided paid_until.
Backend must verify Apple-signed transaction data, environment, bundle/product,
purchase identity, revocation and expiry policy. Store unique transaction IDs and
apply entitlement changes atomically/idempotently. Define repeat purchase stacking,
restore on another device, interrupted/pending purchases, refunds and cross-provider
entitlements before implementation. Do not let old purchases revive a deleted
account automatically. Minimal retained transaction records and deletion/privacy
wording need explicit reconciliation. Sandbox purchases must never grant live PRO.
Existing Stripe idempotency/payment-status follow-up remains separate and known.

## Delivery sequence

1. Confirm Apple purchase route and build access; record product ID and pricing later.
2. Build isolated Capacitor prototype; preserve web UI and test API/CORS/session flow.
3. Implement server-verified Apple purchase ledger, restore/refunds and sandbox tests.
4. Test on iPhone through TestFlight: auth/recovery/deletion, TRIAL/PRO, purchase,
   cancellation/pending/retry, device restore, layout and football panel behavior.
5. Prepare truthful privacy/support URLs, data disclosures, icons/screenshots, age
   rating, demo review access and content/data rights review. Review football
   predictions presentation and any betting links against applicable Apple rules.
6. Request explicit authorization for production changes and App Store submission.

Email verification stays separate; do not silently enable it for current users.

## Official sources checked 2026-10-11

- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-types/
- https://developer.apple.com/help/app-store-connect/manage-subscriptions/create-non-renewing-subscriptions
- https://developer.apple.com/app-store/review/guidelines/ (3.1.1, 3.1.3(b), 4.2)
- https://capacitorjs.com/docs/ios

Documentation-only change: git diff --check; existing 38-test result retained.
No new runtime tests are needed until code changes.
