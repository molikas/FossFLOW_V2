import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { authMiddleware } from './auth';

interface Env {
  AUTH_MODE?: 'none' | 'shared-token' | 'cf-access';
  AUTH_SHARED_SECRET?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_PROJECT_NUMBER?: string;
  /** A5/CHR-08 — canonical public base for the links the app mints. */
  PUBLIC_BASE_URL?: string;
}

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

// DP4 (v1.1 CF hardening): single console.error on uncaught 500 with
// method + path + error name. Stack stays internal (ADR 0011 spirit:
// no stack-trace leak in visible response copy). Provides the
// observability hook that wrangler tail will surface in production.
app.onError((err, c) => {
  const url = new URL(c.req.url);
  console.error(`[worker:500] ${c.req.method} ${url.pathname} ${err.name}`);
  return c.json({ error: 'Internal Server Error' }, 500);
});

/**
 * Ceiling on a proxied Drive body. Shared with the `bodyLimit` below so the two
 * caps cannot drift; the read proxy applies it to Drive's DECLARED size, and
 * fails closed when Drive declares nothing (S2/SHARE-07).
 */
const MAX_PROXY_BYTES = 10 * 1024 * 1024;

app.use('*', secureHeaders());
app.use(
  '/api/*',
  bodyLimit({
    maxSize: MAX_PROXY_BYTES,
    onError: (c) => c.json({ error: 'Payload too large' }, 413)
  })
);
app.use('/api/*', authMiddleware());

app.get('/api/config', (c) =>
  c.json(
    {
      googleClientId: c.env.GOOGLE_CLIENT_ID || null,
      // The API key is NEVER shipped to the browser — it stays server-side for
      // the /api/public/drive read proxy below (ADR 0043 #3). Expose only
      // WHETHER anonymous preview is available, so the client's read ladder
      // knows to try the proxy rung.
      drivePublicPreview: !!c.env.GOOGLE_API_KEY,
      googleProjectNumber: c.env.GOOGLE_PROJECT_NUMBER || null,
      driveScopes: ['https://www.googleapis.com/auth/drive.file'],
      authMode: c.env.AUTH_MODE || 'none',
      serverStorage: false,
      // A5/CHR-08 (owner ruling 2026-07-30) — the operator's canonical public
      // base, so a Drive share link minted from a *.pages.dev preview build
      // still points at the production site. Null → the page origin, which is
      // the existing behaviour.
      publicBaseUrl: c.env.PUBLIC_BASE_URL || null
    },
    200
  )
);

