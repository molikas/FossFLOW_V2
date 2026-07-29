# S2 — Share backend: session snapshots, routes, Express/Worker parity

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `SHARE-`

**Scope:** Framework-agnostic route handlers (routes.js) for diagrams/folders/tree-manifest plus the snapshot share lifecycle: POST /api/diagrams/:id/share copies the diagram into public/<uuid> (nanoid-style 21-char uuid, reused if diagram.shareUuid present), DELETE unshares, GET /api/public/diagrams/:uuid is the unauthenticated read. fs adapter maps keys to flat <STORAGE_PATH>/<id>.json files with tmp+rename atomicity. The Hono worker serves /api/config and the anonymous Drive read proxy but 503s all other /api/* (serverStorage:false); Express (Docker) serves the full storage surface. auth.ts implements none/shared-token/cf-access modes with a public-route bypass. LocalStorageProvider's server path is the app-side client of these routes; shareUrl.ts re-anchors the returned uuid to the page origin.

**Code:**
- `packages/axoview-backend/src/routes.js`
- `packages/axoview-backend/src/adapters/fs.js`
- `packages/axoview-backend/server.js`
- `packages/axoview-worker/src/app.ts`
- `packages/axoview-worker/src/auth.ts`
- `functions/api/[[path]].ts`
- `packages/axoview-app/src/services/storage/providers/LocalStorageProvider.ts`
- `packages/axoview-app/src/utils/shareUrl.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Share + Drive display*, *Save + error dialogs*; Unit: *Backend (Express/Docker) storage + share API*, *Cloudflare Worker API + auth*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- shareUuid stripped by full-save: routes.js saveDiagram (PUT, line ~126) writes `{...body, id, lastModified}` replacing the stored diagram — the app's autosave payload (leanIfModel of the editor model) does not carry shareUuid, so the first autosave after sharing silently deletes shareUuid from diagrams/<id> while public/<uuid> stays live. Next share mints a SECOND uuid (orphaned first snapshot readable forever); unshare/deleteDiagram can no longer clean the orphan. Fully probe-able with plain HTTP: create → share → PUT without shareUuid → share again → compare uuids.
- Reserved-id collision: assertId's ID_PATTERN accepts 'folders', 'tree-manifest', 'metadata', 'diagrams-index'; fs.js keyToPath flattens diagrams/<id> to <STORAGE_PATH>/<id>.json, so POST /api/diagrams with body.id='folders' clobbers folders.json (listDiagramMeta hides it afterwards). Probe-able without Google.
- folders.json lost-update race: createFolder/renameFolder/moveFolder/deleteFolder all read the whole array then rewrite it with no lock/version — two concurrent requests (e.g. project import burst + a user rename) drop one write.
- Non-recursive deleteFolder orphans grandchildren: only the target folder leaves folders.json; child folders keep parentId pointing at the deleted id, and sweepOrphanedDiagrams sweeps only diagrams whose folderId is in toDelete — descendants' diagrams survive but become invisible/inconsistent depending on how the tree walks parents.
- Concurrent shareDiagram double-mint: two POST /share for the same never-shared diagram both read shareUuid-less state, each generates a uuid and writes its own public snapshot; only the last diagram write records its uuid — the other snapshot is an untracked live orphan.
- Cross-deployment /display/p links: worker auth.ts isPublicRoute whitelists GET /api/public/diagrams/:uuid but app.ts has no handler for it — the catch-all returns 503 'Server storage is disabled'. A snapshot link minted on a Docker deployment opened against a Cloudflare deployment dead-ends; the client only suppresses the fetch when its own config said serverStorage:false, which is the CF case, so it shows the LocalModeShareErrorDialog copy — verify that copy makes sense for a recipient (not a local-mode owner).
- Backend-returned url field is host-derived (publicBaseUrl) and known-wrong in dev (:3001); shareUrlFromUuid papers over it client-side — any consumer of result.url (tests, future callers) regresses.
- Express body-size / worker 10MB bodyLimit asymmetry: a diagram that saves fine on Docker may 413 only through the worker paths; and the worker proxy's size gate trusts Drive's `size` field which is absent for some file types (Number(undefined ?? '0')=0 passes the cap, then alt=media streams the full body).
- (mapper note) Entirely probe-able WITHOUT Google credentials: routes.js is pure functions over an adapter (jest suite exists in packages/axoview-backend/src/__tests__), and the Express server runs against a temp STORAGE_PATH; worker has a vitest suite (packages/axoview-worker/src/__tests__). Playwright pattern for the client side: share-error.spec.ts mocks **/api/config, **/api/diagrams*, **/api/diagrams/*/share with page.route.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0021 item 7 (D-8 fix) + D-9)** After undo/redo, resyncScene re-routes connectors with missing/empty paths — but only in the ACTIVE view. → *Paste connectors on Page 1 → switch to Page 2 before async routing completes → undo/redo: resyncScene scans only the active view, so Page 1's pasted connectors stay pathless (invisible) until a later edit touches them. useHistory tests exercise single-view scenarios only.*
- **(rendering guidelines §8)** Any GPU layer whose geometry is projected must list strategy.projectionName in its rebuild deps; a DOM hit-proxy and its GPU paint must share one projection. → *Switch iso→2D in VIEW mode using the new viewer projection toggle (PR #84): if any of the four bulk canvases (or a future one) omits projectionName from deps, its paint stays in the old projection while hit-proxies move — the exact Labels bug, now reachable from a brand-new code path (PreviewCanvasModeToggle) that no e2e drives through all four layers.*
- **(ADR 0034 round-2 (normalizeQuillHtmlSpaces))** &nbsp;-serialized spaces are converted to real spaces on commit AND on load, so fixed-width boxes wrap; auto boxes render `pre`, fixed boxes `pre-wrap`. → *A read-only path that loads content without the editor-load normalization — the /display/drive viewer or a share-snapshot render — shows a legacy &nbsp;-heavy fixed-width box as one unbreakable line overflowing the box. Load normalization lives in the editing load chokepoint; no test loads legacy content through the read-only display routes.*
- **(ADR 0032 connector amendment §4 (nameSeeded marker))** The name→labels[] seed is idempotent via a nameSeeded marker stamped on every connector the pass touches; a name typed later is pure identity and never re-seeded. → *Paste a connector from the clipboard (or import a zip diagram) whose reconstruction drops the nameSeeded marker while keeping name: the next load re-seeds name into a midpoint label — duplicate label chips appear after every paste→save→reload cycle. Seed idempotency tests never route through clipboard/zip reconstruction.*
- **(ADR 0011 §1 (error UX contract))** Every failure-of-intent (user clicked/typed/dragged) surfaces an explicit Dialog; notification-toast-only handling and silent .catch(() => {}) are forbidden for such paths. → *Click 'Copy share link' in a context where navigator.clipboard.writeText rejects (non-secure context, permissions policy): the catalogued S1–S20 silent surfaces are still open, and new Drive-share paths added since B-9a (copy preview link, Manage-access actions) have never been audited — a rejection likely dies in a toast or a swallowed catch, and no test asserts dialog-vs-toast classification for new surfaces.*
- **(features.md (viewer-controlled projection, PR #84))** canvasMode in view-only mode is viewer-local UI state persisted only to that viewer's localStorage — switching projection can neither dirty nor save the diagram. → *A viewer switches to 2D on the /display route; the localStorage key is shared with the editor — the OWNER later opens the editor in the same browser and their diagram opens in 2D with a recentered scroll they never chose, and if any editor-side code treats canvasMode as model-adjacent (e.g. included in a future save payload or dirty-diff), a pure viewer action dirties the document. Tests assert non-dirty in view mode only, not the shared-key bleed into edit mode.*

## Known coverage gaps (from the baseline inventory)

- (Share + Drive display) Re-sharing the same diagram (same UUID vs new link)
- (Share + Drive display) Share link revocation/expiry
- (Share + Drive display) Interactions inside the shared readonly view (zoom/pan/layer switching)
- (Share + Drive display) Signed-in (OAuth) Drive rung — only the anonymous proxy path is tested
- (Share + Drive display) Sharing a diagram that links to other diagrams (link behavior in shared view)
- (Save + error dialogs) localStorage quota-exceeded specific path
- (Save + error dialogs) Autosave / dirty indicator behavior
- (Save + error dialogs) Unsaved-changes warning when navigating away or switching diagrams
- (Backend (Express/Docker) storage + share API) routes.js Express wiring itself (middleware order, JSON body limits, error handler) is untested — only the extracted route handler functions are exercised against the in-memory adapter

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
