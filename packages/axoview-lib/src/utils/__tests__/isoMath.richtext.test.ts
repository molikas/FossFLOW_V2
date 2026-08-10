// @ts-nocheck
/**
 * Regression tests for canvas rich-text auto-grow behavior (MQA #11, reworked
 * by the ADR 0034 addendum 2026-07-03 — Lucid-parity line spacing + lists).
 *
 * These pin three contracts:
 *   1. countHtmlLines weights each block so the stored textbox `size.height`
 *      accommodates the rendered content. p/li carry ZERO margins and follow
 *      the box's line-spacing multiplier (TEXTBOX_LINE_HEIGHT default,
 *      per-box override); legacy blocks keep their fixed table weights.
 *   2. splitIntoMeasurableBlocks emits per-block scale factors so a long
 *      <h1> isn't underestimated relative to body paragraphs.
 *   3. splitIntoMeasurableBlocks emits per-block indentEm so a list item's
 *      marker gutter is counted in the box width — omitting it is what
 *      produced the "one character per line" list boxes.
 *
 * Drift in any contract would make textboxes clip their own content.
 */

import {
  countHtmlLines,
  splitIntoMeasurableBlocks,
  countGreedyWrappedLines,
  getTextBoxDimensions
} from 'src/utils/isoMath';
import {
  TEXTBOX_LINE_HEIGHT,
  CANVAS_RICHTEXT_LIST_INDENT_EM
} from 'src/config';

describe('shared formatting-geometry constants (ADR 0034 addendum)', () => {
  // Pin the values: the resting render, the inline editor CSS, and the
  // measurement all derive from these — an unreviewed bump reshapes every
  // saved diagram's text boxes.
  it('default line spacing is 1.2 (Lucid/Slides parity)', () => {
    expect(TEXTBOX_LINE_HEIGHT).toBe(1.2);
  });

  it('list text indent is 1.5em (matches quill.snow.css ol padding)', () => {
    expect(CANVAS_RICHTEXT_LIST_INDENT_EM).toBe(1.5);
  });
});

describe('countHtmlLines — weighted line counting', () => {
  // TXT-01/02: plain text is measured ROW BY ROW at the same weight as a `<p>`
  // row, because the resting render draws it `white-space: pre` and those rows
  // are the same height. It used to short-circuit to a flat 1 regardless of how
  // many newlines it held, so a multi-row plain-text box occupied a ONE-row
  // footprint and every row after the first overhung its tiles. The
  // single-row footprint is unchanged — ceil(1 × 0.6) and ceil(1.2 × 0.6) are
  // both one tile — so no existing single-line box moves.
  it('one plain-text row weighs the same as one <p> row', () => {
    expect(countHtmlLines('Text')).toBeCloseTo(TEXTBOX_LINE_HEIGHT, 5);
    expect(countHtmlLines('Text')).toBeCloseTo(countHtmlLines('<p>Text</p>'), 5);
    expect(countHtmlLines('')).toBe(1);
  });

  it('plain text counts one row per newline (TXT-01)', () => {
    expect(countHtmlLines('a\nb\nc')).toBeCloseTo(TEXTBOX_LINE_HEIGHT * 3, 5);
  });

  it('content with no leading TAG is plain text, not HTML', () => {
    expect(countHtmlLines('1. point one')).toBeCloseTo(TEXTBOX_LINE_HEIGHT, 5);
  });

  it('<div> rows and <br> breaks count (TXT-02)', () => {
    expect(countHtmlLines('<div>a</div><div>b</div>')).toBeCloseTo(
      TEXTBOX_LINE_HEIGHT * 2,
      5
    );
    expect(countHtmlLines('<p>a<br>b</p>')).toBeCloseTo(
      TEXTBOX_LINE_HEIGHT * 2,
      5
    );
  });

  it("Quill's blank line <p><br></p> stays ONE row", () => {
    expect(countHtmlLines('<p><br></p>')).toBeCloseTo(TEXTBOX_LINE_HEIGHT, 5);
    expect(countHtmlLines('<p>a<br></p>')).toBeCloseTo(TEXTBOX_LINE_HEIGHT, 5);
  });

  it('a <p> weighs exactly the default line-spacing multiplier (no margins)', () => {
    // Quill normalises typed plain text to `<p>...</p>` on edit. Every line
    // is a <p>, so any extra per-paragraph margin would stack invisible
    // spacing on top of the user's line-height — the "ridiculous line
    // height" bug. The weight must be the multiplier and nothing else.
    expect(countHtmlLines('<p>Text</p>')).toBeCloseTo(TEXTBOX_LINE_HEIGHT, 5);
  });

  it('p/li follow a per-box line-spacing override', () => {
    expect(countHtmlLines('<p>Text</p>', 2)).toBeCloseTo(2, 5);
    expect(
      countHtmlLines('<ul><li>One</li><li>Two</li></ul>', 1.5)
    ).toBeCloseTo(3, 5);
  });

  it('h1 weighs significantly more than a paragraph (legacy fixed weight)', () => {
    expect(countHtmlLines('<h1>Big</h1>')).toBeCloseTo(3.35, 5);
    expect(countHtmlLines('<h1>Big</h1>')).toBeGreaterThan(
      countHtmlLines('<p>Body</p>')
    );
  });

  it('legacy header weights ignore the line-spacing override', () => {
    expect(countHtmlLines('<h1>Big</h1>', 2)).toBeCloseTo(3.35, 5);
  });

  it('h2 between h1 and h3', () => {
    const h1 = countHtmlLines('<h1>X</h1>');
    const h2 = countHtmlLines('<h2>X</h2>');
    const h3 = countHtmlLines('<h3>X</h3>');
    expect(h2).toBeLessThan(h1);
    expect(h2).toBeGreaterThan(h3);
  });

  it('multi-block content sums weights', () => {
    const single = countHtmlLines('<p>A</p>');
    const triple = countHtmlLines('<p>A</p><p>B</p><p>C</p>');
    expect(triple).toBeCloseTo(single * 3, 5);
  });

  it('mixes block types correctly', () => {
    const total = countHtmlLines(
      '<h1>Title</h1><p>Body</p><blockquote>Quote</blockquote>'
    );
    expect(total).toBeCloseTo(3.35 + TEXTBOX_LINE_HEIGHT + 2.5, 5);
  });

  it('list items count via <li> (the <ul>/<ol> wrapper is structural)', () => {
    const list = countHtmlLines('<ul><li>One</li><li>Two</li></ul>');
    expect(list).toBeCloseTo(TEXTBOX_LINE_HEIGHT * 2, 5);
  });

  it('never returns less than 1 (Math.max floor)', () => {
    // Defensive: an empty regex match shouldn't underflow the auto-grown
    // dimensions to zero.
    expect(countHtmlLines('<div>raw</div>')).toBeGreaterThanOrEqual(1);
  });
});

