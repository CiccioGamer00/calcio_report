# Calcio Report — STATO OPERATIVO CORRENTE

_Aggiornato: 2026-10-23 (inventario produzione e ripresa dal checkpoint del 22 ottobre)._
_Questo è il PUNTO DI INGRESSO per le prossime sessioni Work. Leggerlo una sola volta a inizio attività._

## Obiettivo unico attuale

**Preparare infrastruttura di produzione e release finale per App Store Review.**
NON ripetere acquisti, restore, ricerca Milan o altri test già accettati solo per "ricontrollare".
NON riaprire il refactoring Core V2; NON lavorare ai pannelli.
Nessuna pubblicazione, migrazione su database live o invio ad App Review senza autorizzazione esplicita del proprietario.

## Dove lavorare (verificare il branch effettivo prima di leggere il codice)

- **Branch di rilascio operativo:** `release/apple-production-preparation` (PR #15 verso `mobile/ios-preparation`).
- **Branch patch notifiche Apple:** `fix/apple-notification-audit` (PR #16 verso il branch di rilascio; aperta al controllo del 23 ottobre).
- **Branch STORICO, DA NON CONSULTARE:** `core-v2` (settembre). Non usarlo come fonte di stato.
- `main` è stabile: NON modificare e NON usarlo per ricostruire il lavoro recente.
- `mobile/ios-preparation` è base di confronto storico, NON il branch operativo per la release.

## Accettazioni e prove CHIUSE (non rieseguire senza motivo nuovo documentato)

- **TestFlight 1.0 (27.1), 2026-10-21:** build caricata, profilo review avviato correttamente su iPhone.
  Proprietario ha confermato login account review isolato, ricerca/fixture Milan,
  acquisto Sandbox, badge PRO, accesso immediato a Indicatori e Prediction senza logout.
  Il build 26.1 aveva un errore di namespace sessione, corretto in 27.1. NON ritestare 26.1.
- **Registro PRO su Worker TEST, 2026-10-20:** test remoto admin grant + retry
  stesso operation ID superato; nessun giorno duplicato e scadenza /auth/me coerente.
  Non confondere con collaudo remoto di Stripe, redeem, refund.
- **Notifica Apple dell'acquisto review, 2026-10-22:** confronto read-only con
  getNotificationHistory Apple dal verifier OVH, con verifica firme, ha confermato
  ONE_TIME_CHARGE Sandbox, stessa transazione della prova sul DB review, consegna
  Apple SUCCESS e chiamata Cloudflare POST /apple/notifications HTTP 200.
  È chiusa l'indagine su identità/consegna della notifica storica.
  L'HTTP 200 non prova *da solo* una nuova scrittura della notifica nel DB:
  l'acquisto era già registrato prima della chiamata.
- **Audit notifiche future:** PR #16 aggiunge log sicuri di esito; il proprietario
  ha confermato il deploy del bundle SOLO sul Worker TEST il 22 ottobre.
  Il nome/versione remota e un evento dei nuovi log non sono stati verificati
  indipendentemente. NON ripetere acquisto storico o creare un replay inutile.
- **Flusso Worker -> relay OVH -> API-Football:** verificato nel progetto in passato;
  non tornare ai test di settembre senza regressione pertinente.
- I test automatici già registrati nel file storico rimangono evidenze valide per
  i commit indicati; non scambiarli per nuove prove su iPhone o in produzione.

## Checkpoint produzione — riprendere da qui (23 ottobre)

- Screenshot Cloudflare del proprietario: Worker Production `calcio-report-proxy`,
  binding D1 `DB` -> `calcio_users`; versione visualizzata `c59345ba`
  (identificativo parziale, non un commit Git).
  UUID D1 verificato nello screenshot Overview di `calcio_users` del 23 ottobre:
  `45681187-3565-4d36-8627-131c18ff1885`.
- Ispezione schema già completata il 22 ottobre, riportata dal proprietario:
  tabelle Apple e nuovo registro PRO assenti. NON richiedere di ripetere il controllo.
- Query aggregata `users` già completata: 23 utenti, 1 disabilitato,
  6 con `paid_until > 0` (non necessariamente ancora attivi).
  Scadenza minima 1774800857114; massima 1796750470265;
  ultima registrazione 1791477327458. Preservare utenti e diritti PRO esistenti.
- **Backup completo esportato il 23 ottobre**, Wrangler 4.152.0, dopo autorizzazione
  Cloudflare. Il proprietario ha riportato l'esito `Downloaded ... successfully!`:
  `C:\Users\stefa\calcio_users_backup_2026-10-23.sql`.
  Esportazione/download completati; ripristino e integrità del dump non ancora collaudati.
  Non richiedere una nuova esportazione per riconfermare questo checkpoint.
  Il dump resta sul PC del proprietario, senza caricarne i dati in chat/Git.
- PR #16: conflitto risolto il 23 ottobre allineando il solo riepilogo del branch
  audit alla release (commit `c84cebb`); GitHub conferma `mergeable=true`.
  Rimane aperta, draft e non merged. Codice notifiche invariato; test già
  accettati non ripetuti. Descrizione PR aggiornata alle evidenze reali.

## Configurazione live rilevata — screenshot 23 ottobre

- Elenco Runtime variables and secrets, scheda Production: nove voci visibili.
  `AUTH_PASSWORD_V2=1`, `CR_RELAY_URL=https://relay.calcioreport.com`;
  variabile `ACCOUNT_DELETION_ENA...` con valore 1 (nome troncato nello screenshot).
- Segreti presenti, valori non letti: `ADMIN_KEY`, `APISPORTS_KEY`,
  `CR_RELAY_SECRET`, `LICENSE_SECRET`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Nell'elenco non compaiono impostazioni `APPLE_*`, `APP_REVIEW_*` o
  `PRO_LEDGER_*`. Non è una verifica del codice effettivamente distribuito.
- Il 23 ottobre il proprietario conferma che i PRO esistenti sono solo test.
  Non trattarli come vendite reali. Preservare comunque utenti e scadenze.
- Piano: riconciliare eventuali pagamenti/codici preesistenti; predisporre schemi
  e configurazione candidata con Apple Production disabilitato; verificare UUID
  review distinto dal live e verifier Production dedicato; pianificare cutover
  senza writer legacy concorrenti e rollback che conservi gli accrediti successivi.
  Il backup del 23 ottobre non va ripristinato automaticamente sul live dopo nuovi
  pagamenti. Nessuna configurazione, migrazione o deploy eseguiti in questo blocco.
- Consultati solo i documenti pertinenti `docs/pro-payment-migration.md` e
  `docs/app-review-isolation.md`; i loro vecchi pending TestFlight/notifiche non
  riaprono le accettazioni chiuse sopra.

## Cruscotto amministrativo — aggiornato 23 ottobre

- Ripristino confermato dal proprietario con API `https://api.calcioreport.com`:
  screenshot con 22 utenti elencati e 1 attivo negli ultimi 7 giorni.
- Aggiunto `admin.html` dalla copia fornita: URL corretto, funzioni esistenti conservate,
  escaping dei dati mostrati, requestId sulle rettifiche. Commit `79174a0`.
- Clic concorrenti nella pagina bloccati; esiti incerti persistiti in localStorage
  impediscono ulteriori rettifiche dello stesso utente fino a verifica esplicita.
  ADMIN_KEY non salvata. Nessun retry automatico: il live legacy può ignorare requestId.
  Il retry con stesso ID resta da verificare/abilitare dopo il cutover del registro.
  Il blocco locale non coordina dispositivi diversi o schede simultanee.
- Test mirati locali con fetch simulato superati (commit `7bc47c5`): concorrenza,
  successo, risposta persa, rettifica opposta, reload, sblocco esplicito, nuovo ID,
  storage non disponibile ed escaping. Nessuna rettifica reale o test remoto ripetuto.
- Nuovi coupon del registro account-bound e monouso; vecchi email-only da riemettere.
  Utenti iOS sul medesimo backend Production visibili; review/Sandbox separati.
  Compatibilità finale da verificare sul candidato.
- Contatore pubblico utenti/attività rinviato al post-release; non equivale a download.

## Preparazione migrazione — 23 ottobre

- Generatore locale `scripts/prepare-production-schema.mjs` (commit `654a241`):
  assembla i tre schemi versionati in `worker/dist/production-initial.sql`,
  senza connessioni remote né modifiche a flag/configurazione live.
- Verifica locale con SQLite e utenti sintetici superata: cinque nuove tabelle
  vuote, sei trigger, chiavi esterne coerenti, utenti/scadenze invariati e
  riesecuzione rifiutata. Non è collaudo della migrazione D1 remota.
- Piano e matrice configurazione in `docs/production-cutover.md` (`d8847c3`).
  Restano verifier Production e ID Stripe Payment Link da completare.
  Gate Apple chiuso; migrazione e cutover non autorizzati né eseguiti.

## Configurazione candidata e controlli offline — 23 ottobre

- `deploy/apple-production-inputs.json`: destinazione live nota, gate Apple 0,
  valori ignoti lasciati vuoti. Verifier Sandbox recuperato dal lavoro precedente:
  `https://apple-test.calcioreport.com` (non è l'URL notifiche del Worker).
- `deploy/apple-verifier-production.env.example`: servizio separato, ambiente
  Production, porta candidata 8791; nessun segreto inserito.
- `scripts/check-production-inputs.mjs` controlla offline destinazione, UUID
  distinti, origini HTTPS separate, ID app distinto dal prodotto e gate chiuso.
  Quattro nuovi test mirati superati; nessuna chiamata Apple, D1 o deploy.
  Ultimo commit del blocco: `cd959b5`.
- UUID D1 review comunicato dal proprietario il 23 ottobre:
  `5b5458eb-4a69-454d-a5ac-76ffc93b8af7`, distinto dall'UUID live.
  Screenshot precedente conferma APP_REVIEW_DB -> calcio_users_review sul Worker review;
  non dimostra il binding futuro sul Worker pubblico.
- UUID D1 test comunicato dal proprietario il 23 ottobre:
  `2aa786a8-6a61-495e-9c41-507496c39325`. I tre UUID live/review/test sono distinti;
  registrati nel manifest candidato. Nessuna modifica ai binding remoti.
- APP Apple ID numerico `6821570508` confermato dal proprietario e screenshot
  App Store Connect il 23 ottobre; bundle `com.calcioreport.app`. Inserito nel
  manifest e nel modello env Production. Nessun aggiornamento del servizio remoto.
- Origine Production candidata compilata: `https://apple.calcioreport.com`.
  Resta mancante l'ID Payment Link Stripe Production: il checker deve ancora fallire.
  Manifest compilato non equivale a readiness remota o approvazione del rilascio.
  Test della fixture incompleta indipendente dalla compilazione del manifest.
  Nessun test accettato ripetuto per il solo inserimento dell'UUID test.
- Il blocco hard-coded `APPLE_PRODUCTION_NOT_READY` è ancora presente in
  worker/apple-handler.mjs: il solo flag NON abilita Production. Rimozione futura
  subordinata alla migrazione e alle accettazioni previste.

## Verifier OVH — ispezione read-only 23 ottobre

- Output fornito dal proprietario: Sandbox `calcio-report-apple` active,
  utente `calcioapple`, directory `/opt/calcio-report-apple`,
  unit `/etc/systemd/system/calcio-report-apple.service`.
- Runtime effettivo `/opt/calcio-report-node24/bin/node`;
  EnvironmentFile `/etc/calcio-report-apple/service.env` obbligatorio.
  Porta TCP 8791 libera all'ispezione; nessun contenuto segreto letto/stampato.
- Predisposto `deploy/calcio-report-apple-production.service`: utente/gruppo
  candidati `calcioappleprod`, directory `/opt/calcio-report-apple-production`,
  env `/etc/calcio-report-apple-production/service.env`, stesso runtime Node.
  Unit solo su GitHub: non installata o verificata con systemd sul server;
  account, codice, permessi e credenziali Production ancora da predisporre.
- Caddy attivo; configurazione `/etc/caddy/Caddyfile`. Output filtrato di
  `caddy adapt` fornito dal proprietario: `apple-test.calcioreport.com` ->
  `127.0.0.1:8790`. È evidenza della configurazione su disco, non di TLS remoto.
  Nginx non disponibile; non installarlo né ripetere il controllo Nginx.
- Aggiunto `deploy/Caddyfile.apple-production.example` (commit `e7ff21a`):
  hostname proposto `apple.calcioreport.com` -> `127.0.0.1:8791`.
  DNS/TLS ancora da verificare; candidato non installato, Caddy non ricaricato.
  Non sostituire il Caddyfile esistente; integrare il sito solo nel deploy autorizzato.
- DNS predisposto dal proprietario il 23 ottobre, screenshot conferma record A
  `apple.calcioreport.com` -> `51.254.212.179`, DNS only, TTL Auto; Sandbox invariato.
  Origine inserita nel manifest (`b67f847`). Risoluzione da OVH confermata dal
  proprietario: `51.254.212.179`; TLS ancora da predisporre/verificare.
- Prerequisiti verificati dal proprietario: utente `calcioappleprod`, directory
  `/opt/calcio-report-apple-production`, env e unit Production assenti.
  Nel Sandbox APPLE_KEY_ID e APPLE_ISSUER_ID configurati, file chiave Apple presente;
  valori non esposti. Presenza locale non prova autorizzazione API Production.
- Proprietario conferma account `calcioappleprod` e directory isolate creati.
  Creati env Production (root, 0600) e copia chiave Apple (root:calcioappleprod,
  0640), con APPLE_APP_ID=6821570508, Production, porta 8791 e nuovo segreto
  HMAC casuale dedicato. Nessun valore segreto esposto; nessun servizio avviato.
- Codice verifier predisposto dal commit release
  `d95e7c51bda3de71731f624eabf10192e6980075`, con RELEASE_COMMIT locale.
  Proprietario conferma `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`
  riuscito: 48 pacchetti. Codice root:calcioappleprod, non scrivibile dal servizio.
  Avviso npm: jsrsasign@11.1.5 deprecato/non mantenuto; nessun aggiornamento
  automatico di dipendenze o npm. Da valutare separatamente, non è un audit vulnerabilità.
- Verifica unit systemd e accesso a codice/chiave come utente servizio superati.
  Avvisi CPUAccounting relativi a unit XFS di sistema, non al verifier.
- Proprietario ha autorizzato esplicitamente installazione e avvio SOLO locale
  del verifier Production. Unit installata; da nuova sessione SSH confermati
  LoadState=loaded, ActiveState=active, SubState=running, ExecMainStatus=0, Job vuoto.
  GET locale /health -> {"ok":true}; ss conferma solo `127.0.0.1:8791`.
  La prima sessione terminale non restituiva output; non ripetere installazione.
  Avvio automatico al boot successivamente abilitato: proprietario conferma
  symlink multi-user.target.wants e `is-enabled=enabled`.
- Caddy importa `/etc/caddy/sites/*.caddy`. Candidato preparato fuori dai siti
  attivi in `/etc/calcio-report-apple-production/caddy-stage`; `caddy adapt`
  ha accettato sintassi e import. Il proprietario ha poi autorizzato HTTPS.
  Installato `/etc/caddy/sites/apple-production.caddy`, reload Caddy riuscito.
  Output del proprietario: HTTPS OK, certificato verificato e health OK da OVH
  su `https://apple.calcioreport.com/health`.
  Worker/database invariati. Health prova solo liveness, non accesso API Apple
  Production o accrediti. Non richiedere nuovamente autorizzazione per questo avvio/HTTPS.
- Controllo HTTPS senza firma completato dal proprietario: POST /v1/transaction
  e POST /v1/notification -> HTTP 401 AUTH_INVALID. Avvio automatico enabled.
  Blocco provisioning/TLS/rifiuto richieste anonime chiuso; non ripeterlo.
  Restano verifica del percorso firmato Worker->verifier e accesso Apple Production;
  non confondere questi esiti con accettazione acquisti o notifiche Production.
- Prossimo blocco: acquisire ID Payment Link Stripe Production (`plink_...`),
  ultimo input vuoto nel manifest; poi completare preparazione configurazione/cutover
  Worker e migrazione D1, ancora non autorizzati né eseguiti.

## Attività ancora APERTE — solo il blocco App Store

1. **Inventario READ-ONLY della produzione:** identificare branch/commit candidati,
   Worker pubblico, binding D1 e relativi UUID, schemi, flag, endpoint di verifier
   Production e configurazioni esistenti. Non stampare segreti e non toccare il live.
2. **Piano di migrazione sicuro:** backup e rollback, inventario pagamenti/codici
   pre-cutover, schema `worker/schema/pro-payment-operations.sql` sul DB giusto,
   cutover e registro PRO senza doppie scritture legacy. Un checkout precedente
   al cutover richiede riconciliazione, non un accredito automatico.
3. **Percorso Apple Production:** verifier dedicato, configurazione e notifiche,
   isolamento review/Sandbox dal live, e verifica dei gate di produzione.
   Non aprire `APPLE_PRODUCTION_ENABLED` prima dell'accettazione necessaria.
4. **Accettazione finale mirata al rilascio:** eventuali casi realmente ancora
   scoperti (in particolare refund/deletion e gate produzione), evitando ogni
   test già chiuso. Non dichiarare superato ciò che resta da verificare.
5. **Release App Store:** bundle/build firmata corretta, metadati/screenshot,
   privacy/supporto, istruzioni e account di revisione, approvazione proprietario
   prima di deploy pubblico o invio alla review.
6. **Telegram — richiesto dal proprietario il 23 ottobre:** configurare il link
   attualmente non attivo e verificarne l’apertura prima della pubblicazione.
   Acquisire URL/canale definitivo quando si affronta questo blocco.

## Documenti di dettaglio SOLO SE pertinenti al blocco

- `docs/pro-payment-migration.md` — schema e rischi migrazione PRO.
- `docs/app-review-isolation.md` — isolamento account e notifiche di revisione.
- `docs/app-store-release-handoff.md` — piano originario del 19 ottobre:
  **alcuni "pending" sono obsoleti**; prevalgono i checkpoint chiusi sopra.
- `docs/apple-purchases.md` e `docs/ios-preparation.md` — solo per uno specifico problema.
- `docs/archive/` — snapshot integrale dello storico per consultazione occasionale.
  NON leggere questi archivi a inizio sessione o per risolvere task non correlati.

## Protocollo a basso consumo di Work

1. Conferma repository `CiccioGamer00/calcio_report`, branch ATTIVO e ultimo commit;
   leggi questo riepilogo. **Mai leggere `core-v2/PROJECT_STATUS.md`.**
2. Fissa UN SOLO obiettivo e i file effettivamente coinvolti, poi apri solo
   quei file o i blocchi/range pertinenti; non sfogliare tutto GitHub.
3. Prima delle modifiche spiega in 3 righe cosa/come/file/risultato.
4. Fai direttamente su GitHub quello che è possibile, in commit piccoli e coerenti;
   testa solo il cambiamento introdotto, evitando suite complete e controlli
   già accettati salvo requisito tecnico reale.
5. Se serve un'azione manuale, comunica **un solo comando o passo alla volta**.
   Niente richieste F12 se è possibile una diagnostica nell'app.
6. Dopo una milestone aggiorna **solo** questo stato sintetico:
   data, fatto verificato, evidenza/commit, prossimo passo. Niente diari ripetitivi.
7. Non inventare esiti di test, deploy o collegamenti a database. Non inserire
   segreti, password, token o chiavi in GitHub, nei log o in chat.

**Prossimo intervento:** acquisire ID Payment Link Stripe Production e completare
la configurazione candidata/cutover Worker-D1. Verifier OVH attivo, enabled,
TLS e rifiuto richieste anonime confermati. Non richiedere di nuovo il backup.
Telegram resta un requisito aperto prima della pubblicazione.
Nessuna migrazione, nuovo acquisto, merge o ulteriore deploy senza autorizzazione
esplicita. Avvio verifier e HTTPS OVH già autorizzati ed eseguiti.
