import { readFileSync } from 'node:fs';
import { createAppleReconciler } from './reconcile.mjs';
import { createVerificationServer } from './server.mjs';

const environment=process.env.APPLE_ENVIRONMENT;
const reconciler=createAppleReconciler({
  deployment:process.env.APPLE_DEPLOYMENT,environment,
  appAppleId:process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined,
  signingKey:readFileSync(process.env.APPLE_SIGNING_KEY_FILE,'utf8'),
  keyId:process.env.APPLE_KEY_ID,issuerId:process.env.APPLE_ISSUER_ID,
});
const port=Number(process.env.PORT || 8790);
if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('PORT_INVALID');
createVerificationServer({secret:process.env.APPLE_VERIFIER_SECRET,reconciler})
  .listen(port,'127.0.0.1',()=>console.log('Apple verifier listening on loopback'));
