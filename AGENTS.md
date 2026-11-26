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

## Qualità prodotto e conversione
- ChatGPT coordina anche UX/UI, posizionamento e conversione, non soltanto sviluppo. Anticipare criticità e proporre soluzioni motivate prima che il proprietario debba individuarle. Separare proposta, implementazione e verifica.
- Ogni funzionalità visibile deve avere un obiettivo utente e un criterio di accettazione commerciale: valore comprensibile, gerarchia visiva, azione principale riconoscibile, frizioni minime, motivo per tornare. PASS tecnico non equivale a PASS prodotto.
- Per le schermate di acquisizione e PRO, verificare desktop/mobile con screenshot: messaggio chiaro, contrasto, un CTA principale, percorso di ritorno evidente; no modali automatiche, urgenze artificiali, probabilità inventate o promesse di vincita. Conservare identità Calcio Report; proporre variazioni grafiche al proprietario.
- Misurare successivamente il percorso visita -> prima analisi -> iscrizione -> ritorno -> PRO con dati aggregati, minimizzati e informativa adeguata, senza confondere eventi con persone. Non attivare analytics o nuovi tracciamenti senza incarico e approvazione.
- Prima di iniziative commerciali rilevanti: confronto mirato con prodotti concorrenti e feedback reali; distinguere ipotesi da evidenze, nessuna promessa di successo di mercato.
