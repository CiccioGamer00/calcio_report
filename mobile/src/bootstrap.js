import { Capacitor } from '@capacitor/core';
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { createSession, recoveryToken } from './session.mjs';
import { installPurchases } from './purchase-ui.mjs';

window.CRNativeRecoveryToken = recoveryToken;
window.CRNativeStorageError = () => {
  let notice = document.getElementById('nativeStorageError');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'nativeStorageError';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111827;color:white;padding:48px 24px;font:18px system-ui';
    notice.textContent = 'Impossibile accedere alla sessione protetta. Chiudi e riapri l’app con il telefono sbloccato.';
    document.body.append(notice);
  }
};
if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('SecureStorage')) {
  // Never fall back to the plugin's unencrypted browser implementation.
  window.CRSession = { ready: Promise.reject(new Error('Native storage unavailable')) };
} else {
  window.CRSession = createSession({
    get: key => SecureStorage.get(key, false, false),
    set: (key, value) => SecureStorage.set(key, value, false, false, KeychainAccess.whenUnlockedThisDeviceOnly),
    remove: key => SecureStorage.remove(key, false),
  }, window.localStorage);
}
window.CRSession.ready.catch(() => window.CRNativeStorageError());
if (window.CRSession.save) {
  const save = window.CRSession.save.bind(window.CRSession);
  window.CRSession.save = async (...args) => {
    await save(...args);
    window.dispatchEvent(new Event('cr:session-changed'));
  };
}
document.addEventListener('DOMContentLoaded', () => installPurchases(window.CRSession));
