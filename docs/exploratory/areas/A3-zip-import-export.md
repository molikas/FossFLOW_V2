# A3 — Project ZIP & import/export (JSON, ZIP, image)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `ZIP-`

**Scope:** ADR 0001 zip format: manifest.json (format 'axoview-project' + legacy 'fossflow-project', version '1'), diagrams/<id>.json, optional tree-manifest.json. parseProject enforces anti-zip-bomb caps (100MB archive, 50MB/entry, 5000 diagrams) and id regex; importProject rewrites all ids (rewriteIds + 'link'-key reference rewriting), recreates folders depth-ordered, supports destinations root/newFolder/replaceAll (typed 'replace' confirm wipes the workspace first). Export walks storage.listFolders/listDiagrams/loadDiagram per scope (project/folder/diagram). Two import entry points: App.tsx direct file input (empty tree) and ImportDialog (routes to createTargetPlace in FileExplorer).

**Code:**
- `packages/axoview-app/src/services/project/projectZip.ts`
- `packages/axoview-app/src/components/fileExplorer/ImportDialog.tsx`
- `packages/axoview-app/src/components/fileExplorer/ExportProjectZipDialog.tsx`
- `packages/axoview-app/src/components/ExportPopover.tsx`
- `packages/axoview-app/src/components/ImportErrorDialog.tsx`
- `packages/axoview-app/src/utils/downloadBlob.ts`
- `packages/axoview-app/src/utils/fileOperations.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Import / export / custom icons*; Unit: *App project ZIP import/export*, *Lib persistence/export utils (lean save, model fix, SVG/image export)*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- readEntryString's zip-bomb guard reads JSZip's PRIVATE `_data.uncompressedSize` — a crafted zip can lie about the declared size, and a JSZip upgrade that changes the internal shape makes `declared` undefined, silently disabling the 50MB/entry cap either way
- importProject's folder remap: `folderRemap.get(f.parentId) ?? f.parentId` falls back to the REWRITTEN-but-never-created id when a parent is missing from the manifest — local provider accepts the dangling parentId (folder becomes invisible), Drive createFolder 404s and aborts mid-import with folders half-created
- App.tsx buildZipImportSummary reports manifest counts, while importProject silently `continue`s diagrams whose model is null — the success toast can overcount what actually imported
- replaceAll wipe is non-transactional: sequential deleteDiagram/deleteFolder over the network — one failure mid-wipe throws and leaves a half-destroyed workspace with nothing imported
- rewriteRefsInModel only rewrites values under keys literally named 'link' — any other embedded diagram-id reference in the model survives pointing at pre-rewrite ids that no longer exist after import
- Single-JSON import spreads the unvalidated blob straight into createDiagram (`{...blob, name, title}`) — a foreign file carrying folderId/deletedAt/id fields injects storage-level metadata (e.g., lands in a nonexistent folder and is invisible in the tree)
- Export from the Drive place writes lean models (icons stripped to imported-only) into the zip — round-trip fidelity depends entirely on requiredPacks surviving; a zip imported on a machine where pack fetch fails renders items with missing icons
- manifest.version missing/garbage produces the 'exported by a newer Axoview' message (SUPPORTED_VERSIONS has only '1') — misleading for merely corrupt manifests
- FileExplorer's ImportDialog imports into createTargetPlace (selected row's place, Drive-downgraded), App.tsx's direct path always imports to local root — same gesture, two different destinations depending on entry point

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0023 §1 + §7 acceptance / clipboard)** Off-grid fields (offset/snap/collides) survive every persistence and duplication path; absent fields default to snapped/colliding. → *Ctrl+C/Ctrl+V (or context-menu Duplicate) of an unsnapped off-grid node: clipboard.ts/useCopyPaste reconstruct view items — if they omit offset/snap/collides, the paste silently re-snaps and re-enables collision. The ADR's round-trip test covers export→import, and ADR 0044 names clipboard as 'the real risk site' for iconScale — the same hole exists for the 0023 trio with no clipboard round-trip test.*
- **(technical-review-2026-07-29 finding #5 (useCanvasModeToggle))** Exactly ONE useCanvasModeToggle consumer may be live at a time — two mounted simultaneously each apply the scroll correction, double-jumping the viewport. → *A future surface (mobile chrome, export dialog's hidden Axoview instance, or the present-chrome toggle rendered alongside ToolMenu in some mode combination) mounts a second consumer: every projection switch jumps the viewport by 2× the correction. The invariant is comment-only; the review names it as the same unenforced-invariant class as the 0023 offset cluster, with the contract-test remedy still unwritten.*
- **(ADR 0014 (ephemeral annotation overlay))** Annotation strokes never enter ANY persistence path — session save, server save, Drive save, export JSON, project zip — and image export excludes them (deferred inclusion). → *Export PNG while the annotation pen is open with strokes drawn: the exporter serializes DOM via dom-to-image — if the capture root includes the annotation SVG layer (a full-area sibling in UiOverlay), strokes bake into the 'clean' export. projectZip.test.ts asserts zero annotation bytes in the zip; no test asserts the image-export capture root excludes the overlay. Drive saves are also newer than the whitelist tests.*
- **(ADR 0032 connector amendment §4 (nameSeeded marker))** The name→labels[] seed is idempotent via a nameSeeded marker stamped on every connector the pass touches; a name typed later is pure identity and never re-seeded. → *Paste a connector from the clipboard (or import a zip diagram) whose reconstruction drops the nameSeeded marker while keeping name: the next load re-seeds name into a midpoint label — duplicate label chips appear after every paste→save→reload cycle. Seed idempotency tests never route through clipboard/zip reconstruction.*
- **(ADR 0001 import semantics §1)** Project-zip import rewrites every ID and updates all cross-references: folderId, parentId, and cross-diagram link refs inside diagram models. → *Cross-diagram links now also live in Quill content HTML (ADR 0034 link-to-diagram in text runs and link cards) and in connector labels' headerLink — the importer's rewrite list predates these surfaces ('item-level link fields, view connector refs'). Import a zip whose text-box content links to a sibling diagram: the href still carries the OLD id → dead link. projectZip.test asserts ID rewriting for the original ref sites only.*
- **(features.md requiredPacks + ADR 0003)** Lean saves persist requiredPacks so importers auto-load the right icon packs before merging; icons render on first paint after re-import. → *Ctrl+C a Material-icon node in diagram A, Ctrl+V into diagram B which never loaded the Material pack: paste inserts the view item but B's requiredPacks derivation and icon catalog may not gain the pack/icon → save B, reload → tombstone. No test pastes across diagrams with disjoint loaded packs.*
- **(ADR 0044 §4 (iconScale resolution order))** Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. → *A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11).*
- **(technical-review-2026-07-29 §3 finding 2 / known_issues (runtime import cycle))** The Axoview → UiOverlay → ExportImageDialog → Axoview value cycle is safe ONLY while every binding is referenced lazily inside function bodies; a module-eval-time read becomes a TDZ crash at import. → *Add a module-level const in ExportImageDialog that touches an Axoview export (a default prop, a decorator, a memoized style derived from the component): the app crashes at boot with a stack pointing at an innocent consumer. Unit tests import modules individually (different eval order than the bundle), so only a full app boot catches it — and the cycle-count ratchet at 47 doesn't distinguish lazy-safe from eval-time reads.*
- **(memory/audit-gate-false-greens + technical-review-2026-07-29 §8)** A green gate must be demonstrably ABLE to go red — the madge and bundle gates each spent months structurally incapable of failing while reporting pass. → *The new ratchets (cycle count 47, bundle-budget.json) are baseline files: a refactor that legitimately reduces cycles to 40 without lowering the baseline re-opens headroom for 7 silent new cycles; and check-bundle-budget.js measuring gzip -9 vs rsbuild's own numbers means a chunk-naming change could move bytes into a chunk the script doesn't glob. No negative test re-runs periodically to prove the gates still fail on injected violations.*

## Known coverage gaps (from the baseline inventory)

- (Import / export / custom icons) Corrupt/invalid ZIP import error path (only bad JSON covered)
- (Import / export / custom icons) Import into a NON-empty session (merge/replace semantics)
- (Import / export / custom icons) Export PNG dimensions/scale options
- (Import / export / custom icons) Export honoring hidden layers and off-grid offsets (visual fidelity)
- (Import / export / custom icons) JSON schema-version migration on import of older files
- (Import / export / custom icons) Custom icon that is malformed/oversized; icon persistence in ZIP round-trip

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
