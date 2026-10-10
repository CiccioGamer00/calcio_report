# Account deletion candidate and email verification proposal

Date: 2026-10-10. Branch: `auth/account-deletion`, based on `main` at `c05438a`.
Status: implementation tested locally; NOT deployed; approval required before merge/deployment.

## Implemented deletion

- `POST /auth/delete`: valid bearer session, current password and exact `ELIMINA` confirmation.
- Available independently of trial/paid expiry. A disabled account with an existing valid session can delete; a disabled account without a session still requires support because login remains blocked.
- Disabled by default. `ACCOUNT_DELETION_ENABLED=1` enables the endpoint and advertises it through `/auth/me`; the footer action is hidden otherwise.
- One parameterized conditional `DELETE` on user ID, email and password hash removes the complete `users` row, including credentials, email, notes, entitlement and activity fields. A concurrent password change cannot cause a stale deletion to succeed. Constraint failures are not reported as success.
- This is the only user-data table referenced by the current Worker. Production D1 schema, additional tables/integrations and backups have NOT been inspected. Confirm actual coverage before presenting this as complete deletion in production. No retention or backup-erasure promise is implied.
- New session and reset tokens include the immutable user ID. All session gates check account identity, preventing an old token from becoming valid after registration with the same email/password. Old tokens use issuance time versus account creation time for compatibility. Reset updates also include the user ID in their conditional write.
- UI reuses the existing modal and footer, requires explicit input, prevents duplicate submissions, clears entered password after a request, and logs out/reloads only after confirmed success. Network ambiguity is shown without claiming the account still exists.
- Other accounts, football cache, panels and TRIAL/PRO duration rules are unchanged. No request to the relay or API-Football is added.

## Payment change requiring review

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

## Remaining product decisions

1. Payment model confirmed: one-time, no subscriptions or automatic renewal. Acceptance of registration-before-payment remains to be confirmed.
2. Confirm policy for deletion followed by re-registration. This candidate keeps the current registration rule (a new account receives seven days). It stores no email tombstone or anti-abuse identifier after deletion. Email verification alone cannot prevent repeated trials. If repeat-trial prevention is required, agree on a separate minimal-retention policy before adding storage.
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

## Local validation and manual release gate

Run all tests with Node >=22.13 (SQLite test support), preferably Node 24:

```bash
node --test tests/*.test.mjs
git diff --check
```

Tests cover real SQLite SQL execution behind a D1-shaped adapter, Worker routes, legacy/new token behavior, password recovery, both duplicate and failed deletion, delayed Stripe events, frontend cancellation/duplicate submit/error handling and the existing suite. This does NOT replace a Cloudflare D1 integration or visual browser test.

Before an approved deployment:

- Resolve the remaining product decisions above and inspect the actual D1 schema/user-data inventory and backup/log retention. The owner has confirmed the one-time payment model.
- Include `/auth/delete` in the existing Cloudflare authentication rate-limit rule before activation. Do not rely on the browser to rate-limit password checks.
- Deploy/test only in an isolated Worker/D1 test environment first. Use test accounts and test-mode billing, never an owner's real paid account.
- Check desktop/mobile modal, keyboard access, cancel, wrong password, successful deletion, another open tab, expired TRIAL and PRO, recovery link invalidation, same-email registration, delayed Stripe event and normal fresh payment.
- Worker and frontend deployment to production and merge remain subject to explicit user approval. No environment setting was changed by this PR.
- Rollout may first deploy with deletion disabled; enable only after the checks. Switch the flag off to stop new deletion requests while retaining webhook protections. Deleted user rows cannot be restored by rolling back code.
