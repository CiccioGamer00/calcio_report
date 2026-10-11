// Prototype only: no StoreKit integration or production checkout.
(() => {
  window.goToPayment = () => window.showToast({
    title: 'Acquisti non disponibili',
    text: 'Questa versione di prova non permette acquisti. Il pagamento Apple sarà aggiunto in seguito.'
  });
  const viewport = window.visualViewport;
  const updateViewport = () => {
    document.documentElement.style.setProperty('--native-viewport-height', `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty('--native-viewport-top', `${viewport?.offsetTop || 0}px`);
  };
  updateViewport();
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
})();
