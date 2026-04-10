/**
 * DiagLogger — singleton diagnostic session recorder.
 *
 * Usage:
 *   diagLogger.start();          // begin recording
 *   diagLogger.log('RENDER', 'node_placed', { tile: {x,y}, iconId });
 *   diagLogger.stop();           // ends session, prompts download
 *   diagLogger.download();       // manually download current session JSON
 *
 * The logger is a no-op when not active so it's safe to call log() everywhere
 * without any perf impact in production.
 */

import { DiagEvent, DiagEventCategory, DiagSession } from './types';

// Populated at build time by vite-plugin-package-version (or falls back gracefully)
declare const PACKAGE_VERSION: string;

const safeVersion = (): string => {
  try { return PACKAGE_VERSION; } catch { return 'unknown'; }
};

class DiagLogger {
  private session: DiagSession | null = null;
  private startMs = 0;
  private observer: PerformanceObserver | null = null;

  get isActive(): boolean {
    return this.session !== null;
  }

  /** Start a new diagnostics session. Idempotent — calling twice is a no-op. */
  start(): void {
    if (this.session) return;

    const now = new Date();
    this.startMs = performance.now();
    this.session = {
      sessionId: `diag-${now.getTime()}`,
      startedAt: now.toISOString(),
      userAgent: navigator.userAgent,
      appVersion: safeVersion(),
      events: [],
      perfEntries: []
    };

    // Capture long tasks, paint, and layout timings
    try {
      this.observer = new PerformanceObserver((list) => {
        if (!this.session) return;
        this.session.perfEntries!.push(...list.getEntries());
      });
      this.observer.observe({ entryTypes: ['longtask', 'paint', 'layout-shift', 'measure'] });
    } catch {
      // PerformanceObserver may not support all entry types in all browsers — that's fine
    }

    this.log('INFO', 'session_started', { sessionId: this.session.sessionId });
    console.info('[Diagnostics] Session started:', this.session.sessionId);
  }

  /** Stop the session and trigger a JSON download. */
  stop(): DiagSession | null {
    if (!this.session) return null;

    this.log('INFO', 'session_ended');
    this.observer?.disconnect();
    this.observer = null;

    this.session.endedAt = new Date().toISOString();
    const completed = { ...this.session };
    this.download(completed);

    this.session = null;
    console.info('[Diagnostics] Session ended — report downloaded.');
    return completed;
  }

  /**
   * Record a diagnostic event. No-op when session is not active.
   * @param category  Broad classification for filtering
   * @param event     Snake_case event name (e.g. 'node_placed', 'render_slow')
   * @param data      Optional arbitrary payload
   */
  log(
    category: DiagEventCategory,
    event: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.session) return;

    const entry: DiagEvent = {
      ts: Math.round(performance.now() - this.startMs),
      wallTime: new Date().toISOString(),
      category,
      event,
      ...(data ? { data } : {})
    };

    this.session.events.push(entry);

    // Mirror to console when active so devtools stay useful
    console.debug(`[Diagnostics] [${category}] ${event}`, data ?? '');
  }

  /** Manually download the current session without stopping it. */
  download(session?: DiagSession): void {
    const target = session ?? this.session;
    if (!target) {
      console.warn('[Diagnostics] No active session to download.');
      return;
    }

    const blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fossflow-diag-${target.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Singleton — import this wherever you need to log diagnostic events. */
export const diagLogger = new DiagLogger();
