# Calcio Report — Project Status

_Last updated: 2026-09-14_

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

### Role-aware four-line implementation — 2026-09-13

The estimated-XI builder now consumes every row of the selected formation instead of collapsing it into only `DEF/MID/ATT` totals. This fixes the concrete `4-2-3-1` defect where the final `1` was ignored and the result could contain only ten players.

Implemented behavior:

- goalkeeper, defensive, midfield, hybrid advanced-midfield and final attacking rows are assigned separately;
- normal defensive, midfield and attacking rows accept only their natural macro role;
- only the intentional hybrid row in four-line shapes accepts both `MID` and `ATT`;
- fixed-role rows are reserved before the hybrid row, preventing the only available striker from being consumed as an attacking midfielder;
- historical lineup `grid` usage is converted into semantic row affinity and used to rank otherwise valid candidates;
- recent starters missing from the `/players` pool are reused from data already collected by the estimator;
- no endpoint or request count was added.

Focused automated tests pass for `4-2-3-1`, `4-1-4-1` and `3-4-2-1`: each contains eleven unique players and respects the row-role constraints. Search-button, first-click tab, shared-standings and estimate-on-demand regressions also pass.

The real-data visual test was approved on Inter–Udinese: Inter's `3-5-2` rendered as goalkeeper + 3 defenders + 5 midfielders + 2 attackers; Udinese's `3-4-2-1` rendered as goalkeeper + 3 defenders + 4 midfielders + 2 hybrid MID/ATT players + 1 final attacker. No natural defender appeared on an advanced row. The role-aware four-line bug is closed.

### Panel parity audit — started 2026-09-12

- **Arbitro — VERIFIED.** `js/features/refereePanel.js` is byte-identical to `main`. Manual test on Lazio–AC Milan confirmed fixture referee/stadium/city rendering, referee-history fallback, card summary, grouped match-history toggle and per-team detail toggle. Returning to the panel after visiting Match is immediate and does not reload it. No reproduced regression and no code change required.
- **Squadre — VERIFIED.** `js/features/teamsPanel.js` is byte-identical to `main`. Manual test on Lazio–AC Milan confirmed both team cards, last-5 results, W/D/L counts, GF/GS, cards and opponent/home-away presentation. Returning to the panel after visiting Match is immediate and does not reload it. Existing shared event caching remains in use; no reproduced regression and no code change required.
- **Predizione — VERIFIED.** `js/features/predictionPanel.js` is byte-identical to `main`, and its response contract matches the deployed Worker `/predict` route. Manual test on Inter confirmed 1X2 probabilities, confidence/risk, expected goals, likely scorelines, drivers, Over 2.5 and BTTS rendering. Returning from Match to Predizione is immediate and does not issue a second browser `/predict` request. No reproduced regression and no code change required.
- **Corner — VERIFIED.** `js/features/cornersPanel.js` and its shared helpers in `js/features/panelsShared.js` are byte-identical to `main`. Manual test on Inter confirmed both team cards, averages, minima, maxima, averages conceded and five coherent match rows. Returning from Match to Corner is immediate and does not reload the panel. No reproduced regression and no code change required.
- **Tiri — VERIFIED.** `js/features/shotsPanel.js` and its shared helpers in `js/features/panelsShared.js` are byte-identical to `main`. Manual test on Inter confirmed both team cards, total/on-target/against averages and five coherent match rows. Opening Tiri immediately after Corner reused the same frontend-cached fixture and `/fixtures/statistics` responses; returning from Match to Tiri was immediate and did not reload the panel. No reproduced regression and no code change required.
- **Classifica — VERIFIED.** `js/features/standingsPanel.js` is byte-identical to `main`, and the full table uses the same `/standings?league=...&season=...` frontend-cache key as the non-blocking mini-position request on the Match card. The audit reproduced one Core V2 orchestration defect in `app.js`: the Classifica-specific loader ran before the shared already-loaded guard, so every return to the tab invoked `loadStandings()` again and could issue a new request after the three-minute cache TTL. The loader now exits when the current selection's table is already loaded. The visual regression test confirmed that switching away from Classifica and returning shows the existing table immediately without the loading message or another request.
- Panel help/toast persistence was also checked: `Non mostrare più` is intentionally stored per hint key (`hint_referee`, `hint_teams`, etc.) in `localStorage`; focused retest confirmed the same disabled hint does not reappear. No bug.

