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
| PRO_WRITES_PAUSED | 0 normalmente; 1 solo nella finestra autorizzata, con candidato effettivamente distribuito |
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
Il candidato ora richiede currency='eur' e amount_total numerico esattamente 499
nel registro Production (f46ec5e). Importi originali diversi, scontati o mancanti
generano PRO_STRIPE_AMOUNT_RECONCILIATION_REQUIRED prima di accedere al DB.
Il webhook restituisce il generico PAYMENT_DELIVERY_UNAVAILABLE 503, non un
falso accredito riuscito: il solo retry non risolve un importo da riconciliare.
La policy Sandbox non è modificata. Test mirati nuovi superati: 20 test inclusi
15 sottocasi monetari, confine prima della persistenza, unpaid e controlli precedenti.
Non è una prova di accredito remoto. Il 24 ottobre il proprietario conferma assenza di sconti; screenshot del link:
Consenti l'uso di codici promozionali = No. La conversione non è attestata dallo
screenshot. La documentazione Stripe attuale indica Adaptive Pricing sempre
abilitato per Payment Links e webhook in valuta/importo originali, con valuta
pagata dal cliente in presentment_details. Il controllo EUR499 riguarda quindi
il prezzo originale, non presentment_details. Nuovo caso locale passato (a7dbc18):
presentment estero con originale EUR499 ammesso fino alla persistenza simulata;
originale USD550 respinto anche se presentment dichiara EUR499.
Fonte: https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted
Non è una verifica di un evento reale del nostro account/versione API. I coupon PRO del cruscotto
restano un percorso distinto; non ne è stata rimossa la gestione.

## Inventario pagamenti — conferma del proprietario 24 ottobre

Il proprietario conferma che nessuno ha acquistato: app non ancora promossa/
distribuita; i PRO esistenti sono test. Screenshot: sola creazione Payment Link,
statistiche ultimi tre mesi con volume 0 EUR, sessioni 0 e nessuna attività.
Non emerge un pagamento da riconciliare. L'aggregato non è un elenco esaustivo
di ogni checkout: mantenere la gestione pre-cutover nel codice, senza richiedere
gli stessi screenshot o trasformare l'inventario in un ulteriore blocco.
Preservare comunque utenti e diritti test, senza cancellazioni.

## Preparazione della prima fase

deploy/apple-worker-maintenance-vars.json (e623951) è SOLO l'insieme delle
variabili da aggiungere/aggiornare nella futura finestra autorizzata.
Non è una configurazione completa e NON deve sostituire tutte le variabili.
Conservare binding, route, compatibility date/flags e segreti già presenti.
Non impostare il cutover né abilitare il registro in questa prima fase.
Review mantiene le impostazioni esistenti; quelle future richiedono configurazione
dedicata, non sono implicitamente abilitate da questo file.

scripts/manual/export-live-worker.ps1 (f09b073) scarica una copia locale del
Worker live con configurazione effettiva, senza deploy né accesso ai dati D1.
Usa Wrangler 4.152.0, init --from-dash con --delegate-c3=false.
Esaminato il codice installato di tale versione: questo ramo esegue il download
dei moduli e scrive wrangler.jsonc come JSON; non passa al wizard C3/deploy.
Cartella nuova con timestamp sul PC; il riepilogo stampa soltanto nomi variabili,
chiavi configurazione, compatibility date/flags, UUID binding e numero moduli.
Non inviare il file completo di configurazione/codice in chat: conservarlo localmente.
Script predisposto, non ancora eseguito sul PC; nessun download live dichiarato.
Questo passaggio recupera la configurazione realmente distribuita e il codice
precedente; non ripete il backup D1 né le accettazioni applicative.

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

## Sospensione candidata — inattiva sul live

