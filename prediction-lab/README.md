# Prediction Lab

Ambiente offline per misurare il modello di predizione prima di modificare la scheda pubblica.

## Obiettivo del primo blocco

Il laboratorio riproduce il nucleo `poisson_v1_3_dc_cached` del Worker e lo valuta in ordine cronologico. Per ogni partita usa esclusivamente le partite concluse prima del suo calcio d'inizio.

Le partite con lo stesso orario vengono elaborate come un unico blocco: tutti i pronostici sono calcolati prima di aggiungere i relativi risultati allo storico. Questo impedisce una forma sottile di contaminazione temporale.

Il laboratorio non chiama API-Football e non modifica il Worker.

## Formato dello storico

CSV UTF-8 con queste colonne obbligatorie:

```text
date,league,season,home_team,away_team,home_goals,away_goals
```

Colonna facoltativa:

```text
fixture_id
```

Regole:

- `date`: data/ora ISO, preferibilmente UTC;
- una riga per partita terminata;
- gol interi e non negativi;
- nessun duplicato;
- il file può contenere più leghe e stagioni: vengono separate automaticamente.

## Primo test

Da PowerShell, nella cartella del progetto:

```powershell
git fetch origin codex/prediction-lab-baseline
git switch codex/prediction-lab-baseline
node tests/prediction-lab-backtest.test.mjs
```

Il risultato atteso termina con:

```text
"status": "PASS"
```

## Esempio completo

Il dataset incluso è sintetico e serve soltanto a collaudare il motore:

```powershell
node prediction-lab/backtest.mjs prediction-lab/demo-fixtures.synthetic.csv
```

Per conservare anche ogni previsione:

```powershell
node prediction-lab/backtest.mjs prediction-lab/demo-fixtures.synthetic.csv --json=prediction-lab/report.json
```

Il file `report.json` è un artefatto locale e non deve essere committato.

## Lettura delle metriche

- **Accuratezza 1X2**: più alta è meglio, ma da sola non valuta la qualità delle probabilità.
- **Log loss**: più bassa è meglio; penalizza molto le previsioni sicure ma sbagliate.
- **Brier**: più basso è meglio; misura la distanza tra probabilità e risultato.
- **Ranked Probability Score**: più basso è meglio; considera l'ordine casa/pareggio/trasferta.
- **Errore calibrazione**: più basso è meglio; confronta sicurezza dichiarata e frequenza reale.
- **Risultato esatto** e **MAE gol attesi**: indicatori secondari.

Il riepilogo mostra due campioni:

1. tutte le partite, riproducendo anche il comportamento legacy senza storico;
2. solo partite con almeno 8 incontri precedenti nella lega e 3 per entrambe le squadre.

Il filtro di copertura non è ancora un nuovo modello: serve a misurare separatamente quanto il vecchio algoritmo dipenda dalla disponibilità di dati.

## Raccolta di una stagione reale

La pagina locale `prediction-lab/collect.html` riutilizza il login dell'app sullo stesso `localhost:5500`. Non mostra e non salva il token.

Procedura:

1. avvia il server locale e accedi normalmente all'app;
2. apri `http://localhost:5500/prediction-lab/collect.html`;
3. lascia `135` e `2025` per la Serie A 2025/26;
4. premi una sola volta **Scarica stagione in CSV**;
5. conserva il CSV nella cartella `prediction-lab/data/`.

Il download esegue una richiesta al Worker per l'intera competizione/stagione. Eventuali pressioni ripetute non sono necessarie. La pagina accetta solo partite concluse e segnala errori semantici API-Football.

Il convertitore può essere verificato senza chiamate di rete:

```powershell
node tests/prediction-lab-collector.test.mjs
```

## Confronto con la stagione precedente

Dopo aver conservato due stagioni in `prediction-lab/data/`, il confronto 2025/26 con memoria 2024/25 si esegue con:

```powershell
node prediction-lab/compare-previous-season.mjs "prediction-lab\data\serie-a-2025-fixtures.csv" "prediction-lab\data\serie-a-2024-fixtures.csv" --weight=0.35 --json="prediction-lab\reports\serie-a-2025-previous-season.json"
```

