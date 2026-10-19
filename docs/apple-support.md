# Assistenza acquisti Apple — Sandbox

Stato: 19 ottobre 2026. Procedura interna in sola lettura per il database
`calcio_users_test`. Nessuna dashboard di assistenza è stata implementata.

## Quale account ha effettuato l'acquisto?

Il collegamento registrato è account Calcio Report → appAccountToken → transazione
Apple. Nei nostri registri non è presente l'email dell'Apple Account: può essere
diversa dall'email di accesso a Calcio Report. Non chiedere password Apple, password
dell'app, token di sessione o payload firmati per fornire assistenza.

Partire dall'email Calcio Report verificata attraverso il normale contatto di
assistenza. La query seguente usa parametri SQL da associare, non concatenare:
`:email` e `:environment` (`Sandbox`). Non pubblicare risultati in GitHub.

```sql
SELECT u.id AS account_id, u.email, u.disabled,
       u.paid_until, datetime(u.paid_until / 1000, 'unixepoch') AS paid_until_utc,
       t.retired_at, l.transaction_id, l.original_transaction_id,
       l.product_id, l.purchased_at, l.recorded_at,
       p.projected_until
FROM users u
LEFT JOIN apple_account_tokens t
  ON t.account_id = u.id AND t.environment = :environment
LEFT JOIN apple_purchase_ledger l
  ON l.account_id = t.account_id AND l.environment = t.environment
LEFT JOIN pro_entitlement_accounts p
  ON p.account_id = t.account_id AND p.environment = t.environment
WHERE u.email = :email
ORDER BY l.purchased_at, l.transaction_id;
```

Un risultato senza transazione non prova che Apple non abbia addebitato: può
indicare una consegna interrotta. Invitare a ripristinare sullo stesso account
Calcio Report; non suggerire un secondo acquisto come soluzione.

Per una transazione già identificata nei registri tecnici usare `:transaction_id`
come stringa, preservando tutte le cifre. Non confondere l'ID della transazione
con un numero d'ordine della ricevuta. La LEFT JOIN conserva il riferimento anche
quando l'account originario è stato cancellato:

```sql
SELECT l.environment, l.transaction_id, l.original_transaction_id,
       l.account_id, l.product_id, l.purchased_at,
       t.retired_at, u.id AS existing_account_id,
       u.paid_until, p.projected_until
FROM apple_purchase_ledger l
JOIN apple_account_tokens t
  ON t.account_id = l.account_id AND t.environment = l.environment
LEFT JOIN users u ON u.id = l.account_id
LEFT JOIN pro_entitlement_accounts p
  ON p.account_id = l.account_id AND p.environment = l.environment
WHERE l.environment = :environment AND l.transaction_id = :transaction_id;
```

## Interpretazione

- Il registro acquisti è immutabile: una riga non prova da sola che il PRO sia
  attualmente attivo. Scadenza e rimborsi vanno letti insieme agli eventi.
- `paid_until` è la scadenza applicata; `projected_until` è la proiezione del
  registro. Una differenza richiede indagine, non un UPDATE manuale.
- Un token ritirato/account cancellato non va riassegnato a un nuovo account,
  neanche se usa la stessa email.
- Il ripristino su un altro account viene rifiutato intenzionalmente. Non rivelare
  l'email del proprietario a chi presenta soltanto un ID di transazione.
- Il ripristino non aggiunge altri 30 giorni alla stessa transazione.

Per l'account individuato, leggere cronologicamente gli eventi:

```sql
SELECT event_id, event_json, recorded_at
FROM pro_entitlement_events
WHERE environment = :environment AND account_id = :account_id
ORDER BY recorded_at, event_id;
```

Il motore considera i tempi firmati contenuti negli eventi, non solo il loro
ordine di arrivo. Le verifiche su rimborsi reali e notifiche ritardate restano
pendenti in Sandbox. Nessuna di queste query cambia diritti, proprietà o dati.
