import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { SignedDataVerifier } from '@apple/app-store-server-library';

// Server-owned trust anchor. Never accept certificates or environment from a request.
const root = new X509Certificate(readFileSync(new URL('./certs/AppleRootCA-G3.pem', import.meta.url)));
const bundleId = 'com.calcioreport.app';
const maxJwsBytes = 128 * 1024;

function checkJws(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > maxJwsBytes ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('APPLE_SIGNED_DATA_INVALID');
  }
}

/** Internal Node module, not an HTTP endpoint or entitlement grant.
 * Online certificate checks are mandatory. Verification errors propagate:
 * never fall back to decoding, offline verification or another environment.
 * A valid historical JWS still requires current refund/revocation reconciliation.
 */
export function createAppleVerifier({ deployment, environment, appAppleId } = {}) {
  if (!((deployment === 'test' && environment === 'Sandbox') ||
        (deployment === 'production' && environment === 'Production')) ||
      (environment === 'Production' && (!Number.isSafeInteger(appAppleId) || appAppleId <= 0))) {
    throw new Error('APPLE_VERIFIER_CONFIG_INVALID');
  }
  const verifier = new SignedDataVerifier([root.raw], true, environment, bundleId, appAppleId);
  return Object.freeze({
    async transaction(jws) {
      checkJws(jws);
      return verifier.verifyAndDecodeTransaction(jws);
    },
    async notification(jws) {
      checkJws(jws);
      const notification = await verifier.verifyAndDecodeNotification(jws);
      const signedTransaction = notification.data?.signedTransactionInfo;
      // Nested signed data needs its own signature and app/environment validation.
      let transaction = null;
      if (signedTransaction !== undefined) {
        checkJws(signedTransaction);
        transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
      }
      return { notification, transaction };
    },
  });
}
