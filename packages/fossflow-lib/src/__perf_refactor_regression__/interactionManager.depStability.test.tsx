/**
 * PERF REGRESSION — M-1: useInteractionManager dep array must be stable
 *
 * The main keydown useEffect in useInteractionManager had an 11-item dep array
 * that included the whole `scene` object:
 *
 *   }, [undo, redo, canUndo, canRedo, uiStateApi, createTextBox,
 *       deleteSelectedItems, deleteViewItem, deleteConnector,
 *       deleteTextBox, deleteRectangle, scene]);
 *
 * `scene` is the entire return value of useScene() — a new object on every
 * render.  This caused the keydown handler to be torn down and re-registered
 * (removeEventListener + addEventListener) on EVERY React render cycle,
 * including mouse moves.
 *
 * The fix: remove `scene` from the dep array. The callbacks destructured from
 * scene (createTextBox, deleteSelectedItems, etc.) already capture scene state
 * via their own closure/deps and are individually stable via useCallback.
 *
 * Contract:
 *  - The keydown useEffect dep array does NOT include the raw `scene` object
 *  - The dep array contains only stable primitives and stable callbacks
 *
 * Implementation note: we verify via source analysis since mounting the full
 * useInteractionManager requires a complete provider stack.
 */

import * as fs from 'fs';
import * as path from 'path';

const IM_PATH = path.resolve(
  __dirname,
  '../interaction/useInteractionManager.ts'
);

describe('useInteractionManager dep stability — M-1 regression', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(IM_PATH, 'utf8');
  });

  it('the keydown useEffect dep array does not contain the bare `scene` object', () => {
    // Find the closing dep array of the keydown handler effect.
    // It ends with:  }, [undo, redo, ..., scene]);
    // After the fix it must NOT have `scene` as a bare identifier in that array.
    //
    // We look for the dep array that closes the effect which registers
    // window.addEventListener('keydown', ...) — identified by proximity to that string.
    // The keydown effect structure is:
    //   window.addEventListener('keydown', handleKeyDown);
    //   return () => { window.removeEventListener('keydown', handleKeyDown); };
    // }, [dep, array]);
    // We must skip the return-block's closing `};` before reaching the dep array.
    const keydownEffectMatch = source.match(
      /window\.addEventListener\('keydown'[\s\S]*?\};\s*\n\s*\},\s*\[([^\]]*)\]/
    );
    expect(keydownEffectMatch).not.toBeNull();

    if (keydownEffectMatch) {
      const depArray = keydownEffectMatch[1];
      // `scene` as standalone token (not as part of another identifier like sceneState)
      const hasBareScene = /\bscene\b/.test(depArray);
      expect(hasBareScene).toBe(false);
    }
  });

  it('the keydown useEffect dep array uses individual scene callbacks, not the scene object', () => {
    // After the fix the deps should reference named callbacks from scene
    // e.g. createTextBox, deleteSelectedItems, deleteViewItem, etc.
    const keydownEffectMatch = source.match(
      /window\.addEventListener\('keydown'[\s\S]*?\};\s*\n\s*\},\s*\[([^\]]*)\]/
    );
    if (keydownEffectMatch) {
      const depArray = keydownEffectMatch[1];
      expect(depArray).toMatch(/deleteSelectedItems|deleteViewItem|createTextBox/);
    }
  });
});
