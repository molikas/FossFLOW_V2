# S1 — Google identity & token lifecycle (GIS auth store, gates)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `AUTH-`

> Overlaps A5 boot-chrome auth seams — dedupe across ledgers. Live-OAuth-only seams get DEFERRED with a manual-test sketch.

**Scope:** In-memory GIS implicit-grant token (~1h, no refresh token) behind a zustand state machine: UNAUTHENTICATED / AUTHENTICATING / RECONNECTING / AUTHENTICATED / REFRESHING / SESSION_EXPIRED / DRIVE_ACCESS_REQUIRED. getValidToken() is the sole token accessor: returns current token if >5min to expiry, else fires a silent prompt:'' refresh; concurrent callers piggyback on a shared waiter list. Handles granular-consent (drive.file checkbox unchecked → DRIVE_ACCESS_REQUIRED hard stop), boot silent reconnect from a localStorage profile hint with login_hint, stale-error absorption when an interactive sign-in supersedes a silent request, and a global auth timeout (COOP-blocked popup recovery).

**Code:**
- `packages/axoview-app/src/stores/authStore.ts`
- `packages/axoview-app/src/components/DriveAccessRequiredDialog.tsx`
- `docs/adr/0035-google-identity-and-drive-authorization.md`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Share + Drive display*; Unit: *App auth + notification stores*, *Cloudflare Worker API + auth*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Token expiry mid-operation: a multi-request flow (GoogleDriveProvider retry loop, driveTransfer move loop, permissions.list page drain) calls getValidToken per request — a refresh that fails mid-sequence flips to SESSION_EXPIRED and the remaining requests throw 401 DriveError; check partial-state cleanup (e.g. driveTransfer created-on-Drive-but-not-yet-deleted-locally).
- Single global pendingAuthTimeout slot: grantDriveAccess() can fire while a REFRESHING request is in flight (it doesn't check status) — it re-arms the timer and sets _absorbStaleError:false, so the superseded refresh's late error is treated as the consent popup's own cancellation, resetting AUTHENTICATING under the user mid-consent.
- Waiter resolution on scope-less grant: _onToken's DRIVE_ACCESS_REQUIRED branch resolves getValidToken piggybackers via w.resolve() → they read accessToken=null and return null — callers see 'Not signed in' errors concurrently with the blocking re-consent dialog (double error surfaces).
- signOut vs in-flight Drive writes: ADR 0035 rule 3 (flush before revoke) is enforced only at AuthControl's call site — DriveDisplayGate.handleSwitchAccount calls signOut() directly; any autosave awaiting getValidToken resolves null and the write is silently dropped.
- Account switch leaves per-account caches: fresh grant re-fetches the profile, but localStorage axoview-drive-root (GoogleDriveProvider root cache) and axoview.recentShareEmails persist across accounts — folderExists() will 404 account A's root under account B's token and heal, but the in-memory this.rootFolderId short-circuits resolveRoot() without revalidation for the life of the page.
- markExpired() from a 401 during REFRESHING/RECONNECTING: it doesn't guard on status, so a late Drive 401 landing while a fresh sign-in is AUTHENTICATING would... (it does check status===SESSION_EXPIRED only) — it wipes _waiters of the in-flight interactive sign-in, rejecting the promise the sign-in button is awaiting.
- (mapper note) State machine is probe-able WITHOUT live Google: stores/__tests__ drive it via _setBridge with a fake requestToken/_onToken/_onError. Real GIS behaviors (COOP popup blocking, fedcm, interaction_required with multiple accounts, actual 1h expiry) need live auth. In e2e, needs-signin walls are reachable unauthenticated; anything past the sign-in button is not.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0037 §2 (active provider follows open diagram))** Switching the open diagram to another place flushes the pending autosave to the OLD place before setting the new active provider. → *With a dirty session diagram (debounced autosave pending), immediately open a Drive diagram: if the flush is fire-and-forget rather than awaited before the provider swap, the session autosave either writes through the Drive provider (wrong place) or is cancelled (silent data loss). driveTransfer/authStore tests don't cover the open-diagram provider-swap flush ordering.*
- **(ADR 0037 §5 (move semantics))** Move-to-Drive is create → verify returned id → only then delete from source; a failed item stays in session and is reported; moving the OPEN diagram reopens it from its new Drive id. → *Move the open dirty diagram: create+verify succeed, source delete succeeds, then the reopen-from-Drive fetch fails (token expired mid-flow): the canvas still shows the old session-backed state with a currentDiagram id that no longer exists anywhere → next autosave targets a deleted id. driveTransfer.test covers create/verify/delete ordering, not the reopen leg.*
- **(ADR 0036 §2 + known_issues (root-folder detection))** ADR 0036 promises the provider detects a deleted/trashed Drive root folder; as-built, isAvailable() only checks auth and the cached root id is never revalidated. → *Trash the app folder in Drive's own UI mid-session: autosaves keep 200-OK patching files in the trash for the rest of the session; loss surfaces only at next full listing. The cheap fix (invalidate on zero-listing or 404) is catalogued but unimplemented — any test asserting 'save succeeded ⇒ durable' is false here.*
- **(ADR 0035 / authStore.test.ts)** The Google token is NEVER persisted — only the identity/profile hint survives reloads; silent reconnect re-mints via GIS. → *The regression test spies on localStorage.setItem only. A convenience change that stashes the token in sessionStorage, IndexedDB, or a cookie (e.g. to survive the popup-blocker boot problem) evades the spy entirely and ships green while violating the ADR's central security contract.*
- **(ADR 0029 + sanitizeHtml hook)** User-authored HTML is sanitized before the single dangerouslySetInnerHTML sink, and the sanitizer forces rel='noopener noreferrer' on every anchor with href. → *The rel-forcing hook lives inside sanitizeHtml — link surfaces built directly in React (view-mode popover headerLink, connector-label link chips, TextBoxLinkCard's 'open in new tab') get target=_blank from their own JSX; any of them omitting rel=noopener reintroduces reverse-tabnabbing on user-supplied URLs, invisible to the sanitizer tests which only cover the HTML path.*
- **(ADR 0042 §2 + worker app.ts (resourceKey fix))** The public Drive read-proxy validates fileId and (since 2026-07-29) resourceKey on the allowlist /^[A-Za-z0-9_-]{10,120}$/, with a malformed resourceKey DROPPED so 'no valid request regresses'. → *Google resource keys can be shorter than 10 chars or contain other legal characters — a legitimate short resourceKey now gets silently dropped, so an 'anyone with the link' file that REQUIRES the key returns 404 from Drive and the viewer hits the auth-gate ladder with no hint. The worker test verifies the drop behavior, not that real-world resourceKey formats pass the same regex as fileIds.*
- **(canvas-interaction.md §2 (isRendererInteraction gate))** mousedown/mouseup gate on isRendererInteraction; mousemove deliberately does NOT — any move to scoped listeners must replace window-binding with setPointerCapture or drags break when the cursor leaves the box. → *A drag that strays over a NEW overlay child that stops propagation (a future minimap, the annotation palette when open in edit mode): moves keep flowing (window-bound) but the mouseup lands gated-out if the overlay swallows it → the drag never commits and DRAG_ITEMS stays armed, committing on the NEXT unrelated mouseup. No test releases a drag over each overlay surface.*

## Known coverage gaps (from the baseline inventory)

- (Share + Drive display) Re-sharing the same diagram (same UUID vs new link)
- (Share + Drive display) Share link revocation/expiry
- (Share + Drive display) Interactions inside the shared readonly view (zoom/pan/layer switching)
- (Share + Drive display) Signed-in (OAuth) Drive rung — only the anonymous proxy path is tested
- (Share + Drive display) Sharing a diagram that links to other diagrams (link behavior in shared view)
- (App auth + notification stores) packages/axoview-app/src/stores/diagnosticsStore.ts — zero tests

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
