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

## Limite attuale

Il CSV sintetico non misura l'accuratezza calcistica. Il primo risultato reale richiederà uno storico API-Football di almeno una stagione completa, salvato una sola volta e poi riutilizzato offline.

Il prossimo blocco dovrà:

1. acquisire e salvare un dataset reale senza ripetere chiamate;
2. includere più stagioni per gestire le prime giornate;
3. confrontare `poisson_dc_v1` con prior di lega, rating Elo e Dixon-Coles stimato;
4. produrre risultati separati per lega, stagione e livello di copertura.
