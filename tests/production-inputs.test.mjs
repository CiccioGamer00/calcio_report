import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkProductionInputs } from '../scripts/check-production-inputs.mjs';

const candidate = JSON.parse(readFileSync(new URL('../deploy/apple-production-inputs.json', import.meta.url)));
const synthetic = {...candidate, reviewDatabaseId:'11111111-1111-4111-8111-111111111111',
  testDatabaseId:'22222222-2222-4222-8222-222222222222',
  productionVerifierOrigin:'https://production.example.invalid',
  sandboxVerifierOrigin:'https://sandbox.example.invalid', appAppleId:'123456789',
  stripePaymentLinkId:'plink_SyntheticOnly'};
test('incomplete release metadata blocks preparation approval', () => {
  assert.deepEqual(checkProductionInputs(candidate), [
    'MISSING_reviewDatabaseId','MISSING_testDatabaseId','MISSING_productionVerifierOrigin',
    'MISSING_appAppleId','MISSING_stripePaymentLinkId']);
  assert.deepEqual(checkProductionInputs(synthetic), []);
});
test('rejects live/review alias, shared verifier and accidental Apple activation', () => {
  const errors = checkProductionInputs({...synthetic,
    reviewDatabaseId:synthetic.liveDatabaseId.toUpperCase(),
    productionVerifierOrigin:synthetic.sandboxVerifierOrigin, appleProductionEnabled:'1'});
  for (const code of ['DATABASES_NOT_DISTINCT','VERIFIER_ORIGINS_NOT_DISTINCT','APPLE_GATE_MUST_REMAIN_CLOSED'])
    assert.ok(errors.includes(code));
});
test('rejects product ID, buy URL, credential-bearing URL and wrong target', () => {
  const errors = checkProductionInputs({...synthetic, appAppleId:'6822393280',
    stripePaymentLinkId:'https://buy.stripe.com/example', workerName:'calcio-report-test',
    productionVerifierOrigin:'https://user:secret@example.invalid'});
  for (const code of ['INVALID_APP_ID_NOT_PRODUCT_ID','INVALID_STRIPE_PAYMENT_LINK_ID',
    'WORKER_TARGET_MISMATCH','INVALID_productionVerifierOrigin']) assert.ok(errors.includes(code));
  assert.ok(!JSON.stringify(errors).includes('secret'));
});
test('rejects unexpected fields without echoing keys or secrets', () => {
  const errors = checkProductionInputs({...synthetic, 'accidental-secret':'do-not-print'});
  assert.deepEqual(errors,['UNEXPECTED_FIELDS']);
  assert.deepEqual(checkProductionInputs(null),['INPUT_INVALID']);
});
