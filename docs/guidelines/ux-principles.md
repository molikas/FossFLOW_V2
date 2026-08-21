# Axoview UX Principles

**Last updated:** 2026-08-21 (section index added; §8.5's example re-pointed at the surface it actually renders on — `AuthControl`'s `SessionStatusRow`. Content last revised 2026-07-19 — §4.2 "trace each shape" selection/hover rim, [ADR 0044](../adr/0044-on-canvas-icon-resize.md)) · revision history: `git log --follow docs/guidelines/ux-principles.md`
**Status:** Living reference. Update when principles evolve — **and bump the date above in the same commit** (it silently drifted ~12 days / 4 commits before the 2026-07-15 sweep).
**Audience:** Anyone (or any agent) building UI surfaces, fixing bugs, or reviewing PRs that touch the canvas, side panels, file explorer, or layers.

This is the design language that governs Axoview's UI. It's not opinion — it's the consolidated set of choices already shipped, expressed as principles so new work doesn't drift.

When in doubt, **mirror what already exists** in the reference implementations listed at the bottom.

## Contents

Read the section that covers the surface you're touching — this file is a reference, not a briefing.

1. [Layout](#1-layout) — the `Section` primitive, header casing, labels vs placeholders, tabbed scroll clipping, the six typography tiers (§1.5)
2. [Affordances](#2-affordances) — in-row action visibility, distinct icons per concept, hover-revealed header clusters, the context menu as the *sole* per-item command surface, enabled/disabled contrast
3. [Keyboard](#3-keyboard) — F2 renames everywhere; Enter confirms, Escape cancels
4. [Selection model](#4-selection-model) — two-way panel ↔ canvas sync, file-tree independence, locked/hidden items, the multi-select gesture matrix
5. [Item type parity](#5-item-type-parity) — the uniform control-panel stack, connector mirrors node, no icon overloading, one on-canvas text sizing model
6. [State persistence reassurance](#6-state-persistence-reassurance) — progress *and* confirmation, empty states, validation surfacing, the branded cold-start splash
7. [Localization](#7-localization) — every string through locales; translation tone
8. [Layout regions and overlays](#8-layout-regions-and-overlays) — the largest section: panels overlay and never push the canvas, `EmptyStateScreen` confinement, the status cluster (§8.5), screen-pixel-stable canvas chrome (§8.8), ephemeral view-mode chrome (§8.10), the canvas fidelity boundary (§8.12)
9. [Touch & pointer interaction](#9-touch--pointer-interaction) — direct manipulation, long-press as a contextual reveal, live-gesture affordances, platform touch chrome, modes never see a `PointerEvent`
10. [Reference implementations](#10-reference-implementations) — the files to mirror
11. [Whole-experience coherence](#11-whole-experience-coherence) — the edit/view/present split and the consequences pass
12. [When this document is wrong](#when-this-document-is-wrong) — how to correct it

---

## 1. Layout

> **Surface vocabulary (2026-05-20):** the canonical Modal / Dialog / Popover / Panel / Banner / Screen vocabulary is locked in [ADR 0008 — Naming Convention](../adr/0008-naming-convention.md) Decision 2. When naming a new overlay or full-area surface, pick the term whose visual contract matches yours — do not invent a sixth.

### 1.1 Section is the layout primitive

Every titled control group in the right sidebar uses [`Section`](../../packages/axoview-lib/src/components/ItemControls/components/Section.tsx). Never inline a header:

```tsx
// ✅ Correct
<Section title={t('color')}>
  <ColorSelector ... />
</Section>

// ❌ Wrong — inline caption header
<Box>
  <Typography variant="caption">Color</Typography>
  <ColorSelector ... />
</Box>
```

Reason: `Section` enforces consistent spacing (`pt: 1.5, px: 2`), title typography (caption + semibold + secondary color), and bottom margin. Any deviation creates a panel that looks like it was built by a different team.

### 1.2 No ALL CAPS section headers

`Section` deliberately does NOT use `textTransform: uppercase`. Modern property panels (Figma, Linear, Notion, VS Code) use sentence case. Research confirms lowercase is faster to scan. ALL CAPS is a 2014–2018 Material Design legacy.

This applies everywhere: section titles, button labels, dropdown values, switch labels.

```ts
// ✅ Correct
'Line style'
'Use custom color'
'Show arrow'
'Single line'

// ❌ Wrong
'Line Style'
'Use Custom Color'
'Show Arrow'
'Single Line'
'LINE STYLE'
```

The "More icons" caption in the Elements panel was previously `textTransform: 'uppercase'`. Removed in the 2026-05 shake-out — sentence case matches every other section header. Same goes for the panel-region labels (Diagrams, Layers, Common, etc.) which now render in sentence case via the `overline` typography variant (see §1.5).

### 1.3 Field labels are explicit; placeholders are hints

Every input field has a `Section` title above it. Placeholder text is a *hint* about what to type, not a label substitute.

```tsx
// ✅ Correct
<Section title={t('name')}>
  <TextField placeholder="Edge label…" ... />
</Section>

// ❌ Wrong — placeholder doing label's job
<TextField label="Connector name" ... />
<TextField placeholder="Connector name" ... />
```

Reason: placeholders disappear on focus, so a placeholder-only field has no persistent label — bad for accessibility and re-scanning. Explicit Section titles persist.

### 1.4 Tabbed scroll containers must clip horizontally

Any container with `overflowY: 'auto'` must also set `overflowX: 'hidden'`. Per CSS spec, mixing `overflow-y: auto` with the default `overflow-x: visible` resolves *both* axes to `auto`, turning the container into a horizontal scroll container as well.

This bites with MUI `Slider`: the thumb's `::after` pseudo-element is a 42 × 42 invisible hit-area centred on the thumb. At `left: 100 %` it extends ~21 px past the slider edge — enough to trigger a horizontal scrollbar in any tabbed property panel.

```tsx
// ✅ Correct — explicit on both axes
<Box sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>

// ❌ Wrong — browser silently promotes overflowX to 'auto'
<Box sx={{ overflowY: 'auto', flex: 1 }}>
```

Reference: [`ConnectorControls.tsx`](../../packages/axoview-lib/src/components/ItemControls/ConnectorControls/ConnectorControls.tsx) and [`NodePanel.tsx`](../../packages/axoview-lib/src/components/ItemControls/NodeControls/NodePanel/NodePanel.tsx) `TabPanel`.

### 1.5 Typography is theme-driven — six tiers, picked by role

The theme owns every font size and weight. Components pick a `<Typography variant="…">` based on the **role** of the text, never on how big or bold the author wishes it looked. Role-based variants survive design adjustments without code changes; ad-hoc inline `fontSize` / `fontWeight` accumulate into per-component drift.

| Variant | px @ 14 base | Role | Examples |
|---|---|---|---|
| `h6` | 17.5 | Dialog & popover titles | `ConfirmDialog`, `SaveDialog`, `LoadDialog`, `ExportDialog` titles |
| `body1` | 14 | Dialog/form body | `DialogContent`, descriptive paragraphs |
| `body2` | 12.25 | **Primary readable** lists, trees, forms | Layer item names, file-tree names, tab labels, panel form fields, tooltips |
| `caption` | 10.5 | Sub-labels / helper text | "Name", "Icon", "Link" mini-labels above an input; helper hints |
| `overline` | 10.5 + tracked | Region wayfinding (**sentence case** per §1.2/§7.2) | `Layers`, `Diagrams`, `Elements`, `Unassigned`, dock-section headers |
| `micro` | 9.6 | Glanceable status / badges (NOT prose) | `SESSION` chip, storage gauge, layer item-count badge, hotkey hints |

**Rules:**

1. **Pick by role, not size.** "Looks too small" means the role is wrong, not the size. If a layer-item label feels small, the question is "is this primary readable text?" → if yes, it's `body2`, full stop.
2. **Never pass `fontSize` to `<Typography>`.** Same for `fontWeight`. Both belong to the variant.
3. **Component-level overrides live in `theme.ts`.** `MuiTab`, `MuiChip`, `MuiButton` — set there once. Don't sprinkle `'& .MuiTab-root': { fontSize: ... }` inside random components.
4. **Need a size that doesn't fit a tier?** Propose a new variant in `theme.ts`. Don't inline it. Drift starts with one inline override.
5. **The table only holds where a `ThemeProvider` provides the theme.** Every size above is the theme's 14px-base scale — it is *not* what MUI renders by default. The lib provides the theme inside `<Axoview>`; the **app root must provide it too** (`<ThemeProvider>` + `<CssBaseline/>`). Where it doesn't — **today `axoview-app` has no root provider** — app-level surfaces (dialogs, the toolbar, popovers, menus) fall back to **MUI defaults**: 16px body, 20px `h6`, 16px inputs, and the tell-tale **`overline` rendered UPPERCASE**. New app UI then looks correct in the code (right variants) yet ships oversized. So on an app-level surface: **never rely on MUI defaults, and never use `overline` for a section header** (un-themed it uppercases — use the recipe below). Tracked in [known_issues.md](../../known_issues.md) ("App-level MUI components render un-themed").

**Permitted exceptions (documented):**

- `TextField` `slotProps.input` — that's input rendering, not Typography. Match `body2` for input text.
- Monospace contexts — explicit `fontFamily: 'monospace'` is a semantic choice (keyboard shortcuts, code blocks).
- Content emphasis — bolding the value of a single labeled field (e.g. an "Active" badge inside a row) is content-driven and may use `fontWeight={…}` locally. Section labels and panel headers may **not** — that's the drift this rule blocks.

```tsx
// ✅ Correct — role-driven, sentence case
<Typography variant="body2">{layer.name}</Typography>
<Typography variant="overline">Layers</Typography>
<Chip label={<Typography variant="micro">Session</Typography>} size="small" />

// ❌ Wrong — sized by feel
<Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
  {layer.name}
</Typography>

// ❌ Wrong — manual ALL CAPS, or overline re-imposing uppercase (both violate §1.2 / §7.2)
<Typography variant="caption" sx={{ textTransform: 'uppercase', ... }}>AWS</Typography>
<Typography variant="overline" sx={{ textTransform: 'uppercase' }}>Layers</Typography>
```

`overline` intentionally renders **sentence case** here (against MUI's default) — the "region header" signal comes from weight 600 + tracking + smaller size, not uppercase (satisfies §1.2/§7.2). The custom `micro` variant is registered via TS module augmentation in [`theme.ts`](../../packages/axoview-lib/src/styles/theme.ts).

**Dialog / app-surface typography recipe.** Because app-level surfaces may render un-themed (rule 5), build them with the explicit recipe below — it matches the lib's `ExportImageDialog` and looks right with *or* without the theme:

| Element | Variant / style |
|---|---|
| Dialog title | `h6`; on an un-themed surface, cap it via a scoped compact theme (`h6` → `1.1rem` / 600), never the default 20px |
| Section header | `caption` + `fontWeight: 600` + `color: 'text.secondary'`, sentence case — **not** `overline` |
| Row primary text | `body2` |
| Email / role / helper | `caption`, `color: 'text.secondary'` |
| Inputs · Select · MenuItem | `body2` (14px); on an un-themed surface a scoped compact `ThemeProvider` pins `MuiInputBase` / `MuiMenuItem` to `0.875rem` |

References: [`ExportImageDialog`](../../packages/axoview-lib/src/components/ExportImageDialog/ExportImageDialog.tsx) (renders under the lib theme) and [`DriveShareManageDialog`](../../packages/axoview-app/src/components/DriveShareManageDialog.tsx) (scoped compact `ThemeProvider` — the interim pattern for app surfaces until the app-root theme lands).

---

## 2. Affordances

### 2.1 In-row actions are visible at `opacity: 0.5`

Action buttons inside **dense lists** (layer rows, file tree rows, scene-item rows) default to half opacity. Full opacity on hover or when active. **Inside rows, never `opacity: 0`** — undiscoverable affordances are bugs when the row is just one of many similar siblings the user is scanning.

```tsx
// ✅ Correct — discoverable
sx={{ opacity: item.showLabel === false ? 1 : 0.5, '&:hover': { opacity: 1 } }}

// ❌ Wrong inside rows — hidden until hover
sx={{ opacity: 0, '&:hover': { opacity: 1 } }}
```

This rule is scoped to **in-row** affordances. Panel-header action clusters (see §2.3) are a different surface and follow a different pattern.

### 2.2 Distinct icons for distinct concepts

Don't reuse icons across semantically different operations:

| Concept | Icon |
|---|---|
| Layer-level entity visibility | `Visibility` / `VisibilityOff` |
| Item name-label visibility | `LabelOutlined` / `LabelOffOutlined` |
| External URL | `OpenInNew` |
| Inline rename trigger | F2 keyboard (no icon needed) |

If a user sees the same icon in two places and it does different things, the icon's semantics are broken.

### 2.3 Panel-header action clusters are hover-revealed

Action clusters on **panel-chrome headers** (file explorer toolbar: new file/folder/import/export/refresh/collapse; Layers panel header: add-layer/delete-layer) render at `opacity: 0` and fade in (`120ms ease`) on the panel container's `:hover` or `:focus-within`. They keep their DOM space — invisible, not removed — so layout doesn't reflow on reveal. VS Code, Figma, and Linear behave the same way.

```tsx
// Panel container declares the reveal selector
sx={{ '&:hover .ff-toolbar-actions, &:focus-within .ff-toolbar-actions': { opacity: 1 } }}

// Action cluster sets base opacity + transition
sx={{ opacity: 0, transition: 'opacity 120ms ease', '&:focus-within': { opacity: 1 } }}
```

This differs from §2.1 because:

- Panel headers are **chrome**, not content. The list of rows is what the user is scanning; the chrome stays out of the way until needed.
- Cluster has 5+ icons; always-visible would crowd the header and compete with the panel title.
- The interaction is bound to the panel as a whole — entering the panel reveals all its secondary actions at once.

`:focus-within` is required so keyboard navigation through the icons still reveals them. Reference: ADR-0005 §5b.

### 2.4 The context menu is the *sole* per-item command surface

Right-click (desktop) or long-press (touch) on a node, connector, text box, or rectangle opens a single context menu — the catch-all home for every per-item command (ADR 0027). There is **no floating quick-action bar**: the old bar/menu/panel three-tier model collapsed to two in the 2026-06-25 shake-out — **menu = per-item commands · details panel = editing**. A single click/tap is **select-only** (it derives the panel target but mounts no surface; §4.4); double-click opens the editing panel. Don't reintroduce a selection-triggered floating toolbar — it duplicates the menu and competes with the move-is-drag model (§9.1). Reference: [`CanvasContextMenu.tsx`](../../packages/axoview-lib/src/components/CanvasContextMenu/CanvasContextMenu.tsx).

> **Docked toolbar editing is exempt** (not "floating"). The top-bar style strip ([`TopBarStyleControls.tsx`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx), ADR 0005 Group 1 "Format" slot) **is the canonical styling surface** — the single writer of visual styling for every item type ([ADR 0030](../adr/0030-docked-style-controls-strip.md)) — in the always-present toolbar chrome, the Google-Docs/Figma persistent-format-toolbar pattern. The item panel is **Details / Notes** only; per-type side-panel styling was retired. The strip is **docked**, **global**, and **selection-gated** (controls enable/disable, they don't float to the cursor), so it does not reintroduce the canvas-anchored quick-action bar this section forbids.

### 2.5 Toolbar controls need a hard enabled/disabled contrast

A selection-gated toolbar (the style strip) shows every control at all times; inapplicable ones disable rather than hide, so the user learns the full command surface. That only works if **disabled reads as clearly inert** — otherwise the toolbar looks broken, not gated. Two rules:

- **Enabled = `text.primary` (≈0.87), disabled = `action.disabled` (≈0.26).** The default `action.active` (0.54) for an enabled icon sits too close to disabled (0.26) to scan at a glance — push enabled darker.
- **Force icons to inherit the button colour.** The theme pins `MuiSvgIcon` to `color: 'action'` (theme.ts), which overrides the button's disabled colour, so a disabled icon-button keeps full-strength icons and looks enabled. Add `'& .MuiSvgIcon-root': { color: 'inherit' }` on any toolbar control whose enabled/disabled state must read visually.

```tsx
sx={{
  color: disabled ? 'action.disabled' : 'text.primary',
  '& .MuiSvgIcon-root': { color: 'inherit' } // defeat the global color:'action' pin
}}
```

Pair the disabled state with a tooltip that says *why* it's disabled and how to enable it (e.g. *"Select a connection to set its line style"*) — same spirit as §8.3.

---

## 3. Keyboard

### 3.1 F2 = rename, universally

Inline rename via F2 on the canvas, in the layer panel, and in the file explorer. Matches OS conventions (Windows Explorer, Finder rename hotkey is also F2 on Windows). Don't introduce alternatives.

When implementing F2:
- Make the row focusable (`tabIndex={0}`)
- Focus the row on click (`ref.focus()`)
- `e.stopPropagation()` in the row's `onKeyDown` to prevent canvas-level F2 from also firing

Reference: [`LayerItemRow.tsx`](../../packages/axoview-lib/src/components/LayersPanel/LayerItemRow.tsx).

**Canvas inline-rename commits on click-away, and the blur *cause* decides commit-vs-cancel** (ADR 0022 §4 / [`useInlineRename`](../../packages/axoview-lib/src/hooks/useInlineRename.ts)): **Enter** or a **left-click away** commits; **Escape** or a **right-click away** cancels. A capture-phase `pointerdown` listener blurs the editor synchronously, *ahead* of the canvas deselect that would otherwise unmount it before `onBlur` could fire — so the edit is never silently lost on click-away.

### 3.2 Enter confirms, Escape cancels — in every dialog

Built into [`ConfirmDialog`](../../packages/axoview-app/src/components/ConfirmDialog.tsx) at the dialog level. New dialogs should reuse `ConfirmDialog` rather than rolling their own. If a custom dialog is unavoidable, copy the keyboard handler.

---

## 4. Selection model

### 4.1 Two-way panel ↔ canvas sync

Clicking a layer item also selects it on canvas. Selecting on canvas highlights the matching layer row. The two views are mirrors of the same selection state, not independent.

This is implemented via `useUiStateStore.itemControls` as the single source of truth. Don't introduce a separate "layer selection" state.

### 4.2 File tree selection is independent

The file tree's selection has different semantics — it's "which diagram is open," not "which canvas object is selected." Don't try to sync the two; they belong to different mental models. Use distinct visual treatments:

- Canvas/layer selection: `bgcolor: 'primary.main'` (saturated blue)
- File tree selection: `bgcolor: 'action.selected'` (subtle grey)

**On-canvas selection/hover chrome** (the outline drawn *on the diagram*, not a list row) is a separate, ranked language — rest < hover < selected must be visibly distinct. The rule (ADR 0006 §9): draw the chrome *just outside* the element's own border (never coincident with it), in the accent `TRANSFORM_CONTROLS_COLOR`, over a **white contrast under-stroke** so it survives on any fill — a selected element gets a bold solid ring + glow, a hovered one a lighter outset outline. Every item type (node / rectangle / text box / connector / label) speaks this one language (§5 parity); don't reintroduce a bare same-colour outline at the element footprint (it disappears on coloured shapes).

**The rim's SHAPE traces the element's on-canvas geometry (ADR 0044, 2026-07-19).** One ring language (accent + white under-stroke), but the *shape* follows what the element **is**: flat elements lying in the tile plane — rectangles, text boxes, and **flat / Material (non-isometric) icons** — use the iso **diamond**; only **standing isometric icons** (3-D sprites a flat diamond can't wrap) use a screen-space **box** sized to the sprite's rendered bounds. Hover mirrors selection exactly. **Labels** (an upright chip) and **connectors** (a thin line) keep their own outline — a bounding box reads oddly on them. Don't give a flat element the screen box (it can't follow a sheared glyph in iso) or a 3-D icon the flat diamond (the sprite escapes it).

### 4.3 Locked / hidden layer items are non-interactive — across every selection path

When a layer is locked or hidden, its items must be **non-selectable, non-draggable, non-context-menu-able** from the canvas — regardless of which gesture the user employs. Locked = visible-but-protected; hidden = invisible. Both states are absolute from the canvas perspective. The Layers panel rows remain the user's escape hatch — they always let the user select an item back so they can un-lock or un-hide.

The enforcement lives in a single helper, `isItemInteractable`, built in [`useInteractionManager`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts) from `layerContext.lockedIds` + `layerContext.visibleIds` and injected into every mode's `State`. **Every selection path must consult it.** Today that means:

- `Cursor.mousedown` — direct left-click selection
- `Lasso.getItemsInBounds` — marquee selection
- `FreehandLasso.getItemsInFreehandBounds` — freehand selection
- `useInteractionManager.onContextMenu` — right-click selection

If a future feature adds a new selection mechanism (keyboard arrow nav, "select all of type X", paste-into-selection, etc.), it **must** route through `isItemInteractable` too. A new selection path that doesn't consult it is the bug, not an oversight to be fixed later — it silently bypasses the lock/hide contract.

Visual indicator for locked rows lives in [`LayerRow.tsx`](../../packages/axoview-lib/src/components/LayersPanel/LayerRow.tsx): left accent stripe + tinted background + saturated lock icon, so the state is unmistakable next to a row of similar outlines.

### 4.4 Multi-select gesture matrix

Persistent canvas multi-selection lives in `uiState.selectedIds: ItemReference[]`. The right Properties panel is per-item — so `selectedIds.length === 1` keeps `itemControls` in sync as the panel **target**, but a single click/tap is **select-only** and mounts no surface (the floating action bar was removed in the 2026-06-25 shake-out); the panel opens on explicit **double-click** (ADR 0022 §3 / ADR 0006 §7 addendum). `0` or `> 1` clears the target and closes it. Bulk editing isn't part of this contract.

| Gesture | Outcome |
|---|---|
| Left-click an item | replaces selection with `[item]` |
| Ctrl/⌘+click an item | toggles `item` in/out (Figma/Sketch standard) |
| Ctrl/⌘+click a **connector** | toggles connector **plus its tile-bound waypoint anchors** as one group |
| Ctrl/⌘+A | selects every visible + unlocked item in the active view (respects §4.3) |
| Left-click empty canvas | clears selection |
| Esc (no panel / connector mid-flight) | clears selection |
| Lasso / freehand-lasso (mouseup) | mirrors `mode.selection.items` into `selectedIds` so it survives leaving lasso mode |
| Drag any item already in `selectedIds` (len > 1) | drags the whole group |
| Delete / Backspace (selection len > 1) | deletes every selected item; CONNECTOR_ANCHOR refs are spliced from their parent connector |
| Alt+click a waypoint (connector selected) | removes the waypoint without removing the connector |

**The design rule:** any selection path that includes a connector MUST also include its tile-bound waypoints — they carry `ref.tile` (absolute position) and don't auto-follow the connector, so omitting them pinches the path on multi-drag and orphans them on bulk-delete. The single source of truth is `getConnectorWaypointRefs(connector)` ([`utils/connectorSelection.ts`](../../packages/axoview-lib/src/utils/connectorSelection.ts)); a new connector-including selection path must call it, same discipline as §4.3's `isItemInteractable`. User-facing badges count via `countUserFacingRefs` (excludes CONNECTOR_ANCHOR — implementation detail, not user-perceived selection).

Full contract, call-site list, and rationale: [ADR 0006](../adr/0006-canvas-selection-contract.md).

---

## 5. Item type parity

Every selectable item type (Node, Connector, TextBox, Rectangle) is a **first-class peer**. New item types (or extensions to existing ones) mirror what node already does.

### 5.1 Item controls panel structure — a uniform stack of collapsible sections

Every item type's control panel is the **same shape**: a vertical stack of **collapsible sections** (no tabs), under a header row that carries the element's **type identity** — a type icon + name (a node shows its own icon + name) on the left, a close button on the right ([`DeckHeader`](../../packages/axoview-lib/src/components/ItemControls/components/DeckHeader.tsx)). The identity gives the close button a companion (it no longer reads as a lone ✕) and says which element the deck is for. Sections run in one canonical order — **content → Notes → Metadata** — the **first open**, the rest collapsed; the context-menu **Add note** deep-links **Notes** open on every type (via the `focusNotes` panel event).

- **Content** (open, where it exists): the on-canvas field that is *not* edited directly on the canvas — node **Label** (with the inline link button + show/hide-label toggle) and connector **Labels** (the `labels[]` editor). **Text boxes and floating Labels have no deck content editor**: their text is edited **inline on the canvas** (double-click, or drop-and-type on placement — the placement flow drops straight into inline edit) and formatted from the style strip, so their decks lead with **Notes**. A rectangle likewise has no content field and leads with Notes.
- **Notes**: the shared [`NotesSection`](../../packages/axoview-lib/src/components/ItemControls/components/NotesSection.tsx) (`RichTextEditor` bound to `notes`), with a "has content" dot on the header.
- **Metadata**: the identity `name` in a collapsed [`MetadataSection`](../../packages/axoview-lib/src/components/ItemControls/components/MetadataSection.tsx) ([ADR 0032](../adr/0032-node-name-caption-label-model.md)) — present for every type whose identity is distinct from its content (node / connector / rectangle / text box), edited primarily in Layers. A floating **Label** has **no** Metadata section: its `text` is both content and identity.

All sections use one shared [`CollapsibleSection`](../../packages/axoview-lib/src/components/ItemControls/components/CollapsibleSection.tsx) primitive, so the deck looks and behaves identically for every element. Visual styling is **not** a panel section — it lives in the docked style strip (§2.4 / §2.5, [ADR 0030](../adr/0030-docked-style-controls-strip.md)), the single canonical styling surface. The deck is **never a styling or free-text-entry surface**: on-canvas text is typed inline on the canvas and styled from the strip; the deck holds **notes + identity** (plus the connector's `labels[]` list). **Delete** lives in the context menu ([ADR 0027](../adr/0027-canvas-context-menu.md)), not the panel.

### 5.2 Connector mirrors node

Connectors are first-class peers of nodes: `name` (identity, Layers-only), `notes`, `headerLink`, `showLabel`, and the same collapsible-section deck (§5.1). Post-decouple ([ADR 0032](../adr/0032-node-name-caption-label-model.md)) a connector's on-canvas text is its **`labels[]`** — the deck's lead content section (F2 adds a label at the midpoint; each is individually styled + linkable), **not** the identity `name` — the same name↔label decouple nodes have. Consequently the connector deck drops the show/hide-name toggle and the connector-level link: label visibility is the **Layers** eye toggle, and the whole-connector link is the strip's **Link** control. This is a *deliberate* parity divergence — a connector has no single on-canvas name, so a node-style name row would be meaningless.

### 5.3 No icon overloading across item types

When designing new affordances, check that the icon doesn't already mean something else for a different item type.

### 5.4 On-canvas label-like text shares one sizing model

Item-type parity extends to *sizing*. Node labels, floating Labels, and connector labels all default to one base size (`LABEL_BASE_FONT_PX = 18`, [`labelSettings.ts`](../../packages/axoview-lib/src/config/labelSettings.ts)) and are sized through **one** strip control — a single px range (10–40) with a relative **+/−** stepper that also works across a mixed label-bearing selection. Don't add a per-type size range or a second sizing control; derive from the shared base and override per element via the strip ([ADR 0030](../adr/0030-docked-style-controls-strip.md) — 2026-07-02 sizing amendment). The text box is the deliberate exception: its size is *tile-space* (scales with the diagram), not screen-px chrome. This is the consistency target for label-like surfaces generally — **one base, one range, one control; derive, don't duplicate per type.**

---

## 6. State persistence reassurance

### 6.1 Long or destructive ops show progress AND confirmation

After import, autosave, or any operation a user might worry about:

- Open the file explorer if applicable (so they can see what landed)
- Push a `notificationStore.push({ severity: 'success', message: ... })` with concrete info ("Imported 3 diagrams across 2 folders")
- Refresh affected views (file tree, layers, canvas)

### 6.2 Empty states surface affordances

The `EmptyStateScreen` shows BOTH "New diagram" AND "Import" cards. Empty doesn't mean "you can only do one thing here" — it means "tell us what you want to do."

Each card is **clickable as a whole square**, not just the inner blue label — users read the big card as the target, so the entire `CardActionArea` carries the click. The blue pill is a non-interactive visual label (no button-inside-button: the card is the single focusable, keyboard-activatable control, with an `aria-label`). This is the §2 affordance rule applied to a full-card target.

### 6.3 Validation failures surface to the user, not just the console

A failed schema parse, a malformed import, or a rejected save must call `uiStateActions.setNotification({ severity: 'error', message })` with at least the first 1–2 violations summarised in plain English. `console.error` alone is not enough — users don't open devtools.

```ts
// ✅ Correct — user sees the error
if (!validationResult.success) {
  console.error('[X] validation failed:', validationResult.error.issues);
  const summary = validationResult.error.issues
    .slice(0, 2)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  uiStateActions.setNotification({
    severity: 'error',
    message: `Could not load diagram: ${summary}`
  });
  return;
}

// ❌ Wrong — silent failure
if (!validationResult.success) {
  console.error('validation failed:', validationResult.error);
  return;
}
```

Reference: [`useInitialDataManager.ts`](../../packages/axoview-lib/src/hooks/useInitialDataManager.ts) surfaces zod issues this way.

### 6.3.1 Failure-of-intent gets a Dialog, not just a toast

A *failure of intent* — the user asked for something and it could not happen (a save rejected by storage quota, a malformed import, a share-POST that 5xx'd) — surfaces as a **blocking Dialog with a clear next action (retry / cancel)**, not a passive notification that can be missed. A toast is right for *"this happened"*; a Dialog is right for *"this didn't happen and you need to decide what to do."*

The contract — and the standardized dialog shape (soft shadow, X close button, `h6` 600 title, `body2` body, padded `DialogActions`; Enter confirms / Escape cancels per §3.2) — is [ADR 0011 — Error-UX Contract](../adr/0011-error-ux-contract.md), shipped in full at the v1.1 close-out. New blocking dialogs reuse [`ConfirmDialog`](../../packages/axoview-app/src/components/ConfirmDialog.tsx) or mirror its shape.

### 6.4 Cover the cold-start gap with a branded splash

The browser paints first at ~500 ms; the JS bundle parses + the editor mounts somewhere between 1 s (docker, prod) and 4 s (dev / session mode). Don't let the user stare at a white page during that gap.

`public/index.html` carries an inline `<div id="ff-splash">` rendered before the React tree exists — wordmark + a CSS-only spinner on a white background. `App.tsx` adds `.ff-splash-hidden` after `isInitialized` and two RAFs (the editor's first paint has flushed), then removes the node from the DOM 250 ms later (CSS fade).

**Why inline, not a React component:** the splash must paint without waiting for the JS bundle to parse. A `<Splash />` component shows up at T+2 s — that's the same problem with extra steps.

**Why no fake progress bar:** we don't have a real progress signal. A spinner says "working" honestly; a percent indicator we made up would lie.

**Don't add a splash to:** modal opens, tab switches, sub-views, or any in-app navigation. Those are sub-second and a spinner becomes flicker. Splashes are for *first paint after page reload* only.

Reference: [docs/perf-troubleshooting.md → Startup cold-start gap (2026-05-19)](perf-troubleshooting.md#case-study--startup-cold-start-gap-2026-05-19) for the diagnostic walk-through and measured impact.

---

## 7. Localization

### 7.1 All UI strings go through locales

14 locale files in `packages/axoview-lib/src/i18n/`. Type definition in `packages/axoview-lib/src/types/axoviewProps.ts`. When adding strings:

1. Add the key to the type definition
2. Add an English translation in `en-US.ts`
3. Add translations to ALL 13 other locales — no English fallbacks in non-English files

### 7.2 Translation tone

Sentence case in all languages where it applies. No ALL CAPS even if the source value used to be ALL CAPS.

---

## 8. Layout regions and overlays

The application chrome has named regions with stable ownership rules. The authoritative contract is [ADR 0005](../adr/0005-toolbar-and-dock-layout-contract.md); this section captures the rules-of-thumb that follow from it.

### 8.1 Left-side panels overlay the canvas — never push it

File Explorer, Elements, and Layers all render as absolute overlays on top of the canvas. Opening or closing any of them does not change the canvas's bounding box.

```tsx
// ✅ Correct — absolute overlay sibling of the canvas
<div style={{ position: 'absolute', top: 0, bottom: 40, left: 40, width: 280, zIndex: 15 }}>
  <FileExplorer />
</div>

// ❌ Wrong — flex child that pushes the canvas right
<Box sx={{ display: 'flex' }}>
  <Box sx={{ width: 280 }}><FileExplorer /></Box>
  <Box sx={{ flex: 1 }}>{canvas}</Box>
</Box>
```

Reason: panels open and close frequently; resizing the canvas on every toggle reflows the diagram and disrupts spatial memory. The right Properties panel already followed this rule — left-side panels now match it.

When File Explorer (280 px) and Elements/Layers (240 px) are both open, the working panel offsets to `left: 320` (40 + 280) so they sit side-by-side with each panel's `borderRight` providing the seam.

### 8.2 No slide animations on left-side panels

Left-side panels appear and disappear instantly. No `transform`/`transition` slide.

**Why:** earlier behavior was inconsistent — File Explorer had no animation, Elements/Layers slid via `transform`. Switching between them produced a layout-jump that read like a bug. Snapping is consistent across all three. Animation is also a bug surface — every transition is a mid-flight state where pointer-events, focus, and z-stacking can desync.

### 8.3 Disabled panel triggers when their content is meaningless

When opening a panel would land the user on nothing useful, disable the trigger rather than letting the panel open empty.

Example: when no diagram is loaded, Elements and Layers icons are disabled with a tooltip *"Open or create a diagram first"*. File Explorer stays enabled — it's the way to *exit* the empty state. (See `disableLeftDockWorkingTabs` prop on `<Axoview>`.)

Don't introduce dead-end clicks: the user's first interaction with an empty app should land somewhere productive.

### 8.4 EmptyStateScreen is confined to the canvas region

The empty-state overlay must not cover the chrome (left strip, bottom dock). It owns the canvas-sized rectangle and nothing else:

```tsx
// ✅ Correct — confined to canvas
<div style={{ position: 'absolute', top: 0, left: 40, right: 0, bottom: 40, zIndex: 5 }}>
  <EmptyStateScreen ... />
</div>

// ❌ Wrong — covers the whole container including the chrome
<div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
  <EmptyStateScreen ... />
</div>
```

**Why this is geometric, not z-index:** `Axoview`'s outer Box uses `transform: translateZ(0)`, which creates a stacking context that traps inner-chrome z-indexes — so geometric exclusion, not z-index, is the fix. Full mechanism in [architecture.md §4 — Lessons Learned](architecture.md#4-lessons-learned) (lesson 14).

Apply the same rule to any future full-canvas overlay (modal-backdrop variants, tutorial spotlight, etc.): if the chrome must remain visible, position the overlay to leave the chrome's pixels uncovered. Don't reach for z-index across the `Axoview` boundary.

### 8.5 Status cluster — chip carries the mode signal, not the wrapper

A single mode badge (the `Session` chip) is enough to communicate the mode. Don't double up with a tinted background around the row — the redundancy reduces contrast for the actual content (the storage gauge, the save-state text) without adding information.

The shipped instance is `SessionStatusRow` in [`AuthControl.tsx`](../../packages/axoview-app/src/components/AuthControl.tsx), inside the avatar menu:

```tsx
// ✅ Correct — chip alone signals the mode; the row itself is untinted
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt }}>
  <Chip
    label={<Typography variant="micro" component="span">{t('status.session', 'Session')}</Typography>}
    size="small"
    sx={{ height: 16, bgcolor: 'warning.dark', color: 'warning.contrastText', '& .MuiChip-label': { px: 0.5 } }}
  />
  <SessionStorageGauge />
</Box>

// ❌ Wrong — orange tint on the wrapper duplicates the chip's signal
<Box sx={{ bgcolor: 'warning.main', opacity: 0.85, display: 'flex', gap: 0.75 }}>
  <Chip label="Session" sx={{ color: 'warning.contrastText' }} />
  <SessionStorageGauge />
</Box>
```

`opacity` is also a trap on cluster wrappers — it cascades to all children, killing contrast on the very text you wanted to draw attention to.

Conditional content should render conditionally. Don't reserve space with an empty `<Typography>` — render nothing when there is nothing to say.

The same principle applies to mode banners outside the cluster (e.g. [`LocalModeBanner`](../../packages/axoview-app/src/components/LocalModeBanner.tsx)). The badge in the cluster is the load-bearing signal; a banner that reinforces it should be quiet — accent stripe, caption typography, outlined or no button — not a tinted bar that competes with the chip.

> **Provenance (2026-07-06, owner override, storage-ux-unification):** the chip + storage gauge moved out of the toolbar status cluster into the avatar menu, and `StatusCluster` now renders save-state text only (nothing when silent). Toolbar-layout side of the same override: ADR 0005 §1 amendment 2026-07-06.

### 8.6 Save action sits flush against StatusCluster — they are one group

In session mode, the Save button (`💾`) is followed immediately by the StatusCluster with no divider between them. They read as a single unit: *"this is what state we're in, and this is what to do about it."* Visually adjacent, not visually separated.

This applies more broadly: when an action and its state are mutually relevant, group them with `gap` not `divider`. Save them as a pair.

### 8.7 CSS rules that target absolutely-positioned siblings should be scoped narrowly

Beware broad descendant rules like `.parent > div { height: 100% }`. They look harmless when the parent has one child but become destructive when overlay siblings are added — `height: 100%` overrides implicit height-from-top+bottom on `position: absolute` children, defeating any `bottom` inset.

If you need to set a child's height generically, target a class or component selector, not every `<div>`. Or trust the child's own inline/sx height (most MUI components set `height` via sx anyway).

### 8.8 Canvas-anchored chrome is screen-pixel-stable

Floating chrome positioned in canvas-tile coordinates ([`ViewModeInfoPopover`](../../packages/axoview-lib/src/components/ViewModeInfoPopover/ViewModeInfoPopover.tsx) — anchored to the item's tile) must counter-scale the `SceneLayer`'s `transform: scale(zoom)` so it stays at natural pixel size at every zoom level. (The floating `NodeActionBar` that originally motivated this principle was removed in the 2026-06-25 shake-out; the screen-space `CanvasContextMenu` replaced it and needs no counter-scale.)

Pattern:

- Subscribe to `useUiStateStoreApi` zoom the same way [`SceneLayer`](../../packages/axoview-lib/src/components/SceneLayer/SceneLayer.tsx) does — direct DOM ref, bypassing React render.
- Apply `transform: ... scale(${1 / zoom})` unconditionally so the bar is screen-pixel-stable at all zoom levels.
- Set `transformOrigin` to the corner that should stay visually anchored to the node (typically `center bottom` for top-anchored bars).

```tsx
// ✅ Correct — screen-pixel-stable at every zoom
useEffect(() => {
  const apply = (zoom: number) => {
    if (!ref.current) return;
    ref.current.style.transform = `translateX(-50%) scale(${1 / zoom})`;
  };
  apply(uiStoreApi.getState().zoom);
  return uiStoreApi.subscribe((state, prev) => {
    if (state.zoom === prev.zoom) return;
    apply(state.zoom);
  });
}, [uiStoreApi]);

// ❌ Wrong — Math.min(1, 1/zoom) leaves the bar shrunken at zoom < 1
const counter = Math.min(1, 1 / zoom);  // shrinks with scene at low zoom
```

MUI `<Menu>` spawned from such chrome renders via Portal at the document root — already screen-stable; no counter-scale needed there.

### 8.9 Node labels stay readable on demand (opt-in counter-scale)

Node name labels live *inside* the zoom-scaled `SceneLayer`, so by default they shrink with the canvas — correct for most editing, but unreadable on a zoomed-out overview. The **"keep labels readable" toggle** (the "Aa" button in [`ZoomControls`](../../packages/axoview-lib/src/components/ZoomControls/ZoomControls.tsx), `uiState.readableLabels`, persisted, **off by default**) opts into a counter-scale (ADR 0015):

- Below the threshold `minReadablePx / baseFontPx`, the label counter-scales by `min(minReadablePx / (baseFontPx · zoom), maxCounterScale)` so its on-screen size holds at a legible floor; above it, the factor is exactly 1. Pure math in [`labelScale.ts`](../../packages/axoview-lib/src/utils/labelScale.ts); tunables in [`labelSettings.ts`](../../packages/axoview-lib/src/config/labelSettings.ts).
- **Label-only** — node geometry is untouched. [`ExpandableLabel`](../../packages/axoview-lib/src/components/Label/ExpandableLabel.tsx) publishes the factor as the `--axoview-label-scale` CSS custom property via the §8.8 direct-DOM zoom subscription (no React render on zoom); [`Label`](../../packages/axoview-lib/src/components/Label/Label.tsx) composes `scale(var(--axoview-label-scale, 1))` after its translate, about `transformOrigin: bottom center` so the stalk-attachment point stays fixed. The default `1` makes it a no-op for non-node Labels (e.g. ConnectorLabel).
- **Opt-in by design:** counter-scaled labels can overlap on dense diagrams, so it is never forced on. It is the user's choice when reading a zoomed-out overview, where unreadable text is the worse failure.

### 8.10 View-mode presentation chrome is ephemeral

View-only mode (`EXPLORABLE_READONLY`) is a *presentation* surface, not an editing one, so it gets lightweight chrome instead of the editing docks — the right Properties dock no longer auto-opens on selection there, and the left LayersPanel is replaced by a corner control. Two instances:

[`ViewModeInfoPopover`](../../packages/axoview-lib/src/components/ViewModeInfoPopover/ViewModeInfoPopover.tsx) (ADR 0012) — an item's name / read-only notes / link read **on the canvas** (hover → preview, click → pinned; Esc / X / click-away close), so reading stays in the diagram instead of bouncing to a 300px editing dock. It is **side-anchored** beside the item (never over it — the game-UI tooltip rule) and **flips/clamps** to stay on screen. Links are sanitised once via the shared read-only notes renderer and open in a new tab.

[`PreviewLayerSwitcher`](../../packages/axoview-lib/src/components/PreviewLayerSwitcher/PreviewLayerSwitcher.tsx) (ADR 0013) is the layer-control instance of the same idea:

- **Placement & affordance:** a compact corner overlay (top-left — reads more naturally in a presentation than bottom-left), semi-transparent at rest and full-opacity on hover (§2) — present but not obtrusive while presenting.
- **Ephemeral, never destructive:** presentation controls apply a **UI-only override** (`uiState.previewLayerOverrides`), never mutating saved model state (`layer.visible`) and never dirtying/saving. The override clears on leaving preview or switching view. When a view-mode control mirrors an edit-mode one, keep the merge in **one** place (here, `LayerContextProvider`) with a documented precedence so the two visibility sources can't desync.
- **Gated to where it's useful:** shown only in view mode and only when there's a real choice (≥2 layers).

### 8.11 Scratch overlays never pollute the model

The [annotation overlay](../../packages/axoview-lib/src/components/AnnotationLayer/AnnotationLayer.tsx) (ADR 0014) is "paint on top" markup for talking over a diagram — pencil/highlighter/shapes/arrows from a fixed palette opened by a pen toggle (grouped tools behind hover fly-outs). Two principles make it safe:

- **Scratch is not content.** Annotation state lives **only** in `uiState`, never in the Model, so no persistence path (session save, server save, export JSON, project zip) can reach it — the single most important invariant of the feature, asserted by a dedicated exclusion test. A scratch overlay that could accidentally save would be a data-integrity trap.
- **Capture only when armed.** The overlay intercepts pointer input **only while a draw tool is active**; with the palette open but idle, normal canvas selection/pan still work. Collapse *hides* the drawing without discarding it (collapse ≠ delete); a single explicit Clear is the only wipe — destructive actions are never a side effect of a view toggle.

### 8.12 The canvas region's pixels have their own fidelity contract

This section governs where surfaces sit; the *pixels rendered inside* the canvas region (the WebGL2 bulk substrate — atlas, blending, line geometry, export) are governed by [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md) ([ADR 0038](../adr/0038-webgl-instanced-render-substrate.md)). Touch that layer → read it first.

---

## 9. Touch & pointer interaction

Touch and pen are first-class, not a mouse emulation. The whole interaction surface runs on **Pointer Events** ([ADR 0018](../adr/0018-touch-pen-gesture-contract.md)); `pointerType` splits mouse from touch/pen, and the desktop/mouse path is byte-for-byte unchanged (regression-pinned by the desktop e2e suite).

### 9.1 Direct manipulation — disambiguate by what's under the finger

There is no touch tool-palette and no tap-to-place. At touch-down the gesture machine looks at what's under the finger and commits to one interpretation (the Figma / Miro / Lucidchart model):

| At touch-down | One finger | Two fingers |
|---|---|---|
| On a node | drag moves it; tap selects | pinch zoom + pan |
| On a connector endpoint handle | drag reconnects | pinch |
| On empty canvas | drag pans; tap clears selection | pinch |
| A tool mode is active (lasso / rectangle / connector / …) | drag drives the tool | pinch |

**Move IS drag** — there is no separate "pick up" step. Don't add tap-to-place or long-press-to-move; they compete with this model.

### 9.2 Long-press is a *contextual reveal*, and it fires during the hold

Hold on a node → its **context menu** opens **while the finger is still down** (≈450 ms; ADR 0027 §2 — the per-item command surface that replaced the removed floating action bar), so the user sees the result and then lifts naturally — never "lift, wait, menu appears." Hold on empty then drag → a one-shot marquee lasso, inferred from the gesture so the user never has to switch to the lasso tool first. Any movement past tap-slop cancels a pending hold (it was a drag, not a press).

### 9.3 Affordances appear only when the gesture is live

Touch has **no hover**, so any preview tied to mouse position would paint at a stale spot the instant a tool is armed. Preview chrome must stay hidden until the gesture actually engages: the Elements-panel drag ghost is suppressed at icon-tap and revealed on the first drag move (`PlaceIconMode.suppressPreview`). The rule generalises — *don't show a follow-the-cursor affordance on touch until there is a live drag to follow.*

### 9.4 Suppress the platform's default touch chrome

Mobile WebKit/Blink paints a translucent grey tap-highlight over the pressed element on every touch; on dense canvas controls it reads as the whole screen "dimming." Kill it globally (`-webkit-tap-highlight-color: transparent`) so deliberate app affordances are the only feedback.

### 9.5 Modes never see a PointerEvent

The mode reducers stay written against the internal `SlimMouseEvent` adapter; the touch machine forwards synthetic mouse-shaped events into the existing modes. A new gesture is wired by translating it to the mode contract, **not** by teaching every mode about pointers. Listeners bind to `window` (not the renderer element) so a gesture that crosses element boundaries mid-drag keeps its captured pointer.

---

## 10. Reference implementations

When building parallel surfaces, **read these first**:

| Pattern | Reference file |
|---|---|
| Layout primitive | [`Section.tsx`](../../packages/axoview-lib/src/components/ItemControls/components/Section.tsx) |
| Touch / pen gesture machine | [`useInteractionManager.ts`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts) (search `onTouchPointerDown`) |
| Tabbed item panel | [`NodePanel.tsx`](../../packages/axoview-lib/src/components/ItemControls/NodeControls/NodePanel/NodePanel.tsx) |
| Label field + inline action buttons | [`NodeInfoTab.tsx`](../../packages/axoview-lib/src/components/ItemControls/NodeControls/NodeInfoTab/NodeInfoTab.tsx) |
| Collapsed identity + notes panel sections | [`MetadataSection.tsx`](../../packages/axoview-lib/src/components/ItemControls/components/MetadataSection.tsx) · [`NotesSection.tsx`](../../packages/axoview-lib/src/components/ItemControls/components/NotesSection.tsx) — see §5.1 |
| Connector parity with node | [`ConnectorControls.tsx`](../../packages/axoview-lib/src/components/ItemControls/ConnectorControls/ConnectorControls.tsx) |
| Layer row with rename + action toggle | [`LayerItemRow.tsx`](../../packages/axoview-lib/src/components/LayersPanel/LayerItemRow.tsx) |
| Keyboard-first dialog | [`ConfirmDialog.tsx`](../../packages/axoview-app/src/components/ConfirmDialog.tsx) |
| Inline canvas rename | [`Node.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Nodes/Node/Node.tsx) (search `inlineEditNodeName`) |
| Theme-driven typography contract | [`theme.ts`](../../packages/axoview-lib/src/styles/theme.ts) — see §1.5 |
| Standard search input (panel-level) | [`Searchbox.tsx`](../../packages/axoview-lib/src/components/ItemControls/IconSelectionControls/Searchbox.tsx) |
| Counter-scaled canvas-anchored chrome | [`ViewModeInfoPopover.tsx`](../../packages/axoview-lib/src/components/ViewModeInfoPopover/ViewModeInfoPopover.tsx) — see §8.8 |
| Quiet mode banner | [`SessionModeBanner.tsx`](../../packages/axoview-app/src/components/SessionModeBanner.tsx) — see §8.5 |
| Validation surfacing | [`useInitialDataManager.ts`](../../packages/axoview-lib/src/hooks/useInitialDataManager.ts) — see §6.3 |

---

## 11. Whole-experience coherence

A change to one surface is reconciled against **every surface it mirrors or feeds.** The selection two-way sync (§4.1), item-type parity (§5), and the edit / view / present mode split are all places where a "local" change silently obligates a matching change elsewhere.

Before shipping a UI change, answer three questions and resolve each in the **same** change:

- **Redundant** — does this make a control, settings section, or affordance pointless? Remove it now; a dead toggle is debt. (e.g. once right-click is fixed to pan, the right-click-pan toggle in a settings panel no longer makes sense — the whole section may go.)
- **Contradicts** — does it collide with another change or an existing affordance? (e.g. right-click = pan vs right-click = context menu.) Reconcile; don't ship both.
- **Orphaned** — does it leave functionality with no entry point, or depend on a surface that doesn't exist yet? **Grep to confirm the surface is real**, or scope building it. (e.g. "put the command in the context menu" when there is no context-menu component.)

A change that reads correct in isolation but strands a sibling control **is the bug**, not a follow-up. This is the UI-layer expression of [workflow.md Principle 7 — "trace the ripple"](../workflow.md).

## When this document is wrong

It's a snapshot of decisions, not laws. If you find a principle here that contradicts something the user just said in the current session — the user wins. Update this doc afterwards as part of wrap-up so the contradiction doesn't repeat.

Don't silently deviate. If you decide to break a principle for a good reason, write a short note in the relevant ADR explaining why.
