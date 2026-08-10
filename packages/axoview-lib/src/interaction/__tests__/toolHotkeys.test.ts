import { resolveToolHotkey, resolveZOrderDirection } from '../toolHotkeys';
import { TOOL_HOTKEYS } from 'src/config/hotkeys';
import type { HotkeyMapping } from 'src/types/settings';

// T1 #17 — Ctrl/Cmd + a tool letter must NOT resolve to a tool. In the fixed
// scheme the connector tool is bound to "c", so before the guard Ctrl+C (copy)
// also switched to the connector tool. Ctrl+X / Ctrl+V never bound to a tool but
// are covered here too for the regression contract.
//
// The hotkey-profile machinery was removed (ADR 0022 §6) — TOOL_HOTKEYS is the
// single fixed mapping. The guard is still mapping-independent (it short-circuits
// before the lookup), proven below with an inline custom mapping.
describe('resolveToolHotkey', () => {
  const allNull: HotkeyMapping = {
    select: null,
    pan: null,
    addItem: null,
    rectangle: null,
    connector: null,
    text: null,
    lasso: null,
    freehandLasso: null
  };

  it('resolves a plain tool key (no modifier)', () => {
    expect(resolveToolHotkey(false, 'c', TOOL_HOTKEYS)).toBe('connector');
    expect(resolveToolHotkey(false, 'r', TOOL_HOTKEYS)).toBe('rectangle');
    expect(resolveToolHotkey(false, 't', TOOL_HOTKEYS)).toBe('text');
    expect(resolveToolHotkey(false, 'l', TOOL_HOTKEYS)).toBe('lasso');
  });

  it('does NOT resolve a tool while Ctrl/Cmd is held (#17)', () => {
    // The headline regression: Ctrl+C (copy) must not pick the connector tool.
    expect(resolveToolHotkey(true, 'c', TOOL_HOTKEYS)).toBeNull();
    expect(resolveToolHotkey(true, 'x', TOOL_HOTKEYS)).toBeNull();
    expect(resolveToolHotkey(true, 'v', TOOL_HOTKEYS)).toBeNull();
    // Cmd (meta) collapses to the same isCtrlOrCmd flag at the call site.
    expect(resolveToolHotkey(true, 'r', TOOL_HOTKEYS)).toBeNull();
  });

  it('applies the guard regardless of which letter a mapping binds', () => {
    // A custom mapping that binds the connector tool to "t" — the guard is
    // mapping-independent because it short-circuits before the lookup.
    const custom: HotkeyMapping = { ...allNull, connector: 't' };
    expect(resolveToolHotkey(false, 't', custom)).toBe('connector');
    expect(resolveToolHotkey(true, 't', custom)).toBeNull();
  });

  it('returns null for an unmapped key and for an all-null mapping', () => {
    expect(resolveToolHotkey(false, 'z', TOOL_HOTKEYS)).toBeNull();
    expect(resolveToolHotkey(false, 'c', allNull)).toBeNull();
  });
});

// Promoted from the exploratory lane (I1/PTR-14). The z-order guard matched
// `e.key === ']'` — the identity Playwright's `keyboard.press` synthesises, and
// the one a physical keyboard never sends while Shift is held. "Bring to front"
// and "send to back" were dead in the product, with `z-order.spec.ts` green.
describe('resolveZOrderDirection — real vs synthetic key identity (PTR-14)', () => {
  it('resolves the unshifted characters', () => {
    expect(resolveZOrderDirection({ key: ']', code: 'BracketRight' })).toBe(
      'front'
    );
    expect(resolveZOrderDirection({ key: '[', code: 'BracketLeft' })).toBe(
      'back'
    );
  });

  it('resolves the SHIFTED characters a real US keyboard sends (the bug)', () => {
    // Ctrl+Shift+] arrives as `}` from hardware. This is the whole defect.
    expect(resolveZOrderDirection({ key: '}', code: 'BracketRight' })).toBe(
      'front'
    );
    expect(resolveZOrderDirection({ key: '{', code: 'BracketLeft' })).toBe(
      'back'
    );
  });

  it('resolves from the physical key even when the character is neither', () => {
    // A layout where the bracket sits behind AltGr still reports the code.
    expect(resolveZOrderDirection({ key: 'å', code: 'BracketRight' })).toBe(
      'front'
    );
    expect(resolveZOrderDirection({ key: 'ø', code: 'BracketLeft' })).toBe(
      'back'
    );
  });

  it('resolves from the character alone when no code is carried', () => {
    // Synthetic dispatch (jsdom, older automation) omits `code`.
    expect(resolveZOrderDirection({ key: ']', code: '' })).toBe('front');
    expect(resolveZOrderDirection({ key: '{', code: '' })).toBe('back');
  });

  it('is null for anything that is not a bracket', () => {
    expect(resolveZOrderDirection({ key: 'z', code: 'KeyZ' })).toBeNull();
    expect(resolveZOrderDirection({ key: 'Enter', code: 'Enter' })).toBeNull();
    expect(resolveZOrderDirection({ key: ')', code: 'Digit0' })).toBeNull();
  });
});
