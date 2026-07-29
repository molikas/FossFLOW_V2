# A5 — App chrome: boot, dialogs, settings, i18n, theming, storage hygiene

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `CHR-`

> Auth-token seams here overlap S1 — dedupe hypothesis IDs across the two ledgers before counting.

**Scope:** authStore (zustand) runs the GIS implicit-token state machine (UNAUTHENTICATED/AUTHENTICATING/RECONNECTING/AUTHENTICATED/REFRESHING/SESSION_EXPIRED/DRIVE_ACCESS_REQUIRED) with in-memory-only tokens, a localStorage profile hint for silent boot reconnect, waiter piggybacking in getValidToken, stale-error absorption, and stuck-popup timeouts. Drive services handle the display-route read ladder (key read -> token read -> Picker grant), sharing ACLs, and share links anchored to appDisplayBase(). i18n: http-backend loading i18n/app/<lng>.json, load 'currentOnly', detection localStorage-only, 13 locales. migrationShim renames fossflow_* keys once; serviceWorkerRegistration only unregisters leftovers; LocalStorageInspector is the quota-full escape hatch.

**Code:**
- `packages/axoview-app/src/stores/authStore.ts`
- `packages/axoview-app/src/providers/AuthProvider.tsx`
- `packages/axoview-app/src/services/drive/drivePublicRead.ts`
- `packages/axoview-app/src/services/drive/driveSharing.ts`
- `packages/axoview-app/src/services/drive/gapiLoader.ts`
- `packages/axoview-app/src/services/drive/drivePicker.ts`
- `packages/axoview-app/src/components/DriveSetupGate.tsx`
- `packages/axoview-app/src/components/DriveDisplayGate.tsx`
- `packages/axoview-app/src/components/DriveAccessRequiredDialog.tsx`
- `packages/axoview-app/src/components/AuthControl.tsx`
- `packages/axoview-app/src/i18n.ts`
- `packages/axoview-app/src/serviceWorkerRegistration.ts`
- `packages/axoview-app/src/utils/migrationShim.ts`
- `packages/axoview-app/src/LocalStorageInspector.tsx`
- `packages/axoview-app/src/stores/notificationStore.ts`
- `packages/axoview-app/src/stores/diagnosticsStore.ts`
- `packages/axoview-app/src/appBase.ts`
- `packages/axoview-app/src/utils/shareUrl.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Dialogs / settings / help / diagnostics*, *Smoke / app boot / empty state*, *Landing / routing / 404*; Unit: *App utils, runtime config & shell components/dialogs*, *App auth + notification stores*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- LocalStorageInspector 'Clear All Diagrams' removes every localStorage key starting 'axoview-' — that includes the Google profile hint, Drive root cache, icon-pack prefs and tree manifest — yet does NOT touch the actual session diagrams, which live in sessionStorage under 'axoview_' (underscore); the dialog both over-deletes and under-delivers, then hard-reloads
- Its 5MB assumption and 'axoview-' prefix accounting predate the places model — shown numbers ('Axoview diagrams') actually measure folders/prefs, not diagram data
- authStore getValidToken piggybacking: waiters resolve with `get().accessToken ?? null` — a waiter attached during AUTHENTICATING that settles via the DRIVE_ACCESS_REQUIRED branch resolves with null token but the caller's Drive request already in flight surfaces as a raw 403/DriveError, not the re-consent dialog, unless the caller special-cases it
- Token refresh margin is 5min but Drive multi-call operations (project export, moveDiagramsToDrive over many diagrams, icon-usage scan) can straddle expiry mid-run — each item independently triggers silent refresh or fails partway with per-item error handling of varying quality
- i18n 'currentOnly' + localStorage-only detection: a stale stored language like 'en' (bare code from an older build) 404s on i18n/app/en.json and every t() shows raw keys until fallback en-US finishes loading; missing keys in the 12 non-English catalogs silently fall back mid-sentence to English
- serviceWorkerRegistration.unregister() awaits navigator.serviceWorker.ready, which NEVER resolves when no SW is active — harmless today, but any code sequenced after it would hang; and it only unregisters the default-scope registration
- migrationShim sentinel write can fail under quota — migration then re-runs every boot and its 'don't overwrite existing new-key' guard is the only thing preventing new data being clobbered by stale fossflow_ copies
- shareUrlFromUuid/appDisplayBase anchor to window.location.origin at call time — correct for copied links, but any share created inside an iframe/preview context bakes in that context's origin
- DriveDisplayGate/driveDisplayState: retryDriveDisplayRead's afterGrant flag rides a ref consumed by the loader effect — a rapid double retry or a navigation during the Picker flow can leave driveAfterGrantRef=true for the NEXT unrelated load, mapping a recoverable failure to terminal 'failed'
- (mapper note) authStore is unit-tested and heavily commented; the riskier code is at its integration edges (waiter settlement vs Drive request retries, and UI gates keyed on status transitions). The notification/diagnostics stores are small observable singletons with little risk.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(technical-review-2026-07-29 finding #5 (useCanvasModeToggle))** Exactly ONE useCanvasModeToggle consumer may be live at a time — two mounted simultaneously each apply the scroll correction, double-jumping the viewport. → *A future surface (mobile chrome, export dialog's hidden Axoview instance, or the present-chrome toggle rendered alongside ToolMenu in some mode combination) mounts a second consumer: every projection switch jumps the viewport by 2× the correction. The invariant is comment-only; the review names it as the same unenforced-invariant class as the 0023 offset cluster, with the contract-test remedy still unwritten.*
- **(ADR 0035 / authStore.test.ts)** The Google token is NEVER persisted — only the identity/profile hint survives reloads; silent reconnect re-mints via GIS. → *The regression test spies on localStorage.setItem only. A convenience change that stashes the token in sessionStorage, IndexedDB, or a cookie (e.g. to survive the popup-blocker boot problem) evades the spy entirely and ships green while violating the ADR's central security contract.*
- **(ADR 0011 §1 (error UX contract))** Every failure-of-intent (user clicked/typed/dragged) surfaces an explicit Dialog; notification-toast-only handling and silent .catch(() => {}) are forbidden for such paths. → *Click 'Copy share link' in a context where navigator.clipboard.writeText rejects (non-secure context, permissions policy): the catalogued S1–S20 silent surfaces are still open, and new Drive-share paths added since B-9a (copy preview link, Manage-access actions) have never been audited — a rejection likely dies in a toast or a swallowed catch, and no test asserts dialog-vs-toast classification for new surfaces.*
- **(technical-review-2026-07-29 §3 finding 2 / known_issues (runtime import cycle))** The Axoview → UiOverlay → ExportImageDialog → Axoview value cycle is safe ONLY while every binding is referenced lazily inside function bodies; a module-eval-time read becomes a TDZ crash at import. → *Add a module-level const in ExportImageDialog that touches an Axoview export (a default prop, a decorator, a memoized style derived from the component): the app crashes at boot with a stack pointing at an innocent consumer. Unit tests import modules individually (different eval order than the bundle), so only a full app boot catches it — and the cycle-count ratchet at 47 doesn't distinguish lazy-safe from eval-time reads.*
- **(features.md (viewer-controlled projection, PR #84))** canvasMode in view-only mode is viewer-local UI state persisted only to that viewer's localStorage — switching projection can neither dirty nor save the diagram. → *A viewer switches to 2D on the /display route; the localStorage key is shared with the editor — the OWNER later opens the editor in the same browser and their diagram opens in 2D with a recentered scroll they never chose, and if any editor-side code treats canvasMode as model-adjacent (e.g. included in a future save payload or dirty-diff), a pure viewer action dirties the document. Tests assert non-dirty in view mode only, not the shared-key bleed into edit mode.*
- **(local-mode autosave / session keys (known_issues e2e entry + features.md))** Session-place work autosaves to localStorage and survives reloads; explorer persistence is a coherent triple (axoview-diagrams, axoview-last-opened, axoview-last-opened-data). → *A quota-exceeded write during autosave (5MB cap, gauge at 90%+): if the three keys are written non-atomically and one write throws, axoview-last-opened can point at an entry missing from axoview-diagrams — reload lands on the empty state or the wrong diagram while the save indicator claimed success. LocalStorageProvider tests never inject QuotaExceededError mid-triple.*

## Known coverage gaps (from the baseline inventory)

- (Smoke / app boot / empty state) First-run onboarding/hint-tooltip content (fixture dismisses them, never asserts them)
- (Smoke / app boot / empty state) Boot with a corrupted localStorage session (recovery path)
- (Smoke / app boot / empty state) Multiple tabs open on the same local session (storage race)
- (Landing / routing / 404) Browser back/forward across landing <-> app transitions
- (Landing / routing / 404) Deep-link into /app with an in-progress session (state preserved?)
- (Dialogs / settings / help / diagnostics) Any settings VALUE change taking effect (only shell/tab-list is asserted; snap toggle is tested separately in snap-grid.spec)
- (Dialogs / settings / help / diagnostics) Per-tab settings content
- (Dialogs / settings / help / diagnostics) Dialog focus trap / keyboard navigation
- (App auth + notification stores) packages/axoview-app/src/stores/diagnosticsStore.ts — zero tests
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
