/**
 * ADR 0034 §2 — whole-content transforms behind the strip's dual-scope format
 * cluster. These pin the "text box selected (not editing)" path: pressed-state
 * detection and apply/remove across the full content, for HTML and plain-text
 * content alike. Only Quill-whitelisted tags may be emitted (strong/em/u/s/
 * p/ul/ol/li) so the next live-editor session round-trips the result.
 */
import {
  plainTextToHtml,
  ensureHtmlContent,
  isHtmlContent,
  getWholeContentFormats,
  applyInlineFormat,
  applyListFormat,
  applyAlignFormat,
  normalizeQuillHtmlSpaces
} from '../richTextTransform';

describe('plainTextToHtml / ensureHtmlContent', () => {
  it('escapes HTML-significant characters and wraps lines in <p>', () => {
    expect(plainTextToHtml('<todo> & "fix"')).toBe(
      '<p>&lt;todo&gt; &amp; &quot;fix&quot;</p>'
    );
  });

  it('keeps blank lines as <p><br></p>', () => {
    expect(plainTextToHtml('a\n\nb')).toBe('<p>a</p><p><br></p><p>b</p>');
  });

  it('passes HTML content through and converts plain text', () => {
    expect(isHtmlContent('<p>x</p>')).toBe(true);
    expect(isHtmlContent('plain')).toBe(false);
    expect(ensureHtmlContent('<p>x</p>')).toBe('<p>x</p>');
    expect(ensureHtmlContent('plain')).toBe('<p>plain</p>');
    expect(ensureHtmlContent('')).toBe('');
  });
});

describe('getWholeContentFormats', () => {
  const NO_PARTIAL = {
    bold: false,
    italic: false,
    underline: false,
    strike: false
  };

  it('reports nothing for plain text and empty content', () => {
    expect(getWholeContentFormats('hello')).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      partial: NO_PARTIAL,
      list: null,
      align: 'left'
    });
    expect(getWholeContentFormats('')).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      partial: NO_PARTIAL,
      list: null,
      align: 'left'
    });
    expect(getWholeContentFormats(undefined).bold).toBe(false);
  });

  // TXT-13 — the tri-state the strip needs. A box with ONE bolded word used to
  // report `bold: false` with nothing else to say, so the strip showed it as
  // plain and one press normalised the whole box; the press after that reached
  // the destructive "unwrap every STRONG" branch and the user's per-word run
  // went with it. `partial` makes that first state visible.
  it('reports partial coverage separately from full coverage', () => {
    const oneBoldWord = '<p>plain <strong>bold</strong> plain</p>';
    const formats = getWholeContentFormats(oneBoldWord);
    expect(formats.bold).toBe(false);
    expect(formats.partial.bold).toBe(true);
    expect(formats.partial.italic).toBe(false);
  });

  it('a fully covered box is on, not partial', () => {
    const formats = getWholeContentFormats('<p><strong>all bold</strong></p>');
    expect(formats.bold).toBe(true);
    expect(formats.partial.bold).toBe(false);
  });

  it('one bolded line out of two is partial', () => {
    const formats = getWholeContentFormats(
      '<p><strong>a</strong></p><p>b</p>'
    );
    expect(formats.bold).toBe(false);
    expect(formats.partial.bold).toBe(true);
  });

  it('detects a format only when the ENTIRE content carries it', () => {
    expect(getWholeContentFormats('<p><strong>a</strong></p>').bold).toBe(true);
    expect(getWholeContentFormats('<p><strong>a</strong> b</p>').bold).toBe(
      false
    );
    expect(
      getWholeContentFormats('<p><strong>a</strong></p><p>b</p>').bold
    ).toBe(false);
    // Browser-synonym tags count when reading.
    expect(getWholeContentFormats('<p><b>a</b></p>').bold).toBe(true);
    expect(getWholeContentFormats('<p><u>a</u></p>').underline).toBe(true);
    expect(getWholeContentFormats('<p><s>a</s></p>').strike).toBe(true);
    expect(getWholeContentFormats('<p><em>a</em></p>').italic).toBe(true);
  });

  it('detects a uniform list and rejects mixed structures', () => {
    expect(getWholeContentFormats('<ul><li>a</li><li>b</li></ul>').list).toBe(
      'bullet'
    );
    expect(getWholeContentFormats('<ol><li>a</li></ol>').list).toBe('ordered');
    expect(
      getWholeContentFormats('<p>a</p><ul><li>b</li></ul>').list
    ).toBeNull();
  });
});

