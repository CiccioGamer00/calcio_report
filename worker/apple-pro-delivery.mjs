import { recordVerifiedApplePurchase } from './apple-purchase-ledger.mjs';
import { applyProEvents } from './pro-entitlements.mjs';

/** Internal adapter, not an endpoint. currentTransaction must be signature-
 * verified output of a fresh App Store Server API reconciliation, not just the
 * device's historical JWS. Authentication supplies accountId, never JSON/email.
 */
export async function deliverReconciledApplePurchase(db, accountId, currentTransaction, config, now) {
  const t = currentTransaction;
  if (!t) throw new Error('APPLE_CURRENT_STATE_REQUIRED');
  const revoked = t.revocationDate != null || t.revocationReason != null;
  if (revoked && (!Number.isSafeInteger(t.revocationDate) || t.revocationDate < t.purchaseDate ||
      t.revocationDate > t.signedDate || t.revocationDate > now)) {
    throw new Error('APPLE_REVOCATION_INVALID');
  }
  // Record the original purchase facts even if first seen after a refund.
  // This does not grant access. Grant + refund status are projected atomically.
  const purchase = await recordVerifiedApplePurchase(db, accountId,
    { ...t, revocationDate: undefined, revocationReason: undefined }, config, now);
  const id = `apple:${t.transactionId}`;
  const result = await applyProEvents(db, accountId, config, [
    { id, kind: 'grant', source: 'apple', at: purchase.purchasedAt, durationMs: purchase.durationMs },
    { id: `${id}:${t.signedDate}:${revoked ? 'revoked' : 'active'}`,
      kind: 'status', source: 'apple', at: t.signedDate, targetId: id, revoked },
  ], now);
  return Object.freeze({ ...result, transactionId: t.transactionId });
}
