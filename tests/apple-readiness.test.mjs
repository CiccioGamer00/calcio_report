import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createVerificationServer} from '../services/apple-verifier/server.mjs';
import {withAppleReadiness} from '../worker/apple-readiness.mjs';
import {probeAppleVerifier,fetchReconciledAppleTransaction} from '../worker/apple-verifier-client.mjs';

const secret='a'.repeat(64);
const config={url:'https://apple.calcioreport.com',secret};
const env={ADMIN_KEY:'private-admin',APPLE_DEPLOYMENT:'production',APPLE_ENVIRONMENT:'Production',
  APPLE_VERIFIER_URL:config.url,APPLE_VERIFIER_SECRET:secret};
function harness() {
  let delegated=0;
  const handler=withAppleReadiness({fetch:async()=>{delegated++;return new Response('delegated');}});
  return {get delegated(){return delegated;},call:(key='private-admin',method='POST',e=env)=>handler.fetch(
    new Request('https://api.example/admin/apple-readiness',{method,headers:key?{'x-admin-key':key}:{}}),e,{})};
}

test('admin authentication and correct production configuration precede all network access',async t=>{
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  t.after(()=>globalThis.fetch=previous);
  const h=harness();
  for(const key of [null,'wrong'])assert.equal((await h.call(key)).status,403);
  assert.equal((await h.call('private-admin','GET')).status,405);
  assert.equal((await h.call(null,'OPTIONS')).status,204);
  for(const e of [{...env,APPLE_ENVIRONMENT:'Sandbox'},{...env,APPLE_DEPLOYMENT:'test'},
    {...env,APPLE_VERIFIER_URL:'https://attacker.example'},{...env,APPLE_VERIFIER_SECRET:'invalid'}]) {
    assert.equal((await h.call('private-admin','POST',e)).status,503);
  }
  assert.equal(calls,0);assert.equal(h.delegated,0);
});

test('real verifier accepts the Worker HMAC but never calls Apple reconciliation or D1',async t=>{
  let reconciled=0;
  const server=createVerificationServer({secret,reconciler:{transaction:async()=>{reconciled++;},notification:async()=>{reconciled++;}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const previous=globalThis.fetch;let requests=0;
  globalThis.fetch=async(url,options)=>{
    requests++;assert.equal(new URL(url).origin,config.url);
    assert.equal(new URL(url).pathname,'/v1/transaction');
    assert.equal(options.body,'{}');assert.equal(options.redirect,'manual');
    return previous('http://127.0.0.1:'+server.address().port+'/v1/transaction',options);
  };
  t.after(()=>globalThis.fetch=previous);
  const db=new Proxy({}, {get(){throw Error('D1 must not be touched');}});
  const response=await harness().call('private-admin','POST',{...env,DB:db,APPLE_PRODUCTION_ENABLED:'0'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,verifier:'HMAC_OK_BAD_INPUT',upstreamStatus:400});
  assert.equal(requests,1);assert.equal(reconciled,0);
});

test('wrong HMAC secret is an upstream authentication failure, not a successful probe',async t=>{
  const server=createVerificationServer({secret,reconciler:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const previous=globalThis.fetch;
  globalThis.fetch=(url,options)=>previous('http://127.0.0.1:'+server.address().port+'/v1/transaction',options);
  t.after(()=>globalThis.fetch=previous);
  const response=await harness().call('private-admin','POST',{...env,APPLE_VERIFIER_SECRET:'b'.repeat(64)});
  assert.equal(response.status,503);assert.equal((await response.json()).upstreamStatus,401);
});

test('redirects, unrelated 400s, 200s, oversized replies and network failures never pass',async t=>{
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  for(const [status,body] of [[302,{error:'BAD_INPUT'}],[200,{error:'BAD_INPUT'}],[400,{error:'OTHER'}],[401,{error:'AUTH_INVALID'}]]) {
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(body,{status});};
    const response=await harness().call();assert.equal(response.status,503);assert.equal(calls,1);
  }
  globalThis.fetch=async()=>new Response('x'.repeat(5000),{status:400});
  assert.equal((await harness().call()).status,503);
  globalThis.fetch=async()=>{throw Error('network contains private details');};
  const response=await harness().call();assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,error:'APPLE_READINESS_UNAVAILABLE'});
});

test('shared transport preserves transaction/notification contract and rejects untrusted configuration',async t=>{
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  let path,body;
  globalThis.fetch=async(url,options)=>{path=new URL(url).pathname;body=JSON.parse(options.body);return Response.json({transaction:{transactionId:'123'}});};
  assert.deepEqual(await fetchReconciledAppleTransaction(config,'signed.payload'),{transactionId:'123'});
  assert.equal(path,'/v1/transaction');assert.deepEqual(body,{signedPayload:'signed.payload'});
  globalThis.fetch=async()=>Response.json({transaction:null,ignored:true});
  assert.equal(await fetchReconciledAppleTransaction(config,'signed.notification','notification'),null);
  for(const url of ['http://apple.calcioreport.com','https://user:pass@apple.calcioreport.com','https://apple.calcioreport.com/elsewhere','https://apple.calcioreport.com/?query=1']) {
    await assert.rejects(probeAppleVerifier({...config,url}),/APPLE_VERIFIER_CONFIG_INVALID/);
  }
});
