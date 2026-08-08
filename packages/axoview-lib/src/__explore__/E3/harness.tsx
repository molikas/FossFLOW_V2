/**
 * Shared T1 harness for area E3 probes
 * (docs/reviews/exploratory-2026-07/areas/E3-scene-actions-paste.md).
 *
 * E3's subject is `useSceneActions`, so probes need the real provider tree.
 * This extends the E1 harness with a paste payload builder and rAF control
 * (computePathsAsync schedules its batches on requestAnimationFrame).
 *
 * Not a spec file — `jest.explore.config.js` only matches `*.explore.test.tsx`.
 */
import React from 'react';
import { act } from '@testing-library/react';
import type { PastePayload } from 'src/clipboard/clipboard';
import { ClipboardProvider } from 'src/clipboard/ClipboardContext';
import { Providers as StoreProviders } from '../E1/harness';

/**
 * The E1 provider tree plus the instance-scoped clipboard, so probes can drive
 * the REAL `useCopyPaste` rather than a mock. Without this `useClipboard`
 * throws at render — and a throwing render makes an `it.failing` probe report
 * as a confirmed bug (the same trap `canvasStub` guards against).
 */
export const ClipboardProviders = ({
  children
}: {
  children: React.ReactNode;
}) => (
  <StoreProviders>
    <ClipboardProvider>{children}</ClipboardProvider>
  </StoreProviders>
);

export {
  Providers,
  useTestHarness,
  setup,
  modelView,
  historyDepths,
  orphanSceneConnectors,
  pathlessModelConnectors,
  drawConnector,
  placeIcon,
  seqs,
  VIEW_ID,
  act
} from '../E1/harness';

/**
 * Drains queued rAF callbacks. jsdom implements requestAnimationFrame on a
 * ~16 ms timer, so probes install fake timers and pump them here;
 * `computePathsAsync` re-schedules itself per 25-connector batch.
 */
export function flushAnimationFrames(rounds = 10) {
  for (let i = 0; i < rounds; i += 1) {
    act(() => {
      jest.advanceTimersByTime(20);
    });
  }
}

/** A paste payload with `count` nodes and a connector chaining each pair. */
export function makePastePayload(count = 2, prefix = 'p'): PastePayload {
  const items = Array.from({ length: count }, (_, i) => ({
    modelItem: { id: `${prefix}-item-${i}`, name: `P${i}`, icon: 'block' },
    viewItem: { id: `${prefix}-item-${i}`, tile: { x: 10 + i, y: 10 } }
  }));

  const connectors = Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
    id: `${prefix}-conn-${i}`,
    color: 'c1',
    anchors: [
      { id: `${prefix}-conn-${i}-a1`, ref: { item: `${prefix}-item-${i}` } },
      { id: `${prefix}-conn-${i}-a2`, ref: { item: `${prefix}-item-${i + 1}` } }
    ]
  }));

  return {
    items,
    connectors,
    rectangles: [],
    textBoxes: [],
    labels: [],
    centroid: { x: 10, y: 10 }
  } as unknown as PastePayload;
}