Il peso `0.35` rende ogni partita della stagione precedente meno influente di una partita corrente. Il suo contributo diminuisce automaticamente mentre cresce lo storico della nuova stagione.

Il report confronta:

- intera stagione;
- prime 30 partite;
- prime 50 partite;
- partite con copertura minima.

Il test automatico usa stagioni sintetiche e verifica anche che uno storico datato dopo la stagione target venga ignorato:

```powershell
node tests/prediction-lab-previous-season.test.mjs
```

## Limite attuale

Il CSV sintetico non misura l'accuratezza calcistica. Il primo risultato reale richiederà uno storico API-Football di almeno una stagione completa, salvato una sola volta e poi riutilizzato offline.

Il prossimo blocco dovrà:

1. acquisire e salvare un dataset reale senza ripetere chiamate;
2. includere più stagioni per gestire le prime giornate;
3. confrontare `poisson_dc_v1` con prior di lega, rating Elo e Dixon-Coles stimato;
4. produrre risultati separati per lega, stagione e livello di copertura.

## Selezione del peso senza contaminare il test finale

Il peso della stagione precedente viene scelto usando Serie A 2023/24 come storico e Serie A 2024/25 come target di sviluppo. Il comando salva nel report anche l'identità dei due dataset (lega, stagione, numero di partite e intervallo temporale):

```powershell
node prediction-lab/tune-previous-season-weight.mjs "prediction-lab\data\serie-a-2024-fixtures.csv" "prediction-lab\data\serie-a-2023-fixtures.csv" --json="prediction-lab\reports\serie-a-2024-weight-tuning.json"
```

La griglia predefinita prova i pesi da `0.00` a `1.00` a intervalli di `0.05`. La scelta minimizza la log loss dell'intera stagione; sono ammessi soltanto pesi che non peggiorano la log loss né sull'intera stagione né sulle prime 50 partite rispetto al peso zero. RPS, Brier e infine il peso più basso risolvono eventuali parità.

Il controllo automatico è offline:

```powershell
node tests/prediction-lab-weight-tuning.test.mjs
```

## Test finale con peso bloccato

Serie A 2025/26 viene valutata con un comando separato che legge il peso già scelto dal report. Il comando non contiene una nuova ricerca dei pesi e rifiuta l'esecuzione se:

- il report non certifica che il test finale sia rimasto fuori dalla taratura;
- il CSV 2024/25 non coincide con il target usato durante la scelta;
- lega o ordine cronologico non coincidono con il protocollo;
- lo storico contiene partite contemporanee o future rispetto al test.

```powershell
node prediction-lab/evaluate-locked-weight.mjs "prediction-lab\reports\serie-a-2024-weight-tuning.json" "prediction-lab\data\serie-a-2025-fixtures.csv" "prediction-lab\data\serie-a-2024-fixtures.csv" --json="prediction-lab\reports\serie-a-2025-locked-weight.json"
```

Verifica offline delle protezioni:

```powershell
node tests/prediction-lab-locked-weight.test.mjs
```

Il risultato con il nuovo peso bloccato va generato una sola volta. Il 2025/26 era già stato osservato nel confronto preliminare con peso sperimentale `0.35`: non viene usato dalla procedura di selezione, ma non può essere definito un holdout mai visto. Se il risultato bloccato non è favorevole, non si modifica il peso sulla stessa stagione; si registra l'esito e si riserva una stagione futura alla conferma completamente indipendente.

## Esperimento forza degli avversari

Il rating Elo aggiunge un'informazione che il conteggio grezzo dei gol non contiene: la qualità degli avversari già affrontati. La prima versione, che modificava direttamente le lambda della partita corrente, è stata respinta sul target di sviluppo 2024/25 perché peggiorava la log loss delle prime 50 partite.

La seconda versione usa Elo per normalizzare i gol delle partite storiche: segnare contro un avversario forte vale leggermente di più, mentre subire gol dallo stesso avversario pesa leggermente meno. Questo affronta direttamente casi come due gol subiti da una squadra di vertice rispetto a due gol subiti da una squadra debole. Anche questa variante è stata respinta sullo sviluppo 2024/25: il coefficiente selezionato è rimasto `0.00` e la stagione finale non è stata letta.

