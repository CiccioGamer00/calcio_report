# Account deletion candidate and email verification proposal

Date: 2026-10-10. Branch: `auth/account-deletion`, based on `main` at `c05438a`.
Status: tested locally and in the isolated test environment; NOT released to production; approval required before merge/production deployment.

## Implemented deletion

- `POST /auth/delete`: valid bearer session, current password and exact `ELIMINA` confirmation.
- Available independently of trial/paid expiry. A disabled account with an existing valid session can delete; a disabled account without a session still requires support because login remains blocked.
- Disabled by default. `ACCOUNT_DELETION_ENABLED=1` enables the endpoint and advertises it through `/auth/me`; the footer action is hidden otherwise.
- One transactional D1 `batch` removes the user’s `trial_search_log`, `trial_usage` and `users` records, including credentials, email, notes, entitlement, activity and trial counters. Every deletion is guarded by the authenticated user ID, email and current password hash. A concurrent reset/re-registration leaves all records untouched. Any SQL error rolls back the entire batch; failures are not reported as success.
- The owner’s 2026-10-10 schema screenshot confirms these three application tables in D1 `calcio_users`, plus `_cf_KV` (Cloudflare-managed; never delete or copy it). The initial users-only implementation was corrected before deployment. `tests/fixtures/account-schema.sql` reproduces the supplied application table definitions for an empty isolated test database. External integrations, triggers and backups have not been inventoried; no backup-erasure or provider-record deletion promise is implied.
- New session and reset tokens include the immutable user ID. All session gates check account identity, preventing an old token from becoming valid after registration with the same email/password. Old tokens use issuance time versus account creation time for compatibility. Reset updates also include the user ID in their conditional write.
- UI reuses the existing modal and footer, requires explicit input, prevents duplicate submissions, clears entered password after a request, and logs out/reloads only after confirmed success. Network ambiguity is shown without claiming the account still exists.
- Other accounts, football cache, panels and TRIAL/PRO duration rules are unchanged. No request to the relay or API-Football is added.

## Payment flow accepted by owner

The previous Stripe webhook creates a passwordless user when no matching account exists. Keeping this behavior would allow delayed payment events to recreate a deleted account.

The candidate therefore requires registration BEFORE payment:

- Unknown account: acknowledge the signed webhook without creating a user; emit a generic diagnostic without email/token/payment payload.
- Checkout older than the current account: acknowledge without granting access, so a checkout from the deleted account cannot credit its replacement.
- Existing account and new checkout: retain the existing 30-day extension. The update is conditional on immutable user ID, preventing a concurrent delete/re-registration from crediting the wrong account.
- This protection stays active even when self-service deletion is switched off. Do not roll back to a Worker that recreates users after deletion has been enabled.
- Stripe checkout creation has second precision while account creation has millisecond precision. A checkout in the same second as registration can be conservatively rejected; support must reconcile this rare case. Account-ID metadata in server-created checkout sessions is a future stronger link.
- The owner confirmed on 2026-10-10 that PRO payments are one-time, with no subscriptions or automatic renewal. Subscription cancellation is therefore outside the current product scope and is not a release blocker. Deletion does not automatically refund the payment or remove provider receipts/customer records.
- Payments received without an eligible account require manual reconciliation/refund assessment. Do not silently promise PRO access to pre-registration payments.
- Existing webhook duplicate-event/idempotency behavior is outside this change; this is not a full billing audit.

## Product decisions and remaining proposals

1. Payment model confirmed: one-time, no subscriptions or automatic renewal. Registration/login before payment explicitly accepted on 2026-10-10; the purchase must grant 30-day PRO to that registered user.
2. Agreed on 2026-10-10: allow a fresh seven-day TRIAL after deletion and re-registration, including the same email. Preserve the current implementation; no email tombstone or anti-abuse identifier is retained after deletion. The user accepts repeat free access because prediction remains PRO-only and other email addresses could bypass an email-only restriction anyway. Reassess if actual abuse or API costs become material; do not add speculative tracking. Email verification remains useful for ownership, not as a guarantee against repeat trials.
3. Approve or revise the email verification proposal below; it is intentionally not implemented in this PR.

## Proposed email verification

Recommendation: require ownership verification for NEW registrations; preserve current access for existing TRIAL/PRO users without claiming that their emails were verified.

Proposed experience:

1. Email/password entry creates a pending registration, with no ordinary session or football access yet.
2. Resend sends a verification link (separate scope and template from password reset); expose a resend action with a cooldown and generic response. Mention spam, given the observed Libero delivery issue.
3. Opening the link displays a confirmation; final activation uses POST, not an automatic GET, to avoid consuming links in email scanners.
4. A single-use expiring token activates the account atomically. Start the seven-day trial at confirmation, not at email submission. Old/unverified sessions must not become authenticated merely by activating someone else's email.
5. New pending users can correct a typo/restart registration; resends must not let an attacker replace the original password unnoticed. Expired pending registrations require cleanup.

Implementation implications:

