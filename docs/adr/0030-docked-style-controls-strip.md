# ADR 0030 — Docked Style-Controls Strip as the Canonical Styling Surface

**Status:** Accepted
**Date:** 2026-06-29
**Supersedes:** [ADR 0004](0004-connector-name-and-details-panel.md) §"Right-sidebar panel" only — the connector **Style** tab decision; 0004's name/notes parity substance stands. Also cited as partial successor by [ADR 0012](0012-view-mode-node-info-popover.md) and [ADR 0027](0027-canvas-context-menu.md), whose own decisions (view-mode popover / context menu) both stand — only their Style-tab *references* went stale here.
*(Non-supersession context: amends [ux-principles](../guidelines/ux-principles.md) §2.4 / §2.5 / §5.1 / §5.2; fills the [ADR 0005](0005-toolbar-and-dock-layout-contract.md) Group 1 "Format" reserved slot.)*
**Superseded by:** [ADR 0044](0044-on-canvas-icon-resize.md) (**icon size only** — the §1 "icon size" styling entry + its §2 single-target Icon-size gating; icon size became per-node **on-canvas geometry** and the strip Icon-size control was removed). The rest of §1 (all other visual styling), the **Change icon** control, and §2–§4 **stand**.

## Context

An exploratory UX session (commits `92b853d1` → `894cb3b2` → `ae090ddc`, branch `integration`, unpushed) introduced a Google-Docs/Figma-style **docked style strip** — [`TopBarStyleControls.tsx`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx), portaled into the [ADR 0005](0005-toolbar-and-dock-layout-contract.md) Group 1 "Format" slot — and **deleted the per-type Style tab from all four item panels** ([`NodeStyleTab.tsx`](../../packages/axoview-lib/src/components/ItemControls/NodeControls/NodeStyleTab/NodeStyleTab.tsx) removed entirely; `ConnectorControls`/`RectangleControls`/`TextBoxControls` trimmed to two tabs). Styling is now reached **only** through the strip.

This shipped a coherence break (workflow.md Principle 7 / ux §11) that this ADR exists to close:

- **The design language now lies.** [ux-principles §5.1](../guidelines/ux-principles.md) (lines 293, 295) and [§5.2](../guidelines/ux-principles.md) (line 300) still mandate a **Details / Style / Notes** three-tab panel with a Style-tab Delete button. That tab no longer exists for any item type. §5 is the normative spec future item types build against — a live false rule.
- **The exemption is unratified.** [§2.4](../guidelines/ux-principles.md)'s body forbids selection-triggered editing toolbars; the strip's exemption lives only in a §2.4 blockquote (line 191) + a new §2.5, added in the same spike with no ADR. The blockquote also claims the strip "mirrors a side panel" — false, the side-panel styling it references was deleted.
- **The slot was reserved, not specified.** [ADR 0005](0005-toolbar-and-dock-layout-contract.md) §1 reserved the Group 1 "Format" position but explicitly left "what control goes there" to a future feature ADR. This is that ADR.

The strip itself is sound: single 1113-line component, internally componentized, reads `uiState.itemControls` (the [ADR 0006](0006-canvas-selection-contract.md) single source of truth), writes via `useScene()`. The decision below ratifies the **surface model**, not the implementation.

## Decision

**The docked style strip is the single canonical surface for visual styling of every item type.** Per-type Style tabs are retired; item panels carry no styling at all.

> **Panel shape — read the 2026-07-05 supersession in §4 (Doc amendments) below before citing this section.** The original wording here was "item panels are **Details / Notes** only", i.e. two tabs. Commit `987eaaf` replaced that with a **single collapsible-section deck** (content section + Notes + Metadata disclosures) across all five item types. **This ADR is the one home for panel shape** — 0004/0012/0027/0031 all point here rather than restating it, precisely because restating it is what let one commit falsify four ADRs at once. The strip-as-sole-styling-surface decision (the substance of this ADR) is unaffected.

### 1. Surface division of labor (the coherence contract)

| Surface | Trigger | Owns |
|---|---|---|
| **Docked style strip** | always present, selection-gated | **all visual styling** — text color/size, B/I/S, background/fill, rectangle border, connector line color/style/type/width/arrow, icon size |
| Context menu ([ADR 0027](0027-canvas-context-menu.md)) | right-click / long-press | per-item **commands** — incl. **Delete** (relocated from the dead Style tab) |
| Details panel | double-click | **Details** (name, link, show-name, type-specific) + **Notes** |

