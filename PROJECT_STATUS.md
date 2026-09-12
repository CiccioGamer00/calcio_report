# Calcio Report — Project Status

_Last updated: 2026-09-12_

This file is the operational source of truth for the current Core V2 rebuild. Keep it updated when architecture, infrastructure, or implementation status changes.

## Product direction

Calcio Report is a football analysis web app. The current visual identity should be preserved unless a change is explicitly agreed. The goal is to rebuild the core so search, fixture loading, caching, auth and monetization behave deterministically and scale to real users.

### Functional parity contract

- `main` is the working functional/product reference for Core V2.
- Core V2 is an internal orchestration and efficiency refactor, not a product rewrite.
- Existing useful data, panels, calculations, layout and user flows must remain functionally equivalent unless a visible change is explicitly agreed.
- Change structure only when it reduces/controls API calls, removes race conditions, improves cache/error handling or is required by the relay architecture.
- Do not rewrite an unchanged working panel merely to call it "V2"; audit and reuse it.
- A Core V2 regression or missing datum must be restored before merge even if the equivalent feature still exists in legacy code.
- The agreed lineup optimization preserves the feature while changing cost: lightweight official check on main load; expensive estimate only on explicit user request when official lineups are absent.

## Non-negotiable architecture

- Frontend: static `index.html` + `style.css` + JavaScript.
- Frontend hosting: GitHub Pages.
- Public backend entry point: Cloudflare Worker only.
- Football data source: API-Football only.
- Cloudflare Worker responsibilities:
  - hide API keys/secrets;
  - CORS;
  - auth;
  - TRIAL / PRO gate;
  - payment-related backend routes;
  - edge cache with TTL;
  - expose `x-cr-cache` and `x-cr-relay` diagnostics;
  - never cache upstream errors.
- Frontend responsibilities:
  - async/await;
  - separate cards/panels;
  - on-demand loading for expensive sections;
  - stale-request protection through `searchId`;
  - no generic `error -> [] -> zero data` conversions.

## Target request path

```text
Browser / future mobile app
        ↓
Cloudflare Worker
(auth / TRIAL-PRO / CORS / edge cache)
        ↓ on cache MISS
Private relay on OVH VPS
(stable outbound IPv4 / HMAC auth / request shaping)
        ↓
API-Football
```

The browser must never call API-Football or the VPS relay directly.

## Why the VPS relay was introduced

API-Football PRO is active, but real tests through Cloudflare Worker returned semantic rate-limit errors such as:

```text
Too many requests. You have exceeded the limit of requests per minute of your subscription.
```

Important observations from tests:

- the API-Football response can be HTTP 200 while containing a rate-limit error in `errors`;
- failures occurred both during team lookup and during fixture lookup;
- diagnostics showed `x-cr-cache: MISS`, therefore the failing request actually reached upstream;
- team resolution itself was correct in later tests (example: AC Milan resolved to the expected club), while the following fixture call hit rate-limit;
- Cloudflare Worker shared egress is therefore the main infrastructure suspect.

The relay is intended to provide a stable outbound IP while preserving Cloudflare as the public gateway and cache layer.

## Repository / branch policy

Repository: `CiccioGamer00/calcio_report`

- `main` = protected/stable public branch. Do not modify until Core V2 is tested.
- `core-v2` = active development branch.
- Core V2 was created from main commit `a595ad710c1dba96e151cf2acab66b8b4514d28f`.
- Historical commit `6553c287148271bddb62f50a85f0fadd10e1463b` is reference only, not a rollback target.
- Use small coherent commits.
- Do not delete important legacy code until replacement behavior is verified.

## Local development

Typical local folder:

```text
C:\Users\stefa\Desktop\progetti\calcio_report_v2
```

Branch:

```text
core-v2
```

Update:

```bash
git pull
```

Local static server:

```bash
py -m http.server 5500
```

Browser:

```text
http://localhost:5500
```

## Core V2 implemented so far

### `js/state.js`

Introduced central V2 state with:

- incremental active `searchId`;
- atomic team + fixture commit;
- panel lifecycle state;
- temporary compatibility with legacy `selectedTeam` / `selectedFixture` globals.

