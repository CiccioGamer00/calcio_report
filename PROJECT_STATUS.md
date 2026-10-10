# Calcio Report — Project Status

_Last updated: 2026-10-10_

This file is the operational source of truth for Calcio Report. Keep it updated when architecture, infrastructure, release state or implementation status changes.

## Account deletion candidate — 2026-10-10 (NOT RELEASED)

- Branch `auth/account-deletion` from stable `main` `c05438a`; PR #12 remains the production baseline.
- Implemented password-confirmed self-service deletion with explicit `ELIMINA`, atomic deletion across `users`, `trial_usage` and `trial_search_log`, account-ID-bound sessions/reset links, footer modal and error handling. New feature disabled unless `ACCOUNT_DELETION_ENABLED=1`.
- Stripe candidate no longer creates users from payment events and rejects checkout sessions predating the current account. Registration-before-payment must be accepted before release; the owner confirmed on 2026-10-10 that PRO payments are one-time, with no subscriptions or automatic renewal.
- Email verification evaluated, not enabled/implemented: recommend new registrations verify before the seven-day trial begins, while preserving existing TRIAL/PRO access.
- Full local suite: **31 passed / 0 failed** on Node 24, including Worker routes against SQLite and frontend behavior tests. No external football/email/payment calls were made by tests.
- Repeat-trial policy agreed on 2026-10-10: deletion followed by re-registration may receive a fresh seven-day TRIAL, including with the same email. PRO-only prediction remains the paid differentiator; do not add retained email identifiers solely to prevent repeat trials. Revisit only if observed abuse/API costs justify it.
- D1 table schema confirmed from the owner screenshot on 2026-10-10: three application tables (`users`, `trial_usage`, `trial_search_log`) plus Cloudflare `_cf_KV`, which is never modified. The initial users-only candidate was corrected before deployment. A guarded D1 batch removes all three user records atomically; rollback, cross-account isolation, concurrent reset/re-registration and fresh-trial cleanup are tested. Empty test database schema: `tests/fixtures/account-schema.sql`.
- Remaining: external data/backup inventory, registration-before-payment decision, isolated D1/browser smoke test, rate-limit coverage and explicit merge/deploy approval.
- Detailed design, limitations and test/release checklist: `docs/account-deletion-email-verification.md`.
- `main` and production have not been modified by this work.

## Current operating state — 2026-10-09

- Core V2 is released on `main` and is the current public frontend at `https://app.calcioreport.com/`.
- `main` is the stable production branch. New work must start from current `main` on a small feature/fix branch and return through a tested pull request.
- `core-v2` is now historical; do not use it as the base for new work.
- The production request path Browser → Cloudflare Worker → OVH relay → API-Football is verified and remains the required architecture.
- **Password recovery RELEASED to `main` on 2026-10-09** via PR #12, merge commit `a4bf6c1447fff876dd05a4cadce5bc8446000596`. GitHub Pages deployment for the merge commit completed successfully. The Worker recovery endpoints were manually deployed and exercised before the merge. Manual E2E on the updated local frontend passed: new password accepted, old password rejected, reused reset link rejected, login with new password successful. Local automated suite: **15 pass / 0 fail**, clean branch. Public browser smoke check on `https://app.calcioreport.com/` was reported successful by the user on 2026-10-09 (site access, login modal/email autofill, recovery UI and ordinary app operation). The complete reset flow was independently exercised on the local updated frontend, not repeated after publication.
- Resend: `mail.calcioreport.com` verified, DKIM and SPF provider-verified. Two test recovery emails arrived in **Libero spam**, not Gmail. Frontend now instructs users to check spam. Inbox placement remains a non-blocking follow-up; do not change DNS/sender speculatively.
- Existing Cloudflare check `Workers Builds: calcioreport` failed on both the pre-merge stable `main` and the PR head. It refers to `calcioreport`, not the production Worker `calcio-report-proxy`; GitHub Pages deployment succeeded separately. Review obsolete Cloudflare build integration later.
- Workflow: when the user runs local steps, provide **all related terminal commands in one coherent batch**, not one per conversational turn. Request a single combined report.
- Matchday / Giornata is released and verified in production.
- Shared fixture-statistics caching plus the official-match sample rule are released and verified in production.
- No currently visible panel has a known blocking regression. Do not change an audited panel unless a new reproducible bug, duplicated request or measurable efficiency issue is found.
- Infrastructure still has one explicit non-blocking follow-up: security update policy / logging review on the OVH VPS.
- Historical release-candidate and pre-merge sections below are retained as project history; when they conflict with this section, this current operating state takes precedence.

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

