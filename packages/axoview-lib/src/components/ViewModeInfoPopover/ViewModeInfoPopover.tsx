// ViewModeInfoPopover — canvas-anchored item info surface for view-only mode
// (ADR 0012). In EXPLORABLE_READONLY the right editing dock no longer auto-opens
// on selection (see uiStateStore.setItemControls/setSelectedIds); instead an
// item's name / notes / link surface here, anchored to the item on the canvas:
//   - hover (with intent delay) → lightweight preview
//   - click → pinned (selection); closes on X / Esc / click-away (deselect)
// Parity across node / connector / rectangle / textbox / floating label;
// renders nothing for items with no name, notes, or headerLink.
//
// Anchoring mirrors NodeActionBar: rendered inside a SceneLayer at the item's
// tile and counter-scaled by 1/zoom (UX §8.8) so it stays pixel-stable.

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Box, Paper, IconButton, Typography, Stack, Link } from '@mui/material';
import {
  CloseOutlined as CloseIcon,
  OpenInNewOutlined as OpenLinkIcon
} from '@mui/icons-material';
import { Coords, ItemReference } from 'src/types';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useScene } from 'src/hooks/useScene';
import { useViewItem } from 'src/hooks/useViewItem';
import { useModelItem } from 'src/hooks/useModelItem';
import { useConnector } from 'src/hooks/useConnector';
import { useTextBox } from 'src/hooks/useTextBox';
import { useLabel } from 'src/hooks/useLabel';
import { useRectangle } from 'src/hooks/useRectangle';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';
import { getItemAtTile } from 'src/utils/hitDetection';
import { hasVisibleText } from 'src/components/NodeActionBar/NodeActionBar.helpers';
import {
  deriveItemInfo,
  hasInfoPopoverContent,
  toHref
} from 'src/components/ViewModeInfoPopover/ViewModeInfoPopover.helpers';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';

const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 100;

// Types whose SELECTION opens the popover. F2/VIEW-05 added 'LABEL': the hover
// branch already had a dedicated `viewModeHoveredLabelId` path and
// `deriveItemInfo` a full `case 'LABEL'`, but the selection path was gated here
// — so a selected Label was filtered out before the derivation it already had
// was ever called. The hover branch is notes-gated (owner 2026-07-01), so a
// Label carrying only a LINK had no route to its popover at all, while the same
// content on a node opened it.
const INFO_TYPES = new Set([
  'ITEM',
  'CONNECTOR',
  'RECTANGLE',
  'TEXTBOX',
  'LABEL'
]);

