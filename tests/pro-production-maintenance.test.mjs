import test from 'node:test';
import assert from 'node:assert/strict';
import { withProductionProMaintenance } from '../worker/pro-production-maintenance.mjs';

function harness() {
  const calls=[];
  const handler=withProductionProMaintenance({fetch(...args){
    calls.push(args); return new Response('delegated',{status:202});
  }});
  return {handler,calls};
}
test('Paused Production refuses all payment and account-lifecycle writers',async()=>{
  const h=harness();
  for(const [path,method] of [
    ['/stripe/webhook','POST'],['/license/redeem','POST'],['/admin/grant','POST'],
    ['/admin/adjust','POST'],['/admin/mint','GET'],['/auth/delete','POST'],
    ['/admin/disable','POST'],
  ]) {
    const response=await h.handler.fetch(new Request('https://example.invalid'+path,{method}),
      {PRO_WRITES_PAUSED:'1'},{});
    assert.equal(response.status,503,path);
    assert.equal(response.headers.get('retry-after'),'60');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).error,'PRO_MAINTENANCE');
  }
  assert.equal(h.calls.length,0);
});
test('Read-only dashboard, login, football and preflight remain delegated',async()=>{
  const h=harness();
  for(const [path,method] of [
    ['/admin/users','GET'],['/admin/stats','GET'],['/auth/me','GET'],
    ['/auth/login','POST'],['/fixtures','GET'],['/admin/adjust','OPTIONS'],
  ]) assert.equal((await h.handler.fetch(new Request('https://example.invalid'+path,{method}),
    {PRO_WRITES_PAUSED:'1'},{})).status,202);
  assert.equal(h.calls.length,6);
});
test('Pause flag must be explicitly enabled; request/env/context preserved',async()=>{
  for (const value of [undefined,'0','',1]) {
    const h=harness(), env={PRO_WRITES_PAUSED:value},ctx={};
    const request=new Request('https://example.invalid/stripe/webhook',{method:'POST'});
    assert.equal((await h.handler.fetch(request,env,ctx)).status,202);
    assert.deepEqual(h.calls[0],[request,env,ctx]);
  }
});
test('Removing pause restores writer delegation without changing the handler',async()=>{
  const h=harness(), env={PRO_WRITES_PAUSED:'1'};
  const request=()=>new Request('https://example.invalid/admin/adjust',{method:'POST'});
  assert.equal((await h.handler.fetch(request(),env,{})).status,503);
  env.PRO_WRITES_PAUSED='0';
  assert.equal((await h.handler.fetch(request(),env,{})).status,202);
  assert.equal(h.calls.length,1);
});

test('Production pause does not intercept authenticated review routing',async()=>{
  const {createAppReviewRouter}=await import('../worker/app-review-router.mjs');
  const h=harness(); let sandboxCalls=0;
  const reviewDb={},liveDb={};
  const router=createAppReviewRouter(h.handler,{fetch(request,env){
    sandboxCalls++; assert.equal(env.DB,reviewDb);
    assert.equal(env.APPLE_ENVIRONMENT,'Sandbox');
    return new Response('sandbox',{status:202});
  }},{authenticatePurchaseAccount:async()=>({id:'review-account'})});
  const env={PRO_WRITES_PAUSED:'1',APP_REVIEW_ENABLED:'1',DB:liveDb,APP_REVIEW_DB:reviewDb,
    APP_REVIEW_ACCOUNT_ID:'review-account',APP_REVIEW_ACCOUNT_EMAIL:'review@example.invalid',
    LICENSE_SECRET:'synthetic-live',APP_REVIEW_LICENSE_SECRET:'synthetic-review',
    APP_REVIEW_VERIFIER_URL:'https://sandbox.example.invalid',APP_REVIEW_VERIFIER_SECRET:'synthetic'};
  const response=await router.fetch(new Request('https://example.invalid/auth/delete',{
    method:'POST',headers:{Authorization:'Bearer cr-review:synthetic-token'},
  }),env,{});
  assert.equal(response.status,202);
  assert.equal(sandboxCalls,1);
  assert.equal(h.calls.length,0);
  const live=await router.fetch(new Request('https://example.invalid/auth/delete',{method:'POST'}),env,{});
  assert.equal(live.status,503);
});
