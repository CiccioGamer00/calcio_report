# Cutover Production — candidato del 24 ottobre 2026

Preparazione, NON autorizzazione a migrare o distribuire.
Le accettazioni in PROJECT_STATUS.md prevalgono sui vecchi pending.
Nessun merge, deploy Worker o cambiamento D1 eseguito con questo piano.

## Destinazioni confermate

| Risorsa | Destinazione |
| --- | --- |
| Worker / API | calcio-report-proxy / https://api.calcioreport.com |
| DB live | calcio_users / 45681187-3565-4d36-8627-131c18ff1885 |
| APP_REVIEW_DB | calcio_users_review / 5b5458eb-4a69-454d-a5ac-76ffc93b8af7 |
| DB test, escluso dal binding live | calcio_users_test / 2aa786a8-6a61-495e-9c41-507496c39325 |
| Verifier Production | https://apple.calcioreport.com |
| Verifier Sandbox/review | https://apple-test.calcioreport.com |
| Apple app ID / bundle | 6821570508 / com.calcioreport.app |
| Stripe Payment Link | plink_1T6a4ZLCMe9gtpTW2ticsWmF |

Backup completo esportato il 23 ottobre sul PC del proprietario; non richiederlo
nuovamente né caricarlo in chat. Ripristino del dump non collaudato.
Verifier Production attivo, enabled, loopback 8791; HTTPS e rifiuto anonimo 401
confermati. Non ripetere provisioning o questi controlli. Percorso firmato e
accesso Apple Production restano da verificare.

## Schema candidato

Generazione locale già verificata: `node scripts/prepare-production-schema.mjs`.
Produce worker/dist/production-initial.sql dai tre schemi versionati nell'ordine
Apple, entitlement, operazioni PRO: cinque tabelle vuote e sei trigger.
Nessuna scrittura iniziale su users o paid_until. Le scadenze esistenti diventano
baseline alla prima operazione del registro.
Il file non è idempotente: errore o migrazione parziale richiedono diagnosi,
mai un rilancio alla cieca. Il test SQLite già superato non è una migrazione D1.

## Matrice Worker candidata — non applicata

| Voce | Valore / condizione |
| --- | --- |
| Entry point | worker/apple-production-entry.mjs, bundle completo con router review |
| APPLE_DEPLOYMENT / APPLE_ENVIRONMENT | production / Production |
| APPLE_PRODUCTION_ENABLED | 0; resta anche il gate sorgente APPLE_PRODUCTION_NOT_READY |
| APPLE_VERIFIER_URL | https://apple.calcioreport.com |
| APPLE_VERIFIER_SECRET | Segreto HMAC dedicato già sul server; trasferimento protetto ancora da predisporre, mai in Git/chat |
| PRO_LEDGER_ENABLED | 1 soltanto nel cutover autorizzato, dopo schema e riconciliazione |
| PRO_LEDGER_CUTOVER_MS | Istante positivo non futuro fissato al cutover, poi immutato; non inventare ora |
| STRIPE_PRO_PAYMENT_LINK_ID | plink_1T6a4ZLCMe9gtpTW2ticsWmF |
| APP_REVIEW_ENABLED | 1 solo con binding/account/segreti coerenti sul Worker pubblico |
| APP_REVIEW_DB | DB review sopra; preservare isolamento da live e test |
| APP_REVIEW_ACCOUNT_ID | b960e09e-0937-49f3-9acb-18fb373e69f9; usare account esistente |
| APP_REVIEW_ACCOUNT_EMAIL | Email riservata esistente; non pubblicare credenziali |
| APP_REVIEW_LICENSE_SECRET | Segreto review esistente, distinto da LICENSE_SECRET |
| APP_REVIEW_VERIFIER_URL | https://apple-test.calcioreport.com |
| APP_REVIEW_VERIFIER_SECRET | HMAC Sandbox esistente, distinto da Production |

Conservare tutte le variabili, i segreti e le route live inventariati.
Questa matrice non è un file Wrangler completo: non sostituire la configurazione
remota con un modello minimale. Mantenere la destinazione attuale delle notifiche
Sandbox sul Worker TEST. Non creare un nuovo account review né ripetere TestFlight.

Il manifest deploy/apple-production-inputs.json è completo e il checker offline
è già passato. Non certifica binding remoti, credenziali, schema o readiness.
Il gate Apple chiuso NON sospende i writer web: per una finestra di migrazione
occorre una sospensione esplicita e verificabile di quei writer.

