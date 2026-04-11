/**
 * REGRESSION — ExportImageDialog: blank preview on first open
 *
 * Root cause: the old code fired exportImage() after a fixed 100 ms
 * setTimeout + double rAF on mount, before Isoflow's model store was
 * populated. The capture ran against an empty canvas (just the blue
 * background), producing a blank PNG. Toggling a checkbox re-triggered
 * the export after Isoflow had been running for seconds — which is why
 * it worked on the second attempt.
 *
 * Fix: use onModelUpdated on the hidden Isoflow as a "ready" signal.
 * isoflowLoadedRef is set on the FIRST call and never again, so
 * subsequent onModelUpdated callbacks (options changes) do not re-trigger
 * the initial load path.
 *
 * This test reads ExportImageDialog.tsx source and pins the structural
 * constraints that make the fix correct and non-regressing.
 */

import * as fs from 'fs';
import * as path from 'path';

const DIALOG_PATH = path.resolve(
  __dirname,
  '../components/ExportImageDialog/ExportImageDialog.tsx'
);

describe('ExportImageDialog — initial load fix', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(DIALOG_PATH, 'utf-8');
  });

  it('ExportImageDialog.tsx exists', () => {
    expect(fs.existsSync(DIALOG_PATH)).toBe(true);
  });

  it('declares isoflowLoadedRef to gate the ready signal', () => {
    expect(src).toContain('isoflowLoadedRef');
  });

  it('declares isoflowReadySignal state to trigger the initial export effect', () => {
    expect(src).toContain('isoflowReadySignal');
  });

  it('uses handleHiddenIsoflowReady as the onModelUpdated callback', () => {
    expect(src).toContain('handleHiddenIsoflowReady');
    expect(src).toContain('onModelUpdated={handleHiddenIsoflowReady}');
  });

  it('isoflowLoadedRef guard prevents multiple initial exports', () => {
    // The handler must check the ref before setting it — ensures only the
    // first onModelUpdated call triggers the export, not subsequent ones
    // from option-change re-renders.
    expect(src).toContain('if (!isoflowLoadedRef.current)');
    expect(src).toContain('isoflowLoadedRef.current = true');
  });

  it('initial-load effect depends on isoflowReadySignal, not on exportImage directly', () => {
    // The initial export effect must list isoflowReadySignal in its deps.
    // If it listed exportImage it would re-fire on every option change.
    expect(src).toContain('[isoflowReadySignal]');
  });

  it('initial-load effect guards on isoflowReadySignal === 0 to skip on mount', () => {
    expect(src).toContain('isoflowReadySignal === 0');
  });

  it('options-change effect is guarded by isoflowLoadedRef.current', () => {
    // Re-export on options change must not fire until the initial load
    // has already completed — prevents a race where options-change fires
    // on mount before Isoflow is ready.
    expect(src).toContain('isoflowLoadedRef.current');
    // The guard must appear inside the options-change effect body
    const optionsEffectMatch =
      src.match(
        /if \(!isoflowLoadedRef\.current[^)]*\|[^)]*cropToContent\) return/
      ) ||
      src.match(/if \(!isoflowLoadedRef\.current \|\| cropToContent\) return/);
    expect(optionsEffectMatch).not.toBeNull();
  });

  it('uses exportImageRef to call the latest exportImage without dep-array churn', () => {
    expect(src).toContain('exportImageRef');
    expect(src).toContain('exportImageRef.current = exportImage');
    expect(src).toContain('exportImageRef.current()');
  });

  it('hidden Isoflow is always mounted (not gated on !imageData)', () => {
    // The Isoflow for export must always remain mounted so onModelUpdated
    // fires even while the loading spinner is shown.
    // If the component were inside `{!imageData && ...}` it would unmount
    // as soon as the first export completes, making re-exports impossible.
    const isoflowBlock = src.indexOf('key="export-dialog-isoflow"');
    const imageDataGate = src.indexOf('{!imageData && (');
    // The hidden Isoflow must come BEFORE the imageData gate, i.e. it is
    // unconditionally rendered.
    expect(isoflowBlock).toBeGreaterThan(0);
    expect(imageDataGate).toBeGreaterThan(0);
    expect(isoflowBlock).toBeLessThan(imageDataGate);
  });
});
