/**
 * F2 / VIEW-01, VIEW-02, VIEW-04, VIEW-07, VIEW-13 — the ephemeral annotation
 * overlay's state machine (ADR 0014).
 *
 * All five turn on the uiState `annotation` slice and the resets that are (or
 * are not) wired to it, so they run against the REAL store through
 * `UiStateProvider` — the same harness `annotationOpenReset.contract.test.ts`
 * uses.
 *
 * Each probe asserts its PRECONDITION (the strokes really were added, the reset
 * really did fire and clear what it does own) before concluding.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { UiStateProvider, useUiStateStore } from 'src/stores/uiStateStore';
import { polylinePathD } from 'src/utils/annotationGeometry';
import type { AnnotationStroke } from 'src/types';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(UiStateProvider, null, children);

const setup = () =>
  renderHook(() => useUiStateStore((s) => ({ s, a: s.actions })), { wrapper });

const stroke = (id: string): AnnotationStroke => ({
  id,
  tool: 'pencil',
  color: '#f00',
  thickness: 4,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 }
  ]
});

// ---------------------------------------------------------------------------
// VIEW-01 / VIEW-02 — which resets own the strokes
// ---------------------------------------------------------------------------

describe('VIEW-01/02 — annotation strokes vs the app-level resets', () => {
  it('PRECONDITION: strokes can be added and the slice reports them', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('s1')));
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['s1']);
  });

  it('VIEW-01: resetUiState — the ONLY reset the diagram-load path calls — leaves the strokes in place', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('s1')));
    act(() => result.current.a.setSelectedIds([{ type: 'ITEM', id: 'i1' }]));
    expect(result.current.s.selectedIds).toHaveLength(1);

    act(() => result.current.a.resetUiState());

    // CONTROL: the reset really fired — it cleared what it does own.
    expect(result.current.s.selectedIds).toEqual([]);
    expect(result.current.s.itemControls).toBeNull();
    // …and the ink survived a whole diagram change.
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['s1']);
  });

  it('VIEW-02: setView (a page switch) leaves the strokes in place', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('s1')));
    act(() => result.current.a.setPreviewSoloLayer('layer-a'));
    expect(result.current.s.previewLayerOverrides.soloLayerId).toBe('layer-a');

    act(() => result.current.a.setView('view-2'));

    // CONTROL: setView really fired — the preview override it DOES own is gone.
    expect(result.current.s.previewLayerOverrides.soloLayerId).toBeNull();
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['s1']);
  });

  it('CHARACTERIZATION: setEditorMode deliberately keeps strokes and only closes the palette', () => {
    const { result } = setup();
    act(() => result.current.a.setAnnotationOpen(true));
    act(() => result.current.a.addAnnotationStroke(stroke('s1')));
    act(() => result.current.a.setEditorMode('EDITABLE'));
    expect(result.current.s.annotation.open).toBe(false);
    expect(result.current.s.annotation.strokes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// VIEW-04 — degenerate single-point freehand stroke
// ---------------------------------------------------------------------------

describe('VIEW-04 — a click with no drag', () => {
  // AnnotationLayer.endStroke's commit gate, transcribed:
  //   shape/segment → requires the two points to differ
  //   freehand      → `cur.points.length >= 1`, i.e. always true
  const commits = (tool: AnnotationStroke['tool'], points: AnnotationStroke['points']) => {
    const isShapeOrSeg =
      tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
    return isShapeOrSeg
      ? points[0].x !== points[1].x || points[0].y !== points[1].y
      : points.length >= 1;
  };

  it('CONTROL: a zero-extent SHAPE or SEGMENT is correctly dropped', () => {
    const p = { x: 5, y: 5 };
    expect(commits('rectangle', [p, p])).toBe(false);
    expect(commits('ellipse', [p, p])).toBe(false);
    expect(commits('line', [p, p])).toBe(false);
    expect(commits('arrow', [p, p])).toBe(false);
  });

  it('VIEW-04: a zero-extent FREEHAND stroke is committed instead', () => {
    expect(commits('pencil', [{ x: 5, y: 5 }])).toBe(true);
    expect(commits('highlighter', [{ x: 5, y: 5 }])).toBe(true);
  });

  it('CHARACTERIZATION: the committed stroke draws nothing — its path has a moveto and no geometry', () => {
    expect(polylinePathD([{ x: 5, y: 5 }])).toBe('M 5 5');
  });

  it('CHARACTERIZATION: and it still counts — the store stores it, Undo has to eat it, Clear reports it', () => {
    const { result } = setup();
    const dot: AnnotationStroke = {
      id: 'dot',
      tool: 'pencil',
      color: '#f00',
      thickness: 4,
      points: [{ x: 5, y: 5 }]
    };
    act(() => result.current.a.addAnnotationStroke(dot));
    expect(result.current.s.annotation.strokes).toHaveLength(1);
    act(() => result.current.a.undoAnnotationStroke());
    expect(result.current.s.annotation.strokes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// VIEW-07 / VIEW-13 — the eraser and the bin vs the undo history
// ---------------------------------------------------------------------------

describe('VIEW-07 — erasing is outside the annotation undo history', () => {
  it('PRECONDITION: drawing IS undoable and redoable', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('a')));
    act(() => result.current.a.addAnnotationStroke(stroke('b')));
    act(() => result.current.a.undoAnnotationStroke());
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['a']);
    act(() => result.current.a.redoAnnotationStroke());
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('VIEW-07: Undo after an erase destroys a DIFFERENT stroke instead of restoring the erased one', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('a')));
    act(() => result.current.a.addAnnotationStroke(stroke('b')));
    act(() => result.current.a.addAnnotationStroke(stroke('c')));

    // Erase the MIDDLE stroke, as the eraser does.
    act(() => result.current.a.eraseAnnotationStroke('b'));
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['a', 'c']);
    // Nothing was recorded to undo it.
    expect(result.current.s.annotation.redoStack).toEqual([]);

    act(() => result.current.a.undoAnnotationStroke());
    // The user asked for 'b' back; 'c' went instead.
    expect(result.current.s.annotation.strokes.map((s) => s.id)).toEqual(['a']);
  });

  it('VIEW-07b: an erase also wipes a pending redo, so an undo→erase→redo sequence silently loses the undone stroke', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('a')));
    act(() => result.current.a.addAnnotationStroke(stroke('b')));
    act(() => result.current.a.undoAnnotationStroke());
    expect(result.current.s.annotation.redoStack.map((s) => s.id)).toEqual(['b']);

    act(() => result.current.a.eraseAnnotationStroke('a'));
    expect(result.current.s.annotation.redoStack).toEqual([]);
    act(() => result.current.a.redoAnnotationStroke());
    expect(result.current.s.annotation.strokes).toEqual([]);
  });
});

describe('VIEW-13 — the palette bin', () => {
  it('VIEW-13: clearAnnotations discards every stroke AND the redo stack, so nothing can bring them back', () => {
    const { result } = setup();
    act(() => result.current.a.addAnnotationStroke(stroke('a')));
    act(() => result.current.a.addAnnotationStroke(stroke('b')));
    act(() => result.current.a.clearAnnotations());
    expect(result.current.s.annotation.strokes).toEqual([]);
    expect(result.current.s.annotation.redoStack).toEqual([]);
    act(() => result.current.a.undoAnnotationStroke());
    act(() => result.current.a.redoAnnotationStroke());
    expect(result.current.s.annotation.strokes).toEqual([]);
  });
});
