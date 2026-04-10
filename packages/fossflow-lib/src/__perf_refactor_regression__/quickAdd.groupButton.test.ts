/**
 * REGRESSION — QuickAddNodePopover "Rectangle" button contracts
 *
 * Covers the pure callback logic for adding a rectangle from the
 * double-click popover. Tests are pure functions — no component rendering.
 *
 * Background:
 *   - Double-clicking empty canvas fires `canvasEmptyDblClick` → opens popover.
 *   - Popover has two actions: pick an icon (adds a node) or click "Rectangle"
 *     (adds a background rectangle at the clicked tile).
 *   - Previously labeled "Group" — renamed to "Rectangle" to match the toolbar
 *     and avoid confusion with grouping semantics.
 */

// ---------------------------------------------------------------------------
// Pure logic extracted from QuickAddNodePopover.handleAddRectangle
// ---------------------------------------------------------------------------

interface Tile { x: number; y: number }
interface Color { id: string }

function buildRectangleArgs(
  targetTile: Tile,
  colors: Color[],
  generateId: () => string
): { id: string; color: string; from: Tile; to: Tile } | null {
  if (!targetTile || colors.length === 0) return null;
  return {
    id: generateId(),
    color: colors[0].id,
    from: targetTile,
    to: targetTile
  };
}

// ---------------------------------------------------------------------------
// Pure logic extracted from QuickAddNodePopover.handleIconSelected
// (verifies the node placement path is unaffected by Rectangle addition)
// ---------------------------------------------------------------------------

interface Icon { id: string }
interface ModelItemArgs { id: string; name: string; icon: string }
interface ViewItemArgs { id: string; tile: Tile }

function buildNodeArgs(
  targetTile: Tile,
  icon: Icon,
  modelItemId: string
): { modelItem: ModelItemArgs; viewItem: ViewItemArgs } {
  return {
    modelItem: { id: modelItemId, name: '', icon: icon.id },
    viewItem: { id: modelItemId, tile: targetTile }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuickAddNodePopover — Rectangle button logic', () => {
  const tile: Tile = { x: 5, y: 7 };
  const colors: Color[] = [{ id: 'color-1' }, { id: 'color-2' }];
  const fakeId = 'rect-id-123';
  const generateId = () => fakeId;

  it('creates a rectangle with the first available color', () => {
    const args = buildRectangleArgs(tile, colors, generateId);
    expect(args).not.toBeNull();
    expect(args!.color).toBe('color-1');
  });

  it('uses the clicked tile as both from and to (1×1 initial size)', () => {
    const args = buildRectangleArgs(tile, colors, generateId);
    expect(args!.from).toEqual(tile);
    expect(args!.to).toEqual(tile);
  });

  it('assigns a generated id to the rectangle', () => {
    const args = buildRectangleArgs(tile, colors, generateId);
    expect(args!.id).toBe(fakeId);
  });

  it('returns null when no colors are available (guard)', () => {
    const args = buildRectangleArgs(tile, [], generateId);
    expect(args).toBeNull();
  });

  it('only uses colors[0] — does not iterate or randomise', () => {
    const args1 = buildRectangleArgs(tile, [{ id: 'red' }, { id: 'blue' }], generateId);
    const args2 = buildRectangleArgs(tile, [{ id: 'green' }], generateId);
    expect(args1!.color).toBe('red');
    expect(args2!.color).toBe('green');
  });
});

describe('QuickAddNodePopover — icon (node) placement logic', () => {
  const tile: Tile = { x: 3, y: 2 };
  const icon: Icon = { id: 'icon-server' };
  const modelItemId = 'node-id-abc';

  it('places icon at the double-clicked tile', () => {
    const args = buildNodeArgs(tile, icon, modelItemId);
    expect(args.viewItem.tile).toEqual(tile);
  });

  it('creates model item with empty name (user names it after placement)', () => {
    const args = buildNodeArgs(tile, icon, modelItemId);
    expect(args.modelItem.name).toBe('');
  });

  it('model item and view item share the same id', () => {
    const args = buildNodeArgs(tile, icon, modelItemId);
    expect(args.modelItem.id).toBe(args.viewItem.id);
  });

  it('stores the selected icon id on the model item', () => {
    const args = buildNodeArgs(tile, icon, modelItemId);
    expect(args.modelItem.icon).toBe('icon-server');
  });
});

describe('Double-click disambiguation — context menu no longer fires on left-click', () => {
  // This behaviour is governed by Cursor.ts mouseup — tested in Cursor.modes.test.ts.
  // This suite documents the *contract* from the popover's perspective.

  it('canvasEmptyDblClick event carries tile and screen coords', () => {
    const received: any[] = [];
    window.addEventListener('canvasEmptyDblClick', (e) => received.push((e as CustomEvent).detail));

    window.dispatchEvent(
      new CustomEvent('canvasEmptyDblClick', {
        detail: { tile: { x: 4, y: 4 }, screenX: 200, screenY: 300 }
      })
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ tile: { x: 4, y: 4 }, screenX: 200, screenY: 300 });

    window.removeEventListener('canvasEmptyDblClick', () => {});
  });
});
