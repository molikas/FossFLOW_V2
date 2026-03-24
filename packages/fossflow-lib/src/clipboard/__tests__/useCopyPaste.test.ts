/**
 * REGRESSION — useCopyPaste
 *
 * Key contracts under test:
 *  1. handleCopy — LASSO selection: items/connectors/rects/textboxes gathered, centroid computed
 *  2. handleCopy — itemControls single-item: only that item is copied
 *  3. handleCopy — empty selection: setClipboard NOT called, early return
 *  4. handleCopy — centroid includes rectangle midpoints and textbox tiles (not just icon nodes)
 *  5. handleCopy — connector auto-include: included when both item-anchors are in the selected set
 *  6. handlePaste — null clipboard: shows 'Nothing to paste' warning, no pasteItems call
 *  7. handlePaste — IDs are remapped: pasted items get new IDs distinct from originals
 *  8. handlePaste — orphan detach: connector anchor referencing an item NOT in clipboard loses item ref (converted to tile ref)
 *  9. handlePaste — offset: pasted tile = original tile + (mouse − centroid)
 * 10. handlePaste — sets CURSOR mode after paste
 * 11. handlePaste — connector tile waypoints are offset by the paste offset
 */

import { renderHook, act } from '@testing-library/react';
import { useCopyPaste } from '../useCopyPaste';

// ---------------------------------------------------------------------------
// Mock clipboard module — gives us full control over getClipboard/setClipboard
// ---------------------------------------------------------------------------
const mockSetClipboard = jest.fn();
let _mockClipboard: any = null;
const mockGetClipboard = jest.fn(() => _mockClipboard);

jest.mock('../clipboard', () => ({
  setClipboard: (...args: any[]) => mockSetClipboard(...args),
  getClipboard: () => mockGetClipboard(),
  hasClipboard: () => _mockClipboard !== null
}));

// ---------------------------------------------------------------------------
// Mock store & scene dependencies
// ---------------------------------------------------------------------------
const mockSetMode = jest.fn();
const mockSetNotification = jest.fn();
const mockSetItemControls = jest.fn();
const mockPasteItems = jest.fn();

const mockUiState = {
  mode: { type: 'CURSOR' as string, selection: null as any },
  itemControls: null as any,
  mouse: { position: { tile: { x: 10, y: 10 } } },
  actions: {
    setMode: mockSetMode,
    setNotification: mockSetNotification,
    setItemControls: mockSetItemControls
  }
};

jest.mock('src/stores/uiStateStore', () => ({
  useUiStateStoreApi: jest.fn(() => ({ getState: () => mockUiState }))
}));

const mockModelState = { items: [] as any[] };

jest.mock('src/stores/modelStore', () => ({
  useModelStoreApi: jest.fn(() => ({ getState: () => mockModelState }))
}));

const mockScene = {
  currentView: {
    items: [] as any[],
    connectors: [] as any[],
    rectangles: [] as any[],
    textBoxes: [] as any[]
  },
  pasteItems: mockPasteItems
};

jest.mock('src/hooks/useScene', () => ({
  useScene: jest.fn(() => mockScene)
}));

// Predictable IDs
let idCounter = 0;
jest.mock('src/utils', () => ({
  generateId: jest.fn(() => `new-id-${++idCounter}`)
}));

