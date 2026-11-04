# Marcatore / ammonito — verifica di fattibilità

Stato 3 novembre 2026: raccolta e audit offline implementati; **nessun modello
validato, nessuna nuova scheda pubblica, nessuna probabilità o classifica**.
13 test sintetici passano. Non sono un backtest: dati reali ancora da acquisire.

## Evidenze dal repository

- `teamFlow.js` interroga `/players?team&league&season&page` per le presenze;
  quelle risposte contengono statistiche potenzialmente riutilizzabili, ma non
  vengono necessariamente scaricate alla ricerca principale. Non promettere
  zero chiamate aggiuntive né considerare la cache presenze un dataset completo.
- Stima XI esistente: non è una probabilità di titolarità calibrata.
- `refereePanel.js`, `countCardsFromEventsDetailed`: errore eventi -> contatori
  zero. Non riusare quel risultato per il nuovo modello. Nessuna modifica al
  pannello pubblico in questa fase. Anche matching nome per iniziale/cognome
  non basta a garantire identità arbitro; questo audit usa uguaglianza esatta
  conservativa (può quindi perdere alcune partite, dichiarandone il limite).
- Relay allowlist per radice già include fixtures, players, injuries, leagues.
- Endpoint ufficiali di riferimento: https://www.api-football.com/documentation-v3
  Schemi/campi non garantiscono copertura reale: interrogare coverage della lega
  e misurare i null in ogni competizione prima di decidere il prodotto.

## Raccolta già implementata

`collect.mjs` passa esclusivamente da https://api.calcioreport.com con token di
sessione ottenuto tramite il normale login PRO. Non usa ADMIN_KEY, chiavi del
provider, chiamate dirette al relay o aggiramenti dei limiti account.

Per l'operatore tecnico, con CR_AUDIT_TOKEN già impostato privatamente:

```sh
node research/player-predictions/collect.mjs FIXTURE_ID
node --test tests/player-prediction-feasibility.test.mjs
```

Non mettere credenziali nei comandi condivisi, nei report o in Git. Il collector
non effettua login, non acquisisce credenziali dal browser e non stampa errori
upstream grezzi. Salva soltanto dati sportivi e risultati audit in `data/`, esclusa
da Git, con permessi locali restrittivi. Per studi lunghi archiviarli sul VPS in
area privata; non lasciare l'unica copia in un ambiente temporaneo.

Ogni snapshot contiene:
- partita futura NS, data/ora, competizione e stagione dalla fixture;
- coverage dichiarata della lega, XI ufficiali, indisponibili;
- tutte le pagine giocatori fino a 6 per squadra (troncamento segnalato);
- ultime 5 partite concluse della stessa lega per squadra, statistiche individuali;
- fino a 5 partite dello stesso arbitro tra le ultime 50 della lega, statistiche
  squadra per gialli/falli. Campione limitato: NON una stima stabile dell'arbitro;
- timestamp per risposta, completamento, conteggio richieste e cause di incompletezza.

Budget: fino a 40 richieste Worker per snapshot, sequenziali, deduplicazione dei
percorsi identici, nessun retry. Nel caso massimo previsto: 4 richieste iniziali,
12 pagine giocatori, 2 elenchi recenti, 10 dettagli giocatori, 1 pool arbitro,
5 statistiche = 34. Cache MISS verso il provider non misurate; non equivalgono al
numero di richieste Worker. Stop su 401/403/429 o rate limit semantico HTTP 200.
Questo è uno strumento di ricerca, NON il budget accettabile per ogni clic utente.

Audit verifica campi presenti senza scambiarli per qualità predittiva. `empty`
indisponibili significa nessuna segnalazione ricevuta, non certifica rosa sana.
Timestamp di osservazione non certifica la freschezza originaria del provider.
Occorrerà registrare anche età cache e tempi degli aggiornamenti nel campione live.

## Definizione del prodotto prima del modello

1. Principale: candidati tra i titolari ufficiali, con distribuzione dei minuti
   residui attesi; ufficiale non significa 90 minuti. Se manca una delle due XI,
   niente suggerimento principale. Versione provvisoria resta fase successiva.
2. Niente numero obbligatorio di nomi; dati insufficienti -> nessun candidato.
3. Marcatore: almeno un gol proprio nei tempi regolamentari + recupero; esclusi
   autogol e serie rigori. Rigori durante la gara contano, separati in costruzione
   del modello dai gol su azione. Definire separatamente supplementari e mercati
   bookmaker: questa funzione non pretende di riprodurne tutte le regole.
