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
import path from 'path';
import { unregister } from '../../serviceWorkerRegistration';
import { migrateFossflowStorageKeys } from '../../utils/migrationShim';
import { apiBaseUrl } from '../../utils/apiBaseUrl';
import { shareUrlFromUuid } from '../../utils/shareUrl';
import { appDisplayBase, APP_BASENAME } from '../../appBase';

// RIG (2026-08-02): resolved from THIS FILE, not from the runner's cwd — the
// third instance of the same fault in the lane (A4/filetree, A5/i18n-download).
// Repo-root-relative paths worked when the lane ran from the root and throw
// ENOENT now that it runs per-package, PRESENTING as findings. Wave-6 appendix.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const read = (p: string) =>
  readFileSync(path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p), 'utf8');

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

// CHR-05, CHR-06 and CHR-07 are FIXED (wave 4, 2026-08-02) and their probes are
// retired. Promoted to `src/__tests__/serviceWorkerRegistration.test.ts`,
// `src/utils/__tests__/migrationShim.test.ts` and
// `src/utils/__tests__/apiBaseUrl.test.ts`.
//
// Two of the three `it.failing` probes could not flip, and both are worth
// knowing about rather than re-running:
//
//   - CHR-05's asserted that the `ready` CHAIN settles. The fix does not make
//     `ready` settle — it stops using `ready`, which is the API's documented
//     behaviour, not a bug to be worked around. A probe that names the
//     mechanism it expects cannot flip on the fix that avoids it. (Its OTHER
//     assertion earned its keep: it stubbed a `serviceWorker` with no
//     `getRegistrations` and caught that the first version of the fix would
//     have thrown synchronously out of the boot path.)
//   - CHR-07's runs under jest, where `NODE_ENV` is `'test'`. The fix keys off
//     a value rsbuild inlines at BUILD time, so no jest environment can
//     observe it. Verified instead where it matters: the production bundle no
//     longer contains the string `localhost:3001` at all — rsbuild
//     dead-code-eliminates the branch — and `apiBaseUrl.test.ts` drives
//     `NODE_ENV` explicitly.

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
