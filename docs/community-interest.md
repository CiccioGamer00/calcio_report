# Community Telegram in preparazione

Il proprietario rinvia la creazione del gruppo finché non ci sarà interesse reale.
Telegram non è più un requisito per pubblicare l'app. Il pulsante resta visibile
come “Community Telegram · In arrivo” e registra l'interesse solo dopo un clic
di un account autenticato. Non sono iscrizioni Telegram né una lista notifiche.

## Comportamento

- Un record per ID account. Clic ripetuti/contemporanei e risposte perse non
  moltiplicano gli interessati. Nessun indirizzo email, IP o dispositivo nel record.
- Sessioni autenticate anche con TRIAL scaduto possono esprimere interesse.
  Account disabilitati/non validi rifiutati. ID/email nel corpo non sono utilizzati.
- Review e Sandbox esclusi; non installare la tabella nei loro database.
- “Interesse registrato” appare solo dopo una risposta ok:true, recorded:true.
  Errore, timeout o backend non ancora aggiornato non producono falsi successi.
- Un futuro telegramUrl configurato apre il gruppo normalmente, senza contare clic.
- Il conteggio appare solo in /admin/stats autenticato e nella dashboard admin.
  Esclude account disabilitati/cancellati. Schema mancante: “Non disponibile”,
  non uno zero inventato; le altre statistiche continuano a funzionare.
- Eliminare l'account elimina il record con FK ON DELETE CASCADE.
  Una nuova registrazione costituisce un nuovo account.
- Nessun cambiamento a pagamenti, diritti PRO, segreti o gate Apple.

## Materiale e attivazione

Schema additivo/ripetibile: worker/schema/community-interest.sql.
Destinazione esclusiva: calcio_users, 45681187-3565-4d36-8627-131c18ff1885.
Il consenso “ok procedi” del 26 ottobre autorizza la realizzazione del contatore;
la sua attivazione richiede esecuzione del proprietario dalla postazione Cloudflare.

Bundle con esbuild 0.28.2: deploy/community-worker-candidate.mjs.
Dimensione 108055 byte; SHA256 cdf050b645fd3c2cdd1299800cba9c806292144ad707420dd5014c49f6c7ae8a.
Schema SHA256 e28ad5380acc265e9668c06f80ca6ae6b6f7aebc0bd4231c4add0013e7c8b536.
Usare una nuova copia del candidato wrangler.app-review.json già verificato:
sostituire soltanto main con questo bundle, mantenendo nome, route, variabili e
binding. DB live e APP_REVIEW_DB distinti; Apple=0, ledger=1, pausa=0,
cutover=1792845158779 invariato. Non passare nuovi segreti.
Prima schema; poi dry-run/deploy --keep-vars dalla configurazione candidata.
Non dichiarare attivo finché il proprietario non riporta gli esiti.

Il frontend e admin rimangono nel branch release; main e GitHub Pages non
sono aggiornati da questa preparazione. Per iOS occorre una nuova candidata
che includa il pulsante: la 28.1 è precedente a questa modifica.
L'amministratore può usare la copia aggiornata di admin.html, senza salvare ADMIN_KEY.

## Verifiche

32 test mirati passati: nuovo conteggio con SQLite reale e login firmato,
deduplicazione/race, campi client ignorati, review senza accesso ai contatori,
sessioni invalide, schema assente, cancellazione cascade, UI senza falsi successi;
regressione di login, cancellazione, admin e router review.
Patch native verificata: mantiene il token nel Keychain tramite CRSession.
Smoke del bundle: community senza login 401 e gate Apple Production chiuso 503.
Nessuna migrazione/deploy remoto o conteggio di utenti reali dichiarati.
