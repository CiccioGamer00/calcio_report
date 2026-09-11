# Calcio Report — Project Status

_Last updated: 2026-09-11_

This file is the operational source of truth for the current Core V2 rebuild. Keep it updated when architecture, infrastructure, or implementation status changes.

## Product direction

Calcio Report is a football analysis web app. The current visual identity should be preserved unless a change is explicitly agreed. The goal is to rebuild the core so search, fixture loading, panels, caching, auth and monetization behave deterministically and scale to real users.

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
  - expose `x-cr-cache` diagnostics;
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

Current deployed fixes include:

- semantic API-Football errors are not edge-cached;
- separate V2 cache namespace/keying;
- canonical query parameter ordering;
- upstream error responses use `no-store`;
- `Access-Control-Expose-Headers: x-cr-cache`;
- root direct access without auth correctly returns `AUTH_REQUIRED`.

Important: the deployed Worker still calls API-Football directly. VPS relay integration has not happened yet.

## Relay status

Files already prepared:

```text
relay/package.json
relay/server.js
relay/README.md
relay/deploy/calcio-report-relay.service
relay/deploy/relay.env.example
relay/deploy/Caddyfile.example
```

Design goals:

- API-Football key stored only as VPS environment variable;
- shared Worker/VPS secret stored only as environment secret;
- HMAC SHA-256 request authentication;
- timestamp validation;
- GET only;
- API-Football endpoint allowlist;
- relay listens internally on `127.0.0.1:8788`;
- HTTPS handled by Caddy reverse proxy;
- outbound pacing below API-Football per-second limit;
- deduplicate identical concurrent requests;
- main data cache remains Cloudflare edge cache;
- service runs under dedicated unprivileged user `calcioreport` with systemd hardening.

Deployment layout planned on VPS:

```text
/opt/calcio-report/relay/
/etc/calcio-report/relay.env
/etc/systemd/system/calcio-report-relay.service
/etc/caddy/Caddyfile
```

The internal relay port `8788` must stay closed in UFW. Public web traffic will terminate on Caddy over ports 80/443, while SSH stays on 22.

Relay is not installed on the VPS yet. The Worker must not be switched to the relay until the local VPS relay and HTTPS endpoint have both been tested successfully.

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
- Node.js executable verified at `/usr/bin/node`, matching the prepared systemd service;
- Caddy 2.6.2 installed from the official Ubuntu repository;
- Caddy systemd service verified active.

Current note:

- SSH hardening and post-update reboot are complete and verified;
- Node.js and Caddy are installed and running as expected;
- the dedicated `calcioreport` service user and relay service are not installed yet.

Security / infrastructure still pending:

- create dedicated service user and install relay files;
- create VPS-only environment file with real secrets;
- keep internal service ports closed;
- security update policy/logging review;
- configure DNS and HTTPS;
- connect Cloudflare Worker to relay only after relay tests pass.

## Immediate next objective

Do not resume panels or lineup rebuild yet.

First make this path work reliably:

```text
localhost frontend
    ↓
Cloudflare Worker
    ↓
OVH relay with stable egress IP
    ↓
API-Football
```

Operational order from here:

1. create dedicated service user and install relay files;
2. create VPS-only environment file with real secrets;
3. test relay on `127.0.0.1:8788`;
4. configure DNS + Caddy HTTPS and test `/health`;
5. only then integrate Worker -> relay with HMAC.

Then validate:

1. single controlled request;
2. `x-cr-cache` behavior;
3. repeated searches without abnormal rate-limit;
4. sequence: Milan → Juventus → Inter → Milan;
5. verify stale responses never overwrite current search;
6. confirm upstream call count stays controlled.

Only after that resume Core V2 feature migration.

## Planned Core V2 sequence after relay validation

1. main match secondary data (opponent next match etc.) without blocking main render;
2. Panel Manager with states `idle/loading/success/empty/error`;
3. migrate panels one at a time;
4. lightweight official lineup check;
5. estimated lineup only on demand;
6. formation parser fixes for multi-line shapes such as 4-2-3-1, 4-1-4-1, 3-4-2-1;
7. optimize/cache historical calls;
8. mobile search/tabs polish;
9. security/performance review before merging to `main`.

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
