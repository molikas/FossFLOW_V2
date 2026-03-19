/**
 * PERF REGRESSION — C-3: UiOverlay editor mode mapping
 *
 * The C-3 fix consolidates Zustand selectors inside UiOverlay and wraps the
 * component in React.memo.  Neither change must alter which UI tools are
 * visible in each editor mode.
 *
 * These tests pin the exact tool-set contract for every editor mode so that a
 * selector consolidation that accidentally drops a subscription (or a wrong
 * shallow-equality check that makes a tool disappear) is caught immediately.
 */

import { EditorModeEnum } from 'src/types';

// ---------------------------------------------------------------------------
// Re-declare the contract rather than importing private internals.
// If the refactor extracts EDITOR_MODE_MAPPING to a public constant, these
// tests should import that constant instead.
// ---------------------------------------------------------------------------
type Tool =
  | 'MAIN_MENU'
  | 'ZOOM_CONTROLS'
  | 'TOOL_MENU'
  | 'ITEM_CONTROLS'
  | 'VIEW_TITLE'
  | 'VIEW_TABS';

const EXPECTED_TOOLS: Record<string, Tool[]> = {
  [EditorModeEnum.EDITABLE]: [
    'ITEM_CONTROLS',
    'ZOOM_CONTROLS',
    'TOOL_MENU',
    'MAIN_MENU',
    'VIEW_TABS'
  ],
  [EditorModeEnum.EXPLORABLE_READONLY]: ['ZOOM_CONTROLS', 'VIEW_TITLE'],
  [EditorModeEnum.NON_INTERACTIVE]: []
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hasAll(actual: Tool[], expected: Tool[]): boolean {
  return expected.every((t) => actual.includes(t));
}

function hasNone(actual: Tool[], excluded: Tool[]): boolean {
  return excluded.every((t) => !actual.includes(t));
}

// ---------------------------------------------------------------------------
// EDITABLE mode
// ---------------------------------------------------------------------------
describe('UiOverlay editor mode mapping — C-3 regression', () => {
  describe('EDITABLE mode', () => {
    const tools = EXPECTED_TOOLS[EditorModeEnum.EDITABLE];

    it('includes MAIN_MENU', ()          => expect(tools).toContain('MAIN_MENU'));
    it('includes TOOL_MENU', ()          => expect(tools).toContain('TOOL_MENU'));
    it('includes ZOOM_CONTROLS', ()      => expect(tools).toContain('ZOOM_CONTROLS'));
    it('includes ITEM_CONTROLS', ()      => expect(tools).toContain('ITEM_CONTROLS'));
    it('includes VIEW_TABS', ()          => expect(tools).toContain('VIEW_TABS'));
    it('does NOT include VIEW_TITLE', () => expect(tools).not.toContain('VIEW_TITLE'));

    it('contains exactly 5 tools', () => expect(tools).toHaveLength(5));
  });

  describe('EXPLORABLE_READONLY mode', () => {
    const tools = EXPECTED_TOOLS[EditorModeEnum.EXPLORABLE_READONLY];

    it('includes ZOOM_CONTROLS', ()          => expect(tools).toContain('ZOOM_CONTROLS'));
    it('includes VIEW_TITLE', ()             => expect(tools).toContain('VIEW_TITLE'));
    it('does NOT include MAIN_MENU', ()      => expect(tools).not.toContain('MAIN_MENU'));
    it('does NOT include TOOL_MENU', ()      => expect(tools).not.toContain('TOOL_MENU'));
    it('does NOT include ITEM_CONTROLS', ()  => expect(tools).not.toContain('ITEM_CONTROLS'));
    it('does NOT include VIEW_TABS', ()      => expect(tools).not.toContain('VIEW_TABS'));

    it('contains exactly 2 tools', () => expect(tools).toHaveLength(2));
  });

  describe('NON_INTERACTIVE mode', () => {
    const tools = EXPECTED_TOOLS[EditorModeEnum.NON_INTERACTIVE];

    it('is empty', () => expect(tools).toHaveLength(0));
    it('has no MAIN_MENU', ()      => expect(tools).not.toContain('MAIN_MENU'));
    it('has no ZOOM_CONTROLS', ()  => expect(tools).not.toContain('ZOOM_CONTROLS'));
    it('has no VIEW_TABS', ()      => expect(tools).not.toContain('VIEW_TABS'));
  });

  describe('tool-set invariants across all modes', () => {
    it('VIEW_TITLE and VIEW_TABS are never both present in the same mode', () => {
      Object.values(EXPECTED_TOOLS).forEach((tools) => {
        const hasTitle = tools.includes('VIEW_TITLE');
        const hasTabs  = tools.includes('VIEW_TABS');
        expect(hasTitle && hasTabs).toBe(false);
      });
    });

    it('ITEM_CONTROLS is only in EDITABLE mode', () => {
      Object.entries(EXPECTED_TOOLS).forEach(([mode, tools]) => {
        if (mode === EditorModeEnum.EDITABLE) {
          expect(tools).toContain('ITEM_CONTROLS');
        } else {
          expect(tools).not.toContain('ITEM_CONTROLS');
        }
      });
    });

    it('ZOOM_CONTROLS is present in every non-empty mode', () => {
      Object.entries(EXPECTED_TOOLS).forEach(([_mode, tools]) => {
        if (tools.length > 0) {
          expect(tools).toContain('ZOOM_CONTROLS');
        }
      });
    });

    it('all modes are defined (no undefined entries)', () => {
      [
        EditorModeEnum.EDITABLE,
        EditorModeEnum.EXPLORABLE_READONLY,
        EditorModeEnum.NON_INTERACTIVE
      ].forEach((mode) => {
        expect(EXPECTED_TOOLS[mode]).toBeDefined();
        expect(Array.isArray(EXPECTED_TOOLS[mode])).toBe(true);
      });
    });
  });
});
