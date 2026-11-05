# Build candidata App Store — 26 ottobre 2026

La build candidata usa il profilo mobile `production`, backend
`https://api.calcioreport.com` e namespace sessione Production già implementati.
L'account review sul backend pubblico viene instradato dal server al DB isolato.
Il gate Apple Production rimane indipendente dalla compilazione e attualmente chiuso.

## Preparazione e avvio

Workflow esistente: `.github/workflows/ios-signing-check.yml`.
Mantiene i profili interni Sandbox/review e la loro numerazione di build.
Per una candidata usare il dispatch con `mobile_profile=production`, se disponibile.
Il valore `upload_testflight` è ignorato per Production: lo step Apple viene saltato.

Per avviare dal branch operativo quando il dispatch non è disponibile sul default,
un commit deliberato con messaggio esatto `release: build App Store candidate`
che modifica un percorso già incluso nel trigger avvia il solo export Production.
La guardia accetta questo push solo al primo tentativo, con commit dell'evento
uguale a GITHUB_SHA e branch release/apple-production-preparation.
Non usare quel messaggio per modifiche ordinarie. Il retry esplicito via dispatch
resta disponibile dove GitHub lo espone.

## Verifiche e risultato

- Stesso certificato, profilo App Store e controllo codesign già utilizzati.
- Export locale: `testFlightInternalTestingOnly=false` soltanto per Production;
  le build interne conservano true. Nessun upload o invio App Review.
- `scripts/verify-ios-artifact.py` apre l'IPA esportato e controlla bundle,
  numero build, configurazione JSON effettiva e origine esatta del profilo.
  Un URL citato in un commento non prova il backend corretto.
- Link Stripe/PayPal e header API incorporati devono essere vuoti.
- Artifact Production: `CalcioReport-production.ipa` e `build.json`, trattenuti
  per tre giorni. Il manifest riporta commit, versione, build, SHA256 e backend.
  Non è compatibile col vecchio uploader interno, che continua a rifiutarlo.
- I nove test locali coprono scambio fra i tre backend, pagamenti esterni/header,
  numero build errato, configurazione ingannevole, mancata conservazione su errore,
  contratto manifest interno/Production, guardia di avvio ed opzioni export.
  La compilazione Xcode e la firma reale devono risultare dal workflow macOS.

## Prima del caricamento e del rilascio

Questa è preparazione tecnica, non dichiarazione di app pronta a vendere.
Prima di caricare la candidata definire link Telegram e supporto, controllare
metadati/privacy/screenshot e completare le accettazioni residue pertinenti.
Descrivere nelle note Apple l'account review e il percorso Sandbox isolato;
non mettere la password in questo repository.

Prima del primo rilascio risolvere la disponibilità degli acquisti Production:
gate sorgente e flag, percorso Worker->verifier, notifiche e gestione degli errori.
Il confronto attuale mostra Production 401 e Sandbox 200 con lo stesso JWT.
Il chiarimento del manutentore Apple collega l'accesso API Production al primo
rilascio: https://github.com/apple/app-store-server-library-java/issues/92 .
Non trasformarlo in un collaudo Production superato o aprire un fallback Sandbox
per utenti pubblici. Preparare un piano esplicito che eviti di esporre vendite
prima che l'attivazione sia verificata. Nessun merge, upload o pubblicazione è
autorizzato automaticamente da un workflow di compilazione.
