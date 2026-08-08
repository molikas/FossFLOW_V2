# ADR 0034 — Inline Canvas Text Editing & Dual-Scope Strip Formatting (Rich-Text Popup Retirement)

**Status:** Accepted
**Date:** 2026-07-03
**Supersedes:** none (amends [ADR 0030](0030-docked-style-controls-strip.md) §2 single-target list, [ADR 0031](0031-floating-label-entity-model.md) "rich text stays on plain TextBox" wording, [ADR 0033](0033-element-text-style-field-convention.md) text-box row)
**Superseded by:** none

## Context

The strip's "Rich text" popover (a Quill editor in a `StripButton`, formerly [`TopBarStyleControls.tsx`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx)) was the only editor of `textBox.content` — a popup in a product where every other text-bearing element already edits inline on canvas via the shared `useInlineRename` contract. Its toolbar (B/I/U/S, link, headers, lists, blockquote, code-block) duplicated the strip's own B/I/S and Link controls, and users could not tell why a text box formats in a popup while everything else formats from the strip.

A 2026-07-03 investigation (competitor scan + code audit; full record in the session artifact and `memory/richtext-popup-dedupe-2026-07-03.md`) established:

- **No competitor edits canvas text in a popup** (draw.io, Lucidchart, Miro, FigJam, tldraw, Excalidraw, Google Slides all edit inline). The market convention for a fixed top bar is **one text cluster, two scopes**: element selected → all its text; caret/range while editing → the run (Google Slides / PowerPoint / Figma / draw.io).
- **No competitor offers headers, blockquote, or code-block on canvas text**; the market ceiling is inline styles + lists + links. tldraw dropped blocks deliberately.
- Three S1 defects verified in the current code (see catalog): the strip wrote connector-label sizes the schema rejects (bricked saved diagrams on reload); the cross-type size stepper wrote the dead `nameLabel*` fields; the on-canvas plain-text editor destroyed all rich formatting on a zero-keystroke double-click + click-away.
- The text box's double-click editing was structurally unreachable: the TextBoxes SceneLayer mounts **below** the full-canvas interactions box ([`Renderer.tsx`](../../packages/axoview-lib/src/components/Renderer/Renderer.tsx)), which eats every press — the same failure mode the connector-labels layer documents.

## Decision

**The rich-text popup is retired. A text box is edited inline on the canvas (double-click / F2 / context-menu Rename / place-and-type) with a toolbar-less Quill editor; all formatting is driven from the strip, which becomes a single text cluster with two scopes.**

### 1. Inline editing contract (text box)

