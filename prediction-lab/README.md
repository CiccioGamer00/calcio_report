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
