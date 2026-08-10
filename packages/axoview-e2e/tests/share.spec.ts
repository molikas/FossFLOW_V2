/**
 * share.spec.ts — Tier 1 J13 + J14.
 *
 * J13 (per docs/manual-test-baseline.md): Local-mode share-uuid
 * (/display/p/<uuid>) → B2 smoke → explicit error dialog, dismiss strips
 * URL. Validates ADR 0011 (LocalModeShareErrorDialog) + ADR 0009 D3
 * addendum (only /display/p/<uuid> requires server storage; bare
 * /display/<id> is local-eligible).
 *
 * J14 (Session share link): generate from a diagram → URL copied → open
 * in incognito → read-only view. Two-part contract:
 *
 *   1. Same context — share popover opens, URL matches
 *      `/display/p/<uuid>`, popover stays open on inside-click (B-3 fix
 *      verified by AppToolbar's reason-guarded onClose; commit 95a0fd5
 *      removed the document mousedown listener that triggered the original
 *      bug), Copy button writes to clipboard.
 *
 *   2. New (incognito) context — navigate to the generated URL, share
 *      lookup returns the seeded diagram blob, lib renders read-only.
 *
 * Local-dev fixture for J14 — `page.route()` mocks:
 *   - GET  /api/config                    → `{ serverStorage: true }`
 *     (AppStorageContext propagates this to StorageManager so
 *     `serverStorageAvailable === true` and the Share affordance unlocks.)
 *   - POST /api/diagrams/<id>/share       → fixed UUID
 *   - GET  /api/public/diagrams/<uuid>    → the seeded diagram blob
 *
 * Other storage endpoints (listDiagrams, loadDiagram, folders, manifest)
 * fall through to LocalStorageProvider's catch-and-fallback paths, which
 * read from sessionStorage — same data the J5 spec seeds. That means
 * `usingServer=true` flips the SHARE code path on without forcing us to
 * re-implement the entire backend.
 *
 * Lazy data-axoview-id retrofits this spec (no lib rebuild — all app-side):
 *   - APP toolbar-share                           (AppToolbar.tsx)
 *   - APP share-popover                           (AppToolbar.tsx Popover)
 *   - APP share-popover-close                     (AppToolbar.tsx)
 *   - APP share-url-input                         (AppToolbar.tsx TextField input)
 *   - APP share-copy-button                       (AppToolbar.tsx Copy Button)
 *   - APP dialog-local-mode-share-error          (LocalModeShareErrorDialog Dialog)
 *   - APP dialog-local-mode-share-error-dismiss  (LocalModeShareErrorDialog OK Button)
 */
import { test as baseTest, expect } from '@playwright/test';
import { AppToolbarPOM } from '../pom/AppToolbarPOM';
import { DialogsPOM } from '../pom/DialogsPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { waitForDebugBridge } from '../helpers/store';

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

async function pinOnboardingDismissed(page: import('@playwright/test').Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function clearDiagramStorage(page: import('@playwright/test').Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

// ── J13 — Local-mode share-uuid error ──────────────────────────────────────

baseTest.describe('Share — J13 (Local-mode share-uuid error)', () => {
  baseTest.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
    // No /api/config mock — fetchRuntimeConfig falls back to DEFAULT_CONFIG
    // (serverStorage: false), which is the Local-mode contract this test
    // validates.
  });

  baseTest('J13: navigating to /display/p/<fake-uuid> in Local mode shows the share-error dialog; dismissing strips the URL', async ({ page }) => {
    // Boot once to land the StorageManager in Local mode, then navigate
    // directly to a public-share URL. A fresh init from `/app` (R1: the editor
    // lives under /app, ADR 0040) exercises the same /api/config + lifecycle
    // boot a real user would have taken.
    await page.goto('/app');
    await clearDiagramStorage(page);
    await page.goto('/app/display/p/fake-uuid-J13');

    const dialogs = new DialogsPOM(page);
    await dialogs.localModeShareError().waitFor({ state: 'visible', timeout: 10_000 });
    // The locked copy from ADR 0011 — verify the user sees a real
    // explanation, not just an empty dialog frame.
    //
    // S2/SHARE-12 rewrote it for the reader who actually arrives here: the
    // RECIPIENT of someone else's link, who owns no deployment. The old text
    // ("this share link needs a session backend… deploy via Docker or
    // Cloudflare") was operator-facing, and its Cloudflare half was false — the
    // worker hardcodes `serverStorage: false` and has no snapshot handler at
    // all. Assert the explanation the recipient can act on, and that the false
    // advice is gone.
    await expect(dialogs.localModeShareError()).toContainText(
      'different Axoview site'
    );
    await expect(dialogs.localModeShareError()).not.toContainText('Cloudflare');

    await dialogs.dismissLocalModeShareError();

    // Post-dismiss: URL is back at the editor root /app (replace navigation, no
    // history entry for the stripped /display/p/<uuid>).
    await page.waitForURL(/\/app\/?$/, { timeout: 5_000 });
    await expect(dialogs.localModeShareError()).toHaveCount(0);
  });
});

// ── J14 — Session share link (mocked server) ───────────────────────────────

const SEED_DIAGRAM_ID = 'diagram_share';
const SEED_SHARE_UUID = 'shared-uuid-J14';

function buildSharedBlob() {
  return {
    title: 'SharedDiagram',
    name: 'SharedDiagram',
    icons: [],
    colors: [],
    items: [],
    views: [
      {
        id: 'view_shared',
        name: 'Main',
        items: [],
        connectors: [],
        rectangles: [],
        textBoxes: [],
        layers: []
      }
    ],
    fitToScreen: true
  };
}

