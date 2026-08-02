import { z } from 'zod';
import { id, coords, constrainedStrings, NOTES_MAX_LENGTH } from './common';

// Floating Label — a first-class billboard chip (ADR 0031), peer to TextBox /
// Node / Connector / Rectangle. Extracted from the retired textBox
// `variant:'label'`: the iso-projection and per-character rich text are removed,
// leaving a plain-text chip with whole-chip styling. Drawn by the merged bulk
// canvas ABOVE nodes at the same layer/z-index — the `label` TYPE RANK in
// `compareSceneDrawOrder` (ADR 0031 §2, restated as a sort-key property by ADR
// 0038 §8) — so a label can sit over a node; an explicit `zIndex` outranks the
// type rank and orders labels against every other entity type. Model-only —
// unlike a TextBox it carries no scene-size entry: the bulk canvas and the DOM
// hit-proxy each measure the chip themselves, exactly like node labels.
export const labelSchema = z.object({
  id,
  // The plain text the chip displays; also the label's identity (Layers / info
  // popover). Whole-chip B/I/S lives in the style fields below — a Label has no
  // per-character rich text (ADR 0031 §3, the two-layer-formatting fix).
  text: constrainedStrings.description,
  tile: coords,
  // First-class font size in PX (absent = LABEL_BASE_FONT_PX). Replaces the
  // variant chip's `fontSize × 24` heuristic with a real px size.
  fontSize: z.number().optional(),
  // Chip text colour (absent = the theme's default chip text colour).
  color: z.string().optional(),
  // Chip background colour (absent = the default white chip).
  backgroundColor: z.string().optional(),
  // Chip background opacity (0..1). Absent = 1 = opaque. Applied as Canvas2D
  // globalAlpha around the chip fill only (text + border stay opaque).
  // Optional → zero-migration addition.
  backgroundOpacity: z.number().min(0).max(1).optional(),
  // Whole-chip text style (ADR 0033 B/I/S field convention; underline added
  // 2026-07-03 per ADR 0034 O1 — optional, zero-migration).
  isBold: z.boolean().optional(),
  isItalic: z.boolean().optional(),
  isStrikethrough: z.boolean().optional(),
  isUnderline: z.boolean().optional(),
  // Stacking order WITHIN the Label layer (send-to-front/back). Absent = 0.
  // Cross-layer order vs nodes is structural (the layer mounts above
  // SceneCanvas — ADR 0031 §2), not expressed here.
  zIndex: z.number().int().optional(),
  // Optional external link (2026-07-01) — parity with node/connector
  // `headerLink`. Set from the top-bar Link control; opened from the view-mode
  // info popover. Optional → zero-migration addition on the unpushed branch.
  headerLink: z.string().max(2048).optional(),
  // Rich-text notes (2026-07-02) — parity across all canvas elements. `text` is
  // the on-canvas chip; `notes` is separate metadata. Optional → zero-migration.
  notes: z.string().max(NOTES_MAX_LENGTH).optional(),
  layerId: id.optional(),
  // Off-grid positioning (ADR 0023): a floating billboard can sit at a px
  // residual off its tile anchor. Absent/snapped = the tile centre. `tile`
  // stays an integer tile; `offset` is the SceneLayer-px residual.
  offset: coords.optional(),
  snap: z.boolean().optional()
});
