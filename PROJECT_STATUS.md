# Calcio Report — STATO OPERATIVO CORRENTE

## Screenshot completati e ripresa — 29 ottobre 2026, sera

- Proprietario comunica "screen pronti" con schermata 213446: tutte le tre
  anteprime Match/Indicatori/Giornata visibili, nessuna icona nuvola;
  Salva disabilitato. Visualizzate come utilizzo di risorse esistenti nella
  vista display medio, dopo upload originali nel display grande.
  Blocco elaborazione immagini CHIUSO. Non richiedere nuovi screenshot.
- 33.1 selezionata, privacy pubblicata, URL assistenza/privacy salvati come
  confermato in precedenza. Rilascio manuale mantenuto.
- Prossimo requisito aperto: leggere URL notifiche server App Store
  Production e Sandbox in App Store Connect, prima di modificarli.
  Non presumere configurazione esistente. Poi completare piano backend
  candidato a flag 0 e controllo finale di idoneità alla review.
- Review non inviata; acquisti Production disabilitati. Questa ripresa supera
  la pausa sottostante; autorizzazioni generali già acquisite.

## PAUSA proprietario — 29 ottobre 2026, caricamento screenshot

- Proprietario deve uscire e rinvia a domani. Non avviare nuove build/deploy.
- Conferma utente: 33.1 selezionata e salvata nella scheda iOS 1.0,
  rilascio manuale. Screenshot 33.1 verificati: nessuna diagnostica Match visibile.
- Scelti nell'ordine IMG_4673.PNG (Match), IMG_4675.PNG (Indicatori),
  IMG_4672.PNG (Giornata Serie A). Copie in chat 942x2048, non originali.
- iCloud pieno: originali trasferiti via USB da iPhone al Desktop Windows.
  Upload iniziale fallito nel riquadro Dynamic Island display medio.
  Proprietario poi apre Gestione risorse multimediali, Dynamic Island display
  grande: contatore tre screenshot con elaborazione in corso.
- Ultima schermata 180943: vista display medio con "Utilizzo di risorse
  esistenti"; due anteprime (Indicatori/Giornata) visibili ma attenuate,
  prima (Match) ancora icona nuvola. NON confermare tre upload completati.
  Salvataggio finale dopo elaborazione non confermato.
- PRIMO PASSO domani: riaprire Gestione risorse, Dynamic Island display grande,
  verificare stato delle tre immagini e salvataggio. Non ricaricare tutto né
  rifare screenshot senza verificare quale immagine è effettivamente pendente.
- Indisponibili e safe area già accettati; privacy pubblicata chiusa.
  App Review non inviata, Apple Production disabilitato; prerequisiti backend
  e notifiche da completare secondo piano esistente.

## Verifica device Indisponibili 33.1 — 29 ottobre 2026

- Proprietario invia 19719.jpg dopo installazione candidata richiesta:
  Fiorentina, cinque indisponibili. Giocatori allineati a sinistra, metadati
  sotto ogni chip, nessun taglio laterale visibile; safe area mantenuta.
  Difetto layout Indisponibili CHIUSO per evidenza reale ricevuta.
- Alcuni ruoli mostrano trattino (dato assente), motivi injury in inglese:
  non confondere con regressione layout. Nessuna nuova modifica eseguita.
- Assenza diagnostica Match non verificabile dalla sola schermata Indisponibili.
- Prossimo passo: sostituire la candidata selezionata nella scheda iOS 1.0 con
  33.1, mantenendo rilascio manuale; selezione non ancora confermata.
  Restano screenshot Store originali della candidata finale, verifica diagnostica
  Match e prerequisiti backend/notifiche già documentati. Review non inviata.

## Ripresa UI e candidata finale — 29 ottobre 2026

- Proprietario chiede di proseguire: pausa del 28 ottobre conclusa.
- Indisponibili: la kv-row con etichetta fissa 170px comprimeva tutta la lista.
  Scheda specifica a larghezza piena, metadati sotto il giocatore su mobile,
  nomi lunghi a capo e foto non comprimibili. Desktop mantiene due colonne
  giocatore/dettaglio; nessuna modifica alle altre schede o alle API.
- Diagnostica Match: isLocalDebug accettava localhost anche con capacitor:.
  Ora richiede http/https oltre all'host locale, escludendo l'app installata.
- Controlli sintassi JS e diagnostica (capacitor/pubblico spenti, server locale
  attivo) passati. Layout Chromium verificato a 320/430/768/1280px, liste
  popolate/vuote e nomi lunghi senza overflow; anteprima ispezionata. WebKit
  locale non disponibile: conferma finale da fare su iPhone.
- Workflow signing ora include modifiche style.css/js, asset inclusi nell'IPA.
  Production 33.1 firmata: run 40899843422, job 123538791427 SUCCESS;
  test e controlli IPA/risorse passati. Delivery 40900279493, job 123540352336
  SUCCESS: validazione e upload Apple riusciti. Elaborazione/distribuzione
  TestFlight ancora da verificare. Prossimo passo: assegnare 33.1 a Test interno,
  installare e verificare Indisponibili/assenza diagnostica sul device. Safe area 32.1 conservata, privacy pubblicata resta chiusa.
- Residui: installazione nuova candidata, screenshot definitivi, associazione
  build alla versione Store, prerequisiti backend/notifiche e controllo finale.

## PAUSA richiesta dal proprietario — 28 ottobre 2026, dopo test 32.1

- Proprietario sospende per crediti esauriti; non avviare modifiche/build/deploy.
- 32.1 installata su iPhone, conferma utente e sei screenshot IMG_4659–4664:
  barra sistema scura, contenuti non si sovrappongono più a orologio/batteria.
  Correzione safe area verificata visivamente dopo scroll. Tastiera/rotazione
  non documentate da questi screenshot.
- PRIMO PUNTO alla ripresa: layout Indisponibili (IMG_4662.PNG).
  Ampio spazio vuoto a sinistra; giocatori spostati a destra e descrizioni
  tagliate fuori viewport. Diagnosticare CSS/struttura, non attribuire ancora causa.
- IMG_4659 mostra diagnostica tecnica fase/searchId/http/cache/relay nel Match:
  verificare e disattivare la visualizzazione nella candidata finale.
- IMG_4663/4664 mostrano spiegazioni Tiri/Corner aperte; non sono screenshot
  Store definitivi. Nei nuovi scatti è visibile indicatore rosso registrazione.
- Allegati preservati in conversazione. Screenshot finali e associazione 32.1
  alla versione Store ancora pendenti; non assumere sostituita la 31.1 in ASC.
  Privacy pubblicata chiusa. Non ripetere acquisti o prove precedenti.
- Nessuna correzione Indisponibili eseguita. Review non inviata, gate invariati.

## Correzione area sicura iOS — 28 ottobre 2026

- Proprietario conferma installazione 31.1 da gruppo Test interno. Cinque
  screenshot reali ricevuti: contenuti sovrapposti a orologio/batteria scorrendo.
- CRBridgeViewController ora contiene WKWebView in una UIView separata,
  vincolata sui quattro lati alla safe area iOS; fondo scuro nelle aree sistema.
  Disabilitato l'inset automatico della scroll view per evitare doppio margine.
- Compilazione Production 32.1 firmata SUCCESS: run 40714282107, job
  122907590497; test e controlli IPA/manifest/icona/pagine legali passati.
  Uploader fissato a questa origine e digest, invio Apple avviato separatamente.
  Delivery run 40714804368, job 122909466259 SUCCESS: validazione e upload
  Apple riusciti. Elaborazione/distribuzione ai tester ancora da verificare.
  Prossimo passo: assegnare 32.1 al gruppo Test interno e installarla su iPhone;
  poi verifica area sicura e screenshot. Non ripetere build o caricamento.
- Necessaria verifica reale della nuova build in alto, dopo scroll e con tastiera
  prima di screenshot definitivi. Privacy pubblicata già chiusa, nessun nuovo
  test acquisti richiesto. Gate Apple Production invariato.

## App Privacy pubblicata — conferma proprietario 28 ottobre 2026

- Proprietario conferma salvataggio URL assistenza e privacy già verificati:
  https://app.calcioreport.com/support.html e https://app.calcioreport.com/privacy.html.
- Aggiunta Assistenza clienti: Funzionalità app, collegata all'identità,
  nessun monitoraggio. Email e ID utente: mantenute Analisi + Funzionalità;
  nelle schermate di modifica erano ancora impostati non collegati, corretti a Sì.
- Screenshot finale mostra tutte le cinque categorie soltanto nei dati collegati,
  senza sezione dati non collegati. Supera le precedenti osservazioni discordanti.
- Proprietario conferma «fatto» dopo Pubblica e conferma App Privacy.
  Evidenza tramite utente, non audit API della pubblicazione.
- Build 31.1 selezionata come già confermato. Prossimo punto: screenshot reali
  per scheda Store; verificare prima quale build è disponibile su TestFlight.
  Non assumere che selezione ASC implichi distribuzione ai tester.
- App Review non inviata; rilascio manuale e gate Apple Production invariati.
  Restano prerequisiti backend/notifiche e controllo finale scheda.

## Verifica pagine pubbliche — 28 ottobre 2026

- GET HTTPS senza autenticazione: https://app.calcioreport.com/support.html
  HTTP 200, 3438 byte; https://app.calcioreport.com/privacy.html HTTP 200,
  10058 byte. Entrambi identici byte per byte ai candidati della release.
  Pagine già pubblicate, nessun nuovo deploy eseguito in questa ripresa.
  Questo supera le precedenti note di pubblicazione ancora pendente.
