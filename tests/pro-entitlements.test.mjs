import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { applyProEvents, projectProUntil } from '../worker/pro-entitlements.mjs';
import { ensureAppleAccountToken } from '../worker/apple-purchase-ledger.mjs';
import { deliverReconciledApplePurchase } from '../worker/apple-pro-delivery.mjs';
import appleWorker from '../worker/apple-entry.mjs';

const now = 1791900000000;
const day = 86400000;
const config = { deployment: 'test', environment: 'Sandbox',
  bundleId: 'com.calcioreport.app', productId: 'com.calcioreport.app.pro30' };
const grant = (id, source = 'apple', at = now) => ({id, source, kind:'grant', at, durationMs:30*day});
const status = (id, targetId, revoked, at = now) => ({id, source:'apple', kind:'status', at, targetId, revoked});

function harness(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const path of ['tests/fixtures/account-schema.sql', 'worker/schema/apple-purchase-ledger.sql',
    'worker/schema/pro-entitlements.sql']) sql.exec(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  let failAt; let race;
  const db = {
    prepare(query) { return {bind(...args) { return {query,args,
      async first() {return sql.prepare(query).get(...args) ?? null;},
      async all() {return {success:true,results:sql.prepare(query).all(...args)};},
      async run() {return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};},
    };}};},
    async batch(statements) {
      if (statements[0].query.startsWith('UPDATE pro_entitlement_accounts') && race) {
        const fn=race; race=null; fn();
      }
      sql.exec('BEGIN');
      try {
        const result=statements.map((s,i)=> {
          if (i===failAt && s.query.startsWith('INSERT INTO pro_entitlement_events')) throw Error('injected failure');
          if (s.query.startsWith('SELECT')) return {success:true,results:sql.prepare(s.query).all(...s.args),meta:{changes:0}};
          return {success:true,results:[],meta:{changes:sql.prepare(s.query).run(...s.args).changes}};
        });
        sql.exec('COMMIT'); return result;
      } catch(e) {sql.exec('ROLLBACK');throw e;}
    },
  };
  const add = (id='account-1', baseline=0) => sql.prepare('INSERT INTO users(id,email,created_at,paid_until) VALUES(?,?,?,?)')
    .run(id,`${id}@example.invalid`,now-day,baseline);
  add();
  return { sql, db, add,
    token: (id='account-1')=>ensureAppleAccountToken(db,id,config,now),
    apply: (events,id='account-1')=>applyProEvents(db,id,config,events,now),
    paid: ()=>sql.prepare('SELECT paid_until FROM users WHERE id=?').get('account-1')?.paid_until,
    count: ()=>sql.prepare('SELECT COUNT(*) AS n FROM pro_entitlement_events').get().n,
    fail: i=>failAt=i, race:fn=>race=fn,
  };
}

test('projection stacks purchases, preserves other-source durations and respects latest refund state',()=>{
  const apple=grant('apple:1'); const stripe=grant('stripe:1','stripe',now+day);
  assert.equal(projectProUntil(now+10*day,[apple,stripe]),now+70*day);
  const refund=status('refund','apple:1',true,now+2*day);
  assert.equal(projectProUntil(now+10*day,[stripe,refund,apple]),now+40*day);
  assert.equal(projectProUntil(0,[apple,refund]),0);
  assert.equal(projectProUntil(0,[apple,refund,status('old','apple:1',false,now+day)]),0);
  assert.equal(projectProUntil(0,[apple,refund,status('reverse','apple:1',false,now+3*day)]),now+30*day);
  assert.equal(projectProUntil(0,[apple,refund,status('tie','apple:1',false,now+2*day)]),0);
  assert.throws(()=>projectProUntil(Number.MAX_SAFE_INTEGER,[apple]),/OVERFLOW/);
});

test('duplicate and concurrent deliveries credit once; distinct purchases both survive',async t=>{
  const h=harness(t); await h.token();
  await Promise.all(Array.from({length:4},()=>h.apply([grant('apple:1')])));
  assert.equal(h.paid(),now+30*day);assert.equal(h.count(),1);
  await Promise.all([h.apply([grant('apple:2')]),h.apply([grant('stripe:1','stripe')])]);
  assert.equal(h.paid(),now+90*day);assert.equal(h.count(),3);
  assert.equal((await h.apply([grant('apple:1')])).duplicate,true);
});

