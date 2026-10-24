// Production entry only. Review sessions are authenticated against a separate DB
// and signing secret; a route prefix alone never authorizes review access.
const prefix = 'cr-review:';
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{
  'content-type':'application/json', 'cache-control':'no-store', 'Access-Control-Allow-Origin':'*',
}});
const normalize = value => String(value || '').trim().toLowerCase();
function reviewEnvironment(env) {
  if (env.APP_REVIEW_ENABLED !== '1' || !env.APP_REVIEW_DB || env.APP_REVIEW_DB === env.DB ||
      !env.APP_REVIEW_ACCOUNT_ID || !env.APP_REVIEW_ACCOUNT_EMAIL ||
      !env.APP_REVIEW_LICENSE_SECRET || env.APP_REVIEW_LICENSE_SECRET === env.LICENSE_SECRET ||
      !env.APP_REVIEW_VERIFIER_URL || !env.APP_REVIEW_VERIFIER_SECRET) throw Error('REVIEW_CONFIG_INVALID');
  return {...env, DB:env.APP_REVIEW_DB, LICENSE_SECRET:env.APP_REVIEW_LICENSE_SECRET,
    APPLE_DEPLOYMENT:'test', APPLE_ENVIRONMENT:'Sandbox', APPLE_SANDBOX_ENABLED:'1',
    APPLE_VERIFIER_URL:env.APP_REVIEW_VERIFIER_URL, APPLE_VERIFIER_SECRET:env.APP_REVIEW_VERIFIER_SECRET,
    PRO_LEDGER_ENABLED:'0', ADMIN_KEY:undefined, STRIPE_WEBHOOK_SECRET:undefined,
    RESEND_API_KEY:undefined};
}
function withToken(request, token) {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.delete('x-admin-key');
  return new Request(request, {headers});
}
export function createAppReviewRouter(production, sandbox, core) {
  return {async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const authorization = request.headers.get('Authorization') || '';
    const reviewToken = authorization.startsWith(`Bearer ${prefix}`);
    let reviewLogin = false;
    if (request.method === 'POST' && ['/auth/login','/auth/register','/auth/forgot'].includes(path)) {
      // Body remains available to the normal handler. Match only a server-configured
      // reserved email; no user-supplied environment, URL or account flag is trusted.
      const body = await request.clone().json().catch(()=>null);
      reviewLogin = !!env.APP_REVIEW_ACCOUNT_EMAIL &&
        normalize(body?.email) === normalize(env.APP_REVIEW_ACCOUNT_EMAIL);
    }
    if (!reviewToken && !reviewLogin) return production.fetch(request, env, ctx);
    try {
      const reviewEnv = reviewEnvironment(env);
      if (reviewLogin) {
        // Reviewer credentials are provisioned separately, never through signup.
        if (path !== '/auth/login') return json({error:'REVIEW_ACCOUNT_MANAGED'},403);
        const response = await core.fetch(request, reviewEnv, ctx);
        if (!response.ok) return response;
        const body = await response.json();
        if (!body.ok || typeof body.token !== 'string') throw Error('REVIEW_LOGIN_INVALID');
        const account = await core.authenticatePurchaseAccount(withToken(new Request(request.url),body.token),reviewEnv);
        if (account?.id !== env.APP_REVIEW_ACCOUNT_ID) return json({error:'AUTH_INVALID'},401);
        const headers = new Headers(response.headers); headers.set('cache-control','no-store');
        return new Response(JSON.stringify({...body,token:prefix+body.token}),{status:response.status,headers});
      }
      const routed = withToken(request,authorization.slice(`Bearer ${prefix}`.length));
      const account = await core.authenticatePurchaseAccount(routed,reviewEnv);
      if (account?.id !== env.APP_REVIEW_ACCOUNT_ID) return json({error:'AUTH_INVALID'},401);
      // Financial administration, web payments, resets and notifications never
      // enter the review environment through a user session.
      if (path.startsWith('/admin/') || path.startsWith('/stripe/') || path.startsWith('/license/') ||
          ['/apple/notifications','/auth/reset','/auth/register','/auth/forgot','/auth/login'].includes(path)) {
        return json({error:'REVIEW_ROUTE_UNAVAILABLE'},403);
      }
      const response = await sandbox.fetch(routed,reviewEnv,ctx);
      if (path === '/apple/token' && response.ok) {
        const body = await response.json();
        if (body.environment !== 'Sandbox') throw Error('REVIEW_CONTEXT_INVALID');
        return json({...body,audience:'app-review'});
      }
      return response;
    } catch { return json({error:'REVIEW_UNAVAILABLE'},503); }
  }};
}
