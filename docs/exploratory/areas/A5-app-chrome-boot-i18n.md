# A5 — App chrome: boot, dialogs, settings, i18n, theming, storage hygiene

**Status:** DONE · **Counted hypotheses:** 12 / 10 · **Bugs:** 10 · **Suspects:** 1 · **Hypothesis ID prefix:** `CHR-`

**Closed 2026-07-30.** Deliberately scoped AWAY from the auth-token seams: `authStore`, the gates and the Drive display ladder are S1/S3 territory and were closed there (31 counted, 22 bugs between them), so counting them again here would double-count one surface. What was left — and had zero tests — is the storage-hygiene escape hatch, the boot utilities, the deployment sniffing and the locale catalogues. Verdicts: 10 BUG, 1 SUSPECT (CHR-08), 1 FALSIFIED (CHR-12).

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
| CHR-01 | `LocalStorageInspector`'s "Clear All Diagrams" sweeps localStorage by the `axoview-` prefix — the *configuration* prefix — so it deletes the profile hint, Drive root cache, icon-pack prefs, folders and manifest, and no diagram | seed seam | none (zero tests) | `__explore__/A5/storage-hygiene-chr-01-to-04` | BUG | T1 confirmed through the rendered component (Clear → Confirm). After the sweep: `axoview-google-profile`, `axoview-drive-root`, `axoview-enabled-icon-packs`, `axoview-folders`, `axoview-tree-manifest` all gone; `axoview_diagrams` and `axoview_diagram_d1` (sessionStorage, underscore) untouched. The dialog that opens only when the profile is out of space frees nothing, and signs the user out of Drive on the next boot. known_issues: A5/CHR-01. |
| CHR-02 | The gauge measures localStorage `axoview-` bytes and labels them "Axoview diagrams", so the number shown at the moment of decision excludes every diagram; the 5 MB denominator is a guess about one of the two stores | seed seam | none | `__explore__/A5/storage-hygiene-chr-01-to-04` | BUG | T1 confirmed. With a 50 KB session diagram seeded, the "Axoview diagrams" line renders in *bytes* — it is measuring preferences. `calculateStorage` never reads sessionStorage, where the diagrams are. known_issues: A5/CHR-02. |
| CHR-03 | Because the clear removes `axoview-folders` while sessionStorage diagrams keep their `folderId`, it reproduces A4/FEX-01: the foldered diagrams are invisible everywhere afterwards | cross-area consumer (A4/FEX-01) | none | `__explore__/A5/storage-hygiene-chr-01-to-04` | BUG | T1 confirmed. After Clear, the folder list is gone and the surviving diagram still carries `folderId: 'f1'`; `buildTree` descends from `parentId === null`, so it renders nowhere and is not in the trash either. The "clear" hides work rather than deleting it — and frees nothing. Filed with A5/CHR-01. |
| CHR-04 | "Export All Diagrams" — the backup offered beside the destructive clear — reads the pre-places-model `axoview-diagrams` localStorage key, so it exports a stale copy or nothing at all | dead-path sweep | none | `__explore__/A5/storage-hygiene-chr-01-to-04` | BUG | T1 confirmed. With both session keys populated, the click creates no object URL and no anchor click: no file, no error, no toast. The safety net offered before an irreversible action is inert. known_issues: A5/CHR-04. |
| CHR-05 | `serviceWorkerRegistration.unregister()` awaits `navigator.serviceWorker.ready`, which never resolves when no worker is registered — so the boot cleanup chain never settles, and its `.catch` assumes an `Error` | seed seam | none | `__explore__/A5/boot-migration-chr-05-to-08` | BUG | T1 confirmed with a timer-free settle oracle: with `ready` pending the chain is unsettled after a full microtask + macrotask drain; with a registration it unregisters exactly once; a string rejection logs `undefined` (`error.message`). Harmless today, but anything sequenced after it hangs on every boot. `getRegistrations()` is the API that answers the question being asked. known_issues: A5/CHR-05. |
| CHR-06 | `migrateFossflowStorageKeys` swallows a throw inside `migrateStorage` and still writes the "done" sentinel, so a partial migration is permanent | boundary / interleaving | none | `__explore__/A5/boot-migration-chr-05-to-08` | BUG | T1 confirmed. With `setItem` throwing on the second migrated key (a nearly-full profile — the profile with the most legacy data), the run reports `{ran: true}`, the sentinel is `done`, `fossflow-*` keys remain, and the next boot short-circuits: data present in the profile, invisible to every reader, forever. The sentinel's own `catch` already reasons the other way. known_issues: A5/CHR-06. |
| CHR-07 | `apiBaseUrl()` decides "dev split vs same-origin" from `hostname === 'localhost' && port === '3000'`, which the Docker deployment also matches | bug-class recurrence (environment sniffing) | none | `__explore__/A5/boot-migration-chr-05-to-08` | BUG | T1 + source confirmed. `compose.dev.yml` publishes nginx as `"3000:80"`, so `npm run docker:run` serves from the same host:port as `npm start`; there `/api/` is same-origin behind `proxy_pass http://localhost:3001`, and the CSP nginx emits is `connect-src 'self'` with no `localhost:3001`. So in the documented Docker deployment every API call bypasses the proxy AND is blocked by the app's own CSP. known_issues: A5/CHR-07. |
| CHR-08 | `appDisplayBase()` anchors share links to `window.location.origin` at call time, so a link created from a preview host / staging domain / embedding context bakes in that origin | seed seam | `shareUrl` tests (dev-port case only) | `__explore__/A5/boot-migration-chr-05-to-08` | SUSPECT | T1 confirmed the behaviour: from `https://pr-42--preview.example.dev` the copied link is `https://pr-42--preview.example.dev/app/display/p/<uuid>`, and `driveSharing.ts` uses the same builder — but which origin *should* win is a product decision no ADR makes. The doc comment deliberately chose page-origin over the backend-derived host (a fix for a real bug); the preview/iframe case was simply not considered. → product question below. |
| CHR-09 | The 12 non-English catalogues have drifted from `en-US`, and nothing gates them — including the nine that known_issues names as fully covered | ADR-contract / stale-record (thread S-f shape) | none | `__explore__/A5/i18n-download-chr-09-to-11` | BUG | T1 confirmed by key-set diff: **every** locale is short — 34 keys for es-ES/pt-BR/fr-FR/hi-IN/bn-BD/ru-RU/it-IT/tr-TR/pl-PL, 35 for zh-CN, 65–66 for de-DE/id-ID. The known_issues entry "Partial-coverage i18n locales (de-DE + id-ID)" tells users to switch to "one of the fully-covered locales", listing nine that are not. Novel against the existing debt entries, which are about *hardcoded* strings and *two* locales. known_issues: A5/CHR-09. |
| CHR-10 | Drift runs the other way too: catalogues carry keys `en-US` no longer has (renames/deletions the translations never followed) | parity | none | `__explore__/A5/i18n-download-chr-09-to-11` | BUG | T1 confirmed. Every one of the 12 locales holds at least one key absent from the reference (1–3 each). i18next resolves per key, so neither direction is ever reported at runtime. Filed with A5/CHR-09. |
| CHR-11 | The file-download idiom is hand-written in five places, and every copy revokes the object URL in the same tick as `.click()` without attaching the anchor | bug-class recurrence (sibling drift / dual implementation) | none | `__explore__/A5/i18n-download-chr-09-to-11` | BUG | T1 source sweep confirmed across `utils/downloadBlob.ts` (one caller), `LocalStorageInspector`, `DiagramLifecycleProvider`, `DiagnosticsOverlay` and the lib's `exportOptions`: all five click-then-revoke synchronously, none appends the anchor, and no copy reuses the shared helper. This is the ADR 0047 dual-implementation class at five copies. known_issues: A5/CHR-11. |
| CHR-12 | `for (const key in localStorage)` (used by both the gauge and the clear) enumerates more than the stored keys | boundary | none | `__explore__/A5/storage-hygiene-chr-01-to-04` | FALSIFIED | The enumeration IS wrong — WebIDL makes interface operations and attributes enumerable, so `for…in` yields `getItem`, `setItem`, `removeItem`, `clear`, `key` and `length` alongside the stored keys, in browsers as well as jsdom. But both consumers are accidentally safe: `calculateStorage` guards on `localStorage.getItem(key)` (null for every prototype name) and `confirmClear` filters on the `axoview-` prefix (which none of them has). Anti-pattern, not a defect — the CHR-01 finding is about the prefix, not the walk. |

