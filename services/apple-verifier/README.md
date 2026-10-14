# Apple signed-data verification (not deployed)

Internal Node 24 module using Apple's server library, pinned in package-lock.json.
Isolated from the existing football relay: importing this module does not start a
server, change the relay, grant PRO or expose a public verification endpoint.

Run `npm ci` and `npm test` from this directory. CI runs the same checks.

`createAppleVerifier({deployment:'test', environment:'Sandbox'})` returns
`transaction(jws)` and `notification(jws)`. Production requires deployment
`production`, environment `Production` and the numeric **app** Apple ID (not the
in-app product ID). Configuration must come from the server, never the caller.
Bundle identity is fixed to com.calcioreport.app. No local/Xcode bypass exists.

Apple SignedDataVerifier checks signatures, certificate chains, bundle identity
and environment. Online certificate revocation checks are always enabled; errors
must remain failures/retryable delivery, not a reason to switch to offline checks.
Notifications also verify any nested signedTransactionInfo independently.

The committed public Apple Root CA G3 certificate was retrieved on 2026-10-14:
https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
DER SHA256: 63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179.
PEM conversion preserves the certificate. Additional roots require an explicit
trusted Apple PKI update; never load request-supplied trust roots.

The four tests use the real library to reject malformed/oversized input,
environment misconfiguration, forged signatures and fake certificate chains.
They do not demonstrate successful Apple Sandbox verification or OCSP network
availability. A genuine device transaction is still needed for acceptance.

Integration still needs an authenticated, body-bound Worker-to-verifier transport,
bounded HTTP handling, isolated hosting, current Apple transaction reconciliation,
business policy/immutable account binding and atomic source-aware entitlement
grants. A historical signed transaction alone cannot establish that it has not
since been refunded. Never mark a StoreKit transaction finished merely because
this verifier succeeds. No credentials, JWS logging, HTTP route or deployment is
included in this checkpoint.

Official library reference: https://github.com/apple/app-store-server-library-node
