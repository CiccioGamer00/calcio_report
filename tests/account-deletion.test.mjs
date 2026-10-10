import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../worker/worker.js', import.meta.url), 'utf8');
function harness() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, pass_hash TEXT,
    trial_ends_at INTEGER, paid_until INTEGER, created_at INTEGER, disabled INTEGER DEFAULT 0,
    note TEXT, last_seen_at INTEGER, paid_activated_at INTEGER);`);
  let beforeDelete;
  const env = { LICENSE_SECRET: 'test-only-secret', STRIPE_WEBHOOK_SECRET: 'test-stripe-secret',
    ACCOUNT_DELETION_ENABLED: '1', DB: { prepare(sql) {
      return { bind(...args) { return {
        async first() { return db.prepare(sql).get(...args); },
        async run() {
          if (sql.startsWith('DELETE') && beforeDelete) beforeDelete();
          return { meta: { changes: db.prepare(sql).run(...args).changes } };
        },
      }; } };
    } } };
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array,
    Request, Response, Headers, URL, btoa, atob, console,
    fetch() { throw new Error('Unexpected external network request'); } });
  vm.runInContext(source.replace('export default {', 'globalThis.worker = {'), context);
  const call = (path, body, token, method = 'POST') => context.worker.fetch(new Request('https://worker.test'+path,
    { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer '+token } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }), env, {});
  const email = 'test@example.com'; const password = 'Test-password-2026';
  const register = async () => (await call('/auth/register', { email, password })).json();
  const remove = token => call('/auth/delete', { password, confirmation: 'ELIMINA' }, token);
  const row = () => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const resetToken = () => context.makePasswordResetToken(env, email, row().pass_hash, Date.now(), row().id);
  async function webhook(created, mode = 'payment') {
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { customer_email: email, created, mode } } });
    const t = Math.floor(Date.now()/1000);
    const sig = await context.hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${t}.${body}`);
    return context.worker.fetch(new Request('https://worker.test/stripe/webhook', { method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body }), env, {});
  }
  return { db, env, context, call, register, remove, row, resetToken, webhook, email, password,
    race(fn) { beforeDelete = fn; } };
}

test('deletion is opt-in; no token, forged token, wrong password and missing confirmation preserve account', async () => {
  const h = harness(); const { token } = await h.register();
  h.env.ACCOUNT_DELETION_ENABLED = '';
  assert.equal((await h.remove(token)).status, 503);
  h.env.ACCOUNT_DELETION_ENABLED = '1';
  for (const invalid of ['', 'forged.token']) assert.equal((await h.remove(invalid)).status, 401);
  assert.equal((await h.call('/auth/delete', { password: 'wrong', confirmation: 'ELIMINA' }, token)).status, 403);
  assert.equal((await h.call('/auth/delete', { password: h.password }, token)).status, 400);
  assert.ok(h.row());
});

test('TRIAL, expired, PRO and disabled accounts can delete with valid session/password; other users untouched', async () => {
  for (const variant of ['trial','expired','pro','disabled']) {
    const h = harness(); const { token } = await h.register();
    if (variant === 'expired') h.db.exec('UPDATE users SET trial_ends_at = 1');
    if (variant === 'pro') h.db.exec(`UPDATE users SET paid_until = ${Date.now()+86400000}`);
    if (variant === 'disabled') h.db.exec('UPDATE users SET disabled = 1');
    await h.call('/auth/register', { email: 'other@example.com', password: h.password });
    const reset = await h.resetToken();
    const response = await h.remove(token);
    assert.equal(response.status, 200, variant);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(h.row(), undefined);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    assert.equal((await h.remove(token)).status, 401);
    assert.equal((await h.call('/auth/login', { email:h.email,password:h.password })).status, 401);
    assert.equal((await (await h.call('/auth/me', null, token, 'GET')).json()).ok, false);
    assert.equal((await h.call('/auth/reset', {token:reset,password:'Other-password'})).status, 400);
  }
});

test('same email AND password re-registration never revives new sessions or reset links', async () => {
  const h = harness(); const first = await h.register(); const reset = await h.resetToken();
  await h.remove(first.token); const next = await h.register();
  assert.equal((await h.remove(first.token)).status, 401);
  assert.equal((await (await h.call('/auth/me', null, first.token, 'GET')).json()).ok, false);
  assert.equal((await h.call('/license/redeem', {code:'unused'}, first.token)).status, 401);
  assert.equal((await h.call('/fixtures', null, first.token, 'GET')).status, 401);
  assert.equal((await h.call('/auth/reset', {token:reset,password:'Other-password'})).status, 400);
  assert.equal((await (await h.call('/auth/me', null, next.token, 'GET')).json()).ok, true);
});

test('legacy sessions remain usable for original account but not a newer account', async () => {
  const h = harness(); await h.register();
  const iat = Date.now();
  const token = await h.context.signToken(h.env, {email:h.email,iat,exp:iat+3600000});
  assert.equal((await (await h.call('/auth/me', null, token, 'GET')).json()).ok, true);
  h.db.prepare('UPDATE users SET created_at = ?').run(iat+1);
  assert.equal((await h.remove(token)).status, 401);
});

test('password reset revokes sessions and deletion requires the new password', async () => {
  const h = harness(); const {token} = await h.register(); const reset = await h.resetToken();
  assert.equal((await h.call('/auth/reset', {token:reset,password:'New-password'})).status, 200);
  assert.equal((await h.remove(token)).status, 401);
  assert.equal((await h.call('/auth/reset', {token:reset,password:'Again-password'})).status, 400);
});

test('atomic deletion survives concurrent password reset, duplicate requests and database constraint failures', async () => {
  let h = harness(); let {token} = await h.register();
  h.race(() => h.db.exec("UPDATE users SET pass_hash = 'changed'"));
  assert.equal((await h.remove(token)).status, 409); assert.ok(h.row());
  h = harness(); ({token} = await h.register());
  const results = await Promise.all([h.remove(token),h.remove(token)]);
  assert.equal(results.filter(r=>r.status===200).length, 1);
  h = harness(); ({token} = await h.register());
  h.db.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  assert.equal((await h.remove(token)).status, 503); assert.ok(h.row());
});

test('Stripe cannot recreate deleted users or credit old checkout to re-registered account; fresh payment still works', async () => {
  const h = harness(); const {token} = await h.register();
  const old = Math.floor(Date.now()/1000)-60;
  await h.remove(token); assert.equal((await h.webhook(old)).status, 200); assert.equal(h.row(), undefined);
  await h.register(); await h.webhook(old); assert.equal(h.row().paid_until, 0);
  await h.webhook(Math.ceil(Date.now()/1000)); assert.ok(h.row().paid_until > Date.now());
});

test('turning deletion off does not allow Stripe to recreate deleted users', async () => {
  const h = harness(); h.env.ACCOUNT_DELETION_ENABLED = '';
  await h.webhook(Math.floor(Date.now()/1000)); assert.equal(h.row(), undefined);
});
