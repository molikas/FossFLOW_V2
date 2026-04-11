/**
 * REGRESSION — RichTextEditor Quill formats config
 *
 * Quill validates the `formats` array against its registered format registry
 * at mount time. 'bullet' is not a registered format — it is an alias for the
 * 'list' format's bullet variant and causes:
 *   quill Cannot register "bullet" specified in "formats" config.
 *
 * This test pins the real exported `formats` constant so 'bullet' cannot be
 * re-added accidentally.
 *
 * Note: the toolbar `tools` array uses { list: 'bullet' } — that is a toolbar
 * config object (renders the bullet-list button), NOT a format registration
 * string. The formats registry only needs 'list'.
 */

jest.mock('react-quill-new', () => ({ __esModule: true, default: () => null }));
jest.mock('@mui/material', () => ({ Box: () => null }));

import { formats } from '../RichTextEditor';

describe('RichTextEditor — Quill formats config', () => {
  it('does NOT contain "bullet" (unregistered Quill alias)', () => {
    expect(formats).not.toContain('bullet');
  });

  it('contains "list" (correct Quill list format covering both bullet and ordered)', () => {
    expect(formats).toContain('list');
  });

  it('contains all expected base formats', () => {
    const expected = [
      'bold',
      'italic',
      'underline',
      'strike',
      'link',
      'header',
      'list',
      'blockquote',
      'code-block'
    ];
    expected.forEach((f) => expect(formats).toContain(f));
  });

  it('has exactly 9 formats (pin count to catch unreviewed additions)', () => {
    expect(formats).toHaveLength(9);
  });
});
