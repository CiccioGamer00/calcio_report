# Prediction Lab — conservazione dati

I file scaricati da API-Football sono dataset di lavoro privati e non vengono pubblicati nel repository.

Struttura locale consigliata:

```text
prediction-lab/
  data/
    serie-a-2025-fixtures.csv
  reports/
    serie-a-2025-poisson-dc-v1.json
```

Regole:

- il CSV originale resta immutato;
- ogni nuovo download usa un nome con competizione e stagione;
- i report generati vanno in `reports/`;
- `data/` e `reports/` sono esclususe da Git;
- conservare una copia di sicurezza privata del CSV;
- non includere chiavi, token o intestazioni di autenticazione.

Il CSV delle partite può essere riutilizzato senza chiamate API per:

- confrontare versioni successive del modello;
- analizzare medie gol casa/trasferta;
- frequenze 1X2, Over/Under e Goal/No Goal;
- forma e rendimento per squadra;
- stabilità del modello nelle prime giornate;
- calibrazione delle probabilità;
- testare Elo, Dixon-Coles stimato, CatBoost/XGBoost e ensemble.

Limite: questo dataset contiene data, competizione, squadre e risultato finale. Non contiene automaticamente xG, tiri, corner, formazioni, indisponibili o quote; queste informazioni richiedono snapshot separati e nuove chiamate dedicate.
