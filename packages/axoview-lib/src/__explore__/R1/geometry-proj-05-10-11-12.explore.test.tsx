/**
 * R1 / PROJ-05, PROJ-10, PROJ-11, PROJ-12 — where the DRAWN footprint and the
 * HIT footprint are derived by two different routes.
 *
 * `useIsoProjection` is a hook, so PROJ-05 renders it under a real
 * `UiStateProvider` + `CanvasModeProvider` with the exact arguments
 * `TextBox.tsx` passes — probing the product's own composition rather than a
 * re-derivation of it. PROJ-10/11/12 are pure.
 *
 * Rig rules: every `it.failing` is paired with a passing characterization, and
 * each block asserts its precondition (the canvas mode really switched, the
 * text box really is multi-row, the item really carries an offset) before any
 * conclusion is drawn.
 */
import { installCanvasStub } from 'src/__explore__/canvasStub';

installCanvasStub();

/* eslint-disable import/first */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { CanvasModeProvider, useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import { getItemAtTile } from 'src/utils/hitDetection';
import {
  getRenderedAreaFootprint,
  getRenderedTileFootprint,
  footprintContainsPoint,
  tileFootprintAt
} from 'src/utils/renderedGeometry';
import {
  makeTilePositionFn,
  getStrategy
} from 'src/utils/coordinateTransforms';
import { connectorEndpointVertexDelta } from 'src/utils/resolvePlacement';
import { getTextBoxEndTile, getTextBoxDimensions } from 'src/utils/isoMath';
import { resolveRenderOrder } from 'src/utils/renderOrder';
import * as fs from 'fs';
import * as path from 'path';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import { textBox } from './harness';
/* eslint-enable import/first */

const twoDTilePos = makeTilePositionFn(getStrategy('2D'));
const isoTilePos = makeTilePositionFn(getStrategy('ISOMETRIC'));

// ---------------------------------------------------------------------------
// PROJ-05 — the 2D Y-orientation text box
// ---------------------------------------------------------------------------

const Providers = ({ children }: { children: React.ReactNode }) => (
  <UiStateProvider>
    <CanvasModeProvider>{children}</CanvasModeProvider>
  </UiStateProvider>
);

/** Exactly the arguments `TextBox.tsx` passes to `useIsoProjection`. */
const useTextBoxProjection = (
  tb: ReturnType<typeof textBox>,
  size: { width: number; height: number }
) => {
  const { strategy } = useCanvasMode();
  const isTwoDY = strategy.projectionName === '2D' && tb.orientation === 'Y';
  const from = isTwoDY ? tb.tile : { x: tb.tile.x, y: tb.tile.y - (size.height - 1) };
  const to = { x: tb.tile.x + size.width, y: tb.tile.y };
  const originOverride =
    isTwoDY || tb.orientation !== 'Y'
      ? undefined
      : { x: tb.tile.x + (size.height - 1), y: tb.tile.y };
  return {
    projection: useIsoProjection({ from, to, originOverride, orientation: tb.orientation }),
    uiStateApi: useUiStateStoreApi(),
    projectionName: strategy.projectionName
  };
};

describe('PROJ-05 — 2D Y-orientation text box: drawn box vs hit box', () => {
  const MULTILINE = '<p>aaaa</p><p>bbbb</p><p>cccc</p><p>dddd</p>';
  const tb = textBox({
    id: 'tb-y',
    tile: { x: 0, y: 0 },
    orientation: 'Y',
    content: MULTILINE
  });
  const size = getTextBoxDimensions(tb);

  const render2D = () => {
    const r = renderHook(() => useTextBoxProjection(tb, size), {
      wrapper: Providers
    });
    act(() => {
      r.result.current.uiStateApi.getState().actions.setCanvasMode('2D');
    });
    return r;
  };

  it('PRECONDITION: the box is multi-row and the store really switched to 2D', () => {
    expect(size.height).toBeGreaterThan(1);
    const r = render2D();
    expect(r.result.current.projectionName).toBe('2D');
    expect(r.result.current.uiStateApi.getState().canvasMode).toBe('2D');
  });

  it('characterization: the drawn wrapper is ALWAYS 1 tile thick in 2D-Y', () => {
    const r = render2D();
    const { pxSize } = r.result.current.projection;
    // TextBox.tsx drops size.height for the 2D-Y branch, so the pre-rotation
    // box is (width+1) x 1 tiles and the rotation makes it 1 x (width+1).
    expect(pxSize.height).toBe(UNPROJECTED_TILE_SIZE);
    expect(pxSize.width).toBe((size.width + 1) * UNPROJECTED_TILE_SIZE);
    expect(r.result.current.projection.css.transform).toBe(
      `translateX(${UNPROJECTED_TILE_SIZE}px) rotate(90deg)`
    );
  });

  it('characterization: the hit box claims size.height tiles of thickness', () => {
    const end = getTextBoxEndTile(tb, size);
    // Y orientation: end = tile + { x: rows, y: -width }.
    expect(end.x).toBe(tb.tile.x + (size.height - 1));
    expect(end.y).toBe(tb.tile.y - size.width);
  });

  it.failing('BUG: the hit box is size.height tiles wide, the drawing 1 tile', () => {
    const r = render2D();
    const { pxSize } = r.result.current.projection;
    // Rotated wrapper thickness (the x extent the user sees) …
    const drawnThickness = pxSize.height;
    // … vs the thickness the tile range claims.
    const end = getTextBoxEndTile(tb, size);
    const hitThickness =
      (Math.abs(end.x - tb.tile.x) + 1) * UNPROJECTED_TILE_SIZE;
    expect(drawnThickness).toBe(hitThickness);
  });

  it.failing('BUG: a click 2 tiles beside the drawn box still selects it', () => {
    const end = getTextBoxEndTile(tb, size);
    const textBoxEnd = { x: Math.ceil(end.x), y: Math.floor(end.y) };
    const hit = getRenderedAreaFootprint(
      tb.tile,
      textBoxEnd,
      undefined,
      twoDTilePos,
      '2D'
    );
    // A point two tiles to the RIGHT of the anchor: outside the 1-tile-thick
    // drawing, inside the claimed tile range.
    const probe = {
      x: twoDTilePos({ tile: { x: tb.tile.x + 2, y: tb.tile.y } }).x,
      y: twoDTilePos({ tile: tb.tile }).y
    };
    expect(footprintContainsPoint(hit, probe)).toBe(false);
  });

  it('X orientation in 2D has no such gap (the branch is Y-only)', () => {
    const tbx = textBox({
      id: 'tb-x',
      tile: { x: 0, y: 0 },
      orientation: 'X',
      content: MULTILINE
    });
    const sizeX = getTextBoxDimensions(tbx);
    const r = renderHook(() => useTextBoxProjection(tbx, sizeX), {
      wrapper: Providers
    });
    act(() => {
      r.result.current.uiStateApi.getState().actions.setCanvasMode('2D');
    });
    expect(r.result.current.projection.pxSize.height).toBe(
      sizeX.height * UNPROJECTED_TILE_SIZE
    );
  });
});

// ---------------------------------------------------------------------------
// PROJ-10 — hit order vs paint order
// ---------------------------------------------------------------------------

describe('PROJ-10 — itemAtPoint resolves by array order, not paint order', () => {
  // Two items sharing one tile (reachable with `collides: false`, ADR 0023).
  // `onTop` carries zIndex 5, so NodesCanvas paints it LAST — it is the one the
  // user sees. It is FIRST in the items array.
  const onTop = { id: 'onTop', tile: { x: 0, y: 0 }, zIndex: 5 };
  const underneath = { id: 'underneath', tile: { x: 0, y: 0 }, zIndex: 0 };
  const scene = {
    items: [onTop, underneath],
    textBoxes: [],
    hitConnectors: [],
    // Same two ids as rectangles, to show getItemAtTile DOES sort this branch.
    rectangles: [
      { id: 'rectTop', from: { x: 9, y: 9 }, to: { x: 10, y: 10 }, zIndex: 5 },
      { id: 'rectUnder', from: { x: 9, y: 9 }, to: { x: 10, y: 10 }, zIndex: 0 }
    ]
  };
  const centre = isoTilePos({ tile: { x: 0, y: 0 } });

  const orderOf = (n: { tile: { x: number; y: number }; zIndex?: number }) =>
    resolveRenderOrder(0, n.zIndex ?? 0, -n.tile.x - n.tile.y);

  it('PRECONDITION: both items contain the probe point AND paint order is known', () => {
    const a = getRenderedTileFootprint(onTop, isoTilePos, 'ISOMETRIC');
    const b = getRenderedTileFootprint(underneath, isoTilePos, 'ISOMETRIC');
    expect(footprintContainsPoint(a, centre)).toBe(true);
    expect(footprintContainsPoint(b, centre)).toBe(true);
    // NodesCanvas sorts ascending by resolveRenderOrder and paints in order, so
    // the HIGHER value is painted last = visually on top.
    expect(orderOf(onTop)).toBeGreaterThan(orderOf(underneath));
  });

  it('characterization: the LAST array entry wins the hit, whatever its zIndex', () => {
    const hit = getItemAtTile({
      tile: { x: 0, y: 0 },
      scene,
      canvasMode: 'ISOMETRIC',
      point: centre
    });
    expect(hit).toEqual({ type: 'ITEM', id: 'underneath' });
  });

  it.failing('BUG: the click selects the item painted UNDERNEATH', () => {
    const hit = getItemAtTile({
      tile: { x: 0, y: 0 },
      scene,
      canvasMode: 'ISOMETRIC',
      point: centre
    });
    expect(hit).toEqual({ type: 'ITEM', id: 'onTop' });
  });

  it('SIBLING DRIFT: the same function DOES honour zIndex for rectangles', () => {
    const hit = getItemAtTile({
      tile: { x: 9, y: 9 },
      scene: { ...scene, items: [] },
      canvasMode: 'ISOMETRIC',
      point: isoTilePos({ tile: { x: 9, y: 9 } })
    });
    // Rectangles are explicitly re-sorted into paint order before the scan.
    expect(hit).toEqual({ type: 'RECTANGLE', id: 'rectTop' });
  });

  it('and swapping the array order flips the item verdict — proving order is the driver', () => {
    const hit = getItemAtTile({
      tile: { x: 0, y: 0 },
      scene: { ...scene, items: [underneath, onTop] },
      canvasMode: 'ISOMETRIC',
      point: centre
    });
    expect(hit).toEqual({ type: 'ITEM', id: 'onTop' });
  });
});

// ---------------------------------------------------------------------------
// PROJ-11 — iconScale vs the hit footprint
// ---------------------------------------------------------------------------

// VERDICT: FALSIFIED — the asymmetry the hypothesis predicted (hoverable but
// not clickable) does not exist, because HOVER is resolved by the same
// `getItemAtTile` call: outside the tile diamond there is no hover either. The
// tile-sized hit footprint is an explicit ADR 0044 §6 contract ("icon resize is
// visual-only — the node keeps a single-tile footprint for collision / hit /
// anchoring"), so the chrome-vs-hit difference is specified, not drifted. What
// IS true and worth stating: at 2.5x roughly six sevenths of the drawn icon is
// inert, and the hover outline is drawn over neighbours that are not hovered.
describe('PROJ-11 — a scaled icon keeps a one-tile hit footprint (by design)', () => {
  const SCALE = 2.5;
  const scaled = { id: 'big', tile: { x: 0, y: 0 } };
  const bareScene = {
    items: [scaled],
    textBoxes: [],
    hitConnectors: [],
    rectangles: []
  };

  it('PRECONDITION: tileFootprintAt takes no scale argument at all', () => {
    expect(tileFootprintAt.length).toBe(2); // (center, canvasMode)
    const fp = getRenderedTileFootprint(scaled, isoTilePos, 'ISOMETRIC');
    // Exactly the one-tile iso diamond, regardless of any icon scale.
    expect(fp.corners[1].x - fp.center.x).toBeCloseTo(70.75, 6);
  });

  it('a point inside the SCALED extent but outside the tile misses…', () => {
    const point = { x: 70.75 * SCALE * 0.9, y: 0 };
    expect(
      getItemAtTile({
        tile: { x: 2, y: 0 },
        scene: bareScene,
        canvasMode: 'ISOMETRIC',
        point
      })
    ).toBeNull();
  });

  it('…and that same miss is what suppresses the hover, so there is no asymmetry', () => {
    // Hover and click both go through getItemAtTile with the cursor point, so
    // a pixel that cannot be clicked cannot be hovered either.
    const point = { x: 70.75 * SCALE * 0.9, y: 0 };
    const asHover = getItemAtTile({
      tile: { x: 2, y: 0 },
      scene: bareScene,
      canvasMode: 'ISOMETRIC',
      point
    });
    const asClick = getItemAtTile({
      tile: { x: 2, y: 0 },
      scene: bareScene,
      canvasMode: 'ISOMETRIC',
      point,
      connectorMatch: 'exact'
    });
    expect(asHover).toEqual(asClick);
  });

  it('while a point inside the tile hits normally', () => {
    expect(
      getItemAtTile({
        tile: { x: 0, y: 0 },
        scene: bareScene,
        canvasMode: 'ISOMETRIC',
        point: { x: 10, y: 0 }
      })
    ).toEqual({ type: 'ITEM', id: 'big' });
  });
});

// ---------------------------------------------------------------------------
// PROJ-12 — connector endpoint at an off-grid node
// ---------------------------------------------------------------------------

describe('PROJ-12 — only the DOM connector shifts its endpoint to the offset node', () => {
  const OFFSET = { x: 37, y: -19 };
  const SRC = path.resolve(__dirname, '../../components/SceneLayers/Connectors');
  const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

  it('PRECONDITION: the helper itself is correct — it inverts the projection', () => {
    for (const mode of ['ISOMETRIC', '2D'] as const) {
      const d = connectorEndpointVertexDelta(mode, OFFSET);
      expect(d).not.toEqual({ x: 0, y: 0 });
      // The connector SVG's net map is -toScreen(vertex / TILE); applying it to
      // the delta must reproduce the original screen-plane offset exactly.
      const s = getStrategy(mode).toScreen(
        d.x / UNPROJECTED_TILE_SIZE,
        d.y / UNPROJECTED_TILE_SIZE,
        UNPROJECTED_TILE_SIZE
      );
      expect(-s.x).toBeCloseTo(OFFSET.x, 9);
      expect(-s.y).toBeCloseTo(OFFSET.y, 9);
    }
    expect(connectorEndpointVertexDelta('ISOMETRIC', OFFSET)).not.toEqual(
      connectorEndpointVertexDelta('2D', OFFSET)
    );
  });

  it('characterization: the DOM path applies it, the WebGL bulk path does not', () => {
    // Both files exist and are the two renderers of the same connector body.
    const dom = read('Connector.tsx');
    const gpu = read('ConnectorsCanvas.tsx');
    expect(dom).toContain('connectorEndpointVertexDelta');
    expect(dom).toContain('endpointDeltas');
    expect(gpu).not.toContain('connectorEndpointVertexDelta');
    expect(gpu).not.toContain('endpointDeltas');
    // The GPU path maps every path tile straight through the projection.
    expect(gpu).toContain('connectorPathTileToGlobal');
    // …and never reads a view item's offset at all.
    expect(/viewItem[^\n]*offset/.test(gpu)).toBe(false);
  });

  it.failing('BUG: the two paths place the endpoint a full offset apart', () => {
    // GPU endpoint: the bare tile projection.
    const gpuEndpoint = isoTilePos({ tile: { x: 4, y: 4 } });
    // DOM endpoint: the same vertex shifted by the delta, which the SVG's
    // -toScreen map turns back into exactly `OFFSET` on screen.
    const domEndpoint = { x: gpuEndpoint.x + OFFSET.x, y: gpuEndpoint.y + OFFSET.y };
    const gap = Math.hypot(
      domEndpoint.x - gpuEndpoint.x,
      domEndpoint.y - gpuEndpoint.y
    );
    // Selecting the connector promotes it DOM-side (Renderer connectorHybridIds)
    // — the wire must not move when that happens.
    expect(gap).toBeLessThan(0.5);
  });

  it('the gap is exactly the node offset, so it is visible at any zoom', () => {
    expect(Math.hypot(OFFSET.x, OFFSET.y)).toBeCloseTo(41.59, 2);
  });
});
