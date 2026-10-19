import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppReviewRouter} from '../worker/app-review-router.mjs';
import {createPurchases} from '../mobile/src/purchases.mjs';
function fixture() {
  const calls=[];
  const env={DB:{name:'live'},LICENSE_SECRET:'live-secret',APP_REVIEW_ENABLED:'1',
    APP_REVIEW_DB:{name:'review'},APP_REVIEW_LICENSE_SECRET:'review-secret',
    APP_REVIEW_ACCOUNT_EMAIL:'review@example.invalid',APP_REVIEW_ACCOUNT_ID:'review-id',
    APP_REVIEW_VERIFIER_URL:'https://verifier.example',APP_REVIEW_VERIFIER_SECRET:'verifier-secret',
    ADMIN_KEY:'live-admin',STRIPE_WEBHOOK_SECRET:'live-stripe',RESEND_API_KEY:'live-email'};
  const core={
    async fetch(req,e){calls.push({kind:'login',env:e});const b=await req.json();
      return Response.json(b.password==='correct'?{ok:true,token:'signed-review'}:{error:'LOGIN_FAILED'},
        {status:b.password==='correct'?200:401});},
    async authenticatePurchaseAccount(req,e){calls.push({kind:'authenticate',env:e});
      return req.headers.get('Authorization')==='Bearer signed-review' && e.DB===env.APP_REVIEW_DB?
        {id:'review-id'}:null;},
  };
  const production={fetch:async(req,e)=>{calls.push({kind:'production',env:e});return Response.json({live:true});}};
  const sandbox={fetch:async(req,e)=>{calls.push({kind:'sandbox',env:e,request:req});
    return Response.json(new URL(req.url).pathname==='/apple/token'?{environment:'Sandbox'}:{sandbox:true});}};
  const router=createAppReviewRouter(production,sandbox,core);
  const call=(path,{token,body}={})=>router.fetch(new Request('https://api.example'+path,{
    method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'x-admin-key':'injected'},
    ...(body?{body:JSON.stringify(body)}:{})}),env,{});
  return {env,calls,call};
}
test('ordinary users and forged environment fields never select review database',async()=>{
  const h=fixture();await h.call('/auth/login',{body:{email:'user@example.invalid',environment:'Sandbox'}});
  await h.call('/apple/token',{token:'live-token'});
  assert.deepEqual(h.calls.map(c=>c.kind),['production','production']);
});
test('reserved review login validates credentials and identity then marks only isolated session',async()=>{
  const h=fixture();assert.equal((await h.call('/auth/login',{body:{email:'review@example.invalid',password:'wrong'}})).status,401);
  const r=await h.call('/auth/login',{body:{email:' REVIEW@example.invalid ',password:'correct'}});
  assert.equal((await r.json()).token,'cr-review:signed-review');
  assert.ok(h.calls.every(c=>c.env.DB===h.env.APP_REVIEW_DB));
});
test('forged review prefix and wrong designated account fail authentication without live fallback',async()=>{
  const h=fixture();assert.equal((await h.call('/predict',{token:'cr-review:live-token'})).status,401);
  h.env.APP_REVIEW_ACCOUNT_ID='other-id';
  assert.equal((await h.call('/apple/token',{token:'cr-review:signed-review'})).status,401);
  assert.ok(h.calls.every(c=>c.kind==='authenticate'));
});
test('review routing uses isolated secrets, removes administrator keys and marks token context',async()=>{
  const h=fixture();const r=await h.call('/apple/token',{token:'cr-review:signed-review'});
  assert.deepEqual(await r.json(),{environment:'Sandbox',audience:'app-review'});
  const call=h.calls.at(-1);assert.equal(call.env.DB,h.env.APP_REVIEW_DB);
  assert.equal(call.env.LICENSE_SECRET,'review-secret');assert.equal(call.env.ADMIN_KEY,undefined);
  assert.equal(call.env.STRIPE_WEBHOOK_SECRET,undefined);assert.equal(call.env.RESEND_API_KEY,undefined);
  assert.equal(call.request.headers.get('x-admin-key'),null);
  assert.equal(call.request.headers.get('Authorization'),'Bearer signed-review');
});
test('review session cannot reach admin, web payments, signup, resets or notification routes',async()=>{
  const h=fixture();for(const path of ['/admin/grant','/stripe/webhook','/license/redeem','/auth/reset','/apple/notifications']) {
    assert.equal((await h.call(path,{token:'cr-review:signed-review',body:{}})).status,403);
  }
  assert.equal((await h.call('/auth/register',{body:{email:'review@example.invalid'}})).status,403);
  assert.ok(h.calls.every(c=>c.kind==='authenticate'));
});
test('disabled or unsafe review configuration fails closed while normal users continue',async()=>{
  for(const modify of [e=>e.APP_REVIEW_ENABLED='0',e=>e.APP_REVIEW_DB=e.DB,
      e=>e.APP_REVIEW_LICENSE_SECRET=e.LICENSE_SECRET,e=>delete e.APP_REVIEW_VERIFIER_SECRET]) {
    const h=fixture();modify(h.env);
    assert.equal((await h.call('/auth/me',{token:'cr-review:signed-review'})).status,503);
    assert.equal((await h.call('/auth/me',{token:'live-token'})).status,200);
    assert.deepEqual(h.calls.map(c=>c.kind),['production']);
  }
});
test('review deletion uses sandbox handler after authentication',async()=>{
  const h=fixture();assert.equal((await h.call('/auth/delete',{token:'cr-review:signed-review',body:{password:'correct'}})).status,200);
  assert.equal(h.calls.at(-1).kind,'sandbox');
});
test('public mobile accepts Sandbox only with explicit authenticated review context',async()=>{
  const account={environment:'Sandbox',productId:'com.calcioreport.app.pro30',appAccountToken:'12345678-1234-4234-8234-123456789abc'};
  let opened=0;
  const manager=createPurchases({environment:'Production',allowAppReview:true,
    session:{ready:Promise.resolve(),token:'review-session'},request:async()=>account,
    native:{purchase:async()=>{opened++;return {state:'cancelled'};}}});
  await assert.rejects(manager.purchase(),/PURCHASES_UNAVAILABLE/);
  account.audience='app-review';assert.equal((await manager.purchase()).state,'cancelled');
  assert.equal(opened,1);
});

