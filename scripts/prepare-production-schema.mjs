// Preparation only: generates SQL locally; never connects to Cloudflare.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const sources = ['apple-purchase-ledger.sql', 'pro-entitlements.sql', 'pro-payment-operations.sql'];
const header = `-- PRODUCTION CANDIDATE: NOT AUTHORIZED FOR EXECUTION.
-- Target: calcio_users / 45681187-3565-4d36-8627-131c18ff1885
-- Requires existing users table and absence of the five new ledger tables.
-- Not rerunnable: stop on errors; do not add IF NOT EXISTS to conceal partial state.
-- Does not activate flags, change users, or backfill existing PRO.
-- Apply only after explicit approval and the production cutover plan.
\n`;
const chunks = await Promise.all(sources.map(async name =>
  '-- Source: worker/schema/' + name + '\n' +
  await readFile(new URL('../worker/schema/' + name, import.meta.url), 'utf8')));
const output = new URL('../worker/dist/production-initial.sql', import.meta.url);
await mkdir(new URL('../worker/dist/', import.meta.url), {recursive:true});
await writeFile(output, header + chunks.join('\n'));
console.log('Prepared worker/dist/production-initial.sql. No remote action performed.');
