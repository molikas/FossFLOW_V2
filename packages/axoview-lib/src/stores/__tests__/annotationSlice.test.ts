/**
 * Promoted from the F2 explore lane (ADR 0047 flip rule) — the annotation
 * slice's four wave-4 rulings, at the store level where the behaviour the user
 * sees actually lives:
 *
 *   VIEW-01/02  ink is cleared when the content under it changes (diagram load,
 *               page switch) — but NOT on an edit<->present toggle.
 *   VIEW-07     erase and clear are undoable at their own position.
 *   VIEW-13     Clear is undoable (the ruling that rides VIEW-07's op log).
 *   VIEW-09(b)  hiding the view chrome disarms the pen instead of stranding a
 *               full-canvas overlay with no palette.
 *
 * `annotationOps.test.ts` pins the inversion rules; this pins what the actions
 * RECORD, which is the other half and the half that can silently stop happening.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { UiStateProvider, useUiStateStore } from '../uiStateStore';
import type { AnnotationStroke } from 'src/types';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(UiStateProvider, null, children);

const setup = () =>
  renderHook(() => useUiStateStore((s) => ({ s, a: s.actions })), { wrapper });

const stroke = (id: string): AnnotationStroke => ({
  id,
  tool: 'pencil',
  color: '#000',
  thickness: 4,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 }
  ]
});

type Result = ReturnType<typeof setup>['result'];
const ids = (r: Result) => r.current.s.annotation.strokes.map((s) => s.id);
const drawThree = (r: Result) => {
  act(() => r.current.a.addAnnotationStroke(stroke('a')));
  act(() => r.current.a.addAnnotationStroke(stroke('b')));
  act(() => r.current.a.addAnnotationStroke(stroke('c')));
};

describe('VIEW-07 — erasing the middle stroke, then Undo', () => {
  it('brings back the ERASED stroke, not the last one drawn', () => {
    // The entry's exact repro. It used to leave ['a','c'] → ['a'].
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.eraseAnnotationStroke('b'));
    expect(ids(result)).toEqual(['a', 'c']);

    act(() => result.current.a.undoAnnotationStroke());
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  it('a second Undo then removes the last stroke DRAWN', () => {
    // The tail behaviour is still correct for an add — it was only ever wrong
    // because it was the ONLY behaviour.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.eraseAnnotationStroke('b'));
    act(() => result.current.a.undoAnnotationStroke());
    act(() => result.current.a.undoAnnotationStroke());
    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('redo re-applies the erase', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.eraseAnnotationStroke('b'));
    act(() => result.current.a.undoAnnotationStroke());
    act(() => result.current.a.redoAnnotationStroke());
    expect(ids(result)).toEqual(['a', 'c']);
  });

  it('an undone stroke is NOT discarded by a later erase of something else', () => {
    // The entry's second shape: undo a stroke (it sits on the redo branch),
    // then erase anything — the redo branch was silently emptied and the undone
    // stroke was gone for good. It still goes, but now because a NEW operation
    // legitimately invalidates the redo branch (linear history) — and the
    // stroke is recoverable by undoing back past the erase.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.undoAnnotationStroke()); // 'c' onto the branch
    expect(ids(result)).toEqual(['a', 'b']);

    act(() => result.current.a.eraseAnnotationStroke('a'));
    expect(result.current.s.annotation.future).toEqual([]);

    act(() => result.current.a.undoAnnotationStroke()); // un-erase 'a'
    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('erasing something that is not there records no operation', () => {
    // An inert log entry would cost a real Undo press to get past.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.eraseAnnotationStroke('nope'));
    expect(result.current.s.annotation.past).toHaveLength(3);
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });
});

describe('VIEW-13 — Clear is undoable', () => {
  it('undo restores every cleared stroke, in order', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.clearAnnotations());
    expect(ids(result)).toEqual([]);

    act(() => result.current.a.undoAnnotationStroke());
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  it('and redo clears again', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.clearAnnotations());
    act(() => result.current.a.undoAnnotationStroke());
    act(() => result.current.a.redoAnnotationStroke());
    expect(ids(result)).toEqual([]);
  });

  it('the Undo control stays live after a Clear', () => {
    // The palette gates Undo on the OPERATION log, not the stroke count — a
    // Clear leaves zero strokes and must still be undoable, which is the whole
    // ruling. Gating on `strokes.length` would grey the button out.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.clearAnnotations());
    expect(result.current.s.annotation.strokes).toHaveLength(0);
    expect(result.current.s.annotation.past.length).toBeGreaterThan(0);
  });

  it('clearing nothing records no operation', () => {
    const { result } = setup();
    act(() => result.current.a.clearAnnotations());
    expect(result.current.s.annotation.past).toEqual([]);
  });
});

describe('VIEW-01/02 — ink is scoped to the content under it', () => {
  it('a page switch clears the strokes and the log', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.setView('page-2'));
    expect(ids(result)).toEqual([]);
    expect(result.current.s.annotation.past).toEqual([]);
    expect(result.current.s.annotation.future).toEqual([]);
  });

  it('a diagram load (resetUiState) clears them too', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.resetUiState());
    expect(ids(result)).toEqual([]);
    expect(result.current.s.annotation.past).toEqual([]);
  });

  it('CONTROL: an edit<->present toggle KEEPS them', () => {
    // The transition that does not change the content underneath. This is the
    // decision `setEditorMode` was always right about, and the reason the fix
    // is two specific transitions rather than "clear on any mode change".
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.setEditorMode('EXPLORABLE_READONLY'));
    expect(ids(result)).toEqual(['a', 'b', 'c']);
    act(() => result.current.a.setEditorMode('EDITABLE'));
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  it('the log is cleared too, not just the strokes', () => {
    // Otherwise Undo after a page switch would re-materialise ink from the
    // previous page onto the new one — a worse version of the original bug.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.setView('page-2'));
    act(() => result.current.a.undoAnnotationStroke());
    expect(ids(result)).toEqual([]);
  });
});

describe('VIEW-09(b) — hiding the view chrome disarms the pen', () => {
  it('an armed draw tool goes back to select', () => {
    // `<AnnotationLayer />` is mounted unconditionally while the palette sits
    // behind `!hideViewControls`, so this used to leave a full-canvas overlay
    // at pointer-events: auto with its pen and tool row gone.
    const { result } = setup();
    act(() => result.current.a.setAnnotationTool('pencil'));
    act(() => result.current.a.setHideViewControls(true));
    expect(result.current.s.annotation.tool).toBe('select');
  });

  it('the eraser is disarmed as well', () => {
    const { result } = setup();
    act(() => result.current.a.setAnnotationTool('eraser'));
    act(() => result.current.a.setHideViewControls(true));
    expect(result.current.s.annotation.tool).toBe('select');
  });

  it('CONTROL: UN-hiding does not touch the tool', () => {
    const { result } = setup();
    act(() => result.current.a.setHideViewControls(true));
    act(() => result.current.a.setAnnotationTool('pencil'));
    act(() => result.current.a.setHideViewControls(false));
    expect(result.current.s.annotation.tool).toBe('pencil');
  });

  it('and the strokes are untouched — this hides chrome, it does not discard work', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.setHideViewControls(true));
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });
});

describe('VIEW-03 — re-projecting the ink', () => {
  const double = (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 });

  it('maps every point of every live stroke', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.reprojectAnnotationStrokes(double));
    expect(result.current.s.annotation.strokes[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 20 }
    ]);
  });

  it('maps the strokes held in the operation log too', () => {
    // An undo after the switch must put the stroke back where the content is
    // NOW. The log is history, not an archive of old coordinates.
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.eraseAnnotationStroke('b'));
    act(() => result.current.a.reprojectAnnotationStrokes(double));
    act(() => result.current.a.undoAnnotationStroke());

    const restored = result.current.s.annotation.strokes.find(
      (s) => s.id === 'b'
    );
    expect(restored?.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 20 }
    ]);
  });

  it('and the redo branch, so a redo lands correctly as well', () => {
    const { result } = setup();
    drawThree(result);
    act(() => result.current.a.undoAnnotationStroke());
    act(() => result.current.a.reprojectAnnotationStrokes(double));
    act(() => result.current.a.redoAnnotationStroke());

    const redone = result.current.s.annotation.strokes.find((s) => s.id === 'c');
    expect(redone?.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 20 }
    ]);
  });

  it('is a no-op with nothing to re-project', () => {
    const { result } = setup();
    const before = result.current.s.annotation;
    act(() => result.current.a.reprojectAnnotationStrokes(double));
    expect(result.current.s.annotation).toBe(before);
  });
});
