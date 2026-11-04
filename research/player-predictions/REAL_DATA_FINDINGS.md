# Primo controllo reale — 4 novembre 2026

Analisi offline dello snapshot prospettico Venezia–Udinese (1550196), raccolto
il 3 novembre 2026 alle 16:38 UTC attraverso il Worker autenticato.
20 richieste, tutte MISS; 5 partite storiche per squadra. Nessun pronostico.

| Squadra | Presenze con minuti > 0 | Tiri disponibili | Tiri in porta | Gol | Gialli | Falli |
|---|---:|---:|---:|---:|---:|---:|
| Venezia | 78 | 56 | 52 | 48 | 78 | 55 |
| Udinese | 80 | 62 | 51 | 49 | 80 | 59 |

Sono osservazioni giocatore-partita, non giocatori unici. Esclusi dal denominatore
52 record con zero minuti e 35 con minuti mancanti. Null resta sconosciuto:
non è dimostrato che significhi zero tiri/gol/falli.

In 6 schede squadra-partita su 10, games.substitute=false compare per 15–16
calciatori con minuti positivi, e per 23–26 includendo tutta la distinta.
Non è una titolarità utilizzabile. Le altre 4 hanno 11 titolari dichiarati,
ma il solo conteggio coerente non ne prova la correttezza.

Decisioni:
- Non stimare probabilità di partenza da questo flag senza incrocio con XI
  ufficiali storici ed eventi di sostituzione.
- Non imputare a zero i campi null; verificare eventi gol/cartellini e copertura.
- Gialli numericamente presenti per tutte le presenze analizzate NON dimostra
  corretta attribuzione sul campo: restano panchina, espulsioni e secondo giallo.
- Target senza XI ufficiali e arbitro assegnato al momento dello snapshot:
  effetto arbitro non ancora verificato, nessun ranking da pubblicare.
- Il costo osservato è della raccolta di ricerca, non un budget accettabile
  da replicare per ogni visita: progettare riuso/cache prima dell'integrazione.

recent-quality.mjs esegue il controllo offline; test sintetici + regressione:
16 passati. Modulo di ricerca separato, non ancora integrato nella pagina lab.
La sessione PRO non è persistita nella ripresa del 4 novembre; nessuna nuova
raccolta autenticata eseguita oggi. Il secondo risultato Genoa–Milan osservato
nella sessione precedente non è incluso: manca qui lo snapshot completo.

Prossimo passo: raccogliere XI storici + eventi sulle sei anomalie; misurare
coerenza ID, sostituzioni e timing dei cartellini, quindi ampliare il campione.
Questi dati verificano fattibilità, non precisione predittiva né calibrazione.
