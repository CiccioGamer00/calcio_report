import { probeAppleVerifier } from './apple-verifier-client.mjs';

const headers={'content-type':'application/json','cache-control':'no-store',
  'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Authorization, x-admin-key'};
const json=(body,status)=>new Response(JSON.stringify(body),{status,headers});

export function withAppleReadiness(handler) {
  return {async fetch(request,env,ctx) {
    if(new URL(request.url).pathname!=='/admin/apple-readiness') return handler.fetch(request,env,ctx);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    const key=request.headers.get('x-admin-key');
    if(!key || !env.ADMIN_KEY || key!==env.ADMIN_KEY) return json({error:'FORBIDDEN'},403);
    if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
    if(env.APPLE_DEPLOYMENT!=='production' || env.APPLE_ENVIRONMENT!=='Production' ||
       env.APPLE_VERIFIER_URL!=='https://apple.calcioreport.com') {
      return json({ok:false,error:'APPLE_READINESS_CONFIG_INVALID'},503);
    }
    try {
      const result=await probeAppleVerifier({url:env.APPLE_VERIFIER_URL,secret:env.APPLE_VERIFIER_SECRET});
      return json({ok:result.ok,verifier:result.ok?'HMAC_OK_BAD_INPUT':'FAILED',
        upstreamStatus:result.upstreamStatus},result.ok?200:503);
    } catch {
      return json({ok:false,error:'APPLE_READINESS_UNAVAILABLE'},503);
    }
  }};
}
