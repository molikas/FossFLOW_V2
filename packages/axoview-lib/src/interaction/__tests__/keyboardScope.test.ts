/**
 * Promoted from the 2026-07 exploratory lane (I1/PTR-05, I1/PTR-12) — the two
 * "is the canvas even the surface being typed at?" predicates the keydown
 * dispatcher consults.
 *
 * The end-to-end proof that the dispatcher actually asks them lives in
 * `axoview-e2e/tests/canvas-keyboard-scope.spec.ts`; this suite pins the
 * predicates themselves, including the shapes that must NOT match (a context
 * menu is a canvas surface; a collapsed caret is not a selection).
 */
import { isModalDialogOpen, hasLiveTextSelection } from '../keyboardScope';

const mount = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
};

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('isModalDialogOpen — PTR-05', () => {
  it('is false on a bare page', () => {
    expect(isModalDialogOpen()).toBe(false);
  });

  it("matches MUI's Dialog paper (role=dialog + aria-modal)", () => {
    // What @mui/material v7 Dialog.js renders on its Paper slot.
    mount('<div role="dialog" aria-modal="true"><p>Help</p></div>');
    expect(isModalDialogOpen()).toBe(true);
  });

  it('matches an alertdialog and a native <dialog open>', () => {
    mount('<div role="alertdialog" aria-modal="true">Delete?</div>');
    expect(isModalDialogOpen()).toBe(true);
    document.body.innerHTML = '';

    mount('<dialog open>native</dialog>');
    expect(isModalDialogOpen()).toBe(true);
  });

  it('does NOT match a non-modal dialog', () => {
    // aria-modal="false" means the page behind it is still live.
    mount('<div role="dialog" aria-modal="false">docked panel</div>');
    expect(isModalDialogOpen()).toBe(false);
  });

  it('does NOT match the canvas context menu or a popover', () => {
    // The canvas context menu IS a canvas surface — blocking hotkeys while it
    // is open would be a regression, so MUI's Menu/Popover markup must miss.
    mount(
      '<div role="presentation" class="MuiPopover-root">' +
        '<ul role="menu"><li role="menuitem">Delete</li></ul>' +
        '</div>'
    );
    expect(isModalDialogOpen()).toBe(false);
  });
});

describe('hasLiveTextSelection — PTR-12', () => {
  const selectContentsOf = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  it('is false with no selection', () => {
    expect(hasLiveTextSelection()).toBe(false);
  });

  it('is true for a range over static, non-editable text', () => {
    // The exact shape `isEditableTarget` cannot see: a range over text that
    // focuses nothing, so Ctrl+C used to be swallowed with no native copy.
    const host = mount('<p id="t">copy me</p>');
    selectContentsOf(host.querySelector('#t')!);
    expect(hasLiveTextSelection()).toBe(true);
  });

  it('is false for a collapsed caret', () => {
    const host = mount('<p id="t">copy me</p>');
    const range = document.createRange();
    range.setStart(host.querySelector('#t')!.firstChild!, 2);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(hasLiveTextSelection()).toBe(false);
  });

  it('is false for a whitespace-only range', () => {
    // An idle Ctrl+C over a blank run must still reach the canvas copy.
    const host = mount('<p id="t">   </p>');
    selectContentsOf(host.querySelector('#t')!);
    expect(hasLiveTextSelection()).toBe(false);
  });
});
