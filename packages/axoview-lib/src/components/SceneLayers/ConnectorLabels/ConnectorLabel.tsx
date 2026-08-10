import React, { useMemo, memo, useEffect, useState, useCallback, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { useSceneStore } from 'src/stores/sceneStore';
import {
  connectorPathTileToGlobal,
  getConnectorLabels,
  getLabelTileIndex,
  generateId
} from 'src/utils';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { PROJECTED_TILE_SIZE, UNPROJECTED_TILE_SIZE } from 'src/config';
import {
  LABEL_BASE_FONT_PX,
  labelCounterScaleFor
} from 'src/config/labelSettings';
import { Label } from 'src/components/Label/Label';
import { Connector, ConnectorLabel as ConnectorLabelType, Coords } from 'src/types';
import { useSceneActions } from 'src/hooks/useSceneActions';
import { useInlineRename } from 'src/hooks/useInlineRename';
import {
  EDIT_ELEMENT_LINK_EVENT,
  HIDE_ELEMENT_LINK_EVENT
} from 'src/utils/quillLinkShortcut';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { isLabelVisibleInPreview } from 'src/utils/previewLabelVisibility';

const INLINE_EDIT_EVENT = 'inlineEditNodeName';
// Pointer travel before a press on a label becomes a reposition drag (rather
// than a select click). Mirrors Label.tsx's node-label drag slop.
const LABEL_DRAG_SLOP_PX = 4;
const LABEL_HEIGHT_CLAMP = 300;

interface LabelPosition {
  x: number;
  y: number;
}

const resolveConnectorUrl = (
  headerLink: string | undefined
): string | null => {
  if (!headerLink) return null;
  return /^https?:\/\//i.test(headerLink)
    ? headerLink
    : `https://${headerLink}`;
};

// Inline contentEditable editor for a connector label (name or a labels[]
// entry). It renders THROUGH the same <Label> wrapper + outer Box geometry the
// static label uses, with the SAME labelHeight — so entering edit doesn't make
// the chip jump from its lifted/dragged spot back to the path midpoint.
const ConnectorNameEditor = ({
  position,
  name,
  labelHeight = 0,
  onCommit,
  onCancel,
  onRequestLink
}: {
  position: LabelPosition;
  name: string;
  labelHeight?: number;
  onCommit: (raw: string) => void;
  onCancel: () => void;
  /** Ctrl/Cmd+K mid-rename → the inline element link card (the caller knows
   *  which labels[] entry this is). The card's focus steal blurs this editor,
   *  committing the text first. */
  onRequestLink?: (rect: DOMRect) => void;
}) => {
  const inlineRename = useInlineRename({
    active: true,
    commit: onCommit,
    cancel: onCancel
  });
  return (
    <Box
      sx={{ position: 'absolute', pointerEvents: 'auto', zIndex: 10 }}
      style={{
        maxWidth: PROJECTED_TILE_SIZE.width,
        left: position.x,
        top: position.y
      }}
    >
      <Label
        maxWidth={150}
        labelHeight={labelHeight}
        showLine={false}
        sx={{
          py: 0.75,
          px: 1,
          borderRadius: 2,
          backgroundColor: '#fff',
          opacity: 1,
          // The chip clips its content by default; let the editor grow as the
          // user types instead of hiding the caret.
          overflow: 'visible'
        }}
      >
        <Typography
          variant="body2"
          fontWeight={400}
          contentEditable
          suppressContentEditableWarning
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={inlineRename.onBlur}
          onKeyDown={(e) => {
            if (
              onRequestLink &&
              (e.ctrlKey || e.metaKey) &&
              !e.altKey &&
              !e.shiftKey &&
              e.key.toLowerCase() === 'k'
            ) {
              e.preventDefault();
              e.stopPropagation();
              onRequestLink(e.currentTarget.getBoundingClientRect());
              return;
            }
            inlineRename.onKeyDown(e);
          }}
          ref={inlineRename.setRef}
          sx={{
            outline: 'none',
            minWidth: 20,
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {name}
        </Typography>
      </Label>
    </Box>
  );
};

// Connector label. In EDITABLE mode it is interactive: click to select (so the
// top-bar style strip targets it), double-click to inline-edit, drag to
// reposition along the path + lift it off the line. A selected label shows a
// primary outline. In view/read-only mode it renders as a clickable link when
// the label carries a headerLink (parity with node-label links, #4).
const ConnectorTextLabel = ({
  position,
  label,
  interactive,
  selected,
  onPointerDown,
  onStartEdit,
  linkTarget
}: {
  position: LabelPosition;
  label: ConnectorLabelType;
  interactive: boolean;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onStartEdit: () => void;
  /** The element-link-card write target for THIS labels[] entry — hovering a
   *  linked chip in edit mode shows the card (ADR 0034 addendum 2026-07-05). */
  linkTarget?: { connectorId: string; labelId: string };
}) => {
  const url = resolveConnectorUrl(label.headerLink);
  const linked = !!url;
  // Click-to-open is a view-mode affordance; while editing, a click selects
  // the label (and a drag repositions it) — the hover card carries open/edit.
  const linkActive = linked && !interactive;
  return (
    <Box
      // R5/OVL-02: the counter-scale subscription on the parent reads this and
      // sets `--axoview-label-scale` on THIS element, so each connector label
      // gets a factor derived from its own font size.
      data-label-font={label.fontSize ?? LABEL_BASE_FONT_PX}
      sx={{
        position: 'absolute',
        pointerEvents: interactive || linkActive ? 'auto' : 'none',
        cursor: interactive ? 'grab' : linkActive ? 'pointer' : 'default',
        touchAction: interactive ? 'none' : undefined,
        userSelect: interactive ? 'none' : undefined,
        WebkitUserSelect: interactive ? 'none' : undefined
      }}
      style={{
        maxWidth: PROJECTED_TILE_SIZE.width,
        left: position.x,
        top: position.y
      }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onDoubleClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onStartEdit();
            }
          : undefined
      }
      onPointerEnter={
        linked && interactive && linkTarget
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              window.dispatchEvent(
                new CustomEvent(EDIT_ELEMENT_LINK_EVENT, {
                  detail: {
                    target: {
                      kind: 'CONNECTOR_LABEL',
                      connectorId: linkTarget.connectorId,
                      labelId: linkTarget.labelId
                    },
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
        linked && interactive && linkTarget
          ? () =>
              window.dispatchEvent(new CustomEvent(HIDE_ELEMENT_LINK_EVENT))
          : undefined
      }
      onClick={
        linkActive
          ? (e) => {
              e.stopPropagation();
              window.open(url!, '_blank', 'noopener,noreferrer');
            }
          : undefined
      }
    >
      <Label
        maxWidth={150}
        labelHeight={label.height || 0}
        showLine={label.showLine !== false}
        sx={{
          py: 0.75,
          px: 1,
          borderRadius: 2,
          backgroundColor: 'background.paper',
          opacity: 0.95,
          ...(selected
            ? { outline: '2px solid', outlineColor: 'primary.main', opacity: 1 }
            : {})
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: label.bold ? 700 : 400,
              fontStyle: label.italic ? 'italic' : 'normal',
              textDecoration:
                [
                  label.underline || linked ? 'underline' : null,
                  label.strikethrough ? 'line-through' : null
                ]
                  .filter(Boolean)
                  .join(' ') || 'none',
              color:
                label.labelColor ||
                (linked ? 'primary.main' : 'text.primary'),
              // #10: keep long text labels wrapping (not clipped) on the Label
              // chip's overflow:hidden (parity with the node caption, §5.2).
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              fontSize: `${label.fontSize ?? LABEL_BASE_FONT_PX}px`
            }}
          >
            {label.text}
          </Typography>
          {linkActive && (
            <OpenInNewIcon
              sx={{ fontSize: 11, color: 'primary.main', flexShrink: 0 }}
            />
          )}
        </Box>
      </Label>
    </Box>
  );
};

interface Props {
  connector: Connector;
}

export const ConnectorLabel = memo(({ connector }: Props) => {
  const scenePath = useSceneStore(
    (state) => state.connectors[connector.id]?.path,
    (a, b) => a === b
  );
  const { getTilePosition } = useCanvasMode();
  // Actions only (not useScene): this label sits in the drag hot path, so it
  // must not re-render on every scene mutation just to hold the updateConnector
  // callback. useSceneActions has no data subscription (perf A-1).
  const { updateConnector } = useSceneActions();
  const editorMode = useUiStateStore((s) => s.editorMode);
  // Present-mode hide-labels override (ADR 0013 addendum) — UI-only.
  const previewHideLabels = useUiStateStore((s) => s.previewHideLabels);
  // Image-export hide-labels override (ADR 0025 §3) — UI-only, export-scoped.
  const exportHideLabels = useUiStateStore((s) => s.exportHideLabels);
  const isEditable = editorMode === 'EDITABLE';
  const isReadonly = editorMode === 'EXPLORABLE_READONLY';

  // Per-label selection (top-bar style target) + live reposition preview.
  const uiStoreApi = useUiStateStoreApi();
  const selectedConnectorLabel = useUiStateStore((s) => s.selectedConnectorLabel);
  const uiActions = useUiStateStore((s) => s.actions);
  const selectedLabelId =
    selectedConnectorLabel?.connectorId === connector.id
      ? selectedConnectorLabel.labelId
      : null;
  const [dragPreview, setDragPreview] = useState<{
    labelId: string;
    position: number;
    height: number;
  } | null>(null);

  // The labels[] entry being inline-edited on canvas (null = none). Set by the
  // 'inlineEditConnectorLabel' event (context-menu / panel "Add label") and by
  // double-clicking a label.
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  // Enter inline edit for a specific label (fired right after creation).
  useEffect(() => {
    if (!isEditable) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ connectorId: string; labelId: string }>)
        .detail;
      if (detail?.connectorId === connector.id) setEditingLabelId(detail.labelId);
    };
    window.addEventListener('inlineEditConnectorLabel', handler);
    return () => window.removeEventListener('inlineEditConnectorLabel', handler);
  }, [connector.id, isEditable]);

  // Single source for the connector's authored labels[] (also migrates legacy
  // fields). Used to render and to commit a reposition by id.
  const baseLabels = useMemo(() => getConnectorLabels(connector), [connector]);

  useEffect(() => {
    if (!isEditable) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== connector.id) return;
      // F2 / context-menu "Rename" on a connector: if a labels[] entry is
      // selected, inline-edit it. Otherwise ADD a new midpoint label and
      // inline-edit it — a connector has no single on-canvas name post-decouple
      // (ADR 0032 connector amendment), so F2 grows the label set (owner pick).
      const sel = uiStoreApi.getState().selectedConnectorLabel;
      if (sel?.connectorId === connector.id && sel.labelId !== '__name__') {
        setEditingLabelId(sel.labelId);
        return;
      }
      const newId = generateId();
      updateConnector(connector.id, {
        labels: [...baseLabels, { id: newId, text: '', position: 50 }],
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
      setEditingLabelId(newId);
    };
    window.addEventListener(INLINE_EDIT_EVENT, handler);
    return () => window.removeEventListener(INLINE_EDIT_EVENT, handler);
  }, [connector.id, isEditable, uiStoreApi, updateConnector, baseLabels]);

  // On-canvas labels = the connector's labels[] (content). The identity `name`
  // is decoupled (ADR 0032 connector amendment): Layers-renamed, never drawn.
  // `showLabel` (+ the global/present hide-labels override) now gates all of a
  // connector's labels, mirroring a node's showLabel gating its label.
  const labels = useMemo(() => {
    const visible =
      isLabelVisibleInPreview(
        connector.showLabel !== false,
        isReadonly,
        previewHideLabels
      ) && !exportHideLabels;
    return visible ? baseLabels : [];
  }, [
    baseLabels,
    connector.showLabel,
    isReadonly,
    previewHideLabels,
    exportHideLabels
  ]);

  // Scene positions of every path tile — maps a pointer position to the nearest
  // point on the path (→ position %) while dragging a label.
  const pathScenePoints = useMemo<Coords[]>(() => {
    if (!scenePath?.tiles?.length) return [];
    return scenePath.tiles.map((t) =>
      getTilePosition({
        tile: connectorPathTileToGlobal(t, scenePath.rectangle.from)
      })
    );
  }, [scenePath, getTilePosition]);

  // Commit a label's new position/height (one history entry). Maps over
  // baseLabels (which also folds legacy fields into labels[], matching the
  // ConnectorControls edit handlers).
  const commitLabel = useCallback(
    (labelId: string, position: number, height: number) => {
      updateConnector(connector.id, {
        labels: baseLabels.map((l) =>
          l.id === labelId ? { ...l, position, height } : l
        ),
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
    },
    [updateConnector, connector.id, baseLabels]
  );

  // Remove a label entirely (a label with no text has no reason to exist).
  const deleteLabel = useCallback(
    (labelId: string) => {
      updateConnector(connector.id, {
        labels: baseLabels.filter((l) => l.id !== labelId),
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
      if (selectedConnectorLabel?.labelId === labelId)
        uiActions.setSelectedConnectorLabel(null);
    },
    [updateConnector, connector.id, baseLabels, selectedConnectorLabel, uiActions]
  );

  // Inline-edit commit: empty text deletes the label (no blank labels); else
  // write the new text.
  const commitLabelText = useCallback(
    (labelId: string, raw: string) => {
      setEditingLabelId(null);
      const text = raw.trim();
      if (!text) {
        deleteLabel(labelId);
        return;
      }
      updateConnector(connector.id, {
        labels: baseLabels.map((l) => (l.id === labelId ? { ...l, text } : l)),
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
    },
    [updateConnector, connector.id, baseLabels, deleteLabel]
  );

  // Cancel (Escape / right-click away): a still-blank label (e.g. just added and
  // never typed) is discarded; one that already had text is left untouched.
  const cancelLabelEdit = useCallback(
    (labelId: string) => {
      setEditingLabelId(null);
      const lbl = baseLabels.find((l) => l.id === labelId);
      if (lbl && !lbl.text.trim()) deleteLabel(labelId);
    },
    [baseLabels, deleteLabel]
  );

  // ── Label select + reposition drag ───────────────────────────────────────
  // Press a label: a release within slop selects it (so the top-bar style strip
  // targets it); a release past slop commits a reposition. The model is written
  // once on release; the gesture itself is a pure local preview.
  const dragRef = useRef<{
    labelId: string;
    startX: number;
    startY: number;
    dragging: boolean;
    lastPosition: number;
    lastHeight: number;
  } | null>(null);

  const winMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.dragging) {
        if (
          Math.abs(e.clientX - d.startX) < LABEL_DRAG_SLOP_PX &&
          Math.abs(e.clientY - d.startY) < LABEL_DRAG_SLOP_PX
        )
          return;
        d.dragging = true;
      }
      e.preventDefault();
      const { zoom, scroll, rendererSize, rendererEl } = uiStoreApi.getState();
      if (!rendererEl || pathScenePoints.length === 0) return;
      const rect = rendererEl.getBoundingClientRect();
      // Inverse of the SceneLayer transform (centre + scroll + zoom·scene):
      // pointer (screen px) → a scene point in getTilePosition's space.
      const sceneX =
        (e.clientX - rect.left - rendererSize.width / 2 - scroll.position.x) /
        zoom;
      const sceneY =
        (e.clientY - rect.top - rendererSize.height / 2 - scroll.position.y) /
        zoom;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pathScenePoints.length; i += 1) {
        const p = pathScenePoints[i];
        const dist = (p.x - sceneX) ** 2 + (p.y - sceneY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const position =
        pathScenePoints.length > 1
          ? Math.round((bestIdx / (pathScenePoints.length - 1)) * 100)
          : 50;
      const height = Math.max(
        -LABEL_HEIGHT_CLAMP,
        Math.min(
          LABEL_HEIGHT_CLAMP,
          Math.round(pathScenePoints[bestIdx].y - sceneY)
        )
      );
      d.lastPosition = position;
      d.lastHeight = height;
      setDragPreview({ labelId: d.labelId, position, height });
    },
    [uiStoreApi, pathScenePoints]
  );

  const winUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', winMove);
    window.removeEventListener('pointerup', winUp);
    window.removeEventListener('pointercancel', winUp);
    if (!d) return;
    if (d.dragging) {
      commitLabel(d.labelId, d.lastPosition, d.lastHeight);
      setDragPreview(null);
      // Keep the just-dragged label selected so the top bar targets it.
      uiActions.setSelectedConnectorLabel({
        connectorId: connector.id,
        labelId: d.labelId
      });
    } else {
      // Plain click → select the connector (panel target) + this label.
      uiActions.setItemControls(
        { type: 'CONNECTOR', id: connector.id },
        { openPanel: false }
      );
      uiActions.setSelectedConnectorLabel({
        connectorId: connector.id,
        labelId: d.labelId
      });
    }
  }, [winMove, commitLabel, uiActions, connector.id]);

  const startLabelDrag = useCallback(
    (e: React.PointerEvent, label: ConnectorLabelType) => {
      if (!isEditable) return;
      e.stopPropagation();
      dragRef.current = {
        labelId: label.id,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        lastPosition: label.position,
        lastHeight: label.height ?? 0
      };
      window.addEventListener('pointermove', winMove);
      window.addEventListener('pointerup', winUp);
      window.addEventListener('pointercancel', winUp);
    },
    [isEditable, winMove, winUp]
  );

  // Safety net: drop listeners if the label unmounts mid-drag.
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', winMove);
      window.removeEventListener('pointerup', winUp);
      window.removeEventListener('pointercancel', winUp);
    },
    [winMove, winUp]
  );

  const labelPositions = useMemo(() => {
    if (!scenePath?.tiles?.length) return [];

    return labels
      .map((label) => {
        // Apply the live drag preview to the dragged label so it follows the
        // pointer without a per-frame model write.
        const effLabel =
          dragPreview && dragPreview.labelId === label.id
            ? {
                ...label,
                position: dragPreview.position,
                height: dragPreview.height
              }
            : label;
        const tileIndex = getLabelTileIndex(
          scenePath.tiles.length,
          effLabel.position
        );
        const tile = scenePath.tiles[tileIndex];
        if (!tile) return null;

        let position = getTilePosition({
          tile: connectorPathTileToGlobal(tile, scenePath.rectangle.from)
        });

        const lineType = connector.lineType || 'SINGLE';
        if (
          (lineType === 'DOUBLE' || lineType === 'DOUBLE_WITH_CIRCLE') &&
          effLabel.line === '2'
        ) {
          const { tiles } = scenePath;
          if (tileIndex > 0 && tileIndex < tiles.length - 1) {
            const prev = tiles[tileIndex - 1];
            const next = tiles[tileIndex + 1];
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const connectorWidthPx =
              (UNPROJECTED_TILE_SIZE / 100) * (connector.width || 15);
            const offset = connectorWidthPx * 3;
            const perpX = -dy / len;
            const perpY = dx / len;
            position = {
              x: position.x - perpX * offset,
              y: position.y - perpY * offset
            };
          }
        }

        return { label: effLabel, position };
      })
      .filter(
        (
          item
        ): item is {
          label: ConnectorLabelType;
          position: { x: number; y: number };
        } => item !== null
      );
  }, [
    labels,
    dragPreview,
    scenePath,
    connector.lineType,
    connector.width,
    getTilePosition
  ]);

  // "Keep labels readable" (ADR 0015): counter-scale this connector's label chips
  // up to a legible floor when zoomed out. Mirrors ExpandableLabel — a direct DOM
  // subscription (no React re-render on pan/zoom) publishes --axoview-label-scale,
  // which Label composes into its chip transform (about the attachment origin, so
  // the stalk stays pinned). Set on a display:contents wrapper so every label and
  // the inline editor inherit it. No-op (1) when the toggle is off.
  //
  // R5/OVL-02: the wrapper covers EVERY label on this connector, so one shared
  // variable cannot carry a per-label factor. Each label element stamps its own
  // font size in `data-label-font` and the subscription sets the variable on
  // that element — which keeps the property that matters (pan/zoom writes the
  // DOM directly, no React re-render) while making the factor per label.
  const counterScaleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = () => {
      const root = counterScaleRef.current;
      if (!root) return;
      const { zoom, readableLabels } = uiStoreApi.getState();
      const targets = root.querySelectorAll<HTMLElement>('[data-label-font]');
      for (let i = 0; i < targets.length; i++) {
        const el = targets[i];
        el.style.setProperty(
          '--axoview-label-scale',
          String(
            labelCounterScaleFor(zoom, readableLabels, Number(el.dataset.labelFont))
          )
        );
      }
    };
    apply();
    return uiStoreApi.subscribe((s, p) => {
      if (s.zoom === p.zoom && s.readableLabels === p.readableLabels) return;
      apply();
    });
  }, [uiStoreApi]);

  return (
    <div ref={counterScaleRef} style={{ display: 'contents' }}>
      {labelPositions.map(({ label, position }) => {
        if (label.id === editingLabelId) {
          return (
            <ConnectorNameEditor
              key={`${label.id}-edit`}
              position={position}
              name={label.text}
              labelHeight={label.height || 0}
              onCommit={(raw) => commitLabelText(label.id, raw)}
              onCancel={() => cancelLabelEdit(label.id)}
              onRequestLink={(r) =>
                window.dispatchEvent(
                  new CustomEvent(EDIT_ELEMENT_LINK_EVENT, {
                    detail: {
                      target: {
                        kind: 'CONNECTOR_LABEL',
                        connectorId: connector.id,
                        labelId: label.id
                      },
                      rect: {
                        left: r.left,
                        top: r.top,
                        width: r.width,
                        height: r.height
                      }
                    }
                  })
                )
              }
            />
          );
        }

        return (
          <ConnectorTextLabel
            key={label.id}
            position={position}
            label={label}
            interactive={isEditable}
            selected={selectedLabelId === label.id}
            onPointerDown={(e) => startLabelDrag(e, label)}
            onStartEdit={() => setEditingLabelId(label.id)}
            linkTarget={{ connectorId: connector.id, labelId: label.id }}
          />
        );
      })}
    </div>
  );
});
