# Decisioni operative privacy — 28 ottobre 2026

Il proprietario autorizza completamento autonomo e pubblicazione necessaria alla
release. `privacy.html` è la candidata leggibile in app e sul web; le evidenze
tecniche restano in `docs/privacy-policy-draft.md` e PROJECT_STATUS.md.
Nessun testo costituisce prova di un deploy backend o di modifica ASC.

## Conservazione adottata
- Account, ultimo accesso e interesse: per durata account; eliminazione account
  già implementata. Interesse da eliminare anche alla fine della raccolta
  preliminare community. Non dichiarare dati anonimi o una riga per ogni ping.
- Assistenza: 12 mesi dalla chiusura, pulizia manuale mensile comprendendo
  cestino e copie sotto il controllo del titolare; eccezioni motivate per contenzioso.
- Dump manuali: massimo 30 giorni dalla creazione, salvo incidente documentato.
  Il dump del 23 ottobre sul PC va rimosso entro il 22 novembre 2026, dopo
  verifica che non sia necessario per un incidente concreto. Nessuna cancellazione
  del PC o automazione pianificata da questa sessione. Non ripristinarlo sul live.
- Ledger: non cancellare transazioni solo perché l'account è eliminato. Il codice
  deve ancora riconoscere token ritirati e transazioni già usate. Criterio:
  conservazione minima mentre il percorso di acquisto può accettare/riconciliare
  quelle transazioni; riesame annuale e alla cessazione del percorso. Prima di
  eliminare un insieme di transazioni, documentare perché non siano più
  accettabili e applicare un rifiuto tecnico coerente. Nessuna falsa scadenza
  automatica e nessuna durata fiscale universale inventata.
- Log e backup: valori misurati nel checkpoint. Una finestra di backup non
  dimostra cancellazione fisica istantanea né copre tutti i log dei fornitori.

## Valutazione preliminare del legittimo interesse
Scopo: statistiche operative limitate e deduplica dell'interesse richiesto
volontariamente, senza profilazione commerciale o pubblicitaria.
Necessità: ultimo accesso usa un unico valore sovrascritto; la deduplica richiede
un ID account, non email nel record community. Non usare cronologia dettagliata.
Impatto: i dati restano collegati alla persona, inclusa la vista admin dell'ultima
attività. Non descriverli come solo aggregati. Accesso admin riservato e niente
comunicazione alla futura community. Alternative aggregate per l'attività sono
possibili: rivalutare il dato individuale se non è più necessario.
Garanzie: informativa prima della registrazione, contatto per opposizione e
rimozione interesse, cancellazione insieme all'account, nessun uso pubblicitario.
Le richieste di opposizione devono essere gestite concretamente: non limitarsi
alla risposta standard o imporre automaticamente cancellazione dell'account.
Una sospensione selettiva del ping non è oggi un comando utente implementato;
se richiesta, predisporla prima di proseguire il trattamento contestato, salvo
motivo prevalente documentato. Riesaminare questa valutazione se cambiano finalità.
Questa valutazione non sostituisce le responsabilità del titolare ai sensi GDPR.

## Fornitori: documenti pubblici consultati
- Cloudflare DPA e SCC: https://www.cloudflare.com/cloudflare-customer-dpa/
- OVH ruolo/DPA: https://www.ovhcloud.com/it/personal-data-protection/faq/
- OVH Standard 24h: https://www.ovhcloud.com/it/vps/vps-backup/
- Resend: https://resend.com/security e https://resend.com/legal/dpa
  DPA incorporato nei termini; piani Free/Pro/Scale: email/log 30 giorni,
  backup 7 giorni, dati conservati negli USA. Il piano effettivo e le impostazioni
  open/click tracking del dominio non sono stati ispezionati in dashboard.
- Libero: https://info.libero.it/privacy/libero-mail/
  Non trasferire i termini dei dati account del fornitore alle singole email
  assistenza. Non pubblicare l'indirizzo personale del gestore.
- GDPR art. 5,6,13,17,21: https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita
- Apple: https://developer.apple.com/app-store/app-privacy-details/

## Etichette e manifest
Manifest app: email/ID Funzionalità + Analisi, acquisti Funzionalità,
interazione Analisi; aggiunta Assistenza clienti/Funzionalità per prudenza,
collegata all'utente e senza tracking. Aggiornare ASC coerentemente prima review.
L'etichetta Apple non è una base giuridica GDPR. Nessuna API required-reason
rilevata nel codice Swift proprietario/secure-storage installato. I manifest
SDK sono ispezionati anche nell'IPA; presenza non prova di conformità completa.

## Limiti da non mascherare
- Screenshot iPhone reali, selezione build e dichiarazioni ASC richiedono accesso
  al dispositivo/account: non fabbricare immagini o stato di completamento.
- API Apple Production ancora bloccata prima primo rilascio: conservare gate 0.
- Configurazione locale Wrangler del proprietario non accessibile: prima del
  prossimo deploy preservare esplicitamente observability.logs.invocation_logs=false.
