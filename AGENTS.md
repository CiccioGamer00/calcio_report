# AGENTS.md — Calcio Report / guida operativa per agenti

Questo file si applica a tutto il repository. Per il lavoro App Store leggere
**solo** `PROJECT_STATUS.md` all'inizio, dopo aver verificato il branch attivo.

## Branch e ambito
- Branch di rilascio: `release/apple-production-preparation` (PR #15).
- Branch audit notifiche: `fix/apple-notification-audit` (PR #16).
- Non leggere `core-v2`: è storico e NON contiene lo stato App Store.
- Non modificare `main`; non assumere che il default branch sia l'ultimo lavoro.
- Non prendere un branch storico o un file allegato fuori data come stato attuale.
- Prima di toccare file controllare il commit HEAD e il diff pertinente sul branch corrente.

## Riduzione letture e test
- `PROJECT_STATUS.md` è una panoramica sintetica, NON l'archivio delle attività.
- NON aprire `docs/archive/` salvo problema specifico non risolto dal riepilogo.
- Aprire solo i file interessati al task; usare ricerca mirata e range di righe.
- NON analizzare indiscriminatamente cartelle, file e cronologia commit.
- NON ripetere acquisti Sandbox, test TestFlight 27.1, correlazione notifiche Apple
  o flussi Milan/PRO già accettati, senza un cambiamento che li invalidi.
- Usare test minimi pertinenti alle modifiche, e suite completa soltanto quando
  tecnicamente motivata (ad esempio rischio di regressione trasversale).
- Se non cambia codice o configurazione eseguibile, non lanciare test inutili.

## Sicurezza e rilascio
- Obiettivo attuale: migrazione/verifier Production, gate Apple, release App Store.
- Conservare funzionanti test e review, senza mischiare i rispettivi database.
- Non distribuire in produzione, fare merge o inviare ad App Review senza
  autorizzazione esplicita del proprietario.
- Non esporre segreti in codice, commit, comandi, log o conversazioni.
- Fare piccoli commit; annotare nel solo `PROJECT_STATUS.md` milestone,
  evidenza, residui e prossimo passo; nessuna cronologia chilometrica.
- Se deve agire il proprietario: **un solo passo operativo alla volta**.
- Non chiedere F12 quando la diagnostica può essere incorporata nell'app.
