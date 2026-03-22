# Playwright Migration Plan

**Status:** Approved — ready for implementation
**Replaces:** `e2e-tests/` (Selenium + Python + pytest + Docker)
**New location:** `packages/fossflow-e2e/` (npm workspace, TypeScript, Playwright)

---

## Decisions

| # | Decision |
|---|---|
| 1 | **`data-testid` attributes** — yes, add them to all key interactive elements as part of Phase 0. Role-based locators are preferred but `data-testid` provides a stable fallback for elements that don't have meaningful accessible roles (e.g. the canvas container, icon grid items). |
| 2 | **Store exposure** — use `window.__fossflow__` gated by `process.env.NODE_ENV !== 'production'`. The bundler tree-shakes this block entirely from production builds — zero user impact. This replaces the ~100-line React fiber-tree injection used by Selenium and gives precise typed access to mode, history, and item controls state. |
| 3 | **Selenium retirement** — drop per spec (phased): delete the matching Python file as soon as its Playwright replacement passes locally and in CI. |
| 4 | **Firefox coverage** — yes, add a `firefox` project to `playwright.config.ts`. All interaction specs run on both Chromium and Firefox. Catches browser-specific event handling differences in mouse gestures and right-click behaviour. |
| 5 | **Visual regression** — yes, add `visual.spec.ts` now. Playwright's `toHaveScreenshot()` is cheap to add alongside other specs. Baselines stored in `packages/fossflow-e2e/snapshots/`. Run as a separate `visual` project so it doesn't slow the main e2e suite. |

---

## Table of Contents

