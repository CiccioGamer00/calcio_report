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
  (identificativo parziale, non un commit Git). UUID D1 non visibile.
- Ispezione schema già completata il 22 ottobre, riportata dal proprietario:
  tabelle Apple e nuovo registro PRO assenti. NON richiedere di ripetere il controllo.
- Query aggregata `users` già completata: 23 utenti, 1 disabilitato,
  6 con `paid_until > 0` (non necessariamente ancora attivi).
  Scadenza minima 1774800857114; massima 1796750470265;
  ultima registrazione 1791477327458. Preservare utenti e diritti PRO esistenti.
- Backup completo proposto sul PC Windows:
  `npx wrangler d1 export calcio_users --remote --output=./calcio_users_backup_2026-10-22.sql`.
  **Esito non ancora comunicato**: non considerarlo eseguito o verificato.
  Il dump deve restare sul PC del proprietario, senza caricarne i dati in chat/Git.
- PR #16 verificata il 23 ottobre: aperta, draft, non merged, mergeable;
  head `14f2d3162938253dab8f7b2f5eb6e1cc3f4a7894`,
  base release `d2132f6bc47abac1e2c41dea3babe12f18b6daa9`.
  La patch non è ancora integrata nel branch release. Nessun merge autorizzato.

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

**Prossimo intervento:** acquisire solo l'esito del backup già proposto, senza
ripetere query utenti o ispezione schema. Poi completare i soli elementi mancanti
dell'inventario e preparare il cutover. Nessuna migrazione, nuovo acquisto,
merge o deploy senza autorizzazione esplicita.
