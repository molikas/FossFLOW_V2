/**
 * A3/ZIP-05 — the project-zip import toast counted the diagrams the MANIFEST
 * claimed, not the ones `importProject` actually created, so an archive with a
 * skipped entry reported "Imported 3 diagrams" over a workspace that had gained
 * two. Promoted from the probe lane (`__explore__/A3/zip-*`).
 */
import { buildZipImportSummary } from '../importSummary';

describe('buildZipImportSummary', () => {
  it('reports what was created', () => {
    expect(buildZipImportSummary(3, 2)).toBe(
      'Imported 3 diagrams across 2 folders at the top level'
    );
  });

  it('omits the folder clause when there are none, and singularises', () => {
    expect(buildZipImportSummary(1, 0)).toBe('Imported 1 diagram at the top level');
  });

  it('names the gap when the archive claimed more than landed', () => {
    expect(buildZipImportSummary(2, 0, 3)).toBe(
      'Imported 2 diagrams at the top level — 1 diagram in the archive could not be imported'
    );
  });

  it('says nothing extra when the two agree', () => {
    expect(buildZipImportSummary(2, 0, 2)).not.toMatch(/could not be imported/);
  });

  // A3/ZIP-02 — links to diagrams the archive does not contain are dropped, and
  // the user is told rather than left with a node that silently lost its link.
  it('names dropped cross-diagram links', () => {
    expect(buildZipImportSummary(2, 0, 2, 1)).toBe(
      'Imported 2 diagrams at the top level — 1 link to a diagram outside the archive was removed'
    );
  });

  it('reports both kinds of shortfall together', () => {
    expect(buildZipImportSummary(2, 0, 3, 2)).toMatch(
      /1 diagram in the archive could not be imported; 2 links to diagrams outside the archive were removed/
    );
  });
});
