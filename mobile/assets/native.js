// Prototype only: no StoreKit integration or production checkout.
(() => {
  window.goToPayment = () => window.showToast({
    title: 'Acquisti non disponibili',
    text: 'Questa versione di prova non permette acquisti. Il pagamento Apple sarà aggiunto in seguito.'
  });
  const recovery = document.createElement('div');
  recovery.className = 'native-recovery';
  const label = document.createElement('label');
  label.htmlFor = 'nativeRecoveryLink';
  label.textContent = 'Hai già ricevuto l’email? Incolla qui il link di recupero:';
  const input = document.createElement('input');
  input.id = 'nativeRecoveryLink';
  input.type = 'password';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Usa link di recupero';
  button.addEventListener('click', async () => {
    const link = input.value;
    input.value = '';
    try { await window.CRSession.ready; } catch { window.CRNativeStorageError(); return; }
    if (!window.CRNativeRecoveryToken(link)) {
      window.setAuthMsg('Incolla il link completo ricevuto da Calcio Report.');
      return;
    }
    window.dispatchEvent(new CustomEvent('cr:native-reset', { detail: link }));
  });
  recovery.append(label, input, button);
  document.getElementById('authStandardBox')?.append(recovery);
  const viewport = window.visualViewport;
  const updateViewport = () => {
    document.documentElement.style.setProperty('--native-viewport-height', `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty('--native-viewport-top', `${viewport?.offsetTop || 0}px`);
  };
  updateViewport();
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);

  // Freeze the page behind native modals; only their content should scroll.
  let pageScrollY = null;
  const syncModalScroll = () => {
    const open = !!document.querySelector('.modal:not(.hidden)');
    if (open && pageScrollY === null) {
      pageScrollY = window.scrollY;
      document.body.style.setProperty('--native-page-top', `${-pageScrollY}px`);
      document.documentElement.classList.add('native-modal-open');
      document.body.classList.add('native-modal-open');
    } else if (!open && pageScrollY !== null) {
      const restoreY = pageScrollY;
      pageScrollY = null;
      document.documentElement.classList.remove('native-modal-open');
      document.body.classList.remove('native-modal-open');
      document.body.style.removeProperty('--native-page-top');
      window.scrollTo(0, restoreY);
    }
    updateViewport();
  };
  const modalObserver = new MutationObserver(syncModalScroll);
  document.querySelectorAll('.modal').forEach(modal => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
  syncModalScroll();
})();
