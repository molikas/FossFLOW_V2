import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import ReactQuill from 'react-quill-new';
import type { Quill } from 'react-quill-new';
import { formats } from 'src/components/RichTextEditor/RichTextEditor';
import { sanitizeHtml } from 'src/utils/sanitizeHtml';
import {
  ensureHtmlContent,
  normalizeQuillHtmlSpaces
} from 'src/utils/richTextTransform';
import { htmlToPlainText } from 'src/utils/htmlToPlainText';
import { isSessionPreservingTarget } from 'src/utils/sessionPreservingTarget';
import { buildListAutofillBinding } from 'src/utils/quillListAutofill';
import { buildLinkShortcutBinding } from 'src/utils/quillLinkShortcut';
import { CANVAS_RICHTEXT_LIST_INDENT_EM } from 'src/config';
import { useTranslation } from 'src/stores/localeStore';
import {
  registerTextBoxEditor,
  setTextBoxEditorRange,
  unregisterTextBoxEditor
} from './textBoxEditorBridge';
import { TextBoxLinkCard } from './TextBoxLinkCard';

interface Props {
  textBoxId: string;
  content: string | undefined;
  /** Base typography from useTextBoxProps — the editor renders in place with
   *  the exact canvas styles (fontSize/family/color + richTextStyles). */
  fontProps: Record<string, unknown>;
  /** Manual-width box (ADR 0034 addendum 2026-07-03): the editor wraps at the
   *  fixed box width instead of growing rightward with the longest line. */
  fixedWidth?: boolean;
  /** Fires on mount and every text change with the draft exactly as commit
   *  would store it ('' when visually empty) — the parent measures it so the
   *  projected box + transform bounds track typing (ADR 0034 addendum
   *  2026-07-04). */
  onDraftChange: (html: string) => void;
  /** Persist the edited HTML ('' when the box was emptied). */
  onCommit: (html: string) => void;
  /** Close without persisting (Escape / right-click-away). */
  onCancel: () => void;
}

// The on-canvas rich-text editor (ADR 0034 §1): a toolbar-less Quill mounted in
// place inside the projected text-box container, formatted from the strip via
// the textBoxEditorBridge. Commit semantics extend ADR 0022 §4 — left-click-away
// commits, right-click-away and Escape cancel — with one deliberate divergence:
// Enter inserts a newline (multi-paragraph element; lists need Enter), so
// click-away is the only commit gesture. Clicks inside the strip
// ([data-axoview-strip]) or any MUI portal overlay (the strip's own popovers)
// keep the session alive.
//
// A commit writes whatever the session leaves, and the PARENT decides whether
// that is a change (TXT-08 — a commit that fell through to cancel because the
// TEXT was untouched discarded the session's styling once cancel started
// rolling element-level writes back). `changedRef` still records that the
// content was touched — by typing or by a strip format routed through the
// bridge's markChanged — and drives the live draft re-measure; it no longer
// decides commit vs cancel. Never compare plain text
// against stored HTML; that comparison is what made the old plain-text editor
// destroy formatting on a zero-keystroke click-away.
const QUILL_MODULES = {
  toolbar: false,
  // Markdown list autofill ("- "/"* "/"1. " → list) — the shared binding in
  // quillListAutofill.ts; retires MQA #12 (rationale + the undo-restores-
  // literal contract live there). Module scope is safe: this file already
  // imports ReactQuill (DOM-only) at module scope.
  keyboard: {
    bindings: {
      'list autofill': buildListAutofillBinding(ReactQuill.Quill),
      // Ctrl/Cmd+K → strip Link popover (Docs convention). Snow only binds
      // this key when a toolbar .ql-link button exists — this editor is
      // toolbar-less, so the shared binding owns the key outright.
      link: buildLinkShortcutBinding()
    }
  }
};