describe('applyInlineFormat', () => {
  it('bolds plain-text content (escaped + wrapped)', () => {
    expect(applyInlineFormat('hello', 'bold', true)).toBe(
      '<p><strong>hello</strong></p>'
    );
  });

  it('wraps every leaf block, skipping already-covered ones', () => {
    const out = applyInlineFormat(
      '<p><strong>a</strong></p><p>b</p>',
      'bold',
      true
    );
    expect(out).toBe('<p><strong>a</strong></p><p><strong>b</strong></p>');
    expect(getWholeContentFormats(out).bold).toBe(true);
  });

  it('removes the format including synonym tags and nesting', () => {
    const out = applyInlineFormat(
      '<p><strong>a <b>c</b></strong></p><p><b>b</b></p>',
      'bold',
      false
    );
    expect(out).toBe('<p>a c</p><p>b</p>');
  });

  it('formats list items in place', () => {
    const out = applyInlineFormat('<ul><li>a</li><li>b</li></ul>', 'underline', true);
    expect(out).toBe('<ul><li><u>a</u></li><li><u>b</u></li></ul>');
  });

  it('round-trips apply → remove back to the unformatted content', () => {
    const on = applyInlineFormat('<p>a</p><p>b</p>', 'strike', true);
    expect(applyInlineFormat(on, 'strike', false)).toBe('<p>a</p><p>b</p>');
  });
});

describe('applyListFormat', () => {
  it('converts paragraphs to one list, preserving inline formatting', () => {
    expect(
      applyListFormat('<p><strong>a</strong></p><p>b</p>', 'bullet', true)
    ).toBe('<ul><li><strong>a</strong></li><li>b</li></ul>');
  });

  it('converts plain text lines to list items', () => {
    expect(applyListFormat('a\nb', 'ordered', true)).toBe(
      '<ol><li>a</li><li>b</li></ol>'
    );
  });

  it('flattens legacy headers into items (block format replaced)', () => {
    expect(applyListFormat('<h1>Title</h1><p>x</p>', 'bullet', true)).toBe(
      '<ul><li>Title</li><li>x</li></ul>'
    );
  });

  it('re-typing an existing list swaps the container', () => {
    expect(
      applyListFormat('<ul><li>a</li><li>b</li></ul>', 'ordered', true)
    ).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('unwraps lists back to paragraphs', () => {
    expect(
      applyListFormat('<ul><li><em>a</em></li><li>b</li></ul>', 'bullet', false)
    ).toBe('<p><em>a</em></p><p>b</p>');
  });
});

describe('applyAlignFormat / getWholeContentFormats.align (ADR 0034 addendum 2026-07-03)', () => {
  it('applies an inline text-align style to every leaf block', () => {
    expect(applyAlignFormat('<p>a</p><p>b</p>', 'center')).toBe(
      '<p style="text-align: center;">a</p><p style="text-align: center;">b</p>'
    );
  });

  it('aligns plain-text content by converting it to paragraphs first', () => {
    expect(applyAlignFormat('hello', 'right')).toBe(
      '<p style="text-align: right;">hello</p>'
    );
  });

  it('aligns list items (the leaf blocks), not the list container', () => {
    expect(applyAlignFormat('<ul><li>a</li></ul>', 'center')).toBe(
      '<ul><li style="text-align: center;">a</li></ul>'
    );
  });

  it("'left' removes the style entirely (default stored as absent)", () => {
    const centered = applyAlignFormat('<p>a</p>', 'center');
    expect(applyAlignFormat(centered, 'left')).toBe('<p>a</p>');
  });

  it("'left' keeps unrelated inline styles while dropping text-align", () => {
    expect(
      applyAlignFormat('<p style="color: red; text-align: center;">a</p>', 'left')
    ).toBe('<p style="color: red;">a</p>');
  });

  it('reads a uniform alignment back', () => {
    const centered = applyAlignFormat('<p>a</p><p>b</p>', 'center');
    expect(getWholeContentFormats(centered).align).toBe('center');
  });

  it('unaligned content reads as left', () => {
    expect(getWholeContentFormats('<p>a</p>').align).toBe('left');
  });

  it('mixed alignment reads as null', () => {
    const mixed =
      '<p style="text-align: center;">a</p><p style="text-align: right;">b</p>';
    expect(getWholeContentFormats(mixed).align).toBe(null);
  });

  it('alignment survives the list toggle in both directions', () => {
    const centered = applyAlignFormat('<p>a</p>', 'center');
    const asList = applyListFormat(centered, 'bullet', true);
    expect(getWholeContentFormats(asList).align).toBe('center');
    const backToParagraphs = applyListFormat(asList, 'bullet', false);
    expect(getWholeContentFormats(backToParagraphs).align).toBe('center');
  });
});

describe('normalizeQuillHtmlSpaces (ADR 0034 addendum 2026-07-04)', () => {
  const NBSP = String.fromCharCode(0xa0);

  it('converts Quill-serialized &nbsp; entities to real spaces', () => {
    // getSemanticHTML emits EVERY space as &nbsp;, turning a paragraph into
    // one unbreakable word — manual-width boxes could never soft-wrap.
    expect(
      normalizeQuillHtmlSpaces('<p>Hello&nbsp;world&nbsp;this&nbsp;is</p>')
    ).toBe('<p>Hello world this is</p>');
  });

  it('converts literal U+00A0 characters too', () => {
    expect(normalizeQuillHtmlSpaces(`<p>a${NBSP}b</p>`)).toBe('<p>a b</p>');
  });

  it('leaves already-normal content untouched', () => {
    expect(normalizeQuillHtmlSpaces('<p>a b</p>')).toBe('<p>a b</p>');
  });
});
