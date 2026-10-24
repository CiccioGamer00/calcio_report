// Offline preparation only. Never invokes Wrangler, network or a deployment.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const bundleSha256 = 'ed9d15719b2a0e9b4291fa1c0a8fd4f8c9f88cac4b8e67ea2c934054c187871c';
const expectedDb = '45681187-3565-4d36-8627-131c18ff1885';
const expectedVars = ['ACCOUNT_DELETION_ENABLED','AUTH_PASSWORD_V2','CR_RELAY_URL'];
const maintenanceVars = Object.freeze({
  APPLE_DEPLOYMENT:'production',
  APPLE_ENVIRONMENT:'Production',
  APPLE_PRODUCTION_ENABLED:'0',
  PRO_LEDGER_ENABLED:'0',
  PRO_WRITES_PAUSED:'1',
  STRIPE_PRO_PAYMENT_LINK_ID:'plink_1T6a4ZLCMe9gtpTW2ticsWmF',
  APPLE_VERIFIER_URL:'https://apple.calcioreport.com',
});
export function prepareMaintenanceConfig(live) {
  if (!live || live.name !== 'calcio-report-proxy' ||
      live.compatibility_date !== '2026-02-10') throw Error('LIVE_IDENTITY_CHANGED');
  const allowedKeys = new Set(['name','main','workers_dev','preview_urls',
    'compatibility_date','compatibility_flags','routes','observability','vars','d1_databases']);
  if (Object.keys(live).some(key=>!allowedKeys.has(key))) throw Error('LIVE_CONFIG_CHANGED');
  if (live.compatibility_flags !== undefined &&
      (!Array.isArray(live.compatibility_flags) || live.compatibility_flags.length)) {
    throw Error('LIVE_COMPATIBILITY_FLAGS_CHANGED');
  }
  if (!Array.isArray(live.d1_databases) || live.d1_databases.length !== 1 ||
      live.d1_databases[0].binding !== 'DB' || live.d1_databases[0].database_id !== expectedDb) {
    throw Error('LIVE_DATABASE_CHANGED');
  }
  if (!live.vars || Array.isArray(live.vars) ||
      JSON.stringify(Object.keys(live.vars).sort()) !== JSON.stringify([...expectedVars].sort())) {
    throw Error('LIVE_VARIABLE_NAMES_CHANGED');
  }
  // Preserve all downloaded settings and values; never rewrite the backup.
  const candidate = structuredClone(live);
  candidate.main = 'worker/dist/apple-production-candidate.mjs';
  candidate.keep_vars = true;
  candidate.no_bundle = true;
  candidate.vars = {...candidate.vars, ...maintenanceVars};
  return candidate;
}
async function main() {
  const snapshotPath = process.argv[2];
  if (!snapshotPath || process.argv.length !== 3) throw Error('Usage: node scripts/prepare-worker-maintenance.mjs <downloaded-wrangler.jsonc>');
  const root = new URL('../', import.meta.url);
  // Wrangler 4.152.0 non-C3 download emits plain JSON with a .jsonc filename.
  const candidate = prepareMaintenanceConfig(JSON.parse(await readFile(snapshotPath,'utf8')));
  const bundle = await readFile(new URL('worker/dist/apple-production-candidate.mjs',root));
  if (createHash('sha256').update(bundle).digest('hex') !== bundleSha256) {
    throw Error('CANDIDATE_BUNDLE_HASH_MISMATCH');
  }
  const output = new URL('wrangler.maintenance.json',root);
  await writeFile(output,JSON.stringify(candidate,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Configurazione locale pronta: impostazioni live conservate; pausa=1, registro=0, Apple=0.');
  console.log('Nessun deploy. Non condividere il file completo di configurazione.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
