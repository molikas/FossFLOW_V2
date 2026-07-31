// Whole-content rich-text transforms for the strip's dual-scope format cluster
// (ADR 0034 §2). When a text box is merely SELECTED (no mounted editor), the
// strip formats the whole content by transforming the stored HTML directly —
// a pure DOMParser walk, deliberately NOT a headless Quill instance (Quill
// binds document listeners at import time and drags its runtime into jsdom
// tests for zero gain). Only Quill-whitelisted tags are emitted
// (strong/em/u/s/p/ul/ol/li), so the next live-editor session round-trips the
// result losslessly.

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike';
export type ListType = 'bullet' | 'ordered';
// Paragraph alignment (ADR 0034 addendum 2026-07-03). Stored as an inline
// `text-align` style on leaf blocks — both editors register Quill's STYLE
// align attributor so the live editor emits the same representation, the
// sanitizer keeps it (DOMPurify html profile allows style), and the resting
// render needs no extra CSS. 'left' is the default and is stored as ABSENT.
export type TextAlign = 'left' | 'center' | 'right';

// Tags that COUNT as carrying a format when reading (renderer/browser
// synonyms included) vs the single canonical tag written by transforms.
const INLINE_TAGS: Record<InlineFormat, ReadonlySet<string>> = {
  bold: new Set(['STRONG', 'B']),
  italic: new Set(['EM', 'I']),
  underline: new Set(['U']),
  strike: new Set(['S', 'STRIKE', 'DEL'])
};
const CANONICAL_TAG: Record<InlineFormat, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's'
};

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'DIV',
  'TABLE',
  'TBODY',
  'THEAD',
  'TR',
  'TD',
  'TH'
]);

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Quill's `getSemanticHTML()` serializes EVERY space as `&nbsp;`, which turns
 * a whole paragraph into one unbreakable "word" — the resting render can then
 * never soft-wrap a manual-width box (and flex refuses to shrink below the
 * line's min-content). Normalize them back to real spaces on commit and on
 * load; the canvas preserves runs of spaces anyway (`white-space: pre` /
 * `pre-wrap` — same as Quill's own editor rendering).
 */
// U+00A0 spelled via charCode so no invisible character lives in the source.
const NBSP = String.fromCharCode(0xa0);
export const normalizeQuillHtmlSpaces = (html: string): string =>
  html.replace(/&nbsp;/g, ' ').split(NBSP).join(' ');

/** One `<p>` per line; blank lines keep their height via `<br>`. */
export const plainTextToHtml = (text: string): string =>
  text
    .split('\n')
    .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
    .join('');

/**
 * Does this content open with a tag the sanitizer will actually KEEP? Anything
 * else is plain text and must be escaped before it can be handed to an
 * HTML-based editor or transform.
 *
 * TXT-14: this used to be `content.trim().startsWith('<')`, so a text box
 * reading `<T> is a type parameter` answered yes, went to `sanitizeHtml` +
 * `dangerouslySetInnerHTML`, and DOMPurify dropped the unknown `<T>` element
 * while keeping its (empty) text content — the token vanished on the canvas and
 * in the editor. `useInitialDataManager` writes the sanitized string BACK into
 * the model, so one load made the loss permanent. The escape that was supposed
 * to protect exactly this input lives in `plainTextToHtml`, reachable only when
 * this predicate is FALSE, i.e. never for that input: the guard was unreachable
 * code.
 *
 * CORRECTION to the recorded fix direction. The entry proposed sniffing for a
 * tag SHAPE (`/^\s*<\/?[a-z][a-z0-9]*[\s/>]/i`). That does not fix its own
 * example: HTML tag names are case-insensitive, so `<T>` matches `[a-z]` under
 * `/i` and is still routed to the HTML branch, where DOMPurify still drops it.
 * The discriminator has to be the tag NAME — content is HTML when it opens with
 * a tag the sanitizer keeps, and plain text otherwise. That is also the
 * honest predicate: "will this survive the pipeline as markup?"
 *
 * The list is the DOMPurify html-profile subset this app can actually produce
 * or ingest (Quill's own vocabulary plus the block/table shapes that reach us
 * from imports). A tag outside it would be stripped anyway, so treating its
 * content as plain text and escaping it PRESERVES the characters instead of
 * silently eating them.
 */
const KNOWN_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
]);

const HTML_TAG_START = /^\s*<\/?([a-z][a-z0-9]*)(?:[\s/>]|$)/i;