worker/pro-production-maintenance.mjs, collegato soltanto al ramo Production
di apple-production-entry.mjs (01fc96a), legge PRO_WRITES_PAUSED='1'.
Rifiuta con 503 PRO_MAINTENANCE, Retry-After 60 e no-store:
POST /stripe/webhook, /license/redeem, /admin/grant, /admin/adjust,
/auth/delete, /admin/disable; GET /admin/mint.
Login, letture cruscotto, football e preflight rimangono delegati.
Review autenticata viene instradata prima della guardia e conserva il DB separato.
Cinque nuovi test locali passati, inclusa integrazione router review con handler
simulati. Nessun test remoto né suite accettata rieseguiti.

Il flag non ha effetto sul vecchio codice live: serve prima distribuire il
candidato completo con pause=1, ledger=0 e Apple Production=0, SOLO previa
autorizzazione. Non aprire Apple durante questa finestra. La guardia non annulla
richieste in corso o vecchie versioni ancora raggiungibili: prima di migrare
occorrono evidenza del completamento del rollout, assenza di writer legacy
concorrenti e drenaggio delle richieste precedenti. Non considerare un'attesa
arbitraria una prova. I webhook respinti richiedono successiva gestione dei retry.
Questa è una sospensione PRO, non un blocco totale del DB: nuove registrazioni
e attività non finanziarie possono continuare; confronti post-migrazione devono
preservare gli account preesistenti senza assumere conteggi globali immutabili.

## Sequenza da rendere eseguibile e autorizzare

1. Completare inventario dei checkout pendenti/pre-cutover e associazione email;
   sconti assenti confermati, distinzione valuta originale/presentment documentata. Preparare modalità verificabile di rollout e
   drenaggio del Worker corrente, usando la guardia candidata sopra.
2. Preparare bundle identificato da commit e configurazione completa; PR #16
   aperta/draft/mergeable al controllo, nessuna integrazione implicita.
3. Solo con autorizzazione: sospendere i writer, applicare lo schema al DB live
   identificato e verificare esito mirato/preservazione utenti e scadenze.
4. Solo con autorizzazione: cutover coordinato del bundle e del registro con
   istante registrato, Apple ancora disabilitato. Riconciliare checkout precedenti.
5. Eseguire soltanto accettazioni ancora aperte e verifica firmata Worker-verifier;
   apertura gate Apple e release finale richiedono una decisione separata.

Finché rollout/drenaggio e inventario Stripe sono aperti, non fornire un comando
di migrazione come se il cutover fosse già pronto.

## Bundle verificato localmente il 24 ottobre

Sorgenti runtime dal commit b35630786743a485ee340fc16d7c1c7d150bf494,
script versionato scripts/build-apple-production-worker.mjs, esbuild 0.28.2
(stessa versione esatta dichiarata in mobile/package.json).
Build riuscita: 105160 byte; SHA256
ed9d15719b2a0e9b4291fa1c0a8fd4f8c9f88cac4b8e67ea2c934054c187871c.
Smoke sul bundle effettivo: webhook in pausa -> 503 PRO_MAINTENANCE;
Apple con flag 0 -> 503 APPLE_PURCHASES_DISABLED; accessi DB e rete vietati,
nessuno effettuato. Non è dry-run Wrangler, verifica binding o deploy.
PR16 non integrata. Ricostruire il candidato se cambiano sorgenti runtime.

Screenshot Stripe: riscossione automatica imposte Sì; prezzo inclusivo già
documentato. Pagina conferma ancora
https://cicciogamer00.github.io/calcio_report/?stripe=success.
Verificare destinazione finale prima della release; non modificata qui.

## Recupero e chiusura

Prima di nuove scritture diagnosticare uno schema parziale senza drop indiscriminati.
Dopo il primo accredito del registro non ripristinare il vecchio dump o il writer
legacy: preferire correzione in avanti/sospensione controllata e riconciliazione.
Qualsiasi ripristino richiede un piano approvato sui dati correnti.

Telegram: acquisire e configurare il link definitivo prima della pubblicazione.
Completare metadati, privacy/supporto, screenshot e note review.
Merge, deploy pubblico e invio App Review restano separatamente autorizzati.
