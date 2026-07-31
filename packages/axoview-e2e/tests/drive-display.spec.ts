/**
 * drive-display.spec.ts — ADR 0042 §2 + §8 (Drive-file read-only display route).
 *
 * Mirrors the readonly-share coverage in share.spec.ts (J13/J14) +
 * share-error.spec.ts for the `/app/display/drive/:driveFileId` route:
 *
 *   1. Public-proxy rung renders read-only — /api/config carries
 *      `drivePublicPreview:true`, our server proxy `GET /api/public/drive/:id`
 *      returns a diagram blob, and the lib renders in EXPLORABLE_READONLY
 *      (View-Only chip, no editor chrome — the J14 assertion set). Since the
 *      read-proxy (ADR 0042 §8 / ADR 0043 #3) the API key lives server-side, so
 *      rung 1 hits OUR origin, never googleapis, and carries no key/auth.
 *   2. Gate screen, not LocalModeShareError — with `drivePublicPreview:false`
 *      the proxy rung is skipped (ADR 0042 §5 graceful degradation) and a
 *      signed-out visitor lands on DriveDisplayGate's needs-signin state.
 *      The route must never trip the share-uuid-scoped
 *      LocalModeShareErrorDialog (ADR 0042 locked decision 7).
 *   3. resourceKey propagation — `?resourceKey=<rk>` on OUR preview URL rides
 *      the PROXY request as a `?resourceKey=` query param (ADR 0042 §8; the
 *      worker forwards it to Drive as the resource-key header server-side).
 *
 * Network mocks (page.route, same pattern as the sister specs):
 *   - GET /api/config              → `drivePublicPreview` per spec. Only the
 *     boolean gates rung 1 now (the raw key is never sent to the browser), so
 *     the old build-time-PUBLIC_GOOGLE_API_KEY backfill caveat no longer
 *     applies — the config mock alone is authoritative.
 *   - GET /api/public/drive/**     → 200 diagram blob or 404 (same-origin, no
 *     CORS dance).
 *   - GET https://www.googleapis.com/drive/v3/files/** → the token rung (rung
 *     2), only reached by a signed-in owner; mocked 404 as a safety net.
 *
 * Anchors consumed (stamped by the ADR 0042 core change):
 *   - drive-display-gate            (DriveDisplayGate overlay Box)
 *   - drive-display-gate-signin     (needs-signin Google button)
 *   - drive-display-gate-grant      (needs-grant Picker button)
 *   - dialog-local-mode-share-error (LocalModeShareErrorDialog — absence)
 */
import { test as baseTest, expect } from '@playwright/test';
import { DialogsPOM } from '../pom/DialogsPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { waitForDebugBridge } from '../helpers/store';

const DRIVE_FILE_ID = 'drive-file-e2e-1';
const DIAGRAM_TITLE = 'DriveSharedDiagram';
const RESOURCE_KEY = 'abc';

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

/** Minimal valid diagram blob — the share.spec.ts J14 fixture shape. */
function buildDriveBlob() {
  return {
    title: DIAGRAM_TITLE,
    name: DIAGRAM_TITLE,
    icons: [],
    colors: [],
    items: [],
    views: [
      {
        id: 'view_drive',
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

/**
 * Mocks /api/config. fetchRuntimeConfig merges the body over DEFAULT_CONFIG,
 * so omitted fields fall back (serverStorage:false ⇒ Local mode, same as
 * J13). googleClientId stays null so no GIS bootstrap fires under test.
 */
async function installConfigMock(
  page: import('@playwright/test').Page,
  overrides: Record<string, unknown> = {}
) {
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        serverStorage: false,
        authMode: 'none',
        googleClientId: null,
        drivePublicPreview: false,
        googleProjectNumber: null,
        ...overrides
      })
    });
  });
}

interface RequestLog {
  /** Full request URLs, in order. */
  urls: string[];
  /** Per request: whether an Authorization header rode it. */
  hadAuthorization: boolean[];
}

/**
 * Mocks OUR server read-proxy (`GET /api/public/drive/:id`) — rung 1 since the
 * read-proxy change. Records each request so specs can assert the shape after
 * the render settles (an expect() inside the handler would pass vacuously when
 * the route never fires).
 */