export const isHtmlContent = (content: string | undefined): boolean => {
  if (!content) return false;
  const match = HTML_TAG_START.exec(content);
  return !!match && KNOWN_HTML_TAGS.has(match[1].toLowerCase());
};

export const ensureHtmlContent = (content: string | undefined): string => {
  if (!content) return '';
  return isHtmlContent(content) ? content : plainTextToHtml(content);
};

const parse = (html: string): HTMLElement => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body;
};

/**
 * Leaf blocks are the block elements that directly hold inline content
 * (`<p>`, `<h1>`, `<li>`, …). A body with no block children (bare inline
 * markup) is itself the single leaf.
 */
const collectLeafBlocks = (root: HTMLElement): Element[] => {
  const leaves: Element[] = [];
  const visit = (el: Element) => {
    const blockChildren = Array.from(el.children).filter((c) =>
      BLOCK_TAGS.has(c.tagName)
    );
    if (blockChildren.length === 0) {
      leaves.push(el);
      return;
    }
    blockChildren.forEach(visit);
  };
  visit(root);
  return leaves;
};

const hasVisibleText = (el: Element): boolean =>
  (el.textContent ?? '').trim().length > 0;

/** Every non-whitespace text node in `leaf` sits under a format-carrying tag. */
const leafFullyFormatted = (leaf: Element, format: InlineFormat): boolean => {
  const tags = INLINE_TAGS[format];
  const doc = leaf.ownerDocument;
  const walker = doc.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
  let covered = true;
  let sawText = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent ?? '').trim()) continue;
    sawText = true;
    let ancestor: Element | null = node.parentElement;
    let wrapped = false;
    while (ancestor && ancestor !== leaf.parentElement) {
      if (tags.has(ancestor.tagName)) {
        wrapped = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!wrapped) {
      covered = false;
      break;
    }
  }
  return sawText && covered;
};

/** SOME non-whitespace text in `leaf` sits under a format-carrying tag. */
const leafPartiallyFormatted = (
  leaf: Element,
  format: InlineFormat
): boolean => {
  const tags = INLINE_TAGS[format];
  const doc = leaf.ownerDocument;
  const walker = doc.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent ?? '').trim()) continue;
    let ancestor: Element | null = node.parentElement;
    while (ancestor && ancestor !== leaf.parentElement) {
      if (tags.has(ancestor.tagName)) return true;
      ancestor = ancestor.parentElement;
    }
  }
  return false;
};

export interface WholeContentFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /**
   * TXT-13: the format covers SOME of the content but not all of it — one
   * bolded word inside an otherwise plain box. The strip renders this as its
   * indeterminate state, so the press that normalises the box to fully-bold is
   * visibly a change rather than a no-op, and the destructive "remove
   * everywhere" branch is only ever reached from a genuinely all-on box.
   */
  partial: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
  };
  /** The list type when EVERY line is a list item of that one type. */
  list: ListType | null;
  /** The alignment when EVERY line shares one; null = mixed. */
  align: TextAlign | null;
}

const leafAlign = (leaf: Element): TextAlign => {
  const value = (leaf as HTMLElement).style?.textAlign;
  return value === 'center' || value === 'right' ? value : 'left';
};

/**
 * Formats that apply to the ENTIRE content — drives the strip's pressed state
 * for a selected (non-editing) text box: pressed iff the whole content carries
 * the format.
 */
export const getWholeContentFormats = (
  content: string | undefined
): WholeContentFormats => {
  const none: WholeContentFormats = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    partial: {
      bold: false,
      italic: false,
      underline: false,
      strike: false
    },
    list: null,
    align: 'left'
  };
  if (!content || !content.trim()) return none;
  const body = parse(ensureHtmlContent(content));
  if (!hasVisibleText(body)) return none;
  const leaves = collectLeafBlocks(body).filter(hasVisibleText);
  if (leaves.length === 0) return none;

  const all = (format: InlineFormat) =>
    leaves.every((leaf) => leafFullyFormatted(leaf, format));
  const some = (format: InlineFormat) =>
    leaves.some((leaf) => leafPartiallyFormatted(leaf, format));
  const partialOf = (format: InlineFormat) => !all(format) && some(format);

  const topBlocks = Array.from(body.children).filter((c) =>
    BLOCK_TAGS.has(c.tagName)
  );
  let list: ListType | null = null;
  if (topBlocks.length > 0) {
    if (topBlocks.every((b) => b.tagName === 'UL')) list = 'bullet';
    else if (topBlocks.every((b) => b.tagName === 'OL')) list = 'ordered';
  }

  const firstAlign = leafAlign(leaves[0]);
  const align = leaves.every((leaf) => leafAlign(leaf) === firstAlign)
    ? firstAlign
    : null;

  return {
    bold: all('bold'),
    italic: all('italic'),
    underline: all('underline'),
    strike: all('strike'),
    partial: {
      bold: partialOf('bold'),
      italic: partialOf('italic'),
      underline: partialOf('underline'),
      strike: partialOf('strike')
    },
    list,
    align
  };
};

