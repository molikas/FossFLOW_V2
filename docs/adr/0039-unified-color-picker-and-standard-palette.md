# ADR 0039 — Unified Color Picker and Standard Palette

**Status:** Accepted
**Date:** 2026-07-09
**Supersedes:** none (relates to [ADR 0030](0030-docked-style-controls-strip.md) — the strip is the single styling surface; relates to [ADR 0033](0033-element-text-style-field-convention.md) — the flat per-surface field convention this reuses)
**Superseded by:** none

## Context

Color is settable on every stylable surface — text/label color, rectangle fill + border, text/label background, connector line color — but the *picking* UI is fragmented into **three overlapping components** with an impoverished quick-pick experience:

| Component | Surface(s) | Quick-pick | Custom |
|---|---|---|---|
| [`LabelColorPicker`](../../packages/axoview-lib/src/components/ItemControls/components/LabelColorPicker.tsx) | text color | Black / White / scene presets | "Custom color" **toggle** → hue-sat |
| [`PresetCustomColor`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) (6 call sites) | rectangle fill, text/label background, rectangle border, connector color | scene presets + White + No-color | "Custom color" **toggle** → hue-sat |
| [`ColorSelector`](../../packages/axoview-lib/src/components/ColorSelector/ColorSelector.tsx) | — (**dead**: imported only by its own test) | scene presets only | — |

All three lean on the scene **`colors`** palette, which is **near-empty by default** — the initial model ships exactly one entry (`DEFAULT_COLOR = __DEFAULT__`, [`config.ts:26`](../../packages/axoview-lib/src/config.ts); [`colorsSchema`](../../packages/axoview-lib/src/schemas/colors.ts)). So the everyday experience is: **one preset swatch, then flip a toggle into a hue/saturation dialog** ([`CustomColorInput`](../../packages/axoview-lib/src/components/ColorSelector/CustomColorInput.tsx) wrapping [`ColorPicker`](../../packages/axoview-lib/src/components/ColorSelector/ColorPicker.tsx) → `mui-color-input`). There is no grid of ready-to-click standard colors, which is what a user reaches for 90% of the time.

The color **data model** is a preset-ID / free-hex duality: an element stores either `color: <presetId>` (resolved through the scene palette) **or** a free-form hex on `customColor` / `labelColor` / `borderColor` / `backgroundColor` ([`connector.ts`](../../packages/axoview-lib/src/schemas/connector.ts), [`rectangle.ts`](../../packages/axoview-lib/src/schemas/rectangle.ts), [`textBox.ts`](../../packages/axoview-lib/src/schemas/textBox.ts), [`label.ts`](../../packages/axoview-lib/src/schemas/label.ts)). The strip already resolves both to a hex for display via [`resolveHex`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx).

The owner's ask (2026-07-09, with a Google Slides / PowerPoint reference screenshot): a **standard-color grid** like Google's custom-color surface — *"we don't need to make it complex, we can keep as is today."* The screenshot's top **"SIMPLE LIGHT" theme-palette row + ✏️ edit** is a document-theme editor; Axoview's analog is the scene `colors` palette, and **building a theme editor is explicitly out of scope**.

## Decision

**Introduce ONE shared color-picker body — the canonical color surface for every color control — laid out on the Google-Slides model.** It replaces `LabelColorPicker` and `PresetCustomColor`; the dead `ColorSelector` is deleted.

### 1. Layout (single surface, no toggle)

