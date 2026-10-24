# Account di revisione Apple — candidato, non distribuito

Il bundle pubblico include ora un router dedicato alla revisione. La 21.1 e il
Worker di test già collaudati non cambiano. Il gate degli acquisti Production
rimane chiuso finché migrazione live e collaudo del candidato non sono completati.

## Percorso implementato

Il login normale rimane sul backend pubblico. Solo l'email riservata configurata
sul server viene autenticata nel database di revisione. Dopo la verifica password,
il server controlla anche l'ID immutabile dell'account autorizzato. La sessione ha
un prefisso di instradamento e una firma con un segreto diverso da quello pubblico.
Ogni richiesta viene riautenticata nel database di revisione: il prefisso non è
un'autorizzazione. Nessun ambiente o URL fornito dal client decide il database.

Dati calcistici, stato PRO, cancellazione account e acquisti usano il medesimo
account isolato. Le richieste Apple sono verificate come Sandbox e accreditate
solo nel database di revisione. Il contesto autenticato /apple/token include
`audience: app-review`; solo la build production permette questo esplicito
contesto Sandbox. Gli utenti pubblici restano Production. Gli endpoint admin,
Stripe, redeem, reset password e notifiche sono esclusi dal percorso con sessione
di revisione. Registrazione e recupero password dell'email riservata sono gestiti
manualmente: le credenziali vanno fornite nelle note di revisione.

La cancellazione usa il normale flusso dell'app, incluse password e tombstone.
Dopo una prova di cancellazione occorre predisporre un nuovo account e aggiornare
APP_REVIEW_ACCOUNT_ID; una vecchia sessione non può accedere al nuovo account.

## Configurazione futura (non applicare al Worker TEST attuale)

- APP_REVIEW_ENABLED=1 solo sul candidato pubblico quando pronto al collaudo.
- APP_REVIEW_DB: binding D1 a un database dedicato alla revisione, diverso dal
  database live e preferibilmente anche da calcio_users_test. Installare schema
  account, apple-purchase-ledger e pro-entitlements.
- APP_REVIEW_LICENSE_SECRET: segreto dedicato, diverso da LICENSE_SECRET live.
- APP_REVIEW_ACCOUNT_EMAIL e APP_REVIEW_ACCOUNT_ID: un account già predisposto nel
  DB dedicato. Non scegliere un'email di un utente pubblico già esistente.
- APP_REVIEW_VERIFIER_URL / APP_REVIEW_VERIFIER_SECRET: verificatore Sandbox.

Il confronto degli oggetti binding intercetta alias identici in-process ma non
può provare l'identità fisica di due binding Cloudflare separati: controllare gli
UUID D1 prima del deploy. Configurazione mancante/non valida blocca solo il
percorso revisione, senza ripiegare sul database pubblico.

## Notifiche Sandbox condivise — implementate, rollout da completare

Mantenere l'URL Sandbox Apple attuale sul Worker `calcio-report-test`.
Il nuovo bundle TEST può cercare il proprietario in entrambi i database, solo dopo
verifica della firma e riconciliazione Apple. Attivazione sul Worker TEST:

- binding `APP_REVIEW_DB` → `calcio_users_review` (controllare UUID diverso dal DB test);
- `APP_REVIEW_ACCOUNT_ID=b960e09e-0937-49f3-9acb-18fb373e69f9`;
- `APPLE_REVIEW_NOTIFICATIONS_ENABLED=1` dopo il nuovo bundle e il binding.

Il verificatore e il suo segreto rimangono quelli TEST già configurati. Nessun
cambio all'URL notifiche in App Store Connect. Una corrispondenza unica decide il
DB di accredito. Corrispondenze multiple, proprietario sconosciuto o errore di un
DB restituiscono 503 senza accredito: Apple può ritentare. Tombstone di account
cancellati sono riconosciute senza ricreare utenti. Il flag assente conserva il
comportamento precedente a un solo DB. Non attivare questo flag sul Worker review.

Il confronto dei binding non dimostra l'identità fisica dei DB: verificare in
Cloudflare i nomi/UUID. I test locali includono due SQLite reali, idempotenza e
rimborso. Rollout e ricezione remota delle notifiche review restano da confermare.

## Verifica e limiti

Nove test dedicati: isolamento delle richieste ordinarie, credenziali errate,
account non autorizzato, prefisso contraffatto, segreti separati, percorsi esclusi,
configurazione errata, cancellazione e contesto acquisti mobile. Un test usa il
vero codice di login/firma e due database SQLite, verificando che la sessione di
revisione sia rifiutata sul DB live e dopo cancellazione dell'account.

Account e Worker isolato sono configurati; login, contesto Sandbox e dati calcistici
sono verificati. Restano rollout notifiche, build firmata e collaudo StoreKit nel
percorso di revisione. Non è una prova su iPhone
né un'autorizzazione a pubblicare. Descrivere esplicitamente nelle note App Review
che l'account fornito usa dati/account e pagamenti Sandbox isolati.