- Versioned D1 migration for verification state and pending token hash/expiry (random token, hashed at rest). Distinguish grandfathered existing accounts from genuinely verified accounts.
- Central access gate, registration, login, recovery, `/auth/me` and deletion must agree on pending status. Recovery must not inadvertently bypass verification.
- Separate `email-verification` purpose; no reuse of session/license/reset tokens. Fragment links, trusted configured app origin, no token logging.
- Rate-limit register, verify and resend; enforce resend cooldown and delivery failure handling. Verify email template delivery without exposing secrets.
- Deleting a pending account must also remove its verification records. Payment cannot create or activate an unverified account.
- Keep existing normalization consistent during rollout; changing case/alias handling requires a separate collision audit.

Sources reviewed:

- https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://docs.stripe.com/api/checkout/sessions/object
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

## Local validation and manual release gate

Run all tests with Node >=22.13 (SQLite test support), preferably Node 24:

```bash
node --test tests/*.test.mjs
git diff --check
```

31 tests pass on Node 24. Tests cover real SQLite SQL execution and transaction rollback behind a D1-shaped adapter, Worker routes, legacy/new token behavior, password recovery, both duplicate and failed deletion, delayed Stripe events, frontend cancellation/duplicate submit/error handling and the existing suite. This does NOT replace a Cloudflare D1 integration or visual browser test.

Before an approved deployment:

- Resolve the remaining product decisions above and review external data integrations and backup/log retention. The D1 table definitions have been inspected through the owner-provided schema output. The owner has confirmed the one-time payment model.
- Include `/auth/delete` in the existing Cloudflare authentication rate-limit rule before activation. Do not rely on the browser to rate-limit password checks.
- Deploy/test only in an isolated Worker/D1 test environment first. Use test accounts and test-mode billing, never an owner's real paid account.
- Check desktop/mobile modal, keyboard access, cancel, wrong password, successful deletion, another open tab, expired TRIAL and PRO, recovery link invalidation, same-email registration, delayed Stripe event and normal fresh payment.
- Worker and frontend deployment to production and merge remain subject to explicit user approval. No environment setting was changed by this PR.
- Rollout may first deploy with deletion disabled; enable only after the checks. Switch the flag off to stop new deletion requests while retaining webhook protections. Deleted user rows cannot be restored by rolling back code.


## Isolated live checkpoint — 2026-10-10

The owner created `calcio_users_test`, ran the supplied schema, configured a separate
`LICENSE_SECRET` and `ACCOUNT_DELETION_ENABLED=1`, and deployed the candidate to
`https://calcio-report-test.stemoro84.workers.dev` (production remains unchanged).
The binding to the test database was visible in the owner's dashboard screenshot.

15 live backend checks passed: registration, `/auth/me`, deletion availability,
invalid password/confirmation handling, successful D1 batch deletion, old session
and login rejection, same-email/password registration, a fresh seven-day trial,
and rejection of an old token attempting to delete the replacement account.
All disposable accounts were cleaned up; no external provider requests were made.
This live run had no preseeded trial rows; row cleanup and rollback failures were
verified separately by the SQLite transaction tests, not by modifying remote schema.

### Browser test handoff

From the existing repository folder, run this entire block:

```powershell
git fetch origin
git switch auth/account-deletion
git pull --ff-only origin auth/account-deletion
py scripts/serve-account-test.py
```

Open `http://127.0.0.1:5501`. The page shows COLLAUDO ACCOUNT; leave the terminal
open. The server binds only to loopback, serves a test-specific `config.js` response,
disables payment links and leaves the tracked configuration unchanged. No football
relay or email delivery is configured for this account-only test environment.
Use dummy credentials, for example `collaudo-stefano@example.invalid`.

Check registration/TRIAL badge, footer deletion action, cancel, wrong password,
correct deletion/logout, rejected old login and same-email registration with seven
days. Repeat the modal check with a narrow browser window. Remove the dummy account
at the end and stop the local server with Ctrl+C. Report any error text verbatim.

### Owner browser confirmation and pause — 2026-10-10

The owner confirmed all six requested browser steps passed: registration, cancel,
wrong-password rejection, successful deletion/logout, rejected old login and
same-email registration with a fresh seven-day TRIAL. Narrow/mobile layout and
final cleanup of the owner-created dummy account were not separately reported.

Work is paused to conserve credits. Preserve the existing 31 local tests and 15
live backend checks as completed evidence; repeat only if a relevant change warrants
it. Resume with the remaining release decisions/checks in PROJECT_STATUS.md, then
obtain explicit approval before merge or production deployment. Email verification
remains evaluated only. Main and production are unchanged.

## Resumed release review — 2026-10-10

The credit pause is over. The existing six-step manual deletion result and 15
isolated backend checks remain valid for the unchanged Worker. No production
settings, schema, secrets or deployment have been changed in this review.

### Purchase flow accepted by owner

