import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  IconButton,
  Popover,
  Tooltip,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Slider,
  Typography,
  TextField,
  Autocomplete,
  Stack
} from '@mui/material';
import {
  FormatColorText as TextColorIcon,
  FormatSize as TextSizeIcon,
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  StrikethroughS as StrikethroughIcon,
  FormatColorFill as FillIcon,
  BorderStyle as BorderIcon,
  Timeline as ConnectionColorIcon,
  FormatUnderlined as UnderlineIcon,
  FormatListBulleted as BulletListIcon,
  FormatListNumbered as NumberedListIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon,
  VerticalAlignTop as AlignTopIcon,
  VerticalAlignCenter as AlignMiddleIcon,
  VerticalAlignBottom as AlignBottomIcon,
  ImageOutlined as ChangeIconIcon,
  ArrowDropDown as CaretIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  InsertLink as LinkStripIcon,
  OpenInNew as OpenInNewIcon,
  VisibilityOutlined as ShowLabelIcon,
  VisibilityOffOutlined as HideLabelIcon
} from '@mui/icons-material';
import { LABEL_BASE_FONT_PX } from 'src/config/labelSettings';
import { useTranslation } from 'src/stores/localeStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { useViewItem } from 'src/hooks/useViewItem';
import { useTextBox } from 'src/hooks/useTextBox';
import { useLabel } from 'src/hooks/useLabel';
import { useConnector } from 'src/hooks/useConnector';
import { useRectangle } from 'src/hooks/useRectangle';
import { connectorStyleOptions, connectorLineTypeOptions } from 'src/schemas';
import { TEXTBOX_DEFAULTS, TEXTBOX_LINE_HEIGHT } from 'src/config';
import { ColorPickerBody } from '../ColorSelector/ColorPickerBody';
import { QuickIconSelector } from './QuickIconSelector';
import {
  resolveHomogeneousBulk,
  deriveTriState,
  nextToggleValue,
  deriveSharedValue,
  formatFieldPatch,
  readFormatFields,
  VIEW_ITEM_FORMAT_FIELDS,
  LABEL_FORMAT_FIELDS,
  CONNECTOR_LABEL_FORMAT_FIELDS,
  TriState,
  FormatName
} from 'src/utils/bulkStyleTarget';
import {
  getWholeContentFormats,
  applyInlineFormat,
  applyListFormat,
  applyAlignFormat,
  ListType,
  TextAlign
} from 'src/utils/richTextTransform';
import {
  getTextBoxEditor,
  getEffectiveEditorRange,
  subscribeTextBoxEditor
} from '../SceneLayers/TextBoxes/textBoxEditorBridge';
import {
  OPEN_LINK_POPOVER_EVENT,
  CLOSE_LINK_POPOVER_EVENT,
  normalizeWebLinkUrl
} from 'src/utils/quillLinkShortcut';

// Shortcut hint for the Link tooltips (Ctrl/Cmd+K, the Docs convention —
// owner 2026-07-04). Keyboard shortcut names are not translated.
const LINK_SHORTCUT_HINT =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)
    ? '⌘K'
    : 'Ctrl+K';

// Unified on-canvas label size range (px). Node labels, floating Labels, and
// connector labels all share this range/step so the size control means the same
// thing across every label type (size-consistency pass, 2026-07-01). The text
// box is intentionally excluded — its size is a zoom SCALE (tile-space), not a
// screen-px chrome size, so it keeps its own control.
const LABEL_SIZE_MIN = 10;
const LABEL_SIZE_MAX = 40;
const LABEL_SIZE_STEP = 2;

// Google-Docs-style inline strip and the CANONICAL styling surface (ADR 0030):
// the single writer of visual styling for every item type. There is no
// side-panel Style tab — the item panel is Details / Notes only; all visual
// styling is reached here. It is portaled (via UiOverlay) into a slot the app
// provides next to the session badge, so it lives INSIDE the lib's store
// providers and can read selection + write through useScene like the detail
// panels.
//
// ADR 0034: the strip's text cluster (B/I/U/S + lists + link) is DUAL-SCOPE —
// element-level booleans for label types; for a text box the format lives in
// the content HTML itself (whole content when the box is selected, the live
// caret/range via the textBoxEditorBridge while it is being edited on canvas).
// The former "Rich text" popup is retired.

type LineStyle = (typeof connectorStyleOptions)[number];
type LineType = (typeof connectorLineTypeOptions)[number];

const STYLE_DASHARRAY: Record<LineStyle, string | undefined> = {
  SOLID: undefined,
  DOTTED: '2 3',
  DASHED: '6 4'
};

// Mirrors the connector detail-panel previews so the two read identically.
const LineStylePreview = ({ style }: { style: LineStyle }) => (
  <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
    <line
      x1={2}
      y1={6}
      x2={24}
      y2={6}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray={STYLE_DASHARRAY[style]}
    />
  </svg>
);

const LineTypePreview = ({ type }: { type: LineType }) => {
  if (type === 'SINGLE') {
    return (
      <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
        <line x1={2} y1={6} x2={24} y2={6} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
      <line x1={2} y1={4} x2={24} y2={4} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={2} y1={8} x2={24} y2={8} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      {type === 'DOUBLE_WITH_CIRCLE' && (
        <circle cx={13} cy={6} r={3} fill="none" stroke="currentColor" strokeWidth={1.5} />
      )}
    </svg>
  );
};

interface StripButtonProps {
  tooltip: string;
  disabled?: boolean;
  icon: React.ReactNode;
  /** Resolved hex shown as a thin underline bar; omit for non-colour controls. */
  colorBar?: string;
  /** STYL-08: the selection's members carry different colours — the bar shows
   *  a striped "mixed" swatch rather than one arbitrary member's colour. */
  colorBarMixed?: boolean;
  popoverWidth?: number;
  /** Optional test hook on the trigger button (e2e). */
  testId?: string;
  /** Draw an accent ring to advertise the control is live (arm-time hint). */
  highlight?: boolean;
  /** Open programmatically when this window event fires (e.g. Ctrl+K routing
   *  to the Link popover). Anchored at the button, exactly like a click. */
  openEvent?: string;
  /** Close programmatically on this window event (e.g. the range-link field
   *  applying on Enter — Docs closes its dialog on apply). */
  closeEvent?: string;
  children: React.ReactNode;
}

// A single strip control: icon (+ optional colour underline) + caret that opens
// a Popover hosting the same control body used in the detail panels. The body is
// only mounted while the popover is open (MUI unmounts on close), so it re-seeds
// from the current selection every time it is opened.
const StripButton = ({
  tooltip,
  disabled,
  icon,
  colorBar,
  colorBarMixed,
  popoverWidth = 240,
  testId,
  highlight,
  openEvent,
  closeEvent,
  children
}: StripButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Read `disabled` through a ref: the Ctrl+K path ENABLES the control (the
  // editor binding expands the caret to a word) and dispatches one frame
  // later — an effect keyed on `disabled` re-subscribes too late and a stale
  // closure would swallow exactly the event that just enabled the button.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    if (!openEvent) return undefined;
    const open = () => {
      if (!disabledRef.current) setAnchorEl(buttonRef.current);
    };
    window.addEventListener(openEvent, open);
    return () => window.removeEventListener(openEvent, open);
  }, [openEvent]);

  useEffect(() => {
    if (!closeEvent) return undefined;
    const close = () => setAnchorEl(null);
    window.addEventListener(closeEvent, close);
    return () => window.removeEventListener(closeEvent, close);
  }, [closeEvent]);

  return (
    <>
      <Tooltip title={tooltip} placement="bottom">
        <span>
          <IconButton
            ref={buttonRef}
            size="small"
            disabled={disabled}
            data-testid={testId}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              borderRadius: 1,
              // Strong enabled vs faded disabled contrast. The theme pins
              // SvgIcon to `color: 'action'` (0.54) regardless of disabled
              // state, so force icons to inherit the button colour — otherwise
              // enabled and disabled controls look identical (UX §2.5).
              color: disabled ? 'action.disabled' : 'text.primary',
              '& .MuiSvgIcon-root': { color: 'inherit' },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              px: 0.5,
              py: 0.25,
              // Arm-time discoverability hint: a subtle accent ring so the user
              // notices these controls are LIVE before drawing (they edit the
              // pre-draw defaults). Cleared once something is selected.
              ...(highlight
                ? {
                    boxShadow: (theme) =>
                      `0 0 0 2px ${theme.palette.primary.main}`,
                    bgcolor: 'action.hover'
                  }
                : {})
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {icon}
              <CaretIcon sx={{ fontSize: 14, ml: '-2px' }} />
            </Box>
            {colorBar !== undefined && (
              <Box
                data-mixed={!disabled && colorBarMixed ? 'true' : undefined}
                sx={{
                  width: 18,
                  height: 3,
                  borderRadius: 1,
                  mt: '1px',
                  ...(!disabled && colorBarMixed
                    ? {
                        backgroundImage: (theme) =>
                          `repeating-linear-gradient(45deg, ${theme.palette.text.secondary} 0 2px, transparent 2px 4px)`
                      }
                    : {
                        bgcolor: disabled
                          ? 'action.disabled'
                          : colorBar || '#000000'
                      })
                }}
              />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, width: popoverWidth }}>{children}</Box>
      </Popover>
    </>
  );
};

// Strip buttons must not steal focus from the on-canvas text editor —
// otherwise the selection collapses before the format lands (the standard
// editor-toolbar mousedown trick; ADR 0034 §2).
const keepEditorSelection = (e: React.MouseEvent) => e.preventDefault();

// Sentinel stored in a fill/border's customColor to mean "transparent" (a
// no-fill rectangle keeps a visible outline and stays hittable — see
// Rectangle.tsx). Colour picking itself now lives in the shared ColorPickerBody
// (ADR 0039); the six former PresetCustomColor call sites resolve to a hex and
// commit it through that component.
const TRANSPARENT = 'transparent';