### Injuries request optimization — 2026-09-13

The unchanged `main` implementation requested up to four `/players` pages for each team even when `/injuries?fixture=...` returned no unavailable players. A focused test reproduced nine calls for an empty injury list: one `/injuries` request plus eight unnecessary `/players` requests.

`js/features/injuriesPanel.js` now loads player-position pages only for a team that actually has at least one injury record. Focused tests confirm:

- no injuries: one request instead of nine;
- injuries for one team: only that team's player pages are requested;
- injuries for both teams: the existing behavior is preserved.

The first real Inter test confirmed that the panel still renders and reopens immediately. It also exposed a separate pre-existing display bug: duplicate API injury records were counted and rendered as duplicate players.

The duplicate-row fix now keeps one record per team/player, preferring the player ID and falling back to a normalized name when the ID is absent. If only one duplicate contains an absence reason, that reason is preserved. A focused test passed without adding API calls, and the follow-up Inter–Udinese visual test confirmed Inter reduced from four rows to the two unique players Dimarco and Spence, while Udinese reduced from twelve rows to six unique players.

The Indisponibili panel and its request optimization are verified.

### Unavailable-player details — 2026-09-14

Unavailable-player chips now open the existing player-details modal on click/tap. The panel keeps the already-fetched `/players?team=...&season=...&page=...` row in memory and passes it to the modal, so opening an unavailable player adds no API request. Formation-player clicks preserve their existing `/players?id=...&season=...` fallback.

The modal now keeps statistics tied to the selected fixture:

- the first block shows only the selected competition and season, for example `Serie A · 2026/27`;
- it never substitutes the first unrelated competition returned by API-Football when the selected league is missing;
- a second block aggregates the same club's available statistics across the current season's competitions, deduplicated by team and competition;
- when API-Football has no statistics associated with the fixture team/competition, the modal displays unavailable values instead of presenting unrelated numbers.

The real-data regression exposed the previous fallback on Spence, which incorrectly showed World Cup statistics for an Inter–Udinese context. After the fix, Spence correctly shows Serie A as the requested competition with unavailable values because no relevant Inter statistics are present. Zaniolo showed one Serie A appearance and two total seasonal appearances, while the existing formation-player path was verified with Dimarco (three Serie A appearances, zero goals and one assist). No request was added to the injuries click path.

### Indicators score semantics — closed 2026-09-13

A visual audit of the Indicators tiles found a real interpretation problem in `js/features/indicatorsPanel.js`.

Reproduced behavior:

- the large percentage shown on Corner, Tiri, Cartellini and Falli tiles is **not a probability of the displayed betting label**;
- it is a linear 0–100 intensity index produced by `scoreLinear()` from the expected raw volume;
- example observed: `Cartellini: Under 4.5`, expected cards `2.60`, displayed score `12%`; the 12% comes from scaling 2.60 between 2 and 7 and therefore means low card volume, not 12% probability of Under 4.5;
- the same issue explains examples such as Corner 20%, Tiri 26% and Falli 5%;
- the separate Bookmaker section above is different: those percentages are actual historical hit rates (`hit / total`) over recent matches.

Implemented behavior:

- Corner, Tiri, Cartellini and Falli now show `Forza N/100` instead of a percentage that could be mistaken for probability;
- `50/100` represents a value near the decision boundary and the strength increases, up to `95/100`, as the expected value supports the displayed label;
- Under labels become stronger as the expected value falls below their threshold, while Over labels become stronger as it rises above the threshold;
- the medium-shots band is strongest near its center and weaker at its boundaries;
- Gol 1T and Gol 2T retain their existing percentage presentation;
- the Bookmaker section remains unchanged and continues to show real historical hit rates;
- no expected-value calculation, endpoint or request count was changed.

