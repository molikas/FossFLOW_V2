/**
 * A5 — boot-path utilities nothing tests.
 *
 * CHR-05 (`unregister()` awaits a promise that never resolves when there is no
 * service worker), CHR-06 (a partial storage migration is recorded as
 * complete), CHR-07 (`apiBaseUrl()` sniffs the environment by port and gets
 * the Docker deployment wrong), CHR-08 (share links bake in the origin they
 * were created under).
 */
import { readFileSync } from 'fs';
import { unregister } from '../../serviceWorkerRegistration';
import { migrateFossflowStorageKeys } from '../../utils/migrationShim';
import { apiBaseUrl } from '../../utils/apiBaseUrl';
import { shareUrlFromUuid } from '../../utils/shareUrl';
import { appDisplayBase, APP_BASENAME } from '../../appBase';

const read = (p: string) => readFileSync(p, 'utf8');

/** Point window.location at a URL without navigating (jsdom has no nav). */
function atOrigin(url: string) {
  const u = new URL(url);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: u.href,
      origin: u.origin,
      hostname: u.hostname,
      port: u.port,
      protocol: u.protocol,
      reload: () => {}
    }
  });
}

/** Timer-free "did this promise settle?" oracle (the S1 harness pattern). */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return done;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// CHR-05 — unregister() awaits navigator.serviceWorker.ready.
// ---------------------------------------------------------------------------
describe('CHR-05 — the boot service-worker cleanup never completes when there is no worker', () => {
  const withServiceWorker = (ready: Promise<unknown>) => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready }
    });
  };

  it('characterization: with a registration it unregisters; with none it hangs forever', async () => {
    // PRECONDITION: the happy path really does reach `registration.unregister()`.
    const calls: string[] = [];
    withServiceWorker(Promise.resolve({ unregister: () => { calls.push('unregister'); } }));
    unregister();
    expect(await settled(Promise.resolve())).toBe(true);
    await Promise.resolve();
    expect(calls).toEqual(['unregister']);

    // The real case: the app ships no service worker, so unless a stale one
    // from a prior install is active, `navigator.serviceWorker.ready` never
    // resolves — by spec it waits for an active registration. The chain
    // `index.tsx` starts on every boot simply never finishes.
    const never = new Promise<unknown>(() => {});
    withServiceWorker(never);
    let tail = false;
    const chain = (navigator.serviceWorker.ready as Promise<unknown>).then(() => { tail = true; });
    unregister();
    expect(await settled(chain)).toBe(false);
    expect(tail).toBe(false);
  });

  it('the .catch assumes an Error, so a non-Error rejection throws inside the handler', async () => {
    const errors: unknown[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((e) => { errors.push(e); });
    withServiceWorker(Promise.reject('boom')); // a string, as some browsers reject with
    const before = process.listenerCount('unhandledRejection');
    unregister();
    await new Promise((r) => setTimeout(r, 0));
    // `error.message` on a string is `undefined` — the handler logs nothing
    // useful, and a null/undefined rejection would throw inside the catch.
    expect(errors).toEqual([undefined]);
    expect(process.listenerCount('unhandledRejection')).toBe(before);
    spy.mockRestore();
  });

  it.failing('CHR-05: the boot cleanup settles on a machine with no service worker', async () => {
    const never = new Promise<unknown>(() => {});
    withServiceWorker(never);
    const chain = (navigator.serviceWorker.ready as Promise<unknown>).then(() => {});
    unregister();
    expect(typeof unregister).toBe('function'); // precondition
    // Expected: use `getRegistrations()` (which resolves to `[]` when there is
    // none) so the cleanup terminates and anything sequenced after it can run.
    // Actual: `ready` is a promise that resolves only for an ACTIVE worker.
    expect(await settled(chain)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CHR-06 — a partial migration is recorded as complete.
// ---------------------------------------------------------------------------
describe('CHR-06 — a failed key migration is sealed by the "done" sentinel', () => {
  const seedLegacy = () => {
    localStorage.setItem('fossflow-folders', JSON.stringify([{ id: 'f1' }]));
    localStorage.setItem('fossflow-tree-manifest', '{}');
    sessionStorage.setItem('fossflow_diagrams', JSON.stringify([{ id: 'd1' }]));
  };

  it('characterization: the sentinel is written even though the migration threw', () => {
    seedLegacy();
    // Quota is reached partway through the localStorage pass — the shape of a
    // migration on a nearly-full profile, which is exactly the profile with the
    // most legacy keys to move.
    const realSet = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      // Let the sentinel through; fail the second migrated key.
      if (k.startsWith('axoview') && !k.includes('migration') && ++writes === 2) {
        const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
        throw err;
      }
      return realSet.call(this, k, v);
    };
    let result;
    try {
      result = migrateFossflowStorageKeys();
    } finally {
      Storage.prototype.setItem = realSet;
    }

    // PRECONDITION: the run really did report success, and really was partial.
    expect(result!.ran).toBe(true);
    expect(localStorage.getItem('axoview_migration_v1')).toBe('done');
    const stillLegacy = Object.keys(localStorage).filter((k) => k.startsWith('fossflow'));
    expect(stillLegacy.length).toBeGreaterThan(0);

    // Second boot: the sentinel short-circuits, so the keys left behind are
    // never looked at again. The data is present in the profile and invisible
    // to every reader, forever.
    const second = migrateFossflowStorageKeys();
    expect(second.ran).toBe(false);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('fossflow'))).toEqual(stillLegacy);
  });

  it.failing('CHR-06: a migration that could not finish is retried on the next boot', () => {
    seedLegacy();
    const realSet = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith('axoview') && !k.includes('migration') && ++writes === 2) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      return realSet.call(this, k, v);
    };
    try {
      migrateFossflowStorageKeys();
    } finally {
      Storage.prototype.setItem = realSet;
    }
    expect(localStorage.getItem('axoview_migration_v1')).toBe('done'); // precondition
    // Expected: the sentinel means "migration finished"; a throw inside
    // `migrateStorage` means it did not, so the sentinel must not be written
    // (the comment on the sentinel's own catch already reasons this way:
    // "can't set sentinel; migration will retry next boot").
    expect(migrateFossflowStorageKeys().ran).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CHR-07 — apiBaseUrl() sniffs the environment by port.
// ---------------------------------------------------------------------------
describe('CHR-07 — the API base is chosen by port, which the Docker deployment shares', () => {
  it('characterization: any localhost:3000 page targets :3001, including the container', () => {
    atOrigin('http://localhost:3000/app');
    // PRECONDITION: this is the intended `npm run dev` behaviour.
    expect(apiBaseUrl()).toBe('http://localhost:3001');
    atOrigin('https://axoview.example.com/app');
    expect(apiBaseUrl()).toBe('');

    // …but `compose.dev.yml` (what `npm run docker:run` starts) publishes nginx
    // on the SAME host port, so the container is served from localhost:3000 too.
    const compose = read('compose.dev.yml');
    expect(compose).toContain('"3000:80"');

    // In that deployment `/api/` is same-origin behind the nginx proxy…
    const nginx = read('nginx.conf');
    expect(nginx).toContain('location /api/');
    expect(nginx).toContain('proxy_pass http://localhost:3001;');
    // …and the document nginx serves carries a CSP whose `connect-src` is
    // `'self'` only. A different port is a different origin, so every API call
    // the app makes in the container is both proxy-bypassing AND CSP-blocked.
    expect(nginx).toMatch(/connect-src 'self'/);
    expect(nginx).not.toMatch(/connect-src[^;]*localhost:3001/);
  });

  it.failing('CHR-07: the API base is derived from something the deployments do not share', () => {
    atOrigin('http://localhost:3000/app');
    const nginx = read('nginx.conf');
    expect(nginx).toContain('location /api/'); // precondition
    // Expected: same-origin `/api` unless a dev-only signal says otherwise (a
    // build-time env var, `process.env.NODE_ENV`, an injected runtime config —
    // `useRuntimeConfig` already fetches one). Actual: hostname+port, and
    // `docker compose -f compose.dev.yml up` serves on exactly that pair.
    expect(apiBaseUrl()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// CHR-08 — share links bake in the creating origin.
// ---------------------------------------------------------------------------
describe('CHR-08 — a share link records the origin it was created under', () => {
  it('characterization: the link follows window.location.origin at call time', () => {
    atOrigin('http://localhost:3000/app/diagram/1');
    expect(shareUrlFromUuid('u1')).toBe(`http://localhost:3000${APP_BASENAME}/display/p/u1`);

    // The same diagram, shared from a page loaded through a preview host, a
    // staging domain or an embedding iframe's origin — the copied link points
    // at that host, which recipients may not be able to reach at all.
    atOrigin('https://pr-42--preview.example.dev/app/diagram/1');
    expect(shareUrlFromUuid('u1')).toBe(
      `https://pr-42--preview.example.dev${APP_BASENAME}/display/p/u1`
    );
    // PRECONDITION: nothing else in the pipeline pins a canonical origin —
    // `appDisplayBase()` is the single builder both share paths use.
    expect(appDisplayBase()).toContain('https://pr-42--preview.example.dev');
    const drive = read('packages/axoview-app/src/services/drive/driveSharing.ts');
    expect(drive).toContain('appDisplayBase');
  });

  it.failing('CHR-08: a share link is anchored to a canonical origin', () => {
    atOrigin('https://pr-42--preview.example.dev/app/diagram/1');
    expect(shareUrlFromUuid('u1')).toContain('/display/p/u1'); // precondition
    // Expected: a configured public base (the runtime config already carries
    // deployment facts) with the page origin as the fallback. Actual: whatever
    // origin the tab happens to be on — the doc comment argues for exactly this
    // against a backend-derived host, and the preview/iframe case was not
    // considered.
    expect(shareUrlFromUuid('u1')).not.toContain('pr-42--preview');
  });
});
