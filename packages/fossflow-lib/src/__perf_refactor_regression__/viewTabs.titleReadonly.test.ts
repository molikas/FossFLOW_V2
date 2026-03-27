/**
 * REGRESSION — ViewTabs: diagram title card is read-only
 *
 * After the toolbar UX overhaul, the diagram title is managed exclusively at the
 * file/storage level (Save / Save As). The title card in ViewTabs must not offer
 * an inline rename — no pencil icon, no TextField, no isTitleEditing state.
 *
 * View tab names (page names) remain renameable — only the diagram title card
 * is locked to read-only.
 *
 * This test reads the source to pin the read-only contract so it cannot
 * silently regress.
 */

import * as fs from 'fs';
import * as path from 'path';

const VIEWTABS_PATH = path.resolve(
  __dirname,
  '../components/ViewTabs/ViewTabs.tsx'
);

describe('ViewTabs — diagram title card is read-only', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(VIEWTABS_PATH, 'utf-8');
  });

  it('ViewTabs.tsx exists', () => {
    expect(fs.existsSync(VIEWTABS_PATH)).toBe(true);
  });

  it('title card is annotated as read-only in a comment', () => {
    expect(src).toContain('read-only; name is managed via Save');
  });

  it('isTitleEditing variable has been removed', () => {
    expect(src).not.toContain('isTitleEditing');
  });

  it('does not open a TextField for the title card', () => {
    // The title card must only show Typography, not an editable TextField
    // Check that the read-only section does not contain TextField
    const titleCardSection = src.split('ChevronRight')[0]; // everything before the separator
    expect(titleCardSection).not.toContain('<TextField');
  });

  it('view tab names are still renameable (startEdit for view kind present)', () => {
    expect(src).toContain("kind: 'view'");
  });

  it('view tabs still contain a rename (Edit) icon button for page names', () => {
    expect(src).toContain('<Edit');
  });
});
