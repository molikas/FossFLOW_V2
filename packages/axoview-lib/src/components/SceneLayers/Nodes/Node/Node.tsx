import React, { useMemo, memo, useCallback, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { DEFAULT_LABEL_HEIGHT } from 'src/config';
import { LABEL_BASE_FONT_PX } from 'src/config/labelSettings';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useSceneActions } from 'src/hooks/useSceneActions';
import {
  useUiStateStore,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import { useRenderProbe } from 'src/utils/renderProbe';
import { getRenderedOffset } from 'src/utils/renderedGeometry';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { useInlineRename } from 'src/hooks/useInlineRename';
import {
  EDIT_ELEMENT_LINK_EVENT,
  HIDE_ELEMENT_LINK_EVENT
} from 'src/utils/quillLinkShortcut';
import { LABEL_LINK_COLOR } from 'src/utils/labelChip';
import { stripHtmlTags } from 'src/utils/stripHtml';
import { isLabelVisibleInPreview } from 'src/utils/previewLabelVisibility';
import { isNodeLabelDrawn } from 'src/config/labelSettings';

const INLINE_EDIT_EVENT = 'inlineEditNodeName';

interface Props {
  node: ViewItem;
  order: number;
}

// MQA #7 Path 2 — render-fan-out reduction for multi-element drag.
//
// During a drag, only `node.tile` (and therefore `order`) changes per frame.
// The outer Node shell still re-renders per tick (parent passes a new
// ViewItem ref), but its render output is now a thin position wrapper plus a
// memoized NodeContent. NodeContent's props are only the stable layout fields,
// so its memo bails as long as labels/text aren't being edited. Net effect:
// per-tick React commit drops from "rebuild icon + label + flex tree" to
// "update one inline style".
//
// Position uses inline `style={{left, top}}` (not sx) so emotion isn't
// re-invoked per drag tick. The static sx pieces are module-level constants
// so emotion's class hash hits cache every time.

// T1 "wholesale de-emotion" (decision-log): the per-node elements below are
// module-level styled() components, so their CSS is resolved ONCE into a cached
// emotion class and each of the ~N nodes pays only a className apply — NOT the
// per-instance MUI sx pipeline (extendSxProp / styleFunctionSx / murmur2), which
// `<Box sx={...}>` re-runs every render even for a constant sx object (~403 ms of
// the spawn freeze at N=1000; perf-results/cpuprofile-spawn-1000.md). Dynamic bits
// (the --ff-* CSS vars, cursor, label colour/size) stay inline; the drag CSS-var
// transform mechanism (MQA #7 Path 4-true) is preserved verbatim.

const NodeShell = styled('div')({ position: 'absolute' });

const NodeTransform = styled('div')({
  position: 'absolute',
  // --ff-x/--ff-y written by React from the model tile; --ff-off-x/y the ADR 0023
  // off-grid render offset (post-projection px, 0 when snapped); --ff-drag-dx/dy
  // mutated by DragItems via DOM during a drag. All three are summed in one
  // translate3d so they compose (compositor-only updates, no per-frame React)
  // and the offset never fights the live drag delta. (The tap-to-place carry
  // affordance was superseded by direct manipulation — ADR 0018 Revision B.)
  transform:
    'translate3d(calc(var(--ff-x, 0px) + var(--ff-off-x, 0px) + var(--ff-drag-dx, 0px)), calc(var(--ff-y, 0px) + var(--ff-off-y, 0px) + var(--ff-drag-dy, 0px)), 0)',
  willChange: 'transform'
});

// Flex-centering wrapper (cursor applied inline — it is the one dynamic bit).
const NodeContentFlex = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
});

// Replaces the former <Stack spacing={1}> / flex-div: 8px = theme.spacing(1).
const LabelStack = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: 8
});

const IconWrap = styled('div')({
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative'
});