- Prossimo passo proprietario: inserire URL assistenza nella scheda iOS 1.0
  e salvare; URL privacy da inserire in App Privacy nel passo successivo.
  Screenshot reali e allineamento dichiarazioni ancora da completare.

## Ripresa verificata e candidata 31.1 — 28 ottobre 2026

- Verificato stato remoto oltre il precedente messaggio interrotto: correzione
  fixture installer già presente; signing run 40696104256 SUCCESS.
- Delivery run 40704029949, job 122871183161 SUCCESS: IPA Production 1.0
  (31.1), controlli risorse/privacy passati, VERIFY SUCCEEDED e UPLOAD SUCCEEDED
  alle 14:17:57 UTC. Non ripetere compilazione o caricamento.
- Corretto YAML del workflow metadati: condizione if in scalare multilinea;
  il precedente testo con "release: audit" non quotato impediva il parsing.
  Commit 8797092187a738936f115eadd5052aa85cc9c7ea.
- Audit read-only run 40705518490, job 122876442897 SUCCESS:
  31.1 VALID, non scaduta, usesNonExemptEncryption ancora null.
  Versione 1.0 PREPARE_FOR_SUBMISSION, rilascio MANUAL; selezionata ancora 29.1.
  Descrizione e parole chiave italiane presenti; screenshot assenti,
  supportUrl e privacyPolicyUrl null. Nessuna mutazione ASC dall'audit.
- Proprietario conferma «FATTO» alla sostituzione della build con 31.1.
  Selezione registrata come conferma utente; nessun nuovo audit ASC eseguito.
  Prossimo passo: completare pubblicazione/verifica URL, screenshot reali, App Privacy
  e prerequisiti backend/notifiche prima dell'invio. Review NON inviata.
- Questa sezione aggiorna gli esiti pendenti sottostanti; Apple Production
  resta disabilitato. Autorizzazione generale già acquisita, non richiederla.

## Preparazione autonoma finale — 28 ottobre 2026

- Proprietario rinnova autorizzazione a completare autonomamente quanto serve
  per lo Store mentre è assente. Non chiedere nuovamente consenso ai passaggi
  già autorizzati; verificare comunque gli esiti e i prerequisiti tecnici.
- Aggiunta candidata privacy.html, link prima della registrazione e nel footer,
  assistenza collegata; entrambe incluse offline nel pacchetto iOS.
  Decisioni e limiti documentati in docs/privacy-release-decisions.md.
- Manifest privacy app aggiunto come risorsa Xcode, con email/ID, acquisti,
  interazione e assistenza clienti, collegati e senza tracking. ASC richiede
  allineamento della categoria assistenza; nessuna modifica ASC eseguita qui.
- Nuovo controllo dell'IPA esportato: manifest app corrispondente al sorgente,
  manifest SDK senza tracking dichiarato, risorse icona compilate e pagine
  legali esatte. Non equivale a valutazione completa SDK né confronto pixel.
- 4 nuovi test di rifiuto/accettazione e 9 test IPA passati localmente;
  installer idempotente, packaging Production e sintassi shell/JS verificati.
- Questo commit avvia build Production firmata con icona approvata. Esito
  remoto ancora pendente; niente upload implicito e gate acquisti invariato.
- Pubblicazione web, verifica visiva, upload candidata e metadati/screenshot
  reali ancora da completare. Non selezionare automaticamente la vecchia 29.1.

## Ripresa e autorizzazione — 28 ottobre 2026

- Proprietario autorizza le operazioni necessarie per portare l'app sullo Store,
  inclusi i passaggi di rilascio descritti in sessione. Non richiedere nuovamente
  consenso per gli stessi passaggi; restano obbligatori prerequisiti tecnici,
  verifiche residue e ordine di attivazione. Rilascio manuale mantenuto.
- Proprietario conferma esito "Vecchio log eliminato" dopo il comando mirato
  su /var/log/caddy/calcio-report-relay.log (prima 5488926 byte), con verifica
  di assenza. Evidenza riferita dal proprietario, non accesso diretto al server.
  Smaltimento di questo file CHIUSO; non ripetere cancellazione o configurazione
  access log già disattivati. Non equivale ad assenza di altri log o copie.
- Journal VPS configurato il 28 ottobre: MaxRetentionSec=30day,
  MaxFileSec=1day nel drop-in 99-calcio-retention.conf. Proprietario conferma
  active e valori corretti. Vacuum: 0B liberati; spazio finale 261.3M.
  Non ripetere applicazione/pulizia. Limite per file ruotati, intero journal VPS.
- rsyslog active, ForwardToSyslog=yes; logrotate configurato weekly/rotate 4,
  archivi compressi più corrente. Esecuzione rotazioni e backup ancora da verificare.
  Bozza privacy allineata anche alla correzione ASC già confermata il 27 ottobre.
- Backup OVH verificato da schermate proprietario il 28 ottobre: Standard
  attivo, snapshot disattivato; VPS a Gravelines (Francia). Esecuzione giornaliera
  alle 19:04 UTC; tabella mostra una copia del 27 ottobre 2026 19:04.
  Il testo "Non sono presenti punti di ripristino" contrasta con la riga visibile:
  nessun ripristino effettuato o disponibilità collaudata.
- Documentazione OVH Standard: copia giornaliera conservata 24 ore;
  sette giorni riguardano Premium, non il piano attivo.
  Fonte: https://www.ovhcloud.com/it/vps/vps-backup/
  OVH dichiara replica su tre server nello stesso datacenter. Non è ispezione
  delle copie fisiche. Il vecchio log può essere nella copia del 27 ottobre:
  scadenza documentata non è prova di eliminazione già avvenuta.
  Backup mantenuto attivo, nessun upgrade/cancellazione/ripristino.
- D1 calcio_users: screenshot del 28 ottobre conferma Time Travel di 7 giorni.
  Nessun ripristino/bookmark richiesto o eseguito; non ripetere la verifica.
  Bozza privacy aggiornata con evidenze D1 e OVH, limiti e cautele al ripristino.
- Dump 23 ottobre: proprietario conferma di aver seguito soltanto le istruzioni
  e lasciato il file sul PC, senza creare altre copie. Non richiedere di nuovo
  dove lo ha copiato. Nessuna cancellazione eseguita; conservato per ora come
  copia precedente alla migrazione, non ripristinabile automaticamente sul live.
  Termine/procedura di smaltimento ancora da finalizzare.
- Controllo operativo Invocation logs CHIUSO il 28 ottobre: Observability
  Last 1 hour senza eventi; Metrics successiva Last 1 hour mostra 93 invocazioni,
  0 errori runtime, versione a4e384d4 al 100%. Finestre mobili sovrapposte,
  non identiche. Coerente con disattivazione già confermata; non prova assenza
  di ogni log dei fornitori o successo HTTP di tutte le richieste.
  Non richiedere altre schermate per ripetere questo controllo.
  Preservare invocation_logs=false nelle configurazioni dei futuri deploy.
- Prossimo passo: finalizzare conservazione registri e dump manuale,
  base analisi e fornitori nella privacy. Pubblicare pagine completate,
  nuova build con icona/manifest verificati, screenshot reali e consegna Apple.
- Supporto e policy ancora non pubblicati; App Review non inviata.
  Apple Production ancora disabilitato: autorizzazione non equivale ad
  attivazione eseguita. Non ripetere test accettati o riaprire Core V2.
- Questo blocco supera lo STOP e la mancanza di autorizzazione del checkpoint
  del 27 ottobre; le evidenze tecniche sottostanti restano valide.

## Checkpoint privacy — 27 ottobre 2026, pomeriggio

- Proprietario conferma casella support@calcioreport.com operativa e accessibile.
- App Store Connect: salvate quattro categorie preliminari (email, ID utente,
  acquisti, interazione prodotto); email/ID Funzionalità + Analisi,
  acquisti Funzionalità, interazione Analisi,
  dati collegati all'utente, nessun tracking. NON pubblicate; verifica incompleta.
- docs/privacy-policy-draft.md contiene bozza concreta e punti da completare;
  non è informativa pubblicabile. support.html già preparata, non pubblicata.
- Restano conservazione/log effettivi, assistenza, ricerche e fornitori; base
  giuridica analisi da definire con conseguenze tecniche, non confondere con
  finalità selezionate nell'etichetta Apple.
- Cloudflare Production: screenshot conferma Logs e persistenza attivi,
  campionamento 100%, Traces/Issues spenti, nessuna esportazione. Piano Free:
  retention Workers Logs attuale 3 giorni (documentazione Cloudflare).
- Un evento web /telemetry/ping conteneva IP, geolocalizzazione da IP, user-agent
  e tempi CPU/wall; Authorization mascherata. Non copiare il JSON con dati
  personali nel repo. Non è una prova specifica del client nativo.
- Proprietario conferma disattivazione Include Invocation logs il 27 ottobre;
  Logs/persistenza restano attivi. Verifica post-modifica ancora da fare.
  Nei prossimi deploy preservare observability.logs.invocation_logs=false
  anche nella configurazione Wrangler locale: --keep-vars non garantisce
  preservazione delle impostazioni Observability. Nessun file locale PC
  modificato da questa sessione.
