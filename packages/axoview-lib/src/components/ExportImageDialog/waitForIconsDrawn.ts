// A2: the export snapshots the hidden Axoview's WebGL2 bulk canvas, but icon
// bitmaps decode asynchronously (SceneCanvas.getImage creates an Image and only
// paints it once decoded). Waiting on model-ready + one rAF isn't enough — the
// first frame can paint before any icon has decoded, dropping every icon node
// from the capture (connector bodies carry no async assets, so they draw on the
// first GPU build). `SceneCanvas` publishes `data-all-icons-drawn="true"` once a
// frame painted with every icon bitmap available; poll that here before capturing.
//
// R3/GPU-13: this follows the MERGED canvas (`axoview-scene-canvas`). Before the
// merge the flag lived on `axoview-nodes-canvas`, one of four; export now
// composites a single canvas (ADR 0038 §8), and this is the product-code consumer
// of the merged test id.
//
// Resolves true once the canvas is mounted AND reports ready; false once the
// timeout elapses (so export never hangs — the caller captures anyway, then
// recaptures). See ExportImageDialog's capture effect.
//
// `minNodesDrawn` (QA #10, CI regression on the merged canvas): `data-all-icons-drawn`
// is VACUOUSLY "true" on any paint whose build saw no node with a pending icon —
// including the mount-time paints that precede the export scene's content build.
// A poll that lands on one of those frames reported "ready", the caller captured
// a background-only frame AND (because ready was true) skipped its recapture, so
// the blank stuck for good. Deterministic on CI, where the first content build
// consistently loses that race (measured: EXPORT_TIMELINE, run 31330358840).
// Requiring `data-nodes-drawn` ≥ the caller's expectation makes "all icons drawn"
// unable to mean "no build has looked at an icon yet".
export const waitForIconsDrawn = (
  container: HTMLElement | null,
  timeoutMs: number,
  minNodesDrawn = 0
): Promise<boolean> =>
  new Promise((resolve) => {
    const start = performance.now();
    const poll = () => {
      const canvas = container?.querySelector<HTMLElement>(
        '[data-testid="axoview-scene-canvas"]'
      );
      // Ready only when the canvas is mounted AND a frame painted with every
      // icon bitmap available AND that build actually included the nodes the
      // caller expects (absent `data-nodes-drawn` counts as 0 — not yet built).
      if (
        canvas &&
        canvas.dataset.allIconsDrawn === 'true' &&
        Number(canvas.dataset.nodesDrawn ?? '0') >= minNodesDrawn
      ) {
        resolve(true);
        return;
      }
      // Timed out → capture anyway (best effort); the caller's recapture pass
      // tries once more after a longer wait. Reached when the canvas never drew
      // in time OR there is genuinely no canvas (a DOM-only render).
      if (performance.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      // QA #10: a not-yet-mounted canvas must NOT short-circuit to "ready". The
      // hidden export Axoview can mount a tick after axoviewReadySignal fires
      // (more so on slower/deployed mounts); treating an absent canvas as
      // "nothing to wait for" resolved true immediately, captured a blank frame
      // before SceneCanvas existed, AND (because it returned true) made the
      // caller skip its recapture — so the icons were dropped for good. Keep
      // polling until the canvas mounts and draws, or the timeout fires (which
      // resolves false and DOES trigger the recapture).
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