// Connector width stops (owner 2026-07-28: "minimal width for line is 10" —
// too heavy for dense diagrams). `width` is a percentage of UNPROJECTED_TILE_SIZE
// (100), so the number is also the unprojected stroke px. Everything downstream
// scales off it proportionally — white under-halo ×1.4, selection halo ×3.5,
// dash period ×2, DOUBLE offset ×3 — so a thinner value shrinks the whole
// connector coherently, and hit detection is tile-based (±1 Chebyshev, see
// hitDetection.ts) so a 2px line keeps a full-tile click target.
//
// Uneven on purpose: +3 at width 2 is a large visual change, +5 at width 25 is
// barely perceptible. The old uniform 10/15/20/25/30 stops are all preserved,
// so saved connectors never sit off-step and the default (config.ts `width: 10`)
// is untouched.
const CONNECTOR_WIDTH_STOPS = [
  { value: 2 },
  { value: 5 },
  { value: 10 },
  { value: 15 },
  { value: 20 },
  { value: 25 },
  { value: 30 }
];

// Clean slider with a persistent value readout in the header (always visible —
// no hover/click needed) + plain tick marks + the drag bubble. Shared by the
// icon-size and connector-width controls so they read identically.
const LabeledSlider = ({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  marks = true,
  mixed,
  onChange
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  // `null` restricts the slider to the explicit `marks` list (MUI contract) —
  // used by the connector width control, whose stops are deliberately uneven.
  step: number | null;
  marks?: boolean | { value: number }[];
  /** STYL-08: the bulk's members disagree — show "Mixed", not one member's. */
  mixed?: boolean;
  onChange: (value: number) => void;
}) => {
  const { t } = useTranslation('topBarStyleControls');
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 0.5
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography
          variant="caption"
          color={mixed ? 'text.secondary' : 'text.primary'}
          data-mixed={mixed ? 'true' : undefined}
          sx={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            ...(mixed ? { fontStyle: 'italic' } : {})
          }}
        >
          {mixed ? t('mixed') : displayValue}
        </Typography>
      </Box>
      <Box sx={{ px: 1 }}>
        <Slider
          marks={marks}
          step={step}
          min={min}
          max={max}
          size="small"
          valueLabelDisplay="auto"
          value={value}
          onChange={(_e, v) => onChange(v as number)}
        />
      </Box>
    </Box>
  );
};

// Alignment control (ADR 0034 addendum, re-cut 2026-07-04): standard MUI
// glyphs only — the first cut hand-rolled a 3×3 grid of composite
// vertical×horizontal cells and the owner found the tiny bar clusters
// unreadable. No standard icon set HAS the nine composites (Lucid hand-draws
// theirs), so the popover is now two rows of stock icons: horizontal text
// align (FormatAlign*) over vertical box align (VerticalAlign*) — the same
// decomposition PowerPoint/Figma use. Still ONE strip control.
type VerticalAlign = 'top' | 'middle' | 'bottom';

// URL field for the text-range Link mode (ADR 0034 addendum 2026-07-04). The
// old controlled field derived its value from liveFormats.link, which goes
// stale the moment focus moves into this popover (the editor selection is
// gone) — every keystroke rendered back as '' ("typing doesn't register") and
// each partial URL was immediately written onto the range. Local draft
// instead: Enter applies AND commits (Docs closes its dialog on apply); blur
// applies only when the draft actually changed — MUI's popover focus dance
// can blur the autoFocused field right on mount, and an unconditional
// blur-apply of the seed value would fire phantom writes (and, with the
// commit hook, close the popover before the user ever typed).
const LinkRangeUrlField = ({
  initial,
  placeholder,
  onApply,
  onCommit
}: {
  initial: string;
  placeholder: string;
  onApply: (value: string) => void;
  /** Enter only — close the popover and hand focus back to the editor. */
  onCommit: () => void;
}) => {
  const [draft, setDraft] = useState(initial);
  // Enter-apply closes the popover, which unmounts this field and fires a
  // final blur — the flag keeps that from double-applying.
  const appliedRef = useRef(false);
  return (
    <TextField
      autoFocus
      fullWidth
      size="small"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        // Keep keystrokes out of any global hotkey/editor handlers.
        e.stopPropagation();
        if (e.key === 'Enter') {
          // preventDefault + deferred commit: closing the popover
          // synchronously inside this keydown moves focus mid-keystroke and
          // the Enter's default action then lands in the refocused canvas
          // editor — observed as a phantom newline inserted at index 0,
          // shifting the just-applied link off its range.
          e.preventDefault();
          appliedRef.current = true;
          onApply(draft);
          setTimeout(onCommit, 0);
        }
      }}
      onBlur={() => {
        if (!appliedRef.current && draft !== initial) onApply(draft);
      }}
      data-axoview-id="strip-link-input"
    />
  );
};

