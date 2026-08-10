import React, { useMemo, memo, useCallback, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { toPx, CoordsUtils, getTextBoxDimensions } from 'src/utils';
import { sanitizeHtml } from 'src/utils/sanitizeHtml';
import { isHtmlContent } from 'src/utils/richTextTransform';
import {
  RENDERED_DRAG_TRANSFORM,
  getRenderedDragTransform
} from 'src/utils/renderedGeometry';
import { useTranslation } from 'src/stores/localeStore';
import { DIAGRAM_LINK_PREFIX } from 'src/utils/quillLinkShortcut';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import { useTextBoxProps } from 'src/hooks/useTextBoxProps';
import { useSceneData } from 'src/hooks/useSceneData';
import { useSceneActions } from 'src/hooks/useSceneActions';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { TextBoxInlineEditor } from './TextBoxInlineEditor';

const INLINE_EDIT_EVENT = 'inlineEditNodeName';

// Compositor drag wrapper (RECT-1) — same mechanism as nodes/rectangles. During
// a move, DragItems mutates --ff-drag-dx/dy on the [data-drag-id] element; this
// translate3d moves the textbox on the GPU with no per-frame model write / repaint.
const TEXTBOX_DRAG_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  transform: RENDERED_DRAG_TRANSFORM,
  willChange: 'transform'
};

interface Props {
  textBox: ReturnType<typeof useSceneData>['textBoxes'][0];
}

type TextBoxData = ReturnType<typeof useSceneData>['textBoxes'][0];

// Element-level style fields the strip can write while an on-canvas edit
// session is open (ADR 0034 §2's non-draft half). Escape restores these, so a
// cancelled session leaves nothing behind — see the bracket note below (TXT-08).
const SESSION_STYLE_FIELDS = [
  'fontSize',
  'lineHeight',
  'width',
  'height',
  'color',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'borderOpacity',
  'verticalAlign',
  'orientation'
] as const;

type SessionStyleSnapshot = Pick<
  TextBoxData,
  (typeof SESSION_STYLE_FIELDS)[number]
>;

const pickSessionStyleFields = (tb: TextBoxData): SessionStyleSnapshot => {
  const out = {} as Record<string, unknown>;
  SESSION_STYLE_FIELDS.forEach((k) => {
    out[k] = (tb as unknown as Record<string, unknown>)[k];
  });
  return out as SessionStyleSnapshot;
};

