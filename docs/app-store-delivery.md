# Consegna della candidata App Store 29.1

La pagina Distribuzioni > iOS 1.0 mostrata dal proprietario non ha ancora una
build associata. La candidata 29.1 è firmata ma finora non caricata su Apple.
Non selezionare la vecchia build internal-only e non premere Aggiungi alla verifica.

## Artefatto esistente, nessuna ricompilazione

deploy/app-store-candidate.json identifica repo, branch, run 40372908094,
commit 047c45140d350b81c17a637dd843d02e9a3247d8, artifact ID 12672364036 e
digest dell'archivio. Scadenza attuale 29 ottobre 2026.
Il workflow dedicato scarica soltanto questo artefatto dopo averne controllato
provenienza e successo del run. Rifiuta fork, branch/commit diversi e scadenza.

scripts/prepare-ios-upload.py controlla anche manifest, hash IPA, bundle,
versione 1.0, build 29.1, backend Production e assenza pagamenti web.
Non modifica o rifirma il pacchetto. I certificati di distribuzione non servono
per questo passaggio perché la firma è già nel file.

## Due modalità distinte

Workflow: .github/workflows/ios-app-store-delivery.yml.
Permessi GitHub: contents/read e actions/read; chiave Apple solo nello step finale.
Usa le credenziali APP_STORE_CONNECT_* già predisposte per gli upload precedenti.
Non sono la chiave In-App Purchase né il segreto HMAC del verifier.

- validate: xcrun altool --validate-app; nessun caricamento.
- upload: ripete la validazione e usa --upload-app, soltanto su richiesta esplicita.
  La consegna avvia l'elaborazione App Store Connect; non seleziona la build,
  non invia App Review e non pubblica l'app.

Il dispatch ha delivery_mode=validate come default. Se il workflow non è esposto
sul default branch, il trigger push sul branch release richiede messaggio esatto:
release: validate App Store candidate 29.1
oppure, solo dopo autorizzazione al caricamento:
release: upload App Store candidate 29.1
Il commit deve modificare un percorso incluso nel trigger (per esempio il piano).
L'upload non può essere attivato da un evento validate. I push non sono rigiocabili
a run_attempt successivo: un nuovo tentativo necessita di nuova richiesta.
La chiave privata viene scritta solo nella directory temporanea protetta e rimossa
all'uscita. Mai inserirla in artefatti, repository, log o conversazioni.

## Evidenze

Sei test locali passati su artefatto sintetico: sorgente corretta, run/fork/commit
errati, artefatto scaduto/sostituito, manifest interno o build obsoleta, hash
manomesso/backend errato e separazione della richiesta validate da upload.
Bash e YAML verificati. La validazione Apple remota è un'evidenza separata,
da annotare soltanto dopo il risultato effettivo del workflow.

Dopo la validazione chiedere il consenso concreto al SOLO caricamento della
29.1, se non ancora espresso. App Review, pubblicazione e attivazione acquisti
rimangono decisioni successive. Prima della review completare metadati, privacy,
note account review trasparenti e il piano Apple Production già documentato.
