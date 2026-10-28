# Informativa privacy Calcio Report — bozza di lavoro
Data: 28 ottobre 2026. NON PUBBLICARE: i punti [DA COMPLETARE] richiedono verifica.
Ambito: app iOS e servizi di account condivisi. Il sito web e Stripe richiedono
una sezione distinta se questa informativa sarà usata anche sul sito.

## Titolare e contatti
Il servizio è gestito da Stefano Morotti [DA CONFERMARE: identità del titolare
effettivo ed eventuali ulteriori recapiti necessari].
Per assistenza e richieste relative ai dati: support@calcioreport.com.
Il proprietario ha confermato che la casella riceve messaggi ed è accessibile.

## Account e accesso
Per creare e gestire l'account trattiamo indirizzo email, identificativo
dell'account, password in forma derivata mediante hashing, data di registrazione
e stato dell'accesso TRIAL/PRO. Usiamo questi dati per autenticazione, recupero
password, gestione del servizio e sicurezza.
La base proposta per i trattamenti necessari al servizio è l'esecuzione del
contratto e delle misure richieste prima della sua conclusione.
Senza i dati necessari alla registrazione non è possibile creare l'account.

## Acquisti
Per verificare gli acquisti e riconoscere i giorni PRO trattiamo identificativi
delle transazioni e del prodotto, date, stato dei diritti e collegamento
all'account. I pagamenti nell'app iOS sono gestiti da Apple: Calcio Report non
riceve il numero della carta o le credenziali di pagamento.
Apple tratta inoltre dati secondo la propria informativa.
La cancellazione dell'account disattiva il collegamento operativo del token
Apple, ma conserva i registri tecnici degli acquisti e dei diritti PRO, con
identificativi pseudonimi, per impedire riutilizzi e gestire le transazioni.
Questi registri non devono essere descritti come anonimi.
[DA COMPLETARE: periodo/criteri di conservazione e procedura applicabile a
questi registri; eventuali obblighi effettivi e ruoli dei soggetti.]

## Attività e interesse per la community
Il server conserva l'ultima attività dell'account per le statistiche
amministrative, aggiornando un unico valore; non memorizza una riga per ogni ping. Quando esprimi interesse per la futura community, registra
l'identificativo dell'account e la data: questo permette di contare una sola
manifestazione per account. Il totale mostrato all'amministratore non rende
anonimo il record originario.
Questa azione non iscrive a Telegram e non iscrive a una newsletter.
[DA COMPLETARE prima della pubblicazione: base giuridica dell'analisi attività
e interesse, eventuale consenso/opposizione e relativa implementazione.
La scelta Analisi in App Store Connect non costituisce una base giuridica GDPR.]

## Assistenza
Se scrivi all'assistenza, trattiamo l'indirizzo del mittente e le informazioni
che includi per gestire la richiesta. Non inviare password o dati delle carte.
I messaggi a support@calcioreport.com sono inoltrati tramite Cloudflare
Email Routing alla casella Libero usata dal gestore per l'assistenza.
Il periodo concordato per la corrispondenza è di 12 mesi dalla chiusura della
richiesta, salvo necessità legate a contestazioni o obblighi specifici.
La pulizia è gestita manualmente; non è attiva una cancellazione automatica.
[DA COMPLETARE: valutazione categoria Assistenza clienti nell'etichetta Apple;
verifica condizioni/ruoli dei fornitori e gestione delle copie e del cestino.]

