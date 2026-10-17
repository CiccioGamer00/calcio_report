import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createAppleVerifier } from '../verifier.mjs';

const config = { deployment: 'test', environment: 'Sandbox' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('only explicit deployment/environment pairs; production requires the app ID', () => {
  for (const invalid of [undefined, {}, { ...config, environment: 'Production' },
    { ...config, environment: 'Xcode' }, { ...config, environment: 'LocalTesting' },
    { deployment: 'production', environment: 'Sandbox' },
    { deployment: 'production', environment: 'Production' }]) {
    assert.throws(() => createAppleVerifier(invalid), /CONFIG_INVALID/);
  }
  assert.ok(createAppleVerifier(config));
});

test('decoded JSON, oversized input and malformed JWS never enter verification', async () => {
  const verifier = createAppleVerifier(config);
  for (const method of ['transaction', 'notification']) {
    for (const input of [{ transactionId: '123' }, null, '', 'a.b', 'a.b.c\n', 'a'.repeat(131073)]) {
      await assert.rejects(verifier[method](input), /SIGNED_DATA_INVALID/);
    }
  }
});

test('real Apple library rejects forged HS256 purchases and notifications', async () => {
  const verifier = createAppleVerifier(config);
  const payload = { bundleId: 'com.calcioreport.app', environment: 'Sandbox',
    productId: 'com.calcioreport.app.pro30', transactionId: '123', signedDate: Date.now() };
  const body = `${encode({ alg: 'HS256' })}.${encode(payload)}`;
  const jws = `${body}.${createHmac('sha256', 'attacker').update(body).digest('base64url')}`;
  await assert.rejects(verifier.transaction(jws));
  await assert.rejects(verifier.notification(jws));
});

test('unsigned and fake certificate chains are rejected, without decode fallback', async () => {
  const verifier = createAppleVerifier(config);
  for (const header of [{ alg: 'none' }, { alg: 'ES256', x5c: ['ZmFrZQ=='] }]) {
    const jws = `${encode(header)}.${encode({ environment: 'Sandbox', bundleId: 'com.calcioreport.app' })}.YWJj`;
    await assert.rejects(verifier.transaction(jws));
  }
});
