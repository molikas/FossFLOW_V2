/**
 * Exploratory-campaign fixture (docs/reviews/exploratory-2026-07/APPROACH.md §4 — oracle
 * catalogue). Wraps the existing `canvasReadyTest` / `appTest` app fixtures
 * with the three always-on oracles every probe gets for free:
 *
 *   1. Crash/console oracle — `page.on('pageerror')` plus `console.error`
 *      capture. Any uncaught error or error-level log during a probe is a
 *      finding regardless of what the probe was hunting. Asserted in fixture
 *      teardown so a probe cannot forget to check.
 *   2. `expectStoreInvariants(page)` — cross-store consistency, read through
 *      the `window.__axoview__` bridge (ui / model / scene store APIs).
 *   3. `expectSchemaClean(page)` — the model as the app would export it must
 *      `modelSchema.safeParse` clean. Catches operations that write states the
 *      loader (useInitialDataManager) would later reject.
 *
 * This file lives in `fixtures/` next to `app.fixture.ts` (Playwright's
 * `testDir` only scopes *specs*), but it is imported exclusively by
 * `tests-exploratory/**` and by nothing in the default suite.
 */
import { Page, TestInfo, expect } from '@playwright/test';
import { canvasReadyTest, appTest, AppPage } from './app.fixture';
// Node-side zod validation against the real schema — same object the loader
// validates with, so "would the loader reject this?" is answered exactly.
import { modelSchema } from '../../axoview-lib/src/schemas/model';

export { expect } from '@playwright/test';
export type { AppPage } from './app.fixture';

// ---------------------------------------------------------------------------
// 1. Crash / console oracle
// ---------------------------------------------------------------------------

/**
 * Console/pageerror messages that are known, benign and NOT findings.
 * Keep this list short and justified — every entry is a blind spot.
 */
const CONSOLE_ALLOW: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /window\.__fossflow__ is deprecated/,
    why: 'Intentional one-shot deprecation warning for the pre-rename bridge alias (Axoview.tsx).'
  },
  {
    pattern: /Download the React DevTools/,
    why: 'React dev-build advertisement, not app output.'
  },
  {
    pattern: /\[HMR\]|\[rsbuild\]|webpack-dev-server|hot-update/i,
    why: 'Dev-server hot-reload plumbing; absent from any real build.'
  },
  {
    pattern: /Failed to load resource.*favicon/i,
    why: 'Dev server has no favicon route.'
  }
];

const isAllowed = (text: string) =>
  CONSOLE_ALLOW.some((entry) => entry.pattern.test(text));

export type ConsoleOracle = {
  /** Everything captured so far that is not allow-listed. */
  errors: () => string[];
  /**
   * Suppress additional messages for one probe — use ONLY when the probe
   * deliberately provokes an error the app is right to log (e.g. feeding the
   * loader an invalid diagram), and say why.
   */
  allow: (pattern: RegExp, why: string) => void;
  /** Drop everything captured so far (e.g. boot noise before the real steps). */
  reset: () => void;
};

