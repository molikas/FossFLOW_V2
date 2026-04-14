/**
 * DiagnosticsOverlay — performance + scene telemetry.
 *
 * Dev:  always enabled (cannot be turned off).
 * Prod: disabled by default; toggle persisted in localStorage (fossflow_perf_enabled).
 *
 * ── Memory budget (hard ceiling) ─────────────────────────────────────────────
 *   Samples : MAX_SAMPLES(600) × 8 fields × 8 bytes  ≈  38 KB
 *   Events  : MAX_EVENTS(300)  × ~60 bytes avg        ≈  18 KB
 *   Total ceiling                                      ≈  56 KB
 *
 *   When disabled in production the rAF loop and PerformanceObserver are never
 *   started.  The component sits dormant with empty refs — zero CPU, zero
 *   accumulation.  Enabling/disabling resets all buffers.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Auto-detected events
 *   Scene changes : node_added/removed, connector_added/removed, bulk_load/remove
 *   Performance   : fps_degraded(<30), fps_recovered(≥50), longtask_burst(Δ>5/s)
 *   Memory        : gc (heap drop >20 MB), memory_warning (used >200 MB, once)
 *   Interaction   : drag_start/drag_end (sustained drags >~1 s), undo, redo
 *   Navigation    : zoom_changed (Δ>0.1), view_changed, tab_hidden, tab_visible
 *
 * Two download formats
 *   AI    – compact array-of-arrays, no whitespace, minimum LLM tokens
 *   Human – pretty-printed JSON with labels, summary stats, ISO timestamps
 */
import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { diagnosticsStore } from '../stores/diagnosticsStore';

// ── env / persistence ─────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production';

// ── hard limits ───────────────────────────────────────────────────────────────
const MAX_SAMPLES = 600; // circular — oldest dropped
const MAX_EVENTS = 300; // circular — oldest dropped

const FIELDS = ['dt', 'fps', 'hu', 'ht', 'lt', 'ni', 'nc', 'ntb'] as const;

// ── store accessors ───────────────────────────────────────────────────────────
function getSceneCounts(): { ni: number; nc: number; ntb: number } {
  try {
    const fw = (window as any).__fossflow__;
    if (!fw) return { ni: 0, nc: 0, ntb: 0 };
    const ms = fw.model?.getState?.();
    const ni: number = ms?.items?.length ?? 0;
    const views: any[] = ms?.views ?? [];
    let nc = 0;
    for (const v of views)
      nc += (v?.value?.connectors ?? v?.connectors ?? []).length;
    const ss = fw.scene?.getState?.();
    const ntb: number = ss?.textBoxes ? Object.keys(ss.textBoxes).length : 0;
    return { ni, nc, ntb };
  } catch {
    return { ni: 0, nc: 0, ntb: 0 };
  }
}

function getUiSnapshot(): {
  zoom: number;
  viewId: string;
  isDragging: boolean;
} {
  try {
    const us = (window as any).__fossflow__?.ui?.getState?.();
    return {
      zoom: us?.zoom ?? 1,
      viewId: us?.view ?? '',
      isDragging: us?.mouse?.mousedown != null
    };
  } catch {
    return { zoom: 1, viewId: '', isDragging: false };
  }
}

function getHistoryLengths(): { past: number; future: number } {
  try {
    const ms = (window as any).__fossflow__?.model?.getState?.();
    return {
      past: ms?.history?.past?.length ?? 0,
      future: ms?.history?.future?.length ?? 0
    };
  } catch {
    return { past: 0, future: 0 };
  }
}

// ── event helpers ─────────────────────────────────────────────────────────────
type DiagEvent = [number, string, (number | string)?]; // [dt_ms, type, detail?]

function pushEvent(buf: DiagEvent[], ev: DiagEvent) {
  if (buf.length >= MAX_EVENTS) buf.shift();
  buf.push(ev);
}