Proprietà del protocollo:

- rating separati per lega;
- inizializzazione dalla stagione precedente e regressione prudente verso la media al cambio stagione;
- aggiornamento solo dopo il risultato;
- partite allo stesso orario elaborate in blocco;
- il fattore campo è usato nell'aggiornamento Elo, ma non viene applicato due volte alle lambda Poisson;
- il rating dell'avversario al momento della partita normalizza i gol fatti e subiti con un coefficiente da selezionare;
- coefficiente `0` riproduce esattamente il modello con memoria della stagione precedente.

Scelta del coefficiente su 2024/25, usando 2023/24 come storico e il peso precedente già bloccato a `1.00`:

```powershell
node prediction-lab/tune-opponent-strength.mjs "prediction-lab\data\serie-a-2024-fixtures.csv" "prediction-lab\data\serie-a-2023-fixtures.csv" --previous-weight=1 --json="prediction-lab\reports\serie-a-2024-opponent-strength-tuning.json"
```

Valutazione una tantum su 2025/26 con coefficiente bloccato:

```powershell
node prediction-lab/evaluate-locked-opponent-strength.mjs "prediction-lab\reports\serie-a-2024-opponent-strength-tuning.json" "prediction-lab\data\serie-a-2025-fixtures.csv" "prediction-lab\data\serie-a-2024-fixtures.csv" --json="prediction-lab\reports\serie-a-2025-locked-opponent-strength.json"
```

Il controllo automatico, senza rete, verifica equivalenza a coefficiente zero, isolamento temporale, blocco degli incontri contemporanei, esclusione di uno storico futuro e protocollo finale bloccato:

```powershell
node tests/prediction-lab-opponent-strength.test.mjs
```

Il protocollo `schedule_strength_tuning_v2` impedisce di riutilizzare per errore un vecchio report della prima versione. Il codice resta sperimentale finché il confronto reale non mostra un miglioramento robusto di log loss, Brier e RPS. L'accuratezza 1X2 viene registrata, ma non decide da sola la promozione.

## Esperimento forza dinamica attacco/difesa

La terza iterazione non applica più un moltiplicatore Elo ai gol o alla singola partita. Mantiene per ogni squadra due valori latenti, attacco e difesa, aggiornati cronologicamente attraverso il residuo Poisson rispetto ai gol realmente osservati. Il valore dell'avversario entra quindi nel calcolo strutturalmente: segnare contro una difesa stimata forte aggiorna l'attacco in un contesto diverso rispetto a segnare contro una difesa debole.

Le intensità prodotte dal modello dinamico vengono combinate in scala logaritmica con quelle del modello corrente. Il parametro `blend=0` riproduce esattamente la baseline e permette di respingere automaticamente l'esperimento. Il tuner prova tre learning-rate e blend da `0.0` a `1.0`, mantenendo lo stesso vincolo: né la log loss complessiva né quella delle prime 50 partite possono peggiorare rispetto alla baseline.

Taratura sul solo sviluppo 2024/25:

```bash
node prediction-lab/tune-team-strength.mjs "prediction-lab/data/serie-a-2024-fixtures.csv" "prediction-lab/data/serie-a-2023-fixtures.csv" --previous-weight=1 --json="prediction-lab/reports/serie-a-2024-team-strength-tuning.json"
```

Test automatico offline:

```bash
node tests/prediction-lab-dynamic-team-strength.test.mjs
```

Il protocollo `dynamic_team_strength_tuning_v3` conserva il target finale fuori dalla selezione. `evaluate-locked-team-strength.mjs` potrà leggere il 2025/26 soltanto se lo sviluppo sceglierà un blend positivo.

## Indisponibili e valore relativo al sostituto

Il progetto del correttivo è descritto in `prediction-lab/PLAYER_AVAILABILITY.md`. Non è ancora collegato alla predizione: prima servono snapshot pre-partita utilizzabili in un backtest cronologico.
