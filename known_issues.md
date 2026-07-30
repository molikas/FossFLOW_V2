# Known Issues

**Last reviewed:** 2026-07-29 (whole-system technical review — see [technical-review-2026-07-29.md](docs/reviews/technical-review-2026-07-29.md); two entries added at the foot of this file for the deferred editor boot payload and the remaining runtime import cycle, both with options tables and risk levels). Previously 2026-07-15 (docs housekeeping). Open items cross-checked against [technical-review-2026-07.md](docs/reviews/technical-review-2026-07.md) — note **no frozen review yet covers** Drive storage, the `/app` landing split, or Drive-native sharing (see [docs/README.md](docs/README.md#frozen-baselines--reviews)), so for those surfaces the ADRs + [docs/guidelines/](docs/guidelines/) are the cross-check.

> **Convention — resolved entries stay.** This register keeps fixed/closed items in place, annotated `**Status:** Fixed in <sha> (date)`, because they are useful to search when a symptom recurs. That is the rule `/notes` enforces ("do not delete it"). *(The header previously read "Last pruned … resolved entries removed", which contradicted `/notes` and never matched the file's actual contents — 13 resolved entries were retained. Reconciled 2026-07-15 in favour of the `/notes` rule; nothing was deleted.)* Scan for **Status: Open** to read this as an open-issues list.

## App-level MUI components render un-themed ("default-MUI bloat")

**Symptom:** New UI built in `axoview-app` (dialogs, the toolbar, popovers, menus) renders on MUI's **default** theme — 16px body, 20px `h6`, 16px inputs, and `overline` in **UPPERCASE** — so it looks oversized and inconsistent next to lib UI, which renders under `axoview-lib`'s compact `theme.ts` inside `<Axoview>`. It recurs on **every** new app surface; the Share dialog (PR #69) was the latest and was fixed per-component (scoped compact `ThemeProvider` + `caption`/600 section headers).

**Root cause:** `axoview-app` has **no root `<ThemeProvider>`**, and the design-system theme lives only in the lib (and isn't exported), so app-level surfaces get MUI defaults. This silently violates [ux-principles §1.5](docs/guidelines/ux-principles.md) rule 5 — the §1.5 size table is the *theme's* scale and only holds where a `ThemeProvider` provides it.

**Workaround (per surface):** section headers use `caption` + 600 + `text.secondary` (sentence case; **not** `overline`, which uppercases un-themed); wrap the surface in a scoped compact `ThemeProvider` for title/input/menu sizing (see [`DriveShareManageDialog.tsx`](packages/axoview-app/src/components/DriveShareManageDialog.tsx)) and follow the "Dialog / app-surface typography recipe" in ux-principles §1.5.

**Status:** Open. Durable fix = export the lib theme (or lift a shared token module both packages consume) + wrap the app root in `<ThemeProvider>` + `<CssBaseline/>`, so the whole app is themed by default and the per-surface hacks disappear. App-wide visual blast radius → needs a visual pass + e2e run; ADR pending (owner decision).

## App-level MUI components render un-themed ("default-MUI bloat")

**Symptom:** New UI built in `axoview-app` (dialogs, the toolbar, popovers, menus) renders on MUI's **default** theme — 16px body, 20px `h6`, 16px inputs, and `overline` in **UPPERCASE** — so it looks oversized and inconsistent next to lib UI, which renders under `axoview-lib`'s compact `theme.ts` inside `<Axoview>`. It recurs on **every** new app surface; the Share dialog (PR #69) was the latest and was fixed per-component (scoped compact `ThemeProvider` + `caption`/600 section headers).

**Root cause:** `axoview-app` has **no root `<ThemeProvider>`**, and the design-system theme lives only in the lib (and isn't exported), so app-level surfaces get MUI defaults. This silently violates [ux-principles §1.5](docs/ux-principles.md) rule 5 — the §1.5 size table is the *theme's* scale and only holds where a `ThemeProvider` provides it.

**Workaround (per surface):** section headers use `caption` + 600 + `text.secondary` (sentence case; **not** `overline`, which uppercases un-themed); wrap the surface in a scoped compact `ThemeProvider` for title/input/menu sizing (see [`DriveShareManageDialog.tsx`](packages/axoview-app/src/components/DriveShareManageDialog.tsx)) and follow the "Dialog / app-surface typography recipe" in ux-principles §1.5.

**Status:** Open. Durable fix = export the lib theme (or lift a shared token module both packages consume) + wrap the app root in `<ThemeProvider>` + `<CssBaseline/>`, so the whole app is themed by default and the per-surface hacks disappear. App-wide visual blast radius → needs a visual pass + e2e run; ADR pending (owner decision).

## Storage/auth surface: pre-existing strings still hardcoded English (i18n debt)

**Symptom:** The 8e08933 Drive integration shipped with its entire UI hardcoded in English. The 2026-07-06 storage-ux-unification push i18n'd every string it **introduced or rewrote** (avatar menu, place sections, migration dialog, empty-state sign-in card, banner actions, Move-to-Drive — 37 keys × 13 locales), and the 2026-07-07 PR-59 review fixes swept in the delete-confirmation dialog + `DriveRootFolderDialog` (19 more keys × 13 locales). Still literal: most `ContextMenuItems` labels (Open/Rename/Duplicate/Delete/…), the name-collision dialog body, the FileExplorer/App toast messages, `ExportProjectZipDialog`, and the `authStore` expired/cancelled toasts (that store can't import the i18n singleton without dragging http-backend init into unit suites — needs a small notification-key indirection).

**Workaround:** None at the locale level; affected strings render in English in all locales.

**Status:** Open, deferred. Sweep them into `i18n/*.json` as those surfaces are next touched; the authStore case needs the notification store to accept keys instead of literals.

## Partial-coverage i18n locales (de-DE + id-ID)

**Symptom:** German (de-DE) and Indonesian (id-ID) have stub translations covering only the initial pre-rename string set. Newer strings (added since 2026-04) fall through to English. Users selecting these locales see mixed German/English or Indonesian/English UI.

**Workaround:** None at the locale level. Switch back to English (en-US) for a fully translated experience, or to one of the fully-covered locales (zh-CN, es-ES, pt-BR, fr-FR, hi-IN, bn-BD, ru-RU, it-IT, tr-TR).

**Status:** Open, deferred. Resolve when translators refresh those locales. Not a productization-blocker — locale switching itself works correctly; the stubs were preserved (rather than dropped from `supportedLanguages`) so the existing user choice keeps working. Filed alongside B-13 closure (productization audit Section 5).

## MUI menu close logs "Blocked aria-hidden on an element because its descendant retained focus"

**Symptom:** Closing the account menu (and occasionally the file-tree context menu) logs Chrome's aria-hidden warning: MUI's Modal marks the closing Popover/root `aria-hidden` while focus is still inside the menu list or on the trigger IconButton. Console noise + a real (minor) a11y nit; no functional impact. Surfaced during the 2026-07-06 storage-ux live test.

**Workaround:** None needed — purely console/AT noise.

**Status:** Open, deferred. Likely fix: blur the active element before closing (or move to the `inert` attribute pattern Chrome suggests) in the shared menu-close paths; sweep AuthControl + FileExplorer context menu together.

## DevTools flags a blocked `eval` CSP issue on the deployed app (benign)

**Symptom:** Chrome's Issues panel reports "Content Security Policy of your site blocks the use of 'eval' in JavaScript" attributed to a bundle chunk (seen as `426.*.js` on the 2026-07-06 integration deploy). Audited the full production build: the app bundle contains **no functional `eval`** — every occurrence is a guarded feature probe (lodash/webpack-runtime `Function("return this")` globalThis shims, short-circuited in any browser that has `globalThis`; core-js's `Function('return require(...)')` probe behind an is-node gate; all in try/catch). The block has zero runtime impact — each probe falls back cleanly. Unrelated to the Drive 403s seen the same day (those are server-side responses).

**Workaround:** None needed. Do NOT add `'unsafe-eval'` to `script-src` — the strict CSP is deliberate (2026-07-05 hardening).

**Status:** Open, deferred as console noise. Revisit only if a feature visibly breaks with a matching CSP error in the Console (not Issues) tab.

## Share dialog showed `Bad Request. User message: ""` on a corporate Google account — FIXED

**Symptom:** Setting General access to "Anyone with the link" failed on a Google Workspace account with a `400` from `POST /drive/v3/files/<id>/permissions`, and the dialog surfaced the literal string `Bad Request. User message: ""`. Not reproducible on a personal `@gmail.com` account. Reported 2026-07-28.

**Root cause:** Two layers. (1) Drive rejects the `{type:'anyone'}` grant by **domain policy** — `errors[0].reason` is `publishOutNotPermitted`, i.e. the org forbids sharing outside the company. The request is correct; the rejection is legitimate. (2) `toError` in `driveSharing.ts` read only `error.message`, and on policy rejections Google returns an **empty** user message (`Bad Request. User message: ""`), so the dialog displayed a string that conveys nothing. The actionable signal (`errors[0].reason`) was never read.

**Workaround:** None at the policy level — the org's Workspace admin controls it. Share with specific people instead; that path is unaffected.

**Status:** Fixed on branch `fix/shake-out-2026-07-28` (2026-07-28). `DriveShareError` now carries `reason`; an empty user message is treated as absent so our own fallback shows instead; `publishOutNotPermitted` maps to copy naming the policy and pointing at per-person sharing. Regression tests use the verbatim 400 body.

## Shared Drive link dead-ends with no action when the Picker rung is unconfigured — FIXED (code) / config gap OPEN

**Symptom:** A viewer opening a shared `/display/drive/<fileId>` link saw *"This diagram lives in its owner's Google Drive … this deployment cannot request it"* with **no button of any kind** — no sign-in, no retry, no way forward. Reported 2026-07-28 ("they still couldn't open it").

**Root cause:** Three layers, only one of which is a code bug.

1. **`GOOGLE_API_KEY` unset in the Production environment — the real gap, OPEN.** Deployed `/api/config` returns `drivePublicPreview: false`, and that field is literally `!!env.GOOGLE_API_KEY` ([app.ts](packages/axoview-worker/src/app.ts)). So [ADR 0042](docs/adr/0042-drive-native-sharing-and-readonly-preview.md) §2 **rung 1** — the anonymous Drive read-proxy that lets an "anyone with the link" viewer open a diagram with **no sign-in at all** — is off in production. ADR 0042 §8 records P1 as verified end-to-end with the key set as a **Preview** secret; it was evidently never added to **Production**. This is the rung that should carry ordinary share-link traffic, so with it off, every viewer is pushed down the ladder into the auth gate.
2. **Picker rung dormant — BY DESIGN, not a gap.** `googleProjectNumber` is null, so `pickerAvailable` is false. Per ADR 0042 §8 this is an accepted deferral: once the API key moved server-side, the Picker needs *its own separate browser key* (`setDeveloperKey`), and **P2 is explicitly DEFERRED/dormant**. Setting `GOOGLE_PROJECT_NUMBER` alone therefore changes nothing — it is necessary but not sufficient. *(An earlier revision of this entry called it a plain config oversight; that was wrong.)*
3. **Code — fixed.** The `pickerAvailable === false` fallback in `DriveDisplayGate` rendered only a `<Typography>`; every sibling branch offers an action, this one offered none. Note the state is `needs-grant`, meaning the viewer *is* signed in — the signed-out (`needs-signin`) branch always had a working sign-in button. The common real cause is being signed in with the **wrong account** (link shared to a work address, browser signed into a personal one).

**Workaround:** Sign into Axoview with the account the diagram was shared with, or ask the owner to share it with the account you are using.

**Status:** Code fixed on branch `fix/shake-out-2026-07-28` (2026-07-28) — the gate now names the signed-in address and offers "Use a different Google account" (`signOut()` clears the profile hint so Google shows the account chooser, then the Drive read is re-attempted; the existing one-shot auto-retry covers only `needs-signin`).

**Ops action still Open (highest value):** add `GOOGLE_API_KEY` to the **Production** environment (`wrangler pages secret put GOOGLE_API_KEY`, or Cloudflare dashboard → Workers & Pages → `axoview` → Settings → Variables and secrets → **Production**). Confirm with `curl -s https://axoview.app/api/config` showing `"drivePublicPreview":true`. That restores rung 1 so public share links open with no sign-in. Restoring the Picker (rung 3) is a **separate, larger** task — it needs a new browser-restricted Picker key *plus* `GOOGLE_PROJECT_NUMBER` (project number `485371025824`), and is tracked as deferred in ADR 0042 §8, not here.

## Strict CSP blocks Cloudflare's injected bot-detection script (benign)

**Symptom:** On the deployed app the Console logs `app:88 Executing inline script violates the following Content Security Policy directive 'script-src 'self' https://accounts.google.com https://apis.google.com'`, suggesting a hash (`sha256-Zj25giKcc2e9gOw7hrLaG34A1qUEP6sdBk9FekCjt8Q=`) or a nonce. Reported 2026-07-28.

**Root cause:** The inline script is **not ours** — Cloudflare injects it into the HTML response at the edge. `curl https://axoview.app/app` shows it appended after `<div id="root">`: `window.__CF$cv$params={r:'…',t:'…'}` loading `/cdn-cgi/challenge-platform/scripts/jsd/main.js`. That is Cloudflare **JavaScript Detections** (bot management). Our source [`app-shell.html`](packages/axoview-app/app-shell.html) line 88 is `</body>`, and the local `build/app.html` carries no inline script at all — confirming the injection is edge-side.

**Distinct from** the `eval` CSP entry above (different directive, different cause), and **unrelated to** the GSI popup / COOP console noise seen in the same trace: the popup failure is the silent-reconnect running without a user gesture (it self-reports and arms a gesture retry), and the `Cross-Origin-Opener-Policy would block the window.closed call` lines come from Google's own GSI client — we send **no COOP header** on any route (verified against both the deployed response and `_headers` / `nginx.conf`).

**Workaround:** None needed — Cloudflare's bot probe is blocked; the app is unaffected. Do **not** try to hash-allowlist it: the `r`/`t` params change per request, so the script's hash changes per request. Do not add `'unsafe-inline'`.

**Status:** Open, deferred as console noise (owner decision 2026-07-28). The clean fix is a Cloudflare dashboard change — Security → Bots → JavaScript Detections → off for the `axoview.app` zone — at the cost of that bot signal.

## SVG export "could not export image" under the strict CSP — FIXED

**Symptom:** On the deployed site, "Download as SVG" did nothing and logged "could not export image" + a `connect-src` CSP violation. `downloadSvgFile` did `fetch(svgData)` on a `data:image/svg+xml;base64,…` URL to turn it into a Blob, but a `data:` URL is a *connect* source and is not in the deployed `connect-src` allowlist (`'self'` + Google/Cloudflare, the 2026-07-05 hardening). Worked locally only because the dev server has no strict CSP.

**Workaround:** None needed — fixed. (Do NOT loosen the CSP to fix this.)

**Status:** Fixed in 04cdd1d (2026-07-09) — `downloadSvgFile` decodes the base64 with `base64ToBlob` (`atob`), the same util the PNG path uses, so there is no network request. Verified under the exact deployed `connect-src` CSP. Cross-ref the deliberate-CSP note above: client code must never `fetch()` a `data:`/`blob:` URL under this CSP — decode locally.

## Node icons render as black boxes on import (WebGL) until selected — FIXED

**Symptom:** After importing a diagram, node icons rendered as solid black squares until the node was clicked (selecting routes the node through the DOM interaction layer, sidestepping the WebGL atlas); name chips were unaffected. GPU/timing-dependent — reproduced on some machines, self-healed on others. Regression from the WebGL substrate ([ADR 0038](docs/adr/0038-webgl-instanced-render-substrate.md) / #63).

**Workaround:** Click/select the affected node (unnecessary now — fixed).

**Status:** Fixed in da9301b (2026-07-09) — icons were uploaded to the GL atlas as soon as `img.complete` was true, but `complete`/`onload` don't guarantee the bitmap is decoded and ready for `texSubImage2D`; an undecoded upload bakes a black tile that `putImage` then caches by url for the batch's life. `getImage` now gates on `img.decode()` (with a load/complete fallback), and every icon uploads through a Canvas2D intermediary — the same reliable source type the chips use.

## Google API architecture — hardening roadmap (from 2026-07-14 external review)

**Symptom:** the Google integration is a deliberate serverless V1. An external review (Gemini) validated the choices but flagged four forward-looking gaps, each backend-gated. Full brief + pros/cons + disposition table: `docs/google-drive-api-review-request.md` §10 (retired 2026-07-14; in git history through commit `5a72335`) — durable record is [ADR 0043](docs/adr/0043-deferred-backend-for-google-api-hardening.md).

1. **Auth is the implicit grant** (GIS token client, `response_type=token`) — ~1h sessions, no refresh token, no offline/background sync. Recommended: auth-code + PKCE with a minimal token broker. *Biggest risk: the deprecated flow + no refresh.*
2. **`drive.file` + Picker recipient UX** — Google's notification email links to the raw JSON file, not our `/display/drive` viewer. Recommended (later): a first-party publish-snapshot store.
3. **Public anonymous-read API key** — a scrape/abuse + 2026 quota-billing surface. Recommended: a signed short-lived read proxy (pairs with #1's serverless fn).
4. **Picker 3P-cookie fragility** — the display-route grant Picker can break silently when third-party cookies are blocked. The gate already has needs-grant / transient / picker-error / grant-unavailable states; finalize the cookie/popup copy at the P2 prototype gate.

**Status:** Open, roadmap — **durable decision record + per-item activation triggers now in [ADR 0043](docs/adr/0043-deferred-backend-for-google-api-hardening.md) (Accepted, 2026-07-14).** #1 + #3 want the same small backend (new routes on the existing `axoview-worker`, not a new service) and close the two biggest risks together — an owner decision on whether/when to activate, gated on the ADR 0043 triggers (Chrome 3P-cookie phase-out / API-key abuse signals / 2026 quota-overage billing). **Two no-backend mitigations shipped 2026-07-14:** (a) `addPersonPermission` emailMessage → viewer link + copyable preview link in the Manage-access dialog (softens #2's raw-JSON email); (b) `pickerError` copy now names the cookie/pop-up cause (the code half of #4). #4's remaining copy folds into P2. None block the ADR 0042 PR (#69).

## Google Drive place is online-only — no offline write queue

**Symptom:** Drive writes (autosave, create, move) require a live connection and a valid token. Offline, a Drive-place save fails after the retry/backoff run (500/1000/2000 ms) and surfaces the ADR 0011 failure dialog; there is no queue that replays the write when connectivity returns.

**Workaround:** Keep working — the in-memory scene is intact; retry the save (or export a zip) once back online. Session-place work is unaffected.

**Status:** Open, deferred (owner 2026-07-05, re-affirmed at the 2026-07-06 Drive wrap). Design sketch lives in ADR 0036's deferred list: an IndexedDB-backed write queue with replay + conflict detection. Referenced from PLAN.md Phase 3B.

## Move-to-Drive is one-way — no reverse move (Drive → session)

**Symptom:** The file tree offers "Move to Google Drive" for session diagrams, but no counterpart that moves a Drive diagram back into the browser session; the context menu on Drive rows has no such action.

**Workaround:** Open the Drive diagram, then Export → JSON and re-import into the session place (loses folder placement).

**Status:** Open, deferred at the 2026-07-06 Drive wrap (owner call: no demonstrated need — the session place is the downgrade path, not a destination). Revisit if users ask for it; the transfer machinery ([driveTransfer.ts](packages/axoview-app/src/services/storage/driveTransfer.ts)) is direction-agnostic in shape.

## No Picker "browse & add" in the file tree — files created outside the app AND "shared with me" diagrams are invisible

**Symptom:** With the `drive.file` scope, the file tree sees only files the app created. A diagram JSON placed in Drive by other means (manual upload, another app) never appears in the tree; there is no Picker "browse/import an existing Drive file into the tree" flow to grant the app access to it from the explorer. (Note: [ADR 0042](docs/adr/0042-drive-native-sharing-and-readonly-preview.md) *did* introduce a Google Picker — but **only** as the per-file access *grant* on the read-only `/display/drive/:fileId` route, so a recipient can view one specifically-shared file. That is not a general browse-and-add-to-tree flow; the file-tree browsing gap described here is still open.)

**"Shared with me" diagrams (called out 2026-07-14):** the same gap covers diagrams another user shares with you (via the share dialog or "anyone with the link"). Under `drive.file` you cannot *list* shared-with-me files, so they never surface in the tree; today the only way in is the read-only `/display/drive/:fileId` preview link — you can *view* a shared diagram but not add it to your own workspace or edit it. The reliable, scope-preserving fix is the **Picker's "Shared with me" view**: Google (not the app) shows the user their shared files; a pick records a **durable `drive.file` grant** and returns the fileId, which the app persists in its Drive manifest so it becomes a first-class tree entry (a "Shared with me" section — you don't *query* shared files, you *remember* the ones the user grants). Two flavors, both reuse the existing [`drivePicker.ts`](packages/axoview-app/src/services/drive/drivePicker.ts): **(1) add-from-link** — when you already hold a share link/fileId, a one-tap `setFileIds` grant → persist → tree (cheap; reuses the display-gate flow); **(2) browse** — a shared-with-me `DocsView` filtered to Axoview JSON. The only alternative (auto-listing shared-with-me) needs the *sensitive* `drive.readonly`/`drive` scope + Google verification — ruled out by [ADR 0035](docs/adr/0035-google-identity-and-drive-authorization.md).

**Workaround:** Download the file and use Import — the imported copy lands in the app's Drive folder and is visible thereafter. (For a shared diagram: open its `/display/drive/:id` link → Export → Import into your own workspace.)

**Status:** Open, deferred. Browse-existing, **shared-with-me**, and recipient-*editing* are one coherent **v1.1 Picker slice** — the same dormant Picker / Option-B path noted in [ADR 0042 §8](docs/adr/0042-drive-native-sharing-and-readonly-preview.md). It is gated on standing up the Picker on the deploy: a **browser** Picker key (`setDeveloperKey`) + `GOOGLE_PROJECT_NUMBER` (`setAppId`) — note the read-proxy's server key is server-only and does **not** feed the Picker, so a *separate* browser key is required. Sequence when picked up: an ADR for "Picker-granted Drive files in the tree" (durable-grant + manifest-persistence model), then flavor 1 (add-from-link) first, flavor 2 (browse) behind the Picker key. Revisit alongside the worker code-flow slice — all of these touch the OAuth surface.

## Deleting the Drive root folder mid-session is not detected

**Symptom:** The provider caches the discovered root folder id in memory (and localStorage) and never revalidates it during a session. If the user trashes the root folder in Drive's own UI while the app is open, `isAvailable()` still reports true (it only checks auth) and autosaves keep patching files that now sit in the trash; the loss surfaces only on the next full listing or reload (ADR 0036 §2 promises detection that is not yet implemented).

**Workaround:** Restore the folder from Drive's trash — the marker travels with it, and the next reload re-discovers it. Don't delete the root while the app is open.

**Status:** Open, catalogued 2026-07-07 (PR-59 review). Cheap fix direction: on a listing that returns zero files OR any 404 against the cached root, invalidate the cache and re-run marker discovery before concluding the place is empty.

## Boot silent reconnect needs a popup (gesture-retry stopgap; worker code-flow is the real fix)

**Symptom:** GIS's implicit-flow token client mints every token through a self-closing popup, and a boot-time silent reconnect carries no user activation — default popup blockers refuse it (`popup_failed_to_open`, confirmed live 2026-07-06). Remembered users therefore land signed-out on reload until their first gesture.

**Workaround (shipped, ADR 0035 §3 Amendment 2):** one-shot gesture-armed retry — the first pointer/key gesture re-runs the silent attempt inside user activation; the popup opens and self-closes in a blink. Allowing popups for the site removes even the blink.

**Status:** Open, catalogued pre-master-quality slice (owner pick 2026-07-06: "gesture retry now, code-flow later"). Definitive fix: **worker authorization-code flow** — `GOOGLE_CLIENT_SECRET` as a wrangler secret (server-side only), `/api/google/oauth/callback` + `/api/google/token` routes, refresh token in an HttpOnly encrypted cookie, Express parity per ADR 0009 §5, SPA off the implicit flow. Kills the popup entirely and survives reloads for months; worker stays storage-less.

## PWA install card is plain (cosmetic; install still works)

**Symptom:** Chrome's richer install card requires `form_factor: "wide"` + mobile screenshots in [manifest.json](packages/axoview-app/public/manifest.json); safe-zone-padded maskable icons (192×192 + 512×512) would also polish the installed app's home-screen presence. All three are cosmetic — install still works with the current manifest, and the deprecated combined `"any maskable"` purpose flag was already cleaned up in B-8 commit `f38d0b4`.

**Workaround:** None needed. PWA install proceeds normally; just shows a plain card.

**Status:** Open, deferred. Resolve when there's a marketing push for PWA installs. Filed alongside B-8 closure (productization audit Section 5).

## Preview-mode passive badge does not cover all clickable nodes

**Symptom:** In `EXPLORABLE_READONLY`, a node is clickable (opens the readOnly details panel) when it has any of: `link`, `headerLink`, `description`, or `notes`. But the passive visual indicators currently only cover two of these:

- Bottom-right OpenInNew badge → only when `link` is set
- Top-right blue dot → only when `notes` has visible content
- Nothing for `headerLink`-only or `description`-only nodes

The pointing-finger cursor on hover (added 2026-05-15) does cover all four cases, so the affordance is discoverable on hover — but at-a-glance scanning misses headerLink/description nodes.

**Workaround:** None. Users can still hover and click to discover the panel.

**Status:** Open. Decide on a unified badge story — either extend the existing badges to cover the missing cases, or replace both with one consolidated "more info" indicator that fires for any of the four content types.

## Transform handles scale with zoom instead of being screen-pixel-stable (ADR 0026 / 0044)

**Symptom:** The corner/edge resize handles (rectangles, text boxes, and now node icons — [ADR 0026](docs/adr/0026-rectangle-edge-transform-handles.md) / [ADR 0044](docs/adr/0044-on-canvas-icon-resize.md)) live inside the zoom-scaled `SceneLayer`, so they shrink as you zoom out — comfortable at 100% but small at low zoom. ADR 0026 §2 already flags this as an open item ("needs a `scale(1/zoom)` on the anchor").

**Workaround:** A transparent `HIT_PAD` forgiveness margin was added to `TransformAnchor` (2026-07-19) so a near-miss press still grabs the handle; zoom in for precise resizes.

**Status:** Open. Counter-scale the anchor glyph by `1/zoom` (screen-pixel-stable, UX §8.8), keeping its scene-space position — the ADR 0026 fix. Touches every transform-handle type.

## Canvas tile-cursor persists after the pointer leaves the canvas

**Symptom:** The blue tile-cursor highlight (`Cursor` / `IsoTileArea`, shown in select/placement modes) tracks the pointer's tile on mousemove but is not cleared when the pointer leaves the canvas region, so a stale diamond/square can sit at the last tile.

**Workaround:** It is now hidden while hovering an item (2026-07-19, so it no longer draws a confusing 2nd box over a hovered node) and while resizing; move the pointer back onto the canvas to refresh it.

**Status:** Open (minor). Options: hide the tile cursor on a renderer `pointerleave`, and/or only show it in placement/connector modes (not plain select) — a pre-existing behavior call.

## Hover feedback lags the cursor by one mousemove (`hasMovedTile` gate)

**Symptom:** The hover cursor + faint hover outline (`updateHoverCursor` in [`Cursor.ts`](packages/axoview-lib/src/interaction/modes/Cursor.ts)) recompute the hovered item only when the pointer crosses into a **new tile**, and the recompute reads the *previous* move's tile — so a single discrete pointer move onto an item does not raise its hover state until the next move event fires. A real user never notices (their mouse emits a continuous stream of moves, so the next event lands within a frame), but a scripted single `mouse.move` reveals it — the ADR 0023 off-grid e2e (`off-grid-pointer.spec.ts`) parks the cursor and sends an extra 1px nudge to work around it.

**Root cause:** the `if (!hasMovedTile(uiState.mouse)) return;` early-out is a per-tile-crossing throttle (a deliberate perf guard — a per-move hover recompute would churn every subscriber). The published `hoveredItem` therefore trails the live pointer by one move event. This is projection-independent and **not** off-grid-specific: snapped items behave identically. The ADR 0023 hardening surfaced it while writing real-mouse hover assertions but did not change it — it is a pre-existing perf/latency tradeoff, invisible in normal use.

**Workaround (tests only):** send a second, tiny pointer move (`hoverAt` in [`packages/axoview-e2e/helpers/offGrid.ts`](packages/axoview-e2e/helpers/offGrid.ts) does this) so the recompute lands.

**Status:** Open, deferred (working-as-designed latency). A fix would drop the one-move lag by recomputing on the *current* tile rather than gating on the delta, but must not reintroduce a per-move store write for every subscriber; not worth it until a user-visible symptom appears.

## Canvas node renderer: notes/link badges + connectors not drawn for unselected nodes (ADR 0019)

**Symptom:** With the Canvas2D node layer now the default renderer (ADR 0019), two visuals
are not yet painted on the canvas for nodes at rest:

- **Notes/link badges** (the top-right blue dot for `notes`, the bottom-right OpenInNew
  badge for `link` in preview mode). They reappear as soon as a node is **selected or
  dragged** (it renders via the DOM `<Node>` overlay), so the affordance is not lost on
  interaction — only on at-a-glance scanning of unselected nodes. (Compounds the existing
  "Preview-mode passive badge does not cover all clickable nodes" entry above.)
- **Connectors** — this bullet is **superseded by [ADR 0038](docs/adr/0038-webgl-instanced-render-substrate.md)** (WebGL fold, PR #63) and no longer describes the code. Connectors now render on a **hybrid split**, decided in `Renderer.tsx`: the bulk of connector bodies paint on the WebGL2 `ConnectorsCanvas`, and the sparse set (selected ∪ degenerate-1-tile ∪ unroutable) renders on the DOM/SVG `<Connector>` layer so it can carry the selection halo. The waypoint diamonds are a separate DOM overlay (`ConnectorAnchorOverlay`), independent of the body layer — which is why a stale WebGL composite can leave "diamonds but no line" (see the WebGL composite-blanking note under [canvas-rendering-guidelines.md §14](docs/guidelines/canvas-rendering-guidelines.md)).

**Workaround:** None needed for connectors. For badges: select/hover the node to see them.

**Status:** Open, deferred (T2 productization follow-ups). Badges need a screenshot-driven
placement pass to anchor them accurately on the iso-skewed canvas icon; folding connectors
onto the canvas would first need the perf harness to route connectors on spawn. Neither
blocks the T2 render-substrate win. Tracked in
[ADR 0019 implementation addendum](docs/adr/0019-canvas2d-node-render-layer.md).

## MQA diag exporter: element counts always read 0 — FIXED

**Symptom (historical):** The perf-diag JSON exporter recorded `ni: 0, nc: 0, ntb: 0` on every snapshot regardless of scene size, breaking the FPS-vs-complexity correlation it was meant to enable.

**Status:** **FIXED 2026-06-24.** Root cause: `DiagnosticsOverlay.getSceneCounts()` reads the lib store bridge `window.__axoview__`, which `Axoview.tsx` gated behind `enableDebugTools || NODE_ENV !== 'production'` — so in the production Docker build (where the overlay actually runs for users) the bridge was absent and the counts short-circuited to `{0,0,0}`. Fix: a dedicated `exposeStoreBridge` prop on `<Axoview>` (separate from `enableDebugTools`, so it does NOT surface the in-canvas SizeIndicator), wired in the app to the perf-monitoring toggle (`diagnosticsStore`). Enabling monitoring now also exposes the read-only bridge and the counts populate (verified in a Docker capture: `54/37/20`). Dev builds expose it unconditionally as before.

## Page tabs: hard cap of 5, no overflow-scroll UX

**Symptom:** The ViewTabs strip ([`ViewTabs.tsx`](packages/axoview-lib/src/components/ViewTabs/ViewTabs.tsx)) renders all pages inline with no horizontal scroll, overflow indicator, or dropdown. Beyond ~15 pages the tabs grow past the viewport and the right-most ones become unreachable.

**Workaround:** Hard cap installed at `MAX_PAGES = 5`. The "+" button disables with a "Page limit reached (5)" tooltip beyond the cap. Sufficient for current usage; lifts trivially once a proper overflow UX exists.

**Status:** Open. Proper redesign deferred — needs a real overflow story (horizontal scroll + chevrons, dropdown-with-search, or pinned + drawer) before raising the cap. Filed for a future ViewTabs refresh.

## leanSave test: `bundledFixtures[0]` undefined — STALE ENTRY, suite green

**Status:** **Closed as stale 2026-07-05** (technical-review-2026-07 audit). The lib suite is fully green (145 suites / 1,481 passing) with [`leanSave.test.ts`](packages/axoview-lib/src/utils/__tests__/leanSave.test.ts) running — its assertions tolerate the (still deliberately empty) [`fixtures/icons.ts`](packages/axoview-lib/src/fixtures/icons.ts). No skip or failure matching this entry exists anymore. The suite's **single standing skip** is a different, environment-shaped one: [`coordinateTransforms.test.ts:361`](packages/axoview-lib/src/utils/__tests__/coordinateTransforms.test.ts#L361) ("strategies have different gridTileUrls") is skipped because SVG imports are string-mocked under jsdom, so the two strategies' URLs are indistinguishable in the test env — deliberate, not debt.


## E2E `canvasReadyTest` fixture: a plain `page.reload()` lands on the empty state, not the diagram

**Symptom:** The `canvasReadyTest` fixture ([`packages/axoview-e2e/fixtures/app.fixture.ts`](packages/axoview-e2e/fixtures/app.fixture.ts)) boots by clicking the empty-state **Create** button, which mounts a blank diagram in the **stores** but never writes it to the app's explorer persistence (`axoview-diagrams` / `axoview-last-opened`). So a spec that calls `page.reload()` mid-test comes back on the **empty-state screen** (or the Import dialog) with the model gone from the canvas — a plain reload does not "reopen" the fixture diagram. `label-drag.spec.ts` only asserts the *model* across reload for this reason; the ADR 0023 off-grid reload case (`snap-grid.spec.ts`, "survives a reload at its DRAWN position") had to seed all three keys — `axoview-last-opened-data` **and** `axoview-diagrams` **and** `axoview-last-opened` — before reloading so the diagram comes back OPEN and painted.

**Root cause:** the fixture is designed to reach a canvas quickly, not to exercise the explorer's save/reopen path; persistence to the explorer only happens on an explicit save action the fixture never performs.

**Workaround (tests):** before a reload that must restore a painted diagram, write the model blob to `axoview-last-opened-data` and seed a matching `axoview-diagrams` entry + `axoview-last-opened` id (see the off-grid reload case). Boot also fit-to-screens, so assert drawn-position relationships (tile+offset, still-clickable, not-at-cell), not client coordinates compared across the refit.

**Status:** Open, deferred (test-infra sharp edge, not a product bug). A `canvasReadyTest` variant that persists the created diagram to the explorer would remove the per-spec seeding; low priority until more specs need reload-with-paint.

## File tree: double-click on a diagram does not enter rename mode

**Symptom:** Double-clicking a diagram row in the file tree does not enter inline rename mode.

**Workaround:** Select the diagram and press `F2`, or use the right-click context menu → Rename.

**Status:** Open. Rename via F2 and the context menu both work; only the double-click affordance is missing.

## Imported icons are scoped per-diagram, not per-project

**Symptom:** An icon imported while diagram A is open is not visible in the Elements panel when diagram B is open. Each diagram persists its own copy of every imported icon it places, so the same SVG can end up duplicated across N diagram blobs in storage. Deleting an imported icon removes it from the current diagram only — other diagrams that reference it keep their independent copies and continue rendering it (no tombstone there) until they're separately edited.

**Workaround:** Re-import the icon into each diagram that needs it. Or, on rare occasion, export → re-import a project zip; the round-trip carries icons across.

**Status:** Open, deferred. The MQA #26 delete + tombstone work (shipped 2026-05-18) is layered on top of the existing per-diagram `model.icons` contract — fixing the scope is a separate, larger piece of work than the delete UX. Considered and explicitly deferred during the MQA #26 session in favour of shipping the user-visible delete affordance first.

### Why this is not a one-day fix

The icon catalog conflates two concerns (see [ADR-0002](docs/adr/0002-icon-catalog-merge-on-load.md)): the side-dock catalog and the per-diagram persistence shape. Moving imports to project scope requires changes across:

| Layer | What changes |
|---|---|
| `StorageProvider` ([`types.ts`](packages/axoview-app/src/services/storage/types.ts)) | New `getProjectIcons()` / `saveProjectIcons()` API. `LocalStorageProvider` gets a new key; `GoogleDriveProvider` stays stubbed. |
| Migration | One-shot scan across every existing diagram to hoist `collection === 'imported'` icons into the project store. Idempotent + versioned flag. |
| Lib injection ([`Axoview.tsx`](packages/axoview-lib/src/Axoview.tsx), [`uiStateStore.tsx`](packages/axoview-lib/src/stores/uiStateStore.tsx)) | New `projectIcons` + `onProjectIconsChange` props mirroring the `iconPackManager` pattern. |
| [`ElementsPanel.tsx`](packages/axoview-lib/src/components/LeftDock/ElementsPanel.tsx) | Import + delete reroute from `modelActions.set` to the new callback. |
| [`DiagramLifecycleProvider.tsx`](packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx) | ~9 call sites currently filter `data.icons` for `collection === 'imported'` and concat into the diagram's model. All become `[...packIcons, ...projectIcons]` instead. |
| Lean-save ([`leanSave.ts`](packages/axoview-lib/src/utils/leanSave.ts)) | Strip imported icons from per-diagram saves, but **not** from single-diagram JSON exports (which must stay self-contained for the recipient). Needs an explicit `stripProjectIcons` param so each call site is unambiguous. |
| Project zip ([`projectZip.ts`](packages/axoview-app/src/services/project/projectZip.ts)) | Add `project.json` at the zip root carrying the project icon store. Older clients fall back to scanning per-diagram icons during the transition window. |
| ADRs | ADR-0002 lifecycle section + ADR-0003 strip-rule both extend. |

### Behavioural decisions a future implementer must take

1. **Undo for project ops.** Imports + deletes either become non-undoable (project ops are committed immediately — simplest), or get their own project-state history stack (significantly bigger). The MQA #26 delete dialog has a confirm step, so "irreversible after confirm" is defensible; but the contract change must be approved.
2. **`project.json` location in the zip** — root or under `meta/`. Either works; root is simpler.
3. **Single-PR vs phased rollout** — Phase 1 (storage + migration, no strip) is fully reversible and could ship ahead of Phase 2 (ElementsPanel rewire) to validate the migration in production before behavioral changes land. Phase 3 (strip + export adjustments) needs the export paths audited to make sure none accidentally strip on the wrong side.
4. **Public name in the API** — `projectIcons` (clearer scope) vs `importedIcons` (matches the existing `collection: 'imported'` tag).

### Risks

- **Migration partial failure** — mitigated by deferring the per-diagram strip until each diagram is independently saved post-migration (so original blobs stay intact until verified).
- **Race on import-then-switch** — `projectIcons` state propagates async; mitigated by recomputing `model.icons` on every `projectIcons` change via `useEffect` in `DiagramLifecycleProvider`.
- **Lean-save stripping on the wrong path** — exports must keep icons inline. The explicit `stripProjectIcons` boolean per call site is the safety net.
- **Older client reads newer save** — same as the existing ADR-0003 "catalog version drift": items reference ids that are no longer in the diagram's local icons → tombstones. Recoverable, not destructive. Single-user app for the foreseeable future, so rollback hazard is low.

## Undo desync: dual history stacks skew on interleaved model-only + both-store ops (D-7) — FIXED

**Symptom (historical):** Undo/redo are two independent patch stacks (model + scene). A model-only op (place icon, lone-node drag) pushes a model entry but no scene entry, so the stacks skew to different depths. After `draw connector → place icon → Ctrl+Z`, the single undo popped the top of *each* stack — which then belonged to different actions — leaving the connector in `model.views[].connectors` with no `scene.connectors[id]` path = an invisible connector (the MQA #5 symptom, different mechanism).

**Status:** **FIXED 2026-06-14** (commit 1 of the ADR 0018 Pointer-Events branch). Logical-action sequence-stamping ([historySequence.ts](packages/axoview-lib/src/stores/historySequence.ts)): every history entry both stores push is stamped with a shared monotonic sequence allocated once at each logical-action boundary (standalone `set`, `transaction`, `beginDragTransaction`). `useHistory.undo/redo` reverts only the stack(s) whose top carries the most-recent (undo) / least-future (redo) sequence, so one keystroke reverts exactly one logical action across whichever store(s) participated. Guarded by the now-unskipped coherence spec in [undo.dualStackSkew.test.tsx](packages/axoview-lib/src/__perf_refactor_regression__/undo.dualStackSkew.test.tsx) (the skew-source characterization stays green too). The `MAX_HISTORY_SIZE=50` trim-skew sub-case (behavior-map §4.5(a)) is resolved by the same fix.

### Residual follow-ups (NOT covered by the D-7 sequence-stamping fix)

These are distinct mechanisms, not stack-skew, so the sequence-stamping work does not address them. Filed explicitly so they are not lost:

- **D-8 — paste→undo→redo restored empty connector paths — FIXED 2026-06-16 (PR #49, [ADR 0021](docs/adr/0021-paste-algorithmic-perf-and-spatial-index.md) item 7).** Paste records a provisional empty path in the scene history entry (`createConnector(..., skipPathfinding=true)`), and `computePathsAsync` fills the real paths *outside* history (`skipHistory=true`). So paste → `Ctrl+Z` → `Ctrl+Y` re-applied the recorded patch with empty paths → pasted connectors rendered pathless until a later edit touched them. **Fix:** `useHistory.undo/redo` calls a scoped `resyncScene()` that re-routes the active view (`SYNC_SCENE`, written `skipHistory` so it never perturbs either undo/redo stack) — but **only when** an active-view connector actually has a missing/empty (non-`unroutable`) path, so the common model-only undo (e.g. a rename) pays just an O(C) `tiles.length` scan, never a synchronous full re-route at 700+ connectors. Guarded by the `useHistory` unit suites ([useHistory.test.tsx](packages/axoview-lib/src/hooks/__tests__/useHistory.test.tsx) + [useHistory.realStore.test.tsx](packages/axoview-lib/src/hooks/__tests__/useHistory.realStore.test.tsx)).
- **D-9 — cross-view (page-switch) undo applies scene patches to the wrong view.** The scene store holds only the current view but its history stack is global and unscoped; `changeView` rebuilds the scene with `skipHistory=true` and does not clear/scope history. Undoing after a page switch applies the previous view's scene patches to the current view (phantom/stale `scene.connectors[id]`) while the model undo reverts an off-screen view. **Fix sketch:** scope scene history per-view, or clear/snapshot on `changeView`. Larger change; deferred. **Repro committed 2026-07-29** by the exploratory
  campaign (HIST-09):
  [`hist-09-10.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/E1-history/hist-09-10.explore.spec.ts)
  — draw two connectors on page 1, switch to an empty page 2, Ctrl+Z, and page 2's
  scene cache ends up holding page 1's connector path (`test.fail()`, with a
  passing characterization test alongside it).

## Touch per-item actions (delete / z-order) — RESOLVED via direct manipulation (Option A)

**Resolved 2026-06-14 (B).** Originally D-6 routed touch actions through the Properties panel and kept the NodeActionBar desktop-only, leaving delete + z-order unreachable on a pure touchscreen. The Option A revision (direct manipulation — see ADR 0018) makes **move a drag**, so long-press is no longer overloaded: a long-press on a node fires the OS `contextmenu`, which opens the **NodeActionBar** for the pressed node (delete / z-order / layer / start-connector). It targets the pressed node reliably because the touch pointerdown seeds `uiState.mouse.position`. So all per-item actions are reachable on touch via long-press; name/style/notes/link also remain in the Properties panel (auto-opens on selection), and layers via the LayersPanel.

## Rectangle / textbox drag perf (move + draw + resize) — FIXED (D-3 resolved)

**Fixed 2026-06-14.** Manipulating a rectangle/textbox dropped to ~7 fps with a GC sawtooth (perf-diag capture). `DragItems` moved nodes via the CSS-preview path but routed textbox/rectangle **moves** through `updateRectangle`/`updateTextBox`, and the rectangle **DRAW**/**TRANSFORM** modes did the same per tile — each a full-state immer `produce` **every frame** (and, for draw/resize, no drag transaction → one undo entry per tile).

- **Move:** routed through immer-free `batchUpdateRectangles`/`batchUpdateTextBoxTiles` (one structural array copy, model-only) inside the existing drag transaction → one undo entry.
- **Draw / Resize (D-3, supersedes the earlier deferral):** `DrawRectangle`/`TransformRectangle` now open a `beginDragTransaction` (draw: before `createRectangle`; resize: on entry) and write per-frame via `batchUpdateRectangles`, committing on mouseup (+ exit safety-net). Result: smooth, immer-free, and one undo entry per draw/resize.

Guarded by `DragItems.modes.test.ts` + `rectangleTextbox.dragPerf.test.tsx` (move) and `DrawRectangle.test.ts` / `TransformRectangle.test.ts` / `rectangleDrawTransform.modes.test.ts` (draw/resize routing + begin/commit). Note: textbox *create* (the `t`-hotkey one-shot) still uses the reducer once — not a hot path.

The connector-drag GC cliff below is a separate, still-open item (per-frame model write through the reducer; needs a connector preview path).

## Connector drag still mutates the model on every tile

**Symptom:** A long sustained connector drag (or anchor reconnect) holds 60 fps for ~50 seconds on the perf-stress fixture (80 nodes / 120 connectors), then degrades over a few seconds and stalls at ~4 fps for ~5 seconds before recovering. The shipped fix (drag-transaction + closed-form router) eliminated the original symptom — sub-10fps within seconds of drag start. What remains is a sustained-drag GC cliff, not a per-tile slowdown.

**Workaround:** None needed for typical use. A drag from A to B on a real diagram lasts a few seconds and stays at 60 fps end-to-end. Only marathon drags (cursor circling, no commit, ≳50 s) trip the cliff.

**Status:** Open, deferred. Filed for a future refactor session.

### Empirical findings (2026-05-10)

Captured from the perf overlay using [packages/axoview-lib/src/__perf_refactor_regression__/fixtures/perf-stress-diagram.json](packages/axoview-lib/src/__perf_refactor_regression__/fixtures/perf-stress-diagram.json):

| Window | FPS | Heap pattern |
|---|---|---|
| 0–50 s of drag | steady 60 | flat ~80–110 MB, no GC |
| 50–55 s | 60 → 41 → 35 → 16 → 4 | climbs 175 → 211 → 253 → 294 → **336 MB**, no GC |
| 55–56 s | 4 → 4 → 4 (5 s sustained) | held at 336 MB |
| 56 s | 26 → 19 → 25 → 14 → 59 | one big GC drops 336 → 104 MB |
| `lt` (cumulative long tasks) | grows from 9 → 85 across the cliff | 12, 9, 8, 8 long-task bursts in successive 1 s windows |

Pattern: **allocation-rate-limited GC pressure**, not a CPU bottleneck. V8 holds off on full GC during sustained synchronous work; allocations accumulate to ~336 MB; one stop-the-world collection then recovers.

### Why the shipped fix doesn't cover this

- `beginDragTransaction` / `commitDragTransaction` (in [useSceneActions.ts](packages/axoview-lib/src/hooks/useSceneActions.ts)) freezes `pendingPre` so per-tick `set()` calls skip `produceWithPatches`. That eliminated the patch-generation cost.
- The closed-form router in [pathfinder.ts](packages/axoview-lib/src/utils/pathfinder.ts) eliminated A\* + `PF.Grid` allocation per tick.
- **What still happens per tick:** the anchor is mutated on the model. [`reducers/connector.updateConnector`](packages/axoview-lib/src/stores/reducers/connector.ts#L62) runs `produce(state, ...)` over the entire `state` (model + scene), and a nested `produce` inside `syncConnector`. Each clone is ~100–200 KB on the stress fixture. At 60 fps that's ~12 MB/sec of fresh state objects. V8 catches up eventually, but on a long enough drag the heap outpaces it.

### Refactor design context (for a future session)

**Approach (deferred #3):** keep the in-progress connector preview in `scene.connectors[id].path` only. Don't touch `view.connectors[].anchors` until mouseup / second-click commit. The per-tick model clone goes away; only the small `scene.connectors[id]` slice needs updating per tick.

**Files in the hot path that the refactor would touch:**

| File | Role | What changes |
|---|---|---|
| [`interaction/modes/Connector.ts`](packages/axoview-lib/src/interaction/modes/Connector.ts) | Drives the drag | mousemove must update only the preview path, not call `scene.updateConnector` (which writes the model). On commit: write final anchors once. |
| [`interaction/modes/ReconnectAnchor.ts`](packages/axoview-lib/src/interaction/modes/ReconnectAnchor.ts) | Anchor reconnect | Same pattern. |
| [`stores/reducers/connector.ts`](packages/axoview-lib/src/stores/reducers/connector.ts) | `updateConnector` reducer | Currently does both: writes anchors AND runs `syncConnector`. Needs a sibling reducer that updates `scene.connectors[id].path` only (no model clone). |
| [`hooks/useSceneActions.ts`](packages/axoview-lib/src/hooks/useSceneActions.ts) | Action API | Add `previewConnectorPath(id, anchors)` that bypasses the reducer's model write. |
| [`components/SceneLayers/Connectors/Connector.tsx`](packages/axoview-lib/src/components/SceneLayers/Connectors/Connector.tsx) | Renders the connector | Already reads `scenePath` from sceneStore — likely no change needed if preview lands there. |
| [`components/ConnectorAnchorOverlay/ConnectorAnchorOverlay.tsx`](packages/axoview-lib/src/components/ConnectorAnchorOverlay/ConnectorAnchorOverlay.tsx) | Endpoint hit-targets | Reads anchor refs from model. During drag the model anchors are stale until commit — the overlay needs a "preview anchor" override or to hide during drag. |
| [`components/SceneLayers/ConnectorLabels/ConnectorLabel.tsx`](packages/axoview-lib/src/components/SceneLayers/ConnectorLabels/ConnectorLabel.tsx) | Label positioning | Same concern: reads anchor positions from model. |

**Invariant change.** Today: `view.connectors[].anchors` is the source of truth, scene path is derived. After the refactor: during a drag, model anchors are *committed-state-as-of-mousedown*; scene path is *current preview*. Two readers (overlay, label) need to know which to consult while a drag is open.

**Test before/after.** The perf-stress fixture is wired into [`connector.dragPerf.test.tsx`](packages/axoview-lib/src/__perf_refactor_regression__/connector.dragPerf.test.tsx) and validated against `modelSchema` on load. Use the same fixture for manual before/after comparison; the fix should hold 60 fps for an arbitrarily long drag (no GC cliff). Add an explicit perf assertion (e.g. 500-tick drag under N ms) once the refactor lands so this can't regress silently.

**Risk register.** The hardest part is the two-reader invariant. Anchor refs on the model can be `{ item }` or `{ tile }`; the preview must produce the same shape so downstream code (label positioning, anchor hit-testing, item-control panel) doesn't branch on "is a drag in progress". One option: extend `scene.connectors[id]` with `previewAnchors?: ConnectorAnchor[]`; readers fall back to model anchors when absent. That keeps the contract local to the scene store rather than leaking into UI state.

## Touch/touchpad node placement — SHIPPED (ADR 0018)

**Resolved 2026-06-14.** The press-drag-release-only model is replaced by the touch/pen gesture contract ([ADR 0018](docs/adr/0018-touch-pen-gesture-contract.md), Accepted): one Pointer Events layer branches on `pointerType` — mouse/trackpad keep press-drag-release (with a px-based tap-vs-pan threshold that fixes the precision-trackpad sub-tile drag), and the `window` mouse + touch-synthesis path (and the `(0,0)` drop bug) are gone.

**Touch model = direct manipulation (Option A, 2026-06-14 (B), after device testing).** The initial tap-to-place (SELECT→GRAB→PLACE) was replaced — it fought muscle memory and overloaded long-press. Now: tap a node selects it; **drag a node moves it** (down-on-node → forwarded to the desktop `DRAG_ITEMS` path); drag empty canvas pans; two-finger pinch-zooms; **drag a connector endpoint handle reconnects it**; long-press opens the per-item action bar (move is a drag now, so no overload). Matches Figma/Miro/Lucidchart. No `CARRY_ITEM` mode.

### §5.1 e2e coverage follow-ups (P1, deferred — not introduced by this work)

Closed in the ADR 0018 e2e revision: touch tap-select/place/pan/pinch/abort, the D-7 dual-stack undo repro, and the CSS-preview-mid-drag P0 invariant. Still open as P1 (pre-existing canvas-interaction gaps): a per-mode Escape-abort matrix e2e, a RAF-throttle-under-load unit assertion, and a pan/zoom zero-scene-re-render render-probe. (The former "NodeActionBar invocation/dismissal e2e" gap is moot — the action bar was removed in the 2026-06-25 shake-out.) Filed so they aren't lost; lower priority than the shipped touch coverage.

## Track P (canvas-ux-overhaul) — perf-gate follow-ups

The program-end perf gate ([ADR 0020](docs/adr/0020-engine-perf-harness-and-measurement-protocol.md); full evidence in [perf-results/decision-log.md](perf-results/decision-log.md) "Track P") proved the canvas-ux-overhaul held the engine budget (spawn neutral tip-vs-pre, KR1 7.8%, KR3 idle pass, anti-cheat zero program regressions). It left these open, lower-priority items:

- **`NodeLabelHitLayer` emits one DOM div per visible labelled node at zoom ≥ 0.4** (ADR 0024). The T6 per-frame-write stall is fixed (label-drag 103 → 17.5 ms/frame), but at high zoom on a large diagram the hit layer still adds ~N invisible divs (e.g. 1000 at N=1000). A cursor-proximity cap (mount only the few divs near the pointer) would cut that DOM. Functional today; deferred.
- **O(N) `scene.items.find` in the drag hot path** (`computeNodeUpdates` + `applyNodePreview`, ADR 0023). Negligible for the common single/few-item drag, but O(M·N) for an M-item multi-drag (the SPATIAL anti-pattern). Cache the dragged items' `collides`/`snap` at drag entry (like `externalOccupiedCache`). Needs a multi-drag harness scenario to validate a fix.
- **Connectors are the DOM-volume driver at scale.** The HTML-bloat stress (`perf-results/bloat-1000.md`) showed the canvas node layer emits 0 per-node DOM, so ~11.5k DOM elements at 1000 nodes come almost entirely from the 968 DOM/SVG connectors. Folding connectors onto the canvas is the remaining DOM headroom — Iter-7 deferred it (0 spawn prize, but it IS the DOM driver); needs the harness to route connectors on spawn before re-measuring.
- **Collision-drag @N=500 +14% (accepted).** The off-grid drag-preview machinery (ADR 0023 snap/offset lockstep) adds ~3.6 ms/frame to the 500-node collision-drag — small, irreducible, on a path already over budget pre-program (~26 ms / 33 fps). Documented + accepted in the decision-log, not a re-render regression (renderProbe identical).

## Large-diagram pan: per-frame canvas repaint floor (R1) — ✅ RESOLVED 2026-07-08 by the WebGL2 substrate

> **Status: Fixed** (ADR 0038 / PR #63, v3.5.0) — **resolved by substrate replacement, not by the fix this entry proposed.** The root cause below is `NodesCanvas.drawNow()` repainting every visible node synchronously in **Canvas2D** on each scroll write. That code path no longer exists: [NodesCanvas.tsx](packages/axoview-lib/src/components/SceneLayers/Nodes/NodesCanvas.tsx) now draws through `glSpriteBatch` as instanced GPU quads with the tile→screen transform in the vertex shader, so **panning is O(1) on the CPU** and holds 60 fps to ~20,000 nodes. Neither planned fix — (a) dirty-region/layered redraw nor (b) the sync-small/async-large hybrid — was ever built, and neither is needed; the outstanding "large-N `scrollSync` guard variant" prerequisite is likewise moot. See [ADR 0038](docs/adr/0038-webgl-instanced-render-substrate.md) and [docs/guidelines/canvas-rendering-guidelines.md](docs/guidelines/canvas-rendering-guidelines.md). *(Retained per the register's keep-resolved-entries convention. The 2026-07-15 sweep found this entry still marked OPEN a week after the substrate landed.)*

**Symptom:** Panning a large diagram (~54 nodes / 37 connectors / 20 textboxes at ~65% zoom, whole scene on-screen) holds only ~24–55 fps on AC power and collapses to ~6–8 fps with a long-task storm when the laptop runs on battery (CPU throttled). Crucially, on AC power there is **no rubber-band and zero long-task accumulation during pans** — those were the R2/R3 + Grid-reflow causes fixed 2026-06-24.

**Root cause (verified, adversarial RCA 2026-06-24):** `NodesCanvas.drawNow()` repaints the full O(visible) node set synchronously on every scroll write — the deliberate #54 design (commit b62dec79) that keeps the canvas in lockstep with the DOM SceneLayers to kill cross-surface skew. At ~54 visible nodes that per-frame repaint (per node: drawImage + dotted stalk stroke + chip roundRect + fillText) is the steady frame-time floor; it does **not** require a tile-boundary crossing. Under CPU throttling the same repaint overruns the throttled budget and produces the >50 ms long-task storm — which is why the battery window in the capture cratered while the on-power windows held flat.

**What WAS fixed 2026-06-24 (the bursts, not this floor):** coarse-bounds culling decoupled from the per-frame pan path (gesture-agnostic throttle + settle), `visibleItems`/`visibleConnectors` array identity stabilised so connector layers + the NodesCanvas `[nodes]` effect bail on membership-stable crossings, and the Grid's per-frame `getBoundingClientRect()` reflow removed. ([Renderer.tsx](packages/axoview-lib/src/components/Renderer/Renderer.tsx), [Grid.tsx](packages/axoview-lib/src/components/Grid/Grid.tsx).)

**Workaround:** Edit large diagrams on AC power (on-power pan has no freezes); lower zoom / fewer on-screen nodes reduces the per-frame cost.

**Status:** Open, deferred — explicitly parked 2026-06-24 in favour of shipping the verified burst fix. The cheap lever (caching per-node string normalisation) will **not** move it: the committed drag CPU profiles ([perf-results/dragprofile-*.md](perf-results/)) show ~0 self-time there. The real cost is the canvas draw calls themselves, so a genuine fix means one of: **(a)** a dirty-region / layered-canvas redraw (only repaint the changed region), or **(b)** a sync-on-small / async-on-large hybrid — which directly risks reintroducing the #54 trailing rubber-band on exactly the large scenes that exhibit the symptom. Two guards must land **before** attempting (a)/(b): the existing #54 guard ([NodesCanvas.scrollSync.test.tsx](packages/axoview-lib/src/components/SceneLayers/Nodes/__tests__/NodesCanvas.scrollSync.test.tsx)) renders `nodes={[]}`, so a node-count gate would keep it green while silently regressing real scenes (a false-safe — add a large-N variant); and a pan scenario in the perf harness. *(Prereq update 2026-07-05, technical-review-2026-07 audit: the second guard **landed** — `measurePan` is in the harness ([engine-perf.spec.ts](packages/axoview-e2e/perf/engine-perf.spec.ts), E-slice per [pan-r1-design.md](perf-results/pan-r1-design.md) / ADR 0020 addendum), so the floor is now measured. The large-N `scrollSync` guard variant remains the one outstanding prerequisite before attempting (a)/(b).)*
## Image export drops connectors in ISOMETRIC view (2D export is fine)

**Symptom:** Exporting a diagram as an image (PNG/SVG) omits all **connectors** when the
view is **isometric**. The same diagram exported from **2D view** includes connectors
correctly. Nodes, text boxes, and labels export fine in both projections; only
connectors are missing, and only in iso.

**Root cause (confirmed by the iso-vs-2D split):** connectors are the only scene
elements rendered as a nested inline `<svg>` (nodes are Canvas2D; text boxes/labels are
HTML). In iso, `useIsoProjection` puts the projection's CSS `matrix()` skew on the
connector's wrapper `<Box>` ([`getProjectionCss`](packages/axoview-lib/src/contexts/CanvasModeContext.tsx) returns the matrix in ISO, an empty
string in 2D — [`useIsoProjection.ts`](packages/axoview-lib/src/hooks/useIsoProjection.ts)), and the inner
[`<Svg>`](packages/axoview-lib/src/components/SceneLayers/Connectors/Connector.tsx) additionally carries `transform: scale(-1, 1)`. The image export
([`exportOptions.ts`](packages/axoview-lib/src/utils/exportOptions.ts) → `dom-to-image-more`) serializes the DOM into a
`<foreignObject>` and rasterizes it; a nested inline `<svg>` (with its own transform)
under a `matrix()`-skewed ancestor is exactly the case `dom-to-image-more` mishandles.
In 2D the wrapper has no transform, so the same `<svg>` rasterizes fine. Related: ADR 0025
(image-export robustness).

**Next diagnostic step (was in-flight, instrumentation since removed):** temporary
`[export-diag]` logging was added to `exportImage` to split the two possible fixes but
the run's console output was never captured. Re-add a probe (or read the captured
serialized SVG) to determine:
- serialized SVG **lacks** `<polyline>` -> `dom-to-image` drops it during clone/serialize
  -> fix lives in the export path (restructure what is cloned), no live-render change.
- serialized SVG **has** `<polyline>` but PNG is blank -> browser won't rasterize the
  `<svg>` under the iso `matrix()` -> fix means flattening the connector's transform
  (move the iso matrix off the wrapper / combine onto the svg), which touches the shared
  live connector renderer and must be visually verified in both iso live + iso export.

**Workaround:** export from **2D view**, or (until fixed) screenshot the iso canvas.

**Status:** Open, deferred. Diagnosed to the iso `matrix()` + nested `<svg>` interaction
in `dom-to-image-more`; the remaining fork (serialization vs rasterization) needs one
console capture before a fix is chosen. Filed from the 2026-06-25 shake-out (item #5).

---

## WebGL render substrate — deferred productization follow-ups (2026-07-08)

From the WebGL-fold productization (PR #63, ADR 0038). Each is scoped and
recorded in ADR 0038 §Deferred; none blocks the WebGL2-only substrate.

- **WebGL context-loss recovery — RESOLVED 2026-07-08 (pending manual verification).**
  All four GPU layers now `preventDefault` on `webglcontextlost` and rebuild the
  `SpriteBatch` on `webglcontextrestored` (shared [`webgl/contextLoss.ts`](packages/axoview-lib/src/webgl/contextLoss.ts);
  ConnectorsCanvas re-packs its arrow sprite). Draw-only, so no scene state is lost
  across a loss/restore cycle. **Cannot be exercised in CI** (jsdom has no WebGL2;
  perf/e2e can't force a loss) — confirm with a manual `WEBGL_lose_context` smoke,
  and add a unit test once the `webgl/` ts-jest transform blocker clears. Residual:
  a browser that advertises WebGL2 but fails shader/link/atlas-alloc still shows a
  *first-paint* blank layer — now logged (`console.warn` per layer), not silent.
- **GPU connector/rectangle line-styles — RESOLVED 2026-07-08 (pending visual
  verification).** `ConnectorsCanvas` now emits `style` DASHED/DOTTED + `lineType`
  DOUBLE/DOUBLE_WITH_CIRCLE (offset polylines + mid-path ellipse ring), and
  `RectanglesCanvas` emits dashed/dotted borders, via the shared
  [`webgl/lineStyle.ts`](packages/axoview-lib/src/webgl/lineStyle.ts) walker —
  mirroring the DOM. Same change fixed **stroke-width fidelity** (all bulk widths
  are scaled to scene space by the projection factor, so they are no longer
  ~1.22× too thick in iso and are consistent across connectors + rectangles) and
  **arrow visibility** (white-tinted so the baked outline survives). Only rounded
  rectangle corners remain approximated (sharp) on the bulk. Confirm in a real
  browser (WebGL can't render under jsdom/SwiftShader in CI).
- **Premultiplied-alpha mip fringing** — straight-alpha atlas can pull a faint
  dark halo into minified edges. Fix (premultiply on upload / edge-dilate) risks a
  broader color regression → needs a pixel-diff harness first.
- **Backing-store viewport clamp** — `bw/bh = W·dpr` not yet clamped vs
  `MAX_VIEWPORT_DIMS` / max canvas area (clamp helper exists in `renderTarget.ts`,
  wired only to export).
- **Test follow-ups** — unit tests for `glSpriteBatch` (`isWebGL2Supported`
  memoization) + `itemRaster` chip rasterisation; an e2e lasso multi-select
  connector-halo regression (the seam regressed once, caught only manually); a GPU
  pixel/visual smoke (draw-count proves count, not pixels); a `WebGLUnsupportedScreen`
  gate test; and expecting the perf harness's computed KR1 `worstLoadBearing < 10`
  (currently written to markdown but never asserted). NOTE: a `glSpriteBatch` unit
  test was drafted but ts-jest would not transform a new `src/webgl/__tests__/`
  file (byte-clean, path in tsconfig `include`) — an environment quirk to resolve
  before adding webgl unit tests.

## UX-sweep residual open items (2026-06-30 / 2026-07-10 persona sweeps)

Migrated here 2026-07-14 when the three UX-sweep tactical docs were retired — the
shipped findings landed in ADRs 0006/0030–0034 + git history; these are the items
that were still open with no other home. Small / decision-scoped; not blockers.

- **Session-badge copy/color + no "where my work lives" indicator (N2 / M-1 — owner call).**
  The session badge is warning-orange with no "Auto-saved" wording *by design*; a
  clearer persistent place indicator for non-technical users (Maya S2→S3) is a
  design decision, not a bug. Both sweeps flagged the same thread — deferred pending
  an owner design call.
- **Connector-colour discoverability (Priya-P3-2, S3).** The style-strip
  connector-colour control exists but is greyed until a connector is selected, so
  expert users miss it. Strip productization gave it strong disabled-contrast + a
  tooltip; the "add a label / pulse / right-click bridge, or leave it" call was
  never closed. Control lives in `TopBarStyleControls.tsx` (self-gated disabled tip).
- **K1 — style strip is keyboard-unreachable (S2, a11y).** Root cause: canvas items
  aren't keyboard-selectable, so the strip has no keyboard entry (the Layers panel
  is the current one). Fix = roving tabindex + canvas keyboard selection — a bigger
  a11y track, not a quick patch.
- **B3 — rectangle has no min/max size clamp (S4, polish).** A rectangle can be
  resized to a degenerate or oversized footprint; no bound is enforced.
- **#3 — "click connection offset" (NEEDS_REPRO, S4).** Either the cosmetic
  arrowhead-one-tile-short render offset or a duplicate of the now-fixed #5 hit-halo.
  Needs a one-line browser repro to classify; no fix until then.
- **#6 — long right-drag surfaces the OS context menu (NEEDS_REPRO).** e2e +
  pointer-capture indicate it's handled (no hold-gate on the swallow); a real-browser
  repro is needed before the optional belt-and-suspenders (`preventDefault` while
  panning) is worth adding.

**Status:** Open, deferred with owner sign-off. Recorded in ADR 0038.

## Editor boot payload — 1787 kB gzip of JS before `/app` is usable (2026-07-29)

**Symptom:** Opening the editor at `/app` downloads, parses and executes five
`defer` scripts totalling **1787 kB gzip / 10,302 kB raw** before anything is
interactive. One chunk (`215.js`) is **1425 kB gzip / 9042 kB raw** across
**10,636 webpack modules** — MUI Material, Quill and the axoview lib fused
together, including one unattributed 1173 kB module. The read-only share path
(ADR 0042) pays the same cost: a viewer following a link downloads the whole
editor.

**Not affected:** the marketing landing at `/`. `build/index.html` ships **zero**
script tags, so ADR 0040's landing/SPA split is intact and SEO/LCP there is fine.
The AWS/GCP/Azure/K8s icon packs are also **already lazy** (`await import()` in
[`iconPackManager.ts`](packages/axoview-app/src/services/iconPackManager.ts)) —
they are the `async/` chunks and are **not** part of this number.

**Root cause:** nothing is code-split below the entry. There is **no
`React.lazy` or `Suspense` anywhere in either package**, so every route,
dialog and editor-only dependency is in the boot graph regardless of whether the
session ever uses it.

**Discussed options** (2026-07-29 review; owner deferred all of them — initial
load time judged not dramatic in practice):

| Option | Effort | Risk | Notes |
|---|---|---|---|
| **0. Attribute the chunk first** (bundle analyzer run) | XS | **None** | Prerequisite for scoping anything below. Nobody can size the win until the 1173 kB module and the MUI surface are named. Do this before committing to any option |
| **1. Lazy-load Quill** | M | **Med** | Clear trigger (only needed once a user edits text) but **4 static import sites** — `RichTextEditor`, `TextBoxInlineEditor`, `TextBoxLinkCard` — plus `quill.snow.css` imported in two more places |
| **2. Lazy-load `ExportImageDialog`** | S–M | **Med** | Also resolves the remaining runtime import cycle (see next entry). Interacts with the GL-context budget: the dialog mounts a second `<Axoview>`, and ADR 0038 already flags the ~16-context browser cap — likely favourable, must be verified not assumed |
| **3. Route-split the editor shell / read-only viewer** | L | **High** | Biggest potential win (a viewer wouldn't load editor chrome at all) but the largest blast radius |
| **4. Revisit `splitChunks`** | S | **Low** | Re-slices the same bytes across more requests; improves caching, does **not** reduce boot cost. Cosmetic against this symptom |

**Cross-cutting risk for options 1–3:** `axoview-lib` is a **published npm
package**. Dynamic `import()` inside it pushes chunk-loading semantics onto
downstream consumers' bundlers — a compatibility surface, not just an internal
change. Any of these also needs an e2e + perf-harness pass, since those suites
may encode current load timing.

**Risk of NOT doing it:** low and static. This is a steady-state cost, not a
regression, and it cannot silently worsen — `npm run check:bundle` fails CI if
the boot payload grows past
[`scripts/bundle-budget.json`](scripts/bundle-budget.json).

**Status:** Open, deferred with owner sign-off (2026-07-29). Budget gate in place
so it cannot drift. Revisit if boot time becomes a user complaint, or
opportunistically when `ExportImageDialog` is next touched (option 2 pays down
two items at once). See
[technical-review-2026-07-29.md §3](docs/reviews/technical-review-2026-07-29.md).

## Runtime import cycle: `Axoview` → `UiOverlay` → `ExportImageDialog` → `Axoview` (2026-07-29)

**Symptom:** No user-visible symptom today. `ExportImageDialog` mounts a second
`<Axoview>` instance to render the export, so the module graph closes a loop back
to its own root. It is one of the two cycles confirmed to survive compilation —
the other (`schemas/validation.ts` ⇄ `utils/index.ts` ⇄ `utils/model.ts`) was
**fixed 2026-07-29** by importing `getAllAnchors` from `src/utils/isoMath`
instead of the `src/utils` barrel, which dropped the whole graph from 63 cycles
to 47.

**Why it matters:** an ES-module value cycle is only safe while every binding in
the loop is referenced *lazily*, inside function bodies. The day someone reads
one of them at module-evaluation time — a module-level `const`, a decorator, a
default parameter — it becomes a TDZ crash at import, and the stack points at the
consumer rather than the cycle. The failure is silent until it is sudden.

**Discussed options:**

| Option | Effort | Risk | Notes |
|---|---|---|---|
| **1. Lazy-load `ExportImageDialog`** (`React.lazy` + `Suspense` in `UiOverlay`) | S–M | **Med** | Breaks the cycle *and* trims the boot payload — same work as option 2 in the entry above. Needs the GL-context check noted there. **Preferred if/when touched** |
| **2. Invert the dependency** — have `ExportImageDialog` receive a render callback instead of importing `Axoview` | M | **Med** | Removes the cycle without any loading-pattern change, but reshapes the export API surface |
| **3. Leave it, guarded** | XS | **Low** | Status quo. `npm run check:cycles` holds the count at 47, so no *new* cycle can be added silently, but this one stays |

**Risk of NOT doing it:** **Low.** Latent, not active — the current code works and
is regression-gated at 47 cycles. The exposure is a future edit inside the loop
turning a working import into a boot crash. Bounded, and cheap to fix if it ever
fires.

**Status:** Open, deferred with owner sign-off (2026-07-29). Currently option 3.
Coupled to the bundle-split entry above: whoever does option 1 there closes this
for free. See
[technical-review-2026-07-29.md §5](docs/reviews/technical-review-2026-07-29.md).

## Layer / z-order ops inherit the previous action's history sequence — one Ctrl+Z reverts two actions

**Found by:** exploratory campaign HIST-01

**Symptom:** After any action that writes BOTH stores (draw a connector, create/edit
a text box, drag a node that has connectors), the next layer-panel operation
(create/rename/show/hide/lock a layer, reorder layers, assign items to a layer, or
a `Ctrl+]` / `Ctrl+[` z-order change) is recorded with the *same* logical-action
sequence as that earlier action. A single Ctrl+Z then steps **both** history
stacks: it undoes the layer op (correct) *and* reverts the earlier action's scene
half (wrong). Visible consequences:
- a text box created just before a layer op loses its `scene.textBoxes[id].size`
  on that undo and renders with no measured size — `useHistory.resyncScene()`
  re-routes connectors only, never text boxes;
- for connectors the path is silently repaired by `resyncScene`, but the scene
  stack is now one entry short, so the *next* Ctrl+Z removes the connector from
  the model and leaves its scene path behind (orphan `scene.connectors[id]`).

**Root cause:** [`useLayerActions.commit()`](packages/axoview-lib/src/hooks/useLayerActions.ts#L34-L41)
calls `modelStore.saveToHistory()` directly instead of the
`allocateHistorySequence() + saveToHistory()` pair every other write path uses
(`useSceneActions.saveToHistoryBeforeChange`, `useHistory.transaction`,
`beginDragTransaction`). With no allocation, `modelStore.set()` stamps the entry
with `currentHistorySequence()` — the *previous* action's number — and the D-7
coordination in `useHistory.undo` (step every stack whose top carries the max seq)
can no longer tell the two actions apart. `commit()` also never calls
`sceneStore.saveToHistory()`, so a layer op can never record its own scene half.

**Workaround:** none at the user level. Undo once more and redo to re-route, or
avoid interleaving layer/z-order edits with connector and text-box edits.

**Status:** Open. Fix direction: call `allocateHistorySequence()` in
`useLayerActions.commit()` before `saveToHistory()`, and save/commit the scene
store alongside the model store — i.e. reuse `useSceneActions`'
`saveToHistoryBeforeChange` rather than hand-rolling a second commit path
(the sibling-drift bug class). Repro:
[`hist-01-04.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-01-04.explore.test.tsx).

## Creating a page is not undoable, and Ctrl+Z after it silently reverts the previous action

**Found by:** exploratory campaign HIST-04

**Symptom:** "New page" adds a view to the model but records no history entry.
Pressing Ctrl+Z straight after creating a page therefore leaves the page in place
and instead reverts whatever the user did *before* creating it — a silent,
off-screen undo (the reverted edit lives on the previous page). Deleting a page
*is* undoable, so the create/delete pair is asymmetric.

**Root cause:** [`useSceneActions.createView`](packages/axoview-lib/src/hooks/useSceneActions.ts#L764-L784)
never calls `saveToHistoryBeforeChange()`, and its `setState()` writes both stores
with `skipHistory=true`. With no pending pre-snapshot the store takes the
"no pending pre — just apply the update" branch, so nothing enters either stack.
`deleteView` (same file) does call `saveToHistoryBeforeChange()`.

**Worse, end-to-end:** because every history entry's inverse patch replaces the
whole `views` array (see the leaked-drag entry below for the same mechanism), the
un-recorded page creation lives in a subtree the undo rolls back wholesale. Draw a
connector, click "Add page", press Ctrl+Z: **the new page silently disappears**
and `uiState.view` is left pointing at its id — a dangling active-view reference
that every reader papers over by falling back to `views[0]`. Measured e2e in
[`hist-09-10.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/E1-history/hist-09-10.explore.spec.ts).

**Workaround:** delete the page manually (that *is* undoable).

**Status:** Open. Fix direction: add `saveToHistoryBeforeChange()` to `createView`,
matching `deleteView`. Note the related open question of whether undoing a page
create/delete should also restore `uiState.view` — it is not part of either
history stack (see HIST-10). Repro:
[`hist-01-04.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-01-04.explore.test.tsx).

## Redo stays armed on the scene stack after a new action, resurrecting an undone connector's path

**Found by:** exploratory campaign HIST-02

**Symptom:** Draw a connector → Ctrl+Z → place an icon (or any model-only action:
rename, nudge a lone node, edit a title) → the Redo control is still enabled, and
Ctrl+Y writes the undone connector's path back into the scene store even though
the connector is no longer in the model. The result is an orphan
`scene.connectors[id]` — a cached path with no owner — that survives until the
next `changeView`/`SYNC_SCENE` rebuild. `useHistory.canRedo` is
`modelCanRedo || sceneCanRedo`, so the button lies about what a redo will do.

**Root cause:** "A new action clears the redo stack" is implemented per store, in
each store's `set()`. A model-only action produces zero patches in the scene
store, which takes the MQA #5 no-op early return —
[sceneStore.tsx](packages/axoview-lib/src/stores/sceneStore.tsx#L184-L186) — and
that branch returns *before* the `future: []` reset. So the scene store keeps a
future entry belonging to a logical action the user has since abandoned. The same
hole exists symmetrically in [modelStore.tsx](packages/axoview-lib/src/stores/modelStore.tsx#L193-L195).

**Workaround:** switch pages and back (rebuilds the scene from the model).

**Status:** Open. Fix direction: redo invalidation is a property of the logical
action, not of one store — clear BOTH futures when either store records a new
entry (e.g. in the `saveToHistoryBeforeChange` / `allocateHistorySequence`
boundary), or make the no-op branch still reset `future`. Repro:
[`hist-02-03.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-02-03.explore.test.tsx).

## Independent 50-entry history trimming splits one logical action across the two stacks

**Found by:** exploratory campaign HIST-03

**Symptom:** After a both-stores action (create a text box or a connector)
followed by more than 50 model-only actions, the model half of that action is
evicted by `MAX_HISTORY_SIZE` while its scene half stays at the bottom of the
scene stack. Undoing all the way back then applies the surviving scene half on its
own: for a text box the model entry survives but `scene.textBoxes[id].size` is
reverted away, leaving a text box with no measured size that no later undo/redo
restores. (For connectors the same split happens but is masked —
`useHistory.resyncScene()` re-routes the path afterwards.)

This contradicts the D-7 entry above, which records "the `MAX_HISTORY_SIZE=50`
trim-skew sub-case (behavior-map §4.5(a)) is resolved by the same fix". Sequence
stamping makes one keystroke revert one logical action; it does not stop the two
stacks from trimming that action's halves at different times.

**Root cause:** each store trims its own `past` at 50 entries
([modelStore.tsx](packages/axoview-lib/src/stores/modelStore.tsx#L201-L202),
[sceneStore.tsx](packages/axoview-lib/src/stores/sceneStore.tsx#L192-L193)) with
no knowledge of the shared logical-action sequence, and the two stacks fill at
different rates because model-only actions push nothing to the scene stack.

**Workaround:** none. Switching pages rebuilds the scene from the model and
restores the missing size.

**Status:** Open. Fix direction: trim by logical-action sequence rather than by
per-stack length — when a store evicts seq N, drop every entry with seq ≤ N from
both stacks. Repro:
[`hist-02-03.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-02-03.explore.test.tsx).

## A failed edit arms the undo snapshot; the next page switch records a phantom history entry

**Found by:** exploratory campaign HIST-05

**Symptom:** When a `useSceneActions` write throws inside its reducer, the edit is
correctly abandoned — but `saveToHistoryBeforeChange()` has already run, so both
stores are left holding an armed `pendingPre` snapshot. The next write that was
meant to bypass history entirely — `changeView`'s `SYNC_SCENE` on a page switch,
`resyncScene` after an undo, or a `computePathsAsync` batch — consumes that
snapshot and pushes a real history entry stamped with a stale sequence. A later
Ctrl+Z then reverts a scene diff the user never made (measured: switching pages
after a failed edit adds one entry to the scene stack).

**Root cause:** `pendingPre` is armed by `saveToHistory()` and disarmed only by a
subsequent `set()`. There is no `abortPendingHistory()`, and no `try/catch` around
the reducer call in `useSceneActions`' write helpers
([useSceneActions.ts](packages/axoview-lib/src/hooks/useSceneActions.ts#L517-L544)),
so a throw leaves the pair unbalanced. Every `skipHistory=true` write is written
as if it can never record — but `set(updates, true)` still records whenever
`pendingPre` happens to be armed.

**Reachability:** any reducer throw between the save and the set. The reachable
ones today are `getItemByIdOrThrow` (acting on an id that is no longer in the
view — e.g. a stale selection, see the INV-2 note in the campaign ledger) and
`validateView` on create/update. The probe forces the throw directly.

**Workaround:** none.

**Status:** Open. Fix direction: wrap the reducer call in the write helpers so a
throw disarms `pendingPre` on both stores, and/or make `skipHistory=true` mean
"never record" rather than "do not arm". Repro:
[`hist-05-08.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-05-08.explore.test.tsx).

## A leaked drag bracket makes later edits un-undoable, and the next Ctrl+Z destroys them

**Found by:** exploratory campaign HIST-06

**Symptom:** If `beginDragTransaction()` runs without a matching
`commitDragTransaction()` (the documented lost-mouseup hazard —
canvas-interaction §6.2), `dragInProgress` and `pendingPreFrozen` stay set for the
lifetime of that hook instance. Every subsequent edit then applies to the document
with **no** history entry, while `canUndo()` keeps reporting `true` for the
pre-drag entry. Pressing Ctrl+Z at that point does not merely fail to undo the
recent edits — it *destroys* them: each entry's inverse patch replaces the whole
`views` array (the store diffs `Object.assign(draft, next)` against a fresh array),
so the rollback wipes every un-recorded edit made since the leak, with no redo
entry for any of it.

**Root cause:** two-part. (a) No rollback/expiry for the freeze: nothing outside
`commitDragTransaction` ever calls `unfreezePendingPre()`, and
`saveToHistoryBeforeChange()` early-returns while `dragInProgress` is set. (b) The
patch granularity is coarser than the "diff pair rather than a full Model
snapshot" comment in [modelStore.tsx](packages/axoview-lib/src/stores/modelStore.tsx#L20-L21)
implies — assigning a fresh `views` array yields one whole-array `replace` patch,
so an undo is effectively a snapshot restore of that subtree and cannot preserve
concurrent un-recorded writes.

**Reachability:** the leak itself is an interaction-layer question (mode exits
commit lazily on the next pointer event, so a keyboard-only follow-up can leave
the bracket open); this entry records the store-level blast radius once it happens.

**Workaround:** perform any pointer interaction (which runs the lazy mode exit)
before using the keyboard.

**Status:** Open. Fix direction: a `rollbackDragTransaction` / freeze timeout, plus
an assertion that `set()` never applies while frozen. Related: HIST-07 below.

## A mid-drag edit from another component corrupts the drag's undo entry

**Found by:** exploratory campaign HIST-07

**Symptom:** `dragInProgress` is a `useRef` *inside* `useSceneActions`, so every
component that calls the hook gets its own copy. While one component holds an open
drag transaction, a write issued through any *other* component's instance does not
see the flag: it runs `saveToHistoryBeforeChange()`, which overwrites the frozen
pre-drag snapshot with the current mid-drag state. The drag's commit entry then
only covers the tail of the gesture, so Ctrl+Z leaves the dragged item at a
mid-drag position instead of returning it to where the drag started (measured:
node returned to the intermediate tile, not its origin).

**Root cause:** the transaction flags (`dragInProgress`, `transactionInProgress`,
`pendingStateRef`) are per-hook-instance refs guarding *store-global* state —
[useSceneActions.ts](packages/axoview-lib/src/hooks/useSceneActions.ts#L40-L44).
The store itself owns `pendingPre`/`pendingPreFrozen`, so the guard belongs there.

**Workaround:** none.

**Status:** Open. Fix direction: move the drag/transaction flags into the stores
(next to `pendingPreFrozen`, which is already store-owned) so every hook instance
observes the same state, and make `saveToHistory()` a no-op while frozen. Related:
HIST-06 above. Repro:
[`hist-05-08.explore.test.tsx`](packages/axoview-lib/src/__explore__/E1/hist-05-08.explore.test.tsx).

## Deleting a selected item leaves it selected — `uiState.selectedIds` keeps the dead id

**Found by:** exploratory campaign HIST-13

**Symptom:** Select a node and press Delete. The view item is removed from
`model.views[].items`, but `uiState.selectedIds` still holds
`{ type: 'ITEM', id: <deleted id> }` until the next click somewhere else. The same
dangling reference survives an undo/redo round trip of the delete. Anything routed
through the current selection in that window — a style-strip write, an arrow-key
nudge, a second Delete, a layer assignment — targets an id the reducers resolve
with `getItemByIdOrThrow`, i.e. it throws. That throw is itself harmful: it leaves
the undo snapshot armed (see the phantom-history-entry entry above, HIST-05).

**Root cause:** the delete path (`useSceneActions.deleteSelectedItems`) removes the
entities but never clears the ui-state slice that named them; `uiState` has the
`clearSelection` convenience action and nothing calls it here. Detected by the
campaign's cross-store oracle INV-2 ("every `selectedIds` entry resolves to a live
object of its type").

**Workaround:** click empty canvas after deleting.

**Status:** Open. Fix direction: clear (or filter) `selectedIds` and `itemControls`
in the delete transaction — and, more durably, make selection resolution
defensive so a dangling id degrades to "not selected" rather than to a reducer
throw. Repro:
[`hist-11-13.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/E1-history/hist-11-13.explore.spec.ts).

## `deleteModelItem` corrupts the model: the deleted slot stays as `undefined`, then `validateView` throws on it

**Found by:** exploratory campaign RED-01

**Symptom:** [`deleteModelItem`](packages/axoview-lib/src/stores/reducers/modelItem.ts#L29-L37)
removes an entry with `delete draft.model.items[i]` instead of `splice`. Immer's
copy materialises that index, so the array keeps its length and index `i` is
*present* holding `undefined` — not a sparse hole that `map`/`filter` would skip.
Three things break immediately:
- `validateView` line 222 (`ctx.model.items.map(i => i.id)`) throws
  `TypeError: Cannot read properties of undefined`. Since `updateViewItem` runs
  `validateView` on **every** item update, one call makes the whole view
  permanently un-editable — every subsequent node move throws.
- `modelSchema.safeParse` rejects the model, so the diagram would not reload.
- `JSON.stringify` emits `null` for the slot, so the corruption is what gets saved.

**Reachability:** `useSceneActions.deleteModelItem` is on the public action
surface and `reducers.deleteModelItem` is exported from the reducers barrel, but
**no in-app component calls either today** — deleting a node removes only the view
item (see the orphaned-model-items entry, RED-08). So this is a live defect in a
shipped, exported API that the app itself does not currently exercise: an embedder
who calls it, or the first feature that wires up "remove this icon from the
model", corrupts the document.

**Workaround:** don't call it; delete view items instead.

**Status:** Open. Fix direction: `splice(i, 1)` (what `deleteViewItem` already
does), and independently make `validateView` defensive about holes so a single
malformed array cannot take the whole editor down. Repro:
[`red-01-02.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-01-02.explore.test.ts).

## One invalid entity anywhere in a view makes every node move and every node placement throw

**Found by:** exploratory campaign RED-02

**Symptom:** [`updateViewItem`](packages/axoview-lib/src/stores/reducers/viewItem.ts#L43-L48)
runs `validateView` over the **whole** view after every update and throws on the
**first** issue it finds — regardless of whether that issue has anything to do
with the update. So a view that already contains one problem (a rectangle whose
colour was removed from the palette, a connector anchor pointing at a missing
item, a stale anchor-to-anchor ref) becomes un-editable: dragging *any* node, and
placing a *new* node (`createViewItem` funnels through the same call), both throw.
The throw is unhandled in the pointer handlers, and it also leaves the undo
snapshot armed — see the phantom-history-entry entry (HIST-05).

**Root cause:** the check is scoped to the action but the validation is scoped to
the view, and its failure mode is a raw `throw` rather than a rejected write.
`validateView` is also the only place these issues surface, so nothing repairs
them — `useInitialDataManager` filters orphaned *connectors* on load, but not
dangling colour refs on rectangles.

**Reachability:** any diagram that acquires an issue after load — a colour
deleted from the palette while a rectangle still uses it, a partially-migrated
file, a hand-edited JSON import, or the `deleteModelItem` corruption above.

**Workaround:** none in-app; the diagram must be repaired outside the editor.

**Status:** Open. Fix direction: validate only what the action touched (or at
minimum, only fail on issues the action *introduced* — diff the issue set against
the pre-state), and surface a rejected write as a notification rather than an
uncaught throw. Repro:
[`red-01-02.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-01-02.explore.test.ts).

## Nothing validates layer references — a `layerId` naming no layer is accepted, saved and reloaded

**Found by:** exploratory campaign RED-03

**Symptom:** `ASSIGN_LAYER_TO_ITEMS` writes whatever `layerId` it is handed, with
no check that the layer exists in the target view. The result passes
`validateView` *and* `modelSchema` — `validation.ts` has no layer checks at all —
so a dangling layer reference is saved, exported and reloaded intact. The entity
renders as "unassigned" while still carrying a ref, which means layer visibility
and locking silently do not apply to it and the Layers panel cannot show or
repair the association.

The same hole covers refs that arrive from outside the reducer: an item pasted or
imported carrying a `layerId` belonging to a *different* view keeps it, and
nothing ever flags it.

**Root cause:** `validateView` validates connector, anchor, colour and view-item
refs but never `layerId`, and `assignLayerToItems`
([view.ts](packages/axoview-lib/src/stores/reducers/view.ts#L160-L184)) does not
look the layer up. `deleteLayer` cleans refs to the layer it deletes, which is why
the in-view case usually looks fine — it is the cross-view and unknown-id cases
that persist.

**Workaround:** re-assign the entity to a real layer, or to "no layer".

**Status:** Open. Fix direction: add a `INVALID_LAYER_REF` check to `validateView`
(cheap — one `Set` of layer ids per view, the same shape the existing checks use)
and reject unknown ids in `assignLayerToItems`. Repro:
[`red-03-05.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-03-05.explore.test.ts).

## Layer `order` values collide — after a delete, or after a partial reorder

**Found by:** exploratory campaign RED-04 / RED-05

**Symptom:** two layers can end up with the same `order`, leaving their stacking
order undefined (it becomes whatever `Array#sort` happens to do with equal keys).
Two independent routes:
- **After a delete.** `createLayer` derives `order` from `layers.length` and
  `deleteLayer` never renumbers the survivors. Create A/B/C (orders 0,1,2), delete
  B (leaves 0,2), create D → D gets `order = length = 2`, colliding with C.
- **After a partial reorder.** `reorderLayers` assigns `order = index` for the ids
  it is given and silently ignores the rest, so any list that does not contain
  *every* layer leaves the omitted ones on their old numbers, colliding with the
  renumbered ones. (A list with a *duplicated* id turns out to be harmless — the
  last write wins and the values stay unique.)

**Root cause:** `order` is treated as a free-standing integer rather than as a
derived property of position;
[view.ts `createLayer`/`deleteLayer`/`reorderLayers`](packages/axoview-lib/src/stores/reducers/view.ts#L90-L158)
each maintain it independently and none of them re-normalises the set.

**Workaround:** drag any layer in the panel to force a full renumber.

**Status:** Open. Fix direction: normalise after every mutation — sort by the
current `order` and rewrite `0..n-1` at the end of `createLayer`, `deleteLayer`
and `reorderLayers`, so the invariant "orders are a permutation of `0..n-1`"
cannot be broken by any single call. Repro:
[`red-03-05.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-03-05.explore.test.ts).

## No-op edits dirty the diagram and burn an undo step (every action stamps `lastUpdated`)

**Found by:** exploratory campaign RED-06

**Symptom:** every action in `TIMESTAMPED_ACTIONS` runs `updateViewTimestamp`
unconditionally — including the ones whose reducer body changed nothing. The
result is a brand-new model / views array / view object with only `lastUpdated`
different, so `useDirtyTracker` fires ("unsaved changes"), autosave runs, and the
history stores an entry whose undo produces no visible change — a Ctrl+Z that
appears to do nothing.

Reachable cases confirmed by the probe:
- committing a page rename **with the same name** (ViewTabs' inline rename commits
  on blur/Enter unconditionally, so opening it and pressing Enter is enough);
- re-writing a view-item property with the value it already has (a style-strip
  click on the already-active colour, a `showLabel` toggle back and forth);
- `UPDATE_LAYER` with an id that matches no layer, and `REORDER_LAYERS` with an
  empty list — both of which the reducer bodies explicitly early-return on.

**Root cause:** [`view.ts`](packages/axoview-lib/src/stores/reducers/view.ts#L325-L327)
applies the timestamp based on the *action name*, not on whether the action
actually produced a change. The reducers signal "nothing happened" by returning
the state untouched, and that signal is discarded one line later.

**Workaround:** none; the phantom dirty flag is harmless to the data, just noisy.

**Status:** Open. Fix direction: stamp only when the reducer returned a different
model (`newState.model !== ctx.state.model` is already the natural test, since
every reducer either produces via immer or returns the input) — and, for the
inline-rename path, skip the dispatch entirely when the text is unchanged. Repro:
[`red-06-07.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-06-07.explore.test.ts).

## Deleting a node leaves anchor-to-anchor connectors dangling and permanently unroutable

**Found by:** exploratory campaign RED-07

**Symptom:** `deleteViewItem`'s cascade removes only the connectors that reference
the deleted item **directly** (`getConnectorsByViewItem` matches `ref.item`). A
connector anchored to *another connector's anchor* — the ADR 0006 anchor-to-anchor
ref a connector dropped onto another connector produces — is not part of that set,
so when the cascade removes its target connector the surviving one is left with a
`ref.anchor` pointing at an anchor that no longer exists. Consequences:
- `validateView` reports `INVALID_ANCHOR_TO_ANCHOR_REF`, which by RED-02 makes
  **every subsequent node move and node placement in that view throw**;
- `getConnectorPath` throws on it, so `SYNC_SCENE` writes
  `{ tiles: [], unroutable: true }` — and `useHistory.resyncScene` treats
  `unroutable` as deliberate and never retries, so the connector is invisible for
  the rest of the session (see the sticky-unroutable entry, RED-09).

**Root cause:** the cascade computes its victim set from direct item references
only and never walks the anchor graph transitively —
[viewItem.ts](packages/axoview-lib/src/stores/reducers/viewItem.ts#L68-L103).
`deleteConnector` has the same gap (RED-14).

**Workaround:** delete the chained connector manually before deleting the node.

**Status:** Open. Fix direction: after removing connectors, sweep the view's
remaining connectors for `ref.anchor` values that no longer resolve and either
re-point them at the anchor's last tile or cascade-delete them — the same
"leave no dangling ref" rule the direct-reference cascade already follows. Repro:
[`red-06-07.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-06-07.explore.test.ts).

## Deleted nodes leak their model items — `model.items` grows forever and ships in every save

**Found by:** exploratory campaign RED-08

**Symptom:** deleting a node removes only the **view** item; its entry in
`model.items` (name, icon, notes, link) is never collected. A place-then-delete
cycle therefore grows `model.items` without bound while the canvas stays empty,
and every orphan is written to localStorage / Drive, included in JSON and ZIP
exports, and re-loaded next session. Nothing surfaces them: `validateView` only
checks the other direction (view item → model item), and lean-save strips bundled
icons but never orphaned items.

**Root cause:** the split is deliberate — `deleteViewItem` is the delete path and
the model-item twin is not called by anything (its only implementation,
`deleteModelItem`, corrupts the array; see that entry, RED-01). So there is no
garbage-collection step anywhere between the delete and the save.

**Workaround:** none in-app.

**Status:** Open. Fix direction: sweep unreferenced `model.items` at save time
(lean-save is the natural home — an item referenced by no view item in any view is
dead) rather than at delete time, so undo of a delete keeps working. Fixing
`deleteModelItem` (RED-01) is a prerequisite for any delete-time variant. Repro:
[`red-08-09.explore.test.tsx`](packages/axoview-lib/src/__explore__/E2/red-08-09.explore.test.tsx).

## Deleting a connector orphans any connector anchored to it (anchor-to-anchor)

**Found by:** exploratory campaign RED-14

**Symptom:** `DELETE_CONNECTOR` splices the connector out of the view and drops
its scene path, but never touches sibling connectors whose anchors reference
*its* anchors (the ADR 0006 anchor-to-anchor ref that dropping a connector onto
another connector creates). The survivor is left with a `ref.anchor` pointing at
an anchor that no longer exists, so `validateView` reports
`INVALID_ANCHOR_TO_ANCHOR_REF`, `getConnectorPath` throws on it, and — by RED-02 —
**every subsequent node move in that view throws**. Deleting one connector can
therefore make the whole page un-editable.

This is the direct-delete twin of the node-delete gap (RED-07); both stem from
the same missing rule.

**Root cause:** the delete paths compute their victim set from *item* references
only and never walk the anchor graph —
[connector.ts `deleteConnector`](packages/axoview-lib/src/stores/reducers/connector.ts#L6-L19),
[viewItem.ts `deleteViewItem`](packages/axoview-lib/src/stores/reducers/viewItem.ts#L68-L103).

**Workaround:** delete the dependent connector first.

**Status:** Open. Fix direction: one shared "sweep dangling anchor refs" step that
both delete paths run — for each surviving connector, replace any `ref.anchor`
that no longer resolves with the anchor's last known tile, or cascade-delete the
connector if that leaves it with fewer than two anchors. Repro:
[`red-14.explore.test.ts`](packages/axoview-lib/src/__explore__/E2/red-14.explore.test.ts).

## Hiding or locking a layer does not drop the entities it covers from the live selection

**Found by:** exploratory campaign RED-15

**Symptom:** select items (Ctrl+A or a lasso) while their layer is visible and
unlocked, then hide — or lock — that layer in the Layers panel. `selectedIds`
still holds them. Pressing Delete removes items the user can no longer see, and a
group drag or a style write moves/restyles entities the panel presents as locked.
Confirmed end-to-end for both the hide and the lock toggle.

This breaks the ADR 0006 §3 / canvas-interaction I-1 invariant that `selectedIds`
may only ever contain interactable refs. Every existing guard covers the
*acquisition* paths (Ctrl+A, lasso, click, context menu all filter through
`makeInteractableCheck`); nothing re-validates a selection that was legal when it
was made and stopped being legal afterwards.

**Root cause:** layer state lives in the model and selection lives in ui-state,
with no subscription between them — `updateLayer` writes `visible`/`locked` and
nothing revisits `uiState.selectedIds`.

**Workaround:** click empty canvas to clear the selection after changing layer
state.

**Status:** Open. Fix direction: re-run `makeInteractableCheck` over
`selectedIds` whenever a layer's `visible`/`locked` changes (and on layer delete /
re-assignment), dropping refs that no longer pass — the same filter the
acquisition paths already share, applied as an invalidation step. Repro:
[`red-13-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/E2-reducers/red-13-15.explore.spec.ts).

## Paste does not regenerate connector anchor ids — the clone shares them with the original

**Found by:** exploratory campaign SCN-03 / SCN-04

**Symptom:** copy/paste remaps every entity id through `idMap` (items,
connectors, rectangles, text boxes, labels) but rebuilds connector anchors with
`{ ...anchor, ref }`, so `anchor.id` is carried over verbatim. Copying a
connector that has a middle waypoint therefore leaves **two** anchors called
`anc-mid` in the same view. Measured consequences:
- **One delete pinches two connectors.** `deleteSelectedItems` splices waypoint
  anchors by id across every connector in the view, so deleting the pasted
  clone's waypoint removes the original's as well — both paths go from 3 anchors
  to 2 in a single Delete.
- **The original's waypoint becomes unaddressable.** Anchor-to-anchor refs and
  `CONNECTOR_ANCHOR` selection refs resolve through
  `getItemByIdOrThrow(getAllAnchors(...), id)`, which returns the first match.
  Paste unshifts, so the clone always wins — which of the two is reachable is an
  artefact of array order, not of intent.

**Root cause:** [`useCopyPaste.handlePaste`](packages/axoview-lib/src/clipboard/useCopyPaste.ts#L355-L382)
builds `newConnectors` with fresh connector ids but no anchor-id remapping. The
schema does not require anchor-id uniqueness and `validateView` does not check
it, so nothing downstream catches the collision.

**Workaround:** delete and re-draw the waypoint on the pasted copy.

**Status:** Open. Fix direction: extend `idMap` to anchor ids and remap
`anchor.id` alongside `anchor.ref` (anchor-to-anchor refs inside the pasted set
must follow the same map); add an anchor-id-uniqueness check to `validateView`
so the class cannot come back through another duplication path (ZIP import,
"duplicate page"). Repro:
[`scn-03-04.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-03-04.explore.test.tsx).

## Paste validates the view before rectangles, text boxes and labels are added — so those land unchecked

**Found by:** exploratory campaign SCN-06

**Symptom:** `pasteItems` assembles the pasted nodes and connectors into a new
view, runs `validateView` **once** on that intermediate view, and only then
layers on the pasted rectangles, text boxes and labels through their per-entity
reducers. Anything wrong with those three types is therefore never checked. A
pasted rectangle carrying a colour id the target diagram does not have commits
cleanly — and by RED-02 the resulting view then refuses **every** subsequent node
move, because `updateViewItem` re-validates the whole view and throws on the
first issue.

**Root cause:**
[`useSceneActions.pasteItems`](packages/axoview-lib/src/hooks/useSceneActions.ts#L1062-L1084)
— the "validate once, abort the whole paste if invalid" guard is applied to
`newView` before the `createRectangle` / `createTextBox` / `createLabel` calls
that follow it in the same transaction.

**Reachability:** copy a coloured rectangle from a diagram whose palette has that
colour and paste it into one that does not (colours are per-model), or paste
after deleting the colour from the palette.

**Workaround:** delete the pasted rectangle to un-poison the view.

**Status:** Open. Fix direction: build the *complete* view — rectangles, text
boxes and labels included — before the single `validateView` call, so the
all-or-nothing guarantee the code documents actually covers everything it
pastes. Repro:
[`scn-05-08.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-05-08.explore.test.tsx).

## The batch drag updaters are "drag-only" by convention only — an out-of-drag call is un-undoable

**Found by:** exploratory campaign SCN-07

**Symptom:** `batchUpdateViewItemTiles` (and its rectangle / text-box / label
twins) write model **and** scene with `skipHistory` and no armed snapshot. They
are documented "DRAG ONLY. Caller must be inside an open beginDragTransaction",
but nothing enforces it. Called outside a drag the move really happens — the node
is at its new tile — while `history.past` stays empty and `canUndo()` returns
false: an edit the user can see and cannot undo. The same call also bypasses
`validateView` entirely (an id that is not in the view is silently ignored where
the reducer path would throw).

**Root cause:** the contract lives in a comment. `useSceneActions` exports the
batch updaters on the same surface as the safe CRUD actions, so any new caller —
a keyboard nudge, an alignment command, a future "distribute evenly" — gets the
un-undoable behaviour by default.

**Reachability:** latent today (every current caller is inside a bracket); this is
a trap for the next feature that reaches for the fast path.

**Status:** Open. Fix direction: make the updaters assert (or no-op with a
dev warning) when `dragInProgress` is false, which becomes trivial once the drag
flag moves into the store — see the mid-drag entry (HIST-07). Repro:
[`scn-05-08.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-05-08.explore.test.tsx).

## Connector previews written during a transaction are erased by the commit

**Found by:** exploratory campaign SCN-08

**Symptom:** `previewConnectorPaths` writes straight to the scene store
(`sceneStoreApi.getState().actions.set(..., true)` inside a `flushSync`), while
`transaction()` buffers its own copy of model+scene in `pendingStateRef` and
writes that copy at commit. A preview firing while a transaction is open is
therefore overwritten by the commit — the connector visibly snaps back to its
pre-preview route at the end of the gesture. Outside a transaction the same
preview persists (pinned by a control test), so the behaviour depends on whether
some other component happens to have a transaction open.

**Root cause:** two write paths with different notions of "current state" —
`previewConnectorPaths` deliberately bypasses the transaction for latency
(`flushSync` so the wire does not lag the nodes by a frame), and `transaction`'s
commit has no way to know the store moved underneath it.

**Reachability:** requires a transaction open across a mousemove. The current
drag path uses `beginDragTransaction` (which freezes history but does not buffer
state), so this is latent — but it is exactly the shape a "group operation with
live preview" feature would take.

**Status:** Open. Fix direction: have `previewConnectorPaths` write through the
same `setState` the rest of `useSceneActions` uses (it is already
transaction-aware), keeping `flushSync` for the non-transaction case. Repro:
[`scn-05-08.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-05-08.explore.test.tsx).

## A dangling active view makes reads and writes disagree — the canvas shows page 1 while every edit throws

**Found by:** exploratory campaign SCN-09

**Symptom:** `useSceneData.currentView` silently falls back to `views[0]` when
`ui.view` names a view the model does not have, while `useSceneActions` keys off
the raw `currentViewId`. With a dangling active view (reachable today — see the
page-create entry, HIST-04, whose undo deletes the page and strands `ui.view`)
the editor therefore *renders* page 1 and *refuses* every edit: `createLabel`,
`createConnector` and friends all throw `Item with id "…" not found` out of
`getItemByIdOrThrow`. The user sees a normal-looking canvas that rejects
everything they do.

**Root cause:** the fallback in
[`useSceneData`](packages/axoview-lib/src/hooks/useSceneData.ts#L49-L62) was
written to keep rendering resilient, but it hides the broken state instead of
surfacing it, and the write facade never got the matching fallback.

**Workaround:** switch pages (which calls `setView` with a real id).

**Status:** Open. Fix direction: make the fallback authoritative — if
`useSceneData` decides `views[0]` is current, write that id back to `ui.view` so
reads and writes agree — or drop the fallback and repair `ui.view` at its source.
Fixing HIST-04 removes the main way to reach the state. Repro:
[`scn-09-13.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-09-13.explore.test.tsx).

## One stale item reference discards an entire multi-delete

**Found by:** exploratory campaign SCN-11

**Symptom:** `deleteSelectedItems` guards `CONNECTOR`, `TEXTBOX`, `RECTANGLE`
and `LABEL` refs against ids that are no longer in the view, but `ITEM` refs go
straight to `deleteViewItem`, which throws on a missing id. Because the whole
delete runs inside `transaction()`, that throw skips the commit — so a selection
containing one dead item ref deletes **nothing**, and the exception escapes into
the key handler. It also leaves `pendingPre` armed (see the phantom-history
entry, HIST-05).

**Reachability:** the stale-selection bugs make this easy to hit — the selection
keeps deleted ids (HIST-13) and keeps entities whose layer was hidden (RED-15).

**Root cause:**
[`useSceneActions.deleteSelectedItems`](packages/axoview-lib/src/hooks/useSceneActions.ts#L834-L838)
— the `existing*` liveness sets built a few lines below cover every ref type
except `ITEM`.

**Workaround:** re-select before deleting.

**Status:** Open. Fix direction: build the item-id liveness set alongside the
others and filter `ITEM` refs through it; more generally, a dead ref in a
selection should be skipped, never fatal. Repro:
[`scn-09-13.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-09-13.explore.test.tsx).

## An invalid paste is abandoned silently — Ctrl+V appears to do nothing

**Found by:** exploratory campaign SCN-12

**Symptom:** when the assembled view fails validation, `pasteItems` logs
`console.warn('[axoview] paste produced an invalid view; skipping')` and returns.
Nothing is pasted, no history entry is written, and **no notification is shown** —
from the user's seat Ctrl+V simply did nothing. The neighbouring failure path
(empty clipboard) does raise a notification, so the two behave inconsistently for
the same gesture, and UX §6.3 requires failures to be surfaced rather than left in
devtools.

**Root cause:** the guard was added as a "should never happen" backstop
([`useSceneActions.pasteItems`](packages/axoview-lib/src/hooks/useSceneActions.ts#L1069-L1074))
and warns instead of notifying because it runs inside a `startTransition`
callback. SCN-06 shows the guard can be reached with ordinary content.

**Status:** Open. Fix direction: surface the same "could not paste" notification
the empty-clipboard path uses. Repro:
[`scn-09-13.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-09-13.explore.test.tsx).

## New pages can duplicate an existing page name

**Found by:** exploratory campaign SCN-13

**Symptom:** `createView` names a page `Page {views.length + 1}`. Delete a page
from the middle of the list and the next page created reuses a name that is
already taken — Page 1 / Page 2 / Page 3, delete Page 2, add a page, and there
are now two tabs called "Page 3". The same shape as the layer `order` collision
(RED-04/05): a positional counter that a delete invalidates.

**Root cause:**
[`useSceneActions.createView`](packages/axoview-lib/src/hooks/useSceneActions.ts#L764-L784).

**Workaround:** rename the page.

**Status:** Open. Fix direction: derive the number from the highest existing
"Page N" suffix (or keep a monotonic counter) rather than from the array length.
Repro:
[`scn-09-13.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-09-13.explore.test.tsx).

## Pasting onto another page carries the source page's layer assignment

**Found by:** exploratory campaign SCN-14

**Symptom:** paste copies `layerId` along with everything else, so pasting a node
from a page that has layers onto a page that does not produces an item pointing at
a layer that does not exist in its view. The item renders as unassigned, layer
visibility and locking silently do not apply to it, and the Layers panel cannot
show or repair the association. `validateView` reports nothing — it has no layer
checks at all (see the layer-reference entry, RED-03).

**Root cause:** `useCopyPaste.handlePaste` spreads `...ci.viewItem` and the
target view's layer set is never consulted.

**Workaround:** re-assign the pasted items to a layer on the target page.

**Status:** Open. Fix direction: drop (or remap) `layerId` when the paste target
view has no matching layer — and add the `INVALID_LAYER_REF` validation check
from RED-03 so the class cannot return through another duplication path. Repro:
[`scn-14-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-14-15.explore.test.tsx).

## Switching pages during async connector routing writes the old page's paths into the new page's scene

**Found by:** exploratory campaign SCN-15

**Symptom:** paste enough connectors to need more than one routing frame (>25),
then switch pages before routing finishes. `computePathsAsync` keeps running with
the `currentViewId` it captured at call time, and each batch writes its whole
scene map into the live scene store — which by then belongs to the *new* page. The
new page ends up caching the previous page's connector paths: phantom
`scene.connectors[id]` entries with no owner in the active view.

This is the async sibling of the cross-page undo issue (D-9): the scene store is
per-active-view but the writers are not.

**Root cause:**
[`useSceneActions.computePathsAsync`](packages/axoview-lib/src/hooks/useSceneActions.ts#L936-L989)
closes over `currentViewId` but writes through `sceneStoreApi` unconditionally;
nothing cancels the queued batches on a view change.

**Workaround:** switch pages twice — `changeView`'s SYNC_SCENE rebuilds the scene
from the model.

**Status:** Open. Fix direction: capture the view id at schedule time and abort
the remaining batches when `uiState.view` no longer matches (a generation counter
is enough), or route into a per-view scene keyed by that id. Repro:
[`scn-14-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E3/scn-14-15.explore.test.tsx).

## Nothing enforces id uniqueness — duplicate item or view ids load clean and one copy becomes unreachable

**Found by:** exploratory campaign CLIP-01

**Symptom:** a model carrying two `items` entries (or two `views`) with the same
id passes `modelSchema.safeParse` and `validateModel`. Every lookup in the
codebase goes through `getItemByIdOrThrow`, which returns the **first** match, so
the second entity exists in the file, is saved and re-exported, and can never be
selected, edited, rendered by name, or deleted. Nothing tells the user it is
there.

This is the same missing-check family as the anchor-id collision on paste
(SCN-03), the dangling layer ref (RED-03) and the duplicate page name (SCN-13):
ids and positional values are trusted everywhere and validated nowhere.

**Root cause:** `validation.ts` checks *reference* integrity (view item to model
item, anchors, colours) but never *identity* integrity, and `validateModelItem`
is an intentional no-op.

**Reachability:** any merge/import path that concatenates two id spaces — ZIP
import, "duplicate page", a paste bug like SCN-03, or a hand-edited file.

**Status:** Open. Fix direction: one `assertUniqueIds` pass in `validateModel`
covering `items`, `views`, and per-view `items`/`connectors`/`rectangles`/
`textBoxes`/`labels`/`layers` plus anchor ids — it is O(n) with a Set and would
have caught SCN-03 as well. Repro:
[`clip-01-03.explore.test.ts`](packages/axoview-lib/src/__explore__/E4/clip-01-03.explore.test.ts).

## One connector with an unresolvable anchor-to-anchor ref makes the whole diagram refuse to open

**Found by:** exploratory campaign CLIP-02

**Symptom:** the load-time normalisation in `useInitialDataManager` drops
connectors whose anchors reference a missing **item**, but leaves connectors whose
anchors reference another connector's **anchor**. If the referenced connector was
one of the dropped ones (or was never there), the survivor is now dangling —
`validateModel` reports `INVALID_ANCHOR_TO_ANCHOR_REF`, `modelSchema.safeParse`
fails, and the load path aborts with `setIsReady(false)` and an error toast. The
user cannot open the diagram at all because of one connector.

The delete-path bugs (RED-07, RED-14) produce exactly this shape in a saved file,
so a diagram can be bricked by an ordinary editing session.

**Root cause:**
[`useInitialDataManager`](packages/axoview-lib/src/hooks/useInitialDataManager.ts#L92-L120)
— the filter's `every` only inspects `ref.item`; `ref.anchor` is accepted
unconditionally. The validation that follows is fatal rather than corrective.

**Workaround:** none in-app; the file must be repaired externally.

**Status:** Open. Fix direction: extend the load filter to resolve `ref.anchor`
against the surviving connectors' anchor ids (iterating to a fixed point, since
dropping one connector can orphan another) — the same "drop the bad connector,
keep the diagram" policy the item-ref case already follows. Repro:
[`clip-01-03.explore.test.ts`](packages/axoview-lib/src/__explore__/E4/clip-01-03.explore.test.ts).

## `useDirtyTracker` leaks a subscription per diagram open, and the dirty flag is never reset

**Found by:** exploratory campaign CLIP-04 / CLIP-05 / CLIP-06

**Symptom:** three defects in one hook
([useDirtyTracker.ts](packages/axoview-lib/src/hooks/useDirtyTracker.ts)):

- **Leaked subscriptions.** The effect's cleanup is `return () => clearTimeout(timer)`
  — it never calls the unsubscribe it stored in `cleanupRef`. Every `isReady`
  toggle (i.e. every diagram open) registers another model-store listener that
  survives until unmount. Measured: two opens, two subscriptions, zero released.
- **Stale dirty flag.** `isDirtyRef` is only cleared by `markClean()`. Because the
  ref short-circuits (`if (!isDirtyRef.current)`), a newly-opened diagram whose
  predecessor was dirty never calls `setIsDirty(true)` again — so the *next* real
  edit does not raise the flag and the save indicator lies.
- **Swallowed first edit.** Subscription is deferred 100 ms after `isReady`, so an
  edit inside that window is not tracked at all: the model changed, `isDirty`
  stays false, and the beforeunload guard lets the tab close on unsaved work.

**Root cause:** the effect owns a timer, a subscription and a ref, and its cleanup
addresses only the timer. The 100 ms delay is a workaround for post-load store
writes rather than an explicit "load finished" signal.

**Status:** Open. Fix direction: unsubscribe in the effect cleanup (and reset
`isDirtyRef` there), and replace the timer with an explicit post-load `markClean()`
from the load path — which also removes the swallowed-edit window. Repro:
[`clip-04-09.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-04-09.explore.test.tsx).

## Deleting a layer leaves it solo'd in the preview overrides — the canvas can go blank

**Found by:** exploratory campaign CLIP-09

**Symptom:** `previewLayerOverrides` (the ADR 0013 preview-only solo/hide state)
is keyed by layer id and cleared only by `setView`, `setEditorMode` and the
explicit clear action. Deleting the layer that is currently solo'd leaves
`soloLayerId` pointing at an id that no longer exists — and because
`isEntityVisibleInPreview` shows *only* entities on the solo'd layer, everything
disappears until the user switches pages or leaves preview.

**Root cause:** the override lives in ui-state and the delete happens in the
model, with no subscription between them — the same shape as the stale-selection
bugs (HIST-13, RED-15).

**Workaround:** switch pages, or toggle preview off and on.

**Status:** Open. Fix direction: clear (or re-resolve) `previewLayerOverrides`
entries whose layer no longer exists whenever the view's layer set changes. Repro:
[`clip-04-09.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-04-09.explore.test.tsx).

## A `preserveViewport` reload keeps the previous model's selection

**Found by:** exploratory campaign CLIP-08

**Symptom:** the load path resets `selectedIds`/`itemControls` only when
`preserveViewport` is falsy. The icon-pack-swap reload sets it, so after that
reload the selection still names entities from the *previous* model — a dangling
selection (INV-2) that the delete path will then throw on (SCN-11) and that the
properties panel renders as "open but blank".

**Root cause:**
[`useInitialDataManager`](packages/axoview-lib/src/hooks/useInitialDataManager.ts#L211-L217)
groups the selection reset with the viewport reset, but they answer different
questions: the viewport should be preserved across a pack swap, the selection
cannot be (the ids are gone).

**Status:** Open. Fix direction: always clear the selection on load; keep only the
scroll/zoom restore behind `preserveViewport`. Repro:
[`clip-08-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-08-15.explore.test.tsx).

## The notification slot has no queue — a later toast silently buries an unread error

**Found by:** exploratory campaign CLIP-10

**Symptom:** `uiState.notification` is a single slot. Any later
`setNotification` overwrites whatever was there, so a success or progress toast
(paste succeeded, routing N%, cut N items) replaces an error the user has not read
— e.g. a failed save or a failed load. Contention is routine: a large paste emits
progress toasts while autosave may be reporting a failure.

**Root cause:** by design, but it collides with the ADR 0011 error-UX contract
that failures of intent must be surfaced.

**Status:** Open. Fix direction: either a small queue with severity-aware
precedence (errors are never displaced by non-errors), or route errors to the
dialog surface ADR 0011 already requires and leave the toast slot for
informational messages. Repro:
[`clip-08-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-08-15.explore.test.tsx).

## A group icon-resize can commit a scale outside the schema cap, bricking the next load

**Found by:** exploratory campaign CLIP-13

**Symptom:** `iconScale` is schema-capped to `[0.1, 3]`, but
`scene.updateViewItem` accepts any number — the reducer path performs no clamp.
A group resize multiplies each member's starting scale by a shared factor
(ADR 0044, to preserve relative sizes), so a member already at 2.5x times a factor
of 1.3 commits 3.25. The write succeeds, the diagram saves, and the **next load
fails `safeParse`** — the whole file refuses to open because of one node. This is
the "no dead writes" / S1-brick class the connector-label 24-to-40 cap already
taught.

**Root cause:** the range lives only in the schema; no write site enforces it.

**Status:** Open. Fix direction: clamp at the write site (`updateViewItem`, and
the group-resize factor computation), accepting that a clamped member breaks
strict ratio preservation — or cap the *factor* so no member can exceed the range,
which preserves ratios and stays legal. Repro:
[`clip-08-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-08-15.explore.test.tsx).

## Icon references and tile coordinates are unvalidated

**Found by:** exploratory campaign CLIP-14 / CLIP-15

**Symptom:** two more unchecked reference/range classes:

- **Unknown icon id.** A model item whose `icon` names an icon that is not in
  `model.icons` passes both `modelSchema` and `validateView`. Pasting a node from
  a diagram that loaded an icon pack into one that did not therefore commits
  cleanly and renders as a tombstone after save+reload — the `requiredPacks`
  mechanism never learns about the pack because nothing flagged the reference.
- **Unbounded tiles.** `coords` is `z.number()`, which correctly rejects `NaN`,
  but nothing bounds magnitude: a tile at `1e12` loads clean, overflows the
  projection math and puts content where no viewport can reach it.

**Status:** Open. Fix direction: add an `INVALID_ITEM_ICON_REF` check to
`validateModel` (and derive `requiredPacks` from it), and give `coords` a sane
`.int().min()/.max()` bound consistent with the grid's addressable range. Repro:
[`clip-08-15.explore.test.tsx`](packages/axoview-lib/src/__explore__/E4/clip-08-15.explore.test.tsx).

## Read-only mode is keyboard-editable — the keydown dispatcher has no `editorMode` gate

**Found by:** exploratory campaign PTR-01 / PTR-02 / PTR-03

**Symptom:** with `editorMode: 'EXPLORABLE_READONLY'` — the mode the app runs the
`/display/<diagramId>` viewer route in ([App.tsx:355](packages/axoview-app/src/App.tsx#L355))
— every canvas keyboard shortcut still works and still mutates the model:

- `r` / `c` / `t` / `l` arm `RECTANGLE.DRAW` / `CONNECTOR` / `TEXTBOX` / `LASSO`,
  and a canvas drag then really draws the shape (a rectangle appears in
  `view.rectangles`);
- `Delete` removes whatever `itemControls` names — and the ADR 0012 view-mode
  info popover pins `itemControls` on a click, so a viewer's own click plus
  Delete destroys the item;
- `Ctrl+C` / `Ctrl+V` / `Ctrl+X` copy, paste and cut view items;
- the same holds for `Ctrl+]`/`Ctrl+[` (z-order) and the arrow-key nudge.

`editorMode` stays `EXPLORABLE_READONLY` throughout, so nothing in the UI
signals that the "read-only" diagram is being edited.

**Root cause:** the two halves of `useInteractionManager` are gated differently.
The *pointer* effect returns early on `mode.type === 'INTERACTIONS_DISABLED'`
([useInteractionManager.ts:886](packages/axoview-lib/src/interaction/useInteractionManager.ts#L886)),
but `EXPLORABLE_READONLY` does not map to that mode — `getStartingMode`
([utils/common.ts:72-84](packages/axoview-lib/src/utils/common.ts#L72-L84))
gives it `PAN`, which is a live interactive mode. The *keydown* effect
([useInteractionManager.ts:548-637](packages/axoview-lib/src/interaction/useInteractionManager.ts#L548-L637))
is bound unconditionally and only ONE of its delegates consults `editorMode`:
`handleFunctionKeys` guards F2 with `if (uiState.editorMode !== 'EDITABLE') return`
(added for MQA #13). `handleToolHotkeys`, `handleClipboardShortcuts`,
`handleDeleteOrBackspace`, `handleZOrderShortcut`, `handleSelectAll` and
`handleArrowKey` have no such check.

**Workaround:** none from inside the viewer. The mutation is local to the
viewer's own store, so it does not corrupt the source diagram unless a save path
is reachable — but it does mean a shared/read-only link renders content the
owner never authored, and the viewer can silently delete what they came to read.

**Status:** Open. Fix direction: gate the whole keydown dispatcher on
`uiState.editorMode === 'EDITABLE'` (early-return in `handleKeyDown` after the
Escape/Delete-guard split, keeping navigation-only keys — arrows-as-pan, F1 help
— available to viewers), rather than adding a per-delegate check. Consider also
making `EXPLORABLE_READONLY` gate the *pointer* effect's mutating modes for the
same reason. Repro:
[`ptr-01-03.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-01-03.explore.spec.ts).

## An open modal dialog does not shield the canvas — Delete destroys the item behind it

**Found by:** exploratory campaign PTR-05

**Symptom:** select a node, press F1 (or open Settings / Export image / any MUI
dialog), then press `Delete`. The node is removed from the diagram while the
dialog is still on screen, so the user never sees the canvas change — they find
the deletion later. Every other canvas shortcut behaves the same way with a
modal open: `r` / `c` / `t` re-arm tools, `Ctrl+Z` undoes, `Ctrl+]` reorders,
the arrow keys nudge the selection.

**Root cause:** the keydown listener is bound to `window`
([useInteractionManager.ts:614](packages/axoview-lib/src/interaction/useInteractionManager.ts#L614))
and its only scope check is `isEditableTarget(e.target)` — a dialog body is not
an input, so the keystroke falls straight through to the canvas dispatcher. MUI's
`Dialog` traps *focus*, not window-level keydown listeners, so nothing else stops
it. F2 is the one shortcut that guards on where the keystroke came from
(`cameFromRenderer`, added for MQA #13); that check was never generalised.

**Workaround:** clear the selection before opening a dialog.

**Status:** Open. Fix direction: reuse the F2 `cameFromRenderer` test as a
dispatcher-wide gate for the *mutating* shortcuts (Delete, clipboard, z-order,
nudge, tool hotkeys), or gate on `uiState.dialog === null` plus "no MUI modal is
open" (`document.querySelector('.MuiModal-root')`). Repro:
[`ptr-05-12-14.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-05-12-14.explore.spec.ts).

## Ctrl+C is hijacked everywhere — copying text out of the app silently does nothing

**Found by:** exploratory campaign PTR-12

**Symptom:** select any text that is not inside an `<input>` / `<textarea>` /
Quill editor — a node's read-only notes in the ADR 0012 view-mode popover, a
description in the properties panel, the Help dialog's text — and press `Ctrl+C`.
No `copy` event fires, nothing reaches the OS clipboard, and the selection stays
highlighted, so the user gets no feedback that the copy failed. What actually
happened is that the canvas clipboard was overwritten with the current canvas
selection (or a "nothing to copy" no-op).

**Root cause:** `handleClipboardShortcuts`
([useInteractionManager.ts:266-288](packages/axoview-lib/src/interaction/useInteractionManager.ts#L266-L288))
calls `e.preventDefault()` unconditionally for `x` / `c` / `v` whenever
Ctrl/Cmd is held. The only guard upstream is `isEditableTarget`
([handleDeleteKey.ts:23-27](packages/axoview-lib/src/interaction/handleDeleteKey.ts#L23-L27)),
which recognises editable *fields* but not a plain text selection in
non-editable content. Preventing the keydown suppresses Chrome's native copy
command entirely.

**Workaround:** use the browser's Edit menu, or right-click → Copy (the OS menu
survives off-canvas — see `contextmenu-scope.spec.ts`).

**Status:** Open. Fix direction: skip the canvas clipboard shortcuts when
`window.getSelection()` holds a non-collapsed range outside the renderer (and
don't `preventDefault` in that case). The same reasoning applies to `Ctrl+A`,
which force-selects the canvas instead of the text under the cursor. Repro:
[`ptr-05-12-14.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-05-12-14.explore.spec.ts).

## Ctrl+Shift+] / Ctrl+Shift+[ (bring to front / send to back) do nothing on a real keyboard

**Found by:** exploratory campaign PTR-14

**Symptom:** the canvas context menu advertises `Ctrl+Shift+]` as "bring to
front" ([CanvasContextMenu.tsx:527](packages/axoview-lib/src/components/CanvasContextMenu/CanvasContextMenu.tsx#L527)),
but pressing it on a physical keyboard changes nothing — the item's `zIndex` is
untouched. `Ctrl+Shift+[` ("send to back") is dead the same way. The plain
`Ctrl+]` / `Ctrl+[` nudges still work.

**Root cause:** `handleZOrderShortcut` filters on the printable character:

```ts
if (!isCtrlOrCmd || (e.key !== ']' && e.key !== '[')) return;
```

([useInteractionManager.ts:425](packages/axoview-lib/src/interaction/useInteractionManager.ts#L425)).
`KeyboardEvent.key` carries the *shifted* character, so a US keyboard sends `}`
and `{` for those chords and the guard rejects them before `e.shiftKey` is ever
consulted. The absolute branch inside `reorder` (`if (e.shiftKey)`) is therefore
unreachable from the keyboard.

**Why no existing test caught it:** `z-order.spec.ts` drives the chord with
`page.keyboard.press('Control+Shift+]')`, and Playwright resolves that to
`e.key === ']'` with `shiftKey: true` — a key identity no real keyboard produces.
The probe records both side by side:

```
[{"key":"]","code":"BracketRight","ctrl":true,"shift":true},   ← page.keyboard.press
 {"key":"}","code":"BracketRight","ctrl":true,"shift":true}]   ← CDP Input.dispatchKeyEvent
```

So the suite is green on a chord that cannot fire in the product — the
synthetic-vs-real input class (ADR 0022 addendum) applied to the keyboard rather
than the pointer.

**Workaround:** use the context menu's "Bring to front" / "Send to back" items,
or press `Ctrl+]` repeatedly.

**Status:** Open. Fix direction: match on `e.code` (`BracketRight` /
`BracketLeft`) instead of `e.key`, or accept `}` / `{` alongside `]` / `[`. The
existing `z-order.spec.ts` assertion should move to `e.code` too, or it will keep
passing over a broken shortcut. Repro:
[`ptr-05-12-14.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-05-12-14.explore.spec.ts).

## An undo taken during a drag is unrecoverable — the gesture's commit destroys the redo entry

**Found by:** exploratory campaign PTR-10

**Symptom:** press `Ctrl+Z` while a node drag is in flight (button still down),
then release. The undo lands — the node disappears — and `Ctrl+Y` will not bring
it back. `model.history.future` is empty after the release, so the entry is gone
rather than merely unreachable; pressing redo again does nothing. Outside a drag
the same two keystrokes round-trip fine (`hotkeys.spec.ts` "Ctrl+Y redoes after
Ctrl+Z", and the probe's own positive control).

**Root cause:** nothing gates the keyboard shortcuts on an in-flight gesture. The
drag opened a transaction at `DragItems.entry` (`scene.beginDragTransaction()`),
`Ctrl+Z` runs `useHistory.undo()` straight through the window keydown handler
underneath it, and the `mouseup` then runs `DragItems.mouseup` →
`scene.commitDragTransaction()`. That commit is a NEW action as far as the
history store is concerned, and a new action clears the redo stack — the standard
undo/redo rule, applied to a commit the user never intended as an edit. (The
committed patch itself is empty, because the item the drag was previewing no
longer exists, so the history depth does not even change: `past.length` stays 1
while `future.length` drops to 0.)

**Workaround:** finish or abandon the gesture before pressing Ctrl+Z. Note that
Escape does NOT abandon a drag (canvas-interaction.md §8 — `DRAG_ITEMS` has no
abort), so "release, then undo" is the only safe order.

**Status:** Open. Fix direction: ignore undo/redo (and the other mutating
shortcuts) while `scene.dragInProgress` is true — the same in-flight-gesture
guard the tool-hotkey and Ctrl+A paths need. Alternatively make
`commitDragTransaction` a no-op when the transaction produced no patches, so it
cannot clear the redo stack. Repro:
[`ptr-06-09-10-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-06-09-10-15.explore.spec.ts).

## A tool hotkey or Ctrl+A during a connector draw strands the half-drawn connector

**Found by:** exploratory campaign PTR-07 / PTR-08

**Symptom:** in the default click-to-connect mode, click the first node to start
a connection, then change your mind and press a tool hotkey (`r`, `t`, `l`, `s`,
…) or `Ctrl+A`. The half-drawn connector is **not** removed — it stays in
`view.connectors` as a real, saved entity with both anchors bound to the SAME
node (a degenerate self-loop, which is what `createConnectorAt` seeds before the
second click resolves the far end). Escape can no longer clear it either: the
mode is no longer `CONNECTOR`, so `handleConnectorEscape` returns false and the
orphan is permanent. `Ctrl+A` additionally folds it into the selection, so the
user's "select all" reports N+1 elements.

**Root cause:** `handleClickFirst`
([Connector.ts:57-89](packages/axoview-lib/src/interaction/modes/Connector.ts#L57-L89))
really creates the connector and opens a drag transaction; only the second click,
Escape or the right-click restore closes either. `handleToolHotkeys`
([useInteractionManager.ts:337-414](packages/axoview-lib/src/interaction/useInteractionManager.ts#L337-L414))
and `handleSelectAll`
([useInteractionManager.ts:222-239](packages/axoview-lib/src/interaction/useInteractionManager.ts#L222-L239))
just call `setMode(...)` with no in-flight-gesture check, so the abort path is
skipped entirely. The mode registry's `exit`/`entry` lifecycle cannot save it
either: `Connector.exit` only resets the cursor, and it does not even run until
the NEXT pointer event (`processMouseUpdate` compares `reducerTypeRef`).

**Scope note (measured, not assumed):** the abandoned `beginDragTransaction`
bracket does NOT go on to suppress history for later edits — the next gesture's
own begin/commit closes it, and a subsequent rectangle draw records its entry
normally. The damage is the stranded entity, not the D-4 / HIST-06 amplifier.

**Workaround:** press Escape *before* switching tools; or delete the orphan
connector afterwards (it is selectable).

**Status:** Open. Fix direction: give the programmatic mode switches the same
abort the Escape path has — factor `handleConnectorEscape`'s
delete-plus-commit into a shared `abortInFlightGesture(uiState, deps)` and call
it from `handleToolHotkeys` and `handleSelectAll` before `setMode`. Repro:
[`ptr-04-07-08-11-13.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-04-07-08-11-13.explore.spec.ts).

## The arrow keys nudge items on a locked layer

**Found by:** exploratory campaign PTR-11

**Symptom:** select some items, then lock their layer in the Layers panel. The
arrow keys still move them — one tile per press, indefinitely, so a "locked"
layer can be walked across the canvas. Every selected item on the locked layer
moves together, and each press is its own undo entry.

**Root cause:** `handleArrowKey`'s nudge path applies no lock/visibility gate,
on the strength of a comment that is not true:

```ts
// selectedIds already only holds interactable refs (it can't contain
// locked/hidden items — ADR 0006 §3), so no extra lock/hide gate is needed here.
```

([handleArrowKey.ts:126-131](packages/axoview-lib/src/interaction/handleArrowKey.ts#L126-L131)).
`selectedIds` is never re-validated when a layer's state changes — that is the
already-filed RED-15 ("Hiding or locking a layer does not drop the entities it
covers from the live selection"). RED-15 documented the Delete consequence; the
nudge is a second consumer of the same stale selection, and it is the one that
contradicts an explicit in-code assertion. Note the pointer path *is* gated
(`isItemInteractable` in `processMouseUpdate`), so a locked item cannot be
dragged with the mouse — only with the keyboard.

**Workaround:** click empty canvas to clear the selection before locking, or
after.

**Status:** Open. Fix direction: fixing RED-15 (re-validate `selectedIds` on
every layer state change) fixes this too; independently, `handleArrowKey` should
take the lock/visibility sets the way `handleSelectAll` already does via
`layerContextRef`, and the false comment should go. Tracked as a new cross-store
invariant **INV-11** in the exploratory oracle (`fixtures/explore.fixture.ts`).
Repro:
[`ptr-04-07-08-11-13.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I1-pointer/ptr-04-07-08-11-13.explore.spec.ts).

## The long-press context menu leaves the press half-open, and cannot be dismissed for 700 ms

**Found by:** exploratory campaign TCH-02 / TCH-03

**Symptom:** two defects in the same gesture. (1) After a long-press opens a
node's context menu and the finger lifts, `uiState.mouse.mousedown` is still
populated and `mode.mousedownItem` still names the pressed node — the app
believes a press is in progress with nothing touching the screen. (2) A
deliberate tap-away to dismiss the menu does nothing if it happens within ~700 ms
of the menu opening; the menu only closes if the user waits and taps again.

**Root cause:** (1) the `menu` phase is entered from inside the long-press timer
and `onTouchPointerUp` returns early for `wasPhase === 'menu'`
([useInteractionManager.ts:1265-1269](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1265-L1269)),
so the `mousedown` that was forwarded at press time never gets its matching
`mouseup`. `Cursor.entry` re-runs `mousedown` whenever `mousedownItem` is set
([Cursor.ts:580-587](packages/axoview-lib/src/interaction/modes/Cursor.ts#L580-L587)),
so the stale bookkeeping is live input for the next mode transition.
(2) `suppressLongPressGestureEnd`
([useInteractionManager.ts:90-114](packages/axoview-lib/src/interaction/useInteractionManager.ts#L90-L114))
installs capture-phase window listeners that `preventDefault` **any** cancelable
`touchend` and swallow `mousedown`/`click` on `.MuiBackdrop-root`, self-removing
only on the first `click` or after a 700 ms timer. Its purpose is to survive the
compat-mouse sequence the lift synthesises — but it cannot tell that sequence
apart from a genuine new tap, so the user's next tap inside the window is eaten
too.

**Workaround:** wait ~1 s before tapping away, or pick a menu item.

**Status:** Open. Fix direction: forward a `mouseup` when entering the `menu`
phase (or clear `mousedownItem`/`mouse.mousedown` explicitly); and scope the
suppression to the compat sequence rather than a time window — e.g. record the
`touchend` timestamp and only swallow synthesised events within one frame of it,
or drop the belt-and-braces backdrop listeners now that the `touchend`
`preventDefault` does the real work. Repro:
[`touch-tch-01-06-14.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-01-06-14.explore.spec.ts).

## Pen hover does nothing — no hover cursor, no hover outline, no `hoveredItem`

**Found by:** exploratory campaign TCH-04

**Symptom:** hovering a node with a pen/stylus (without pressing) produces none
of the feedback a mouse produces at the same point: `uiState.hoveredItem` stays
null, so there is no hover outline, no pointer cursor, and `uiState.mouse` keeps
its last stale position. Moving a mouse to the same point immediately sets all
of it.

**Root cause:** `onPointerMove` routes every non-mouse `pointerType` — pen
included — into the touch gesture machine
([useInteractionManager.ts:1470-1478](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1470-L1478)),
and `onTouchPointerMove` early-returns for a pointer that is not in `ts.pointers`
([useInteractionManager.ts:1209-1211](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1209-L1211)) —
i.e. one that never pressed. That guard is right for touch (a finger cannot
hover) and wrong for pen, which is a hovering device. ADR 0018 treats pen as
"touch that happens to be precise"; hover is the one place where that
equivalence breaks.

**Workaround:** none; press instead of hovering.

**Status:** Open. Fix direction: route hovering pen moves (`pointerType === 'pen'`
with no active press) down the mouse path — `onMouseEvent(toSlim(e, 'mousemove'))` —
and keep the touch machine for pen moves that belong to an active press. Repro:
[`touch-tch-04-05-07-08.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-04-05-07-08.explore.spec.ts).

## A touch palette drag released back onto the Elements panel places a node behind the panel

**Found by:** exploratory campaign TCH-05

**Symptom:** on touch, press an icon in the Elements panel, drag it, then change
your mind and release it back over the panel. A node is placed anyway — at the
canvas tile the panel is covering (measured: tile `{-7, 4}`, off to the left,
invisible until the panel is closed).

**Root cause:** the `palette` phase decides "was this dropped on the canvas?"
with a raw `getBoundingClientRect` containment test against `rendererEl`
([useInteractionManager.ts:1344-1351](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1344-L1351),
and the same test again on the `pointercancel` path at
[:1393-1399](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1393-L1399)).
The renderer's rect spans the whole window (measured `{x:0, y:46, w:1280,
h:674}`) and the left dock renders *inside* it (the icon measured at `x:61`), so
every panel is "on the canvas" as far as that test is concerned. Rect
containment cannot answer the question hit-testing answers.

**Workaround:** drag the icon off the panel and release over empty canvas, or
delete the stray node afterwards.

**Status:** Open. Fix direction: replace the rect test with
`document.elementFromPoint(clientX, clientY)` and require the hit element to be
the interactions box (or inside it) — the same `isRendererInteraction` question
the mouse path already asks. Repro:
[`touch-tch-04-05-07-08.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-04-05-07-08.explore.spec.ts).

## A floating Label has no long-press menu on touch — the press never reaches the gesture machine

**Found by:** exploratory campaign TCH-09

**Symptom:** holding a floating Label (ADR 0031) on a touch device opens no
context menu. Holding a node in the same place does. The Label also gets no
fallback behaviour — the hold-on-empty auto-lasso does not arm either, and the
mode stays `CURSOR`, so the press produces nothing at all. Since the context menu
is the sole per-item command surface on touch (ADR 0027 §4), every Label command
— delete, z-order, add note — is unreachable by touch.

**Root cause:** two layers miss it. `onTouchPointerDown` resolves the pressed
entity with `getItemAtTile`
([useInteractionManager.ts:1166-1169](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1166-L1169)),
and Labels are deliberately not tile-hit-tested (ADR 0031 §4 — they are addressed
through the `LabelHitLayer` DOM proxy), so `downItem` is null. And the proxy's own
pointer handling consumes the press before the window-bound gesture machine sees
it, which is why not even the `pan-pending` fallback runs. The mouse path is
unaffected because the right-click menu is raised from the proxy element itself
(`label-entity.spec.ts` "right-clicking a Label opens its item menu").

**Workaround:** none on touch.

**Status:** Open. Fix direction: give `LabelHitLayer` a long-press handler that
opens the item menu (mirroring its existing right-click branch), or let the
proxy's pointerdown fall through to the window machine with the label id carried
the way `data-anchor-id` is for connector anchors. Repro:
[`touch-tch-09-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-09-15.explore.spec.ts).

## Double-tapping a text box opens the Details deck instead of editing it — touch cannot edit text on canvas

**Found by:** exploratory campaign TCH-12

**Symptom:** double-clicking a text box with a mouse drops into the on-canvas
rich-text editor (ADR 0034 §1 — verified as a control in the probe).
Double-TAPPING the same text box does not: `editingTextBoxId` stays null and the
Details deck opens instead. There is no other touch route into the editor, so a
touch-only user cannot edit text box content at all.

**Root cause:** the two double-activation paths were written separately and only
one learned about ADR 0034. `onDoubleClick`
([useInteractionManager.ts:864-873](packages/axoview-lib/src/interaction/useInteractionManager.ts#L864-L873))
has an explicit `item.type === 'TEXTBOX'` branch that selects without opening the
panel and calls `setEditingTextBoxId`. The touch double-tap branch in
`onTouchPointerUp`
([useInteractionManager.ts:1300-1307](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1300-L1307))
has only the generic `setItemControls(controls)` — no TEXTBOX case. A sibling-drift
bug: two implementations of "double-activate an item", diverging on the type that
was special-cased later.

**Workaround:** none on touch.

**Status:** Open. Fix direction: factor the double-activation body out of
`onDoubleClick` and call it from the touch branch too, so the TEXTBOX case (and
any future type-specific case) cannot diverge again. Repro:
[`touch-tch-09-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-09-15.explore.spec.ts).

## Cancelling one finger during a pinch strands the other — the canvas freezes until it lifts

**Found by:** exploratory campaign TCH-14

**Symptom:** during a two-finger pinch, if one finger's pointer is cancelled by
the OS (notification, edge swipe, palm rejection), the remaining finger stops
doing anything: it neither pans nor zooms, however far it moves, until it is
lifted and re-placed. Lifting the same finger normally instead of cancelling it
resumes a one-finger pan correctly (verified as a control in the probe).

**Root cause:** `onTouchPointerUp` has an explicit `wasPhase === 'pinch'` branch
that drops back to `phase: 'pan'` when one pointer remains
([useInteractionManager.ts:1270-1280](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1270-L1280)).
`onTouchPointerCancel` has no such branch — it only resets the phase when
`ts.pointers.size === 0`
([useInteractionManager.ts:1406-1410](packages/axoview-lib/src/interaction/useInteractionManager.ts#L1406-L1410)) —
so the machine stays in `pinch` with one pointer, and `runTouchFrame`'s
`pts.length >= 2` guard makes every frame a no-op.

**Workaround:** lift the remaining finger and start again.

**Status:** Open. Fix direction: give `onTouchPointerCancel` the same
pinch → pan demotion `onTouchPointerUp` has (ideally by sharing one
`endPointer(e, { cancelled })` helper, since the two handlers have drifted in
exactly this way). Repro:
[`touch-tch-01-06-14.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I2-touch/touch-tch-01-06-14.explore.spec.ts).

## Arrow-nudging an off-grid item erases its sub-tile offset and snaps it to the grid

**Found by:** exploratory campaign SEL-01

**Symptom:** an item deliberately placed off-grid (ADR 0023 — snapping off, then
nudged with the mouse so it sits between cells) loses its position the moment it
is moved with the arrow keys. One `ArrowRight` translates it by the correct tile
AND discards the px residual: measured `offset {-8.70, -12.74}` → absent, so the
item visibly jumps onto the grid. The mouse drag path preserves the offset; only
the keyboard destroys it.

**Root cause:** `handleArrowKey`'s nudge builds its updates from the tile alone —
`{ id, tile: CoordsUtils.add(it.tile, delta) }` with no `offset` field
([handleArrowKey.ts:140-152](packages/axoview-lib/src/interaction/handleArrowKey.ts#L140-L152)) —
and the batch updaters write `offset: u.offset` unconditionally
([useSceneActions.ts:163, 240, 271](packages/axoview-lib/src/hooks/useSceneActions.ts#L163)),
so `undefined` overwrites the stored residual. `DragItems.mouseup` passes the
offset explicitly, which is why the drag path is unaffected. This is the ADR 0023
"offset-omission" bug class (its seven-bug cluster) recurring in the one consumer
the original sweep did not cover.

**Workaround:** re-place the item by dragging instead of nudging.

**Status:** Open. Fix direction: read each item's current `offset` in the nudge
and pass it through, exactly as `DragItems.mouseup` does. Consider making the
batch updaters treat `offset: undefined` as "leave unchanged" rather than "clear"
so the whole class cannot recur — that is a wider decision, since some callers
may rely on clearing. Repro:
[`sel-01-04-07-11.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I3-selection/sel-01-04-07-11.explore.spec.ts).

## A mixed node + rectangle group dragged into a collision tears apart

**Found by:** exploratory campaign SEL-04

**Symptom:** select a node and a rectangle together and drag the group so the
node's target tile is occupied by another node. The node stops at the last free
tile while the rectangle keeps following the cursor, and both commit — measured
node delta `{-2, +2}` against rectangle delta `{-3, +3}`. The group's relative
layout is silently changed, in one history entry, with no visual warning.

**Root cause:** collision is a node-only rule. `computeNodeUpdates` is
all-or-nothing for ITEMs (it returns null for the whole frame when any target
tile collides), but the rectangle / text-box / label preview branches in the same
`dragItems` pass are not collision-gated at all and keep accumulating the cursor
delta
([DragItems.ts:343-403](packages/axoview-lib/src/interaction/modes/DragItems.ts#L343-L403)).
`DragItems.mouseup` then commits whatever each preview map holds. Node-only
groups are safe — verified: a two-node group over an occupied tile moves rigidly
or not at all (SEL-11) — so the bug is specific to MIXED groups.

**Workaround:** undo, and move the group without crossing an occupied tile.

**Status:** Open. Fix direction: make the collision verdict apply to the whole
group — if `computeNodeUpdates` returns null for a frame, skip the rectangle /
text-box / label preview accumulation for that frame too, so every member holds
the last valid position. Repro:
[`sel-01-04-07-11.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I3-selection/sel-01-04-07-11.explore.spec.ts).

## A live freehand-lasso selection makes Backspace destructive in every text field

**Found by:** exploratory campaign SEL-07

**Symptom:** draw a freehand lasso around some items, then click into any text
field and press Backspace to correct a typo. Every lassoed item is deleted from
the canvas, and the keystroke never reaches the field (measured: view items 2 →
0, field value unchanged). The same Backspace with no freehand selection live is
harmless.

**Root cause:** a parity divergence plus a deliberate guard omission, which are
only dangerous together. `Lasso.mouseup` drops back to `CURSOR`, but
`FreehandLasso.mouseup` STAYS in `FREEHAND_LASSO` with `mode.selection`
populated — so the freehand selection is a long-lived state a marquee selection
never is. And `handleDeleteOrBackspace`'s lasso branch deliberately runs BEFORE
the editable-target guard
([handleDeleteKey.ts:66-79](packages/axoview-lib/src/interaction/handleDeleteKey.ts#L66-L79)) —
the other two branches (`selectedIds.length > 1`, single `itemControls`) both
call `isEditableTarget`, but the lasso branch does not. Combined: any focused
input, anywhere in the app, is one Backspace away from destroying the selection.

**Workaround:** press Escape (or click empty canvas) to leave freehand mode
before typing anywhere.

**Status:** Open. Fix direction: add the `isEditableTarget` guard to the lasso
branch as well — there is no stated reason for it to be exempt while the other
two are guarded. Separately, consider making `FreehandLasso.mouseup` return to
`CURSOR` like `Lasso.mouseup` does, which would close the whole class and remove
a real behavioural inconsistency between the two marquee tools. Repro:
[`sel-01-04-07-11.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I3-selection/sel-01-04-07-11.explore.spec.ts).

## Starting a drag on a connector body splices a waypoint outside the drag transaction

**Found by:** exploratory campaign SEL-02

**Symptom:** grabbing a connector's body to bend it splices the new waypoint as
its OWN history entry, before the drag transaction opens. One gesture therefore
records two entries (measured: history 3 → 5), and if the drag is abandoned —
e.g. a tool hotkey mid-press — the stray waypoint is left on the connector.
Pressing Ctrl+Z once removes the move but leaves the waypoint (anchors 3, not 2);
a second Ctrl+Z is needed to undo something the user never deliberately did.

**Root cause:** `Cursor.mousemove`'s drag-start branch resolves the grabbed
connector to an anchor via `getAnchor`, which splices a new waypoint through
`scene.updateConnector`, and only then hands off to `DRAG_ITEMS`
([Cursor.ts:612-618](packages/axoview-lib/src/interaction/modes/Cursor.ts#L612-L618)) —
whose `entry` is what calls `beginDragTransaction`. The write therefore lands
outside the bracket that was supposed to make the gesture one undo step.

**Workaround:** press Ctrl+Z twice.

**Status:** Open. Fix direction: open the drag transaction before the splice —
either move `beginDragTransaction` ahead of the `getAnchor` call in the drag-start
branch, or perform the splice inside `DragItems.entry` from the pressed
connector/tile. Repro:
[`sel-02-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I3-selection/sel-02-15.explore.spec.ts).

## The endpoint-reconnect mode has no way out — Escape does not cancel it and an off-canvas release does not end it

**Found by:** exploratory campaign CONN-01 / CONN-02

**Symptom:** start dragging a connector endpoint to re-anchor it, then change
your mind. Neither exit works:

- **Escape** leaves the anchor wherever the pointer last was (measured: the
  anchor went from `{item: <node>}` to `{tile:{4,3}}` and stayed there) AND
  leaves the app in `RECONNECT_ANCHOR`, so the cursor is still a crosshair and
  the next click re-anchors again. The user is stuck in a mode they cannot see.
- **Releasing over a panel** (dock, properties deck — anywhere off the canvas)
  neither commits nor exits: the mode is still `RECONNECT_ANCHOR` after the
  button is up, so the reconnect keeps following the pointer with nothing
  pressed.

**Root cause:** `ReconnectAnchor.mousemove` rewrites the anchor ref on every
tile as a live preview, but nothing stores the original to restore
([ReconnectAnchor.ts:16-33](packages/axoview-lib/src/interaction/modes/ReconnectAnchor.ts#L16-L33)).
`RECONNECT_ANCHOR` is deliberately absent from `TOOL_MODES_EXITED_BY_ESCAPE`
([handleEscapeKey.ts:16-25](packages/axoview-lib/src/interaction/handleEscapeKey.ts#L16-L25))
on the grounds that transient modes "own their own abort logic" — but this one
has none, so Escape falls through to the panel-clear branch and does nothing
visible. And `ReconnectAnchor.mouseup` early-returns unless
`isRendererInteraction`
([ReconnectAnchor.ts:34-37](packages/axoview-lib/src/interaction/modes/ReconnectAnchor.ts#L34-L37)),
leaving the commit to the `exit()` safety net, which only runs on the NEXT mode
change. `usePanHandlers.restoreModeAfterRightClick` has no `RECONNECT_ANCHOR`
branch either, so right-click is not an escape hatch.

**Workaround:** press a tool hotkey (`s`) to force a mode change, then undo.

**Status:** Open. Fix direction: snapshot the original anchor ref in the mode
state at entry and restore it on Escape (then return to CURSOR); and let
`mouseup` commit-and-exit regardless of `isRendererInteraction` — the gesture
began on the canvas, so where it ends should not decide whether it finishes.
Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## The connector's end anchor is given a brand-new id on every tile move while drawing

**Found by:** exploratory campaign CONN-04

**Symptom:** while a connector is being drawn, its second anchor's id changes on
every tile the pointer crosses — measured three distinct ids across three moves.
Anything that captured the id a frame earlier (an overlay React key, a selection
ref, `uiState.mouse.targetAnchorId`) is pointing at an anchor that no longer
exists, and every move is a full `updateConnector` inside the open transaction.

**Root cause:** `Connector.mousemove` rebuilds `anchors[1]` with a fresh
`generateId()` rather than updating the existing anchor's `ref` in place
([Connector.ts:218, 225](packages/axoview-lib/src/interaction/modes/Connector.ts#L218)).

**Workaround:** none needed for the common flow — the churn is invisible unless
something holds the id across frames.

**Status:** Open. Fix direction: generate the end-anchor id ONCE at
`handleClickFirst`/`handleDragStart` and mutate only its `ref` on subsequent
moves. Low user-visible impact today, but it is a latent trap for any feature
that keys off anchor identity mid-draw (the ADR 0018 `data-anchor-id` path
already does for waypoints). Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## A stray click while the connector tool is armed leaves a permanent half-attached or zero-length connector

**Found by:** exploratory campaign CONN-07 / CONN-13

**Symptom:** two shapes of the same problem, one per interaction mode.

- **Click mode (default).** Click a node to arm the connection, then click empty
  canvas — the documented "stray-empty-click revert". No revert happens: the
  connector is committed with one end on the node and the other anchored to the
  bare tile that was clicked (measured `[{item: <node>}, {tile:{5,5}}]`).
- **Drag mode.** A single click on empty canvas with no travel commits a
  connector whose BOTH anchors are the same empty tile (measured
  `[{tile:{5,5}}, {tile:{5,5}}]`) — a zero-length connector attached to nothing.

Both survive, save and reload; neither is easy to select and delete because
there is nothing to click.

**Root cause:** click mode's `handleClickSecond` treats an empty tile as a valid
free-floating endpoint (which it is, for a deliberate free-floating connector) —
there is no "the user clicked away without meaning it" guard, so the documented
revert does not exist in the code. Drag mode commits whatever `anchors[1]` last
resolved to on mouseup with no tap-slop check
([Connector.ts:256-270](packages/axoview-lib/src/interaction/modes/Connector.ts#L256-L270)),
so a zero-travel press-release commits the start tile twice.

**Workaround:** press Escape instead of clicking away (Escape DOES abort
correctly — verified as a control).

**Status:** Open. Fix direction: in drag mode, revert instead of committing when
the gesture never exceeded tap-slop (the `exceedsTapSlop` helper already exists
for this). In click mode, decide the intended semantics — either implement the
documented empty-click revert, or drop the claim from the docs and keep
free-floating endpoints as a feature. Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## A node can be connected to itself, producing a zero-length self-loop that validates clean

**Found by:** exploratory campaign CONN-10

**Symptom:** in click mode, click the same node twice: a connector is created
with BOTH anchors bound to that one node. It has no length, renders as nothing
useful, passes `expectStoreInvariants` and the schema, and saves. The same shape
is reachable from the reconnect path by dragging one endpoint onto the node the
other endpoint already sits on.

**Root cause:** nothing compares the two anchor refs. `handleClickSecond`
resolves the second click to whatever `getItemAtTile` returns and writes it,
and `createConnectorAt` already seeds BOTH anchors with the pressed item (which
is why PTR-07's abandoned connector is also self-anchored) — so "same node
twice" is the default state, not an edge case the code has to construct.

**Workaround:** delete the connector.

**Status:** Open. Fix direction: reject (or revert) a second click that resolves
to the same item as the first anchor — the same place a "no duplicate connector
between this pair" check would go. If self-loops are ever wanted as a feature
they need real routing (a loop path), which does not exist today. Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## Two connectors between the same pair of nodes get byte-identical routes and cannot be told apart

**Found by:** exploratory campaign CONN-11

**Symptom:** draw a second connector between the same two nodes (a normal thing
to do when they have two distinct relationships). Both are routed along exactly
the same tiles — measured `"2,1|1,2|1,3|1,4|1,5|1,6"` for both — so they render
as one line. Clicking picks whichever the hit-test finds first, so the second
connector is effectively unreachable: it cannot be selected, styled, labelled or
deleted by pointer.

**Root cause:** the pathfinder is a pure function of the two endpoints, with no
awareness of connectors already routed between the same pair, and nothing
offsets parallel edges (the standard fan-out / bundle treatment).

**Workaround:** add a waypoint to one of them by dragging its body — that
changes its route and makes both addressable again. Discoverable only by
accident.

**Status:** Open. Fix direction: offset parallel connectors between the same
node pair (index-based perpendicular displacement at the midpoint is the usual
approach), or at minimum make the hit-test disambiguate overlapping paths so
each is reachable. Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## A connector can be anchored to a node on a locked layer

**Found by:** exploratory campaign CONN-15

**Symptom:** lock a layer, then draw a connector to a node on it. The connection
is made and the anchor binds to the locked node — an entity the user has
explicitly declared un-editable, which cannot be selected, moved or deleted, is
silently accepted as the target of a new relationship.

**Root cause:** the connector hit-test has no interactability gate. Both
`Connector.mousedown`/`handleClickSecond` and `ReconnectAnchor.mousemove` call
`getItemAtTile({ tile, scene })`, which is purely geometric — unlike the
`Cursor` paths, which are handed `isItemInteractable` (built from
`lockedIds`/`visibleIds` in `processMouseUpdate`) and honour it. The same hole
means a node on a HIDDEN layer is connectable too: the user connects to
something they cannot see.

**Workaround:** unlock the layer before connecting.

**Status:** Open. Fix direction: thread `isItemInteractable` into the connector
and reconnect hit-tests as the Cursor paths already do, so a locked or hidden
node reads as empty tile to the connector tool. Note this is the same
"acquisition paths are gated, this one is not" shape as PTR-11, from the other
direction. Repro:
[`conn-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I4-connectors/conn-01-15.explore.spec.ts).

## A mouse palette drag released over a panel places the element behind the panel

**Found by:** exploratory campaign CTX-01

**Symptom:** press an icon in the Elements panel with the mouse, drag it, then
change your mind and release it still over the panel. A node is placed anyway —
at the canvas tile the panel is covering (measured tile `{-8, 4}`, off to the
left and invisible until the panel is closed).

**Root cause:** the placement modes commit on `moved` alone. `PlaceIcon.mouseup`
([PlaceIcon.ts:47-53](packages/axoview-lib/src/interaction/modes/PlaceIcon.ts#L47-L53)),
`TextBox.mouseup` ([TextBox.ts:27-33](packages/axoview-lib/src/interaction/modes/TextBox.ts#L27-L33))
and `Label.mouseup` ([Label.ts:26-32](packages/axoview-lib/src/interaction/modes/Label.ts#L26-L32))
all place when the gesture exceeded tap-slop, with no check that the release was
over the canvas. Only the TOUCH `palette` path checks anything at all — and its
check is a `getBoundingClientRect` containment that has its own hole (TCH-05).
Both are the same question — "was this dropped on the canvas?" — answered two
different wrong ways, and not at all on the mouse path.

**Workaround:** delete the stray node, or drop deliberately over the canvas.

**Status:** Open. Fix direction: one shared "was the release over the canvas"
helper, implemented as `document.elementFromPoint(clientX, clientY)` resolving
inside the interactions box — the same question `isRendererInteraction` answers
for every other gesture — used by both the mouse placement modes and the touch
palette path. Repro:
[`ctx-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I5-pan-menu/ctx-01-15.explore.spec.ts).

## Panning drops the armed tool — always for a middle-drag, and for half the tools on a right-drag

**Found by:** exploratory campaign CTX-03 / CTX-04

**Symptom:** arm a tool, pan the canvas, and find yourself back in Select with no
indication why.

- **Right-drag pan** restores `CONNECTOR`, `LASSO`, `FREEHAND_LASSO`,
  `RECTANGLE.DRAW` and `PLACE_ICON` (verified as a control), but silently drops
  `TEXTBOX` and `LABEL` — measured `TEXTBOX → CURSOR`.
- **Middle-drag pan** drops *every* tool, including the five right-drag restores
  correctly — measured `LASSO → CURSOR`.

**Root cause:** `restorePreviousMode` reconstructs clean modes from a hardcoded
five-case switch and falls through to `CURSOR` for everything else
([usePanHandlers.ts:52-90](packages/axoview-lib/src/interaction/usePanHandlers.ts#L52-L90)) —
`TEXTBOX`, `LABEL`, `NODE.TRANSFORM`, `RECONNECT_ANCHOR` and `DRAG_ITEMS` all
land in the default. And `endPan` only calls it when the pan was a right-drag;
the middle-drag branch hardcodes `setMode({type:'CURSOR'})`
([usePanHandlers.ts:115-125](packages/axoview-lib/src/interaction/usePanHandlers.ts#L115-L125)),
so the restore machinery is skipped entirely. Panning is navigation, not a tool
change — neither path should alter the armed tool.

**Workaround:** re-press the tool hotkey after panning.

**Status:** Open. Fix direction: call `restorePreviousMode()` from both pan
methods, and replace the switch with "save the whole previous mode object and
put it back", falling back to a clean reconstruction only for modes carrying
in-flight state (CONNECTOR's abort is the one case that genuinely needs
special handling). Repro:
[`ctx-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I5-pan-menu/ctx-01-15.explore.spec.ts).

## The group resize box is drawn around items on a hidden layer

**Found by:** exploratory campaign CTX-06

**Symptom:** with a selection that includes an item on a hidden layer, the
transform chrome renders anyway — four resize handles around a bounding box that
includes an entity the user cannot see. Dragging them resizes the invisible item
along with the visible ones.

**Root cause:** `TransformControlsManager` gates its handles on `lockedIds` only
and never consults `visibleIds`, unlike every gesture path (`processMouseUpdate`
builds `isItemInteractable` from both). Reaching the state is easy: RED-15 shows
a live selection is not re-validated when a layer is hidden.

**Workaround:** clear the selection after hiding a layer.

**Status:** Open. Fix direction: use the same `isItemInteractable` predicate the
gesture paths use — hidden-layer members should be excluded from the chrome's
bounds and from the resize, or the chrome suppressed entirely. Fixing RED-15
(re-validate the selection on a layer-state change) removes the common route in.
Repro:
[`ctx-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I5-pan-menu/ctx-01-15.explore.spec.ts).

## In view-only mode a left-click on a content-bearing item opens nothing

**Found by:** exploratory campaign CTX-15

**Symptom:** in `EXPLORABLE_READONLY` — the mode the `/display/<diagramId>`
viewer route runs in — clicking a node that carries a description opens no ADR
0012 info popover and selects nothing: `itemControls` stays null and the mode
stays `PAN`. The popover state itself works (`view-mode-info-popover.spec.ts`
drives `setItemControls` directly and the popover renders), so the content is
reachable in principle — it is the click that never gets there. For a viewer,
that is the only way in: there is no properties dock in read-only mode.

**Root cause:** `EXPLORABLE_READONLY` boots into `PAN`
([utils/common.ts getStartingMode](packages/axoview-lib/src/utils/common.ts#L72-L84)),
and the pan path owns the left button, so the click never reaches the selection
logic in `Cursor`. The area's own scope statement lists "Pan mode incl.
EXPLORABLE_READONLY left-click-opens-popover" as intended behaviour, and
`view-mode-info-popover.spec.ts` says in its header that "the click→select
wiring is existing, separately-covered behavior" — but no test drives the click,
and it does not work.

**Workaround:** none for a viewer.

**Status:** Open. Fix direction: in `Pan.mousedown`/`mouseup`, when
`editorMode === 'EXPLORABLE_READONLY'` and the release was a stationary click on
a content-bearing item, set `itemControls` for it (the popover reads exactly
that state) before falling through to the pan logic. Note this is the mirror of
PTR-01/02/03: read-only exposes the mutating keyboard paths it should not, and
withholds the one read-only interaction it should offer. Repro:
[`ctx-01-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/I5-pan-menu/ctx-01-15.explore.spec.ts).

## The project bounding box mis-frames the diagram: text boxes extend the wrong way, labels are not counted

**Found by:** exploratory campaign PROJ-01 / PROJ-02 / PROJ-04 (item 4: RND-09)

**Symptom:** `getProjectBounds` is the frame both **fit-to-view**
(`canvas-zoom-fit` -> `useDiagramUtils.fitToView` -> `getFitToViewParams`) and the
**Export Image** dialog (`getUnprojectedBounds`) use to decide what the diagram
occupies. It is wrong in three independent ways:

1. **Text boxes extend in the wrong Y direction.** The bounds add
   `tile + { x: size.width, y: size.height }`, but a text box grows to
   *decreasing* tile y (`getTextBoxEndTile` returns `tile.y - (size.height - 1)`;
   positive tile y is UP on screen in both projections). A 6-row box anchored at
   `tile.y = 0` yields bounds `lowY = -3`, `highY = +9`: its own five lower rows
   are **outside** the frame and six empty tiles **above** it are inside. The
   miss grows one-for-one with the row count, so a tall notes box is the worst
   case — fit-to-view leaves it clipped at the bottom with a band of empty
   canvas on top, and the exported PNG crops the same way.
2. **Floating labels are not enumerated at all.** `getProjectBounds` walks
   `items`, `connectors`, `rectangles` and `textBoxes`; `view.labels` (ADR 0031)
   is absent. A view holding one item at (0,0) and one Label at (40,40) returns
   bounds of exactly (-3,-3)..(3,3) — the Label is 37 tiles outside. Labels are
   free-floating and routinely placed away from the nodes, so a legend or a
   callout chip simply falls off the fit and out of the export.
3. **A pixel extent gets the tile-count `+1`.** `getUnprojectedBounds` projects
   the four corner tiles to **pixels** and then sizes them with
   `getBoundingBoxSize`, whose `highX - lowX + 1` is the *inclusive tile count*
   convention. The reported width and height are each exactly 1 px too large,
   and that leaks into the fit-to-view zoom. Cosmetic on its own; it is listed
   here because it is the same unit-mix `getFitToViewParams` already fixed for
   the *centre* ("getBoundingBoxSize adds +1 (inclusive tile COUNT)") and left
   in place for the *size*.

4. **Node name chips are not counted either** (added by exploratory campaign
   RND-09). `getProjectBounds` takes each item's `tile` and nothing else, but a
   node's name chip is drawn up to +280 canvas px above it — `clampLabelOffset`
   caps the drag range at `LABEL_OFFSET_MAX = 280`, and the 3-tile
   `PROJECT_BOUNDING_BOX_PADDING` is worth only ~245 px of screen Y. Measured on
   a height-limited fit: the bounds are byte-identical with and without a
   raised label, the node lands inside the viewport and its chip anchor lands at
   NEGATIVE screen y. Same shape as (2) — the function enumerates entities, not
   the geometry they actually occupy.

**Root cause:** `getProjectBounds` / `getUnprojectedBounds` in
[`utils/renderer.ts`](packages/axoview-lib/src/utils/renderer.ts) are the only
projection consumers with **zero tests** — there is no coverage of
`getProjectBounds`, `getUnprojectedBounds` or `getFitToViewParams` anywhere in the
repo, and `viewport.spec.ts` asserts only that fit-to-view changes the zoom to
"a different value", never that the result actually frames the diagram. The
text-box term predates `getTextBoxEndTile` and was never reconciled with it;
`getVisualBounds` (currently unused) carries a verbatim copy of the same sign
error, so a future consumer inherits it.

**Workaround:** zoom and pan manually instead of using fit-to-view; for export,
add a spacer element below a tall text box (or beyond a stray Label) so the
bounds stretch to cover the real content.

**Status:** Open. Fix direction: replace the text-box term with
`getTextBoxEndTile(textBox, getTextBoxDimensions(textBox))` (which already
handles both orientations), add a `view.labels` term, and size
`getUnprojectedBounds` with a plain `high - low` rather than `getBoundingBoxSize`.
Note the ADR-0023 `offset` is also not composed into these bounds; that one is
currently harmless because `PROJECT_BOUNDING_BOX_PADDING` is 3 tiles per side —
worth folding into the same fix so a padding change cannot re-open it
(campaign PROJ-03, verdict FALSIFIED-but-latent). Repro:
[`bounds-proj-01-02-03-04.explore.test.ts`](packages/axoview-lib/src/__explore__/R1/bounds-proj-01-02-03-04.explore.test.ts).

## A 2D Y-orientation text box draws one tile thick but claims its full row count

**Found by:** exploratory campaign PROJ-05

**Symptom:** Rotate a text box to the Y (vertical) orientation, switch the
canvas to 2D, and give it more than one line. The text is drawn inside a wrapper
that is **always exactly one tile thick**, while its selection box and its hit
area claim `size.height` tiles of thickness. Two consequences: rows 2..N are
painted outside their own wrapper, and a click up to `size.height - 1` tiles to
the side of the visible text still selects the box (empty canvas beside it is not
clickable).

**Root cause:** [`TextBox.tsx`](packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBox.tsx#L196-L212)
takes a dedicated `isTwoDY` branch that passes `from = textBox.tile` — dropping
`size.height` — because `useIsoProjection`'s 2D-Y case renders a wide-and-short
rectangle and then rotates it 90 degrees. The rotation swaps the extents, so the
drawn thickness is fixed at `UNPROJECTED_TILE_SIZE`. Hit-testing and the
transform controls take the other route,
[`getTextBoxEndTile`](packages/axoview-lib/src/utils/isoMath.ts), whose Y branch
returns `tile + { x: rows, y: -size.width }` — `rows = size.height - 1` tiles of
thickness. The two derivations agree only for a single-row box, which is the case
every existing test uses. The X orientation is unaffected: the branch is Y-only.

**Workaround:** keep Y-orientation text boxes to one line in 2D, or use the X
orientation (the iso Y path has its own `originOverride` correction and is
consistent).

**Status:** Open. Fix direction: give the 2D-Y branch the row count too —
`from = tile`, `to = tile + { x: size.width, y: 0 }` is only correct when
`size.height === 1`; the rotated wrapper needs `pxSize.height = size.height` tiles
so the post-rotation thickness matches `getTextBoxEndTile`. Repro:
[`geometry-proj-05-10-11-12.explore.test.tsx`](packages/axoview-lib/src/__explore__/R1/geometry-proj-05-10-11-12.explore.test.tsx).

## Clicking two stacked nodes selects the one drawn underneath (item hit-testing ignores z-order)

**Found by:** exploratory campaign PROJ-10

**Symptom:** With two items whose drawn footprints overlap — reachable by turning
off collision (`collides: false`, ADR 0023) so both sit on one tile, or by
nudging one off-grid onto its neighbour — a click selects whichever item happens
to be **last in the view's `items` array**, not the one painted on top. Raising
one item's z-index changes what you see and changes nothing about what you can
click; the lower item stays the only reachable one.

**Root cause:** `itemAtPoint` in
[`hitDetection.ts`](packages/axoview-lib/src/utils/hitDetection.ts) scans
`scene.items` backwards and returns the first footprint that contains the cursor
— pure array order, with no reference to `zIndex`, layer order or iso depth.
`NodesCanvas` paints through
`resolveRenderOrder(layerOrder, zIndex, -tile.x - tile.y)`, so the visually
topmost item is the one with the **highest** resolved order, which has no
relation to its array index. This is sibling drift inside a single function: the
RECTANGLE branch of the same `getItemAtTile` explicitly rebuilds the paint order
("Rectangles paint in the SAME order Rectangles.tsx uses ... A click on
overlapping rectangles must select that visually-topmost one") before scanning;
the ITEM branch never got the same treatment.

**Workaround:** move one of the overlapping items apart, select the intended one
from the Layers panel, or re-order the items so the one you want is last.

**Status:** Open. Fix direction: sort the candidate items by
`resolveRenderOrder` before the backwards scan, exactly as the rectangle branch
does — the layer order is already available to the hit-test callers. Repro:
[`geometry-proj-05-10-11-12.explore.test.tsx`](packages/axoview-lib/src/__explore__/R1/geometry-proj-05-10-11-12.explore.test.tsx).

## Selecting a connector attached to an off-grid node makes the wire jump at that node

**Found by:** exploratory campaign PROJ-12

**Symptom:** Drag a node off-grid (global snap off, or per-item Unsnap) so it
carries an ADR-0023 `offset`. A connector anchored to it is drawn by the WebGL
bulk path ending at the node's **bare tile**. Click the connector: it is promoted
to the DOM/SVG renderer, which ends it at the node's **rendered** position. The
endpoint moves by the full node offset — up to half a tile, 41.6 px for a
(37, -19) residual — every time the connector is selected or deselected. A lasso
selection promotes it too, so the jump also fires on marquee select.

**Root cause:** ADR 0023 addendum D requires both connector renderers to resolve
an endpoint at an offset node to the RENDERED endpoint. The helper that does it,
[`connectorEndpointVertexDelta`](packages/axoview-lib/src/utils/resolvePlacement.ts),
is correct and mode-aware — but it has exactly one caller,
[`Connector.tsx`](packages/axoview-lib/src/components/SceneLayers/Connectors/Connector.tsx#L37-L51)
(the sparse DOM path).
[`ConnectorsCanvas.tsx`](packages/axoview-lib/src/components/SceneLayers/Connectors/ConnectorsCanvas.tsx)
maps every path tile straight through `getTilePosition(connectorPathTileToGlobal(...))`
and never reads a view item's `offset` at all. `Renderer.connectorHybridIds`
switches a connector between the two renderers on selection, which is what makes
the divergence visible as a jump. The renderedGeometry invariant suite asserts
WebGL/DOM parity for *rectangle* vertices; connector endpoints at offset nodes
were never covered.

**Workaround:** keep nodes with connectors snapped to the grid.

**Status:** Open. Fix direction: apply the same endpoint delta in
`ConnectorsCanvas`'s vertex build (it already has the projection and the view
items in scope), and extend `renderedGeometry.invariant.test.tsx` with a
connector-endpoint parity case so the two paths cannot drift again. Repro:
[`geometry-proj-05-10-11-12.explore.test.tsx`](packages/axoview-lib/src/__explore__/R1/geometry-proj-05-10-11-12.explore.test.tsx).

## The chip atlas has no eviction — renaming nodes leaks slots until labels stop drawing

**Found by:** exploratory campaign GL-02 / GL-05 / GL-12

**Symptom:** Node name chips are cached in the WebGL sprite batch's texture atlas
under a **content key** that interpolates the node's name and every style token
(`node|fontSize|bold|italic|strike|under|textColor|bg|border|radius|padX|padY|name`).
Every rename, every colour or font change, every theme switch mints a NEW key,
packs a NEW slot, and **leaks the old one** — the atlas has no LRU, no free list
and no per-key eviction, only a total reset. In a long editing session the atlas
fills with orphaned chips. When it finally overflows, the affected node names
simply stop drawing: `packSlot` returns null, the chip is skipped for that
build, and the compaction that would recover the space only runs inside the NEXT
`beginInstances()` — which only a geometry change triggers. If the user's next
action is a pan or a zoom (neither rebuilds geometry), the missing names persist
on screen indefinitely.

Nothing surfaces any of this. The `SpriteBatch` interface has no overflow flag,
callback or counter, so the layer cannot know a chip is missing and cannot
schedule the rebuild that would fix it.

**Root cause:** [`glSpriteBatch.ts`](packages/axoview-lib/src/webgl/glSpriteBatch.ts)'s
shelf packer only ever moves forward; `resetAtlas()` (drop the whole cache,
rewind the cursor past the reserved dot/white region) is the sole way space is
reclaimed, and it is armed only by `atlasFull` and consumed only by the next
`beginInstances()`. Measured on the real packer through a recording WebGL2 stub:
six version bumps of ONE logical chip occupy six distinct slots, and a single
chip restyled repeatedly fills a 256 atlas by itself.

**Measured in the browser, from ordinary product state (GPU-14).** The overflow
needs neither a rename-churned session nor a small-cap device — plain floating
Labels reach it. `LabelsCanvas` asks `createSpriteBatch(canvas)` for the
**default 4096** atlas where `NodesCanvas` asks for 8192 (4096 at
`devicePixelRatio >= 2`), so the floating-Label layer overflows roughly four
times sooner than the node layer. With 120 simultaneously visible Labels the
layer drew 120/120 chips; at **300** it drew **276** — 24 chips silently absent
from the frame — while `data-build-count` advanced exactly as it does for a
complete build, and no further rebuild came to trigger the compaction. Injecting
the 300 in ONE step on a fresh page (so no earlier generation had leaked into the
atlas) gives the same 276: the threshold is the chips themselves, not
fragmentation. Any view holding a few hundred visible Label chips — a zoomed-out
diagram, a fit-to-view — is in that band.

**The export readiness gate cannot see it either (GPU-14).** With 276 of 300 chips
drawn, the node layer still published `data-all-icons-drawn="true"` — that flag
tracks icon *bitmap* availability only, and there is no equivalent signal for a
chip that failed to pack. So `waitForIconsDrawn` reports "ready" and the image
export captures the incomplete frame. The only trace anywhere is that
`data-draw-count` is lower than the entity count, which no consumer compares.

**Aggravating factor — `MAX_TEXTURE_SIZE`.** The atlas is
`Math.min(atlasSize, MAX_TEXTURE_SIZE)`. `NodesCanvas` asks for 8192 (4096 when
`devicePixelRatio >= 2`), but a device that caps textures at 2048 silently gets
2048 — measured to hold **less than a third** of the 85px chips a 4096 atlas
holds — with no diagnostic anywhere. On such a device the overflow is reachable
at an unremarkable diagram size.

**Workaround:** any edit that changes geometry (move a node, place or delete
anything) triggers the compaction and the missing names come back.

**Status:** Open. Fix direction: (a) give `putCanvas` a free-list or a
generation-tagged LRU so a superseded key's slot is reclaimed immediately, or at
minimum evict the previous slot when a key's content changes; (b) expose an
overflow signal on `SpriteBatch` (a counter or an `onAtlasFull` callback) so the
layer can schedule one follow-up rebuild instead of waiting for a geometry
change; (c) log once when `MAX_TEXTURE_SIZE` clamps the requested atlas, so a
small-cap device is diagnosable. Repro:
[`atlas-gl-01-02-03-04-05.explore.test.ts`](packages/axoview-lib/src/__explore__/R2/atlas-gl-01-02-03-04-05.explore.test.ts)
(the probe drives the real `createSpriteBatch` through a recording WebGL2 stub —
that harness is reusable for any future `glSpriteBatch` work).

## A GPU layer that fails to build renders nothing, silently

**Found by:** exploratory campaign GL-07

**Symptom:** `isWebGL2Supported()` is the gate that decides whether the app shows
the diagram or the `WebGLUnsupportedScreen`. It probes only that a `webgl2`
context can be created and exposes `createVertexArray` — it does **not** compile
the shaders or allocate the atlas. A browser or GPU that passes the probe but
fails the real `createSpriteBatch` (shader compile, program link, atlas
allocation, or context exhaustion) therefore gets past the gate, and the layer
then does this:

    console.warn('[NodesCanvas] WebGL2 sprite batch unavailable — node layer will not render');
    return;

The user sees an empty canvas. No message, no fallback, no retry — and because
`isWebGL2Supported` is memoised for the tab's life, nothing re-evaluates. A
diagram that is fine on the next reload looks like data loss.

**Root cause:** the gate and the substrate disagree about what "supported"
means, and each of the four bulk layers handles the mismatch on its own with a
`console.warn` and an early return. Verified by driving the real
`createSpriteBatch` with a context that satisfies exactly the gate's checks and
fails shader compilation — it returns `null`, exactly as it would in the field.

**Workaround:** reload the tab; a fresh context usually builds.

**Status:** Open. Fix direction: make the gate agree with the substrate — have
`isWebGL2Supported` (or a one-shot sibling) actually attempt a minimal
`createSpriteBatch` and cache that result, so a failure routes to the existing
`WebGLUnsupportedScreen` instead of a blank canvas; and give the per-layer
failure path a user-visible notification plus one retry rather than a console
line. Repro:
[`atlas-gl-01-02-03-04-05.explore.test.ts`](packages/axoview-lib/src/__explore__/R2/atlas-gl-01-02-03-04-05.explore.test.ts).

## A floating Label is visible but inert below zoom 0.4

**Found by:** exploratory campaign GPU-04

**Symptom:** Zoom out past 40% and every floating Label is still drawn on the
canvas but stops responding entirely — it cannot be clicked, selected, dragged,
double-clicked to edit, or right-clicked for its context menu. The chip looks
exactly as interactive as it does at 100%. There is no cue that it has gone
dead, and the only way back is to zoom in.

Measured: at the default zoom (verified above 0.4) a committed Label paints on
`axoview-labels-canvas` and has at least one `[data-label-hit-id]` proxy in the
DOM. At `zoom = 0.3` the chip still paints and the proxy count is **0**.

**Root cause:** draw visibility and hit visibility are decided in two different
files against two different thresholds.
[`LabelsCanvas`](packages/axoview-lib/src/components/SceneLayers/Labels/LabelsCanvas.tsx)
paints Label chips with **no zoom gate at all**, while
[`LabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Labels/LabelHitLayer.tsx)
mounts its pixel-accurate hit proxies only when `zoom >= HIT_MIN_ZOOM` (0.4).
Everything below that is drawn-but-unhittable. The same split exists for node
name chips against `LABEL_LOD_ZOOM` (0.25) in `NodesCanvas`, so the three
thresholds (none / 0.25 / 0.4) do not line up anywhere, and the `readableLabels`
accessibility setting widens the gap rather than closing it: it forces chips to
draw further out while the hit layer stays absent below 0.4.

Measured for node names too (GPU-05): at `zoom = 0.15` with `readableLabels`
**off**, `NodesCanvas` reports `data-labels-drawn = 0` and there are no
`[data-axoview-id="canvas-label-hit"]` proxies — nothing visible, nothing to
grab, consistent. Turning the accessibility setting **on** at the same zoom
brings the chip back (`data-labels-drawn = 1`) while the proxy count stays at
**0**. So the setting whose purpose is to keep labels readable when zoomed out
is precisely the setting that manufactures inert ones.

**Workaround:** zoom to 40% or more before interacting with a Label.

**Status:** Open. Fix direction: make the hit layer's threshold follow the draw
threshold rather than lead it — either drop `HIT_MIN_ZOOM` to match the chip LOD
(and let the proxy boxes shrink with zoom), or gate the CHIP on the same value so
an inert Label is at least not drawn. The underlying rule is worth stating once
in the rendering guidelines: nothing may be painted at a zoom where it cannot be
hit. Repro:
[`gpu-04-06-07-08-13.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R3-gpu-layers/gpu-04-06-07-08-13.explore.spec.ts).

## One unreachable icon url disables the icon layer's readiness flag for the session

**Found by:** exploratory campaign GPU-01 / GPU-03

**Symptom:** Point one node's icon at a url that fails to load (a 404, a dead
CDN, an offline moment) and two things follow for the rest of the session:

1. That icon never draws — expected — but `NodesCanvas` also never republishes
   `data-all-icons-drawn="true"`. That attribute is the image-export readiness
   gate, so every image export from then on waits out its full icon budget
   (400 ms before the first capture, then a further 2 000 ms of polling that
   ends in giving up) instead of capturing as soon as the layer is ready.
2. The failure is permanent even after the server recovers. The url is never
   requested a second time, so the icon cannot come back without a full
   remount of the canvas — reopening the diagram, or reloading the page.

Measured on a blank diagram with one node: with a healthy icon the layer reaches
`data-all-icons-drawn="true"` in well under a second. Repointing the same icon at
a 404 url leaves the flag at `"false"` 8 s later (20× the export dialog's initial
budget) with the layer rebuilding normally. In the recovery probe the icon url
was requested exactly **once**; after the route started serving a valid PNG and
the layer was forced through three further geometry rebuilds (a projection switch
plus two `readableLabels` toggles), the request count stayed at 1 and the flag
stayed `"false"`.

**Root cause:**
[`NodesCanvas.getImage`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodesCanvas.tsx)
has no `onerror` path at all. It gates an icon on `img.decode()` (correctly — the
black-atlas-tile fix above), and the rejection path reads:

```ts
img.decode().then(markReady).catch(() => {
  if (img.complete && img.naturalWidth > 0) markReady();
  else img.onload = markReady;            // <- a load that already FAILED
});
```

For a failed load `complete` is `true` and `naturalWidth` is `0`, so the `else`
branch runs and installs an `onload` handler on an image that will never load
again: nothing can ever add the url to `decodedRef`, and `buildInstances` sets
`allIconsDrawn = false` on every subsequent build. Separately, the `Image` is
inserted into `iconCacheRef` *before* the decode resolves and is never removed on
failure, so every later build takes the `existing` branch and returns `null`
without re-requesting — a transient failure is cached as a permanent one.

**Workaround:** reload the diagram once the icon url is reachable again. Exports
still succeed (the gate is bounded, not a hang); they are just slower and omit
the icon.

**Status:** Open. Fix direction: give the decode fallback a real failure branch —
`img.onerror` (and the already-failed case `complete && naturalWidth === 0`)
should drop the url from `iconCacheRef` so the next build retries, and mark the
icon *resolved-as-unavailable* so the readiness flag can still flip (draw the
tombstone icon rather than nothing, which is what an unknown icon *ref* already
does). Both halves are ~10 lines inside `getImage`. Repro:
[`gpu-01-03-icons.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R3-gpu-layers/gpu-01-03-icons.explore.spec.ts).

## A long node name is cut mid-glyph on the canvas and wrapped in the DOM

**Found by:** exploratory campaign GPU-09

**Symptom:** A node whose name is too long for the 250 px label chip renders two
different ways depending on whether it is selected. Unselected (the WebGL bulk
path) the name is drawn as ONE line that runs off the edge of its chip texture and
is cut mid-glyph — no ellipsis, no fade, no cue that anything is missing. Select
the node and the DOM label takes over: the same name wraps over several lines
inside the chip, clipped at a line boundary with the expand affordance available.
Clicking a node therefore changes both the shape of its label and how much of the
name you can read.

Measured with a 68-character name at zoom 0.65: the full name needs 612 px on one
line against a 226 px chip interior, so roughly a third of it fits. On the bulk
canvas the chip is clamped to 250 scene px and text pixels reach right into the
last columns before the border (a control chip with a short name leaves that band
blank). The DOM label for the same node holds all 68 characters, lays them out
over 3 lines and shows 2 of them.

**Root cause:**
[`rasterizeNodeChip`](packages/axoview-lib/src/webgl/itemRaster.ts) calls
`ctx.fillText(name, textX, …)` with **no `maxWidth` argument and no clip path**,
onto a scratch canvas sized from the already-clamped `chipW`
(`measureNodeLabel` caps the chip at `LABEL_CHIP_MAX_W` = 250). Anything past the
edge is discarded by the canvas bounds. The DOM path
([`Node.tsx`](packages/axoview-lib/src/components/SceneLayers/Nodes/Node/Node.tsx)'s
`LabelTitle`) instead sets `wordBreak: 'break-word'` / `overflowWrap: 'anywhere'`
inside the same `maxWidth`, so it wraps. Two renderers, one entity, two
truncation rules — the R-a "one geometry, two derivations" thread again, this time
for text layout.

**Workaround:** keep node names short, or select the node to read the rest.

**Status:** Open. Fix direction: make the bulk chip agree with the DOM on *one*
rule. Cheapest is `fillText(name, x, y, innerW)` (squeezes to fit — ugly) or a
measured ellipsis (`…`) in `rasterizeNodeChip`; the faithful option is to wrap the
bulk chip the way the DOM does, which means `measureNodeLabel` returning a line
list and `chipH` growing per line. Either way the two paths should share the
line-breaking decision rather than each inventing one. Repro:
[`gpu-05-09-12.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R3-gpu-layers/gpu-05-09-12.explore.spec.ts).

## A grouping rectangle changes shape from rounded to square when you grab it

**Found by:** exploratory campaign GPU-15

**Symptom:** Grouping rectangles are drawn with rounded corners while idle and
with **square** corners for the duration of a drag, snapping back on release. The
rectangle visibly changes shape at the moment it is grabbed and again when it is
dropped.

Measured in 2D mode on a 4×4-tile rectangle: mid-drag the DOM rect publishes
`rx="21.5"` (the `cornerRadius` 22 less half the stroke), while the bulk WebGL
layer paints all four corners of the rectangle's bounding box — a square
footprint.

**Root cause:** the two rectangle renderers disagree, and the bulk one says so in
its own header:
[`RectanglesCanvas`](packages/axoview-lib/src/components/SceneLayers/Rectangles/RectanglesCanvas.tsx)
— "Only corner radius (rounded rects) is still approximated (sharp corners) on
the bulk". It emits four analytic-AA edge quads plus a round *join* disc per
corner, which rounds the stroke join at a radius of `strokeW/2`, not the
rectangle's 22 px corner radius. The DOM
[`Rectangle`](packages/axoview-lib/src/components/SceneLayers/Rectangles/Rectangle.tsx)
passes `cornerRadius={22}` to `IsoTileArea`, which puts it on the SVG `rect`'s
`rx`. Because the Renderer keeps only the *dragged* rectangle in the DOM, the two
shapes are never on screen at the same time — which is exactly why the mismatch
survived: nothing compares them.

**Workaround:** none needed; cosmetic.

**Status:** Open, cosmetic. Known and deliberate as an approximation, but the
user-visible consequence (a shape change on grab) was never recorded. Fix
direction: either round the bulk corners for real (an analytic rounded-rect
`shapeMode` in the sprite shader — the SDF is cheap and the layer already has
analytic line and disc modes), or drop the DOM rect's `cornerRadius` to 0 so both
paths draw the square the bulk already draws. Repro:
[`gpu-14-15.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R3-gpu-layers/gpu-14-15.explore.spec.ts).

## Fit-to-view can zoom below the floor every other zoom path enforces

**Found by:** exploratory campaign RND-01

**Symptom:** Click `canvas-zoom-fit` on a large diagram and the viewport lands
at a zoom the app will not otherwise let you reach. On a 1280x720 viewport a
diagram roughly 85 tiles across already fits below `MIN_ZOOM`; at 100 tiles the
fit zoom is **0.083** against a documented floor of **0.1**. The state is a
one-way trip on touch: the pinch handler clamps to `[MIN_ZOOM, MAX_ZOOM]`, so
the first two-finger contact after the fit snaps the diagram bigger and the
fitted framing cannot be recovered by pinching. The zoom readout also shows a
percentage the +/- controls will never produce.

**Root cause:**
[`getFitToViewParams`](packages/axoview-lib/src/utils/renderer.ts) clamps with
`clamp(..., 0, MAX_ZOOM)` — the UPPER bound only. Every other zoom writer
enforces both: `incrementZoom`/`decrementZoom` (buttons + wheel) go through
`clamp(z +/- ZOOM_INCREMENT, MIN_ZOOM, MAX_ZOOM)`, and the pinch path in
`useInteractionManager` does `Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, ...))`.
The util is the shared engine behind BOTH fit paths — the `canvas-zoom-fit`
button (`useDiagramUtils.fitToView`) and the deferred open-time fit the
Renderer applies in a `useLayoutEffect` — so a diagram whose model carries
`fitToView` opens below the floor too, before the user touches anything.
`getFitToViewParams` has no production test at all; `viewport.spec.ts` asserts
only that a fit CHANGES the zoom.

**Workaround:** press the zoom-out or zoom-in button once after fitting — that
re-clamps into range (and loses the fitted framing).

**Status:** Open. Fix direction: clamp to `[MIN_ZOOM, MAX_ZOOM]` in
`getFitToViewParams`. That leaves a real product question the clamp alone does
not answer — a diagram too large to fit at `MIN_ZOOM` will be framed with
content off-screen — so the fix should either accept that (and say so) or make
`MIN_ZOOM` content-dependent for the fit path specifically. Repro:
[`fit-rnd-01-09-10.explore.test.ts`](packages/axoview-lib/src/__explore__/R4/fit-rnd-01-09-10.explore.test.ts).

## Hiding a layer leaves its connectors' label chips on the canvas

**Found by:** exploratory campaign RND-02

**Symptom:** Hide a layer that holds a labelled connector. The connector's body
disappears — correctly, on both the WebGL bulk and the DOM hybrid — but its
label chip stays painted on the canvas, floating over empty space where the wire
used to be. It is still selectable, still draggable along the (now invisible)
path, and still double-click-editable. Showing the layer again puts the body
back under it.

Measured: with the layer visible, `axoview-connectors-canvas` paints and the
chip is in the DOM. With the same layer hidden, the canvas paints **0** pixels
and the chip count is **unchanged**.

**Root cause:**
[`ConnectorLabels`](packages/axoview-lib/src/components/SceneLayers/ConnectorLabels/ConnectorLabels.tsx)
and its child `ConnectorLabel` are the only scene layers that never import
`useLayerContext`. Every sibling the Renderer feeds does gate on it — `Nodes`,
`Connectors`, `Rectangles`, `TextBoxes`, `NodeLabelHitLayer`, and all four
bulk canvases each filter with the same
`layers.length === 0 || visibleIds.has(id)` idiom. `ConnectorLabels` filters
only on whether the connector HAS a label (plus the zoom LOD), so the Renderer's
`visibleConnectors` — which is a viewport cull, not a visibility gate — is the
only thing standing between a hidden layer and a painted chip. This is the same
class as PTR-11 / CONN-15 / CTX-06: layer state is honoured by the gesture paths
and by whichever consumers happened to remember it.

**Workaround:** none from the UI — delete the label or move the connector off
the layer.

**Status:** Open. Fix direction: add the standard
`layers.length === 0 || visibleIds.has(connector.id)` filter to
`ConnectorLabels`. Worth pairing with a shared helper (or a single
`useVisibleEntities` hook) so the next layer added to the Renderer cannot skip
the gate by omission. Repro:
[`rnd-02-07-overlay-gates.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-02-07-overlay-gates.explore.spec.ts).

## A link inside a text box cannot be clicked

**Found by:** exploratory campaign RND-07

**Symptom:** Put a link in a text box — either an internal diagram link (the
`#diagram:` href the Ctrl+K link card writes) or an ordinary external one — and
it is inert everywhere outside the edit session. Plain click, Ctrl/Cmd+click,
edit mode, view mode: nothing happens, no navigation, no cursor change. The link
is styled as a link and behaves as plain text. It works only while the box's
inline editor is open, which is exactly when the user is editing rather than
following it.

Measured: `document.elementFromPoint` at the centre of a resting text box's
`<a href="#diagram:...">` returns the element with
`data-axoview-id="canvas-interactions"`, not the anchor; a click there fires
zero `axoview-navigate-to-diagram` events, and so does the documented
Ctrl+click.

**Root cause:** mount order in
[`Renderer.tsx`](packages/axoview-lib/src/components/Renderer/Renderer.tsx).
The resting `<TextBoxes>` SceneLayer is mounted BEFORE the full-viewport
`canvas-interactions` box, so the interactions box paints — and hit-tests —
above it. `TextBox.onRestingClick`, added by the ADR 0034 addendum specifically
to route `#diagram:` links ("in view/explore modes a click navigates ... in EDIT
mode Ctrl/Cmd+click navigates"), can therefore never receive a click; the
handler is unreachable code. The Renderer already knows about this hazard — the
INLINE-EDITED text box is promoted into a second SceneLayer mounted after the
interactions box for exactly this reason ("below it the box ate every press") —
but the promotion covers the editing box only.

**Workaround:** open the box for editing and use the link chip in the inline
editor, or reach the target diagram from the file explorer.

**Status:** Open. Fix direction: either give the resting text-box layer a
targeted hit path above the interactions box (mount a link-only proxy the way
`NodeLabelHitLayer` proxies node names, which is the established pattern for
"canvas-drawn thing that needs a DOM gesture"), or route link activation through
the interaction pipeline — resolve an `<a>` under the pointer in the click
handler that already owns the press. A test asserting a link is followable from
a resting box belongs with it; the whole ADR 0034 link feature currently has no
end-to-end coverage of the resting state. Repro:
[`rnd-02-07-overlay-gates.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-02-07-overlay-gates.explore.spec.ts).

## Selecting an element restacks it above the rest of the diagram

**Found by:** exploratory campaign RND-13 / RND-15

**Symptom:** Click a node that is drawn behind another node (or behind a
floating Label) and it jumps in front for as long as it stays selected; click
away and it drops back. The same happens the moment a node or rectangle is
grabbed for a drag. Nothing about the diagram changed — no z-order command was
issued, the model is untouched — but the picture visibly restacks on selection,
which reads as an accidental "bring to front" and makes it impossible to inspect
an occluded element in place.

Measured with `document.elementsFromPoint` (paint order, asked of the browser,
with a control pair whose order is fixed by mount order): at rest the stack is
rectangles canvas < nodes canvas < labels canvas. Selecting a node puts its DOM
overlay copy ABOVE both the nodes canvas and the labels canvas — so it outranks
every canvas-drawn node whatever its `zIndex` or layer order, and it inverts
ADR 0031's "a floating Label paints ABOVE nodes".

**Root cause:** the hybrid promotion in
[`Renderer.tsx`](packages/axoview-lib/src/components/Renderer/Renderer.tsx)
moves the selected / dragged / label-dragged / icon-resized node out of the
`NodesCanvas` bulk and into a DOM `<Nodes>` overlay — but that overlay is a
separate `<SceneLayer>` mounted much later in the Renderer's child list, and all
of them share one stacking context at `z-index: 0`, so DOM order decides. The
promotion is correct about WHICH renderer draws the node and silent about WHERE
in the stack it lands. The dragged-rectangle promotion has the same shape
(`<Rectangles>` is mounted after `RectanglesCanvas`). This is the DOM-versus-bulk
face of the cross-layer ordering already recorded as the GPU-13 product question:
there, per-element `zIndex` cannot cross an entity type; here, promotion silently
crosses every type at once.

**Workaround:** none — deselect to see the true stacking.

**Status:** Open. Fix direction: give the promoted overlay the same stacking
position its bulk canvas has rather than a later one — e.g. mount the DOM
`<Nodes>` overlay immediately after `NodesCanvas` (before `LabelsCanvas`) and
set the SceneLayer `order` from the promoted node's resolved render order, so a
selected node keeps its place among its peers. Note the constraint that put the
overlay where it is: the F2 inline-rename and label-drag affordances need to sit
ABOVE the `canvas-interactions` box, so the fix has to separate "where the node
paints" from "where its interactive chrome lives" — the same split
`NodeLabelHitLayer` already makes. Repro:
[`rnd-05-13-14-15-promotion.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-05-13-14-15-promotion.explore.spec.ts).

## Below the label LOD zoom the selected node still shows its name

**Found by:** exploratory campaign RND-05

**Symptom:** Zoom out past 25% and every node name disappears — by design, that
is the label LOD band. Select any node and its name comes back, alone: one
labelled node on an otherwise nameless diagram, at a zoom where the chip is
declared unreadable. The chip also disappears again the instant you deselect, so
it reads as a rendering glitch rather than a selection affordance.

Measured at `zoom = 0.2` with `readableLabels` off: `NodesCanvas` reports
`data-labels-drawn = 0` (the bulk drew no chips) while the selected node's DOM
name chip is present in the renderer subtree.

**Root cause:** the LOD band lives in the bulk renderer only.
[`NodesCanvas`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodesCanvas.tsx)
gates chips on `readableLabels || zoom >= LABEL_LOD_ZOOM`, but the node lifted
into the DOM overlay by the Renderer's hybrid promotion is drawn by
`<Node>`/`Label`, which has no zoom gate at all. Promotion therefore changes
what a node LOOKS like, not just which renderer draws it — the same class as the
restacking recorded under RND-13/RND-15, and a third threshold alongside the
none/0.25/0.4 set already documented under GPU-04/GPU-05 ("nothing may be painted
at a zoom where it cannot be hit" — here, nothing should be painted at a zoom
where its siblings are not).

**Workaround:** none needed to keep working; zoom past 25% for consistent labels.

**Status:** Open. Fix direction: apply the same
`readableLabels || zoom >= LABEL_LOD_ZOOM` gate to the DOM `<Node>` label, or
hoist the decision into a shared `useLabelLod()` so bulk and overlay cannot
disagree. Worth deciding once, with GPU-04/GPU-05, what the whole label-threshold
ladder should be. Repro:
[`rnd-05-13-14-15-promotion.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-05-13-14-15-promotion.explore.spec.ts).

## Fit-to-view frames the diagram into the whole window, docks included

**Found by:** exploratory campaign RND-06

**Symptom:** Click `canvas-zoom-fit` with the Elements panel open and the
leftmost part of the diagram lands *behind* the panel. Fit-to-view's whole
promise is "everything is now visible"; with either dock open it is not, and the
user has to pan after fitting — which is what they clicked fit to avoid. The
same applies to the right sidebar and, proportionally, to the bottom dock.

Measured on a 50-tile-wide diagram with the Elements panel open:
`document.elementFromPoint` at the leftmost node's post-fit screen position
returns `div[data-axoview-id="canvas-icon-grid-item"]` — an icon tile in the
panel — not the canvas.

**Root cause:** both fit paths measure the RENDERER CONTAINER, which is
`position: absolute; inset: 0` over the whole app area, and the docks are
siblings rendered *over* it rather than beside it (Axoview.tsx: "Canvas always
fills the full container — sidebars overlay on top"). The Renderer's deferred
open-time fit reads `containerRef.current.getBoundingClientRect()`;
`useDiagramUtils.fitToView` reads the store's `rendererSize`, which the same
ResizeObserver fills from the same element. Neither has any notion of an
occluded region, so `getFitToViewParams` centres the content in a viewport that
is partly covered. This is the same "the renderer rect spans the docks" fact
that already produced TCH-05 and CTX-01 on the hit-testing side.

**Workaround:** close the docks before fitting.

**Status:** Open. Fix direction: give fit-to-view a VISIBLE viewport rather than
the container rect — subtract the open docks' widths/heights (they are already
in uiState: `leftDock`/`rightSidebarOpen` and their fixed widths) and centre on
the resulting inset box. Note this is arguably a product call rather than a
defect — some tools fit to the full canvas and let panels overlap — so decide it
once and state it, ideally alongside RND-01 (the missing `MIN_ZOOM` clamp on the
same function). Repro:
[`rnd-03-04-06-12-culling.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-03-04-06-12-culling.explore.spec.ts).

## An imported element whose id contains a comma has no drag preview

**Found by:** exploratory campaign RND-04

**Symptom:** Open a diagram whose element ids contain commas — nothing validates
the character set of an id, so any hand-written or externally generated JSON can
carry them (see *Nothing enforces id uniqueness…* and *Icon references and tile
coordinates are unvalidated*) — and dragging such a node shows no movement at
all. The pointer moves, the drag is genuinely live, but the node stays painted at
its old tile and jumps to the new one only on release. The same key is used for
group icon-resize (`resizingNodesKey`) and for the multi-selected-connector set
(`selectedConnectorKey`), so a lasso'd connector with a comma in its id also
loses its selection halo.

Measured: with a normal id, a live drag mounts exactly one `[data-drag-id]`
overlay and `NodesCanvas` reports `data-draw-count = 0` (the node was skipped on
the bulk because it is now in the DOM). With the id rewritten to
`imported,node`, the drag set is exactly `[ITEM:imported,node]` — the gesture is
real — yet the overlay count is **0** and `data-draw-count` is **1**.

**Root cause:**
[`Renderer.tsx`](packages/axoview-lib/src/components/Renderer/Renderer.tsx)
builds its hybrid-promotion keys as comma-joined id strings
(`mode.items.map(i => i.id).join(',')`) so that the zustand selectors return a
primitive and re-render only on drag start/end rather than per frame — then
splits them back on `','`. An id containing a comma comes out as two fragments
that match no element, so `hybridIds` is non-empty but `hybridNodes` resolves to
nothing: the node is neither added to the DOM overlay nor removed from the canvas
set, and the `--ff-drag` CSS-variable preview (which `DragItems` writes onto
`[data-drag-id]`) has nothing to write to. The commit path is unaffected, which
is why the node teleports into place at the end.

**Workaround:** none from the UI; re-save the diagram after any edit that
regenerates ids, or avoid commas in ids at import time.

**Status:** Open. Fix direction: the join/split is a performance trick, not a
data structure — use a delimiter that cannot appear in an id (`\u0000`), or keep
the primitive selector and derive the Set from `mode.items` directly with the key
only as a memo dependency. Both are one-line changes. The broader point belongs
with the id-validation cluster: ids are treated as opaque strings everywhere
except the handful of places that pack them into one. Repro:
[`rnd-03-04-06-12-culling.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R4-renderer/rnd-03-04-06-12-culling.explore.spec.ts).

## A locked layer still exposes its nodes' label drag and rename handles

**Found by:** exploratory campaign OVL-13

**Symptom:** Lock a layer and its nodes behave as locked — until you touch a
node's NAME. The name chip still shows a grab cursor, still drags vertically to
reposition the label, and still opens the inline rename on a double-click. The
drag writes a real `labelHeight` to the model, so a locked layer is editable
through the one affordance nobody thought to gate.

Measured: with the layer HIDDEN the proxy is correctly removed (0 elements).
With the same layer VISIBLE + LOCKED the proxy is still mounted with
`cursor: grab`, and a real mouse drag on it changes `labelHeight` in the store.

**Root cause:**
[`NodeLabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodeLabelHitLayer.tsx)
destructures only `{ visibleIds, layers }` from `useLayerContext` and filters on
`layers.length > 0 && !visibleIds.has(node.id)`. Its sibling
[`LabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Labels/LabelHitLayer.tsx)
— the floating-Label proxy, same job, same file shape — destructures
`{ visibleIds, lockedIds, layers }` and carries the extra line
`if (editable && lockedIds.has(label.id)) return null;`, with a comment
explaining that view-mode hover should still pass through. One layer got the
lock gate and the other did not. This is the layer-state cluster again
(PTR-11 arrow nudge, CONN-15 connector anchors, CTX-06 transform chrome): the
rendering guidelines' §15 rule — every component that exposes an interactive
affordance re-applies the layer filter itself — is stated but not enforced
anywhere.

**Workaround:** hide the layer instead of locking it, or move the nodes off it.

**Status:** Open. Fix direction: copy `LabelHitLayer`'s gate into
`NodeLabelHitLayer`. Worth doing structurally rather than by hand — a shared
`useInteractableIds()` (or one `isItemInteractable` the affordance layers all
call, the way `processMouseUpdate` already does for the gesture paths) would
close this class instead of its fourth instance. Repro:
[`ovl-01-12-13-15-hitproxy.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R5-overlays/ovl-01-12-13-15-hitproxy.explore.spec.ts).

## The node-name grab box does not follow the readable-labels counter-scale

**Found by:** exploratory campaign OVL-12

**Symptom:** Turn "keep labels readable" (Aa) on and zoom out. Node name chips
grow — that is the point of the setting — but the invisible box that lets you
grab, drag or double-click them does not, so most of the enlarged chip is dead.
The bigger the counter-scale, the worse the mismatch: at the `LABEL_MAX_COUNTER_SCALE`
of 4 only a quarter of the chip's area responds.

Measured at zoom 0.5: turning the toggle on takes `NodesCanvas`'
`data-label-scale` above 1.2 while the proxy div's width and height are
unchanged to within 0.1px.

**Root cause:** the same sibling pair as OVL-13, drifting the other way.
[`LabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Labels/LabelHitLayer.tsx)
imports `computeLabelCounterScale` and publishes it onto a
`display: contents` wrapper so its proxies scale with the chips;
[`NodeLabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodeLabelHitLayer.tsx)
never imports `labelScale` at all. Node names are therefore the only label kind
whose hit box and paint disagree under the accessibility setting — which is the
setting most likely to be on for a user who needs the bigger target.

**Workaround:** zoom in until the counter-scale returns to 1.

**Status:** Open. Fix direction: mirror `LabelHitLayer`'s wrapper in
`NodeLabelHitLayer`. This is the third threshold problem in the label ladder
(with GPU-04's 0.4 hit floor and GPU-05's `readableLabels` interaction) and they
should be decided together — the underlying rule being "the box that grabs a
label is the box that draws it, at every zoom and every setting". Repro:
[`ovl-01-12-13-15-hitproxy.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R5-overlays/ovl-01-12-13-15-hitproxy.explore.spec.ts).

## A node's name chip is inert in present mode while a floating Label's is not

**Found by:** exploratory campaign OVL-06

**Symptom:** In present / view mode (`EXPLORABLE_READONLY`) hovering a node's
NAME does nothing — no link card for a node with a `headerLink`, no notes
hover — and a click on it falls through to the empty tile the chip floats over.
Hovering a floating Label's chip in the same diagram works. The node BODY is
still clickable, so the inconsistency reads as "some labels are interactive and
some are not" rather than as a mode rule.

Measured: with a node and a Label on one view, both proxies are mounted in
`EDITABLE`; switching to `EXPLORABLE_READONLY` leaves the Label's proxy mounted
and takes the node-name proxy to 0.

**Root cause:**
[`LabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Labels/LabelHitLayer.tsx)
was deliberately extended for view mode — `const active = (editable || viewMode) && zoomActive`,
with hover-only proxies that publish `viewModeHoveredLabelId` so the
`ViewModeInfoPopover` can show a Label's notes ("labels being outside the tile
hit-test would otherwise make chips hover-inert" — its own comment).
[`NodeLabelHitLayer`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodeLabelHitLayer.tsx)
still gates on `s.editorMode === 'EDITABLE' && s.zoom >= HIT_MIN_ZOOM` and never
got the branch — even though it already implements the link-card hover
(`onPointerEnter` → `EDIT_ELEMENT_LINK_EVENT`) that view mode is the natural
audience for. Node names are outside the tile hit-test for exactly the same
reason Labels are, so the argument that justified the Label branch applies
unchanged.

**Workaround:** hover the node's icon instead of its name.

**Status:** Open. Fix direction: give `NodeLabelHitLayer` the same
`editable || viewMode` gate with press handlers suppressed in view mode, so a
linked node's name raises its card and a pan started over the chip still pans.
Repro:
[`ovl-04-05-06-08-surfaces.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R5-overlays/ovl-04-05-06-08-surfaces.explore.spec.ts).

## The "keep labels readable" scale ignores a node's own label font size

**Found by:** exploratory campaign OVL-02

**Symptom:** The Aa toggle is supposed to hold labels at a legible on-screen
size when you zoom out. It does that for a default-sized label and gets both
other cases wrong: a label whose font was ENLARGED in the style strip is scaled
up again even though it is already well above the floor (ending up several times
larger than everything around it), and a label whose font was SHRUNK stays below
the floor — the one label the setting exists for is the one it does not fix.

Measured at a zoom where the base font sits at half the readable floor: a node
with `labelFontSize` = 3x the base is already above the floor, yet receives the
full counter-scale and lands at exactly 3x the floor; a node at 1/3 the base
receives the SAME factor and is still below it.

**Root cause:** `computeLabelCounterScale` takes `baseFontPx` as a parameter and
is correct for whatever it is given — but both call sites pass the module
constant `LABEL_BASE_FONT_PX` instead of the node's `labelFontSize`:
[`ExpandableLabel`](packages/axoview-lib/src/components/Label/ExpandableLabel.tsx)
(the `--axoview-label-scale` CSS var) and
[`NodesCanvas`](packages/axoview-lib/src/components/SceneLayers/Nodes/NodesCanvas.tsx)
(the `u_counterScale` uniform). The GL side has a structural reason — the scale
is ONE uniform for the whole instanced draw, so it cannot be per-node without
moving the factor into the instance buffer — which is presumably why the DOM
side matches it. So the two renderers agree, and both are wrong in the same way:
ADR 0015 is written in terms of "the label's on-screen font size", and per-node
sizes (ADR 0032's style strip) arrived later without revisiting it.

**Workaround:** leave label font sizes at the default if you rely on the Aa
toggle.

**Status:** Open. Fix direction: pack the per-node counter-scale into the sprite
instance (it is a single float alongside the existing counter-scale flag) and
pass `node.labelFontSize ?? LABEL_BASE_FONT_PX` on both paths. If that is judged
too costly, the honest alternative is to document the setting as base-font-only
and disable it for restyled labels rather than mis-scaling them. Repro:
[`scale-nudge-ovl-02-14.explore.test.ts`](packages/axoview-lib/src/__explore__/R5/scale-nudge-ovl-02-14.explore.test.ts).

## Arrow keys cannot move a floating Label — they pan the canvas instead

**Found by:** exploratory campaign OVL-14

**Symptom:** Select a floating Label and press an arrow key. The Label does not
move; the whole canvas scrolls out from under it. Every other placed entity —
node, rectangle, text box — nudges one tile per press. Worse, select a node AND
a Label together and nudge: the node moves and the Label stays, so the group the
user built silently comes apart, one arrow press at a time, with no undo entry
covering the Label.

Measured: a selected ITEM produces one batch update and no scroll; a selected
TEXTBOX likewise; a selected LABEL produces zero updates, no drag transaction,
and a scroll of `-KEYBOARD_PAN_SPEED`. A mixed node+Label selection updates only
the node.

**Root cause:**
[`handleArrowKey`](packages/axoview-lib/src/interaction/handleArrowKey.ts)
enumerates `NUDGEABLE_TYPES = { ITEM, RECTANGLE, TEXTBOX }`. The comment beside
it explains the deliberate omissions — `CONNECTOR` and `CONNECTOR_ANCHOR`
"aren't directly tile-nudge-able here, so a connectors-only selection falls back
to pan" — and `LABEL` is simply absent from both the set and the reasoning:
floating Labels (ADR 0031) are tile-anchored and are shipped after the B6 nudge
work. The nudge helper's `NudgeScene` shape has no `labels` array either, so the
omission is consistent all the way down. Same shape as PTR-11 / SEL-01: a
keyboard consumer that enumerates entity types and misses the newest one.

**Workaround:** drag the Label with the mouse.

**Status:** Open. Fix direction: add `LABEL` to `NUDGEABLE_TYPES`, add
`labels` to `NudgeScene`, and route the update through the same
begin/commit bracket so one press stays one undo step — and, while there,
decide whether a mixed selection containing a non-nudgeable type should move
what it can (today) or nothing at all. Repro:
[`scale-nudge-ovl-02-14.explore.test.ts`](packages/axoview-lib/src/__explore__/R5/scale-nudge-ovl-02-14.explore.test.ts).

## The selection outline has no icon-load failure path and re-fetches dead urls

**Found by:** exploratory campaign OVL-03

**Symptom:** Two related effects around a node's selection ring and hover
outline (ADR 0044, which sizes them to the icon's real aspect ratio):

1. For the whole time an icon is loading — every first selection of a node whose
   icon is not yet in the browser cache — the outline is drawn SQUARE around an
   icon that is not, then snaps to the right shape when the image arrives.
2. If the icon url never loads (a 404, a dead CDN, an offline moment) the
   outline stays square forever AND a fresh `Image` is created on every mount of
   every outline for that url, for the rest of the session.

Measured: a successful load reports 2.5 for a 100x250 bitmap and the second
mount is served from the module cache with no new `Image`. A failed load leaves
the aspect at 1 — there is no `onerror` handler at all — and the next mount
constructs another `Image` for the same dead url.

**Root cause:**
[`useImageAspect`](packages/axoview-lib/src/hooks/useImageAspect.ts) writes its
module cache only from `img.onload`, and has no `onerror` branch. A miss is
therefore never memoised, which is the mirror image of R3/GPU-03 (where
`NodesCanvas`' icon cache memoises a transient failure as permanent and never
retries). The two icon-loading paths in the app fail in exactly opposite ways,
neither of them chosen. The hook also has no `decode()` gate, so unlike the GL
path — which waits for `decode()` specifically to avoid a black atlas tile — it
publishes its default 1 to the outline immediately.

**Workaround:** none needed for correctness; the outline is cosmetic.

**Status:** Open. Fix direction: cache a sentinel on `onerror` (so a known-bad
url is asked for once) and seed the initial state from that sentinel, matching
what `decodedRef` does on the GL side. If the two icon caches are unified while
fixing GPU-01/GPU-03, this hook should be a reader of that cache rather than a
third fetcher. Repro:
[`aspect-ovl-03.explore.test.tsx`](packages/axoview-lib/src/__explore__/R5/aspect-ovl-03.explore.test.tsx).

## The placement ghost ignores the off-grid residual

**Found by:** exploratory campaign OVL-10

**Symptom:** With snap-to-grid off, the faint preview shown by the Text / Label /
Rectangle / Connector tools sits at the centre of the tile under the cursor while
the element actually lands under the cursor itself. The ghost's whole job is to
answer "where will this go", and off-grid it answers with the grid cell — up to
half a tile (about 70 x 41 canvas px) away from the truth.

Measured: hovering 40 x 18 px off-centre inside a tile with global snap off, the
ghost renders at the bare cell centre while the committed Label carries
`offset: { x: -9.21, y: -13.26 }` — a 16.1 canvas-px discrepancy for a small
cursor excursion.

**Root cause:** `PlacementGhostLayer` in
[`UiOverlay.tsx`](packages/axoview-lib/src/components/UiOverlay/UiOverlay.tsx)
positions itself with `getTilePosition({ tile, origin: 'CENTER' })` from
`uiState.mouse.position.tile` — the integer tile, with no residual — while the
LABEL and TEXTBOX modes commit through `resolvePlacement`, ADR 0023's single
placement chokepoint, which KEEPS the sub-tile residual when the item is
unsnapped. The ghost is a new consumer of item geometry that reads the tile and
not the rendered position: the eighth member of the offset-omission cluster the
ADR's own Consequences section warns about, and the first one on a preview
rather than a committed entity.

**Workaround:** none; the drop is correct, only the preview lies.

**Status:** Open. Fix direction: resolve the ghost through the same
`cursorTileResidual` + `isSnappedPlacement` pair the modes use (or, better,
have the modes publish the resolved placement to uiState so the ghost renders
exactly what will be committed rather than recomputing it). Repro:
[`ovl-07-10-11-gestures.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/R5-overlays/ovl-07-10-11-gestures.explore.spec.ts).

## A Drive scope-403 during a token refresh hangs the awaiting write forever

**Found by:** exploratory campaign AUTH-01

**Symptom:** A Drive request that 403s for insufficient scopes while a token
refresh is in flight leaves every other Drive operation that was waiting on that
refresh permanently pending. There is no error, no toast, no failure dialog and no
timeout — the save simply never completes. The blocking "Google Drive access is
required" dialog appears, but the autosave behind it is stuck rather than failed,
so its ADR 0011 error surface never runs and the save-status indicator never
leaves its in-progress state.

**Root cause:** `markDriveScopeMissing()` in
[`authStore.ts`](packages/axoview-app/src/stores/authStore.ts) sets
`DRIVE_ACCESS_REQUIRED` and nulls the token but — unlike its sibling
`markExpired()`, which does both — it neither drains `_waiters` nor calls
`clearAuthTimeout()`. Every `getValidToken()` caller that piggybacked on the
in-flight `REFRESHING` request is parked on a waiter that nothing will ever
settle: a late `_onToken` and a late `_onError` both bail on the
`AUTHENTICATING/RECONNECTING/REFRESHING` status guard, and the armed 25 s
silent-request timeout consults the same guard. Measured: after
`markDriveScopeMissing()` the waiter list still holds the entry (1, not 0) and the
promise is unsettled after a simulated hour; `markExpired()` on the identical
setup resolves it to `null`.

**Workaround:** Reload the page. The token is in-memory only, so nothing is lost
beyond the unsaved edits the hung write was carrying.

**Status:** Open. Fix direction: give `markDriveScopeMissing()` the same
`clearAuthTimeout()` + `_waiters` drain + `_absorbStaleError: false` reset
`markExpired()` already performs — the two functions are the same shape and should
share it. Repro:
[`auth-01-02-04.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-01-02-04.explore.test.ts).

## "Grant Drive access" can end in a signed-out session with a "Sign-in cancelled" toast

**Found by:** exploratory campaign AUTH-02

**Symptom:** From the blocking Drive-access dialog, clicking "Grant Drive access"
and completing Google's consent screen can leave the user signed out, with an
info toast claiming "Sign-in cancelled" — even though they cancelled nothing and
granted everything asked for. Clicking Grant again works, so the failure looks
random.

**Root cause:** `signIn()` sets `_absorbStaleError` from the status it supersedes
(`RECONNECTING`/`REFRESHING`), which is the PR-59 guard that stops a superseded
silent request's late error from being mistaken for the popup's own cancellation.
`grantDriveAccess()` opens an identical interactive request but pins
`_absorbStaleError: false` unconditionally — and it is reachable with a silent
request still in flight, because `markDriveScopeMissing()` can park the session in
`DRIVE_ACCESS_REQUIRED` mid-refresh without cancelling anything (see AUTH-01).
The superseded refresh's late error then takes `_onError`'s final branch:
`UNAUTHENTICATED` + "Sign-in cancelled", after which the consent grant the user
actually completed is discarded on `_onToken`'s status guard. Measured end state:
`status: 'UNAUTHENTICATED'`, `accessToken: null`, info toast queued. The same
chain driven through `signIn()` absorbs the stale error and reaches
`AUTHENTICATED`.

**Workaround:** Click "Grant Drive access" again (or sign in from the avatar
menu) — the second attempt has no superseded request behind it.

**Status:** Open. Fix direction: derive `_absorbStaleError` in
`grantDriveAccess()` the same way `signIn()` does, or better, factor the
"interactive request supersedes whatever was in flight" preamble into one helper
both call. Fixing AUTH-01 also removes the main route into this state. Repro:
[`auth-01-02-04.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-01-02-04.explore.test.ts).

## A stale Drive 401 during sign-in discards the sign-in the user just completed

**Found by:** exploratory campaign AUTH-04

**Symptom:** A user whose session is expiring clicks "Sign in again", completes
the Google popup — and lands back on the expired-session state, with a second
"Your Google session expired" warning toast that appeared while the popup was
still open. The grant is silently thrown away.

**Root cause:** `markExpired()` guards only against re-entry
(`status === 'SESSION_EXPIRED'`), not against landing on top of a live request. A
Drive request issued before the click comes back 401 (expected — that is what
prompted the sign-in), `GoogleDriveProvider.request()` calls
`authStore.markExpired()`, and the store flips to `SESSION_EXPIRED`, empties
`_waiters` and pushes another persistent notice while the interactive request is
still in flight. `signIn()`'s waiter resolves on both outcomes, so the caller sees
a "completed" sign-in; moments later the real grant arrives and `_onToken` drops
it because the status is no longer one of the three in-flight states. Measured:
`status: 'SESSION_EXPIRED'` and `accessToken: null` after a full-scope grant.

**Workaround:** Sign in a second time — by then no stale request remains.

**Status:** Open. Fix direction: `markExpired()` should not clobber
`AUTHENTICATING` (the user is actively re-authenticating and a 401 about the OLD
token tells us nothing about the new one) — either skip the transition entirely or
record it as pending and apply it only if the request fails. Repro:
[`auth-01-02-04.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-01-02-04.explore.test.ts).

## The stuck-popup auth timeout is swallowed by the stale-error absorber

**Found by:** exploratory campaign AUTH-03

**Symptom:** For a remembered user whose boot reconnect is still in flight, a
sign-in whose popup never calls back (COOP-blocked `window.closed` polling — the
exact scenario the timeout exists for) leaves the toolbar showing a bare spinner
forever. Nothing recovers it: no toast, no error, no return to the avatar. Only a
page reload clears it.

**Root cause:** `armAuthTimeout()` in
[`authStore.ts`](packages/axoview-app/src/stores/authStore.ts) recovers a stuck
handshake by synthesising a failure through `_onError({ type: 'timeout' })` — and
`_onError` is the one function that may decide to *absorb* an error. When an
interactive `signIn()` superseded a silent request, `_absorbStaleError` is set, so
the synthetic timeout is treated as the superseded request's late error: absorbed,
with an early `return` that never reaches `clearAuthTimeout()`. The timer callback
has already nulled `pendingAuthTimeout` and nothing re-arms it, so the safety net
fires exactly once and is consumed by the guard. Measured: `AUTHENTICATING` still
set after a further simulated hour, both waiters unsettled. The same timeout on a
plain `signIn()` recovers to `UNAUTHENTICATED`.

**Workaround:** Reload the page.

**Status:** Open. Fix direction: the timeout is not a GIS callback and should not
be routed through the absorber — give it its own recovery path (or tag the
synthetic error so `_onError` never absorbs it), and re-arm the timer when an
error IS absorbed so the request still has a deadline. Repro:
[`auth-03-07.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-03-07.explore.test.ts).

## A second sign-in click opens a second Google popup, and closing the first cancels it

**Found by:** exploratory campaign AUTH-07

**Symptom:** Two Google sign-in popups can be open at once. Dismissing the first
(now redundant) one drops the app to signed-out with a "Sign-in cancelled" toast,
and the grant completed in the second popup is then ignored — so the user
consented and is still signed out.

**Root cause:** `signIn()` has no in-flight guard: called while already
`AUTHENTICATING` it appends a second waiter, re-arms the timeout and fires a
second `requestToken()`. Because the prior status was `AUTHENTICATING` rather than
`RECONNECTING`/`REFRESHING`, `_absorbStaleError` stays false, so the first
popup's `popup_closed` error takes `_onError`'s cancel branch and settles both
waiters. `AuthControl` collapses to a spinner during `AUTHENTICATING` and
`DriveDisplayGate`'s button is `disabled`, but
[`LocalModeBanner`](packages/axoview-app/src/components/LocalModeBanner.tsx)'s
"Sign in to save to Google Drive" button and the persistent expired notice's
"Sign in again" action are both live throughout. Measured: 2 `requestToken` calls,
2 waiters, then `UNAUTHENTICATED` with `accessToken: null` after the second
popup's full-scope grant.

**Workaround:** Click sign-in once and wait for the popup to settle.

**Status:** Open. Fix direction: make `signIn()` idempotent — when a request is
already in flight, attach a waiter and return instead of issuing a second GIS
request (the same piggyback `getValidToken()` already does). Repro:
[`auth-03-07.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-03-07.explore.test.ts).

## A scope-less grant fails in-flight Drive writes as "Not signed in" behind the re-consent dialog

**Found by:** exploratory campaign AUTH-06

**Symptom:** When a token refresh comes back without the `drive.file` scope, the
blocking "Google Drive access is required" dialog opens — and at the same instant
every Drive operation that was waiting on that refresh fails with "Not signed in
to Google". The user sees a save failure that contradicts the dialog they are
being asked to act on, and the caller cannot tell "re-consent needed" from
"signed out".

**Root cause:** `_onToken`'s scope-less hard stop nulls `accessToken` and then
settles the waiter list with `w.resolve()` (not `reject`). A `getValidToken()`
piggybacker's resolve callback reads `get().accessToken ?? null`, so it returns
`null` — and `GoogleDriveProvider.request()` maps a null token to
`DriveError('Not signed in to Google', 401)`. Measured: a `saveDiagram` parked on
the refresh waiter rejects with exactly that error and status 401, with zero Drive
fetches attempted (the token itself is correctly withheld).

**Workaround:** Grant Drive access in the dialog and retry the save.

**Status:** Open. Fix direction: reject scope-less-grant waiters with a
distinguishable reason (or resolve them with a typed
`DRIVE_ACCESS_REQUIRED` outcome) so callers can suppress their own error surface
while the blocking dialog owns the recovery — the single-slot notification
contract (ADR 0011) makes two competing surfaces especially costly. Repro:
[`auth-06-08-09-14.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-06-08-09-14.explore.test.ts).

## An exhausted Drive rate limit is mistaken for a missing scope and parks the session

**Found by:** exploratory campaign AUTH-08

**Symptom:** Creating a diagram while Google Drive is rate-limiting the app ends
with the blocking "Google Drive access is required" dialog and a discarded access
token, instead of a retriable "Drive is busy" failure. The user is asked to
re-consent to a permission they never lost.

**Root cause:** `GoogleDriveProvider.request()` carefully classifies a 403 as
rate-limit (retriable) versus permanent — and then throws
`DriveError(message, 403)` for both, discarding the classification. The only
production consumer that acts on a 403,
`handleCreateBlankDiagram` in
[`DiagramLifecycleProvider.tsx`](packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx),
tests just `name === 'DriveError' && err.status === 403` and calls
`markDriveScopeMissing()`, which nulls a perfectly valid token and sets
`driveScopeGranted: false`. Measured: a `rateLimitExceeded` 403 retries the full
backoff run (4 fetches) and then throws with the same name and status as an
`insufficientPermissions` 403 that fails fast (1 fetch).

**Workaround:** "Continue without Drive", then sign in again once the rate limit
clears.

**Status:** Open. Fix direction: carry the classification on the thrown error
(e.g. a `reason` field, or distinct statuses for retriable-403 vs
scope-403) and narrow the consumer's predicate to the scope case. Pairs with the
AUTH-09 entry below — the same missing distinction, in the other direction. Repro:
[`auth-06-08-09-14.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-06-08-09-14.explore.test.ts).

## A revoked Drive scope only reaches the re-consent dialog from "new diagram"

**Found by:** exploratory campaign AUTH-09

**Symptom:** If the `drive.file` grant is revoked out-of-band (Google account
permissions page, admin policy), every Drive operation fails with a generic error
— "Request had insufficient authentication scopes." in a toast or the save-failure
dialog — and the session keeps reporting itself as signed in. The blocking
re-consent dialog that exists for exactly this condition never appears. Only
"New diagram" routes there.

**Root cause:** `GoogleDriveProvider.request()` wires the 401 twin
(`authStore.markExpired()`) but has no 403 counterpart:
`markDriveScopeMissing()` is called from exactly one place in the codebase,
`handleCreateBlankDiagram`'s catch. So save, load, list, rename, move, folder
operations and the tree manifest all dead-end. Measured: after an
`insufficientPermissions` 403 on `saveDiagram`, `status` is still
`'AUTHENTICATED'` and `driveScopeGranted` is still `true`.

**Workaround:** Create a new blank diagram — its catch routes to the dialog — or
sign out and sign back in with the Drive checkbox ticked.

**Status:** Open. Fix direction: classify the scope 403 in
`request()` (see AUTH-08) and call `markDriveScopeMissing()` there, so every Drive
path inherits the recovery ladder instead of one call site re-implementing it.
Repro:
[`auth-06-08-09-14.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-06-08-09-14.explore.test.ts).

## A userinfo failure makes a working Google session render as signed out, with no way to sign out

**Found by:** exploratory campaign AUTH-05

**Symptom:** If the one `oauth2/v3/userinfo` call that follows a grant fails
(offline blip, CSP, a 403 from Google), the sign-in appears not to have happened:
the toolbar shows the grey "signed out" person icon whose menu offers "Sign in
with Google", with no name, no avatar and **no Sign out item** — while Drive saves
and opens work normally against the live token. The account is also not
remembered, so the next reload does not attempt the silent reconnect.

**Root cause:** `fetchUserInfo()` treats its own failure as cosmetic ("the token
is still valid") and returns without setting `user` or writing the profile hint.
But [`AuthControl`](packages/axoview-app/src/components/AuthControl.tsx) gates the
whole signed-in branch on `!!user` — `signedIn = (status === 'AUTHENTICATED' ||
status === 'REFRESHING') && !!user` — so an authenticated, token-holding session
with no profile falls through to the "UNAUTHENTICATED, never signed in here"
branch. Measured with `fetch` rejecting: `status: 'AUTHENTICATED'`,
`getValidToken()` returns the token, `user: null`, no `auth-avatar` and no
`auth-signout` in the DOM; the same grant with userinfo succeeding renders both.

**Workaround:** Reload the page (the token does not survive, so this signs you
out) — or ignore it, since Drive still works.

**Status:** Open. Fix direction: either render the signed-in control from
`status` alone with a placeholder identity (the avatar already falls back to `?`),
or retry / synthesise a minimal `user` on userinfo failure. The sign-out
affordance in particular must not depend on a cosmetic fetch. Repro:
[`auth-05-10-11.explore.test.tsx`](packages/axoview-app/src/__explore__/S1/auth-05-10-11.explore.test.tsx).

## Cancelling "Use a different Google account" signs the viewer out of the account that was working

**Found by:** exploratory campaign AUTH-11

**Symptom:** On a `/display/drive/:fileId` link that the signed-in account cannot
open, the gate offers "Use a different Google account". Clicking it and then
closing Google's chooser without picking leaves the viewer strictly worse off than
before: the gate's explanation no longer names which account it tried ("You're
signed in as …" degrades to the generic copy), the avatar's amber-dot reconnect
affordance is gone, and no re-read is attempted.

**Root cause:**
[`DriveDisplayGate.handleSwitchAccount()`](packages/axoview-app/src/components/DriveDisplayGate.tsx)
calls `signOut()` before `signIn()` — deliberately, so the cleared profile hint
makes Google show the account chooser instead of silently re-picking the same
account. But `signOut()` also nulls `user` and clears the hint *irreversibly*, and
nothing restores them when the sign-in that follows is cancelled. The recovery
affordance for a cancelled sign-in (`needsReconnect = !!user && (SESSION_EXPIRED ||
UNAUTHENTICATED)`) is precisely the thing `signOut()` just destroyed. Measured:
after `_onError('popup_closed')` the email is absent from the DOM, `user` is null,
`needsReconnect` is false and `retryDriveDisplayRead` was never called.

**Workaround:** Reload the page and sign in again.

**Status:** Open. Fix direction: get the chooser without discarding the session —
pass `prompt: 'select_account'` through the bridge (GIS supports it and
`AuthProvider` already narrows to it) and only sign out once a different account
has actually been granted; or snapshot the identity and restore it if the
interactive attempt does not succeed. Repro:
[`auth-05-10-11.explore.test.tsx`](packages/axoview-app/src/__explore__/S1/auth-05-10-11.explore.test.tsx).

## A mid-session Drive scope loss keeps the account remembered, so a reload walks back into the blocking dialog

**Found by:** exploratory campaign AUTH-12

**Symptom:** When the Drive permission is lost mid-session and the blocking
"Google Drive access is required" dialog appears, reloading the page — the
instinctive way out of a modal with no Escape — lands straight back in the same
dialog, because the boot reconnect silently re-acquires the same scope-less token.

**Root cause:** `_onToken`'s scope-less hard stop calls `clearProfileHint()` with
an explicit rationale: an identity-only grant "isn't worth a boot reconnect, so a
reload lands on a clean signed-out state instead of looping back into this
prompt". Its sibling `markDriveScopeMissing()`, which parks the session in the
identical state from a Drive 403, does not. The hint survives, so the fresh page
load is "remembered" and `UNAUTHENTICATED` — exactly the condition
`AuthBridge` re-arms `attemptSilentReconnect()` from. Measured across a simulated
reload (fresh store module): hint intact, `requestToken({ prompt: '', hint })`
fired, and the still-scope-less grant lands back in `DRIVE_ACCESS_REQUIRED`; the
`_onToken` twin on the same condition clears the hint.

**Workaround:** Click "Continue without Drive" in the dialog (that calls
`signOut()`, which does clear the hint) before reloading.

**Status:** Open. Fix direction: `markDriveScopeMissing()` should call
`clearProfileHint()` like its twin — the two functions park the session in the
same state and should leave the same trail. Repro:
[`auth-12-13-15-16.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-12-13-15-16.explore.test.ts).

## Signing in as a second Google account reuses the first account's Drive root folder id

**Found by:** exploratory campaign AUTH-16

**Symptom:** Sign out of one Google account and sign in as another without
reloading, and the file tree shows an empty Drive place; creating a diagram there
fails or lands somewhere the second account cannot see. Reloading fixes it.

**Root cause:** `signOut()` clears the profile hint but neither of the Drive root
caches: the `axoview-drive-root` localStorage entry survives, and so does
`GoogleDriveProvider`'s in-memory `rootFolderId` — and `StorageManager` holds one
provider instance for the page lifetime. `resolveRoot()` short-circuits on the
in-memory id (`if (this.rootFolderId) return this.rootFolderId`), so the second
account never reaches `probeRoot()`, never runs the `folderExists()` check that
would 404 and heal the localStorage copy, and never re-runs marker discovery.
Measured: after account A resolves its root and signs out, account B's first
`listDiagrams(null)` issues `'root-of-account-A' in parents` under account B's
bearer token and returns `[]`, and `createDiagram` POSTs
`"parents":["root-of-account-A"]`.

**Workaround:** Reload the page after switching accounts.

**Status:** Open. Fix direction: invalidate the per-account caches on sign-out
(and on a fresh grant for a different email) — `rootFolderId = null`, `rootProbe =
null`, remove `axoview-drive-root`. Related: the root cache is never revalidated
within a session either ("Deleting the Drive root folder mid-session is not
detected" above); a single "invalidate + re-probe" entry point would close both.
Repro:
[`auth-12-13-15-16.explore.test.ts`](packages/axoview-app/src/__explore__/S1/auth-12-13-15-16.explore.test.ts).
