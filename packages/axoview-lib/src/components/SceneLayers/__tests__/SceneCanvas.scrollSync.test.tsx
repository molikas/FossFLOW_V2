import React from 'react';
import { render, act } from '@testing-library/react';
import {
  UiStateProvider,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import { ModelProvider } from 'src/stores/modelStore';
import { CanvasModeProvider } from 'src/contexts/CanvasModeContext';
import type { ViewItem } from 'src/types';
import { createSpriteBatch, type SpriteBatch } from 'src/webgl/glSpriteBatch';
import { SceneProvider } from 'src/stores/sceneStore';
import { SceneCanvas } from '../SceneCanvas';

// The bulk canvas is WebGL2-only (the Canvas2D fallback was removed with the
// GPU fold). jsdom has no WebGL2, so createSpriteBatch would return null and the
// layer would draw nothing — swap in a stub batch whose `render` we can observe.
// render(bw, bh, zoom·dpr, originXDev, originYDev, counterScale) is the WebGL
// analogue of the old Canvas2D setTransform: same transform, one draw call.
jest.mock('src/webgl/glSpriteBatch', () => ({
  ...jest.requireActual('src/webgl/glSpriteBatch'),
  createSpriteBatch: jest.fn()
}));

// ---------------------------------------------------------------------------
// Regression guard — canvas-pan "rubber-band" (shake-out 2026-06-23).
//
// The bug: the node canvas repainted via requestAnimationFrame on every scroll/zoom
// change. But the mouse-pan path runs `setScroll` INSIDE the useRAFThrottle rAF
// callback (useInteractionManager), so a *nested* requestAnimationFrame here only
// fires on the NEXT frame — while the DOM scene layers (Grid.tsx / SceneLayer.tsx)
// apply their CSS transform SYNCHRONOUSLY inside the very same store notification.
// The canvas node layer therefore trailed the grid / connectors / selected-node
// overlay by exactly one frame for the whole drag: the visible drift the user saw.
//
// The fix (now SceneCanvas.tsx): when scroll or zoom changes, repaint synchronously
// (drawNow) in the same store tick as the DOM layers, instead of scheduling a rAF.
//
// Why this test is a true falsifier (not a green-test trap): it reproduces the
// live failure window by stubbing requestAnimationFrame so it NEVER auto-runs.
// The only way a `batch.render` can be observed after a store change is the
// synchronous path. On the pre-fix code the draw was deferred to that
// never-flushed rAF, so no synchronous render carrying the new scroll lands and
// the assertions below fail. They pass only because the canvas now paints in
// lockstep.
// ---------------------------------------------------------------------------

const UV = { u0: 0, v0: 0, uS: 1, vS: 1, page: 0 };

// Stub SpriteBatch — its `render` is the observation point; the atlas/instance
// methods are inert (empty scene). putCanvas/putImage return a valid UV so
// buildInstances never crashes on a non-empty scene either.
const makeStubBatch = () =>
  ({
    putCanvas: jest.fn(() => UV),
    putImage: jest.fn(() => UV),
    dot: UV,
    white: UV,
    beginInstances: jest.fn(),
    addSprite: jest.fn(),
    commitInstances: jest.fn(),
    // R2/GL-02: the layer asks after every build whether the atlas dropped a
    // chip, so it can schedule the one follow-up rebuild that compacts. A stub
    // that omits it throws where the real batch would answer "no".
    atlasOverflowed: jest.fn(() => false),
    // R3/GPU-13: the layer publishes atlas occupancy alongside
    // `data-build-count`. Same reason as `atlasOverflowed` above — a stub that
    // omits it throws where the real batch would just answer.
    atlasStats: jest.fn(() => ({
      size: 4096,
      usedRows: 0,
      slots: 0,
      full: false,
      pages: 1
    })),
    drawCallCount: jest.fn(() => 1),
    instanceCount: jest.fn(() => 0),
    render: jest.fn(),
    destroy: jest.fn()
  }) as unknown as jest.Mocked<SpriteBatch>;

// A throwaway 2D context is still created for measureText in the GL path; jsdom
// returns null for getContext, so hand back a minimal stub.
const createMockCtx = () =>
  ({
    measureText: jest.fn(() => ({ width: 0 })),
    save: jest.fn(),
    restore: jest.fn(),
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillText: jest.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic'
  });

describe('SceneCanvas — pan/zoom repaints synchronously (rubber-band regression)', () => {
  let stubBatch: ReturnType<typeof makeStubBatch>;
  let getContextSpy: jest.SpyInstance;
  let origRaf: typeof window.requestAnimationFrame;
  let origCancelRaf: typeof window.cancelAnimationFrame;
  let origDpr: number;
  let uiApi: ReturnType<typeof useUiStateStoreApi> | null = null;

  // Captures the live store API from inside the provider tree so the test can
  // drive setScroll / setZoom exactly as the interaction layer would.
  const Capture = () => {
    uiApi = useUiStateStoreApi();
    return null;
  };

  const renderCanvas = () =>
    render(
      <UiStateProvider>
        <ModelProvider>
          <SceneProvider>
            <CanvasModeProvider>
              <Capture />
              <SceneCanvas
                rectangles={[]}
                connectors={[]}
                nodes={[] as ViewItem[]}
                labels={[]}
              />
            </CanvasModeProvider>
          </SceneProvider>
        </ModelProvider>
      </UiStateProvider>
    );

  beforeEach(() => {
    stubBatch = makeStubBatch();
    (createSpriteBatch as jest.Mock).mockReturnValue(stubBatch);

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(createMockCtx() as unknown as CanvasRenderingContext2D);

    // Stub rAF to record-but-never-invoke: this is the crux. A returned-but-never
    // -run callback models "the next frame hasn't happened yet" — the exact window
    // in which the canvas used to lag the DOM. So any render we observe MUST be
    // synchronous. Direct assignment (not spyOn) so it works whether or not the
    // jsdom build defines rAF.
    origRaf = window.requestAnimationFrame;
    origCancelRaf = window.cancelAnimationFrame;
    let id = 0;
    window.requestAnimationFrame = jest.fn(
      () => ++id
    ) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame =
      jest.fn() as unknown as typeof window.cancelAnimationFrame;

    // Pin dpr so the expected transform is exact (jsdom leaves it undefined → 1).
    origDpr = window.devicePixelRatio;
    (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    (createSpriteBatch as jest.Mock).mockReset();
    window.requestAnimationFrame = origRaf;
    window.cancelAnimationFrame = origCancelRaf;
    (window as unknown as { devicePixelRatio: number }).devicePixelRatio =
      origDpr;
    uiApi = null;
  });

  it('repaints with the new scroll in the same tick as setScroll (no rAF deferral)', () => {
    renderCanvas();
    expect(uiApi).not.toBeNull();

    // Known renderer dims so the expected transform is exact. A rendererSize
    // change only schedules an rAF (scroll/zoom unchanged) → no draw runs here.
    act(() => {
      uiApi!.getState().actions.setRendererSize({ width: 800, height: 600 });
    });

    // Drop any mount-time bookkeeping; measure only what setScroll triggers.
    stubBatch.render.mockClear();

    act(() => {
      uiApi!.getState().actions.setScroll({
        position: { x: 123, y: 456 },
        offset: { x: 0, y: 0 }
      });
    });

    // A repaint happened synchronously — requestAnimationFrame was never flushed.
    // The canvas issued one instanced draw with the NEW scroll:
    //   render(bw, bh, zoom·dpr, (W/2 + scroll.x)·dpr, (H/2 + scroll.y)·dpr, …)
    // with zoom 0.65, dpr 1, W 800, H 600 → originX = 400 + 123 = 523,
    // originY = 300 + 456 = 756.
    expect(stubBatch.render).toHaveBeenCalled();
    expect(stubBatch.render).toHaveBeenCalledWith(
      800,
      600,
      0.65,
      523,
      756,
      expect.anything()
    );
  });

  it('repaints with the new zoom in the same tick as setZoom', () => {
    renderCanvas();
    act(() => {
      uiApi!.getState().actions.setRendererSize({ width: 800, height: 600 });
    });
    stubBatch.render.mockClear();

    act(() => {
      uiApi!.getState().actions.setZoom(2);
    });

    // zoom 2, dpr 1, scroll {0,0} → render(800, 600, 2, 400, 300, …).
    expect(stubBatch.render).toHaveBeenCalledWith(
      800,
      600,
      2,
      400,
      300,
      expect.anything()
    );
  });
});
