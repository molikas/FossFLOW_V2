# Axoview Performance Troubleshooting Playbook

**Last updated:** 2026-08-21 (section index added; scope boundary vs the GPU substrate made explicit 2026-07-15, content last substantively extended 2026-05-19 with the cold-start case study) · revision history: `git log --follow docs/guidelines/perf-troubleshooting.md`
**Status:** Living doc. Add a new "Case study" subsection whenever a perf investigation lands — **and bump the date above** (it sat at 2026-05-16 while a 2026-05-19 case study lived inside this very file).

> Why this exists. The MQA #7 investigation (multi-element drag FPS cliff) burned through several false hypotheses before we found the real bottleneck. This document captures the **diagnostic order**, the **tools we built**, and the **architectural invariants** that resulted — so the next perf round starts from a higher floor.

> ## ⚠️ Scope — this playbook is the React/DOM layer, not the GPU
>
> Everything below concerns the **React commit / immer / CSS-compositor** layer: interaction,
> drag, startup, re-render isolation. Since [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md)
> (2026-07-08) the *bulk* of what you see — nodes, labels, connectors, rectangles — is drawn
> on **WebGL2**, and this document has no coverage of it.
>
> **If the symptom is inside the canvas region** (frame time at high node counts, pan/zoom
> smoothness, atlas/sprite artifacts, line-style or stroke-width fidelity), go to
> **[canvas-rendering-guidelines.md](canvas-rendering-guidelines.md)** — the GPU substrate's
> perf *and* fidelity contract. Use this playbook when the symptom is chrome, panels, drag
> mechanics, startup, or React re-render churn.

---

## Contents