export const ViewModeInfoPopover = () => {
  const { t } = useTranslation('viewModeInfoPopover');
  const { getTilePosition } = useCanvasMode();
  const uiStoreApi = useUiStateStoreApi();
  const actions = useUiStateStore((s) => s.actions);
  const itemControls = useUiStateStore((s) => s.itemControls);

  // Hovered tile — re-renders only when the cursor crosses a tile boundary.
  const hoverTile = useUiStateStore(
    (s) => s.mouse.position.tile,
    (a, b) => a.x === b.x && a.y === b.y
  );
  const { items, textBoxes, hitConnectors, rectangles, layers } = useScene();

  // --- Pinned target (click selection in view mode) ---------------------------
  // Narrow out AddItemControls ('ADD_ITEM') so .id/.tile are available, then
  // gate to the info-bearing reference types (excludes CONNECTOR_ANCHOR).
  const pinnedControls =
    itemControls && itemControls.type !== 'ADD_ITEM' && INFO_TYPES.has(itemControls.type)
      ? itemControls
      : null;
  const pinnedRef: ItemReference | null = pinnedControls
    ? { type: pinnedControls.type, id: pinnedControls.id }
    : null;
  const pinnedTile = pinnedControls?.tile;

  // --- Hovered target (hover-intent) ------------------------------------------
  // Floating-label chip hover, published by LabelHitLayer's view-mode proxies.
  // Labels are deliberately absent from the tile hit-test (ADR 0031 §4 — the
  // DOM proxy layer owns label hits), so this is the popover's ONLY way to see
  // a chip hover.
  const viewModeHoveredLabelId = useUiStateStore(
    (s) => s.viewModeHoveredLabelId
  );
  const [hoveredRef, setHoveredRef] = useState<ItemReference | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A hovered chip WINS over the tile hit: a Label chip paints ABOVE nodes
    // (the `label` type rank in `compareSceneDrawOrder` — ADR 0031 §2, now a
    // sort-key property rather than a mount-order one), so what the pointer is
    // visually on top of is the chip. Both paths feed the same intent timers.
    const hit: ItemReference | null = viewModeHoveredLabelId
      ? { type: 'LABEL', id: viewModeHoveredLabelId }
      : getItemAtTile({
          tile: hoverTile,
          scene: { items, textBoxes, hitConnectors, rectangles, layers }
        });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hit) {
      timerRef.current = setTimeout(() => setHoveredRef(hit), HOVER_OPEN_MS);
    } else {
      timerRef.current = setTimeout(() => setHoveredRef(null), HOVER_CLOSE_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    hoverTile,
    items,
    textBoxes,
    hitConnectors,
    rectangles,
    layers,
    viewModeHoveredLabelId
  ]);

  // Pinned wins over hover (ADR 0012).
  const active = pinnedRef ?? hoveredRef;
  const isPinned = pinnedRef !== null;

  // --- Per-type backing data (hooks must run unconditionally) -----------------
  const activeId = active?.id ?? '';
  const viewItem = useViewItem(activeId);
  const modelItem = useModelItem(activeId);
  const connector = useConnector(activeId);
  const textBox = useTextBox(activeId);
  const label = useLabel(activeId);
  const rectangle = useRectangle(activeId);

  const info = useMemo(() => {
    if (!active) return null;
    // Per-type derivation lives in deriveItemInfo (pure, unit-tested) — notes
    // parity across all five element types is enforced there. LABEL hover
    // arrives via viewModeHoveredLabelId (labels aren't tile-hit-tested); the
    // PINNED label path is live too since F2/VIEW-05 added 'LABEL' to
    // INFO_TYPES.
    const { name, notes, headerLink, anchorTile, anchorOffset } =
      deriveItemInfo(active.type, {
        modelItem,
        viewItem,
        connector,
        textBox,
        label,
        rectangle,
        // Connectors have no single tile — anchor at the pin tile or cursor.
        fallbackTile: pinnedTile ?? hoverTile
      });

    if (!anchorTile) return null;

    const hasNotes = !!notes && hasVisibleText(notes);

    // Owner 2026-07-01: on HOVER, the popover appears ONLY when the item has
    // notes — no empty name-only preview cluttering the canvas. A PINNED click
    // is an explicit request for details, so it still shows name / link / notes
    // via hasInfoPopoverContent.
    if (isPinned) {
      if (!hasInfoPopoverContent(name, notes, headerLink)) return null;
    } else if (!hasNotes) {
      return null;
    }

    return {
      name: name?.trim() || '',
      notes,
      hasNotes,
      headerLink,
      anchorTile,
      anchorOffset
    };
  }, [
    active,
    isPinned,
    modelItem,
    viewItem,
    connector,
    textBox,
    label,
    rectangle,
    pinnedTile,
    hoverTile
  ]);

  const closePinned = useCallback(() => {
    actions.setItemControls(null);
    actions.setSelectedIds([]);
  }, [actions]);

  // Esc closes a pinned popover.
  useEffect(() => {
    if (!isPinned) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePinned();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPinned, closePinned]);

  // Side-anchored placement with edge-flip — the game-UI tooltip pattern: never
  // occlude the subject. The popover sits to the RIGHT of the item, vertically
  // centered, so the item and its top-mounted name caption stay fully visible.
  // It flips to the LEFT when the right side would overflow the viewport, and
  // clamps vertically to stay on screen. Anchoring goes through getTilePosition,
  // so it's correct in BOTH ISO and 2D — origin RIGHT/LEFT adapts to each
  // projection's tile half-width (≈70.75 iso / 50 2D). The popover renders in
  // screen space (outside the SceneLayer) at natural size; placement is applied
  // by a direct store subscription so pan/zoom never re-renders React.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const anchorTileRef = useRef<Coords | undefined>(undefined);
  anchorTileRef.current = info?.anchorTile;
  // Canvas-px residual on top of the tile anchor (ADR 0023): a floating-Label
  // chip can be dragged off its home tile (`label.offset`), so the popover
  // must anchor at the CHIP, not the tile. Applied after getTilePosition, in
  // the same canvas space LabelHitLayer's cx/cy math uses.
  const anchorOffsetRef = useRef<Coords | undefined>(undefined);
  anchorOffsetRef.current = info?.anchorOffset;

  const applyPlacement = useCallback(() => {
    const el = wrapperRef.current;
    const tile = anchorTileRef.current;
    if (!el || !tile) return;
    const { scroll, zoom, rendererSize } = uiStoreApi.getState();
    if (!rendererSize.width || !rendererSize.height) return;

    // Canvas px scale with zoom (the SceneLayer transform), so the offset is
    // folded in BEFORE the zoom multiply.
    const off = anchorOffsetRef.current;
    const toScreen = (p: Coords) => ({
      x: rendererSize.width / 2 + scroll.position.x + zoom * (p.x + (off?.x ?? 0)),
      y: rendererSize.height / 2 + scroll.position.y + zoom * (p.y + (off?.y ?? 0))
    });
    const center = toScreen(getTilePosition({ tile, origin: 'CENTER' }));
    const rightEdge = toScreen(getTilePosition({ tile, origin: 'RIGHT' }));
    const leftEdge = toScreen(getTilePosition({ tile, origin: 'LEFT' }));

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const GAP = 16;
    const MARGIN = 8;

    // Prefer the right; flip left only when right overflows and left fits.
    const rightFits = rightEdge.x + GAP + w <= rendererSize.width - MARGIN;
    const leftFits = leftEdge.x - GAP - w >= MARGIN;
    const placeRight = rightFits || !leftFits;

    const leftPx = placeRight ? rightEdge.x + GAP : leftEdge.x - GAP;
    const txPercent = placeRight ? '0%' : '-100%';

    // Vertical: centered on the item, clamped into the viewport.
    const half = h / 2;
    const topPx = Math.min(
      Math.max(center.y, half + MARGIN),
      rendererSize.height - half - MARGIN
    );

    el.style.left = `${leftPx}px`;
    el.style.top = `${topPx}px`;
    el.style.transform = `translate(${txPercent}, -50%)`;
  }, [uiStoreApi, getTilePosition]);

  // Reposition immediately when the active item / its content (and thus size)
  // changes — useLayoutEffect runs pre-paint so there's no visible jump.
  useLayoutEffect(() => {
    applyPlacement();
  }, [applyPlacement, info]);

  // Reposition on pan / zoom / resize without re-rendering React.
  useEffect(() => {
    applyPlacement();
    return uiStoreApi.subscribe((state, prev) => {
      if (
        state.scroll === prev.scroll &&
        state.zoom === prev.zoom &&
        state.rendererSize === prev.rendererSize
      ) {
        return;
      }
      applyPlacement();
    });
  }, [uiStoreApi, applyPlacement]);

  if (!info) return null;

  return (
    <Box
      ref={wrapperRef}
      data-axoview-id="view-mode-info-popover"
      data-axoview-pinned={isPinned ? 'true' : 'false'}
      sx={{
        // left / top / transform are set imperatively by applyPlacement
        // (screen-space, side-anchored with edge-flip).
        position: 'absolute',
        pointerEvents: isPinned ? 'auto' : 'none',
        zIndex: 10
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Paper
        elevation={4}
        sx={{
          minWidth: 160,
          maxWidth: 280,
          borderRadius: 2,
          px: 1.5,
          py: 1,
          bgcolor: 'background.paper'
        }}
      >
        <Stack spacing={0.5}>
          {(info.name || isPinned) && (
            <Box
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
            >
              <Typography
                variant="subtitle2"
                sx={{ flex: 1, fontWeight: 700, wordBreak: 'break-word' }}
              >
                {info.name || ' '}
              </Typography>
              {isPinned && (
                <IconButton
                  size="small"
                  onClick={closePinned}
                  aria-label={t('close')}
                  data-axoview-id="view-mode-info-popover-close"
                  sx={{ p: 0.25, mt: -0.25, mr: -0.5 }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          )}

          {info.headerLink && (
            <Link
              href={toHref(info.headerLink)}
              target="_blank"
              rel="noopener noreferrer"
              data-axoview-id="view-mode-info-popover-link"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 13,
                wordBreak: 'break-all'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <OpenLinkIcon sx={{ fontSize: 14 }} />
              {info.headerLink}
            </Link>
          )}

          {info.hasNotes && (
            <Box
              data-axoview-id="view-mode-info-popover-notes"
              sx={{ fontSize: 13, color: 'text.secondary', maxHeight: 200, overflowY: 'auto' }}
            >
              <RichTextEditor value={info.notes} readOnly />
            </Box>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};
