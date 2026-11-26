# Calcio Report — Regole operative del team

## Prima di iniziare
- Leggere questo file, le prime 30 righe di PROJECT_STATUS.md (checkpoint attuale) e la sola attività assegnata in docs/TASK_BOARD.md. Il resto dello stato è storico: consultarlo solo per una dipendenza specifica.
- Verificare branch, commit e PR; non ripetere lavoro o test con esito documentato salvo modifiche pertinenti.
- Una attività per agente: obiettivo, file ammessi, dipendenze, test e condizione di stop. Non prendere altre attività senza incarico. Non riscrivere pannelli funzionanti.
- ChatGPT coordina, fa review e piccole modifiche. Codex: implementazione e test mirati. Work: browser e collaudo operativo. GitHub conserva consegne e decisioni.
- Commit piccoli e coerenti; annotare SHA, test effettivi, blocchi e singola prossima azione anche se incompleto. Non dichiarare PASS senza evidenza.

## Vincoli
- main stabile; core-v2 storico. Operare sul branch assegnato; niente merge/deploy o modifica produzione senza approvazione. Nessun segreto in repo/chat/log.
- Browser -> Cloudflare Worker -> edge cache -> relay OVH HMAC -> API-Football. Nessuna chiamata diretta da frontend, niente fallback diretto. Cache solo successi reali; HTTP 200 con errors è errore.
- Conservare UI, async/searchId, commit atomico team/fixture, pannelli indipendenti on-demand, stima formazione esplicita, badge TRIAL/PRO/SCADUTO e pagamenti. TRIAL 7 giorni/5 match distinti al giorno.
- Test con dati sintetici e DB isolato; non spendere API reali per regressioni. Non toccare Apple, relay, produzione o altre milestone salvo incarico esplicito.
- Utente non programmatore: niente F12 se diagnosticabile in app; se indispensabile un intervento, fornire un unico comando o blocco coerente.
- Non rileggere core-v2 per ogni microtask: la sua documentazione è storica. PROJECT_STATUS.md rimane la fonte operativa aggiornata in cima.
