/**
 * S2 / SHARE-08, SHARE-09, SHARE-10, SHARE-14 — the Express WIRING around
 * routes.js, which the coverage baseline names as untested ("middleware order,
 * JSON body limits, error handler").
 *
 * These four cannot be answered at the handler tier: they are about helmet/cors/
 * body-parser ordering, the `requireStorage` flags on the route table, and the
 * request-derived `publicBaseUrl`. So this probe boots the REAL `server.js` as a
 * child process against a temp STORAGE_PATH and speaks HTTP to it — the T2 tier
 * for this package.
 *
 * Rig notes:
 *  - `server.js` calls `app.listen()` at import and exports nothing, so a child
 *    process is the only way to reach it without modifying product code.
 *  - Readiness is polled on `/healthz` (never on a route under test).
 *  - `node:http` is used where a header browsers forbid (`Host`) must be set;
 *    `fetch` elsewhere.
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../../../server.js');

let nextPort = 3410;
const running = [];

async function startServer({ storagePath, storageEnabled = true, env = {} }) {
  const port = nextPort++;
  const child = spawn(
    process.execPath,
    [SERVER],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: '', // the --experimental-vm-modules flag confuses a plain node boot
        BACKEND_PORT: String(port),
        STORAGE_PATH: storagePath,
        ENABLE_SERVER_STORAGE: storageEnabled ? 'true' : 'false',
        AUTH_MODE: 'none',
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
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
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoview-explore-s2-http-'));
});
afterEach(async () => {
  for (const c of running.splice(0)) c.kill();
  await fs.rm(dir, { recursive: true, force: true });
});

// Native ESM: the `jest` global is not injected, so each test carries its own
// timeout (booting a child server + polling /healthz is well over the 5s default).
const T = 60000;

const DIAGRAM = { title: 'T', items: [], views: [], icons: [], colors: [] };

describe('SHARE-08 — a body-parser failure returns HTML, not the { error } JSON contract', () => {
  test('CHARACTERIZATION: malformed JSON yields an HTML error page every client path will fail to parse', async () => {
    const { base } = await startServer({ storagePath: dir });
    // --- precondition: the same route answers JSON when the body parses ---
    const ok = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DIAGRAM)
    });
    expect(ok.status).toBe(201);
    expect(ok.headers.get('content-type')).toContain('application/json');

    const bad = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title": '
    });
    const text = await bad.text();
    expect(bad.status).toBe(400);
    // HTML, not JSON — `response.json()` throws in every provider method.
    expect(bad.headers.get('content-type')).toContain('text/html');
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toContain('SyntaxError');
  }, T);

  test('CHARACTERIZATION: a body over the 10 MB limit does the same (and leaks the stack into the response)', async () => {
    const { base } = await startServer({ storagePath: dir });
    const huge = JSON.stringify({ ...DIAGRAM, blob: 'x'.repeat(11 * 1024 * 1024) });
    const res = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: huge
    });
    const text = await res.text();
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(() => JSON.parse(text)).toThrow();
    // ADR 0011's "no stack-trace leak in visible response copy" — the worker's
    // onError is careful about this; Express's default handler is not.
    expect(text).toMatch(/entity too large/i);
    expect(text).toContain('at ');
  }, T);

  test('CONTROL: a handler-raised error IS the documented JSON shape', async () => {
    const { base } = await startServer({ storagePath: dir });
    const res = await fetch(`${base}/api/diagrams/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Diagram not found' });
  }, T);
});

describe('SHARE-09 — CORS withholds the response, it does not block the request', () => {
  test('CHARACTERIZATION: a CORS-safelisted cross-origin POST publishes a snapshot with no preflight', async () => {
    const { base } = await startServer({ storagePath: dir });
    const created = await (
      await fetch(`${base}/api/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DIAGRAM)
      })
    ).json();
    // --- precondition: not shared yet ---
    const before = await (await fetch(`${base}/api/diagrams/${created.id}`)).json();
    expect(before.shareUuid).toBeUndefined();

    // Exactly what a page on https://evil.example can issue with fetch()/form
    // and NO preflight: text/plain is a CORS-safelisted content type.
    const attack = await fetch(`${base}/api/diagrams/${created.id}/share`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: 'x'
    });

    // The browser hides the response (no ACAO)...
    expect(attack.headers.get('access-control-allow-origin')).toBeNull();
    // ...but the write happened.
    expect(attack.status).toBe(200);
    const after = await (await fetch(`${base}/api/diagrams/${created.id}`)).json();
    expect(after.shareUuid).toMatch(/^[A-Za-z0-9_-]{21}$/);
    const snapshot = await fetch(`${base}/api/public/diagrams/${after.shareUuid}`);
    expect(snapshot.status).toBe(200);
  }, T);

  test('CHARACTERIZATION: the same shape also creates documents (unparsed body → an empty diagram)', async () => {
    const { base } = await startServer({ storagePath: dir });
    const listBefore = await (await fetch(`${base}/api/diagrams`)).json();
    expect(listBefore).toHaveLength(0); // precondition

    const res = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: 'ignored'
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await (await fetch(`${base}/api/diagrams`)).json()).toHaveLength(1);
  }, T);

  test('CONTROL: a non-safelisted method IS stopped — its preflight gets no ACAO', async () => {
    // This is why the finding is scoped to GET/POST-safelisted: DELETE/PUT/PATCH
    // require a preflight, and the allowlist genuinely refuses it.
    const { base, port } = await startServer({ storagePath: dir });
    const created = await (
      await fetch(`${base}/api/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DIAGRAM)
      })
    ).json();

    const preflight = await rawRequest(port, {
      method: 'OPTIONS',
      pathname: `/api/diagrams/${created.id}`,
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'DELETE'
      }
    });
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();

    // ...and the dev origin's preflight IS allowed, so the allowlist works.
    const allowed = await rawRequest(port, {
      method: 'OPTIONS',
      pathname: `/api/diagrams/${created.id}`,
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'DELETE'
      }
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  }, T);
});

describe('SHARE-10 — the storage kill switch does not revoke published snapshots', () => {
  test('CHARACTERIZATION: with ENABLE_SERVER_STORAGE=false every route 503s except the public snapshot read', async () => {
    // 1. Publish with storage on.
    const on = await startServer({ storagePath: dir, storageEnabled: true });
    const created = await (
      await fetch(`${on.base}/api/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DIAGRAM, title: 'Internal roadmap' })
      })
    ).json();
    const shared = await (
      await fetch(`${on.base}/api/diagrams/${created.id}/share`, { method: 'POST' })
    ).json();
    // --- precondition: a real live snapshot ---
    expect((await fetch(`${on.base}/api/public/diagrams/${shared.uuid}`)).status).toBe(200);
    on.child.kill();

    // 2. Operator flips the kill switch (same STORAGE_PATH, storage disabled).
    const off = await startServer({ storagePath: dir, storageEnabled: false });
    expect((await fetch(`${off.base}/api/diagrams`)).status).toBe(503);
    expect((await fetch(`${off.base}/api/diagrams/${created.id}`)).status).toBe(503);
    expect(
      (await fetch(`${off.base}/api/diagrams/${created.id}/share`, { method: 'POST' })).status
    ).toBe(503);
    expect((await fetch(`${off.base}/api/folders`)).status).toBe(503);

    // The published link is still served, from disk, in full.
    const stillLive = await fetch(`${off.base}/api/public/diagrams/${shared.uuid}`);
    expect(stillLive.status).toBe(200);
    expect((await stillLive.json()).title).toBe('Internal roadmap');
    // And there is now no route through which the operator can unshare it.
    expect(
      (await fetch(`${off.base}/api/diagrams/${created.id}/share`, { method: 'DELETE' })).status
    ).toBe(503);
  }, T);
});

describe('SHARE-14 — the advertised share url is derived from client-controlled headers', () => {
  test('CHARACTERIZATION: Host and X-Forwarded-Proto flow straight into the response url', async () => {
    const { base, port } = await startServer({ storagePath: dir });
    const created = await (
      await fetch(`${base}/api/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DIAGRAM)
      })
    ).json();

    const res = await rawRequest(port, {
      method: 'POST',
      pathname: `/api/diagrams/${created.id}/share`,
      headers: {
        Host: 'evil.example',
        'X-Forwarded-Proto': 'https',
        'Content-Length': '0'
      }
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    // --- precondition: a real share happened ---
    expect(body.uuid).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(body.url).toBe(`https://evil.example/display/p/${body.uuid}`);
  }, T);

  test('CONTROL: PUBLIC_BASE_URL pins it, so the mitigation exists and works', async () => {
    const { port, base } = await startServer({
      storagePath: dir,
      env: { PUBLIC_BASE_URL: 'https://axoview.example/' }
    });
    const created = await (
      await fetch(`${base}/api/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DIAGRAM)
      })
    ).json();
    const res = await rawRequest(port, {
      method: 'POST',
      pathname: `/api/diagrams/${created.id}/share`,
      headers: { Host: 'evil.example', 'Content-Length': '0' }
    });
    const body = JSON.parse(res.text);
    expect(body.url).toBe(`https://axoview.example/display/p/${body.uuid}`);
  }, T);

  test('REACHABILITY: no product code reads the response `url` — the client re-anchors to the page origin', async () => {
    // A pure-arithmetic finding needs a consumer (COLDSTART: "a pure-math sweep
    // can be right and still be inert"). Grep the app for a reader of `.url`
    // from the share result; `shareUrlFromUuid` is the only path in use.
    const appSrc = path.resolve(HERE, '../../../../axoview-app/src');
    const files = [];
    const walk = async (d) => {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !p.includes('__tests__')) files.push(p);
      }
    };
    await walk(appSrc);
    const consumers = [];
    for (const f of files) {
      const src = await fs.readFile(f, 'utf-8');
      // A call to shareDiagram whose `.url` is then read.
      if (/shareDiagram\(/.test(src) && /\.url\b/.test(src)) consumers.push(f);
    }
    expect(consumers).toEqual([]);
    // ...and the re-anchoring helper is what the toolbar actually calls.
    const toolbar = await fs.readFile(path.join(appSrc, 'components/AppToolbar.tsx'), 'utf-8');
    expect(toolbar).toContain('shareUrlFromUuid');
  }, T);
});