1. [Why replace Selenium](#1-why-replace-selenium)
2. [Testing harness — four tiers](#2-testing-harness--four-tiers)
3. [Commands reference](#3-commands-reference)
4. [Package structure](#4-package-structure)
5. [Playwright config strategy](#5-playwright-config-strategy)
6. [Shared fixtures and helpers](#6-shared-fixtures-and-helpers)
7. [`data-testid` attribute inventory](#7-data-testid-attribute-inventory)
8. [Test inventory — all specs](#8-test-inventory--all-specs)
9. [CI/CD changes](#9-cicd-changes)
10. [Implementation checklist](#10-implementation-checklist)

---

## 1. Why replace Selenium

| Problem in current Selenium suite | Consequence |
|---|---|
| `time.sleep(3)` / `time.sleep(5)` throughout | Slow (~60s total), brittle on slow CI runners |
| Driver fixture duplicated in all 8 test files | Any change needs to be made 8 times |
| Store state read via ~100-line React fiber tree injection | Breaks on any React internals change |
| MUI CSS class selectors (`fossflow-container`, `[class*="MuiDialog"]`) | Style refactors silently break tests |
| Python ↔ TypeScript language boundary | Can't share types, selectors, or constants with the app |
| Requires Docker Selenium Grid to run locally | Developers skip running e2e locally |
| Mouse gesture tests (right-click drag, pan) are unreliable in Selenium | Core new features are untestable |

Playwright eliminates all of the above: auto-waiting replaces sleeps, TypeScript unifies the stack, no Docker needed, and mouse gestures are first-class.

---

## 2. Testing harness — four tiers

```
┌──────────────────────────────────────────────────────────┐
│  TIER 4 — FULL REGRESSION                                │
│  Unit (Jest) + Smoke + E2E + Visual                      │
│  npm run test:regression                                 │
│  Expected: ~10–12 min                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  TIER 3 — E2E (Chromium + Firefox)                 │  │
│  │  npm run test:e2e                                  │  │
│  │  Expected: ~8–10 min (parallel across browsers)    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  TIER 2 — SMOKE                              │  │  │
│  │  │  npm run test:smoke                          │  │  │
│  │  │  Expected: ~30 sec                           │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

  UNIT (Jest) — independent of browser, always fast
  npm run test:unit
  Expected: ~25 sec (514 tests, no browser)

  VISUAL — separate project, baselines stored in repo
  npm run test:visual
  Expected: ~3–4 min (screenshot comparison)
```

**Tier 1 — Unit** (`test:unit`)
Jest only. No browser. Fastest feedback loop — run continuously during development.

**Tier 2 — Smoke** (`test:smoke`)
4 Playwright tests, Chromium only. Is the app alive? Run before every push.

**Tier 3 — E2E** (`test:e2e`)
40 Playwright tests across all interaction specs, Chromium + Firefox in parallel. Run before pushing.

**Tier 4 — Full Regression** (`test:regression`)
Unit + E2E + Visual. Gate for production merges. Runs in CI on every PR.

**Visual** (`test:visual`) — separate, not part of `test:regression` by default.
Screenshot baselines stored in `snapshots/`. Run manually or on a dedicated schedule to detect rendering regressions.

---

## 3. Commands reference

### Root-level scripts (add to root `package.json`)

```bash
# Unit tests only — Jest, no browser, ~25s
npm run test:unit

# Smoke only — Playwright, 4 tests, Chromium, ~30s
npm run test:smoke

# All interaction e2e tests — Chromium + Firefox, ~8–10 min
npm run test:e2e

# Visual regression — screenshot comparison, ~3–4 min
npm run test:visual

# Full regression: unit + e2e (smoke is a subset of e2e)
npm run test:regression

# Interactive Playwright UI — shows browser, good for debugging
npm run test:e2e:ui

# Playwright with traces on failure — for CI post-mortem
npm run test:e2e:ci
```

### What each maps to internally

| Script | Command |
|---|---|
| `test:unit` | `npm test --workspace=packages/fossflow-lib` |
| `test:smoke` | `playwright test --project=smoke --config packages/fossflow-e2e/playwright.config.ts` |
| `test:e2e` | `playwright test --project=chromium --project=firefox --config packages/fossflow-e2e/playwright.config.ts` |
| `test:visual` | `playwright test --project=visual --config packages/fossflow-e2e/playwright.config.ts` |
| `test:regression` | `npm run test:unit && npm run test:e2e` |
| `test:e2e:ui` | `playwright test --ui --config packages/fossflow-e2e/playwright.config.ts` |
| `test:e2e:ci` | `playwright test --config packages/fossflow-e2e/playwright.config.ts --trace on-first-retry` |

### Running a single spec or test during development

```bash
# Specific spec file (from repo root)
npx playwright test node --config packages/fossflow-e2e/playwright.config.ts

# Specific test by name
npx playwright test -g "right-click without drag" --config packages/fossflow-e2e/playwright.config.ts

# From the e2e package directory
cd packages/fossflow-e2e
npx playwright test tests/pan.spec.ts
npx playwright test tests/pan.spec.ts --headed        # visible browser
npx playwright test tests/pan.spec.ts --debug         # step-through debugger
npx playwright test tests/pan.spec.ts --project=firefox  # specific browser

# Update visual regression baselines (after intentional visual change)
npx playwright test --project=visual --update-snapshots --config packages/fossflow-e2e/playwright.config.ts
```

### Viewing traces after a failure

```bash
npx playwright show-trace packages/fossflow-e2e/test-results/*/trace.zip
```

---

## 4. Package structure

```
packages/fossflow-e2e/
├── package.json                     # @playwright/test, typescript
├── tsconfig.json                    # path aliases matching fossflow-lib
├── playwright.config.ts             # projects (smoke/chromium/firefox/visual), webServer
│
├── fixtures/
│   ├── index.ts                     # re-exports all fixtures for test imports
│   ├── app.fixture.ts               # base: load URL, wait for mount, dismiss tooltips
│   └── canvas.fixture.ts            # extends app: placeNode, countNodes, getMode, etc.
│
├── helpers/
│   ├── store.ts                     # typed page.evaluate() wrappers for Zustand store reads
│   ├── selectors.ts                 # centralised locator builders (toolbar, canvas, panels)
│   └── mouse.ts                     # gesture helpers: rightDrag, middleClickDrag, etc.
│
├── snapshots/                       # visual regression baselines (committed to repo)
│   ├── empty-canvas-chromium.png
│   ├── node-placed-chromium.png
│   └── ...
│
└── tests/
    ├── smoke.spec.ts                # SMOKE project — 4 tests, Chromium only
    ├── node.spec.ts                 # Node: place, select, link, description, delete
    ├── pan.spec.ts                  # Pan: right-click, middle-click, transient restore
    ├── lasso.spec.ts                # Lasso: draw, select, toolbar regression
    ├── connector.spec.ts            # Connector: draw, undo/redo
    ├── undo-redo.spec.ts            # Undo/redo: keyboard + button, all item types
    ├── import-export.spec.ts        # Import JSON, Export SVG
    └── visual.spec.ts               # VISUAL project — screenshot baselines
```

---

## 5. Playwright config strategy

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // Tier 2: smoke — fast gate, Chromium only, runs smoke.spec.ts
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Tier 3: full e2e — all specs except smoke and visual
    {
      name: 'chromium',
      testIgnore: ['**/smoke.spec.ts', '**/visual.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: ['**/smoke.spec.ts', '**/visual.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },

    // Visual regression — separate project, separate command
    {
      name: 'visual',
      testMatch: '**/visual.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // Fixed viewport for pixel-stable screenshots
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Auto-starts dev server; reuses if already running locally
  webServer: {
    command: 'npm run dev --workspace=packages/fossflow-app',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

**Key decisions baked in:**
- `reuseExistingServer: true` — no manual server management locally or in CI
- `fullyParallel: true` — Chromium and Firefox specs run at the same time in CI
- `retries: 2` in CI — flaky network/timing failures auto-retry; locally retries are off so failures are immediately visible
- Visual project uses a fixed 1280×800 viewport — screenshot comparison requires consistent pixel dimensions across machines

---

## 6. Shared fixtures and helpers

### `app.fixture.ts` — base fixture used by every test

Loads the app, waits for the React root to mount, and dismisses the hint tooltips that appear on first load (ConnectorHintTooltip, ImportHintTooltip). All other fixtures extend this one.

```typescript
// fixtures/app.fixture.ts (sketch)
export const appTest = base.extend<{ app: AppPage }>({
  app: async ({ page }, use) => {
    await page.goto('/');
    await page.locator('[data-testid="fossflow-canvas"]').waitFor();
    await dismissHintTooltips(page);
    await use(new AppPage(page));
  },
});
```

### `canvas.fixture.ts` — extends app, adds canvas operations

```typescript
// Provided methods:
placeNode(x?: number, y?: number)  // opens icon panel, picks first icon, clicks canvas
countNodes(): Promise<number>       // counts rendered node img elements
getMode(): Promise<ModeState>       // reads uiState.mode from __fossflow__ store
getItemControls()                   // reads uiState.itemControls from store
getScroll()                         // reads uiState.scroll for pan assertions
getHistoryLength()                  // reads model history.past.length for undo assertions
```

### `helpers/store.ts` — typed store reads via `window.__fossflow__`

The stores are exposed in `Isoflow.tsx` under `process.env.NODE_ENV !== 'production'` — completely tree-shaken from production bundles. Tests read live state without any fiber-tree hacks.

```typescript
// helpers/store.ts
export const getUiMode = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().mode);

export const getScroll = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().scroll);

export const getItemControls = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().itemControls);

export const getModelHistoryLength = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.model.getState().history.past.length);

export const setPanSettings = (page: Page, settings: Partial<PanSettings>) =>
  page.evaluate((s) => {
    (window as any).__fossflow__.ui.getState().actions.setPanSettings(s);
  }, settings);
```

### `helpers/selectors.ts` — centralised locator builders

Role-based locators are resilient to MUI class changes. `data-testid` as fallback for elements with no meaningful role.

```typescript
// helpers/selectors.ts
export const toolbar = {
  addItem:   (p: Page) => p.getByRole('button', { name: /Add item/i }),
  select:    (p: Page) => p.getByRole('button', { name: /Select/i }),
  pan:       (p: Page) => p.getByRole('button', { name: /Pan/i }),
  connector: (p: Page) => p.getByRole('button', { name: /Connector/i }),
  lasso:     (p: Page) => p.getByRole('button', { name: /Lasso/i }),
  undo:      (p: Page) => p.getByRole('button', { name: /Undo/i }),
  redo:      (p: Page) => p.getByRole('button', { name: /Redo/i }),
};

export const canvas      = (p: Page) => p.locator('[data-testid="fossflow-canvas"]');
export const itemPanel   = (p: Page) => p.locator('[data-testid="item-controls-panel"]');
export const contextMenu = (p: Page) => p.locator('[data-testid="context-menu"]');
export const nodeImages  = (p: Page) => canvas(p).locator('img');
```

### `helpers/mouse.ts` — gesture helpers

Playwright's `page.mouse` API maps directly to real browser events — reliable for right-click drag, middle-click pan, etc.

```typescript
// helpers/mouse.ts
export const rightDrag = async (page: Page, from: Coords, to: Coords) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 10 }); // steps = smooth movement
  await page.mouse.up({ button: 'right' });
};

export const middleClickDrag = async (page: Page, from: Coords, to: Coords) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
};
```

---

## 7. `data-testid` attribute inventory

These attributes need to be added to the source during Phase 0. They are the stable anchor points for tests — role-based locators are preferred where available, but these cover elements that have no accessible role or need extra precision.

### `fossflow-lib` components

| `data-testid` value | Component / element | Used by |
|---|---|---|
| `fossflow-canvas` | The main canvas container div in `Renderer.tsx` | All specs — app load gate |
| `item-controls-panel` | The `ControlsContainer` wrapper in `ItemControlsManager.tsx` | N-2, P-3, L-3 |
| `context-menu` | The `ContextMenu` root div | L-3 (assert it does NOT appear) |
| `node-label` | The label `Box` in `Node.tsx` | N-6, N-7 (description collapse) |
| `node-header-link` | The `<a>` in `Node.tsx` | N-4, N-5 |
| `lasso-selection` | The lasso rectangle `Box` in `Lasso.tsx` | L-1 (assert visible during drag) |
| `connector-path` | The SVG path in `Connector.tsx` | C-1, C-2, C-3 |

### `fossflow-app` components

| `data-testid` value | Component / element | Used by |
|---|---|---|
| `icon-grid-item` | Each icon button in the icon picker grid | N-1, all node placement |
| `export-svg-button` | The SVG export button in `ExportImageDialog` | IE-2 |
| `import-json-input` | The hidden file `<input>` for JSON import | IE-1 |

---

## 8. Test inventory — all specs

### `smoke.spec.ts` — 4 tests · Smoke project · Chromium · ~30s

The minimum bar for "is the app alive". These run on every CI push, before e2e.

| # | Test name | What it asserts |
|---|---|---|
| S-1 | App loads without JS errors | `page.goto('/')` → no `console.error`, `[data-testid="fossflow-canvas"]` visible |
| S-2 | Tool menu is visible and enabled | All toolbar buttons visible and not `disabled` |
| S-3 | Canvas has non-zero dimensions | `fossflow-canvas` `clientWidth > 0` and `clientHeight > 0` |
| S-4 | Default zoom is 90% | `getUiMode()` → `zoom === 0.9` |

---

### `node.spec.ts` — 8 tests · Chromium + Firefox · ~60s

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| N-1 | Place node → appears on canvas | `nodeImages` count increases | `test_node_placement.py::test_place_node_on_canvas` |
| N-2 | Click node → item controls panel opens | `item-controls-panel` visible; `getItemControls().type === 'ITEM'` | — |
| N-3 | Edit node name → updates on canvas | Typed name text visible in `node-label` | — |
| N-4 | Add header link → name renders as `<a>` | `node-header-link` locator present | — |
| N-5 | Header link → opens URL in new tab | `page.waitForEvent('popup')` fires on click | — |
| N-6 | Add description → label expands | `node-label` bounding box height increases | — |
| N-7 | Clear description → label collapses | `node-label` RichTextEditor child hidden / label height decreases | — |
| N-8 | Delete key → node removed | `nodeImages` count decreases | — |

---

### `pan.spec.ts` — 9 tests · Chromium + Firefox · ~70s *(covers FF-001)*

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| P-1 | Middle-click + drag → canvas pans | `getScroll()` position changes | — |
| P-2 | Middle-click release → Cursor mode restored | `getUiMode().type === 'CURSOR'` | — |
| P-3 | Right-click (no drag) → item panel closes | `item-controls-panel` not visible; mode stays CURSOR | — |
| P-4 | Right-click + drag ≤4px → pan NOT activated | `getUiMode().type !== 'PAN'` during drag | — |
| P-5 | Right-click + drag >4px → enters PAN mode | `getUiMode().type === 'PAN'` mid-drag | — |
| P-6 | Right-click release after drag → restores Cursor | `getUiMode().type === 'CURSOR'` | — |
| P-7 | Right-click in Connector mode → pan → release | `getUiMode().type === 'CONNECTOR'` after release | — |
| P-8 | Right-click in Lasso mode → pan → release | `getUiMode().type === 'LASSO'` after release | — |
| P-9 | `rightClickPan=false` → right-click: no side-effects | `setPanSettings({rightClickPan:false})`; right-click; assert no pan, no menu, no deselect | — |

---

### `lasso.spec.ts` — 5 tests · Chromium + Firefox · ~40s

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| L-1 | Drag empty canvas → lasso rectangle visible | `lasso-selection` locator visible during drag | — |
| L-2 | Lasso captures items in bounds → selection non-empty | `getUiMode().selection.items.length > 0` | — |
| L-3 | Toolbar click in Lasso mode → no context menu | **ToolMenu propagation regression guard** — `context-menu` never appears | — |
| L-4 | Right-click in Lasso → clears selection | `getUiMode().selection === null` after right-click | — |
| L-5 | Escape → exits Lasso, returns to Cursor | `getUiMode().type === 'CURSOR'` | — |

---

### `connector.spec.ts` — 4 tests · Chromium + Firefox · ~40s

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| C-1 | Place two nodes, draw connector → connector appears | `connector-path` locator visible | `test_connector_undo.py` |
| C-2 | Undo connector → removed | `connector-path` not visible | `test_connector_undo.py` |
| C-3 | Redo connector → restored | `connector-path` visible again | `test_connector_undo.py` |
| C-4 | Select connector + Delete key → removed | `connector-path` not visible | — |

---

### `undo-redo.spec.ts` — 7 tests · Chromium + Firefox · ~60s

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| U-1 | Place node → Undo button → node gone | `nodeImages` count back to baseline | `test_node_placement.py::test_undo_redo_node` |
| U-2 | Redo button → node restored | `nodeImages` count back up | `test_node_placement.py::test_undo_redo_node` |
| U-3 | Ctrl+Z shortcut → same as Undo button | Count decreases | — |
| U-4 | Ctrl+Y shortcut → same as Redo button | Count restored | — |
| U-5 | Undo button disabled on fresh canvas | `toolbar.undo()` has `disabled` attribute | — |
| U-6 | Place 3 nodes → Undo 3× → canvas empty | Count reaches 0 | `test_multi_node_undo.py` |
| U-7 | Draw rectangle → Undo → rectangle removed | Rectangle element not visible | `test_rect_text_undo.py` |

---

### `import-export.spec.ts` — 3 tests · Chromium + Firefox · ~30s

| # | Test name | What it asserts | Replaces Selenium |
|---|---|---|---|
| IE-1 | Import JSON → diagram restored | `nodeImages` count matches imported diagram | `test_import_diagram.py` |
| IE-2 | Export SVG → download triggered | `page.waitForEvent('download')` fires | `test_export_svg.py` |
| IE-3 | Exported SVG is valid XML | Downloaded content parses without error | `test_export_svg.py` |

---

### `visual.spec.ts` — 5 tests · Visual project · Chromium · Fixed 1280×800 · ~3–4 min

Screenshot baselines are committed to `packages/fossflow-e2e/snapshots/`. On first run they are created; subsequent runs compare pixel-by-pixel with a configurable threshold. Run with `npm run test:visual`. Update baselines with `--update-snapshots` after intentional visual changes.

| # | Test name | What it captures |
|---|---|---|
| V-1 | Empty canvas | Clean initial state — toolbar, empty grid, zoom at 90% |
| V-2 | Canvas with one node placed | Node icon + default label visible |
| V-3 | Canvas with two nodes and connector | Connector path between nodes |
| V-4 | Node item controls panel open | Panel layout, name field, link button |
| V-5 | Lasso selection active | Dashed lasso rectangle over selected nodes |

---

### Summary table

| Spec | Tests | Projects | Approx. time |
|---|---|---|---|
| `smoke.spec.ts` | 4 | smoke (Chromium) | ~30s |
| `node.spec.ts` | 8 | chromium + firefox | ~120s |
| `pan.spec.ts` | 9 | chromium + firefox | ~140s |
| `lasso.spec.ts` | 5 | chromium + firefox | ~80s |
| `connector.spec.ts` | 4 | chromium + firefox | ~80s |
| `undo-redo.spec.ts` | 7 | chromium + firefox | ~120s |
| `import-export.spec.ts` | 3 | chromium + firefox | ~60s |
| `visual.spec.ts` | 5 | visual (Chromium) | ~180s |
| **Total interaction** | **40** | 2 browsers | **~8–10 min parallel** |
| **Total visual** | **5** | 1 browser | **~3–4 min** |

---

## 9. CI/CD changes

### New pipeline — three sequential gates

```yaml
# .github/workflows/e2e-tests.yml (replacement)

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit

  smoke-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run build:lib
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:ci -- --project=smoke
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: smoke-traces, path: packages/fossflow-e2e/test-results/ }

  e2e-tests:
    needs: smoke-tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        project: [chromium, firefox]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run build:lib
      - run: npx playwright install --with-deps ${{ matrix.project }}
      - run: npm run test:e2e:ci -- --project=${{ matrix.project }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-traces-${{ matrix.project }}
          path: packages/fossflow-e2e/test-results/
```

**Pipeline flow:**
```
unit-tests → smoke-tests → e2e-tests (chromium)
                         → e2e-tests (firefox)
```
Chromium and Firefox e2e jobs run in parallel. Failures in any earlier stage stop subsequent stages.

### Visual regression CI (optional scheduled run)

Visual tests are not in the default PR pipeline — they run on a schedule or manually, as snapshot mismatches on a feature branch may be intentional.

```yaml
# .github/workflows/visual-regression.yml
on:
  schedule:
    - cron: '0 6 * * 1'   # every Monday 06:00 UTC
  workflow_dispatch:        # manual trigger

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci && npm run build:lib
      - run: npx playwright install --with-deps chromium
      - run: npm run test:visual
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: visual-report, path: packages/fossflow-e2e/playwright-report/ }
```

### Selenium retention

During migration, the existing `e2e-tests.yml` (Selenium) continues to run. A Python test file is deleted, and its workflow step is removed, as soon as its Playwright replacement passes in CI. The Selenium workflow is fully deleted in Phase 6.

---

## 10. Implementation checklist

### Phase 0 — Foundation *(nothing else starts until this is green)*
- [ ] Add `packages/fossflow-e2e` to root `package.json` workspaces
- [ ] Create `packages/fossflow-e2e/package.json` (`@playwright/test`, `typescript`)
- [ ] Create `packages/fossflow-e2e/playwright.config.ts` (all 4 projects, webServer)
- [ ] Create `packages/fossflow-e2e/tsconfig.json`
- [ ] Add all `test:*` scripts to root `package.json`
- [ ] Create `packages/fossflow-e2e/fixtures/app.fixture.ts`
- [ ] Create `packages/fossflow-e2e/fixtures/canvas.fixture.ts`
- [ ] Create `packages/fossflow-e2e/fixtures/index.ts`
- [ ] Create `packages/fossflow-e2e/helpers/store.ts`
- [ ] Create `packages/fossflow-e2e/helpers/selectors.ts`
- [ ] Create `packages/fossflow-e2e/helpers/mouse.ts`
- [ ] Add `window.__fossflow__` store exposure to `Isoflow.tsx`
- [ ] Add `data-testid="fossflow-canvas"` to `Renderer.tsx` interaction div
- [ ] Add `data-testid="item-controls-panel"` to `ItemControlsManager.tsx`
- [ ] Add `data-testid="context-menu"` to `ContextMenu.tsx`
- [ ] Add `data-testid="node-label"` to `Node.tsx` label `Box`
- [ ] Add `data-testid="node-header-link"` to `Node.tsx` `<a>`
- [ ] Add `data-testid="lasso-selection"` to `Lasso.tsx`
- [ ] Add `data-testid="connector-path"` to `Connector.tsx` SVG path
- [ ] Add `data-testid="icon-grid-item"` to icon picker buttons in fossflow-app
- [ ] Add `data-testid="export-svg-button"` to `ExportImageDialog.tsx`
- [ ] Add `data-testid="import-json-input"` to the import file input in fossflow-app
- [ ] Run `npx playwright test --list --config packages/fossflow-e2e/playwright.config.ts` — confirms setup

### Phase 1 — Smoke
- [ ] Write `tests/smoke.spec.ts` (S-1 → S-4)
- [ ] `npm run test:smoke` — all 4 pass locally, Chromium
- [ ] Update CI workflow: add `smoke-tests` job, keep Selenium running in parallel

### Phase 2 — Node and Undo/Redo
- [ ] Write `tests/node.spec.ts` (N-1 → N-8)
- [ ] Write `tests/undo-redo.spec.ts` (U-1 → U-7)
- [ ] Both pass locally on Chromium + Firefox
- [ ] Delete `e2e-tests/tests/test_node_placement.py`
- [ ] Delete `e2e-tests/tests/test_multi_node_undo.py`
- [ ] Delete `e2e-tests/tests/test_rect_text_undo.py`

### Phase 3 — Pan *(no Selenium equivalent — pure new coverage)*
- [ ] Write `helpers/mouse.ts` (rightDrag, middleClickDrag)
- [ ] Write `tests/pan.spec.ts` (P-1 → P-9)
- [ ] All pass locally on Chromium + Firefox

### Phase 4 — Lasso and Connector
- [ ] Write `tests/lasso.spec.ts` (L-1 → L-5)
- [ ] Write `tests/connector.spec.ts` (C-1 → C-4)
- [ ] All pass locally on Chromium + Firefox
- [ ] Delete `e2e-tests/tests/test_connector_undo.py`

### Phase 5 — Import/Export
- [ ] Write `tests/import-export.spec.ts` (IE-1 → IE-3)
- [ ] All pass locally on Chromium + Firefox
- [ ] Delete `e2e-tests/tests/test_import_diagram.py`
- [ ] Delete `e2e-tests/tests/test_export_svg.py`

### Phase 6 — Visual regression
- [ ] Write `tests/visual.spec.ts` (V-1 → V-5)
- [ ] Run `npm run test:visual` — baselines created in `snapshots/`
- [ ] Commit baseline snapshots to repo
- [ ] Add `visual-regression.yml` scheduled CI workflow

### Phase 7 — Cleanup
- [ ] Delete remaining Selenium files (`test_basic_load.py`, `test_base_path_routing.py`, `test_store_debug.py`)
- [ ] Delete `e2e-tests/requirements.txt`, `pytest.ini`, `run-tests.sh`, `Cargo.lock`
- [ ] Remove Python/Docker steps from CI workflow; delete old `e2e-tests.yml`
- [ ] Update `regression_tests.md` — add Playwright spec table, update totals
- [ ] Update `FOSSFLOW_ENCYCLOPEDIA.md` — testing section
- [ ] Update `current_architecture.md` — test audit section
- [ ] Commit and push
