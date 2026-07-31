// Pure tool-hotkey resolution — split out of useInteractionManager so it can be
// unit-tested without dragging in the whole interaction system (stores, modes,
// clipboard). The keydown dispatcher imports resolveToolHotkey from here.

import type { HotkeyMapping } from 'src/types/settings';

// Iteration order = resolution priority ("first match wins"); mirrors the
// original else-if order in the keydown handler.
export const TOOL_HOTKEY_ACTIONS = [
  'select',
  'pan',
  'addItem',
  'rectangle',
  'connector',
  'text',
  'lasso',
  'freehandLasso'
] as const;

export type ToolHotkeyAction = (typeof TOOL_HOTKEY_ACTIONS)[number];

// Resolve a keystroke to the matching tool-hotkey action for the active
// profile, or null. First match wins.
// #17: tool keys never resolve while Ctrl/Cmd is held — that chord belongs to
// the clipboard/history shortcuts (Ctrl+C copies; it must not also switch to the
// connector tool, whose hotkey is C in the default profile). Plain tool keys
// still resolve.
export const resolveToolHotkey = (
  isCtrlOrCmd: boolean,
  key: string,
  mapping: HotkeyMapping
): ToolHotkeyAction | null => {
  if (isCtrlOrCmd) return null;
  for (const action of TOOL_HOTKEY_ACTIONS) {
    if (mapping[action] && key === mapping[action]) return action;
  }
  return null;
};

/**
 * Which bracket a z-order chord names, across every identity a keyboard gives
 * it. `null` when the keystroke is not a bracket at all. (I1/PTR-14.)
 *
 * `handleZOrderShortcut` used to guard on `e.key !== ']' && e.key !== '['`. A
 * physical US keyboard emits the SHIFTED character while Shift is held, so the
 * documented Ctrl+Shift+] / Ctrl+Shift+[ "jump to front / back" chords arrive as
 * `}` / `{` and were rejected outright — the feature was dead in the product for
 * as long as it had existed. `z-order.spec.ts` asserted it worked and was a
 * false green: `page.keyboard.press('Control+Shift+]')` synthesises
 * `e.key === ']'` with `shiftKey` true, an identity no real keyboard produces.
 * The campaign caught it by re-driving the same chord through CDP
 * `Input.dispatchKeyEvent`, which sends what the hardware sends.
 *
 * `e.code` is the PHYSICAL key and is the reliable identity for a chord like
 * this. The character forms stay as a fallback for events carrying no `code`
 * (synthetic dispatch; layouts that reach a bracket through AltGr).
 *
 * Lives here rather than in the dispatcher so it is unit-testable without a
 * provider stack — the same reason `resolveToolHotkey` does.
 */
export const resolveZOrderDirection = (
  e: Pick<KeyboardEvent, 'key' | 'code'>
): 'front' | 'back' | null => {
  if (e.code === 'BracketRight' || e.key === ']' || e.key === '}') return 'front';
  if (e.code === 'BracketLeft' || e.key === '[' || e.key === '{') return 'back';
  return null;
};
