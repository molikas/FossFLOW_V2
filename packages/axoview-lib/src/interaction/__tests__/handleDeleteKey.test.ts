import {
  handleDeleteOrBackspace,
  deleteItemControlsTarget,
  isEditableTarget,
  DeleteKeyDeps
} from '../handleDeleteKey';
import type { State } from 'src/types';

// L-1 regression (UX sweep 2026-07-10, Maya): a selected floating Label
// (ADR 0031) could not be deleted via select + Delete — the single-item delete
// dispatcher had no LABEL branch, so the key was a silent no-op. These tests pin
// the per-type dispatch (every canvas type routes to its delete action) and the
// single-Label Delete path end-to-end through handleDeleteOrBackspace.

const makeDeps = (): jest.Mocked<DeleteKeyDeps> => ({
  deleteSelectedItems: jest.fn(),
  deleteViewItem: jest.fn(),
  deleteConnector: jest.fn(),
  deleteTextBox: jest.fn(),
  deleteRectangle: jest.fn(),
  deleteLabel: jest.fn()
});

const makeUiState = (overrides: Record<string, unknown> = {}) =>
  ({
    mode: { type: 'CURSOR', showCursor: true, mousedownItem: null },
    selectedIds: [],
    itemControls: null,
    actions: {
      setMode: jest.fn(),
      clearSelection: jest.fn(),
      setItemControls: jest.fn()
    },
    ...overrides
  }) as unknown as State['uiState'];

const keyEvent = (key: string, target?: HTMLElement): KeyboardEvent =>
  ({
    key,
    target: target ?? document.createElement('div'),
    preventDefault: jest.fn()
  }) as unknown as KeyboardEvent;

