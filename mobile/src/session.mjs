// Only the session is secret. The installation/logout marker contains no user data.
export function createSession(vault, storage, now = Date.now, namespace = 'test') {
  if (!['test', 'production', 'review'].includes(namespace)) throw Error('SESSION_NAMESPACE_INVALID');
  const key = `calcio-report.${namespace}.session.v1`;
  const marker = namespace === 'test' ? 'CR_NATIVE_SESSION_ACTIVE'
    : namespace === 'review' ? 'CR_NATIVE_REVIEW_SESSION_ACTIVE' : 'CR_NATIVE_PRODUCTION_SESSION_ACTIVE';
  const maxAge = 6 * 60 * 60 * 1000;
  let current = null;
  let queue = Promise.resolve();
  const serial = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const valid = value => value && typeof value.token === 'string' && value.token.length > 0 &&
    Number.isFinite(value.timestamp) && value.timestamp > 0 && value.timestamp <= now() &&
    now() - value.timestamp <= maxAge;
  const session = {
    get token() { return current?.token || ''; },
    get timestamp() { return current?.timestamp || 0; },
    ready: null,
    save(token, timestamp) {
      return serial(async () => {
        current = null;
        storage.setItem(marker, '0');
        const value = { token, timestamp };
        if (!valid(value)) throw new Error('Invalid session');
        await vault.set(key, value);
        storage.setItem(marker, '1');
        current = value;
      });
    },
    clear() {
      // Drop the in-memory credential immediately, even if native deletion fails.
      current = null;
      return serial(async () => {
        current = null;
        storage.setItem(marker, '0');
        await vault.remove(key);
      });
    },
  };
  session.ready = serial(async () => {
    // Do not migrate plaintext prototype tokens; require one fresh login.
    storage.removeItem('CR_TOKEN');
    storage.removeItem('CR_LOGIN_TS');
    if (storage.getItem(marker) !== '1') {
      await vault.remove(key); // Prevent Keychain restore after reinstall/logout.
      return;
    }
    const value = await vault.get(key);
    if (valid(value)) current = value;
    else {
      storage.setItem(marker, '0');
      await vault.remove(key);
    }
  });
  return session;
}

export function recoveryToken(link) {
  if (typeof link !== 'string' || link.length > 8192) return '';
  try {
    const url = new URL(link.trim());
    if (url.origin !== 'https://app.calcioreport.com' || url.pathname !== '/' ||
        url.username || url.password || url.search || !url.hash.startsWith('#reset=')) return '';
    const token = decodeURIComponent(url.hash.slice(7));
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : '';
  } catch { return ''; }
}