### `js/api.js`

Introduced typed API outcomes:

- `success`
- `empty`
- `api_error`
- `auth`
- `paywall`
- `forbidden`
- `rate_limit`
- `server_error`
- `http_error`
- `network_error`
- `aborted`
- `parse_error`

Also:

- recognizes API-Football HTTP 200 + semantic rate-limit;
- no immediate retry for semantic rate-limit;
- only real semantic success is stored in frontend cache;
- carries request/search diagnostics;
- reads `x-cr-cache`.

### `js/features/searchController.js`

Current responsibilities:

- single search entry point for suggestion click, Enter and Search button;
- debounce;
- stale suggestion protection;
- AbortController;
- active `searchId` validation;
- new search invalidates older responses;
- selected team and fixture are published only after a valid fixture exists;
- no standings / lineup / secondary panels in the critical path;
- case-insensitive search;
- local ranking for major clubs;
- local reuse of prefix suggestion results;
- reuse of identical in-flight suggestion requests;
- localhost-only diagnostics showing phase, searchId, result kind, HTTP status, cache, team ID and API errors.

Known tested behavior:

- suggestion click for AC Milan successfully loaded the expected main fixture;
- lowercase/uppercase input is intentionally equivalent;
- Milan ambiguity was fixed so the intended AC Milan is preferred;
- Juventus and Milan failures observed after this point were explicit API-Football rate-limit errors, not hidden `empty` states.

## Cloudflare Worker status

A real deployed Worker copy is versioned in:

```text
worker/worker.js
```

Current versioned Worker state on `core-v2` includes:

- semantic API-Football errors are not edge-cached;
- dedicated relay cache namespace/keying;
- canonical query parameter ordering;
- upstream error responses use `no-store`;
- `Access-Control-Expose-Headers: x-cr-cache, x-cr-relay`;
- root direct access without auth correctly returns `AUTH_REQUIRED`.

Relay transport implementation is complete in the versioned Worker:

- both the default proxy and the internal `/predict` data helper use one shared cache/relay transport;
- cache HIT returns without contacting the relay;
- cache MISS is signed with HMAC SHA-256 and sent to `CR_RELAY_URL`;
- there is no direct Worker fallback to API-Football;
- API-Football HTTP 200 responses containing semantic `errors` are never cached;
- `x-cr-relay` is propagated for diagnostics;
- the API-Football key is no longer referenced by the Worker.

The canonical relay-enabled Worker was deployed manually to the live Cloudflare Worker `calcio-report-proxy` on 2026-09-12.

Live end-to-end validation completed:

- the online app loaded AC Milan's real next fixture through the deployed Worker;
- the sequence Milan → Juventus → Inter → Milan completed successfully when teams were selected from suggestions;
- no abnormal API-Football rate-limit error reappeared during the sequence;
- because the deployed Worker has no direct API-Football fallback and uses a fresh relay cache namespace, the successful live data confirms the Worker → OVH relay → API-Football path;
- automated transport tests separately confirmed canonical cache keys, MISS → HIT reuse, correct HMAC signatures, and that HTTP 200 responses containing semantic `errors` are not cached.
- local Core V2 test with raw `milan` + Enter resolved AC Milan (`team.id = 489`) and loaded the correct fixture;
- first local fixture request showed `cacheWorker=MISS`, `cacheBrowser=MISS`, `relay=1`;
- after a hard refresh, the same request showed `cacheWorker=HIT`, `cacheBrowser=MISS`, `relay=1`;
- opponent-next data was restored as a non-blocking background request; Lazio's next fixture against Venezia rendered correctly after the main Lazio–Milan card.

Observed frontend behavior on the currently published legacy UI: pressing Enter on raw `milan` produced a false empty result, while selecting `AC Milan` from suggestions loaded the fixture correctly. Treat this as a frontend flow bug; do not infer an upstream/relay failure from it. Core V2 must keep Enter, Cerca and suggestion click on one shared deterministic path.

## Relay status

Files prepared and installed from `core-v2`:

```text
relay/package.json
relay/server.js
relay/README.md
relay/deploy/calcio-report-relay.service
relay/deploy/relay.env.example
relay/deploy/Caddyfile.example
```

Design / implemented protections:

- API-Football key stored only in VPS environment file;
- shared Worker/VPS secret stored only in environment secret;
- HMAC SHA-256 request authentication;
- timestamp validation;
- GET only;
- API-Football endpoint allowlist;
- relay listens only on `127.0.0.1:8788`;
- outbound pacing below API-Football per-second limit;
- deduplicate identical concurrent requests;
- main data cache remains Cloudflare edge cache;
- service runs under dedicated unprivileged user `calcioreport` with systemd hardening.

Deployment layout on VPS:

```text
/opt/calcio-report/relay/
/etc/calcio-report/relay.env
/etc/systemd/system/calcio-report-relay.service
/etc/caddy/Caddyfile
/etc/caddy/sites/*.caddy
```

Current relay validation completed:

- `server.js` syntax checked successfully with Node.js 22;
- systemd unit installed and validated;
- VPS-only environment file created with permissions `600 root:root`;
- `APISPORTS_KEY`, `CR_RELAY_SECRET`, `HOST` and `PORT` verified set without exposing values;
- relay service started successfully and reported `active`;
- local `/health` returned HTTP 200 with `x-cr-relay: 1`;
- HMAC rejection path confirmed during testing;
- signed local request `/teams?search=Milan` successfully reached API-Football through the relay;
- API-Football returned HTTP 200, `errors: []`, and AC Milan (`team.id = 489`) in the response;
- relay forwarded API rate-limit headers and `x-cr-relay: 1`;
- relay systemd service enabled at boot and verified `enabled` + `active`;
- `relay.calcioreport.com` DNS A record points directly to the VPS during relay validation;
- Caddy HTTPS endpoint is active for `relay.calcioreport.com`;
- external `https://relay.calcioreport.com/health` returned HTTP/2 200 with `x-cr-relay: 1` and `{"ok":true,"service":"calcio-report-relay"}`.
- a signed request to `/teams?search=Milan` through the public HTTPS relay endpoint succeeded;
- the public signed response contained `errors: []` and AC Milan (`team.id = 489`).

Test note: an initial manual test used a shell timestamp format incompatible with the relay's millisecond timestamp requirement and was correctly rejected as `expired_signature`. Retesting with Node `Date.now()` succeeded. No relay code change is required for this.

The internal relay port `8788` remains private on loopback and closed in UFW. Public relay traffic terminates on Caddy over ports 80/443 and is forwarded internally to `127.0.0.1:8788`.

The public HTTPS/HMAC prerequisite for switching the Worker to the relay is complete.

## OVH VPS

Purpose: shared infrastructure for Calcio Report and potentially other future low-risk projects, while keeping services isolated.

Current server profile:

- OVHcloud VPS-1
- Gravelines, France
- Ubuntu 26.04 LTS
- 2 vCore
- 4 GB RAM
- 40 GB NVMe
- automatic backup included
- stable public IPv4 assigned

Do not store the public IP or any login credentials/secrets in this public repository unless operationally necessary.

Completed:

- VPS provisioned;
- initial SSH login completed;
- temporary password changed;
- SSH login with new password confirmed;
- `sudo apt update && sudo apt upgrade -y` completed;
- UFW firewall enabled and verified active;
- default incoming policy is `deny`;
- OpenSSH/22 explicitly allowed for IPv4 and IPv6;
- UFW enabled on system startup;
- dedicated Ed25519 SSH key created on Windows and public key installed on the VPS;
- key-based SSH login tested successfully;
- SSH hardening applied through `/etc/ssh/sshd_config.d/00-calcio-hardening.conf`;
- `PubkeyAuthentication yes`;
- `PasswordAuthentication no`;
- `KbdInteractiveAuthentication no`;
- `PermitRootLogin no`;
- SSH configuration validated with `sshd -t`;
- SSH service reloaded successfully;
- second independent key-based login tested successfully after reload;
- password-only SSH login explicitly tested and correctly denied;
- controlled reboot completed after package updates;
- fresh SSH key login tested successfully after reboot;
- Node.js 22.22.1 installed from the official Ubuntu repository;
- Node.js executable verified at `/usr/bin/node`;
- Caddy 2.6.2 installed from the official Ubuntu repository;
- Caddy systemd service verified active;
- dedicated system user/group `calcioreport` created with `/usr/sbin/nologin`;
- `/opt/calcio-report/relay` created with dedicated ownership and restricted access;
- relay runtime files installed as `calcioreport`;
- `/etc/calcio-report` created as root-only;
- relay environment file created root-only;
- relay systemd unit installed and validated;
- relay started successfully and tested locally through a real API-Football request;
- relay enabled at boot and verified `enabled` + `active`;
- original Caddyfile backed up as `/etc/caddy/Caddyfile.original`;
- multi-project Caddy layout created with `/etc/caddy/Caddyfile` importing `/etc/caddy/sites/*.caddy`;
- original default `:80` site moved to a separate file and later disabled after the real relay site was added;
- dedicated Calcio Report Caddy site installed from the versioned `relay/deploy/Caddyfile.example`;
- Caddy configuration validated successfully and reloaded;
- DNS resolution for `relay.calcioreport.com` verified from the VPS;
- UFW opened only TCP 80 and 443 in addition to SSH; internal relay port `8788` was not opened;
- automatic HTTPS for `relay.calcioreport.com` is working;
- external HTTPS `/health` test succeeded with HTTP/2 200.

Security / infrastructure still pending:

- security update policy/logging review.

## Completed infrastructure milestone

The required live path is now working:

```text
localhost frontend
    ↓
Cloudflare Worker
    ↓
OVH relay with stable egress IP
    ↓
API-Football
```

Relay code integration, deployment, local transport tests and the live team sequence are complete. Automatic direct API-Football fallback remains disabled.

## Immediate next objective

Work only on the verified frontend bug list below, one item at a time. Do not reopen the completed relay/infrastructure design unless a new reproducible regression points there.

### Current verified functional checkpoint — 2026-09-12

Completed and verified:

- live Browser → Cloudflare Worker → OVH relay → API-Football path;
- no direct Worker → API-Football fallback;
- Worker cache `MISS → HIT`, with `x-cr-relay: 1`;
- online sequence Milan → Juventus → Inter → Milan without abnormal rate-limit failures;
- Core V2 raw `milan` + Enter resolves AC Milan and loads the correct fixture;
- Core V2 physical Search-button path was regression-tested: one click enters the shared search controller, resolves AC Milan and commits its fixture without duplicate team/fixture calls;
- first-click tabs were manually re-tested across new searches; an already-open tab now resumes automatically when the new fixture becomes valid;
- searched team's following fixture remains visible;
- opponent's following fixture loads in background without delaying the main match (verified Lazio → Venezia);
- main-card standings pills are restored through one non-blocking, stale-safe `/standings` request; opening the full standings panel reuses the same frontend-cache entry;
- the main card performs one non-blocking official lineup check; an empty result no longer starts the historical estimator automatically and instead exposes an explicit estimate button;
- `main` remains unchanged;
- `app.js`, `index.html`, `style.css`, `config.js`, `teamFlow.js` and the existing panel modules remain functionally based on `main`; only the API/state/search orchestration and infrastructure have been changed.

### Four-line formation investigation — 2026-09-12

A focused local test was run on Lazio–AC Milan, including AC Milan's estimated `3-4-2-1`.

What was confirmed:

- the pitch renderer can draw the correct number of visual lines for four-line formations;
- the existing estimated-XI builder still groups players mainly by macro roles (`GK/DEF/MID/ATT`) and then places them sequentially into formation rows;
- this allows tactically invalid placements, for example a natural defender appearing on a midfield/advanced row merely to fill the shape;
- an experimental local attempt using historical lineup `grid` improved row ordering but did not solve the role constraint, so the test was **not approved**;
- all experimental `teamFlow.js` changes were reverted locally; no lineup code from this investigation was committed or pushed.

Required behavior for the eventual fix:

- natural player role must remain a hard constraint for normal defensive, midfield and attacking rows; a `DEF` must not become a midfielder simply to fill a slot;
- hybrid advanced rows in shapes such as `4-2-3-1` or `3-4-2-1` may legitimately draw from suitable `MID` and `ATT` candidates, ranked using recent usage/presence;
- use the role and historical lineup `grid` data already available to the estimator where possible;
- do not add API calls solely to solve row placement;
- repeat visual tests before closing the bug.

Open bugs / required work, in priority order:

1. **Four-line formations — NOT CLOSED.** Implement role-aware estimated XI row assignment for formations such as `4-2-3-1`, `4-1-4-1` and `3-4-2-1`, respecting natural roles and allowing only intentional MID/ATT mixing on hybrid attacking-midfield rows. Current GitHub code remains at the last verified checkpoint; the unsuccessful local experiment was reverted.
2. **Panel parity and call audit.** Test each unchanged panel against `main`. Preserve its content and presentation; change code only for a reproduced bug, duplicated request or measurable efficiency improvement.

Closed frontend regressions:

- **Search button:** explicit click-path regression test passed; it uses the shared `startTeamSearch()` flow and did not require a code change.
- **Tabs/cards first click:** reproduced as a timing race. A tab clicked before `selectedFixture` was committed opened visually but skipped its on-demand loader permanently; `cr:selection` now resumes the already-active tab once the fixture is valid, without starting extra panels or duplicating successful loads.
- **Main-card parity:** the mini standings/rank pills bypassed by the new controller are loaded in background again, with `searchId` and fixture checks preventing stale re-renders.
- **Lineup request cost:** automatic loading now stops after one official `/fixtures/lineups` check when data is absent; the existing multi-request estimator runs only after an explicit click, while transport errors remain distinguishable from an empty response.

### Scope guardrails for the next chat

- The original product was functional; the primary production failure was the API-Football/Cloudflare transport incompatibility, which is now solved by the relay.
- Core V2 must not become a visual or functional rewrite of `main`.
- Do not remove, redesign or simplify working features merely to make them "V2".
- Do not migrate/rewrite a panel that already works; audit and reuse it.
- Do not work on lineups before Search/Cerca and the first-click tab bug are closed.
- One bug, one small coherent commit, one focused test.
- Before each code change, state the reproduced problem, affected files, exact intended behavior and expected API-call impact.
- Keep localhost-only diagnostics until Core V2 verification is complete; they must remain invisible on the public app.

## Planned Core V2 sequence after relay validation

1. main-card parity: secondary match data without blocking the first render;
2. verify Enter, Cerca and suggestion click plus stale-search protection;
3. audit every existing panel against `main`; keep byte-identical code when it already behaves correctly;
4. add shared panel states `idle/loading/success/empty/error` only where they improve orchestration without changing output;
5. lightweight official lineup check, with estimated lineup only on demand;
6. formation parser fixes for multi-line shapes such as 4-2-3-1, 4-1-4-1, 3-4-2-1;
7. optimize/cache historical calls only after measuring actual request duplication;
8. agreed mobile search/tabs polish;
9. full functional parity, security and performance review before merging to `main`.

## Existing UI/product behavior to preserve

- current visual identity, cards, tabs, logos and pitch presentation;
- search -> suggestions -> selection/Enter/Search;
- panels for Match, Referee, Teams, Corners, Shots, Injuries, Indicators, Prediction, Standings and planned Fouls visibility as agreed;
- most expensive panels on demand;
- PRO elements marked with `data-pro-only="1"`;
- blocked PRO action -> payment if configured, otherwise login;
- header status badges for PRO / TRIAL / expired state;
- auth/login/register/payment flows should not be casually rewritten during Core migration.

## Working rules

- one coherent task at a time;
- explain what will change, why, affected files/services and expected result before implementation;
- prefer direct GitHub changes over asking the user to edit code manually;
- never expose secrets;
- never mix old/new flows accidentally;
- test after each block;
- if a failure can be diagnosed in-app, add diagnostics rather than requiring browser developer tools;
- update this file whenever a meaningful milestone or architectural decision changes.