describe('deleteItemControlsTarget — per-type dispatch', () => {
  it('routes a LABEL to deleteLabel (L-1: was an unhandled no-op)', () => {
    const deps = makeDeps();
    deleteItemControlsTarget(
      makeUiState({ itemControls: { type: 'LABEL', id: 'l1' } }),
      deps
    );
    expect(deps.deleteLabel).toHaveBeenCalledWith('l1');
    expect(deps.deleteViewItem).not.toHaveBeenCalled();
    expect(deps.deleteConnector).not.toHaveBeenCalled();
    expect(deps.deleteTextBox).not.toHaveBeenCalled();
    expect(deps.deleteRectangle).not.toHaveBeenCalled();
  });

  it.each([
    ['ITEM', 'deleteViewItem'],
    ['CONNECTOR', 'deleteConnector'],
    ['TEXTBOX', 'deleteTextBox'],
    ['RECTANGLE', 'deleteRectangle'],
    ['LABEL', 'deleteLabel']
  ] as const)('%s → %s', (type, method) => {
    const deps = makeDeps();
    deleteItemControlsTarget(
      makeUiState({ itemControls: { type, id: 'x' } }),
      deps
    );
    expect(deps[method]).toHaveBeenCalledWith('x');
  });

  it('is a no-op when nothing is selected', () => {
    const deps = makeDeps();
    deleteItemControlsTarget(makeUiState({ itemControls: null }), deps);
    Object.values(deps).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe('handleDeleteOrBackspace — single floating Label', () => {
  it('Delete on a selected Label calls deleteLabel + clears the panel', () => {
    const deps = makeDeps();
    const uiState = makeUiState({
      selectedIds: [{ type: 'LABEL', id: 'l1' }],
      itemControls: { type: 'LABEL', id: 'l1' }
    });
    const consumed = handleDeleteOrBackspace(keyEvent('Delete'), uiState, deps);
    expect(consumed).toBe(true);
    expect(deps.deleteLabel).toHaveBeenCalledWith('l1');
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  it('Backspace behaves identically', () => {
    const deps = makeDeps();
    const uiState = makeUiState({
      selectedIds: [{ type: 'LABEL', id: 'l1' }],
      itemControls: { type: 'LABEL', id: 'l1' }
    });
    handleDeleteOrBackspace(keyEvent('Backspace'), uiState, deps);
    expect(deps.deleteLabel).toHaveBeenCalledWith('l1');
  });

  it('does NOT delete while the Label is being inline-edited (contentEditable focus)', () => {
    const deps = makeDeps();
    const editing = document.createElement('div');
    editing.contentEditable = 'true';
    const uiState = makeUiState({
      selectedIds: [{ type: 'LABEL', id: 'l1' }],
      itemControls: { type: 'LABEL', id: 'l1' }
    });
    const consumed = handleDeleteOrBackspace(
      keyEvent('Delete', editing),
      uiState,
      deps
    );
    expect(consumed).toBe(false);
    expect(deps.deleteLabel).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const deps = makeDeps();
    const uiState = makeUiState({
      selectedIds: [{ type: 'LABEL', id: 'l1' }],
      itemControls: { type: 'LABEL', id: 'l1' }
    });
    expect(handleDeleteOrBackspace(keyEvent('a'), uiState, deps)).toBe(false);
    expect(deps.deleteLabel).not.toHaveBeenCalled();
  });
});

describe('isEditableTarget', () => {
  it('is true for input / textarea / contentEditable / quill', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    const ql = document.createElement('div');
    ql.className = 'ql-editor';
    const insideQl = document.createElement('span');
    ql.appendChild(insideQl);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(ce)).toBe(true);
    expect(isEditableTarget(insideQl)).toBe(true);
  });

  it('is false for a plain element', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
  });
});

// Promoted from the exploratory lane (I3/SEL-07). The lasso branch used to run
// BEFORE the text-field guard, on the reasoning that a live canvas selection
// should always win. `FreehandLasso` stays armed WITH its selection after the
// gesture ends (unlike `Lasso`, which drops back to CURSOR), so that state
// outlives the gesture indefinitely — and every Backspace typed into any text
// field afterwards silently destroyed the whole freehand selection while the
// field kept its text.
describe('handleDeleteOrBackspace — the lasso branch vs a focused text field', () => {
  const lassoState = (type: 'LASSO' | 'FREEHAND_LASSO') =>
    makeUiState({
      mode: {
        type,
        showCursor: true,
        selection: { items: [{ type: 'ITEM', id: 'n1' }] }
      }
    });

  const input = () => document.createElement('input');

  it.each(['LASSO', 'FREEHAND_LASSO'] as const)(
    'Backspace typed into an input does NOT delete a live %s selection',
    (type) => {
      const deps = makeDeps();
      const uiState = lassoState(type);

      const consumed = handleDeleteOrBackspace(
        keyEvent('Backspace', input()),
        uiState,
        deps
      );

      expect(deps.deleteSelectedItems).not.toHaveBeenCalled();
      // Not consumed either — the keystroke belongs to the field.
      expect(consumed).toBe(false);
      expect(uiState.actions.setMode).not.toHaveBeenCalled();
    }
  );

  it('the same Backspace on the canvas still deletes the lasso selection', () => {
    const deps = makeDeps();
    const uiState = lassoState('FREEHAND_LASSO');

    expect(handleDeleteOrBackspace(keyEvent('Backspace'), uiState, deps)).toBe(
      true
    );
    expect(deps.deleteSelectedItems).toHaveBeenCalledWith([
      { type: 'ITEM', id: 'n1' }
    ]);
    expect(uiState.actions.clearSelection).toHaveBeenCalled();
  });

  it('a Quill editor is shielded too, not just <input>', () => {
    const deps = makeDeps();
    const host = document.createElement('div');
    host.className = 'ql-editor';
    const target = document.createElement('p');
    host.appendChild(target);
    document.body.appendChild(host);

    handleDeleteOrBackspace(
      keyEvent('Backspace', target),
      lassoState('FREEHAND_LASSO'),
      deps
    );

    expect(deps.deleteSelectedItems).not.toHaveBeenCalled();
    document.body.removeChild(host);
  });
});