test('refund leaves baseline and web duration intact; stale restore cannot reinstate Apple',async t=>{
  const h=harness(t);h.sql.prepare('UPDATE users SET paid_until=?').run(now+5*day);await h.token();
  await h.apply([grant('apple:1', 'apple', now-1000),grant('stripe:1','stripe',now-500)]);
  await h.apply([status('refund','apple:1',true)]);
  assert.equal(h.paid(),now+35*day);
  await h.apply([status('stale','apple:1',false,now-500)]);
  assert.equal(h.paid(),now+35*day);
});

test('batch failure rolls back events and expiry; retry delivers exactly once',async t=>{
  const h=harness(t);await h.token();h.fail(1);
  await assert.rejects(h.apply([grant('apple:1')]),/injected failure/);
  assert.equal(h.count(),0);assert.equal(h.paid(),0);
  h.fail(undefined);await h.apply([grant('apple:1')]);assert.equal(h.paid(),now+30*day);
});

test('legacy writes, deletion and disable races cannot be overwritten by a grant',async t=>{
  for(const mutation of ["UPDATE users SET paid_until=paid_until+1",'DELETE FROM users','UPDATE users SET disabled=1']) {
    const h=harness(t);await h.token();h.race(()=>h.sql.exec(mutation));
    await assert.rejects(h.apply([grant('apple:1')]),/PRO_(LEGACY_WRITE_CONFLICT|ACCOUNT_UNAVAILABLE)/);
    assert.equal(h.count(),0);
  }
});

test('same event cannot change facts or cross account ownership',async t=>{
  const h=harness(t);await h.token();await h.apply([grant('apple:1')]);
  await assert.rejects(h.apply([{...grant('apple:1'),durationMs:day}]),/EVENT_CONFLICT/);
  h.add('account-2');await h.token('account-2');
  await assert.rejects(h.apply([grant('apple:1')],'account-2'),/EVENT_CONFLICT/);
  assert.equal(h.count(),1);
});

test('reconciled Apple delivery persists purchase plus grant; refund and old replay are safe',async t=>{
  const h=harness(t);const token=await h.token();
  const tx={environment:'Sandbox',bundleId:config.bundleId,productId:config.productId,
    type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',
    appAccountToken:token,transactionId:'123',originalTransactionId:'123',purchaseDate:now-1000,signedDate:now-500};
  const deliver=p=>deliverReconciledApplePurchase(h.db,'account-1',p,config,now);
  assert.equal((await deliver(tx)).state,'applied');assert.equal(h.paid(),now-1000+30*day);
  assert.equal((await deliver(tx)).duplicate,true);
  await deliver({...tx,signedDate:now,revocationDate:now,revocationReason:0});assert.equal(h.paid(),0);
  await deliver(tx);assert.equal(h.paid(),0);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM apple_purchase_ledger').get().n,1);
});

test('first delivery already refunded grants nothing; delayed delivery retains purchase date',async t=>{
  const h=harness(t);const token=await h.token();
  const tx={environment:'Sandbox',bundleId:config.bundleId,productId:config.productId,
    type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',appAccountToken:token,
    transactionId:'456',originalTransactionId:'456',purchaseDate:now-day,signedDate:now,
    revocationDate:now-1,revocationReason:1};
  await deliverReconciledApplePurchase(h.db,'account-1',tx,config,now);assert.equal(h.paid(),0);
  await assert.rejects(deliverReconciledApplePurchase(h.db,'account-1',{...tx,revocationDate:now+1},config,now),/REVOCATION_INVALID/);
});

