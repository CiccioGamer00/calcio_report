import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createLegacyPayments} from '../worker/legacy-pro-delivery.mjs';
import {deliverReconciledApplePurchase} from '../worker/apple-pro-delivery.mjs';
import {ensureAppleAccountToken} from '../worker/apple-purchase-ledger.mjs';
import {createAppleHandler} from '../worker/apple-handler.mjs';
import core from '../worker/worker.js';
const day=86400000;
const now=Date.now()-10000;
const config={deployment:'test',environment:'Sandbox',bundleId:'com.calcioreport.app',productId:'com.calcioreport.app.pro30'};
function harness(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const path of ['tests/fixtures/account-schema.sql','worker/schema/apple-purchase-ledger.sql',
    'worker/schema/pro-entitlements.sql','worker/schema/pro-payment-operations.sql']) {
    sql.exec(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
  }
  let fail=false;
  const db={prepare(query){return {bind(...args){return {query,args,
    async first(){return sql.prepare(query).get(...args) ?? null;},
    async all(){return {success:true,results:sql.prepare(query).all(...args)};},
    async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};},
  };}};},async batch(statements){
    sql.exec('BEGIN');
    try {const rows=statements.map(s=>{
      if(fail && s.query.startsWith('INSERT INTO pro_entitlement_events')) throw Error('injected outage');
      if(/^SELECT/.test(s.query))return {success:true,results:sql.prepare(s.query).all(...s.args),meta:{changes:0}};
      return {success:true,results:[],meta:{changes:sql.prepare(s.query).run(...s.args).changes}};
    });sql.exec('COMMIT');return rows;} catch(e){sql.exec('ROLLBACK');throw e;}
  }};
  const add=(id='account-1')=>sql.prepare('INSERT INTO users(id,email,created_at,paid_until) VALUES(?,?,?,0)').run(id,id+'@example.invalid',now-day);
  add();
  const account=id=>sql.prepare('SELECT * FROM users WHERE id=?').get(id || 'account-1');
  const cutover=now-5000;
  const payments=createLegacyPayments(db,config,{cutover,stripePaymentLink:'plink_pro'});
  const session={id:'cs_test_123',created:Math.floor(now/1000),livemode:false,payment_status:'paid',mode:'payment',payment_link:'plink_pro'};
  const env={DB:db,LICENSE_SECRET:'test-secret',ADMIN_KEY:'admin-test',STRIPE_WEBHOOK_SECRET:'stripe-test',
    APPLE_SANDBOX_ENABLED:'1',APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox',PRO_LEDGER_ENABLED:'1',
    PRO_LEDGER_CUTOVER_MS:String(cutover),STRIPE_PRO_PAYMENT_LINK_ID:'plink_pro'};
  const handler=createAppleHandler(core,'test');
  const call=(path,body,headers={},method='POST')=>handler.fetch(new Request('https://worker.test'+path,
    {method,headers:{'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env,{});
  return {sql,db,account,add,payments,session,env,call,cutover,fail:value=>fail=value};
}

test('concurrent duplicate web deliveries grant once; replay uses original delivery time',async t=>{
  const h=harness(t);
  await Promise.all([h.payments.stripe(h.account(),h.session,now),h.payments.stripe(h.account(),h.session,now+1)]);
  const expiry=h.account().paid_until;
  const recorded=JSON.parse(h.sql.prepare('SELECT event_json FROM pro_payment_operations').get().event_json);
  assert.ok(recorded.at===now || recorded.at===now+1);
  assert.equal(expiry,recorded.at+30*day);
  const replay=await h.payments.stripe(h.account(),h.session,now+10*day);
  assert.equal(replay.duplicate,true);assert.equal(h.account().paid_until,expiry);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM pro_payment_operations').get().n,1);
});
test('earlier-started duplicate resumes after later request persisted the operation',async t=>{
  const h=harness(t);h.fail(true);
  await assert.rejects(h.payments.stripe(h.account(),h.session,now+1),/injected outage/);
  h.fail(false);
  await h.payments.stripe(h.account(),h.session,now);
  assert.equal(h.account().paid_until,now+1+30*day);
  const replay=await h.payments.stripe(h.account(),h.session,now+day);
  assert.equal(replay.duplicate,true);
  assert.equal(h.account().paid_until,now+1+30*day);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM pro_entitlement_events').get().n,1);
});
test('Apple and Stripe stack; Apple refund preserves only web duration',async t=>{
  const h=harness(t);const accountToken=await ensureAppleAccountToken(h.db,'account-1',config,now);
  const tx={environment:'Sandbox',bundleId:config.bundleId,productId:config.productId,type:'Non-Renewing Subscription',
    quantity:1,inAppOwnershipType:'PURCHASED',appAccountToken:accountToken,transactionId:'123',originalTransactionId:'123',
    purchaseDate:now-1000,signedDate:now};
  await deliverReconciledApplePurchase(h.db,'account-1',tx,config,now);
  await h.payments.stripe(h.account(),h.session,now);
  assert.equal(h.account().paid_until,now-1000+60*day);
  await deliverReconciledApplePurchase(h.db,'account-1',{...tx,signedDate:now+1,revocationDate:now,revocationReason:0},config,now+1);
  assert.equal(h.account().paid_until,now+30*day);
});
test('legacy baseline survives migration; negative admin adjustments preserve ordering even in same millisecond',async t=>{
  const h=harness(t);h.sql.prepare('UPDATE users SET paid_until=?').run(now+5*day);
  await h.payments.admin(h.account(),30,'z-first',now);
  await h.payments.admin(h.account(),-10,'a-second',now);
  assert.equal(h.account().paid_until,now+25*day);
  await h.payments.admin(h.account(),-100,'remove-all',now);
  await h.payments.admin(h.account(),30,'new-grant',now);
  assert.equal(h.account().paid_until,now+30*day);
  const replay=await h.payments.admin(h.account(),-100,'remove-all',now+1);
  assert.equal(replay.duplicate,true);assert.equal(h.account().paid_until,now+30*day);
  await assert.rejects(h.payments.admin(h.account(),-99,'remove-all',now+1),/CONFLICT/);
});
test('operation recorded before interrupted delivery retries without duplicate duration',async t=>{
  const h=harness(t);h.fail(true);
  await assert.rejects(h.payments.stripe(h.account(),h.session,now),/injected outage/);
  assert.equal(h.account().paid_until,0);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM pro_entitlement_events').get().n,0);
  h.fail(false);await h.payments.stripe(h.account(),h.session,now+day);
  assert.equal(h.account().paid_until,now+30*day);
});
test('unpaid, foreign product/environment and pre-cutover Stripe deliveries never grant',async t=>{
  const h=harness(t);
  assert.deepEqual(await h.payments.stripe(h.account(),{...h.session,payment_status:'unpaid'},now),{ignored:true});
  for(const session of [{...h.session,livemode:true},{...h.session,payment_link:'plink_other'},
    {...h.session,created:Math.floor((h.cutover-1000)/1000)}]) {
    await assert.rejects(h.payments.stripe(h.account(),session,now));
  }
  assert.equal(h.account().paid_until,0);
});
test('redeem is account-bound and one-time; old email-only codes require reissue',async t=>{
  const h=harness(t);const code={v:2,id:'one-code',accountId:'account-1',issuedAt:now,exp:now+7*day};
  await h.payments.redeem(h.account(),code,now);
  assert.equal((await h.payments.redeem(h.account(),code,now+day)).duplicate,true);
  assert.equal(h.account().paid_until,now+30*day);
  await assert.rejects(h.payments.redeem(h.account(),{exp:now+day},now),/REISSUE/);
  h.add('account-2');await assert.rejects(h.payments.redeem(h.account('account-2'),code,now),/REISSUE/);
});
test('recorded web operation cannot move to a new account after deletion',async t=>{
  const h=harness(t);await h.payments.stripe(h.account(),h.session,now);
  h.sql.exec("DELETE FROM users WHERE id='account-1'");h.add('account-2');
  await assert.rejects(h.payments.stripe(h.account('account-2'),h.session,now+1),/CONFLICT/);
  assert.equal(h.account('account-2').paid_until,0);
});
test('admin HTTP routes authenticate, use common accounting and honor retry IDs',async t=>{
  const h=harness(t);const body={email:h.account().email,requestId:'http-grant'};
  assert.equal((await h.call('/admin/grant',body)).status,403);
  const headers={'x-admin-key':'admin-test'};
  const first=await (await h.call('/admin/grant',body,headers)).json();
  assert.equal(first.ok,true);
  const repeated=await(await h.call('/admin/grant',body,headers)).json();
  assert.equal(repeated.paidUntil,first.paidUntil);assert.equal(repeated.duplicate,true);
  const adjusted=await(await h.call('/admin/adjust',{...body,requestId:'http-adjust',deltaDays:-2},headers)).json();
  assert.equal(adjusted.paidUntil,first.paidUntil-2*day);
  assert.equal((await h.call('/admin/adjust',{...body,deltaDays:'2x'},headers)).status,400);
  assert.ok(h.account().paid_activated_at>0);
});
test('Stripe signed HTTP events completed/async share session id; forged events never reach ledger',async t=>{
  const h=harness(t);
  const send=async(type,valid=true,payment_status='paid')=>{
    const raw=JSON.stringify({type,data:{object:{...h.session,payment_status,customer_email:h.account().email}}});
    const time=Math.floor(Date.now()/1000);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(h.env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${time}.${raw}`)))].map(v=>v.toString(16).padStart(2,'0')).join('');
    return createAppleHandler(core,'test').fetch(new Request('https://worker.test/stripe/webhook',{method:'POST',body:raw,
      headers:{'stripe-signature':`t=${time},v1=${valid?sig:'00'}`}}),h.env,{});
  };
  assert.equal((await send('checkout.session.completed',false)).status,400);
  assert.equal((await send('checkout.session.completed',true,'unpaid')).status,200);
  assert.equal(h.account().paid_until,0);
  assert.equal((await send('checkout.session.completed')).status,200);const paid=h.account().paid_until;
  assert.equal((await send('checkout.session.async_payment_succeeded')).status,200);
  assert.equal(h.account().paid_until,paid);
});
test('mint/redeem HTTP routes generate bound codes and cannot redeem twice',async t=>{
  const h=harness(t);
  const registered=await(await h.call('/auth/register',{email:'new@example.invalid',password:'Test-password-2026'})).json();
  assert.equal(registered.ok,true);
  const minted=await(await h.call('/admin/mint?email=new@example.invalid',null,{'x-admin-key':'admin-test'},'GET')).json();
  const headers={Authorization:`Bearer ${registered.token}`};
  const first=await(await h.call('/license/redeem',{code:minted.code},headers)).json();
  assert.equal(first.ok,true);
  const repeat=await(await h.call('/license/redeem',{code:minted.code},headers)).json();
  assert.equal(repeat.duplicate,true);assert.equal(repeat.paidUntil,first.paidUntil);
});
