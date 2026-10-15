import http from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const limit = 192 * 1024;
const signature = (key, timestamp, path, body) => createHmac('sha256', key)
  .update(`${timestamp}\nPOST\n${path}\n${createHash('sha256').update(body).digest('hex')}`).digest();

// Dedicated private service. This must not be mounted on the football relay.
// TLS/reverse proxy and a dedicated secret are required outside loopback.
export function createVerificationServer({ secret, reconciler, now = Date.now }) {
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/i.test(secret)) throw Error('VERIFIER_SECRET_INVALID');
  let inflight = 0;
  const respond = (res, code, body) => {
    res.writeHead(code, { 'content-type':'application/json', 'cache-control':'no-store' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return respond(res, 200, {ok:true});
    if (req.method !== 'POST' || !['/v1/transaction', '/v1/notification'].includes(req.url)) {
      return respond(res, 404, {error:'NOT_FOUND'});
    }
    const timestamp = req.headers['x-cr-timestamp'];
    const mac = req.headers['x-cr-signature'];
    if (typeof timestamp !== 'string' || !/^[0-9]{13}$/.test(timestamp) ||
        Math.abs(now()-Number(timestamp)) > 30000 || typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) {
      req.resume();return respond(res, 401, {error:'AUTH_INVALID'});
    }
    if (inflight >= 4) {req.resume();return respond(res, 503, {error:'BUSY'});}
    inflight++;
    try {
      const chunks=[];let length=0;
      for await (const chunk of req) {
        length+=chunk.length;
        if (length>limit) {respond(res,413,{error:'BODY_TOO_LARGE'});return;}
        chunks.push(chunk);
      }
      const body=Buffer.concat(chunks);
      if (!timingSafeEqual(Buffer.from(mac,'hex'),signature(secret,timestamp,req.url,body))) {
        return respond(res,401,{error:'AUTH_INVALID'});
      }
      let input;
      try {input=JSON.parse(body.toString('utf8'));} catch {return respond(res,400,{error:'BAD_INPUT'});}
      if (typeof input?.signedPayload !== 'string') return respond(res,400,{error:'BAD_INPUT'});
      const method=req.url === '/v1/transaction' ? 'transaction' : 'notification';
      const transaction=await reconciler[method](input.signedPayload);
      return respond(res,200,{transaction,...(method==='notification' && transaction===null?{ignored:true}:{})});
    } catch {
      // No request body, credentials or raw Apple errors in logs/responses.
      if (!res.writableEnded && !res.destroyed) respond(res,503,{error:'APPLE_VERIFICATION_UNAVAILABLE'});
    } finally {inflight--;}
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.timeout=20000;
  server.keepAliveTimeout=5000;
  return server;
}
