# Task board — Calcio Report

Aggiornato 26/11/2026. PR #22, feature/onboarding-conversion. Nessun merge/deploy. Obiettivi prodotto: docs/onboarding-conversion.md. Regole: AGENTS.md. Leggere solo il task assegnato e il checkpoint in cima a PROJECT_STATUS.md.

| Task | Responsabile | Stato |
|---|---|---|
| ONB-01 Copy | ChatGPT | Fatto (8 verifiche statiche) |
| ONB-02 Implementazione guest | Work | Codice consegnato b12ab55; non ancora approvato |
| ONB-03 Test automatici | ChatGPT / GitHub Actions | Completato: 6 guest + 5 regressioni + 3 scenari browser PASS |
| ONB-04 Correzioni backend | Codex | CI verde; solo difetti review riproducibili |
| ONB-05 Correzioni frontend | Codex | Solo dopo esito CI / review |
| ONB-06A Collaudo visivo | Work | PASS con osservazioni |
| ONB-06B Restyling conversione | ChatGPT | Implementato, CI PASS; visuale da approvare |
| ONB-07 Rilascio | ChatGPT + proprietario | In attesa di approvazione |
| ONB-08 Analytics admin | Separato | Non iniziare ora |

## ONB-03 — Collaudo automatico
- CI: .github/workflows/guest-tests.yml, push sul solo ramo di lavoro, read-only, nessun deploy. Guest: node --test tests/guest-analysis.test.mjs.
- Run 45808094657, commit b2d6647: **6 pass / 0 fail**, SQLite in memoria, relay finto. Verificati concorrenza, quota, errori/empty/abort, limiti e separazione account, cache, ticket. Non ripetere questi test a mano senza cambiamenti.
- Commit 9227b48 aggiunge 5 file di regressione mirati e il browser sintetico di Work (desktop, 390 e 375 px); run 45808206165: tutti e tre i job SUCCESS; 6 guest / 0 fail, 5 regressioni / 0 fail (20 script analizzati, asset 20261126r2), 3 scenari browser PASS (1366×850 pulsante, 390×844 Invio, 375×812 suggerimento; refresh, anteprima premium, annulla, registrazione e ripresa). Non confondere Chromium emulato con iPhone reale.
- Niente API live, nessun accesso a D1 remoto.

## ONB-04A — Compatibilità runtime Cloudflare (PASS)
- Base verificata: b128b09, PR #22. Run 45808206165 verde: non ripetere i 14 controlli già superati se non conseguenza di una modifica.
- Obiettivo unico: eseguire il Worker guest con runtime Wrangler/Miniflare e D1 locale effettivo, applicando schema account sintetico e migrazione guest-v1.sql; relay mock, nessuna chiamata reale. Verificare avvio, flag off, sessione, apertura una fixture valida, seconda distinta rifiutata, persistenza/riapertura e blocco premium. Non cambiare la policy 180 giorni/500 MISS giornalieri: decisioni di release separate.
- File ammessi: worker/worker.js (solo difetto runtime guest riprodotto), worker/migrations/guest-v1.sql, test/config locale dedicato e documentazione di consegna. Non modificare frontend, OVH, Apple, main o servizi remoti. Relay versionato verificato staticamente: roots teams, fixtures, standings, injuries ammessi.
- Stop al primo risultato completo: PASS con comando riproducibile e log sintetico oppure BLOCKED con errore preciso; eventuale fix circoscritto e commit. Aggiornare questa sezione e checkpoint iniziale di PROJECT_STATUS.md. Non passare a ONB-05/06/07.

- Esito del 26 novembre: PASS sul Worker del commit 5d24a47, test 59cb2de. Node 24.22.3, Miniflare 4.20260730.0, workerd 1.20260730.1, compatibility date 2026-07-01. Schema account sintetico e migrazione guest applicati a D1 locale temporaneo. Nessuna correzione al backend.
- Comando riproducibile dalla radice: `npm install --prefix tests/onb-04a --no-save --package-lock=false --no-audit --no-fund miniflare@4.20260730.0 && node tests/onb-04a/runtime.cjs`
- Log: `PASS ONB-04A: flag off 404, session 200, open 101, second 409, restart/reopen 101, premium 403/403, mock calls 2`. Il test intercetta tutte le richieste in uscita. I 14 controlli precedenti non sono stati rilanciati.