// ── download helpers ──────────────────────────────────────────────────────────
function downloadFile(content: string, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([content], { type: 'application/json' })
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function buildAi(samples: number[][], events: DiagEvent[], t0: number) {
  return JSON.stringify({
    meta: {
      fields: FIELDS,
      units:
        'dt=ms_since_start fps=frames/s hu/ht=heap_MB(-1=n/a) lt=cumul_long_tasks(>50ms) ni=nodes nc=connectors ntb=textboxes',
      t0
    },
    samples,
    events // [dt_ms, type, detail?]
  });
}

function buildHuman(samples: number[][], events: DiagEvent[], t0: number) {
  if (!samples.length) return JSON.stringify({ error: 'no data' });
  const fps = samples.map((r) => r[1]);
  const hu = samples.map((r) => r[2]).filter((v) => v >= 0);
  const lt = samples.map((r) => r[4]);
  const dur = samples[samples.length - 1][0];
  const avgFps = +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1);
  const totalLT = lt[lt.length - 1] - lt[0];
  return JSON.stringify(
    {
      session: {
        startedAt: new Date(t0).toISOString(),
        durationSecs: +(dur / 1000).toFixed(1),
        sampleCount: samples.length,
        memoryBudgetKB: { samples: 38, events: 18, totalCeiling: 56 }
      },
      performance: {
        fps: {
          avg: avgFps,
          min: Math.min(...fps),
          good_secs: fps.filter((f) => f >= 50).length,
          medium_secs: fps.filter((f) => f >= 30 && f < 50).length,
          poor_secs: fps.filter((f) => f < 30).length
        },
        heapUsedMB: { peak: hu.length ? Math.max(...hu) : 'n/a' },
        longTasks: {
          total: totalLT,
          perSecond: +((totalLT / dur) * 1000).toFixed(2)
        }
      },
      events: events.map(([dt, type, detail]) => ({
        timeMs: dt,
        timeISO: new Date(t0 + dt).toISOString(),
        type,
        detail: detail ?? null
      })),
      samples: samples.map(([dt, fps, hu, ht, lt, ni, nc, ntb]) => ({
        timeMs: dt,
        fps,
        heapUsedMB: hu >= 0 ? hu : null,
        heapTotalMB: ht >= 0 ? ht : null,
        longTasksCumul: lt,
        nodes: ni,
        connectors: nc,
        textBoxes: ntb
      }))
    },
    null,
    2
  );
}

// ── ui helpers ────────────────────────────────────────────────────────────────
function fpsColor(fps: number) {
  return fps >= 50 ? '#4caf50' : fps >= 30 ? '#ff9800' : '#f44336';
}
const btnBase: React.CSSProperties = {
  border: 'none',
  borderRadius: 3,
  color: '#fff',
  padding: '3px 0',
  fontSize: 11,
  cursor: 'pointer',
  flex: 1
};

