# Calcio Report relay

Relay interno tra Cloudflare Worker e API-Football.

## Scopo

Il browser continua a chiamare solo il Cloudflare Worker. Il Worker mantiene auth, TRIAL/PRO, CORS e cache edge. Solo sui cache MISS il Worker chiama questo relay, che esce verso API-Football dall'IPv4 stabile del VPS.

## Sicurezza

- Nessuna API key nel repository.
- `APISPORTS_KEY` vive solo come variabile ambiente sul VPS.
- `CR_RELAY_SECRET` è condiviso solo tra Cloudflare Worker e VPS.
- Ogni richiesta API deve essere firmata HMAC SHA-256 con timestamp.
- Timestamp accettato entro 30 secondi.
- Solo richieste GET e soli endpoint API-Football esplicitamente consentiti.
- Il relay ascolta di default su `127.0.0.1:8788`; HTTPS viene terminato dal reverse proxy sul VPS.
- Il servizio systemd gira con utente dedicato `calcioreport`, senza privilegi elevati.

## Protezione quota

- partenze upstream distanziate di almeno 250 ms (circa 4 richieste/s);
- richieste identiche contemporanee vengono accorpate in una sola chiamata upstream;
- nessuna cache applicativa nel relay: la cache dati resta responsabilità del Cloudflare Worker.

## Variabili ambiente richieste

```text
APISPORTS_KEY=...
CR_RELAY_SECRET=...
HOST=127.0.0.1
PORT=8788
```

Il repository contiene solo `deploy/relay.env.example`. I valori reali vanno salvati sul VPS in `/etc/calcio-report/relay.env` con permessi restrittivi e non devono mai essere copiati in Git.

## Avvio applicazione

Richiede Node.js 20 o successivo.

```bash
npm start
```

## Deployment VPS previsto

File preparati nel branch `core-v2`:

```text
relay/deploy/calcio-report-relay.service
relay/deploy/relay.env.example
relay/deploy/Caddyfile.example
```

Layout previsto sul VPS:

```text
/opt/calcio-report/relay/              # codice applicazione
/etc/calcio-report/relay.env           # segreti e configurazione runtime
/etc/systemd/system/calcio-report-relay.service
/etc/caddy/Caddyfile                    # reverse proxy HTTPS
```

Architettura runtime:

```text
Internet
  -> HTTPS :443 (Caddy)
  -> 127.0.0.1:8788 (Node relay)
  -> API-Football
```

La porta `8788` non deve essere aperta in UFW. Quando Caddy verrà attivato saranno necessarie soltanto le porte pubbliche HTTP/HTTPS (`80` e `443`) oltre a SSH (`22`).

## Ordine di installazione concordato

1. completare/testare accesso SSH con chiave;
2. solo dopo disabilitare login SSH con password e root SSH;
3. installare Node.js e Caddy;
4. creare l'utente di servizio dedicato;
5. installare il relay in `/opt/calcio-report/relay`;
6. creare `/etc/calcio-report/relay.env` direttamente sul VPS con i segreti reali;
7. avviare e testare il relay solo su `127.0.0.1:8788`;
8. configurare DNS e Caddy HTTPS;
9. testare `/health` tramite HTTPS;
10. soltanto dopo modificare il Cloudflare Worker per usare il relay sui cache MISS.

Il Worker non deve essere collegato al relay prima che i test locali/VPS e HTTPS siano riusciti.
