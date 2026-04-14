/**
 * diagnosticsStore — shared state for the diagnostics overlay.
 *
 * Shared between DiagnosticsOverlay (the panel) and DiagnosticsToggleButton
 * (rendered in the BottomDock).  Using a module-level store avoids prop-drilling
 * through Isoflow while keeping state coherent.
 */

// ── env / persistence ─────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production';
const STORE_KEY = 'fossflow_perf_enabled';

function readEnabled(): boolean {
  if (IS_DEV) return true;
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEnabled(v: boolean) {
  try {
    if (v) localStorage.setItem(STORE_KEY, '1');
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ── subscriber pattern (avoids adding zustand dep in tests) ───────────────────
type Listener = () => void;
const listeners = new Set<Listener>();

let _enabled = readEnabled();
let _open = false;

function notify() {
  listeners.forEach((fn) => fn());
}

export const diagnosticsStore = {
  getEnabled: () => _enabled,
  getOpen: () => _open,
  setEnabled(v: boolean) {
    writeEnabled(v);
    _enabled = v;
    if (!v) _open = false;
    notify();
  },
  setOpen(v: boolean) {
    _open = v;
    notify();
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
