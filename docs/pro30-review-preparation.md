# PRO30 — materiale per revisione e cattura reale

Preparato il 30 ottobre 2026 per la candidata iOS 1.0 (33.1).
Bozza pronta da inserire nella scheda IAP dopo verifica visiva della cattura.
Nessuna nota caricata in App Store Connect da questo documento.

## Dati verificati

- Prodotto: com.calcioreport.app.pro30, Apple ID 6822393280.
- Tipo: abbonamento non rinnovabile. Durata: 30 giorni.
- Nome e descrizione italiani presenti in ASC.
- Audit 41015746779: MISSING_METADATA, screenshot review assente.
- Prezzo italiano 9,99 EUR e disponibilità Italia: conferma storica del
  proprietario del 13 ottobre; non riverificati dall'audit del 30 ottobre.
  Non modificare prezzi/territori e non rappresentarli come verifica attuale.

## Testo inglese per Review Notes del prodotto

Product ID: com.calcioreport.app.pro30.

This is a non-renewing subscription providing 30 days of PRO access in
Calcio Report. It does not renew automatically.

Sign in using the Calcio Report review account supplied in the app version's
App Review Information. The app uses native Apple In-App Purchase; no external
payment website is opened in the iOS app. The purchase flow explains the
30-day duration and the absence of automatic renewal. Apple's purchase
confirmation displays the price for the purchasing account.

The supplied review account uses an isolated Sandbox purchase-validation
path. Its entitlements and purchase records are kept separate from live
customer accounts. Production purchases remain disabled during preparation
for this first release.

To restore an existing Apple purchase, sign in to the same Calcio Report
account used for that purchase and select "Ripristina acquisti Apple" in
the app footer. Restore does not create a new purchase.

## Piano screenshot per stasera

Usare l'app reale 33.1 su iPhone. Non usare mockup o schermate web.
Obiettivo: mostrare chiaramente l'offerta PRO 30 giorni e l'assenza
di rinnovo automatico. Conservare il file originale PNG/JPG.

Il flusso verificato nel codice è:
1. Sessione Calcio Report autenticata.
2. Acquista PRO / Passa a PRO richiama il bridge StoreKit.
3. Prima di mostrare l'offerta, l'app interroga /apple/token e carica il prodotto.
4. Conferma preliminare reale:
   "PRO per 30 giorni, senza rinnovo automatico.
   Apple mostrerà il prezzo prima della conferma dell'acquisto. Continuare?"
5. Solo continuando parte il flusso di acquisto Apple.

Per la cattura non confermare un acquisto e non rifare i test di pagamento.
Valutare visivamente la schermata prima di usarla come screenshot di review;
la cattura non sostituisce lo screenshot della pagina Store.

Vincolo operativo: con account live e Apple flag 0 il passaggio 3 si ferma
prima dell'offerta. Non abilitare Production per ottenere una foto.
L'account review già configurato è il percorso Sandbox isolato previsto.
Non chiedere credenziali in chat. Il pulsante upgrade può essere nascosto
per account già PRO: se manca, verificare la schermata reale prima di dare
istruzioni; non ridurre scadenze, creare nuovi account o manipolare la UI.

## Caricamento e controllo successivo

Aprire in App Store Connect il prodotto PRO30 e Informazioni per la revisione.
Per abbonamenti non rinnovabili la guida Apple indica:
Monetizzazione > Abbonamenti > Abbonamenti non rinnovabili > Gestisci.

Caricare lo screenshot reale nella scheda IAP, aggiungere le note pertinenti
e salvare. Non ricaricare i tre screenshot Store già COMPLETE.
Verificare stato del prodotto e altri eventuali campi evidenziati.
Non presumere che lo screenshot sia l'unica causa di MISSING_METADATA.

Prima dell'invio, app e primo prodotto di questo tipo devono essere inclusi
nella stessa submission. Associazione non ancora verificata.
Rilascio manuale e acquisti Production disabilitati restano invariati.

## Fonti

Sorgenti candidata: mobile/src/purchase-ui.mjs, mobile/src/purchases.mjs,
mobile/assets/native.js, worker/apple-handler.mjs, index.html, app.js.
Lettura codice, non nuovo collaudo su device.

Guide Apple già consultate il 30 ottobre:
- https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/view-and-edit-in-app-purchase-information
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/
