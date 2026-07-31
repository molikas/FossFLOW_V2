/**
 * CLASS GATE — read-only enforcement, per-surface opt-in (ADR 0047 §3).
 *
 * `EXPLORABLE_READONLY` is the mode the `/display/<diagramId>` viewer route runs
 * in, and the 2026-07 campaign found it enforced surface-by-surface from memory:
 * the pointer effect returned early on `INTERACTIONS_DISABLED` (which this mode
 * does not map to), `handleFunctionKeys` checked F2, `RightSidebar` passed
 * `readOnly` to one of five element panels — and everything else was live.
 * A viewer could draw rectangles, Delete items, cut and paste, reorder z, nudge
 * with the arrows, and type into four of the five panels' Notes editors.
 *
 * This gate is not a list of those bugs (they have their own promoted suites).
 * It scans for the *class*, so a NEW surface cannot inherit "live in read-only"
 * by omission the way the whole class did:
 *
 *   1. COVERAGE — every delegate the keydown dispatcher calls is declared in
 *      `CANVAS_KEYBOARD_SURFACES`, and every declared surface is reached. Add a
 *      shortcut to the dispatcher without an access class and this fails.
 *   2. ENFORCEMENT — every `editor` surface's call site is gated on the policy
 *      (wrapped in `allow('…')` or handed its verdict). Flip an entry to
 *      `viewer` in the table without meaning it and this fails too.
 *   3. BEHAVIOUR — the three exported delegates are driven in both modes and
 *      asserted to match their access class.
 *
 * The element-panel half lives in `ItemControls/__tests__/readonlyPanels.contract.test.tsx`
 * (it needs a DOM). Related campaign entries: I1/PTR-01/02/03, I5/CTX-15,
 * F2/VIEW-11.
 */
import fs from 'fs';
import path from 'path';
import {
  CANVAS_KEYBOARD_SURFACES,
  canUseKeyboardSurface,
  canMutate,
  type CanvasKeyboardSurface
} from '../readonlyPolicy';
import { handleEscapeKey } from '../handleEscapeKey';
import { handleDeleteOrBackspace } from '../handleDeleteKey';
import { handleArrowKey } from '../handleArrowKey';
import type { State } from 'src/types';

const MANAGER = path.join(__dirname, '..', 'useInteractionManager.ts');
const source = fs.readFileSync(MANAGER, 'utf8');

/**
 * The dispatcher body — from `const handleKeyDown = (e: KeyboardEvent) => {` to
 * the `window.addEventListener('keydown', …)` that follows it. Scanning the
 * whole file would also pick up the delegate *definitions*.
 */
const dispatcherBody = (() => {
  const start = source.indexOf('const handleKeyDown = (e: KeyboardEvent)');
  const end = source.indexOf("window.addEventListener('keydown'", start);
  if (start < 0 || end < 0) {
    throw new Error(
      'readonly gate: could not locate the keydown dispatcher in useInteractionManager.ts — ' +
        'the scan below would be vacuous. Update the markers.'
    );
  }
  return source.slice(start, end);
})();

/**
 * Which access-classed surfaces each dispatcher delegate speaks for. A delegate
 * can own more than one (`handleArrowKey` nudges OR pans, and those differ).
 */
const DELEGATE_SURFACES: Record<string, CanvasKeyboardSurface[]> = {
  handleEscapeKey: ['escape'],
  handleDeleteOrBackspace: ['delete'],
  handleHistoryShortcuts: ['history'],
  handleClipboardShortcuts: ['copy', 'cutPaste'],
  handleSelectAll: ['selectAll'],
  handleFunctionKeys: ['help', 'inlineRename'],
  handleToolHotkeys: ['toolHotkeys'],
  handleZOrderShortcut: ['zOrder'],
  handleArrowKey: ['arrowNudge', 'arrowPan']
};

