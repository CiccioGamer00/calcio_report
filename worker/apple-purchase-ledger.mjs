// Internal persistence foundation, NOT an HTTP route or entitlement service.
// Callers must authenticate the account and verify the Apple JWS first.
// A recorded purchase is NOT a durable PRO grant: do not finish StoreKit delivery
// based on this module's result. Revocation reconciliation remains required.
import { validateApplePurchase } from './apple-purchase-policy.mjs';

function fail(code) { throw new Error(code); }
function context(accountId, config, now) {
  if (typeof accountId !== 'string' || !accountId ||
      !Number.isSafeInteger(now) || now <= 0) fail('APPLE_CONTEXT_INVALID');
  if (!config || !['test', 'production'].includes(config.deployment) ||
      config.environment !== (config.deployment === 'test' ? 'Sandbox' : 'Production') ||
      typeof config.bundleId !== 'string' || !config.bundleId ||
      typeof config.productId !== 'string' || !config.productId) fail('APPLE_CONFIG_INVALID');
}
function results(batch) {
  if (!Array.isArray(batch) || batch.length !== 2 ||
      batch.some(r => r.success !== true)) fail('APPLE_STORAGE_FAILED');
  return batch[1].results?.[0];
}

// Account ID must come from the authenticated session, never from request JSON.
// No paid-access gate: expired trials may still obtain a purchase token.
export async function ensureAppleAccountToken(db, accountId, config, now) {
  context(accountId, config, now);
  const token = crypto.randomUUID().toLowerCase();
  const row = results(await db.batch([
    db.prepare(`INSERT INTO apple_account_tokens
      (environment, account_id, app_account_token, created_at)
      SELECT ?, id, ?, ? FROM users
      WHERE id = ? AND COALESCE(disabled, 0) = 0 AND created_at > 0 AND created_at <= ?
      ON CONFLICT(environment, account_id) DO NOTHING`)
      .bind(config.environment, token, now, accountId, now),
    db.prepare(`SELECT t.app_account_token FROM apple_account_tokens t
      JOIN users u ON u.id = t.account_id
      WHERE t.environment = ? AND t.account_id = ? AND t.retired_at IS NULL
      AND COALESCE(u.disabled, 0) = 0 AND u.created_at > 0 AND u.created_at <= ?`)
      .bind(config.environment, accountId, now),
  ]));
  if (!row) fail('APPLE_ACCOUNT_UNAVAILABLE');
  return row.app_account_token;
}

// verifiedTransaction MUST be output from the trusted server signature verifier.
// This function validates policy itself; it never accepts a caller-built grant.
export async function recordVerifiedApplePurchase(db, accountId, verifiedTransaction, config, now) {
  context(accountId, config, now);
  const account = await db.prepare(`SELECT u.id, u.created_at AS createdAt,
    COALESCE(u.disabled, 0) AS disabled, t.app_account_token AS appAccountToken
    FROM users u JOIN apple_account_tokens t ON t.account_id = u.id
    WHERE u.id = ? AND t.environment = ? AND t.retired_at IS NULL`)
    .bind(accountId, config.environment).first();
  const p = validateApplePurchase(verifiedTransaction, account, config, now);
  const batch = await db.batch([
    db.prepare(`INSERT INTO apple_purchase_ledger
      (environment, transaction_id, original_transaction_id, account_id,
       app_account_token, product_id, purchased_at, signed_at, duration_ms, recorded_at)
      SELECT ?, ?, ?, u.id, t.app_account_token, ?, ?, ?, ?, ?
      FROM users u JOIN apple_account_tokens t ON t.account_id = u.id
      WHERE u.id = ? AND u.created_at = ? AND COALESCE(u.disabled, 0) = 0
      AND t.environment = ? AND t.app_account_token = ? AND t.retired_at IS NULL
      ON CONFLICT(environment, transaction_id) DO NOTHING`)
      .bind(p.environment, p.transactionId, p.originalTransactionId, p.productId,
        p.purchasedAt, p.signedAt, p.durationMs, now, accountId, account.createdAt,
        p.environment, p.appAccountToken),
    db.prepare(`SELECT l.* FROM apple_purchase_ledger l
      JOIN users u ON u.id = l.account_id
      JOIN apple_account_tokens t ON t.account_id = l.account_id AND t.environment = l.environment
      WHERE l.environment = ? AND l.transaction_id = ? AND l.account_id = ?
      AND u.created_at = ? AND COALESCE(u.disabled, 0) = 0 AND t.retired_at IS NULL
      AND t.app_account_token = ?`)
      .bind(p.environment, p.transactionId, accountId, account.createdAt, p.appAccountToken),
  ]);
  const row = results(batch);
  if (!row) fail('APPLE_PURCHASE_NOT_RECORDED');
  // A repeated delivery may have a newer signedDate; immutable purchase facts
  // must match. Another account's conflicting purchase is never returned.
  if (row.original_transaction_id !== p.originalTransactionId ||
      row.app_account_token !== p.appAccountToken || row.product_id !== p.productId ||
      row.purchased_at !== p.purchasedAt || row.duration_ms !== p.durationMs) {
    fail('APPLE_TRANSACTION_CONFLICT');
  }
  return Object.freeze({ state: 'recorded', duplicate: batch[0].meta.changes === 0,
    transactionId: row.transaction_id, accountId: row.account_id,
    purchasedAt: row.purchased_at, durationMs: row.duration_ms });
}
