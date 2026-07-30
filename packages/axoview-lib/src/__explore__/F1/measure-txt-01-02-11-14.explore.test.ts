/**
 * F1 / TXT-01, TXT-02, TXT-11, TXT-14 — the text-measurement + whole-content
 * transform family.
 *
 * `getTextBoxDimensions` is the ONLY writer of `scene.textBoxes[id].size`
 * (stores/reducers/textBox.ts `syncTextBox`), and that size drives the
 * projected container, the selection outline and `getItemAtTile`. Anything it
 * under-counts is a box that paints outside its own footprint.
 *
 * RIG NOTE (COLDSTART "Rig traps"): every `it.failing` is paired with a passing
 * characterization that positively asserts the observed value, and each probe
 * asserts its PRECONDITION (that the content really is N visual rows / really
 * survives the sanitizer) so a probe whose setup didn't happen can't
 * masquerade as evidence.
 *
 * jsdom has no canvas 2D context and `getTextBoxDimensions` throws without one
 * — `installCanvasStub()` runs first (campaign trap #1).
 */
import { installCanvasStub } from 'src/__explore__/canvasStub';

installCanvasStub();

// eslint-disable-next-line import/first
import {
  getTextBoxDimensions,
  countHtmlLines,
  splitIntoMeasurableBlocks
} from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import {
  applyListFormat,
  ensureHtmlContent,
  isHtmlContent
} from 'src/utils/richTextTransform';
// eslint-disable-next-line import/first
import { sanitizeHtml } from 'src/utils/sanitizeHtml';
// eslint-disable-next-line import/first
import { ProjectionOrientationEnum, TextBox } from 'src/types';

const box = (content: string, extra: Partial<TextBox> = {}): TextBox =>
  ({
    id: 'tb1',
    tile: { x: 0, y: 0 },
    orientation: ProjectionOrientationEnum.X,
    content,
    ...extra
  } as TextBox);

// ---------------------------------------------------------------------------
// TXT-01 — legacy PLAIN-text content with newlines
// ---------------------------------------------------------------------------