test('real signed review sessions authenticate only in their database and stop after account deletion',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {readFileSync}=await import('node:fs');
  const {default:core}=await import('../worker/worker.js');
  function database() {
    const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
    sql.exec(readFileSync(new URL('./fixtures/account-schema.sql',import.meta.url),'utf8'));
    const db={prepare(query){return {bind(...args){return {
      async first(){return sql.prepare(query).get(...args)||null;},
      async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};},
    };}};}};
    return {sql,db};
  }
  const live=database(),review=database();
  const env={DB:live.db,LICENSE_SECRET:'live-integration-secret',APP_REVIEW_ENABLED:'1',
    APP_REVIEW_DB:review.db,APP_REVIEW_LICENSE_SECRET:'isolated-integration-secret',
    APP_REVIEW_ACCOUNT_EMAIL:'review@example.invalid',APP_REVIEW_VERIFIER_URL:'https://verifier.example',
    APP_REVIEW_VERIFIER_SECRET:'verifier-secret'};
  const request=(path,body,token)=>new Request('https://api.example'+path,{
    method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  const credentials={email:'review@example.invalid',password:'Test-password-123!'};
  const provision=await core.fetch(request('/auth/register',credentials),{
    DB:review.db,LICENSE_SECRET:env.APP_REVIEW_LICENSE_SECRET},{});
  assert.equal(provision.status,200);
  env.APP_REVIEW_ACCOUNT_ID=review.sql.prepare('SELECT id FROM users').get().id;
  const router=createAppReviewRouter(core,core,core);
  const login=await router.fetch(request('/auth/login',credentials),env,{});
  assert.equal(login.status,200);const {token}=await login.json();
  assert.ok(token.startsWith('cr-review:'));
  assert.equal((await router.fetch(request('/auth/me',null,token),env,{})).status,200);
  assert.equal(await core.authenticatePurchaseAccount(request('/auth/me',null,token.slice(10)),env),null);
  assert.equal(live.sql.prepare('SELECT count(*) n FROM users').get().n,0);
  review.sql.prepare('DELETE FROM users').run();
  assert.equal((await router.fetch(request('/auth/me',null,token),env,{})).status,401);
});
