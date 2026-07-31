/**
 * Promoted from the F1 explore lane (ADR 0047 flip rule) — TXT-01, TXT-02 and
 * TXT-14: the gap between the content vocabulary the EDITOR emits and the
 * vocabulary the supported INPUT surfaces can store.
 *
 * Quill normalises everything to `<p>`/`<li>`, so nothing typed on the canvas
 * produces the shapes below. But hand-edited or imported JSON, a project ZIP,
 * and diagrams from the upstream lineage all can — the repo's own
 * `packages/axoview-e2e/fixtures/view-mode-info-diagram.json` stores a
 * plain-text `content` — and `sanitizeHtml` keeps `<div>` and `<br>`, so they
 * reach `dangerouslySetInnerHTML` unchanged and lay out as N rows.
 *
 * Measurement that models fewer rows than the render paints leaves every row
 * after the first overhanging its tiles: outside the selection outline, outside
 * the transform box, outside `getItemAtTile`.
 */
import { countHtmlLines, splitIntoMeasurableBlocks } from '../isoMath';
import { isHtmlContent, ensureHtmlContent } from '../richTextTransform';
import { TEXTBOX_LINE_HEIGHT } from 'src/config';

const rows = (content: string) =>
  countHtmlLines(content) / TEXTBOX_LINE_HEIGHT;

describe('TXT-01 — plain text with newlines is measured row by row', () => {
  it('CONTROL: one row of plain text and one <p> row weigh the same', () => {
    expect(countHtmlLines('alpha')).toBeCloseTo(countHtmlLines('<p>alpha</p>'), 5);
  });

  it('three lines are three rows, not one', () => {
    expect(rows('alpha\nbeta\ngamma')).toBeCloseTo(3, 5);
  });

  it('and the WIDTH axis measures the lines separately, not concatenated', () => {
    // One block holding every line measured the lines end to end, which is what
    // made a multi-line plain-text box far too wide.
    const blocks = splitIntoMeasurableBlocks('alpha\nbeta\ngamma');
    expect(blocks.map((b) => b.text)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('an empty content still yields something to measure', () => {
    expect(splitIntoMeasurableBlocks('')).toHaveLength(1);
    expect(countHtmlLines('')).toBe(1);
  });
});

describe('TXT-02 — <div> rows and <br> breaks are rows too', () => {
  it('<div> rows count', () => {
    expect(rows('<div>a</div><div>b</div><div>c</div>')).toBeCloseTo(3, 5);
    expect(
      splitIntoMeasurableBlocks('<div>a</div><div>b</div>').map((b) => b.text)
    ).toEqual(['a', 'b']);
  });

  it('<br> inside one block counts', () => {
    expect(rows('<p>a<br>b<br>c</p>')).toBeCloseTo(3, 5);
    expect(
      splitIntoMeasurableBlocks('<p>a<br>b</p>').map((b) => b.text)
    ).toEqual(['a', 'b']);
  });

  it("Quill's blank line stays ONE row — <p><br></p> is not two", () => {
    expect(rows('<p><br></p>')).toBeCloseTo(1, 5);
    expect(rows('<p>a</p><p><br></p><p>b</p>')).toBeCloseTo(3, 5);
    expect(
      splitIntoMeasurableBlocks('<p>a</p><p><br></p><p>b</p>').map((b) => b.text)
    ).toEqual(['a', '', 'b']);
  });

  it('a trailing <br> before the block close is not a row either', () => {
    expect(rows('<p>a<br></p>')).toBeCloseTo(1, 5);
  });

  it('bare inline markup with no block wrapper still measures one row', () => {
    expect(rows('<strong>a</strong>')).toBeCloseTo(1, 5);
  });
});

describe('TXT-14 — "is this HTML?" needs a real tag, not a bare "<"', () => {
  it('plain text that opens with an angle bracket is PLAIN TEXT', () => {
    expect(isHtmlContent('<T> is a type parameter')).toBe(false);
    expect(isHtmlContent('<3')).toBe(false);
    expect(isHtmlContent('< p >')).toBe(false);
  });

  it('and is therefore escaped rather than handed to the HTML pipeline', () => {
    // The escape lived in `plainTextToHtml` all along — reachable only when the
    // sniff answers false, i.e. never for exactly the input it was written to
    // protect. DOMPurify then dropped the unknown `<T>` element and kept its
    // (empty) text content, and the load path wrote the loss back to the model.
    expect(ensureHtmlContent('<T> is a type parameter')).toBe(
      '<p>&lt;T&gt; is a type parameter</p>'
    );
  });

  it('real markup is still HTML, opening and closing tags alike', () => {
    expect(isHtmlContent('<p>hello</p>')).toBe(true);
    expect(isHtmlContent('  <div class="x">hi</div>')).toBe(true);
    expect(isHtmlContent('<br>')).toBe(true);
    expect(isHtmlContent('<strong>a</strong>')).toBe(true);
    // Malformed-but-real HTML must not be re-escaped into visible markup.
    expect(isHtmlContent('</p>orphan')).toBe(true);
  });

  it('empty and absent content are not HTML', () => {
    expect(isHtmlContent('')).toBe(false);
    expect(isHtmlContent(undefined)).toBe(false);
  });

  it('and the measurement agrees with the sniff — one row, not a parsed blob', () => {
    expect(rows('<T> is a type parameter')).toBeCloseTo(1, 5);
    expect(
      splitIntoMeasurableBlocks('<T> is a type parameter').map((b) => b.text)
    ).toEqual(['<T> is a type parameter']);
  });
});
