# Preparazione produzione e App Store — 22 ottobre 2026

Fonte operativa: PROJECT_STATUS.md. Preparazione attiva su
release/production-preflight, derivato dal candidato con audit notifiche.
Nessun deploy pubblico, merge main o invio ad App Review autorizzato da questo documento.

## Completato: non ripetere

- TestFlight 27.1: sessione review, login riservato, Milan, acquisto Sandbox,
  badge PRO e apertura immediata Indicatori/Predizione accettati su iPhone.
- Acquisto persistito in calcio_users_review.
- Storico Apple firmato: ONE_TIME_CHARGE della stessa transazione, consegna SUCCESS;
  corrispondente chiamata a calcio-report-test con HTTP 200.
- Worker TEST con audit notifiche distribuito dal proprietario.
- Registro pagamenti candidato e isolamento review implementati; 126 test root passati.
- Credenziali review conservate privatamente, mai in Git.

La correlazione storica non contiene un log del database scelto dal vecchio handler.
Non inventare una nuova scrittura del database provocata dalla notifica.

## Passaggio attuale: inventario pubblico di sola lettura

1. In Cloudflare identificare il Worker che serve api.calcioreport.com
   (atteso calcio-report-proxy) e il database collegato alla variabile DB.
   Registrare nome e UUID, confrontandoli con test/review per escludere alias.
2. Nel database identificato eseguire
   worker/schema/production-preflight-readonly.sql.
   Non installare gli schemi finché non si conoscono le tabelle esistenti.
3. Inventariare in forma aggregata utenti/PRO e modalità attive di pagamento,
   codici emessi e checkout Stripe precedenti alla migrazione.
   Nessuna password, email o chiave va pubblicata nel repository.

## Preparazione successiva

- Backup D1 con procedura di ripristino prima delle modifiche.
- Migrazione additiva delle sole tabelle/trigger mancanti, verificata su copia;
  preservare paid_until come baseline e gestire i checkout pre-cutover.
- Attivazione coerente di tutti i writer PRO: Stripe, redeem, grant, adjust e Apple.
  Il cutover pubblico deve essere distinto da quello test e non retrodatato.
- Verificatore Production separato su OVH, con app Apple ID numerico, segreto,
  servizio/porta e HTTPS dedicati. Conservare Sandbox esistente.
- Binding review e segreto di sessione dedicato sul candidato pubblico;
  credenziali e percorso Sandbox dichiarati nelle note Apple.
- Rimuovere il gate sorgente Production solo con prerequisiti implementati e testati;
  mantenere controlli di configurazione per impedire attivazioni parziali.
- Build firmata production verso api.calcioreport.com: prova mirata del routing
  pubblico/review, senza ripetere genericamente il collaudo della 27.1.
- Verificare scenari reali ancora non accettati (rimborso/interruzione/cancellazione)
  in contesto isolato senza cancellare prematuramente l'account destinato ad Apple.
- Completare scheda Store, privacy/supporto, screenshot e note di revisione.

## Confini del rilascio

Il bundle production è ancora un candidato con gate Apple chiuso.
Non incollarlo nel Worker pubblico ora. Ogni deploy pubblico e l'invio ad
App Review richiedono autorizzazione finale su un risultato concreto.
Il nuovo audit migliora solo le richieste successive alla sua distribuzione.
