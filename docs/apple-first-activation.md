# Prima attivazione Apple Production — candidato del 26 ottobre

## Stato e distinzione delle prove

Il proprietario ha confermato il controllo dal Worker pubblico:
ok:true, verifier:HMAC_OK_BAD_INPUT, upstreamStatus:400.
Il collegamento HMAC Worker→verifier Production è accettato e non va ripetuto.
Non implica accesso alle API Apple Production: l'ultimo confronto sullo stesso JWT
era Production 401, Sandbox 200. La libreria Apple documenta una limitazione
prima del primo rilascio: https://github.com/apple/app-store-server-library-java/issues/92 .

Build iOS 29.1 firmata, non caricata su Apple. Review pubblica/Sandbox isolata,
registro PRO, migrazione e contatore community già verificati.
Il live è ancora a4e384d4-50d7-4927-8243-670d4abc183f: flag Apple 0 e vecchio
blocco sorgente. Questo documento e il nuovo bundle non ne modificano lo stato.

## Candidato al posto del blocco assoluto

worker/apple-activation.mjs permette il percorso Production soltanto quando:
- il flag APPLE_PRODUCTION_ENABLED è 1 e ambiente/deployment sono Production
  (controlli preesistenti nel chiamante);
- registro PRO attivo, pausa scritture esplicitamente 0, cutover intero positivo
  non futuro e Payment Link Stripe presente nel formato previsto;
- binding DB con operazioni D1 e nessun alias diretto con APP_REVIEW_DB;
- origine del verifier Production esatta e segreto nel formato richiesto.

Il controllo degli oggetti binding non prova gli UUID fisici: verificarli nella
configurazione di deploy come già fatto. Le tabelle live sono già state migrate.
Uno schema mancante blocca /apple/token senza aprire il checkout nativo.
Nessuna richiesta client può scegliere ambiente, database o prerequisiti.

Bundle deploy/apple-activation-worker-candidate.mjs: 110761 byte.
SHA256 9bcbc82eb0e1794432eba130116162f31269a0a605b70b82d141e1e42777a599.
27 test mirati passati; quattro nuovi casi coprono prerequisiti negativi,
token/accredito/retry Production, rimborso e proprietario cancellato, schema
assente e ambiente errato. Test con SQLite reale e risposta del verifier simulata:
NON acquisti Apple reali né nuovi test su iPhone. Smoke bundle con flag 0 e con
flag 1 incompleto: entrambi chiusi. Compatibilità review/Sandbox/HMAC verificata.

## Sequenza di rilascio da rendere concreta

1. Completare scheda App Store, privacy e contatti; dichiarare il conteggio
   facoltativo dell'interesse community associato all'account. Note review
   trasparenti sul backend pubblico e l'account Sandbox isolato. Nessuna
   credenziale nel repository.
2. Preparare caricamento della 29.1 come candidata App Store, non internal-only.
   Uploader interno attuale rifiuta Production: serve un percorso dedicato.
   Caricamento e invio a review richiedono autorizzazioni esplicite distinte.
3. Predisporre URL notifiche Production V2
   https://api.calcioreport.com/apple/notifications; preservare l'URL Sandbox
   esistente sul Worker TEST. La configurazione attuale in App Store Connect
   deve ancora essere letta: non dichiararla impostata.
4. Distribuire il nuovo bundle SOLO con flag Apple 0, mantenendo registro,
   cutover, review e segreti. Nessuna nuova migrazione o rotazione chiavi.
   Il fatto che il candidato superi i test non autorizza ad accendere il flag.
5. Definire rilascio manuale dopo approvazione Apple. Un nuovo controllo API
   Production ha senso quando cambia lo stato di pubblicazione, non come retry
   arbitrario del 401. Se già accessibile dopo approvazione, verificarlo prima
   della pubblicazione; l'approvazione da sola non ne garantisce l'accesso.
6. Se il 401 persiste finché l'app non è pubblicata, discutere esplicitamente
   l'eventuale breve avvio pubblico con acquisti disabilitati e funzioni TRIAL.
   Non presentare questa finestra come una release completa già accettata.
   Nessun checkout deve essere aperto finché il server è disabilitato.
7. Solo dopo evidenza API Production e decisione esplicita del proprietario:
   flag Apple 1 e verifica mirata del percorso reale disponibile, preservando
   accrediti e idempotenza. Se emergono problemi, sospendere nuovi acquisti e
   riconciliare le transazioni; niente ritorno al writer legacy o vecchio dump.

Restano le accettazioni residue pertinenti (incluso refund/deletion reale se
necessario) e la patch audit PR16 non integrata. Non imporre acquisti ripetuti
di Sandbox o TestFlight 27.1 già accettati per compilare questa scheda.
