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
- Il relay ascolta di default su `127.0.0.1:8788`; HTTPS sarà terminato dal reverse proxy sul VPS.

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

## Avvio

Richiede Node.js 20 o successivo.

```bash
npm start
```

La procedura di installazione VPS/reverse proxy verrà aggiunta quando l'host definitivo sarà stato acquistato e configurato.
