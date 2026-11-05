// Build-time allowlist. No URLs, account environment or profile from HTTP/storage.
export function resolveBuildProfile(name = 'sandbox') {
  if (!['sandbox', 'review', 'production'].includes(name)) throw Error('MOBILE_PROFILE_INVALID');
  const production = name === 'production';
  const review = name === 'review';
  return Object.freeze({
    name,
    baseUrl: review ? 'https://calcio-report-review.stemoro84.workers.dev' : production ? 'https://api.calcioreport.com' : 'https://calcio-report-test.stemoro84.workers.dev',
    purchaseEnvironment: (production || review) ? 'Production' : 'Sandbox',
    sessionNamespace: review ? 'review' : production ? 'production' : 'test',
  });
}