// "Text size" presented as a uniform 0–100% scale regardless of selection, then
// mapped to each type's native range (node/connector labels are px, a text box
// is an iso-space scale factor). The UI reads identically across types; the
// value written under the hood is snapped to the type's native step.
const PercentSizeSlider = ({
  value,
  min,
  max,
  step,
  mixed,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  mixed?: boolean;
  onChange: (native: number) => void;
}) => {
  const { t } = useTranslation('topBarStyleControls');
  const toPct = (v: number) =>
    max === min ? 0 : ((v - min) / (max - min)) * 100;
  const toNative = (pct: number) => {
    const raw = min + (pct / 100) * (max - min);
    const snapped = min + Math.round((raw - min) / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
  };
  const pct = Math.round(toPct(value));

  return (
    <LabeledSlider
      label={t('textSize')}
      value={pct}
      displayValue={`${pct}%`}
      min={0}
      max={100}
      step={5}
      mixed={mixed}
      onChange={(p) => onChange(toNative(p))}
    />
  );
};

export const TopBarStyleControls = () => {
  const { t } = useTranslation('topBarStyleControls');
  const itemControls = useUiStateStore((s) => s.itemControls);
  const selectedIds = useUiStateStore((s) => s.selectedIds);
  const mode = useUiStateStore((s) => s.mode);
  const selectedConnectorLabel = useUiStateStore(
    (s) => s.selectedConnectorLabel
  );
  const connectorDefaults = useUiStateStore((s) => s.connectorDefaults);
  const setConnectorDefaults = useUiStateStore(
    (s) => s.actions.setConnectorDefaults
  );
  // Diagram-to-diagram link targets (app-supplied). Powers the strip Link
  // control's "Link to diagram" picker (D2 — consolidated from the node deck).
  const linkedDiagrams = useUiStateStore((s) => s.linkedDiagrams);
  const {
    colors,
    currentView,
    transaction,
    // Raw single-target writers — wrapped below into bulk-aware shadows.
    updateViewItem: applyViewItem,
    updateModelItem,
    updateTextBox: applyTextBox,
    updateLabel: applyLabel,
    updateConnector: applyConnector,
    updateRectangle: applyRectangle
  } = useScene();

  // S4 (#7) — ADR 0030 §2 amendment. A homogeneous multi-selection (every
  // selected item shares a type) is a bulk-style target; the strip enables and
  // each control's writer fans out across the whole selection in ONE
  // transaction (one undo entry). Heterogeneous multi stays disabled.
  const bulk = useMemo(
    () => resolveHomogeneousBulk(selectedIds),
    [selectedIds]
  );
  const isBulk = !!bulk;

  // Representative target — the single controlled item, or the FIRST of a
  // homogeneous multi-selection. Drives every control's displayed value (the
  // type-keyed hooks below resolve against it) while writes fan out.
  const sel = useMemo(
    () =>
      itemControls && itemControls.type !== 'ADD_ITEM'
        ? itemControls
        : bulk
        ? { type: bulk.type, id: bulk.ids[0] }
        : null,
    [itemControls, bulk]
  );

  // Every id the strip writes to for `type` — the homogeneous selection, or the
  // single representative. The READ side uses the same list (STYL-02/06/08): a
  // toggle asks all of them and an absolute control reports "mixed" when they
  // disagree, so nothing is derived from `ids[0]` any more.
  const targetIdsFor = useCallback(
    (type: string): string[] =>
      bulk && bulk.type === type
        ? bulk.ids
        : sel && sel.type === type
        ? [sel.id]
        : [],
    [bulk, sel]
  );

  // The live objects behind those ids, resolved out of the current view.
  const membersOf = useCallback(
    (type: string): Record<string, unknown>[] => {
      const source: { id: string }[] | undefined =
        type === 'ITEM'
          ? currentView.items
          : type === 'LABEL'
          ? currentView.labels
          : type === 'TEXTBOX'
          ? currentView.textBoxes
          : type === 'RECTANGLE'
          ? currentView.rectangles
          : type === 'CONNECTOR'
          ? currentView.connectors
          : undefined;
      return targetIdsFor(type)
        .map((id) => source?.find((m) => m.id === id))
        .filter((m): m is { id: string } => !!m) as Record<string, unknown>[];
    },
    [targetIdsFor, currentView]
  );

  // STYL-08 ruling: an absolute control shows the shared value, or "Mixed" —
  // never `bulk.ids[0]`'s. `mixed` is false for a single target by definition.
  const sharedOf = useCallback(
    <T,>(type: string, pick: (m: Record<string, unknown>) => T) =>
      deriveSharedValue(membersOf(type).map(pick)),
    [membersOf]
  );

  // Apply a per-id update to every target of `type` (the homogeneous selection,
  // or the single representative). Multi fans out inside one transaction so the
  // change is a single undo entry — mirrors deleteSelectedItems' pattern.
  const applyToTargets = useCallback(
    (type: string, apply: (id: string) => void) => {
      const ids = targetIdsFor(type);
      if (ids.length <= 1) ids.forEach(apply);
      else transaction(() => ids.forEach(apply));
    },
    [targetIdsFor, transaction]
  );

  // Bulk-aware shadows: every single-target writer below now fans out across a
  // homogeneous multi-selection automatically (the `id` arg is the
  // representative; targets are resolved by type). Icon change/size and
  // rich-text stay single — they're gated on !isBulk where rendered.
  const updateViewItem = useCallback(
    (_id: string, patch: Parameters<typeof applyViewItem>[1]) =>
      applyToTargets('ITEM', (tid) => applyViewItem(tid, patch)),
    [applyToTargets, applyViewItem]
  );
  const updateTextBox = useCallback(
    (_id: string, patch: Parameters<typeof applyTextBox>[1]) =>
      applyToTargets('TEXTBOX', (tid) => applyTextBox(tid, patch)),
    [applyToTargets, applyTextBox]
  );
  const updateLabel = useCallback(
    (_id: string, patch: Parameters<typeof applyLabel>[1]) =>
      applyToTargets('LABEL', (tid) => applyLabel(tid, patch)),
    [applyToTargets, applyLabel]
  );
  const updateConnector = useCallback(
    (_id: string, patch: Parameters<typeof applyConnector>[1]) =>
      applyToTargets('CONNECTOR', (tid) => applyConnector(tid, patch)),
    [applyToTargets, applyConnector]
  );
  // STYL-05 — the ONE writer for the text-box Border popover. A text box with
  // no `borderColor` has no border at all (`TextBox.borderCss` returns
  // undefined), so every control in that popover must seed a colour or its
  // change is invisible while still being stored. Two of the three did; the
  // opacity slider did not. Seeding is per-target so a bulk cannot overwrite
  // the colour of a member that already has one.
  const updateTextBoxBorder = useCallback(
    (patch: Parameters<typeof applyTextBox>[1]) =>
      applyToTargets('TEXTBOX', (tid) => {
        const target = currentView.textBoxes?.find((tb) => tb.id === tid);
        applyTextBox(tid, {
          ...patch,
          ...(target?.borderColor ? {} : { borderColor: '#000000' })
        });
      }),
    [applyToTargets, applyTextBox, currentView]
  );
  const updateRectangle = useCallback(
    (_id: string, patch: Parameters<typeof applyRectangle>[1]) =>
      applyToTargets('RECTANGLE', (tid) => applyRectangle(tid, patch)),
    [applyToTargets, applyRectangle]
  );

  // #11 — relative font-size nudge for node labels / floating Labels. Each
  // selected target steps from ITS OWN current size (preserving relative
  // differences across a multi-selection), clamped, in one transaction.
  const clampNum = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  // Hooks must run unconditionally; each returns null when the id is absent from
  // its collection, so gating by type keeps cross-collection id collisions safe.
  const node = useViewItem(sel?.type === 'ITEM' ? sel.id : '');
  const textBox = useTextBox(sel?.type === 'TEXTBOX' ? sel.id : '');
  const connector = useConnector(sel?.type === 'CONNECTOR' ? sel.id : '');
  const rectangle = useRectangle(sel?.type === 'RECTANGLE' ? sel.id : '');
  const label = useLabel(sel?.type === 'LABEL' ? sel.id : '');

  // --- Live on-canvas edit session (ADR 0034). While the selected text box is
  // being edited, the text cluster drives the mounted Quill instance (via the
  // textBoxEditorBridge) instead of transforming stored content; pressed states
  // mirror the format under the caret/selection.
  const editingTextBoxId = useUiStateStore((s) => s.editingTextBoxId);
  const liveEditing = Boolean(textBox && editingTextBoxId === textBox.id);
  const [liveFormats, setLiveFormats] = useState<Record<string, unknown>>({});
  const [liveRangeLength, setLiveRangeLength] = useState(0);
  useEffect(() => {
    if (!liveEditing) {
      setLiveFormats({});
      setLiveRangeLength(0);
      return undefined;
    }
    let detach: (() => void) | null = null;
    const attach = () => {
      const handle = getTextBoxEditor();
      if (!handle || handle.id !== editingTextBoxId) return;
      const { quill } = handle;
      const sync = () => {
        // Effective range, not the raw selection: with focus in a strip
        // popover the live selection is null OR a spurious collapsed {0,0}
        // (see textBoxEditorBridge) — the sticky lastRange is what the
        // popover is formatting, so the pressed states / enablement follow it.
        const range = getEffectiveEditorRange(handle);
        setLiveRangeLength(range?.length ?? 0);
        try {
          setLiveFormats(
            range ? { ...quill.getFormat(range.index, range.length) } : {}
          );
        } catch {
          setLiveFormats({});
        }
      };
      const onEditorChange = () => sync();
      quill.on('editor-change', onEditorChange);
      sync();
      detach = () => quill.off('editor-change', onEditorChange);
    };
    attach();
    // Registration may land after this effect (the editor mounts in the same
    // commit that flips editingTextBoxId) — re-attach on bridge changes.
    const unsubscribe = subscribeTextBoxEditor(() => {
      detach?.();
      detach = null;
      attach();
    });
    return () => {
      unsubscribe();
      detach?.();
    };
  }, [liveEditing, editingTextBoxId]);
  // Whole-content formats — the pressed state for a SELECTED (not editing)
  // text box: pressed iff the entire content carries the format.
  const wholeFormats = useMemo(
    () => getWholeContentFormats(textBox?.content),
    [textBox?.content]
  );

  // The selected node's model item + its current icon — drives the "Change
  // icon" button preview + picker. (Icon SIZE moved to on-canvas resize handles
  // per ADR 0044; the strip no longer edits it.)
  const modelItem = useModelItem(sel?.type === 'ITEM' ? sel.id : '');
  const icons = useModelStore((s) => s.icons);
  const currentIcon = icons.find((i) => i.id === modelItem?.icon);

  const resolveHex = (presetId?: string, customColor?: string) =>
    customColor || colors.find((c) => c.id === presetId)?.value;

  // --- Text colour / size target the ONE selected connector label (a labels[]
  // entry the user clicked on canvas), so styling is per-label rather than
  // applied to every label at once. Node / text box are unchanged. (The former
  // '__name__' name-label branch is gone — since the ADR 0032 decouple nothing
  // renders or selects the nameLabel* fields; ADR 0034 §4 removed the dead path.)
  const connectorLabels = connector?.labels ?? [];
  const activeLabelId =
    connector && selectedConnectorLabel?.connectorId === connector.id
      ? selectedConnectorLabel.labelId
      : null;
  const activeLabel = activeLabelId
    ? connectorLabels.find((l) => l.id === activeLabelId) ?? null
    : null;
  const updateActiveLabel = (patch: Partial<(typeof connectorLabels)[number]>) => {
    if (!connector || !activeLabel) return;
    updateConnector(connector.id, {
      labels: connectorLabels.map((l) =>
        l.id === activeLabel.id ? { ...l, ...patch } : l
      )
    });
  };

  // #11 / size-consistency: relative +/- font nudge for every on-canvas LABEL
  // type (node label, floating Label, connector label) — each steps from its
  // OWN size, clamped to the unified px range, so the +/- control means the
  // same thing everywhere. Text box excluded (its size is a zoom scale).
  const nudgeFontSize = (delta: number) => {
    if (node) {
      applyToTargets('ITEM', (id) => {
        const cur =
          currentView.items?.find((i) => i.id === id)?.labelFontSize ??
          LABEL_BASE_FONT_PX;
        applyViewItem(id, {
          labelFontSize: clampNum(cur + delta, LABEL_SIZE_MIN, LABEL_SIZE_MAX)
        });
      });
    } else if (label) {
      applyToTargets('LABEL', (id) => {
        const cur =
          currentView.labels?.find((l) => l.id === id)?.fontSize ??
          LABEL_BASE_FONT_PX;
        applyLabel(id, {
          fontSize: clampNum(cur + delta, LABEL_SIZE_MIN, LABEL_SIZE_MAX)
        });
      });
    } else if (activeLabel) {
      const cur = activeLabel.fontSize ?? LABEL_BASE_FONT_PX;
      updateActiveLabel({
        fontSize: clampNum(cur + delta, LABEL_SIZE_MIN, LABEL_SIZE_MAX)
      });
    }
  };
  // Does the current target support the px label-size control (everything except
  // the scale-based text box)?
  const hasLabelSizeTarget = Boolean(node || label || activeLabel);

  // Cross-type label sizing (owner 2026-07-02): when a MIXED selection is
  // active (e.g. a node + a connection) the normal homogeneous bulk path is off,
  // but the ONE thing that means the same across those types — the on-canvas
  // label font size — should still be adjustable together. Enabled only when
  // every selected item is a label-bearing type (node / floating label /
  // connector); a rectangle/text box in the mix keeps the strip disabled.
  const crossTypeLabelIds = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const types = new Set(selectedIds.map((r) => r.type));
    if (types.size <= 1) return null; // homogeneous → handled by the normal path
    const allLabelBearing = selectedIds.every(
      (r) => r.type === 'ITEM' || r.type === 'LABEL' || r.type === 'CONNECTOR'
    );
    return allLabelBearing ? selectedIds : null;
  }, [selectedIds]);

  const nudgeCrossTypeLabelSize = (delta: number) => {
    if (!crossTypeLabelIds) return;
    transaction(() => {
      crossTypeLabelIds.forEach((ref) => {
        if (ref.type === 'ITEM') {
          const cur =
            currentView.items?.find((i) => i.id === ref.id)?.labelFontSize ??
            LABEL_BASE_FONT_PX;
          applyViewItem(ref.id, {
            labelFontSize: clampNum(cur + delta, LABEL_SIZE_MIN, LABEL_SIZE_MAX)
          });
        } else if (ref.type === 'LABEL') {
          const cur =
            currentView.labels?.find((l) => l.id === ref.id)?.fontSize ??
            LABEL_BASE_FONT_PX;
          applyLabel(ref.id, {
            fontSize: clampNum(cur + delta, LABEL_SIZE_MIN, LABEL_SIZE_MAX)
          });
        } else if (ref.type === 'CONNECTOR') {
          // Step each on-canvas labels[] entry from its own size. (Formerly
          // wrote the dead nameLabelFontSize — nothing rendered it since the
          // ADR 0032 decouple, so the nudge was an invisible no-op; ADR 0034.)
          const labels =
            currentView.connectors?.find((c) => c.id === ref.id)?.labels ?? [];
          if (labels.length === 0) return;
          applyConnector(ref.id, {
            labels: labels.map((l) => ({
              ...l,
              fontSize: clampNum(
                (l.fontSize ?? LABEL_BASE_FONT_PX) + delta,
                LABEL_SIZE_MIN,
                LABEL_SIZE_MAX
              )
            }))
          });
        }
      });
    });
  };

  // O3 (ADR 0034, resolved 2026-07-03): text colour also works on a MIXED
  // label-bearing selection — same targets/transaction as the size stepper
  // (node labelColor / floating-Label color / each connector labels[] entry).
  const crossTypeColorOnly = !sel && !!crossTypeLabelIds;
  const applyCrossTypeTextColor = (color: string | undefined) => {
    if (!crossTypeLabelIds) return;
    transaction(() => {
      crossTypeLabelIds.forEach((ref) => {
        if (ref.type === 'ITEM') {
          applyViewItem(ref.id, { labelColor: color });
        } else if (ref.type === 'LABEL') {
          applyLabel(ref.id, { color });
        } else if (ref.type === 'CONNECTOR') {
          const labels =
            currentView.connectors?.find((c) => c.id === ref.id)?.labels ?? [];
          if (labels.length === 0) return;
          applyConnector(ref.id, {
            labels: labels.map((l) => ({ ...l, labelColor: color }))
          });
        }
      });
    });
  };
  const textColorEnabled =
    Boolean(node || textBox || label || activeLabel) || crossTypeColorOnly;
  const textColorValue = node
    ? node.labelColor
    : textBox
    ? liveEditing && typeof liveFormats.color === 'string'
      ? (liveFormats.color as string)
      : textBox.color
    : label
    ? label.color
    : activeLabel?.labelColor;
  const onTextColorChange = (color: string | undefined) => {
    if (node) updateViewItem(node.id, { labelColor: color });
    else if (textBox) {
      // Dual-scope (ADR 0034 §2, extended to color 2026-07-04): while editing
      // with a text range, color that RANGE as an inline style. The picker
      // lives in a popover, so the editor has lost focus — use the bridge's
      // lastRange (quill.getSelection() is null), like the Link range mode.
      if (liveEditing) {
        const handle = getTextBoxEditor();
        const range = handle && getEffectiveEditorRange(handle);
        if (handle && range && range.length > 0) {
          handle.quill.formatText(
            range.index,
            range.length,
            'color',
            color ?? false
          );
          handle.markChanged();
          return;
        }
      }
      // No range (or not editing): the element-level base color, as before.
      updateTextBox(textBox.id, { color });
    } else if (label) updateLabel(label.id, { color });
    else if (activeLabel) updateActiveLabel({ labelColor: color });
    else if (crossTypeColorOnly) applyCrossTypeTextColor(color);
  };

  // --- Text size. Every LABEL type (node / floating / connector) now shares one
  // px range (LABEL_SIZE_MIN..MAX) so the control is consistent; the text box
  // keeps its zoom-scale range (0.15–0.9) since its size is tile-space, not
  // screen-px chrome.
  const textSize: {
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
  } | null = node
    ? {
        value: node.labelFontSize ?? LABEL_BASE_FONT_PX,
        min: LABEL_SIZE_MIN,
        max: LABEL_SIZE_MAX,
        step: LABEL_SIZE_STEP,
        onChange: (v) => updateViewItem(node.id, { labelFontSize: v })
      }
    : textBox
    ? {
        // Display default = the CREATION default (0.6), not the range floor —
        // a box that never had fontSize set renders at 0.6 (catalog I-15/I-x).
        value: textBox.fontSize ?? TEXTBOX_DEFAULTS.fontSize,
        min: 0.15,
        max: 0.9,
        // 0.05 native step ≈ the same effective granularity as the label px
        // range, so the shared % slider doesn't snap in 20% jumps (I-15).
        step: 0.05,
        onChange: (v) => updateTextBox(textBox.id, { fontSize: v })
      }
    : label
    ? {
        value: label.fontSize ?? LABEL_BASE_FONT_PX,
        min: LABEL_SIZE_MIN,
        max: LABEL_SIZE_MAX,
        step: LABEL_SIZE_STEP,
        onChange: (v) => updateLabel(label.id, { fontSize: v })
      }
    : activeLabel
    ? {
        value: activeLabel.fontSize ?? LABEL_BASE_FONT_PX,
        min: LABEL_SIZE_MIN,
        max: LABEL_SIZE_MAX,
        step: LABEL_SIZE_STEP,
        onChange: (v) => updateActiveLabel({ fontSize: v })
      }
    : null;

  // --- Bold / italic / underline / strikethrough — ONE cluster, TWO scopes
  // (ADR 0034 §2). Label types keep their element-level boolean quads (O1
  // resolved 2026-07-03: underline fields landed for all three label types); a
  // text box formats through its content HTML — the whole content when merely
  // selected (bulk-aware), the live caret/range while being edited on canvas.
  // --- STYL-08 ruling (owner 2026-07-30): every ABSOLUTE control asks the whole
  // selection and reports "Mixed" when its members disagree. One place, so a new
  // control cannot quietly go back to displaying `bulk.ids[0]`'s value.
  const textColorMixed = node
    ? sharedOf('ITEM', (m) => m.labelColor).mixed
    : label
    ? sharedOf('LABEL', (m) => m.color).mixed
    : textBox && !liveEditing
    ? sharedOf('TEXTBOX', (m) => m.color).mixed
    : false;
  const textSizeMixed = node
    ? sharedOf('ITEM', (m) => m.labelFontSize ?? LABEL_BASE_FONT_PX).mixed
    : label
    ? sharedOf('LABEL', (m) => m.fontSize ?? LABEL_BASE_FONT_PX).mixed
    : textBox
    ? sharedOf('TEXTBOX', (m) => m.fontSize ?? TEXTBOX_DEFAULTS.fontSize).mixed
    : false;
  const lineHeightMixed = sharedOf(
    'TEXTBOX',
    (m) => m.lineHeight ?? TEXTBOX_LINE_HEIGHT
  ).mixed;
  const backgroundMixed = rectangle
    ? sharedOf('RECTANGLE', (m) => `${m.customColor ?? ''}|${m.color ?? ''}`)
        .mixed
    : label
    ? sharedOf('LABEL', (m) => m.backgroundColor).mixed
    : textBox
    ? sharedOf('TEXTBOX', (m) => m.backgroundColor).mixed
    : false;
  const backgroundOpacityMixed = rectangle
    ? sharedOf('RECTANGLE', (m) => m.fillOpacity ?? 1).mixed
    : label
    ? sharedOf('LABEL', (m) => m.backgroundOpacity ?? 1).mixed
    : false;
  const borderType = rectangle ? 'RECTANGLE' : 'TEXTBOX';
  const borderColorMixed = sharedOf(borderType, (m) => m.borderColor).mixed;
  const borderStyleMixed = sharedOf(
    borderType,
    (m) => m.borderStyle ?? 'SOLID'
  ).mixed;
  const borderWidthMixed = sharedOf(borderType, (m) => m.borderWidth ?? 2).mixed;
  const borderOpacityMixed = sharedOf(borderType, (m) => m.borderOpacity ?? 1)
    .mixed;

  const formatEnabled = Boolean(node || label || activeLabel || textBox);

  // STYL-01/02/06/08 (owner ruling 2026-07-30). The pressed state is derived
  // from the WHOLE selection — `all` → on, `none` → off, anything else → mixed
  // — instead of from `bulk.ids[0]`. A press then applies to everyone unless
  // everyone already has the format (`nextToggleValue`), so the arbitrary
  // representative no longer decides either the display or the direction.
  const formatStates: Record<FormatName, TriState> = useMemo(() => {
    const fromMembers = <T,>(
      ids: string[],
      resolve: (id: string) => T | undefined,
      read: (m: T) => Record<FormatName, boolean>
    ): Record<FormatName, TriState> => {
      const members = ids
        .map(resolve)
        .filter((m): m is T => m !== undefined && m !== null)
        .map(read);
      return {
        bold: deriveTriState(members.map((m) => m.bold)),
        italic: deriveTriState(members.map((m) => m.italic)),
        underline: deriveTriState(members.map((m) => m.underline)),
        strike: deriveTriState(members.map((m) => m.strike))
      };
    };
    if (node) {
      return fromMembers(
        targetIdsFor('ITEM'),
        (id) => currentView.items?.find((i) => i.id === id),
        (m) =>
          readFormatFields(
            VIEW_ITEM_FORMAT_FIELDS,
            m as unknown as Record<string, unknown>
          )
      );
    }
    if (label) {
      return fromMembers(
        targetIdsFor('LABEL'),
        (id) => currentView.labels?.find((l) => l.id === id),
        (m) =>
          readFormatFields(
            LABEL_FORMAT_FIELDS,
            m as unknown as Record<string, unknown>
          )
      );
    }
    if (activeLabel) {
      // One connector label, explicitly clicked on canvas — never a bulk.
      const read = readFormatFields(
        CONNECTOR_LABEL_FORMAT_FIELDS,
        activeLabel as unknown as Record<string, unknown>
      );
      return {
        bold: read.bold ? 'on' : 'off',
        italic: read.italic ? 'on' : 'off',
        underline: read.underline ? 'on' : 'off',
        strike: read.strike ? 'on' : 'off'
      };
    }
    if (textBox) {
      if (liveEditing) {
        // The live caret/range is a single scope — Quill already reports its
        // own mixed state as "not true", which stays the honest reading.
        return {
          bold: liveFormats.bold === true ? 'on' : 'off',
          italic: liveFormats.italic === true ? 'on' : 'off',
          underline: liveFormats.underline === true ? 'on' : 'off',
          strike: liveFormats.strike === true ? 'on' : 'off'
        };
      }
      return fromMembers(
        targetIdsFor('TEXTBOX'),
        (id) => currentView.textBoxes?.find((t) => t.id === id),
        (m) => {
          const f = getWholeContentFormats(m.content);
          return {
            bold: f.bold,
            italic: f.italic,
            underline: f.underline,
            strike: f.strike
          };
        }
      );
    }
    return { bold: 'off', italic: 'off', underline: 'off', strike: 'off' };
  }, [
    node,
    label,
    activeLabel,
    textBox,
    liveEditing,
    liveFormats,
    currentView,
    targetIdsFor
  ]);

  const formatValue: Record<FormatName, boolean> = {
    bold: formatStates.bold === 'on',
    italic: formatStates.italic === 'on',
    underline: formatStates.underline === 'on',
    strike: formatStates.strike === 'on'
  };
  const formatMixed: Record<FormatName, boolean> = {
    bold: formatStates.bold === 'mixed',
    italic: formatStates.italic === 'mixed',
    underline: formatStates.underline === 'mixed',
    strike: formatStates.strike === 'mixed'
  };

  // Toggle ONE format. STYL-01: the patch carries exactly the pressed field —
  // `formatFieldPatch` is the only writer shape, so a press can no longer
  // overwrite the other three formats on every member of a bulk.
  const toggleFormat = (name: FormatName) => {
    const next = nextToggleValue(formatStates[name]);
    if (textBox) {
      if (liveEditing) {
        const handle = getTextBoxEditor();
        if (handle?.quill) {
          handle.quill.format(name, next);
          handle.markChanged();
        }
        return;
      }
      applyToTargets('TEXTBOX', (tid) => {
        const target = currentView.textBoxes?.find((t) => t.id === tid);
        if (!target) return;
        applyTextBox(tid, {
          content: applyInlineFormat(target.content, name, next)
        });
      });
      return;
    }
    if (node)
      updateViewItem(
        node.id,
        formatFieldPatch(VIEW_ITEM_FORMAT_FIELDS, name, next) as Parameters<
          typeof updateViewItem
        >[1]
      );
    else if (label)
      updateLabel(
        label.id,
        formatFieldPatch(LABEL_FORMAT_FIELDS, name, next) as Parameters<
          typeof updateLabel
        >[1]
      );
    else if (activeLabel)
      updateActiveLabel(
        formatFieldPatch(
          CONNECTOR_LABEL_FORMAT_FIELDS,
          name,
          next
        ) as Partial<(typeof connectorLabels)[number]>
      );
  };

  // --- Lists (text box only, ADR 0034 §3): whole content when selected, the
  // current block(s) while editing. Toggling the active type removes the list.
  const listValue: ListType | null = textBox
    ? liveEditing
      ? ((liveFormats.list as ListType | undefined) ?? null)
      : wholeFormats.list
    : null;
  const toggleList = (type: ListType) => {
    if (!textBox) return;
    if (liveEditing) {
      const handle = getTextBoxEditor();
      if (handle?.quill) {
        handle.quill.format('list', listValue === type ? false : type);
        handle.markChanged();
      }
      return;
    }
    const on = listValue !== type;
    applyToTargets('TEXTBOX', (tid) => {
      const target = currentView.textBoxes?.find((t) => t.id === tid);
      if (!target) return;
      applyTextBox(tid, { content: applyListFormat(target.content, type, on) });
    });
  };

  // --- Alignment (text box only, ADR 0034 addenda 2026-07-03/04): ONE
  // Lucid-style control packing horizontal × vertical into a 3×3 grid.
  // Horizontal is dual-scope like lists (whole content selected, the current
  // paragraph(s) while editing); vertical is element-level (`verticalAlign`,
  // absent = top) — it positions the content inside the box footprint, which
  // only a manual height makes visible. 'left'/'top' are the defaults and are
  // stored as absent.
  const alignValue: TextAlign | null = textBox
    ? liveEditing
      ? typeof liveFormats.align === 'string'
        ? (liveFormats.align as TextAlign)
        : liveFormats.align == null
        ? 'left'
        : null // mixed selection (quill reports an array)
      : wholeFormats.align
    : null;
  const verticalAlignValue: VerticalAlign = textBox?.verticalAlign ?? 'top';
  // The two axes apply independently (2026-07-04 re-cut): the old 3×3 cell
  // wrote both on every click, which coupled a paragraph-scope range format
  // to an element-level field. Horizontal keeps the dual-scope contract.
  const applyHorizontalAlign = (h: TextAlign) => {
    if (!textBox) return;
    if (liveEditing) {
      // The row lives in a popover, so the editor has lost focus — align the
      // last selection's line(s) via the bridge range (getSelection is null),
      // same pattern as the range color/Link writes.
      const handle = getTextBoxEditor();
      const range = handle && getEffectiveEditorRange(handle);
      if (handle && range) {
        handle.quill.formatLine(
          range.index,
          Math.max(range.length, 1),
          'align',
          h === 'left' ? false : h
        );
        handle.markChanged();
      }
      return;
    }
    applyToTargets('TEXTBOX', (tid) => {
      const target = currentView.textBoxes?.find((t) => t.id === tid);
      if (!target) return;
      applyTextBox(tid, { content: applyAlignFormat(target.content, h) });
    });
  };
  const applyVerticalAlign = (v: VerticalAlign) => {
    if (!textBox) return;
    const patch = { verticalAlign: v === 'top' ? undefined : v } as const;
    if (liveEditing) {
      applyTextBox(textBox.id, patch);
      return;
    }
    applyToTargets('TEXTBOX', (tid) => applyTextBox(tid, patch));
  };

  // --- Connector style target. The connection-colour + line-options controls
  // operate on the selected connector, or — when the connector tool is armed
  // with nothing selected — on the pending defaults the next drawn connector
  // inherits. This is what makes the controls usable BEFORE drawing.
  const connectorToolActive = mode.type === 'CONNECTOR';
  // O6 (ADR 0034, resolved 2026-07-03): while a NON-connector creation tool is
  // armed, the style controls are disabled by selection-gating — but "Select a
  // rectangle…" advice mid-draw reads as a non-sequitur. Every disabled tooltip
  // swaps to neutral copy naming the actual recipe (place first, then style).
  // The connector tool keeps its live pre-draw controls + tooltips below.
  const creationToolArmed =
    mode.type === 'RECTANGLE.DRAW' ||
    mode.type === 'TEXTBOX' ||
    mode.type === 'LABEL' ||
    mode.type === 'PLACE_ICON';
  const disabledTip = (key: Parameters<typeof t>[0]) =>
    creationToolArmed ? t('armedToolPlaceFirst') : t(key);
  // Discoverability (owner 2026-07-01): when the connector tool is armed with
  // nothing selected, the color/line controls already edit the PRE-DRAW
  // defaults — but testers didn't notice. Flag that state to add an accent-ring
  // hint + "next connection" wording so the pre-styling affordance is visible.
  const connectorArmed = connectorToolActive && !connector;
  const connStyle = connector
    ? {
        color: connector.color,
        customColor: connector.customColor,
        style: connector.style,
        lineType: connector.lineType,
        width: connector.width,
        showArrow: connector.showArrow,
        apply: (patch: Parameters<typeof setConnectorDefaults>[0]) =>
          updateConnector(connector.id, patch)
      }
    : connectorToolActive
    ? {
        color: connectorDefaults.color,
        customColor: connectorDefaults.customColor,
        style: connectorDefaults.style,
        lineType: connectorDefaults.lineType,
        width: connectorDefaults.width,
        showArrow: connectorDefaults.showArrow,
        apply: setConnectorDefaults
      }
    : null;

  // --- Link (owner 2026-07-01 + ADR 0034): set/clear an external link straight
  // from the strip. Node → modelItem.headerLink (bulk now fans out in one
  // transaction — previously the raw writer silently hit only the
  // representative). When a specific connector label is selected on canvas, the
  // Link targets THAT label's headerLink; with the connector itself selected
  // (no label), the whole-connector link. Text box: the link is per-character —
  // while EDITING with a text selection the control wraps that range as an
  // inline link; a merely-selected box gets a disabled tooltip naming the
  // recipe.
  const linkTextRangeActive = liveEditing && liveRangeLength > 0;
  const linkEnabled =
    Boolean(node || connector || label) || linkTextRangeActive;
  const linkValue = linkTextRangeActive
    ? typeof liveFormats.link === 'string'
      ? (liveFormats.link as string)
      : ''
    : node
    ? modelItem?.headerLink
    : activeLabel
    ? activeLabel.headerLink
    : connector
    ? connector.headerLink
    : label
    ? label.headerLink
    : undefined;
  const onLinkChange = (raw: string) => {
    const next = raw.trim() || undefined;
    if (linkTextRangeActive) {
      const handle = getTextBoxEditor();
      const range = handle?.lastRange;
      if (handle && range && range.length > 0) {
        // Docs-style URL forgiveness for TEXT links ("google.com" works);
        // element headerLinks below keep their raw semantics.
        const normalized = next ? normalizeWebLinkUrl(next) : null;
        handle.quill.formatText(
          range.index,
          range.length,
          'link',
          normalized ?? false
        );
        handle.markChanged();
      }
      return;
    }
    if (node)
      applyToTargets('ITEM', (tid) =>
        updateModelItem(tid, { headerLink: next })
      );
    else if (activeLabel) updateActiveLabel({ headerLink: next });
    else if (connector) updateConnector(connector.id, { headerLink: next });
    else if (label) updateLabel(label.id, { headerLink: next });
  };
  // Ctrl/Cmd+K for the SELECTED item (node / connector / Label headerLink) —
  // the editing-session path lives in the canvas editor's own Quill binding
  // (quillLinkShortcut.ts; its stopPropagation keeps those keys off window),
  // and the deck editors keep Quill snow's native Ctrl+K. Bubble phase +
  // typing-surface guard so rename inputs and deck fields always win.
  const linkShortcutEnabledRef = useRef(false);
  linkShortcutEnabledRef.current = linkEnabled;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== 'k' ||
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        e.shiftKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!linkShortcutEnabledRef.current) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(OPEN_LINK_POPOVER_EVENT));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- Show / hide the on-canvas label(s). Nodes: viewItem.showLabel.
  // Connectors: connector.showLabel gates ALL of that connector's label chips
  // (schema'd + rendered + Layers-toggleable, but previously unreachable from
  // the strip — catalog I-8). Bulk-aware (both writers fan out).
  const labelHidden = node
    ? node.showLabel === false
    : connector
    ? connector.showLabel === false
    : false;
  const showHideEnabled = Boolean(node || connector);
  const onToggleShowLabel = () => {
    if (node)
      updateViewItem(node.id, { showLabel: labelHidden ? undefined : false });
    else if (connector)
      updateConnector(connector.id, {
        showLabel: labelHidden ? undefined : false
      });
  };

  return (
    <Box
      // The on-canvas editor's click-away contract allowlists the strip (and
      // its popovers) so formatting doesn't end the edit session (ADR 0034 §1).
      data-axoview-strip="true"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        flexShrink: 0
      }}
    >
      {/* Text colour */}
      <StripButton
        tooltip={
          textColorEnabled
            ? crossTypeColorOnly
              ? t('textColorAllSelected')
              : t('textColor')
            : disabledTip('textColorDisabled')
        }
        disabled={!textColorEnabled}
        icon={<TextColorIcon sx={{ fontSize: 18 }} />}
        colorBar={textColorValue || '#000000'}
        colorBarMixed={textColorMixed}
      >
        {/* Text colour has no Transparent option (text must have a colour).
            Black is the default, stored as absent — so map #000000 → undefined
            to keep storage clean while the grid's black cell stays active. */}
        <ColorPickerBody
          value={textColorValue || '#000000'}
          onChange={(hex) =>
            onTextColorChange(
              hex.toLowerCase() === '#000000' ? undefined : hex
            )
          }
        />
      </StripButton>

      {/* Text size */}
      <StripButton
        tooltip={
          textSize
            ? t('textSize')
            : crossTypeLabelIds
            ? t('labelSizeAllSelected')
            : disabledTip('textSizeDisabled')
        }
        disabled={!textSize && !crossTypeLabelIds}
        popoverWidth={220}
        testId="strip-text-size"
        icon={<TextSizeIcon sx={{ fontSize: 18 }} />}
      >
        {/* Cross-type mixed selection (e.g. node + connection): no shared
            absolute scale, so offer just the relative +/- label-size stepper
            that bumps each selected item's own label size together. */}
        {!textSize && crossTypeLabelIds && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1
            }}
          >
            <Tooltip title={t('decreaseLabelSize')}>
              <IconButton
                size="small"
                data-testid="crosstype-font-decrease"
                onClick={() => nudgeCrossTypeLabelSize(-2)}
              >
                <RemoveIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              {t('labelSize')}
            </Typography>
            <Tooltip title={t('increaseLabelSize')}>
              <IconButton
                size="small"
                data-testid="crosstype-font-increase"
                onClick={() => nudgeCrossTypeLabelSize(2)}
              >
                <AddIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        {textSize && (
          <Box>
            <PercentSizeSlider
              value={textSize.value}
              min={textSize.min}
              max={textSize.max}
              step={textSize.step}
              mixed={textSizeMixed}
              onChange={textSize.onChange}
            />
            {/* Line spacing (text box only — the multi-line rich surface).
                Lucid-style multiplier on the box's content line-height
                (ADR 0034 addendum 2026-07-03); default 1.2, absent when
                untouched. Lives with Text size like Lucid groups its line
                spacing inside the text dropdown — no extra bar slot. */}
            {textBox && (
              <Box sx={{ mt: 1.5 }} data-testid="strip-line-spacing">
                <LabeledSlider
                  label={t('lineSpacing')}
                  value={textBox.lineHeight ?? TEXTBOX_LINE_HEIGHT}
                  displayValue={`${(
                    textBox.lineHeight ?? TEXTBOX_LINE_HEIGHT
                  ).toFixed(1)}×`}
                  min={0.8}
                  max={2.5}
                  step={0.1}
                  mixed={lineHeightMixed}
                  onChange={(v) =>
                    updateTextBox(textBox.id, {
                      lineHeight: Number(v.toFixed(2))
                    })
                  }
                />
              </Box>
            )}
            {/* #11: relative +/- stepper for node-label / floating-Label px
                sizes — bumps each selected target from its own size (preserving
                relative differences across a multi-selection). */}
            {hasLabelSizeTarget && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mt: 1
                }}
              >
                <Tooltip title={t('decreaseSize')}>
                  <IconButton
                    size="small"
                    data-testid="bulk-font-decrease"
                    onClick={() => nudgeFontSize(-2)}
                  >
                    <RemoveIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Typography variant="caption" color="text.secondary">
                  {isBulk ? t('stepAll') : t('size')}
                </Typography>
                <Tooltip title={t('increaseSize')}>
                  <IconButton
                    size="small"
                    data-testid="bulk-font-increase"
                    onClick={() => nudgeFontSize(2)}
                  >
                    <AddIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        )}
      </StripButton>

      {/* Bold / italic / underline / strikethrough — one cluster, two scopes
          (ADR 0034 §2): element-level booleans for label types; content HTML
          for a text box (whole content selected / live range while editing).
          Each button toggles independently; mousedown is swallowed so the
          on-canvas editor's selection survives the press. */}
      <Tooltip
        title={
          formatEnabled
            ? t('format')
            : disabledTip('formatDisabled')
        }
        placement="bottom"
      >
        <span>
          <ToggleButtonGroup
            size="small"
            sx={{
              '& .MuiSvgIcon-root': { color: 'inherit' },
              '& .MuiToggleButton-root': { color: 'text.primary', px: 0.75 },
              '& .MuiToggleButton-root.Mui-disabled': { color: 'action.disabled' }
            }}
          >
            {(
              [
                ['bold', BoldIcon, 'bold'],
                ['italic', ItalicIcon, 'italic'],
                ['underline', UnderlineIcon, 'underline'],
                ['strike', StrikethroughIcon, 'strikethrough']
              ] as const
            ).map(([name, Icon, labelKey]) => (
              <ToggleButton
                key={name}
                value={name}
                disabled={!formatEnabled}
                selected={formatEnabled && formatValue[name]}
                onMouseDown={keepEditorSelection}
                onClick={() => formatEnabled && toggleFormat(name)}
                aria-label={t(labelKey)}
                // STYL-02: a mixed bulk is INDETERMINATE, not "on". ARIA has a
                // third pressed value for exactly this; the dashed outline is
                // its visual (MUI's ToggleButton has no mixed variant).
                {...(formatEnabled && formatMixed[name]
                  ? { 'aria-pressed': 'mixed' as const }
                  : {})}
                sx={
                  formatEnabled && formatMixed[name]
                    ? {
                        bgcolor: 'action.hover',
                        outline: (theme) =>
                          `1px dashed ${theme.palette.text.secondary}`,
                        outlineOffset: '-3px'
                      }
                    : undefined
                }
              >
                <Icon sx={{ fontSize: 18 }} />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </span>
      </Tooltip>

      {/* Lists (text box only) — bulleted / numbered; whole content when
          selected, the current block(s) while editing (ADR 0034 §3). */}
      <Tooltip
        title={textBox ? t('lists') : disabledTip('listsDisabled')}
        placement="bottom"
      >
        <span>
          <ToggleButtonGroup
            size="small"
            sx={{
              '& .MuiSvgIcon-root': { color: 'inherit' },
              '& .MuiToggleButton-root': { color: 'text.primary', px: 0.75 },
              '& .MuiToggleButton-root.Mui-disabled': { color: 'action.disabled' }
            }}
          >
            <ToggleButton
              value="bullet"
              disabled={!textBox}
              selected={listValue === 'bullet'}
              onMouseDown={keepEditorSelection}
              onClick={() => toggleList('bullet')}
              data-testid="strip-list-bullet"
              aria-label={t('bulletList')}
            >
              <BulletListIcon sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton
              value="ordered"
              disabled={!textBox}
              selected={listValue === 'ordered'}
              onMouseDown={keepEditorSelection}
              onClick={() => toggleList('ordered')}
              data-testid="strip-list-ordered"
              aria-label={t('numberedList')}
            >
              <NumberedListIcon sx={{ fontSize: 18 }} />
            </ToggleButton>
          </ToggleButtonGroup>
        </span>
      </Tooltip>

      {/* Alignment (text box only) — ONE control: horizontal (dual-scope
          content align) over vertical (element-level verticalAlign, visible
          with a manual height). Standard MUI glyphs (ADR 0034 addendum,
          re-cut 2026-07-04). Defaults (left/top) are stored as absent. */}
      <StripButton
        tooltip={
          textBox ? t('alignment') : disabledTip('alignmentDisabled')
        }
        disabled={!textBox}
        popoverWidth={140}
        testId="strip-alignment"
        icon={
          alignValue === 'center' ? (
            <AlignCenterIcon sx={{ fontSize: 18 }} />
          ) : alignValue === 'right' ? (
            <AlignRightIcon sx={{ fontSize: 18 }} />
          ) : (
            <AlignLeftIcon sx={{ fontSize: 18 }} />
          )
        }
      >
        <Stack spacing={0.5}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={alignValue}
            sx={{ '& .MuiToggleButton-root': { color: 'text.primary', px: 1 } }}
          >
            {(
              [
                ['left', AlignLeftIcon, 'alignLeft'],
                ['center', AlignCenterIcon, 'alignCenter'],
                ['right', AlignRightIcon, 'alignRight']
              ] as const
            ).map(([h, Icon, key]) => (
              // No per-button Tooltip (matches the lists/direction groups):
              // inside the tight popover a hover tooltip lingers over the row
              // below and swallows its clicks. aria-labels carry the names.
              <ToggleButton
                key={h}
                value={h}
                onClick={() => applyHorizontalAlign(h)}
                data-testid={`strip-align-h-${h}`}
                aria-label={t(key)}
              >
                <Icon sx={{ fontSize: 18 }} />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={verticalAlignValue}
            sx={{ '& .MuiToggleButton-root': { color: 'text.primary', px: 1 } }}
          >
            {(
              [
                ['top', AlignTopIcon, 'alignTop'],
                ['middle', AlignMiddleIcon, 'alignMiddle'],
                ['bottom', AlignBottomIcon, 'alignBottom']
              ] as const
            ).map(([v, Icon, key]) => (
              <ToggleButton
                key={v}
                value={v}
                onClick={() => applyVerticalAlign(v)}
                data-testid={`strip-align-v-${v}`}
                aria-label={t(key)}
              >
                <Icon sx={{ fontSize: 18 }} />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
      </StripButton>

      {/* Text direction moved OUT of the strip (owner 2026-07-04, "de-dense
          the top control"): the on-canvas rotate handle next to the transform
          controls owns the quarter-turn now (TextBox = iso-plane flip,
          Rectangle = footprint transpose) — see TransformControls. */}

      {/* Background colour — rectangle fill, a floating Label chip (ADR 0031),
          or a text-box fill (ADR 0034 addendum 2026-07-04). Clearing it
          removes the fill (and resets a label chip to white). */}
      <StripButton
        tooltip={
          rectangle || label || textBox
            ? t('background')
            : disabledTip('backgroundDisabled')
        }
        disabled={!rectangle && !label && !textBox}
        icon={<FillIcon sx={{ fontSize: 18 }} />}
        colorBar={
          rectangle
            ? resolveHex(rectangle.color, rectangle.customColor)
            : label
            ? label.backgroundColor || '#ffffff'
            : textBox
            ? textBox.backgroundColor || '#ffffff'
            : undefined
        }
        colorBarMixed={backgroundMixed}
      >
        {rectangle ? (
          <ColorPickerBody
            value={resolveHex(rectangle.color, rectangle.customColor)}
            onChange={(hex) =>
              // Clearing the legacy preset alongside the custom colour keeps ONE
              // source of truth for the fill (ADR 0039 addendum, STYL-03/04).
              updateRectangle(rectangle.id, {
                customColor: hex,
                color: undefined
              })
            }
            allowNoColor
            // STYL-03 ruling: "no colour" is an ABSENT fill everywhere,
            // including the rectangle — the `'transparent'` sentinel stays
            // READABLE for diagrams already carrying it but is never written
            // again. Both fields go, or the dormant preset would repaint.
            onNoColor={() =>
              updateRectangle(rectangle.id, {
                customColor: undefined,
                color: undefined
              })
            }
          />
        ) : label ? (
          <ColorPickerBody
            value={label.backgroundColor}
            onChange={(hex) =>
              updateLabel(label.id, { backgroundColor: hex })
            }
            allowNoColor
            onNoColor={() =>
              updateLabel(label.id, { backgroundColor: undefined })
            }
          />
        ) : textBox ? (
          <ColorPickerBody
            value={textBox.backgroundColor}
            onChange={(hex) =>
              updateTextBox(textBox.id, { backgroundColor: hex })
            }
            allowNoColor
            onNoColor={() =>
              updateTextBox(textBox.id, { backgroundColor: undefined })
            }
          />
        ) : null}
        {rectangle ? (
          <Box sx={{ mt: 1.5 }}>
            <LabeledSlider
              label={t('opacity')}
              value={rectangle.fillOpacity ?? 1}
              displayValue={`${Math.round((rectangle.fillOpacity ?? 1) * 100)}%`}
              min={0}
              max={1}
              step={0.1}
              mixed={backgroundOpacityMixed}
              onChange={(v) =>
                updateRectangle(rectangle.id, {
                  fillOpacity: v >= 1 ? undefined : v
                })
              }
            />
          </Box>
        ) : label ? (
          <Box sx={{ mt: 1.5 }}>
            <LabeledSlider
              label={t('opacity')}
              value={label.backgroundOpacity ?? 1}
              displayValue={`${Math.round((label.backgroundOpacity ?? 1) * 100)}%`}
              min={0}
              max={1}
              step={0.1}
              mixed={backgroundOpacityMixed}
              onChange={(v) =>
                updateLabel(label.id, {
                  backgroundOpacity: v >= 1 ? undefined : v
                })
              }
            />
          </Box>
        ) : null}
      </StripButton>

      {/* Border — line style + width + colour + opacity for the frame of a
          rectangle OR a text box (ADR 0034 addendum 2026-07-04; same option
          set). Rectangle: absent color = the legacy derived stroke. Text box:
          absent color = NO border, so picking a style/width first seeds a
          default color to make the change visible. */}
      <StripButton
        tooltip={
          rectangle || textBox ? t('border') : disabledTip('borderDisabled')
        }
        disabled={!(rectangle || textBox)}
        popoverWidth={240}
        testId="strip-border-button"
        icon={<BorderIcon sx={{ fontSize: 18 }} />}
        colorBar={
          rectangle
            ? rectangle.borderColor || undefined
            : textBox
            ? textBox.borderColor || undefined
            : undefined
        }
        colorBarMixed={borderColorMixed}
      >
        {textBox && !rectangle && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {t('lineStyle')}
            </Typography>
            <ToggleButtonGroup
              // STYL-08: a bulk whose members carry different styles selects
              // nothing rather than lighting up the first member's.
              value={borderStyleMixed ? null : textBox.borderStyle || 'SOLID'}
              exclusive
              fullWidth
              size="small"
              onChange={(_e, style: LineStyle | null) => {
                if (!style) return;
                updateTextBoxBorder({ borderStyle: style });
              }}
            >
              {connectorStyleOptions.map((style) => (
                <ToggleButton
                  key={style}
                  value={style}
                  aria-label={style}
                  data-testid={`strip-border-style-${style}`}
                >
                  <LineStylePreview style={style} />
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ mt: 1.5 }}>
              <LabeledSlider
                label={t('width')}
                value={textBox.borderWidth ?? 2}
                displayValue={String(textBox.borderWidth ?? 2)}
                min={2}
                max={30}
                step={4}
                mixed={borderWidthMixed}
                onChange={(borderWidth) => updateTextBoxBorder({ borderWidth })}
              />
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.5, mb: 0.5 }}
            >
              {t('borderColor')}
            </Typography>
            <ColorPickerBody
              value={textBox.borderColor}
              onChange={(hex) =>
                updateTextBox(textBox.id, { borderColor: hex })
              }
              // A text box with no borderColor has NO border — clearing the
              // color IS the "no border" affordance.
              allowNoColor
              absentIsNoColor
              onNoColor={() =>
                updateTextBox(textBox.id, { borderColor: undefined })
              }
            />

            <Box sx={{ mt: 1.5 }}>
              <LabeledSlider
                label={t('opacity')}
                value={textBox.borderOpacity ?? 1}
                displayValue={`${Math.round((textBox.borderOpacity ?? 1) * 100)}%`}
                min={0}
                max={1}
                step={0.1}
                mixed={borderOpacityMixed}
                // STYL-05: the third writer in this popover used to skip the
                // seed its two siblings carry, so the slider moved and nothing
                // rendered (borderCss needs a colour) while the value was
                // stored anyway. It goes through the same seeded writer now, so
                // a fourth control cannot miss it.
                onChange={(v) =>
                  updateTextBoxBorder({ borderOpacity: v >= 1 ? undefined : v })
                }
              />
            </Box>
          </Box>
        )}
        {rectangle && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {t('lineStyle')}
            </Typography>
            <ToggleButtonGroup
              value={borderStyleMixed ? null : rectangle.borderStyle || 'SOLID'}
              exclusive
              fullWidth
              size="small"
              onChange={(_e, style: LineStyle | null) => {
                if (!style) return;
                updateRectangle(rectangle.id, { borderStyle: style });
              }}
            >
              {connectorStyleOptions.map((style) => (
                <ToggleButton key={style} value={style} aria-label={style}>
                  <LineStylePreview style={style} />
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ mt: 1.5 }}>
              <LabeledSlider
                label={t('width')}
                value={rectangle.borderWidth ?? 2}
                displayValue={String(rectangle.borderWidth ?? 2)}
                min={2}
                max={30}
                step={4}
                mixed={borderWidthMixed}
                onChange={(borderWidth) =>
                  updateRectangle(rectangle.id, { borderWidth })
                }
              />
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.5, mb: 0.5 }}
            >
              {t('borderColor')}
            </Typography>
            <ColorPickerBody
              value={rectangle.borderColor}
              onChange={(hex) =>
                updateRectangle(rectangle.id, { borderColor: hex })
              }
              allowNoColor
              // Absent borderColor renders a DERIVED stroke, not nothing — so an
              // unset border must not light up the No-color swatch.
              absentIsNoColor={false}
              onNoColor={() =>
                updateRectangle(rectangle.id, { borderColor: TRANSPARENT })
              }
            />

            <Box sx={{ mt: 1.5 }}>
              <LabeledSlider
                label={t('opacity')}
                value={rectangle.borderOpacity ?? 1}
                displayValue={`${Math.round((rectangle.borderOpacity ?? 1) * 100)}%`}
                min={0}
                max={1}
                step={0.1}
                mixed={borderOpacityMixed}
                onChange={(v) =>
                  updateRectangle(rectangle.id, {
                    borderOpacity: v >= 1 ? undefined : v
                  })
                }
              />
            </Box>
          </Box>
        )}
      </StripButton>

      {/* Link — the single Link surface (D2): a web URL for any node / connection
          / floating Label (headerLink), plus a "Link to diagram" picker for a
          node (modelItem.link) when other diagrams exist. Consolidated here from
          the node Details deck so both link kinds live in one place. */}
      <StripButton
        tooltip={
          linkTextRangeActive
            ? `${t('linkSelection')} (${LINK_SHORTCUT_HINT})`
            : linkEnabled
            ? `${t('link')} (${LINK_SHORTCUT_HINT})`
            : textBox
            ? t('linkDisabledTextBox')
            : disabledTip('linkDisabled')
        }
        disabled={!linkEnabled}
        popoverWidth={280}
        testId="strip-link-button"
        openEvent={OPEN_LINK_POPOVER_EVENT}
        closeEvent={CLOSE_LINK_POPOVER_EVENT}
        icon={<LinkStripIcon sx={{ fontSize: 18 }} />}
        colorBar={undefined}
      >
        {linkEnabled && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {t('linkToWeb')}
            </Typography>
            {linkTextRangeActive ? (
              // Range mode: local draft, applied on Enter/blur (see
              // LinkRangeUrlField). Mounts fresh on each popover open, seeded
              // from the format under the last editor selection.
              <LinkRangeUrlField
                initial={linkValue ?? ''}
                placeholder={t('webLinkPlaceholder')}
                onApply={onLinkChange}
                onCommit={() => {
                  // Docs closes the dialog on apply; the caret lands back in
                  // the linked text so the link card appears as confirmation.
                  const handle = getTextBoxEditor();
                  const range = handle && getEffectiveEditorRange(handle);
                  window.dispatchEvent(
                    new CustomEvent(CLOSE_LINK_POPOVER_EVENT)
                  );
                  requestAnimationFrame(() => {
                    if (!handle) return;
                    handle.quill.focus();
                    if (range) {
                      // One char INSIDE the link: at the exact start boundary
                      // getLeaf resolves to the preceding text node and the
                      // card would not recognise the caret as in-link.
                      handle.quill.setSelection(
                        range.index + (range.length > 0 ? 1 : 0),
                        0,
                        'user'
                      );
                    }
                  });
                }}
              />
            ) : (
              <TextField
                autoFocus
                fullWidth
                size="small"
                placeholder={t('webLinkPlaceholder')}
                value={linkValue ?? ''}
                onChange={(e) => onLinkChange(e.target.value)}
                onKeyDown={(e) => {
                  // Element mode writes live on change; Enter is the natural
                  // "confirm" gesture (owner 2026-07-05: users didn't know
                  // they had to click away) — close the popover on it.
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    window.dispatchEvent(
                      new CustomEvent(CLOSE_LINK_POPOVER_EVENT)
                    );
                  }
                }}
                data-axoview-id="strip-link-input"
              />
            )}

            {!isBulk && node && linkedDiagrams.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  {t('linkToDiagram')}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Autocomplete
                    size="small"
                    sx={{ flex: 1 }}
                    options={linkedDiagrams}
                    getOptionLabel={(opt) =>
                      typeof opt === 'string' ? opt : opt.name
                    }
                    isOptionEqualToValue={(opt, val) => opt.id === val.id}
                    value={
                      linkedDiagrams.find((d) => d.id === modelItem?.link) ?? null
                    }
                    onChange={(_e, newVal) =>
                      updateModelItem(node.id, { link: newVal?.id ?? undefined })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder={t('searchDiagrams')}
                        inputProps={{
                          ...params.inputProps,
                          'data-axoview-id': 'strip-link-diagram-picker'
                        }}
                      />
                    )}
                    slotProps={{
                      listbox: {
                        'data-axoview-id': 'strip-link-diagram-listbox'
                      } as React.ComponentProps<'ul'>
                    }}
                    clearOnEscape
                    handleHomeEndKeys={false}
                  />
                  {modelItem?.link && (
                    <Tooltip title={t('openLinkedDiagram')}>
                      <IconButton
                        size="small"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('axoview-open-diagram-in-editor', {
                              detail: { id: modelItem.link }
                            })
                          )
                        }
                        data-axoview-id="strip-link-diagram-open"
                      >
                        <OpenInNewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </StripButton>

      {/* Show / hide the on-canvas label(s) — inline toggle (no popover).
          Nodes hide their name label; connectors hide all their chips. */}
      <Tooltip
        title={
          showHideEnabled
            ? labelHidden
              ? t('showLabel')
              : t('hideLabel')
            : disabledTip('showHideLabelDisabled')
        }
        placement="bottom"
      >
        <span>
          <IconButton
            size="small"
            disabled={!showHideEnabled}
            onClick={onToggleShowLabel}
            data-testid="strip-toggle-label"
            sx={{
              borderRadius: 1,
              color: !showHideEnabled ? 'action.disabled' : 'text.primary',
              '& .MuiSvgIcon-root': { color: 'inherit' },
              px: 0.5,
              py: 0.25
            }}
          >
            {labelHidden ? (
              <HideLabelIcon sx={{ fontSize: 18 }} />
            ) : (
              <ShowLabelIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Change icon (node) — moved here from the node Details panel. Single
          only: an icon is a shared model asset, not a per-selection field. */}
      <StripButton
        tooltip={
          isBulk
            ? t('changeIconBulk')
            : node
            ? t('changeIcon')
            : disabledTip('changeIconDisabled')
        }
        disabled={!node || isBulk}
        popoverWidth={320}
        icon={
          currentIcon?.url ? (
            <Box
              component="img"
              src={currentIcon.url}
              sx={{ width: 18, height: 18, display: 'block', objectFit: 'contain' }}
            />
          ) : (
            <ChangeIconIcon sx={{ fontSize: 18 }} />
          )
        }
      >
        {node && (
          <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
            <QuickIconSelector
              currentIconId={modelItem?.icon}
              onIconSelected={(icon) => updateModelItem(node.id, { icon: icon.id })}
            />
          </Box>
        )}
      </StripButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Connection colour — the selected connector, or the next-connector
          default while the connector tool is armed. */}
      <StripButton
        tooltip={
          connectorArmed
            ? t('connectionColorPredraw')
            : connStyle
            ? t('connectionColor')
            : disabledTip('connectionColorDisabled')
        }
        highlight={connectorArmed}
        disabled={!connStyle}
        icon={<ConnectionColorIcon sx={{ fontSize: 18 }} />}
        colorBar={connStyle ? resolveHex(connStyle.color, connStyle.customColor) : undefined}
      >
        {connStyle && (
          <ColorPickerBody
            value={resolveHex(connStyle.color, connStyle.customColor)}
            onChange={(hex) => connStyle.apply({ customColor: hex })}
          />
        )}
      </StripButton>

      {/* Connection line options — style + type + width + arrow */}
      <StripButton
        tooltip={
          connectorArmed
            ? t('lineOptionsPredraw')
            : connStyle
            ? t('lineOptions')
            : disabledTip('lineOptionsDisabled')
        }
        highlight={connectorArmed}
        disabled={!connStyle}
        popoverWidth={240}
        icon={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <LineStylePreview style={(connStyle?.style as LineStyle) || 'SOLID'} />
          </Box>
        }
      >
        {connStyle && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {t('lineStyle')}
            </Typography>
            <ToggleButtonGroup
              value={connStyle.style || 'SOLID'}
              exclusive
              fullWidth
              size="small"
              onChange={(_e, style: LineStyle | null) => {
                if (!style) return;
                connStyle.apply({ style });
              }}
            >
              {connectorStyleOptions.map((style) => (
                <ToggleButton key={style} value={style} aria-label={style}>
                  <LineStylePreview style={style} />
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, mb: 0.5 }}>
              {t('lineType')}
            </Typography>
            <ToggleButtonGroup
              value={connStyle.lineType || 'SINGLE'}
              exclusive
              fullWidth
              size="small"
              onChange={(_e, lineType: LineType | null) => {
                if (!lineType) return;
                connStyle.apply({ lineType });
              }}
            >
              {connectorLineTypeOptions.map((type) => (
                <ToggleButton key={type} value={type} aria-label={type}>
                  <LineTypePreview type={type} />
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ mt: 1.5 }}>
              <LabeledSlider
                label={t('width')}
                value={connStyle.width ?? 10}
                displayValue={String(connStyle.width ?? 10)}
                min={CONNECTOR_WIDTH_STOPS[0].value}
                max={CONNECTOR_WIDTH_STOPS[CONNECTOR_WIDTH_STOPS.length - 1].value}
                step={null}
                marks={CONNECTOR_WIDTH_STOPS}
                onChange={(width) => connStyle.apply({ width })}
              />
            </Box>

            <FormControlLabel
              sx={{ mt: 0.5 }}
              control={
                <Switch
                  checked={connStyle.showArrow !== false}
                  onChange={(e) => connStyle.apply({ showArrow: e.target.checked })}
                />
              }
              label={t('showArrow')}
            />
            {/* Per-label leader-line toggle — shown only when a specific
                connector label is selected (moved here from the deck, #10). */}
            {activeLabel && (
              <FormControlLabel
                sx={{ mt: 0.5, display: 'flex' }}
                control={
                  <Switch
                    checked={activeLabel.showLine !== false}
                    onChange={(e) =>
                      updateActiveLabel({ showLine: e.target.checked })
                    }
                  />
                }
                label={t('showDottedLine')}
              />
            )}
          </Box>
        )}
      </StripButton>

    </Box>
  );
};