// ── component ─────────────────────────────────────────────────────────────────
export function DiagnosticsOverlay() {
  // Use the shared store so DiagnosticsToggleButton (in BottomDock) stays in sync
  const enabled = useSyncExternalStore(
    diagnosticsStore.subscribe,
    diagnosticsStore.getEnabled
  );
  const open = useSyncExternalStore(
    diagnosticsStore.subscribe,
    diagnosticsStore.getOpen
  );
  const [latest, setLatest] = useState<number[] | null>(null);

  // All mutable state lives in refs — avoids re-renders during collection
  const samplesRef = useRef<number[][]>([]);
  const eventsRef = useRef<DiagEvent[]>([]);
  const ltRef = useRef(0); // cumulative long tasks
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const lastFpsRef = useRef(performance.now());
  const t0Ref = useRef(Date.now());
  // state tracking for event detection
  const prevCounts = useRef({ ni: 0, nc: 0, ntb: 0 });
  const prevFpsOk = useRef(true); // true = fps was ≥ 30 last sample
  const prevHu = useRef(-1);
  const prevZoom = useRef(1);
  const prevViewId = useRef('');
  const prevPastLen = useRef(0);
  const prevFutureLen = useRef(0);
  const prevDragging = useRef(false);
  const memWarnFired = useRef(false); // memory_warning fires only once per session

  // ── main collection loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Reset all buffers on (re-)enable
    samplesRef.current = [];
    eventsRef.current = [];
    ltRef.current = 0;
    frameRef.current = 0;
    t0Ref.current = Date.now();
    lastFpsRef.current = performance.now();
    prevCounts.current = { ni: 0, nc: 0, ntb: 0 };
    prevFpsOk.current = true;
    prevHu.current = -1;
    prevZoom.current = 1;
    prevViewId.current = '';
    prevPastLen.current = 0;
    prevFutureLen.current = 0;
    prevDragging.current = false;
    memWarnFired.current = false;
    setLatest(null);

    // Long-task observer
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        ltRef.current += list.getEntries().length;
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      /* not supported */
    }

    // Tab visibility events
    const onVis = () => {
      const dt = Date.now() - t0Ref.current;
      pushEvent(eventsRef.current, [
        dt,
        document.hidden ? 'tab_hidden' : 'tab_visible'
      ]);
    };
    document.addEventListener('visibilitychange', onVis);

    const tick = (now: number) => {
      frameRef.current++;
      const elapsed = now - lastFpsRef.current;

      if (elapsed >= 1000) {
        const fps = Math.round((frameRef.current * 1000) / elapsed);
        frameRef.current = 0;
        lastFpsRef.current = now;
        const mem = (performance as any).memory;
        const hu = mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : -1;
        const ht = mem ? +(mem.totalJSHeapSize / 1048576).toFixed(1) : -1;
        const lt = ltRef.current;
        const dt = Date.now() - t0Ref.current;
        const curr = getSceneCounts();
        const ui = getUiSnapshot();
        const hist = getHistoryLengths();

        const ev = eventsRef.current;

        // ── scene change events ──────────────────────────────────────────────
        const dni = curr.ni - prevCounts.current.ni;
        const dnc = curr.nc - prevCounts.current.nc;
        if (Math.abs(dni) >= 5)
          pushEvent(ev, [dt, dni > 0 ? 'bulk_load' : 'bulk_remove', curr.ni]);
        else if (dni === 1) pushEvent(ev, [dt, 'node_added', curr.ni]);
        else if (dni === -1) pushEvent(ev, [dt, 'node_removed', curr.ni]);
        else if (dni > 1) pushEvent(ev, [dt, 'nodes_added', curr.ni]);
        else if (dni < -1) pushEvent(ev, [dt, 'nodes_removed', curr.ni]);
        if (dnc === 1) pushEvent(ev, [dt, 'connector_added', curr.nc]);
        else if (dnc === -1) pushEvent(ev, [dt, 'connector_removed', curr.nc]);
        else if (dnc > 1) pushEvent(ev, [dt, 'connectors_added', curr.nc]);
        else if (dnc < -1) pushEvent(ev, [dt, 'connectors_removed', curr.nc]);
        prevCounts.current = curr;

        // ── fps threshold events ─────────────────────────────────────────────
        if (fps < 30 && prevFpsOk.current) {
          pushEvent(ev, [dt, 'fps_degraded', fps]);
          prevFpsOk.current = false;
        } else if (fps >= 50 && !prevFpsOk.current) {
          pushEvent(ev, [dt, 'fps_recovered', fps]);
          prevFpsOk.current = true;
        }

        // ── long-task burst ──────────────────────────────────────────────────
        const prevLt = samplesRef.current.length
          ? samplesRef.current[samplesRef.current.length - 1][4]
          : 0;
        if (lt - prevLt > 5) pushEvent(ev, [dt, 'longtask_burst', lt - prevLt]);

        // ── GC detection (heap drop > 20 MB) ────────────────────────────────
        if (hu >= 0 && prevHu.current >= 0 && prevHu.current - hu > 20) {
          pushEvent(ev, [dt, 'gc', `${prevHu.current}→${hu}MB`]);
        }
        prevHu.current = hu;

        // ── memory warning (first breach of 200 MB, fires once per session) ──
        if (hu >= 200 && !memWarnFired.current) {
          pushEvent(ev, [dt, 'memory_warning', hu]);
          memWarnFired.current = true;
        }

        // ── zoom change (Δ > 0.1) ────────────────────────────────────────────
        if (Math.abs(ui.zoom - prevZoom.current) > 0.1) {
          pushEvent(ev, [dt, 'zoom_changed', +ui.zoom.toFixed(2)]);
          prevZoom.current = ui.zoom;
        }

        // ── view switch ───────────────────────────────────────────────────────
        if (
          ui.viewId &&
          prevViewId.current &&
          ui.viewId !== prevViewId.current
        ) {
          pushEvent(ev, [dt, 'view_changed', ui.viewId]);
        }
        if (ui.viewId) prevViewId.current = ui.viewId;

        // ── undo / redo ───────────────────────────────────────────────────────
        // undo: past shrinks and future grows
        // redo: future shrinks and past grows
        if (
          hist.past < prevPastLen.current &&
          hist.future > prevFutureLen.current
        ) {
          pushEvent(ev, [dt, 'undo', hist.past]);
        } else if (
          hist.future < prevFutureLen.current &&
          hist.past > prevPastLen.current
        ) {
          pushEvent(ev, [dt, 'redo', hist.past]);
        }
        prevPastLen.current = hist.past;
        prevFutureLen.current = hist.future;

        // ── drag start / end (sustained drag = mousedown held across samples) ─
        // Note: catches drags longer than ~1 s; quick clicks are not visible at
        // this sampling rate which is intentional (they don't cause perf issues).
        if (ui.isDragging && !prevDragging.current) {
          pushEvent(ev, [dt, 'drag_start', curr.ni]);
        } else if (!ui.isDragging && prevDragging.current) {
          pushEvent(ev, [dt, 'drag_end', curr.ni]);
        }
        prevDragging.current = ui.isDragging;

        // ── store sample ─────────────────────────────────────────────────────
        const row = [dt, fps, hu, ht, lt, curr.ni, curr.nc, curr.ntb];
        if (samplesRef.current.length >= MAX_SAMPLES)
          samplesRef.current.shift();
        samplesRef.current.push(row);
        setLatest(row);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  const toggleEnabled = useCallback((v: boolean) => {
    diagnosticsStore.setEnabled(v);
  }, []);

  const hasData = samplesRef.current.length > 0;

  // Collapsed state: the toggle button is rendered by DiagnosticsToggleButton in BottomDock.
  if (!open) return null;

  // ── expanded panel ─────────────────────────────────────────────────────────
  const [, fps, hu, ht, lt, ni, nc, ntb] = latest ?? [];
  const recentEvents = eventsRef.current.slice(-6);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.9)',
        color: '#eee',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 1.7,
        minWidth: 225,
        boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            color: '#aaa',
            fontSize: 10,
            letterSpacing: 1
          }}
        >
          FOSSFLOW DIAG&nbsp;
          <span style={{ color: '#444' }}>{IS_DEV ? 'DEV' : 'PROD'}</span>
        </span>
        <button
          onClick={() => diagnosticsStore.setOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0
          }}
        >
          ×
        </button>
      </div>

      {/* Enable toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          borderBottom: '1px solid #333',
          paddingBottom: 6
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            cursor: IS_DEV ? 'default' : 'pointer',
            fontSize: 11
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={IS_DEV}
            onChange={(e) => toggleEnabled(e.target.checked)}
            style={{ cursor: IS_DEV ? 'default' : 'pointer' }}
          />
          <span style={{ color: enabled ? '#4caf50' : '#888' }}>
            {enabled ? 'Monitoring ON' : 'Monitoring OFF'}
          </span>
          {IS_DEV && (
            <span style={{ color: '#444', fontSize: 10 }}>
              (always on in dev)
            </span>
          )}
        </label>
      </div>

      {enabled && latest ? (
        <>
          <div>
            FPS{' '}
            <span style={{ color: fpsColor(fps!), fontWeight: 'bold' }}>
              {fps}
            </span>
          </div>
          {hu! >= 0 ? (
            <div>
              Heap <span style={{ color: '#64b5f6' }}>{hu} MB</span>
              <span style={{ color: '#555' }}> / {ht} MB</span>
            </div>
          ) : (
            <div style={{ color: '#555' }}>Heap n/a (Chrome only)</div>
          )}
          <div>
            Long tasks{' '}
            <span style={{ color: lt! > 0 ? '#ff9800' : '#4caf50' }}>{lt}</span>
          </div>

          <div
            style={{ borderTop: '1px solid #333', marginTop: 4, paddingTop: 4 }}
          >
            Nodes <span style={{ color: '#ce93d8' }}>{ni}</span>
            {' · '}Conn <span style={{ color: '#80cbc4' }}>{nc}</span>
            {' · '}TB <span style={{ color: '#80cbc4' }}>{ntb}</span>
          </div>

          {recentEvents.length > 0 && (
            <div
              style={{
                borderTop: '1px solid #333',
                marginTop: 4,
                paddingTop: 4,
                fontSize: 10,
                color: '#aaa'
              }}
            >
              {recentEvents.map((ev, i) => (
                <div key={i}>
                  <span style={{ color: '#555' }}>{ev[0]}ms</span> {ev[1]}
                  {ev[2] != null ? (
                    <span style={{ color: '#777' }}> {ev[2]}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div style={{ color: '#444', fontSize: 10, marginTop: 2 }}>
            {samplesRef.current.length}/{MAX_SAMPLES} samples ·{' '}
            {eventsRef.current.length}/{MAX_EVENTS} events · ~56 KB max
          </div>

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button
              onClick={() =>
                downloadFile(
                  buildAi(samplesRef.current, eventsRef.current, t0Ref.current),
                  `ff-diag-ai-${stamp()}.json`
                )
              }
              disabled={!hasData}
              style={{
                ...btnBase,
                background: hasData ? '#1565c0' : '#333',
                opacity: hasData ? 1 : 0.4
              }}
              title="Compact arrays — minimum LLM tokens"
            >
              ↓ AI
            </button>
            <button
              onClick={() =>
                downloadFile(
                  buildHuman(
                    samplesRef.current,
                    eventsRef.current,
                    t0Ref.current
                  ),
                  `ff-diag-human-${stamp()}.json`
                )
              }
              disabled={!hasData}
              style={{
                ...btnBase,
                background: hasData ? '#4a148c' : '#333',
                opacity: hasData ? 1 : 0.4
              }}
              title="Readable JSON with labels and summary stats"
            >
              ↓ Human
            </button>
          </div>
        </>
      ) : enabled ? (
        <div style={{ color: '#555' }}>Collecting first sample…</div>
      ) : (
        <div style={{ color: '#666', fontSize: 11 }}>
          Enable monitoring above to start collecting.
        </div>
      )}
    </div>
  );
}