jest.mock('src/utils/findNearestUnoccupiedTile', () => ({
  findNearestUnoccupiedTilesForGroup: jest.fn(() => null) // passthrough — use target tiles as-is
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeModelItem(id: string) { return { id, name: 'Node' }; }
function makeViewItem(id: string, x: number, y: number) { return { id, tile: { x, y } }; }
function makeConnector(id: string, anchors: any[]) { return { id, anchors }; }
function setup() { return renderHook(() => useCopyPaste()); }

beforeEach(() => {
  jest.clearAllMocks();
  idCounter = 0;
  _mockClipboard = null;
  mockUiState.mode = { type: 'CURSOR', selection: null };
  mockUiState.itemControls = null;
  mockUiState.mouse.position.tile = { x: 10, y: 10 };
  mockModelState.items = [];
  mockScene.currentView = { items: [], connectors: [], rectangles: [], textBoxes: [] };
  // Re-bind mock so closure captures fresh _mockClipboard each test
  mockGetClipboard.mockImplementation(() => _mockClipboard);
  // setClipboard mock: also store into _mockClipboard so handlePaste can read it back
  mockSetClipboard.mockImplementation((payload: any) => { _mockClipboard = payload; });
});

// ---------------------------------------------------------------------------
// handleCopy
// ---------------------------------------------------------------------------
describe('useCopyPaste.handleCopy', () => {
  test('1. LASSO selection — items written to clipboard with correct centroid', () => {
    mockModelState.items = [makeModelItem('item-1'), makeModelItem('item-2')];
    mockScene.currentView.items = [makeViewItem('item-1', 4, 6), makeViewItem('item-2', 8, 10)];
    mockUiState.mode = {
      type: 'LASSO',
      selection: {
        items: [
          { type: 'ITEM', id: 'item-1' },
          { type: 'ITEM', id: 'item-2' }
        ]
      }
    } as any;

    const { result } = setup();
    act(() => { result.current.handleCopy(); });

    expect(mockSetClipboard).toHaveBeenCalledTimes(1);
    const payload = mockSetClipboard.mock.calls[0][0];
    expect(payload.items).toHaveLength(2);
    expect(payload.items.map((ci: any) => ci.viewItem.id).sort()).toEqual(['item-1', 'item-2']);
    // centroid: avg of (4,6) and (8,10) = (6,8)
    expect(payload.centroid).toEqual({ x: 6, y: 8 });
    expect(mockSetNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Copied 2 items' })
    );
  });

  test('2. itemControls single-item — only that item is copied', () => {
    mockModelState.items = [makeModelItem('solo')];
    mockScene.currentView.items = [makeViewItem('solo', 3, 3)];
    mockUiState.mode = { type: 'CURSOR', selection: null } as any;
    mockUiState.itemControls = { type: 'ITEM', id: 'solo' };

    const { result } = setup();
    act(() => { result.current.handleCopy(); });

    const payload = mockSetClipboard.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].viewItem.id).toBe('solo');
    expect(payload.centroid).toEqual({ x: 3, y: 3 });
  });

  test('3. empty selection — setClipboard NOT called, early return', () => {
    mockUiState.mode = { type: 'CURSOR', selection: null } as any;
    mockUiState.itemControls = null;

    const { result } = setup();
    act(() => { result.current.handleCopy(); });

    expect(mockSetClipboard).not.toHaveBeenCalled();
    expect(mockSetNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Copied') })
    );
  });

  test('4. centroid includes rectangle midpoints and textbox tiles', () => {
    // item at (0,0), rect midpoint (6,6), textbox at (6,2) → centroid (4,3)
    mockModelState.items = [makeModelItem('item-1')];
    mockScene.currentView.items = [makeViewItem('item-1', 0, 0)];
    mockScene.currentView.rectangles = [{ id: 'rect-1', from: { x: 4, y: 4 }, to: { x: 8, y: 8 } }];
    mockScene.currentView.textBoxes = [{ id: 'tb-1', tile: { x: 6, y: 2 } }];
    mockUiState.mode = {
      type: 'LASSO',
      selection: {
        items: [
          { type: 'ITEM', id: 'item-1' },
          { type: 'RECTANGLE', id: 'rect-1' },
          { type: 'TEXTBOX', id: 'tb-1' }
        ]
      }
    } as any;

    const { result } = setup();
    act(() => { result.current.handleCopy(); });

    const payload = mockSetClipboard.mock.calls[0][0];
    // allPoints = [(0,0), (6,6), (6,2)] → avg x=4, avg y=2.67→3
    expect(payload.centroid).toEqual({ x: 4, y: 3 });
  });

  test('5. connector auto-include when both item-anchors are in the selection', () => {
    mockModelState.items = [makeModelItem('item-1'), makeModelItem('item-2')];
    mockScene.currentView.items = [makeViewItem('item-1', 0, 0), makeViewItem('item-2', 2, 2)];
    mockScene.currentView.connectors = [
      makeConnector('conn-1', [
        { id: 'a1', ref: { item: 'item-1' } },
        { id: 'a2', ref: { item: 'item-2' } }
      ])
    ];
    mockUiState.mode = {
      type: 'LASSO',
      selection: {
        items: [
          { type: 'ITEM', id: 'item-1' },
          { type: 'ITEM', id: 'item-2' }
        ]
      }
    } as any;

    const { result } = setup();
    act(() => { result.current.handleCopy(); });

    const payload = mockSetClipboard.mock.calls[0][0];
    expect(payload.connectors).toHaveLength(1);
    expect(payload.connectors[0].id).toBe('conn-1');
  });
});

// ---------------------------------------------------------------------------
// handlePaste
// ---------------------------------------------------------------------------
describe('useCopyPaste.handlePaste', () => {
  test('6. null clipboard → warning notification, pasteItems NOT called', () => {
    _mockClipboard = null; // getClipboard() returns null

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    expect(mockPasteItems).not.toHaveBeenCalled();
    expect(mockSetNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Nothing to paste', severity: 'warning' })
    );
  });

  test('7. IDs are remapped — pasted items get new unique IDs', () => {
    _mockClipboard = {
      items: [{ modelItem: makeModelItem('orig-1'), viewItem: makeViewItem('orig-1', 5, 5) }],
      connectors: [],
      rectangles: [],
      textBoxes: [],
      centroid: { x: 5, y: 5 }
    };
    mockUiState.mouse.position.tile = { x: 5, y: 5 }; // offset = (0,0)

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    const call = mockPasteItems.mock.calls[0][0];
    expect(call.items[0].viewItem.id).not.toBe('orig-1');
    expect(call.items[0].modelItem.id).not.toBe('orig-1');
    // viewItem and modelItem get the same new ID
    expect(call.items[0].viewItem.id).toBe(call.items[0].modelItem.id);
  });

  test('8. orphan detach — anchor referencing item NOT in clipboard loses item ref', () => {
    _mockClipboard = {
      items: [{ modelItem: makeModelItem('item-A'), viewItem: makeViewItem('item-A', 0, 0) }],
      connectors: [
        makeConnector('conn-1', [
          { id: 'a1', ref: { item: 'item-A' } },        // in clipboard → remapped
          { id: 'a2', ref: { item: 'item-ORPHAN' } }    // NOT in clipboard → detached
        ])
      ],
      rectangles: [],
      textBoxes: [],
      centroid: { x: 0, y: 0 }
    };
    mockUiState.mouse.position.tile = { x: 0, y: 0 };

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    const connector = mockPasteItems.mock.calls[0][0].connectors[0];
    expect(connector.anchors[0].ref.item).toBeDefined();
    expect(connector.anchors[0].ref.item).not.toBe('item-A'); // remapped
    expect(connector.anchors[1].ref.item).toBeUndefined();    // detached — no item ref
    expect(connector.anchors[1].ref.tile).toBeDefined();      // converted to tile ref
  });

  test('9. offset applied correctly — pasted tile = original + (mouse − centroid)', () => {
    _mockClipboard = {
      items: [{ modelItem: makeModelItem('item-X'), viewItem: makeViewItem('item-X', 3, 4) }],
      connectors: [],
      rectangles: [],
      textBoxes: [],
      centroid: { x: 3, y: 4 }
    };
    mockUiState.mouse.position.tile = { x: 8, y: 9 }; // offset = (5,5)

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    const pasted = mockPasteItems.mock.calls[0][0];
    // (3+5, 4+5) = (8, 9)
    expect(pasted.items[0].viewItem.tile).toEqual({ x: 8, y: 9 });
  });

  test('10. paste sets CURSOR mode after paste', () => {
    _mockClipboard = {
      items: [{ modelItem: makeModelItem('item-P'), viewItem: makeViewItem('item-P', 1, 1) }],
      connectors: [],
      rectangles: [{ id: 'rect-P', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }],
      textBoxes: [],
      centroid: { x: 1, y: 1 }
    };
    mockUiState.mouse.position.tile = { x: 1, y: 1 };

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      })
    );
    expect(mockSetItemControls).toHaveBeenCalledWith(null);
    expect(mockSetNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Pasted 2 items', severity: 'success' })
    );
  });

  test('11. connector tile waypoints are offset by the paste offset', () => {
    // Connector: item-anchor at item-A, tile waypoint at (3, 3), item-anchor at item-B
    // Paste offset: mouse (10,10) - centroid (5,5) = (5,5)
    // Tile waypoint should move from (3,3) to (8,8)
    _mockClipboard = {
      items: [
        { modelItem: makeModelItem('item-A'), viewItem: makeViewItem('item-A', 5, 5) },
        { modelItem: makeModelItem('item-B'), viewItem: makeViewItem('item-B', 5, 5) }
      ],
      connectors: [
        makeConnector('conn-1', [
          { id: 'a1', ref: { item: 'item-A' } },
          { id: 'a2', ref: { tile: { x: 3, y: 3 } } },  // tile waypoint
          { id: 'a3', ref: { item: 'item-B' } }
        ])
      ],
      rectangles: [],
      textBoxes: [],
      centroid: { x: 5, y: 5 }
    };
    mockUiState.mouse.position.tile = { x: 10, y: 10 }; // offset = (5,5)

    const { result } = setup();
    act(() => { result.current.handlePaste(); });

    const connector = mockPasteItems.mock.calls[0][0].connectors[0];
    // anchor[0]: item ref — remapped
    expect(connector.anchors[0].ref.item).toBeDefined();
    expect(connector.anchors[0].ref.item).not.toBe('item-A');
    // anchor[1]: tile waypoint — should be offset by (5,5)
    expect(connector.anchors[1].ref.tile).toEqual({ x: 8, y: 8 });
    expect(connector.anchors[1].ref.item).toBeUndefined();
    // anchor[2]: item ref — remapped
    expect(connector.anchors[2].ref.item).toBeDefined();
    expect(connector.anchors[2].ref.item).not.toBe('item-B');
  });
});
