import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import * as routes from './src/routes.js';
import { createFsAdapter } from './src/adapters/fs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

const STORAGE_ENABLED = process.env.ENABLE_SERVER_STORAGE === 'true';
const STORAGE_PATH = process.env.STORAGE_PATH || '/data/diagrams';
const ENABLE_GIT_BACKUP = process.env.ENABLE_GIT_BACKUP === 'true';

// Express env exposed to route handlers (matches Worker `ctx.env`).
const routeEnv = {
  STORAGE_ENABLED,
  ENABLE_GIT_BACKUP,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
  AUTH_MODE: process.env.AUTH_MODE || 'none',
  // A5/CHR-08: surfaced to the client via /api/config so the app's own link
  // builders resolve against the operator's canonical base (see routes.js).
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    // This server returns JSON only (never HTML / the SPA), so rather than
    // disabling CSP we lock it all the way down: default-src 'none' blocks every
    // resource class and frame-ancestors 'none' blocks framing. Strictly
    // additive to the SPA's own CSP, which nginx / _headers still delivers for
    // the app origin (this server never serves the app).
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// CORS allowlist (security review 2026-07-05). A bare `cors()` emitted
// `Access-Control-Allow-Origin: *`, which — combined with the AUTH_MODE=none
// default — let any website the operator visited read/write their diagrams
// cross-origin (drive-by). In every real deployment `/api/*` is same-origin
// (nginx fronts both the app and the API on one origin), so the browser needs
// no ACAO at all; only `npm run dev` (SPA :3000 → backend :3001) is genuinely
// cross-origin. Default the allowlist to that dev origin and let operators
// widen it explicitly via ALLOWED_ORIGINS (comma-separated). Unknown origins
// get no ACAO header, so cross-origin reads/writes are blocked; same-origin and
// non-browser (no Origin header) requests are unaffected.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      return cb(null, ALLOWED_ORIGINS.includes(origin));
    }
  })
);

// S2/SHARE-09: CORS is a RESPONSE-side control. The allowlist above makes the
// browser withhold the response from an unknown origin — but the request has
// already executed on the server. Any request the browser classes as
// CORS-safelisted skips the preflight entirely, including `POST` with
// `Content-Type: text/plain`, and `POST /api/diagrams/:id/share` needs no body
// at all. Measured on the default self-host config (AUTH_MODE=none): a
// cross-origin share POST from `https://evil.example` returned 200 with NO
// `access-control-allow-origin` header and the diagram was genuinely published.
// `PUT`/`PATCH`/`DELETE` were already safe (they force a preflight the
// allowlist refuses), so the exposure was exactly the safelisted-request subset
// — which the ACAO check the 2026-07-05 security review relied on cannot see.
//
// Reject the REQUEST, not just the response: a disallowed Origin never reaches
// a handler. Requests with no Origin header (same-origin, curl,
// server-to-server) are unaffected, matching the CORS callback above.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ error: 'Origin not allowed' });
});

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Auth (shared-token only — cf-access is Cloudflare-specific)
// ---------------------------------------------------------------------------
const AUTH_MODE = process.env.AUTH_MODE || 'none';
const AUTH_SHARED_SECRET = process.env.AUTH_SHARED_SECRET || '';

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Anchored to exactly match the Worker's regex (packages/axoview-worker/src/auth.ts)
// so both runtimes bypass auth for the identical shape — a bare `startsWith`
// exempted any path under the prefix, drifting from the Worker.
const PUBLIC_SNAPSHOT_RE = /^\/api\/public\/diagrams\/[A-Za-z0-9_-]{21,64}$/;

