/**
 * REGRESSION PIN — a commit is a commit, even when the TEXT did not change.
 *
 * This is its own file rather than a case inside the TXT-08 cluster tests
 * because the defect it pins is SILENT DATA LOSS, and it was found the way the
 * wave-2 lesson says these are found: by un-deadening a code path. `finish`
 * treated `commit` with no text change as a cheap "nothing to write" path and
 * fell through to `onCancel()`:
 *
 *   if (kind === 'commit' && changedRef.current) { …onCommit(html)… }
 *   else onCancel();
 *
 * That was invisible for as long as cancel merely cleared `editingTextBoxId` —
 * the two branches did the same observable thing. The moment TXT-08 gave cancel
 * a real job (rolling the session's element-level writes back), the fallthrough
 * became a path where a user who opened a box, changed only its STYLING, and
 * left-clicked away lost the change with no message and no undo entry to
 * recover from.
 *
 * The lesson generalises past this component: **when a branch that was
 * previously indistinguishable from its sibling gains behaviour, every caller
 * that fell into it "harmlessly" becomes a live defect.** Look for the callers
 * before shipping the behaviour, not after.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { ModelProvider } from 'src/stores/modelStore';
import { SceneProvider } from 'src/stores/sceneStore';
import { UiStateProvider } from 'src/stores/uiStateStore';
import { TextBoxInlineEditor } from '../TextBoxInlineEditor';

// The editor mounts Quill, which needs a real DOM range API jsdom only partly
// provides. The commit CONTRACT under test is the branch selection, not the
// serialisation, so the editor is driven through its click-away listener with
// Quill stubbed to a known document.
jest.mock('react-quill-new', () => {
  const React2 = jest.requireActual('react');
  const quill = {
    getSemanticHTML: () => '<p>UNCHANGED</p>',
    getSelection: () => null,
    setSelection: () => {},
    focus: () => {},
    on: () => {},
    off: () => {},
    getLength: () => 10,
    getFormat: () => ({}),
    // A real element: TextBoxLinkCard binds hover listeners to `quill.root`.
    root: (() => {
      const el = document.createElement('div');
      el.innerHTML = '<p>UNCHANGED</p>';
      return el;
    })()
  };
  const Comp = React2.forwardRef((props: never, ref: never) => {
    React2.useImperativeHandle(ref, () => ({ getEditor: () => quill }));
    return React2.createElement('div', { 'data-testid': 'quill-stub' });
  });
  (Comp as unknown as { Quill: unknown }).Quill = {
    import: () => ({}),
    register: () => {}
  };
  return { __esModule: true, default: Comp };
});

jest.mock('src/components/RichTextEditor/RichTextEditor', () => ({
  formats: []
}));

const pressAwayOnBody = () => {
  act(() => {
    document.body.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0 })
    );
  });
};

const renderEditor = (overrides: Record<string, unknown> = {}) => {
  const onCommit = jest.fn();
  const onCancel = jest.fn();
  render(
    <ModelProvider>
      <SceneProvider>
        <UiStateProvider>
          <TextBoxInlineEditor
            textBoxId="tb1"
            content="<p>UNCHANGED</p>"
            fontProps={{}}
            onDraftChange={() => {}}
            onCommit={onCommit}
            onCancel={onCancel}
            {...overrides}
          />
        </UiStateProvider>
      </SceneProvider>
    </ModelProvider>
  );
  return { onCommit, onCancel };
};

describe('TextBoxInlineEditor — commit vs cancel branch selection', () => {
  it('a left-click-away with NO text change still COMMITS (never cancels)', () => {
    const { onCommit, onCancel } = renderEditor();
    pressAwayOnBody();
    // The load-bearing assertion: cancel is not reached. Before the fix this
    // took the `else` branch purely because the text was untouched, and every
    // element-level write the session had made was rolled back with it.
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('the committed html is the editor\'s current content', () => {
    const { onCommit } = renderEditor();
    pressAwayOnBody();
    expect(onCommit).toHaveBeenCalledWith('<p>UNCHANGED</p>');
  });

  it('a RIGHT-click-away still cancels — the branch that should reach cancel', () => {
    const { onCommit, onCancel } = renderEditor();
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 2 })
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape still cancels', () => {
    const { onCommit, onCancel } = renderEditor();
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });
    // Escape is handled on the editor's own element; the body dispatch above
    // must NOT be mistaken for one — so this asserts the *absence* of a stray
    // cancel, and the real Escape path is covered end-to-end by
    // inline-edit-session-scope.spec.ts.
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a press on the STRIP ends nothing — the session survives it (TXT-06)', () => {
    const { onCommit, onCancel } = renderEditor();
    const strip = document.createElement('div');
    strip.setAttribute('data-axoview-strip', 'true');
    document.body.appendChild(strip);
    act(() => {
      strip.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    strip.remove();
  });

  it('the session ends exactly once, however many presses land', () => {
    const { onCommit, onCancel } = renderEditor();
    pressAwayOnBody();
    pressAwayOnBody();
    pressAwayOnBody();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
