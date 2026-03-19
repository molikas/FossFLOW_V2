/**
 * SVG Export Optimizer — Phases 1, 2, 3
 *
 * Strategy: only DELETE things that have zero layout/visual effect in a
 * static exported SVG. Never move inline styles to class rules (that
 * reduces CSS specificity and lets embedded MUI stylesheet rules win).
 *
 * Phase 1 — remove irrelevant CSS properties from inline style strings
 * Phase 2 — round floats to 2 decimal places
 * Phase 3 — prune display:none subtrees
 */

// ---------------------------------------------------------------------------
// Phase 1 — Property block-list
// These properties have no effect in a static, non-interactive SVG export.
// Removing them cannot affect layout or appearance.
// ---------------------------------------------------------------------------

/** Exact property names to strip (case-insensitive match on the key). */
const STRIP_EXACT = new Set([
  // Animation / transition
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  'animation-fill-mode', 'animation-play-state',
  'transition', 'transition-property', 'transition-duration',
  'transition-timing-function', 'transition-delay',
  'will-change',
  // Interaction
  'touch-action', 'caret-color', 'resize',
  // Print
  'orphans', 'widows', 'page-break-before', 'page-break-after',
  'page-break-inside', 'break-before', 'break-after', 'break-inside',
  // Scroll
  'scroll-behavior', 'overscroll-behavior', 'overscroll-behavior-x',
  'overscroll-behavior-y', 'overscroll-behavior-block', 'overscroll-behavior-inline',
  'scroll-snap-type', 'scroll-snap-align', 'scroll-snap-stop',
  // Misc
  'tab-size', 'appearance', '-webkit-appearance',
  // Logical CSS props — physical equivalents are present AND the logical sizing
  // props (inline-size/block-size) are intentionally kept because in
  // position:absolute elements inside transformed coordinate spaces the browser
  // may resolve available inline space from the logical property, not width alone.
  // Margin/padding/border logical props are safe to strip — their physical
  // counterparts (margin-top, padding-left, etc.) remain.
  'margin-block', 'margin-block-start', 'margin-block-end',
  'margin-inline', 'margin-inline-start', 'margin-inline-end',
  'padding-block', 'padding-block-start', 'padding-block-end',
  'padding-inline', 'padding-inline-start', 'padding-inline-end',
  'inset-block', 'inset-block-start', 'inset-block-end',
  'inset-inline', 'inset-inline-start', 'inset-inline-end',
  'border-block', 'border-block-color', 'border-block-style', 'border-block-width',
  'border-block-start', 'border-block-start-color', 'border-block-start-style', 'border-block-start-width',
  'border-block-end', 'border-block-end-color', 'border-block-end-style', 'border-block-end-width',
  'border-inline', 'border-inline-color', 'border-inline-style', 'border-inline-width',
  'border-inline-start', 'border-inline-start-color', 'border-inline-start-style', 'border-inline-start-width',
  'border-inline-end', 'border-inline-end-color', 'border-inline-end-style', 'border-inline-end-width',
  'border-start-start-radius', 'border-start-end-radius',
  'border-end-start-radius', 'border-end-end-radius',
  'overflow-block', 'overflow-inline',
]);

/** Prefix patterns to strip (property starts with one of these). */
const STRIP_PREFIXES = ['-webkit-', '-moz-', '-ms-', '-o-'];

/**
 * Vendor-prefixed properties that affect text metrics or font rendering
 * and must be preserved to keep text fitting its measured container.
 */
const VENDOR_KEEP = new Set([
  '-webkit-font-smoothing',  // changes antialiasing → affects text width on some systems
  '-webkit-locale',          // affects font selection for character sets
  '-webkit-font-feature-settings', // affects ligatures / kern
]);