function isPublicRoute(req) {
  // Always-public endpoints. Per ADR 0010 D6, the public namespace is read-only;
  // both endpoints are GET-only to match the Worker (packages/axoview-worker/src/auth.ts).
  if (req.method === 'GET' && req.path === '/api/config') return true;
  if (req.method === 'GET' && PUBLIC_SNAPSHOT_RE.test(req.path)) return true;
  return false;
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (isPublicRoute(req)) return next();
  if (AUTH_MODE === 'none') return next();
  if (AUTH_MODE === 'shared-token') {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!AUTH_SHARED_SECRET || !constantTimeEquals(token, AUTH_SHARED_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  }
  // cf-access only meaningful behind Cloudflare Access — reject if misconfigured here
  return res.status(500).json({ error: `AUTH_MODE "${AUTH_MODE}" not supported on this runtime` });
});

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
const adapter = createFsAdapter(STORAGE_PATH);

if (STORAGE_ENABLED) {
  (async () => {
    try {
      await fs.access(STORAGE_PATH);
      const files = await fs.readdir(STORAGE_PATH);
      console.log(
        `Storage directory exists: ${STORAGE_PATH} (${files.length} files)`
      );
    } catch {
      console.log(`Creating storage directory: ${STORAGE_PATH}`);
      await fs.mkdir(STORAGE_PATH, { recursive: true });
    }
  })().catch((err) => console.error('Failed to initialize storage:', err));
}

// ---------------------------------------------------------------------------
// Express → routes.js bridge
// ---------------------------------------------------------------------------