const NotesBadge = styled('div')({
  position: 'absolute',
  top: -6,
  right: -6,
  width: 14,
  height: 14,
  borderRadius: '50%',
  backgroundColor: '#1565c0',
  border: '2px solid #fff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});

// Display-mode label title: theme.typography.body1 + the fixed overrides baked
// once. Per-node labelFontSize / labelColor go via inline style.
// #10: break long words so a caption that is a link (the name renders as an <a>
// when headerLink is set) wraps inside the label chip instead of being clipped by
// its overflow:hidden. Matches the inline-edit wrap idiom; covers plain names too.
const LabelTitle = styled('p')(({ theme }) => ({
  ...theme.typography.body1,
  margin: 0,
  fontWeight: 600,
  fontSize: LABEL_BASE_FONT_PX,
  color: theme.palette.text.primary,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere'
}));

export const Node = memo(({ node, order }: Props) => {
  useRenderProbe('Node', node.id);
  const { getTilePosition } = useCanvasMode();

  const position = useMemo(
    () =>
      getTilePosition({
        tile: node.tile,
        origin: 'CENTER'
      }),
    [getTilePosition, node.tile]
  );

  // ADR 0023: off-grid residual as a post-projection (SceneLayer px) translate;
  // {0,0} when snapped. Composes with --ff-x/y and the live drag delta below.
  const renderedOffset = getRenderedOffset(node);

  return (
    <NodeShell style={{ zIndex: order }} data-drag-id={node.id}>
      <NodeTransform
        style={
          {
            '--ff-x': `${position.x}px`,
            '--ff-y': `${position.y}px`,
            '--ff-off-x': `${renderedOffset.x}px`,
            '--ff-off-y': `${renderedOffset.y}px`
          } as React.CSSProperties
        }
      >
        <NodeContent
          id={node.id}
          showLabel={node.showLabel}
          labelHeight={node.labelHeight}
          labelFontSize={node.labelFontSize}
          labelColor={node.labelColor}
          labelBold={node.labelBold}
          labelItalic={node.labelItalic}
          labelStrikethrough={node.labelStrikethrough}
          labelUnderline={node.labelUnderline}
          iconScale={node.iconScale}
        />
      </NodeTransform>
    </NodeShell>
  );
});

// ---------------------------------------------------------------------------
// NodeContent — heavy content (label + icon + badges).
//
// Receives only the stable, non-position fields from ViewItem. Memo bails as
// long as those primitives are unchanged. During a drag, this means dragged
// nodes still re-render the position wrapper but the icon/label tree is
// reused without React reconciliation.
// ---------------------------------------------------------------------------

interface NodeContentProps {
  id: string;
  showLabel?: boolean;
  labelHeight?: number;
  labelFontSize?: number;
  labelColor?: string;
  labelBold?: boolean;
  labelItalic?: boolean;
  labelStrikethrough?: boolean;
  labelUnderline?: boolean;
  // ADR 0044: per-node icon scale (committed model value). Overrides the shared
  // icon asset scale for this node only. The live resize preview is merged from
  // uiState.iconScaleDrag below.
  iconScale?: number;
}

const NodeContent = memo(
  ({
    id,
    showLabel,
    labelHeight,
    labelFontSize,
    labelColor,
    labelBold,
    labelItalic,
    labelStrikethrough,
    labelUnderline,
    iconScale
  }: NodeContentProps) => {
    useRenderProbe('NodeContent', id);
    const modelItem = useModelItem(id);
    // ADR 0044: while THIS node's icon is being resized on canvas, the live
    // scale lives in uiState.iconScaleDrag (a transient UI preview — no per-frame
    // model write, so the O(N) WebGL node bulk isn't rebuilt each frame). Only
    // the dragged node's value flips, so only it re-renders. Committed once on
    // release. Null for every other node / when no resize is in flight.
    const iconScaleDragValue = useUiStateStore(
      (s) => s.iconScaleDrag?.scales[id] ?? null
    );
    const { iconComponent } = useIcon(
      modelItem?.icon,
      iconScaleDragValue ?? iconScale
    );
    const editorMode = useUiStateStore((s) => s.editorMode);
    // Present-mode hide-labels override (ADR 0013 addendum) — UI-only.
    const previewHideLabels = useUiStateStore((s) => s.previewHideLabels);
    // Image-export hide-labels override (ADR 0025 §3) — UI-only, export-scoped.
    const exportHideLabels = useUiStateStore((s) => s.exportHideLabels);
    // MQA #7 Path 2 — useSceneActions only (NOT useScene). The latter pulls
    // useSceneData which subscribes to {views, ...} shallow; `views` ticks
    // per drag frame and would force NodeContent to re-render past its memo
    // gate, defeating the split.
    const { updateModelItem, updateViewItem } = useSceneActions();
    const uiStoreApi = useUiStateStoreApi();
    // Single-selection signal for the on-canvas label drag (ADR 0024). A
    // primitive boolean selector: only this node flips when selection changes,
    // and only the selected/dragged nodes are mounted as DOM here anyway.
    const isSelected = useUiStateStore(
      (s) => s.itemControls?.type === 'ITEM' && s.itemControls.id === id
    );
    // Track P (T6 fix): live preview height while THIS node's label is being
    // dragged from the canvas (NodeLabelHitLayer promotes it into the DOM overlay
    // and pushes the offset here). Only the dragged node's value changes, so only
    // it re-renders per frame — no per-frame model write, no canvas redraw. Null
    // for every other node and when no label drag is in flight.
    const labelDragHeight = useUiStateStore((s) =>
      s.labelDrag?.id === id ? s.labelDrag.height : null
    );

    const isReadonly = editorMode === 'EXPLORABLE_READONLY';
    const isEditable = editorMode === 'EDITABLE';
    // R4/RND-05: the LOD gate. `NodesCanvas` stops drawing name chips below
    // `LABEL_LOD_ZOOM` (unless "keep labels readable" is on), but this DOM
    // overlay — which the hybrid promotes the SELECTED node into — had no such
    // gate, so selecting a node at low zoom made its name reappear while every
    // other node's stayed hidden. Same predicate both sides read now
    // (config/labelSettings), so bulk and overlay cannot disagree.
    const labelLodVisible = useUiStateStore((s) =>
      isNodeLabelDrawn(s.zoom, s.readableLabels)
    );
    // Merge the model's `showLabel` with the present-mode hide-labels flag at the
    // single documented merge point (forced hidden only while presenting).
    const labelVisible =
      labelLodVisible &&
      isLabelVisibleInPreview(showLabel !== false, isReadonly, previewHideLabels) &&
      !exportHideLabels;
    const hasLink = isReadonly && !!modelItem?.link;

    const [isEditingName, setIsEditingName] = useState(false);

    // ADR 0024 label reposition — drag the label chip itself to move it above or
    // below the node. Live preview held here (not the model) so the gesture is a
    // pure React preview; the model is written ONCE on release (one history
    // entry). Null when not dragging.
    const [labelOffsetPreview, setLabelOffsetPreview] = useState<number | null>(
      null
    );

    const commitLabelOffset = useCallback(
      (offset: number) => {
        updateViewItem(id, { labelHeight: offset });
        setLabelOffsetPreview(null);
      },
      [updateViewItem, id]
    );

    // F2 handler in useInteractionManager dispatches this event for the
    // currently-selected item; match by id so only that node enters edit mode.
    useEffect(() => {
      if (!isEditable) return;
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ id: string }>).detail;
        if (detail?.id === id) setIsEditingName(true);
      };
      window.addEventListener(INLINE_EDIT_EVENT, handler);
      return () => window.removeEventListener(INLINE_EDIT_EVENT, handler);
    }, [id, isEditable]);

    const startInlineEdit = useCallback(
      (e: React.MouseEvent) => {
        if (!isEditable) return;
        e.stopPropagation();
        e.preventDefault();
        setIsEditingName(true);
      },
      [isEditable]
    );

    // ADR 0032 amendment: canvas inline-rename (F2 / double-click) edits the
    // on-canvas `label`, not the identity `name` (which is renamed in Layers).
    // The displayed/base value is the effective label text (`label ?? name`);
    // clearing to empty writes `label: ''`, which hides the chip.
    const commitLabel = useCallback(
      (raw: string) => {
        const next = raw.trim();
        const current = modelItem?.label ?? modelItem?.name ?? '';
        if (next !== current) {
          updateModelItem(id, { label: next });
        }
        setIsEditingName(false);
      },
      [updateModelItem, id, modelItem?.label, modelItem?.name]
    );

    const inlineRename = useInlineRename({
      active: isEditingName,
      commit: commitLabel,
      cancel: () => setIsEditingName(false)
    });

    // MQA #22 / #25 (3rd pass): the chip / hover-popover patterns were both
    // wrong. The user wants the existing read-only details panel (NodePanel
    // readOnly) to open on left-click of the node body — same component, same
    // surface, augmented with an "Open linked diagram" affordance in its header.
    // The body click itself is dispatched from Pan.mouseup (so right-drag pan
    // continues to work). The Node component just renders the visual; it does
    // not own the click handler anymore.

    // Option A: the node's rich `description`/caption is no longer a competing
    // on-canvas text — it folds into Notes (migrated at load). The canvas label
    // is now the single `name` text only. `description` stays in the schema for
    // back-compat round-trip but is not rendered here.

    // MQA #22 / #25 (final polish): in preview mode, give clickable nodes the
    // pointing-finger cursor so the hover affordance matches Pan.mouseup's
    // panel-opening logic. "Clickable" === any content that would populate
    // the readOnly NodePanel: linked diagram, external link, or notes.
    // EDITABLE mode is unaffected (cursor stays inherit so the canvas tooling
    // sets its own cursor).
    const visibleNotes = useMemo(() => {
      if (!modelItem?.notes) return null;
      const stripped = stripHtmlTags(modelItem.notes).trim();
      return stripped ? modelItem.notes : null;
    }, [modelItem?.notes]);

    const isClickableInReadonly =
      isReadonly &&
      (!!modelItem?.link || !!modelItem?.headerLink || !!visibleNotes);

    if (!modelItem) {
      return null;
    }

    // ADR 0032 amendment: the on-canvas text is the `label` field, falling back
    // to the identity `name` when absent. The DOM overlay mirrors NodesCanvas.
    const labelText = modelItem.label ?? modelItem.name;

    return (
      <NodeContentFlex
        style={{ cursor: isClickableInReadonly ? 'pointer' : 'inherit' }}
      >
        {labelVisible &&
          (labelText || isEditingName) && (
            <div data-testid="node-label" onDoubleClick={startInlineEdit}>
              <ExpandableLabel
                maxWidth={isEditingName ? 600 : 250}
                expandDirection="BOTTOM"
                // R5/OVL-02: the readable-labels floor is per label.
                labelFontSizePx={labelFontSize}
                labelHeight={
                  labelDragHeight ??
                  labelOffsetPreview ??
                  labelHeight ??
                  DEFAULT_LABEL_HEIGHT
                }
                reposition={
                  isEditable && isSelected && !isEditingName
                    ? {
                        getZoom: () => uiStoreApi.getState().zoom,
                        onPreview: setLabelOffsetPreview,
                        onCommit: commitLabelOffset
                      }
                    : undefined
                }
              >
                <LabelStack>
                  {isEditingName ? (
                    <Typography
                      fontWeight={labelBold ? 700 : 600}
                      fontStyle={labelItalic ? 'italic' : 'normal'}
                      fontSize={labelFontSize ?? LABEL_BASE_FONT_PX}
                      color={labelColor || 'text.primary'}
                      contentEditable
                      suppressContentEditableWarning
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={inlineRename.onBlur}
                      onKeyDown={(e) => {
                        // Ctrl/Cmd+K mid-rename → the inline link card at
                        // this label (owner 2026-07-05; the node's
                        // element-level headerLink). The card's focus steal
                        // blurs this editor, committing the name first.
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
                                target: { kind: 'NODE', id },
                                rect: {
                                  left: r.left,
                                  top: r.top,
                                  width: r.width,
                                  height: r.height
                                }
                              }
                            })
                          );
                          return;
                        }
                        inlineRename.onKeyDown(e);
                      }}
                      ref={inlineRename.setRef}
                      sx={{
                        outline: '1px solid rgba(0,0,0,0.3)',
                        borderRadius: 1,
                        px: 0.75,
                        bgcolor: '#fff',
                        minWidth: 20,
                        cursor: 'text',
                        display: 'inline-block',
                        width: 'max-content',
                        maxWidth: '100%',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        textDecoration:
                          [
                            labelUnderline ? 'underline' : null,
                            labelStrikethrough ? 'line-through' : null
                          ]
                            .filter(Boolean)
                            .join(' ') || 'none'
                      }}
                    >
                      {labelText ?? ''}
                    </Typography>
                  ) : (
                    labelText && (
                      <LabelTitle
                        style={{
                          ...(labelFontSize
                            ? { fontSize: labelFontSize }
                            : null),
                          ...(labelColor ? { color: labelColor } : null),
                          ...(labelBold ? { fontWeight: 700 } : null),
                          ...(labelItalic ? { fontStyle: 'italic' } : null),
                          ...(labelStrikethrough || labelUnderline
                            ? {
                                textDecoration: [
                                  labelUnderline ? 'underline' : null,
                                  labelStrikethrough ? 'line-through' : null
                                ]
                                  .filter(Boolean)
                                  .join(' ')
                              }
                            : null)
                        }}
                      >
                        {modelItem.headerLink ? (
                          // Linked label (ADR 0034 addendum 2026-07-05):
                          // link-blue unless a custom color is set; in EDIT
                          // mode hovering shows the element link card and a
                          // plain click SELECTS (Ctrl/Cmd+click opens — the
                          // Docs convention shared with text-box links);
                          // read-only keeps click-to-open.
                          <a
                            href="#"
                            data-testid="node-header-link"
                            title={modelItem.headerLink}
                            style={{
                              color: labelColor ? 'inherit' : LABEL_LINK_COLOR,
                              textDecoration: 'underline',
                              cursor: 'pointer'
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onMouseEnter={
                              !isReadonly
                                ? (e) => {
                                    const r =
                                      e.currentTarget.getBoundingClientRect();
                                    window.dispatchEvent(
                                      new CustomEvent(EDIT_ELEMENT_LINK_EVENT, {
                                        detail: {
                                          target: { kind: 'NODE', id },
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
                            onMouseLeave={
                              !isReadonly
                                ? () =>
                                    window.dispatchEvent(
                                      new CustomEvent(HIDE_ELEMENT_LINK_EVENT)
                                    )
                                : undefined
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const url = /^https?:\/\//i.test(
                                modelItem.headerLink!
                              )
                                ? modelItem.headerLink!
                                : `https://${modelItem.headerLink}`;
                              if (isReadonly || e.ctrlKey || e.metaKey) {
                                window.open(
                                  url,
                                  '_blank',
                                  'noopener,noreferrer'
                                );
                                return;
                              }
                              // Edit mode plain click: select the node.
                              uiStoreApi
                                .getState()
                                .actions.setItemControls({
                                  type: 'ITEM',
                                  id
                                });
                            }}
                          >
                            {labelText}
                          </a>
                        ) : (
                          labelText
                        )}
                      </LabelTitle>
                    )
                  )}
                </LabelStack>
              </ExpandableLabel>
            </div>
          )}
        {iconComponent && (
          <IconWrap>
            {iconComponent}
            {modelItem.notes &&
              stripHtmlTags(modelItem.notes).trim() && <NotesBadge />}
            {hasLink && (
              <Box
                sx={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  border: '2px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <OpenInNewIcon sx={{ fontSize: 9, color: '#fff' }} />
              </Box>
            )}
          </IconWrap>
        )}
      </NodeContentFlex>
    );
  }
);
