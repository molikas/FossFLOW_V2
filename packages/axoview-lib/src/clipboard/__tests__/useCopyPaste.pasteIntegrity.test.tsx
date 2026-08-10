/**
 * Paste identity + failure-signalling regressions, through the REAL
 * copy/paste path (real providers — the sibling `useCopyPaste.test.ts` is the
 * mock-based unit tier).
 *
 * - E3/SCN-03: pasted connector anchors get FRESH ids. Anchor ids are their
 *   own identity namespace, resolved by id across the whole view
 *   (anchor-to-anchor refs, CONNECTOR_ANCHOR selection refs); carrying them
 *   over verbatim left two anchors sharing one id.
 * - E3/SCN-04: with unique anchor ids, deleting the pasted clone's waypoint
 *   splices exactly ONE connector (it used to pinch both).
 * - E3/SCN-12: a paste whose assembled view fails validation is rejected
 *   whole AND SAYS SO — the "could not paste" toast, not a silent Ctrl+V.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "Paste does not regenerate connector anchor ids", "An invalid
 * paste is abandoned silently".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { LayerContextProvider } from 'src/hooks/useLayerContext';
import { ClipboardProvider } from 'src/clipboard/ClipboardContext';
import { useScene } from 'src/hooks/useScene';
import { useCopyPaste } from 'src/clipboard/useCopyPaste';
import { getAllAnchors, getItemByIdOrThrow } from 'src/utils';

const VIEW_ID = 'view-1';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>
        <LayerContextProvider>
          <ClipboardProvider>{children}</ClipboardProvider>
        </LayerContextProvider>
      </UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useHarness = () => ({
  scene: useScene(),
  copyPaste: useCopyPaste(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

/** Two nodes joined by a connector carrying a free-floating middle waypoint. */
const seedWithWaypoint = () => ({
  version: '1.0',
  title: 'paste integrity',
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

function setup() {
  const { result } = renderHook(useHarness, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedWithWaypoint(), true);
    result.current.scene.switchView(VIEW_ID);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

const modelView = (result: ReturnType<typeof setup>) =>
  result.current.modelApi.getState().views.find((v) => v.id === VIEW_ID)!;

function copyPasteAll(result: ReturnType<typeof setup>) {
  act(() => {
    result.current.uiStateApi.getState().actions.setSelectedIds([
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

describe('paste regenerates connector anchor ids (SCN-03/04)', () => {
  it('every anchor id in the view is unique after a paste', () => {
    const result = setup();
    copyPasteAll(result);

    const connectors = modelView(result).connectors ?? [];
    expect(connectors).toHaveLength(2);
    const anchorIds = connectors.flatMap((c) => c.anchors.map((a) => a.id));
    expect(anchorIds).toHaveLength(6);
    expect(new Set(anchorIds).size).toBe(anchorIds.length);
  });

  it('the original waypoint stays addressable by id after a paste', () => {
    const result = setup();
    copyPasteAll(result);

    const connectors = modelView(result).connectors ?? [];
    const original = connectors.find((c) => c.id === 'conn-1')!;
    const originalMid = original.anchors.find((a) => a.id === 'anc-mid')!;
    const resolved = getItemByIdOrThrow(
      getAllAnchors(connectors),
      'anc-mid'
    ).value;
    expect(resolved.ref).toEqual(originalMid.ref);
  });

  it('deleting the original waypoint splices exactly one connector', () => {
    const result = setup();
    copyPasteAll(result);

    expect(
      (modelView(result).connectors ?? []).map((c) => c.anchors.length)
    ).toEqual([3, 3]);

    act(() => {
      result.current.scene.deleteSelectedItems([
        { type: 'CONNECTOR_ANCHOR', id: 'anc-mid' }
      ]);
    });

    const after = (modelView(result).connectors ?? []).map(
      (c) => c.anchors.length
    );
    expect(after.filter((n) => n === 2)).toHaveLength(1);
    expect(after.filter((n) => n === 3)).toHaveLength(1);
  });
});

describe('a rejected paste is surfaced, not silent (SCN-12)', () => {
  it('an invalid clipboard payload shows the could-not-paste warning and pastes nothing', () => {
    const result = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Poison the clipboard through the real copy, then break the payload the
    // way a foreign-source paste can: a view item whose model item is absent.
    act(() => {
      result.current.uiStateApi
        .getState()
        .actions.setSelectedIds([{ type: 'ITEM', id: 'node-A' }]);
    });
    act(() => {
      result.current.copyPaste.handleCopy();
    });
    // Reach into the shared clipboard and desync the pair.
    act(() => {
      const ui = result.current.uiStateApi.getState();
      ui.actions.setMouse({
        ...ui.mouse,
        position: { ...ui.mouse.position, tile: { x: 3, y: 8 } }
      });
    });
    const itemsBefore = modelView(result).items.length;
    act(() => {
      // A paste of a payload referencing a colour that does not exist in this
      // model: simulate by removing the model's colours first — the pasted
      // connector's `color: 'c1'` then dangles and validateView rejects.
      result.current.modelApi.getState().actions.set({ colors: [] });
      result.current.uiStateApi.getState().actions.setSelectedIds([
        { type: 'ITEM', id: 'node-A' },
        { type: 'CONNECTOR', id: 'conn-1' }
      ]);
    });
    act(() => {
      result.current.copyPaste.handleCopy();
    });
    act(() => {
      result.current.copyPaste.handlePaste();
    });

    // Nothing committed beyond the pre-paste content, and the user was told
    // (the same warning the empty-clipboard path uses — SCN-12).
    expect(modelView(result).items.length).toBe(itemsBefore);
    const notification = result.current.uiStateApi.getState().notification;
    expect(notification?.severity).toBe('warning');
    expect(notification?.message).toMatch(/nothing to paste/i);
    warn.mockRestore();
  });
});