function getPublicBaseUrl(req) {
  // Prefer an operator-configured canonical base so share links cannot be
  // poisoned via the client-controlled Host / X-Forwarded-Proto headers
  // (security review 2026-07-05). Falls back to request-derived headers only
  // when PUBLIC_BASE_URL is unset, preserving the previous default behaviour.
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function makeCtx(req) {
  return {
    params: req.params,
    body: req.body,
    query: req.query,
    env: routeEnv,
    publicBaseUrl: getPublicBaseUrl(req)
  };
}

function adapt(handler, { requireStorage = true } = {}) {
  return async (req, res) => {
    if (requireStorage && !STORAGE_ENABLED) {
      return res.status(503).json({ error: 'Server storage is disabled' });
    }
    try {
      const result = await handler(adapter, makeCtx(req));
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err && typeof err.status === 'number') {
        return res.status(err.status).json(err.body);
      }
      // User-controlled req.method/req.path are passed as %s arguments, NOT
      // interpolated into the format string, so a path containing %-specifiers
      // can't be re-interpreted by util.format (CodeQL: tainted-format-string).
      console.error('[%s %s]', req.method, req.path, err);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

// ---------------------------------------------------------------------------
// Health probe (ADR 0010 Decision 8)
// ---------------------------------------------------------------------------
// Cached probe — orchestrators may poll every few seconds; we don't want to
// touch the disk on every request.
const HEALTH_TTL_MS = 10_000;
let healthCache = { ts: 0, ok: false, reason: 'not-yet-probed' };

async function probeStorage() {
  if (!STORAGE_ENABLED) return { ok: true };
  const probePath = path.join(STORAGE_PATH, `.healthz.${process.pid}.tmp`);
  try {
    await fs.mkdir(STORAGE_PATH, { recursive: true });
    await fs.writeFile(probePath, '');
    await fs.unlink(probePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.code || 'storage-unreachable' };
  }
}

app.get('/healthz', async (_req, res) => {
  const now = Date.now();
  if (now - healthCache.ts > HEALTH_TTL_MS) {
    const probe = await probeStorage();
    healthCache = { ts: now, ...probe };
  }
  if (healthCache.ok) {
    return res.status(200).json({
      ok: true,
      adapter: 'fs',
      storage_writable: STORAGE_ENABLED
    });
  }
  return res.status(503).json({ ok: false, reason: healthCache.reason });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Config — never gated by STORAGE_ENABLED; sole boot probe per ADR 0009 D2
app.get('/api/config', adapt(routes.getConfig, { requireStorage: false }));

// Diagrams
app.get('/api/diagrams', adapt(routes.listDiagrams));
app.get('/api/diagrams/:id', adapt(routes.getDiagram));
app.post('/api/diagrams', adapt(routes.createDiagram));
app.put('/api/diagrams/:id', adapt(routes.saveDiagram));
app.patch('/api/diagrams/:id', adapt(routes.patchDiagram));
app.patch('/api/diagrams/:id/move', adapt(routes.moveDiagram));
app.delete('/api/diagrams/:id', adapt(routes.deleteDiagram));

// Folders
app.get('/api/folders', adapt(routes.listFolders));
app.post('/api/folders', adapt(routes.createFolder));
app.put('/api/folders/:id', adapt(routes.renameFolder));
app.patch('/api/folders/:id/move', adapt(routes.moveFolder));
app.delete('/api/folders/:id', adapt(routes.deleteFolder));

// Tree manifest
app.get('/api/tree-manifest', adapt(routes.getTreeManifest));
app.put('/api/tree-manifest', adapt(routes.saveTreeManifest));

// Share
app.post('/api/diagrams/:id/share', adapt(routes.shareDiagram));
// SHARE-10 (owner ruling 2026-07-30): the read stays exempt from
// ENABLE_SERVER_STORAGE=false — a published artifact surviving an API
// kill-switch is normal (S3/Pages/publish-to-web) — and REVOCATION becomes
// exempt alongside it, because "unpublish" must always remain reachable. The
// pair moves together; documented in docs/deployment.md.
app.delete('/api/diagrams/:id/share', adapt(routes.unshareDiagram, { requireStorage: false }));
app.get('/api/public/diagrams/:uuid', adapt(routes.getPublicSnapshot, { requireStorage: false }));

// ---------------------------------------------------------------------------
// Terminal error middleware (S2/SHARE-08)
// ---------------------------------------------------------------------------
// `body-parser` rejections never reach `adapt()`'s wrapper — it only wraps the
// HANDLER — so they fell through to Express's built-in handler, which answers
// with an HTML error page containing a Node stack trace. The client's
// `response.json()` then threw, so instead of the ADR 0011 failure dialog
// naming the cause the user got a generic error or nothing at all. Measured
// against the real server: a truncated JSON body returned 400 `text/html`
// carrying `SyntaxError`, and an 11 MB body returned 413 `text/html` carrying
// `entity too large` and `at ` stack frames.
//
// The worker is the correct sibling: its `bodyLimit` answers
// `{ error: 'Payload too large' }` as JSON with 413, and its `onError`
// deliberately logs the stack while keeping it out of the response. Match it.
// Typed on `err.type` rather than the message, and mounted last so a parser
// error raised before any route still lands here.
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by its arity
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error('[%s %s] unhandled', req.method, req.path, err);
  return res.status(500).json({ error: 'Internal error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Axoview Backend Server running on port ${PORT}`);
  console.log(`Server storage: ${STORAGE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (STORAGE_ENABLED) {
    console.log(`Storage path: ${STORAGE_PATH}`);
    console.log(`Git backup: ${ENABLE_GIT_BACKUP ? 'ENABLED' : 'DISABLED'}`);
  }
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(', ') || '(none — same-origin only)'}`);
  // Security review 2026-07-05: storage-on + no-auth is a network-reachable,
  // unauthenticated read/write store. CORS is now locked down (drive-by from a
  // web page is blocked), but anyone who can reach the port directly still has
  // full access. Warn loudly so operators set AUTH_MODE before exposing it.
  if (STORAGE_ENABLED && AUTH_MODE === 'none') {
    console.warn(
      '[SECURITY] Server storage is ENABLED with AUTH_MODE=none — the API is ' +
        'UNAUTHENTICATED. Anyone who can reach this port can read, modify, and ' +
        'publicly share every diagram. Do NOT expose it beyond loopback/a trusted ' +
        'LAN. Set AUTH_MODE=shared-token + AUTH_SHARED_SECRET (see docs/deployment.md).'
    );
  }
});
