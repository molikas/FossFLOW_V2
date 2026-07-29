# F1 — Text, labels-as-text & rich-text editing (inline canvas edit, notes, sanitization)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `TXT-`

**Scope:** Inline canvas text editing (ADR 0034), the Quill-based `RichTextEditor` + `TextBoxInlineEditor`, dual-scope strip formatting, markdown list autofill, link cards (Ctrl+K), HTML sanitization (ADR 0029), name↔label decouple (ADR 0032), text-style field convention (ADR 0033).

**Code:**
- `packages/axoview-lib/src/components/RichTextEditor/`
- `packages/axoview-lib/src/utils/ (quill*, richTextTransform, sanitizeHtml, foldTextBoxStyleFlags, isoMath.richtext)`
- `packages/axoview-lib/src/hooks/useInlineRename.ts, useTextBox.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Textboxes*, *Floating labels + node labels*; Unit: *Lib rich-text / HTML / sanitization utils*. Then grep the suites directly.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0022 §4 / ADR 0034 §1 (commit contracts))** Inline editors commit on left-click-away and cancel on right-click-away/Escape; clicks inside the strip or any MUI portal overlay must NOT end a text-box edit session. → *The click-away allowlist is selector-based (.MuiPopper-root etc.): a new overlay (the ADR 0039 color-picker popover, a future emoji picker) rendered with a different portal class ends the edit session mid-formatting, committing a half-styled box. useInlineRename.test covers canvas click-away; no test clicks each strip popover type during a live text-box session.*
- **(ADR 0034 §1 + Lucid-parity pass (empty-box lifecycle))** An edit session that ends still-empty deletes the text box — commit-empty and cancel-on-never-committed alike; no invisible zero-width ghost may remain. → *End a session whose content is Quill's structural residue (`<p><br></p>`, or whitespace-only after &nbsp; normalization): if the emptiness check compares raw HTML rather than stripped text, an invisible ghost box survives, is lasso-selectable, and counts in Ctrl+A. Tests cover the plain-empty case, not the structural-residue cases.*
- **(ADR 0034 §4 + testing.md S1-brick guard)** No dead writes: every strip write must be schema-legal at the write site — a strip range wider than a schema cap bricks saved diagrams at safeParse on reload (the connector-label 24→40 lesson). → *ADR 0044 group icon-resize: a uniform factor multiplies each member's startScale preserving ratios — a member already at 2.5× times factor 1.3 commits 3.25, outside the schema's hard [0.1,3] → the whole diagram fails safeParse on next load. TransformNode.test covers the single-node clamp; nothing asserts per-member clamping under group factor multiplication (and per-member clamping would itself violate 'relative sizes preserved').*
- **(ADR 0034 §5 rule 7 (content fidelity))** Sanitizer allowlist ≥ editor format whitelist; any textBox.content editor round-trips losslessly; commits sanitize write-side. → *Add a new Quill format (e.g. range background-color, mirroring the existing range color) without extending the DOMPurify profile: the write-side sanitize silently strips it on commit, so formatting applied in the editor vanishes at rest. The align style-attributor survival is pinned by test; no generic allowlist⊇whitelist assertion exists, so each new format re-opens the hole.*
- **(ADR 0034 round-2 (normalizeQuillHtmlSpaces))** &nbsp;-serialized spaces are converted to real spaces on commit AND on load, so fixed-width boxes wrap; auto boxes render `pre`, fixed boxes `pre-wrap`. → *A read-only path that loads content without the editor-load normalization — the /display/drive viewer or a share-snapshot render — shows a legacy &nbsp;-heavy fixed-width box as one unbreakable line overflowing the box. Load normalization lives in the editing load chokepoint; no test loads legacy content through the read-only display routes.*
- **(ADR 0032 amendment (label ?? name fallback + seed))** Render source = label ?? name; seedNodeLabel copies name→label at LOAD so renaming identity name in Layers never moves canvas text. → *Create a node in-session (QuickAdd: name='Untitled', no label), then rename it in the Layers panel WITHOUT reloading: the seed only runs at load, the fallback renders name — so the canvas text moves with the identity rename, reproducing the exact #1 cross-persona confusion the amendment fixed, but only for never-reloaded nodes. Seed tests are load-path only.*
- **(ADR 0032 connector amendment §4 (nameSeeded marker))** The name→labels[] seed is idempotent via a nameSeeded marker stamped on every connector the pass touches; a name typed later is pure identity and never re-seeded. → *Paste a connector from the clipboard (or import a zip diagram) whose reconstruction drops the nameSeeded marker while keeping name: the next load re-seeds name into a midpoint label — duplicate label chips appear after every paste→save→reload cycle. Seed idempotency tests never route through clipboard/zip reconstruction.*
- **(ADR 0001 import semantics §1)** Project-zip import rewrites every ID and updates all cross-references: folderId, parentId, and cross-diagram link refs inside diagram models. → *Cross-diagram links now also live in Quill content HTML (ADR 0034 link-to-diagram in text runs and link cards) and in connector labels' headerLink — the importer's rewrite list predates these surfaces ('item-level link fields, view connector refs'). Import a zip whose text-box content links to a sibling diagram: the href still carries the OLD id → dead link. projectZip.test asserts ID rewriting for the original ref sites only.*
- **(ADR 0029 + sanitizeHtml hook)** User-authored HTML is sanitized before the single dangerouslySetInnerHTML sink, and the sanitizer forces rel='noopener noreferrer' on every anchor with href. → *The rel-forcing hook lives inside sanitizeHtml — link surfaces built directly in React (view-mode popover headerLink, connector-label link chips, TextBoxLinkCard's 'open in new tab') get target=_blank from their own JSX; any of them omitting rel=noopener reintroduces reverse-tabnabbing on user-supplied URLs, invisible to the sanitizer tests which only cover the HTML path.*

## Known coverage gaps (from the baseline inventory)

- (Textboxes) Bold/italic/underline inline formatting controls
- (Textboxes) Font family/size/color on a textbox
- (Textboxes) Undo/redo during or immediately after a text edit session
- (Textboxes) Clicking a committed link inside a textbox (edit mode vs view mode behavior)
- (Textboxes) Very long content overflow/clipping behavior
- (Textboxes) Textbox copy/paste as an entity
- (Floating labels + node labels) Label styling (color/font/size on a single label)
- (Floating labels + node labels) Multi-line label text
- (Floating labels + node labels) Label copy/paste/duplicate
- (Floating labels + node labels) Undo of a label TEXT edit (drag undo covered, text-edit undo not)
- (Floating labels + node labels) Label stalk rendering in 2D projection
- (Floating labels + node labels) Label behavior when its anchor node is deleted

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
