import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureAppleAccountToken, recordVerifiedApplePurchase } from '../worker/apple-purchase-ledger.mjs';

const now = 1791900000000;
const config = { deployment: 'test', environment: 'Sandbox',
  bundleId: 'com.calcioreport.app', productId: 'com.calcioreport.app.pro30' };
function harness(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL('./fixtures/account-schema.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../worker/schema/apple-purchase-ledger.sql', import.meta.url), 'utf8'));
  let beforeBatch;
  let failStatement;
  const db = {
    prepare(query) { return { bind(...args) { return { query, args,
      async first() { return sql.prepare(query).get(...args) ?? null; },
    }; } }; },
    async batch(statements) {
      if (beforeBatch) { const fn = beforeBatch; beforeBatch = null; fn(); }
      sql.exec('BEGIN');
      try {
        const out = statements.map((s, i) => {
          if (i === failStatement) throw new Error('injected database failure');
          const query = sql.prepare(s.query);
          if (/^SELECT/.test(s.query)) return { success: true, results: query.all(...s.args), meta: { changes: 0 } };
          return { success: true, results: [], meta: { changes: query.run(...s.args).changes } };
        });
        sql.exec('COMMIT');
        return out;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  function add(id = 'account-1', email = 'test@example.com') {
    sql.prepare('INSERT INTO users (id,email,created_at,trial_ends_at,paid_until) VALUES (?,?,?,?,?)')
      .run(id, email, now - 100000, 1, now + 123456);
  }
  add();
  const token = (id = 'account-1', c = config) => ensureAppleAccountToken(db, id, c, now);
  const transaction = appAccountToken => ({
    environment: 'Sandbox', bundleId: config.bundleId, productId: config.productId,
    type: 'Non-Renewing Subscription', quantity: 1, inAppOwnershipType: 'PURCHASED',
    appAccountToken, transactionId: '90071992547409930', originalTransactionId: '90071992547409929',
    purchaseDate: now - 1000, signedDate: now - 500,
  });
  const record = (p, id = 'account-1', c = config) => recordVerifiedApplePurchase(db, id, p, c, now);
  const count = () => sql.prepare('SELECT COUNT(*) AS n FROM apple_purchase_ledger').get().n;
  return { sql, db, add, token, transaction, record, count,
    race(fn) { beforeBatch = fn; }, failAt(i) { failStatement = i; } };
}

test('expired trial obtains a stable opaque token; parallel requests converge and environments stay separate', async t => {
  const h = harness(t);
  const tokens = await Promise.all(Array.from({ length: 8 }, () => h.token()));
  assert.equal(new Set(tokens).size, 1);
  assert.match(tokens[0], /^[0-9a-f-]{36}$/);
  const prod = { ...config, deployment: 'production', environment: 'Production' };
  assert.notEqual(await h.token('account-1', prod), tokens[0]);
  await assert.rejects(h.token('account-1', { ...config, environment: 'Production' }), /APPLE_CONFIG_INVALID/);
  await assert.rejects(h.token('missing'), /APPLE_ACCOUNT_UNAVAILABLE/);
  h.sql.exec('UPDATE users SET disabled = 1');
  await assert.rejects(h.token(), /APPLE_ACCOUNT_UNAVAILABLE/);
});

test('concurrent duplicate delivery records exactly one purchase without granting or extending PRO', async t => {
  const h = harness(t); const p = h.transaction(await h.token());
  const before = h.sql.prepare('SELECT * FROM users').get();
  const responses = await Promise.all(Array.from({ length: 8 }, () => h.record(p)));
  assert.equal(h.count(), 1);
  assert.equal(responses.filter(r => !r.duplicate).length, 1);
  assert.ok(responses.every(r => r.state === 'recorded' && r.transactionId === p.transactionId));
  assert.deepEqual(h.sql.prepare('SELECT * FROM users').get(), before);
  assert.equal((await h.record({ ...p, signedDate: now })).duplicate, true);
  // Repeat purchase is unique by transactionId, even when original ID is shared.
  await h.record({ ...p, transactionId: '90071992547409931' });
  assert.equal(h.count(), 2);
});

test('same transaction cannot be reassigned or have immutable purchase facts changed', async t => {
  const h = harness(t); const p = h.transaction(await h.token());
  await h.record(p);
  h.add('account-2', 'other@example.com');
  const otherToken = await h.token('account-2');
  await assert.rejects(h.record(p, 'account-2'), /APPLE_ACCOUNT_MISMATCH/);
  await assert.rejects(h.record({ ...p, appAccountToken: otherToken }, 'account-2'), /APPLE_PURCHASE_NOT_RECORDED/);
  for (const change of [{ purchaseDate: now - 2000 }, { originalTransactionId: '123' }]) {
    await assert.rejects(h.record({ ...p, ...change }), /APPLE_TRANSACTION_CONFLICT/);
  }
  assert.equal(h.count(), 1);
  assert.equal(h.sql.prepare('SELECT account_id FROM apple_purchase_ledger').get().account_id, 'account-1');
  assert.throws(() => h.sql.exec("UPDATE apple_purchase_ledger SET account_id = 'account-2'"), /APPLE_PURCHASE_IMMUTABLE/);
  assert.throws(() => h.sql.exec("UPDATE apple_account_tokens SET app_account_token = 'replacement'"), /APPLE_TOKEN_IDENTITY_IMMUTABLE/);
});

test('deletion retires token and keeps transaction ownership; same-email registration cannot restore it', async t => {
  const h = harness(t); const old = await h.token(); const p = h.transaction(old);
  await h.record(p);
  h.sql.exec('DELETE FROM users');
  assert.ok(h.sql.prepare('SELECT retired_at FROM apple_account_tokens').get().retired_at);
  assert.equal(h.count(), 1);
  h.add('account-2');
  assert.notEqual(await h.token('account-2'), old);
  await assert.rejects(h.record(p, 'account-2'), /APPLE_ACCOUNT_MISMATCH/);
  await assert.rejects(h.record(p), /APPLE_ACCOUNT_UNAVAILABLE/);
  assert.throws(() => h.sql.exec('UPDATE apple_account_tokens SET retired_at = NULL WHERE retired_at IS NOT NULL'), /APPLE_TOKEN_RETIRED/);
});

test('account deletion, disable and identity change between read and batch prevent recording', async t => {
  for (const mutation of ['DELETE FROM users', 'UPDATE users SET disabled = 1',
    'UPDATE users SET created_at = created_at + 1']) {
    const h = harness(t); const p = h.transaction(await h.token());
    h.race(() => h.sql.exec(mutation));
    await assert.rejects(h.record(p), /APPLE_PURCHASE_NOT_RECORDED/);
    assert.equal(h.count(), 0);
  }
});

test('failed database batch rolls back token and purchase writes; retry is safe', async t => {
  const h = harness(t);
  h.failAt(1);
  await assert.rejects(h.token(), /injected database failure/);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM apple_account_tokens').get().n, 0);
  h.failAt(undefined);
  const p = h.transaction(await h.token());
  h.failAt(1);
  await assert.rejects(h.record(p), /injected database failure/);
  assert.equal(h.count(), 0);
  h.failAt(undefined);
  assert.equal((await h.record(p)).duplicate, false);
  assert.equal(h.count(), 1);
});

test('unacceptable verified payload cannot enter ledger, including revoked replay', async t => {
  const h = harness(t); const p = h.transaction(await h.token());
  for (const patch of [{ environment: 'Production' }, { revocationReason: 0 },
    { productId: 'other' }, { transactionId: 90071992547409930 }, { purchaseDate: now + 1 }]) {
    await assert.rejects(h.record({ ...p, ...patch }), /APPLE_/);
  }
  assert.equal(h.count(), 0);
  await h.record(p);
  await assert.rejects(h.record({ ...p, revocationDate: now }), /APPLE_PURCHASE_REVOKED/);
  assert.equal(h.count(), 1);
});

test('same transaction ID in different environments does not collide', async t => {
  const h = harness(t); const p = h.transaction(await h.token());
  await h.record(p);
  const prod = { ...config, deployment: 'production', environment: 'Production' };
  const appAccountToken = await h.token('account-1', prod);
  await h.record({ ...p, environment: 'Production', appAccountToken }, 'account-1', prod);
  assert.equal(h.count(), 2);
});