## ONB-04 — Solo backend (se necessario)
- File ammessi: worker/worker.js (solo guest e trasporto pertinente), worker/migrations/guest-v1.sql, tests/guest-analysis.test.mjs, tests/helpers/guest-sandbox.mjs.
- Verificare/risolvere esclusivamente errori CI o difetti specifici: rinnovo quota dopo 180 giorni e riapertura snapshot storico sono scelte da validare col proprietario; budget globale default 500 MISS/giorno da confermare con budget reale prima di attivare; verifica allowlist reale del relay e compatibilità D1 (SQLite simulato non equivale a runtime Cloudflare). Nessuna modifica alle policy TRIAL/PRO.
- Consegna: commit, test mirati, eventuale blocco. Stop. Non lavorare su UI o deploy.

## ONB-05 — Solo frontend (se necessario)
- File ammessi: js/guest.js, js/api.js, js/features/searchController.js, app.js, index.html, style.css e test frontend pertinenti. Non modificare Worker, salvo assegnazione separata.
- Correggere solo casi riproducibili da CI/collaudo; primo match, secondo invito, conserva tab, ripresa dopo login/registrazione, cache/sessione. Flag guest disabilitato finché Worker non pronto.
- Consegna: commit e test mirati. Stop.

## ONB-06A — Collaudo visivo mirato (PASS con osservazioni)
- Base verificata: be6843e, PR #22. ONB-03 e ONB-04A PASS; nessuna modifica applicativa in ONB-04A. Non rilanciare le suite.
- Obiettivo unico: giudicare l'esperienza visiva del nuovo visitatore. Usare il frontend candidato con server locale già esistente (tests/helpers/guest-server.mjs), dati sintetici e relay simulato. Nessun deploy, nessuna API live.
- In browser desktop 1366x850 e mobile 390x844, acquisire screenshot di: home iniziale con ricerca e messaggio gratuito; prima partita; invito alla registrazione dalla seconda distinta; anteprima PRO bloccata. Controllare gerarchia dei testi, chiarezza CTA, leggibilità, sovrapposizioni, scroll orizzontale e facilità di ritorno al match. Non ripetere scenari funzionali completi già verdi.
- Solo report, non modificare codice, CSS o backend in questo incarico. Classificare eventuali difetti bloccanti e miglioramenti facoltativi, indicare schermata e file coinvolto. Consegnare screenshot nel risultato Work, preferibilmente con riferimenti persistenti se disponibili; non inserire file voluminosi nel repo. Annotare esito sintetico qui e nel checkpoint PROJECT_STATUS.md, con commit. Stop.
- Mobile emulato non equivale a iPhone reale. Review sicurezza, policy 180 giorni/budget API e attivazione produzione restano gate distinti di ONB-07.

**Esito del 26 novembre.** Base `9d77053`, PR #22. Otto screenshot consegnati in Work: home, AC Milan–Inter, invito dopo la ricerca Juventus, blocco Predizione. Due sessioni Chromium distinte, desktop 1366×850 e mobile emulato 390×844, server guest locale e dati sintetici. Prima partita acquisita dopo aver chiuso il suggerimento «Scheda Match». Nessuna suite rilanciata.

