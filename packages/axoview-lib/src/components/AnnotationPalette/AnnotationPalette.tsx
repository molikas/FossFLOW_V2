// AnnotationPalette — entry pen + fixed palette for the ephemeral annotation
// overlay (ADR 0014). Available in edit + preview.
//
// The pen button (top-right) is the single on/off toggle: it stays visible and
// highlights when active. The palette is anchored directly beneath it (fixed).
// Related draw tools are grouped behind HOVER fly-outs (the Figma/Excalidraw
// pattern, matching the user's reference tool): Select · Draw · Shapes · Eraser.
// A group slot shows its active variant + a corner caret; hovering it opens a
// fly-out (always to the LEFT, so it can't run off the right edge) to switch
// variant; clicking the slot activates the current variant. Colors, thickness,
// and undo/redo/clear stay always-visible below.

import React, { useRef, useState } from 'react';
import { Box, Divider, IconButton, Paper, Stack, Tooltip } from '@mui/material';
import {
  NearMeOutlined as SelectIcon,
  GestureOutlined as PencilIcon,
  BorderColorOutlined as HighlighterIcon,
  RemoveOutlined as LineIcon,
  ArrowRightAltOutlined as ArrowIcon,
  CropSquareOutlined as RectIcon,
  CircleOutlined as EllipseIcon,
  UndoOutlined as UndoIcon,
  RedoOutlined as RedoIcon,
  DeleteOutlineOutlined as ClearIcon,
  EditOutlined as PenIcon,
  CheckRounded as CheckIcon
} from '@mui/icons-material';
import { shallow } from 'zustand/shallow';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';
import { AnnotationTool } from 'src/types';
import {
  ANNOTATION_COLOR_PRESETS,
  ANNOTATION_THICKNESS_PRESETS
} from 'src/config/annotationSettings';

const MUI_ICON = 24;
const CUSTOM_ICON = 24;

// Pick a legible check-mark ink for a swatch from its luminance, so the active
// marker reads on both the near-white and the near-black presets.
const contrastInk = (hex: string): string => {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
};

const EraserGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    width={CUSTOM_ICON}
    height={CUSTOM_ICON}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M8.5 20H20" />
    <path d="M4.3 14.6l5.2-5.2a1.5 1.5 0 0 1 2.1 0l3.3 3.3a1.5 1.5 0 0 1 0 2.1L11.6 18H7.7l-3.4-3.4z" />
  </svg>
);

const TOOL_ICONS: Record<AnnotationTool, React.ReactNode> = {
  select: <SelectIcon sx={{ fontSize: MUI_ICON }} />,
  pencil: <PencilIcon sx={{ fontSize: MUI_ICON }} />,
  highlighter: <HighlighterIcon sx={{ fontSize: MUI_ICON }} />,
  line: <LineIcon sx={{ fontSize: MUI_ICON }} />,
  arrow: <ArrowIcon sx={{ fontSize: MUI_ICON }} />,
  rectangle: <RectIcon sx={{ fontSize: MUI_ICON }} />,
  ellipse: <EllipseIcon sx={{ fontSize: MUI_ICON }} />,
  eraser: <EraserGlyph />
};

// The right Properties dock is 300px wide; slide the pen + palette clear of it
// when it's open (edit mode) so they don't overlap (preview never auto-opens it).
const DOCK_WIDTH = 300;
const EDGE_GAP = 12;

type GroupKey = 'draw' | 'shapes';
const DRAW_TOOLS: AnnotationTool[] = ['pencil', 'highlighter'];
const SHAPE_TOOLS: AnnotationTool[] = ['line', 'arrow', 'rectangle', 'ellipse'];

/** Small bottom-right corner triangle marking a slot as an expandable group. */
const GroupCaret = () => (
  <Box
    component="svg"
    viewBox="0 0 10 10"
    sx={{
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 7,
      height: 7,
      fill: 'currentColor',
      opacity: 0.5,
      pointerEvents: 'none'
    }}
  >
    <path d="M10 10 L10 2 L2 10 Z" />
  </Box>
);