async function seedSessionDiagram(page: import('@playwright/test').Page) {
  const blob = buildSharedBlob();
  const now = new Date().toISOString();
  await page.addInitScript(
    (args: { id: string; blob: any; now: string; flags: Array<[string, string]>; cleanKeys: string[] }) => {
      try {
        for (const k of args.cleanKeys) localStorage.removeItem(k);
        for (const [k, v] of args.flags) localStorage.setItem(k, v);
        sessionStorage.setItem(
          'axoview_diagrams',
          JSON.stringify([
            { id: args.id, name: 'SharedDiagram', lastModified: args.now, folderId: null }
          ])
        );
        sessionStorage.setItem(`axoview_diagram_${args.id}`, JSON.stringify(args.blob));
        localStorage.setItem('axoview-last-opened', args.id);
        localStorage.setItem('axoview-last-opened-data', JSON.stringify(args.blob));
        localStorage.setItem(
          'axoview-diagrams',
          JSON.stringify([
            { id: args.id, name: 'SharedDiagram', data: args.blob, createdAt: args.now, updatedAt: args.now }
          ])
        );
      } catch {
        /* storage may not be available pre-navigation */
      }
    },
    {
      id: SEED_DIAGRAM_ID,
      blob,
      now,
      flags: ONBOARDING_DISMISS_FLAGS,
      cleanKeys: LOCAL_STORAGE_KEYS
    }
  );
}

/**
 * Installs the minimum mock surface to make Session mode + share flows
 * work locally. Other storage endpoints (folders, manifest, listDiagrams)
 * fall through to LocalStorageProvider's catch-and-fallback paths.
 *
 * Note: This mocks ABSOLUTE /api/* requests since apiBaseUrl() returns ''
 * in dev (relative paths). page.route accepts a glob/regex against full
 * URL; '**\/api/...' matches both relative and absolute forms.
 */
async function installSessionMocks(context: import('@playwright/test').BrowserContext, blob: any) {
  await context.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ serverStorage: true, version: 'test', features: {} })
    });
  });
  await context.route(`**/api/diagrams/${SEED_DIAGRAM_ID}/share`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uuid: SEED_SHARE_UUID,
        url: `/display/p/${SEED_SHARE_UUID}`,
        sharedAt: new Date().toISOString()
      })
    });
  });
  await context.route(`**/api/public/diagrams/${SEED_SHARE_UUID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(blob)
    });
  });
}

baseTest.describe('Share — J14 (Session share link round-trip via mocked backend)', () => {
  baseTest('J14: share popover stays open on inside-click; Copy writes URL to clipboard; incognito context renders the readonly view', async ({ browser }) => {
    const blob = buildSharedBlob();

    // ── Context A — generates the share URL ────────────────────────────
    const ctxA = await browser.newContext({
      baseURL: 'http://localhost:3000',
      permissions: ['clipboard-read', 'clipboard-write']
    });
    await installSessionMocks(ctxA, blob);
    const pageA = await ctxA.newPage();
    await seedSessionDiagram(pageA);

    await pageA.goto('/app');
    await byLibTestId(pageA, 'axoview-canvas').waitFor({ state: 'visible', timeout: 15_000 });
    await waitForDebugBridge(pageA);

    const toolbar = new AppToolbarPOM(pageA);
    // serverStorageAvailable is derived from the mocked /api/config; the
    // Share button is disabled until that derivation lands. Wait for it
    // to become enabled.
    await expect(toolbar.shareButton()).toBeEnabled({ timeout: 5_000 });

    await toolbar.openShareDialog();
    // shareDiagram resolves the mocked POST, then handleShareClick writes
    // the URL into state.
    await expect
      .poll(() => toolbar.getShareUrl(), { timeout: 5_000 })
      .toMatch(new RegExp(`/display/p/${SEED_SHARE_UUID}$`));

    // B-3 fix: clicking the URL input does NOT close the popover (the
    // bug was a document-level mousedown listener that treated portaled
    // content as outside; commit 95a0fd5 removed it and added the
    // reason-guarded onClose).
    await toolbar.shareUrlInput().click();
    await pageA.waitForTimeout(150);
    await expect(toolbar.sharePopover()).toBeVisible();

    // Copy — handleShareClick writes to navigator.clipboard.
    await toolbar.copyShareUrl();
    await expect
      .poll(() => pageA.evaluate(() => navigator.clipboard.readText()), {
        timeout: 5_000
      })
      .toMatch(new RegExp(`/display/p/${SEED_SHARE_UUID}$`));

    const sharedUrl = await toolbar.getShareUrl();

    // ── Context B — incognito (fresh context, no auth, no seeded storage)
    const ctxB = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await installSessionMocks(ctxB, blob);
    const pageB = await ctxB.newPage();
    await pageB.goto(sharedUrl);
    // Public share path: DiagramLifecycleProvider fetches /api/public/diagrams/<uuid>
    // and loads the snapshot. The lib renders in EXPLORABLE_READONLY mode
    // — the AppToolbar shows "View-Only Mode".
    await byLibTestId(pageB, 'axoview-canvas').waitFor({ state: 'visible', timeout: 15_000 });
    await waitForDebugBridge(pageB);
    await expect
      .poll(
        () =>
          pageB.evaluate(
            () => (window as any).__axoview__?.model?.getState?.()?.title ?? null
          ),
        { timeout: 5_000 }
      )
      .toBe('SharedDiagram');
    // The readonly toolbar mounts the View-Only chip.
    await expect(pageB.locator('text=View-Only Mode')).toBeVisible({ timeout: 5_000 });

    // Belt-and-braces: dismiss notification stack to avoid leaks across runs.
    await ctxA.close();
    await ctxB.close();
    // Silence linter — byAxoviewId imported for parity with sister specs.
    void byAxoviewId;
  });
});