const calledDelegates = (): string[] => {
  const found = new Set<string>();
  const re = /\b(handle[A-Z]\w*)\s*\(/g;
  let m = re.exec(dispatcherBody);
  while (m) {
    found.add(m[1]);
    m = re.exec(dispatcherBody);
  }
  return [...found].sort();
};

// ---------------------------------------------------------------------------
// 1. COVERAGE — the dispatcher and the surface table agree
// ---------------------------------------------------------------------------

describe('class gate — every canvas keyboard surface has an access class', () => {
  const delegates = calledDelegates();

  it('finds the dispatcher delegates (the gate can go red)', () => {
    // A scan that finds nothing is a green gate that cannot fail — the shape the
    // 2026-07-29 audit flagged for the madge and bundle-size gates.
    expect(delegates.length).toBeGreaterThan(5);
    expect(delegates).toEqual(expect.arrayContaining(['handleToolHotkeys']));
  });

  it('every delegate the dispatcher calls is declared in the surface table', () => {
    const undeclared = delegates.filter((d) => !DELEGATE_SURFACES[d]);
    expect(
      undeclared.length === 0
        ? null
        : `keydown delegates with no access class: ${undeclared.join(', ')}. ` +
            'Add each to readonlyPolicy.CANVAS_KEYBOARD_SURFACES (and to this ' +
            "gate's DELEGATE_SURFACES) with a deliberate viewer/editor verdict."
    ).toBeNull();
  });

  it('every declared delegate is still reached by the dispatcher', () => {
    const orphans = Object.keys(DELEGATE_SURFACES).filter(
      (d) => !delegates.includes(d)
    );
    expect(orphans).toEqual([]);
  });

  it('every surface in the table belongs to exactly one delegate', () => {
    const claimed = Object.values(DELEGATE_SURFACES).flat().sort();
    expect(claimed).toEqual([...new Set(claimed)].sort());
    expect(claimed).toEqual(Object.keys(CANVAS_KEYBOARD_SURFACES).sort());
  });
});

// ---------------------------------------------------------------------------
// 2. ENFORCEMENT — every `editor` surface is gated at its call site
// ---------------------------------------------------------------------------

describe('class gate — no editor surface reaches the model in read-only', () => {
  const editorSurfaces = (
    Object.keys(CANVAS_KEYBOARD_SURFACES) as CanvasKeyboardSurface[]
  ).filter((s) => CANVAS_KEYBOARD_SURFACES[s] === 'editor');

  it('the table still classes most surfaces as editor ones', () => {
    expect(editorSurfaces.length).toBeGreaterThan(3);
  });

  it.each(editorSurfaces)(
    '%s is gated on the policy in the dispatcher',
    (surface) => {
      // Either `if (allow('x')) handleX(…)` or `handleX(…, allow('x'))` — both
      // route the decision through readonlyPolicy rather than re-testing
      // `editorMode` inline, which is how the original per-surface drift started.
      expect(
        dispatcherBody.includes(`allow('${surface}')`)
          ? null
          : `${surface} is classed 'editor' but the dispatcher never consults ` +
              `allow('${surface}') — it would run in EXPLORABLE_READONLY.`
      ).toBeNull();
    }
  );

  it('the escape delegate is handed the mode so it cannot arm CURSOR', () => {
    // Esc is a `viewer` surface, but its tool-mode exit hands out CURSOR — a
    // live editing mode. PAN is a viewer's resting mode, so without the mode
    // argument every viewer Esc would take that branch.
    expect(dispatcherBody).toMatch(
      /handleEscapeKey\(\s*e,\s*uiState,\s*deps,\s*uiState\.editorMode\s*\)/
    );
  });

  it.each(
    (Object.keys(CANVAS_KEYBOARD_SURFACES) as CanvasKeyboardSurface[]).map(
      (s) => [s, CANVAS_KEYBOARD_SURFACES[s]] as const
    )
  )('%s (%s) resolves per its access class', (surface, access) => {
    expect(canUseKeyboardSurface(surface, 'EDITABLE')).toBe(true);
    expect(canUseKeyboardSurface(surface, 'EXPLORABLE_READONLY')).toBe(
      access === 'viewer'
    );
    expect(canUseKeyboardSurface(surface, 'NON_INTERACTIVE')).toBe(
      access === 'viewer'
    );
  });

  it('canMutate is true for EDITABLE alone', () => {
    expect(canMutate('EDITABLE')).toBe(true);
    expect(canMutate('EXPLORABLE_READONLY')).toBe(false);
    expect(canMutate('NON_INTERACTIVE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. BEHAVIOUR — the exported delegates honour their access class
// ---------------------------------------------------------------------------

const uiStateWith = (
  overrides: Partial<State['uiState']> = {}
): State['uiState'] => {
  const actions = {
    setMode: jest.fn(),
    setItemControls: jest.fn(),
    setSelectedIds: jest.fn(),
    clearSelection: jest.fn(),
    setScroll: jest.fn()
  };
  return {
    mode: { type: 'PAN', showCursor: false },
    editorMode: 'EXPLORABLE_READONLY',
    itemControls: null,
    selectedIds: [],
    scroll: { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } },
    connectorInteractionMode: 'drag',
    actions,
    ...overrides
  } as unknown as State['uiState'];
};

const keyEvent = (key: string, target?: unknown) =>
  ({
    key,
    preventDefault: jest.fn(),
    target: target ?? ({ tagName: 'DIV', closest: () => null } as unknown)
  }) as unknown as KeyboardEvent;

describe('class gate — read-only behaviour of the exported delegates', () => {
  it('Esc in read-only closes the popover instead of handing out CURSOR', () => {
    const uiState = uiStateWith({
      mode: { type: 'PAN', showCursor: false },
      itemControls: { type: 'ITEM', id: 'n1' }
    } as never);
    const deps = { deleteConnector: jest.fn(), commitDragTransaction: jest.fn() };

    handleEscapeKey(keyEvent('Escape'), uiState, deps, 'EXPLORABLE_READONLY');

    expect(uiState.actions.setMode).not.toHaveBeenCalled();
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  it('Esc in EDITABLE still returns PAN to Select (the viewer gate is not a blanket refusal)', () => {
    const uiState = uiStateWith({
      editorMode: 'EDITABLE',
      mode: { type: 'PAN', showCursor: false }
    } as never);
    const deps = { deleteConnector: jest.fn(), commitDragTransaction: jest.fn() };

    handleEscapeKey(keyEvent('Escape'), uiState, deps, 'EDITABLE');

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('the arrow keys pan but never nudge when the nudge surface is refused', () => {
    const scene = {
      items: [{ id: 'n1', tile: { x: 0, y: 0 } }],
      rectangles: [],
      textBoxes: []
    };
    const deps = {
      getScene: () => scene,
      beginDragTransaction: jest.fn(),
      commitDragTransaction: jest.fn(),
      batchUpdateViewItemTiles: jest.fn(),
      batchUpdateRectangles: jest.fn(),
      batchUpdateTextBoxTiles: jest.fn()
    };
    const uiState = uiStateWith({
      selectedIds: [{ type: 'ITEM', id: 'n1' }]
    } as never);

    handleArrowKey(keyEvent('ArrowRight'), uiState, deps, false);

    expect(deps.batchUpdateViewItemTiles).not.toHaveBeenCalled();
    expect(deps.beginDragTransaction).not.toHaveBeenCalled();
    // …and the viewer half still works: the viewport scrolled.
    expect(uiState.actions.setScroll).toHaveBeenCalled();

    // Control: the same press with the nudge surface allowed does move it.
    handleArrowKey(keyEvent('ArrowRight'), uiState, deps, true);
    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'n1', tile: { x: 1, y: 0 } }
    ]);
  });

  it('Delete is never dispatched for a read-only viewer', () => {
    // The dispatcher refuses the whole delegate (`allow('delete')`), so the
    // deletes below cannot be reached — asserted here through the same predicate
    // the dispatcher uses, plus proof the delegate WOULD have deleted.
    const uiState = uiStateWith({
      itemControls: { type: 'ITEM', id: 'n1' }
    } as never);
    const deps = {
      deleteSelectedItems: jest.fn(),
      deleteViewItem: jest.fn(),
      deleteConnector: jest.fn(),
      deleteTextBox: jest.fn(),
      deleteRectangle: jest.fn(),
      deleteLabel: jest.fn()
    };

    expect(canUseKeyboardSurface('delete', uiState.editorMode)).toBe(false);
    handleDeleteOrBackspace(keyEvent('Delete'), uiState, deps);
    expect(deps.deleteViewItem).toHaveBeenCalledWith('n1');
  });
});
