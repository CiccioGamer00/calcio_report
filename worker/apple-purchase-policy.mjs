// Server-side policy AFTER successful Apple JWS verification. This module does
// not verify signatures and must never be called with client-decoded JSON.
// Not imported by worker.js until the verifier and atomic ledger are ready.
export const APPLE_PRO_DAYS = 30;
export const APPLE_PRO_MS = APPLE_PRO_DAYS * 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const environments = new Set(['Sandbox', 'Production']);
function fail(code) { throw new Error(code); }
function timestamp(value) { return Number.isSafeInteger(value) && value > 0; }

/**
 * transaction: decoded payload from a trusted Apple signature verifier.
 * account: freshly loaded DB account; appAccountToken is a server-created UUID
 * mapped to this immutable account ID, never an email or request-body value.
 * config: server-owned allowlist. Sandbox is accepted ONLY in a test deployment.
 * Returns a ledger candidate, NOT permission to update users.paid_until directly.
 */
export function validateApplePurchase(transaction, account, config, now) {
  if (!timestamp(now) || !config ||
      !environments.has(config.environment) ||
      !['test', 'production'].includes(config.deployment) ||
      (config.deployment === 'test' ? config.environment !== 'Sandbox' : config.environment !== 'Production') ||
      typeof config.bundleId !== 'string' || !config.bundleId ||
      typeof config.productId !== 'string' || !config.productId) fail('APPLE_CONFIG_INVALID');
  if (!account || typeof account.id !== 'string' || !account.id ||
      !timestamp(account.createdAt) || account.createdAt > now ||
      ![0, false].includes(account.disabled) ||
      typeof account.appAccountToken !== 'string' || !uuid.test(account.appAccountToken)) fail('APPLE_ACCOUNT_UNAVAILABLE');
  const t = transaction;
  if (!t || t.environment !== config.environment ||
      t.bundleId !== config.bundleId || t.productId !== config.productId ||
      t.type !== 'Non-Renewing Subscription' || t.quantity !== 1 ||
      t.inAppOwnershipType !== 'PURCHASED') fail('APPLE_PRODUCT_MISMATCH');
  if (typeof t.appAccountToken !== 'string' || !uuid.test(t.appAccountToken) ||
      t.appAccountToken.toLowerCase() !== account.appAccountToken.toLowerCase()) fail('APPLE_ACCOUNT_MISMATCH');
  // Keep Apple's numeric IDs as strings: they may exceed JS integer precision.
  for (const value of [t.transactionId, t.originalTransactionId]) {
    if (typeof value !== 'string' || !/^[0-9]{1,64}$/.test(value)) fail('APPLE_TRANSACTION_INVALID');
  }
  if (!timestamp(t.purchaseDate) || t.purchaseDate < account.createdAt ||
      t.purchaseDate > now || !timestamp(t.signedDate) ||
      t.signedDate < t.purchaseDate || t.signedDate > now ||
      !Number.isSafeInteger(t.purchaseDate + APPLE_PRO_MS)) fail('APPLE_DATE_INVALID');
  if (t.revocationDate != null || t.revocationReason != null) fail('APPLE_PURCHASE_REVOKED');
  return Object.freeze({
    environment: t.environment,
    transactionId: t.transactionId,
    originalTransactionId: t.originalTransactionId,
    accountId: account.id,
    appAccountToken: account.appAccountToken.toLowerCase(),
    productId: t.productId,
    purchasedAt: t.purchaseDate,
    signedAt: t.signedDate,
    durationMs: APPLE_PRO_MS,
  });
}
