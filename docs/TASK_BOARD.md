# Task board — Calcio Report

Aggiornato 26/11/2026. PR #22, feature/onboarding-conversion. Nessun merge/deploy. Obiettivi prodotto: docs/onboarding-conversion.md. Regole: AGENTS.md. Leggere solo il task assegnato e il checkpoint in cima a PROJECT_STATUS.md.

| Task | Responsabile | Stato |
|---|---|---|
| ONB-01 Copy | ChatGPT | Fatto (8 verifiche statiche) |
| ONB-02 Implementazione guest | Work | Codice consegnato b12ab55; non ancora approvato |
| ONB-03 Test automatici | ChatGPT / GitHub Actions | Guest 6/6 PASS; browser e regressioni avviati |
| ONB-04 Correzioni backend | Codex | Solo dopo esito CI / review |
| ONB-05 Correzioni frontend | Codex | Solo dopo esito CI / review |
| ONB-06 Collaudo UI | Work | In attesa di ONB-04/05 |
| ONB-07 Rilascio | ChatGPT + proprietario | In attesa di approvazione |
| ONB-08 Analytics admin | Separato | Non iniziare ora |

## ONB-03 — Collaudo automatico
- CI: .github/workflows/guest-tests.yml, push sul solo ramo di lavoro, read-only, nessun deploy. Guest: node --test tests/guest-analysis.test.mjs.
- Run 45808094657, commit b2d6647: **6 pass / 0 fail**, SQLite in memoria, relay finto. Verificati concorrenza, quota, errori/empty/abort, limiti e separazione account, cache, ticket. Non ripetere questi test a mano senza cambiamenti.
- Commit 9227b48 aggiunge 5 file di regressione mirati e il browser sintetico di Work (desktop, 390 e 375 px); esiti da registrare. Non confondere Chromium emulato con iPhone reale.
- Niente API live, nessun accesso a D1 remoto.

## ONB-04 — Solo backend (se necessario)
- File ammessi: worker/worker.js (solo guest e trasporto pertinente), worker/migrations/guest-v1.sql, tests/guest-analysis.test.mjs, tests/helpers/guest-sandbox.mjs.
- Verificare/risolvere esclusivamente errori CI o difetti specifici: rinnovo quota dopo 180 giorni e riapertura snapshot storico sono scelte da validare col proprietario; budget globale default 500 MISS/giorno da confermare con budget reale prima di attivare; verifica allowlist reale del relay e compatibilità D1 (SQLite simulato non equivale a runtime Cloudflare). Nessuna modifica alle policy TRIAL/PRO.
- Consegna: commit, test mirati, eventuale blocco. Stop. Non lavorare su UI o deploy.

## ONB-05 — Solo frontend (se necessario)
- File ammessi: js/guest.js, js/api.js, js/features/searchController.js, app.js, index.html, style.css e test frontend pertinenti. Non modificare Worker, salvo assegnazione separata.
- Correggere solo casi riproducibili da CI/collaudo; primo match, secondo invito, conserva tab, ripresa dopo login/registrazione, cache/sessione. Flag guest disabilitato finché Worker non pronto.
- Consegna: commit e test mirati. Stop.

## ONB-06 — Collaudo UI (Work)
- Prerequisito: CI verde e ONB-04/05 completati o non necessari.
- Solo collaudo su ambiente isolato: screenshot desktop/mobile, leggibilità CTA, layout e accessibilità, verifica prima analisi, seconda distinta, annulla, registrazione. Eventuali bug con screenshot e passi minimi; non riscrivere backend.
- Non ripetere test automatici già verdi. iPhone reale eventualmente proprietario, in un unico blocco di verifiche. Stop dopo report.

## ONB-07 — Gate release
- Verifica privacy/retention, budget e migrazione D1 isolata, compatibilità Apple esistente, rollback e ordine Worker/frontend. Conferma esplicita prima di qualsiasi deploy o merge. GUEST_ENABLED e guestEnabled default off.
- ONB-08 analytics resta milestone indipendente; niente telemetria nuova in questo rilascio.
