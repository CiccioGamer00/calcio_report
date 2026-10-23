# Cutover Production — candidato del 23 ottobre 2026

Preparazione, NON autorizzazione a migrare o distribuire.
Le accettazioni in PROJECT_STATUS.md prevalgono sui vecchi pending.

## Destinazione e schema

Worker calcio-report-proxy, API https://api.calcioreport.com.
Binding DB: calcio_users, UUID 45681187-3565-4d36-8627-131c18ff1885.
Backup esportato sul PC del proprietario il 23 ottobre; non richiederlo di nuovo.

Generazione locale, senza accesso al live:

```sh
node scripts/prepare-production-schema.mjs
```

Produce worker/dist/production-initial.sql dai tre schemi versionati, nell'ordine
Apple, entitlement, operazioni PRO. Cinque tabelle vuote e sei trigger; nessuna
scrittura iniziale su users o paid_until. Le scadenze esistenti diventano baseline
alla prima operazione del registro, non durante questa preparazione.
Il file non è una migrazione già applicata e non è idempotente: un errore o una
migrazione parziale richiedono diagnosi dello stato, mai un rilancio alla cieca.
La verifica locale con dati sintetici non certifica l'esecuzione remota D1.

## Configurazione candidata, ancora non applicata

| Voce | Preparazione / condizione per attivazione |
| --- | --- |
| Entry point | worker/apple-production-entry.mjs, bundle completo con router review |
| APPLE_PRODUCTION_ENABLED | 0 durante la preparazione; non aprire anticipatamente |
| PRO_LEDGER_ENABLED | Non attivare sul live prima di schemi, riconciliazione e cutover coordinato |
| PRO_LEDGER_CUTOVER_MS | Fissare al cutover autorizzato; positivo, non futuro; poi immutato |
| STRIPE_PRO_PAYMENT_LINK_ID | ID reale plink_ del link Production, ancora da verificare |
| APP_REVIEW_ENABLED | Attivare solo dopo binding/account/segreti/verifier coerenti |
| APP_REVIEW_DB | calcio_users_review; UUID da confrontare con live e test |
| APP_REVIEW_ACCOUNT_ID | b960e09e-0937-49f3-9acb-18fb373e69f9, confermare che non sia stato ricreato |
| APP_REVIEW_LICENSE_SECRET | Distinto da LICENSE_SECRET; non inserirlo nei file |
| APP_REVIEW_ACCOUNT_EMAIL | Account riservato già predisposto; non pubblicare credenziali |
| APP_REVIEW_VERIFIER_URL / SECRET | Servizio Sandbox esistente; mantenere separato da Production |

Conservare le variabili e i segreti live già inventariati. Non distribuire una
configurazione minimale che li cancelli. Verifier Production dedicato ancora da
identificare/preparare con ambiente Production, app Apple ID numerico, HTTPS e
segreto dedicato; non copiare la configurazione Sandbox come se fosse Production.
Mantenere l'URL notifiche Sandbox attuale sul Worker TEST.

## Input preparati, nessuna configurazione live modificata

`deploy/apple-production-inputs.json` contiene solo metadati non segreti.
`node scripts/check-production-inputs.mjs` controlla la coerenza offline:
attualmente segnala cinque dati mancanti, non deve risultare pronto.
Non verifica account Cloudflare, disponibilità server, certificati, credenziali
Apple, schemi remoti o cutover. Non autorizza un deploy.

Verifier Sandbox già documentato: https://apple-test.calcioreport.com.
Il modello separato `deploy/apple-verifier-production.env.example` mantiene
vuoti ID app e credenziali; porta 8791 proposta, disponibilità non verificata.
Non copiarlo sopra l'ambiente Sandbox. Il Worker pubblico candidato richiederà
anche APPLE_DEPLOYMENT=production, APPLE_ENVIRONMENT=Production e
APPLE_VERIFIER_URL/APPLE_VERIFIER_SECRET dedicati. Il gate nel codice
APPLE_PRODUCTION_NOT_READY resta chiuso oltre al flag: non rimuoverlo durante
questa preparazione. Nessuna verifica locale sostituisce le accettazioni remote.

## Ordine operativo da autorizzare separatamente

1. Completare UUID review, verifier Production e ID Payment Link; riconciliare
   pagamenti/coupon precedenti. I PRO esistenti sono test, ma vanno preservati.
2. PR #16: conflitto documentale risolto; proporre l'integrazione senza merge implicito.
3. Concordare una finestra senza writer legacy concorrenti; applicare gli schemi
   solo al DB identificato, previa autorizzazione. Verifica mirata post-migrazione.
4. Cutover del bundle completo e del registro, con istante registrato e gate
   Apple ancora chiuso. I vecchi checkout richiedono riconciliazione.
5. Completare i soli casi di accettazione ancora aperti prima di abilitare Apple
   Production e preparare la build finale. Nessuna ripetizione dei casi chiusi.

## Recupero

Prima di nuove scritture, diagnosticare eventuale schema parziale senza drop
indiscriminati. Dopo il primo accredito nel registro, non ripristinare il vecchio
dump né il writer legacy: si perderebbero accrediti o si creerebbero divergenze.
Preferire correzione in avanti o sospensione controllata delle scritture con
riconciliazione; qualsiasi ripristino richiede un piano approvato sui dati correnti.

## Chiusura release

Configurare e verificare il link Telegram, oggi non attivo, prima della
pubblicazione. URL/canale definitivo ancora da acquisire; non inventarlo.
Completare metadati, privacy/supporto, screenshot e note review; deploy, merge
e invio App Review richiedono autorizzazione esplicita.