4. Ammonito: almeno un giallo durante la partecipazione in campo, deduplicato per
   giocatore/partita; un rosso diretto non è automaticamente un giallo. Panchina,
   staff, prima/dopo l'impiego e secondo giallo richiedono riconciliazione eventi
   e sostituzioni. Se la cronologia è ambigua, etichetta esito sconosciuto, non 0.
5. Visualizzare campione, dati mancanti, stato XI, aggiornamento e motivazioni.
   Nessuna percentuale prima della calibrazione fuori campione.

## Modelli da confrontare, non pesi già decisi

- Minuti: distribuzione per titolare e subentrante usando partite precedenti,
  cambio allenatore/ruolo, rientri, frequenza sostituzioni, calendario. Se indisponibili
  questi contesti, segnalarli. Mai inventare un probabile minutaggio preciso.
- Gol: baseline gol non su rigore/minuti, regolarizzata per campioni piccoli;
  confrontare con tiri e tiri in porta, forza avversaria e gol squadra previsti.
  Il rigorista va identificato tra i presenti con incertezza, non solo dal numero
  di rigori storici. Minuti e rigori non vanno conteggiati due volte.
- Giallo: modello di evento binario con esposizione ai minuti, falli individuali,
  ruolo, capacità avversaria di provocare falli. Nessun duello nominale dedotto
  soltanto da DIF/MID/ATT; diffida non implica automaticamente maggiore rischio.
- Arbitro: effetto specifico rispetto alla stessa lega/stagione, regolarizzato
  verso la media quando campione piccolo. Contesto incontri, cambi regolamentari,
  attribuzione di rigori e distribuzione gialli/falli da valutare separatamente.
  Non moltiplicare ciecamente per media gialli arbitro. Assegnazione assente o
  storico non affidabile -> analisi ammoniti incompleta, non arbitro “medio” nascosto.
- Non assumere dati xG individuali disponibili. Prima verificarne esistenza,
  significato e copertura. Tiri non sono automaticamente xG.

## Validazione che rende utile il lavoro

Prima campione operativo di circa 10 fixture Serie A (scelta logistica, NON una
validazione statistica), raccolte prima e dopo le ufficiali: quanti dati arrivano,
quanti candidati restano coperti, latenze e richieste, stato di cache.

Poi acquisizione temporale più ampia. Per partite passate NON usare gli aggregati
stagionali correnti: contengono già i risultati da prevedere. Ricostruire da
partite precedenti. Un test retrospettivo con XI nota valuta solo il caso
“ufficiali disponibili”, non dimostra cosa si sapeva a -24 ore. Per turnover,
rientri e notizie assenti dagli archivi servono snapshot prospettici.

Separare training/tuning/test per DATA e intera partita, non righe giocatore casuali.
Confrontare sugli stessi titolari/minuti eleggibili e riportare sempre la quota di
partite escluse. Baseline: miglior marcatore stagionale tra i titolari; maggiore
frequenza di partite ammonite tra i titolari, più baseline per minuti/ruolo.

Misure: Brier/log loss quando avremo probabilità, calibrazione, precisione top-1
per squadra/partita, copertura e prestazioni per fascia minuti. Incertezza stimata
raggruppando per partita; nessuna percentuale di successo “buona” scelta dopo aver
visto gli esiti. Confronto con/senza arbitro e con/senza minuti per misurare il valore
aggiunto reale. Pesi/soglie scelti sul tuning, mai sul test finale.

Condizioni per pubblicare: miglioramento ripetibile sui riferimenti semplici,
assenza di peggioramenti nascosti da esclusioni selettive, dati sufficienti nelle
leghe supportate, latenza e budget sostenibili. Se non superate, fermare il modello
prima di costruire una UI che gli dia credibilità indebita.

## Prossimo passo effettivo / limite attuale

Eseguire raccolta live con una sessione PRO autorizzata, che non è disponibile
nell'ambiente di lavoro. Non sono stati inventati fixture, risultati reali,
copertura misurata, accuratezza o benchmark. I dati nei test sono sintetici.
Dopo il primo campione produrre tabella copertura/costo e decidere quali campi
possono sostenere un modello, prima di scrivere classifiche di giocatori.