Focused automated tests passed for Under/Over direction, decision boundaries, the medium-shots band, missing values, the new `Forza N/100` rendering and unchanged goal percentages. The real UI test was completed successfully after a hard refresh and one `Carica dati` action. The Indicators score-semantics bug is closed.

Open bugs / required work, in priority order:

1. **Panel parity and call audit.** Continue testing each unchanged panel against `main`. Preserve its content and presentation; change code only for a reproduced bug, duplicated request or measurable efficiency improvement. `Arbitro`, `Squadre`, `Predizione`, `Corner`, `Tiri`, `Indisponibili`, `Classifica` and the corrected Indicatori score presentation are verified; continue with the remaining panels.

Closed frontend regressions:

- **Search button:** explicit click-path regression test passed; it uses the shared `startTeamSearch()` flow and did not require a code change.
- **Tabs/cards first click:** reproduced as a timing race. A tab clicked before `selectedFixture` was committed opened visually but skipped its on-demand loader permanently; `cr:selection` now resumes the already-active tab once the fixture is valid, without starting extra panels or duplicating successful loads.
- **Main-card parity:** the mini standings/rank pills bypassed by the new controller are loaded in background again, with `searchId` and fixture checks preventing stale re-renders.
- **Lineup request cost:** automatic loading now stops after one official `/fixtures/lineups` check when data is absent; the existing multi-request estimator runs only after an explicit click, while transport errors remain distinguishable from an empty response.
- **Four-line estimated formations:** the XI builder now consumes every formation row, preserves natural role constraints and uses historical `grid` affinity for hybrid rows; automated and real-data Inter–Udinese tests passed without adding API calls.
- **Indicators score semantics:** Corner, Tiri, Cartellini and Falli now expose a direction-aware `Forza N/100` score instead of presenting a raw intensity index as a percentage; focused automated and real UI tests passed without adding API calls.
- **Indisponibili duplicate rows:** repeated injury records are deduplicated per team/player before counting and rendering; reasons are preserved and the real Inter–Udinese test passed without adding API calls.

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

## Public deployment checkpoint — 2026-09-14

- The public site is online at `https://app.calcioreport.com/`.
- GitHub Pages currently deploys the stable `main` branch, whose Core V2 base commit is `a595ad710c1dba96e151cf2acab66b8b4514d28f`.
- The tested `core-v2` frontend is not yet the public version.
- The deployed Cloudflare Worker and OVH relay already serve the live backend path.
- Do not describe Core V2 as publicly released until the final parity, security and performance review is complete and the production deployment source has been deliberately switched or merged.

## Prediction model review — 2026-09-14

The current Worker `/predict` implementation remains a statistically valid and interpretable baseline:

- independent Poisson score probabilities with Dixon-Coles correction for low scores;
- league averages plus home/away team attack and defence;
- fixed blend of 70% season context and 30% recent same-league form;
- fixed home multiplier, Dixon-Coles rho and lambda bounds;
- 1X2, expected goals, likely scores, Over 2.5 and BTTS output.

The review identified that the model is not yet empirically validated:

- no rolling out-of-sample backtest or probability calibration is recorded;
- the UI confidence value is derived from the gap between the first and second 1X2 probabilities, not from measured historical reliability;
- fixed weights and parameters are hand-set rather than learned per league/season;
- recent results are not sufficiently adjusted for opponent strength;
- sparse current-season data can fall through to zero averages and then to the minimum lambda clamp, producing a plausible-looking low-score forecast instead of an explicit insufficient-data state;
- live prediction can require up to six upstream API-Football calls on a cold cache.

Agreed direction:

1. Preserve the current model as `poisson_dc_v1`; do not replace the public prediction panel before comparison.
2. Build a repeatable offline Prediction Lab with time-ordered historical evaluation and no future-data leakage.
3. Add a sparse-data fallback hierarchy: current same-league season, previous same-league season with time decay, recent all-competition matches at lower weight, team-strength/league priors, then an explicit insufficient-coverage state.
4. Benchmark learned/time-decayed Dixon-Coles plus Elo or pi-rating before adding ML.
5. Benchmark a calibrated tabular model such as CatBoost/XGBoost for 1X2; use deep learning only if the available historical dataset justifies it.
6. Evaluate a validated ensemble: count model for score/goal markets plus calibrated tabular model for 1X2.
7. Treat generative AI only as an explanation layer, never as the source of numeric probabilities.
8. Measure multiclass log loss, Ranked Probability Score, Brier score and calibration; treat exact-score accuracy as secondary.
9. Compare against simple league priors and, when available, de-margined bookmaker odds or API-Football predictions as external benchmarks.
10. Prefer scheduled feature snapshots on the VPS so a future model does not increase live API calls.

First test milestone:

- characterize `poisson_dc_v1` deterministically;
- reproduce the early-season/no-history fallback;
- verify probability normalization and finite non-negative outputs;
- record the current behavior before proposing any production code change.

### First prediction characterization results — 2026-09-14

A repeatable Node characterization script is stored in:

```text
tests/prediction-model-characterization.test.mjs
```

Initial offline assertions passed and consumed no API-Football calls. They confirm:

- all tested outputs are finite, non-negative and normalized to a total 1X2 probability of 1;
- with no current-season statistics and no recent fixtures, both lambdas fall to the minimum `0.2`;
- that no-history case produces approximately 70.28% draw probability, with 0-0 at approximately 67.30%;
- the current edge-based formula labels that artificial no-history forecast with confidence 100/100, proving that it must not be presented as measured reliability;
- at the maximum lambdas `3.2 / 3.2`, limiting the matrix to scores 0–5 discards approximately 19.97% of the independent Poisson mass before renormalization;
- the allowed extreme `rho=+0.3` can create a negative low-score cell before the existing zero clamp, so parameter bounds also require validation.

No production Worker/frontend behavior changed during this milestone. The next Prediction Lab task is to define historical input snapshots and a leakage-safe rolling backtest before testing replacement formulas.

### Prediction Lab baseline implementation — 2026-09-14

Development branch:

```text
codex/prediction-lab-baseline
```

Added without changing production frontend or Worker behavior:

- reusable offline replica of `poisson_v1_3_dc_cached`;
- CSV validation and chronological multi-league/multi-season backtest;
- same-kickoff batching so no result is visible to another prediction at the same kickoff time;
- current-model metrics: 1X2 accuracy, multiclass log loss, Brier score, Ranked Probability Score, calibration error, exact-score accuracy and expected-goals MAE;
- separate legacy and minimum-data-coverage summaries;
- deterministic anti-leakage regression tests;
- synthetic demonstration data and local run instructions.

A local authenticated collector is also available at `prediction-lab/collect.html`. It reuses the existing localhost login, performs one Worker request for a selected league/season, filters completed fixtures and downloads a reusable CSV without exposing credentials. Serie A 2025/26 (`league=135`, `season=2025`) is the agreed first real sample. No real API request was executed while implementing the collector.

First real baseline run completed locally on Serie A 2025/26:

- one collector request returned all 380 completed fixtures;
- transport diagnostics were `x-cr-cache: MISS` and `x-cr-relay: 1`;
- 350/380 fixtures (92.11%) met the initial minimum coverage guard;
- all-fixture legacy sample: 48.16% 1X2 accuracy, log loss 1.1219, Brier 0.6635, RPS 0.2281, calibration error 0.0872, exact score 8.68%, expected-goals MAE 0.9564;
- guarded sample: 48.57% 1X2 accuracy, log loss 1.0792, Brier 0.6444, RPS 0.2209, calibration error 0.0726, exact score 8.57%, expected-goals MAE 0.9347;
- the coverage guard improves every primary probability metric slightly, but this does not yet prove predictive quality because naive league priors and alternative models have not been measured;
- the downloaded CSV is a reusable private raw snapshot and must not be committed to the public repository.

