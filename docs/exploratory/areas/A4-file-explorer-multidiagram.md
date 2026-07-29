# A4 — File explorer, folders & multi-diagram management

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `FEX-`

**Scope:** One react-arborist tree composed from TWO useFileTree instances (session + Drive) with synthetic 'place' section roots and 'placeState' rows (loading skeletons, signin/reconnect/scope/error/setup/empty). placeOfId maps flat ids to places; create/rename/delete/duplicate/share/export route to the node's place provider. DnD supports within-place moves plus exactly one cross-place gesture (session diagram -> Drive = moveDiagramsToDrive MOVE). Inline create via injected '__pending__' node submitted through the rename handler. MigrateSessionDialog bulk-moves session diagrams to Drive after a fresh sign-in. SessionStorageGauge estimates sessionStorage usage via the 'axoview-session-changed' event.

**Code:**
- `packages/axoview-app/src/components/fileExplorer/FileExplorer.tsx`
- `packages/axoview-app/src/hooks/useFileTree.ts`
- `packages/axoview-app/src/components/fileExplorer/FileTreeNode.tsx`
- `packages/axoview-app/src/components/fileExplorer/FileTreeToolbar.tsx`
- `packages/axoview-app/src/components/fileExplorer/ContextMenuItems.tsx`
- `packages/axoview-app/src/components/fileExplorer/SessionStorageGauge.tsx`
- `packages/axoview-app/src/components/MigrateSessionDialog.tsx`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *File explorer / diagram management*, *Multi-diagram links + element links*; Unit: *App utils, runtime config & shell components/dialogs*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Name-collision dialog says 'Replace it?' but confirmMove only calls moveItem — the existing same-name sibling is NOT deleted, producing two identically-named items after the user confirmed a 'replace'
- handleMove iterates dragIds but `return`s (not continue) on same-parent reorder and on collision — a multi-select drag silently abandons the remaining dragged items
- confirmDelete calls notifyDiagramDeletedFromTree (canvas reset, autosave cancel) BEFORE the storage delete — if hardDeleteDiagram then fails, the diagram survives in storage but the canvas has already been blanked
- handleRenameSubmit decides folder-vs-diagram via `tree.folders.some(f => f.id === id)` against possibly-stale state, and resolves the place via placeOfId which drops entries mid-refresh — rename can hit the wrong entity type or wrong provider
- handleMoveToDrive on the OPEN diagram: saveAllDirty flush -> move -> notifyDiagramDeletedFromTree -> reopen from Drive; an autosave tick or edit landing between the flush and the source delete is lost (moveDiagramsToDrive copies the persisted blob, not the in-memory model)
- moveDiagramsToDrive recreates folder paths by NAME match against a locally-mutated Drive listing — duplicate-named Drive folders resolve to the first hit, and a concurrent tab's creations aren't seen (stale one-shot listing per run)
- driveRootMissing keys on the synchronous getCachedRootId() while driveTree.status is async — timing window right after DriveSetupGate configures the root where the tree shows 'setup' state over real data or vice versa
- MigrateSessionDialog auto-offer races the DriveSetupGate: pendingOfferRef consumed by tryAutoOffer only if getCachedRootId() is set; the 'axoview-drive-root-ready' event and the auth-status effect can interleave so the offer fires zero or two times
- placeOfId: if the same id somehow exists in both places (import/copy artifacts), Drive wins (last Map.set) — session node operations route to the Drive provider

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0001 import semantics §1)** Project-zip import rewrites every ID and updates all cross-references: folderId, parentId, and cross-diagram link refs inside diagram models. → *Cross-diagram links now also live in Quill content HTML (ADR 0034 link-to-diagram in text runs and link cards) and in connector labels' headerLink — the importer's rewrite list predates these surfaces ('item-level link fields, view connector refs'). Import a zip whose text-box content links to a sibling diagram: the href still carries the OLD id → dead link. projectZip.test asserts ID rewriting for the original ref sites only.*
- **(ADR 0036 §2 + known_issues (root-folder detection))** ADR 0036 promises the provider detects a deleted/trashed Drive root folder; as-built, isAvailable() only checks auth and the cached root id is never revalidated. → *Trash the app folder in Drive's own UI mid-session: autosaves keep 200-OK patching files in the trash for the rest of the session; loss surfaces only at next full listing. The cheap fix (invalidate on zero-listing or 404) is catalogued but unimplemented — any test asserting 'save succeeded ⇒ durable' is false here.*
- **(local-mode autosave / session keys (known_issues e2e entry + features.md))** Session-place work autosaves to localStorage and survives reloads; explorer persistence is a coherent triple (axoview-diagrams, axoview-last-opened, axoview-last-opened-data). → *A quota-exceeded write during autosave (5MB cap, gauge at 90%+): if the three keys are written non-atomically and one write throws, axoview-last-opened can point at an entry missing from axoview-diagrams — reload lands on the empty state or the wrong diagram while the save indicator claimed success. LocalStorageProvider tests never inject QuotaExceededError mid-triple.*

## Known coverage gaps (from the baseline inventory)

- (File explorer / diagram management) Dragging a diagram into/out of a folder
- (File explorer / diagram management) Folder rename and folder delete (incl. non-empty folder)
- (File explorer / diagram management) Deleting the currently-open diagram (what the editor shows after)
- (File explorer / diagram management) Duplicate diagram/folder names
- (File explorer / diagram management) Creating a NEW diagram from the explorer while one is open
- (Multi-diagram links + element links) Link to a diagram that is later DELETED (broken link)
- (Multi-diagram links + element links) Circular diagram links (A->B->A)
- (Multi-diagram links + element links) Removing/clearing an existing diagram link
- (Multi-diagram links + element links) headerLink survival through export/import round-trips
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/hooks/useAutoSave.ts and useFileTree.ts — zero tests (autosave debounce/dirty logic, tree building)
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx and AuthProvider.tsx — only source-grep contract tests, no behavioral tests of load/save/dirty lifecycle
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/components/DiagramManager.tsx and fileExplorer/FileExplorer.tsx, FileTreeNode.tsx, FileTreeToolbar.tsx, ImportDialog.tsx, ContextMenuItems.tsx, ExportProjectZipDialog.tsx, SessionStorageGauge.tsx — zero behavioral tests (rename/move/DnD/context menus)
- (App utils, runtime config & shell components/dialogs) app shell components with zero tests: AppToolbar.tsx, AuthControl.tsx, ErrorBoundary.tsx, LoadDialog.tsx, SaveDialog.tsx, ExportPopover.tsx, ExportSingleDiagramDialog.tsx, MigrateSessionDialog.tsx, DriveDisplayGate.tsx, DriveSetupGate.tsx, DriveRootFolderDialog.tsx, NotificationStack.tsx, StatusCluster.tsx, LocalModeBanner.tsx, LocalModeShareErrorDialog.tsx, PublicShareLoadErrorDialog.tsx, ReadonlyLoadErrorDialog.tsx, ConfirmDialog.tsx, NotFound.tsx
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/utils/apiBaseUrl.ts, authDebug.ts, bootScreen.ts, downloadBlob.ts, isoGridBackground.ts — zero tests; also diagramUtils.ts, appBase.ts, serviceWorkerRegistration.ts

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
