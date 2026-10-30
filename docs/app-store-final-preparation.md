# Preparazione finale App Store — 30 ottobre 2026

## Evidenza verificata

Audit API in sola lettura del 30 ottobre, run 41015746779:
- App 6821570508, versione iOS 1.0 PREPARE_FOR_SUBMISSION, rilascio MANUAL.
- Build 33.1 selezionata, VALID, non scaduta; usesNonExemptEncryption=false.
- Italiano: descrizione e parole chiave presenti.
- Tre screenshot APP_IPHONE_67, tutti COMPLETE.
- https://app.calcioreport.com/support.html salvato come supportUrl.
- https://app.calcioreport.com/privacy.html salvato come privacyPolicyUrl.

Proprietario: correzioni safe area/Indisponibili accettate su iPhone;
privacy pubblicata, URL notifiche Production configurato.
Worker a30c419c-dec0-4122-bbd2-47b3a54dbf73 distribuito il 29 ottobre,
con candidato hash 9bcbc82eb0e1794432eba130116162f31269a0a605b70b82d141e1e42777a599.
GET /apple/token restituisce HTTP 503 APPLE_PURCHASES_DISABLED.
Non ripetere build/upload/screenshot Store/deploy/HMAC o acquisti già accettati.

## Punto aperto confermato: prodotto PRO30

API: IAP 6822393280, com.calcioreport.app.pro30,
NON_RENEWING_SUBSCRIPTION, stato MISSING_METADATA.
Nome e descrizione italiani presenti; screenshot per App Review assente.

Passo operativo successivo, quando il proprietario è disponibile:
aprire la scheda del prodotto PRO30 e la sezione Informazioni per la revisione.
Per abbonamenti non rinnovabili la guida Apple indica:
Monetizzazione > Abbonamenti > Abbonamenti non rinnovabili > Gestisci.
Predisporre una cattura reale della 33.1 che mostri l'offerta PRO e caricarla
come screenshot di revisione del prodotto. È distinta dai tre screenshot
pubblici della pagina Store. Non generare una schermata fittizia, non eseguire
un acquisto solo per ottenere la cattura e non attivare il gate Production.

Dopo il salvataggio verificare il nuovo stato: questo audit non determina
se manchino anche prezzo/disponibilità o altri campi. Non promettere che
il solo screenshot risolva ogni requisito.

Prima submission: includere prodotto e versione app nella stessa submission.
Non è ancora stata verificata la loro associazione. Nessun invio eseguito.

Fonti ufficiali consultate il 30 ottobre:
- https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/view-and-edit-in-app-purchase-information
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-inapppurchasesv2

## PR16: diagnosi notifiche

PR16 resta draft aperta, non integrata, head 5882d41b5a5ff8f0f87a280b0fdff09afe6e15ee.
La patch aggiunge log processed/ignored/error e transactionId verificato.
Non cambia risposte HTTP o logica di accredito. Il valore database è review
oppure test: su Production sarebbe inesatto. Le otto prove coprono Sandbox,
non Production. Evitare merge automatico del vecchio ramo e del suo storico.

Questo è un residuo diagnostico, non evidenza di accrediti live errati.
Prima di adottarlo su Production servono classificazione live corretta e
prove mirate che mantengano isolamento, esclusione segreti e gate.
Nessuna riattivazione Invocation logs necessaria. Non ripetere notifiche
Sandbox già accettate soltanto per produrre un evento nel log.

## Limiti della verifica e primo rilascio

L'audit non certifica contratti fiscali/bancari, disponibilità paesi/prezzi,
classificazione età, contenuto completo delle note review o account review.
Le credenziali review non sono state lette né stampate.
La pubblicazione privacy è confermata dal proprietario, non da questo audit.

Apple Production resta 0. Il controllo API Apple Production va ripreso quando
cambia lo stato di pubblicazione, secondo docs/apple-first-activation.md;
non fare retry arbitrari del vecchio 401. Eventuale finestra iniziale TRIAL
con acquisti disabilitati richiede una decisione esplicita prima del rilascio.
La semplice approvazione Apple non prova accesso alle API Production.
Rilascio manuale mantenuto; invio review e pubblicazione non eseguiti.
