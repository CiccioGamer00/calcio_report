// Build-time allowlist. No URLs, account environment or profile from HTTP/storage.
export function resolveBuildProfile(name = 'sandbox') {
  if (!['sandbox', 'production'].includes(name)) throw Error('MOBILE_PROFILE_INVALID');
  const production = name === 'production';
  return Object.freeze({
    name,
    baseUrl: production ? 'https://api.calcioreport.com' : 'https://calcio-report-test.stemoro84.workers.dev',
    purchaseEnvironment: production ? 'Production' : 'Sandbox',
    sessionNamespace: production ? 'production' : 'test',
  });
}