- The editor is `ReactQuill` with `toolbar: false` and the existing `formats` whitelist, mounted **in place** inside the text box's projected container, only while editing.
- While a text box is being edited it is **promoted above the interactions box** (a dedicated SceneLayer after the interactions Box, mirroring the hybrid-node promotion) so pointer events reach the editor. The editing state is the store slice `uiState.editingTextBoxId` (renamed from the one-shot `inlineEditTextBoxId`; it now persists for the whole edit session).
- Commit semantics extend ADR 0022 §4: **left-click-away commits, right-click-away and Escape cancel**. Deliberate divergence from the single-line editors: **Enter inserts a newline** (multi-paragraph element; lists need Enter) — commit is click-away only. Clicks inside the strip or any MUI portal overlay (popovers opened from the strip) do **not** end the session.
- Commits are **sanitized write-side** (`sanitizeHtml`, keeping ADR 0029's read-side guard) and are **no-ops when nothing changed** (a dirty flag set on the first real Quill change — never compare plain text against stored HTML).
- Plain-text legacy content is escaped to HTML before seeding the editor (a literal leading `<` can no longer be misparsed). The lossy `htmlToPlain` seed/commit path is deleted.

### 2. Dual-scope strip formatting (the two-scope rule)

The strip's format cluster grows to **B / I / U / S** plus a **bulleted / numbered list** toggle pair, and acts with two scopes:

| Selection state | B/I/U/S + Lists target |
|---|---|
| Label-bearing element selected (node label, floating Label, connector label chip) | element-level boolean fields, as before (**B/I/U/S all element-level** — U landed for all three label types, see **O1** below) |
| Text box **selected** | the **whole content** — the format is applied/removed across the full range **in the content HTML** (single source of truth; no element-level layer to fight) |
| Text box **being edited** | the **live caret/range** via the mounted Quill instance (`quill.format`) |
| Homogeneous bulk of text boxes | whole-content per box, fanned out in one transaction (closes the former bulk formatting dead-end) |

Scope is implied by selection state and never expressed as duplicate controls. A partially-formatted range renders the toggle unpressed; pressing applies the format to the whole target.

The **Link** control gains a text-range mode: while editing a text box with a non-collapsed selection it wraps the selection as an inline link; a selected (non-editing) text box shows a disabled state explaining the recipe. Element links (`headerLink`) are unchanged, and the bulk-node case now fans out like every other bulk write.

### 3. Authoring ceiling for canvas text

Canvas text authoring offers **bold, italic, underline, strike, bulleted/numbered lists, and links** — market parity. **Headers, blockquote, and code-block are retired from authoring** (no buttons anywhere) but remain **render-compatible forever**: the sanitizer allowlist, the canvas `richTextStyles`, and Quill's parse `formats` keep accepting them so legacy content never degrades or is silently rewritten. Text hierarchy is expressed with the text-size control. Notes (deck / view-mode popover prose) keep the full `RichTextEditor` — the ceiling applies to canvas text only.

### 4. Data-model consequences

- `connectorLabelSchema.fontSize` and `connector.nameLabelFontSize` caps lift **24 → 40** to match the ADR 0030 unified range (the strip could already write 26–40, which `safeParse` then rejected on load — a diagram-bricking bug).
- The legacy element-level `textBox.isBold/isItalic/isUnderline` flags are **folded into `content`** once at load (wrapping each block's inline content in `<strong>/<em>/<u>`, the `seedConnectorLabel` precedent), the renderer stops reading them, and creation stops persisting them. The fields stay schema-parseable for round-trip.
- The strip's `'__name__'` / `nameLabel*` styling branches are deleted (unreachable since the ADR 0032 connector decouple); the cross-type size stepper writes each connector's **`labels[].fontSize`** instead of the dead `nameLabelFontSize`.
- The strip's show/hide-label eye extends to connectors (`connector.showLabel` — already schema'd, rendered, and Layers-toggleable).

### 5. Strip behavior rules (ratified for every future control)

1. **Single surface** — all visual styling on the strip; no popup editors. Deck = identity + notes; Layers = structure.
2. **One cluster, two scopes** — element selected → whole text; editing caret/range → the run.
3. **Disabled, not hidden — honestly** — every disabled tooltip names the exact enabling selection and never points at another disabled control.
4. **No dead writes** — every strip write must be schema-legal at the write site and rendered by at least one visible surface.
5. **Same control, same meaning** — semantics (unit, write scope, persistence) identical across types or surfaced in the control; field *names* may diverge (ADR 0033), semantics may not.
6. **Bulk contract** — homogeneous fan-out in one transaction; single-target exceptions enumerated + tooltipped; a bulk-enabled control never writes a partial subset silently.
7. **Content fidelity** — any `textBox.content` editor round-trips losslessly; sanitizer allowlist ≥ editor format whitelist; commits sanitize write-side.

> **Resolved (2026-07-03, owner-directed):**
> **O1** — element-level underline landed for all three label types (`viewItem.labelUnderline` / `label.isUnderline` / `labels[].underline`, ADR 0033 nearest-sibling naming; optional fields, zero-migration). Rendered on both Canvas2D paths (drawn manually under the baseline, like the existing strikethrough rules — decoration-only, so the label layout caches are unaffected) and both DOM paths (combined `text-decoration`). The strip's U toggle now enables wherever B/I/S do.
> **O3** — the cross-type mixed-selection support covers **text color** as well as size: same label-bearing targets (node `labelColor` / floating-Label `color` / each connector `labels[].labelColor`), one transaction, `textColorAllSelected` tooltip.
> **O6** — while a **non-connector** creation tool is armed (rectangle / text / label / icon), every disabled style tooltip swaps to neutral copy naming the recipe (`armedToolPlaceFirst`: place first, then style) instead of "Select a …" non-sequiturs. Per-tool pre-draw defaults stores remain a possible follow-up if demand shows; the connector tool keeps its live pre-draw controls.

**2026-07-03 — Lucid-parity editing pass (owner-directed, same day).** Comparing the shipped inline editor against Lucid exposed that the three renderings of one `content` — the live editor (quill.snow.css), the resting canvas (`richTextStyles`), and the size measurement (`isoMath`) — each used **different formatting geometry**, and none was user-controllable:

- **One line-spacing knob.** Quill makes every line its own `<p>`, so the old `0.2em` p/li margins silently stacked onto `line-height: 1.3` (≈1.5 effective, vs Lucid's 1.2) while the editor used Quill's fixed `1.42`. Now: p/li carry **zero vertical margins**; line spacing is exactly the box's **`textBox.lineHeight`** multiplier (new optional schema field, absent = `TEXTBOX_LINE_HEIGHT` = **1.2**, deliberately unbounded like `fontSize` — the schema-cap S1 lesson). The strip's Text-size popover gains a **Line spacing** slider (0.8–2.5, step 0.1, text box only — Lucid groups it the same way); the editor inherits it live (`.ql-editor { line-height: inherit }` beats snow's 1.42).
- **One list geometry.** List text indents **`CANVAS_RICHTEXT_LIST_INDENT_EM` = 1.5em** in all three consumers (resting `ul/ol` padding; editor override collapsing Quill's 3em default with re-derived marker metrics; measurement adds `indentEm × fontSize` per `<li>`). The measurement previously counted **no** indent — a bulleted box was sized for its bare text and the gutter ate the content width ("one character per line").
- **Markdown list autofill restored — MQA #12 retired.** `- `/`* `/`1. `&nbsp;→ list, in both the inline editor and the Notes `RichTextEditor`, via one shared binding (`utils/quillListAutofill.ts`, a faithful port of Quill 2.0.3's default handler). The original complaint ("input erased") is addressed structurally: markers are visible on both surfaces, and the handler cuts a history entry before converting so **one Ctrl+Z restores the literal typed text**. The `[ ]`/`[x]` checkbox prefixes stay excluded — checked lists are outside the §3 authoring ceiling and the resting render has no checkbox styling. Re-sync the port on Quill upgrades.
- **The box grows as you type** (Lucid convention): the editor sizes `width: max-content` (min 100%) so the longest line extends the box rightward instead of wrapping at the stale committed width — which matches commit, since `isoMath` sizes the resting box to the longest line (content never soft-wraps).
- **No contradicting chrome mid-edit:** `TextBoxTransformControls` suppresses the dashed outline + anchors for the box being edited (its `size` only updates on commit); the editor's own border is the session's selection affordance.

**2026-07-03 — Lucid-parity, second pass (owner-directed; from the Lucid field-test notes).** Four more gaps closed:

- **Manual width + soft wrap.** New optional **`textBox.width`** (tile units, unbounded like `fontSize`): absent = auto (hug the widest line, never wrap — unchanged); present = fixed width — content soft-wraps and the box grows DOWN. Set by anchor-drag via the new **`TEXTBOX.TRANSFORM`** mode — TransformRectangle's transaction choreography, one undo entry per resize, 1-tile floor; near-edge drags move the tile so the far edge stays put. Height for a fixed box comes from a **greedy word-wrap estimate** per block (canvas-measured word widths at the exact px the renderer gives the content — the inverse of `getTextWidth`'s tile mapping), so editor, resting render, and stored size agree. The way back: a **"Fit to text"** context-menu entry (shown only while a manual size is set) clears the field(s).
- **Empty-box lifecycle.** A new text box is born **empty** (`TEXTBOX_DEFAULTS.content` = `''` — nothing canonical persisted anymore); the inline editor shows a localized ghost **placeholder** (`textBoxControls.placeholder`, Quill's `ql-blank::before` re-anchored). An edit session that **ends still-empty deletes the box** — commit-empty and cancel-on-never-committed alike (placement-cancel semantics; also removes the invisible zero-width ghost an emptied existing box used to leave). The e2e POM commits probe text on placement accordingly.
- **Paragraph alignment (left/center/right).** Same dual-scope contract as lists: whole content selected, current paragraph(s) while editing. Serialized as an inline **`text-align` style** on leaf blocks — Quill's **style attributor** (registered globally in RichTextEditor.tsx, `formats` += `align`) so one representation flows through `getSemanticHTML` → the ADR 0029 sanitizer (DOMPurify html profile keeps `style`, pinned by test) → the resting render with zero alignment CSS. `'left'` is the default and stored as **absent**; the whole-content transform lives in `applyAlignFormat` and alignment survives the list⇄paragraph toggle. Strip: a three-button group after Lists (`strip-align-left/center/right`), disabled outside text boxes (honest tooltip, armed-tool aware). Vertical alignment stays out — box height hugs content, so it has no meaning here.
- **External-paste normalization pinned.** No code change needed — Quill's clipboard matchers (formats allowlist) + the ADR 0029 write-side sanitize already normalize Word/Docs-style payloads; a new e2e drives a synthetic `ClipboardEvent` with dirty HTML through the real paste path and asserts scripts/handlers/`mso-*` junk are gone while recognized formatting survives (`b` → `strong`).

**2026-07-04 — owner local-test findings on the second pass.** Five fixes:

- **Resting render honored neither wrap nor width — root cause: Quill's `getSemanticHTML()` serializes EVERY space as `&nbsp;`**, so a committed paragraph was one unbreakable "word" (the flex child then floors at its min-content width and can't wrap). **`normalizeQuillHtmlSpaces`** converts `&nbsp;`/U+00A0 back to real spaces on **commit** and on **load** (legacy content gains wrap opportunities too). With that, the resting white-space contract is: **auto box → `pre`** (never soft-wrap, space runs kept — existing diagrams render unchanged), **fixed box → `pre-wrap` + `width: 100%` + `min-width: 0` + `break-word`** (wraps at the box edge exactly like the editor).
- **Full rectangle-style resize.** New optional **`textBox.height`** — a **minimum** box height (content still grows past it; text never clips). The anchor set grows to all **4 corners + 4 edges**: run-axis anchors write `width`, row-axis anchors write `height`, corners write both, mapped per orientation in `TransformTextBox`; a single-axis drag never writes the other axis (a height drag can't freeze an auto width).
- **Text color is dual-scope** (extends the §2 rule to color): while editing with a text range, the strip's color picker writes an inline color on that RANGE (`formats` += `color`; via the bridge's `lastRange`, since the picker popover steals focus); otherwise it writes the element-level base color as before. The swatch shows the range color while editing.
- **The text-direction toggle moved into the text cluster** (it sat stranded past the connector controls behind a divider). An on-canvas rotation handle was considered and parked — direction is a two-state iso-plane flip, not free rotation, so a bar toggle next to Alignment communicates it better.
- **The range-Link URL field is a local draft, applied on Enter/blur.** The old controlled field derived its value from the live selection's formats — which vanish the instant focus enters the popover — so every keystroke re-rendered as `''` ("typing doesn't register") and each partial URL was written onto the range.

**2026-07-04 — owner local-test round 2.** Four more:

- **Iso-Y multi-row placement fix.** The Y projection maps the container's row axis toward world −x while the selection footprint extends +x (`getTextBoxEndTile`), so any multi-row Y box painted its rows OUTSIDE its own selection (probe-verified). The container now anchors its projection origin at the **far row** (`originOverride = {x: tile.x + rows, y: tile.y}`); single-row boxes are unaffected. Additionally, the **direction toggle resets manual width/height** — a plane flip changes which world axis the run/row sizes mean, and carrying them across read as a random big box with stranded text; the box re-hugs its content on the new plane.
- **Resize controls stay up during the edit session** (Lucid parity — hiding them made place-and-type feel resize-less). The dashed bounds show the last committed size; pressing an anchor first commits the session (the editor's capture-phase click-away runs before the anchor's pointerdown), so a resize always starts from fresh bounds. The promoted editor mounts ABOVE the transform layer — where a 30px anchor overlaps a small box the text wins the click (caret placement); each anchor's outer half sticks past the box edge and stays grabbable. An EMPTY box's auto width floors at 1 tile so the session has a visible, graspable footprint.
- **Text-box background fill.** New optional **`textBox.backgroundColor`** (floating-Label naming); absent = transparent (today's look). Rendered on the resting container (whole footprint incl. manual height, subtle radius) and as the editor's sheet color (replacing the hardcoded white); the strip's **Background** control gains the text-box branch (bulk-aware; clearing removes the fill).
- **One Lucid-style alignment control.** The three inline H-align buttons collapse into a single strip button opening a **3×3 grid**: horizontal (left/center/right — the existing dual-scope content alignment) × vertical (**`textBox.verticalAlign`**: top/middle/bottom, element-level, absent = top — positions content inside the box footprint, which a manual height makes visible; the editor is the same flex child so it aligns identically mid-edit). Defaults (top-left) stored as absent; a grid cell writes both axes in ONE update per box; the live-editing horizontal path uses `formatLine` on the bridge's `lastRange` (the popover steals focus, `getSelection()` is null — same pattern as range color/Link).

**2026-07-04 — owner local-test round 3.** Four asks plus one bug the new e2e flushed out:

- **The session frame is live.** The editor publishes its measured footprint on every change to a new UI-store field **`editingTextBoxSize`** — measured with the exact commit pipeline (`normalizeQuillHtmlSpaces` → sanitize → `getTextBoxDimensions`), so the preview EQUALS the post-commit size. The projected container and the transform bounds both read it: bounds/anchors hug the draft while typing instead of freezing at the last committed size (and the iso-Y `originOverride` tracks it, so growing rows stay inside the frame mid-edit). An EMPTY box measures its **placeholder string** — the dashed frame wraps "Type something" instead of sitting a tile wide beside it. Reset on any session change; per-keystroke writes dedupe on equal tile sizes.
- **The editor sheet is gone.** The inline editor drew its own white fill + grey outline + rounded corners + extra `px: 0.75` padding — over a transparent resting render that read as a misaligned sticker, and it shifted text ~6px versus rest. The editor is now transparent and chrome-less (the container behind it paints `textBox.backgroundColor` when set) with resting-identical padding; the live-tracked dashed bounds ARE the session frame.
- **Ctrl/Cmd+K adds a link everywhere.** Canvas editor: a shared Quill binding (`utils/quillLinkShortcut.ts`) expands a collapsed caret to the word under it (Docs behavior) and routes to the strip's Link popover via a window event the Link StripButton subscribes to (new `openEvent` prop) — snow only self-binds Ctrl+K when a toolbar `.ql-link` button exists, so the toolbar-less canvas editor owns the key. Selected node / connector / floating Label: a window-level listener in the strip (typing surfaces excluded). Label inline edit: the contentEditable routes the combo to the same popover (element `headerLink`; the popover's focus steal commits the text first). Deck editors keep Quill snow's native Ctrl+K (their `.ql-tooltip` is visible and styled). Link tooltips advertise the shortcut.
- **Alignment control re-cut with standard icons.** The hand-rolled 3×3 composite-cell glyphs were unreadable at 18px (owner: "the choice of icons is really bad"). No standard set HAS the nine composites (Lucid hand-draws theirs), so the popover is now **two rows of stock MUI icons** — horizontal `FormatAlign*` over vertical `VerticalAlign*`, the PowerPoint/Figma decomposition — still ONE strip button, whose own icon mirrors the current horizontal alignment. The axes now apply **independently** (a 3×3 cell coupled a paragraph-scope range format to an element-level write on every click). Per-button tooltips deliberately absent: in the tight popover a lingering tooltip overlapped the row below and swallowed its clicks (aria-labels carry the names).
- **Spurious collapsed-selection guard.** When focus moves from the editor into a strip popover, Chromium can follow the blur's `null` selection-change with a spurious collapsed `{index: 0, length: 0}` inside the editor — which clobbered the bridge's sticky `lastRange` and emptied/disabled the Link popover mid-flight (caught by the new Ctrl+K e2e). The bridge records ranges **only while the editor owns focus**, and strip consumers read the new `getEffectiveEditorRange()` (live selection when focused, `lastRange` otherwise) — which also keeps pressed states/enablement stable while any popover holds focus.

**2026-07-04 — Docs-parity link UX (owner: "compare that to the Google Docs experience").** Linked text in the canvas editor had no affordance at all — Quill's own `.ql-tooltip` is hidden (misplaces under the iso transform), so a link only revealed itself in the committed `<a>`. Three pieces close the loop:

- **The link card** (`TextBoxLinkCard`): caret inside a link, or pointer hovering one, pops a Docs-style chip — the URL (clickable, new tab) + copy / edit-inline / remove. It anchors to the link's DOM rect via a body-portaled Popper, so `getBoundingClientRect` (post-transform screen coords) positions it correctly on the projected text at any plane/zoom; the editor's click-away contract already allowlists `.MuiPopper-root`, so using the card never ends the session. Caret detection is blot-based (`Quill.find(anchor)` → `getIndex`/`length`), so edit/remove format the link's exact extent regardless of where inside it the caret sits. Card writes count as session changes (`markChanged`).
- **The apply flow closes like Docs.** Enter in the strip's range-URL field applies, CLOSES the popover (new StripButton `closeEvent`, mirror of `openEvent`), and lands the caret one char inside the linked text — the card pops up as confirmation. Two traps found on the way: (a) MUI's popover focus dance can blur the autoFocused field right on mount, and an unconditional blur-apply fired phantom writes (now dirty-checked, and Enter's apply suppresses the unmount blur); (b) closing synchronously INSIDE the Enter keydown moves focus mid-keystroke and the key's default action lands in the refocused editor — observed as a phantom `\n` inserted at index 0, shifting the just-applied link off its range (now `preventDefault` + the close deferred one macrotask).
- **URL forgiveness for text links** (`normalizeWebLinkUrl`): "google.com" → "https://google.com" on both the strip's range apply and the card's inline edit (blank = remove, also Docs). Element-level `headerLink`s keep their raw semantics.

The deck editors already had the Docs loop natively (snow's tooltip shows target + edit/remove on caret-in-link) — the card brings the canvas editor to parity rather than replacing the deck flow.

**2026-07-04 — owner round 6: the card owns Ctrl+K; canvas rotate handle; text-box borders.**

- **Ctrl+K opens the INLINE card, not the strip popover.** With the card shipped, routing the shortcut to a popover at the top of the screen read as disjointed (owner: "doesn't really make sense, given that we have this nice inline link edit"). The binding now dispatches an edit-at-selection event the card handles: it opens in EDIT mode right at the text — prefilled when the caret sits in an existing link, blank over a plain selection (the caret still auto-expands to the word). The create case has no `<a>` to anchor to, so the card snapshots the native selection rect before its field steals focus. The strip's Link popover remains the surface for element-level headerLinks (selected node / connector / Label, and the Label inline editor's Ctrl+K). Trap of the day, third appearance: the card's Enter refocused the editor INSIDE the keydown and the keystroke's default action split the paragraph mid-link — `preventDefault` + the refocus deferred one macrotask (the same fix as the strip URL field; this is now a standing rule: never move focus into Quill synchronously inside a keydown handler).
- **On-canvas rotate handle** (owner: "de-dense the top control"; Lucid parity): a small round handle floats above the selection's topmost point for text boxes AND rectangles — one click = quarter-turn (±90° are the same move for both). TextBox: the iso-plane flip (orientation X↔Y, manual size reset — the strip's text-direction toggle is DELETED, its four i18n keys retired for `rotate90`). Rectangle: the footprint transposes about its center (a square is a no-op and skips the undo entry). Pressing the handle never reaches the canvas layer, so the selection survives; mid-edit, the press commits the session first (same capture-phase contract as the resize anchors).
- **Text-box border** — the rectangle's full option set (`borderColor` / `borderWidth` / `borderStyle` SOLID|DOTTED|DASHED / `borderOpacity`), rendered as a CSS border on the shared container so editing and rest look identical. One deliberate divergence: absent `borderColor` = NO border (a rectangle derives a stroke from its fill; a text box has nothing to derive from) — so the strip's Border popover (now enabled for text boxes, bulk-aware) seeds a default color when a style/width is picked first, and clearing the color IS the no-border affordance.

**2026-07-04 — owner round 7 (polish pass: "overall it works fine").** Three refinements:

- **Rotate handle legibility**: 32px handle with the stock `RotateRightOutlined` glyph at 20px (the first cut's 26px/`Rotate90DegreesCcw` at 14px was "too small and non-standard").
- **Mid-edit geometry writes re-measure the live draft.** A strip write that changes text geometry during an edit session (font-size / line-spacing sliders, a manual-size or orientation write) re-measured the MODEL against the stale stored content, while the session's live preview (`editingTextBoxSize`, which sizes the container/fill/bounds) only refreshed on typing — so cranking the font mid-edit left the old footprint under the freshly enlarged text ("the old size constraints are applied"; an explicit anchor resize commits first, which is why it "didn't reproduce" there). The parent now keeps the last draft and re-measures it whenever a geometry-relevant field changes mid-session.
- **The link card learns Docs' second half**: the URL field gets the "Search or paste a link" ghost text, and typing filters a suggestion list of the OTHER DIAGRAMS (the same `linkedDiagrams` feed the strip's node picker uses; hidden once the draft clearly is a URL). Picking one writes an internal link — a `#diagram:<id>` fragment href (survives Quill's protocol whitelist AND the ADR 0029 sanitizer) — the card then displays the target's NAME, not the sentinel. Clicks on internal links in the resting render dispatch the existing `axoview-navigate-to-diagram` event (the NodePanel's mechanism): plain click navigates in view/explore modes; in EDIT mode plain click stays selection and Ctrl/Cmd+click navigates (Docs convention), with the useless fragment jump suppressed either way.

**2026-07-05 — owner round 8: Ctrl+K everywhere means the CARD everywhere; deck dedupe; Enter confirms.**

- **The element link card** (`ElementLinkCard`, mounted once beside the transform manager): Ctrl+K while inline-renaming ANY plain-text label — a floating Label, a node name, a connector label — now opens the same inline link UI text boxes have, anchored at the label (the strip popover at the top was the inconsistency). Plain-text labels carry one link, the element `headerLink`, so that's what the card reads/writes: Enter applies with the Docs URL-forgiveness, then the view chip (open / copy / edit / remove); Escape and click-away dismiss. The three rename editors dispatch a shared window event carrying the write target ({LABEL id} / {NODE id} / {CONNECTOR_LABEL connectorId+labelId}) plus a rect snapshot taken before the card's field steals focus — which also commits the rename first, same contract as the resize anchors. The strip's Link popover remains ONLY for the selected-element (not renaming) Ctrl+K and the button itself.
- **Node deck dedupe.** The Details deck's Add-link toggle, link field, and hide-name eye were duplicates of the strip's Link control and show/hide eye — deleted (with the dead `focusLink` action-bar command and five retired i18n keys ×13: `nodeInfoTab.addLink/removeLink/linkPlaceholder`, `nodePanel.showName/hideName`). The deck's Label section is now just the text field; the read-only panel keeps its open-link affordance.
- **Enter confirms the strip's element link field.** Element mode writes live on change, so Enter looked dead — users didn't know click-away was the commit. Enter now closes the popover (the existing `closeEvent` plumbing), making it read as "confirmed".

**2026-07-05 — owner round 8b: linked labels LOOK and BEHAVE like links.** Adding a link via Ctrl+K left the label visually unchanged and inert — nothing like the text box, where linked text is styled and hover raises the card. Now, on all three label surfaces:

- **Visual**: a labeled element with a `headerLink` renders link-blue (a user-picked color wins) + underlined. Floating Labels get it in the Canvas2D paint (`drawLabelChip` — decoration-only, so `headerLink` stays out of the layout cache; `LABEL_LINK_COLOR` joins the chip constants); node captions keep their `<a>` but now colored; connector chips extend their view-mode-only blue to edit mode and always underline when linked.
- **Hover card (edit mode)**: pointer over a linked label raises the ElementLinkCard as a VIEW chip — URL + open/copy/edit/remove — with the same grace-dismiss the text-box card uses (the event gains `mode`/`hover` fields plus a HIDE counterpart; clicking Edit pins the card). Sources: the floating Label's hit-proxy div, the node caption `<a>`, the connector chip.
- **Click convention unified**: a node caption's plain click used to OPEN the URL even in edit mode — it now selects the node, with Ctrl/Cmd+click opening (the same convention as text-box internal links); read-only keeps click-to-open, and the connector chip's view-mode click behavior is unchanged.

**2026-07-05 — owner round 9: a node's link is only a link once selected.** Round 8b's node-caption fix only touched `Node.tsx`'s DOM `<a>` — the anchor mounted for the SELECTED node (promoted into the DOM overlay). Every OTHER node's name is drawn by `NodesCanvas` (Canvas2D, ADR 0019) with its own independent styling/hit-testing, which had no `headerLink` awareness at all: an unselected linked node showed plain black text with no hover card and no click affordance — the owner's screenshot pair (selected vs. not) showed the link vanishing the moment the node was deselected.

- **Visual parity on the resting paint**: `NodesCanvas`'s per-node label draw now computes `linked = !!modelItem.headerLink` and mirrors `drawLabelChip`'s rule — `textColor = node.labelColor || (linked ? LABEL_LINK_COLOR : chip.text)`, underline forced (`labelUnder = node.labelUnderline || linked`) — applied to both `fillStyle` and the manual underline/strikethrough rule-drawing (Canvas2D has no `text-decoration`). Decoration-only, same as the DOM/floating-Label paths: the geometry cache key (`layoutKey`) is unaffected.
- **Hover card on the resting hit-proxy**: `NodeLabelHitLayer` (the invisible per-node div that lets an unselected node's label be grabbed/dragged/double-clicked without selecting first) now also carries each node's `headerLink` and, when set, dispatches `EDIT_ELEMENT_LINK_EVENT`/`HIDE_ELEMENT_LINK_EVENT` on pointer-enter/leave — the same view-chip hover the selected node's `<a>` and the floating Label's hit-proxy already raise. Cursor switches to `pointer` (from `grab`) over a linked name so the affordance reads correctly at rest; drag-to-reposition is unchanged (press-and-move still wins over the hover-only card).
- **Testability without pixel-sampling**: `NodesCanvas` publishes a new anti-cheat dataset counter, `canvas.dataset.linkedLabelsDrawn`, alongside the existing `drawCount`/`labelsDrawn` — incremented whenever a drawn label applied the linked style. This lets a test prove the Canvas2D branch executed without sampling pixel color.

## Consequences

**Positive:**
- One editing model (inline on canvas) and one formatting surface (the strip) across every element type; the popup's ten controls collapse into a U toggle + a list pair with no net strip-width growth (relevant to the F1 overflow slice).
- The confirmed data-loss path (zero-keystroke flatten) and the diagram-bricking size write are gone.
- Bulk text-box formatting works for the first time.

**Negative / risks:**
- Quill mounts inside a CSS-matrix-transformed container; its selection-dependent UI (`.ql-tooltip`) is disabled (links go through the strip) — any future Quill UI must be vetted under the transform.
- Whole-content formatting for a *selected* box is a DOM-transform of the stored HTML (no mounted editor); Quill re-normalizes on next edit. The transform emits only Quill-whitelisted tags to keep the round-trip safe.
- The editor keeps Quill's `getSemanticHTML` space→`&nbsp;` behavior (pre-existing; masked by auto-grow). Tracked as catalog item I-21, not fixed here.

## Implementation notes (non-binding)

- Promotion: `Renderer` filters the editing box out of the lower TextBoxes layer and renders it in a SceneLayer mounted after the interactions box (hybrid-node pattern).
- Strip ⇄ editor bridge: a module singleton (`textBoxEditorBridge`) holding `{ id, quill, lastRange }`; re-render is driven by the `editingTextBoxId` store slice; strip buttons `preventDefault` on mousedown so the editor selection survives.
- Whole-content transforms live in `utils/richTextTransform.ts` (pure DOMParser — no headless Quill, so jsdom tests don't need the Quill runtime); legacy fold-in lives in `utils/foldTextBoxStyleFlags.ts`, run in `useInitialDataManager`'s pre-parse normalization alongside `seedNodeLabel`.

## Acceptance criteria

- **Unit:** `richTextTransform` applies/removes/queries whole-content B/I/U/S + lists on HTML and plain-text content; `foldTextBoxStyleFlags` folds each flag combination into block-safe inline wrappers and clears the flags; connector schema accepts `fontSize` 40 and rejects 41.
- **e2e:** place-and-type drops into the on-canvas Quill editor; typing + click-away persists to `model.textBoxes[].content`; Escape cancels.
- **Manual:** double-click a text box → inline edit (no deck); strip B/I/U/S formats the live selection while editing and the whole content when merely selected; bulk text boxes format together; a connector label sized to 40px survives save + reload; legacy bold/underline text boxes render identically after fold-in; headers/lists in legacy content still render.
- **i18n:** `richText*` keys purged and new keys present across all 13 locales; i18n-completeness test green.
- **Unit (2026-07-03 addendum):** `countHtmlLines` weights p/li by the box's line-spacing multiplier (default pinned at 1.2) with legacy blocks fixed; `splitIntoMeasurableBlocks` emits `indentEm` = 1.5 for `<li>`; `quillListAutofill` converts `- `/`* `/`1. ` (bullet/ordered) with the history-cutoff undo contract, excludes checkbox prefixes, and both editors wire the shared binding.
- **e2e (2026-07-03 addendum):** typing `- ` in the inline editor autoformats to a live bullet list that commits as a real `<ul>` with the typed marker consumed.
- **Manual (2026-07-03 addendum):** a bulleted text box sizes to its content (no per-character wrap); line spacing reads visually identical mid-edit and after commit; the Line spacing slider reflows a multi-line box live; no dashed selection outline while editing.
- **Unit (2026-07-03 second pass):** `countGreedyWrappedLines` pins the greedy wrap math (space-aware breaks, over-long-word hard-breaks); `getTextBoxDimensions` returns a manual width verbatim (1-tile floor) with per-block line-spacing heights incl. blank lines; `TransformTextBox` pins the transaction choreography + anchor→width math per orientation + no-op guard; `applyAlignFormat`/`getWholeContentFormats.align` round-trip inline text-align (absent = left, list-toggle safe); `sanitizeHtml` keeps `text-align` styles while still stripping scripting.
- **e2e (2026-07-03 second pass):** Escape on a never-committed box discards it; Escape on a re-edit reverts without model writes; the strip alignment group writes/removes `text-align` in whole-content scope; a selected text box shows exactly two run-axis anchors and a driven resize commits `textBox.width`; a synthetic dirty-HTML paste commits normalized content (no script/onerror/mso-, `b`→`strong`, no XSS execution).
- **Manual (2026-07-03 second pass):** a placed-then-abandoned box leaves nothing behind; the empty editor shows the localized placeholder; dragging a run-axis anchor wraps the text and grows the box downward, live-consistent with the editor; "Fit to text" restores auto size; center/right alignment reads identically mid-edit, at rest, and after reload.
- **Unit (2026-07-04):** `normalizeQuillHtmlSpaces` converts `&nbsp;` entities and U+00A0 chars to spaces; manual height acts as a minimum in both measurement branches; `TransformTextBox` maps all 8 anchors per orientation (single-axis drags never write the other axis); `formats` pins at 11 with `color`.
- **e2e (2026-07-04):** a selected text box shows 8 anchors; after a width resize the RESTING paragraph is container-wide with no horizontal overflow (it actually wrapped); a TOP-anchor drag commits `textBox.height`.
- **Manual (2026-07-04):** a resized box wraps identically at rest and mid-edit; coloring a selection while editing colors only that run (and the whole box when nothing is selected); the direction toggle sits beside Alignment; typing a URL in the range-Link popover shows the keystrokes and applies on Enter.
- **e2e (2026-07-04 round 2):** the alignment grid (one strip control) writes `text-align` + `verticalAlign` and clears both on top-left; anchors visible while a box is selected (count 8) — resize e2e unchanged.
- **Manual (2026-07-04 round 2):** flipping direction on a multi-row box keeps text inside the selection with no dead whitespace; anchors are visible and usable during place-and-type; a filled text box shows its background at rest and while editing; middle/bottom vertical alignment centers/bottoms content in a height-stretched box.
- **Unit (2026-07-04 round 3):** `expandToWord` pins the caret→word expansion (mid-word / word start / word end / whitespace / index clamp); the link-shortcut binding keeps a non-empty selection as-is, expands a collapsed caret with a `'user'` re-selection, and consumes the key without opening when the caret sits in whitespace.
- **e2e (2026-07-04 round 3):** a fresh box's transform bounds hug the placeholder (anchor spread > 1 projected tile) and grow while typing BEFORE any commit, with the model untouched mid-session; Ctrl+K on a collapsed caret links the word under it via the strip popover (committed content carries the `<a href>`); the alignment popover writes each axis independently and clears both to absent; right-clicking the file explorer's EMPTY space opens the row context menu for the open diagram.
- **Manual (2026-07-04 round 3):** a fresh text box shows the placeholder with the dashed frame hugging it — no white sheet, no offset; the frame tracks typing on both planes; Ctrl+K works in the canvas editor, on a selected node/connector/Label, inside a Label's inline edit, and in the deck Notes editor; the alignment popover reads as standard glyphs at a glance.
- **Unit (2026-07-04 link UX):** `normalizeWebLinkUrl` prepends https:// to bare domains, keeps http(s)/mailto/tel/#anchor as-is, and returns null on blank.
- **e2e (2026-07-04 link UX):** Enter in the range-URL field applies a protocol-less URL normalized, closes the popover, and the link card appears over the linked text with the resolved URL; the card's Remove strips the `<a>` from the committed content while the text survives.
- **Manual (2026-07-04 link UX):** hovering a link mid-edit shows the card after the caret leaves; card Copy puts the URL on the clipboard (icon confirms); card Edit rewrites the URL inline (Enter applies, Escape backs out); the card follows the link across zoom levels and both planes.
- **e2e (2026-07-04 round 6):** Ctrl+K opens the inline card's URL field at the selection (strip popover stays closed); Enter applies without splitting the paragraph (`<a>` spans the whole word); the rotate handle flips a text box X↔Y↔X with the selection surviving; it transposes a non-square rectangle's spans about the center; the strip Border popover writes a text box's `borderStyle` and seeds `#000000` when no color was set.
- **Manual (2026-07-04 round 6):** Ctrl+K on a linked word opens the card prefilled; Escape on a blank create dismisses back to the text; the rotate handle reads clearly in both projections and mid-edit commits-then-rotates; a dashed/dotted border renders identically mid-edit and at rest, incl. with a fill and manual height.
- **e2e (2026-07-04 round 7):** maxing the strip's size slider MID-SESSION grows the live bounds around the uncommitted draft (extends EDIT-BOUNDS).
- **Manual (2026-07-04 round 7):** with ≥2 diagrams, Ctrl+K shows diagram suggestions filtered by typing; picking one shows the diagram's name in the card; the committed link navigates on click in view mode and on Ctrl+click in edit mode; a filled manual-size box keeps its fill snug when font size / line spacing change mid-edit.
- **e2e (2026-07-05 round 8):** Ctrl+K while inline-renaming a floating Label opens the element card (strip popover stays closed) and Enter applies the Docs-forgiven headerLink to the model; Enter in the strip's element-mode URL field closes the popover with the link retained.
- **Manual (2026-07-05 round 8):** Ctrl+K mid-rename works identically on a node name and a connector label (commits the rename, then the card); the node deck's Label section is a bare text field (no link/hide-name buttons); the card's Remove clears the element headerLink.
- **e2e (2026-07-05 round 8b):** hovering a linked floating Label's chip raises the view card with the resolved URL (extends the element-link spec).
- **Manual (2026-07-05 round 8b):** a linked floating Label paints blue + underlined on canvas; a linked node caption and connector chip read the same; hover raises the card on all three, Edit pins it, leaving both dismisses; plain click on a linked node caption selects (Ctrl+click opens); a custom label color wins over link blue but keeps the underline.
- **e2e (2026-07-05 round 9):** placing a node, writing its `headerLink`, and deselecting it (so it renders on `NodesCanvas`, not the DOM overlay) still paints the linked style (`canvas.dataset.linkedLabelsDrawn === '1'`) and hovering its `NodeLabelHitLayer` proxy raises the element link card with the resolved URL.
- **Manual (2026-07-05 round 9):** an unselected node with a link reads exactly like the selected one did before — blue + underlined name, hover card, pointer cursor over the name; selecting and deselecting the node never changes how its link looks or behaves.

---

### 2026-07-31 addendum — the edit session is one action, and one cancel (TXT-04/06/07/08)

Implemented in the exploratory-remediation wave 4, incorporating the TXT-07
owner ruling ([DECISIONS.md](../reviews/exploratory-2026-07/DECISIONS.md)). §1's empty-entity
lifecycle and §2's dual scope are unchanged in substance; this addendum fixes
what they left unstated about the session's BOUNDARY — where it begins and ends,
what belongs to it, and what a cancel takes with it.

**1. A session is one history action.** From the placement (or the double-click)
to the commit, everything the session does — creating the entity, typing, and
every strip write — coalesces into a single entry, built on the existing
drag-transaction primitive. A session whose net patch set is empty pushes
nothing.

*Why it mattered:* placement wrote one entry and the empty-box discard wrote a
second, so a single Ctrl+Z after abandoning a fresh box landed BETWEEN them and
resurrected an empty 1×1 entity — invisible, but clickable, lassoable, included
by Ctrl+A and by the project bounds, and written to every save and export
(TXT-04).

*Where it lives, and why not in the obvious place:* the bracket is owned by the
Renderer ([`useInlineEditHistoryBracket`](../../packages/axoview-lib/src/hooks/useInlineEditHistoryBracket.ts)),
keyed on `editingTextBoxId` / `inlineEditLabelId`. It cannot live in `TextBox`:
the Renderer promotes the edited box into its own layer so the editor can
receive pointer events, which unmounts and remounts that component mid-session —
a bracket owned by it closes itself the instant the session begins, reproducing
TXT-04 exactly. The placement modes call `beginDragTransaction()` **before**
creating the entity (the store flag is set after), and the primitive is
idempotent, so the two compose.

**2. One cancel contract: Escape undoes everything the session did.** §2's dual
scope decides where a strip write GOES — the Quill draft, or the element's own
fields — and Escape used to know about only the first. Element-level writes
(font size, line spacing, manual width/height, border, fill, vertical alignment)
were already committed when Escape arrived and survived it, so one control could
disagree with itself: the alignment popover's horizontal half vanished and its
vertical half stayed. The session now snapshots the element-level fields at open
and restores them on cancel; with (1), a cancelled session leaves no entry at
all (TXT-08).

Corollary, and the reason this is a contract rather than a patch: **a commit is a
commit.** `finish('commit')` used to fall through to `onCancel()` when the TEXT
was untouched — harmless while cancel only closed the session, and a silent
data-loss path the moment cancel started rolling styling back.

**3. The strip is INSIDE the session, for every editor.** A press on
`[data-axoview-strip]` or any MUI portal overlay does not end an edit. This was
already true for the text box and was NOT true for
[`useInlineRename`](../../packages/axoview-lib/src/hooks/useInlineRename.ts) —
the shared hook behind the floating Label, node-name and connector-label
editors — so reaching for the strip mid-rename ended the rename (TXT-06). Both
now ask one predicate,
[`isSessionPreservingTarget`](../../packages/axoview-lib/src/utils/sessionPreservingTarget.ts).

The allow-list alone was not sufficient, and the second cause is the durable
lesson: `useInlineRename` committed on **blur**, and a plain mousedown on a
strip control moves focus. The press-away and key handlers are the AUTHORITY on
ending a session (an idempotent `finish`); `blur` defers to them unless focus
went somewhere outside the session. **Focus leaving is not the user leaving.**

**4. Floating Labels follow the text box's lifecycle exactly (TXT-07 ruling).**
Placement seeds EMPTY text rather than the literal word "Label", so "never
committed" is the same signal the text box uses; a Label abandoned during its
first edit is discarded, and emptying an existing Label then committing deletes
it (undoably). The silent revert — which restored the old text with no feedback
— is gone. Both discards clear the selection with `setSelectedIds([])`, not
`setItemControls(null)`, which is a half-deselect that leaves every
`selectedIds` consumer pointing at a dead id (TXT-15).
