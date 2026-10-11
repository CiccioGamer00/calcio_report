# Calcio Report — iOS preparation

Status: isolated native prototype, 2026-10-11. Unsigned compile passes; signed device archive validation passes. No payment integration or submission yet.

## Product and payment decision

Preserve current graphics, football panels, seven-day TRIAL, existing accounts and
one-time 30-day PRO. Recommend Apple In-App Purchase in iOS and existing Stripe
on the web. Apple calls the limited-duration, manually repurchased product a
Non-Renewing Subscription; this does not introduce automatic renewal. Owner delegated the valid technical/payment route on 2026-10-11 and confirmed
Apple Developer membership. Proceed with Apple IAP design; pricing, contractual
enrollment and any paid service require an informed owner decision.
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

## Windows-only build decision — 2026-10-11

Owner confirmed Windows only; do not request a local Mac or Xcode installation.
Repository visibility verified as public. Prefer standard GitHub-hosted macOS
runners for an initial unsigned simulator compile, followed by separately gated
signing/TestFlight delivery. GitHub documents standard hosted runners as free for
public repositories; this does not imply all artifact storage or larger runners
are free. Keep artifact retention short and avoid paid runner sizes/services.

First compile should need no Apple secrets. Later signing must use protected
GitHub secrets and a trusted workflow, not credentials committed in this public
repository or exposed to pull requests. Do not request Apple account passwords in
chat. Configure certificates/profiles and App Store Connect upload only when the
native build is ready. Build tooling and credentials remain unconfigured today.

Sources:
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications

Commercial follow-up: apply for Small Business Program eligibility/approval before
assuming 15% commission. Owner membership is confirmed but Small Business enrollment
is not. Current Apple EU documentation reviewed 2026-10-11 lists 26% standard IAP,
15% eligible program IAP; confirm applicable account terms before pricing. No
purchase, enrollment, paid CI service or submission has been performed.

## Prototype implementation checkpoint

Added mobile/package.json and lockfile (Capacitor 8.5.3), prototype-only app ID
com.calcioreport.prototype, allowlisted web packaging and unsigned simulator CI.
Packaged config always targets the isolated test Worker with payment/contact links
disabled; source production config/UI unchanged. iOS project is generated from
pinned npm dependencies; generated assets, iOS and node_modules are ignored.
Local packaging, cap add ios and all 38 existing tests passed. Native compilation
must be verified by the macOS workflow; no local Xcode, signed build, TestFlight
upload, runtime iPhone test, purchase support or secure native session storage yet.
Native CORS and recovery remain follow-up gates before device testing.

## Native viewport checkpoint

Unsigned macOS compile passed for 5117b06 (Actions 38124190575). Added packaged-only
safe-area/visual viewport layout for keyboard-sized modals and a clear unavailable
purchase message; production frontend files are unchanged. Packaging, JavaScript
syntax and a runtime smoke for purchase messaging/viewport resize passed. These
checks do not replace real iPhone visual testing. Signing, secure native token
storage and recovery-link handling still precede a usable TestFlight handoff.

## Apple app record confirmed — 2026-10-11

Owner screenshots confirm the explicit identifier com.calcioreport.app is
registered and the Calcio Report app record exists in App Store Connect (iOS 1.0,
prepare for submission). Capacitor now uses this identifier and display name.
The build still targets only the test backend and disables payments; this does
not change it into a production build. No certificate/profile/upload key has been
configured and no signed build has been uploaded. DSA status remains outstanding
for EU distribution. Do not modify the unrelated OCR app identifier.

## Signing setup checkpoint — 2026-10-11 afternoon

Owner created a Developer-role team API key and saved APP_STORE_CONNECT_KEY_ID,
APP_STORE_CONNECT_ISSUER_ID and APP_STORE_CONNECT_PRIVATE_KEY as repository secrets
(names confirmed by screenshot, values not inspected). Owner generated an encrypted
RSA key/CSR on Windows, downloaded a new Apple Distribution certificate, exported
a password-protected P12, and confirmed saving IOS_DISTRIBUTION_P12_BASE64,
IOS_DISTRIBUTION_P12_PASSWORD and IOS_PROVISION_PROFILE_BASE64. Original iOS
Distribution certificate expiring 2027-10-05 remains untouched.

Unsigned compilation also passed at e7ef13e (Actions 38125225376). Added a trusted
branch-only signing check that validates team/app/profile type/expiration and
certificate matching, imports the P12 into an ephemeral keychain, archives the
test-backend app for devices and verifies its signature. No upload or artifacts;
App Store Connect API secrets are not used by this check. Dependencies are
installed before signing secrets are provided. Actions are pinned to commit SHAs.
Signing PASSED at 945a1da, Actions run 38144848197 / job 114485941251: profile
validation, P12 import/matching, Release device archive and codesign verification
all succeeded. No IPA export/upload or App Store API authentication tested.
This is not a TestFlight-ready app:
native storage, recovery and real-device behavior remain outstanding.

## Native session and recovery candidate — 2026-10-11

Packaged iOS copies now use @aparajita/capacitor-secure-storage 8.0.1 with
Keychain whenUnlockedThisDeviceOnly, explicit no-iCloud synchronization and a
single session record. A non-secret installation/logout marker prevents restoring
a Keychain session after reinstall or failed logout removal. Legacy plaintext
prototype credentials are discarded, not migrated. Native storage failure blocks
use instead of falling back to localStorage. Source web app and Worker unchanged.

Guarded packaging patches await session hydration and persistence, route API reads
to in-memory credentials, and clear the session on logout/deletion/reset. A
packaged-only recovery field accepts a pasted exact HTTPS Calcio Report reset
link, clears the input immediately and opens the existing reset form. Tokens are
never put in navigation URLs by this flow. Backend signature/single-use checks
remain authoritative; test-backend builds cannot reset production accounts.
Automatic email-to-app Universal Links are not implemented. Test Worker Resend
configuration/email delivery remains to be checked before device recovery tests.

45 local tests pass including failure/restart/race/expiry/link-validation cases;
packaging and generated JS syntax pass. New native plugin simulator compilation and signed device archive PASSED
at 18a01d2 (Actions 38145418576 and 38145414073). Real iPhone login/restart/logout/deletion/recovery remains a manual
gate before distribution. App Store API authentication/upload is still untested.
