// Optional aggregate metric. Never accepts an account ID from the client.
const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Authorization, x-admin-key'};

export function withCommunityInterest(handler, core) {
  return {async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/community/interest' && request.method !== 'OPTIONS') {
      if (request.method !== 'POST') return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}), {status:405,headers:{...headers,Allow:'POST'}});
      const result = await recordCommunityInterest(request,env,(req,e)=>core.authenticatePurchaseAccount(req,e));
      return new Response(JSON.stringify(result.body),{status:result.status,headers});
    }
    const response = await handler.fetch(request,env,ctx);
    if (path !== '/admin/stats' || request.method !== 'GET' || !response.ok) return response;
    const body = await response.clone().json().catch(()=>null);
    if (body?.ok !== true) return response;
    const out = new Headers(response.headers);out.set('Cache-Control','no-store');
    return new Response(JSON.stringify({...body,communityInterested:await countCommunityInterest(env)}),{status:response.status,headers:out});
  }};
}

export async function recordCommunityInterest(request, env, authenticate) {
  const account = await authenticate(request, env);
  if (!account) return {status:401, body:{error:'AUTH_REQUIRED'}};
  // The public router supplies the same designated ID in its isolated context.
  // Do not require a metric table in the review database or count review users.
  if (account.id === env.APP_REVIEW_ACCOUNT_ID || env.APPLE_DEPLOYMENT === 'test') {
    return {status:200, body:{ok:true, recorded:false}};
  }
  try {
    await env.DB.prepare(
      'INSERT INTO community_interest (account_id, created_at) SELECT id, ? FROM users WHERE id = ? AND COALESCE(disabled,0) = 0 ON CONFLICT(account_id) DO NOTHING',
    ).bind(Date.now(), account.id).run();
    const row = await env.DB.prepare('SELECT account_id FROM community_interest WHERE account_id = ?')
      .bind(account.id).first();
    if (!row) return {status:401, body:{error:'AUTH_REQUIRED'}};
    return {status:200, body:{ok:true, recorded:true}};
  } catch {
    return {status:503, body:{error:'COMMUNITY_UNAVAILABLE'}};
  }
}

export async function countCommunityInterest(env) {
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM community_interest AS c JOIN users AS u ON u.id = c.account_id WHERE COALESCE(u.disabled,0) = 0 AND u.id <> ?',
    ).bind(env.APP_REVIEW_ACCOUNT_ID || '').first();
    return Number(row?.c || 0);
  } catch {
    // Missing schema/storage must not break the dashboard or look like zero interest.
    return null;
  }
}
