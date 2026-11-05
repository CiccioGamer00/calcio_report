import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createVerificationServer } from '../server.mjs';
import { fetchReconciledAppleTransaction } from '../../../worker/apple-verifier-client.mjs';

const secret='ab'.repeat(32);
async function harness(t,reconciler) {
  const server=createVerificationServer({secret,reconciler});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}`;
  return async (payload,path='/v1/transaction',patch={})=> {
    const body=JSON.stringify({signedPayload:payload});const timestamp=String(Date.now());
    const hash=createHash('sha256').update(body).digest('hex');
    const signature=createHmac('sha256',secret).update(`${timestamp}\nPOST\n${path}\n${hash}`).digest('hex');
    return fetch(url+path,{method:'POST',body,headers:{'x-cr-timestamp':timestamp,'x-cr-signature':signature,...patch}});
  };
}
test('body-authenticated calls reach reconciler; wrong MAC and expired request never do',async t=>{
  let calls=0;const request=await harness(t,{async transaction(){calls++;return {transactionId:'123'};}});
  assert.equal((await request('a.b.c')).status,200);
  assert.equal((await request('a.b.c','/v1/transaction',{'x-cr-signature':'00'.repeat(32)})).status,401);
  assert.equal((await request('a.b.c','/v1/transaction',{'x-cr-timestamp':'1000000000000'})).status,401);
  assert.equal(calls,1);
});
test('upstream failure stays retryable and exposes no raw secret or payload',async t=>{
  const request=await harness(t,{async transaction(){throw Error('private sensitive details');}});
  const result=await request('a.b.c');assert.equal(result.status,503);
  assert.deepEqual(await result.json(),{error:'APPLE_VERIFICATION_UNAVAILABLE'});
  assert.equal((await request('a'.repeat(200000))).status,413);
});
test('Worker client signs exact request body compatibly and forbids redirects/config injection',async t=>{
  const original=globalThis.fetch;
  t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async(url,options)=> {
    assert.equal(String(url),'https://verifier.example/v1/transaction');
    assert.equal(options.redirect,'manual');
    const hash=createHash('sha256').update(options.body).digest('hex');
    const expected=createHmac('sha256',secret).update(`${options.headers['x-cr-timestamp']}\nPOST\n/v1/transaction\n${hash}`).digest('hex');
    assert.equal(options.headers['x-cr-signature'],expected);
    return Response.json({transaction:{transactionId:'123'}});
  };
  assert.deepEqual(await fetchReconciledAppleTransaction({url:'https://verifier.example',secret},'a.b.c'),{transactionId:'123'});
  await assert.rejects(fetchReconciledAppleTransaction({url:'http://verifier.example',secret},'a.b.c'),/CONFIG_INVALID/);
  for (const status of [301,302,307,308,503]) {
    globalThis.fetch=async()=>new Response(null,{status,headers:{location:'https://other.example'}});
    await assert.rejects(fetchReconciledAppleTransaction({url:'https://verifier.example',secret},'a.b.c'),/VERIFICATION_UNAVAILABLE/);
  }
  globalThis.fetch=async()=>Response.json({ignored:true,transaction:null});
  assert.equal(await fetchReconciledAppleTransaction({url:'https://verifier.example',secret},'a.b.c','notification'),null);
  globalThis.fetch=async()=>new Response('x'.repeat(140000));
  await assert.rejects(fetchReconciledAppleTransaction({url:'https://verifier.example',secret},'a.b.c'),/RESPONSE_INVALID/);
});
