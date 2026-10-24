import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createLegacyPayments } from '../worker/legacy-pro-delivery.mjs';
globalThis.crypto ??= webcrypto;
const now = 1800000000000;
const cutover = now - 10000;
const account = {id:'synthetic-account', created_at:now-100000};
const link = 'plink_synthetic';
const config = deployment => ({deployment,
  environment:deployment === 'production' ? 'Production' : 'Sandbox',
  bundleId:'com.calcioreport.app',productId:'com.calcioreport.app.pro30'});
const session = patch => ({id:'cs_synthetic', payment_link:link, livemode:true,
  mode:'payment', payment_status:'paid', created:(now-1000)/1000,
  currency:'eur',amount_total:499,...patch});
function harness(deployment='production') {
  let attempts=0;
  const stop=Error('PERSISTENCE_BOUNDARY');
  const db={prepare(){ attempts++; throw stop; },batch(){ attempts++; throw stop; }};
  return {payments:createLegacyPayments(db,config(deployment),{cutover,stripePaymentLink:link}),
    attempts:()=>attempts,stop};
}
test('Production rejects unexpected money before all DB access', async t=>{
  for (const patch of [
    {amount_total:999},{amount_total:498},{amount_total:500},{amount_total:0},
    {amount_total:-499},{amount_total:4.99},{amount_total:'499'},
    {amount_total:null},{amount_total:undefined},{amount_total:NaN},
    {currency:'usd'},{currency:'EUR'},{currency:''},{currency:null},{currency:undefined},
  ]) await t.test(JSON.stringify(patch),async()=>{
    const h=harness();
    await assert.rejects(h.payments.stripe(account,session(patch),now),
      {message:'PRO_STRIPE_AMOUNT_RECONCILIATION_REQUIRED'});
    assert.equal(h.attempts(),0);
  });
});
test('Production EUR 499 passes validation and reaches persistence boundary',async()=>{
  const h=harness();
  await assert.rejects(h.payments.stripe(account,session(),now),error=>error===h.stop);
  assert.equal(h.attempts(),1);
});
test('Unpaid asynchronous checkout is ignored until payment succeeds',async()=>{
  const h=harness();
  assert.deepEqual(await h.payments.stripe(account,session({payment_status:'unpaid',amount_total:null}),now),
    {ignored:true});
  assert.equal(h.attempts(),0);
  await assert.rejects(h.payments.stripe(account,session(),now),error=>error===h.stop);
});
test('Correct amount cannot bypass link, environment or pre-cutover checks',async()=>{
  for (const [patch,message] of [
    [{payment_link:'plink_other'},'PRO_STRIPE_PRODUCT_MISMATCH'],
    [{livemode:false},'PRO_STRIPE_ENVIRONMENT_MISMATCH'],
    [{created:(cutover-1000)/1000},'PRO_PRE_CUTOVER_RECONCILIATION_REQUIRED'],
  ]) {
    const h=harness();
    await assert.rejects(h.payments.stripe(account,session(patch),now),{message});
    assert.equal(h.attempts(),0);
  }
});
test('Sandbox monetary policy is unchanged by Production-only restriction',async()=>{
  const h=harness('test');
  await assert.rejects(h.payments.stripe(account,session({livemode:false,currency:undefined,amount_total:undefined}),now),
    error=>error===h.stop);
  assert.equal(h.attempts(),1);
});

test('Adaptive Pricing presentment does not replace original EUR price',async()=>{
  const h=harness();
  await assert.rejects(h.payments.stripe(account,session({
    presentment_details:{presentment_currency:'usd',presentment_amount:550},
  }),now),error=>error===h.stop);
  assert.equal(h.attempts(),1);
  const invalid=harness();
  await assert.rejects(invalid.payments.stripe(account,session({
    currency:'usd',amount_total:550,
    presentment_details:{presentment_currency:'eur',presentment_amount:499},
  }),now),{message:'PRO_STRIPE_AMOUNT_RECONCILIATION_REQUIRED'});
  assert.equal(invalid.attempts(),0);
});