## Product questions (SUSPECT verdicts)

### CHR-08 — which origin should a share link be anchored to?

**Observed.** `appDisplayBase()` builds every read-only link — public-snapshot
(`shareUrl.ts`) and Drive-native (`driveSharing.ts`) — from
`window.location.origin` at call time. A link copied from a preview deployment,
a staging domain, a LAN IP or an embedding context therefore carries that host,
and recipients may not be able to reach it.

**Why it is a question, not a bug.** The current behaviour is a deliberate fix:
the backend returns a `url` derived from `req.get('host')`, which in `npm run
dev` is the API port, not the page the user is on — so the code was changed to
anchor to the page origin, and the doc comment says so. Nothing states what
should happen when the page origin is itself not the canonical one, and no ADR
(0040 routing, 0042 Drive sharing) names a canonical public base.

**Industry practice.** Products that mint shareable links overwhelmingly resolve
them against a *configured* public base URL (GitLab `external_url`, Sentry
`system.url-prefix`, Grafana `root_url`, Discourse `hostname`), falling back to
the request/page origin only when unset — precisely because preview, proxy and
LAN origins otherwise leak into durable links. The counter-argument for this app
is that it is deployment-light and self-hostable with no config step, and the
page origin is right in every single-origin deployment.

**Options.** (a) Keep page-origin, document it. (b) Add an optional public-base
to the runtime config `useRuntimeConfig` already fetches, page-origin as
fallback — the industry default, one config key, no behaviour change for
existing deployments. (c) Warn in the share UI when the current origin looks
non-canonical (localhost / bare IP / preview pattern).

**Recommendation:** (b), with (a)'s documentation. Cheap, matches practice, and
leaves the default behaviour intact for every deployment that is already correct.

**Owner ruling:** *pending — raised at the 2026-07-30 campaign close-out.*