test('sandbox routes authenticate expired trials and reject disabled, forged and retired sessions',async t=>{
  const h=harness(t);
  const env={DB:h.db,LICENSE_SECRET:'local-test-only',APPLE_SANDBOX_ENABLED:'1',
    APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox',ACCOUNT_DELETION_ENABLED:'1'};
  const call=(path,token,body)=>appleWorker.fetch(new Request(`https://worker.test${path}`,{
    method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env,{});
  const registered=await (await call('/auth/register',null,{email:'new@example.invalid',password:'Test-password-2026'})).json();
  assert.ok(registered.token);
  h.sql.exec('UPDATE users SET trial_ends_at=1');
  const result=await call('/apple/token',registered.token);assert.equal(result.status,200);
  assert.match((await result.json()).appAccountToken,/^[0-9a-f-]{36}$/);
  assert.equal((await call('/apple/token','forged')).status,401);
  h.sql.exec("UPDATE users SET disabled=1 WHERE email='new@example.invalid'");
  assert.equal((await call('/apple/token',registered.token)).status,401);
  h.sql.exec("DELETE FROM users WHERE email='new@example.invalid'");
  await call('/auth/register',null,{email:'new@example.invalid',password:'Test-password-2026'});
  assert.equal((await call('/apple/token',registered.token)).status,401);
  env.APPLE_ENVIRONMENT='Production';assert.equal((await call('/apple/token',registered.token)).status,503);
});

test('sandbox delivery passes authenticated ID through verifier and atomic grant, never a body account ID',async t=>{
  const h=harness(t);const originalFetch=globalThis.fetch;t.after(()=>globalThis.fetch=originalFetch);
  const env={DB:h.db,LICENSE_SECRET:'test-only',APPLE_SANDBOX_ENABLED:'1',APPLE_DEPLOYMENT:'test',
    APPLE_ENVIRONMENT:'Sandbox',APPLE_VERIFIER_URL:'https://verifier.example',APPLE_VERIFIER_SECRET:'ab'.repeat(32)};
  const call=(path,token,body)=>appleWorker.fetch(new Request(`https://worker.test${path}`,{
    method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env,{});
  const {token}=await(await call('/auth/register',null,{email:'new@example.invalid',password:'Test-password-2026'})).json();
  const {appAccountToken}=await(await call('/apple/token',token)).json();
  const stamp=Date.now();
  globalThis.fetch=async()=>Response.json({transaction:{environment:'Sandbox',bundleId:config.bundleId,
    productId:config.productId,type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',
    appAccountToken,transactionId:'987',originalTransactionId:'987',purchaseDate:stamp,signedDate:stamp}});
  const response=await call('/apple/transaction',token,{signedPayload:'a.b.c',accountId:'account-1'});
  assert.equal(response.status,200);assert.equal((await response.json()).state,'applied');
  assert.equal(h.paid(),0);
  assert.equal(h.sql.prepare("SELECT paid_until FROM users WHERE email='new@example.invalid'").get().paid_until,stamp+30*day);
  assert.equal((await call('/admin/grant',null,{email:'new@example.invalid'})).status,503);
  globalThis.fetch=async()=>new Response('',{status:503});
  assert.equal((await call('/apple/transaction',token,{signedPayload:'a.b.c'})).status,503);
});

test('verified notification revokes access without a login; repeats and deleted owners are harmless',async t=>{
  const h=harness(t);const appAccountToken=await h.token();
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const env={DB:h.db,APPLE_SANDBOX_ENABLED:'1',APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox',
    APPLE_VERIFIER_URL:'https://verifier.example',APPLE_VERIFIER_SECRET:'ab'.repeat(32)};
  const tx={environment:'Sandbox',bundleId:config.bundleId,productId:config.productId,
    type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',appAccountToken,
    transactionId:'999',originalTransactionId:'999',purchaseDate:now-1000,signedDate:now};
  await deliverReconciledApplePurchase(h.db,'account-1',tx,config,now);
  globalThis.fetch=async()=>Response.json({transaction:{...tx,signedDate:now+1,revocationDate:now,revocationReason:0}});
  const call=()=>appleWorker.fetch(new Request('https://worker.test/apple/notifications',{
    method:'POST',body:JSON.stringify({signedPayload:'a.b.c'})}),env,{});
  assert.equal((await call()).status,200);assert.equal(h.paid(),0);
  assert.equal((await call()).status,200);assert.equal(h.paid(),0);
  h.sql.exec('DELETE FROM users');assert.equal((await call()).status,200);
  globalThis.fetch=async()=>Response.json({transaction:null,ignored:true});
  assert.deepEqual(await(await call()).json(),{ok:true,ignored:true});
  globalThis.fetch=async()=>new Response('',{status:503});
  assert.equal((await call()).status,503);
});
