import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleHandler } from '../worker/apple-handler.mjs';
import { resolveBuildProfile } from '../mobile/src/build-profile.mjs';
import { createPurchases } from '../mobile/src/purchases.mjs';
import { createSession } from '../mobile/src/session.mjs';

const token = '12345678-1234-4234-8234-123456789abc';
function fixture(deployment = 'test') {
  const calls = [];
  const core = {
    async fetch() { calls.push('core'); return new Response('legacy'); },
    async authenticatePurchaseAccount() { return {id:'account-1'}; },
  };
  const handler = createAppleHandler(core, deployment, {
    async ensureToken() { calls.push('token'); return token; },
    async reconcile() { calls.push('verify'); return {environment:'Production',appAccountToken:token}; },
    async deliver() { calls.push('grant'); return {state:'applied'}; },
  });
  const env = {APPLE_SANDBOX_ENABLED:'1', APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox'};
  const fetch = (path, method = 'GET', body) => handler.fetch(new Request('https://worker.example' + path,
    {method, ...(body ? {body:JSON.stringify(body)} : {})}), env, {});
  return {calls, env, fetch};
}

test('Sandbox token contract preserved; wrong environment fails before issuing a token', async () => {
  const h = fixture();
  const good = await h.fetch('/apple/token');
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), {appAccountToken:token, productId:'com.calcioreport.app.pro30',environment:'Sandbox'});
  h.env.APPLE_ENVIRONMENT = 'Production';
  assert.equal((await h.fetch('/apple/token')).status, 503);
  assert.deepEqual(h.calls, ['token']);
});
test('mismatched verified notification cannot read an owner or grant Sandbox access', async () => {
  const h = fixture();
  const response = await h.fetch('/apple/notifications','POST',{signedPayload:'signed'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'APPLE_NOTIFICATION_ACCOUNT_INVALID');
  assert.deepEqual(h.calls,['verify']);
});
test('production candidate cannot activate through flags and preserves legacy web payments', async () => {
  const h = fixture('production');
  Object.assign(h.env,{APPLE_PRODUCTION_ENABLED:'1',APPLE_DEPLOYMENT:'production',APPLE_ENVIRONMENT:'Production'});
  assert.equal((await (await h.fetch('/apple/token')).json()).error,'APPLE_PRODUCTION_NOT_READY');
  for (const path of ['/stripe/webhook','/license/redeem','/admin/grant','/admin/adjust']) {
    assert.equal(await (await h.fetch(path,'POST')).text(),'legacy');
  }
  assert.deepEqual(h.calls, ['core','core','core','core']);
  delete h.env.APPLE_PRODUCTION_ENABLED;
  assert.equal((await (await h.fetch('/apple/token')).json()).error,'APPLE_PURCHASES_DISABLED');
});
test('Sandbox still blocks direct legacy payment writes only when enabled', async () => {
  const h = fixture();
  assert.equal((await h.fetch('/stripe/webhook','POST')).status,503);
  h.env.APPLE_SANDBOX_ENABLED='0';
  assert.equal(await (await h.fetch('/stripe/webhook','POST')).text(),'legacy');
});
test('mobile profiles use fixed origins and refuse unknown build profiles', () => {
  assert.equal(resolveBuildProfile().name,'sandbox');
  assert.equal(resolveBuildProfile('production').baseUrl,'https://api.calcioreport.com');
  assert.equal(resolveBuildProfile('production').purchaseEnvironment,'Production');
  for (const value of ['', 'prod', 'https://attacker.example', null]) {
    assert.throws(() => resolveBuildProfile(value), /MOBILE_PROFILE_INVALID/);
  }
});
test('production coordinator rejects Sandbox context before opening Apple checkout', async () => {
  let opened = 0;
  let environment = 'Sandbox';
  const manager = createPurchases({environment:'Production',session:{ready:Promise.resolve(),token:'session'},
    request:async()=>({environment,productId:'com.calcioreport.app.pro30',appAccountToken:token}),
    native:{purchase:async()=>{opened++;return {state:'cancelled'};}}});
  await assert.rejects(manager.purchase(), /PURCHASES_UNAVAILABLE/);
  assert.equal(opened,0);
  environment='Production';
  assert.equal((await manager.purchase()).state,'cancelled');
  assert.equal(opened,1);
});
test('same installation never reuses Sandbox credentials for production or vice versa', async () => {
  const records=new Map(), flags=new Map();
  const vault={get:async k=>records.get(k),set:async(k,v)=>records.set(k,v),remove:async k=>records.delete(k)};
  const storage={getItem:k=>flags.get(k),setItem:(k,v)=>flags.set(k,v),removeItem:k=>flags.delete(k)};
  const now=()=>10000;
  const sandbox=createSession(vault,storage,now,'test');await sandbox.ready;await sandbox.save('sandbox-token',10000);
  const production=createSession(vault,storage,now,'production');await production.ready;
  assert.equal(production.token,'');
  await production.save('production-token',10000);
  const sandboxAgain=createSession(vault,storage,now,'test');await sandboxAgain.ready;
  assert.equal(sandboxAgain.token,'sandbox-token');
  await production.clear();
  assert.equal(sandboxAgain.token,'sandbox-token');
  assert.ok(![...flags.values()].some(v=>String(v).includes('token')));
});
