# Primo collaudo iPhone — Calcio Report

Versione di prova: branch `mobile/ios-preparation`, PR #14, API
`https://calcio-report-test.stemoro84.workers.dev`, database `calcio_users_test`.
Gli account sono separati da quelli del sito pubblico; acquisti disattivati.

## Stato aggiornato — 13 ottobre, 17:34

Build 1.0 (12.1) installata: il proprietario conferma superato il nuovo test del
modulo di cancellazione con tastiera aperta, scorrimento e pulsanti raggiungibili.
Login e accesso al pulsante recupero erano già confermati sulla 10.1.
I due difetti di layout segnalati sono chiusi. Non occorre ripetere questi test
senza nuove modifiche o regressioni. Restano distinti gli altri casi della checklist.
Actions 38417873754: test, firma/export e fase validazione/caricamento Apple riusciti.

## Esito comunicato dal proprietario — 12 ottobre

Su iPhone 16 Pro Max, build 1.0 (6.1), confermati: installazione, accesso,
ricerca Milan, sessione mantenuta dopo riapertura, recupero tramite link email
incollato e accesso con nuova password, eliminazione account.
I singoli casi negativi elencati sotto non sono stati confermati separatamente.

Difetto osservato sulla 6.1 (ora chiuso): tastiera sovrappone messaggio e campo Email e taglia il fondo
del modulo. Correzione preparata il 13 ottobre nei soli asset nativi.
Sulla nuova build verificare login, recupero e cancellazione con tastiera aperta:
nessuna sovrapposizione, campi/pulsanti raggiungibili scorrendo, chiusura accessibile,
modulo entro le aree sicure; ripetere aprendo e chiudendo la tastiera.

## Collaudo precedente: correzione tastiera, build 1.0 (10.1)

Consegna richiesta dal proprietario il 13 ottobre per il test serale.
Actions 38351540078, commit 88b44ea: 45 test e firma/export riusciti; Apple VERIFY SUCCEEDED e UPLOAD SUCCEEDED
senza errori il 13 ottobre alle 07:32 (Europe/Rome). Compilazione simulatore
riuscita. Elaborazione Apple e disponibilità nel gruppo da verificare.
Prima di provare, controllare in TestFlight che sia installata la build 10.1.
Se non compare, verificare elaborazione Apple e assegnazione al gruppo Test interno.

1. Aprire Login e toccare Email: il messaggio sopra non deve sovrapporsi al campo.
2. Passare a Password, poi scorrere fino a "Usa link di recupero": tutti i
   campi e pulsanti devono restare raggiungibili con tastiera aperta.
3. Chiudere la tastiera e riaprirla: spaziatura regolare, nessun taglio in alto.
4. Provare il modulo nuova password e quello di cancellazione, compresa la
   possibilità di annullare senza eliminare un altro account per questo test.
5. Se il layout è corretto, confermare con uno screenshot a tastiera aperta.

## Stato prima del collaudo

- Certificato e profilo Apple: verificati con archivio dispositivo firmato.
- Pacchetto IPA: esportato e validato con Apple il 12 ottobre (Actions 38209412616);
  credenziali API accettate. Build 1.0 (6.1) caricata il 12 ottobre alle 17:17
  (Actions 38268628004); elaborazione Apple e assegnazione tester da verificare.
- Email: il proprietario ha aggiunto RESEND_API_KEY al Worker test e confermato
  la ricezione l'11 ottobre alle 21:44; messaggio nella cartella spam.
- Il link ricevuto allora dura 20 minuti: richiederne uno nuovo durante il test.
- API calcistiche: CR_RELAY_URL e CR_RELAY_SECRET configurati dal proprietario
  il 12 ottobre pomeriggio. Ricerca autenticata di prova /teams?id=489 riuscita:
  HTTP 200, AC Milan, nessun errore del provider; account temporaneo eliminato.
- AUTH_PASSWORD_V2=1 confermata nella schermata test. LICENSE_SECRET resta
  separata dalla produzione. Nessun valore segreto condiviso o salvato nel repo.

## Accesso sul telefono (dopo caricamento ed elaborazione Apple)

Aprire TestFlight con l'Apple Account abilitato al test interno e installare
Calcio Report. L'icona è ancora quella provvisoria generata da Capacitor.
Per il primo collaudo non usare pagamenti o account reali di clienti.

1. Registrare un account di prova con una propria email e password nota.
2. Chiudere del tutto e riaprire l'app: la sessione deve restare attiva, entro
   le sei ore previste. Verificare anche blocco/sblocco del telefono.
3. Fare logout, chiudere e riaprire: deve chiedere nuovamente l'accesso.
4. Richiedere il recupero password nell'app. Dalla mail copiare l'indirizzo del
   pulsante di recupero (non il testo), tornare nell'app e incollarlo nel campo
   "Hai già ricevuto l'email?"; premere "Usa link di recupero".
5. Impostare una password nuova e accedere. Quella precedente deve essere rifiutata;
   lo stesso link non deve permettere un secondo cambio password.
6. Cancellare l'account: annullare una volta, provare password errata, poi usare
   password corretta e conferma ELIMINA. L'app deve uscire dall'account; dopo
   riavvio le vecchie credenziali non devono funzionare.
7. Registrarsi nuovamente con la stessa email: deve partire una nuova TRIAL.
8. Controllare modali con tastiera aperta, scorrimento e chiusura, aree sopra/sotto
   lo schermo. Segnalare blocchi o pulsanti irraggiungibili; la piccola imperfezione
   del Tab sul login desktop è già accettata e non blocca questo collaudo.
9. Dopo la configurazione del relay, verificare ricerca squadra, giornata e
   apertura dei pannelli disponibili in TRIAL. Predizione deve restare protetta.
   Il tasto PRO deve spiegare che gli acquisti non sono disponibili nella prova.

Non inviare in chat password, link di recupero o valori delle chiavi.
Annotare solo passaggio, risultato e schermata dell'eventuale errore.

## Aggiornamento del PC Windows, quando serve

Aprire PowerShell nella cartella del repository Calcio Report. Il blocco ferma
l'operazione se trova modifiche locali; non le cancella e non modifica main.
Non serve installare Xcode né ricreare certificati.

```powershell
$ErrorActionPreference = 'Stop'
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Apri PowerShell nella cartella Calcio Report.' }
if ($changes) { throw 'Ci sono modifiche locali: conservarle prima di aggiornare.' }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Download GitHub non riuscito.' }
git switch mobile/ios-preparation
if ($LASTEXITCODE -ne 0) { throw 'Cambio branch non riuscito.' }
git pull --ff-only origin mobile/ios-preparation
if ($LASTEXITCODE -ne 0) { throw 'Aggiornamento non riuscito.' }
git status --short --branch
```

## Ancora fuori da questo collaudo

Acquisti Apple, ripristino acquisti e rimborsi; backend di produzione; materiali
App Store, privacy e revisione. L'email nella spam prova la consegna, non la qualità
della consegna in posta in arrivo. Gli esiti già confermati sono riportati sopra; resta il collaudo della correzione tastiera.
