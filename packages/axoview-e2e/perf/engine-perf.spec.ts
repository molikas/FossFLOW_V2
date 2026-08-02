/**
 * engine-perf.spec.ts — the committed one-command perf harness (KR1/KR2).
 *
 * Drives the REAL app in REAL Chromium and reports p50/p95 frame time for two
 * scenarios, parameterised by entity count N:
 *   (a) bulk-spawn/render — commit N nodes in one store write (models paste/
 *       import) and measure the frames it takes to reconcile + paint.
 *   (b) drag — drag one node through an empty tile lane while N-1 others are
 *       rendered, measuring per-frame re-render cost.
 *
 * Methodology (charter PHASE 0):
 *   - All input + frame capture runs IN-PAGE (one page.evaluate per run) so the
 *     Node↔CDP roundtrip never sits between an input event and the frame it
 *     produces. A drag is an rAF-paced pointermove stream; frame time = the
 *     delta between successive requestAnimationFrame callbacks under load.
 *   - Frame timing via rAF deltas; long tasks via PerformanceObserver('longtask').
 *   - Median-of-≥7: REPEATS runs per (scenario,N); the first is a discarded
 *     warm-up. Reported number = median across the kept runs.
 *   - Noise band = run-to-run spread of the headline metric, (max−min)/median.
 *     Headline = p95 for drag, longest-frame (max) for spawn (a paste freeze is
 *     ONE giant frame, which a p95 over a settle window would hide).
 *
 * Anti-cheat (charter Guardrails): the dragged node traverses EMPTY tiles so
 * the collision path is never short-circuited, and no work the real app does is
 * removed. There is no viewport culling today (a T2 unlock), so all N nodes
 * cost render whether or not they are on-screen.
 *
 * Output: perf-results/baseline.md (human table) + perf-results/raw/*.json
 * (every run's frame array, for later trace analysis). One command:
 *   npm run perf
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// AC-power gate (2026-07-08). On a laptop running on BATTERY, Windows throttles
// the CPU/GPU (and ANGLE/D3D11 clocks down), so frame numbers are NOT
// representative and A/B comparisons are meaningless. Block measurement until AC
// power is connected. `PERF_ALLOW_BATTERY=1` overrides (e.g. to characterise the
// throttled floor deliberately). Returns true = AC, false = battery, null =
// unknown / no battery (desktop) → not blocked.
function acPowerStatus(): boolean | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty PowerOnline)"',
      { timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .toString()
      .trim();
    if (out === 'True') return true;
    if (out === 'False') return false;
    return null;
  } catch {
    return null;
  }
}

function requireACPower() {
  if (process.env.PERF_ALLOW_BATTERY) {
    console.log(
      '[perf] ⚠️ PERF_ALLOW_BATTERY=1 — measuring on battery (throttled, non-representative).'
    );
    return;
  }
  const ac = acPowerStatus();
  if (ac === false) {
    throw new Error(
      '\n[perf] ⛔ ON BATTERY POWER — CPU/GPU are throttled, so frame numbers are not representative.\n' +
        '       Plug in AC power and re-run, or set PERF_ALLOW_BATTERY=1 to measure the throttled floor anyway.\n'
    );
  }
  console.log(
    `[perf] power: ${
      ac === true
        ? 'AC (plugged in) ✓'
        : 'unknown (no battery / desktop) — not gated'
    }`
  );
}

// N set and repeats are env-tunable for fast smoke validation; defaults are the
// charter's committed baseline grid (KR2) and median-of-≥7.
const N_SET = process.env.PERF_N
  ? process.env.PERF_N.split(',').map((s) => parseInt(s.trim(), 10))
  : [25, 50, 100, 200, 500, 1000];
const REPEATS = process.env.PERF_REPEATS
  ? parseInt(process.env.PERF_REPEATS, 10)
  : 8; // first discarded as warm-up → 7 kept (charter: median-of-≥7)
// Paste-on-top scenario node counts (the reported freeze: select N → copy →
// paste directly on top). The pre-fix per-item pasteItems loop was O(N^3) here.
const PASTE_N_SET = process.env.PERF_PASTE_N
  ? process.env.PERF_PASTE_N.split(',').map((s) => parseInt(s.trim(), 10))
  : [10, 50, 100, 150];
const SPAWN_CAP_MS = 6000; // hard cap if the spawn never settles (it should)
const DRAG_STEPS = 80; // rAF-paced pointermoves per drag run
// Per-cell warm-up runs, discarded before the kept REPEATS. V8 tiers up the
// shared render/drag hot path after ~hundreds of invocations; without enough
// warm-up the first runs sit in a slower regime and the noise band is bimodal.
const WARMUP_RUNS = process.env.PERF_WARMUP
  ? parseInt(process.env.PERF_WARMUP, 10)
  : 3;
// Idle-churn guardrail probe window (charter: "idle heap flat ±5% over 60s").
const IDLE_PROBE_MS = process.env.PERF_IDLE_MS
  ? parseInt(process.env.PERF_IDLE_MS, 10)
  : 60_000;

const RESULTS_DIR = path.resolve(__dirname, '../../../perf-results');
const RAW_DIR = path.join(RESULTS_DIR, 'raw');

// ---------------------------------------------------------------------------
// Stats helpers (Node side)
// ---------------------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return percentile(s, 50);
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
// Coefficient of variation (relative stddev) — the run-to-run variance measure
// KR1 asks for. Robust to vsync quantization in a way (max−min)/median is not.
function cov(xs: number[]): number {
  const m = mean(xs);
  return m > 0 ? stddev(xs) / m : 0;
}
function round(x: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}

interface RunResult {
  frames: number[];
  longTasks: Array<{ start: number; duration: number }>;
  commitMs?: number; // spawn only: synchronous store-write duration (sub-vsync)
  dragEngaged?: boolean; // drag only: the DRAG_ITEMS mode actually activated
  renderCounts?: Record<string, number>; // drag only, ?perfprobe=1: renders during the drag loop
  renderedNodes?: number; // spawn/paste: node shells (or canvas draw-count) after settle
  paintedConnectors?: number; // spawn only: connectors that painted (anti-cheat: == committed)
  sceneCounts?: {
    nodes: number;
    connectors: number;
    rectangles: number;
    textBoxes: number;
  }; // spawn only: the committed multi-element scene composition
  pastedCount?: number; // paste only: nodes added by the paste (anti-cheat: == N)
  totalNodes?: number; // paste only: total nodes after paste (== 2N)
}
interface RunMetrics {
  p50: number;
  p95: number;
  max: number;
  meanFrame: number;
  settle: number;
  count: number;
  longTaskTotal: number;
  longTaskMax: number;
}
function metricsOf(run: RunResult): RunMetrics {
  const sorted = [...run.frames].sort((a, b) => a - b);
  const ltDurs = run.longTasks.map((l) => l.duration);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
    meanFrame: mean(run.frames),
    settle: run.frames.reduce((a, b) => a + b, 0),
    count: sorted.length,
    longTaskTotal: ltDurs.reduce((a, b) => a + b, 0),
    longTaskMax: ltDurs.length ? Math.max(...ltDurs) : 0
  };
}

// ---------------------------------------------------------------------------
// CDP trace attribution — compute self-time by event name on the busiest
// (renderer main) thread, so a spawn freeze can be split across scripting /
// style / layout / paint without double-counting nested events.
// ---------------------------------------------------------------------------
interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
}
function attributeTrace(events: TraceEvent[]) {
  // Pick the thread with the most total complete-event duration (renderer main).
  const byThread = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    const k = `${e.pid}:${e.tid}`;
    (byThread.get(k) ?? byThread.set(k, []).get(k)!).push(e);
  }
  let best: TraceEvent[] = [];
  let bestDur = -1;
  for (const evs of byThread.values()) {
    const d = evs.reduce((a, b) => a + (b.dur ?? 0), 0);
    if (d > bestDur) {
      bestDur = d;
      best = evs;
    }
  }
  // Self-time via a stack over time-ordered complete events.
  best.sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const selfByName = new Map<string, number>();
  const stack: Array<{ end: number; name: string }> = [];
  for (const e of best) {
    const start = e.ts;
    const end = e.ts + (e.dur ?? 0);
    while (stack.length && stack[stack.length - 1].end <= start) stack.pop();
    // Subtract this event's duration from its parent's self-time.
    if (stack.length) {
      const p = stack[stack.length - 1];
      selfByName.set(p.name, (selfByName.get(p.name) ?? 0) - (e.dur ?? 0));
    }
    selfByName.set(e.name, (selfByName.get(e.name) ?? 0) + (e.dur ?? 0));
    stack.push({ end, name: e.name });
  }
  const rows = [...selfByName.entries()]
    .map(([name, us]) => ({ name, ms: us / 1000 }))
    .filter((r) => r.ms > 0.5)
    .sort((a, b) => b.ms - a.ms);
  const total = rows.reduce((a, b) => a + b.ms, 0);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// In-page harness. Installed once per page; attaches window.__perfH.
// Self-contained: references only window/document so Playwright can serialise it.
// ---------------------------------------------------------------------------
function installHarness() {
  const w = window as any;
  const ax = () => w.__axoview__;
  const raf = (): Promise<number> =>
    new Promise((r) => requestAnimationFrame((t) => r(t)));

  // Deterministic PRNG so every run builds the identical scene (run-to-run
  // comparability). NOT Math.random.
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Representative icons. The real app embeds ~2 KB base64 SVGs per node; the old
  // trivial 100-byte <rect> under-measured per-node icon decode/markup cost
  // (bloat-analysis.txt). A small SET assigned round-robin: each repeats (a real
  // dedup opportunity) yet there is variety (the "every node can be stylized"
  // challenge). ~1.7 KB each.
  const ICON_PALETTE = [
    '%235b8def',
    '%23e0644b',
    '%233fae6b',
    '%23f2b134',
    '%238e6fd6',
    '%2300a3a3'
  ];
  function makeIconUrl(seed: number) {
    const rnd = mulberry32(seed * 7919 + 1);
    let body = "<rect width='64' height='64' rx='6' fill='%23f4f6fb'/>";
    for (let i = 0; i < 26; i++) {
      const x = (rnd() * 56 + 4).toFixed(1);
      const y = (rnd() * 56 + 4).toFixed(1);
      const c = ICON_PALETTE[(rnd() * ICON_PALETTE.length) | 0];
      if (rnd() < 0.5) {
        const r = (rnd() * 7 + 2).toFixed(1);
        body += `<circle cx='${x}' cy='${y}' r='${r}' fill='${c}'/>`;
      } else {
        const wd = (rnd() * 12 + 3).toFixed(1);
        const ht = (rnd() * 12 + 3).toFixed(1);
        body += `<rect x='${x}' y='${y}' width='${wd}' height='${ht}' rx='1.5' fill='${c}'/>`;
      }
    }
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${body}</svg>`;
  }
  const PERF_ICONS = Array.from({ length: 5 }, (_, i) => ({
    id: 'perf-icon-' + i,
    name: 'perf-' + i,
    url: makeIconUrl(i + 1),
    collection: 'imported',
    isIsometric: false
  }));
  // Global colour palette (connectors/rectangles reference by id).
  const PERF_COLORS = [
    { id: 'c1', value: '#a5b8f3' },
    { id: 'c2', value: '#bbadfb' },
    { id: 'c3', value: '#f4eb8e' },
    { id: 'c4', value: '#f0aca9' },
    { id: 'c5', value: '#fad6ac' },
    { id: 'c6', value: '#a8dc9d' },
    { id: 'c7', value: '#b3e5e3' }
  ];
  // Per-node label colours (raw hex; '' = theme default). Variety so the label
  // styling path is exercised non-uniformly.
  const LABEL_COLORS = ['', '#c0392b', '#1565c0', '#2e7d32', '#6a1b9a'];

  function activeView() {
    const ui = ax().ui.getState();
    const m = ax().model.getState();
    const view =
      (ui.view && m.views.find((v: any) => v.id === ui.view)) || m.views[0];
    return { view, m };
  }

  function viewsWith(
    viewId: string,
    vitems: any[],
    connectors?: any[],
    rectangles?: any[],
    textBoxes?: any[],
    labels?: any[]
  ) {
    const m = ax().model.getState();
    return m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            items: vitems,
            connectors: connectors || [],
            rectangles: rectangles || [],
            textBoxes: textBoxes || [],
            labels: labels || []
          }
        : v
    );
  }

  function resetState() {
    const { view } = activeView();
    ax()
      .model.getState()
      .actions.set(
        {
          items: [],
          icons: PERF_ICONS,
          colors: PERF_COLORS,
          views: viewsWith(view.id, [])
        },
        true
      );
    ax().model.getState().actions.clearHistory();
    // Deterministic viewport so frame cost is comparable run-to-run.
    const uiActions = ax().ui.getState().actions;
    try {
      uiActions.setZoom(0.65);
      uiActions.setScroll({ position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } });
      uiActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      uiActions.setItemControls(null);
    } catch {
      /* action shape drift — non-fatal for measurement */
    }
  }

  // Realistic scene of N nodes + ~N connectors + grouping rectangles, with
  // varied per-item stylisation (5 icons round-robin, palette colours, varied
  // label colours, ~20% with descriptions, ~12% with notes). `xBase` offsets the
  // grid origin. Deterministic so the scene is identical run-to-run. N is the
  // NODE count (the SSB/LEB regime); the other element counts scale with it. The
  // full scene is what the real app renders on a diagram open / paste /
  // view-switch. (Text boxes are excluded — see the note at the return.)
  const NODE_NAMES = [
    'Service',
    'Gateway',
    'Store',
    'Queue',
    'Cache',
    'Worker',
    'Router',
    'Index'
  ];
  function buildScene(N: number, xBase: number) {
    const side = Math.ceil(Math.sqrt(N));
    const noLabel = !!w.__perfNoLabel; // diagnostic: isolate label-subtree cost
    const noConn = !!w.__perfNoConn; // diagnostic: isolate connector-subtree cost (T2 prize sizing)
    // T8 (ADR 0023) all-offset: every node off-grid by a fixed SceneLayer-px
    // residual + collides:false → renderer adds one transform compose per node
    // (no React work) and buildTileIndex excludes them all (empty obstacle set →
    // drag collision marginally cheaper). The integer `tile` is unchanged.
    const offsetMode = !!w.__perfOffset;
    // E-slice styling-stress flags (dormant when off → default scene stays
    // byte-identical, like the diagnostics above). Each loads the new label /
    // border styling surfaces the productization spike introduced so the perf
    // gate measures them.
    const labelHeavy = !!w.__perfLabelHeavy; // every node label: B/I/S + colour + varied px
    const connLabelHeavy = !!w.__perfConnLabelHeavy; // every connector labelled + styled
    const bgHeavy = !!w.__perfBgHeavy; // dense grouping rects with fills + ≤30px borders
    // ALL-TYPES stress (2026-07-08): the representative "everything at once" scene
    // for the GPU-fold work — every connector carries ≥3 styled labels, styled
    // rectangle borders, AND floating Labels are added (see the return). Exercises
    // EVERY element renderer simultaneously so the pan/spawn cost reflects the
    // whole scene, not just nodes.
    const allTypes = !!w.__perfAllTypes;
    const items: any[] = [];
    const vitems: any[] = [];
    const connectors: any[] = [];
    for (let i = 0; i < N; i++) {
      const id = 'perf-' + i;
      const col = i % side;
      const row = Math.floor(i / side);
      const item: any = {
        id,
        name: NODE_NAMES[i % NODE_NAMES.length] + ' ' + i,
        icon: PERF_ICONS[i % PERF_ICONS.length].id
      };
      if (i % 5 === 0) {
        item.description =
          '<p>' +
          NODE_NAMES[i % NODE_NAMES.length] +
          ' ' +
          i +
          ' handles a slice of the workload and forwards downstream.</p>';
      }
      if (i % 8 === 0) item.notes = 'note ' + i;
      items.push(item);
      const vi: any = {
        id,
        tile: { x: xBase + col, y: row },
        labelColor: LABEL_COLORS[i % LABEL_COLORS.length]
      };
      if (labelHeavy) {
        // Maximal node-label styling: the Canvas2D label draw now pays
        // bold/italic font selection + a manually-stroked strikethrough + a
        // non-default colour + a varied px size on every node (the heaviest
        // per-frame label path — what the E-gate must not regress).
        vi.labelBold = i % 2 === 0;
        vi.labelItalic = i % 3 === 0;
        vi.labelStrikethrough = i % 5 === 0;
        vi.labelColor = LABEL_COLORS[1 + (i % (LABEL_COLORS.length - 1))];
        vi.labelFontSize = 12 + (i % 5) * 2; // 12..20px
        vi.showLabel = true;
      }
      if (noLabel) vi.showLabel = false;
      if (offsetMode) {
        vi.offset = { x: 7, y: -5 };
        vi.collides = false;
      }
      vitems.push(vi);
      // Connector to the right neighbour (same row): ~N−side edges, ~⅓ labelled.
      if (!noConn && col < side - 1 && i + 1 < N) {
        const c: any = {
          id: 'c-' + i,
          color: PERF_COLORS[i % PERF_COLORS.length].id,
          width: 10,
          style: 'SOLID',
          anchors: [
            { id: 'a' + i + 's', ref: { item: id } },
            { id: 'a' + i + 'e', ref: { item: 'perf-' + (i + 1) } }
          ]
        };
        if (allTypes) {
          // ≥3 styled labels per connector at 25/50/75% along the path (the
          // user's all-types requirement) — the heaviest ConnectorLabel load.
          c.labels = [25, 50, 75].map((position, j) => ({
            id: `cl${i}-${j}`,
            text: `edge ${i}.${j}`,
            position,
            fontSize: 10 + ((i + j) % 6) * 2,
            labelColor: LABEL_COLORS[1 + ((i + j) % (LABEL_COLORS.length - 1))],
            bold: (i + j) % 2 === 0,
            italic: (i + j) % 3 === 0,
            strikethrough: (i + j) % 4 === 0
          }));
        } else if (connLabelHeavy) {
          // Every connector carries a styled additional label (the DOM
          // ConnectorLabel path: B/I/S + colour + varied px), not just ~⅓.
          c.labels = [
            {
              id: 'cl' + i,
              text: 'edge ' + i,
              position: 50,
              fontSize: 10 + (i % 6) * 2, // 10..20px (schema 8..24)
              labelColor: LABEL_COLORS[1 + (i % (LABEL_COLORS.length - 1))],
              bold: i % 2 === 0,
              italic: i % 3 === 0,
              strikethrough: i % 4 === 0
            }
          ];
        } else if (i % 3 === 0) {
          c.labels = [
            { id: 'cl' + i, text: 'edge ' + i, position: 50, fontSize: 12 }
          ];
        }
        connectors.push(c);
      }
    }
    // Grouping rectangles over ~5×5 blocks (varied colours).
    const rectangles: any[] = [];
    // bgHeavy: denser blocks (more overlap/overdraw) + a styled border per rect.
    const BLOCK = bgHeavy ? 2 : 5;
    let k = 0;
    for (let by = 0; by < side; by += BLOCK) {
      for (let bx = 0; bx < side; bx += BLOCK) {
        const rect: any = {
          id: 'r-' + k,
          color: PERF_COLORS[k % PERF_COLORS.length].id,
          from: { x: xBase + bx, y: by },
          to: {
            x: xBase + Math.min(bx + BLOCK - 1, side - 1),
            y: Math.min(by + BLOCK - 1, side - 1)
          }
        };
        if (bgHeavy || allTypes) {
          rect.borderColor = PERF_COLORS[(k + 1) % PERF_COLORS.length].value;
          rect.borderWidth = 8 + (k % 4) * 6; // 8..26px (≤30)
          rect.borderStyle = (['SOLID', 'DOTTED', 'DASHED'] as const)[k % 3];
        }
        rectangles.push(rect);
        k++;
      }
    }
    // All-types: floating Labels (ADR 0031) sprinkled ~1 per 4 nodes, styled +
    // varied, so the SceneCanvas layer is also exercised in the same scene.
    const labels: any[] = [];
    if (allTypes) {
      for (let i = 0; i < N; i += 4) {
        const col = i % side;
        const row = Math.floor(i / side);
        labels.push({
          id: 'flabel-' + i,
          tile: { x: xBase + col, y: row },
          text: 'Label ' + i,
          fontSize: 14 + (i % 4) * 2,
          color: LABEL_COLORS[1 + (i % (LABEL_COLORS.length - 1))],
          backgroundColor: PERF_COLORS[i % PERF_COLORS.length].value,
          isBold: i % 2 === 0,
          isItalic: i % 3 === 0,
          isStrikethrough: i % 5 === 0
        });
      }
    }
    // Text boxes are intentionally excluded: their `size` is derived scene-side
    // by the createTextBox reducer (getTextBoxDimensions), which a bulk
    // model.set bypasses → the renderer crashes on undefined `size.height`. They
    // are a tiny annotation element (negligible bulk-render weight); the
    // representative load is nodes + connectors + rectangles + labels.
    return { items, vitems, connectors, rectangles, textBoxes: [], labels };
  }

  // Fit the viewport (zoom + scroll) so the whole grid is on-screen, so the
  // engine's viewport cull (Renderer.visibleItems via computeTileBounds) renders
  // ALL N nodes — i.e. N = visible entity count, the regime SSB/LEB60 measure
  // and the one that reproduces the production collapse. Off-screen nodes are
  // culled and ~free, so a representative baseline must keep them visible.
  function fitForGrid(xBase: number, count: number) {
    const side = Math.ceil(Math.sqrt(count));
    const UN = 100;
    const halfW = (UN * 1.415) / 2;
    const halfH = (UN * 0.819) / 2; // ISO (default canvas mode)
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [xBase, xBase + side - 1]) {
      for (const y of [0, side - 1]) {
        const cx = halfW * (x - y);
        const cy = -halfH * (x + y);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
      }
    }
    const ui = ax().ui.getState();
    const W = ui.rendererSize.width;
    const H = ui.rendererSize.height;
    const pad = UN * 2; // room for node/label footprint beyond tile centers
    const zoom =
      Math.min(W / (maxX - minX + pad), H / (maxY - minY + pad)) * 0.95;
    const cxc = (minX + maxX) / 2;
    const cyc = (minY + maxY) / 2;
    const acts = ax().ui.getState().actions;
    acts.setZoom(zoom);
    acts.setScroll({
      position: { x: -cxc * zoom, y: -cyc * zoom },
      offset: { x: 0, y: 0 }
    });
  }

  // Mirrors CanvasPOM.tileToScreen + adds the interactions-box client offset.
  function tileToClient(tile: { x: number; y: number }) {
    const ui = ax().ui.getState();
    const el = document.querySelector(
      '[data-axoview-id="canvas-interactions"]'
    ) as HTMLElement;
    const rect = el.getBoundingClientRect();
    const canvasMode = ui.canvasMode ?? 'ISOMETRIC';
    const rendererSize = ui.rendererSize;
    const zoom = ui.zoom;
    const scroll = ui.scroll;
    const UNPROJECTED = 100;
    const halfW =
      canvasMode === 'ISOMETRIC' ? (UNPROJECTED * 1.415) / 2 : UNPROJECTED / 2;
    const halfH =
      canvasMode === 'ISOMETRIC' ? (UNPROJECTED * 0.819) / 2 : UNPROJECTED / 2;
    let cx: number;
    let cy: number;
    if (canvasMode === 'ISOMETRIC') {
      cx = halfW * tile.x - halfW * tile.y;
      cy = -(halfH * tile.x + halfH * tile.y);
    } else {
      cx = tile.x * UNPROJECTED;
      cy = -tile.y * UNPROJECTED;
    }
    const sx = rendererSize.width / 2 + scroll.position.x + cx * zoom;
    const sy = rendererSize.height / 2 + scroll.position.y + cy * zoom;
    return { x: rect.left + sx, y: rect.top + sy };
  }

  // Robust grab point: the node's ACTUAL rendered screen position, read from the
  // DOM, not re-projected from tile coords. The harness's forward tileToClient and
  // the lib's inverse screen→tile round differently at the extreme fit-zoom used
  // for large N, so a tile-projected pointer could land on the wrong/empty tile and
  // the grab silently failed to engage (decision-log Harness-v2 drag caveat). The
  // visible icon <img> sits over its node's tile, so its centre always hit-tests to
  // that node. Returns null if the node isn't in the DOM / has no laid-out box.
  function nodeClientCenter(id: string): { x: number; y: number } | null {
    const shell = document.querySelector(`[data-drag-id="${id}"]`);
    if (!shell) return null;
    const target = (shell.querySelector('img') as HTMLElement | null) ?? shell;
    const r = target.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dispatchPointer(
    el: HTMLElement,
    type: string,
    x: number,
    y: number,
    buttons: number
  ) {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })
    );
  }

  function observeLongTasks(sink: Array<{ start: number; duration: number }>) {
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          sink.push({ start: e.startTime, duration: e.duration });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask unsupported — frames still captured */
    }
    return () => po && po.disconnect();
  }

  function forceGc() {
    if (typeof w.gc === 'function') {
      try {
        w.gc();
        w.gc();
      } catch {
        /* ignore */
      }
    }
  }

  // Drive the page to a clean idle floor: force GC, then wait until K
  // consecutive sub-budget frames are observed (or a hard cap). Removes
  // inter-run carryover + GC-pause variance before each measurement.
  const IDLE_BUDGET_MS = 20;
  const IDLE_STREAK = 5;
  async function quiesce(maxMs = 2500) {
    forceGc();
    let streak = 0;
    let prev = await raf();
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      const now = await raf();
      const d = now - prev;
      prev = now;
      if (d < IDLE_BUDGET_MS) {
        if (++streak >= IDLE_STREAK) return;
      } else {
        streak = 0;
      }
    }
  }

  // Capture frames from now until the scene settles (K consecutive sub-budget
  // frames) or a hard cap — deterministic, free of variable idle-tail length.
  async function captureUntilSettled(
    frames: number[],
    capMs: number
  ): Promise<void> {
    let streak = 0;
    let prev = await raf();
    const t0 = performance.now();
    while (performance.now() - t0 < capMs) {
      const now = await raf();
      const d = now - prev;
      prev = now;
      frames.push(d);
      if (d < IDLE_BUDGET_MS) {
        if (++streak >= IDLE_STREAK) return;
      } else {
        streak = 0;
      }
    }
  }

  async function measureSpawn(N: number, capMs: number) {
    resetState();
    const scene = buildScene(N, 1);
    fitForGrid(1, N); // make all N nodes visible so the engine renders them all
    await quiesce();
    const { view } = activeView();
    const newViews = viewsWith(
      view.id,
      scene.vitems,
      scene.connectors,
      scene.rectangles,
      scene.textBoxes,
      scene.labels
    );
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    // Commit the whole scene in one store write — models a bulk paste/import/
    // diagram-open. The first captured frame straddles the commit, so its delta
    // IS the freeze. commitMs times the synchronous portion of the write (React
    // renders external-store updates synchronously to avoid tearing) — a
    // sub-vsync, continuous measure, unlike frame-delta-based settle.
    const tc = performance.now();
    ax()
      .model.getState()
      .actions.set({ items: scene.items, views: newViews }, false);
    // D4-1: route connectors (synchronous SYNC_SCENE — the diagram-open path) so
    // the spawn measurement includes connector paint. A bare model.set leaves
    // scene.connectors empty, so every <Connector> early-returns null and paints
    // nothing (Iter-7's "connectors cost 0ms" measured zero painting, not free
    // painting). Folded into commitMs since it is part of the open/paste cost.
    ax().changeView(view.id, ax().model.getState());
    const commitMs = performance.now() - tc;
    await captureUntilSettled(frames, capMs);
    stop();
    // Anti-cheat (ADR 0019): the canvas node layer publishes its per-frame draw
    // count on `data-draw-count`. With fit-to-view this must equal N — proving the
    // benchmark paints every node the engine committed (no accidental off-screen
    // cull shrinking the scene). Falls back to the legacy DOM-shell count
    // (`[data-drag-id]`) for any non-canvas path. sceneCounts records the full
    // multi-element composition that was committed.
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    // R3/GPU-13: `data-draw-count` is a TOTAL over every bulk entity type on the
    // merged canvas, so the node anti-cheat reads `data-nodes-drawn` — the
    // honesty channel ADR 0020's addendum names.
    const renderedNodes = canvasEl
      ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0
      : document.querySelectorAll('[data-drag-id]').length;
    // Connector-paint anti-cheat (D4-1, mirrors the node draw-count): every
    // committed connector must paint. Bulk connector bodies draw on the merged
    // canvas (`data-connectors-drawn` — its own channel, since `data-draw-count`
    // is now the total over every type), while the sparse DOM hybrid (degenerate
    // / unroutable) still emits its testids. The two sets are disjoint (Renderer
    // partitions by connectorHybridIds), so GPU-drawn + DOM-painted == committed.
    const gpuPaintedConn = canvasEl
      ? parseInt(canvasEl.dataset.connectorsDrawn ?? '0', 10) || 0
      : 0;
    const domPaintedConn = document.querySelectorAll(
      '[data-testid="connector-path"], [data-testid="connector-unroutable"]'
    ).length;
    const paintedConnectors = gpuPaintedConn + domPaintedConn;
    return {
      frames,
      longTasks,
      commitMs,
      renderedNodes,
      paintedConnectors,
      sceneCounts: {
        nodes: scene.items.length,
        connectors: scene.connectors.length,
        rectangles: scene.rectangles.length,
        textBoxes: scene.textBoxes.length
      }
    };
  }

  async function measureDrag(N: number, steps: number) {
    resetState();
    // Realistic drag: the full scene (N nodes + connectors + rectangles + text
    // boxes) is rendered, and we drag an in-grid, CONNECTED node horizontally
    // across OCCUPIED tiles. So each rAF frame pays a collision check against
    // occupied tiles + a re-route of the dragged node's connector + the static
    // render of the rest. (The old harness dragged one unconnected node through
    // an empty lane — it under-measured the real drag path.)
    const scene = buildScene(N, 1);
    fitForGrid(1, N);
    await quiesce();
    const { view } = activeView();
    ax()
      .model.getState()
      .actions.set(
        {
          items: scene.items,
          views: viewsWith(
            view.id,
            scene.vitems,
            scene.connectors,
            scene.rectangles,
            scene.textBoxes
          )
        },
        true
      );
    ax().model.getState().actions.clearHistory();
    await quiesce();

    const el = document.querySelector(
      '[data-axoview-id="canvas-interactions"]'
    ) as HTMLElement;
    const side = Math.ceil(Math.sqrt(N));
    // Drag a node near the GRID CENTRE (not the top-left corner, which can sit at
    // or past the viewport edge at the extreme fit-zoom used for large N — the old
    // perf-0 grab). A centre node is guaranteed on-screen and fully surrounded by
    // occupied tiles, so dragging it rightwards through its row-mates exercises the
    // realistic path: per-frame collision checks + connector re-route + scene
    // render. Indices are row-major (index = row*side + col).
    const centerCol = Math.floor(side / 2);
    const centerRow = Math.floor(side / 2);
    let dragIndex = centerRow * side + centerCol;
    if (dragIndex >= N) dragIndex = Math.floor(N / 2); // tiny-N safety
    const dragCol = dragIndex % side;
    // Move right within the same row, staying on occupied tiles.
    const span = Math.min(6, Math.max(1, side - 1 - dragCol));
    const targetIndex = dragIndex + span;
    const dragId = 'perf-' + dragIndex;
    const targetId = 'perf-' + targetIndex;

    // Engagement points from the ACTUAL rendered nodes (DOM rect), with a
    // tileToClient fallback for safety. See nodeClientCenter.
    const start =
      nodeClientCenter(dragId) ?? tileToClient(scene.vitems[dragIndex].tile);
    let end =
      (targetIndex < N ? nodeClientCenter(targetId) : null) ??
      tileToClient({
        x: scene.vitems[dragIndex].tile.x + span,
        y: scene.vitems[dragIndex].tile.y
      });
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    const MIN_DRAG_PX = 150; // ≫ TAP_SLOP_PX (8) so the drag engages quickly
    if (dist < MIN_DRAG_PX) {
      const s = MIN_DRAG_PX / (dist || 1);
      end = { x: start.x + dx * s, y: start.y + dy * s };
    }

    // Engage the drag: land pointer on the node, then press. Await rAF between so
    // the lib's rAF-throttled mouse snapshot flushes (CanvasPOM note).
    dispatchPointer(el, 'pointermove', start.x, start.y, 0);
    await raf();
    dispatchPointer(el, 'pointerdown', start.x, start.y, 1);
    await raf();

    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    // Render-fan-out probe (only when booted with ?perfprobe=1). Reset right
    // before the measured loop so the counts isolate the DRAG, not the mount.
    const probe = w.__axoviewRenderProbe;
    probe?.reset?.();
    // Diagnostic: does modelStore.views (the root of currentView.connectors)
    // churn references during a CSS-preview drag? It should NOT (no model write).
    let viewsRef = ax().model.getState().views;
    let viewsChanges = 0;
    let prev = await raf();
    let dragEngaged = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dispatchPointer(
        el,
        'pointermove',
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t,
        1
      );
      const now = await raf();
      frames.push(now - prev);
      prev = now;
      // Anti-cheat: confirm the press+move actually entered DRAG_ITEMS. A failed
      // grab leaves the mode in CURSOR and the "drag" measures idle frames — that
      // cell must be flagged, not silently reported as fast.
      if (!dragEngaged) {
        dragEngaged = ax().ui.getState().mode.type === 'DRAG_ITEMS';
      }
      const nowViews = ax().model.getState().views;
      if (nowViews !== viewsRef) {
        viewsChanges++;
        viewsRef = nowViews;
      }
    }
    dispatchPointer(el, 'pointerup', end.x, end.y, 0);
    await raf();
    stop();
    const renderCounts = probe?.get?.();
    (renderCounts as Record<string, number> | undefined) &&
      (renderCounts!['__viewsChanges'] = viewsChanges);
    return { frames, longTasks, dragEngaged, renderCounts };
  }

  // Dispatch a Ctrl+<key> keydown that the app's window-level keydown handler
  // (useInteractionManager) routes to copy/paste. Dispatched on document.body so
  // e.target is a non-editable element (the handler early-returns on editable
  // targets) and bubbles up to the window listener.
  function dispatchCtrlKey(key: string) {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );
  }

  // Paste-on-top: build N source nodes, select-all + copy, position the cursor on
  // the selection CENTROID (so handlePaste's offset = mouseTile − centroid ≈ 0 —
  // the pasted block lands directly on top of the source), then Ctrl+V and
  // measure the settle. This drives the REAL paste path end to end —
  // useCopyPaste.handlePaste → findNearestUnoccupiedTilesForGroup (rigid-stamp
  // collision resolution, since every target tile is occupied) → pasteItems
  // (the batched O(N) store write) → canvas redraw of the 2N nodes. The pre-fix
  // pasteItems was O(N^3) here and froze the main thread; the headline is the
  // longest frame / settle time, the user-perceived freeze.
  async function measurePaste(N: number, capMs: number) {
    resetState();
    // Node-only source (the reported scenario is "paste of N nodes"); reuse
    // buildScene for consistent icon/label stylisation but commit items+vitems
    // only (no connectors/rectangles), so the copy set is exactly N nodes.
    const scene = buildScene(N, 1);
    fitForGrid(1, N);
    const { view } = activeView();
    ax()
      .model.getState()
      .actions.set(
        { items: scene.items, views: viewsWith(view.id, scene.vitems) },
        true
      );
    ax().model.getState().actions.clearHistory();
    await quiesce();

    // Centroid of the source tiles — mirrors handleCopy's rounded average, so a
    // cursor placed here yields a ~zero paste offset (directly on top).
    let sx = 0;
    let sy = 0;
    for (const v of scene.vitems) {
      sx += v.tile.x;
      sy += v.tile.y;
    }
    const centroid = {
      x: Math.round(sx / scene.vitems.length),
      y: Math.round(sy / scene.vitems.length)
    };

    // Select all N as a LASSO selection so handleCopy gathers them (its
    // resolveSelectionIds reads LASSO mode.selection.items). Deterministic — we
    // don't depend on Ctrl+A's select-all heuristic.
    const itemRefs = scene.vitems.map((v: any) => ({ type: 'ITEM', id: v.id }));
    ax()
      .ui.getState()
      .actions.setMode({
        type: 'LASSO',
        showCursor: true,
        isDragging: false,
        selection: {
          startTile: { x: -100000, y: -100000 },
          endTile: { x: 100000, y: 100000 },
          items: itemRefs
        }
      });
    await raf();

    // Copy into the in-app clipboard.
    dispatchCtrlKey('c');
    await raf();

    // Move the cursor onto the centroid tile so the paste lands on top. The
    // mouse snapshot is rAF-throttled, so await a frame for it to flush.
    const el = document.querySelector(
      '[data-axoview-id="canvas-interactions"]'
    ) as HTMLElement;
    const c = tileToClient(centroid);
    dispatchPointer(el, 'pointermove', c.x, c.y, 0);
    await raf();
    await raf();
    await quiesce(); // clean idle floor right before the measured paste

    const before = ax().model.getState().items.length;
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    // handlePaste wraps the store write in startTransition, so the work lands in
    // the frames captured below rather than synchronously under this dispatch.
    dispatchCtrlKey('v');
    await captureUntilSettled(frames, capMs);
    stop();

    const after = ax().model.getState().items.length;
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    const renderedNodes = canvasEl
      ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0
      : 0;
    return {
      frames,
      longTasks,
      pastedCount: after - before, // anti-cheat: must equal N
      totalNodes: after, // must equal 2N
      renderedNodes
    };
  }

  function heapMB(): number {
    const mem = (performance as any).memory;
    return mem ? mem.usedJSHeapSize / 1048576 : -1;
  }

  // Idle-churn guardrail (charter KR3): with the canvas empty, watch the heap
  // and long tasks over a window. GC at the start fixes a clean baseline; we do
  // NOT force GC during the window (we want to see natural growth); a final GC
  // separates a real leak (retained) from transient garbage (collectable).
  async function measureIdle(durationMs: number) {
    resetState();
    await quiesce();
    forceGc();
    await raf();
    const heapStart = heapMB();
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    let prev = await raf();
    let heapPeak = heapStart;
    const t0 = performance.now();
    while (performance.now() - t0 < durationMs) {
      const now = await raf();
      frames.push(now - prev);
      prev = now;
      const h = heapMB();
      if (h > heapPeak) heapPeak = h;
    }
    stop();
    const heapBeforeGc = heapMB();
    forceGc();
    await raf();
    await raf();
    const heapAfterGc = heapMB();
    return {
      frames,
      longTasks,
      heapStart,
      heapPeak,
      heapBeforeGc,
      heapAfterGc,
      durationMs
    };
  }

  // Machine-speed calibration: a fixed, deterministic CPU-bound workload whose
  // median ms indexes the current machine state, so cross-RUN drift is visible.
  // (Cross-session drift was measured at ~22% — far larger than the ~2% within-run
  // noise; see decision-log "cross-session drift defect". Keep/revert decisions
  // must be same-session A/B; this index flags when two runs' machine states
  // differ enough that their absolute numbers are not directly comparable.)
  function calibrate(reps: number) {
    const times: number[] = [];
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      let acc = 0;
      let s = '';
      for (let i = 1; i < 400000; i++) {
        acc += Math.sqrt(i) * 1.0000001 + (acc % 7);
        if ((i & 2047) === 0) s += (acc | 0).toString(36);
      }
      if (s.length === -1) (w as any).__never = s; // defeat dead-code elimination
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  // ---- Track P: T6 label-drag per-frame cost (ADR 0024) ----
  // Dragging a node's NAME label to reposition it writes the model EVERY
  // pointermove (updateViewItem {labelHeight}) inside one undo transaction — NOT
  // a CSS-preview-then-commit like the node/rectangle drag. So the canvas redraws
  // the visible nodes each frame. Drives the REAL NodeLabelHitLayer path (an
  // invisible [data-label-hit-id] div over each visible label, active only at
  // zoom ≥ 0.4) and measures the frame budget while `drawn` nodes are on canvas.
  // `moved` is the anti-cheat: the per-frame writes must actually change
  // labelHeight (real work, not idle frames).
  async function measureLabelDrag(N: number, steps: number) {
    resetState();
    const scene = buildScene(N, 1);
    const { view } = activeView();
    ax()
      .model.getState()
      .actions.set(
        {
          items: scene.items,
          views: viewsWith(
            view.id,
            scene.vitems,
            scene.connectors,
            scene.rectangles,
            []
          )
        },
        true
      );
    ax().model.getState().actions.clearHistory();
    // The hit layer only renders at zoom ≥ 0.4; fit-to-view for large N can fall
    // below that, so clamp to 0.45 and keep the grid centred — maximises the
    // visible (grabbable) labels while keeping the layer active.
    fitForGrid(1, N);
    const acts = ax().ui.getState().actions;
    if (ax().ui.getState().zoom < 0.45) acts.setZoom(0.45);
    await quiesce();
    const hits = Array.from(
      document.querySelectorAll('[data-label-hit-id]')
    ) as HTMLElement[];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const el of hits) {
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      const d = Math.hypot(
        r.left + r.width / 2 - cx,
        r.top + r.height / 2 - cy
      );
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    const drawn = canvasEl
      ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0
      : 0;
    if (!best) {
      return {
        frames: [] as number[],
        longTasks: [] as Array<{ start: number; duration: number }>,
        drawn,
        hitDivs: hits.length,
        engaged: false,
        moved: false
      };
    }
    const hitId = best.getAttribute('data-label-hit-id');
    const labelHeightOf = (): number => {
      const v = ax()
        .model.getState()
        .views.find((vv: any) => vv.id === view.id);
      const it = v && v.items.find((x: any) => x.id === hitId);
      return it ? (it.labelHeight ?? 0) : 0;
    };
    const r0 = best.getBoundingClientRect();
    const sx = r0.left + r0.width / 2;
    const sy = r0.top + r0.height / 2;
    const beforeH = labelHeightOf();
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    best.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: sx,
        clientY: sy,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })
    );
    await raf();
    let prev = await raf();
    for (let s = 1; s <= steps; s++) {
      // Oscillate the label up/down so labelHeight genuinely changes each frame.
      const dy = Math.sin((s / steps) * Math.PI * 2) * 120;
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: sx,
          clientY: sy + dy,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        })
      );
      const now = await raf();
      frames.push(now - prev);
      prev = now;
    }
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: sx,
        clientY: sy,
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })
    );
    await raf();
    stop();
    const afterH = labelHeightOf();
    ax().model.getState().actions.clearHistory();
    return {
      frames,
      longTasks,
      drawn,
      hitDivs: hits.length,
      engaged: true,
      moved: afterH !== beforeH
    };
  }

  // ---- Track P: HTML/DOM-bloat stress (user request) ----
  // The worst-case "huge diagram": every node carries the full content payload
  // (rich/formatted description + notes + header link + link), isometric icons
  // drawn from several packs, ~N labelled connectors, grouping rectangles, and
  // multiple layers. The node layer is Canvas2D (ADR 0019) so nodes emit ZERO
  // per-node DOM — this measures whether the DOM stays bounded at scale, what
  // still emits HTML (connectors / connector labels / rects / label-hit divs),
  // heap per entity (guardrail < 5 KB), and the canvas cost of rich content.
  async function measureBloat(N: number, capMs: number) {
    const PACKS = ['aws', 'gcp', 'azure'];
    const bloatIcons: any[] = [];
    for (let p = 0; p < PACKS.length; p++) {
      for (let kk = 0; kk < 3; kk++) {
        bloatIcons.push({
          id: `bloat-${PACKS[p]}-${kk}`,
          name: `${PACKS[p]}-${kk}`,
          url: makeIconUrl(100 + p * 10 + kk),
          collection: PACKS[p],
          isIsometric: true
        });
      }
    }
    const LAYER_COUNT = 8;
    const layers = Array.from({ length: LAYER_COUNT }, (_, i) => ({
      id: `layer-${i}`,
      name: `Layer ${i}`,
      visible: true,
      locked: false,
      order: i
    }));
    resetState();
    const { view } = activeView();
    const side = Math.ceil(Math.sqrt(N));
    const items: any[] = [];
    const vitems: any[] = [];
    const connectors: any[] = [];
    const rich = (i: number) =>
      `<p><strong>${NODE_NAMES[i % NODE_NAMES.length]} ${i}</strong> routes ` +
      `traffic.</p><ul><li>ingress</li><li>egress</li></ul>` +
      `<p>SLA <em>99.9%</em>, owner team-${i % 12}.</p>`;
    for (let i = 0; i < N; i++) {
      const id = 'bloat-' + i;
      const col = i % side;
      const row = Math.floor(i / side);
      items.push({
        id,
        name: NODE_NAMES[i % NODE_NAMES.length] + ' ' + i,
        description: rich(i),
        notes:
          'Runbook ' + i + ': restart, then page on-call. ' + 'x'.repeat(40),
        headerLink: 'https://example.com/docs/service-' + i,
        link: 'svc-' + i,
        icon: bloatIcons[i % bloatIcons.length].id
      });
      vitems.push({
        id,
        tile: { x: 1 + col, y: row },
        labelColor: LABEL_COLORS[i % LABEL_COLORS.length],
        layerId: layers[i % LAYER_COUNT].id
      });
      if (col < side - 1 && i + 1 < N) {
        connectors.push({
          id: 'bc-' + i,
          color: PERF_COLORS[i % PERF_COLORS.length].id,
          width: 10,
          style: 'SOLID',
          anchors: [
            { id: 'ba' + i + 's', ref: { item: id } },
            { id: 'ba' + i + 'e', ref: { item: 'bloat-' + (i + 1) } }
          ],
          labels: [
            { id: 'bcl' + i, text: 'link ' + i, position: 50, fontSize: 12 }
          ]
        });
      }
    }
    const rectangles: any[] = [];
    let rk = 0;
    for (let by = 0; by < side; by += 5) {
      for (let bx = 0; bx < side; bx += 5) {
        rectangles.push({
          id: 'br-' + rk,
          color: PERF_COLORS[rk % PERF_COLORS.length].id,
          from: { x: 1 + bx, y: by },
          to: {
            x: 1 + Math.min(bx + 4, side - 1),
            y: Math.min(by + 4, side - 1)
          }
        });
        rk++;
      }
    }
    // Empty-canvas heap floor (post-GC) for the per-entity delta.
    forceGc();
    await raf();
    const heapEmpty = heapMB();
    fitForGrid(1, N);
    await quiesce();
    const newViews = ax()
      .model.getState()
      .views.map((v: any) =>
        v.id === view.id
          ? {
              ...v,
              items: vitems,
              connectors,
              rectangles,
              textBoxes: [],
              layers
            }
          : v
      );
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    const tc = performance.now();
    ax()
      .model.getState()
      .actions.set(
        { items, icons: bloatIcons, colors: PERF_COLORS, views: newViews },
        false
      );
    ax().changeView(view.id, ax().model.getState());
    const commitMs = performance.now() - tc;
    await captureUntilSettled(frames, capMs);
    stop();
    const q = (sel: string) => document.querySelectorAll(sel).length;
    const renderer =
      (document.querySelector(
        '[data-testid="axoview-canvas"]'
      ) as HTMLElement) || document.body;
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    // R3/GPU-13: the anti-cheat reads `data-nodes-drawn`, not
    // `data-draw-count`. On the merged canvas `data-draw-count` is a TOTAL over
    // every entity type and can no longer be compared against
    // N; `data-nodes-drawn` is the channel that keeps meaning "the canvas
    // painted every node" (ADR 0038 §8; ADR 0020 addendum 2026-08-02).
    const drawCount = canvasEl
      ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0
      : 0;
    const dom = {
      totalDoc: document.querySelectorAll('*').length,
      rendererSubtree: renderer.querySelectorAll('*').length,
      svg: q('svg'),
      connectorPaths: q(
        '[data-testid="connector-path"], [data-testid="connector-unroutable"]'
      ),
      labelHitDivs: q('[data-axoview-id="canvas-label-hit"]'),
      nodeShells: q('[data-drag-id]')
    };
    // Heap with the full scene resident (post-GC) → per-entity delta.
    forceGc();
    await raf();
    await raf();
    const heapFull = heapMB();
    const entityCount = items.length + connectors.length + rectangles.length;
    return {
      frames,
      longTasks,
      commitMs,
      drawCount,
      sceneCounts: {
        nodes: items.length,
        connectors: connectors.length,
        rectangles: rectangles.length,
        layers: layers.length
      },
      dom,
      heapEmptyMB: heapEmpty,
      heapFullMB: heapFull,
      entityCount,
      bytesPerEntityKB:
        entityCount > 0
          ? ((heapFull - heapEmpty) * 1048576) / entityCount / 1024
          : -1
    };
  }

  // ---- E-slice: sustained-pan repaint floor (measurePan, per pan-r1-design.md) ----
  // The R1 floor: SceneCanvas.drawNow() repaints the full O(visible) node set
  // SYNCHRONOUSLY on every scroll write (#54 lockstep). We drive that exact
  // store write once per rAF — the same setScroll the real right-drag pan
  // funnels through useRAFThrottle — and measure the per-frame repaint it
  // triggers. Driving setScroll directly (rather than synthesizing a
  // threshold-gated right-drag) keeps the measurement off the fragile gesture
  // wiring; the cost measured (drawNow's repaint) is identical because drawNow
  // subscribes to the scroll change, not to the pointer event. A bounded ±120px
  // oscillation keeps the visible set ≈ N (a true repaint, not a cull).
  // Anti-cheats: scroll changed each frame + draw-count stayed ≈ N.
  async function measurePan(N: number, steps: number) {
    resetState();
    const scene = buildScene(N, 1);
    fitForGrid(1, N);
    const { view } = activeView();
    ax()
      .model.getState()
      .actions.set(
        {
          items: scene.items,
          views: viewsWith(
            view.id,
            scene.vitems,
            scene.connectors,
            scene.rectangles,
            scene.textBoxes,
            scene.labels
          )
        },
        true
      );
    ax().model.getState().actions.clearHistory();
    ax().changeView(view.id, ax().model.getState());
    await quiesce();
    const uiActs = () => ax().ui.getState().actions;
    const base = ax().ui.getState().scroll;
    const baseX = base.position.x;
    const baseY = base.position.y;
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    const drawCountNow = () =>
      canvasEl ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0 : 0;
    const drawAtStart = drawCountNow();
    // "No per-frame CPU work" invariant: buildInstances (the only O(N) CPU on the
    // GPU bulk) must NOT run during a pan (scene unchanged) — so the build count
    // must stay FLAT. A non-zero delta means the canvas is rebuilding geometry
    // per frame (CPU work leaked into navigation). ADR 0038 §5's assertion,
    // extended to the merged canvas: four counters became one.
    const buildSum = () => {
      const el = document.querySelector(
        '[data-testid="axoview-scene-canvas"]'
      ) as HTMLElement | null;
      return el ? parseInt(el.dataset.buildCount ?? '0', 10) || 0 : 0;
    };
    const buildStart = buildSum();
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    let scrollMoved = false;
    let drawMin = Infinity;
    let drawMax = 0;
    let prev = await raf();
    for (let s = 1; s <= steps; s++) {
      const dx = Math.sin((s / steps) * Math.PI * 4) * 120;
      const dy = Math.cos((s / steps) * Math.PI * 4) * 120;
      uiActs().setScroll({
        position: { x: baseX + dx, y: baseY + dy },
        offset: { x: 0, y: 0 }
      });
      const now = await raf();
      frames.push(now - prev);
      prev = now;
      const sc = ax().ui.getState().scroll;
      if (sc.position.x !== baseX || sc.position.y !== baseY)
        scrollMoved = true;
      const dc = drawCountNow();
      if (dc < drawMin) drawMin = dc;
      if (dc > drawMax) drawMax = dc;
    }
    stop();
    uiActs().setScroll({
      position: { x: baseX, y: baseY },
      offset: { x: 0, y: 0 }
    });
    return {
      frames,
      longTasks,
      panEngaged: scrollMoved,
      drawAtStart,
      drawMin: drawMin === Infinity ? 0 : drawMin,
      drawMax,
      buildDelta: buildSum() - buildStart // 0 = no per-frame CPU rebuild
    };
  }

  // ---- E-slice: floating-label-heavy (Canvas2D Label layer; gates ADR 0031 E3) ----
  // N floating Labels (the first-class Label entity, ADR 0031) with B/I/S +
  // colour + background, over the realistic node/connector/rect base. Labels now
  // render on the Canvas2D SceneCanvas — the substrate ADR 0031 E3 chose after
  // the DOM chip layer ~2.3×'d spawn p95 — so this re-measures the floating-label
  // spawn/settle cost on the new substrate. Labels are MODEL-ONLY (no scene
  // size), so the old scene-size pre-seed hack is gone.
  // R3/GPU-13 §4 measurements 2 and 3 (2026-08-02). Uses the ALL-TYPES scene —
  // the representative "everything at once" load — and reports:
  //
  //   2. atlas occupancy for the node and label chip atlases, which is what
  //      decides whether ONE merged atlas fits at ADR 0038 §6's clamps;
  //   3. whether a pan rebuilds geometry (buildDelta must be 0), i.e. whether the
  //      existing scene-change trigger is still a single pass with no per-frame
  //      work (ADR 0038 §5).
  //
  // Diagnostic only: writes perf-results/atlas.md, never baseline.md.
  async function measureAtlas(N: number, capMs: number) {
    resetState();
    const w = window as any;
    const prevAllTypes = w.__perfAllTypes;
    w.__perfAllTypes = true;
    try {
      const scene = buildScene(N, 1);
      fitForGrid(1, N);
      await quiesce();
      const { view } = activeView();
      const newViews = viewsWith(
        view.id,
        scene.vitems,
        scene.connectors,
        scene.rectangles,
        scene.textBoxes,
        scene.labels
      );
      ax()
        .model.getState()
        .actions.set({ items: scene.items, views: newViews }, false);
      ax().changeView(view.id, ax().model.getState());
      await captureUntilSettled([], capMs);

      const read = (testid: string) => {
        const el = document.querySelector(
          `[data-testid="${testid}"]`
        ) as HTMLElement | null;
        if (!el) return null;
        const n = (k: string) => parseInt(el.dataset[k] ?? '0', 10) || 0;
        return {
          atlasSize: n('atlasSize'),
          usedRows: n('atlasUsedRows'),
          slots: n('atlasSlots'),
          atlasFull: el.dataset.atlasFull === 'true',
          atlasPages: n('atlasPages'),
          drawCalls: n('drawCalls'),
          buildCount: n('buildCount'),
          drawCount: n('drawCount'),
          nodesDrawn: n('nodesDrawn')
        };
      };

      const mergedBefore = read('axoview-scene-canvas');

      // Measurement 3: pan without touching the scene. Nothing may rebuild.
      const ui = ax().ui.getState();
      const start = ui.scroll.position;
      for (let i = 1; i <= 10; i++) {
        ax()
          .ui.getState()
          .actions.setScroll({
            position: { x: start.x - i * 12, y: start.y - i * 8 },
            offset: { x: 0, y: 0 }
          });
        await raf();
      }
      await raf();

      const mergedAfter = read('axoview-scene-canvas');

      const delta = (a: any, b: any) =>
        a && b ? b.buildCount - a.buildCount : -1;

      return {
        N,
        sceneCounts: {
          nodes: scene.vitems.length,
          connectors: scene.connectors.length,
          rectangles: scene.rectangles.length,
          labels: (scene.labels ?? []).length
        },
        atlases: { merged: mergedBefore },
        buildDeltaAcrossPan: { scene: delta(mergedBefore, mergedAfter) }
      };
    } finally {
      w.__perfAllTypes = prevAllTypes;
    }
  }

  async function measureFloatingLabelHeavy(N: number, capMs: number) {
    resetState();
    const scene = buildScene(N, 1);
    const side = Math.ceil(Math.sqrt(N));
    const labels: any[] = [];
    for (let i = 0; i < N; i++) {
      const col = i % side;
      const row = Math.floor(i / side);
      labels.push({
        id: 'flabel-' + i,
        tile: { x: 1 + col, y: row },
        text: 'Label ' + i,
        fontSize: 14 + (i % 4) * 2,
        color: LABEL_COLORS[1 + (i % (LABEL_COLORS.length - 1))],
        backgroundColor: PERF_COLORS[i % PERF_COLORS.length].value,
        isBold: i % 2 === 0,
        isItalic: i % 3 === 0,
        isStrikethrough: i % 5 === 0
      });
    }
    fitForGrid(1, N);
    await quiesce();
    const { view } = activeView();
    // Labels are MODEL-ONLY (ADR 0031) — no scene-size entry, so no pre-seed:
    // the SceneCanvas measures each chip itself, like node labels.
    const newViews = viewsWith(
      view.id,
      scene.vitems,
      scene.connectors,
      scene.rectangles,
      scene.textBoxes,
      labels
    );
    const frames: number[] = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const stop = observeLongTasks(longTasks);
    const tc = performance.now();
    ax()
      .model.getState()
      .actions.set({ items: scene.items, views: newViews }, false);
    ax().changeView(view.id, ax().model.getState());
    const commitMs = performance.now() - tc;
    await captureUntilSettled(frames, capMs);
    stop();
    const canvasEl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLElement | null;
    const renderedNodes = canvasEl
      ? parseInt(canvasEl.dataset.nodesDrawn ?? '0', 10) || 0
      : 0;
    // Floating Labels draw on the merged canvas, which publishes their own count
    // (`data-floating-labels-drawn`) beside the node one — `data-labels-drawn` is
    // the NODE-NAME chip count and always was. The DOM [data-drag-id] chips are
    // gone.
    const renderedLabels = canvasEl
      ? parseInt(canvasEl.dataset.floatingLabelsDrawn ?? '0', 10) || 0
      : 0;
    return {
      frames,
      longTasks,
      commitMs,
      renderedNodes,
      renderedLabels,
      sceneCounts: {
        nodes: scene.items.length,
        connectors: scene.connectors.length,
        rectangles: scene.rectangles.length,
        labels: labels.length
      }
    };
  }

  // Thin spawn-class wrappers: toggle a buildScene styling flag, then reuse the
  // measureSpawn path (commit + settle + the draw-count == N anti-cheat) so the
  // styled scene is measured identically to the bare-node baseline.
  async function withSceneFlag<T>(
    flag: string,
    fn: () => Promise<T>
  ): Promise<T> {
    w[flag] = true;
    try {
      return await fn();
    } finally {
      w[flag] = false;
    }
  }
  const measureLabelHeavy = (N: number, capMs: number) =>
    withSceneFlag('__perfLabelHeavy', () => measureSpawn(N, capMs));
  const measureConnLabelHeavy = (N: number, capMs: number) =>
    withSceneFlag('__perfConnLabelHeavy', () => measureSpawn(N, capMs));
  const measureBgHeavy = (N: number, capMs: number) =>
    withSceneFlag('__perfBgHeavy', () => measureSpawn(N, capMs));

  w.__perfH = {
    measureSpawn,
    measureDrag,
    measurePaste,
    measureIdle,
    measureLabelDrag,
    measureBloat,
    measureAtlas,
    measurePan,
    measureLabelHeavy,
    measureConnLabelHeavy,
    measureBgHeavy,
    measureFloatingLabelHeavy,
    resetState,
    calibrate
  };
}

