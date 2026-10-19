import core from './worker.js';
import { ensureAppleAccountToken } from './apple-purchase-ledger.mjs';
import { fetchReconciledAppleTransaction } from './apple-verifier-client.mjs';
import { deliverReconciledApplePurchase } from './apple-pro-delivery.mjs';

const headers = { 'content-type':'application/json', 'cache-control':'no-store',
  'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Authorization' };
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const config={deployment:'test',environment:'Sandbox',bundleId:'com.calcioreport.app',productId:'com.calcioreport.app.pro30'};

async function readPayload(request) {
  const reader=request.body?.getReader();if(!reader)throw Error('BAD_INPUT');
  let size=0;let text='';const decoder=new TextDecoder();
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;
      size+=value.length;if(size>192*1024)throw Error('BODY_TOO_LARGE');
      text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  } finally {await reader.cancel();}
  const body=JSON.parse(text);
  if(typeof body?.signedPayload!=='string')throw Error('BAD_INPUT');
  return body.signedPayload;
}

// A distinct, test-only Worker entry point. Existing worker.js keeps its normal
// deployment. This entry cannot enable production Apple purchases.
export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/apple/')) {
      // The sandbox accounting candidate cannot coexist with legacy direct
      // paid_until writers. Production migration of those writers is pending.
      if(env.APPLE_SANDBOX_ENABLED==='1' && ['/stripe/webhook','/license/redeem','/admin/grant','/admin/adjust'].includes(path)) {
        return json({error:'SANDBOX_LEGACY_PAYMENT_DISABLED'},503);
      }
      return core.fetch(request,env,ctx);
    }
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(env.APPLE_SANDBOX_ENABLED!=='1')return json({error:'APPLE_PURCHASES_DISABLED'},503);
    if(env.APPLE_DEPLOYMENT!=='test' || env.APPLE_ENVIRONMENT!=='Sandbox')return json({error:'APPLE_CONFIG_INVALID'},503);
    if(!((path==='/apple/token' && request.method==='GET') ||
         (['/apple/transaction','/apple/notifications'].includes(path) && request.method==='POST')))return json({error:'NOT_FOUND'},404);
    try {
      if(path==='/apple/notifications') {
        const signedPayload=await readPayload(request);
        const transaction=await fetchReconciledAppleTransaction({url:env.APPLE_VERIFIER_URL,
          secret:env.APPLE_VERIFIER_SECRET},signedPayload,'notification');
        if(transaction===null)return json({ok:true,ignored:true});
        if(typeof transaction.appAccountToken!=='string' || transaction.environment!=='Sandbox') {
          return json({error:'APPLE_NOTIFICATION_ACCOUNT_INVALID'},503);
        }
        const owner=await env.DB.prepare(`SELECT account_id,retired_at FROM apple_account_tokens
          WHERE environment=? AND app_account_token=?`)
          .bind('Sandbox',transaction.appAccountToken.toLowerCase()).first();
        if(!owner)return json({error:'APPLE_NOTIFICATION_ACCOUNT_UNKNOWN'},503);
        if(owner.retired_at!==null)return json({ok:true,ignored:true});
        await deliverReconciledApplePurchase(env.DB,owner.account_id,transaction,config,Date.now());
        return json({ok:true});
      }
      const account=await core.authenticatePurchaseAccount(request,env);
      if(!account)return json({error:'AUTH_INVALID'},401);
      const now=Date.now();
      if(path==='/apple/token') {
        const appAccountToken=await ensureAppleAccountToken(env.DB,account.id,config,now);
        return json({appAccountToken,productId:config.productId,environment:'Sandbox'});
      }
      const signedPayload=await readPayload(request);
      const transaction=await fetchReconciledAppleTransaction({url:env.APPLE_VERIFIER_URL,
        secret:env.APPLE_VERIFIER_SECRET},signedPayload);
      const outcome=await deliverReconciledApplePurchase(env.DB,account.id,transaction,config,Date.now());
      return json({ok:true,...outcome});
    } catch(error) {
      if(error.message==='BODY_TOO_LARGE')return json({error:'BODY_TOO_LARGE'},413);
      if(error instanceof SyntaxError || error.message==='BAD_INPUT')return json({error:'BAD_INPUT'},400);
      // Errors never acknowledge delivery or finish the native transaction.
      return json({error:'APPLE_DELIVERY_UNAVAILABLE'},503);
    }
  },
};
