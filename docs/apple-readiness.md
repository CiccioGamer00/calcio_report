# Diagnostica Worker → verifier Production

Il controllo colma il percorso rimasto aperto: una richiesta dal Worker pubblico
al verifier Production con il segreto già installato. Non ripete provisioning,
TLS, prove da OVH o autenticazione alle API Apple.

## Endpoint amministrativo

POST /admin/apple-readiness, con la consueta x-admin-key.
Le sessioni review non possono accedere agli endpoint /admin/.
Nessun URL, segreto o payload può essere selezionato dal chiamante.

Richiede configurazione server Production e origine esatta
https://apple.calcioreport.com. Il Worker firma POST /v1/transaction con corpo {}.
Firma e trasporto sono condivisi con il client delle transazioni reali.
Il server OVH controlla la firma prima del payload e risponde 400 BAD_INPUT.
Non viene raggiunto il reconciler Apple. Non viene letto o scritto D1.

Esito accettato: HTTP 200, ok:true, verifier:HMAC_OK_BAD_INPUT, upstreamStatus:400.
401 del verifier, redirect, 200 inatteso, altro 400, risposta eccessiva o errore
rete non sono successi. Al client arrivano soltanto stato e codici fissi, mai
segreti, token, corpo o dettagli grezzi del provider.

Un controllo superato prova firma/configurazione/percorso Worker→OVH; non prova
autenticazione API Apple Production, acquisto, accredito o notifica Production.

## Candidato e distribuzione

Bundle deploy/apple-readiness-worker-candidate.mjs, 110122 byte.
SHA256 dd2dc9ff804c12df859a3fd4935acd62a8400cad23e30287e20ff521df3e7c1b.
Build esbuild 0.28.2. Trenta test mirati superati, incluso il vero verifier Node
su loopback, con reconciler e DB interdette alla diagnostica.
Smoke del bundle: diagnostica senza admin 403; community senza login 401;
gate Apple chiuso 503.

Distribuire da una copia della configurazione community già verificata,
cambiando soltanto main. Preservare DB/APP_REVIEW_DB, route, segreti, flag e cutover.
Dry-run prima del deploy --keep-vars. Nessuna migrazione D1.
Il gate sorgente APPLE_PRODUCTION_NOT_READY e APPLE_PRODUCTION_ENABLED=0 restano.

## Requisiti successivi per il primo rilascio

Dopo l'esito remoto chiudere questa verifica, senza ripeterla arbitrariamente.
Restano da preparare separatamente:
- sostituzione del blocco sorgente con condizioni di attivazione verificabili,
  conservando flag 0 fino alla decisione esplicita;
- configurazione notifiche Production e accettazioni residue del registro;
- note Apple trasparenti sul percorso review/Sandbox isolato, privacy (incluso
  l'interesse community associato all'account), metadati e caricamento finale;
- sequenza di primo rilascio e attivazione che tenga conto dell'accesso API Apple
  non disponibile prima della prima release, secondo il chiarimento primario
  https://github.com/apple/app-store-server-library-java/issues/92 .

Il confronto già accettato è Production 401 / Sandbox 200 sullo stesso JWT.
Non rigenerare chiavi o rifare tali richieste per completare questa diagnostica.
Non dichiarare vendite Production pronte soltanto perché il collegamento HMAC passa.
