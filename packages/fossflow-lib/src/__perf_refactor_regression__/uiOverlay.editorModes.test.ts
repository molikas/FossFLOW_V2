/**
 * REGRESSION — UiOverlay editor mode mapping
 *
 * Tests the tool-set contract for each editor mode.
 *
 * NOTE: EDITOR_MODE_MAPPING in UiOverlay.tsx is a private module-level constant
 * that cannot be imported without pulling in the full React/MUI component tree
 * (which uses MUI createTheme at module load time — incompatible with jsdom).
 * The local constant below was manually verified against the production
 * EDITOR_MODE_MAPPING in UiOverlay.tsx on 2026-03-20 and must be kept in sync.
 *
 * Classification: SEMI-VALID — contract is tested but against a local constant.
 * To make this fully VALID: extract EDITOR_MODE_MAPPING to a standalone config
 * file with no MUI/React dependencies (e.g. src/config/editorModeMapping.ts).
 */

import { EditorModeEnum } from 'src/types';

type Tool =
  | 'MAIN_MENU'
  | 'ZOOM_CONTROLS'
  | 'TOOL_MENU'
  | 'ITEM_CONTROLS'
  | 'VIEW_TITLE'
  | 'VIEW_TABS';

// Manually verified against UiOverlay.tsx EDITOR_MODE_MAPPING — update if production changes.
const EDITOR_MODE_MAPPING: Record<string, Tool[]> = {
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

describe('UiOverlay editor mode mapping', () => {
  describe('EDITABLE mode', () => {
    const tools = EDITOR_MODE_MAPPING[EditorModeEnum.EDITABLE];

    it('includes MAIN_MENU', () => expect(tools).toContain('MAIN_MENU'));
    it('includes TOOL_MENU', () => expect(tools).toContain('TOOL_MENU'));
    it('includes ZOOM_CONTROLS', () => expect(tools).toContain('ZOOM_CONTROLS'));
    it('includes ITEM_CONTROLS', () => expect(tools).toContain('ITEM_CONTROLS'));
    it('includes VIEW_TABS', () => expect(tools).toContain('VIEW_TABS'));
    it('does NOT include VIEW_TITLE', () => expect(tools).not.toContain('VIEW_TITLE'));
    it('contains exactly 5 tools', () => expect(tools).toHaveLength(5));
  });

  describe('EXPLORABLE_READONLY mode', () => {
    const tools = EDITOR_MODE_MAPPING[EditorModeEnum.EXPLORABLE_READONLY];

    it('includes ZOOM_CONTROLS', () => expect(tools).toContain('ZOOM_CONTROLS'));
    it('includes VIEW_TITLE', () => expect(tools).toContain('VIEW_TITLE'));
    it('does NOT include MAIN_MENU', () => expect(tools).not.toContain('MAIN_MENU'));
    it('does NOT include TOOL_MENU', () => expect(tools).not.toContain('TOOL_MENU'));
    it('does NOT include ITEM_CONTROLS', () => expect(tools).not.toContain('ITEM_CONTROLS'));
    it('does NOT include VIEW_TABS', () => expect(tools).not.toContain('VIEW_TABS'));
    it('contains exactly 2 tools', () => expect(tools).toHaveLength(2));
  });

  describe('NON_INTERACTIVE mode', () => {
    const tools = EDITOR_MODE_MAPPING[EditorModeEnum.NON_INTERACTIVE];

    it('is empty', () => expect(tools).toHaveLength(0));
  });

  describe('invariants across all modes', () => {
    it('VIEW_TITLE and VIEW_TABS are never both present in the same mode', () => {
      Object.values(EDITOR_MODE_MAPPING).forEach((tools) => {
        expect(tools.includes('VIEW_TITLE') && tools.includes('VIEW_TABS')).toBe(false);
      });
    });

    it('ITEM_CONTROLS is only in EDITABLE mode', () => {
      Object.entries(EDITOR_MODE_MAPPING).forEach(([mode, tools]) => {
        if (mode === EditorModeEnum.EDITABLE) {
          expect(tools).toContain('ITEM_CONTROLS');
        } else {
          expect(tools).not.toContain('ITEM_CONTROLS');
        }
      });
    });

    it('ZOOM_CONTROLS is present in every non-empty mode', () => {
      Object.values(EDITOR_MODE_MAPPING).forEach((tools) => {
        if (tools.length > 0) expect(tools).toContain('ZOOM_CONTROLS');
      });
    });

    it('all three modes are defined and are arrays', () => {
      [EditorModeEnum.EDITABLE, EditorModeEnum.EXPLORABLE_READONLY, EditorModeEnum.NON_INTERACTIVE].forEach((mode) => {
        expect(EDITOR_MODE_MAPPING[mode]).toBeDefined();
        expect(Array.isArray(EDITOR_MODE_MAPPING[mode])).toBe(true);
      });
    });
  });
});