- `main` = stable public/production branch and current source for new work.
- `core-v2` = historical development branch; do not branch new work from it.
- New work: branch from current `main`, use small coherent commits, run focused/full tests as appropriate, then merge through a pull request after verification.
- Historical Core V2 base commit `a595ad710c1dba96e151cf2acab66b8b4514d28f` and historical commit `6553c287148271bddb62f50a85f0fadd10e1463b` are reference only.
- Do not delete important working code until replacement behavior is verified.

## Local development

Typical local folder:

```text
C:\Users\stefa\Desktop\progetti\calcio_report_v2
```

Normal stable branch:

```text
main
```

Update stable local checkout:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

Feature/fix work uses a dedicated branch created from current `main`.

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

### Shared statistics cache and official sample — RELEASED / VERIFIED IN PRODUCTION 2026-10-07

- Corner, Tiri, Falli and Indicatori now reuse one session-wide fixture-statistics cache.
- Concurrent requests for the same fixture are deduplicated; failed responses are not cached.
- Friendly matches are excluded from the statistics sample.
- Corner, Tiri and Falli keep searching backward until they collect the requested number of official matches with statistics available, up to the configured lookback.
- Missing detailed statistics are no longer converted into fake zero values.
- The UI now states that the sample uses the latest official matches; Indicatori also explains that Corner, Tiri and Falli require available statistics.
- Local regression test on Napoli-Frosinone confirmed that the Frosinone-Benevento friendly no longer distorts the sample and Indicatori loads correctly.
- Automated coverage added for shared cache behavior, missing statistics, official-sample filtering and frontend JavaScript syntax.
- PR #6 merged into `main` at commit `ecf9d0268bfdc8a542e06a1dbbad018103a76aa3`.
- Production smoke test on `https://app.calcioreport.com/` passed after Ctrl+F5: Corner/Tiri show the official-sample label, the Frosinone-Benevento friendly is excluded, and Indicatori loads without error.
## Auth hardening — deployed / production smoke verified 2026-10-07

- Worker auth now verifies session age server-side with a six-hour lifetime; legacy tokens without `exp` remain valid only within six hours of their original `iat`.
- Login and `/auth/me` now respect disabled accounts consistently.
- The Worker can validate both legacy single-SHA-256 password hashes and the staged PBKDF2-SHA256 format with random salt.
- PBKDF2 creation is gated behind `AUTH_PASSWORD_V2=1`; the flag is now **enabled in production**.
- Existing legacy SHA-256 accounts remain compatible; the rollout does not rewrite existing password records.
- Automated suite passed 12/12 locally after staging the rollout flag, including Worker syntax, PBKDF2 behavior, legacy compatibility and session expiry.
- Worker version `e714fba0` was deployed manually to 100% traffic.
- Production smoke test passed for an existing account: logout/login, Giornata fixture selection and protected Predizione access all worked normally after deployment.
- Controlled production registration with a new account succeeded with `AUTH_PASSWORD_V2=1`, followed by logout/login with the same credentials; PBKDF2 write/read behavior is therefore verified end-to-end.
- Cloudflare rate limiting is active for `/auth/login` and `/auth/register`, grouped by IP at 5 requests / 10 seconds with a 10-second block.
- Production verification confirmed the sixth rapid request is blocked with HTTP 429.
- Because the Cloudflare Free WAF block response may not be readable by browser JavaScript through CORS, the frontend now also handles blocked `fetch()` calls and shows a clear temporary-block message instead of leaving the stale credential error visible.
- Local UI verification confirmed the temporary-block message appears after the rate limit triggers.
- Password recovery implementation is prepared on branch `auth/password-recovery` and is **not deployed yet**:
  - `POST /auth/forgot` always returns the same generic response, whether or not the account exists;
  - reset links expire after 20 minutes and use a password-reset-specific HMAC scope, so they cannot be used as session tokens;
  - reset links are placed in the URL fragment (`#reset=...`) so the reset token is not sent in the page request;
  - reset tokens are invalidated by a password change and the conditional D1 update makes them single-use even under concurrent requests;
  - new session tokens carry a password version; changing the password invalidates new sessions immediately, while pre-release sessions remain compatible only until their existing six-hour expiry;
  - session parsing now rejects license-code-shaped tokens that have no session `iat`;
  - the central active-user gate and license redemption now enforce `disabled` for already-open sessions too;
  - frontend adds “Password dimenticata?”, reset-password mode, confirmation field and clear success/error states.