Leakage-safe baseline comparison on the same 380 fixtures:

- uniform 1X2: 38.95% accuracy, log loss 1.0986, Brier 0.6667, RPS 0.2344, calibration error 0.0561;
- progressive league prior: 38.16% accuracy, log loss 1.0958, Brier 0.6649, RPS 0.2350, calibration error 0.0472;
- Poisson DC v1 on all fixtures: 48.16% accuracy, log loss 1.1219, Brier 0.6635, RPS 0.2281, calibration error 0.0872;
- on the 350 guarded fixtures, Poisson DC v1 reaches 48.57% accuracy and beats the progressive prior on log loss by 0.0136, Brier by 0.0187 and RPS by 0.0137;
- interpretation: the model has useful ranking/predictive signal once enough history exists, but sparse early-season forecasts and overconfident probabilities damage full-season log loss and calibration;
- next test: add Serie A 2024/25 as prior history for predictions on 2025/26, preserving chronological isolation and measuring early-season buckets separately.

Previous-season experiment implementation:

- Serie A 2024/25 was downloaded locally in one request with 380 completed fixtures (`x-cr-cache: MISS`, `x-cr-relay: 1`) and stored in the ignored private data folder;
- the parser now preserves API league/team IDs and falls back to normalized names only when IDs are unavailable;
- the candidate model uses previous-season league/team results at weight `0.35`; current-season matches have full weight, so the old season's relative contribution decreases as new data accumulates;
- prior results dated at or after the target season start are rejected;
- promoted teams without matching prior-season history remain explicitly distinguishable;
- the comparison reports the whole season, first 30, first 50 and minimum-coverage samples;
- deterministic synthetic tests passed, including future-history rejection and unchanged baseline behavior;
- no production Worker or frontend code changed.

Real previous-season comparison, target Serie A 2025/26 with 2024/25 at weight `0.35`:

- both teams had matching previous-season history in 22/30 of the first fixtures (73.33%);
- full season: accuracy 48.16% → 48.68%, log loss 1.1219 → 1.0647, Brier 0.6635 → 0.6460, RPS 0.2281 → 0.2213, calibration error 0.0872 → 0.0709;
- first 30 fixtures: accuracy 43.33% → 50.00%, log loss 1.6208 → 1.2435, Brier 0.8864 → 0.7147, RPS 0.3119 → 0.2453, calibration error 0.4362 → 0.3082;
- first 50 fixtures: accuracy 46.00% → 50.00%, log loss 1.4165 → 1.1722, Brier 0.8016 → 0.6846, RPS 0.2770 → 0.2337, calibration error 0.3556 → 0.2206;
- guarded fixtures: accuracy unchanged at 48.57%, with small improvements in log loss, Brier, RPS and calibration;
- conclusion: previous-season memory materially repairs the sparse early-season failure and remains beneficial across the full target season;
- weight `0.35` is still an experimental candidate, not a production setting. To avoid tuning on the test season, obtain Serie A 2023/24, select the weight on target 2024/25, then lock it and evaluate once on 2025/26.

Local `prediction-lab/data/` and `prediction-lab/reports/` are now ignored by Git.

The committed code was executed in an isolated in-memory test using the synthetic 12-fixture dataset. Parsing, normalization, same-kickoff isolation, no-history reproduction and finite metric checks passed. Four of the twelve synthetic fixtures met the initial coverage guard. These synthetic scores validate the test harness only and are not evidence of football forecasting quality.

No API-Football request was consumed. The next milestone is a cached real historical dataset and a first out-of-sample baseline report.

## Working rules

- one coherent task at a time;
- explain what will change, why, affected files/services and expected result before implementation;
- prefer direct GitHub changes over asking the user to edit code manually;
- never expose secrets;
- never mix old/new flows accidentally;
- test after each block;
- if a failure can be diagnosed in-app, add diagnostics rather than requiring browser developer tools;
- update this file whenever a meaningful milestone or architectural decision changes.