export const TextBoxInlineEditor = ({
  textBoxId,
  content,
  fontProps,
  fixedWidth,
  onDraftChange,
  onCommit,
  onCancel
}: Props) => {
  const { t } = useTranslation('textBoxControls');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<ReactQuill | null>(null);
  const changedRef = useRef(false);
  const finishedRef = useRef(false);
  // Live instance for the link card (set once the mount effect runs).
  const [quillInstance, setQuillInstance] = useState<Quill | null>(null);
  const markChanged = useCallback(() => {
    changedRef.current = true;
    // A strip format routed through the bridge changes the RENDERED content, so
    // the live footprint the parent measures has to follow it. Typing reaches
    // `emitDraft` through Quill's text-change handler; a bridge format does not.
    emitDraftRef.current();
  }, []);

  // Seed once per session — sanitized write-side (the editor is an HTML
  // source, ADR 0029), plain-text legacy content escaped so a literal leading
  // '<' can't be misparsed (catalog I-23).
  const initialHtml = useMemo(
    () => {
      const html = ensureHtmlContent(content);
      return html ? sanitizeHtml(html) : '';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once; the editor owns the value while mounted
    []
  );

  const finish = useCallback(
    (kind: 'commit' | 'cancel') => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      // TXT-08: a commit with no TEXT change used to fall through to
      // `onCancel()` as a cheap "nothing to write" path. That was invisible
      // while cancel only cleared `editingTextBoxId` — but now that cancel
      // rolls the session's element-level writes back, a session where the user
      // changed only STYLING would have been discarded by a left-click-away.
      // A commit is a commit; the parent already no-ops on unchanged content,
      // and an empty box still round-trips to '' and hits the discard.
      if (kind === 'commit') {
        const quill = quillRef.current?.getEditor();
        // getSemanticHTML serializes every space as &nbsp; — normalize back to
        // real spaces (wrap opportunities for manual-width boxes) BEFORE the
        // ADR 0029 write-side sanitize.
        const html = quill
          ? sanitizeHtml(normalizeQuillHtmlSpaces(quill.getSemanticHTML()))
          : '';
        // An emptied box round-trips as '' (not Quill's empty-paragraph shell).
        onCommit(htmlToPlainText(html).trim() ? html : '');
      } else {
        onCancel();
      }
    },
    [onCommit, onCancel]
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Live draft → parent (same normalize+sanitize pipeline as commit, so the
  // measured preview equals the post-commit size EXACTLY). Ref-bound so the
  // mount effect below doesn't re-run when the parent recreates the callback.
  const emitDraft = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const html = sanitizeHtml(normalizeQuillHtmlSpaces(quill.getSemanticHTML()));
    onDraftChange(htmlToPlainText(html).trim() ? html : '');
  }, [onDraftChange]);
  const emitDraftRef = useRef(emitDraft);
  emitDraftRef.current = emitDraft;

  // Click-away contract (capture phase, ahead of the canvas's own pointerdown
  // deselect — same trick as useInlineRename). Bound to BOTH pointerdown and
  // mousedown: real input fires pointerdown first (mousedown then no-ops via
  // finishedRef); the e2e suite's synthetic canvas events are mouse-only.
  useEffect(() => {
    const onPressAway = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const rootEl = rootRef.current;
      if (!target || !rootEl || rootEl.contains(target)) return;
      // The strip and its popovers (MUI portals) drive the live selection —
      // pressing them must not end the session (ADR 0034 §1). Shared with
      // useInlineRename so the two editors cannot drift again (TXT-06).
      if (isSessionPreservingTarget(target)) return;
      finishRef.current(e.button === 2 ? 'cancel' : 'commit');
    };
    window.addEventListener('pointerdown', onPressAway, true);
    window.addEventListener('mousedown', onPressAway, true);
    return () => {
      window.removeEventListener('pointerdown', onPressAway, true);
      window.removeEventListener('mousedown', onPressAway, true);
    };
  }, []);

  // Mount: focus + select-all (type-to-replace, matching the F2 rename
  // convention), then register with the strip bridge.
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return undefined;
    registerTextBoxEditor(textBoxId, quill, () => {
      changedRef.current = true;
    });
    setQuillInstance(quill);
    quill.focus();
    quill.setSelection(0, quill.getLength(), 'silent');
    const onSelectionChange = (range: { index: number; length: number } | null) => {
      setTextBoxEditorRange(textBoxId, range);
    };
    const onTextChange = (
      _delta: unknown,
      _old: unknown,
      source: string
    ) => {
      if (source === 'user') changedRef.current = true;
      // Every source: strip formats route through the bridge as 'api' and can
      // still change the footprint (header scale, list indent).
      emitDraftRef.current();
    };
    quill.on('selection-change', onSelectionChange);
    quill.on('text-change', onTextChange);
    // First measure: a fresh empty box gets its placeholder-sized footprint
    // immediately, so bounds + anchors hug what's actually visible.
    emitDraftRef.current();
    return () => {
      quill.off('selection-change', onSelectionChange);
      quill.off('text-change', onTextChange);
      unregisterTextBoxEditor(textBoxId, quill);
    };
  }, [textBoxId]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Typing must never reach the canvas shortcut layer (Delete, tool hotkeys,
    // canvas Escape) — mirrors useInlineRename's contract.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finishRef.current('cancel');
    }
  }, []);

  const stop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <Box
      ref={rootRef}
      onKeyDown={onKeyDown}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      data-axoview-id="textbox-inline-editor"
      sx={{
        ...fontProps,
        // AUTO box: grow-as-you-type (Lucid convention) — the editor extends
        // rightward with the longest line instead of wrapping at the stale
        // committed width, which is also what commit will measure (isoMath
        // sizes an auto box to its longest line). The 5em floor keeps a
        // brand-new EMPTY box (content '', zero measured width) a visible
        // click-target under the placeholder instead of a sliver.
        // FIXED box (manual resize): the editor stays at the box width and
        // soft-wraps, exactly like the resting render (ADR 0034 addendum).
        width: fixedWidth ? '100%' : 'max-content',
        minWidth: fixedWidth ? undefined : 'max(100%, 5em)',
        // No sheet of its own (owner 2026-07-04): the editor is transparent —
        // the container behind it already paints the box's backgroundColor,
        // and the live-measured transform bounds are the session frame. The
        // old white fill + outline + extra padding drew a second, offset box
        // over the dashed bounds and shifted text ~6px versus the resting
        // render.
        cursor: 'text',
        // Quill chrome off — the box IS the editor (snow theme classes exist
        // for the globally-imported quill.snow.css; borders are ours to kill).
        '& .ql-container.ql-snow': {
          border: 'none',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          lineHeight: 'inherit',
          height: 'auto'
        },
        '& .ql-editor': {
          padding: 0,
          overflow: 'visible',
          minHeight: '1em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          // Beat quill.snow.css's fixed 1.42 — line spacing must match the
          // resting render (the box's lineHeight, ADR 0034 addendum).
          lineHeight: 'inherit'
        },
        // Editing/resting list-geometry parity: Quill's snow defaults total
        // 3em of text indent (1.5em on ol + 1.5em on li) while the resting
        // render indents CANVAS_RICHTEXT_LIST_INDENT_EM. Pin the editor to
        // the same constant: all indent on the ol, none on the li, marker
        // metrics re-derived so the glyph sits inside the indent. (Quill puts
        // every list in an <ol> and marks bullets via data-list/.ql-ui.)
        '& .ql-editor ol': {
          paddingLeft: `${CANVAS_RICHTEXT_LIST_INDENT_EM}em`
        },
        '& .ql-editor li': { paddingLeft: 0 },
        '& .ql-editor li > .ql-ui::before': {
          marginLeft: `-${CANVAS_RICHTEXT_LIST_INDENT_EM}em`,
          marginRight: '0.3em',
          width: `${CANVAS_RICHTEXT_LIST_INDENT_EM - 0.3}em`
        },
        // Empty-box placeholder (Lucid's "Type something"): re-anchor Quill's
        // .ql-blank::before to our zero-padding editor (snow css pins it at
        // left/right 15px for its own 15px padding) and quiet it down.
        '& .ql-editor.ql-blank::before': {
          left: 0,
          right: 'auto',
          whiteSpace: 'nowrap',
          color: 'rgba(0,0,0,0.35)',
          fontStyle: 'italic'
        },
        // The link tooltip misplaces under the iso matrix transform — links are
        // authored from the strip's Link control instead (ADR 0034 §2).
        '& .ql-tooltip': { display: 'none' }
      }}
    >
      <ReactQuill
        ref={quillRef}
        theme="snow"
        defaultValue={initialHtml}
        placeholder={t('placeholder')}
        formats={formats}
        modules={QUILL_MODULES}
      />
      {/* Docs-style link chip (caret in / hover over a link) — portals to the
          body, so it renders unrotated above the projected editor. */}
      {quillInstance && (
        <TextBoxLinkCard quill={quillInstance} onChanged={markChanged} />
      )}
    </Box>
  );
};
