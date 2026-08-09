/**
 * E3 probes — SCN-03 (paste does not regenerate connector anchor ids) and
 * SCN-04 (the resulting id collision makes one waypoint delete hit two
 * connectors).
 *
 * These drive the REAL paste path — `useCopyPaste.handlePaste` remaps entity
 * ids through `idMap` but rebuilds anchors with `{...anchor, ref}`, keeping the
 * original `anchor.id`.
 *
 * See the retired E3-scene-actions-paste area file (git history) — summary in docs/reviews/exploratory-2026-07.md.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { installCanvasStub } from '../canvasStub';
import {
  ClipboardProviders,
  useTestHarness,
  act,
  modelView,
  VIEW_ID
} from './harness';
import { useCopyPaste } from 'src/clipboard/useCopyPaste';
import { getAllAnchors, getItemByIdOrThrow } from 'src/utils';

installCanvasStub();

const useHarness = () => ({ ...useTestHarness(), copyPaste: useCopyPaste() });

/**
 * Two nodes joined by a connector that carries a free-floating middle waypoint —
 * the shape Alt+click produces (ADR 0006).
 */
const seedWithWaypoint = () => ({
  version: '1.0',
  title: 'E3 probe',
  icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [
    {
      id: VIEW_ID,
      name: 'Page 1',
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 6, y: 0 } }
      ],
      connectors: [
        {
          id: 'conn-1',
          color: 'c1',
          anchors: [
            { id: 'anc-start', ref: { item: 'node-A' } },
            { id: 'anc-mid', ref: { tile: { x: 3, y: 2 } } },
            { id: 'anc-end', ref: { item: 'node-B' } }
          ]
        }
      ],
      rectangles: [],
      textBoxes: []
    }
  ]
});

function setupPaste() {
  const { result } = renderHook(useHarness, { wrapper: ClipboardProviders });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedWithWaypoint(), true);
    result.current.scene.switchView(VIEW_ID);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

/** Selects everything, copies, then pastes at a shifted mouse tile. */
function copyPasteAll(result: ReturnType<typeof setupPaste>) {
  act(() => {
    const ui = result.current.uiStateApi.getState();
    ui.actions.setSelectedIds([
      { type: 'ITEM', id: 'node-A' },
      { type: 'ITEM', id: 'node-B' },
      { type: 'CONNECTOR', id: 'conn-1' }
    ]);
  });
  act(() => {
    result.current.copyPaste.handleCopy();
  });
  act(() => {
    const ui = result.current.uiStateApi.getState();
    ui.actions.setMouse({
      ...ui.mouse,
      position: { ...ui.mouse.position, tile: { x: 3, y: 8 } }
    });
  });
  act(() => {
    result.current.copyPaste.handlePaste();
  });
}

describe('SCN-03 — paste keeps the original connector anchor ids', () => {
  it('characterization: entity ids are remapped, anchor ids are not', () => {
    const result = setupPaste();
    copyPasteAll(result);

    const connectors = modelView(result).connectors ?? [];
    expect(connectors).toHaveLength(2);

    const ids = connectors.map((c) => c.id);
    expect(new Set(ids).size).toBe(2); // connector ids ARE fresh

    const anchorIds = connectors.flatMap((c) => c.anchors.map((a) => a.id));
    expect(anchorIds).toHaveLength(6);
    // …but every anchor id appears twice.
    expect(new Set(anchorIds).size).toBe(3);
  });

  it.failing('BUG: anchor ids must be unique within a view', () => {
    const result = setupPaste();
    copyPasteAll(result);

    const anchorIds = (modelView(result).connectors ?? []).flatMap((c) =>
      c.anchors.map((a) => a.id)
    );
    expect(new Set(anchorIds).size).toBe(anchorIds.length);
  });

  it('characterization: the id lookup is order-dependent — the ORIGINAL waypoint becomes unaddressable', () => {
    const result = setupPaste();
    copyPasteAll(result);

    const connectors = modelView(result).connectors ?? [];
    const pasted = connectors.find((c) => c.id !== 'conn-1')!;
    const original = connectors.find((c) => c.id === 'conn-1')!;

    // `getAllAnchors` is what every anchor-to-anchor ref (and every
    // CONNECTOR_ANCHOR selection ref) resolves through.
    const resolved = getItemByIdOrThrow(getAllAnchors(connectors), 'anc-mid')
      .value;

    // Paste unshifts, so the clone wins the lookup and the original's waypoint
    // can no longer be named by id at all. Which of the two "wins" is an
    // artefact of array order, not of intent.
    const pastedMid = pasted.anchors.find((a) => a.id === 'anc-mid')!;
    const originalMid = original.anchors.find((a) => a.id === 'anc-mid')!;
    expect(resolved.ref).toEqual(pastedMid.ref);
    expect(resolved.ref).not.toEqual(originalMid.ref);
  });
});

describe('SCN-04 — one waypoint delete hits both connectors', () => {
  it.failing(
    'BUG: deleting the pasted clone’s waypoint also splices the original’s',
    () => {
      const result = setupPaste();
      copyPasteAll(result);

      const before = (modelView(result).connectors ?? []).map(
        (c) => c.anchors.length
      );
      expect(before).toEqual([3, 3]);

      // Select the middle waypoint (the selection carries the anchor id only —
      // ADR 0006 CONNECTOR_ANCHOR refs are id-based) and delete it.
      act(() => {
        result.current.scene.deleteSelectedItems([
          { type: 'CONNECTOR_ANCHOR', id: 'anc-mid' }
        ]);
      });

      const after = (modelView(result).connectors ?? []).map(
        (c) => c.anchors.length
      );
      // Exactly one connector should have lost its waypoint.
      expect(after.filter((n) => n === 2)).toHaveLength(1);
      expect(after.filter((n) => n === 3)).toHaveLength(1);
    }
  );

  it('characterization: both connectors lose the waypoint in one delete', () => {
    const result = setupPaste();
    copyPasteAll(result);

    act(() => {
      result.current.scene.deleteSelectedItems([
        { type: 'CONNECTOR_ANCHOR', id: 'anc-mid' }
      ]);
    });

    expect(
      (modelView(result).connectors ?? []).map((c) => c.anchors.length)
    ).toEqual([2, 2]);
  });
});

void React;