describe('TXT-01 — plain-text content with newlines measures as one row', () => {
  const THREE_LINES = 'alpha\nbeta beta\ngamma gamma gamma';

  it('PRECONDITION: the content is not HTML, so the resting render paints it verbatim under white-space:pre', () => {
    // TextBox.tsx renders `textBox.content` as a TEXT child (not the HTML
    // sink) exactly when the content does NOT start with '<', and
    // useTextBoxProps gives an AUTO box `whiteSpace: 'pre'` — so every \n is a
    // rendered row.
    expect(isHtmlContent(THREE_LINES)).toBe(false);
    expect(THREE_LINES.split('\n')).toHaveLength(3);
    // The load path (useInitialDataManager) sanitizes but does NOT convert to
    // HTML, so the newlines survive into the model verbatim.
    expect(sanitizeHtml(THREE_LINES)).toBe(THREE_LINES);
  });

  it('CHARACTERIZATION: countHtmlLines short-circuits to 1 and the widest block is all three lines joined', () => {
    expect(countHtmlLines(THREE_LINES)).toBe(1);
    const blocks = splitIntoMeasurableBlocks(THREE_LINES);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(THREE_LINES);
  });

  it('CHARACTERIZATION: the measured size is 1 row tall, and wider than the same text as HTML', () => {
    const plain = getTextBoxDimensions(box(THREE_LINES));
    const asHtml = getTextBoxDimensions(
      box('<p>alpha</p><p>beta beta</p><p>gamma gamma gamma</p>')
    );
    expect(plain.height).toBe(1);
    expect(asHtml.height).toBeGreaterThan(plain.height);
    // Width: the plain path measures all three lines as ONE run, the HTML path
    // measures the longest line only.
    expect(plain.width).toBeGreaterThan(asHtml.width);
  });

  it.failing('TXT-01: a 3-line plain-text box should measure 3 rows tall (it measures 1)', () => {
    expect(getTextBoxDimensions(box(THREE_LINES)).height).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// TXT-02 — <div> / <br> block structure
// ---------------------------------------------------------------------------

describe('TXT-02 — <div>/<br> HTML measures as one row', () => {
  const DIV_HTML = '<div>alpha</div><div>beta</div><div>gamma</div>';
  const BR_HTML = '<p>alpha<br>beta<br>gamma</p>';

  it('PRECONDITION: the sanitizer keeps <div> and <br>, so this content reaches the render sink intact', () => {
    expect(sanitizeHtml(DIV_HTML)).toContain('<div>');
    expect(sanitizeHtml(DIV_HTML).match(/<div>/g)).toHaveLength(3);
    expect(sanitizeHtml(BR_HTML)).toContain('<br>');
    // Both are HTML by the render sniff, so they go to dangerouslySetInnerHTML
    // and the browser lays them out as three rows.
    expect(isHtmlContent(DIV_HTML)).toBe(true);
    expect(isHtmlContent(BR_HTML)).toBe(true);
  });

  it('CHARACTERIZATION: countHtmlLines sees no known closing tag in <div> content and floors at 1', () => {
    expect(countHtmlLines(DIV_HTML)).toBe(1);
    // <br> inside a <p> is one </p>, so exactly one line-height unit.
    expect(countHtmlLines(BR_HTML)).toBeCloseTo(1.2, 5);
  });

  it('CHARACTERIZATION: splitIntoMeasurableBlocks falls back to the longest-line heuristic for <div>', () => {
    const blocks = splitIntoMeasurableBlocks(DIV_HTML);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe('p');
  });

  it.failing('TXT-02: three <div> rows should measure 3 rows tall (they measure 1)', () => {
    expect(getTextBoxDimensions(box(DIV_HTML)).height).toBeGreaterThanOrEqual(3);
  });

  it.failing('TXT-02: three <br>-separated rows should measure 3 rows tall (they measure 1)', () => {
    expect(getTextBoxDimensions(box(BR_HTML)).height).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// TXT-11 — whole-content transforms over structure the leaf walk doesn't model
// ---------------------------------------------------------------------------

describe('TXT-11 — applyListFormat over unrecognised structure', () => {
  it('CHARACTERIZATION: <div> lines convert to list items (BLOCK_TAGS includes DIV)', () => {
    const out = applyListFormat('<div>a</div><div>b</div>', 'bullet', true);
    expect(out).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('CHARACTERIZATION: a nested list flattens to ONE list, keeping every item', () => {
    const out = applyListFormat(
      '<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul>',
      'bullet',
      true
    );
    expect(out).toContain('a');
    expect(out).toContain('b1');
  });

  it('TXT-11 probe: <br>-separated lines inside one block collapse into a SINGLE list item', () => {
    const out = applyListFormat('<p>a<br>b<br>c</p>', 'bullet', true);
    const items = out.match(/<li>/g) ?? [];
    // Documented outcome, whichever way it lands: one <li> means the three
    // visual rows became one bullet.
    expect(items.length).toBe(1);
    // …but no text is lost.
    expect(out).toContain('a');
    expect(out).toContain('c');
  });

  it('TXT-11 probe: no visible text is dropped by a table-structured conversion', () => {
    const src = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    const out = applyListFormat(src, 'bullet', true);
    expect(out).toContain('a');
    expect(out).toContain('b');
  });
});

// ---------------------------------------------------------------------------
// TXT-14 — plain text that begins with '<'
// ---------------------------------------------------------------------------

describe("TXT-14 — legacy plain text beginning with '<'", () => {
  const GENERIC = '<T> is a type parameter';

  it('PRECONDITION: the HTML sniff claims this plain text is HTML', () => {
    expect(isHtmlContent(GENERIC)).toBe(true);
  });

  it('CHARACTERIZATION: the sanitizer drops the <T> token and keeps the rest of the line', () => {
    const clean = sanitizeHtml(GENERIC);
    // What actually survives — pinned so a DOMPurify upgrade shows up here.
    expect(clean).toBe(' is a type parameter');
  });

  it('CHARACTERIZATION: ensureHtmlContent does NOT escape it — TextBoxInlineEditor\'s "legacy plain text escaped" comment describes an unreachable branch', () => {
    expect(ensureHtmlContent(GENERIC)).toBe(GENERIC);
    // The escape path exists but only runs for content that does NOT start
    // with '<' — exactly the content that never needed escaping.
    expect(ensureHtmlContent('a <T> b')).toBe('<p>a &lt;T&gt; b</p>');
  });

  it.failing("TXT-14: a plain-text box reading '<T> is a type parameter' should keep the '<T>' token", () => {
    expect(sanitizeHtml(ensureHtmlContent(GENERIC))).toContain('T');
  });

  it('CHARACTERIZATION: the loss is silent and permanent — the load path REWRITES content with the sanitized string', () => {
    // useInitialDataManager writes `content: sanitizeHtml(normalize(folded.content))`
    // back into the model, so one open+save is enough to lose the token for good.
    const afterLoad = sanitizeHtml(GENERIC);
    expect(afterLoad).not.toContain('<T>');
    expect(sanitizeHtml(afterLoad)).toBe(afterLoad);
  });
});