The picker body (rendered inside the existing [`StripButton`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) popover — **strip-only today**: there is no detail-panel color control, and `ColorPickerBody`'s sole importer is `TopBarStyleControls`) shows, top to bottom:

1. **Standard color grid** — a fixed palette (§4) of ready-to-click swatches, always visible. The active swatch is ringed when the resolved hex matches a cell.
2. **＋ Custom** and **⛏ eyedropper** affordances on one row. "＋ Custom" reveals the hue/saturation picker + hex field (today's `CustomColorInput`, retained internally); the eyedropper is promoted from inside that input to a top-level action.
3. **Transparent / No-color** swatch — **only when the context allows clearing** (§3).

The **"Custom color" toggle Switch is removed** — the grid and the custom affordance coexist on one surface, so the mode flip is redundant.

### 2. Storage: grid commits hex; preset-IDs are read-only legacy

- Clicking a **standard-grid swatch commits a free-form hex** (`customColor` / `labelColor` / `borderColor` / `backgroundColor` per surface). The picker does **not** add colors to the scene `colors` palette.
- **Reads still resolve stored `color: <presetId>`** through the scene palette (existing diagrams render unchanged) — `resolveHex` stays. The preset-ID **write** path is retired from the new UI, but the field and its resolver remain for backward compatibility.
- **No data migration.** This is zero-schema-change and back-compat-neutral, consistent with [ADR 0033](0033-element-text-style-field-convention.md)'s "keep the flat fields" posture.

### 3. Transparent / No-color is contextual

"Transparent" (a no-fill sentinel) / "No color" is valid **only** for fill, border, and background — where an absent/transparent value renders nothing or a derived stroke. It is **never** offered for **text color** (text must have a color). The picker takes an `allowNoColor` flag (and preserves the existing `absentIsNoColor` nuance for the rectangle border, whose absent `borderColor` derives a stroke rather than reading as "no color").

### 4. The standard palette is a fixed constant, not user-editable

The grid is a hard-coded palette constant (a Google-Slides-equivalent set — a greyscale row plus hue columns with tints/shades), living beside the other palette constants (cf. [`annotationSettings.ts`](../../packages/axoview-lib/src/config/annotationSettings.ts)). There is **no theme-palette editor** (the screenshot's ✏️) and **no "recent colors" row** in this version — both are explicitly deferred.

### 5. Call-site consolidation

The single shared component replaces:
- the text-color [`LabelColorPicker`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) site (`allowNoColor=false`);
- the six [`PresetCustomColor`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) sites — rectangle fill, text/label background, rectangle border, connector color (`allowNoColor` per surface).

[`ColorSelector.tsx`](../../packages/axoview-lib/src/components/ColorSelector/ColorSelector.tsx) and its test are **deleted** (confirm no live import first). The standalone [`ExportImageDialog`](../../packages/axoview-lib/src/components/ExportImageDialog/ExportImageDialog.tsx) background-color field (a one-off dialog color, not an element style) is **left as-is** for this pass; unifying it later is optional.

## Consequences

**Positive:**
- One-click access to a full standard palette — the primary ask; matches user muscle memory from Slides/PowerPoint/Docs.
- One component instead of three (minus one dead file) — the color surface is now a single place to reason about and test.
- Zero migration, zero schema change; every existing diagram renders identically.
- The redundant "Custom color" toggle disappears — fewer modes, fewer states.

**Negative / risks:**
- Non-trivial rework inside the mature, edge-case-dense [`TopBarStyleControls`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) (dual-scope text-box color while editing, cross-type mixed-selection color, bulk fan-out) — the new component must preserve every `onChange` contract those paths depend on.
- The scene preset-ID write path goes dormant; a future palette/theme feature would re-open the "IDs vs hex" question this ADR parks (reads-only).
- New i18n keys across all 13 locales (grid/section labels, "Custom", "Transparent").
- Standard-grid additions/edits are code changes (fixed constant) — acceptable for "keep it simple."

## Implementation notes (non-binding)

- **Component:** repurpose the (dead) `ColorSelector` slot into the unified picker, or add `ColorSelector/ColorPickerBody.tsx` — a body, not a popover (the popover is `StripButton`'s). Reuse `CustomColorInput` verbatim behind "＋ Custom" and lift its eyedropper up.
- **Props (sketch):**
  ```ts
  interface ColorPickerBodyProps {
    value: string | undefined;              // resolved hex (via resolveHex at the call site)
    onChange: (hex: string) => void;        // commits a picked color as hex
    allowNoColor?: boolean;                 // show Transparent/No-color (fill/border/background). Default false.
    onNoColor?: () => void;                 // clear to transparent/derived (required iff allowNoColor)
    absentIsNoColor?: boolean;              // absent value reads as no-color active. Default = allowNoColor.
  }
  ```
  Call sites pass `resolveHex(presetId, customColor)` as `value` and keep their existing write semantics inside `onChange` / `onNoColor` (so bulk fan-out, dual-scope text-box range coloring, and cross-type selection are untouched).
- **Palette:** a new `config/colorPalette.ts` exporting the grid as rows of hex strings (greyscale row + ~10 hue columns × tint/shade rows, matching the reference). Keep it a plain `as const` array like `ANNOTATION_COLOR_PRESETS`.
- **i18n:** extend the `topBarStyleControls` / `labelColorPicker` namespaces (existing `customColor`, `noColor` keys) with any new labels across all 13 `src/i18n/*.ts` files.
- **Reuse:** `ColorSwatch` (the swatch button) and `NoColorSwatch` (white circle + red slash) already exist and should back the grid + Transparent cells.

## Acceptance criteria

- **Unit test:** a `ColorPickerBody` test covering — grid renders all palette swatches; clicking a swatch fires `onChange` with that hex; the active swatch is marked when `value` matches; "＋ Custom" reveals the hex/hue-sat input; Transparent appears **only** when `allowNoColor` and fires `onNoColor`; Transparent is **absent** for text color. The retired `ColorSelector` test is removed.
- **Manual verification:** on each surface (text color, rectangle fill + border, text/label background, connector color) — the grid opens with no toggle; a grid click applies immediately and persists through save/reload; a stored legacy `color: <presetId>` diagram still renders and shows its swatch active; the eyedropper picks a screen color; Transparent clears a fill but is unavailable on text color. Verified in a real browser (per the WebGL/UI verification rule), not just jsdom.

---

### 2026-07-31 addendum — one representation for "no colour" (STYL-03)

**Owner ruling 2026-07-30** ([DECISIONS.md](../exploratory/DECISIONS.md), STYL-03),
implemented in the exploratory-remediation wave 4. The accepted text above is
left as shipped; this addendum is the binding rule for the storage form of "no
colour", which §3 above left implicit.

**What the campaign found.** "No colour" had two storage forms across sibling
controls of the same picker. Rectangle fill and rectangle border wrote the
literal string `'transparent'`; label background, text-box background and
text-box border deleted the field. Nothing broke — `ColorPickerBody` understands
both and both rendered as no-fill — but one concept with two representations is
drift waiting to become a bug the moment a consumer normalises one to the other.

**The rule.**

> **Absent is "no colour", everywhere except where absent already means
> something else.** The `'transparent'` sentinel is READ forever (diagrams
> written before this addendum carry it) and WRITTEN in exactly one place.

- **Rectangle fill** — absent. Clearing the fill deletes **both** `customColor`
  and the legacy `color` preset id. Deleting only `customColor` would let the
  dormant preset repaint the fill the user just cleared (`resolveHex` falls back
  to it), which is the STYL-04 hazard turned live. A picked colour likewise
  clears the preset, so a rectangle's fill has one source of truth.
- **Label background, text-box background, text-box border** — absent, unchanged.
- **Rectangle border** — the **one documented exception**: the sentinel stays.
  An absent `borderColor` derives a stroke from the fill (the legacy look), so
  absent and "no border" are genuinely different states there. This is what
  `absentIsNoColor={false}` already encodes at that call site.

**Reader consequence.** An absent rectangle fill now renders **outline-only and
hit-testable** — exactly what the sentinel renders — rather than nothing at all.
`Rectangle.tsx` and `RectanglesCanvas.tsx` (the DOM and GPU paths, which must
agree) both derive `isTransparent = !fillValue || fillValue === 'transparent'`.
A colourless rectangle was previously unreachable from the app (`DrawRectangle`
always seeds `colors[0].id`) and only arrived by import or hand-edit, where
"invisible but present" was the worse of the two readings.

**Gate.** [`bulk-format-mixed.spec.ts`](../../packages/axoview-e2e/tests/bulk-format-mixed.spec.ts)
drives the real No-colour swatch and asserts both fields end absent.