No styling control lives in two surfaces. The strip is the styling path; the panel is identity + notes; the menu is commands.

### 2. Selection gating (inherits ADR 0006)

The strip acts when `itemControls` targets **exactly one** item (`selectedIds.length === 1`), OR — per the amendment below — when a **homogeneous** multi-selection is active. With `0` selected, or a **heterogeneous** multi-selection, every control is **disabled** (not hidden) per §2.5 — the user still learns the full command surface. **Exception:** when a creation tool is armed with nothing selected (e.g. the connector tool), the connection-color + line-options controls edit the session-scoped *pre-draw defaults* (`uiState.connectorDefaults`), which the next-drawn item inherits.

> **#8 (2026-07-01) — pre-draw style is one-shot, not sticky.** Owner picked resolution (a): each new connector draws with the **baseline** style, not the last-used. `connectorDefaults` is **reset** (`resetConnectorDefaults`) after every connector commit, so a style set in the strip applies to exactly one draw, then reverts — matching rect/text/label (which carry no persistent style). This removes the "surprise second line" (H1) without adopting the sticky-last-used convention.

#### Amendment (2026-06-30) — bulk styling on a homogeneous multi-selection (owner #7/#11)

The original "`>1` → every control disabled" rule blocked the single most-requested efficiency win (restyling N connectors / N labels one at a time — owner UX-sweep #7, a hard wall for diagram-builder personas). It is **superseded** for the homogeneous case:

- When **every** item in a `>1` selection shares a `.type` (all CONNECTOR, all ITEM, all LABEL, all RECTANGLE, all TEXTBOX), the strip enables and treats the selection as a **bulk target**. The control values display the **representative** (first selected) item; each control's writer **fans out** the change over the whole selection inside one `useScene().transaction()` so it lands as a **single undo entry** (precedent: `deleteSelectedItems`).
- A **heterogeneous** multi-selection stays fully disabled (a cross-type style edit isn't meaningful).
- **Single-target-only controls** stay gated to exactly one selection even within a homogeneous bulk: **Change icon** and **Icon size** (an icon is a shared model asset) and the **Rich-text** editor (per-character, can't target a set). They show a "one at a time" tooltip when a bulk is active.
- **#11 (relative font-size):** the text-size popover gains a **+/− stepper** for node labels / floating Labels that nudges **each** selected target from *its own* current px size (clamped; nodes 10–24, labels 8–48), preserving relative size differences across the selection — routed through the same transaction. The absolute % slider still sets all to one value.

This keeps ADR 0006 as the selection source of truth (the strip reads `selectedIds`); it only widens *when* the strip acts.

#### Amendment (2026-07-02) — unified cross-type label sizing (owner: "this kind of consistency, everywhere")

The **per-type** font-size ranges in the 2026-06-30 amendment (point #11: "nodes 10–24, labels 8–48") are **superseded** by one shared sizing model — the owner's stated target for the surface generally (see [ux-principles §5.4](../guidelines/ux-principles.md)):

- **One base size.** `LABEL_BASE_FONT_PX = 18` ([`labelSettings.ts`](../../packages/axoview-lib/src/config/labelSettings.ts)) is the on-canvas default for **node labels, floating Labels, and connector labels** alike (bumped 14→18 so labels read without hand-bumping each one).
- **One range + one stepper.** The strip's size control shares a single px range **10–40 / step 2** (`LABEL_SIZE_MIN/MAX/STEP`) across all three label types, and the relative **+/−** stepper nudges each from its own current size (was node/floating only). This replaces the divergent 10–24 / 8–48 ranges above.
- **Cross-type on a mixed selection.** The stepper also applies across a **heterogeneous** label-bearing multi-selection (commit `2381bc7`) — the one place the strip acts on a mixed selection, because "make these all a bit bigger" is type-independent.
- **Exception:** the **text box** keeps its tile-space zoom scale (0.15–0.9) — its size scales *with the diagram*, not as screen-px chrome, so it is deliberately excluded.

The pattern to mirror for future label-like text: **one base, one range, one control — derive, don't duplicate per type.**

#### Amendment (2026-07-03) — rich-text popup retired; dual-scope format cluster ([ADR 0034](0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md))

The **Rich-text editor is removed from the single-target list above — it no longer exists.** Text boxes are edited inline on canvas and formatted from the strip like every other type. The strip's format cluster is **B/I/U/S + lists** with **two scopes**: an element selected → the whole content; a text box being edited → the live caret/range. Homogeneous bulk text boxes fan out whole-content formatting (the former bulk dead-end is closed). Change icon and Icon size remain the only single-target exceptions. Full contract in ADR 0034.

#### Amendment (2026-07-02) — identity name → Metadata section; the strip Link control

Two follow-on reshapes landed after §4's amendments and are recorded for the doc trail:
- **Identity `name` moved out of the inline Details field into a collapsed "Metadata" disclosure** (`MetadataSection`) shared by node/connector/rectangle/textbox — see the [ADR 0032](0032-node-name-caption-label-model.md) 2026-07-02 amendment. §62 below ("KEEPS the Name field") is refined by that: the field is now **Label** (on-canvas text) with identity name in the collapsed Metadata section.
- **The strip gained a Link control** editing `headerLink` (web URL) for node / connector / floating Label.

#### Amendment (2026-07-02) — D2: unified strip Link control (web + diagram)

The **D2** slice (commit `3fa2d1b`) **completed** the unification the bullet above had deferred. The strip Link popover now carries a **Web | Diagram** toggle: **Link-to-diagram** (`modelItem.link`, picked over `linkedDiagrams` with the self-reference filtered) **moved out of `NodeInfoTab` onto the strip**, and the now-dead `diagramLink*` i18n keys were purged (`a219cab`). Node-only for now — extending diagram-links to connectors / floating Labels is deferred (needs a `link` field + view-mode nav on those types). View/present readers (`NodePanel` LinkedDiagramSection, `ViewModeInfoPopover`) are unchanged. This **supersedes** the earlier "not on the strip … node-only in the Details deck" statement.

### 3. Mode + portal contract

The strip renders **only in `EDITABLE` mode**, via `createPortal` into an app-supplied DOM slot (`styleControlsPortalTarget`, a callback-ref target the app provides through `DiagramLifecycleProvider`). This is the same lib→app bridge pattern as the sidebar-toggle portal. View/present modes never mount it (consistent with §8.10 ephemeral presentation chrome).

### 4. Doc amendments this ADR carries (implemented in the productization slice)

- **§5.1** — canonical panel becomes **Details / Notes**; the "Style tab: visual properties + Delete button" bullet is removed; Delete is relocated to the §2.4 context-menu surface; a cross-reference points styling to the strip (§2.4/§2.5).
- **§5.2** — connector tab enumeration drops "Style" (Details/Notes); connectors remain full peers.
- **§2.4** — the blockquote is reworded: the strip **is the canonical styling surface** (not "mirrors a side panel"); the stale "side-panel styling fallback" framing is removed. The matching false header comment in `TopBarStyleControls.tsx` is corrected.
- **§2.5** — retained as-is (the enabled/disabled contrast standard); this ADR ratifies it.

> **Resolved (2026-06-30):** the Details tab **KEEPS the Name field** — rename is also available via canvas/Layers **F2**, but Details remains the discoverable home and co-hosts the **inline link button** (edits `ModelItem.headerLink`) + the **show/hide-name toggle** (edits `ViewItem.showLabel`). Nothing is re-homed. The panel stays the two-tab **Details / Notes** shape. (Slice 0, [ADR 0032](0032-node-name-caption-label-model.md).)
>
> **Superseded (2026-07-05, round-8 deck dedupe):** the node deck no longer co-hosts the inline link button or the show/hide-name eye — **both are strip-only now** (the strip Link control + the strip show/hide eye; commit `af43a08`), and the dead `focusLink` command was dropped. The panels are a **collapsible-section deck** (content section + Notes + Metadata disclosures), **not** a two-tab Details/Notes shape (commit `987eaaf`); identity `name` lives in the collapsed Metadata section.

## Consequences

**Positive:**
- One styling surface, globally consistent across item types — the de-dup the spike performed becomes the sanctioned model, not an accident.
- The design language stops contradicting the shipped UI; future item types get an unambiguous rule ("styling goes in the strip; the panel is Details/Notes").
- Fills ADR 0005's reserved slot with a specified contract.

**Negative / risks:**
- The strip becomes a single point of failure for styling — it **must never be clipped/unreachable** (the narrow-viewport overflow gap is a must-fix, tracked in the tactical plan).
- Power users lose an at-a-glance "all properties of this item" panel view; styling now requires the toolbar.
- Two-way reconciliation debt: every doc/comment that named a Style tab must be swept (grep gate below).

## Implementation notes (non-binding)

- The amendment is doc + comment edits only; the code already matches the decision.
- Keep the strip's per-type write logic the single writer; do not re-add styling to any panel.
- i18n: the strip currently has ~30 hardcoded English strings and no `useTranslation` — ratifying it as a primary surface makes localization a release blocker (separate slice).

## Acceptance criteria

- **Doc grep:** `grep -rn "Details / Style / Notes\|Style tab" docs/` returns zero stale hits after the amendment.
- **Parity test:** a render test ([`panelParity.test.tsx`](../../packages/axoview-lib/src/components/ItemControls/__tests__/panelParity.test.tsx)) pins the shared **collapsible-deck** sections (Notes + Metadata) for node + connector panels (no Style tab). *(The original "Details / Notes two-tab" wording was superseded when all five panels were unified into one collapsible-section deck — commit `987eaaf`.)*
- **Manual:** select one item of each type → the correct strip controls enable; select zero or two → all disabled with "why" tooltips; arm the connector tool with nothing selected → color/line controls edit pre-draw defaults and the next connector inherits them.
- **Manual:** Delete is reachable for every item type via the context menu (no Style-tab dependency).
- **Build + lib/app typecheck clean.**

---

### 2026-07-31 addendum — a bulk is read as a whole, not through a representative (STYL-01/02/06/08)

**Owner rulings 2026-07-30** ([DECISIONS.md](../exploratory/DECISIONS.md),
STYL-02 and STYL-08), implemented in the exploratory-remediation wave 4.
Refines §2's homogeneous-bulk amendment, which said what the strip WRITES to
and left what it READS unstated.

**The class it closes.** The strip resolved a representative
(`sel = bulk.ids[0]`, i.e. `selectedIds[0]`) and derived every displayed value
from that ONE member while writing to all of them. That is correct for an
absolute value and wrong for anything derived, and it produced four filed bugs
at once: a B/I/U/S press carried the representative's whole four-field quartet
to every member, wiping formats nobody touched (**STYL-01**); the press
DIRECTION came from the representative, so a mixed selection normalised to its
opposite (**STYL-02**, and **STYL-06** through the text-box content path); and
because `selectedIds[0]` is scene order for a lasso and array order for
Ctrl+A, the same set of items styled differently depending on how it was
selected (**STYL-08**).

**The rule.**

1. **A toggle asks the whole selection.** Its state is a tri-state —
   `all → on`, `none → off`, otherwise `mixed`, rendered with
   `aria-pressed="mixed"` (ARIA's third value) and a dashed outline. One press
   applies to everyone unless everyone already has the format:
   `next = state !== 'on'`. This is the Word / Docs / Slides / Figma / Lucid
   contract.
2. **A toggle writes exactly the field it was pressed for.** The three label
   types' four booleans live in three naming schemes (ADR 0033), so the patch is
   built through one map per type rather than by hand.
3. **An absolute control shows the shared value, or "Mixed".** Never
   `bulk.ids[0]`'s value. Sliders render `Mixed` in their readout, colour bars
   render a striped swatch, and exclusive toggle groups select nothing.

The representative survives only as "which type-keyed hook is live" — it no
longer decides any value.

**Where it lives.** [`utils/bulkStyleTarget.ts`](../../packages/axoview-lib/src/utils/bulkStyleTarget.ts)
(`deriveTriState`, `nextToggleValue`, `deriveSharedValue`, the three field maps
and `formatFieldPatch`); the strip consumes them via `targetIdsFor` / `sharedOf`.

**Gate.** [`bulkStyleFanOut.contract.test.ts`](../../packages/axoview-lib/src/utils/__tests__/bulkStyleFanOut.contract.test.ts)
— field-map completeness against the schemas, a source scan proving the strip
never hand-writes a format field, and an order-independence sweep. Section §4 of
the same file gates the sibling-drift class STYL-05 came from: every writer in
the text-box Border popover goes through one seeded helper, because a text box
with no `borderColor` has no border at all and an unseeded write is invisible
but still stored.