function attachConsoleOracle(page: Page): ConsoleOracle {
  const captured: string[] = [];
  const perTest: Array<{ pattern: RegExp; why: string }> = [];

  page.on('pageerror', (err) => {
    captured.push(`[pageerror] ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    // React key/act warnings arrive as console.error; other warnings are noise.
    if (msg.type() === 'warning' && !/^Warning:/.test(text)) return;
    captured.push(`[console.${msg.type()}] ${text}`);
  });

  return {
    errors: () =>
      captured.filter(
        (t) => !isAllowed(t) && !perTest.some((e) => e.pattern.test(t))
      ),
    allow: (pattern, why) => perTest.push({ pattern, why }),
    reset: () => {
      captured.length = 0;
    }
  };
}

// ---------------------------------------------------------------------------
// 2. Cross-store consistency oracle
// ---------------------------------------------------------------------------

/**
 * Snapshot of everything the invariant checks need, read in ONE bridge round
 * trip so the stores cannot move underneath the assertions.
 */
type StoreSnapshot = {
  bridgeMissing?: true;
  activeViewId: string | null;
  viewIds: string[];
  activeViewFound: boolean;
  modelItemIds: string[];
  view: {
    itemIds: string[];
    connectorIds: string[];
    textBoxIds: string[];
    rectangleIds: string[];
    labelIds: string[];
    layerIds: string[];
    /** layer id -> its visibility / lock flags */
    layerFlags: Array<{ id: string; visible: boolean; locked: boolean }>;
    /** view item id -> layerId, only for items that declare one */
    itemLayerRefs: Array<{ itemId: string; layerId: string }>;
    /** entity id -> layerId across every selectable collection */
    entityLayerRefs: Array<{ id: string; layerId: string }>;
    /** connector id -> anchor item refs */
    anchorItemRefs: Array<{ connectorId: string; itemId: string }>;
  };
  sceneConnectorIds: string[];
  sceneTextBoxIds: string[];
  selectedIds: Array<{ type: string; id: string }>;
  itemControls: { type?: string; id?: string } | null;
};

const readStoreSnapshot = (page: Page): Promise<StoreSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    if (!bridge?.model?.getState) return { bridgeMissing: true } as any;

    const ui = bridge.ui.getState();
    const model = bridge.model.getState();
    const scene = bridge.scene.getState();

    const views: any[] = Array.isArray(model.views) ? model.views : [];
    const activeViewId = ui.view ?? null;
    const view = views.find((v: any) => v.id === activeViewId) ?? null;
    const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
    const ids = (x: any): string[] => arr(x).map((e: any) => e?.id);

    const anchorItemRefs: Array<{ connectorId: string; itemId: string }> = [];
    for (const c of arr(view?.connectors)) {
      for (const a of arr(c?.anchors)) {
        if (a?.ref?.item) {
          anchorItemRefs.push({ connectorId: c.id, itemId: a.ref.item });
        }
      }
    }

    const itemLayerRefs: Array<{ itemId: string; layerId: string }> = [];
    for (const vi of arr(view?.items)) {
      if (vi?.layerId) itemLayerRefs.push({ itemId: vi.id, layerId: vi.layerId });
    }

    // Layer assignment across every selectable collection (INV-11).
    const entityLayerRefs: Array<{ id: string; layerId: string }> = [];
    for (const coll of [
      view?.items,
      view?.connectors,
      view?.textBoxes,
      view?.rectangles,
      view?.labels
    ]) {
      for (const e of arr(coll)) {
        if (e?.layerId) entityLayerRefs.push({ id: e.id, layerId: e.layerId });
      }
    }

    return {
      activeViewId,
      viewIds: views.map((v: any) => v.id),
      activeViewFound: Boolean(view),
      modelItemIds: ids(model.items),
      view: {
        itemIds: ids(view?.items),
        connectorIds: ids(view?.connectors),
        textBoxIds: ids(view?.textBoxes),
        rectangleIds: ids(view?.rectangles),
        labelIds: ids(view?.labels),
        layerIds: ids(view?.layers),
        layerFlags: arr(view?.layers).map((l: any) => ({
          id: l?.id,
          // A layer with no explicit flag is visible + unlocked.
          visible: l?.visible !== false,
          locked: l?.locked === true
        })),
        itemLayerRefs,
        entityLayerRefs,
        anchorItemRefs
      },
      sceneConnectorIds: Object.keys(scene.connectors ?? {}),
      sceneTextBoxIds: Object.keys(scene.textBoxes ?? {}),
      selectedIds: arr(ui.selectedIds).map((s: any) => ({
        type: s?.type,
        id: s?.id
      })),
      itemControls: ui.itemControls
        ? { type: ui.itemControls.type, id: ui.itemControls.id }
        : null
    };
  });

const dupes = (list: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (seen.has(x)) out.push(x);
    seen.add(x);
  }
  return out;
};

/**
 * Cross-store invariants (APPROACH §4.2). GROW THIS LIST: every confirmed
 * cross-store bug in the campaign adds its invariant here, so later areas
 * inherit the check for free.
 *
 * Invariant numbering is stable — probes and known_issues entries cite it.
 *
 *  INV-1  the active view id resolves to a view in the model
 *         — proved live by E1/HIST-04 (an undone page create strands ui.view)
 *  INV-2  every selectedIds entry resolves to a live object of its type
 *         — proved live by E1/HIST-13 (Delete leaves the dead id selected)
 *  INV-3  no orphan scene connector paths (scene ⊆ active view connectors)
 *         — proved live by E1/HIST-02 (stale scene redo) and E1/HIST-09 (D-9)
 *  INV-4  no unrendered connectors (active view connectors ⊆ scene) — a
 *         connector with no scene path is invisible on canvas (sceneStore.tsx
 *         documents this exact regression on the scene-redo path)
 *  INV-5  scene textBoxes ↔ active view textBoxes, both directions
 *         — proved live by E1/HIST-01 and E1/HIST-03 (text box loses its scene
 *           size when the two history stacks fall out of step; unlike
 *           connectors, resyncScene never repairs it)
 *  INV-6  every view item references an existing model item
 *  INV-7  every connector anchor item-ref resolves to a view item
 *  INV-8  no duplicate ids inside any one collection
 *  INV-9  every view item layerId resolves to a layer on the view
 *  INV-10 itemControls' target, when it names an item, resolves
 *  INV-11 no selectedIds entry sits on a hidden or locked layer — a selection
 *         must never outlive the interactability of what it points at (ADR 0006
 *         §3). Proved live by E2/RED-15 (lock/hide leaves the entity selected)
 *         and by I1/PTR-11, where the stale selection lets the arrow keys walk
 *         a locked layer across the canvas.
 *  INV-12 every connector on the ACTIVE view has a scene entry. Established by
 *         R4/RND-12: the Renderer's connector hybrid only promotes a connector
 *         to the DOM when it is `unroutable` or degenerate, and ConnectorsCanvas
 *         skips one whose path is missing — so a connector with NO scene entry
 *         renders nowhere at all while staying hit-testable. `syncConnector`
 *         always writes either a path or an unroutable stub, so a gap here means
 *         a sync was skipped (the D-9 / SCN-15 cross-view class).
 */
export async function expectStoreInvariants(page: Page, label = '') {
  const s = await readStoreSnapshot(page);
  const at = label ? ` (${label})` : '';
  expect(s.bridgeMissing, `debug bridge missing${at}`).toBeFalsy();

  const missing = (needles: string[], haystack: string[]) =>
    needles.filter((n) => !haystack.includes(n));

  // INV-1
  if (s.activeViewId !== null) {
    expect(s.activeViewFound, `INV-1 active view ${s.activeViewId} not in model${at}`).toBe(true);
  }

  const poolFor: Record<string, string[]> = {
    ITEM: s.view.itemIds,
    CONNECTOR: s.view.connectorIds,
    TEXTBOX: s.view.textBoxIds,
    RECTANGLE: s.view.rectangleIds,
    LABEL: s.view.labelIds
  };

  // INV-2
  const danglingSelection = s.selectedIds.filter(
    (sel) => poolFor[sel.type] && !poolFor[sel.type].includes(sel.id)
  );
  expect(danglingSelection, `INV-2 selectedIds point at deleted objects${at}`).toEqual([]);

  // INV-3
  expect(
    missing(s.sceneConnectorIds, s.view.connectorIds),
    `INV-3 orphan scene connector paths${at}`
  ).toEqual([]);

  // INV-4
  expect(
    missing(s.view.connectorIds, s.sceneConnectorIds),
    `INV-4 model connectors with no scene path (invisible on canvas)${at}`
  ).toEqual([]);

  // INV-5
  expect(
    missing(s.sceneTextBoxIds, s.view.textBoxIds),
    `INV-5a orphan scene textBoxes${at}`
  ).toEqual([]);
  expect(
    missing(s.view.textBoxIds, s.sceneTextBoxIds),
    `INV-5b model textBoxes with no scene size${at}`
  ).toEqual([]);

  // INV-6
  expect(
    missing(s.view.itemIds, s.modelItemIds),
    `INV-6 view items with no backing model item${at}`
  ).toEqual([]);

  // INV-7
  expect(
    s.view.anchorItemRefs.filter((r) => !s.view.itemIds.includes(r.itemId)),
    `INV-7 connector anchors bound to missing view items${at}`
  ).toEqual([]);

  // INV-8
  for (const [name, list] of Object.entries({
    'model.items': s.modelItemIds,
    'view.items': s.view.itemIds,
    'view.connectors': s.view.connectorIds,
    'view.textBoxes': s.view.textBoxIds,
    'view.rectangles': s.view.rectangleIds,
    'view.labels': s.view.labelIds,
    'view.layers': s.view.layerIds,
    'model.views': s.viewIds
  })) {
    expect(dupes(list), `INV-8 duplicate ids in ${name}${at}`).toEqual([]);
  }

  // INV-9
  expect(
    s.view.itemLayerRefs.filter((r) => !s.view.layerIds.includes(r.layerId)),
    `INV-9 view items assigned to missing layers${at}`
  ).toEqual([]);

  // INV-10
  if (s.itemControls?.id && s.itemControls.type && poolFor[s.itemControls.type]) {
    expect(
      poolFor[s.itemControls.type].includes(s.itemControls.id),
      `INV-10 itemControls targets a missing ${s.itemControls.type}${at}`
    ).toBe(true);
  }

  // INV-11
  const layerById = new Map(s.view.layerFlags.map((l) => [l.id, l]));
  const layerOf = new Map(s.view.entityLayerRefs.map((r) => [r.id, r.layerId]));
  const untouchableSelection = s.selectedIds.filter((sel) => {
    const layer = layerById.get(layerOf.get(sel.id) ?? '');
    return !!layer && (!layer.visible || layer.locked);
  });
  expect(
    untouchableSelection,
    `INV-11 selectedIds hold entities on a hidden or locked layer${at}`
  ).toEqual([]);

  // INV-12
  expect(
    s.view.connectorIds.filter((id) => !s.sceneConnectorIds.includes(id)),
    `INV-12 active-view connectors with no scene entry (render nowhere)${at}`
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// 3. Schema oracle
// ---------------------------------------------------------------------------

/** The model exactly as `modelFromModelStore` (the export/save path) builds it. */
export const readExportableModel = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const m = (window as any).__axoview__.model.getState();
    return JSON.parse(
      JSON.stringify({
        version: m.version,
        title: m.title,
        description: m.description,
        colors: m.colors,
        icons: m.icons,
        items: m.items,
        views: m.views
      })
    );
  });

/**
 * APPROACH §4.3 — after a probe's mutations the exported model must survive the
 * loader's own validation. A failure here is a silent data-corruption finding:
 * the diagram saves fine and refuses to open next time.
 */
export async function expectSchemaClean(page: Page, label = '') {
  const model = await readExportableModel(page);
  const result = modelSchema.safeParse(model);
  const detail = result.success
    ? ''
    : result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join(' | ');
  expect(
    result.success,
    `schema oracle: exported model would be rejected by the loader${label ? ` (${label})` : ''} — ${detail}`
  ).toBe(true);
}

/** Both structural oracles in one call — the usual probe-end assertion. */
export async function expectModelHealthy(page: Page, label = '') {
  await expectStoreInvariants(page, label);
  await expectSchemaClean(page, label);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type ExploreFixtures = {
  app: AppPage;
  consoleOracle: ConsoleOracle;
};

const assertNoConsoleErrors = (oracle: ConsoleOracle, testInfo: TestInfo) => {
  // A probe that is an expected-fail repro (`test.fail()`) has already made its
  // point; don't double-report boot noise on top of it.
  if (testInfo.expectedStatus === 'failed') return;
  const errs = oracle.errors();
  expect(
    errs,
    `crash/console oracle: ${errs.length} unexpected error(s) during the probe`
  ).toEqual([]);
};

/** Boots straight to a blank diagram with the canvas mounted (the usual rig). */
export const exploreTest = canvasReadyTest.extend<ExploreFixtures>({
  consoleOracle: async ({ page }, use, testInfo) => {
    const oracle = attachConsoleOracle(page);
    await use(oracle);
    assertNoConsoleErrors(oracle, testInfo);
  },
  app: async ({ app, consoleOracle }, use) => {
    // Boot noise (dev-server chatter, one-shot warnings) is not the probe's
    // fault — the oracle starts clean at the first probe statement.
    consoleOracle.reset();
    await use(app);
  }
});

/** Same oracles over the raw `/app` boot (no diagram created) — for A-area probes. */
export const exploreAppTest = appTest.extend<ExploreFixtures>({
  consoleOracle: async ({ page }, use, testInfo) => {
    const oracle = attachConsoleOracle(page);
    await use(oracle);
    assertNoConsoleErrors(oracle, testInfo);
  },
  app: async ({ app, consoleOracle }, use) => {
    consoleOracle.reset();
    await use(app);
  }
});
