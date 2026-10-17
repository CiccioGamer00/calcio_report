import { AppStoreServerAPIClient } from '@apple/app-store-server-library';
import { createAppleVerifier } from './verifier.mjs';

class BoundedAppleClient extends AppStoreServerAPIClient {
  async makeFetchRequest(path, query, method, body, headers) {
    return fetch(`${this.urlBase}${path}?${query}`, {
      method, body, headers, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  }
}

// Dependencies here are server-owned. Exported separately for offline contract
// tests; no HTTP input can replace a client or verifier.
export async function reconcileTransaction(verifier, client, signedTransaction) {
  const original = await verifier.transaction(signedTransaction);
  if (typeof original.transactionId !== 'string' || !/^[0-9]{1,64}$/.test(original.transactionId)) {
    throw new Error('APPLE_TRANSACTION_INVALID');
  }
  const response = await client.getTransactionInfo(original.transactionId);
  const current = await verifier.transaction(response.signedTransactionInfo);
  for (const field of ['transactionId', 'originalTransactionId', 'bundleId', 'environment',
    'productId', 'purchaseDate', 'type', 'quantity', 'inAppOwnershipType']) {
    if (current[field] !== original[field]) throw new Error('APPLE_CURRENT_TRANSACTION_MISMATCH');
  }
  if (typeof current.appAccountToken !== 'string' || typeof original.appAccountToken !== 'string' ||
      current.appAccountToken.toLowerCase() !== original.appAccountToken.toLowerCase() ||
      !Number.isSafeInteger(current.signedDate) || !Number.isSafeInteger(original.signedDate) ||
      current.signedDate < original.signedDate) throw new Error('APPLE_CURRENT_TRANSACTION_MISMATCH');
  return current;
}

export function createAppleReconciler(config) {
  const verifier = createAppleVerifier(config);
  if (typeof config.signingKey !== 'string' || !config.signingKey.includes('PRIVATE KEY') ||
      typeof config.keyId !== 'string' || !/^[A-Za-z0-9]{10}$/.test(config.keyId) ||
      typeof config.issuerId !== 'string' || !/^[a-f0-9-]{36}$/i.test(config.issuerId)) {
    throw new Error('APPLE_API_CONFIG_INVALID');
  }
  const client = new BoundedAppleClient(config.signingKey, config.keyId, config.issuerId,
    'com.calcioreport.app', config.environment);
  return Object.freeze({
    transaction: jws => reconcileTransaction(verifier, client, jws),
    async notification(jws) {
      const { notification } = await verifier.notification(jws);
      const signed = notification.data?.signedTransactionInfo;
      // TEST and other verified notifications without transaction data have
      // no entitlement effect. They may be acknowledged only after verification.
      if (!signed) return null;
      return reconcileTransaction(verifier, client, signed);
    },
  });
}
