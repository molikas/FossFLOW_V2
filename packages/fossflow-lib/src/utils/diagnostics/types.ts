export type DiagEventCategory =
  | 'RENDER'
  | 'INTERACTION'
  | 'ICON_PLACEMENT'
  | 'LAYER'
  | 'STORE'
  | 'PERF'
  | 'INFO'
  | 'ERROR';

export interface DiagEvent {
  ts: number;          // ms since session start
  wallTime: string;    // ISO timestamp
  category: DiagEventCategory;
  event: string;
  data?: Record<string, unknown>;
}

export interface DiagSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  userAgent: string;
  appVersion: string;
  events: DiagEvent[];
  perfEntries?: PerformanceEntry[];
}
