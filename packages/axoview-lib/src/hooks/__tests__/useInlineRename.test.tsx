/**
 * useInlineRename — canvas inline-rename click-away contract (shake-out #6,
 * ADR 0022 §4). Left-click-away + Enter PERSIST; right-click-away + Escape
 * CANCEL. These tests pin the commit-vs-cancel routing without depending on
 * jsdom's focus/innerText quirks: handlers are driven with synthetic events,
 * and the capture-phase pointerdown listener is exercised against a real
 * element with a spied `blur`.
 */
import { renderHook, act } from '@testing-library/react';
import { useInlineRename } from '../useInlineRename';

type AnyEvent = Record<string, unknown>;

const keyEvent = (key: string, blur: () => void, shiftKey = false): AnyEvent => ({
  key,
  shiftKey,
  stopPropagation: jest.fn(),
  preventDefault: jest.fn(),
  currentTarget: { blur }
});

describe('useInlineRename — commit/cancel contract', () => {
  // TXT-06 changed the AUTHORITY on ending a session from  to the
  // explicit press-away / key handlers: focus moves to the strip on a plain
  // mousedown, and a hook that reads that blur as "the user left" ended the
  // rename the moment the user reached for a style control.  is
  // idempotent, so the blur that follows is a no-op rather than a second commit.
  it('Enter commits the element text and prevents default', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const el = document.createElement('div');
    el.textContent = 'hello';
    document.body.appendChild(el);
    jest.spyOn(el, 'blur').mockImplementation(() => {});
    act(() => result.current.setRef(el));

    const blur = jest.fn();
    const e = keyEvent('Enter', blur);
    act(() => result.current.onKeyDown(e as never));

    expect(e.preventDefault).toHaveBeenCalled();
    expect(blur).toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith('hello');
    expect(cancel).not.toHaveBeenCalled();

    // The blur that follows is a no-op — one session, one outcome.
    act(() =>
      result.current.onBlur({ currentTarget: { innerText: 'hello' } } as never)
    );
    expect(commit).toHaveBeenCalledTimes(1);

    el.remove();
  });

  it('Escape blurs and the resulting blur CANCELS (no commit)', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const blur = jest.fn();
    act(() => result.current.onKeyDown(keyEvent('Escape', blur) as never));
    expect(blur).toHaveBeenCalled();

    act(() =>
      result.current.onBlur({ currentTarget: { innerText: 'edited' } } as never)
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('a plain blur (left-click away elsewhere) commits the current text', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    act(() =>
      result.current.onBlur({ currentTarget: { innerText: 'kept' } } as never)
    );
    expect(commit).toHaveBeenCalledWith('kept');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('multiline: Shift+Enter inserts a newline (does not blur/commit)', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel, multiline: true })
    );
    const blur = jest.fn();
    const e = keyEvent('Enter', blur, true);
    act(() => result.current.onKeyDown(e as never));
    expect(blur).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('pointerdown OUTSIDE with the left button commits the element text', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const el = document.createElement('div');
    el.textContent = 'v';
    document.body.appendChild(el);
    const blurSpy = jest.spyOn(el, 'blur').mockImplementation(() => {});
    act(() => result.current.setRef(el));

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    expect(blurSpy).toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith('v');
    expect(cancel).not.toHaveBeenCalled();

    el.remove();
  });

  // TXT-06 — the strip (and its MUI portals) is part of the session.
  it('pointerdown on the strip does NOT end the session', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const el = document.createElement('div');
    el.textContent = 'v';
    document.body.appendChild(el);
    jest.spyOn(el, 'blur').mockImplementation(() => {});
    act(() => result.current.setRef(el));

    const strip = document.createElement('div');
    strip.setAttribute('data-axoview-strip', 'true');
    const button = document.createElement('button');
    strip.appendChild(button);
    document.body.appendChild(strip);

    act(() => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    expect(commit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    // …and the blur that follows the focus move is not a commit either.
    act(() =>
      result.current.onBlur({
        currentTarget: { innerText: 'v' },
        relatedTarget: button
      } as never)
    );
    expect(commit).not.toHaveBeenCalled();

    el.remove();
    strip.remove();
  });

  it('pointerdown OUTSIDE with the right button cancels', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const el = document.createElement('div');
    document.body.appendChild(el);
    const blurSpy = jest.spyOn(el, 'blur').mockImplementation(() => {});
    act(() => result.current.setRef(el));

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 2 })
      );
    });
    expect(blurSpy).toHaveBeenCalled();

    act(() =>
      result.current.onBlur({ currentTarget: { innerText: 'v' } } as never)
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    el.remove();
  });

  it('pointerdown INSIDE the editor does not blur (cursor repositioning)', () => {
    const commit = jest.fn();
    const cancel = jest.fn();
    const { result } = renderHook(() =>
      useInlineRename({ active: true, commit, cancel })
    );
    const el = document.createElement('div');
    document.body.appendChild(el);
    const blurSpy = jest.spyOn(el, 'blur').mockImplementation(() => {});
    act(() => result.current.setRef(el));

    act(() => {
      el.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    expect(blurSpy).not.toHaveBeenCalled();

    el.remove();
  });
});
