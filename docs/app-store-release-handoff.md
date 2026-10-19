# Preparazione App Store — 19 ottobre 2026

## Stato reale

La 21.1 installata usa ancora il Worker e il database di test. Il proprietario ha
confermato nuovo acquisto, sblocco immediato di Indicatori/Predizione, persistenza,
ripristino senza duplicare durata e rifiuto del ripristino su un altro account.
Non ripetere questi test come prerequisito della preparazione.

Il branch `release/apple-production-preparation` prepara il rilascio; NON è un
aggiornamento da incollare oggi nel Worker pubblico né una build pronta allo Store.
`mobile/ios-preparation` resta la baseline di test. `main` non viene modificato.

## Blocco completato

- Profilo mobile Sandbox predefinito e profilo production esplicito; auth/dati e
  acquisti usano lo stesso backend configurato in compilazione.
- Origine pubblica allowlisted: https://api.calcioreport.com. Nessun URL arbitrario
  da query, localStorage o input utente. Link di pagamento web disabilitati in iOS.
- Sessioni Keychain e marcatori separati: il passaggio alla futura app pubblica
  richiederà login, senza inviare il token del database di test al backend reale.
- Il coordinatore acquisti rifiuta un ambiente diverso da quello della build.
- Handler Apple condiviso con il percorso Sandbox accettato; nuovo entry point
  production con blocco nel codice. Anche impostare APPLE_PRODUCTION_ENABLED=1
  non abilita pagamenti incompleti e non blocca Stripe/redeem/admin esistenti.
- 89 test root passati; packaging web per entrambi i profili e bundling di entrambi
  i Worker riusciti. Nessuna compilazione Xcode di questo branch è stata eseguita.

Comandi per sviluppo, non per deploy:

```bash
node --test tests/*.test.mjs
npm ci --prefix mobile
node scripts/build-mobile.mjs
node scripts/build-apple-test-worker.mjs
```

Il profilo pubblico si seleziona con `CR_MOBILE_PROFILE=production` nell'ambiente
prima di eseguire build-mobile.mjs. Il comando è compatibile con CI; su PowerShell
impostare `$env:CR_MOBILE_PROFILE = 'production'`. La compilazione degli asset NON
certifica che il backend sia pronto. I workflow esistenti mantengono il default
Sandbox e non sono stati abilitati a caricare questa preparazione.

## Lavoro necessario prima di un deploy utile

1. **Unificare le scadenze dei pagamenti.** Migrare i percorsi che scrivono
   direttamente users.paid_until: Stripe, redeem, grant e adjust. Il registro Apple
   rileva conflitti con queste scritture: non ignorare i conflitti, non disabilitare
   i pagamenti web e non usare semplicemente un flag per rimuovere il blocco.
   Includere idempotenza, acquisti Apple/web combinati, rimborsi e rettifiche negative.
2. **Revisione Apple e TestFlight della build pubblica.** Anche App Review usa
   Sandbox. Il profilo production oggi accetta solo Production ed è quindi
   intenzionalmente incompleto per questa fase. Definire un account di revisione
   isolato con assegnazione ambiente fatta dal server, autorizzazioni separate e
   accesso alle funzioni dell'app. Non usare un semplice fallback Sandbox sugli
   account pubblici o cambiare ambiente sulla base di un payload non verificato.
   Il percorso di revisione va documentato nelle note per Apple, non nascosto.
3. **Distribuzione controllata.** Prima backup e identificazione del database live;
   poi schemi, servizio verifier Production con app Apple ID numerico, secret
   dedicato, HTTPS e notifiche. Conservare servizio/db Sandbox funzionanti.
   La coppia APPLE_DEPLOYMENT=production / APPLE_ENVIRONMENT=Production non basta
   finché i punti 1–2 non sono completati e verificati.
4. **Build e scheda Store.** Compilazione firmata della release candidate, verifica
   del percorso revisione, privacy/supporto accessibili, screenshot, dati privacy,
   rating e informazioni di revisione coerenti con funzioni e dati effettivi.
   Nessun invio ad App Review e nessun deploy pubblico senza autorizzazione finale.

I test avanzati reali di rimborso/interruzione/cancellazione non sono stati
confermati dal proprietario. I test automatici non devono essere descritti come
esecuzioni su iPhone. Concentrare l'accettazione finale sui rischi del rilascio,
non sulla ripetizione dei casi già superati.

## Cosa chiedere al proprietario quando torna a casa

Non far incollare il bundle production-candidate: risponderebbe con acquisti non
pronti. Prima completare i punti software 1–2. Alla preparazione infrastrutturale,
il primo controllo sarà identificare il database live e le configurazioni già
presenti senza esporre segreti. Dare poi un solo passaggio operativo alla volta.

## Fonte ufficiale verificata il 19 ottobre

Apple conferma che App Review valuta gli acquisti nell'ambiente Sandbox:
https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases/
La separazione proposta sopra è una scelta di architettura del progetto, non una
prescrizione Apple. Deve essere implementata e verificata prima dell'invio.
