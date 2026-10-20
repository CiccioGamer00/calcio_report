import core from './worker.js';
import { createAppleHandler } from './apple-handler.mjs';
import { createAppReviewRouter } from './app-review-router.mjs';

// Isolated staging host only: no public-account database or production fallback.
const unavailable = { fetch: async () => Response.json(
  { error: 'REVIEW_ONLY' }, { status: 403 },
) };
const router = createAppReviewRouter(unavailable, createAppleHandler(core, 'test'), core);
export default {
  fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    } });
    return router.fetch(request, env, ctx);
  },
};
