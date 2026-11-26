# ONB-07 — Gate di rilascio web (bozza operativa)
Aggiornato 26 novembre 2026. PR #22, main e produzione invariati. Questo documento non autorizza deploy.

## Evidenze e perimetro
- Restyling approvato; CI 45843931143 PASS (6 guest, 5 regressioni, 3 browser). ONB-04A PASS Miniflare/workerd + D1 locale; ONB-06C PASS UX su 7 screenshot desktop/mobile emulato (422da1d). Nessun iPhone reale, API live o D1 produzione in questi collaudi.
- Review statica guest: token HMAC separato, scope su fixture e parametri, budget atomico D1 prima del relay su MISS, errori semantici non cacheati (anche payload.error), risposte guest private/no-store. Allowlist relay versionata compatibile (teams, fixtures, standings, injuries); installazione live da non sostituire.
- Il diff Worker rispetto a main comprende anche gate /analysis/open e /predict TRIAL. Il Worker pubblico già testato il 9/11 è documentato come a42fb59c-3f4c-4cd0-8fb1-657a104bef3a; non assumere che sia ancora quello attivo o che il Worker nel repo coincida integralmente con produzione. Verificare prima di sostituire codice. Conservare tutte le route, binding, variabili, segreti, gate Apple, pagamenti, dominio e protezioni attive.
- Check aggiuntivo mirato account esistenti: commit 7003801, workflow onboarding-release-gates.yml. Run 45854361253 SUCCESS, 28 test / 28 pass / 0 fail / 0 skip. Run 45854361061 guest checks SUCCESS attivato automaticamente dal commit di test. Nessun dato reale e nessun invio.

## Parametri proposti, da confermare
- Una fixture per installazione per 180 giorni; riapertura della snapshot senza ulteriore quota. Non è identificazione infallibile né quota per persona: cancellare storage/cambiare browser può aggirarla. Scadenza comporta nuova prova. Informativa descrive pulizia al successivo avvio guest; record scaduti possono restare fino ad allora. Rivedere base, durata, cancellazione e data informativa prima di attivare. Non aggiungere tracking.
- Piano storico dichiarato 7.500 richieste API-Football/giorno; consumo reale e piano corrente non verificati. Proposta conservativa iniziale: 500 MISS guest/giorno (circa 6,7% di 7.500) solo se margine reale sufficiente, altrimenti ridurre o rinviare. È cap di chiamate non in cache, non di persone/analisi. Cache HIT non consuma cap. Budget complessivo account non garantito dal cap guest; controllare picchi e richieste residue. Reset dei contatori guest a mezzanotte UTC, non necessariamente coincidente con quota fornitore.
- GUEST_ENABLED e guestEnabled default off; GUEST_SECRET casuale indipendente, solo secret Cloudflare, mai stampato/in Git/chat. GUEST_API_DAILY_BUDGET esplicito. Nessun cambio OVH/API key/licenza.

## ONB-07A — Preflight sola lettura
1. Confermare piano API-Football attivo, limite giornaliero e uso recente (preferibilmente 7 giorni inclusi weekend) da dashboard, senza chiamate live o esportare chiavi. Registrare solo valori aggregati e data.
2. Identificare Worker pubblico effettivo e versione attiva, dominio, binding D1 e configurazione essenziale per la release (solo nomi/flag non segreti), verificare che URL workers.dev e preview pubblici restino disabilitati. Verificare esistenza ambiente test separato e binding non produzione. Se accesso non disponibile, BLOCKED; non chiedere password o segreti in chat.
3. Confrontare sorgente Worker attivo col candidato in ambiente protetto senza copiare sorgente/config sensibile in chat; verificare soprattutto /analysis/open, /predict, auth, cancellazione, Stripe/Apple. Riportare differenze funzionali e SHA/versione, non dump. Se non verificabile, lasciare gate aperto.
4. Stop: report sintetico, nessuna modifica Cloudflare, D1, OVH, GitHub main o deploy. Non ripetere test già verdi.

### Verbale ONB-07A del 26 novembre 2026 — BLOCKED

Branch e PR #22 verificati a `13c538a`. Verifica in sola lettura sulle dashboard. Nessuna chiamata ai servizi applicativi.

| Verifica | Evidenza disponibile | Esito |
|---|---|---|
| API-Football | La dashboard mostra «Your session has expired». Il limite di 7.500 richieste/giorno è storico. | Piano, limite attuale e consumi giornalieri degli ultimi sette giorni non verificati. Margine per i 500 MISS/giorno da confermare. |
| Worker pubblico | Cloudflare apre la pagina di login. Il frontend candidato indica `api.calcioreport.com`. L’ID `a42fb59c-3f4c-4cd0-8fb1-657a104bef3a` risale al 9 novembre. | Associazione effettiva dominio/Worker, versione attiva, binding D1, flag, stato workers.dev e URL di anteprima non verificati. |
| Compatibilità | Candidato identificato: `worker/worker.js`, blob Git `4b6d4ad832c25ac8ad404152571a398695bd8a2c`. Sorgente della versione servita indisponibile. | Confronto aperto per /analysis/open, /predict, autenticazione, cancellazione account, Stripe e Apple. Nessuna conclusione sulle differenze live. |
| Ambiente separato | Nel branch sono presenti il server sintetico locale e il test Miniflare con D1 locale, già collaudati. | Disponibilità di uno staging Cloudflare e collegamento a un D1 distinto dalla produzione non verificati. |

Per chiudere il gate serve una verifica autenticata in sola lettura dei dati aggregati API-Football e dell’inventario Cloudflare, con confronto protetto del sorgente attivo. Il rilascio resta in sospeso.

## Ordine rilascio (soltanto dopo approvazione esplicita)
1. Congelare commit e acquisire riferimento versione Worker precedente, SHA main/Pages e backup/ripristino D1 verificato senza esportare dati personali in Git/chat. Verificare migrazione additiva guest-v1.sql (quattro tabelle nuove) e configurazione in ambiente separato; smoke test iPhone/Safari su preview protetta con mock/dati sintetici, nessun nuovo acquisto Apple.
2. Applicare migrazione additiva a D1 produzione solo con autorizzazione. Verificare presenza tabelle/indici e integrità senza toccare tabelle account. Non cancellare dati.
3. Distribuire Worker candidato compatibile con GUEST_ENABLED=0, mantenere binding e segreti preesistenti. Controllare /guest/session 404 e accesso account con sessione valida; rollback se regressione. Non sostituire sorgente live non confrontata.
4. Preparare frontend web con flag coerente e cache-bust asset, preservando codice iOS/Apple esistente. Verificare che la release Pages non contenga cambi non previsti. Con autorizzazione attivare Worker guest con cap confermato, poi pubblicare frontend guestEnabled=true e informativa aggiornata. Usare un test controllato di prima fixture, seconda distinta, riapertura, registrazione e PRO gate. Test reali limitati e registrati (senza segreti). Nessun acquisto effettivo per test.
5. Monitorare consumo/rate-limit/errori e accessi iscritti nel primo periodo. In caso di problemi, ripristinare frontend precedente (flag false) e disattivare guest Worker; se regressione account, ripristinare versione Worker precedente e frontend compatibile. Non eliminare le tabelle nuove: rollback software non implica rollback distruttivo D1.
6. Annotare versioni attive e risultati, solo allora dichiarare online. Analytics ONB-08 separato.