- **Bloccanti:** nessuno osservato. Messaggio gratuito accanto alla ricerca, squadre leggibili, condizioni della prova e tre azioni visibili nell’invito. «Torna alla partita» riporta alla prima selezione. Larghezza della pagina pari al viewport in tutte e otto le viste; su mobile la sola barra delle schede scorre lateralmente.
- **Facoltativo · invito, entrambi i formati** (`index.html`): «Il bello deve ancora venire» descrive poco il limite raggiunto. Esplicitare «Hai usato la tua prima analisi gratuita» prima dei vantaggi della prova, mantenendo «Torna alla partita».
- **Facoltativo · anteprima PRO** (`js/features/teamFlow.js`, `style.css`): il match resta visibile e l’invito a sbloccare Predizione compare in basso. Su desktop il pulsante è piccolo e lontano dal testo; su mobile la scheda successiva appare tagliata al bordo della barra. Avvicinare il pulsante alla spiegazione e rendere più evidente lo scorrimento delle schede.
- **Facoltativo · prima partita mobile** (`app.js`, `style.css`): prima di premere «Chiudi», il suggerimento «Scheda Match» copre i nomi delle squadre. Un suggerimento più compatto lascerebbe subito visibile il risultato della ricerca.


## ONB-06B — Restyling conversione PRO (implementato, CI PASS)
- Feedback del proprietario: inviti visivamente anonimi. Direzione apprezzata: premium sportivo, oro riservato alla promozione PRO, verde/blu identità corrente; niente banner aggressivi.
- Obiettivo prodotto: capire perché la seconda partita è bloccata, cosa si ottiene con la prova, quale azione fare. Card distinta, headline, benefici, CTA principale dorata, accesso e ritorno come azioni secondarie. Condizioni esatte: 7 giorni, 5 partite distinte/giorno, nessuna carta, nessun rinnovo automatico.
- Anteprima PRO guest: mostrare struttura/benefici di Indicatori e Predizione con lucchetto e segnaposti senza numeri inventati o chiamate premium. CTA vicino alla spiegazione. Non alterare gate server, sessione o pagamenti. Correggere suggerimento mobile che copre le squadre in un piccolo task separato se necessario.
- File previsti: index.html, style.css, app.js, js/features/teamFlow.js e soli test/asset pertinenti. Implementazione a blocchi: prima invito, poi anteprima premium. Screenshot prima/dopo desktop/mobile e verifica CTA esplicite, accessibilità, niente overflow e match preservato. CI automatica per regressioni toccate.
- Approvato dal proprietario. Commit d4277e4: invito premium dorato, CTA e condizioni, anteprima statica Indicatori/Predizione, tab PRO guest evidenziate, hint automatico Match guest rimosso; asset 20261126r3. Backend e pagamenti invariati. Run 45843401606: 6 guest e 5 regressioni PASS; browser non avviato, nessun esito applicativo. Commit 4aeab2c corregge solo avvio/diagnostica del test; run 45843931143 SUCCESS: guest, regressioni e browser 1366×850, 390×844, 375×812 tutti PASS. Non pubblicare prima di CI e verifica visiva. Gate sicurezza/retention/budget/iPhone rimangono aperti.
- Nuovo criterio permanente: review prodotto e conversione in AGENTS.md; PASS tecnico non equivale a PASS commerciale.

## ONB-06C — Approvazione visiva finale (Work)
- Base: codice d4277e4 + fix test 4aeab2c; run 45843931143 verde. Non ripetere test funzionali.
- Obiettivo unico: screenshot del nuovo invito dorato e delle anteprime PRO Indicatori/Predizione, su desktop 1366×850 e mobile 390×844. Usare tests/helpers/guest-server.mjs con dati sintetici. Verificare gerarchia visiva, leggibilità, contrasto, CTA, condizioni TRIAL, ritorno al match, nessun overlay sulla prima partita; includere screenshot della prima partita mobile se utile.
- Consegnare screenshot effettivi e verdetto UX (bloccanti o PASS); non modificare codice, backend, infrastruttura o produzione. Non ripetere home precedente né suite. Annotare esito in TASK_BOARD.md e PROJECT_STATUS.md. Stop.
- iPhone reale, review sicurezza e parametri di rilascio rimangono distinti.

## ONB-07 — Gate release
- Verifica privacy/retention, budget e migrazione D1 isolata, compatibilità Apple esistente, rollback e ordine Worker/frontend. Conferma esplicita prima di qualsiasi deploy o merge. GUEST_ENABLED e guestEnabled default off.
- ONB-08 analytics resta milestone indipendente; niente telemetria nuova in questo rilascio.
