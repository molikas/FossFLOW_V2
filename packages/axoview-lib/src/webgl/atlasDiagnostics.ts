import type { SpriteBatch } from 'src/webgl/glSpriteBatch';

/**
 * Is the debug surface exposed for this session?
 *
 * This OBSERVES the debug bridge rather than recomputing the condition
 * `Axoview.tsx` uses (`enableDebugTools || exposeStoreBridge || NODE_ENV !==
 * 'production'`). Recomputing it here would need `exposeStoreBridge` threaded
 * into every canvas, and would drift the day that expression changes; checking
 * for the bridge itself cannot drift, because the bridge IS the expression's
 * output.
 *
 * The `NODE_ENV` disjunct is kept because the bridge is installed from an
 * effect, so it is briefly absent on a first paint — in dev (where every
 * harness runs) the stats should publish from the very first build.
 */
const debugSurfaceExposed = (): boolean =>
  process.env.NODE_ENV !== 'production' ||
  (typeof window !== 'undefined' && '__axoview__' in window);

/**
 * Publish a GPU layer's atlas occupancy onto its canvas element, for the
 * R3/GPU-13 §4 measurement (does one merged node+label chip atlas fit at ADR
 * 0038 §6's clamps?) and for diagnosing an `atlasFull` degradation in the wild.
 *
 * Diagnostics, not a contract: nothing in the product reads these. They are
 * written at the END of a geometry build, alongside `data-build-count`, so they
 * inherit that cadence exactly and add nothing per frame (ADR 0038 §5).
 * `atlasStats()` itself only reads the shelf packer's cursor — no GL round-trip.
 */
export const publishAtlasStats = (
  canvas: HTMLCanvasElement,
  batch: SpriteBatch
): void => {
  if (!debugSurfaceExposed()) return;
  const s = batch.atlasStats();
  canvas.dataset.atlasSize = String(s.size);
  canvas.dataset.atlasUsedRows = String(s.usedRows);
  canvas.dataset.atlasSlots = String(s.slots);
  canvas.dataset.atlasFull = String(s.full);
};
