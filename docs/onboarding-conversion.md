# Calcio Report — Onboarding & Conversione

Data: 26 novembre 2026. Direzione approvata dal proprietario. Branch: feature/onboarding-conversion, da main. Stato: in sviluppo, NON pubblicare prima del collaudo e dell'approvazione.

## Perché
Feedback reale: non si capisce a cosa serve l'app né cosa offre rispetto alle altre; la richiesta di iscrizione prima di mostrare un risultato genera diffidenza. La home sembra una sequenza di istruzioni. Prima dimostrare valore, poi chiedere l'iscrizione, senza promesse di vincita o accuratezza non dimostrate.

## Esperienza obiettivo
- Claim: **Oltre il risultato. Dentro la partita.** Analisi pre-partita: confronto squadre, statistiche, forma, indisponibili, formazioni e analisi avanzate. Testi brevi, orientati ai benefici; conservare identità grafica e accessibilità.
- Ricerca: “Quale partita vuoi analizzare?” / “Analizza la partita”. Indicare chiaramente che si cerca il prossimo match tramite una squadra.
- Solo quando il backend guest è realmente attivo: “La prima analisi è gratuita. Nessuna registrazione richiesta.” Prima di allora non prometterla.
- Prima analisi reale anonima: match, classifica, formazioni ufficiali disponibili, indisponibili, statistiche squadra/arbitro, corner e tiri se disponibili. Rispettare carichi on-demand esistenti. Predizione e Indicatori non eseguiti né consegnati al visitatore; mostrare anteprima testuale e CTA “Sblocca con la prova gratuita”. Anche eventuali endpoint avanzati/indiretti e stima pesante restano bloccati finché non esplicitamente autorizzati. Verificare esattamente i pannelli e chiamate in main prima di finalizzare l'allowlist.
- Seconda partita distinta: nessuna apertura automatica del form; mostrare invito “Il bello deve ancora venire”, vantaggi, “Iscriviti gratis”, “Accedi” e “Torna alla partita”. Il form si apre solo su scelta esplicita. Preservare prima partita e tab correnti; dopo iscrizione/login riprendere la ricerca richiesta se ancora valida.
- Registrazione gratuita: 7 giorni di prova PRO, 5 partite diverse al giorno, riapertura nella stessa giornata, Indicatori e Predizione inclusi. Nessuna carta richiesta per iscriversi, nessun rinnovo automatico della prova. Non modificare condizioni, badge, sessioni, account scaduti, acquisti Stripe/Apple o gate review. Non promettere marcatori/ammoniti se non effettivamente disponibili nella build.

## Sicurezza e contenimento costi (fase backend)
- Browser conosce solo Worker; Worker -> cache -> relay OVH HMAC -> API-Football. Nessuna modifica relay prevista.
- ID guest casuale non identificativo (browser/installazione), token server firmato a scopo guest separato da token account, persistenza compatibile web/iOS. Non usare fingerprint; IP solo per limiti antiabuso, non per identificare persone o bloccare famiglie/reti condivise. Non promettere riconoscimento infallibile: cancellazione dati/altro dispositivo possono aggirare il limite. Verificare privacy, minimizzazione e retention prima del rilascio.
- D1 registra al massimo una fixture valida per guest, con prenotazione/commit atomici, gestione retry/concorrenza e riapertura stessa fixture. Non consumare quota per suggerimenti, team non trovato, fixture assente, errori upstream o abort prima di una fixture valida. Non fidarsi di id/parametri client senza verifica server.
- Endpoint guest specifici o allowlist stretta di endpoint e parametri collegati alla fixture autorizzata; mai proxy anonimo generico, mai /predict o richieste Indicatori/altre analisi avanzate; valutare limiti su storico/paginazione e query arbitrarie. Controllo autorizzazione prima della cache, nessuna risposta privata in cache condivisa; mantenere semantic errors non cacheati e deduplicazione. Limiti su bootstrap/suggerimenti/ricerche e budget API, fail closed se D1 indisponibile. Feature flag default off, separazione guest/account e rollout reversibile.
- Distinguere 401 account da esaurimento guest con codice esplicito; non convertire errori o 429 in quota esaurita. Cache client segregata per sessione/guest, invalidare al cambio account; searchId preservato.
- Analisi admin successiva: contatori aggregati per visite/sessioni guest, prima fixture riuscita, CTA PRO, apertura iscrizione, iscrizione completata e acquisto (solo se attribuzione affidabile). No IP raw o email nei dati analytics; non chiamare sessioni “persone uniche”. Definire conservazione, informativa e requisiti privacy prima di attivare telemetria.

## Sequenza implementativa
1. Copy home e aiuto/ricerca su branch, senza promettere funzionalità guest ancora assenti. Conservare ID, CSS, azioni e accessibilità.
2. Audit main: index.html, app.js, js/api.js, js/features/searchController.js, teamFlow.js, panels e worker/worker.js, schema D1/test/migrazioni correnti, ramo Apple se pertinente. Definire contratto guest prima della modifica.
3. Worker guest + migrazione additiva D1 + test sintetici isolati. Nessun deploy o database produzione.
4. Frontend guest, invito seconda ricerca e gate PRO, privacy e asset versionati; test integrati e visuali desktop/mobile. Prima ricerca reale solo dopo attivazione coerente frontend/backend.
5. Analytics admin aggregato, solo dopo definizione privacy.
6. Collaudo regressioni e release coordinata Worker/frontend; verificare iOS senza modificare o inviare nuova build Apple senza autorizzazione.

## Criteri di accettazione
- Nuovo visitatore: suggerimenti, click/Invio/bottone equivalenti, prima fixture valida visibile senza form, seconda distinta mostra invito; annullamento mantiene match; riapertura/refresh stessa fixture non consuma una seconda quota.
- Errori, empty, richieste fuori ordine, doppio click e gare concorrenti non fanno perdere la prova né mostrano dati obsoleti; limitare abuso di token/parametri/cache. Nessuna chiamata avanzata guest anche tramite URL manuali, nessun leak di cache a guest dopo login/logout.
- TRIAL 7 giorni/5 match al giorno, PRO, SCADUTO, login/registrazione, recupero, cancellazione, acquisti e Giornata non regressi. Test web desktop e mobile/iPhone, compatibilità con build esistenti.
- Nessun deploy, modifica D1 remoto, merge main o cambio Apple durante sviluppo. Test mirati e suite esistente; documentare risultati effettivi, limiti, rollback; aggiornare PROJECT_STATUS.md a ogni milestone. Non ripetere infrastruttura già verificata.

## Stato consegna
- 26/11: direzione approvata, branch dedicato; fase 1 in preparazione. Le altre fasi non sono implementate.
