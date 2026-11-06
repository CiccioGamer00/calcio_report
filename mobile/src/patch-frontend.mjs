// Changes apply exclusively to packaged copies; fail if source contracts change.
export function patchApp(source) {
  const replace = (before, after, count = 1) => {
    const actual = source.split(before).length - 1;
    if (actual !== count) throw new Error(`Native patch expected ${count}, got ${actual}: ${before.slice(0, 60)}`);
    source = source.split(before).join(after);
  };
  replace('return localStorage.getItem(LS_TOKEN) || "";', 'return window.CRSession.token;');
  replace('Number(localStorage.getItem(LS_LOGIN_TS) || 0)', 'window.CRSession.timestamp');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  replace('function forceLogout(reasonMsg = "") {', 'async function forceLogout(reasonMsg = "") {');
  replace('localStorage.removeItem(LS_TOKEN);' + newline + '  localStorage.removeItem(LS_LOGIN_TS);',
    'try { await window.CRSession.clear(); } catch { window.CRNativeStorageError(); return; }');
  replace('localStorage.setItem(LS_TOKEN, res.json.token);' + newline + '      localStorage.setItem(LS_LOGIN_TS, String(Date.now()));',
    'try { await window.CRSession.save(res.json.token, Date.now()); } catch { window.CRNativeStorageError(); return; }', 2);
  replace('localStorage.setItem(LS_LOGIN_TS, String(Date.now()));',
    'try { await window.CRSession.save(getToken(), Date.now()); } catch { window.CRNativeStorageError(); return; }');
  replace('document.addEventListener("DOMContentLoaded", async () => {',
    'document.addEventListener("DOMContentLoaded", async () => {\n  try { await window.CRSession.ready; } catch { window.CRNativeStorageError(); return; }');
  replace('let resetToken = passwordResetTokenFromHash();', `let resetToken = passwordResetTokenFromHash();
  window.addEventListener('cr:native-reset', event => {
    const token = window.CRNativeRecoveryToken(event.detail);
    if (!token) return;
    resetToken = token;
    document.getElementById('resetPass').value = '';
    document.getElementById('resetPassConfirm').value = '';
    setPasswordResetMode(true);
    document.getElementById('authModal')?.classList.remove('hidden');
    setAuthMsg('Inserisci e conferma la nuova password.');
  });`);
  replace('if (res.ok && res.json?.ok) {\n      resetToken = "";',
    'if (res.ok && res.json?.ok) {\n      try { await window.CRSession.clear(); } catch { window.CRNativeStorageError(); return; }\n      resetToken = "";');
  return source;
}