// ---------------------------------------------------------------------------
// Boot the app to a blank diagram + debug bridge, then install the harness.
// ---------------------------------------------------------------------------
async function bootApp(page: Page) {
  const ONBOARDING: Array<[string, string]> = [
    ['axoview-lazy-loading-welcome-dismissed', 'true'],
    ['axoview-show-drag-hint', 'false'],
    // Perf-measurement mode (read pre-boot). Disables two pieces of dev-only
    // instrumentation that production never runs, so frame cost is
    // representative: (1) StrictMode's double-render (index.tsx); (2) the
    // always-on DiagnosticsOverlay 1 Hz rAF+setState loop (diagnosticsStore).
    ['axoview-perf-harness', '1']
  ];
  // The Canvas2D node layer (SceneCanvas) is the default + sole bulk renderer
  // (ADR 0019) — no flag to set. The harness measures it unconditionally; the
  // draw-count anti-cheat above asserts it painted every node.
  const CLEAR_KEYS = [
    'axoview-diagrams',
    'axoview-last-opened',
    'axoview-last-opened-data',
    'axoview-explorer-initialized',
    'axoview-explorer-open'
  ];
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* pre-navigation */
    }
  }, ONBOARDING);
  // ?perfprobe=1 enables useRenderProbe (window.__axoviewRenderProbe) so the drag
  // can report render fan-out. Off by default — the probe's per-render side-effect
  // would otherwise perturb the timing the baseline measures.
  await page.goto(process.env.PERF_RENDERPROBE ? '/app?perfprobe=1' : '/app');
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, CLEAR_KEYS);
  await page.reload();
  const createBtn = page.locator('[data-axoview-id="screen-empty-create"]');
  await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await createBtn.click();
  await page
    .locator('[data-testid="axoview-canvas"]')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as any).__axoview__?.model?.getState),
    undefined,
    { timeout: 15_000 }
  );
  await page.keyboard.press('Escape'); // dismiss hint tooltips
  await page.evaluate(installHarness);
  await page.evaluate((v: boolean) => {
    (window as any).__perfNoLabel = v;
  }, !!process.env.PERF_NOLABEL);
  await page.evaluate((v: boolean) => {
    (window as any).__perfNoConn = v;
  }, !!process.env.PERF_NOCONN);
  // Track P diagnostics (dormant when off — byte-identical default scene/measure):
  //  PERF_OFFSET — every node off-grid (offset + collides:false): the T8 all-offset
  //    hypothesis (one extra transform compose per node + an empty TileIndex).
  await page.evaluate((v: boolean) => {
    (window as any).__perfOffset = v;
  }, !!process.env.PERF_OFFSET);
  // ALL-TYPES stress (2026-07-08): every connector gets ≥3 styled labels, styled
  // rectangle borders, plus floating Labels — the "everything at once" scene for
  // the GPU-fold work. Off by default → existing scenarios stay byte-identical.
  await page.evaluate((v: boolean) => {
    (window as any).__perfAllTypes = v;
  }, !!process.env.PERF_ALLTYPES);

  // GPU-fidelity guard (2026-07-07): report the LIVE WebGL renderer so a silent
  // SwiftShader (software) fallback can never masquerade as a GPU measurement
  // again. Headless Chromium defaults to SwiftShader for WebGL2; perf.config.ts
  // forces ANGLE/D3D11 (real GPU) unless PERF_SWIFTSHADER=1. A software renderer
  // here means the WebGL frame numbers are fill-rate bound, not the real wall.
  const glRenderer = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl2') ||
        c.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) return 'no-webgl';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return String(
        dbg
          ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER)
      );
    } catch {
      return 'probe-failed';
    }
  });
  const software = /swiftshader|software|llvmpipe/i.test(glRenderer);
  console.log(
    `[perf] WebGL renderer: ${glRenderer} — ${
      software
        ? '⚠️ SOFTWARE (fill-rate bound, NOT representative)'
        : 'hardware GPU ✓'
    }`
  );
}

