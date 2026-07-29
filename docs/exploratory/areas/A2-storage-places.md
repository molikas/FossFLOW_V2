# A2 — Storage providers & places model (local/session/Drive, move-to-Drive)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `STOR-`

**Scope:** StorageManager is a module-level singleton delegating StorageProvider calls to the active provider ('local' | 'google-drive'). LocalStorageProvider dual-paths: server REST (/api/diagrams etc., when /api/config says serverStorage) with sessionStorage/localStorage fallback. GoogleDriveProvider maps diagrams/folders to Drive files under a marker-discovered root folder with lean-save (ADR 0003: strip pack icons, record requiredPacks), retry/backoff, and 401->markExpired. driveTransfer implements MOVE semantics session->Drive (create, verify, delete source). AppStorageContext boots from a cached 800ms /api/config probe (ADR 0009 D2) and derives serverStorageAvailable/remoteStorageActive/defaultPlaceId.

**Code:**
- `packages/axoview-app/src/providers/AppStorageContext.tsx`
- `packages/axoview-app/src/services/storage/StorageManager.ts`
- `packages/axoview-app/src/services/storage/providers/LocalStorageProvider.ts`
- `packages/axoview-app/src/services/storage/providers/GoogleDriveProvider.ts`
- `packages/axoview-app/src/services/storage/leanModel.ts`
- `packages/axoview-app/src/services/storage/driveTransfer.ts`
- `packages/axoview-app/src/services/storage/types.ts`
- `packages/axoview-app/src/hooks/useRuntimeConfig.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *File explorer / diagram management*; Unit: *App storage providers, transfer & storage context*, *App Google Drive services (picker, public read, sharing)*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Route-change remount desync: the manager singleton keeps its active provider across EditorPage remounts, but AppStorageProvider's activeProviderIdState resets to 'local' — after opening a Drive diagram then navigating to any /display/* route and back, React state says 'local' (remoteStorageActive=false) while manager.getActiveProvider() is still Drive, so mode branches and actual reads/writes disagree
- LocalStorageProvider silently falls back to sessionStorage on ANY server list/load error (listDiagrams/loadDiagram/listFolders/getTreeManifest catch-all) — a transient backend outage makes the tree show per-tab data while saves still throw against the server, splitting the workspace
- Mixed lifetimes in the local place: diagram blobs+index live in sessionStorage ('axoview_diagram_*'/'axoview_diagrams'), folders and tree manifest in localStorage ('axoview-folders'/'axoview-tree-manifest') — closing the tab keeps folders but loses all diagrams, leaving a persistent orphan folder tree and dangling folderIds
- GoogleDriveProvider.listDiagrams(undefined) queries ALL app-marked JSON files in Drive, not just under the root — a file whose parent is neither root nor a listed folder gets folderId=<unknown parent> and becomes invisible in the composed tree while still counting in listings (sessionHasContent, icon-usage scans, export scope)
- Drive root cache 'axoview-drive-root' in localStorage is not keyed by Google account — after switching accounts in the same browser, a cached root that account B can access (e.g., shared) passes folderExists and B silently writes into A's folder
- GoogleDriveProvider.request() retries 429/5xx by replaying the SAME request including non-idempotent multipart POST creates — a 500-after-write on createDiagram/createFolder mints duplicate files
- sessionListDiagrams / localGetFolders / getTreeManifest parse stored JSON with no try/catch — one corrupt sessionStorage/localStorage entry throws through every list call and bricks the tree
- leanIfModel: when the input is already lean AND some item icon is unresolved, it preserves existing requiredPacks — but if that field was already lost (older save), the derived list is empty and the pack hint is permanently wiped on the next autosave round-trip
- fetchRuntimeConfig's 800ms AbortSignal.timeout: a slow-but-healthy backend gets misclassified as Local mode, cached for the whole session — server-stored diagrams silently invisible until reload
- (merged from "Google Drive storage provider, places model & move-to-Drive") Root duplication races: ensureRoot() on any write auto-creates DEFAULT_ROOT_NAME while the first-connect DriveRootFolderDialog is pending; configureRoot() adopts+renames an existing marker root, but two tabs/devices interleaving probeRoot→createRootFolder can still mint two axoviewRoot markers, after which findRootByMarker() is nondeterministic (files[0]) and diagrams split across roots.
- (merged from "Google Drive storage provider, places model & move-to-Drive") saveTreeManifest find-then-create race: two concurrent saves both get findManifestId=null and each uploadCreate a separate axoview-manifest.json; thereafter reads pick files[0] — folder tree flickers between two manifests.
- (merged from "Google Drive storage provider, places model & move-to-Drive") moveItem read-modify-write on parents (fetch parents → addParents/removeParents): concurrent move from another tab loses one; folderId mapping everywhere assumes parents[0] and parent===root→null — a multi-parent legacy file or a file whose parent is outside the root tree misfiles at root.
- (merged from "Google Drive storage provider, places model & move-to-Drive") listDiagrams(undefined) queries by app-marker only (account-wide), not by root subtree — an axoview-marked file sitting outside the configured root (e.g. after the user moved it in Drive's own UI) appears with folderId=<unknown parent> that no listed folder matches; check how the explorer renders that orphan.
- (merged from "Google Drive storage provider, places model & move-to-Drive") driveTransfer non-atomicity: crash/network failure between drive.createDiagram success and source.deleteDiagram leaves a duplicate in both places (documented as move-not-copy); its name de-collision and folder-path matching use a one-shot local listing (driveFolders/driveDiagrams arrays) that goes stale against concurrent Drive-side changes mid-run; folder chain matches by NAME only.
- (merged from "Google Drive storage provider, places model & move-to-Drive") Place-follow race: setActiveProviderId flips the singleton StorageManager's active provider when a diagram opens — an autosave for the previously open local diagram still in flight resolves storage.saveDiagram against the NEW provider (Drive), writing a local diagram's blob to a Drive file id (or 404ing). The seam is between DiagramLifecycleProvider's open path and any queued save.
- (merged from "Google Drive storage provider, places model & move-to-Drive") 403 permanent-classification: only /rateLimitExceeded/i retries; storageQuotaExceeded, sharingRateLimitExceeded and Workspace policy 403s throw immediately — verify every write path (autosave especially) surfaces that per ADR 0011 instead of losing the save silently.
- (merged from "Google Drive storage provider, places model & move-to-Drive") leanIfModel strips pack icons on every Drive save (ADR 0003) — seam with the readonly/display loaders which must rehydrate via iconPackManager.loadPacksForDiagram; a diagram saved lean then opened through a path that skips rehydration renders iconless.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(testing.md ADR 0023 additions (snap-grid.spec freeze test))** Turning global snap ON does not re-snap existing off-grid items. → *A future load-time normalization or 'cleanup' migration that drops offset when snap is globally on — the e2e freeze test covers the toggle in-session, but a load-path normalization (e.g. in useInitialDataManager, where seeds already run) would re-snap on reload and no reload-with-global-snap-on test exists.*
- **(ADR 0037 §2 (active provider follows open diagram))** Switching the open diagram to another place flushes the pending autosave to the OLD place before setting the new active provider. → *With a dirty session diagram (debounced autosave pending), immediately open a Drive diagram: if the flush is fire-and-forget rather than awaited before the provider swap, the session autosave either writes through the Drive provider (wrong place) or is cancelled (silent data loss). driveTransfer/authStore tests don't cover the open-diagram provider-swap flush ordering.*
- **(ADR 0036 §2 + known_issues (root-folder detection))** ADR 0036 promises the provider detects a deleted/trashed Drive root folder; as-built, isAvailable() only checks auth and the cached root id is never revalidated. → *Trash the app folder in Drive's own UI mid-session: autosaves keep 200-OK patching files in the trash for the rest of the session; loss surfaces only at next full listing. The cheap fix (invalidate on zero-listing or 404) is catalogued but unimplemented — any test asserting 'save succeeded ⇒ durable' is false here.*
- **(ADR 0035 / authStore.test.ts)** The Google token is NEVER persisted — only the identity/profile hint survives reloads; silent reconnect re-mints via GIS. → *The regression test spies on localStorage.setItem only. A convenience change that stashes the token in sessionStorage, IndexedDB, or a cookie (e.g. to survive the popup-blocker boot problem) evades the spy entirely and ships green while violating the ADR's central security contract.*
- **(features.md (viewer-controlled projection, PR #84))** canvasMode in view-only mode is viewer-local UI state persisted only to that viewer's localStorage — switching projection can neither dirty nor save the diagram. → *A viewer switches to 2D on the /display route; the localStorage key is shared with the editor — the OWNER later opens the editor in the same browser and their diagram opens in 2D with a recentered scroll they never chose, and if any editor-side code treats canvasMode as model-adjacent (e.g. included in a future save payload or dirty-diff), a pure viewer action dirties the document. Tests assert non-dirty in view mode only, not the shared-key bleed into edit mode.*
- **(canvas-interaction.md §2 (isRendererInteraction gate))** mousedown/mouseup gate on isRendererInteraction; mousemove deliberately does NOT — any move to scoped listeners must replace window-binding with setPointerCapture or drags break when the cursor leaves the box. → *A drag that strays over a NEW overlay child that stops propagation (a future minimap, the annotation palette when open in edit mode): moves keep flowing (window-bound) but the mouseup lands gated-out if the overlay swallows it → the drag never commits and DRAG_ITEMS stays armed, committing on the NEXT unrelated mouseup. No test releases a drag over each overlay surface.*
- **(local-mode autosave / session keys (known_issues e2e entry + features.md))** Session-place work autosaves to localStorage and survives reloads; explorer persistence is a coherent triple (axoview-diagrams, axoview-last-opened, axoview-last-opened-data). → *A quota-exceeded write during autosave (5MB cap, gauge at 90%+): if the three keys are written non-atomically and one write throws, axoview-last-opened can point at an entry missing from axoview-diagrams — reload lands on the empty state or the wrong diagram while the save indicator claimed success. LocalStorageProvider tests never inject QuotaExceededError mid-triple.*

## Known coverage gaps (from the baseline inventory)

- (File explorer / diagram management) Dragging a diagram into/out of a folder
- (File explorer / diagram management) Folder rename and folder delete (incl. non-empty folder)
- (File explorer / diagram management) Deleting the currently-open diagram (what the editor shows after)
- (File explorer / diagram management) Duplicate diagram/folder names
- (File explorer / diagram management) Creating a NEW diagram from the explorer while one is open
- (App storage providers, transfer & storage context) packages/axoview-app/src/services/storage/StorageManager.ts — zero tests (provider selection/failover orchestration)
- (App storage providers, transfer & storage context) packages/axoview-app/src/services/storage/leanModel.ts — zero tests
- (App storage providers, transfer & storage context) packages/axoview-app/src/services/iconPackManager.ts and iconUsage.ts — zero tests

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