- Outbound reset email is prepared through Resend using secret `RESEND_API_KEY`. Cloudflare Email Sending to arbitrary customer addresses is not available on the current Workers Free plan, so it is not used for this rollout.
- Before production rollout: verify a sending domain in Resend, add `RESEND_API_KEY` as a Worker secret, expand the existing Cloudflare rate-limit rule to include `/auth/forgot` and `/auth/reset`, deploy the Worker/frontend, then run a controlled end-to-end reset test.
- Password recovery field checkpoint (2026-10-09): Resend sending domain `mail.calcioreport.com` was reported Verified; `RESEND_API_KEY` was configured as a Cloudflare production Secret; the existing rate-limit rule was extended to `/auth/forgot` and `/auth/reset` while retaining its limits; `worker/worker.js` from commit `524e1cc16b8224b149f443b1c24dd8d7c208588c` was manually deployed to `calcio-report-proxy`. A controlled POST to `/auth/forgot` returned the expected generic success message and real reset emails arrived (in spam), confirming Resend delivery. On 2026-10-09, the user opened a fresh reset link against the local `localhost:5500` frontend and **successfully changed the password and logged in with the new password**. Single-use token/repeated reuse, old-password rejection, and session invalidation were not separately confirmed by this manual test. Frontend on public `app.calcioreport.com` remains old `main` and does not yet handle reset links. Keep PR #12 draft and `main` unchanged until remaining checks/release decision.
- Browser-autocomplete login modal regression: selecting an autofilled email had closed the login modal unexpectedly. On `auth/password-recovery`, the backdrop-click-to-dismiss handler was removed from `app.js`, preserving explicit X close; added `tests/auth-modal-autofill.test.mjs`. **User confirmed local Chrome manual fix** on 2026-10-09. User ran `node --test` locally and reported **15 pass**. No frontend release yet.
- User workflow clarification (2026-10-09, latest): **Assistant must ALWAYS provide the commands**; batch multiple commands (3–8 or more) in ONE message when they form a coherent sequential procedure, so the user can execute them all and send ONE combined report. «Un comando alla volta» was NOT a request to pause for confirmation after each command. Browser test sequences should likewise be fully specified in one concise message. Split only for genuine dependencies or risks. Prefer doing GitHub tasks directly; avoid repetitive screenshots.
- Additional password recovery manual tests confirmed by user (2026-10-09): reused reset link rejected and old password refused after password change. End-to-end primary flow, non-reuse, old-password rejection and login with new password are therefore VERIFIED manually. Email placement: two reset messages arrived in Libero's spam folder; deliverability remains an OPEN concern, **not** fixed or assumed to be a code bug. Sender defaults to `noreply@mail.calcioreport.com`. Need investigate Resend's Deliverability Insights, SPF/DKIM/DMARC alignment, and sender reputation before altering production DNS or sender. Public frontend on `main` still does not show reset UI.
- Resend account audit (2026-10-09, via connected Resend app): sending domain `mail.calcioreport.com` is Verified (`eu-west-1`, sending enabled); its DKIM TXT and two SPF-related CNAME records show **verified** in Resend. Open/click tracking disabled. Transactional logs show 3 reset messages (2 delivered, 1 bounced, 0 provider-recorded spam complaints). Both delivered messages nonetheless landed in the recipient's Libero spam folder. `delivered` does **not** prove inbox placement. New sending domain (first configured 2026-10-08), `noreply` sender and bounced recipient are potential reputation concerns, not established root causes. Resend advises checking DMARC, avoiding `noreply`, and avoiding sends to invalid addresses. DMARC alignment/record and the receiving provider's message authentication headers have **not yet been independently checked**. Do NOT claim spam fixed, change DNS blindly, enable tracking, or replace the sender with an unmonitored mailbox. Production `main` remains unchanged.
- Product decision (2026-10-09): user confirmed spam placement was at **Libero** (not Gmail), and agreed to continue rollout while advising users to check spam. Added a generic post-request reminder in frontend `app.js`: «Controlla anche la cartella Spam / Posta indesiderata.» This warning is identical for existing and non-existing accounts and does not leak registration status. Added regression assertion in `tests/password-recovery.test.mjs`. Sending reputation/inbox placement remains open for future monitoring; it is not a release blocker by user decision. No speculative DNS or sender change. Run tests against updated branch and complete release review before merge.
- Next auth step after password recovery is verified: account deletion.