export const AnnotationPalette = () => {
  const { t } = useTranslation('annotationPalette');
  const actions = useUiStateStore((s) => s.actions);
  const {
    open,
    tool,
    color,
    thickness,
    strokeCount,
    undoCount,
    redoCount,
    dockOpen
  } =
    useUiStateStore(
      (s) => ({
        open: s.annotation.open,
        tool: s.annotation.tool,
        color: s.annotation.color,
        thickness: s.annotation.thickness,
        strokeCount: s.annotation.strokes.length,
        // F2/VIEW-07: Undo/Redo are gated on the OPERATION log, not on the
        // stroke count — a Clear leaves zero strokes and is still undoable.
        undoCount: s.annotation.past.length,
        redoCount: s.annotation.future.length,
        dockOpen: s.rightSidebarOpen
      }),
      shallow
    );

  const rightOffset = dockOpen ? DOCK_WIDTH + EDGE_GAP : EDGE_GAP;

  // Remembered variant per group so the slot shows the last-used tool.
  const [drawVariant, setDrawVariant] = useState<AnnotationTool>('pencil');
  const [shapeVariant, setShapeVariant] = useState<AnnotationTool>('rectangle');
  const [hoverGroup, setHoverGroup] = useState<GroupKey | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFlyout = (g: GroupKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoverGroup(g);
  };
  // Small delay so crossing from the slot to the fly-out doesn't flicker it shut.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHoverGroup(null), 120);
  };

  const drawActive = (DRAW_TOOLS as string[]).includes(tool);
  const shapeActive = (SHAPE_TOOLS as string[]).includes(tool);

  const pickVariant = (group: GroupKey, v: AnnotationTool) => {
    actions.setAnnotationTool(v);
    if (group === 'draw') setDrawVariant(v);
    else setShapeVariant(v);
    setHoverGroup(null);
  };

  const swatch = (preset: string) => {
    const active = color === preset;
    return (
      <Box
        key={preset}
        role="button"
        aria-label={preset}
        aria-pressed={active}
        data-axoview-id="annotation-color"
        onClick={() => actions.setAnnotationColor(preset)}
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          bgcolor: preset,
          cursor: 'pointer',
          border: '1px solid',
          borderColor: 'divider',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 90ms ease, box-shadow 90ms ease',
          // Active = scaled up + an offset accent ring (a paper-colored gap then
          // the primary ring) + a contrast check mark. Unmistakable against the
          // panel and against any swatch color.
          transform: active ? 'scale(1.25)' : 'none',
          zIndex: active ? 1 : 0,
          boxShadow: active
            ? (theme) =>
                `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 3.5px ${theme.palette.primary.main}`
            : 'none',
          '&:hover': {
            transform: active ? 'scale(1.25)' : 'scale(1.12)'
          }
        }}
      >
        {active && (
          <CheckIcon sx={{ fontSize: 12, color: contrastInk(preset) }} />
        )}
      </Box>
    );
  };

  const toolButtonSx = (active: boolean) => ({
    width: '100%',
    p: 0.5,
    borderRadius: 1.5,
    position: 'relative' as const,
    color: active ? 'primary.main' : 'text.secondary',
    bgcolor: active ? 'action.selected' : 'transparent',
    '&:hover': { bgcolor: 'action.hover' }
  });

  // A hover-group slot: the trigger button + a left fly-out. The fly-out lives
  // inside the (relative) wrapper with a transparent bridge so moving onto it
  // never crosses a dead gap.
  const renderGroup = (
    group: GroupKey,
    variant: AnnotationTool,
    variants: AnnotationTool[],
    active: boolean,
    label: string
  ) => (
    <Box
      sx={{ position: 'relative' }}
      onMouseEnter={() => openFlyout(group)}
      onMouseLeave={scheduleClose}
    >
      {/* No tooltip on group slots: hovering opens the fly-out (the affordance),
          and a left-placed tooltip would collide with it. */}
      <IconButton
        onClick={() => actions.setAnnotationTool(variant)}
        aria-pressed={active}
        aria-label={label}
        data-axoview-id={`annotation-group-${group}`}
        sx={toolButtonSx(active)}
      >
        {TOOL_ICONS[variant]}
        <GroupCaret />
      </IconButton>

      {hoverGroup === group && (
        <Box
          // right:100% sits the bridge edge on the slot's left edge; the pr is a
          // transparent hover bridge so there's no gap to the fly-out paper.
          sx={{
            position: 'absolute',
            right: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            pr: '8px',
            display: 'flex',
            zIndex: 2
          }}
        >
          <Paper
            elevation={6}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{ display: 'flex', gap: 0.25, p: 0.5, borderRadius: 1.5 }}
          >
            {variants.map((v) => (
              <Tooltip key={v} title={t(v)} placement="top" disableInteractive>
                <IconButton
                  onClick={() => pickVariant(group, v)}
                  aria-pressed={tool === v}
                  data-axoview-id={`annotation-tool-${v}`}
                  sx={{
                    p: 0.25,
                    borderRadius: 1.5,
                    color: tool === v ? 'primary.main' : 'text.secondary',
                    bgcolor: tool === v ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  {TOOL_ICONS[v]}
                </IconButton>
              </Tooltip>
            ))}
          </Paper>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {/* Pen entry = the on/off toggle. Stays visible; highlights when active. */}
      <Tooltip title={t('pen')} placement="left">
        <IconButton
          size="small"
          onClick={() => actions.setAnnotationOpen(!open)}
          aria-pressed={open}
          data-axoview-id="annotation-pen"
          sx={{
            position: 'absolute',
            right: rightOffset,
            top: 12,
            // Above the annotation overlay's armed z-index (25) so the pen —
            // the single exit toggle — stays operable while drawing covers the
            // rest of the editor chrome (whole-screen annotation, ADR 0014).
            zIndex: 30,
            p: 1,
            borderRadius: 1.5,
            // Active state uses the same grey selected fill as the other
            // toolbar/dock controls (e.g. the sidebar toggle), not a blue fill.
            bgcolor: open ? 'action.selected' : 'background.paper',
            color: open ? 'text.primary' : 'text.secondary',
            boxShadow: 2,
            '&:hover': { bgcolor: open ? 'action.selected' : 'action.hover' }
          }}
        >
          <PenIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>

      {open && (
        <Paper
          elevation={6}
          data-axoview-id="annotation-palette"
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            right: rightOffset,
            top: 60,
            // Above the annotation overlay's armed z-index (25) so tool/color/
            // clear stay operable while the overlay covers the editor chrome.
            zIndex: 30,
            width: 48,
            borderRadius: 2,
            p: 0.5,
            // Let the fly-outs overflow to the left.
            overflow: 'visible'
          }}
        >
          <Stack spacing={0.25} sx={{ alignItems: 'stretch' }}>
            {/* Select */}
            <Tooltip title={t('select')} placement="left" disableInteractive>
              <IconButton
                onClick={() => actions.setAnnotationTool('select')}
                aria-pressed={tool === 'select'}
                data-axoview-id="annotation-tool-select"
                sx={toolButtonSx(tool === 'select')}
              >
                {TOOL_ICONS.select}
              </IconButton>
            </Tooltip>

            {renderGroup('draw', drawVariant, DRAW_TOOLS, drawActive, t('draw'))}
            {renderGroup(
              'shapes',
              shapeVariant,
              SHAPE_TOOLS,
              shapeActive,
              t('shapes')
            )}

            {/* Eraser */}
            <Tooltip title={t('eraser')} placement="left" disableInteractive>
              <IconButton
                onClick={() => actions.setAnnotationTool('eraser')}
                aria-pressed={tool === 'eraser'}
                data-axoview-id="annotation-tool-eraser"
                sx={toolButtonSx(tool === 'eraser')}
              >
                {TOOL_ICONS.eraser}
              </IconButton>
            </Tooltip>

            <Divider flexItem sx={{ my: 0.25 }} />

            {/* Colors — 2-column grid. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 0.5,
                placeItems: 'center'
              }}
            >
              {ANNOTATION_COLOR_PRESETS.map(swatch)}
            </Box>

            <Divider flexItem sx={{ my: 0.25 }} />

            {/* Thickness — full-width bars (kept always-visible per request). */}
            {ANNOTATION_THICKNESS_PRESETS.map((w) => (
              <Box
                key={w}
                role="button"
                aria-label={`${w}`}
                data-axoview-id="annotation-thickness"
                onClick={() => actions.setAnnotationThickness(w)}
                sx={{
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 1,
                  bgcolor: thickness === w ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <Box
                  sx={{
                    width: '80%',
                    height: Math.min(w, 14),
                    borderRadius: 4,
                    bgcolor: 'text.primary'
                  }}
                />
              </Box>
            ))}

            <Divider flexItem sx={{ my: 0.25 }} />

            {/* Undo / Redo / Clear */}
            <Tooltip title={t('undo')} placement="left" disableInteractive>
              <span>
                <IconButton
                  onClick={actions.undoAnnotationStroke}
                  disabled={undoCount === 0}
                  data-axoview-id="annotation-undo"
                  sx={{ width: '100%', p: 0.5, borderRadius: 1.5 }}
                >
                  <UndoIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('redo')} placement="left" disableInteractive>
              <span>
                <IconButton
                  onClick={actions.redoAnnotationStroke}
                  disabled={redoCount === 0}
                  data-axoview-id="annotation-redo"
                  sx={{ width: '100%', p: 0.5, borderRadius: 1.5 }}
                >
                  <RedoIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('clear')} placement="left" disableInteractive>
              <span>
                <IconButton
                  onClick={actions.clearAnnotations}
                  disabled={strokeCount === 0}
                  data-axoview-id="annotation-clear"
                  sx={{ width: '100%', p: 0.5, borderRadius: 1.5, color: 'error.main' }}
                >
                  <ClearIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Paper>
      )}
    </>
  );
};
