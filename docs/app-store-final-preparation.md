# Preparazione scheda App Store — 27 ottobre 2026

## Pronto
- Icona approvata integrata al commit 445c490; richiede nuova build.
- support.html: pagina statica italiana, contatto già configurato support@calcioreport.com,
  accesso, ripristino PRO, cancellazione account e community. Nessun tracker,
  form o risorsa esterna incorporata. Solo candidata sul branch release.
- Scheda 1.0: proprietario conferma credenziali/contatti/note, rilascio manuale,
  descrizione/parole chiave/copyright. 29.1 associata, crittografia risolta.

## Privacy: evidenze e punti aperti
Questa è una verifica tecnica preliminare, non una dichiarazione pubblicata.
Apple richiede policy pubblica e risposte coerenti con raccolta app e partner:
https://developer.apple.com/app-store/app-privacy-details/
https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/

Dati già noti dal progetto da includere nella verifica delle etichette:
- Email e identificativo account: autenticazione e gestione accesso.
- Acquisti/diritti PRO e transazioni: associati all'account.
- Ultima attività e quote ricerche: verificare granularità e conservazione effettive.
- Interesse community: account_id + created_at, deduplicato e cancellato con
  account; il solo totale visibile in admin NON rende anonimo il record sorgente.
  Valutare categoria interazione prodotto e finalità effettiva (misurazione
  interesse); non dichiarare automaticamente dato non collegato all'utente.
- Servizi Cloudflare, OVH, email e Apple: verificare dati/log e conservazione;
  non dichiarare assenza di raccolta terze parti senza verifica.
- Dipendenze native includono Capacitor e secure-storage: verificare manifest
  privacy nel prodotto compilato. Nessuna modifica di dichiarazioni eseguita.

Mancano policy pubblica attuale/URL e risposte App Privacy già inserite,
conservazione reale dei log e conferma operatività della casella di supporto.
Non inventare termini legali o conservazioni. Recuperare la policy già usata
prima di sostituirla; assenza di file nel repo non prova assenza sul sito.

## Pubblicazione assistenza
support.html e assets/branding/calcio-report-icon.png devono essere distribuiti
sull'hosting del dominio scelto e verificati da visitatore non autenticato.
NON inserire in App Store Connect un URL ancora non pubblicato/verificato.
Main rimane invariato; nessuna pagina è stata pubblicata con questo commit.

## Prima della build finale
Chiudere eventuali modifiche native (link privacy e manifest), poi avviare una
sola nuova candidata Production con la procedura esistente. Verificare icona
effettiva nell'archive esportato, backend e firma. Non riusare il piano upload
fissato sulla 29.1 per un nuovo artefatto.

## Passaggi col proprietario
1. Recuperare URL policy attuale e schermata App Privacy in un unico passaggio.
2. Concordare/pubbicare assistenza e aggiornamenti privacy necessari.
3. Nuova build firmata e upload da distinguere dall'invio review.
4. Screenshot reali della versione corrente: ricerca/match, Indicatori e
   Predizione; niente schermate inventate o dati personali. Verificare anche
   famiglie dispositivi effettivamente supportate, senza fabbricare screenshot.
5. Associare nuova build e prodotto IAP; completare controlli residui:
   notifiche Production, gate candidato ancora non distribuito, piano primo
   rilascio/API Production, PR16 audit. Non trattare come tutto già pronto.
6. Consenso finale a review/pubblicazione separato. Rilascio manuale mantenuto.