## Current follow-up / next work

1. **No known blocking visible-panel regression.** Match, Giornata, Arbitro, Squadre, Predizione, Corner, Tiri, Indisponibili, Classifica and Indicatori have all been exercised during the Core V2/release work. Reopen panel code only for a reproduced defect or measurable request/performance improvement.
2. **Infrastructure follow-up:** review OVH security-update policy and operational logging; this is non-blocking for the current public app.
3. **Prediction research:** the Prediction Lab / v3 work remains a separate track. Do not change public prediction behavior casually; continue only with explicit validation and production deployment steps.
4. **Polish/features:** mobile tab polish, planned Falli visibility or other new UI work are product choices, not unfinished Core V2 blockers.

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

## Public deployment checkpoint — current 2026-10-07

- The public site is online at `https://app.calcioreport.com/`.
- GitHub Pages deploys the stable `main` branch.
- Core V2 is publicly released; the historical `core-v2` branch is no longer the active development base.
- Matchday / Giornata is released and verified in production.
- Shared fixture-statistics caching and the official-match sample rule are released and verified in production.
- The deployed Cloudflare Worker and OVH relay serve the live backend path.
- Continue to preserve `main` stability by developing on small branches and merging only after verification.

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

## Working rules

- one coherent task at a time;
- explain what will change, why, affected files/services and expected result before implementation;
- prefer direct GitHub changes over asking the user to edit code manually;
- never expose secrets;
- never mix old/new flows accidentally;
- test after each block;
- if a failure can be diagnosed in-app, add diagnostics rather than requiring browser developer tools;
- update this file whenever a meaningful milestone or architectural decision changes.

## Historical release-first decision — 2026-09-15 (completed)

The immediate product objective is to publish the tested Core V2 frontend as soon as the essential release checks pass.

Scope decision:

- freeze Prediction Lab development and keep the current production prediction model unchanged for the first Core V2 release;
- defer previous-season decay, schedule pressure, likely-turnover context, ML and other prediction refinements until after Core V2 is online;
- do not merge the experimental `codex/prediction-lab-baseline` branch into `core-v2` for this release;
- do not add new panels, redesign the interface or reopen closed infrastructure work before release;
- limit remaining work to automated regression tests, a short real-data smoke test, authentication/PRO verification, quick responsive-layout verification and deliberate deployment;
- keep `main` unchanged until the release candidate has passed those checks.

Fast release path:

1. return the local checkout to `core-v2` and pull the branch;
2. run the existing automated regression suite;
3. perform one compact desktop smoke test covering search, main match and all visible tabs without exhaustive re-auditing;
4. verify login plus one PRO-gated interaction;
5. perform one compact mobile-width visual check;
6. review the `core-v2...main` diff for unexpected files or secrets;
7. merge/deploy only after explicit approval of the release candidate;
8. immediately run an online smoke test and keep the previous stable `main` commit available as the rollback point.