## Fornitori e comunicazioni
L'infrastruttura utilizza Cloudflare per API/database e OVH per i servizi
server; Resend è impiegato per le email applicative. Il fornitore dei dati
calcistici riceve le richieste sportive attraverso i servizi server.
[DA COMPLETARE: soggetti contrattuali effettivi, ruoli, log dei fornitori,
ubicazioni e garanzie applicabili agli eventuali trasferimenti extra SEE.
Non affermare che tutti i dati rimangono nell'UE senza verifica.]

## Conservazione e cancellazione
Puoi richiedere la cancellazione con il comando Cancella account nell'app,
confermando la password e digitando ELIMINA. Il record dell'interesse community
viene eliminato insieme all'account. La cancellazione fa perdere l'accesso e
i giorni residui; non comporta automaticamente un rimborso Apple.
[DA COMPLETARE: periodi o criteri concreti per account inattivi, ultima attività,
interesse, acquisti, log e backup. Verificare il comportamento dei
registri Apple/PRO e dei backup: non promettere cancellazione totale immediata.]

## Copie di sicurezza — evidenze verificate il 28 ottobre
- Database live calcio_users: schermata Cloudflare D1 Time Travel conferma
  finestra di ripristino di 7 giorni. Nessun ripristino eseguito. Dati rimossi
  dal database operativo possono rimanere recuperabili nella finestra storica;
  non promettere cancellazione immediata da ogni copia.
- VPS OVH: Standard attivo, snapshot disattivato, copia giornaliera alle
  19:04 UTC. Schermata mostra copia del 27 ottobre. Retention Standard
  documentata 24 ore; 7 giorni solo Premium. Non è prova di eliminazione
  fisica già avvenuta della copia contenente il vecchio access log.
  Fonte: https://www.ovhcloud.com/it/vps/vps-backup/
- Dump manuale del database esportato sul PC il 23 ottobre: conservazione,
  eventuali copie/sincronizzazione e procedura di smaltimento da definire.
- In caso di ripristino, prevedere riconciliazione delle cancellazioni account
  intervenute dopo la copia e dei diritti PRO successivi; non ripristinare
  automaticamente una copia vecchia sul live.
Queste evidenze non coprono eventuali ulteriori backup o archivi dei fornitori.

## Diritti
Puoi contattarci per esercitare, nei casi previsti, i diritti di accesso,
rettifica, cancellazione, limitazione, opposizione e portabilità. Se un
trattamento si basa sul consenso, puoi revocarlo senza pregiudicare la liceità
del trattamento precedente. Puoi presentare reclamo al Garante per la protezione
dei dati personali: https://www.garanteprivacy.it/.
Potremo chiedere le informazioni necessarie per verificare la tua identità.

## Verifiche tecniche da chiudere
- Cronologia ricerche: nessuna scrittura a trial_search_log/trial_usage nel
  bundle live apple-readiness esaminato; riferimenti soltanto alla cancellazione.
  I percorsi app/searchController/teamFlow/api esaminati non aggiungono un
  registro server delle ricerche. Cache delle richieste e log dei fornitori
  vanno valutati separatamente, come gli eventuali record storici.
- Workers Logs: piano Free, conservazione documentata attuale 3 giorni.
  Invocation logs prima attivi con IP/geolocalizzazione di rete/browser/tempi;
  proprietario conferma disattivazione il 27 ottobre. Logs applicativi e
  persistenza rimangono attivi. Controllare risultato e preservare il flag
  invocation_logs=false nei futuri deploy. Nessuna copia di log personali qui.
- Access log relay OVH: il 27 ottobre il proprietario ha autorizzato e
  confermato rimozione del relativo blocco Caddy, validazione e reload riusciti.
  Esempio repo allineato. Il 28 ottobre il proprietario conferma eliminazione
  dell'unico vecchio file individuato /var/log/caddy/calcio-report-relay.log
  (5488926 byte), con verifica di assenza; non prova assenza di copie/backup.
- Journal VPS: il 28 ottobre applicato drop-in
  /etc/systemd/journald.conf.d/99-calcio-retention.conf con
  MaxRetentionSec=30day e MaxFileSec=1day. Proprietario riporta servizio active
  e valori configurati corretti. Conservazione per file ruotati, non cancellazione
  puntuale di ogni riga al trentesimo giorno. Si applica all'intero journal VPS.
  Vacuum manuale riporta 0B liberati; spazio finale 261.3M (prima 453M):
  non attribuire la differenza al vacuum manuale.
- ForwardToSyslog=yes e rsyslog active. Configurazione logrotate osservata:
  rotate 4, weekly, compress, delaycompress, missingok, notifempty; quattro
  archivi oltre al corrente, non un limite esatto di 28 giorni per ogni evento.
  Esecuzione effettiva delle rotazioni e copie/backup non ancora verificate.
- Rimangono da caratterizzare eventuali log applicativi separati e altri servizi
  Cloudflare/OVH. Queste modifiche non dimostrano assenza di ogni altra raccolta.
- Dipendenze dirette iOS: Capacitor core/ios 8.5.3 e secure-storage 8.0.1;
  dipendenze transitive includono Capacitor app/keyboard. Sessione in vault nativo,
  con scadenza 6 ore e rimozione dei vecchi token plaintext dal localStorage.
  Nessun SDK pubblicitario nelle dipendenze dirette censite. Verifica manifest
  del binario finale ancora necessaria; non dedurre conformità dal package.json.
- Etichette Apple: email e ID utente per Funzionalità E Analisi (ultima
  attività legata all'email e deduplica interesse per ID); acquisti per
  Funzionalità, interazione per Analisi; tutti collegati, nessun tracking.
  Correzione email/ID confermata dal proprietario il 27 ottobre, come registrato
  nel checkpoint; etichette ancora non pubblicate e verifica complessiva incompleta.
- URL pubblico, link nell'app, accessibilità della policy senza autenticazione.

Riferimenti di lavoro:
https://developer.apple.com/app-store/app-privacy-details/
https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita

Fonte tecnica log: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