All in-app payment entries now go through `/auth/me` before offering checkout.
Anonymous/expired sessions must log in or register; deleted/disabled accounts and
network failures do not open checkout. An expired TRIAL or expired PRO entitlement
can still purchase with a valid account. A second explicit click opens the provider
page, avoiding asynchronous popup blocking. The confirmation cannot be hidden by
saved hint preferences. Logout/account changes invalidate that confirmation.
The existing design is preserved; the purchase copy now says one-time 30-day PRO,
not a subscription. Email verification remains a proposal for a later PR.

This is a UX safeguard, not a server-created checkout session. Public/shared Stripe
links still work outside the app, and an account can be deleted while a checkout is
open. The webhook continues to reject absent/replaced accounts; exceptional paid
orders require support reconciliation. The owner accepted registration/login before payment on 2026-10-10.
The current webhook matches by payment email, so the same email remains required;
this is not a guarantee against mistyped email or a shared checkout link. No real payment was made or initiated.

### Data inventory from repository code

| Location | What the code sends/stores | Deletion coverage |
| --- | --- | --- |
| D1 users | Credentials, email, account ID, entitlement, note and activity | Conditional atomic deletion |
| D1 trial tables | Email-linked counters and search IDs | Deleted in the same transaction |
| Browser | Session token/time, UI preferences, football caches | Token/time removed on successful deletion; public football caches/preferences retained |
| Stripe | Checkout email and payment/receipt records | No provider deletion or automatic refund |
| Resend | Recovery email recipient and reset-link message | No provider history/mailbox deletion; old reset token invalidated |
| OVH/API-Football | Football query plus server transport authentication | No account email/password/session forwarded by fetchRelay |
| Cloudflare/OVH logs and D1 backups | Depends on dashboard/server retention configuration | Not inspectable from repository; do not claim erased |

Repository inspection cannot confirm external triggers, exports, dashboards or
backup retention. A database restore can restore deleted records: do not restore
an old production snapshot without reconciling deletions through a controlled
operational process. No retained email blacklist is added.

### Activation sequence (requires explicit approval; not performed)

1. Registration-before-payment accepted on 2026-10-10. Review exceptional payment support
   and actual backup/log retention with the owner.
2. In the EXISTING Cloudflare auth rate-limit rule, preserve its hostname/scope and
   thresholds, and add the exact path `/auth/delete` alongside login/register/
   forgot/reset. Existing recorded policy: 5 requests per IP / 10 seconds and a
   10-second block. Do not replace the whole expression with a path-only rule.
   Confirm the rule covers the public Worker hostname actually used by config.js;
   if it does not, activation is blocked until an effective backend/edge limit exists.
3. After release approval, deploy the reviewed Worker with deletion disabled,
   preserving production secrets/bindings and AUTH_PASSWORD_V2; merge the frontend
   only with explicit approval. Do not execute the empty test schema in production.
4. Verify the rate-limit coverage, then enable deletion only under that approval.
   Use a disposable account for the production smoke. Do not reuse test secrets.
5. Emergency stop: disable ACCOUNT_DELETION_ENABLED. Keep the new account-ID and
   Stripe protections; never roll back to the old webhook that recreates users.

### Validation at this checkpoint

38 local tests pass on Node 24, including six new payment-flow tests and a real
PBKDF2 deletion test matching the production hash flag. The asset version is
20261010r2. The Worker source is unchanged from the isolated deployment. No external
email/payment/football requests are made by the local suite.

Remaining manual checks: changed purchase UI and narrow/keyboard modal usability.
The test server now supports a LOCAL mock checkout. From the repository folder:

```powershell
git fetch origin
git switch auth/account-deletion
git pull --ff-only origin auth/account-deletion
py scripts/serve-account-test.py --mock-payment
```

Stop any older local server with Ctrl+C first. Open http://127.0.0.1:5501:
logged-out Acquista PRO must ask for login; with a dummy test account it must show
the one-time 30-day confirmation; Vai al pagamento opens only a local page saying
Pagamento simulato. No Stripe request, real payment or entitlement activation occurs.
Default invocation still disables all payment URLs. Both mock routes were smoke
checked locally. Test the deletion modal in a narrow window and with Tab/Escape;
no need to repeat the completed six-step deletion flow. Stop the server with Ctrl+C.

Separate billing follow-up: the existing webhook does not persist fulfillment
IDs and does not check payment_status before extension. Duplicate/delayed payment
handling needs its own small billing patch before enabling additional asynchronous
payment methods; this review does not claim a full billing audit or change those
pre-existing semantics. Stripe reference:
https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted

### Purchase UI manual result — 2026-10-10

Owner confirmed all three purchase checks passed, including the logged-out gate
after explicitly logging out. Screenshots showed the authenticated one-time PRO
confirmation and the local simulated-payment success page. No real Stripe payment
or PRO activation was exercised. Do not repeat this flow absent a relevant change.
Next: inspect the existing Cloudflare authentication rate-limit rule and actual API
hostname coverage. Production activation/merge still require explicit approval.
Narrow/keyboard deletion-modal checks and external retention settings remain unverified.
