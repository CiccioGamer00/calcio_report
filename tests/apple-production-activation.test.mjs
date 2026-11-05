import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import core from '../worker/worker.js';
import {createAppleHandler} from '../worker/apple-handler.mjs';
import {productionAppleReady} from '../worker/apple-activation.mjs';

const day=86400000;
const ready=DB=>({DB,LICENSE_SECRET:'local-session-secret',APPLE_PRODUCTION_ENABLED:'1',
  APPLE_DEPLOYMENT:'production',APPLE_ENVIRONMENT:'Production',PRO_LEDGER_ENABLED:'1',
  PRO_WRITES_PAUSED:'0',PRO_LEDGER_CUTOVER_MS:Date.now()-120000,
  STRIPE_PRO_PAYMENT_LINK_ID:'plink_test',APPLE_VERIFIER_URL:'https://apple.calcioreport.com',
  APPLE_VERIFIER_SECRET:'a'.repeat(64)});

test('activation fails closed for every missing prerequisite, and a closed flag never reads DB/network',async()=>{
  let calls=0;
  const db={prepare(){calls++;throw Error('unexpected DB');},batch(){calls++;throw Error('unexpected DB');}};
  const fake={fetch:async()=>{calls++;throw Error('unexpected core');},authenticatePurchaseAccount:async()=>{calls++;throw Error('unexpected auth');}};
  const handler=createAppleHandler(fake,'production',{ensureToken:async()=>{calls++;},reconcile:async()=>{calls++;}});
  const changes=[{PRO_LEDGER_ENABLED:'0'},{PRO_WRITES_PAUSED:'1'},
    {PRO_LEDGER_CUTOVER_MS:0},{PRO_LEDGER_CUTOVER_MS:Date.now()+60000},
    {PRO_LEDGER_CUTOVER_MS:1.5},{STRIPE_PRO_PAYMENT_LINK_ID:''},{DB:null},
    {APP_REVIEW_DB:db},{APPLE_VERIFIER_URL:'https://apple-test.calcioreport.com'},
    {APPLE_VERIFIER_SECRET:'wrong'}];
  for(const change of changes){
    const env={...ready(db),...change};assert.equal(productionAppleReady(env),false);
    const response=await handler.fetch(new Request('https://api.example/apple/token'),env,{});
    assert.equal(response.status,503);assert.equal((await response.json()).error,'APPLE_PRODUCTION_NOT_READY');
  }
  const response=await handler.fetch(new Request('https://api.example/apple/token'),{...ready(db),APPLE_PRODUCTION_ENABLED:'0'},{});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'APPLE_PURCHASES_DISABLED');
  assert.equal(calls,0);
});

async function fixture(t,{schema=true}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(readFileSync(new URL('./fixtures/account-schema.sql',import.meta.url),'utf8'));
  if(schema)for(const name of ['apple-purchase-ledger','pro-entitlements','pro-payment-operations'])
    sql.exec(readFileSync(new URL('../worker/schema/'+name+'.sql',import.meta.url),'utf8'));
  const DB={prepare(query){const statement={query,args:[],bind(...args){return {...statement,args,
    async first(){return sql.prepare(query).get(...args)||null;},
    async all(){return {success:true,results:sql.prepare(query).all(...args)};},
    async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}};}};return statement;},
    async batch(statements){sql.exec('BEGIN');try{
      const results=statements.map(s=>/^\s*SELECT/i.test(s.query)?{success:true,results:sql.prepare(s.query).all(...s.args)}:
        {success:true,results:[],meta:{changes:sql.prepare(s.query).run(...s.args).changes}});
      sql.exec('COMMIT');return results;
    }catch(error){sql.exec('ROLLBACK');throw error;}}};
  const env=ready(DB),credentials={email:'production@example.invalid',password:'Test-password-123!'};
  const register=await core.fetch(new Request('https://api.example/auth/register',{method:'POST',body:JSON.stringify(credentials)}),env,{});
  assert.equal(register.status,200);const token=(await register.json()).token;
  const baseline=Date.now()+5*day;
  sql.prepare('UPDATE users SET created_at=?,paid_until=?').run(Date.now()-60000,baseline);
  let transaction,verifications=0;
  const handler=createAppleHandler(core,'production',{reconcile:async()=>{verifications++;return transaction;}});
  const call=(path,body,bearer=token)=>handler.fetch(new Request('https://api.example'+path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+bearer},...(body?{body:JSON.stringify(body)}:{})}),env,{});
  const setTransaction=appAccountToken=>{
    transaction={environment:'Production',bundleId:'com.calcioreport.app',productId:'com.calcioreport.app.pro30',
      type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',appAccountToken,
      transactionId:'90071992547409931',originalTransactionId:'90071992547409931',
      purchaseDate:Date.now()-1000,signedDate:Date.now()-500};return transaction;
  };
  return {sql,env,call,baseline,setTransaction,get transaction(){return transaction;},get verifications(){return verifications;}};
}

test('Production route with real SQLite issues a stable token, grants once on retry and preserves existing PRO',async t=>{
  const h=await fixture(t);
  const tokenResponse=await h.call('/apple/token');assert.equal(tokenResponse.status,200);
  const context=await tokenResponse.json();assert.equal(context.environment,'Production');
  assert.equal(context.productId,'com.calcioreport.app.pro30');
  h.setTransaction(context.appAccountToken);
  for(let i=0;i<2;i++){
    const response=await h.call('/apple/transaction',{signedPayload:'verified-by-test-stub'});
    assert.equal(response.status,200);assert.equal((await response.json()).state,'applied');
  }
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM apple_purchase_ledger').get().n,1);
  assert.equal(h.sql.prepare('SELECT paid_until FROM users').get().paid_until,h.baseline+30*day);
  assert.equal(h.verifications,2);
});

test('Production refund notification removes only Apple duration; repeat and retired owner never recreate accounts',async t=>{
  const h=await fixture(t);const context=await (await h.call('/apple/token')).json();
  const transaction=h.setTransaction(context.appAccountToken);
  assert.equal((await h.call('/apple/transaction',{signedPayload:'test'})).status,200);
  Object.assign(transaction,{revocationDate:Date.now()-100,signedDate:Date.now()-10,revocationReason:0});
  for(let i=0;i<2;i++)assert.equal((await h.call('/apple/notifications',{signedPayload:'refund-test'})).status,200);
  assert.equal(h.sql.prepare('SELECT paid_until FROM users').get().paid_until,h.baseline);
  h.sql.exec('DELETE FROM users');
  const response=await h.call('/apple/notifications',{signedPayload:'retired-owner-test'});
  assert.deepEqual(await response.json(),{ok:true,ignored:true});
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM users').get().n,0);
});

test('missing schema blocks token issuance; wrong verified environment cannot grant',async t=>{
  const missing=await fixture(t,{schema:false});
  assert.equal((await missing.call('/apple/token')).status,503);assert.equal(missing.verifications,0);
  const h=await fixture(t);const context=await (await h.call('/apple/token')).json();
  const transaction=h.setTransaction(context.appAccountToken);transaction.environment='Sandbox';
  assert.equal((await h.call('/apple/transaction',{signedPayload:'wrong-environment-test'})).status,503);
  assert.equal(h.sql.prepare('SELECT paid_until FROM users').get().paid_until,h.baseline);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM apple_purchase_ledger').get().n,0);
});