Prediction research remains documented on `codex/prediction-lab-baseline` and is not a release blocker.

### Core V2 release-candidate verification — 2026-09-15

Release-candidate checks completed:

- `tests/prediction-model-characterization.test.mjs`: PASS;
- syntax check: all 18 frontend JavaScript files passed;
- raw lowercase `milan` + Enter resolved AC Milan and loaded the next match on the first attempt;
- live local diagnostics showed HTTP 200, Worker cache MISS and relay path active;
- searched-team and opponent following fixtures rendered;
- all visible tabs opened on the first click and returned coherent content;
- PRO account loaded Indicatori and Predizione data;
- newly registered TRIAL account was correctly blocked from PRO content and shown the upgrade action;
- a clock-source display bug was reproduced: an exact seven-day trial could show `8g rim.` when the client clock lagged the Worker;
- `app.js` now calculates remaining days using the Worker-provided `now`; the Worker still grants exactly seven days and no API request was added;
- `tests/auth-days-left.test.mjs`: PASS; real UI retest shows `TRIAL · 7g rim.`;
- all 18 local CSS/JavaScript asset references now use release cache version `20260915r1`;
- `tests/release-assets.test.mjs`: PASS;
- compact mobile-width test passed for header, search, horizontally scrollable tabs, match card and estimated `4-2-3-1` formation;
- the visible mobile tab scrollbar is accepted as non-blocking polish for a later release;
- `core-v2...main` review found no embedded secret, no direct API-Football frontend URL and no public literal IP;
- localhost diagnostics are guarded by hostname and remain absent from the public site.

Historical result: this release-candidate phase was completed and Core V2 was subsequently merged/released. See the current operating state at the top of this file.

## Prediction v3 production integration candidate — 2026-09-18

The leakage-safe Prediction Lab selected a dynamic attack/defence model with
locked parameters `learning-rate 0.075` and `blend 1.00`. Its one-time final
evaluation on the untouched Serie A 2025/26 target improved the full-season
metrics versus the current model:

- accuracy: `47.37%` to `49.21%` (`+1.84` points);
- log loss: `1.0770` to `1.0221`;
- Brier score: `0.6418` to `0.6121`;
- Ranked Probability Score: `0.2198` to `0.2098`;
- calibration error: `0.0739` to `0.0134`.

The first-30 subset did not improve every metric: accuracy fell by `3.33`
points and RPS increased by `0.0003`, although log loss, Brier and calibration
improved. For this reason the production candidate is deliberately limited:

- activate the v3 model only for API-Football league `135` (Serie A), the only
  competition validated so far;
- retain `poisson_v1_3_dc_cached` unchanged for every other competition;
- use only fixture details, the completed previous Serie A season and completed
  current-season fixtures before the target kickoff;
- cache the previous season for seven days and the current season for ten
  minutes;
- update matches sharing the same kickoff as one batch so their ordering cannot
  leak results into one another;
- use previous-season results in the estimate, but require three current-season
  matches for both teams and eight current league matches before presenting a
  model signal as evaluable;
- do not add player/injury or schedule-pressure adjustments until each has a
  separate historical validation.

Automated candidate checks pass:

- Worker syntax and the complete existing test suite;
- locked parameters and Serie A-only routing contract;
- same-kickoff order invariance;
- exclusion of results at or after the target kickoff;
- previous-season carry and expected-goal bounds;
- normalized 1X2 probabilities and frontend-compatible payload;
- end-to-end mocked Worker route with exactly three upstream calls and no
  duplicate legacy calls for Serie A;
- early-season signal guard and unchanged legacy route for other competitions.

This candidate belongs on `codex/prediction-v3-integration`. It must remain
experimental until the local real-data smoke test passes; no merge to `main`
and no Worker deployment is authorized yet.

### Reduced-history signal guard — 2026-09-18

The preview smoke test with Frosinone–Como confirmed that expected goals and
1X2 probabilities remain available for a promoted team, but also exposed an
overstated signal label: Frosinone had four current-season matches and no
previous Serie A history, while the raw 30-point 1X2 gap was shown as a net
signal.

