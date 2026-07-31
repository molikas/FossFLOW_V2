import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Label, Coords } from 'src/types';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useSceneActions } from 'src/hooks/useSceneActions';
import { useInlineRename } from 'src/hooks/useInlineRename';
import {
  EDIT_ELEMENT_LINK_EVENT,
  HIDE_ELEMENT_LINK_EVENT
} from 'src/utils/quillLinkShortcut';
import {
  measureLabelChip,
  labelFontPx,
  LabelChipLayout,
  LABEL_CHIP_PAD_X,
  LABEL_CHIP_PAD_Y,
  LABEL_CHIP_RADIUS
} from 'src/utils/labelChip';
import { computeLabelCounterScale } from 'src/utils/labelScale';
import { getRenderedTilePosition } from 'src/utils/renderedGeometry';
import {
  LABEL_DRAG_SLOP_PX,
  createLabelLongPress,
  openLabelContextMenu,
  shouldBeginLabelDrag
} from 'src/utils/labelPointerContract';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MIN_READABLE_PX,
  LABEL_MAX_COUNTER_SCALE
} from 'src/config/labelSettings';

// ---------------------------------------------------------------------------
// LabelHitLayer (ADR 0031 §4) — the pixel-accurate DOM hit-proxy over the
// Canvas2D LabelsCanvas paint (mirrors NodeLabelHitLayer). One invisible div per
// visible label, sized to its chip, so the FULL chip width is selectable (not a
// single anchor tile) and a connector passing UNDER the chip stays selectable
// where the chip isn't — labels are deliberately NOT in the tile hit-test
// (hitDetection.ts), the proxy owns label hits.
//
// A press selects the label; a drag past slop moves it via the transient
// `labelMove` preview (LabelsCanvas redraws the chip following the pointer with
// NO per-frame model write, so the proxy divs don't thrash), committing the new
// position ONCE on release (one undo). The divs live in a <SceneLayer>, so they
// are positioned in canvas-px — the same space getTilePosition + the canvas draw
// use — and the SceneLayer CSS transform tracks pan/zoom for free.
//
// In VIEW mode (EXPLORABLE_READONLY) the layer mounts HOVER-ONLY proxies: they
// publish the hovered chip through uiState.viewModeHoveredLabelId so the
// ViewModeInfoPopover can hover-show a label's notes (notes parity — labels
// being outside the tile hit-test would otherwise make chips hover-inert).
// No press handlers and no stopPropagation there, so pan-over-chip still works.
// ---------------------------------------------------------------------------

// R3/GPU-04: there used to be a `HIT_MIN_ZOOM = 0.4` gate here — "below this
// zoom chips are too small to grab precisely; also bounds the div count". But
// `LabelsCanvas` paints floating Label chips with NO zoom gate at all, so below
// 0.4 a Label was visible and completely inert: not selectable, not draggable,
// no context menu, with nothing on screen to say why. Draw visibility and hit
// visibility were decided in two files with two different thresholds.
//
// The rule (config/labelSettings): nothing may be painted at a zoom where it
// cannot be hit. The draw side has no threshold, so neither does this one. The
// div-count concern the old comment names is real but bounded the same way it
// always was — one proxy per VISIBLE label — and "hard to grab" beats
// "impossible to grab while visible".

// Module-level offscreen 2D context for chip measurement (matches the canvas
// renderer's measureText). One per module; never attached to the DOM.
let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = (): CanvasRenderingContext2D | null => {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
};

// Coarse fallback when no 2D context is available (SSR / test env).
const fallbackChip = (text: string, fontSize: number): LabelChipLayout => {
  const lines = (text || '').split('\n');
  const lineH = fontSize * 1.5;
  return {
    lines,
    lineWidths: lines.map((l) => l.length * fontSize * 0.6),
    lineH,
    chipW: Math.min(320, (text.length || 1) * fontSize * 0.6) + 24,
    chipH: lines.length * lineH + 16
  };
};

