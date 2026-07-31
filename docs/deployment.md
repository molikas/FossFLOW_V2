# Axoview — Deployment Guide

**Last updated:** 2026-07-15 (docs housekeeping — repaired 4 code links that were missing their `../` prefix. Content last changed 2026-07-14: §C3 rewritten for the Drive **server read-proxy** + `GOOGLE_API_KEY` as a Cloudflare secret — [ADR 0042](adr/0042-drive-native-sharing-and-readonly-preview.md) §8 / [0043](adr/0043-deferred-backend-for-google-api-hardening.md) #3. Prior: 2026-07-07 Google Drive storage shipped.)

Axoview runs on three targets from a single codebase:

| Target | Runtime | Storage | Auth options |
|---|---|---|---|
| **Local dev** | `npm run dev` (rsbuild on :3000 + Express on :3001) | Filesystem if `ENABLE_SERVER_STORAGE=true`, else session (+ Google Drive when configured) | `none`, `shared-token` |
| **Docker** | nginx + Express on Node | Filesystem volume | `none`, `shared-token` |
| **Cloudflare Pages** | Pages Functions (Hono) | **Session/localStorage + Google Drive** (per-user, client-side) | `none`, `shared-token`, `cf-access` |

The frontend bundle is identical across all three. The Cloudflare deployment has no server-side storage — `/api/config` returns `serverStorage: false` — but ships the **Google Drive place** ([ADR 0036](adr/0036-google-drive-storage-provider.md), [ADR 0037](adr/0037-storage-places-model.md)): a signed-in user's diagrams persist in their own Drive, entirely client-side.

> ⚠️ **Single-tenant per deploy.** Axoview's storage layer assumes **one user per deployment** (see [ADR 0010 §D4](adr/0010-session-backend-contract.md)). Multi-user self-host requires operator-managed isolation — one container per user, a Cloudflare Access policy, or a network ACL. **`AUTH_MODE=shared-token` is not a team password — it is a single bearer token.** A team using one Docker deploy + `shared-token` will share every diagram across every user. If you need per-user isolation, deploy one instance per user — or use the Drive place, which is per-Google-account by construction.

Both backends share a single `/api/*` HTTP contract. Two routes are public on every target:

- `GET /api/config`
- `GET /api/public/diagrams/:uuid`

Everything else is gated by `AUTH_MODE`.

---

## A. Local development

```bash
npm install
npm run dev              # SPA on http://localhost:3000
npm run dev:backend      # Express on http://localhost:3001 (separate terminal)
```

The SPA's `apiBaseUrl()` ([packages/axoview-app/src/utils/apiBaseUrl.ts](../packages/axoview-app/src/utils/apiBaseUrl.ts)) auto-redirects `/api/*` to `:3001` when the host is `localhost:3000`. In every other context it uses same-origin relative paths.

To exercise the filesystem path, run the backend with:

```bash
ENABLE_SERVER_STORAGE=true STORAGE_PATH=./diagrams npm run dev:backend
```

Otherwise the app falls back to `sessionStorage`.

---

## B. Docker

```bash
docker compose up --build
```

Defaults to `AUTH_MODE=none`, `ENABLE_SERVER_STORAGE=true`, `STORAGE_PATH=/data/diagrams`.

### Enable shared-token auth

```yaml
environment:
  AUTH_MODE: shared-token
  AUTH_SHARED_SECRET: ${AUTH_SHARED_SECRET}    # set in .env
  ENABLE_SERVER_STORAGE: "true"
  STORAGE_PATH: /data/diagrams
  GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}        # optional, surfaced via /api/config
```

`GOOGLE_CLIENT_ID` (public identifier) enables Google sign-in + the user's own
Drive as storage. **Anonymous read-only preview is NOT available on Docker** —
the read proxy (`/api/public/drive/:id`) lives only in the Cloudflare worker
([ADR 0042 §8](adr/0042-drive-native-sharing-and-readonly-preview.md)), so the
Express backend emits `drivePublicPreview: false` and does not use `GOOGLE_API_KEY`.
Drive sharing itself (share dialog, copy-link, owner preview) still works.

`AUTH_MODE=cf-access` is rejected by Express at request time — that mode only makes sense behind Cloudflare Access.

### Smoke test

```bash
BASE=http://localhost:3001
curl "$BASE/api/config"
curl -H "Authorization: Bearer $AUTH_SHARED_SECRET" "$BASE/api/diagrams"
```

---

## C. Cloudflare Pages

### C1. Prerequisites

- Cloudflare account (free plan).
- `npx wrangler login` once before the first deploy.

### C2. Configure auth (pick one)

**`none`** — public, no token. The default for the storage-less PoC. Fine for read-only demos.

**`shared-token`** — single bearer token shared with every editor.

```bash
npx wrangler pages secret put AUTH_SHARED_SECRET
# paste the token when prompted
```

In [packages/axoview-worker/wrangler.toml](../packages/axoview-worker/wrangler.toml) keep `AUTH_MODE = "shared-token"` (the default).

**`cf-access`** — Cloudflare Access JWT (zero-trust). Set up an Access application that fronts your `*.pages.dev` (or custom) domain, then:

```toml
# packages/axoview-worker/wrangler.toml
[vars]
AUTH_MODE = "cf-access"
CF_ACCESS_TEAM_DOMAIN = "your-team"     # the subdomain in <team>.cloudflareaccess.com
CF_ACCESS_AUD         = "<application-aud>"
```

### C3. (Optional) Google Drive client ID & sharing key

Enables the Google Drive place (sign-in, Drive storage, move-to-Drive). The
client ID is a **public OAuth identifier, not a secret** — it is committed as a
`[vars]` entry in [packages/axoview-worker/wrangler.toml](../packages/axoview-worker/wrangler.toml)
(kept in lockstep with the repo-root `wrangler.toml` per ADR 0009 Decision 5):

```toml
# packages/axoview-worker/wrangler.toml
[vars]
GOOGLE_CLIENT_ID = "<your-client-id>.apps.googleusercontent.com"
```

The frontend reads it at runtime via `GET /api/config` — no rebuild needed when
it changes. Without it, the app runs session-only (no sign-in affordances).

Two further optional values ([ADR 0042 §8](adr/0042-drive-native-sharing-and-readonly-preview.md) /
[ADR 0043 #3](adr/0043-deferred-backend-for-google-api-hardening.md)):

- `GOOGLE_API_KEY` powers the **anonymous read proxy** `GET /api/public/drive/<fileId>`,
  which serves "anyone with the link" Drive diagrams at `/app/display/drive/<fileId>`
  with **no sign-in**. Since 2026-07-14 the key stays **server-side and is never
  shipped to the browser**, so set it as a **secret**, not a `[vars]` entry:

  ```bash
  npx wrangler pages secret put GOOGLE_API_KEY --project-name axoview
  # or: Cloudflare dashboard → Pages → axoview → Settings → Variables and Secrets,
  #     set it under BOTH the Production and Preview environments.
  ```

  Create it in the same Cloud project as the OAuth client, **API-restricted to
  the Google Drive API**. Because it is only ever called server-side (from the
  Worker), it needs **no HTTP-referrer restriction** — that whole allowlist goes
  away. `/api/config` exposes only a `drivePublicPreview` boolean (`!!GOOGLE_API_KEY`),
  never the key. With it set, the owner flips **"Anyone with the link → can view"**
  in the share dialog and the recipient's link renders with no login.
- `GOOGLE_PROJECT_NUMBER` (`/api/config` → `googleProjectNumber`; a plain `[vars]`
  entry — not secret) is the Cloud project **NUMBER** the Google Picker's
  `setAppId` needs for the **private-file grant flow (Option B)**. Its own value —
  do NOT derive it from the client-id prefix; a wrong value makes the grant fail
  silently. The Picker also needs a *browser* API key (`setDeveloperKey`), which
  is **not** wired now (the server key is server-only), so Option B stays dormant
  until a separate referrer-restricted browser key is added. Option A (public
  links) needs none of this.

If `GOOGLE_API_KEY` is unset, Drive sharing still works (share dialog, copy-link,
owner preview) but anonymous preview degrades to the sign-in path.

### C4. Deploy

```bash
npm install
npm run build
npx wrangler pages deploy packages/axoview-app/build --project-name axoview
```

The first deploy creates the Pages project. Subsequent deploys reuse it.

### C5. Smoke test

```bash
BASE=https://axoview.app
curl "$BASE/api/config"             # always public, returns serverStorage: false
curl -i "$BASE/api/diagrams"        # 503 — storage disabled
```

With `AUTH_MODE=shared-token`, `/api/config` remains unauthenticated so the SPA can boot. Every other `/api/*` route requires the bearer token (`GET /api/public/diagrams/:uuid` is also public, but is the read-only share-snapshot route, not a boot probe).

### C6. One-click "Deploy to Cloudflare"

The repo-root [wrangler.toml](../wrangler.toml) is set up so the deploy button works against a fork:

```markdown
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/<your-fork>/Axoview)
```

---

## D. What's the same on every target

- HTTP contract for every `/api/*` endpoint the frontend calls.
- Public routes that bypass auth: `GET /api/config`, `GET /api/public/diagrams/:uuid`.
- Body limit: 10 MB per request. Over it, or a body that does not parse, answers
  `{ "error": … }` JSON (413 / 400) — never an HTML error page, and never a
  stack trace.
- Requests carrying an `Origin` header that is not in `ALLOWED_ORIGINS` are
  **refused with 403 before any handler runs**. CORS alone only withholds the
  *response*; a CORS-safelisted request (e.g. `POST` with
  `Content-Type: text/plain`) skips the preflight entirely and would otherwise
  have already executed. Requests with no `Origin` (same-origin, curl,
  server-to-server) are unaffected.
- ID validation: `^[a-zA-Z0-9_-]{1,64}$`, minus the four reserved storage names
  `folders`, `tree-manifest`, `metadata` and `diagrams-index` — anything else is
  `400 Invalid id` (Docker only; Cloudflare 503s before reaching the validator).
  The reserved names matter because the fs adapter flattens `diagrams/<id>` to
  `<STORAGE_PATH>/<id>.json`, so a diagram called `folders` would resolve to the
  same file as the folder tree.
- Drive OAuth scope is locked to `drive.file` (per-file consent only) — the app sees only files it created ([ADR 0035](adr/0035-google-identity-and-drive-authorization.md)).
- Runtime config (`GET /api/config`) replaces build-time env injection — the frontend bundle never embeds secrets.

### D.0 `PUBLIC_BASE_URL` — the base every share link resolves against

Optional on every target. When set, it is the canonical, externally reachable
base URL of the deployment, and **every share link the app mints uses it** —
the public-snapshot link (`/display/p/:uuid`) and the Drive preview link
(`/display/drive/:fileId`) alike. Unset, both fall back to the page origin,
which is the historical behaviour and correct for a single-origin deployment.

```bash
PUBLIC_BASE_URL=https://diagrams.example.com
```

Set it whenever the app is reachable on more than one origin — a Cloudflare
`*.pages.dev` preview build, a staging host, a LAN IP alongside a public
hostname. Without it, a link copied while on the preview origin embeds that
origin and keeps pointing there long after the preview is gone. This is
standard for products that mint shareable links (GitLab `external_url`, Grafana
`root_url`, Sentry `system.url-prefix`).

The value is surfaced to the browser through `GET /api/config` as
`publicBaseUrl`. The Express backend has always used the same variable for the
`url` it returns from `POST /api/diagrams/:id/share`, so the two agree.

### D.1 `ENABLE_SERVER_STORAGE=false` — the two routes that stay reachable

Turning server storage off makes every `/api/*` route answer
`503 Server storage is disabled`, with **three** deliberate exemptions:

| Route | Why it stays reachable |
|---|---|
| `GET /api/config` | The sole boot probe ([ADR 0009](adr/0009-runtime-config-and-boot-probe.md) D2) — the app cannot discover that storage is off without it. |
| `GET /api/public/diagrams/:uuid` | A **published artifact surviving an API kill-switch is normal** (S3, Pages, publish-to-web). Links already sent to other people keep working. |
| `DELETE /api/diagrams/:id/share` | **Unpublish must always remain reachable.** If the read survives the switch, the revoke has to as well — otherwise flipping the flag strands a live public link with no way to take it down. |

The last two are a **pair**: change one and you must change the other. Keeping
the read exempt while gating the revoke is the failure mode this exemption
exists to prevent (owner ruling 2026-07-30 on S2/SHARE-10).

Note the exemptions are about `ENABLE_SERVER_STORAGE`, **not** about auth. Under
`AUTH_MODE=shared-token` only the two `GET`s bypass authentication; the revoke
still requires the bearer token, so it is reachable by the operator, not by
anyone with the link.

## E. What differs

| Concern | Cloudflare | Docker |
|---|---|---|
| Storage | Session/localStorage + Google Drive place (client-side) | `STORAGE_PATH` on disk |
| `cf-access` auth | Supported (JWKS RS256 verify) | Rejected (500) |
| Static delivery | CF CDN + `_headers` | nginx (compose stack) |
| Body limit enforcement | Hono `bodyLimit({ maxSize: 10MB })` | `express.json({ limit: '10mb' })` |
| CSP delivery | `_headers` file | nginx config |

---

## E.1 Observability (Cloudflare)

The Worker registers a Hono `app.onError` handler ([packages/axoview-worker/src/app.ts](../packages/axoview-worker/src/app.ts)) that emits a single structured `console.error` — `[worker:500] <method> <path> <errorName>` — on any uncaught 500. It surfaces in `wrangler tail` / the Pages real-time logs so an edge fault is named without a redeploy. This is the only edge-hardening piece shipped (v1.1 PR #11, A.1). Further edge hardening — Bot Fight Mode, WAF, scanner-path block, rate-limit — is **deferred** and only revisited if production 5xx persist; deployment-hygiene items (B / housekeeping) are deferred indefinitely. See the catalogued-workstreams list in [PLAN.md](../PLAN.md).

---

## F. Troubleshooting

**`401 Unauthorized` on every API call** — `AUTH_MODE=shared-token` is set but the client isn't sending `Authorization: Bearer …`. The SPA does not currently inject the header itself; front the deployment with a reverse proxy that injects it, or use `AUTH_MODE=cf-access`, or run with `AUTH_MODE=none`.

**Cloudflare deploy returns `503 Server storage is disabled` on `/api/diagrams`** — expected. The Cloudflare runtime has no server-side storage; persistence there is the client-side Google Drive place (§C3). Use the Docker target for server-side storage.

**Path-traversal `400 Invalid id`** (Docker) — expected. IDs are strict NanoID-like alphanum; do not relax `assertId`.

**Build succeeds locally but `wrangler pages deploy` 404s on `/api/*`** — check that [packages/axoview-app/public/_routes.json](../packages/axoview-app/public/_routes.json) was copied into `build/`. Rsbuild copies the `public/` tree by default.