async function installDriveProxyMock(
  page: import('@playwright/test').Page,
  response: { status: number; body: unknown }
): Promise<RequestLog> {
  const log: RequestLog = { urls: [], hadAuthorization: [] };
  await page.route('**/api/public/drive/**', async (route) => {
    const req = route.request();
    log.urls.push(req.url());
    log.hadAuthorization.push('authorization' in req.headers());
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body)
    });
  });
  return log;
}

/** CORS headers for the cross-origin googleapis fulfill (rung 2, token read). */
const GOOGLEAPIS_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, x-goog-drive-resource-keys'
};

/** Mocks the Drive v3 media read (rung 2 / token read) as a safety net. */
async function installDriveFilesMock(
  page: import('@playwright/test').Page,
  response: { status: number; body: unknown }
): Promise<RequestLog> {
  const log: RequestLog = { urls: [], hadAuthorization: [] };
  await page.route('https://www.googleapis.com/drive/v3/files/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: GOOGLEAPIS_CORS_HEADERS });
      return;
    }
    log.urls.push(req.url());
    log.hadAuthorization.push('authorization' in req.headers());
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      headers: GOOGLEAPIS_CORS_HEADERS,
      body: JSON.stringify(response.body)
    });
  });
  return log;
}

baseTest.describe('Drive display route — ADR 0042 §2/§8 (/app/display/drive/:driveFileId)', () => {
  baseTest.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  baseTest('public-proxy rung renders the diagram read-only (canvas + View-Only chip, no editor chrome)', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    const log = await installDriveProxyMock(page, { status: 200, body: buildDriveBlob() });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}`);

    // The ladder's rung 1 resolves the mocked blob; the lifecycle loads it
    // into the lib in EXPLORABLE_READONLY — the same render contract J14
    // asserts on the public-snapshot route.
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 15_000 });
    await waitForDebugBridge(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as any).__axoview__?.model?.getState?.()?.title ?? null
          ),
        { timeout: 5_000 }
      )
      .toBe(DIAGRAM_TITLE);

    // Readonly toolbar: the View-Only chip replaces the editor button strip
    // (AppToolbar renders one or the other), so chip-present + share-absent
    // together pin "no editor chrome".
    await expect(page.locator('text=View-Only Mode')).toBeVisible({ timeout: 5_000 });
    await expect(byAxoviewId(page, 'toolbar-share')).toHaveCount(0);

    // Loaded state: the gate renders null, not an overlay.
    await expect(byAxoviewId(page, 'drive-display-gate')).toHaveCount(0);

    // The read went through OUR server proxy — no key in the browser, no auth.
    expect(log.urls.length).toBeGreaterThan(0);
    expect(log.urls[0]).toContain(`/api/public/drive/${DRIVE_FILE_ID}`);
    expect(log.urls[0]).not.toContain('key=');
    expect(log.hadAuthorization.every((had) => !had)).toBe(true);
  });

  baseTest('drivePublicPreview:false + unreadable file lands the sign-in gate, never LocalModeShareError', async ({ page }) => {
    // drivePublicPreview stays false ⇒ the proxy rung is skipped (ADR 0042 §5)
    // and, signed out, rung 2 short-circuits on the null token → needs-signin.
    // The boolean is the sole gate now, so the mock config is authoritative
    // (no build-time-key backfill can fire rung 1).
    await installConfigMock(page);
    await installDriveProxyMock(page, {
      status: 404,
      body: { error: 'not-public' }
    });
    const tokenLog = await installDriveFilesMock(page, {
      status: 404,
      body: { error: { code: 404, message: 'File not found', errors: [] } }
    });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}`);

    // Gate in needs-signin state: headline card + Google sign-in button,
    // and NOT the needs-grant Picker button.
    const gate = byAxoviewId(page, 'drive-display-gate');
    await gate.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(byAxoviewId(page, 'drive-display-gate-signin')).toBeVisible();
    await expect(byAxoviewId(page, 'drive-display-gate-grant')).toHaveCount(0);

    // Locked decision 7: the Drive route must not set isPublicShareUrl, so
    // the share-uuid dialog cannot misfire here (contrast J13, where it must).
    const dialogs = new DialogsPOM(page);
    await expect(dialogs.localModeShareError()).toHaveCount(0);

    // Signed out, the token rung can never fire — no authenticated read happened.
    expect(tokenLog.hadAuthorization.every((had) => !had)).toBe(true);
  });

  baseTest('a deleted (trashed) file → proxy 410 → "the owner trashed it", NOT the sign-in gate', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    // The proxy honors Drive's trashed flag and returns 410 Gone (ADR 0042 §8);
    // the client treats it as terminal, so no misleading "sign in to check".
    await installDriveProxyMock(page, { status: 410, body: { error: 'gone' } });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}`);

    // S3/DRV-02: this used to land on the generic "Could not open this diagram.
    // The diagram may have been deleted, or you may not have access to it." —
    // one sentence shared by four different upstream answers, two of which it
    // did not describe. A trashed file has its own gate copy now, and it says
    // the thing the viewer can act on: restoring it revives the link.
    await expect(byAxoviewId(page, 'drive-display-gate-gone')).toBeVisible({
      timeout: 10_000
    });
    await expect(byAxoviewId(page, 'drive-display-gate-signin')).toHaveCount(0);
    await expect(page.locator('text=Could not open this diagram.')).toHaveCount(0);
  });

  baseTest('an over-cap file → proxy 413 → "too large to preview", its own copy', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    // S3/DRV-02: 413 collapsed into the same terminal message as 410. It is a
    // different situation with a different remedy — the SENDER can share the
    // file directly — so it gets its own copy.
    await installDriveProxyMock(page, { status: 413, body: { error: 'too-large' } });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}`);

    await expect(byAxoviewId(page, 'drive-display-gate-too-large')).toBeVisible({
      timeout: 10_000
    });
    await expect(byAxoviewId(page, 'drive-display-gate-signin')).toHaveCount(0);
  });

  baseTest('a malformed link is named immediately, with no sign-in ladder', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    // S3/DRV-12: a truncated copy-paste used to walk the viewer through "sign in
    // with Google" and then "open with Google Drive access" for an id Drive
    // itself rejects. The client applies the same shape check the proxy does,
    // before making any request at all.
    await page.goto('/app/display/drive/short');

    await expect(byAxoviewId(page, 'drive-display-gate-bad-link')).toBeVisible({
      timeout: 10_000
    });
    await expect(byAxoviewId(page, 'drive-display-gate-signin')).toHaveCount(0);
    await expect(byAxoviewId(page, 'drive-display-gate-grant')).toHaveCount(0);
  });

  baseTest('a transient upstream failure → proxy 503 → Retry, NOT the sign-in gate (anonymous)', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    // The worker keeps 429/5xx distinguishable (503) so a public-file outage
    // offers Retry instead of demanding sign-in (which can't help).
    await installDriveProxyMock(page, { status: 503, body: { error: 'upstream-error' } });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}`);

    await expect(byAxoviewId(page, 'drive-display-gate-retry')).toBeVisible({ timeout: 10_000 });
    await expect(byAxoviewId(page, 'drive-display-gate-signin')).toHaveCount(0);
  });

  baseTest('?resourceKey=<rk> rides the proxy request as a query param', async ({ page }) => {
    await installConfigMock(page, { drivePublicPreview: true });
    const log = await installDriveProxyMock(page, { status: 200, body: buildDriveBlob() });

    await page.goto(`/app/display/drive/${DRIVE_FILE_ID}?resourceKey=${RESOURCE_KEY}`);

    // Render settling proves the mocked read served the ladder end-to-end.
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 15_000 });
    await waitForDebugBridge(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as any).__axoview__?.model?.getState?.()?.title ?? null
          ),
        { timeout: 5_000 }
      )
      .toBe(DIAGRAM_TITLE);

    // drivePublicRead forwards the resourceKey on the proxy URL; the worker
    // turns it into the Drive resource-key header server-side (ADR 0042 §8).
    expect(log.urls.length).toBeGreaterThan(0);
    expect(log.urls[0]).toContain(`resourceKey=${RESOURCE_KEY}`);
  });
});