describe('splitIntoMeasurableBlocks — per-block scale + indent', () => {
  it('plain text returns one block at scale 1.0, no indent', () => {
    expect(splitIntoMeasurableBlocks('Hello world')).toEqual([
      { text: 'Hello world', scale: 1.0, indentEm: 0, tag: 'p' }
    ]);
  });

  it('null/undefined content returns single empty block', () => {
    const result = splitIntoMeasurableBlocks(undefined as unknown as string);
    expect(result).toHaveLength(1);
    expect(result[0].scale).toBe(1.0);
    expect(result[0].indentEm).toBe(0);
  });

  it('extracts each <p> as its own block at scale 1.0', () => {
    const blocks = splitIntoMeasurableBlocks('<p>A</p><p>BB</p>');
    expect(blocks).toEqual([
      { text: 'A', scale: 1.0, indentEm: 0, tag: 'p' },
      { text: 'BB', scale: 1.0, indentEm: 0, tag: 'p' }
    ]);
  });

  it('list items carry the marker-gutter indent (the per-character-wrap fix)', () => {
    // The box width must fit text + indent: sizing lists for the bare text
    // let the 1.5em gutter eat the content width, wrapping every character
    // onto its own line.
    const blocks = splitIntoMeasurableBlocks(
      '<ul><li>One</li><li>Longer item</li></ul>'
    );
    expect(blocks).toEqual([
      { text: 'One', scale: 1.0, indentEm: CANVAS_RICHTEXT_LIST_INDENT_EM, tag: 'li' },
      {
        text: 'Longer item',
        scale: 1.0,
        indentEm: CANVAS_RICHTEXT_LIST_INDENT_EM,
        tag: 'li'
      }
    ]);
  });

  it('ordered lists carry the same indent', () => {
    const blocks = splitIntoMeasurableBlocks('<ol><li>First</li></ol>');
    expect(blocks[0].indentEm).toBe(CANVAS_RICHTEXT_LIST_INDENT_EM);
  });

  it('h1 block carries the 1.875 scale (matches CANVAS_RICHTEXT_SCALE)', () => {
    // Width measurement uses this scale — a 4-char h1 needs ~88% more
    // horizontal room than a 4-char paragraph. Without the scale the
    // textbox auto-grew too narrow and h1 lines wrapped or clipped.
    const blocks = splitIntoMeasurableBlocks('<h1>Test</h1>');
    expect(blocks).toEqual([{ text: 'Test', scale: 1.875, indentEm: 0, tag: 'h1' }]);
  });

  it('h2 scale is 1.5, h3 is 1.25', () => {
    expect(splitIntoMeasurableBlocks('<h2>x</h2>')[0].scale).toBe(1.5);
    expect(splitIntoMeasurableBlocks('<h3>x</h3>')[0].scale).toBe(1.25);
  });

  it('strips inner inline tags and entities', () => {
    const blocks = splitIntoMeasurableBlocks(
      '<p>Hello <strong>bold</strong>&nbsp;world</p>'
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello bold world');
  });

  it('keeps blank blocks with empty text (Quill emits <p><br></p> for blank lines)', () => {
    // Blank lines must survive into the block list so the fixed-width height
    // path counts them; the auto-width loop measures them as zero.
    const blocks = splitIntoMeasurableBlocks('<p>A</p><p><br></p><p>B</p>');
    expect(blocks.map((b) => b.text)).toEqual(['A', '', 'B']);
  });

  it('mixed content preserves block order and per-block scale', () => {
    const blocks = splitIntoMeasurableBlocks(
      '<h1>Big</h1><p>Body</p><h3>Sub</h3>'
    );
    expect(blocks).toEqual([
      { text: 'Big', scale: 1.875, indentEm: 0, tag: 'h1' },
      { text: 'Body', scale: 1.0, indentEm: 0, tag: 'p' },
      { text: 'Sub', scale: 1.25, indentEm: 0, tag: 'h3' }
    ]);
  });

  it('falls back to longest-line plain-text heuristic when regex matches nothing', () => {
    // Defensive: malformed/unknown HTML shouldn't return an empty array
    // (caller would divide by zero / produce 0-width textbox).
    const blocks = splitIntoMeasurableBlocks('<custom>foo</custom>');
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('countGreedyWrappedLines — pure word-wrap core (manual width, ADR 0034 addendum)', () => {
  it('empty text is one line', () => {
    expect(countGreedyWrappedLines([], 5, 100)).toBe(1);
  });

  it('words that fit stay on one line', () => {
    expect(countGreedyWrappedLines([30, 30, 20], 5, 100)).toBe(1);
  });

  it('wraps greedily at the available width (space width counted)', () => {
    // 40 + 5 + 40 = 85 fits; adding 5 + 40 would need 130 → wraps.
    expect(countGreedyWrappedLines([40, 40, 40], 5, 100)).toBe(2);
  });

  it('each word on its own line when only one fits per line', () => {
    expect(countGreedyWrappedLines([80, 80, 80], 5, 100)).toBe(3);
  });

  it('an over-long word hard-breaks across lines (break-word)', () => {
    // 250px word in a 100px line → 3 chunks.
    expect(countGreedyWrappedLines([250], 5, 100)).toBe(3);
  });

  it('an over-long word after existing content starts on a fresh line', () => {
    // 40 on line 1, then the 250px word takes lines 2-4.
    expect(countGreedyWrappedLines([40, 250], 5, 100)).toBe(4);
  });

  it('content continues on the over-long word tail line', () => {
    // 150px word = 2 chunks (tail 50px); a 40px word fits after the tail.
    expect(countGreedyWrappedLines([150, 40], 5, 100)).toBe(2);
  });

  it('degenerate available width never divides by zero', () => {
    expect(countGreedyWrappedLines([40], 5, 0)).toBe(1);
  });
});

describe('getTextBoxDimensions — manual width (ADR 0034 addendum)', () => {
  // jsdom has no canvas 2D context, so the wrap estimate degrades to one line
  // per block here — these pin the width passthrough/clamp and the per-block
  // height floor, not the wrap counts (countGreedyWrappedLines above owns
  // those; the e2e resize test exercises the real browser measurement).
  // Mock getContext → null explicitly: jsdom's own stub logs a
  // "Not implemented" jsdomError that fails the suite despite passing tests.
  beforeAll(() => {
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });
  const box = (overrides: Record<string, unknown>) =>
    ({
      id: 'tb',
      tile: { x: 0, y: 0 },
      content: '<p>a</p>',
      ...overrides
    } as never);

  it('a manual width is returned verbatim (auto measurement bypassed)', () => {
    const size = getTextBoxDimensions(box({ width: 3 }));
    expect(size.width).toBe(3);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it('manual width clamps to the 1-tile floor', () => {
    expect(getTextBoxDimensions(box({ width: 0.2 })).width).toBe(1);
  });

  it('fixed-width height sums per-block line-spacing units', () => {
    // Four paragraphs at (jsdom-degraded) one line each: 4 × 1.2 × 0.6 = 2.88
    // → ceil → 3 rows; a single paragraph gives 1 row.
    const tall = getTextBoxDimensions(
      box({ width: 3, content: '<p>a</p><p>b</p><p>c</p><p>d</p>' })
    );
    const short = getTextBoxDimensions(box({ width: 3 }));
    expect(tall.height).toBe(3);
    expect(short.height).toBe(1);
  });

  it('blank lines count toward fixed-width height', () => {
    const withBlank = getTextBoxDimensions(
      box({ width: 3, content: '<p>a</p><p><br></p><p>b</p><p><br></p>' })
    );
    expect(withBlank.height).toBe(
      getTextBoxDimensions(
        box({ width: 3, content: '<p>a</p><p>b</p><p>c</p><p>d</p>' })
      ).height
    );
  });

  it('manual height is a MINIMUM — content wins when taller (never clips)', () => {
    // Taller than content: the manual value sticks.
    expect(getTextBoxDimensions(box({ width: 3, height: 5 })).height).toBe(5);
    // Shorter than content: the content height wins (4 paragraphs → 3 rows).
    expect(
      getTextBoxDimensions(
        box({
          width: 3,
          height: 2,
          content: '<p>a</p><p>b</p><p>c</p><p>d</p>'
        })
      ).height
    ).toBe(3);
  });
});