export const TextBox = memo(({ textBox }: Props) => {
  const { paddingX, fontProps } = useTextBoxProps(textBox);
  const editorMode = useUiStateStore((s) => s.editorMode);
  // Always-current box, for callbacks that must not re-create on every edit.
  const textBoxRefForSession = useRef(textBox);
  textBoxRefForSession.current = textBox;
  const isEditable = editorMode === 'EDITABLE';
  // Actions only (not useScene): this textbox sits in the drag hot path and must
  // not re-render on every scene mutation just to hold updateTextBox (perf A-1).
  const { updateTextBox, deleteTextBox } = useSceneActions();
  const uiActions = useUiStateStore((s) => s.actions);
  // The on-canvas edit session is store state (ADR 0034): while set, the
  // Renderer promotes this box ABOVE the interactions box (so the editor gets
  // pointer events) and the strip's text cluster targets the live editor. That
  // promotion re-parents this component mid-session — which is exactly why the
  // flag must live in the store, not component state.
  const isEditing = useUiStateStore(
    (s) => s.editingTextBoxId === textBox.id && isEditable
  );
  // Live footprint of the edit session (ADR 0034 addendum 2026-07-04): the
  // editor measures its draft (placeholder included while empty) so this
  // projected container — and the transform bounds reading the same store
  // field — hug what is actually visible instead of the stale committed size.
  const previewSize = useUiStateStore((s) =>
    s.editingTextBoxId === textBox.id ? s.editingTextBoxSize : null
  );
  const size = (isEditing && previewSize) || textBox.size;

  // F2 / context-menu Rename entry point (nodes and connectors share the event).
  useEffect(() => {
    if (!isEditable) return undefined;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === textBox.id) uiActions.setEditingTextBoxId(textBox.id);
    };
    window.addEventListener(INLINE_EDIT_EVENT, handler);
    return () => window.removeEventListener(INLINE_EDIT_EVENT, handler);
  }, [textBox.id, isEditable, uiActions]);

  const startInlineEdit = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditable) return;
      e.stopPropagation();
      e.preventDefault();
      uiActions.setEditingTextBoxId(textBox.id);
    },
    [isEditable, uiActions, textBox.id]
  );

  // Internal diagram links in text content (ADR 0034 addendum 2026-07-04):
  // the link card writes `#diagram:<id>` hrefs. In view/explore modes a click
  // navigates (same event the NodePanel's linked-diagram link dispatches); in
  // EDIT mode plain click stays selection (Docs convention — Ctrl/Cmd+click
  // navigates), and the useless fragment jump is suppressed either way.
  const onRestingClick = useCallback(
    (e: React.MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href') ?? '';
      if (!href.startsWith(DIAGRAM_LINK_PREFIX)) return;
      e.preventDefault();
      if (isEditable && !e.ctrlKey && !e.metaKey) return;
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent('axoview-navigate-to-diagram', {
          detail: { id: href.slice(DIAGRAM_LINK_PREFIX.length) }
        })
      );
    },
    [isEditable]
  );

  // TXT-08 — the ONE cancel contract. ADR 0034 §2's dual scope sends a strip
  // write either into the Quill draft (thrown away by Escape) or straight to
  // the model (already committed when Escape arrives), so cancelling an edit
  // used to discard the text and KEEP the styling: one gesture, two opposite
  // semantics, unpredictable from the UI. Escape now restores the element-level
  // fields as well, and because the whole session sits inside one history
  // bracket (`useInlineEditHistoryBracket`) a cancelled session nets to an
  // empty patch set and leaves no entry at all.
  const sessionSnapshotRef = useRef<ReturnType<
    typeof pickSessionStyleFields
  > | null>(null);
  useEffect(() => {
    // Captured when the session opens. The Renderer promotes the editing box
    // into its own layer, so this component remounts once at session start —
    // before any strip write, which is exactly when the snapshot is wanted.
    sessionSnapshotRef.current = isEditing
      ? pickSessionStyleFields(textBoxRefForSession.current)
      : null;
  }, [isEditing]);

  // Empty-box lifecycle (ADR 0034 addendum 2026-07-03, Lucid parity): a text
  // box whose edit session ends with no content is DELETED, not committed —
  // covers the fresh place-and-type box abandoned via click-away/Escape AND an
  // existing box the user emptied. Prevents invisible zero-width ghosts.
  const discardEmpty = useCallback(() => {
    uiActions.setEditingTextBoxId(null);
    // TXT-15: `setItemControls(null)` is a HALF-deselect — its null branch
    // deliberately leaves `selectedIds` alone, because a legitimate
    // multi-selection also has `itemControls === null`. Used as "deselect" it
    // left every `selectedIds` consumer (Delete, arrow-nudge, the strip's
    // writers) pointing at an id that no longer resolves. `setSelectedIds([])`
    // is the real deselect and derives `itemControls` itself.
    uiActions.setSelectedIds([]);
    deleteTextBox(textBox.id);
  }, [uiActions, deleteTextBox, textBox.id]);

  const commit = useCallback(
    (html: string) => {
      if (html === '') {
        discardEmpty();
        return;
      }
      if (html !== (textBox.content ?? '')) {
        updateTextBox(textBox.id, { content: html });
      }
      uiActions.setEditingTextBoxId(null);
    },
    [updateTextBox, textBox.id, textBox.content, uiActions, discardEmpty]
  );

  const cancel = useCallback(() => {
    // TXT-08: roll the element-level writes back before closing the bracket, so
    // the session's net patch set is empty and no entry is pushed at all.
    const snapshot = sessionSnapshotRef.current;
    if (snapshot) {
      const current = pickSessionStyleFields(textBoxRefForSession.current);
      const changed = (
        Object.keys(snapshot) as (keyof typeof snapshot)[]
      ).some((k) => current[k] !== snapshot[k]);
      if (changed) updateTextBox(textBox.id, snapshot);
    }
    if ((textBox.content ?? '') === '') {
      discardEmpty();
      return;
    }
    uiActions.setEditingTextBoxId(null);
  }, [uiActions, textBox.content, textBox.id, updateTextBox, discardEmpty]);


  // Measure the live draft with the exact commit pipeline (getTextBoxDimensions
  // over the box's own props) and publish it as the session footprint. A blank
  // draft measures the PLACEHOLDER string instead — the bounds hug the "Type
  // something" hint the user actually sees, not a 1-tile sliver beside it.
  const { t } = useTranslation('textBoxControls');
  const textBoxRef = useRef(textBox);
  textBoxRef.current = textBox;
  const lastDraftRef = useRef<string | null>(null);
  const onDraftChange = useCallback(
    (draftHtml: string) => {
      lastDraftRef.current = draftHtml;
      const content = draftHtml === '' ? `<p>${t('placeholder')}</p>` : draftHtml;
      try {
        uiActions.setEditingTextBoxSize(
          getTextBoxDimensions({ ...textBoxRef.current, content })
        );
      } catch {
        // No canvas 2D context (jsdom / exhausted headless contexts):
        // getTextWidth throws. Keep the committed size — the session still
        // works, the bounds just don't track the draft.
      }
    },
    [uiActions, t]
  );

  // Mid-session strip writes that change TEXT GEOMETRY (font size / line
  // spacing sliders, a manual-size or orientation write) re-measure the model
  // against the STALE stored content — the live preview is what sizes the
  // container, and it only refreshed on typing. Re-measure the LAST DRAFT
  // whenever a geometry-relevant field changes during the session, so the
  // fill/bounds grow with the freshly restyled text (owner 2026-07-04: "old
  // size constraints are applied").
  useEffect(() => {
    if (!isEditing) {
      // A finished session's draft must not leak into the next one — the
      // editor re-seeds via its mount emit.
      lastDraftRef.current = null;
      return;
    }
    if (lastDraftRef.current === null) return;
    onDraftChange(lastDraftRef.current);
  }, [
    isEditing,
    textBox.fontSize,
    textBox.lineHeight,
    textBox.width,
    textBox.height,
    textBox.orientation,
    onDraftChange
  ]);

  const { strategy } = useCanvasMode();

  // 2D-Y orientation renders as a wide-and-short rectangle that
  // useIsoProjection then rotates 90° (see MQA #11 in useIsoProjection.ts).
  //
  // R1/PROJ-05: the `from` override for this branch used to be `textBox.tile`,
  // on the reasoning — recorded here — that "the dashed selection box for Y
  // orientation is 1 tile wide × size.width tall". That was true when text
  // boxes were single-row and stopped being true when they grew a row count.
  // Dropping `size.height` made the drawn wrapper ALWAYS one tile thick after
  // the rotate, while `getTextBoxEndTile` — the authority the hit test and the
  // selection outline both read — gives Y orientation `size.height` tiles of
  // thickness. For a 4-line box the tile range claimed four tiles where one was
  // drawn: a click two tiles beside the visible text still selected it, and rows
  // 2..N painted outside the wrapper.
  //
  // The pre-rotation rect is the SAME rect the X branch builds — `size.width`
  // along the run by `size.height` across the rows. The 90° rotate is what maps
  // that thickness onto the world axis `getTextBoxEndTile` measures it on, so
  // the special case was removing the very extent the rotation needed. Only the
  // `originOverride` below stays orientation-specific.
  const isTwoDY =
    strategy.projectionName === '2D' && textBox.orientation === 'Y';

  const from = useMemo(() => {
    return CoordsUtils.add(textBox.tile, {
      x: 0,
      y: -(size.height - 1)
    });
  }, [textBox.tile, size.height]);

  const to = useMemo(() => {
    return CoordsUtils.add(textBox.tile, {
      x: size.width,
      y: 0
    });
  }, [textBox.tile, size.width]);

  // Iso-Y multi-row correction (ADR 0034 addendum 2026-07-04): the Y
  // projection maps the container's row axis (layout +y) toward world −x, so
  // a multi-row box pivoted at `tile` painted its rows OUTSIDE the selection
  // footprint (which extends +x, see getTextBoxEndTile). Anchoring the pivot
  // at the far row re-lands rows on [tile.x .. tile.x + rows]. Single-row
  // boxes (the historical common case) are unaffected: the override equals
  // the default origin.
  const originOverride = useMemo(() => {
    if (isTwoDY || textBox.orientation !== 'Y') return undefined;
    return {
      x: textBox.tile.x + (size.height - 1),
      y: textBox.tile.y
    };
  }, [isTwoDY, textBox.orientation, textBox.tile, size.height]);

  const { css } = useIsoProjection({
    from,
    to,
    originOverride,
    orientation: textBox.orientation
  });

  // ADR 0023 off-grid: compose the SceneLayer-px offset into the same wrapper
  // translate3d as the drag delta (the inner projected Box stays driven by the
  // integer tile/size). Snapped text boxes keep the shared module-const style.
  const dragStyle = useMemo(
    () =>
      textBox.offset
        ? {
            ...TEXTBOX_DRAG_STYLE,
            transform: getRenderedDragTransform(textBox.offset)
          }
        : TEXTBOX_DRAG_STYLE,
    [textBox.offset?.x, textBox.offset?.y] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ADR 0029: the read view renders Quill HTML via dangerouslySetInnerHTML.
  // Sanitize first so a shared/imported diagram can't smuggle a stored-XSS
  // payload (<img onerror>/<svg onload>) into the viewer's origin. Memoised so
  // this text box (drag hot path) doesn't re-sanitize on unrelated re-renders.
  const sanitizedContent = useMemo(
    () => (textBox.content ? sanitizeHtml(textBox.content) : ''),
    [textBox.content]
  );

  // Border (ADR 0034 addendum 2026-07-04) — the rectangle's option set as a
  // CSS border on the container (shared by resting render AND edit session).
  // Absent color = no border; box-sizing keeps the footprint identical to the
  // borderless box (the few px of content inset are invisible at the default
  // 2px width and equal in editor and rest, so parity holds).
  const borderCss = useMemo(() => {
    if (!textBox.borderColor) return undefined;
    const opacity = textBox.borderOpacity ?? 1;
    let color = textBox.borderColor;
    if (opacity < 1) {
      try {
        color = alpha(color, opacity);
      } catch {
        /* non-parseable color string — render it opaque */
      }
    }
    return `${textBox.borderWidth ?? 2}px ${(
      textBox.borderStyle ?? 'SOLID'
    ).toLowerCase()} ${color}`;
  }, [
    textBox.borderColor,
    textBox.borderWidth,
    textBox.borderStyle,
    textBox.borderOpacity
  ]);

  return (
    <div data-drag-id={textBox.id} style={dragStyle}>
      <Box style={css}>
        <Box
          onDoubleClick={startInlineEdit}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          // Vertical alignment inside the box footprint (ADR 0034 addendum
          // 2026-07-04) — visible once a manual height leaves headroom; the
          // inline editor is the same flex child, so it aligns identically.
          alignItems:
            textBox.verticalAlign === 'middle'
              ? 'center'
              : textBox.verticalAlign === 'bottom'
              ? 'flex-end'
              : 'flex-start',
          width: '100%',
          height: '100%',
          px: toPx(paddingX),
          // Box fill (ADR 0034 addendum 2026-07-04) — covers the whole
          // footprint incl. manual height; absent = transparent (unchanged).
          ...(textBox.backgroundColor
            ? { bgcolor: textBox.backgroundColor, borderRadius: 1 }
            : {}),
          ...(borderCss
            ? { border: borderCss, boxSizing: 'border-box', borderRadius: 1 }
            : {}),
          pointerEvents: isEditable ? 'auto' : 'inherit'
        }}
      >
        {isEditing ? (
          <TextBoxInlineEditor
            textBoxId={textBox.id}
            content={textBox.content}
            fontProps={fontProps}
            fixedWidth={textBox.width !== undefined}
            onDraftChange={onDraftChange}
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <Typography
            onClick={onRestingClick}
            sx={{
              ...fontProps
            }}
          >
            {/* TXT-14: the shared tag sniff, not a bare '<' — plain text that
                opens with an angle bracket (`<T> is a type parameter`) must
                take the escaped branch, or DOMPurify eats the token. */}
            {isHtmlContent(textBox.content) ? (
              <span dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
            ) : (
              textBox.content
            )}
          </Typography>
        )}
        </Box>
      </Box>
    </div>
  );
});
