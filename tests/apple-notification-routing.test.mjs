import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createAppleHandler } from '../worker/apple-handler.mjs';
import { ensureAppleAccountToken } from '../worker/apple-purchase-ledger.mjs';

const config={deployment:'test',environment:'Sandbox',bundleId:'com.calcioreport.app',productId:'com.calcioreport.app.pro30'};
const now=Date.now()-10000;
function database(t,id) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  for(const p of ['tests/fixtures/account-schema.sql','worker/schema/apple-purchase-ledger.sql','worker/schema/pro-entitlements.sql'])
    sql.exec(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO users(id,email,created_at,paid_until) VALUES(?,?,?,0)').run(id,id+'@example.invalid',now-86400000);
  const db={prepare(query){return {bind(...args){return {query,args,
    async first(){return sql.prepare(query).get(...args)??null;},
    async all(){return {success:true,results:sql.prepare(query).all(...args)};},
    async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};},
  };}};},async batch(statements){
    sql.exec('BEGIN');try {
      const results=statements.map(s=>/^SELECT/.test(s.query)?
        {success:true,results:sql.prepare(s.query).all(...s.args),meta:{changes:0}}:
        {success:true,results:[],meta:{changes:sql.prepare(s.query).run(...s.args).changes}});
      sql.exec('COMMIT');return results;
    }catch(e){sql.exec('ROLLBACK');throw e;}
  }};
  return {sql,db,paid:()=>sql.prepare('SELECT paid_until FROM users WHERE id=?').get(id)?.paid_until};
}
async function harness(t) {
  const ordinary=database(t,'ordinary'),review=database(t,'review');
  const ordinaryToken=await ensureAppleAccountToken(ordinary.db,'ordinary',config,now);
  const reviewToken=await ensureAppleAccountToken(review.db,'review',config,now);
  let verified={environment:'Sandbox',bundleId:config.bundleId,productId:config.productId,
    type:'Non-Renewing Subscription',quantity:1,inAppOwnershipType:'PURCHASED',
    appAccountToken:reviewToken,transactionId:'12345',originalTransactionId:'12345',purchaseDate:now-1000,signedDate:now};
  const env={DB:ordinary.db,APP_REVIEW_DB:review.db,APP_REVIEW_ACCOUNT_ID:'review',
    APPLE_REVIEW_NOTIFICATIONS_ENABLED:'1',APPLE_SANDBOX_ENABLED:'1',APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox'};
  const handler=createAppleHandler({},'test',{reconcile:async()=>{if(verified instanceof Error)throw verified;return verified;}});
  const call=()=>handler.fetch(new Request('https://test.example/apple/notifications',{
    method:'POST',body:JSON.stringify({signedPayload:'signed',accountId:'ordinary',database:'ordinary'})}),env,{});
  return {ordinary,review,ordinaryToken,reviewToken,env,call,get tx(){return verified;},set tx(v){verified=v;}};
}
test('verified review notification grants once in review DB; refund never alters test DB',async t=>{
  const h=await harness(t);
  assert.equal((await h.call()).status,200);const paid=h.review.paid();assert.ok(paid>now);
  assert.equal((await h.call()).status,200);assert.equal(h.review.paid(),paid);assert.equal(h.ordinary.paid(),0);
  h.tx={...h.tx,signedDate:now+1,revocationDate:now,revocationReason:0};
  assert.equal((await h.call()).status,200);assert.ok(h.review.paid()<=now);assert.equal(h.ordinary.paid(),0);
});
test('ordinary Sandbox notifications still reach test DB with review routing enabled',async t=>{
  const h=await harness(t);h.tx={...h.tx,appAccountToken:h.ordinaryToken};
  assert.equal((await h.call()).status,200);assert.ok(h.ordinary.paid()>now);assert.equal(h.review.paid(),0);
});
test('unknown, duplicate, or unauthorized ownership cannot change either DB',async t=>{
  const h=await harness(t);const original=h.tx;
  h.tx={...original,appAccountToken:'00000000-0000-4000-8000-000000000000'};
  assert.equal((await h.call()).status,503);
  h.tx=original;h.env.APP_REVIEW_ACCOUNT_ID='other';assert.equal((await h.call()).status,503);
  h.env.APP_REVIEW_ACCOUNT_ID='review';
  h.ordinary.sql.prepare('INSERT INTO apple_account_tokens VALUES(?,?,?,?,NULL)').run('Sandbox','duplicate',h.reviewToken,now);
  assert.equal((await h.call()).status,503);assert.equal(h.review.paid(),0);assert.equal(h.ordinary.paid(),0);
});
test('signature failure and wrong environment do not access DBs',async t=>{
  const h=await harness(t);let reads=0;
  h.env.DB=h.env.APP_REVIEW_DB={prepare(){reads++;throw Error('must not read');}};
  h.tx={...h.tx,environment:'Production'};assert.equal((await h.call()).status,503);
  h.tx=Error('invalid signature');assert.equal((await h.call()).status,503);assert.equal(reads,0);
});
test('unavailable secondary DB blocks acknowledgment even for a primary owner',async t=>{
  const h=await harness(t);h.tx={...h.tx,appAccountToken:h.ordinaryToken};
  h.env.APP_REVIEW_DB={prepare(){throw Error('D1 unavailable');}};
  assert.equal((await h.call()).status,503);assert.equal(h.ordinary.paid(),0);
});
test('retired review owners acknowledged without resurrection; ignored Apple test notifications need no DB',async t=>{
  const h=await harness(t);h.review.sql.prepare('DELETE FROM users WHERE id=?').run('review');
  assert.deepEqual(await (await h.call()).json(),{ok:true,ignored:true});
  assert.equal(h.review.sql.prepare('SELECT count(*) n FROM apple_purchase_ledger').get().n,0);
  h.tx=null;h.env.DB=h.env.APP_REVIEW_DB=undefined;
  assert.deepEqual(await (await h.call()).json(),{ok:true,ignored:true});
});
test('flag off preserves existing single-DB behavior; missing review binding fails closed',async t=>{
  const h=await harness(t);h.env.APPLE_REVIEW_NOTIFICATIONS_ENABLED='0';
  h.tx={...h.tx,appAccountToken:h.ordinaryToken};assert.equal((await h.call()).status,200);
  const paid=h.ordinary.paid();h.env.APPLE_REVIEW_NOTIFICATIONS_ENABLED='1';delete h.env.APP_REVIEW_DB;
  assert.equal((await h.call()).status,503);assert.equal(h.ordinary.paid(),paid);
});
