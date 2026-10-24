# Registro unico PRO — candidato del 19 ottobre 2026

Implementato sul branch release/apple-production-preparation, PR #15.
Non distribuito. Produzione e TestFlight 21.1 invariati.

## Comportamento

Il wrapper Apple può fornire ai percorsi Stripe, redeem, admin/grant e admin/adjust
un adattatore comune, dopo le verifiche originali di firma/sessione/amministratore.
L'attivazione è esplicita: PRO_LEDGER_ENABLED=1. Senza il flag il Sandbox conserva
il precedente blocco dei pagamenti legacy; il Worker standalone resta invariato
nel comportamento e non deve essere usato per la migrazione.

Una nuova tabella pro_payment_operations memorizza identità, proprietario e istante
della prima consegna prima di applicare l'evento. Una risposta persa o un tentativo
interrotto riusa quell'operazione. L'evento e la scadenza sono aggiornati insieme
nel batch atomico del registro PRO. Nessuna email, password o ricevuta firmata è
memorizzata in questa tabella.

- Stripe: firma verificata prima dell'adattatore; pagamento paid e modalità payment;
  ambiente live/test corrispondente al Worker; Payment Link PRO esplicitamente
  allowlisted. completed e async_payment_succeeded condividono l'ID della sessione.
- Redeem: i nuovi codici firmati includono versione, ID unico, account ID e data di
  emissione. Un codice vale una volta. I vecchi codici email-only richiedono
  riemissione manuale: non è possibile dedurre se siano già stati usati.
- Admin: grant/adjust partecipano allo stesso registro, incluse rettifiche negative.
  Usare body.requestId o Idempotency-Key e RIUSARLO per ritentare la stessa azione.
  Per compatibilità, se manca, viene generato un ID nuovo restituito come operationId:
  una nuova richiesta senza lo stesso ID è una nuova operazione, non un retry sicuro.
- L'ordine delle operazioni nello stesso millisecondo è persistente; non dipende
  dall'ordine alfabetico degli ID. I giorni web sopravvivono a un rimborso Apple.
- La scadenza precedente diventa baseline alla prima operazione. Scritture esterne
  concorrenti sono rilevate e bloccate, non sovrascritte silenziosamente.

## Primo intervento del proprietario: SOLO database di test

In Cloudflare D1 selezionare **calcio_users_test**, poi Console. Eseguire il contenuto
versionato di `worker/schema/pro-payment-operations.sql` una volta. Le due tabelle
Apple e le due tabelle entitlement esistono già: non reinstallare i vecchi schemi.
Questa aggiunta crea una tabella vuota e un trigger; non modifica utenti o PRO.

Non usare il database live. Non cambiare il Worker prima della conferma SQL.

## Passaggi successivi da guidare separatamente

1. Generare il bundle del Worker TEST dal commit candidato. È necessario il bundle
   completo, non worker.js né apple-handler.mjs copiati singolarmente.
2. Registrare PRO_LEDGER_CUTOVER_MS (epoch millisecondi, positivo e non futuro) per
   l'attivazione. Non modificarlo successivamente per aggirare una consegna bloccata.
3. STRIPE_PRO_PAYMENT_LINK_ID deve contenere il vero ID `plink_...` del Payment Link
   PRO nell'ambiente Stripe di test. Non è il suffisso dell'URL buy.stripe.com.
   Le notifiche Stripe live non vanno inviate al database Sandbox. Finché il link
   test non è disponibile, testare redeem/admin e tenere il webhook Stripe fuori
   dal collaudo remoto; il percorso Stripe rimane verificato automaticamente.
4. Distribuire il bundle sul solo Worker calcio-report-test mantenendo gli attuali
   binding, segreti e configurazioni Apple; poi PRO_LEDGER_ENABLED=1. Nessuna nuova
   build iOS è richiesta per questo solo blocco server.
5. Un controllo remoto mirato del registro su account sacrificabile; non ripetere
   l'acquisto/sblocco della 21.1 già accettato sul telefono.

## Cutover in produzione: ancora da eseguire

Inventariare pagamenti e codici preesistenti, salvare backup, evitare l'esecuzione
contemporanea di vecchi e nuovi writer e registrare il cutover. Un checkout creato
prima del cutover viene fermato con risposta retryable, non accreditato di nuovo:
la vecchia implementazione non aveva un registro per dimostrare se fosse già stato
consegnato. Riconciliare questi casi con i dati Stripe prima di accreditare/manualmente
migrare l'evento; non limitarsi a ritentare o retrodatare il flag.

La gestione automatica dei rimborsi STRIPE non è stata aggiunta da questo blocco;
resta la rettifica amministrativa esplicita già prevista. I rimborsi APPLE usano
il percorso verificato e il ricalcolo per sorgente esistente.

Il gate di produzione Apple resta chiuso perché manca il percorso isolato per
App Review/Sandbox. Non rimuoverlo come passaggio operativo della migrazione.

## Verifica

99 test root superati. Dieci nuovi test usano SQLite reale e includono HTTP con
firme Stripe, autenticazione admin e mint/redeem con sessione; concorrenti/duplicati,
interruzione, acquisti Apple/web e revoca, account cancellato, baseline e rettifiche.
Entrambi i bundle Worker generati. Nessuna chiamata Stripe reale, migrazione D1,
compilazione Xcode o nuova prova su iPhone è stata eseguita da questi test.

Riferimento Stripe per gli stati di pagamento e la consegna degli ordini:
https://docs.stripe.com/api/checkout/sessions
