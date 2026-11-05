// Production-only wrapper: review/Sandbox must remain outside this guard.
// This stops NEW requests; deployment propagation and in-flight legacy requests
// still require an explicit drain before migration.
const pausedRoutes = new Map([
  ['/stripe/webhook', 'POST'],
  ['/license/redeem', 'POST'],
  ['/admin/grant', 'POST'],
  ['/admin/adjust', 'POST'],
  ['/admin/mint', 'GET'],
  ['/auth/delete', 'POST'],
  ['/admin/disable', 'POST'],
]);
export function withProductionProMaintenance(handler) {
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (env.PRO_WRITES_PAUSED === '1' &&
          pausedRoutes.get(path) === request.method) {
        return new Response(JSON.stringify({
          error:'PRO_MAINTENANCE',
          message:'Manutenzione temporanea. Riprova più tardi.',
        }), {status:503, headers:{
          'content-type':'application/json',
          'cache-control':'no-store',
          'retry-after':'60',
          'Access-Control-Allow-Origin':'*',
        }});
      }
      return handler.fetch(request, env, ctx);
    },
  };
}