// Inline contentEditable editor for a floating Label (double-click / F2). It
// overlays the chip at the same canvas-px rect the hit-proxy uses; while it is
// mounted LabelsCanvas skips painting this label (uiState.inlineEditLabelId) so
// the text isn't drawn twice. Left-click-away / Enter commit; right-click-away /
// Escape cancel (useInlineRename's shared contract).
const LabelInlineEditor = ({
  label,
  left,
  top,
  width,
  fontSize,
  onDone
}: {
  label: Label;
  left: number;
  top: number;
  width: number;
  fontSize: number;
  onDone: () => void;
}) => {
  const { updateLabel } = useSceneActions();
  const commit = useCallback(
    (raw: string) => {
      const text = raw.replace(/\n+$/, '');
      // Empty text has no reason to draw — revert (keep the old text) rather than
      // leaving a blank chip; the user can delete the label with Delete instead.
      if (text.trim() && text !== label.text) {
        updateLabel(label.id, { text });
      }
      onDone();
    },
    [updateLabel, label.id, label.text, onDone]
  );
  const inline = useInlineRename({
    active: true,
    commit,
    cancel: onDone,
    multiline: true
  });
  return (
    <div
      style={{
        position: 'absolute',
        // Center the editor's border-box (its 1px border adds ~2px over the
        // border-less chip measurement) on the chip's rect so the edit box fills
        // the same space the committed chip will — no size/position jump on commit.
        left: left - 1,
        top: top - 1,
        zIndex: 20,
        pointerEvents: 'auto',
        // Track the readable-labels counter-scale (inherited var) about the chip
        // centre, so the edit box matches the enlarged drawn chip (no shrink on
        // entering edit at low zoom with the Aa toggle on).
        transform: 'scale(var(--axoview-label-scale, 1))',
        transformOrigin: 'center'
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        contentEditable
        suppressContentEditableWarning
        data-testid="label-inline-editor"
        ref={inline.setRef as unknown as React.Ref<HTMLDivElement>}
        onBlur={inline.onBlur}
        onKeyDown={(e) => {
          // Ctrl/Cmd+K mid-edit → the INLINE link card at this label
          // (owner 2026-07-05: same UX as the text box, not the strip popover
          // at the top). Labels are plain text, so the link is the element
          // headerLink; the card's focus steal blurs this editor, which
          // commits the text first.
          if (
            (e.ctrlKey || e.metaKey) &&
            !e.altKey &&
            !e.shiftKey &&
            e.key.toLowerCase() === 'k'
          ) {
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            window.dispatchEvent(
              new CustomEvent(EDIT_ELEMENT_LINK_EVENT, {
                detail: {
                  target: { kind: 'LABEL', id: label.id },
                  rect: { left: r.left, top: r.top, width: r.width, height: r.height }
                }
              })
            );
            return;
          }
          inline.onKeyDown(e);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          // Match the rendered chip's box exactly: same inner text width, padding
          // and corner radius, so the edit box == the committed chip (the size
          // mismatch the user hit). MUST pin box-sizing to content-box: the lib's
          // GlobalStyles sets `div { box-sizing: border-box }`, under which this
          // minWidth (the chip INNER width) would be eaten by the 24px padding +
          // 2px border and collapse the content area to ~one char — the text
          // wraps a letter per line. content-box makes minWidth the content width,
          // so padding + border sit OUTSIDE it and reproduce the chip's outer box.
          boxSizing: 'content-box',
          minWidth: width - LABEL_CHIP_PAD_X * 2,
          font: `${label.isItalic ? 'italic ' : ''}${
            label.isBold ? 700 : 400
          } ${fontSize}px Roboto, Arial, sans-serif`,
          textDecoration: label.isUnderline ? 'underline' : undefined,
          color: label.color || '#222',
          background: label.backgroundColor || '#fff',
          border: '1px solid #90caf9',
          borderRadius: LABEL_CHIP_RADIUS,
          padding: `${LABEL_CHIP_PAD_Y}px ${LABEL_CHIP_PAD_X}px`,
          textAlign: 'center',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: 'text',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
        }}
      >
        {label.text}
      </div>
    </div>
  );
};

interface Props {
  labels: Label[];
}

interface DragState {
  id: string;
  startTile: Coords;
  startOffset: Coords;
  startClient: { x: number; y: number };
  started: boolean;
  /** Last previewed offset — committed to the model on release. */
  last: Coords;
}

export const LabelHitLayer = ({ labels }: Props) => {
  const { getTilePosition } = useCanvasMode();
  const { visibleIds, lockedIds, layers } = useLayerContext();
  const uiStoreApi = useUiStateStoreApi();
  const { updateLabel } = useSceneActions();
  // Coarse zoom gate — boolean selector so this only re-renders when the gate
  // flips, not on every zoom tick. editorMode is a rarely-changing string, so
  // subscribing to it directly keeps the same re-render profile.
  const editorMode = useUiStateStore((s) => s.editorMode);
  const editable = editorMode === 'EDITABLE';
  // View mode (EXPLORABLE_READONLY) mounts HOVER-ONLY proxies: labels are
  // deliberately out of the tile hit-test (ADR 0031 §4), so without a proxy a
  // chip with notes could never hover-show the info popover (notes parity,
  // 2026-07-13). Select / drag / inline-edit / context-menu stay edit-only.
  const viewMode = editorMode === 'EXPLORABLE_READONLY';
  // GPU-04: no zoom term — the chips this layer proxies have none either.
  const active = editable || viewMode;
  const inlineEditLabelId = useUiStateStore((s) => s.inlineEditLabelId);

  const dragRef = useRef<DragState | null>(null);
  // I2/TCH-09: a finger has no right button, so the chip's context menu is
  // reached by holding. The canvas gesture machine cannot supply that hold here
  // — labels are outside the tile hit-test (ADR 0031 §4) AND this proxy swallows
  // the press, so the window-level pointerdown the machine listens on never
  // fires. Before this a long press on a floating Label produced NOTHING: no
  // menu, and not even the hold-on-empty auto-lasso fallback.
  const longPressRef = useRef<ReturnType<typeof createLabelLongPress> | null>(
    null
  );

  // "Keep labels readable" (ADR 0015): the WebGL chip in LabelsCanvas counter-
  // scales about its centre when zoomed out, so the DOM hit proxy (and inline
  // editor) must scale by the SAME factor about the same centre or the enlarged
  // chip's outer margin goes dead to pointer events. Mirror ExpandableLabel — a
  // direct DOM subscription (no per-zoom React re-render) publishes
  // --axoview-label-scale on a display:contents wrapper; each proxy / editor
  // composes it into `transform: scale(...)`. No-op (1) when the toggle is off.
  const counterScaleRef = useRef<HTMLDivElement>(null);
  const applyCounterScale = useCallback(() => {
    if (!counterScaleRef.current) return;
    const { zoom, readableLabels } = uiStoreApi.getState();
    counterScaleRef.current.style.setProperty(
      '--axoview-label-scale',
      String(
        computeLabelCounterScale(zoom, {
          enabled: readableLabels,
          baseFontPx: LABEL_BASE_FONT_PX,
          minReadablePx: LABEL_MIN_READABLE_PX,
          maxCounterScale: LABEL_MAX_COUNTER_SCALE
        })
      )
    );
  }, [uiStoreApi]);
  useEffect(() => {
    applyCounterScale();
    return uiStoreApi.subscribe((s, p) => {
      if (s.zoom === p.zoom && s.readableLabels === p.readableLabels) return;
      applyCounterScale();
    });
  }, [uiStoreApi, applyCounterScale]);
  // Re-apply after every commit so a wrapper that just mounted (this layer is
  // null when the layer is inactive, so crossing that gate remounts it) carries the
  // current scale immediately, not one zoom tick late.
  useEffect(() => {
    applyCounterScale();
  });

  // Double-click a label chip → inline-edit it (parity with node / connector
  // labels; owner 2026-07-02). F2 on a selected label routes here too (via
  // setInlineEditLabelId in the interaction manager).
  const onDoubleClick = useCallback(
    (e: React.MouseEvent, label: Label) => {
      e.stopPropagation();
      const actions = uiStoreApi.getState().actions;
      actions.setItemControls({ type: 'LABEL', id: label.id }, { openPanel: false });
      actions.setInlineEditLabelId(label.id);
    },
    [uiStoreApi]
  );

  const endInlineEdit = useCallback(() => {
    uiStoreApi.getState().actions.setInlineEditLabelId(null);
  }, [uiStoreApi]);

  // View-mode chip hover → the info popover (notes parity). Published through
  // uiState because the popover's hover path is tile-based and labels are not
  // tile-hit-tested — this store slice is its only window onto chip hovers.
  const setViewHover = useCallback(
    (id: string | null) => {
      uiStoreApi.getState().actions.setViewModeHoveredLabelId(id);
    },
    [uiStoreApi]
  );
  // If the proxies stop rendering while a chip is hovered (zoom crosses
  // editor-mode switch), no pointerleave fires —
  // clear the published hover so the popover can't stick to a vanished chip.
  const viewProxiesLive = viewMode && active;
  useEffect(() => {
    if (viewProxiesLive) return;
    const { viewModeHoveredLabelId, actions } = uiStoreApi.getState();
    if (viewModeHoveredLabelId !== null) actions.setViewModeHoveredLabelId(null);
  }, [viewProxiesLive, uiStoreApi]);
  // A single chip can stop rendering while the LAYER stays live — its label
  // left `visibleIds` or was removed from `labels`. No pointerleave fires on an
  // unmount, so its id would stay published; and in the info popover a set
  // viewModeHoveredLabelId unconditionally WINS over the tile hit-test, so a
  // stale id blackholes hover for EVERY other element. Clear a published hover
  // whose chip is no longer in the renderable set.
  const renderableLabelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of labels) {
      if (layers.length > 0 && !visibleIds.has(l.id)) continue;
      ids.add(l.id);
    }
    return ids;
  }, [labels, visibleIds, layers]);
  useEffect(() => {
    if (!viewProxiesLive) return;
    const { viewModeHoveredLabelId, actions } = uiStoreApi.getState();
    if (viewModeHoveredLabelId && !renderableLabelIds.has(viewModeHoveredLabelId)) {
      actions.setViewModeHoveredLabelId(null);
    }
  }, [renderableLabelIds, viewProxiesLive, uiStoreApi]);

  // Right-click a label chip → its item context menu (Details / Rename / Add
  // note / z-order / Delete). The hit-proxy sits above the canvas box and stops
  // pointer propagation, and labels are deliberately out of the tile hit-test,
  // so the window-level right-tap handler (usePanHandlers) never resolves a
  // label — it would open the empty-canvas menu instead. Open the item menu
  // here, mirroring usePanHandlers' CURSOR-mode item-menu path.
  const onContextMenu = useCallback(
    (e: React.MouseEvent, label: Label) => {
      const actions = uiStoreApi.getState().actions;
      openLabelContextMenu(e, actions, { type: 'LABEL', id: label.id }, () => {
        actions.setItemControls(
          { type: 'LABEL', id: label.id },
          { openPanel: false }
        );
      });
    },
    [uiStoreApi]
  );

  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClient.x;
      const dy = e.clientY - d.startClient.y;
      if (!d.started) {
        if (Math.abs(dx) < LABEL_DRAG_SLOP_PX && Math.abs(dy) < LABEL_DRAG_SLOP_PX)
          return;
        d.started = true;
        // Past slop this is a move, not a hold.
        longPressRef.current?.cancel();
      }
      e.preventDefault();
      const zoom = uiStoreApi.getState().zoom || 1;
      // Screen delta → canvas-space residual (the offset is applied inside the
      // zoom-scaled SceneLayer, so divide by zoom). The chip floats off its
      // original tile by the accumulated offset.
      const offset: Coords = {
        x: d.startOffset.x + dx / zoom,
        y: d.startOffset.y + dy / zoom
      };
      d.last = offset;
      // Transient preview only — NO model write, so the proxy divs don't
      // re-render each frame. Committed once on release below.
      uiStoreApi.getState().actions.setLabelMove(d.id, d.startTile, offset);
    },
    [uiStoreApi]
  );

  const onWindowUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    longPressRef.current?.cancel();
    longPressRef.current = null;
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    window.removeEventListener('pointercancel', onWindowUp);
    if (d?.started) {
      // One model write = one history entry; then drop the preview so the chip
      // redraws from its committed position.
      updateLabel(d.id, { offset: d.last, snap: false });
      uiStoreApi.getState().actions.clearLabelMove();
    }
  }, [onWindowMove, updateLabel, uiStoreApi]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, label: Label) => {
      // Shared contract: swallow the press (it must not reach the canvas box),
      // and let only the primary button select-and-drag — right/middle belong
      // to onContextMenu above.
      if (!shouldBeginLabelDrag(e)) return;
      // Full-chip select (ADR 0031 §4): the press selects the label WITHOUT
      // mounting the Properties deck. A Label is inline-edited on canvas and
      // styled from the strip (see Label.ts / TextBox.ts) — its only deck
      // content is Notes, and auto-opening that on select read as "the text
      // editor" and misled users. ADR 0022 §3 select-only contract: an explicit
      // open (double-click / context-menu "Add note") still mounts the deck.
      uiStoreApi
        .getState()
        .actions.setItemControls(
          { type: 'LABEL', id: label.id },
          { openPanel: false }
        );
      dragRef.current = {
        id: label.id,
        startTile: label.tile,
        startOffset: label.offset ?? { x: 0, y: 0 },
        startClient: { x: e.clientX, y: e.clientY },
        started: false,
        last: label.offset ?? { x: 0, y: 0 }
      };
      // Touch/pen: a stationary hold opens the same item menu a right-click
      // does (TCH-09). Dropping the drag state first means the lift that follows
      // commits nothing — the hold replaced the move.
      const longPress = createLabelLongPress((point) => {
        dragRef.current = null;
        const actions = uiStoreApi.getState().actions;
        actions.setItemControls(
          { type: 'LABEL', id: label.id },
          { openPanel: false }
        );
        actions.openContextMenu({
          anchor: point,
          variant: 'item',
          target: { type: 'LABEL', id: label.id }
        });
      });
      longPressRef.current = longPress;
      longPress.start(e);
      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', onWindowUp);
      window.addEventListener('pointercancel', onWindowUp);
    },
    [onWindowMove, onWindowUp, uiStoreApi]
  );

  // Safety net: if the layer unmounts mid-drag, drop the window listeners and any
  // stale preview so a label can't get stuck following the pointer.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      if (dragRef.current) {
        dragRef.current = null;
        uiStoreApi.getState().actions.clearLabelMove();
      }
    };
  }, [onWindowMove, onWindowUp, uiStoreApi]);

  // EDITABLE gets the full gesture surface; EXPLORABLE_READONLY gets hover-only
  // proxies (see `viewMode` above). NON_INTERACTIVE renders nothing.
  if (!active) return null;

  return (
    <div ref={counterScaleRef} style={{ display: 'contents' }}>
      {labels.map((label) => {
        // The inline editor is edit-mode chrome: a stale inlineEditLabelId
        // (mode switched mid-edit) must never mount a contentEditable in view.
        const editing = editable && label.id === inlineEditLabelId;
        if (!editing) {
          if (layers.length > 0 && !visibleIds.has(label.id)) return null;
          // Locked layers gate EDIT gestures only — the view-mode proxy is a
          // pure hover surface, and the tile hit-test the other element types
          // hover through never consults lockedIds, so parity keeps a locked
          // label's notes hover-readable while presenting.
          if (editable && lockedIds.has(label.id)) return null;
        }
        const fontSize = labelFontPx(label);
        const ctx = getMeasureCtx();
        const chip = ctx
          ? measureLabelChip(
              ctx,
              label.text,
              fontSize,
              label.isBold,
              label.isItalic
            )
          : fallbackChip(label.text, fontSize);
        const { x: cx, y: cy } = getRenderedTilePosition(
          label,
          getTilePosition,
          'CENTER'
        );
        const left = cx - chip.chipW / 2;
        const top = cy - chip.chipH / 2;
        if (editing) {
          return (
            <LabelInlineEditor
              key={`${label.id}-edit`}
              label={label}
              left={left}
              top={top}
              width={chip.chipW}
              fontSize={fontSize}
              onDone={endInlineEdit}
            />
          );
        }
        return (
          <div
            key={label.id}
            data-axoview-id="canvas-label-hit"
            data-label-hit-id={label.id}
            // View mode is HOVER-ONLY: no press/double-click/context handlers
            // and no stopPropagation, so presses bubble to the window-level pan
            // handlers (usePanHandlers) — panning keeps working over a chip.
            // Inline edit / drag / the item menu remain edit-mode gestures.
            onPointerDown={editable ? (e) => onPointerDown(e, label) : undefined}
            onDoubleClick={editable ? (e) => onDoubleClick(e, label) : undefined}
            onContextMenu={editable ? (e) => onContextMenu(e, label) : undefined}
            // EDIT: hovering a LINKED chip shows the element link card as a view
            // chip (url + copy/edit/remove — ADR 0034 addendum 2026-07-05),
            // exactly like hovering linked text in a text box.
            // VIEW: publish the hover for the info popover instead — it renders
            // headerLink itself, so the link-card events are NOT dispatched.
            onPointerEnter={
              viewMode
                ? () => setViewHover(label.id)
                : label.headerLink
                  ? (e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      window.dispatchEvent(
                        new CustomEvent(EDIT_ELEMENT_LINK_EVENT, {
                          detail: {
                            target: { kind: 'LABEL', id: label.id },
                            rect: {
                              left: r.left,
                              top: r.top,
                              width: r.width,
                              height: r.height
                            },
                            mode: 'view',
                            hover: true
                          }
                        })
                      );
                    }
                  : undefined
            }
            onPointerLeave={
              viewMode
                ? () => setViewHover(null)
                : label.headerLink
                  ? () =>
                      window.dispatchEvent(
                        new CustomEvent(HIDE_ELEMENT_LINK_EVENT)
                      )
                  : undefined
            }
            style={{
              position: 'absolute',
              left,
              top,
              width: chip.chipW,
              height: chip.chipH,
              pointerEvents: 'auto',
              // 'move' advertises the edit-mode drag; a view-mode chip is not
              // grabbable, so it keeps the canvas default.
              cursor: editable ? 'move' : 'default',
              touchAction: 'none',
              // Congruent with the counter-scaled WebGL chip: the proxy is centred
              // on (cx,cy), so scaling about its centre keeps the full drawn chip
              // grabbable when readable-labels enlarges it. 1× (no-op) when off.
              transform: 'scale(var(--axoview-label-scale, 1))',
              transformOrigin: 'center'
            }}
          />
        );
      })}
    </div>
  );
};