/**
 * Apply or remove one inline format across the whole content. Applying wraps
 * each leaf block's children in the canonical tag (skipping already-covered
 * leaves); removing unwraps every synonym tag.
 */
export const applyInlineFormat = (
  content: string | undefined,
  format: InlineFormat,
  on: boolean
): string => {
  const html = ensureHtmlContent(content);
  if (!html) return html;
  const body = parse(html);
  const doc = body.ownerDocument;

  if (on) {
    collectLeafBlocks(body).forEach((leaf) => {
      if (!hasVisibleText(leaf) || leafFullyFormatted(leaf, format)) return;
      const wrapper = doc.createElement(CANONICAL_TAG[format]);
      while (leaf.firstChild) wrapper.appendChild(leaf.firstChild);
      leaf.appendChild(wrapper);
    });
  } else {
    const tags = INLINE_TAGS[format];
    // Unwrap repeatedly — nested same-format wrappers unwrap one level per pass.
    let match: Element | null;
    const find = () =>
      Array.from(body.querySelectorAll('*')).find((el) =>
        tags.has(el.tagName)
      ) ?? null;
    while ((match = find())) {
      const parent = match.parentNode;
      if (!parent) break;
      while (match.firstChild) parent.insertBefore(match.firstChild, match);
      parent.removeChild(match);
    }
  }
  return body.innerHTML;
};

/**
 * Set one alignment across the whole content — an inline `text-align` style
 * on every leaf block. 'left' (the default) is stored as ABSENT so an
 * unaligned box round-trips byte-identical.
 */
export const applyAlignFormat = (
  content: string | undefined,
  align: TextAlign
): string => {
  const html = ensureHtmlContent(content);
  if (!html) return html;
  const body = parse(html);
  collectLeafBlocks(body).forEach((leaf) => {
    const el = leaf as HTMLElement;
    if (align === 'left') {
      el.style.removeProperty('text-align');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    } else {
      el.style.textAlign = align;
    }
  });
  return body.innerHTML;
};

/**
 * Convert the whole content to one list of `type` (each current line — block
 * or list item — becomes an `<li>`, keeping its inline formatting), or unwrap
 * every list back to paragraphs when `on` is false.
 */
export const applyListFormat = (
  content: string | undefined,
  type: ListType,
  on: boolean
): string => {
  const html = ensureHtmlContent(content);
  if (!html) return html;
  const body = parse(html);
  const doc = body.ownerDocument;

  if (on) {
    // Flatten the current structure into "lines" (leaf blocks in order), then
    // rebuild as a single list. Headers flatten into plain items (the block
    // format is replaced, like Quill's own line format would).
    const lines = collectLeafBlocks(body).filter(
      (leaf) => hasVisibleText(leaf) || leaf.querySelector('br')
    );
    const listEl = doc.createElement(type === 'bullet' ? 'ul' : 'ol');
    if (lines.length === 0) {
      const li = doc.createElement('li');
      while (body.firstChild) li.appendChild(body.firstChild);
      listEl.appendChild(li);
    } else {
      lines.forEach((line) => {
        const li = doc.createElement('li');
        // Alignment survives the block-type swap (line format, like Quill's).
        const align = (line as HTMLElement).style?.textAlign;
        if (align) li.style.textAlign = align;
        while (line.firstChild) li.appendChild(line.firstChild);
        listEl.appendChild(li);
      });
    }
    body.innerHTML = '';
    body.appendChild(listEl);
  } else {
    // Every <li> anywhere becomes a <p>; list containers dissolve in place.
    Array.from(body.querySelectorAll('li')).forEach((li) => {
      const p = doc.createElement('p');
      const align = (li as HTMLElement).style?.textAlign;
      if (align) p.style.textAlign = align;
      while (li.firstChild) p.appendChild(li.firstChild);
      li.replaceWith(p);
    });
    Array.from(body.querySelectorAll('ul, ol')).forEach((listEl) => {
      const parent = listEl.parentNode;
      if (!parent) return;
      while (listEl.firstChild) parent.insertBefore(listEl.firstChild, listEl);
      parent.removeChild(listEl);
    });
  }
  return body.innerHTML;
};
