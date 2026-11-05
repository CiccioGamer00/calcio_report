import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTransaction, createAppleReconciler } from '../reconcile.mjs';

const tx={transactionId:'123',originalTransactionId:'123',bundleId:'com.calcioreport.app',
  environment:'Sandbox',productId:'com.calcioreport.app.pro30',purchaseDate:1000,
  signedDate:2000,appAccountToken:'abcdefgh',type:'Non-Renewing Subscription',quantity:1,
  inAppOwnershipType:'PURCHASED'};

test('reconciliation verifies device and current Apple signatures and returns current refund state',async()=>{
  const calls=[];const current={...tx,signedDate:3000,revocationDate:2500};
  const verifier={async transaction(s){calls.push(s);return s==='device'?tx:current;}};
  const client={async getTransactionInfo(id){assert.equal(id,'123');return {signedTransactionInfo:'current'};}};
  assert.deepEqual(await reconcileTransaction(verifier,client,'device'),current);
  assert.deepEqual(calls,['device','current']);
});
test('invalid signatures, Apple outages and changed ownership fail without historical fallback',async()=>{
  for(const field of ['transactionId','environment','productId','purchaseDate','appAccountToken']) {
    const verifier={async transaction(s){return s==='device'?tx:{...tx,[field]:'wrong'};}};
    await assert.rejects(reconcileTransaction(verifier,{async getTransactionInfo(){return {signedTransactionInfo:'current'};}},'device'),/MISMATCH/);
  }
  await assert.rejects(reconcileTransaction({async transaction(){throw Error('signature');}}, {},'device'),/signature/);
  await assert.rejects(reconcileTransaction({async transaction(){return tx;}},
    {async getTransactionInfo(){throw Error('outage');}},'device'),/outage/);
  assert.throws(()=>createAppleReconciler({deployment:'test',environment:'Sandbox'}),/API_CONFIG_INVALID/);
});