## Stripe e associazione account — lettura sorgenti del 24 ottobre

Fonte: worker/worker.js, handleStripeWebhook; worker/legacy-pro-delivery.mjs.
Il prezzo web confermato dal proprietario è 499 centesimi EUR; Apple 999 centesimi
EUR è un altro canale. Non modificare il prezzo Stripe durante la release.

La firma webhook viene verificata prima di elaborare completed e
async_payment_succeeded. L'account viene cercato usando l'email del checkout.
Account assente o creato dopo il checkout: risposta 200 senza accredito.
Non esiste in questo percorso un'associazione tramite client_reference_id.
Quindi un acquisto con email diversa dal login non garantisce il PRO all'account
atteso; serve riconciliazione esplicita, senza creare account automaticamente.

Il nuovo registro controlla Payment Link, livemode, pagamento una tantum pagato,
data checkout successiva al cutover e identità operazione stripe:sessionId.
Un retry usa la stessa operazione e non deve aggiungere altri 30 giorni.
Il codice letto NON verifica esplicitamente currency o amount_total:
l'allowlist del link non equivale a un controllo di 499 EUR centesimi.
Prima del cutover definire e implementare la politica importo/valuta, compresi
eventuali sconti del checkout; non aggiungere un vincolo 999 né assumere coupon
Stripe attivi. I coupon PRO del cruscotto sono un percorso distinto.
Questa è una verifica statica, non un pagamento remoto collaudato.

## Riconciliazione prima del cutover

- I sei paid_until positivi sono test secondo il proprietario; preservarli.
  Questo non prova assenza di sessioni Stripe aperte o coupon pendenti.
- Inventariare soltanto i pagamenti ancora da gestire e i checkout pendenti,
  inclusi metodi asincroni: session ID, data creazione, stato, importo/valuta,
  account atteso e accredito già avvenuto. Niente dati clienti in Git/chat.
- Sessioni create prima dell'istante cutover richiedono riconciliazione anche se
  pagate dopo. Non abbassare il cutover e non aggirare il controllo per accreditarle.
- Per ogni accredito manuale approvato usare una richiesta amministrativa stabile,
  registrare privatamente la correlazione con la sessione ed evitare doppio accredito.
- Coupon legacy solo email: il nuovo percorso richiede riemissione v2 account-bound,
  ID univoco e issuedAt successivo al cutover e alla creazione account.
  Verificare prima eventuale utilizzo; non riemettere in massa né accreditare due volte.
- PRO da pulsante admin e nuovi coupon restano previsti. I casi remoti non ancora
  accettati vanno verificati sul candidato isolato, senza ripetere il grant già chiuso.

## Sequenza da rendere eseguibile e autorizzare

1. Chiudere politica Stripe importo/account e inventario dei casi pendenti.
   Definire il meccanismo concreto di sospensione dei writer legacy
   (Stripe, redeem, admin), compresi richieste in corso e retry.
2. Preparare bundle identificato da commit e configurazione completa; PR #16
   aperta/draft/mergeable al controllo, nessuna integrazione implicita.
3. Solo con autorizzazione: sospendere i writer, applicare lo schema al DB live
   identificato e verificare esito mirato/preservazione utenti e scadenze.
4. Solo con autorizzazione: cutover coordinato del bundle e del registro con
   istante registrato, Apple ancora disabilitato. Riconciliare checkout precedenti.
5. Eseguire soltanto accettazioni ancora aperte e verifica firmata Worker-verifier;
   apertura gate Apple e release finale richiedono una decisione separata.

Finché sospensione writer e gestione Stripe sono aperte, non fornire un comando
di migrazione come se il cutover fosse già pronto.

## Recupero e chiusura

Prima di nuove scritture diagnosticare uno schema parziale senza drop indiscriminati.
Dopo il primo accredito del registro non ripristinare il vecchio dump o il writer
legacy: preferire correzione in avanti/sospensione controllata e riconciliazione.
Qualsiasi ripristino richiede un piano approvato sui dati correnti.

Telegram: acquisire e configurare il link definitivo prima della pubblicazione.
Completare metadati, privacy/supporto, screenshot e note review.
Merge, deploy pubblico e invio App Review restano separatamente autorizzati.
