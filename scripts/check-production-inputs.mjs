// Offline preparation check. No credentials, network, deployment or D1 access.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const fields = ['workerName', 'apiOrigin', 'liveDatabaseId', 'reviewDatabaseId',
  'testDatabaseId', 'productionVerifierOrigin', 'sandboxVerifierOrigin',
  'appAppleId', 'stripePaymentLinkId', 'appleProductionEnabled'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function origin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash && url.origin === value;
  } catch { return false; }
}
export function checkProductionInputs(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') return ['INPUT_INVALID'];
  const errors = [];
  // Print fixed codes only: accidentally supplied credentials never enter output.
  if (Object.keys(input).some(key => !fields.includes(key))) errors.push('UNEXPECTED_FIELDS');
  for (const field of fields) {
    if (typeof input[field] !== 'string' || !input[field].trim()) errors.push('MISSING_' + field);
  }
  if (input.workerName !== 'calcio-report-proxy') errors.push('WORKER_TARGET_MISMATCH');
  if (input.apiOrigin !== 'https://api.calcioreport.com') errors.push('API_TARGET_MISMATCH');
  if (input.liveDatabaseId !== '45681187-3565-4d36-8627-131c18ff1885') errors.push('LIVE_DATABASE_MISMATCH');
  for (const field of ['liveDatabaseId','reviewDatabaseId','testDatabaseId']) {
    if (input[field] && !uuid.test(input[field])) errors.push('INVALID_' + field);
  }
  const ids = ['liveDatabaseId','reviewDatabaseId','testDatabaseId'].map(k =>
    typeof input[k] === 'string' ? input[k].toLowerCase() : '').filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push('DATABASES_NOT_DISTINCT');
  for (const field of ['productionVerifierOrigin','sandboxVerifierOrigin']) {
    if (input[field] && !origin(input[field])) errors.push('INVALID_' + field);
  }
  if (input.productionVerifierOrigin && input.productionVerifierOrigin === input.sandboxVerifierOrigin)
    errors.push('VERIFIER_ORIGINS_NOT_DISTINCT');
  if (input.appAppleId && (!/^[1-9][0-9]*$/.test(input.appAppleId) ||
      !Number.isSafeInteger(Number(input.appAppleId)) || input.appAppleId === '6822393280'))
    errors.push('INVALID_APP_ID_NOT_PRODUCT_ID');
  if (input.stripePaymentLinkId && !/^plink_[A-Za-z0-9]+$/.test(input.stripePaymentLinkId))
    errors.push('INVALID_STRIPE_PAYMENT_LINK_ID');
  if (input.appleProductionEnabled !== '0') errors.push('APPLE_GATE_MUST_REMAIN_CLOSED');
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const path = process.argv[2] || new URL('../deploy/apple-production-inputs.json', import.meta.url);
    const errors = checkProductionInputs(JSON.parse(await readFile(path, 'utf8')));
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Input metadata consistent. NOT deployment approval or remote verification. Secrets, signing key, TLS, ports, schema, cutover and source gate remain separate checks.');
  } catch { console.error('INPUT_FILE_UNREADABLE_OR_INVALID'); process.exitCode = 1; }
}
