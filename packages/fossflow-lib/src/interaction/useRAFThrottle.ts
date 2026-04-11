import { useCallback, useRef } from 'react';
import { Mouse, SlimMouseEvent } from 'src/types';

export interface PendingMouseUpdate {
  mouse: Mouse;
  event: SlimMouseEvent;
}

/**
 * RAF-throttled mouse update scheduler.
 *
 * Schedules the most recent mouse update to be processed on the next animation
 * frame. If multiple updates arrive before a frame fires, only the last one
 * is applied (latest position wins). Calling cleanup() cancels any pending
 * frame and releases all held references.
 */
export const useRAFThrottle = () => {
  const rafIdRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<PendingMouseUpdate | null>(null);
  const callbackRef = useRef<((update: PendingMouseUpdate) => void) | null>(
    null
  );

  const scheduleUpdate = useCallback(
    (
      mouse: Mouse,
      event: SlimMouseEvent,
      callback: (update: PendingMouseUpdate) => void
    ) => {
      pendingUpdateRef.current = { mouse, event };
      callbackRef.current = callback;

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingUpdateRef.current && callbackRef.current) {
            callbackRef.current(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }
        });
      }
    },
    []
  );

  const flushUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingUpdateRef.current && callbackRef.current) {
      callbackRef.current(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingUpdateRef.current = null;
    callbackRef.current = null; // release callback reference (prevents GC leak)
  }, []);

  return { scheduleUpdate, flushUpdate, cleanup };
};
