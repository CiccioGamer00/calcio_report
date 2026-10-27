# Informativa privacy Calcio Report — bozza di lavoro
Data: 27 ottobre 2026. NON PUBBLICARE: i punti [DA COMPLETARE] richiedono verifica.
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
[DA COMPLETARE: eventuali obblighi di conservazione effettivamente applicabili,
ruoli dei soggetti e sorte dei registri dopo cancellazione account.]

## Attività e interesse per la community
Il server conserva l'ultima attività dell'account per le statistiche
amministrative. Quando esprimi interesse per la futura community, registra
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
[DA COMPLETARE: provider della casella, conservazione dei messaggi e valutazione
della categoria Assistenza clienti nell'etichetta Apple.]

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
interesse, acquisti, assistenza, log e backup. Verificare il comportamento dei
registri Apple/PRO e dei backup: non promettere cancellazione totale immediata.]

## Diritti
Puoi contattarci per esercitare, nei casi previsti, i diritti di accesso,
rettifica, cancellazione, limitazione, opposizione e portabilità. Se un
trattamento si basa sul consenso, puoi revocarlo senza pregiudicare la liceità
del trattamento precedente. Puoi presentare reclamo al Garante per la protezione
dei dati personali: https://www.garanteprivacy.it/.
Potremo chiedere le informazioni necessarie per verificare la tua identità.

## Verifiche tecniche da chiudere
- Cronologia ricerche: il Worker contiene cancellazione di tabelle storiche
  trial_search_log/trial_usage, ma ciò non dimostra che la release vi scriva.
  Non dichiarare una raccolta né una sua assenza sulla sola base dei nomi.
- Workers Logs: piano Free, conservazione documentata attuale 3 giorni.
  Invocation logs prima attivi con IP/geolocalizzazione di rete/browser/tempi;
  proprietario conferma disattivazione il 27 ottobre. Logs applicativi e
  persistenza rimangono attivi. Controllare risultato e preservare il flag
  invocation_logs=false nei futuri deploy. Nessuna copia di log personali qui.
- Access log relay OVH: il 27 ottobre il proprietario ha autorizzato e
  confermato rimozione del relativo blocco Caddy, validazione e reload riusciti.
  Esempio repo allineato. I vecchi file sono conservati e richiedono una
  decisione di smaltimento; non presumere che vengano cancellati senza rotazione.
- Rimangono da verificare log applicativi/journal e altri servizi Cloudflare/OVH.
  Queste modifiche non dimostrano assenza di ogni altra raccolta.
- Inventario delle dipendenze e manifest del binario finale.
- Etichette Apple preliminari: email, ID utente e acquisti per Funzionalità;
  interazione prodotto per Analisi; tutti collegati, nessun tracking dichiarato.
  Verificare l'eventuale uso di ID/email anche per analisi prima di pubblicare.
- URL pubblico, link nell'app, accessibilità della policy senza autenticazione.

Riferimenti di lavoro:
https://developer.apple.com/app-store/app-privacy-details/
https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita

Fonte tecnica log: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