// ---------------------------------------------------------------------------
// The harness test.
// ---------------------------------------------------------------------------
test('engine perf baseline — bulk-spawn + drag across N', async ({ page }) => {
  requireACPower(); // ⛔ block measurement on battery (throttled → non-representative)
  await bootApp(page);
  const env = await page.evaluate(() => ({
    gc: typeof (window as any).gc === 'function',
    harness: localStorage.getItem('axoview-perf-harness')
  }));
  console.log(
    `[perf] window.gc available: ${env.gc} · perf-mode (no StrictMode, ` +
      `no diagnostics loop): ${env.harness === '1'}`
  );

  const runOnce = (
    scenario: 'spawn' | 'drag',
    N: number
  ): Promise<RunResult> =>
    scenario === 'spawn'
      ? page.evaluate(
          ([n, cap]) => (window as any).__perfH.measureSpawn(n, cap),
          [N, SPAWN_CAP_MS] as const
        )
      : page.evaluate(
          ([n, steps]) => (window as any).__perfH.measureDrag(n, steps),
          [N, DRAG_STEPS] as const
        );

  // Global V8 warm-up: tier up the shared render + drag hot paths once before
  // any measurement so per-cell warm-up can stay small. (Cheap mid-N cycles.)
  for (let i = 0; i < 3; i++) {
    await runOnce('spawn', 100);
    await runOnce('drag', 100);
  }

  // PROFILE mode: capture a CDP timeline trace around ONE spawn at PERF_PROFILE
  // and attribute the freeze across scripting/style/layout/paint. Skips the
  // baseline loop. Used to pick/verify the optimization target from a trace,
  // not a guess (charter LOOP step 7).
  if (process.env.PERF_PROFILE) {
    const N = parseInt(process.env.PERF_PROFILE, 10);
    const client = await page.context().newCDPSession(page);
    await client.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: {
        recordMode: 'recordAsMuchAsPossible',
        includedCategories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
          'v8',
          'v8.execute',
          'blink',
          'cc'
        ]
      }
    });
    const events: TraceEvent[] = [];
    client.on('Tracing.dataCollected', (e: any) => {
      if (e.value) events.push(...e.value);
    });
    await runOnce('spawn', N); // the traced spawn
    const done = new Promise<void>((res) =>
      client.once('Tracing.tracingComplete', () => res())
    );
    await client.send('Tracing.end');
    await done;

    const { rows, total } = attributeTrace(events);
    const top = rows.slice(0, 20);
    console.log(
      `[profile] spawn N=${N} — main-thread self-time by event (ms):`
    );
    for (const r of top)
      console.log(`    ${r.ms.toFixed(1).padStart(8)}  ${r.name}`);
    console.log(`    total accounted: ${total.toFixed(0)} ms`);

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const lines = [
      `# Spawn profile — N=${N}`,
      '',
      `_Generated ${new Date().toISOString()} · CDP timeline self-time on the renderer main thread (one spawn, post-warmup)._`,
      '',
      '| self-time (ms) | event |',
      '|---|---|',
      ...top.map((r) => `| ${r.ms.toFixed(1)} | ${r.name} |`),
      '',
      `Total accounted: **${total.toFixed(0)} ms**.`,
      ''
    ];
    fs.writeFileSync(
      path.join(RESULTS_DIR, `profile-spawn-${N}.md`),
      lines.join('\n')
    );
    expect(events.length).toBeGreaterThan(0);
    return;
  }

  // CPU-PROFILE mode: sampled JS profile around ONE spawn, aggregated to
  // self-time by function — pinpoints the hottest JS (which the timeline trace
  // lumps into one "FunctionCall" bucket). Skips the baseline loop.
  if (process.env.PERF_CPUPROFILE) {
    const N = parseInt(process.env.PERF_CPUPROFILE, 10);
    const client = await page.context().newCDPSession(page);
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 100 });
    await client.send('Profiler.start');
    await runOnce('spawn', N);
    const { profile } = (await client.send('Profiler.stop')) as any;
    // Aggregate self-time: each sample attributes its timeDelta to that node.
    const nodeById = new Map<number, any>();
    for (const n of profile.nodes) nodeById.set(n.id, n);
    const selfUsById = new Map<number, number>();
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i];
      const dt = profile.timeDeltas[i] ?? 0;
      selfUsById.set(id, (selfUsById.get(id) ?? 0) + dt);
    }
    const byFn = new Map<string, number>();
    for (const [id, us] of selfUsById) {
      const cf = nodeById.get(id)?.callFrame;
      if (!cf) continue;
      const fn = cf.functionName || '(anonymous)';
      const url = (cf.url || '').split(/[\\/]/).pop() || '';
      const key = url ? `${fn} @ ${url}:${cf.lineNumber}` : fn;
      byFn.set(key, (byFn.get(key) ?? 0) + us);
    }
    const rows = [...byFn.entries()]
      .map(([key, us]) => ({ key, ms: us / 1000 }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 30);
    console.log(`[cpuprofile] spawn N=${N} — JS self-time by function (ms):`);
    for (const r of rows.slice(0, 25))
      console.log(`    ${r.ms.toFixed(1).padStart(8)}  ${r.key}`);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESULTS_DIR, `cpuprofile-spawn-${N}.md`),
      [
        `# Spawn CPU profile — N=${N}`,
        '',
        `_Generated ${new Date().toISOString()} · sampled JS self-time, one spawn, post-warmup._`,
        '',
        '| self-time (ms) | function |',
        '|---|---|',
        ...rows.map(
          (r) =>
            `| ${r.ms.toFixed(1)} | ${r.key.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} |`
        ),
        ''
      ].join('\n')
    );
    expect(profile.samples.length).toBeGreaterThan(0);
    return;
  }

  // DRAG-PROFILE mode: attribute ONE collision-drag across the renderer main
  // thread (timeline self-time: scripting vs style/layout vs paint) AND by JS
  // function (CPU sampler) — to split the per-frame drag cost into collision
  // check / connector re-route / React render / layout / paint. Skips the
  // baseline loop. PERF_DRAGPROFILE=N.
  if (process.env.PERF_DRAGPROFILE) {
    const N = parseInt(process.env.PERF_DRAGPROFILE, 10);
    const client = await page.context().newCDPSession(page);
    // Timeline trace for the scripting/style/layout/paint split.
    await client.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: {
        recordMode: 'recordAsMuchAsPossible',
        includedCategories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
          'v8',
          'v8.execute',
          'blink',
          'cc'
        ]
      }
    });
    const events: TraceEvent[] = [];
    client.on('Tracing.dataCollected', (e: any) => {
      if (e.value) events.push(...e.value);
    });
    // CPU sampler for the JS-function breakdown, concurrently.
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 80 });
    await client.send('Profiler.start');
    await runOnce('drag', N); // the profiled collision-drag
    const { profile } = (await client.send('Profiler.stop')) as any;
    const traceDone = new Promise<void>((res) =>
      client.once('Tracing.tracingComplete', () => res())
    );
    await client.send('Tracing.end');
    await traceDone;

    const { rows: tlRows, total: tlTotal } = attributeTrace(events);
    const tlTop = tlRows.slice(0, 18);
    console.log(
      `[dragprofile] drag N=${N} — main-thread self-time by event (ms):`
    );
    for (const r of tlTop)
      console.log(`    ${r.ms.toFixed(1).padStart(8)}  ${r.name}`);
    console.log(`    timeline total accounted: ${tlTotal.toFixed(0)} ms`);

    const nodeById = new Map<number, any>();
    for (const n of profile.nodes) nodeById.set(n.id, n);
    const selfUsById = new Map<number, number>();
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i];
      selfUsById.set(
        id,
        (selfUsById.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)
      );
    }
    const byFn = new Map<string, number>();
    for (const [id, us] of selfUsById) {
      const cf = nodeById.get(id)?.callFrame;
      if (!cf) continue;
      const fn = cf.functionName || '(anonymous)';
      const url = (cf.url || '').split(/[\\/]/).pop() || '';
      const key = url ? `${fn} @ ${url}:${cf.lineNumber}` : fn;
      byFn.set(key, (byFn.get(key) ?? 0) + us);
    }
    const jsRows = [...byFn.entries()]
      .map(([key, us]) => ({ key, ms: us / 1000 }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 30);
    console.log(`[dragprofile] drag N=${N} — JS self-time by function (ms):`);
    for (const r of jsRows.slice(0, 20))
      console.log(`    ${r.ms.toFixed(1).padStart(8)}  ${r.key}`);

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESULTS_DIR, `dragprofile-${N}.md`),
      [
        `# Collision-drag profile — N=${N}`,
        '',
        `_Generated ${new Date().toISOString()} · one ${DRAG_STEPS}-step collision-drag, post-warmup. Timeline self-time (renderer main) + JS self-time by function._`,
        '',
        '## Timeline (scripting / style / layout / paint)',
        '',
        '| self-time (ms) | event |',
        '|---|---|',
        ...tlTop.map((r) => `| ${r.ms.toFixed(1)} | ${r.name} |`),
        '',
        `Total accounted: **${tlTotal.toFixed(0)} ms** over ${DRAG_STEPS} frames.`,
        '',
        '## JS self-time by function',
        '',
        '| self-time (ms) | function |',
        '|---|---|',
        ...jsRows.map(
          (r) =>
            `| ${r.ms.toFixed(1)} | ${r.key.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} |`
        ),
        ''
      ].join('\n')
    );
    expect(profile.samples.length).toBeGreaterThan(0);
    return;
  }

  // RENDER-PROBE mode: count React renders during ONE collision-drag (booted with
  // ?perfprobe=1 so useRenderProbe is live). Answers: does the per-frame connector
  // preview leak into NodeContent, and for how many nodes? PERF_RENDERPROBE=N.
  if (process.env.PERF_RENDERPROBE) {
    const N = parseInt(process.env.PERF_RENDERPROBE, 10);
    for (let i = 0; i < WARMUP_RUNS; i++) await runOnce('drag', N); // warm the path
    const res = (await runOnce('drag', N)) as RunResult;
    const counts = res.renderCounts ?? {};
    const byComponent = new Map<string, { total: number; instances: number }>();
    for (const [key, n] of Object.entries(counts)) {
      const comp = key.split(':')[0];
      const agg = byComponent.get(comp) ?? { total: 0, instances: 0 };
      agg.total += n;
      agg.instances += 1;
      byComponent.set(comp, agg);
    }
    const frameCount = res.frames.length;
    console.log(
      `[renderprobe] drag N=${N} — ${frameCount} drag frames, engaged=${res.dragEngaged}`
    );
    if (Object.keys(counts).length === 0) {
      console.log('    (no counts — probe not enabled? expected ?perfprobe=1)');
    }
    const rows = [...byComponent.entries()].sort(
      (a, b) => b[1].total - a[1].total
    );
    for (const [comp, agg] of rows) {
      console.log(
        `    ${comp.padEnd(18)} total renders=${agg.total}  distinct instances=${agg.instances}  ` +
          `≈${(agg.total / Math.max(1, agg.instances)).toFixed(1)}/instance  ` +
          `≈${(agg.total / Math.max(1, frameCount)).toFixed(1)}/frame`
      );
    }
    expect(frameCount).toBeGreaterThan(0);
    return;
  }

  const covPct = (xs: number[]) => round(cov(xs) * 100, 1);

  // Machine-speed calibration (drift detector — decision-log "cross-session
  // drift defect"). A fixed CPU workload; its ms indexes machine state so two
  // runs' absolute numbers can be sanity-checked for comparability.
  const calibrationMs: number = await page.evaluate(() =>
    (window as any).__perfH.calibrate(7)
  );
  console.log(
    `[perf] machine calibration index = ${round(calibrationMs, 1)} ms ` +
      '(fixed CPU workload; compare across runs to gauge drift — keep/revert ' +
      'decisions must be same-session A/B, not vs a prior-session baseline)'
  );

  // LABEL-DRAG mode (Track P, T6): measure the per-frame frame budget of a name-
  // label reposition drag — the path that writes the model every pointermove.
  // Headline = mean frame time (like the node drag), so a regression vs the
  // 16.6 ms budget is visible. Skips the baseline loop (baseline.md untouched).
  if (process.env.PERF_LABELDRAG) {
    const N = parseInt(process.env.PERF_LABELDRAG, 10);
    const runLD = (): Promise<any> =>
      page.evaluate(
        ([n, s]) => (window as any).__perfH.measureLabelDrag(n, s),
        [N, DRAG_STEPS] as const
      );
    for (let i = 0; i < WARMUP_RUNS; i++) await runLD();
    const reps: any[] = [];
    for (let r = 0; r < REPEATS; r++) reps.push(await runLD());
    const m = reps.map((r) => metricsOf(r as RunResult));
    const meanFrames = m.map((x) => x.meanFrame);
    const p95s = m.map((x) => x.p95);
    const maxs = m.map((x) => x.max);
    console.log(
      `[labeldrag] N=${N} cal=${round(calibrationMs, 1)} drawn(visible)=${reps[0].drawn} ` +
        `hitDivs=${reps[0].hitDivs} engaged=${reps.every((r) => r.engaged)} ` +
        `moved=${reps.every((r) => r.moved)}`
    );
    console.log(
      `[labeldrag] mean frame=${round(median(meanFrames))}ms p95=${round(median(p95s))}ms ` +
        `max=${round(median(maxs))}ms noise(CoV mean)=${covPct(meanFrames)}%`
    );
    console.log(
      `        meanFrames[]=${meanFrames.map((x) => round(x, 1)).join(',')}`
    );
    expect(
      reps.every((r) => r.engaged && r.moved),
      'label drag engaged + actually moved the label every run'
    ).toBe(true);
    return;
  }

  // BLOAT mode (Track P, user request): a maximally-loaded N-element diagram
  // (rich content per node + multi-pack iso icons + labelled connectors + rects +
  // layers). Reports the canvas spawn cost, the DOM census (what still emits HTML
  // with the canvas node layer), and heap-per-entity. Skips the baseline loop.
  if (process.env.PERF_BLOAT) {
    const N = parseInt(process.env.PERF_BLOAT, 10);
    const runBloat = (): Promise<any> =>
      page.evaluate(([n, c]) => (window as any).__perfH.measureBloat(n, c), [
        N,
        SPAWN_CAP_MS
      ] as const);
    for (let i = 0; i < WARMUP_RUNS; i++) await runBloat();
    const reps: any[] = [];
    for (let r = 0; r < REPEATS; r++) reps.push(await runBloat());
    const m = reps.map((r) => metricsOf(r as RunResult));
    const settles = m.map((x) => x.settle);
    const maxs = m.map((x) => x.max);
    const last = reps[reps.length - 1];
    const bpe = round(median(reps.map((r) => r.bytesPerEntityKB)), 2);
    console.log(
      `[bloat] N=${N} cal=${round(calibrationMs, 1)} drawn=${last.drawCount}/${N} ` +
        `scene=${JSON.stringify(last.sceneCounts)} commit=${round(median(reps.map((r) => r.commitMs)), 1)}ms ` +
        `settle=${round(median(settles))}ms longest=${round(median(maxs))}ms`
    );
    console.log(`[bloat] DOM census=${JSON.stringify(last.dom)}`);
    console.log(
      `[bloat] heap empty=${round(median(reps.map((r) => r.heapEmptyMB)), 1)}MB ` +
        `full=${round(median(reps.map((r) => r.heapFullMB)), 1)}MB ` +
        `entities=${last.entityCount} bytes/entity=${bpe}KB (guardrail < 5 KB)`
    );
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESULTS_DIR, `bloat-${N}.md`),
      [
        `# HTML/DOM-bloat stress — N=${N}`,
        '',
        `_Generated ${new Date().toISOString()} · ${REPEATS} kept runs, cal ${round(calibrationMs, 1)} ms. ` +
          'Worst-case fully-loaded diagram: every node carries a rich/formatted description + notes + ' +
          'header link + link; isometric icons from 3 packs; every connector labelled; grouping ' +
          'rectangles; 8 layers. The node layer is Canvas2D (ADR 0019), so nodes emit no per-node DOM._',
        '',
        '## Scene',
        '',
        `nodes ${last.sceneCounts.nodes} · connectors ${last.sceneCounts.connectors} (all labelled) · ` +
          `rectangles ${last.sceneCounts.rectangles} · layers ${last.sceneCounts.layers} · ` +
          `draw-count ${last.drawCount}/${N} (anti-cheat: canvas painted every node)`,
        '',
        '## Canvas spawn cost (rich content)',
        '',
        '| metric | value |',
        '|---|---|',
        `| synchronous commit | ${round(median(reps.map((r) => r.commitMs)), 1)} ms |`,
        `| settle | ${round(median(settles))} ms |`,
        `| longest frame | ${round(median(maxs))} ms |`,
        '',
        '## DOM census (what still emits HTML at scale)',
        '',
        '| element | count |',
        '|---|---|',
        `| total document elements | ${last.dom.totalDoc} |`,
        `| renderer subtree elements | ${last.dom.rendererSubtree} |`,
        `| <svg> | ${last.dom.svg} |`,
        `| connector paths | ${last.dom.connectorPaths} |`,
        `| node label-hit divs (T6) | ${last.dom.labelHitDivs} |`,
        `| node DOM shells (hybrid overlay) | ${last.dom.nodeShells} |`,
        '',
        '## Heap per entity (guardrail < 5 KB/entity)',
        '',
        '| metric | value |',
        '|---|---|',
        `| heap @ empty canvas | ${round(median(reps.map((r) => r.heapEmptyMB)), 1)} MB |`,
        `| heap @ full scene | ${round(median(reps.map((r) => r.heapFullMB)), 1)} MB |`,
        `| entities | ${last.entityCount} |`,
        `| **bytes / entity** | **${bpe} KB** |`,
        ''
      ].join('\n')
    );
    expect(
      last.drawCount,
      'bloat: canvas drew every node (draw-count == N)'
    ).toBe(N);
    return;
  }

  // ---------------------------------------------------------------------------
  // E-slice styling/pan stress scenarios (productization perf gate). Each is
  // env-gated, supports a comma-N list (e.g. PERF_LABELHEAVY=200,500,1000), and
  // writes perf-results/<name>.md — baseline.md stays untouched (charter
  // discipline), exactly like the PERF_BLOAT / PERF_LABELDRAG diagnostics above.
  // ---------------------------------------------------------------------------
  const parseNs = (v: string) =>
    v
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n > 0);

  // ATLAS mode (R3/GPU-13 §4, 2026-08-02): the measurements the ADR 0038 §8
  // amendment rests on — chip-atlas occupancy at the §6 clamps, and whether a pan
  // still rebuilds nothing. Retained AFTER the merge as the standing guard on
  // both: §5's build cadence is asserted here, not merely reported. Diagnostic
  // otherwise; writes perf-results/atlas.md and leaves baseline.md alone.
  if (process.env.PERF_ATLAS) {
    const Ns = parseNs(process.env.PERF_ATLAS);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const rows: string[] = [];
    const panRows: string[] = [];
    for (const N of Ns) {
      const r: any = await page.evaluate(
        ([n, c]) => (window as any).__perfH.measureAtlas(n, c),
        [N, SPAWN_CAP_MS] as const
      );
      const pct = (a: any) =>
        a && a.atlasSize > 0
          ? `${round((a.usedRows / a.atlasSize) * 100, 1)}%`
          : 'n/a';
      const cell = (a: any) =>
        a
          ? `${a.usedRows} / ${a.atlasSize} (${pct(a)}), ${a.slots} slots, ` +
            `${a.atlasPages} page(s), ${a.drawCalls} draw call(s)${
              a.atlasFull ? ' **FULL**' : ''
            }`
          : 'not mounted';
      // ONE atlas now (ADR 0038 §8): the merged canvas packs node chips, label
      // chips and icons together, and pages/drawCalls are what say whether that
      // fit. The design does NOT require it to — measurement 2 found it does not
      // at the 4096 clamp — and a second page costs one bind per material run.
      rows.push(`| ${N} | ${cell(r.atlases.merged)} |`);
      const d = r.buildDeltaAcrossPan;
      panRows.push(`| ${N} | ${d.scene} |`);
      console.log(
        `[atlas] N=${N} scene=${JSON.stringify(r.sceneCounts)} ` +
          `merged=${cell(r.atlases.merged)} buildDelta=${JSON.stringify(d)}`
      );
      // ADR 0038 §5 is a hard invariant, not a reported number: a pan must not
      // rebuild geometry on ANY layer. If this trips, the merged-canvas design
      // question is moot until it is explained.
      expect(
        d.scene === 0,
        `no geometry rebuild during a pan at N=${N} (ADR 0038 §5)`
      ).toBe(true);
    }
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'atlas.md'),
      [
        '# GPU-13 §4 — chip-atlas occupancy & build cadence',
        '',
        `_Generated ${new Date().toISOString()} · ALL-TYPES scene · cal ${round(calibrationMs, 1)} ms._`,
        '',
        'Measurement 2 — occupancy of the ONE merged atlas (rows consumed / atlas',
        'edge), with the pages and draw calls it needed. §8 records that the merged',
        'chip set does NOT fit the 4096 high-DPR clamp at large N, so pages > 1 (and',
        'draw calls > 1) is the designed degradation, not a failure.',
        '',
        '| N | merged chip atlas |',
        '|---|---|',
        ...rows,
        '',
        'Measurement 3 — `data-build-count` delta across a 10-step pan. Zero means',
        'the scene-change trigger is the only thing that rebuilds (ADR 0038 §5).',
        '',
        '| N | merged canvas |',
        '|---|---|',
        ...panRows,
        ''
      ].join(String.fromCharCode(10))
    );
    return;
  }

  // Spawn-class styled scenario: commit a styled scene, report settle/longest/
  // p95 + the draw-count==N anti-cheat. Mirrors the spawn baseline cells so the
  // numbers are directly comparable to baseline.md's spawn column.
  async function runSpawnClassScenario(
    measureName: string,
    fileTag: string,
    title: string,
    blurb: string,
    Ns: number[]
  ) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const rows: string[] = [];
    for (const N of Ns) {
      const runOne = (): Promise<any> =>
        page.evaluate(
          ([m, n, cap]) => (window as any).__perfH[m as string](n, cap),
          [measureName, N, SPAWN_CAP_MS] as const
        );
      for (let i = 0; i < WARMUP_RUNS; i++) await runOne();
      const reps: any[] = [];
      for (let r = 0; r < REPEATS; r++) reps.push(await runOne());
      const m = reps.map((r) => metricsOf(r as RunResult));
      const settles = m.map((x) => x.settle);
      const p95s = m.map((x) => x.p95);
      const maxs = m.map((x) => x.max);
      const commits = reps
        .map((r) => r.commitMs)
        .filter((x: number) => x != null);
      const last = reps[reps.length - 1];
      const drawn = last.renderedNodes ?? 0;
      const labelInfo =
        last.renderedLabels != null
          ? ` labels=${last.renderedLabels}/${N}`
          : '';
      console.log(
        `[${fileTag}] N=${N} cal=${round(calibrationMs, 1)} drawn=${drawn}/${N}${labelInfo} ` +
          `commit=${round(median(commits.length ? commits : [0]), 1)}ms ` +
          `settle=${round(median(settles))}ms p95=${round(median(p95s))}ms ` +
          `longest=${round(median(maxs))}ms noise(CoV settle)=${covPct(settles)}%`
      );
      rows.push(
        `| ${N} | ${drawn}/${N}${labelInfo} | ` +
          `${round(median(commits.length ? commits : [0]), 1)} | ` +
          `${round(median(settles))} | ${round(median(p95s))} | ` +
          `${round(median(maxs))} | ${covPct(settles)}% |`
      );
      expect(
        drawn,
        `${fileTag}: canvas drew every node (draw-count == N) at N=${N}`
      ).toBe(N);
      if (last.renderedLabels != null) {
        expect(
          last.renderedLabels,
          `${fileTag}: Canvas2D drew every floating label (draw-count == N) at N=${N}`
        ).toBe(N);
      }
    }
    fs.writeFileSync(
      path.join(RESULTS_DIR, `${fileTag}.md`),
      [
        `# ${title}`,
        '',
        `_Generated ${new Date().toISOString()} · ${REPEATS} kept runs/cell ` +
          `(${WARMUP_RUNS} warm-up), cal ${round(calibrationMs, 1)} ms. ${blurb}_`,
        '',
        '| N | drawn | commit (ms) | settle (ms) | p95 frame (ms) | longest (ms) | noise (CoV settle) |',
        '|---|---|---|---|---|---|---|',
        ...rows,
        ''
      ].join('\n')
    );
  }

  if (process.env.PERF_LABELHEAVY) {
    await runSpawnClassScenario(
      'measureLabelHeavy',
      'label-heavy',
      'Label-heavy node spawn — B/I/S + colour + varied px on every node label',
      'Every node label carries bold/italic/strikethrough + a non-default colour + a varied font ' +
        'size — the heaviest Canvas2D label-draw path. Compare settle/p95 vs the bare-node spawn ' +
        'baseline (baseline.md) to gate the node-label styling surface.',
      parseNs(process.env.PERF_LABELHEAVY)
    );
    return;
  }

  if (process.env.PERF_CONNLABELHEAVY) {
    await runSpawnClassScenario(
      'measureConnLabelHeavy',
      'conn-label-heavy',
      'Connector-label-heavy spawn — every connector labelled + styled',
      'Every connector (not just ~⅓) carries a styled additional label (the DOM ConnectorLabel ' +
        'path: B/I/S + colour + varied px). Gates the connector-label styling surface against the ' +
        'spawn baseline.',
      parseNs(process.env.PERF_CONNLABELHEAVY)
    );
    return;
  }

  if (process.env.PERF_BGHEAVY) {
    await runSpawnClassScenario(
      'measureBgHeavy',
      'bg-heavy',
      'Background/border-heavy spawn — dense grouping rects with fills + ≤30px borders',
      'Grouping rectangles at double density (BLOCK=2) each with a fill + a styled ≤30px border ' +
        '(varied width/colour/style) → heavy fill+stroke overdraw. Gates the rectangle background/' +
        'border surface against the spawn baseline.',
      parseNs(process.env.PERF_BGHEAVY)
    );
    return;
  }

  if (process.env.PERF_FLOATLABELS) {
    await runSpawnClassScenario(
      'measureFloatingLabelHeavy',
      'floating-label-heavy',
      'Floating-label-heavy spawn — N Canvas2D Label chips (B/I/S + colour + background)',
      'N floating Labels (the first-class Label entity, ADR 0031) over the realistic ' +
        'node/connector/rect base. Labels render on the Canvas2D SceneCanvas — the substrate ' +
        "ADR 0031 E3 chose after the DOM chip layer ~2.3×'d spawn p95 — so this re-measures the " +
        'floating-label spawn cost on the new substrate. labels=N/N anti-cheats every chip drew.',
      parseNs(process.env.PERF_FLOATLABELS)
    );
    return;
  }

  if (process.env.PERF_PAN) {
    const Ns = parseNs(process.env.PERF_PAN);
    // Optional CPU throttle (directional confirmation; the AC same-session A/B is
    // the keep/revert gate per pan-r1-design.md). CDP, Node-side.
    const throttle = process.env.PERF_THROTTLE
      ? parseInt(process.env.PERF_THROTTLE, 10)
      : 0;
    let cdp: import('@playwright/test').CDPSession | null = null;
    if (throttle > 0) {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const rows: string[] = [];
    for (const N of Ns) {
      const runPan = (): Promise<any> =>
        page.evaluate(([n, s]) => (window as any).__perfH.measurePan(n, s), [
          N,
          DRAG_STEPS
        ] as const);
      for (let i = 0; i < WARMUP_RUNS; i++) await runPan();
      const reps: any[] = [];
      for (let r = 0; r < REPEATS; r++) reps.push(await runPan());
      const m = reps.map((r) => metricsOf(r as RunResult));
      const p95s = m.map((x) => x.p95);
      const means = m.map((x) => x.meanFrame);
      const maxs = m.map((x) => x.max);
      const lts = m.map((x) => x.longTaskTotal);
      const last = reps[reps.length - 1];
      const engaged = reps.every((r) => r.panEngaged);
      // "No per-frame CPU work" gate: every GPU layer's build-count stayed flat
      // across the pan (no geometry rebuild = no O(N) CPU leaked into navigation).
      const noCpuRebuild = reps.every((r) => (r.buildDelta ?? 0) === 0);
      console.log(
        `[pan] N=${N}${throttle ? ` throttle=${throttle}x` : ''} cal=${round(calibrationMs, 1)} ` +
          `engaged=${engaged} draw≈[${last.drawMin}..${last.drawMax}]/${N} noCPU-rebuild=${noCpuRebuild} ` +
          `mean=${round(median(means))}ms p95=${round(median(p95s))}ms ` +
          `longest=${round(median(maxs))}ms longtask=${round(median(lts))}ms ` +
          `noise(CoV mean)=${covPct(means)}%`
      );
      rows.push(
        `| ${N} | ${last.drawMin}..${last.drawMax}/${N} | ${round(median(means))} | ` +
          `${round(median(p95s))} | ${round(median(maxs))} | ${round(median(lts))} | ${covPct(means)}% |`
      );
      expect(
        engaged,
        `pan: scroll changed each frame (engaged) at N=${N}`
      ).toBe(true);
      expect(
        last.drawMin,
        `pan: canvas repainted ≈ all nodes (no cull) at N=${N}`
      ).toBeGreaterThanOrEqual(Math.floor(N * 0.9));
      expect(
        noCpuRebuild,
        `pan: NO per-frame CPU rebuild — GPU layers' build-count must stay flat at N=${N} (a non-zero delta = a layer rebuilding geometry per frame)`
      ).toBe(true);
    }
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    fs.writeFileSync(
      path.join(
        RESULTS_DIR,
        `pan${throttle ? `-throttle${throttle}x` : ''}.md`
      ),
      [
        `# Sustained-pan repaint floor${throttle ? ` (CPU throttle ${throttle}×)` : ''} — measurePan`,
        '',
        `_Generated ${new Date().toISOString()} · ${REPEATS} kept runs/cell (${WARMUP_RUNS} warm-up), ` +
          `cal ${round(calibrationMs, 1)} ms. Per-rAF setScroll oscillation; headline = p95 frame time ` +
          `during sustained pan (the #54 synchronous drawNow repaint floor — pan-r1-design.md). This is ` +
          `the FIRST pan baseline: measurePan did not exist on master, so there is no prior column to ` +
          `regress against — it records the floor ENG-PAN R1 must beat (KR-P3)._`,
        '',
        '| N | draw-count range | mean frame (ms) | p95 frame (ms) | longest (ms) | long-task total (ms) | noise (CoV mean) |',
        '|---|---|---|---|---|---|---|',
        ...rows,
        ''
      ].join('\n')
    );
    return;
  }

  const table: any[] = [];
  const rawDump: Record<string, RunResult[]> = {};

  for (const N of N_SET) {
    for (const scenario of ['spawn', 'drag'] as const) {
      // Per-cell warm-up (discarded), then the kept measured runs.
      for (let r = 0; r < WARMUP_RUNS; r++) await runOnce(scenario, N);
      const kept: RunResult[] = [];
      for (let r = 0; r < REPEATS; r++) kept.push(await runOnce(scenario, N));
      rawDump[`${scenario}-${N}`] = kept;

      const m = kept.map(metricsOf);
      const p50s = m.map((x) => x.p50);
      const p95s = m.map((x) => x.p95);
      const maxs = m.map((x) => x.max);
      const meanFrames = m.map((x) => x.meanFrame);
      const settles = m.map((x) => x.settle);
      const ltTotals = m.map((x) => x.longTaskTotal);
      const commits = kept.map((r) => r.commitMs ?? 0);

      // Headline metric (continuous, so the noise band reflects real variance,
      // not vsync quantization): spawn → settle time (commit→idle wall time);
      // drag → mean frame time. Noise band = coefficient of variation.
      const headline = scenario === 'spawn' ? settles : meanFrames;

      const renderedNodes = kept.map((r) => r.renderedNodes ?? -1);
      const paintedConn = kept.map((r) => r.paintedConnectors ?? -1);
      const sc = kept[0]?.sceneCounts;
      const engagedCount = kept.filter((r) => r.dragEngaged).length;
      const row = {
        scenario,
        N,
        p50_ms: round(median(p50s)),
        p95_ms: round(median(p95s)),
        maxFrame_ms: round(median(maxs)),
        meanFrame_ms: round(median(meanFrames)),
        settle_ms: round(median(settles)),
        longTaskTotal_ms: round(median(ltTotals)),
        keptRuns: kept.length,
        noiseBand_pct: covPct(headline),
        // Guard values, asserted after results are written (see below).
        drawnMedian: scenario === 'spawn' ? median(renderedNodes) : null,
        paintedConnMedian: scenario === 'spawn' ? median(paintedConn) : null,
        expectedConnectors: scenario === 'spawn' ? (sc?.connectors ?? 0) : null,
        engagedCount: scenario === 'drag' ? engagedCount : null
      };
      table.push(row);
      const commitInfo =
        scenario === 'spawn'
          ? ` commit=${round(median(commits), 1)} commitN=${covPct(commits)}%` +
            ` rendered=${median(renderedNodes)}/${N}` +
            (sc ? ` scene[conn=${sc.connectors} rect=${sc.rectangles}]` : '')
          : ` engaged=${engagedCount}/${kept.length}`;
      console.log(
        `[perf] ${scenario} N=${N}  p50=${row.p50_ms} p95=${row.p95_ms} ` +
          `mean=${row.meanFrame_ms} max=${row.maxFrame_ms} settle=${row.settle_ms} ` +
          `lt=${row.longTaskTotal_ms} noise(CoV)=${row.noiseBand_pct}%  ` +
          `[meanN=${covPct(meanFrames)}% settleN=${covPct(settles)}% p95N=${covPct(p95s)}%${commitInfo}]`
      );
      console.log(
        `        head[]=${headline.map((x) => round(x, 1)).join(',')}` +
          (scenario === 'spawn'
            ? `  commit[]=${commits.map((x) => round(x, 1)).join(',')}`
            : '')
      );
    }
  }

  // ---- paste-on-top scenario (the reported freeze) ----
  // Drives the REAL Ctrl+C / Ctrl+V path with the cursor on the selection
  // centroid, so every pasted node lands on an occupied tile (rigid-stamp
  // collision resolution) and pasteItems does the full batched store write +
  // canvas redraw. Headline = settle time (the user-perceived freeze).
  const runPasteOnce = (N: number): Promise<RunResult> =>
    page.evaluate(([n, cap]) => (window as any).__perfH.measurePaste(n, cap), [
      N,
      SPAWN_CAP_MS
    ] as const);

  const pasteTable: any[] = [];
  for (const N of PASTE_N_SET) {
    for (let r = 0; r < WARMUP_RUNS; r++) await runPasteOnce(N);
    const kept: RunResult[] = [];
    for (let r = 0; r < REPEATS; r++) kept.push(await runPasteOnce(N));
    rawDump[`paste-${N}`] = kept;

    const m = kept.map(metricsOf);
    const settles = m.map((x) => x.settle);
    const row = {
      scenario: 'paste',
      N,
      p50_ms: round(median(m.map((x) => x.p50))),
      p95_ms: round(median(m.map((x) => x.p95))),
      maxFrame_ms: round(median(m.map((x) => x.max))),
      settle_ms: round(median(settles)),
      longTaskTotal_ms: round(median(m.map((x) => x.longTaskTotal))),
      keptRuns: kept.length,
      noiseBand_pct: covPct(settles),
      // Guard values (asserted after results are written): the paste must add
      // exactly N nodes for a total of 2N — proves the paste actually ran and
      // nothing was silently dropped/stacked-into-one.
      pastedMedian: median(kept.map((r) => r.pastedCount ?? -1)),
      totalMedian: median(kept.map((r) => r.totalNodes ?? -1))
    };
    pasteTable.push(row);
    console.log(
      `[perf] paste(on-top) N=${N}  p50=${row.p50_ms} p95=${row.p95_ms} ` +
        `max=${row.maxFrame_ms} settle=${row.settle_ms} ` +
        `lt=${row.longTaskTotal_ms} noise(CoV)=${row.noiseBand_pct}%  ` +
        `pasted=${row.pastedMedian}/${N} total=${row.totalMedian}`
    );
    console.log(
      `        settle[]=${settles.map((x) => round(x, 1)).join(',')}`
    );
  }

  // ---- idle-churn guardrail probe (KR3) ----
  const idle = await page.evaluate(
    (ms) => (window as any).__perfH.measureIdle(ms),
    IDLE_PROBE_MS
  );
  const idleFrames: number[] = idle.frames;
  const idleSorted = [...idleFrames].sort((a: number, b: number) => a - b);
  const leakMB = round(idle.heapAfterGc - idle.heapStart, 1);
  const leakPct =
    idle.heapStart > 0
      ? round(((idle.heapAfterGc - idle.heapStart) / idle.heapStart) * 100, 1)
      : -1;
  const idleGuard = {
    durationS: round(idle.durationMs / 1000, 0),
    heapStartMB: round(idle.heapStart, 1),
    heapPeakMB: round(idle.heapPeak, 1),
    heapAfterGcMB: round(idle.heapAfterGc, 1),
    leakMB, // retained growth after a final GC = real leak signal
    leakPct,
    longTaskCount: idle.longTasks.length,
    p95FrameMs: round(percentile(idleSorted, 95), 1),
    maxFrameMs: round(
      idleSorted.length ? idleSorted[idleSorted.length - 1] : 0,
      1
    ),
    // KR3 passes: heap flat (±5% retained after GC) AND zero long tasks at idle.
    pass: Math.abs(leakPct) <= 5 && idle.longTasks.length === 0
  };
  console.log(
    `[perf] IDLE ${idleGuard.durationS}s @0 nodes: heap ${idleGuard.heapStartMB}` +
      `→${idleGuard.heapPeakMB}MB peak, ${idleGuard.heapAfterGcMB}MB after GC ` +
      `(retained ${idleGuard.leakMB}MB / ${idleGuard.leakPct}%) · ` +
      `longTasks=${idleGuard.longTaskCount} · idle p95=${idleGuard.p95FrameMs}ms ` +
      `max=${idleGuard.maxFrameMs}ms · KR3 ${idleGuard.pass ? 'PASS' : 'FAIL'}`
  );

  // ---- write results ----
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  fs.writeFileSync(
    path.join(RAW_DIR, `run-${stamp.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(
      { stamp, calibrationMs, table, pasteTable, idleGuard, raw: rawDump },
      null,
      2
    )
  );

  // KR1 gate. Load-bearing regime = all drag + spawn N≥100 (the cells whose
  // operation is large enough — >~100 ms — to resolve well above the 16.6 ms
  // vsync quantization floor). Small-N spawn (≤50) is a sub-100 ms operation at
  // the quantization floor and is NOT an optimization target (the app is smooth
  // there). We report both, transparently.
  // Load-bearing = the regime whose operation resolves ABOVE the ±1-frame settle
  // quantization floor (~33 ms), so its CoV reflects real variance, not vsync
  // quantization. Measured on this machine (Track P, 15-repeat noise probe):
  // spawn settle at N=100 is bimodal 83↔117 ms (5↔7 idle frames) → ~16% CoV that
  // does NOT shrink with more repeats (structural quantization — the same floor
  // the decision-log documented for N≤50). N≥200 spawn (settle ≥117 ms) + all
  // drag resolve cleanly (<7%). So the trustworthy/load-bearing range is
  // drag || N≥200; small-N spawn is still reported, just excluded from the KR1
  // certification gate (Track P, ADR 0020).
  const isLoadBearing = (r: any) => r.scenario === 'drag' || r.N >= 200;
  const worstNoise = Math.max(...table.map((r) => r.noiseBand_pct));
  const worstLoadBearing = Math.max(
    ...table.filter(isLoadBearing).map((r) => r.noiseBand_pct)
  );

  const md = renderMarkdown(
    stamp,
    calibrationMs,
    table,
    pasteTable,
    worstLoadBearing,
    worstNoise,
    idleGuard
  );
  fs.writeFileSync(path.join(RESULTS_DIR, 'baseline.md'), md);
  console.log('\n' + md);
  console.log(
    `[perf] worst noise band: load-bearing(drag+spawn N≥100)=${worstLoadBearing}% · ` +
      `all-cells=${worstNoise}%`
  );

  // ---- guards (real assertions, not just reporting) ----
  // Results are already written above, so a guard failure still leaves a
  // diagnosable baseline.md + raw dump. These are the integrity signals that
  // were previously only console.log'd; a regression now fails the run.
  expect(table.length).toBe(N_SET.length * 2);
  for (const r of table) {
    if (r.scenario === 'spawn') {
      // Draw-count anti-cheat: at fit-to-view the canvas must paint every node
      // the scene committed (no off-screen cull silently shrinking the work and
      // faking a faster spawn).
      expect(
        r.drawnMedian,
        `spawn N=${r.N}: draw-count anti-cheat (drawn == N)`
      ).toBe(r.N);
      // Connector-paint anti-cheat (D4-1): every committed connector must paint,
      // so the spawn cost includes connector render — not the old 0-paint path
      // that made Iter-7 "connectors cost 0ms" meaningless (and would let a T3
      // tick harness build on a path that never paints moving-endpoint connectors).
      expect(
        r.paintedConnMedian,
        `spawn N=${r.N}: connector-paint anti-cheat (painted == committed connectors)`
      ).toBe(r.expectedConnectors);
    } else {
      // The drag must actually engage DRAG_ITEMS on every kept run — otherwise a
      // failed grab measures idle frames and reads as a false 60 fps.
      expect(
        r.engagedCount,
        `drag N=${r.N}: DRAG_ITEMS engaged on every kept run`
      ).toBe(r.keptRuns);
    }
  }
  // Paste anti-cheat: each paste must add exactly N nodes (total 2N) — proves
  // the real paste path ran and nothing was dropped or collapsed onto one tile.
  expect(pasteTable.length).toBe(PASTE_N_SET.length);
  for (const r of pasteTable) {
    expect(r.pastedMedian, `paste N=${r.N}: paste added exactly N nodes`).toBe(
      r.N
    );
    expect(r.totalMedian, `paste N=${r.N}: 2N nodes after paste`).toBe(2 * r.N);
  }
  // KR3 idle-churn guardrail: heap flat (±5% retained after GC) AND zero idle
  // long tasks at zero entities.
  expect(idleGuard.pass, 'KR3 idle-churn guardrail').toBe(true);
});

function renderMarkdown(
  stamp: string,
  calibrationMs: number,
  table: any[],
  pasteTable: any[],
  worstLoadBearing: number,
  worstNoise: number,
  idleGuard: any
): string {
  const lines: string[] = [];
  lines.push('# Engine perf baseline');
  lines.push('');
  lines.push(
    `_Generated ${stamp} by packages/axoview-e2e/perf/engine-perf.spec.ts_`
  );
  lines.push('');
  const certified = worstLoadBearing < 10;
  lines.push(
    certified
      ? `**KR1: CERTIFIED (load-bearing regime)** — worst noise band ${worstLoadBearing}% ` +
          '< 10% across all drag cells and spawn N≥200. Baseline is trustworthy for ' +
          `the optimization-relevant range. (All-cells worst = ${worstNoise}%; the ` +
          'excess is small-N spawn ≤100 — sub-120 ms operations at the 16.6 ms vsync ' +
          'quantization floor, bimodal 83↔117 ms settle, not an optimization target.)'
      : `**KR1: NOT CERTIFIED** — worst load-bearing noise band ${worstLoadBearing}% ≥ 10%. ` +
          'Numbers below are directional only (see perf-results/decision-log.md).'
  );
  lines.push('');
  lines.push(
    `Median across ${REPEATS} kept runs (${WARMUP_RUNS} per-cell warm-up runs + ` +
      'a global warm-up discarded first). Noise band = coefficient of variation ' +
      '(stddev/mean) of the per-run **continuous** headline metric ' +
      '(**spawn → settle time** = commit→idle wall time; **drag → mean frame ' +
      'time**) — a real run-to-run variance measure, robust to the vsync ' +
      'quantization that makes frame-time percentiles bimodal. Frame budget ' +
      '@60fps = 16.6 ms.'
  );
  lines.push('');
  lines.push(
    '**Scene (realistic, per N):** N nodes (5 icon types ≈1.7 KB each, varied ' +
      'label colours, ~20% with a description, ~12% with notes) + ~N connectors ' +
      '(⅓ labelled) + grouping rectangles. **Spawn** commits the whole scene in ' +
      'one store write (paste / import / diagram-open). **Drag** drags a ' +
      'connected in-grid node through OCCUPIED tiles → per-frame collision ' +
      'checks + connector re-route. (Text boxes excluded — their scene-side size ' +
      'derivation is incompatible with a bulk model.set.)'
  );
  lines.push('');
  lines.push(
    `**Machine calibration index: ${round(calibrationMs, 1)} ms** (fixed CPU ` +
      'workload, this session). Cross-session machine drift was measured at ~22% ' +
      '(≫ the ~2% within-run noise), so absolute numbers are comparable only ' +
      'between runs with a similar index — **keep/revert decisions must be ' +
      'same-session A/B**, never a fresh run vs a prior-session baseline.'
  );
  lines.push('');
  for (const scenario of ['spawn', 'drag']) {
    lines.push(`## ${scenario}`);
    lines.push('');
    lines.push(
      '| N | p50 (ms) | p95 (ms) | mean frame (ms) | longest frame (ms) | settle (ms) | long-task total (ms) | kept runs | noise band (CoV) |'
    );
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of table.filter((x) => x.scenario === scenario)) {
      lines.push(
        `| ${r.N} | ${r.p50_ms} | ${r.p95_ms} | ${r.meanFrame_ms} | ${r.maxFrame_ms} | ${r.settle_ms} | ${r.longTaskTotal_ms} | ${r.keptRuns} | ${r.noiseBand_pct}% |`
      );
    }
    lines.push('');
  }

  // Paste-on-top scenario — the reported freeze (select N → copy → paste
  // directly on top). Headline = settle time (commit→idle wall time). Pre-fix
  // this was O(N^3) in pasteItems and froze; post-fix it is O(N).
  lines.push('## paste (on-top collision)');
  lines.push('');
  lines.push(
    '**Scene:** N source nodes (varied icons/labels), select-all + copy, cursor ' +
      'on the selection centroid so the paste offset ≈ 0 (every pasted node hits ' +
      'an occupied tile → rigid-stamp placement). Drives the real Ctrl+C/Ctrl+V ' +
      'path → handlePaste → pasteItems → canvas redraw of 2N nodes.'
  );
  lines.push('');
  lines.push(
    '| N | p50 (ms) | p95 (ms) | longest frame (ms) | settle (ms) | long-task total (ms) | kept runs | noise band (CoV) |'
  );
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of pasteTable) {
    lines.push(
      `| ${r.N} | ${r.p50_ms} | ${r.p95_ms} | ${r.maxFrame_ms} | ${r.settle_ms} | ${r.longTaskTotal_ms} | ${r.keptRuns} | ${r.noiseBand_pct}% |`
    );
  }
  lines.push('');

  // Guardrail: idle-churn floor (KR3).
  lines.push('## Guardrail — idle floor (KR3)');
  lines.push('');
  lines.push(
    `**KR3: ${idleGuard.pass ? 'PASS' : 'FAIL'}** — ${idleGuard.durationS}s with ` +
      'zero entities on canvas. Charter bar: idle heap flat ±5% (retained after ' +
      'GC) AND zero long tasks.'
  );
  lines.push('');
  lines.push('| metric | value |');
  lines.push('|---|---|');
  lines.push(`| heap start | ${idleGuard.heapStartMB} MB |`);
  lines.push(`| heap peak | ${idleGuard.heapPeakMB} MB |`);
  lines.push(`| heap after final GC | ${idleGuard.heapAfterGcMB} MB |`);
  lines.push(
    `| retained growth (leak) | ${idleGuard.leakMB} MB (${idleGuard.leakPct}%) |`
  );
  lines.push(`| long tasks at idle | ${idleGuard.longTaskCount} |`);
  lines.push(
    `| idle frame p95 / max | ${idleGuard.p95FrameMs} / ${idleGuard.maxFrameMs} ms |`
  );
  lines.push('');
  return lines.join('\n');
}