1. [Companion docs](#companion-docs) — which of the four perf/canvas docs owns your symptom
2. [Hard rules for perf work](#hard-rules-for-perf-work) — measure before you change anything
3. [The diagnostic pyramid (cheapest first)](#the-diagnostic-pyramid-cheapest-first) — [1 baseline diag](#step-1--capture-a-baseline-diag-1-minute) · [2 render-count probe](#step-2--render-count-probe-1-minute) · [3 DevTools profile](#step-3--chrome-devtools-performance-profile-5-minutes) · [4 hypothesis + instrumentation](#step-4--root-cause-hypothesis--targeted-instrumentation)
4. [Anti-patterns we found and fixed](#anti-patterns-we-found-and-fixed) — [A-1 god hook](#a-1--god-hook-usescene-inside-drag-hot-path-components) · [A-2 nested `produce()`](#a-2--nested-immer-produce-in-reducer-chains) · [A-3 commit-dominated drag](#a-3--react-commit-dominates-the-trace-during-drag) · [A-4 two writers per frame](#a-4--two-writers-stomping-the-same-scene-slice-per-frame) · [A-5 React lag behind DOM](#a-5--react-re-render-lag-behind-direct-dom-mutation) · [A-6 diagnostics in production](#a-6--diagnostic-instrumentation-shipped-in-production)
5. [Case study — startup cold-start gap (2026-05-19)](#case-study--startup-cold-start-gap-2026-05-19)
6. [Case study — MQA #7 (2026-05-16)](#case-study--mqa-7-2026-05-16) — the multi-element drag FPS cliff this playbook came from

---

## Companion docs

- [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md) — **the GPU sibling.** WebGL2 substrate fidelity + perf rules (atlas, line-style geometry, premultiplied alpha, export). Start there for anything inside the canvas region.
- [architecture.md §1 Drag Items](architecture.md#1-feature-inventory) — Path 4-true invariant (CSS-preview drag, model lags during drag).
- [known_issues.md MQA #7](../../known_issues.md) — measurement table per fix stage + deferred items.
- [ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md) — the engine-perf harness + measurement protocol (the authoritative copy of the tier ladder / LEB60).
- [docs/tactical/](../tactical/) — short-lived in-flight perf plans (deleted at merge).

---

## Hard rules for perf work

1. **Measure first, fix second.** No code change until a profile or render-count probe has *named* the bottleneck. Three rounds of "I think it's X, let me try Y" cost more session time than one profiling pass.
2. **Honest about what didn't work.** If a fix doesn't move the user-visible metric, say so out loud and revert or scope-down. "Cliff shortened ~37%" is a win; "code is now more correct" without a metric move is a *structural* win at best — don't claim a perf win for it.
3. **One source of truth per frame.** Two writers updating the same scene slice within one mousemove frame WILL race and stomp each other. If you find yourself adding "the last writer wins" to a comment, stop — collapse the writers.
4. **Compositor for position, React for content.** Anything that updates every drag frame at the px level should be a CSS transform, not a React style prop. React + emotion per frame at 60fps × N elements = layout-bound cliff.
5. **Don't pass `useScene()` to hot-path components.** Pass `useSceneActions()` (stable callbacks) or narrow `useSceneStore(selector)` subscriptions. `useScene()` pulls `useSceneData()` which subscribes to `{views, ...}` shallow — *views ticks on every drag frame* and forces every consumer to re-render past its `memo()` gate.

---

## The diagnostic pyramid (cheapest first)

When a user reports slow drag / janky interaction / FPS drop:

### Step 1 — capture a baseline diag (1 minute)

The app has a built-in `DiagnosticsOverlay` (toggle from BottomDock or via `localStorage.setItem('axoview_perf_enabled', 'true')` in prod). It writes a circular buffer of FPS / heap / long-task / scene-count samples. Download via the **↓ AI** button — the compact format is ~80% smaller than the human format and Claude can ingest it directly.

What to read off the JSON:
- **Cliff duration** — count contiguous samples with `fps < 20`. Anything > 2 seconds is user-visible.
- **Peak heap** — `Math.max(...samples.map(s => s[2]))`.
- **Long-task accumulation rate** — `(lt_last - lt_first) / duration_seconds`. > 5/sec sustained means the main thread is stalled.
- **GC events** — listed in the `events` array. Multiple Major GCs during a drag = allocation pressure.

If `ni / nc / ntb` are all 0, the `__axoview__` bridge isn't exposed — that's the `Axoview.tsx` `enableDebugTools` gate. In dev (`NODE_ENV !== 'production'`) it should auto-expose; if not, check whether Axoview was reached by the consumer.

### Step 2 — render-count probe (1 minute)

Distinguishes "too many things re-rendering" from "each render is too expensive". Two very different fixes.

The probe lives at [`src/utils/renderProbe.ts`](../../packages/axoview-lib/src/utils/renderProbe.ts). Gated by `?perfprobe=1` URL flag (zero cost when disabled). Already wired into Nodes / Node / NodeContent / Connectors / Connector. To add it to a new hot-path component:

```ts
import { useRenderProbe } from 'src/utils/renderProbe';

export const MyComponent = memo(({ id, ... }: Props) => {
  useRenderProbe('MyComponent', id);
  // ...rest
});
```

Run:
1. Visit `?perfprobe=1`.
2. Console: `__axoviewRenderProbe.start()`.
3. Reproduce the slow interaction (e.g. drag 6 nodes for 5 s).
4. Console: `__axoviewRenderProbe.stop()`.
5. The `console.table` shows render count per (component, id).

**How to read it:**

| Shape | Diagnosis | Fix direction |
|---|---|---|
| Every component renders ≈ frame count × 1 | Memoization is broken — `memo()` isn't bailing for non-affected instances. Look for unstable parent props (new array refs, new closures) or store subscriptions inside `memo()` that tick per frame. | Narrow the subscriptions; stabilize parent props; consider splitting the component into a thin position shell + a memoized inner. |
| Only the affected instances render (e.g. 6 dragged Nodes high, others low) | Memo is working. Cost is **per-render**. | Cheaper render — module-level `sx` constants, inline `style` for compositor-only props, defer expensive children behind a `memo` boundary with stable primitive props. |
| Parent renders frame count × 1, children stay flat | Parent re-renders but doesn't propagate. Investigate WHY the parent re-renders — often a shallow store selector picking up an unrelated tick. | Narrow the parent's selector. |
| `NodeContent` renders match `Node` (i.e. inner memo never bails) | The inner component subscribes to a store slice that ticks per frame, even though its props are stable. **Classic trap: `useScene()` pulls `useSceneData()` which subscribes shallow to `{views, ...}` — views ticks per drag frame.** | Replace `useScene()` with `useSceneActions()` (actions-only) or narrow `useSceneStore(s => s.specificSlice, ===)`. |

### Step 3 — Chrome DevTools Performance profile (5 minutes)

Only after steps 1-2 have NARROWED the suspect. Otherwise the flame chart is too noisy to interpret usefully.

How:
1. Performance tab → gear → check **Memory** → start recording.
2. Reproduce the slow interaction for 5-10 s.
3. Stop. Bottom-Up tab, sort by **Self Time**.

**What to read:**
- **`Function call` total time** — the rAF callback. If > 50% of the trace, the JS hot path is the problem.
- **React commit chain** — minified names like `ad → uo → i → oO → oM` (varies per bundle hash). Self-time tells you how much CPU React reconciliation owns.
- **`Recalculate style` / `Layout` / `Paint`** — browser-side cost. High Recalculate-style with low React commit means too many `setProperty` calls or `sx` changes triggering style recalcs.
- **`Major GC` entries in GC tab** — each row is one stop-the-world collection. If you see ≥3 Major GCs during a drag, you have an allocation cliff. Per-frame immer clones in reducers are a common culprit.

### Step 4 — root-cause hypothesis & targeted instrumentation

Once steps 1-3 have pointed at a layer (React commit / model immer / DOM layout), add **targeted, throttled** console logs to confirm. The MQA #7 final stage used `throttled console.log` printing primitive values inline (NOT object dumps, which the user can't easily diff in console). Pattern:

```ts
const __now = performance.now();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __w = window as any;
if (!__w.__myDiagLast || __now - __w.__myDiagLast > 250) {
  __w.__myDiagLast = __now;
  console.log(
    `[my-perf] step=write id=${id.slice(0, 8)} | value=(${x},${y}) | count=${n}`
  );
}
```

**Always strip these before commit.** They go through PR review and are a signal of incomplete work if shipped.

---

## Anti-patterns we found and fixed

### A-1 — God hook `useScene()` inside drag-hot-path components

**Symptom:** A `memo()`-wrapped component re-renders every frame even when its props are obviously stable.

**Root cause:** `useScene()` composes `useSceneData()` which subscribes to `{views, colors, icons, items, ...}` with shallow equality. During drag, `views` is replaced per frame → shallow comparison fails → every consumer re-renders, bypassing its `memo()` gate.

**Fix:** Replace `useScene()` with the narrowest hook that satisfies the component's need:
- Only needs actions? → `useSceneActions()`.
- Only needs one slice? → `useSceneStore(s => s.connectors[id], === )`.
- Only needs view metadata that doesn't tick? → write a dedicated selector.

**Where this still matters:** any new `memo`'d component in `SceneLayers/`, `ConnectorAnchorOverlay`, or future overlays. Audit before shipping.

### A-2 — Nested immer `produce()` in reducer chains

**Symptom:** Heap allocation rate during a drag is many MB/sec; Major GCs every few seconds; flame chart dominated by `produce / produceWithPatches`.

**Root cause:** A single user action triggers a chain of reducers, each running its own `produce(state, ...)` over the full state. For `updateViewItem(tile)` → `updateConnector` per touching connector → `syncConnector` per connector, 6 items × 3 connectors = up to ~50 full-graph clones per drag frame.

**Fix:** For the hot path specifically, write a batched, immer-free action that takes all updates and does ONE structural copy + direct path/scene recomputation. Example: `batchUpdateViewItemTiles` and `previewConnectorPaths` in [useSceneActions.ts](../../packages/axoview-lib/src/hooks/useSceneActions.ts).

**The general principle:** the regular reducer chain is correct and convenient for one-shot user actions (click, keypress). But for 30-60fps mousemove handlers, the immer cost compounds. Have a fast-path action that bypasses immer for tile-only or path-only updates.

### A-3 — React commit dominates the trace during drag

**Symptom:** Flame chart shows the React commit chain accounting for 30-40% of CPU during a drag; per-render cost > 30ms.

**Root cause two-fold:**
1. Component tree re-renders many heavy children whose props haven't changed in a meaningful way (the `memo` chain is broken — see A-1).
2. Even the components that *should* render are doing too much work — repeatedly re-creating sx object literals, mounting heavy MUI subtrees per frame.

**Fix:**
1. Split the component into a thin shell (re-renders per tick, trivial output) and a memoized inner that takes only stable primitive props. See [Node.tsx](../../packages/axoview-lib/src/components/SceneLayers/Nodes/Node/Node.tsx) — `Node` (shell) vs `NodeContent` (memoized).
2. Move all static `sx` objects to module-level constants (emotion's class hash hits cache).
3. Move dynamic per-frame values (position, z-index) to inline `style={{ ... }}` (bypasses emotion entirely).
4. Move compositor-only changes (transform, opacity) into CSS variables read by the static `sx`.

### A-4 — Two writers stomping the same scene slice per frame

**Symptom:** Visual flicker during drag — some frames look correct, others look broken. Render-count probe shows the affected component re-rendering more often than expected, with the "broken" state appearing between "correct" updates.

**Root cause:** Two independent code paths both write to `scene.connectors[id].path` within one mousemove. Example: `previewConnectorPaths` (preview, correct) followed by `scene.updateConnector` → `syncConnector` (uses stale model, wrong). The last write wins, so half the frames look broken.

**Detection:** Add throttled diagnostics that log inline primitive values for **every** write to the contested slice. If you see two log lines per mousemove with different values, that's the smoking gun.

**Fix:** Collapse to **one source of truth per frame**. In MQA #7 we extended `previewConnectorPaths` to accept BOTH item AND anchor preview tile maps, and removed the per-frame `scene.updateConnector` call for waypoint anchors entirely (commit deferred to mouseup).

### A-5 — React re-render lag behind direct DOM mutation

**Symptom:** Dragged elements move smoothly via CSS variables (compositor) but connected elements (rendered by React) visibly lag by one frame, even though their data IS being updated synchronously in the same handler.

**Root cause:** React 18 batches re-renders and applies them on the next paint. The CSS variable mutation is applied to the DOM immediately; React's scheduled re-render of subscribing components hasn't run yet by the time the browser paints.

**Fix:** Wrap the Zustand store write in `flushSync` from `react-dom`:

```ts
import { flushSync } from 'react-dom';

flushSync(() => {
  sceneStoreApi.getState().actions.set({ ... }, true);
});
```

Use sparingly — `flushSync` defeats React's batching and *will* hurt perf if called on every state update. It's appropriate ONLY for animations that must visually match a parallel DOM mutation in the same frame.

### A-6 — Diagnostic instrumentation shipped in production

**Symptom:** Console spam in production builds; bundle bloat; users see internal diagnostic strings.

**Root cause:** Forgetting to strip troubleshooting `console.log` calls before committing.

**Fix:**
- **Persistent diagnostics** (kept indefinitely for future investigations): gate behind a URL flag and put them in a dedicated module. Pattern: `useRenderProbe` reads `?perfprobe=1` once at module load; zero cost when off. Safe to ship.
- **One-off troubleshooting** (added during an active investigation): MUST be stripped before commit. Run `git grep -n "console\." packages/axoview-lib/src` immediately before committing perf work. Use `--include='!*.test.*'` to ignore tests. If anything beyond intentional handlers shows up, strip it.

---

## Case study — Startup cold-start gap (2026-05-19)

A different shape of perf problem from the MQA #7 drag cliff — useful as a contrasting walkthrough because the fix here was *not* in code we wrote.

### Reported symptom

Session-mode page load showed a white screen for ~5–7 seconds after `html:head-script`. Docker mode felt fine.

### Diagnostic order

1. **Instrument the timeline first, don't theorise.** Added a small `window.__ffPerf.mark(name)` helper in `public/index.html` (inline `<script>` at the top of `<head>` — runs before the bundle parses) and a `PerformanceObserver` for paint events. Sprinkled marks at `bundle:evaluated`, `react:render-called`, `editor-shell:mount`, `editor:storage-initialized`, `editor:first-screen-rendered`, `editor:first-paint-after-mount`. Auto-dumped `console.table` summary after first paint.

2. **Compared session vs docker.** The instrumentation immediately revealed that session-mode storage init took ~2700 ms vs ~93 ms in docker — same code, same machine, same JS bundle. So the problem was external to the app.

3. **Split the probe.** Storage init contains two `fetch` calls — `/api/config` (`useRuntimeConfig`) and `/api/storage/status` (`LocalStorageProvider.isAvailable`). Added per-probe marks. The first probe consumed 2346 ms; the second only 254 ms — same dead host, **wildly asymmetric**.

4. **Root cause identified by the asymmetry.** Chrome on Windows runs a dual-stack (IPv6→IPv4) connect probe on the *first* request to a host. Once it knows the host is dead, subsequent requests fail fast. The 5000 ms `AbortSignal.timeout` never tripped — the OS gave up at ~2.3 s on its own. The full cost was lower-level than anything our code controlled.

### Fix shape

- **Probe timeouts dropped 5000 ms → 800 ms** in [`useRuntimeConfig.ts`](../../packages/axoview-app/src/hooks/useRuntimeConfig.ts) and [`LocalStorageProvider.ts`](../../packages/axoview-app/src/services/storage/providers/LocalStorageProvider.ts). 800 ms gives ~17× headroom over a healthy backend (~45 ms in docker) and caps the OS-level probe.
- **Probes parallelised** with `Promise.all` in `AppStorageContext.tsx` — they're independent, so worst-case storage init = max(p1, p2) not p1+p2.
- **Inline splash screen** in `public/index.html` (visible from first paint, no React required) covers the remaining bundle-parse + probe gap with a branded surface.

### Measured impact

| Metric (session mode, no backend) | Before | After |
|---|---|---|
| First paint (something on screen) | ~7100 ms (canvas) | ~540 ms (splash) |
| Storage init total | ~2700 ms | ~800 ms |
| Editor canvas mounted | ~7100 ms | ~4000 ms |

Docker mode (~1400 ms FCP) was already in the borderline range; the splash now covers that gap too.

### Lessons

- **An app-level timeout that's larger than the OS-level connect retry is a placebo.** The signal never fires in the steady state — the OS short-circuits the request itself. If you're relying on `AbortSignal.timeout` for fail-fast UX, calibrate against the *OS-level* worst case, not your own ideal of "generous."
- **Asymmetric latency to the same dead host is the tell.** When two identical-shape requests to the same downed endpoint take wildly different time, it's almost always Chrome's connect-cache: first request pays the probe, subsequent requests fail fast. Don't theorise about your code path — that asymmetry **names** the bottleneck before you read any source.
- **Instrument before changing code.** Five minutes of marker plumbing in `public/index.html` told us which probe was slow, which OS-level cliff was eating the time, and let us prove the fix worked. Without that, the same fix would have been a guess.
- **Splash ≠ progress bar.** A static branded surface that's visible at first paint solves "the white screen problem" without a real progress signal. Don't fake progress you don't have — show a brand mark and a spinner, hide on first useful paint.

---

## Case study — MQA #7 (2026-05-16)

The full multi-element drag FPS cliff investigation. Captured here as a reference walkthrough for the diagnostic pyramid above.

### Reported symptom

Drag of 6+ selected nodes drops from 60 → 9-13 fps for 12-19 seconds, recovering after a major GC. Single-node and small multi-select (≤4) stay smooth.

### Stages and outcomes

| Stage | What we did | Cliff | Peak heap | Lesson learned |
|---|---|---|---|---|
| Baseline | Captured diag JSON + Performance flame chart with Memory enabled | 19 s | 167 MB | Allocation-bound cliff + React commit dominates |
| Fix A | Wrapped `DragItems` in `beginDragTransaction`/`commitDragTransaction` (the pattern shipped in `7164b3b` for connectors) | 12 s (-37%) | 203 MB | Structural correctness fix; collapsed N per-tick history pushes into one. Modest perf gain because the dominant cost lay elsewhere. |
| Path 2 v1 | Split Node into position shell + heavy `NodeContent`; module-level sx constants | 13 s | 163 MB | React commit ~40% down. But probe showed `NodeContent` STILL re-rendered every frame — memo wasn't bailing. |
| Path 2 v2 | Replaced `useScene()` with `useSceneActions()` inside `NodeContent` | 13 s | 163 MB | NodeContent renders dropped from ~170 to 2 per drag. Found A-1 (useScene shallow subscription). |
| Path 4 batched | Added `batchUpdateViewItemTiles` — one immer-free structural copy + path recompute per frame | 13 s | 154 MB | Marginal. Discovered cliff was no longer allocation-bound; layout/paint cost was the new floor. |
| Path 4-true | CSS-only drag preview (no model writes per frame); `previewConnectorPaths` writes scene.connectors[].path directly; commit deferred to mouseup | **0 s @ ≤13 fps** | 199 MB | Cliff eliminated. Drag sustained 24-44 fps. Found A-3, A-5. |
| Waypoint preview | Extended `previewConnectorPaths` to accept anchor preview tiles; removed `scene.updateConnector` per-frame call for waypoints during drag | (clean) | (clean) | Found and fixed A-4 (two writers stomping). User-visible flicker eliminated. |

### Key invariants that emerged (now documented in [architecture.md §1 Drag Items](architecture.md#1-feature-inventory))

- During a multi-element drag, `view.items[].tile` and `view.connectors[].anchors[].ref.tile` are **stale** until mouseup.
- Live item positions live in DOM CSS variables (`--ff-drag-dx/dy` on `[data-drag-id]` elements).
- Live connector geometry lives in `scene.connectors[].path` (synthetically computed and written directly).
- The drag transaction (`begin`/`commitDragTransaction`) collapses all in-flight changes into one history entry.
- The `data-drag-id` attribute is part of the contract — removing it breaks DragItems' DOM targeting.

### What's deferred (filed in known_issues.md)

- The drag still maxes at 24-44 fps (not 60). The remaining cost is split between `getConnectorPath` allocations per frame and browser-side layout/paint for moving 6+ elements. Eliminating it fully would require:
  - Memoizing path computation across frames where tiles haven't actually changed by ≥1 tile.
  - Throttling `previewConnectorPaths` to one call per rAF tick (currently runs synchronously per mousemove).
  - Or rendering the connectors with `transform: translate` from a CSS variable too — but the path geometry changes per drag (not just its container position), so this is non-trivial.