// Anonymous read proxy for "anyone with the link" Drive diagrams — ADR 0042 §2
// rung 1, moved server-side per ADR 0043 #3. The API key stays server-only and
// can ONLY ever read PUBLICLY-shared files (an API key can't touch a private
// one), so this exposes no private data and needs no auth (isPublicRoute).
//
// Reads metadata first (fields=trashed,size) so it can HONOR Drive's trashed
// flag: a "deleted" diagram in Axoview is a Drive trash (ADR 0036 §3), and a
// trashed file must stop resolving here — matching Drive's own web-share
// semantics (restoring from Trash revives the link). `Cache-Control: 60s` only
// lets a viewer's browser dedupe repeat opens — Cloudflare does not edge-cache
// Function responses without a Cache Rule, so this is browser-side only.
app.get('/api/public/drive/:fileId', async (c) => {
  const key = c.env.GOOGLE_API_KEY;
  if (!key) return c.json({ error: 'preview-disabled' }, 503);

  const fileId = c.req.param('fileId');
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(fileId)) {
    return c.json({ error: 'bad-file-id' }, 400);
  }

  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  const keyQ = `key=${encodeURIComponent(key)}`;
  // Our preview URLs may carry a ?resourceKey= (ADR 0042 §1); forward it as the
  // header Drive expects, on BOTH the metadata and content reads.
  // Validated on the same allowlist as fileId before it is interpolated into a
  // header value. Not currently exploitable — the Workers runtime rejects CRLF
  // in header values — but the invariant should be enforced here, not inherited
  // from the runtime (2026-07-29 review, F3). A malformed key is dropped rather
  // than rejected: it is an optional hint, and Drive answers without it.
  const rawResourceKey = c.req.query('resourceKey');
  const resourceKey =
    rawResourceKey && /^[A-Za-z0-9_-]{1,120}$/.test(rawResourceKey)
      ? rawResourceKey
      : undefined;
  const init: RequestInit = resourceKey
    ? { headers: { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } }
    : {};

  // 1) Metadata — the trashed gate + size cap without pulling the body.
  let metaRes: Response;
  try {
    metaRes = await fetch(`${base}?fields=trashed,size&${keyQ}`, init);
  } catch {
    return c.json({ error: 'upstream-unreachable' }, 502);
  }
  if (!metaRes.ok) {
    // A transient upstream failure (rate limit / 5xx) must stay distinguishable
    // so the client can offer Retry instead of the sign-in ladder.
    if (metaRes.status === 429 || metaRes.status >= 500) {
      return c.json({ error: 'upstream-error' }, 503);
    }
    // Private, or permanently deleted — Drive hides both as 404. The client's
    // read ladder falls through to the authenticated rung.
    return c.json({ error: 'not-public' }, 404);
  }
  const meta = (await metaRes.json()) as { trashed?: boolean; size?: string };
  if (meta.trashed) {
    // Deleted-but-recoverable: the link is dead (410 Gone) until the owner
    // restores it — the client renders "no longer available", not the sign-in
    // ladder.
    return c.json({ error: 'gone' }, 410);
  }
  // S2/SHARE-07: fail CLOSED on an unknown size. The gate used to be
  // `Number(meta.size ?? '0') > cap`, and Drive reports `size` only for files
  // with binary content stored in Drive — when it is absent the `?? '0'`
  // default reads as a zero-byte file and an unbounded body streams through the
  // Worker. A non-numeric value was just as bad: `Number('unknown')` is `NaN`
  // and `NaN > cap` is `false`. Measured: metadata `{trashed:false}` with a
  // 30 MB body returned 200 with all 31 457 280 bytes. The neighbouring
  // `trashed` gate on the same metadata read already fails closed on a missing
  // field, so the size cap was the outlier — a missing size means "unknown",
  // not "zero".
  const declaredSize =
    typeof meta.size === 'string' && meta.size.trim() !== ''
      ? Number(meta.size)
      : Number.NaN;
  if (!Number.isFinite(declaredSize) || declaredSize > MAX_PROXY_BYTES) {
    return c.json({ error: 'too-large' }, 413);
  }

  // 2) Content.
  let contentRes: Response;
  try {
    contentRes = await fetch(`${base}?alt=media&${keyQ}`, init);
  } catch {
    return c.json({ error: 'upstream-unreachable' }, 502);
  }
  if (!contentRes.ok) {
    if (contentRes.status === 429 || contentRes.status >= 500) {
      return c.json({ error: 'upstream-error' }, 503);
    }
    return c.json({ error: 'not-public' }, 404);
  }

  const body = await contentRes.text();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // S3/DRV-07: `private`, not `public`. The in-code rationale for caching
      // was browser-side dedupe of repeat opens, which `private` serves just as
      // well; `public` additionally authorised SHARED caches, so revoking a
      // Drive link left the diagram readable from a proxy that could hand it to
      // other requesters. `must-revalidate` keeps a stale entry from being
      // served past the window. The 404/410 paths carry no cache header at all,
      // so only the readable body ever lingered — which is why the window was
      // specific to an ACL change rather than to deletion.
      'Cache-Control': 'private, max-age=60, must-revalidate'
    }
  });
});

app.all('/api/*', (c) =>
  c.json({ error: 'Server storage is disabled' }, 503)
);

export default app;
