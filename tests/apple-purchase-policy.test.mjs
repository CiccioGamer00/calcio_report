import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApplePurchase, APPLE_PRO_MS } from '../worker/apple-purchase-policy.mjs';

const now = 1791900000000;
const token = '07bdb408-65ec-4b17-88be-fecbe4a32aa7';
const account = { id: 'immutable-account-id', createdAt: now - 100000, disabled: 0, appAccountToken: token };
const config = { deployment: 'test', environment: 'Sandbox', bundleId: 'com.calcioreport.app', productId: 'com.calcioreport.app.pro30' };
const transaction = {
  environment: 'Sandbox', bundleId: config.bundleId, productId: config.productId,
  type: 'Non-Renewing Subscription', quantity: 1, inAppOwnershipType: 'PURCHASED',
  appAccountToken: token, transactionId: '90071992547409930', originalTransactionId: '90071992547409929',
  purchaseDate: now - 1000, signedDate: now - 500,
};
const check = (t = {}, a = {}, c = {}) => validateApplePurchase({ ...transaction, ...t }, { ...account, ...a }, { ...config, ...c }, now);

test('verified Apple candidate preserves exact identity and 30-day duration without trusting client expiry', () => {
  const result = check({ paid_until: now + 999999999999, expiresDate: now + 999999999999 });
  assert.equal(result.transactionId, transaction.transactionId);
  assert.equal(result.accountId, account.id);
  assert.equal(result.durationMs, 30 * 86400000);
  assert.equal(result.durationMs, APPLE_PRO_MS);
  assert.equal(result.purchasedAt, transaction.purchaseDate);
  assert.equal('paid_until' in result, false);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(check({ appAccountToken: token.toUpperCase() }), check());
});

test('Sandbox and Production are isolated in both directions and config fails closed', () => {
  for (const c of [{ deployment: 'production' }, { environment: 'Production' },
    { deployment: undefined }, { environment: 'Xcode' }, { productId: '' }, { bundleId: '' }]) {
    assert.throws(() => check({}, {}, c), /APPLE_CONFIG_INVALID/);
  }
  assert.throws(() => check({ environment: 'Production' }), /APPLE_PRODUCT_MISMATCH/);
  const prod = { deployment: 'production', environment: 'Production' };
  assert.throws(() => check({}, {}, prod), /APPLE_PRODUCT_MISMATCH/);
  assert.equal(check({ environment: 'Production' }, {}, prod).environment, 'Production');
});

test('wrong product, bundle, subscription type, quantity and family ownership cannot grant PRO', () => {
  for (const t of [{ bundleId: 'other.app' }, { productId: 'other.product' },
    { type: 'Auto-Renewable Subscription' }, { quantity: 2 }, { quantity: '1' },
    { inAppOwnershipType: 'FAMILY_SHARED' }]) assert.throws(() => check(t), /APPLE_PRODUCT_MISMATCH/);
});

test('purchase cannot attach to a disabled, deleted or recreated account', () => {
  assert.throws(() => validateApplePurchase(transaction, null, config, now), /APPLE_ACCOUNT_UNAVAILABLE/);
  for (const a of [{ disabled: 1 }, { disabled: undefined }, { id: '' }, { appAccountToken: '' },
    { createdAt: now + 1 }]) assert.throws(() => check({}, a), /APPLE_ACCOUNT_UNAVAILABLE/);
  assert.throws(() => check({}, { createdAt: now - 500 }), /APPLE_DATE_INVALID/);
  assert.throws(() => check({ appAccountToken: token.replace('07bd', '08bd') }), /APPLE_ACCOUNT_MISMATCH/);
  assert.throws(() => check({ appAccountToken: undefined }), /APPLE_ACCOUNT_MISMATCH/);
});

test('malformed IDs, timestamps, future purchase and pre-account purchase fail closed', () => {
  for (const t of [{ transactionId: 90071992547409930 }, { transactionId: '' },
    { originalTransactionId: 'a' }]) assert.throws(() => check(t), /APPLE_TRANSACTION_INVALID/);
  for (const t of [{ purchaseDate: NaN }, { purchaseDate: String(now) },
    { purchaseDate: now - 100001 }, { purchaseDate: now + 1 },
    { signedDate: now + 1 }, { signedDate: now - 2000 }]) assert.throws(() => check(t), /APPLE_DATE_INVALID/);
});

test('revoked or refunded purchase is never a new grant, including replay', () => {
  for (const t of [{ revocationDate: now - 100 }, { revocationReason: 0 }, { revocationReason: 1 }]) {
    assert.throws(() => check(t), /APPLE_PURCHASE_REVOKED/);
  }
});

test('restore preserves purchase date instead of resetting thirty days from restore time', () => {
  const first = check();
  const restored = validateApplePurchase(transaction, account, config, now + 60 * 86400000);
  assert.deepEqual(restored, first);
});