The experimental candidate now keeps probabilities and expected goals
unchanged while treating team-history depth separately from the mathematical
edge:

- if a team has fewer than ten previous-season league matches and fewer than
  eight current-season matches, `coverage.historyLimited` is true;
- an otherwise evaluable prediction is labelled `Segnale da confermare` and
  its exposed signal score is capped at 45;
- the raw edge remains available as `rawSignalScore` for diagnostics;
- the explanation now distinguishes the full league training sample from each
  team's actual current/previous-season coverage;
- once the short-history team reaches eight current-season matches, the guard
  is removed automatically;
- the prediction formula, dynamic ratings, probabilities and expected goals
  are not modified.

## Matchday / Giornata — RELEASED (2026-10-05)

Branch: `feature/matchday` (created from current `main`, which is newer than the historical `core-v2` branch).

Implemented and released:

- new on-demand tab `📅 Giornata` inside the existing viewport, preserving the current UI identity;
- curated first release: Serie A, Premier League, La Liga, Bundesliga, Ligue 1;
- current round resolved through API-Football `/fixtures/rounds?league=...&season=...&current=true`;
- current-round pointer cached for 2 hours;
- fixed `league + season + round` fixture list cached for 30 days at Worker edge;
- browser stores the stable matchday composition (fixture id + home/away teams/logos) in persistent `localStorage`;
- dates/times are intentionally not rendered in the matchday list;
- clicking a match reloads `/fixtures?id=...` and then commits that exact fixture directly into Core V2 selection;
- direct fixture selection does not spoof/re-run the team search flow;
- after direct selection, existing Match rendering, standings mini-load, official-lineup check and on-demand panels continue to use the shared selected fixture;
- stale-response protection added when the user changes league quickly;
- release asset version bumped to `20261005r1`;
- added `tests/matchday-feature.test.mjs` and updated the release-assets expected version.

Validation performed from Chat:

- static integration checks passed;
- JavaScript syntax parsing passed for `app.js`, `js/features/matchdayPanel.js`, `js/features/searchController.js` and versioned `worker/worker.js`;
- runtime clone/test execution was not possible from the Chat container because direct outbound GitHub network access is blocked.

Local verification completed on 2026-10-05:

- local branch updated successfully;
- automated checks verified: the six pre-existing tests remained green and the dedicated `matchday-feature.test.mjs` now passes after fixing a test-only assertion;
- Serie A matchday list loaded correctly;
- direct click Inter–Parma opened the exact selected fixture;
- Premier League matchday list loaded correctly;
- direct click Sunderland–Brighton opened the exact selected fixture;
- next-fixture rendering was aligned with existing `main` behavior (next absolute commitment across competitions): Sunderland → Torrense and Brighton → Kauno Žalgiris verified manually;
- a race condition that could erase one side's already-resolved "Prossima" fixture was fixed;
- local diagnostic noise for direct fixture selection was removed.

Worker production deployment completed on 2026-10-05:

- Cloudflare Worker `calcio-report-proxy` manually deployed from the dashboard;
- deployed version shown by Cloudflare: `3ddffc3f`, promoted to 100% traffic;
- deployment changes limited to cache policy:
  - `/fixtures/rounds` -> 2 hours;
  - `/fixtures?league=...&season=...&round=...` -> 30 days;
- auth, relay transport, prediction logic and other routes were not intentionally changed.

Production Worker smoke test completed on 2026-10-05:

- local frontend reloaded after Worker deployment;
- Giornata → Serie A loaded normally through the deployed Worker path;
- no regression observed in the tested path.

Release completed on 2026-10-05:

- PR #4 merged into `main` at commit `ee71d8e7367aac9c5392bdbaff55ddc8c8250775`;
- GitHub Pages production at `https://app.calcioreport.com/` verified manually after merge;
- the `📅 Giornata` tab is visible and functional in production;
- Serie A and multiple other leagues reopen immediately after reload / Ctrl+F5 thanks to the intended cache reuse;
- production behavior confirmed stable after repeated matchday navigation.

Status: **RELEASED / VERIFIED IN PRODUCTION**.

