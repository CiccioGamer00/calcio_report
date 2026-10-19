import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchases } from '../mobile/src/purchases.mjs';

const accountToken='12345678-1234-4234-8234-123456789abc';
const tx={transactionId:'90071992547409930',appAccountToken:accountToken,signedPayload:'signed.payload.value'};
function harness() {
  const session={ready:Promise.resolve(),token:'session-1'};const calls=[];
  const native={
    async product(){return {productId:'com.calcioreport.app.pro30',displayPrice:'9,99 €'};},
    async purchase(){calls.push('purchase');return {state:'purchased',transaction:tx};},
    async finish(){calls.push('finish');},async unfinished(){return {transactions:[tx]};},
    async restore(){calls.push('restore');return {transactions:[tx]};},
  };
  let respond=async(path)=>path==='/apple/token'?
    {environment:'Sandbox',productId:'com.calcioreport.app.pro30',appAccountToken:accountToken}:
    {ok:true,state:'applied',transactionId:tx.transactionId,paidUntil:12345};
  const manager=createPurchases({native,session,request:async(...args)=>{calls.push(args[0]);return respond(...args);},
    onApplied:async()=>calls.push('refresh')});
  return {session,native,manager,calls,setResponse:fn=>respond=fn};
}
test('purchase uses server token and finishes only after durable backend grant',async()=>{
  const h=harness();let token;
  h.native.purchase=async options=>{token=options.appAccountToken;return {state:'purchased',transaction:tx};};
  assert.equal((await h.manager.product()).displayPrice,'9,99 €');
  assert.equal((await h.manager.purchase()).state,'applied');assert.equal(token,accountToken);
  assert.ok(h.calls.indexOf('/apple/transaction')<h.calls.indexOf('finish'));
  assert.ok(h.calls.indexOf('finish')<h.calls.indexOf('refresh'));
});
test('recorded-only, invalid and failed backend responses never finish delivery',async()=>{
  for(const response of [{state:'recorded'}, {ok:true,state:'applied',transactionId:'wrong',paidUntil:1},null]){
    const h=harness();h.setResponse(async path=>{
      if(path==='/apple/token')return {environment:'Sandbox',productId:'com.calcioreport.app.pro30',appAccountToken:accountToken};
      if(response===null)throw Error('offline');return response;
    });
    await assert.rejects(h.manager.purchase());assert.ok(!h.calls.includes('finish'));
  }
});
test('pending and cancelled purchase states never grant or finish',async()=>{
  for(const state of ['pending','cancelled']){
    const h=harness();h.native.purchase=async()=>({state});
    assert.equal((await h.manager.purchase()).state,state);
    assert.ok(!h.calls.includes('/apple/transaction'));assert.ok(!h.calls.includes('finish'));
  }
});
test('session changes during Apple prompt or server delivery leave transaction recoverable',async()=>{
  const h=harness();h.native.purchase=async()=>{h.session.token='other';return {state:'purchased',transaction:tx};};
  await assert.rejects(h.manager.purchase(),/LOGIN_REQUIRED/);assert.ok(!h.calls.includes('finish'));
  const other=harness();other.setResponse(async path=>{
    if(path==='/apple/token')return {environment:'Sandbox',productId:'com.calcioreport.app.pro30',appAccountToken:accountToken};
    other.session.token='';return {ok:true,state:'applied',transactionId:tx.transactionId,paidUntil:1};
  });
  await assert.rejects(other.manager.purchase(),/LOGIN_REQUIRED/);assert.ok(!other.calls.includes('finish'));
});
test('resume retries unfinished delivery; explicit restore skips other-account purchases',async()=>{
  const h=harness();await h.manager.resume();assert.ok(!h.calls.includes('restore'));
  assert.equal(h.calls.filter(x=>x==='finish').length,1);
  h.native.restore=async()=>({transactions:[{...tx,appAccountToken:'another-account'},tx]});
  assert.deepEqual(await h.manager.restore(),{applied:1,failed:0,otherAccount:1});
});
test('duplicate StoreKit events share in-flight delivery and finish once',async()=>{
  const h=harness();await Promise.all([h.manager.receive(tx),h.manager.receive(tx)]);
  assert.equal(h.calls.filter(x=>x==='/apple/transaction').length,1);
  assert.equal(h.calls.filter(x=>x==='finish').length,1);
});
test('disabled backend and missing session cannot open Apple checkout',async()=>{
  const h=harness();h.setResponse(async()=>{throw Error('disabled');});
  await assert.rejects(h.manager.product());await assert.rejects(h.manager.purchase());
  assert.ok(!h.calls.includes('purchase'));
  h.session.token='';await assert.rejects(h.manager.purchase(),/LOGIN_REQUIRED/);
});

test('lost backend response retries on resume without finishing the first attempt', async () => {
  const h = harness();
  let attempts = 0;
  h.setResponse(async path => {
    if (path === '/apple/token') return {
      environment: 'Sandbox', productId: 'com.calcioreport.app.pro30', appAccountToken: accountToken,
    };
    attempts++;
    // The grant may already be durable when the response is lost. The retry
    // returns the same expiry; ledger idempotency is covered separately.
    if (attempts === 1) throw Error('response lost');
    return {ok: true, state: 'applied', transactionId: tx.transactionId, paidUntil: 12345};
  });
  await assert.rejects(h.manager.purchase(), /response lost/);
  assert.ok(!h.calls.includes('finish'));
  assert.ok(!h.calls.includes('refresh'));
  assert.deepEqual(await h.manager.resume(), {applied: 1, failed: 0, otherAccount: 0});
  assert.equal(attempts, 2);
  assert.equal(h.calls.filter(x => x === 'purchase').length, 1);
  assert.equal(h.calls.filter(x => x === 'finish').length, 1);
  assert.equal(h.calls.filter(x => x === 'refresh').length, 1);
});

test('native finish interruption remains recoverable without a second checkout', async () => {
  const h = harness();
  let finishAttempts = 0;
  h.native.finish = async () => {
    finishAttempts++;
    if (finishAttempts === 1) throw Error('native interrupted');
    h.calls.push('finish');
  };
  await assert.rejects(h.manager.purchase(), /native interrupted/);
  assert.ok(!h.calls.includes('refresh'));
  assert.deepEqual(await h.manager.resume(), {applied: 1, failed: 0, otherAccount: 0});
  assert.equal(finishAttempts, 2);
  assert.equal(h.calls.filter(x => x === 'purchase').length, 1);
  assert.equal(h.calls.filter(x => x === '/apple/transaction').length, 2);
  assert.equal(h.calls.filter(x => x === 'refresh').length, 1);
});