function shouldStripProperty(prop: string): boolean {
  const lower = prop.toLowerCase().trim();
  if (STRIP_EXACT.has(lower)) return true;
  if (VENDOR_KEEP.has(lower)) return false; // preserve even though vendor-prefixed
  for (const prefix of STRIP_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Phase 1: Strip irrelevant CSS properties from a single inline style string.
 * Input:  "position: absolute; -webkit-tap-highlight-color: rgba(0,0,0,0); width: 100px;"
 * Output: "position: absolute; width: 100px;"
 */
export function stripIrrelevantProperties(styleStr: string): string {
  if (!styleStr) return styleStr;
  return styleStr
    .split(';')
    .map(decl => decl.trim())
    .filter(decl => {
      if (!decl) return false;
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) return true; // keep malformed declarations
      const prop = decl.slice(0, colonIdx).trim();
      return !shouldStripProperty(prop);
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// Phase 2 — Float rounding
// ---------------------------------------------------------------------------

const FLOAT_RE = /(-?\d+\.\d{3,})/g;

function roundFloat(s: string): string {
  return parseFloat(s).toFixed(2).replace(/\.?0+$/, '') || '0';
}

/**
 * Phase 2: Round all floats with 3+ decimal places to 2dp in a string.
 * Safe for SVG coordinate attributes and CSS transform/perspective values.
 * "12.345678px" → "12.35px",  "0.100000" → "0.1"
 */
export function roundNumbers(s: string): string {
  if (!s) return s;
  return s.replace(FLOAT_RE, roundFloat);
}

/**
 * CSS properties that define layout dimensions or positions.
 * Rounding these can shrink a label container by sub-pixel amounts and
 * cause text that exactly fit the DOM to overflow in the SVG renderer.
 * We preserve exact values for these — only SVG coordinate attrs get rounded.
 */
const LAYOUT_PROPS = new Set([
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  // Logical sizing props — kept alongside physical width/height (see STRIP_EXACT comment)
  'inline-size', 'block-size', 'min-inline-size', 'max-inline-size', 'min-block-size', 'max-block-size',
  'top', 'right', 'bottom', 'left', 'inset',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-width', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width',
  'font-size', 'line-height', 'letter-spacing', 'word-spacing',
]);

/**
 * Round floats only in CSS properties that are safe to round
 * (transforms, perspective-origin, transform-origin, opacity, etc.).
 * Layout-critical properties are left untouched.
 */
export function roundStyleDeclarations(styleStr: string): string {
  if (!styleStr) return styleStr;
  return styleStr
    .split(';')
    .map(decl => {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) return decl;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      if (LAYOUT_PROPS.has(prop)) return decl; // preserve exact layout values
      return roundNumbers(decl);
    })
    .join(';');
}

// ---------------------------------------------------------------------------
// Phase 3 — Prune display:none subtrees
// ---------------------------------------------------------------------------

const DISPLAY_NONE_RE = /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/i;

function isDisplayNone(el: Element): boolean {
  const style = el.getAttribute('style') || '';
  return DISPLAY_NONE_RE.test(style);
}

/**
 * Phase 3: Remove all elements (and their subtrees) that have display:none.
 * Operates in-place on the provided document.
 */
export function pruneHiddenElements(doc: Document): void {
  // Collect first so we don't mutate during traversal
  const toRemove: Element[] = [];
  const walker = doc.createTreeWalker(doc.documentElement, 0x1 /* SHOW_ELEMENT */);
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (isDisplayNone(node)) {
      toRemove.push(node);
      // Skip children — they'll be removed with the parent
      node = walker.nextSibling() as Element | null ?? walker.nextNode() as Element | null;
    } else {
      node = walker.nextNode() as Element | null;
    }
  }
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Optimise a raw SVG data-URL produced by dom-to-image-more.
 *
 * Applies Phase 1 (property removal), Phase 2 (number rounding),
 * Phase 3 (prune hidden elements) and returns an optimised data-URL.
 */
export async function optimizeSvgDataUrl(svgDataUrl: string): Promise<string> {
  // Decode data URL → raw SVG string
  const prefix = 'data:image/svg+xml;charset=utf-8,';
  const base64prefix = 'data:image/svg+xml;base64,';

  let svgText: string;
  if (svgDataUrl.startsWith(base64prefix)) {
    svgText = atob(svgDataUrl.slice(base64prefix.length));
  } else if (svgDataUrl.startsWith(prefix)) {
    svgText = decodeURIComponent(svgDataUrl.slice(prefix.length));
  } else {
    // Unknown format — return as-is
    return svgDataUrl;
  }

  // Parse into a DOM so we can walk it properly
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.warn('[svgOptimizer] parse error, returning original');
    return svgDataUrl;
  }

  // Phase 3: remove display:none subtrees first (fewer nodes to process)
  pruneHiddenElements(doc);

  // Phase 1 + 2: walk every element and clean its style attribute
  const allElements = doc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const style = el.getAttribute('style');
    if (style) {
      let cleaned = stripIrrelevantProperties(style);  // Phase 1
      cleaned = roundStyleDeclarations(cleaned);        // Phase 2 (layout-safe)
      if (cleaned !== style) {
        el.setAttribute('style', cleaned);
      }
    }

    // Phase 2: round SVG coordinate attributes (safe — these are geometry, not box layout)
    for (const attr of ['d', 'transform', 'viewBox', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                         'cx', 'cy', 'r', 'rx', 'ry',
                         'points', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset']) {
      const val = el.getAttribute(attr);
      if (val) {
        const rounded = roundNumbers(val);
        if (rounded !== val) el.setAttribute(attr, rounded);
      }
    }
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  const optimized = serializer.serializeToString(doc);

  // Re-encode as base64 to avoid URL-encoding issues with complex SVG content
  const encoded = btoa(unescape(encodeURIComponent(optimized)));
  return `${base64prefix}${encoded}`;
}