- OVH: Caddyfile importa /etc/caddy/sites/*.caddy. Il proprietario ha
  autorizzato rimozione del solo blocco access log in calcio-report.caddy.
  Confermati backup /root/caddy-backup-379ys6d6/calcio-report.caddy,
  validazione, reload e servizio attivo. Non ripetere questa operazione.
- Vecchi file /var/log/caddy/calcio-report-relay*.log* NON cancellati:
  definire smaltimento; senza nuove rotazioni non presumere scadenza automatica.
  Log operativi/journal e altri servizi non ancora caratterizzati.
  Esempio relay/deploy/Caddyfile.example allineato senza access log.
- Supporto: proprietario conferma Cloudflare Email Routing con inoltro a
  casella Libero personale. Non pubblicare l'indirizzo personale nel repo/policy.
  Approvati 12 mesi dalla chiusura della richiesta, salvo contestazioni/obblighi
  specifici, con pulizia manuale periodica; nessun automatismo configurato
  né eliminazione di email eseguita. Bozza aggiornata.
- Verifica sorgente: handleTelemetryPing sovrascrive last_seen_at dell'utente
  tramite email; non conserva ogni ping. ID usato per deduplica community.
  Proprietario conferma correzione ASC completata: Analisi aggiunta a email
  e ID utente, mantenendo Funzionalità, collegamento Sì e tracking No.
- Nel bundle live apple-readiness e nei percorsi ricerca esaminati non risultano
  scritture a trial_search_log/trial_usage: riferimenti solo alla cancellazione.
  Non equivale ad assenza di cache/log dei fornitori o dati storici.
- Schema acquisti: cancellazione users ritira il token Apple, non cancella
  ledger/eventi PRO. Registri pseudonimi conservati per anti-riutilizzo;
  durata e procedura di conservazione da definire, non dichiarare anonimizzazione.
- Dipendenze iOS censite da lockfile; manifest del binario finale da verificare.
- Riparato asset icona troncato nel precedente trasferimento (blob 66749f8,
  786444 byte). Rigenerato solo formato RGB 1024 dal medesimo originale
  approvato, PNG verificato; 1201283 byte, blob d202a44f4032f7aa48bb8eb773ca4d84c8b3e687.
  Installer controlla SHA256 per bloccare file incompleti; installazione locale
  riuscita e PNG troncato rifiutato. Nessuna nuova build Xcode o upload.
- Nessun deploy Worker/merge/upload/review; solo reload Caddy autorizzato.
  Build con nuova icona ancora da eseguire.


_Aggiornato: 2026-10-26 (login review sul sito pubblico confermato)._
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
  Verifier Production ora predisposto e ID Stripe Payment Link acquisito;
  vedere checkpoint aggiornati sotto.
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
  ID Stripe live fornito dal proprietario tramite URL dashboard:
  `plink_1T6a4ZLCMe9gtpTW2ticsWmF`, inserito nel manifest (`4b81ffd`).
  Screenshot link attivo Calcio Report PRO: prezzo web 4,99 EUR, distinto da Apple 9,99 EUR.
  Checker offline eseguito sul manifest ora completo: exit 0, metadati coerenti.
  Nessuna suite già accettata ripetuta; nessuna verifica API Stripe effettuata.
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
- ID Payment Link Stripe acquisito e manifest completo (vedi sopra).
  Prossimo blocco: completare configurazione/cutover Worker e piano migrazione D1,
  verificando coerenza importo web 499 centesimi, associazione account e gestione
  pagamenti/coupon pre-cutover. Migrazione e deploy Worker non autorizzati né eseguiti.

## Ripresa 24 ottobre — candidato Stripe e sospensione PRO

- PR #16 verificata: open, draft, non merged, mergeable=true. Nessun merge.
- Piano docs/production-cutover.md aggiornato con destinazioni confermate,
  matrice Worker, riconciliazione pre-cutover e rollout/drenaggio ancora da completare.
- Stripe conserva associazione tramite email checkout; nessun client_reference_id.
  Account assente/ricreato dopo checkout: 200 senza accredito; riconciliare i casi
  anomali, non creare automaticamente account.
- Nuovo controllo Production (f46ec5e): currency eur e amount_total numerico 499
  prima di qualsiasi accesso DB. Altri importi richiedono riconciliazione; webhook
  risponde 503 generico, non successo. Prezzo Apple 999 distinto. Sandbox invariato.
  Non cambia il fingerprint delle operazioni esistenti.
- Nuovi test prezzo (49e9721): 20 pass, inclusi 15 sottocasi monetari; verificato
  blocco prima della persistenza, accettazione EUR499 fino al confine DB simulato,
  unpaid/asincrono, link/ambiente/cutover e compatibilità Sandbox.
  Non è collaudo di accredito reale o persistenza D1.
- Guardia PRO_WRITES_PAUSED candidata (0f4ca17, collegata al ramo Production
  01fc96a): 503 su Stripe/redeem/admin grant-adjust-mint e delete/disable;
  login, dashboard in lettura, football e review isolata restano disponibili.
  Cinque nuovi test passati (d4172cd), inclusa integrazione del router review
  con handler simulati. Il flag non è stato configurato sul live.
- Piano aggiornato b2c02cb: prima dello schema serve deploy autorizzato del
  candidato in pausa, ledger=0, Apple=0, completamento rollout e drenaggio
  verificabile dei writer legacy; la guardia non annulla richieste già in corso.
  Schema/migrazione/Worker live/backup invariati. Nessuna suite accettata ripetuta.
- Proprietario 24 ottobre: nessun codice sconto; screenshot conferma promozioni No.
  Conversione non attestata, ma documentazione Stripe chiarisce Adaptive Pricing
  nei Payment Links: webhook mantiene valuta/importo originali, presentment_details
  separato. Corretto il precedente assunto che EUR499 escludesse ogni conversione.
  Nuovo test mirato a7dbc18 passato; nessuna suite precedente ripetuta.
- Bundle completo costruito con script versionato ed esbuild 0.28.2 dal commit
  runtime b356307: 105160 byte, SHA256 in docs/production-cutover.md.
  Smoke bundle passato: pausa Stripe 503 e gate Apple 0 503 senza accessi DB/rete.
  Non equivale a deploy/dry-run Wrangler/verifica binding. PR16 non integrata.
- Screenshot Stripe: imposte automatiche Sì; conferma ancora su vecchio GitHub
  Pages /calcio_report/?stripe=success, da verificare prima della release.
- Proprietario conferma nessun acquisto, app non ancora promossa/distribuita.
  Screenshot 24 ottobre: sola creazione link, ultimi tre mesi volume 0 EUR,
  sessioni 0 e nessuna attività. Nessun pagamento emerso da riconciliare.
  Non è elenco esaustivo di ogni sessione, ma non richiedere ancora gli stessi
  screenshot/conteggi. Conservare controlli pre-cutover e utenti/PRO test.
- Predisposte variabili della prima fase in deploy/apple-worker-maintenance-vars.json
  (e623951): overlay additivo, pause=1, registro=0, Apple=0, mai sostituzione
  dell'intera configurazione. Nessuna applicazione sul live.
- Preparato scripts/manual/export-live-worker.ps1 (f09b073): copia locale del
  Worker distribuito/configurazione e riepilogo senza valori delle variabili.
  Wrangler 4.152.0 --delegate-c3=false esaminato localmente: download-only,
  niente wizard C3/deploy. Script non ancora eseguito dal proprietario.
- Download live completato dal proprietario 24 ottobre: Worker calcio-report-proxy,
  compatibility_date 2026-02-10, nessun compatibility flag (riepilogo [null]).
  Variabili: ACCOUNT_DELETION_ENABLED, AUTH_PASSWORD_V2, CR_RELAY_URL.
  Binding unico DB -> 45681187-3565-4d36-8627-131c18ff1885; 1 modulo scaricato.
  Copia locale C:\\Users\\stefa\\calcio-report-worker-copy-20261024-101546\\calcio-report-proxy.
  Chiavi config includono routes, workers_dev, preview_urls, observability;
  valori conservati localmente, non pubblicati. Non ripetere questo download.
- Preparatore offline scripts/prepare-worker-maintenance.mjs (b4a2efc):
  clona configurazione scaricata, conserva route/vars/binding/runtime,
  aggiunge solo overlay di manutenzione e seleziona bundle verificato SHA256.
  Rifiuta identità/DB/nomi variabili/flag o chiavi inattesi; non modifica la copia.
  keep_vars=true, no_bundle=true, nessun cutover impostato o review abilitata.
- Quattro nuovi test preparatore passati (8dd4500).
  Wrangler 4.152.0 deploy --dry-run eseguito localmente sul bundle e configurazione
  sintetica coerente con inventario: exit 0, 102.70 KiB, gzip 23.73 KiB.
  Non è verifica della configurazione reale sul PC, né deploy né accesso D1.
- Script PC scripts/manual/prepare-worker-maintenance.ps1 (95b1d20) predisposto:
  scarica solo 12 moduli pertinenti e 2 script dal commit 8dd4500, installa
  esbuild 0.28.2 in cartella isolata, compila e controlla hash, prepara config dalla
  copia live ed esegue esclusivamente dry-run. Log/config restano sul PC.
  Wrapper PowerShell non eseguito qui (pwsh assente); helper Node e dry-run
  Linux verificati. Prossimo passo: esecuzione sul PC, non nuova esportazione.
- Residui: esito dry-run con impostazioni reali, poi proposta concreta di deploy
  della sola manutenzione e modalità rollout/drenaggio. Migrazione e deploy
  restano non autorizzati. Backup D1 già completato, non ripeterlo.
  Non chiedere di nuovo backup, ID, HTTPS, grant TEST o acquisto TestFlight.
- Telegram resta da configurare prima della pubblicazione.

## Candidato pronto per autorizzazione manutenzione — 24 ottobre

- Proprietario ha eseguito prepare-worker-maintenance.ps1: tutte e quattro le
  fasi riuscite, incluso dry-run Wrangler con configurazione realmente scaricata.
- Directory PC: C:\Users\stefa\calcio-report-maintenance-candidate-20261024-103247.
  Sorgenti: 8dd45006cdd3e447d4d1dc2c4943cf7d563f9296.
  SHA256 bundle: ed9d15719b2a0e9b4291fa1c0a8fd4f8c9f88cac4b8e67ea2c934054c187871c.
  compatibility_date conservata: 2026-02-10.
- Config candidata wrangler.maintenance.json: pausa=1, registro=0, Apple=0.
  Configurazione live invariata; nessun deploy o migrazione D1.
  Wrapper PowerShell ora eseguito con successo sul PC; chiuso il relativo pending.
  Non ripetere build, export o dry-run senza cambiamenti pertinenti.
- Prossima azione subordinata a consenso esplicito: deploy SOLO del candidato
  di manutenzione sul Worker calcio-report-proxy. Effetto previsto: sospensione
  temporanea accrediti Stripe/redeem/admin, emissione coupon e delete/disable;
  login/consultazione disponibili. Apple e registro restano disabilitati.
  Nessuna migrazione, merge o invio App Review inclusi in questa autorizzazione.
  Dopo deploy verificare versione/pausa e completamento rollout prima dello schema.

## Autorizzazione ricevuta — 24 ottobre

Il proprietario autorizza il SOLO deploy di manutenzione precedentemente proposto
("Se tutto questo è necessario per procedere fai quello che devi fare").
Usare il candidato già verificato nella directory PC terminante 20261024-103247,
pause=1, registro=0, Apple=0. Non richiedere nuovamente questo consenso.
Comando di deploy da eseguire sul PC autenticato; esito ancora pendente.
Nessuna migrazione D1, apertura gate Apple, merge o App Review inclusi.
Dopo l'esito verificare versione distribuita e pausa, senza ripetere i test chiusi.

## Deploy manutenzione completato — 24 ottobre

- Proprietario conferma upload e deploy triggers riusciti tramite npx.cmd
  wrangler@4.152.0 deploy --config wrangler.maintenance.json --keep-vars.
  npx.ps1 era stato bloccato da ExecutionPolicy PRIMA di avviare il deploy;
  risolto usando npx.cmd senza modificare policy di sistema.
- Version ID: 1bf92e06-81d2-45f7-aac9-387a60266449.
  Custom domain api.calcioreport.com, production enabled, previews disabled.
  Bundle 102.70 KiB / gzip 23.73 KiB.
- Output conferma DB live corretto, tre variabili preesistenti conservate,
  APPLE_PRODUCTION_ENABLED=0, PRO_LEDGER_ENABLED=0, PRO_WRITES_PAUSED=1,
  ambiente Production e verifier dedicato. Nessuna migrazione D1 eseguita.
- NON ripetere il deploy o chiedere nuovamente il relativo consenso.
  Prossimo passo: controllo HTTP pubblico non autenticato di pausa/gate.
  Questo controllo non prova da solo drenaggio delle richieste già in corso.
  Migrazione D1, apertura Apple, merge e App Review restano non autorizzati.

## Verifica pubblica manutenzione — 24 ottobre, 14:25 Europe/Rome

- Output curl del proprietario: POST /stripe/webhook non autenticato -> HTTP 503
  PRO_MAINTENANCE, Retry-After 60, no-store (12:25:32 UTC).
  GET /apple/token -> HTTP 503 APPLE_PURCHASES_DISABLED (12:25:33 UTC).
- Pausa e gate verificati sul dominio api.calcioreport.com. Controllo chiuso;
  non ripetere queste richieste senza regressione pertinente.
- Prossimo controllo read-only: deployments list del Worker per verificare
  assegnazione del traffico alla versione 1bf92e06-81d2-45f7-aac9-387a60266449.
  Due risposte HTTP non certificano da sole il completamento del rollout globale
  o il drenaggio di richieste legacy in corso.
- D1 ancora invariato; migrazione non autorizzata. Prima del consenso rendere
  disponibile lo schema candidato e la verifica post-migrazione.

## Distribuzione verificata e schema pronto — 24 ottobre

- deployments list fornito dal proprietario: deployment 2026-10-24T12:24:17.455Z,
  versione 1bf92e06-81d2-45f7-aac9-387a60266449 al 100%.
  Versione precedente c59345ba-bd17-44d9-93dc-50407c5d94fd.
  Nessuna distribuzione percentuale concorrente indicata. Controllo chiuso.
  L'elenco attesta assegnazione traffico, non misura richieste già in corso.
- Generato lo schema usando lo script già collaudato, sorgenti fissate a 0109f336.
  Nessun test accettato ripetuto. File revisionabile deploy/production-initial.sql
  al commit 023403445853231bc88cf2ec3a673c0f4f26192d.
  SHA256: 045879b80e69a821d87e3d421bcdd87d29ac31ad039c075787d8e7fc610ff9ad.
- Schema additivo: cinque tabelle vuote, un indice e sei trigger. Nessun backfill
  o modifica iniziale di users/paid_until. Non è idempotente; stop su errore,
  niente rilancio alla cieca o drop.
- Prossima autorizzazione richiesta: applicazione di questo solo schema a
  calcio_users, UUID 45681187-3565-4d36-8627-131c18ff1885, con manutenzione
  attiva e registro/Apple disabilitati. D1 non ancora migrato.
  Non include cutover, abilitazione Apple, acquisti, merge o App Review.
  Backup del 23 ottobre già sul PC; nessuna nuova esportazione richiesta.

## Autorizzazione migrazione D1 — 24 ottobre

- Proprietario risponde "si procedi" alla proposta dello schema al commit
  023403445853231bc88cf2ec3a673c0f4f26192d: autorizzata applicazione di
  deploy/production-initial.sql SOLO a calcio_users
  (45681187-3565-4d36-8627-131c18ff1885).
- Consenso non include cutover/attivazione registro, apertura Apple, merge o review.
  Pausa PRO=1, registro=0, Apple=0 rimangono attivi come configurati.
- Esecuzione da PowerShell autenticata, con verifica hash SQL e binding DB.
  Comando fornito; esito ancora pendente. NON dichiarare lo schema applicato.
  Su errore fermarsi e diagnosticare; non ripetere automaticamente la migrazione.
  Non richiedere nuovamente questo consenso.

## Migrazione D1 applicata — 24 ottobre

- Proprietario conferma import remoto riuscito dello schema autorizzato su DB
  45681187-3565-4d36-8627-131c18ff1885: 12 query, 4.38 ms,
  8 righe lette / 25 scritte secondo contatori D1, dimensione 0.10 MB.
  I contatori non rappresentano automaticamente utenti modificati.
- Bookmark restituito:
  0000334f-00000007-0000510e-510019ba1cfe03f56e6dce4618634619.
- Migrazione conclusa: NON ripetere l'import. Pausa PRO rimane attiva;
  PRO_LEDGER_ENABLED=0 e APPLE_PRODUCTION_ENABLED=0 invariati.
- Prossimo passo: unica verifica read-only post-migrazione di strutture,
  registri vuoti e aggregati users/scadenze; esito ancora pendente.
  La verifica precedente dello schema assente non viene ripetuta: è verifica
  del nuovo stato conseguente all'import autorizzato.
- Attivazione registro/cutover, apertura Apple, merge e review non autorizzati.

## Verifica post-migrazione CHIUSA — 24 ottobre

- Elenco sqlite_master fornito dal proprietario conferma tutte le cinque nuove
  tabelle, indice e sei trigger. Primo comando multilinea ha mostrato solo schema;
  completati i conteggi con unica SELECT su una riga (nessuna nuova migrazione).
- Registri tutti vuoti: token_apple=0, acquisti_apple=0, account_registro=0,
  eventi_pro=0, operazioni_pro=0.
- Aggregati users coincidono col checkpoint precedente: 23 utenti, 1 disabilitato,
  6 paid_until positivi; min 1774800857114, max 1796750470265.
  È confronto aggregato, non confronto individuale del dump.
- Migrazione e verifica concluse; non rieseguire import o controlli già chiusi.
- Prossimo passo: preparare SOLO configurazione locale wrangler.pro-ledger.json
  dalla maintenance, con PRO_LEDGER_ENABLED=1, PRO_WRITES_PAUSED=0,
  PRO_LEDGER_CUTOVER_MS fissato una volta e APPLE_PRODUCTION_ENABLED=0.
  Non modificare bundle/binding/segreti. Non distribuire prima del consenso
  esplicito al cutover. Vecchi coupon richiedono riemissione v2 come già documentato.
  Nessun acquisto pregresso da riconciliare secondo il proprietario.
- Produzione attuale ancora in manutenzione, registro=0, Apple=0.

## Configurazione cutover preparata sul PC — 24 ottobre

- Proprietario conferma creazione locale wrangler.pro-ledger.json nella directory
  candidata già verificata. PRO_LEDGER_CUTOVER_MS=1792845158779 fissato:
  non rigenerare o abbassare questo valore per tentare di accreditare vecchi checkout.
- Config candidata: registro=1, pausa=0, Apple=0. Nessun deploy eseguito.
- Prossima autorizzazione: deploy di questo file per riaprire accrediti web,
  admin e redeem attraverso il registro, con bundle/binding invariati.
  Coupon legacy da riemettere v2; eventuali checkout pre-cutover richiedono
  riconciliazione. Apple resta disabilitato; nessun merge o App Review incluso.
- Stato live resta manutenzione, registro=0, Apple=0 finché non arriva esito deploy.

## Autorizzazione attivazione registro PRO — 24 ottobre

- Proprietario risponde "si andiamo avanti" alla proposta concreta di deploy
  wrangler.pro-ledger.json: autorizzata attivazione PRO_LEDGER_ENABLED=1 e
  rimozione pausa PRO_WRITES_PAUSED=0, con cutover fisso 1792845158779.
- APPLE_PRODUCTION_ENABLED resta 0. Nessun consenso a merge o App Review.
  Non richiedere nuovamente questa autorizzazione.
- Comando di deploy da eseguire sul PC nella directory candidata già verificata.
  Esito ancora pendente: non dichiarare attivazione effettuata prima dell'output.
  Nessuna nuova migrazione o rigenerazione cutover necessaria.

## Registro PRO attivato — 24 ottobre

- Proprietario conferma deploy autorizzato riuscito con wrangler.pro-ledger.json,
  versione b9021019-3b86-4b16-954c-93315a84f3cf.
  Custom domain api.calcioreport.com, production enabled, previews disabled.
- Output conferma DB live corretto, PRO_LEDGER_ENABLED=1, PRO_WRITES_PAUSED=0,
  PRO_LEDGER_CUTOVER_MS=1792845158779 invariato, APPLE_PRODUCTION_ENABLED=0.
  Variabili live preesistenti conservate; bundle invariato 102.70 KiB.
- Non ripetere deploy o richiedere nuovamente consenso al cutover.
  Verifica HTTP successiva ancora pendente: richiesta Stripe senza firma deve
  essere respinta (400 Invalid signature), non più PRO_MAINTENANCE.
  Nessun acquisto/accredito reale eseguito o dichiarato collaudato da questo output.
- Da questo punto preservare ogni nuova scrittura nel registro: nessun ritorno
  automatico al writer legacy o ripristino del vecchio dump D1.
- Restano percorso firmato/verifier Production, isolamento review sul pubblico,
  casi di accettazione ancora aperti e gate Apple sorgente/flag chiusi.
  Nessuna autorizzazione ad abilitare Apple, fare merge o inviare App Review.

## Webhook dopo cutover verificato — 24 ottobre, 14:36 Europe/Rome

- Proprietario conferma POST pubblico /stripe/webhook senza firma -> HTTP 400
  Invalid signature alle 12:36:08 UTC. Manutenzione rimossa e controllo firma
  raggiunto. Nessun pagamento/accredito eseguito; non è collaudo Stripe reale.
- Questo controllo è chiuso, non ripeterlo. Schema e registro Production attivi
  come documentato; Apple rimane disabilitato.
- Prossimo blocco: verifier Production con richiesta HMAC firmata e corpo {}
  (atteso 400 BAD_INPUT dopo autenticazione). Usare segreto già su OVH senza
  stamparlo. Non coinvolge API Apple o D1; non prova ancora Worker->verifier.
  Trasferimento protetto del segreto al Worker e isolamento review restano aperti.
  Non riaprire provisioning/TLS o test anonimi già superati.

## Verifier Production: richiesta firmata accettata — 24 ottobre

- Proprietario conferma esito atteso del comando OVH: HTTP 400 BAD_INPUT
  su /v1/transaction con HMAC corretto e corpo {} attraverso HTTPS pubblico.
  Segreto letto localmente da service.env, mai stampato.
- Verificato passaggio autenticazione HMAC e rifiuto payload incompleto.
  Nessuna chiamata API Apple o scrittura D1. Non prova ancora Worker->verifier
  né autorizzazione delle credenziali alle API Apple Production.
  Controllo chiuso: non ripeterlo.
- Prossimo passo: predisporre sul server file temporaneo HMAC mode 0600,
  proprietario ubuntu, per trasferimento SSH al PC e successiva configurazione
  protetta APPLE_VERIFIER_SECRET sul Worker. Nessun valore in Git/chat/log.
  File non ancora creato; secret Worker non ancora configurato.
  Apple rimane disabilitato. Eliminare copie temporanee dopo trasferimento.

## Segreto Worker Production configurato — 24 ottobre

- Proprietario ha trasferito il file HMAC temporaneo tramite SCP usando la chiave
  SSH calcio_report_ovh, in cartella Windows con ACL limitata al proprio utente.
  Primo tentativo senza -i fallito (publickey); secondo trasferimento e formato riusciti.
- Eseguito consapevolmente wrangler 4.152.0 secret put APPLE_VERIFIER_SECRET
  con wrangler.pro-ledger.json: output Success! Uploaded secret.
  Deployment Secret Change confermato dal proprietario: 2026-10-24T12:44:25.655Z,
  versione b2d20f2b-9f9a-4294-b042-705888e93cf4 al 100%.
  b9021019 è la versione precedente. Nessun valore segreto esposto.
- Proprietario conferma eliminazione delle copie temporanee sul PC e su OVH.
  Configurazione persistente del servizio conservata. Apple resta disabilitato.
- Identificazione deployment conclusa, non ripeterla. Codice Apple ispezionato:
  gate flag e sorgente precedono la chiamata al verifier, quindi una richiesta
  pubblica a gate chiuso non collauda Worker->verifier. Nessun gate rimosso.
  getNotificationHistory Production eseguito: HTTP 401, nessun codice Apple numerico.
  Orologio OVH sincronizzato NTP (2026-10-24 12:48:29 UTC).
  Confronto locale: KEY_ID, ISSUER_ID e byte chiave privata coincidono col Sandbox;
  formato Key ID OK. Non emerge errore di copia; causa del 401 non determinata.
  Non dichiarare credenziali Production accettate o attribuire con certezza il 401
  all'app non pubblicata. Non rigenerare chiavi o ripetere richieste senza nuovo motivo.
  Worker->verifier e isolamento review sul pubblico restano da completare.
  Prossimo passo: preparare config locale review con binding dedicato e flag 0,
  senza deploy. Email riservata e due segreti review ancora da configurare.

## Candidato isolamento review sul PC — 24 ottobre

- Proprietario conferma creazione locale wrangler.app-review-preparation.json
  dalla config pro-ledger: aggiunto APP_REVIEW_DB con UUID review già noto,
  account ID riservato e URL verifier Sandbox; APP_REVIEW_ENABLED=0, Apple=0.
- Query SELECT mirata al solo account review sul DB review eseguita con Wrangler:
  email acquisita e salvata nel candidato locale, senza mostrarla in chat.
  Nessuna scrittura D1 o deploy. Account esistente non ricreato.
- Proprietario conferma export temporaneo HMAC Sandbox mode 0600 su OVH,
  trasferimento SCP con chiave esplicita e preparazione di review-secrets.json
  in nuova cartella Windows con ACL riservata. HMAC grezzo locale eliminato.
  Nuovo APP_REVIEW_LICENSE_SECRET casuale 32 byte per il percorso pubblico;
  APP_REVIEW_VERIFIER_SECRET copiato dal Sandbox. Nessun valore esposto.
  Credenziali del Worker review esistente non ruotate.
- Variabili PowerShell: calcioReviewSecretsDir e calcioReviewSecretsFile.
  Copia temporanea OVH .calcio-report-apple-review-hmac ancora da eliminare,
  insieme al JSON locale dopo installazione riuscita.
- Proprietario conferma wrangler.app-review.json creato e dry-run superato.
  Hash bundle invariato ed9d15719b2a0e9b4291fa1c0a8fd4f8c9f88cac4b8e67ea2c934054c187871c;
  binding live/review verificati contro UUID noti. Candidato review=1, Apple=0,
  registro PRO=1, pausa=0. Nessun upload o deploy eseguito.
- Proposta pronta per consenso: singolo deploy con wrangler.app-review.json,
  --keep-vars e --secrets-file del JSON protetto per aggiungere due segreti review
  e binding review insieme. Nessuna migrazione, apertura Apple Production, merge
  o invio App Review inclusi. Non ripetere dry-run/build o test accettati.
  Consenso ricevuto dal proprietario: "autorizzo tutto quello che serve".
  Procedere al deploy review proposto, senza richiedere nuovamente consenso.
  Non interpretare il consenso come evidenza tecnica per aprire Apple Production
  con API ancora 401. Nessun esito deploy review ancora ricevuto.

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
6. **Telegram — rinviato dal proprietario il 26 ottobre:** nessun gruppo/canale
   necessario per il rilascio. Preparare pulsante “Community · In arrivo” con
   conteggio univoco degli account interessati, visibile soltanto in admin.

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

**PUNTO DI RIPRESA — 24 ottobre, deploy review COMPLETATO:**
Il proprietario conferma Current Version ID
143ec334-8f10-4afa-a2dd-e663fb2b5002 sul Worker calcio-report-proxy,
tramite wrangler.app-review.json --keep-vars --secrets-file.
APP_REVIEW_ENABLED=1, binding DB live e APP_REVIEW_DB distinti, due segreti review
installati insieme al deploy; APPLE_PRODUCTION_ENABLED=0, PRO_LEDGER_ENABLED=1,
PRO_WRITES_PAUSED=0, cutover invariato 1792845158779.
Proprietario conferma PULIZIA COMPLETATA: JSON temporaneo PC e file HMAC OVH
eliminati. Non richiedere trasferimenti o rigenerazione dei segreti già installati.
Non ripetere il deploy. Questo esito NON è collaudo funzionale del login review
sul dominio pubblico né del percorso Worker->verifier.

Prossimo blocco: verifica mirata login/account review sul Worker pubblico e
isolamento dal live, senza ripetere acquisti Sandbox/TestFlight o test chiusi.
API Apple Production getNotificationHistory ha restituito HTTP 401:
NTP sincronizzato, KEY_ID/ISSUER_ID/chiave privata identici al Sandbox,
causa non determinata; non dichiarare accesso Production riuscito né imputare
con certezza il 401 all'app non pubblicata. Non rigenerare chiavi alla cieca.
Restano Worker->verifier Production, accettazioni residue realmente scoperte,
build finale, metadati e invio App Review, link Telegram prima della pubblicazione.
Autorizzazione operativa del proprietario già ricevuta: "autorizzo tutto quello
che serve". Non ripetere consensi già concessi; non aprire gate senza requisiti
tecnici risolti. Nessun merge o invio App Review eseguito; PR15/16 non merged.
Main invariato. Non rileggere archivi/core-v2/allegati obsoleti o ripetere backup,
migrazione D1, cutover PRO e test accettati.

## Login review sul sito pubblico confermato — 26 ottobre

- Proprietario conferma accesso con account review su app.calcioreport.com:
  badge PRO, 25 giorni rimasti; aperte alcune schede con funzionamento regolare.
- Accettazione manuale del login e delle schede provate conclusa; non ripeterla
  senza regressione. Non è prova indipendente del database usato o del verifier.
- Prossimo passo: controllo mirato instradamento della sessione review sul Worker
  pubblico e rifiuto della stessa firma nel contesto live, senza acquisti,
  cancellazioni o modifiche alle scadenze. Apple Production resta disabilitato.
- Credenziali recuperate dal documento privato Calcio_Report_Credenziali_Review.md;
  nessuna credenziale riportata nel repository. Nessun deploy o merge eseguito.

## Correzione diagnostica isolamento — 26 ottobre

- Script manuale ha riportato review ACCETTATA e isolamento live NON SUPERATO,
  ma controllava solo lo status HTTP. Ispezione handleMe in worker/worker.js:
  una sessione non valida restituisce HTTP 200 con {ok:false}. Il risultato
  NON dimostra accesso al DB live né un difetto di isolamento.
- Serve verificare il corpo JSON: token review con prefisso -> ok:true;
  stesso token senza prefisso -> ok:false nel percorso Production. Nessun
  cambiamento runtime o deploy necessario; login UI già accettato resta chiuso.

## Isolamento sessione review verificato — 26 ottobre

- Proprietario conferma dal controllo corretto sul Worker pubblico:
  "ISOLAMENTO OK: review accettata, percorso live rifiutato".
- /auth/me con token cr-review restituisce ok:true; lo stesso token senza
  prefisso, instradato al contesto Production, restituisce ok:false.
  Chiusa questa accettazione del confine di autenticazione; non equivale a
  un audit completo DB o al collaudo Worker->verifier Production.
- Nessun acquisto, modifica scadenze, deploy o merge in questo blocco.
  Prossimo blocco: diagnosi motivata del 401 API Apple Production;
  non ripetere login/isolamento né rigenerare chiavi senza causa individuata.

## Diagnostica credenziali Production offline — 26 ottobre

- Screenshot App Store Connect: chiave Calcio Report acquisti attiva nella
  sezione Acquisti in-app. Proprietario conferma KEY_ID e ISSUER_ID del file
  env Production coincidenti con la pagina Apple; valori non riportati qui.
- Intercettato offline il JWT generato dalla libreria installata sul server:
  ambiente Production, algoritmo/identificativi, bundle/audience, validità
  temporale e firma crittografica locale tutti OK secondo output del proprietario.
  Nessuna richiesta Apple, modifica servizi o chiavi durante questa verifica.
  La verifica locale della firma non prova che Apple riconosca la chiave.
- Prossimo controllo mirato: storia notifiche Production con diagnostica sicura
  della risposta; solo se 401 confronto Sandbox usando esattamente lo stesso
  JWT. Nuova motivazione: isolare il rifiuto per ambiente, non ripetere
  acquisti o accettazioni notifiche storiche. Nessun retry automatico.
  Causa 401 ancora aperta; gate Apple Production chiuso.

## Confronto autenticazione Apple e vincolo primo rilascio — 26 ottobre

- Proprietario conferma nuova diagnostica: Production HTTP 401 senza codice
  Apple; Sandbox HTTP 200 usando esattamente lo stesso JWT e la stessa
  richiesta di storia notifiche. Nessun acquisto o scrittura account.
  La chiave è accettata da Apple Sandbox: non rigenerarla né ripetere la
  diagnostica JWT/identificativi già conclusa senza nuovi elementi.
- Trovato chiarimento di alexanderjordanbaker, Collaborator nel repository
  ufficiale Apple (4 maggio 2024): senza un primo rilascio Production dell'app
  non è consentito usare le API Production.
  Fonte: https://github.com/apple/app-store-server-library-java/issues/92
  Il requisito documentato è coerente col caso Calcio Report non ancora
  pubblicata e col confronto 401/200. È una spiegazione supportata del blocco,
  NON una nuova accettazione API Production né prova certa della causa interna.
- Superato il precedente vuoto di evidenze sull'ipotesi app non pubblicata:
  ora c'è una fonte primaria pertinente, con il limite temporale del 2024.
  Non dichiarare Production funzionante o sbloccare i gate sulla sola ipotesi.
- Pianificare separatamente build/review e attivazione al primo rilascio:
  il collaudo API Production non va preteso come prerequisito impossibile della
  prima submission. Mantenere review Sandbox isolata e gate Production chiuso
  finché non è definito un piano di attivazione coerente con il primo rilascio.
- Restano percorso Worker->verifier Production, gate sorgente/flag, accettazioni
  residue, build finale, Telegram e metadati/review. Nessun deploy/merge/invio.

## Preparazione IPA Production — 26 ottobre

- Esteso il workflow iOS signing check al profilo production sul branch release;
  backend pubblico, namespace Production già esistente, export App Store locale.
  Profili interni Sandbox/review mantenuti; numerazione nello stesso workflow.
- Production richiede selezione esplicita o commit di avvio esatto, guardie di
  repository/branch/evento; nessuno step Apple validation/upload viene eseguito.
  Export interno rimane internal-testing-only; candidata Production no.
- Verifica dell'IPA esportato tramite scripts/verify-ios-artifact.py:
  bundle, numero build, URL esatto nel JSON e assenza pagamenti web/header.
  Manifest Production separato e rifiutato dall'uploader interno esistente.
- Nove test Python mirati passati localmente; sintassi Bash e YAML verificate.
  Test con IPA sintetici: NON provano compilazione Xcode o firma reale.
- Commit di questo blocco avvia la compilazione firmata Production senza upload.
  Esito workflow ancora pendente; nessun IPA firmato dichiarato disponibile.
  Procedura e limiti in docs/app-store-candidate.md.
- Backend live, gate Apple, DB e main invariati. Restano Telegram/supporto,
  accettazioni residue e piano attivazione acquisti al primo rilascio.

## IPA Production 28.1 compilato e firmato — 26 ottobre

- Workflow iOS signing check run 40362687965 sul commit e66a0ffff13d47cb6508585d85e16c1d2bb953a0:
  job archive SUCCESS. Nove test Python e 152 test Node passati su runner macOS;
  packaging production, compilazione Xcode, codesign ed export completati.
- Verificatore dell'IPA esportato ha confermato backend Production, bundle/build
  attesi e link di pagamento web disabilitati. Build 28.1, profilo production.
- Artifact GitHub calcio-report-production-ipa-28-1, ID 12669196406,
  799675 byte, scadenza 2026-10-29T16:50:36Z (ZIP artifact, non hash IPA).
  Digest ZIP sha256:5763f5f3cf59f175067ef11f8e9b928dacdadc9018e08197558a28553a4679d4.
  Include IPA e manifest commit/versione/build/hash. Non confondere la
  conservazione su GitHub con un caricamento su App Store Connect.
- Step Apple validation/upload SKIPPED. Nessun nuovo TestFlight/App Review,
  merge, deploy backend o modifica DB. Gate Apple Production invariato e chiuso.
- PR15 aggiornata allo stato corrente; PR15/16 rimangono draft, open, non merged.
- Prossimo passo: acquisire URL Telegram definitivo, richiesto dal proprietario,
  e completare i contatti mobili. Il packaging attuale azzera telegramUrl e
  supportEmail: correggere il solo percorso contatti senza introdurre pagamenti
  esterni in iOS. Supporto web già configurato support@calcioreport.com.
  La 28.1 prova la procedura di firma Production, non è ancora la build finale
  completa di contatti da caricare. Non rifare acquisti o controlli accettati.

## Community in arrivo e contatore — 26 ottobre

- Proprietario rinvia Telegram e autorizza pulsante in preparazione + contatore
  account unici. Non è requisito di rilascio aprire un gruppo o fornire un URL.
- Implementati UI con messaggio reale dopo conferma server, POST autenticato
  /community/interest, aggregato admin e scheda Community · interessati.
  Deduplica per account, review/Sandbox esclusi, disabilitati esclusi dal totale;
  FK cascade elimina la preferenza alla cancellazione. Nessun dato email/IP.
- Nuovo schema additivo/ripetibile worker/schema/community-interest.sql,
  solo sul DB live già identificato. NON ancora applicato.
- Bundle pronto deploy/community-worker-candidate.mjs, 108055 byte,
  SHA256 cdf050b645fd3c2cdd1299800cba9c806292144ad707420dd5014c49f6c7ae8a. Non ancora distribuito.
  Config/binding/segreti/flag Apple e registro PRO da preservare invariati.
- 32 test mirati superati; SQLite reale e autenticazione firmata, concorrenza,
  cancellazione, admin, review e messaggi UI. Patch nativa e smoke bundle passati.
  Non sono nuove prove su iPhone o sul DB live.
- Main/GitHub Pages invariati; frontend candidato sul branch release.
  IPA 28.1 precedente al pulsante: ricompilare dopo l'attivazione backend.
  Dettagli e piano operativo in docs/community-interest.md.
- Prossimo passo manuale: creare SOLO tabella community_interest su calcio_users,
  UUID 45681187-3565-4d36-8627-131c18ff1885, con config locale review verificata.
  Poi distribuire il bundle preservando gate Apple=0 e configurazione corrente;
  verificare contatore con account live del proprietario, non con account review.
  Nessun esito remoto ricevuto: non dichiarare attivato o ripetere vecchie migrazioni.

## Tabella interesse community creata sul live — 26 ottobre

- Proprietario riporta Wrangler 4.152.0: eseguito 1 comando, 0.37 ms,
  su calcio_users (45681187-3565-4d36-8627-131c18ff1885).
  Confermata esecuzione della CREATE TABLE community_interest autorizzata.
  Non ripetere questa creazione o le precedenti migrazioni PRO/Apple.
- Prossimo passo: scaricare bundle dal commit 19692a568742dcf171478c1eb83377e2f3894575,
  verificarne hash cdf050b645fd3c2cdd1299800cba9c806292144ad707420dd5014c49f6c7ae8a,
  creare copia wrangler.community-interest.json dalla config locale review,
  cambiare solo main, verificare i due UUID e flag/cutover, dry-run e deploy
  --keep-vars. Nessuna nuova installazione o rotazione dei segreti.
- Realizzazione/attivazione contatore già autorizzata con "ok procedi";
  non richiedere nuovamente consenso. Non include apertura gate Apple,
  merge main o invio App Review. Deploy community ancora pendente.

## Backend community distribuito — 26 ottobre

- Proprietario conferma upload/deploy calcio-report-proxy su api.calcioreport.com,
  production enabled, previews disabled. Versione 618af24a-d0bf-4c30-8ef9-a9c87d318e53.
- Comando eseguito prevedeva verifica hash del bundle 19692a5, UUID live/review,
  Apple=0, review=1, ledger=1, pausa=0, cutover invariato e --keep-vars.
  Nessuna nuova installazione di segreti. Non ripetere deploy/schema.
- Tentativo HTTP da ambiente Work senza credenziali ha ricevuto Cloudflare
  403/error 1010: non prova la risposta dell'handler né una regressione dell'app.
  Non cambiare WAF/protezioni per questo esito dell'ambiente di esecuzione.
- Verifica funzionale interesse ancora pendente dal PC proprietario con account
  live normale (non review); due richieste devono confermare recorded:true senza
  duplicare il record. Quindi contatore aggregato e frontend/admin aggiornati.
- Frontend ancora solo nel branch release; main/Pages e IPA 28.1 non includono
  il nuovo pulsante. Preparare nuova candidata iOS dopo conferma funzionale.

## Conteggio community verificato sul live — 26 ottobre

- Proprietario conferma due POST autenticati: interesse confermato entrambe.
  Query remota su calcio_users mostra interessati=1. Registrazione e deduplica
  remota chiuse; non ripetere schema, deploy o questi clic di prova.
- Il singolo interesse è quello espresso dall'account usato dal proprietario.
  Non è un iscritto Telegram né un download o un acquisto.
- Preparata nuova compilazione Production con il pulsante Community · In arrivo;
  supportEmail mobile ora conserva support@calcioreport.com già configurato web,
  telegramUrl e link di pagamento web rimangono vuoti. Non è prova della casella.
- Questo commit avvia il workflow di firma senza upload Apple. Esito build
  ancora pendente; la 28.1 precedente non contiene il nuovo pulsante.
- Admin aggiornato nel branch release già al commit 19692a5; fornire copia locale
  al proprietario per visualizzare Community · interessati. Main/Pages invariati.

## Candidata iOS community 29.1 firmata — 26 ottobre

- Run 40372908094 SUCCESS, commit 047c45140d350b81c17a637dd843d02e9a3247d8.
  159 test Node e 9 Python passati; compilazione/firma/export Production riusciti.
  Verifica IPA: backend Production, bundle/build e link pagamento web corretti.
- Include pulsante Community Telegram · In arrivo e supportEmail web conservata.
  Backend 618af24a già distribuito; due POST proprietario -> un interessato.
- Artifact calcio-report-production-ipa-29-1, ID 12672364036, 800331 byte,
  scadenza 2026-10-29T17:56:56Z; digest ZIP
  sha256:6f2c004cb5d85f5805d565eb6c80b2d18396988b90140b63406b35199f14dd03.
  IPA e manifest conservati su GitHub. Step Apple validation/upload SKIPPED.
  Nessun nuovo TestFlight/App Review o modifica dei gate Apple.
- Prossimo passo: aprire copia locale admin.html del commit 19692a5 per vedere
  Community · interessati=1 con la consueta ADMIN_KEY, senza comunicarla in chat.
  Il contatore tramite API admin non è ancora stato confermato dal proprietario.
- Main/Pages invariati. Non riaprire migrazione, deploy community o deduplica.
  Restano piano attivazione Apple al primo rilascio, verifiche residue realmente
  necessarie, metadati/privacy e caricamento/review finale da autorizzare.

## Contatore admin live confermato — 26 ottobre

- Pagina admin locale inizialmente mostrava HTTP 403 FORBIDDEN su /admin/users.
  Elenco segreti del proprietario conferma ADMIN_KEY presente, insieme agli
  altri segreti attesi; nessun valore esposto o ruotato.
- GET /admin/stats con chiave inserita localmente in prompt protetto ha
  restituito al proprietario: "Accesso admin OK — interessati: 1".
  Autenticazione admin e aggregato community sul Worker pubblico verificati.
  Il 403 precedente non dimostra perdita del segreto o difetto del contatore.
- Ultimo passo UI: svuotare Admin Key nella pagina locale aggiornata, inserire
  la stessa chiave appena verificata e premere Carica Utenti. Visualizzazione
  della scheda ancora da confermare; nessuna nuova prova API necessaria.
- Nessun nuovo deploy/rotazione chiavi o modifica dati in questa verifica.

## Blocco community CHIUSO — 26 ottobre

- Proprietario conferma "si ok ora funziona" dopo aver reinserito nella pagina
  admin locale la chiave già verificata. Visualizzazione admin accettata.
- Chiusi: backend pubblico, registrazione interesse, deduplica remota (2 POST,
  1 account), API admin e pagina admin. Non ripetere test, schema o deploy.
- Frontend Community · In arrivo incluso nella candidata Production 29.1
  firmata (run 40372908094), non caricata su Apple. Main/Pages invariati.
- Riprendere la release App Store dai requisiti residui: piano di attivazione
  Production al primo rilascio, percorso Worker->verifier/gate sorgente e flag,
  accettazioni ancora scoperte, metadati/privacy e caricamento finale.
  Nessun nuovo consenso a merge, upload o App Review implicito nella conferma UI.

## Preparazione diagnostica Worker→verifier — 26 ottobre

- Aggiunto POST /admin/apple-readiness, protetto dalla consueta ADMIN_KEY,
  solo nel ramo pubblico Production e fuori dal percorso review.
- Firma condivisa col client transazioni: corpo {} su /v1/transaction,
  esito atteso 400 BAD_INPUT dopo autenticazione HMAC. Nessuna chiamata API
  Apple né lettura/scrittura D1. Non è un collaudo di pagamenti Production.
- Trenta test mirati passati, incluso server verifier reale su loopback:
  corretta firma, nessun reconciler/DB, rifiuto admin/HMAC errati, redirect,
  risposte inattese/eccessive e rete. Regressione review/isolation/community OK.
- Bundle deploy/apple-readiness-worker-candidate.mjs: 110122 byte,
  SHA256 dd2dc9ff804c12df859a3fd4935acd62a8400cad23e30287e20ff521df3e7c1b. Smoke: admin assente 403,
  community senza login 401, gate Apple chiuso 503.
- Nessun deploy eseguito. Prossimo passo: copia configurazione locale
  wrangler.community-interest.json, verificare UUID/flag/cutover, sostituire
  solo main, dry-run e deploy --keep-vars; poi singolo POST admin di verifica.
  Nessuna migrazione o reinstallazione di segreti. Dettagli docs/apple-readiness.md.
- Gate sorgente e flag Apple=0 invariati. IPA 29.1 non richiede ricompilazione
  per questa diagnostica solo server. Nessun upload/merge/App Review.

## Diagnostica Apple distribuita — 26 ottobre

- Proprietario conferma deploy calcio-report-proxy su api.calcioreport.com,
  production enabled, previews disabled, versione
  a4e384d4-50d7-4927-8243-670d4abc183f.
- Bundle dal commit 564f99a, verificato dal comando con SHA256
  dd2dc9ff804c12df859a3fd4935acd62a8400cad23e30287e20ff521df3e7c1b.
  Config clonata dalla community: controlli UUID/flag/cutover, --keep-vars,
  nessuna migrazione o reinstallazione segreti. Gate Apple invariati.
- Non ripetere deploy. Prossimo passo: singolo POST /admin/apple-readiness
  con ADMIN_KEY inserita localmente in prompt protetto, mai comunicata in chat.
  Atteso HTTP 200 e {ok:true,verifier:HMAC_OK_BAD_INPUT,upstreamStatus:400}.
  Il 400 è del verifier dopo HMAC e prima di Apple/D1; esito ancora pendente.

## Worker→verifier Production CHIUSO — 26 ottobre

- Proprietario conferma dal POST admin sul Worker pubblico:
  {ok:true,verifier:HMAC_OK_BAD_INPUT,upstreamStatus:400}.
  Collegamento firmato accettato; il verifier ha rifiutato {} prima di Apple/D1.
  Non ripetere diagnostica/deploy a4e384d4. Non equivale a API Apple Production OK.

## Gate Production candidato preparato — 26 ottobre

- Nel solo candidato sostituito blocco sorgente assoluto con prerequisiti espliciti:
  registro 1, pausa 0, cutover valido, Payment Link, DB non alias review,
  origine/segreto verifier Production. Flag Apple e controlli ambiente restano.
- 27 test mirati passati, inclusi quattro nuovi casi con SQLite reale per il
  percorso Production (risposta verifier simulata), accredito/retry, baseline,
  rimborso, proprietario cancellato, schema assente e ambiente errato.
  NON collaudo API Apple o acquisti reali. Smoke flag 0 e flag 1 incompleto chiusi.
- Bundle deploy/apple-activation-worker-candidate.mjs, 110761 byte,
  SHA256 9bcbc82eb0e1794432eba130116162f31269a0a605b70b82d141e1e42777a599. NON distribuito.
  Live ancora versione a4e384d4 con blocco sorgente precedente e Apple flag 0.
- Piano candidato docs/apple-first-activation.md: metadati/privacy, uploader
  Production dedicato, URL notifiche V2 da verificare, deploy futuro a flag 0,
  rilascio manuale e decisione separata per eventuale finestra TRIAL iniziale.
  Non assumere API disponibili alla sola approvazione e non accendere flag ora.
- Prossimo passo con proprietario: leggere stato attuale della versione 1.0
  in App Store Connect (build selezionata, metadati e campi mancanti), senza
  invio. IPA 29.1 non richiede ricompilazione per queste sole modifiche server.
  Main/Pages invariati; nessun upload/merge/App Review autorizzato o eseguito.

## Preparazione consegna App Store 29.1 — 26 ottobre

- Screenshot Distribuzioni/iOS 1.0: sezione Build senza build associata.
  La 29.1 non è ancora su Apple; non selezionare vecchie build internal-only.
- Preparato workflow ios-app-store-delivery.yml, con modalità validate/upload
  separate e sorgente fissata in deploy/app-store-candidate.json (run 40372908094,
  commit 047c451, artifact 12672364036). Riusa l'IPA firmato, non ricompila.
- Controlli repo/run/fork/branch/commit/digest/scadenza e manifest/IPA effettivo:
  bundle, versione 1.0, build 29.1, Production, hash e pagamenti web disabilitati.
  Sei test locali superati; sintassi Bash/YAML valida. Nessuna chiave nuova.
- Questo commit avvia SOLO validate-app con Apple. Nessun upload richiesto.
  Esito remoto pendente; dettagli in docs/app-store-delivery.md.
- Dopo successo preparare consenso al solo caricamento 29.1; nessuna App Review
  o pubblicazione inclusa. Live a4e384d4/Apple=0 invariato; gate candidato 8ebdca7
  ancora NON distribuito. Non ripetere test acquisto o migrazioni.

## Validazione Apple della 29.1 RIUSCITA — 26 ottobre

- Workflow iOS App Store delivery run 40379596702, commit 2ad1c1d, mode validate,
  job 121771924643 SUCCESS. Sei test Python passati; origine e IPA 1.0 (29.1)
  verificati dopo download dell'artefatto originale 12672364036.
- altool --validate-app ha restituito "VERIFY SUCCEEDED with no errors"
  alle 18:40:43 UTC. Non è upload né approvazione App Review.
- IPA originale non ricompilato/rifirmato; nessuna modifica ad app/live/DB/gate.
  La sezione Build in App Store Connect resta senza associazione finché non
  si carica ed elabora la candidata. Non selezionare una vecchia build interna.
- Proposta concreta pronta: SOLO upload della stessa Production 29.1 tramite
  workflow già verificato, senza invio review, pubblicazione o gate Apple.
  Attendere consenso del proprietario a questo caricamento; non richiedere
  nuovo consenso alle prove/delivery software già completate.

## Upload Production 29.1 autorizzato — 26 ottobre

- Proprietario conferma «si certo autorizzo» al SOLO caricamento della stessa
  IPA 1.0 (29.1) già validata. Nessuna nuova compilazione o firma.
- Avvio workflow delivery in modalità upload, con origine e digest invariati.
  Esito remoto ancora pendente: non dichiarare caricamento completato.
- Nessun invio App Review, pubblicazione, merge main o apertura gate Apple.

## Upload Apple Production 29.1 RIUSCITO — 26 ottobre

- Dopo consenso esplicito del proprietario, workflow iOS App Store delivery
  run 40382507054, commit d542173f134a2aa739843986b514fd9ec1112466,
  job 121782169791 SUCCESS in modalità upload. Sei test Python e controlli
  origine/digest/manifest/IPA passati prima del trasferimento.
- Riutilizzata la stessa IPA Production 1.0 (29.1), sorgente 047c451,
  artifact 12672364036: nessuna ricompilazione/rifirma o modifica al contenuto.
- Apple: VERIFY SUCCEEDED senza errori alle 18:59:41 UTC e
  UPLOAD SUCCEEDED senza errori alle 19:00:51 UTC. Trasferimento confermato,
  NON conferma dell'elaborazione Apple o dell'idoneità/selezione della build.
- Prossimo passo: proprietario aggiorna App Store Connect, sezione Build,
  Aggiungi build; verificare presenza Production 29.1 dopo elaborazione.
  Non scegliere 27.1 internal-only, non ripetere upload per la sola attesa.
- Nessun invio App Review o pubblicazione; main/Pages, live a4e384d4,
  Apple flag 0 e gate candidato non distribuito restano invariati.

## Scheda App Store e nuova icona — 26 ottobre

- Proprietario ha associato 29.1 alla versione 1.0; avviso crittografia risolto.
  Conferma inserimento credenziali review, contatti, note inglesi, rilascio manuale,
  descrizione italiana/parole chiave/copyright. Nessun invio alla review.
- Screenshot reali dell'app ancora mancanti (sezione media vuota). Intestazione
  e risultati ricerca sono risorse creative facoltative, lasciate vuote.
- URL assistenza ancora da completare: support@calcioreport.com configurata;
  accesso ai domini tramite ricerca web non riuscito, nessuna pagina verificata.
- Nuova icona pallone/barre verde smeraldo su blu notte approvata dal proprietario.
  Asset assets/branding/calcio-report-icon.png RGB 1024x1024 senza alpha;
  scripts/install-app-icon.mjs invocato dall'installazione iOS già esistente.
  Installazione catalogo e riesecuzione verificate localmente su fixture;
  compilazione Xcode/IPA della nuova icona ancora da eseguire.
- Commit con skip ci per raccogliere modifiche prima di UNA nuova build Production.
  29.1 contiene ancora l'icona predefinita; dovrà essere sostituita nella scheda.
- Prossimi passi: completare assistenza/privacy e asset, nuova build con icona,
  upload e associazione; restano prerequisiti Production del checkpoint precedente.

## Preparazione autonoma assistenza/privacy — 27 ottobre

- Proprietario autorizza avanzamento mentre lavora, conclusione insieme la sera.
- Preparata support.html con email configurata, FAQ accesso/PRO/ripristino,
  cancellazione e community. HTML parsato, asset locale presente, nessuno script,
  form o iframe; NON pubblicata né verificata visualmente in browser.
- docs/app-store-final-preparation.md raccoglie evidenze privacy e residui.
  Interesse community è collegato ad account anche se admin mostra aggregato.
  Consultate guide ufficiali Apple; nessuna etichetta o policy pubblicata.
- Blocco concreto per completare privacy: recuperare policy pubblica attuale e
  schermata App Privacy già configurata; conservazione log/partner e operatività
  supporto da verificare. Non inventare URL, dichiarazioni o tempi conservazione.
- Nuova build non avviata per includere eventuali link/privacy necessari una sola
  volta. Uploader ancora fissato a 29.1; non usarlo per altra candidata.
- Primo passo proprietario stasera: URL policy attuale + schermata App Privacy.
  Poi pubblicazione pagine, build con icona, screenshot reali e associazione;
  restano tutti i prerequisiti Production precedenti. Nessun invio review.
