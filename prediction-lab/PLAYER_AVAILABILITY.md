# Prediction Lab — valore giocatori e indisponibili

## Decisione

Gli indisponibili possono contribuire al modello, ma il segnale corretto non è il valore assoluto del giocatore. È la perdita rispetto al miglior sostituto realmente disponibile nello stesso ruolo.

Questo evita di penalizzare allo stesso modo:

- una squadra senza un titolare ma con una riserva quasi equivalente;
- una squadra senza lo stesso titolare e senza un ricambio adeguato;
- una singola assenza e più assenze concentrate nello stesso reparto.

La prima versione deve restare separata dalla previsione pubblica finché un backtest cronologico non dimostra un vantaggio.

## Dati utilizzabili

Per ogni partita, prima del calcio d'inizio, occorre salvare uno snapshot con:

- indisponibili confermati e motivo;
- rosa disponibile;
- ruolo naturale;
- presenze, minuti e titolarità nella competizione;
- utilizzo nelle ultime partite concluse;
- formazione ufficiale, se già pubblicata;
- data e ora esatte dello snapshot.

Gli endpoint già usati dall'app (`/injuries`, `/players`, `/players/squads` e `/fixtures/lineups`) possono fornire parte del materiale. Il CSV storico dei risultati non basta e non permette di ricostruire retroattivamente ciò che era noto prima del match.

## Punteggio proposto

Per ogni giocatore si calcola un punteggio di importanza pre-partita usando solo dati già disponibili:

1. quota di minuti della squadra;
2. quota di titolarità;
3. utilizzo recente, con peso limitato;
4. contributo offensivo o difensivo normalizzato per ruolo;
5. specificità del ruolo, soprattutto portiere e centravanti.

Per ogni indisponibile:

```text
perdita = max(0, importanza_titolare - importanza_miglior_sostituto)
```

La perdita di squadra usa rendimenti decrescenti e un limite massimo. La prima assenza importante conta; la quarta non può moltiplicare senza controllo l'effetto delle precedenti.

## Effetto candidato sul modello

Il correttivo deve distinguere il reparto:

- portiere/difensori: possibile aumento limitato della lambda avversaria;
- centrocampisti: piccolo effetto ripartito tra creazione e protezione;
- attaccanti: possibile riduzione limitata della lambda della propria squadra.

I limiti numerici non vanno scelti sulla singola partita. Devono essere selezionati su una stagione di sviluppo e poi bloccati prima della stagione di test. Come punto di partenza per la griglia, non per la produzione:

- effetto massimo per singolo giocatore: `2–5%` sulla lambda interessata;
- effetto massimo combinato per squadra: `8–15%`;
- nessuna modifica quando il sostituto ha un valore stimato equivalente;
- attenuazione forte quando i dati del giocatore sono scarsi.

## Formazione ufficiale e stima

La formazione ufficiale ha priorità. Quando è disponibile, il modello deve confrontare l'undici reale con l'undici base atteso e non sommare una seconda volta l'effetto degli indisponibili.

La formazione stimata dell'app non è una prova di assenza e non deve produrre da sola una penalizzazione numerica. Può solo aiutare a identificare il sostituto probabile, accompagnata da confidenza bassa.

## Regole anti-fuorviante

- niente valore di mercato come scorciatoia;
- niente penalità uguale per tutti i nomi;
- niente uso di notizie o formazioni pubblicate dopo il calcio d'inizio;
- niente somma lineare illimitata delle assenze;
- distinguere `nessun indisponibile` da `dato non disponibile`;
- mostrare all'utente l'impatto come correttivo stimato, non come certezza.

## Percorso di validazione

1. raccogliere snapshot pre-partita senza cambiare la predizione;
2. misurare copertura, stabilità e qualità dei dati;
3. costruire il punteggio relativo al sostituto;
4. scegliere i limiti solo sulla stagione di sviluppo;
5. bloccare i parametri;
6. confrontare sulla stagione successiva log loss, Brier, RPS e calibrazione;
7. integrare nel Worker solo se il miglioramento è robusto e non limitato a poche partite.
