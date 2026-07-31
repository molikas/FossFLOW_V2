/**
 * server.wiring.spec.js — promoted from the 2026-07 exploratory lane
 * (`__explore__/S2/share-08-09-10-14`) when wave 2 fixed the S2 block.
 *
 * These cannot be answered at the handler tier: they are about helmet/cors/
 * body-parser ordering, the terminal error middleware, and the `requireStorage`
 * flags on the route table. So this boots the REAL `server.js` as a child
 * process against a temp STORAGE_PATH and speaks HTTP to it.
 *
 *  SHARE-08  a body-parser failure must answer the `{ error }` JSON contract,
 *            not Express's default HTML page with a Node stack trace;
 *  SHARE-09  CORS is a RESPONSE-side control — a disallowed origin must be
 *            refused before a handler runs, not merely denied the response;
 *  SHARE-10  (owner ruling) the public READ and the share REVOKE are both
 *            exempt from ENABLE_SERVER_STORAGE=false; the pair moves together.
 *
 * Rig notes carried from the probe:
 *  - `server.js` calls `app.listen()` at import and exports nothing, so a child
 *    process is the only way to reach it without modifying product code.
 *  - Readiness is polled on `/healthz` (never on a route under test).
 *  - `node:http` is used where a header browsers forbid (`Host`) must be set.
 *  - Native ESM: the `jest` global is not injected, so each test carries its
 *    own timeout — booting a child server is well over the 5 s default.
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../../server.js');

let nextPort = 3510;
const running = [];

async function startServer({ storagePath, storageEnabled = true, env = {} }) {
  const port = nextPort++;
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      NODE_OPTIONS: '', // --experimental-vm-modules confuses a plain node boot
      BACKEND_PORT: String(port),
      STORAGE_PATH: storagePath,
      ENABLE_SERVER_STORAGE: storageEnabled ? 'true' : 'false',
      AUTH_MODE: 'none',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  running.push(child);

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`server did not come up on ${port}:\n${logs.join('')}`);
    }
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.status === 200) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return { base, port, child, logs };
}

/** Raw request so headers browsers forbid (Host) can be set. */
function rawRequest(port, { method = 'GET', pathname = '/', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: pathname, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, text: data })
        );
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let dir;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoview-s2-wiring-'));
});
afterEach(async () => {
  for (const c of running.splice(0)) c.kill();
  await fs.rm(dir, { recursive: true, force: true });
});

const T = 60000;
const DIAGRAM = { title: 'T', items: [], views: [], icons: [], colors: [] };

// ---------------------------------------------------------------------------
// SHARE-08 — every failure answers the JSON contract
// ---------------------------------------------------------------------------
describe('a body-parser failure answers { error } JSON', () => {
  test('malformed JSON is a 400 the client can parse', async () => {
    const { base } = await startServer({ storagePath: dir });
    // Precondition: the same route answers JSON when the body parses.
    const ok = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DIAGRAM)
    });
    expect(ok.status).toBe(201);

    const bad = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title": '
    });
    const text = await bad.text();
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(text)).toEqual({ error: 'Malformed JSON body' });
  }, T);

  test('an over-limit body is a 413 with no stack trace in the response', async () => {
    const { base } = await startServer({ storagePath: dir });
    const huge = JSON.stringify({
      ...DIAGRAM,
      blob: 'x'.repeat(11 * 1024 * 1024)
    });
    const res = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: huge
    });
    const text = await res.text();
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(text)).toEqual({ error: 'Payload too large' });
    // ADR 0011: no stack-trace leak in the visible response.
    expect(text).not.toContain('at ');
  }, T);

  test('a handler-raised error is unchanged', async () => {
    const { base } = await startServer({ storagePath: dir });
    const res = await fetch(`${base}/api/diagrams/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Diagram not found' });
  }, T);
});

// ---------------------------------------------------------------------------
// SHARE-09 — a disallowed origin never reaches a handler
// ---------------------------------------------------------------------------
describe('cross-origin writes are refused, not merely unreadable', () => {
  test('a CORS-safelisted POST from an unknown origin publishes nothing', async () => {
    const { base } = await startServer({ storagePath: dir });
    const created = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DIAGRAM)
    });
    const { id } = await created.json();

    // `text/plain` is CORS-safelisted, so a browser sends it with NO preflight
    // — and the share route needs no body at all.
    const res = await fetch(`${base}/api/diagrams/${id}/share`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' }
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origin not allowed' });

    // The load-bearing assertion: nothing was published.
    const after = await fetch(`${base}/api/diagrams/${id}`).then((r) => r.json());
    expect(after.shareUuid).toBeUndefined();
  }, T);

  test('the allowlisted dev origin still works', async () => {
    const { base } = await startServer({ storagePath: dir });
    const created = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000'
      },
      body: JSON.stringify(DIAGRAM)
    });
    expect(created.status).toBe(201);
    const { id } = await created.json();

    const shared = await fetch(`${base}/api/diagrams/${id}/share`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' }
    });
    expect(shared.status).toBe(200);
  }, T);

  test('a request with no Origin header (same-origin, curl) is unaffected', async () => {
    const { base, port } = await startServer({ storagePath: dir });
    const res = await rawRequest(port, {
      method: 'POST',
      pathname: '/api/diagrams',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
      body: '{}'
    });
    expect(res.status).toBe(201);
    void base;
  }, T);
});

// ---------------------------------------------------------------------------
// SHARE-10 (owner ruling 2026-07-30) — read AND revoke survive the kill-switch
// ---------------------------------------------------------------------------
describe('with ENABLE_SERVER_STORAGE=false', () => {
  test('a published snapshot still reads, and can still be revoked', async () => {
    // Publish while storage is on…
    const first = await startServer({ storagePath: dir });
    const created = await fetch(`${first.base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DIAGRAM)
    });
    const { id } = await created.json();
    const shared = await fetch(`${first.base}/api/diagrams/${id}/share`, {
      method: 'POST'
    }).then((r) => r.json());
    first.child.kill();

    // …then flip the kill-switch and restart against the same storage.
    const { base } = await startServer({ storagePath: dir, storageEnabled: false });

    // The read is exempt — a published artifact surviving an API kill-switch is
    // normal (S3 / Pages / publish-to-web).
    const read = await fetch(`${base}/api/public/diagrams/${shared.uuid}`);
    expect(read.status).toBe(200);
    expect((await read.json()).sourceId).toBe(id);

    // An ordinary route is NOT.
    expect((await fetch(`${base}/api/diagrams`)).status).toBe(503);

    // Revocation must always remain reachable — the pair moves together.
    const revoke = await fetch(`${base}/api/diagrams/${id}/share`, {
      method: 'DELETE'
    });
    expect(revoke.status).toBe(200);
    expect((await fetch(`${base}/api/public/diagrams/${shared.uuid}`)).status).toBe(
      404
    );
  }, T);
});
