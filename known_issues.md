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

## Partial-coverage i18n locales (ALL twelve)

**Corrected 2026-08-02 (A5/CHR-09).** This entry named de-DE and id-ID and
pointed users at nine "fully-covered" locales. **None of the twelve is fully
covered.** Measured against `en-US`'s 228 leaf keys: 34 missing for bn-BD,
es-ES, fr-FR, hi-IN, it-IT, pl-PL, pt-BR, ru-RU and tr-TR; 35 for zh-CN; 65 for
de-DE; 66 for id-ID. Drift also runs the other way — every catalogue carries 1–3
keys `en-US` no longer has (CHR-10), renames the translations never followed.

**Symptom:** Newer strings fall through to English mid-screen. de-DE and id-ID
are roughly twice as short as the rest, which is the difference this entry
originally described; it is a difference of degree, not of kind.

**Workaround:** en-US is the only complete catalogue.

**Status:** The translation debt is Open and deferred — resolve when translators
refresh the locales. What is **Fixed in wave 4 (2026-08-02)** is the reason it
was invisible: nothing compared key sets, so every feature that added a string
to `en-US` widened the gap silently, and this entry's own guidance went stale
without anyone noticing. `localeKeyParity.contract.test.ts` now pins the
shortfall per locale in both directions, so a new untranslated string fails the
build and closing debt means lowering a number in a file. Not a
productization-blocker — locale switching works, and the stubs are kept (rather
than dropped from `supportedLanguages`) so an existing user choice keeps
working. Filed alongside B-13 closure (productization audit Section 5).

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

**Status:** Fixed in 07c7fa78 (2026-07-30) — `useLayerActions.commit()` performs
the same ritual as `useSceneActions.saveToHistoryBeforeChange`: one
`allocateHistorySequence()` for the logical action, then arm BOTH stores. A layer
op now carries its own seq, so `useHistory.undo` stops dragging the previous
action's scene entry down with it. Promoted regression:
[`useLayerActions.history.test.tsx`](packages/axoview-lib/src/hooks/__tests__/useLayerActions.history.test.tsx).

## Creating a page is not undoable, and Ctrl+Z after it silently reverts the previous action — FIXED

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

**Status:** Fixed on `remediation/exploratory-campaign` (2026-08-02, wave 5) —
`createView` now runs inside `withHistory`, which arms the snapshot *before*
`changeView` moves the user, so the recorded entry is stamped with the page the
user created from.

The fix had to wait for HIST-10 and could not be the one-line
`saveToHistoryBeforeChange()` this entry originally proposed: recording the create
on its own would have made the "worse, end-to-end" paragraph above the *normal*
case rather than an edge one — the undo removes the page and leaves `uiState.view`
on its id. The page stamp is what gives that undo somewhere correct to go. Promoted
regressions: [`useHistory.pageStamp.test.tsx`](packages/axoview-lib/src/hooks/__tests__/useHistory.pageStamp.test.tsx)
and [`undo-page-navigation.spec.ts`](packages/axoview-e2e/tests/undo-page-navigation.spec.ts);
the `__explore__` probe is retired.

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

**Status:** Fixed in 1b916b01 (2026-07-30) — a new logical action clears BOTH redo
stacks, not just the one that happens to push an entry for it. The store whose
patch set for that action is empty never pushed, and so never cleared its own
future: `canRedo` stayed true and Redo re-applied a stale scene patch. Promoted
regression: [`historyBrackets.test.tsx`](packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx).

## Independent 50-entry history trimming splits one logical action across the two stacks — FIXED

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

**Status:** Fixed on `remediation/exploratory-campaign` (2026-08-02, wave 5). The
retained set is now a property of the SEQUENCE space both stores already share
rather than of each stack's length: keep the newest 50 **logical actions** and
drop everything older
([`retainWithinHistoryWindow`](packages/axoview-lib/src/stores/historySequence.ts)).
Both stores evaluate the identical predicate against the identical counter, so
the two halves of one action are always retained together or dropped together —
the pairing holds by construction, and neither store has to see the other.

That is a simpler shape than this entry's proposed "when a store evicts seq N,
drop every entry with seq ≤ N from both stacks", which needs one store to reach
into the other or to publish through a channel the other polls. It is also why the
predicate is applied on READ as well as on write: a store that has stopped
writing must still age out in step, and that lag is exactly the window in which
the two stacks disagreed about which action is oldest.

**The cap's meaning changed, deliberately.** It was "50 entries per store"; it is
now "the last 50 logical actions", so an action that pushed to neither store still
consumes a slot. HIST-15's ruling (keep the silent cap, document it) is unchanged
— and the new meaning is closer to what the ruling describes. Promoted regression:
[`useHistory.pairedTrim.test.tsx`](packages/axoview-lib/src/hooks/__tests__/useHistory.pairedTrim.test.tsx);
the probe is retired.

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

**Status:** Fixed in 1b916b01 (2026-07-30) — every mutating action in
`useSceneActions` runs through `withHistory`, which discards the armed
pre-snapshot in both stores when the reducer throws. Nothing downstream can pick
it up any more, so a page switch's SYNC_SCENE records nothing. Promoted
regression: [`historyBrackets.test.tsx`](packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx).

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

**Status:** Fixed in 1b916b01 (2026-07-30) — `useInteractionManager`'s keydown
handler commits any open drag bracket before dispatching, which is the reachable
trigger: the mode's exit runs lazily on the next MOUSE event, so a lost mouseup
followed by a keyboard-only action was where the leak did its damage. It is the
same "no-op when no drag is open" call `usePanHandlers` and `handleEscapeKey`
already make. Promoted regression (the recovery path, driven from a second hook
instance): [`historyBrackets.test.tsx`](packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx).

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

**Status:** Fixed in 1b916b01 (2026-07-30) — `dragInProgress` (with the
transaction flag and the pending state) moved from per-HOOK refs to the scene
store's provider-scoped `editSession`, so every `useSceneActions()` instance
under one provider pair sees the same bracket. A foreign write mid-drag no longer
re-arms the frozen pre-drag snapshot, and undo lands the item on its origin.
Promoted regression: [`historyBrackets.test.tsx`](packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx).

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

**Status:** Fixed in wave 4 (2026-08-01) — both halves, as directed.
`deleteModelItem` splices, and `validateView` filters falsy entries before
mapping so a malformed array already in a user's file degrades to "that item is
not there" instead of taking the editor down. The second half matters
independently of the first: the corruption is already saved in documents, and
`splice` cannot reach them.

The pre-existing pin said in as many words that "any future splice-based fix
will be caught by the change in this assertion" — that change is made rather
than the assertion deleted, which is the only reason the old behaviour is
provably gone. Promoted regressions:
[`modelItem.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/modelItem.test.ts)
(the `deleteModelItem — sparse array pin` block).

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

**Status:** Fixed in wave 4 (2026-08-01) — the "only fail on issues the action
introduced" variant, diffed against the pre-state. Issue identity is `type` plus
the sorted `params`, not `type` alone: the params name the entities involved, so
an update that introduces a *second* dangling ref cannot hide behind a
pre-existing first one.

This is the cluster's amplifier, so it is ruled against wave 1's
**repair-don't-reject** ruling in both directions, and the two halves ship
together: pre-existing issues are left for the load-time repair to heal (bad
refs already in users' files), and the write sites (RED-07, RED-14) stop
producing them. Neither half is sufficient — a write-site fix cannot reach a
file the bug already wrote, and a load repair cannot stop the next delete.

One hole found by the tests rather than by reasoning, and worth recording
because the shape recurs: `createViewItem` unshifts the new item and *then*
calls `updateViewItem`, so the baseline already contained it and an issue the
creation introduced was classified pre-existing and waved through. The
"guard keeps its teeth" test caught it; `createViewItem` now passes the
pre-insert state explicitly. Promoted regressions:
[`danglingRefIntegrity.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/danglingRefIntegrity.test.ts)
(the `AMPLIFIER` block, including that test and its CONTROL).

Deliberately **not** done: turning a rejected write into a notification. The
throw is now reachable only by an action that genuinely introduced an issue,
which is a programming error rather than a user-facing state, and routing it to
the notification system would make it look like a condition the user could act
on.

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

**Status:** Fixed in 2168faa5 (2026-07-30) — both halves. The write site
(`ASSIGN_LAYER_TO_ITEMS`) refuses a layer id that names no layer in the view
(`5d6a969b`), and the load path repairs one that arrives in a file: a dangling
`layerId` becomes unassigned, which the app already renders as visible and
editable. Per the owner's repair-don't-reject ruling, `validateView` deliberately
still accepts the reference — flagging it there would make a file carrying one
un-openable AND (via E2/RED-02) make every edit in that view throw. Promoted
regressions: [`repairModel.test.ts`](packages/axoview-lib/src/utils/__tests__/repairModel.test.ts) and the class gate [`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Fixed in 5d6a969b (2026-07-30) — `layer.order` is normalised to a
permutation of `0..n-1` after every mutation, so no single call can break the
invariant: `createLayer` cannot reuse the hole a `deleteLayer` left, and a
PARTIAL `reorderLayers` list rebuilds the whole sequence (named layers take the
leading slots, the rest follow in their current relative order) instead of
renumbering only the ids it names. Promoted regression + class gate:
[`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Fixed in wave 4 (2026-07-31) — both halves, because the first alone
was not enough. The dispatcher now stamps only when `newState.model !==
ctx.state.model`, which covers the reducers that already early-return
(`UPDATE_LAYER` with an unknown id, `REORDER_LAYERS` with an empty list). But an
`update*` reducer that assigns `{ ...current, ...updates }` produces a new object
even when every value is identical, so the two MOST reachable cases — a page
rename committed with the same name, and a property re-written with the value it
already has — never produced that signal. `isNoOpUpdate` gives it to them.

Deliberately conservative: an object-valued update (`tile`, `offset`, a
connector's `anchors`) counts as a change without inspecting it. A deep compare
on the drag hot path would cost more than the write it is avoiding, and a false
"no change" would drop a real edit. This also made the create-then-discard of an
abandoned text box or Label a genuinely empty patch set (TXT-04). Promoted
regression: [`noOpUpdate.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/noOpUpdate.test.ts).

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
  the rest of the session. (RED-09 probed that stickiness and was FALSIFIED on
  the undo path — recovery happens, but incidentally, via HIST-06's coarse
  inverse patch rather than by a retry. No entry was filed; the disposition is
  in `docs/reviews/exploratory-2026-07/areas/E2-reducers-cascades.md`.)

**Root cause:** the cascade computes its victim set from direct item references
only and never walks the anchor graph transitively —
[viewItem.ts](packages/axoview-lib/src/stores/reducers/viewItem.ts#L68-L103).
`deleteConnector` has the same gap (RED-14).

**Workaround:** delete the chained connector manually before deleting the node.

**Status:** Fixed in wave 4 (2026-08-01), as the entry directs and jointly with
RED-14 — one shared sweep, run by both delete paths and by the load repair.
`sweepDanglingAnchorRefs` re-points an unresolvable `ref.anchor` at that
anchor's last known tile, drops the ref where no tile is knowable, and removes a
connector the sweep leaves with fewer than two anchors.

Three things the implementation had to get right that the fix direction does not
say:

- The tiles only exist *before* the delete, so they are collected from the
  doomed connectors while they are still in the model.
- The walk is **transitive** and fixed-point. A→B→C, where removing C removes B,
  leaves A pointing at one of B's anchors; a single pass misses it.
- A connector that arrived *already* malformed — one anchor, which the CLIP-01
  anchor dedupe can produce — is left alone. Removing it would silently widen
  "sweep dangling refs" into "also delete malformed connectors", in a helper
  three call sites share. A per-connector `touched` flag draws that line.

There is a named pin for the symptom class rather than coverage-by-side-effect:
`RED-07 PIN: a delete-with-contents leaves ZERO dangling anchors` in
[`deleteLayerContents.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/deleteLayerContents.test.ts).
Re-verified after this pass by reverting the delete-with-contents write path to
its layer-only form: the pin went red and the other 15 tests in the file stayed
green, so it is discriminating rather than incidentally satisfied. Promoted
regressions:
[`anchorGraph.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/anchorGraph.test.ts)
(the rule) and
[`danglingRefIntegrity.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/danglingRefIntegrity.test.ts)
(both delete paths and the load repair, in one file, because they are one rule).

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

**Status:** Fixed in wave 4 (2026-08-01) — at save time, in lean-save, exactly as
the entry directs. `sweepOrphanModelItems` lives in the lib next to
`stripDefaultIcons` and runs from `leanIfModel`, so every provider that persists
a model sweeps identically (the same single-implementation rule the ADR 0003
addendum imposes on the icon strip).

Two decisions are load-bearing and each has its own test. **Save, not delete**:
collecting on delete would make undo of that delete restore a view item whose
model item is gone; save is the moment the document is declared final and undo
cannot cross it. **Referenced by ANY view, not the current one**: a model item
used only on page 3 is live, and a per-view sweep would delete the model item of
every node on a page you are not looking at.

The sweep also tolerates an `undefined` slot instead of throwing on one. RED-01's
corruption is already in users' files, and a sweep that threw would turn a silent
leak into a failed save — landing on exactly the documents that most need
repairing. Promoted regression:
[`sweepOrphanModelItems.test.ts`](packages/axoview-lib/src/utils/__tests__/sweepOrphanModelItems.test.ts).

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

**Status:** Fixed in wave 4 (2026-08-01) together with RED-07 — one shared sweep,
which is what the entry asks for and the reason the two were fixed as a pair
rather than in sequence. See the RED-07 entry above for what the shared helper
does and the three cases it had to get right. Promoted regressions:
[`anchorGraph.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/anchorGraph.test.ts)
and the `WRITE SITE — deleting a CONNECTOR` block of
[`danglingRefIntegrity.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/danglingRefIntegrity.test.ts).

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

**Status:** Fixed in wave 4 (2026-08-01) — the invalidation step the entry
describes, using the same filter rather than a second opinion about what is
interactable. A re-check that could disagree with acquisition would be a new way
for the two to drift, which is the bug `collectSelectableRefs` was factored out
to prevent, so `dropUninteractableRefs` is a thin wrapper over
`makeInteractableCheck` and a test asserts the two agree by construction.

It runs in `LayerContextProvider` rather than in `updateLayer`. That is the one
place that already sees every input to the verdict — the layer rows, the preview
overrides, and the entity→layer assignment — so it covers layer delete and
re-assignment for free, which a reducer-side hook on `visible`/`locked` would
have missed. The entry's root cause is that layer state and selection have no
subscription between them; this effect *is* that subscription.

The `hasLayers` fallback is preserved and pinned: it keys off whether any layer
exists, not off `visibleIds.size`, because an empty `visibleIds` also means
"every entity is on a hidden layer" — conflating them made a fully-hidden view
snap back to fully-interactable, and that regression must not return through this
new caller. Promoted regression:
[`dropUninteractableRefs.test.ts`](packages/axoview-lib/src/utils/__tests__/dropUninteractableRefs.test.ts).

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

**Status:** Fixed in 1b916b01 (2026-07-30) — as a consequence of the E1/HIST-08
delegation work: the transaction bracket no longer snapshots both stores at open
and write that snapshot back at close. It starts empty and flushes only what
`setState` produced, so a preview issued inside a transaction (by any route)
survives the commit. Promoted regression: [`historyBrackets.test.tsx`](packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx).

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

**Status:** Fixed in 5d6a969b (2026-07-30) — the default page name comes from the
highest existing suffix (`nextPageName`, which builds its scan from the localised
template so it works in every locale), never from `views.length`. Promoted
regression + class gate: [`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Fixed in 2168faa5 (2026-07-30) — owner ruling: **repair, don't reject.**
`modelSchema` deliberately still accepts a duplicate id, because making it an
error would stop every file this bug has already produced from opening (the
E4/CLIP-02 harm). Instead the load path repairs: `utils/repairModel.ts` keeps the
FIRST occurrence and drops the shadowed twin — which was already unreachable, so
nothing the user could see changes — across model items, views, every view
collection and connector anchor ids, and reports what it did. Promoted
regressions: [`repairModel.test.ts`](packages/axoview-lib/src/utils/__tests__/repairModel.test.ts) and the class gate [`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Fixed in 5d6a969b (2026-07-30) — `updateViewItem` clamps `iconScale`
to the schema's `[0.1, 3]`, so every writer is covered, including the exported
action and the group-resize factor whose own `[0.3, 2.5]` clamp sits a layer up.
Promoted regression + class gate: [`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Partially fixed in 2168faa5 (2026-07-30) — the **tile-coordinate**
half (CLIP-15) is closed: `utils/repairModel.ts` clamps a non-finite or absurd
coordinate on load, per the owner's repair-don't-reject ruling. Non-finite is the
sharp case — the schema rejects it, so those files do not open at all today. The
**icon-reference** half is now closed too — fixed in wave 4 (2026-08-01), and
routed into the E2 reference-integrity pass rather than the F5 icon pass because
that is what it is: a reference to something that is not there.

It is deliberately **not** a validation change. `validateModelItem` leaves icon
refs alone on purpose (icons legitimately arrive from packs loaded separately and
absent from `model.icons`), so rejecting the reference would break the legitimate
case and repairing it away would delete the user's node. The fix is the
`requiredPacks` derivation the entry names: at save, item icon ids the model
cannot resolve are looked up in the host's canonical catalog, and the collection
it reports is recorded — the pasted node's pack is then fetched on load instead
of the node returning as a tombstone. That is repair-don't-reject applied to icon
refs: recover the pack name, keep the reference.

Two consequences worth recording. The catalog lookup is the same host-only
question `applyIconStrip` asks ("which collections can this build rehydrate?"),
so it sits next to it rather than in the lib. And the derivation became a
**union** instead of an either/or: one unresolvable ref used to discard every
pack the save *had* derived and fall back to the input's list wholesale. Both
halves were verified able to go red independently. Promoted regressions: [`repairModel.test.ts`](packages/axoview-lib/src/utils/__tests__/repairModel.test.ts) and the class gate [`modelIdentity.contract.test.ts`](packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts).

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

**Status:** Fixed in 72989e3a (2026-07-30) — per-delegate after all, but
through one table rather than a check per site.
[`readonlyPolicy.ts`](packages/axoview-lib/src/interaction/readonlyPolicy.ts)
gives every keydown surface an access class, and the dispatcher asks it:
tool hotkeys, Delete, cut/paste, Ctrl+A, z-order and the arrow *nudge* are
`editor` surfaces, refused unless `editorMode === 'EDITABLE'`; Esc, F1, Ctrl+C
and the arrow *pan* are `viewer` ones and keep working. A blanket early-return
was rejected because it would have taken those four with it. Esc additionally
stops exiting PAN → CURSOR in read-only — PAN is a viewer's resting mode, so
that branch was handing out a live editing mode on every press. Promoted
regressions: [`readonly-enforcement.spec.ts`](packages/axoview-e2e/tests/readonly-enforcement.spec.ts)
and the class gate [`readonlySurfaces.contract.test.ts`](packages/axoview-lib/src/interaction/__tests__/readonlySurfaces.contract.test.ts),
which fails if a new delegate arrives with no access class.

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

**Status:** Fixed in wave 3 (2026-07-31). Neither of the two directions above was
taken as written. `cameFromRenderer` generalised is too wide — it would also
refuse Delete after the user last clicked a toolbar button, which is not what
this bug is about. `uiState.dialog` is too narrow: it knows only the three
lib-owned dialogs (Export/Help/Settings), and the app package mounts its own
(import, share, settings, confirm prompts) with no way to write that field.
The gate is [`isModalDialogOpen()`](packages/axoview-lib/src/interaction/keyboardScope.ts) —
`role="dialog"`/`role="alertdialog"` with `aria-modal="true"`, plus native
`<dialog open>`. That is what MUI v7's `Dialog` puts on its Paper and what the
ARIA pattern requires of any hand-rolled modal, so a new dialog on either side of
the package boundary is shielded the day it is added, which is the property that
failed here. `role="menu"` / `role="presentation"` deliberately do NOT match: the
canvas context menu is a canvas surface. With a modal up the dispatcher stands
down entirely (a modal owns Escape and the tool hotkeys too), after the
HIST-06 drag-bracket safety net has run. Promoted regressions:
[`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts)
and [`keyboardScope.test.ts`](packages/axoview-lib/src/interaction/__tests__/keyboardScope.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, scoped to `Ctrl+C`.
[`hasLiveTextSelection()`](packages/axoview-lib/src/interaction/keyboardScope.ts)
reports a non-collapsed, non-whitespace range; when one is live the copy branch
returns before `preventDefault`, so the browser's own copy runs. An idle Ctrl+C
still copies the canvas selection. `Ctrl+X` and `Ctrl+V` were deliberately left
alone — neither has a native effect on a read-only range, so letting them through
would trade a silent failure for a silent no-op. The note about `Ctrl+A` is a
different surface (it force-selects the canvas rather than the text under the
cursor) and is NOT fixed here; it was never filed as its own entry, and doing it
properly means the same selection test on the select-all path. Promoted
regressions: [`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts)
(including the "no text selected → the canvas copy still works" control) and
[`keyboardScope.test.ts`](packages/axoview-lib/src/interaction/__tests__/keyboardScope.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) — both directions, not one.
[`resolveZOrderDirection`](packages/axoview-lib/src/interaction/toolHotkeys.ts)
matches `e.code` first (the physical key, and the right identity for a chord like
this) and falls back to `]`/`}` and `[`/`{` for events that carry no `code`
(synthetic dispatch; layouts that reach a bracket through AltGr). It lives in
`toolHotkeys.ts` beside `resolveToolHotkey` so it is unit-testable without a
provider stack. `z-order.spec.ts`'s two shifted legs were left driving
`page.keyboard.press` on purpose, now labelled as the *synthetic* control, with
the real key identities driven through CDP `Input.dispatchKeyEvent` in
[`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts).
**Carried forward:** any other suite that drives chorded punctuation through
`page.keyboard.press` is a candidate for the same false green.

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

**Status:** Fixed in wave 3 (2026-07-31). Neither offered direction was taken.
*Ignoring* undo while a drag is live leaves the user pressing a dead key with no
explanation. Making `commitDragTransaction` a no-op on an empty patch set is the
wrong layer — the patch set here is NOT empty in the general case (drag a node,
Ctrl+Z an unrelated earlier action, release: the move is real and would still
land on top of the undo). Instead `handleHistoryShortcuts` ABORTS the gesture
first, which is what Figma and its peers do: `abortDragItems`
([DragItems.ts](packages/axoview-lib/src/interaction/modes/DragItems.ts) — `exit`'s
body, factored out) clears the preview maps so the pending mouseup commits
nothing at all, and the canvas drops back to CURSOR so the abort is visible.
Promoted regression: the mid-drag undo→redo round-trip in
[`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, without the new wrapper:
`handleConnectorEscape` was already exported and already no-ops unless a
connection is in flight, so `handleToolHotkeys` and `handleSelectAll` simply call
it before their `setMode` — one abort definition, not two. Deliberately kept
inside the two delegates rather than hoisted into the dispatcher, so the
read-only class gate (`readonlySurfaces.contract.test.ts`), which scans the
dispatcher body for delegate calls, keeps enumerating exactly the access-classed
surfaces. Promoted regression:
[`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts),
which also asserts Ctrl+A no longer folds an orphan into the selection.

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

**Status:** Fixed in wave 3 (2026-07-31) via the second, independent half of the
direction: `handleArrowKey` now takes an `isItemInteractable` gate built from
`layerContextRef` (the same predicate `processMouseUpdate` hands the pointer
modes) and re-checks it **per press**, and the false comment is gone. A locked
selection falls through to pan, the fallback a connectors-only selection already
took. RED-15 itself — re-validating `selectedIds` when a layer's state changes —
is a separate entry and is NOT fixed here; the per-press gate is deliberately the
belt rather than the braces, because acquisition-time gating alone is what
failed. Tracked as cross-store invariant **INV-11** in the exploratory oracle
(`fixtures/explore.fixture.ts`). Promoted regressions:
[`canvas-keyboard-scope.spec.ts`](packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts)
and the layer-gate cases in
[`handleArrowKey.test.ts`](packages/axoview-lib/src/interaction/__tests__/handleArrowKey.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31), both halves, taking the parenthetical
of each direction rather than the headline.

(1) The `menu` branch of the end-of-pointer path CLEARS `mouse.mousedown` and
`mode.mousedownItem` directly instead of forwarding a `mouseup`. Forwarding
would re-enter the active mode's mouseup — selection, or a drag commit — for a
gesture the menu had already taken over.

(2) The suppression is not time-scoped; it is *event*-scoped. The reason it ran
for the full 700 ms is that cancelling the `touchend` suppresses the whole
compat sequence, so the `click` its cleanup waited on never arrived — it was
waiting for an event its own `preventDefault` had removed. It now tears down one
macrotask after the terminating `touchend`, which is the lift it exists for; the
700 ms timer stays only as an outer net for a gesture that produces no
`touchend` at all, and the backdrop listeners stay for environments that
synthesise a click without a cancelable touchend. The helper moved to
[`longPressMenu.ts`](packages/axoview-lib/src/utils/longPressMenu.ts) so the
label hit-proxies can arm it too (see TCH-09). Promoted regressions:
[`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed:
`onTouchPointerMove` forwards a bare `mousemove` for a pen pointer that is not
in the tracked set and whose gesture phase is idle, and every pen move that
belongs to a press keeps taking the touch path. `Cursor.mousemove` skips the
hover branch while a press is live, so the forward cannot disturb a gesture.
Promoted regressions: [`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts) — with a MOUSE
control beside it, because the hover path is gated on `hasMovedTile` and a
single synthetic move updates `hoveredItem` for neither device (a one-move
version of this test reads as a pen bug and is a rig artifact).

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

**Status:** Fixed in wave 3 (2026-07-31) as directed. The predicate is
[`isPointOverCanvas`](packages/axoview-lib/src/utils/canvasDropTarget.ts), and
it is shared with the MOUSE placement modes, which had the same defect from the
other direction (I5/CTX-01 — they asked nothing at all and committed on travel
alone). One module answers "was this released over the canvas?" for every drop
path now. Promoted regressions:
[`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts) (which first asserts the panel really
does sit inside the renderer's rect, or the case proves nothing) and
[`canvasDropTarget.test.ts`](packages/axoview-lib/src/utils/__tests__/canvasDropTarget.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) via the first direction. The
fall-through alternative was rejected: the proxy swallows the press deliberately
(`shouldBeginLabelDrag`) so a press aimed at a chip cannot clear the selection
or start a pan underneath it — letting it through would trade this bug for that
one. `createLabelLongPress` lives in
[`labelPointerContract.ts`](packages/axoview-lib/src/utils/labelPointerContract.ts),
the module that exists to stop the two hit-proxies drifting, and BOTH use it —
the node name chip had the same hole, unfiled, for the same reason. It also arms
the lift suppression (TCH-03's helper) so the menu survives the compat-mouse
sequence. `LONG_PRESS_MS` moved to `config/tapGesture` so the chip's hold and
the canvas machine's cannot disagree. Promoted regressions: the touch cases in
[`labelPointerContract.test.tsx`](packages/axoview-lib/src/components/SceneLayers/__tests__/labelPointerContract.test.tsx),
run against both layers, and [`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts).

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

**Status:** Fixed in wave 3 (2026-07-31). The direction was to factor
`onDoubleClick`'s body out and share it; what shipped mirrors the branches
instead, in one named function (`openTouchDoubleTapTarget`). Sharing the whole
body is not possible without pretending: `onDoubleClick` RESOLVES its target by
tile hit-test with `connectorMatch: 'exact'`, and the touch machine already
knows which item was tapped — labels, notably, are not tile-hit-testable at all
(ADR 0031 §4), so a shared resolver would silently drop the LABEL case the touch
path can serve. The mirrored version covers TEXTBOX (on-canvas editor, ADR 0034
§1), LABEL (inline editor) and the deck for everything else. Promoted
regressions: [`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts), with the mouse
double-click as the parity control in the same file.

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

**Status:** Fixed in wave 3 (2026-07-31) via the parenthetical: one
`endPointer(e, { cancelled })` owns both handlers, with the two genuine
differences named at their branch (a cancel does not count as a tap, and does
not disarm an armed placement). That is also what the TCH-06 ruling asked for,
so both land together.

**Rig correction — the probe's evidence was not evidence.** It called its
per-finger `cancel` with the second finger still down, and CDP rejects that
("TouchCancel must not have any touch points"), so the call THREW; because the
probe was a `test.fail()`, the protocol error read as a confirmed bug. The
defect is real — `onTouchPointerUp` demoted pinch → pan and
`onTouchPointerCancel` had no such branch, plainly, in the source — but that run
did not demonstrate it. The promoted suite cancels ONE pointer for real
(`Fingers.cancel` in the shared TouchPOM dispatches the `pointercancel` with the
pointerId Chromium assigned to that finger, which is what an OS takeover
delivers). Promoted regressions:
[`touch-gesture-interrupts.spec.ts`](packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) via the first half: the nudge reads
each item's current `offset` and passes it through, for nodes, rectangles and
text boxes alike.

The wider option was **rejected**, and the reason is worth keeping. Making the
batch updaters treat `offset: undefined` as "leave unchanged" would break the
caller they exist for: `DragItems.mouseup` clears an item's residual by passing
`undefined` when a drag re-snaps it (`previewNodeOffsets` stores `undefined`
for exactly that), so "undefined means clear" is load-bearing on the hot path.
The class is better closed by the ADR 0023 renderedGeometry contract test, which
enumerates offset readers, than by making one write site ambiguous. Promoted
regressions: [`selection-group-rules.spec.ts`](packages/axoview-e2e/tests/selection-group-rules.spec.ts) and the off-grid cases in
[`handleArrowKey.test.ts`](packages/axoview-lib/src/interaction/__tests__/handleArrowKey.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed: `dragItems`
returns early when the group contains nodes and `computeNodeUpdates` rejected
the frame, so the rectangle, text-box, Label **and waypoint-anchor** previews are
all skipped too (the anchor preview had the same hole and no filed entry). Every
preview map keeps its last good value, so the group holds together at the last
legal position and the commit on release matches what the user was looking at.
Promoted regressions: [`selection-group-rules.spec.ts`](packages/axoview-e2e/tests/selection-group-rules.spec.ts), with an
unobstructed mixed group as the control so the early return cannot silently
freeze every drag.

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

**Status:** Fixed in wave 3 (2026-07-31) via the first direction: all three
Delete branches now share one `inTextField` verdict, computed once. The comment
claiming the lasso branch is "handled before the text-field guard so it always
fires when a canvas selection exists (matches how diagram tools like Figma
behave)" is gone — Figma does not destroy a canvas selection from a keystroke
typed into a text field.

The second suggestion — making `FreehandLasso.mouseup` return to CURSOR like
`Lasso.mouseup` — was **not** taken. It is a behaviour change to the freehand
tool (its armed-with-selection state is what lets a user redraw without
re-arming), it is not needed once the guard is right, and it would land with no
filed entry asking for it. The divergence between the two marquee tools is real
and is recorded in the I3 area file's carry-forward notes. Promoted regression:
the lasso-vs-text-field cases in
[`handleDeleteKey.test.ts`](packages/axoview-lib/src/interaction/__tests__/handleDeleteKey.test.ts),
which run against BOTH marquee modes.

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

**Status:** Fixed in wave 3 (2026-07-31) via the first option — one line, in
`Cursor.mousemove`, immediately before the `getAnchor` call that splices.
`beginDragTransaction` is idempotent (`if (session.dragInProgress) return`), so
`DragItems.entry`'s own call is a no-op and the mouseup commit closes the single
bracket. Doing the splice inside `DragItems.entry` instead was rejected: entry
receives no pressed-tile context of its own and would have to re-derive the
anchor from `mouse.mousedown`, duplicating `getAnchor`'s ordering logic in a
second place. Promoted regression: [`selection-group-rules.spec.ts`](packages/axoview-e2e/tests/selection-group-rules.spec.ts) —
one gesture, one Ctrl+Z, no waypoint left behind.

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

**Status:** Fixed in wave 3 (2026-07-31), both halves as directed, with one
deviation: the snapshot lives at MODULE level in
[`ReconnectAnchor.ts`](packages/axoview-lib/src/interaction/modes/ReconnectAnchor.ts),
not in the mode state. `setMode` rebuilds the mode object on entry, so a field
on it would be clobbered by the very transition that should be capturing it —
and the single-reconnect-at-a-time invariant matches `mode === 'RECONNECT_ANCHOR'`
exactly, which is the same argument `DragItems` makes for its preview maps.
`abortReconnectAnchor` restores BEFORE committing, so the net patch set is empty
and an aborted reconnect leaves no history entry; `handleEscapeKey` calls it
through a new optional `abortReconnect` dep. `mouseup` no longer consults
`isRendererInteraction` at all. Promoted regressions:
[`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) (Escape restores + an off-canvas release
still exits) and the inverted case in `ReconnectAnchor.modes.test.ts`, whose
"does nothing when isRendererInteraction is false" test WAS this bug written
down as a contract.

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed — the id is
allocated once by `createConnectorAt` and `Connector.mousemove` now spreads the
existing anchor and replaces only its `ref`. It also stopped addressing
`anchors[1]` by index in favour of the LAST anchor, so the draw keeps working
if a waypoint is ever seeded ahead of the commit (which CONN-11's fan-out now
does). Promoted regression: [`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) — three
pointer moves, one id.

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

**Status:** Fixed in wave 3 (2026-07-31) — the drag-mode half as directed, the
click-mode half decided the other way.

**Drag mode (CONN-07):** the release reverts unless the gesture travelled past
tap-slop, and reverts again if the result is degenerate. Both checks, not one:
travel alone would still permit a drag that ends where it started.

**Click mode (CONN-13): resolved as by-design, not fixed.** A connector from a
node to a bare tile is a *deliberate free-floating endpoint* — a documented
feature (ADR 0022 addendum, and the reason `handleClickFirst` allows an empty
START), and the user can see it, select it and drag its end. Reverting it would
trade this entry for the loss of that feature. The claim the probe was testing
against — "the documented stray-empty-click revert" — is about the connector's
START, and that revert **does** exist and is unchanged. What was genuinely wrong
in click mode is the ZERO-LENGTH case, and that is now refused by the same
degeneracy rule as the drag path (see CONN-10). Promoted regressions:
[`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) and the drag-mode revert cases in
`Connector.modes.test.ts`.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, and at BOTH routes the
entry names. `isDegenerateConnector`
([`connectorHitTest.ts`](packages/axoview-lib/src/interaction/modes/connectorHitTest.ts))
is true when the two END anchors resolve to the same node or the same bare tile;
`handleClickSecond` and the drag-mode release revert instead of committing, and
`ReconnectAnchor.mouseup` restores instead of committing when a reconnect would
produce one. It deliberately judges the ENDS and ignores waypoints between them,
so the CONN-11 fan-out cannot make a legitimate connector look degenerate.

**One existing journey changed with it.** `connector-dot-and-label-placement`
built its fixture by clicking the same node twice — that route is gone. The
renderer's contract is unchanged and still covered: a degenerate connector still
arrives from an IMPORTED or legacy diagram (nothing in `validateView` or
`modelSchema` rejects one) and an SVG polyline with a single point draws
nothing, so it must still paint a visible, selectable dot. The fixture is now
built the way such a connector really reaches the app — into the model, then
through the same SYNC_SCENE path diagram-open uses. Promoted regressions:
[`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) and [`connectorHitTest.test.ts`](packages/axoview-lib/src/interaction/modes/__tests__/connectorHitTest.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) via the first direction, at the MODEL
layer rather than the router. On commit, a node→node connector whose pair
already has one is given a waypoint anchor at the index-based perpendicular
displacement of the midpoint (`parallelWaypointTile`), with the sign alternating
so a third fans to the other side. That is the automated form of the workaround
the campaign found by accident ("add a waypoint by dragging its body"): the
waypoint is a real anchor the user can drag or delete, it survives save/load,
and it rides the creation's own history entry.

Scope, stated plainly: this is **not** router-level fan-out. Bundling, curvature
and re-fanning when a connector is later deleted are not implemented — a pair
that goes from three connectors to two keeps the displacements it was given.
Making the hit-test disambiguate coincident paths was rejected as the *minimum*
option because it would leave the two lines drawn on top of each other, which is
the half of the report that actually reads as broken. Promoted regressions:
[`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) and [`connectorHitTest.test.ts`](packages/axoview-lib/src/interaction/modes/__tests__/connectorHitTest.test.ts),
which pins that the displacement never rounds back onto the direct midpoint.

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed, through one shared
helper: `connectorItemAtTile`
([`connectorHitTest.ts`](packages/axoview-lib/src/interaction/modes/connectorHitTest.ts))
is what `Connector.mousedown`, `Connector.mousemove`, the click-mode drag-release
and `ReconnectAnchor.mousemove` all call now, so the answer cannot drift between
drawing a connector and re-anchoring one. It also passes the ADR 0023
`canvasMode` + cursor `point`, which closes CONN-03's hole in the same move (that
hypothesis was FALSIFIED — the missing argument did not change the outcome at
realistic off-grid offsets — but the hole was real). Promoted regressions:
[`connector-integrity.spec.ts`](packages/axoview-e2e/tests/connector-integrity.spec.ts) and [`connectorHitTest.test.ts`](packages/axoview-lib/src/interaction/modes/__tests__/connectorHitTest.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed, and shipped with
its touch twin (I2/TCH-05) since they are one root cause seen from two paths.
[`canvasDropTarget.ts`](packages/axoview-lib/src/utils/canvasDropTarget.ts)
carries `isPointOverCanvas` plus the `isCanvasDrop` gate all three mouse
placement modes (`PlaceIcon`, `TextBox`, `Label`) now share.

One recorded belief had to be corrected to do it: `PlaceIcon.mouseup` carried a
comment saying "a hit-test can't help here: the panel overlays the renderer, and
capture makes both e.target AND elementFromPoint resolve to the icon mid-drag."
Pointer capture retargets EVENTS, not `document.elementFromPoint`, which stays a
true stacking-aware hit-test — and when the release genuinely IS over the panel,
resolving to the icon is the right answer, not a false one. Promoted
regressions: the over-panel case in each of
[`PlaceIcon.test.ts`](packages/axoview-lib/src/interaction/__tests__/PlaceIcon.test.ts),
`TextBox.test.ts` and `Label.test.ts` (whose "off-canvas but past tap-slop
places" cases encoded the old contract and were rewritten), plus
[`canvasDropTarget.test.ts`](packages/axoview-lib/src/utils/__tests__/canvasDropTarget.test.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) — the first half as directed, the
second half deliberately not.

**CTX-04** is exactly the direction: `endPan` calls `restorePreviousMode()` for
both gestures, and the middle-button branch of `handleMouseDown` records the
armed mode the way the right-button branch always did (without that capture the
shared call would still land on the `default` branch). The only remaining
difference between the two pan gestures is the stale-`mousedown` cleanup, which
is a consequence of the right mouseup being consumed, not a policy difference.

**CTX-03** adds TEXTBOX and LABEL to the switch rather than replacing it with
"put the whole previous mode object back". Restoring the object verbatim would
restore mid-action state too — a `LASSO` with a live `selection`, a
`RECTANGLE.DRAW` holding the id of a shape the pan interrupted, a `PLACE_ICON`
with a stale preview — which is precisely what the reconstruction exists to
avoid; CONNECTOR is not the only mode carrying in-flight fields, it is only the
one that also needs a model-level abort. The switch is now the same set
`handleEscapeKey` returns to Select from, for the same reason: those are the
modes a user deliberately ARMS. Transient modes (DRAG_ITEMS, the transforms,
RECONNECT_ANCHOR) describe a gesture the pan interrupted and still land on
CURSOR. Promoted regressions: the restore matrix in
[`usePanHandlers.test.ts`](packages/axoview-lib/src/interaction/__tests__/usePanHandlers.test.ts),
run for BOTH pan buttons across all seven tool modes plus a transient control,
and verified to go red (7 failures) without the middle-button capture.

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

**Status:** Fixed in wave 3 (2026-07-31). `TransformControlsManager` reads
`visibleIds` and `layers` alongside `lockedIds` now — but NOT through the
combined `isItemInteractable` predicate, because locked and hidden owe the
chrome different answers and that predicate collapses them into one:

- **locked** → the entity is on screen and selectable (from the Layers list, to
  inspect, re-layer or unlock), so it keeps its selection ring and loses only the
  handles. That rule already existed and is unchanged.
- **hidden** → the entity is not drawn at all, so it gets NO chrome, and a group
  box spanning it is suppressed exactly as for a locked member.

The fallback is `layers.length === 0`, not `visibleIds.size` — an empty set also
means "every entity is on a hidden layer", which must stay hidden (the
layer-visibility regression that rule exists for). RED-15 is a separate entry and
is NOT fixed here; the chrome gate is deliberately the belt rather than the
braces, because a layer can be hidden at any moment and a selection made before
that is still live. Promoted regression:
[`TransformControlsManager.layerGate.test.tsx`](packages/axoview-lib/src/components/TransformControlsManager/__tests__/TransformControlsManager.layerGate.test.tsx).

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

**Status:** Fixed in 72989e3a (2026-07-30) — and the fix direction above was
wrong about the cause. `Pan.mouseup` already had exactly that branch
(`handleReadonlyClick`); what defeated it was the RAF throttle.
`getMouse` rebuilds `mousedown` from the event type, and a `'mousemove'`
carries forward whatever was current when it was *scheduled* — so a frame
arriving after the press wrote `mouse.mousedown` back to `null`, and the
branch's `mousedownTile === currentTile` test could never hold. `onMouseEvent`
now flushes the throttle before any non-move event, which restores the
user's own down/up ordering for every mode that reads `mouse.mousedown`, not
just this one. The mirror-of-PTR-01/02/03 reading stands: both are the same
read-only class, fixed together. Promoted regression (two legs — the click
opens the popover, a click on empty canvas dismisses it):
[`readonly-enforcement.spec.ts`](packages/axoview-e2e/tests/readonly-enforcement.spec.ts).

**Follow-up in `44b8dda4`:** making this branch reachable exposed a second
defect in it. The pointer listener is window-bound (ADR 0018), so `Pan.mouseup`
also sees releases over the right sidebar, the toolbar and portaled overlays —
and a tile resolves for any screen point, so an off-canvas release looked like a
click on empty canvas and dismissed the panel. It unmounted the read-only
NodePanel's linked-diagram link mid-click, so the link's own handler never ran
(caught by the J5.3 journey, not by any unit gate — a window-bound listener
meeting real app chrome only shows up in the full e2e run). `Pan.mousedown`
always checked `isRendererInteraction`; the mouseup half does now too.

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

**Status:** Fixed in wave 3 (2026-07-31) — all three as directed.
`getProjectBounds` reads `getTextBoxEndTile` (so it can no longer disagree with
the hit test and the selection outline, which read the same helper) and
enumerates `view.labels`; `getUnprojectedBounds` computes `high − low` because
its inputs are PIXELS and `getBoundingBoxSize` adds the inclusive TILE-count +1.

The PROJ-03 note was **not** folded in, deliberately. Composing `offset` into
these bounds is a real latent gap, but it is not this entry's defect, it has no
reachable symptom (the 3-tile padding absorbs the largest possible half-tile
residual with >2× margin), and adding an unasserted term to a function that had
zero tests would have shipped in the same change as three that DO have symptoms.
It belongs with the ADR 0023 offset-consumer audit, not here.

The PROJ-04 fix is visible outside its own tests: `SizeIndicator`'s snapshot
moved 850→849 px and 492.4→491.4 px, which is the off-by-one this entry names,
observed somewhere nobody wrote an assertion. Promoted regressions:
[`projectBounds.test.ts`](packages/axoview-lib/src/utils/__tests__/projectBounds.test.ts)
— the first tests `getProjectBounds`/`getUnprojectedBounds` have ever had.

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

**Status:** Fixed in wave 3 (2026-07-31), and the fix is smaller than the
direction: the 2D-Y `from` override is simply DELETED. The pre-rotation rect is
the same rect the X branch builds — `size.width` along the run by `size.height`
across the rows — and the 90° rotate is what maps that thickness onto the world
axis `getTextBoxEndTile` measures it on. The special case was removing the very
extent the rotation needed. Only the `originOverride` below it stays
orientation-specific.

**Verified visually, not just by assertion.** This is renderer geometry and CI is
pixel-blind, so it was checked by screenshotting a four-row Y-orientation box in
2D before and after: the drawn text moves onto the tiles the hit range claims,
instead of sitting ~2 tiles beside them. Promoted regression:
[`projection-geometry.spec.ts`](packages/axoview-e2e/tests/projection-geometry.spec.ts) — note the fixture types its rows
through the real editor, because a direct model write of multi-line content does
NOT re-measure the scene's row count and the assertion would be vacuous.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, at BOTH item paths — the
pixel-accurate `itemAtPoint` and the raw-tile index, which built its
`"x,y" → id` Map in array order and so had the identical last-write-wins bug.
With the two consulted from different call sites they could disagree with each
OTHER as well, not just with the canvas.

One correction to the direction: **the layer order is NOT available here.**
`hitDetection` is handed a flat `HitTestScene` with no `layers` array, so
`resolveRenderOrder` is called with `layerOrder: 0` — zIndex and iso-depth are
honoured, the layer bucket is not. Promoted regression:
[`hitPaintOrder.test.ts`](packages/axoview-lib/src/utils/__tests__/hitPaintOrder.test.ts),
which runs the same case with the array order BOTH ways — the flip is the bug —
and was verified to go red without the fix.

**Residual — FIXED 2026-08-08 (wave 6, program final sweep).** The missing layer
tier had been recorded as "not a gap in practice", on the grounds that
hidden-layer entities are excluded upstream by `isItemInteractable` and that two
items on different visible layers never share a tile without colliding. **The
second half is true of NODES only** — collision is a node-placement rule.
Rectangles, labels and connectors overlap across layers freely, so the divergence
was reachable:

> A rectangle on a high-`order` layer paints above a rectangle on a lower one, but
> the picker resolves both with `layerOrder: 0` — so the lower-layer rectangle
> wins on `zIndex` and takes the click from the one visibly on top.

`HitTestScene` now carries the view's `layers` (threaded through `useSceneData`,
so every interaction mode gets it from `state.scene` with no call-site change),
and both branches that re-derive paint order — items and rectangles — resolve the
bucket from it. `getItemTileIndex`'s WeakMap now keys on `layers` as well as on
`items`, because a layer reorder replaces only the former.

**Re-derived while fixing, and the scope grew by one tier.** The residual was
written before the GPU-13 merge landed, and the merge changed the thing it
describes: with four canvases at fixed CSS z-indices, entity TYPE beat everything
cross-type, so "the picker cannot see the layer bucket" was the whole gap. The
merged canvas sorts every bulk kind through one `compareSceneDrawOrder`, which
puts layer **and z-index** above type rank — so the picker's fixed branch
precedence (items → text boxes → connectors → rectangles) could not express
either. A rectangle with `zIndex: 9` painted over a node and the click still
selected the node. Both are closed together: the picker now finds each branch's
own topmost hit as before and ranks the winners with the renderer's comparator.
At equal layer and z-index `SCENE_TYPE_RANK` reproduces the old precedence
exactly, so an unlayered document with no z-order set behaves as it always has —
asserted as a CONTROL in the gate.

**Text boxes stay out of it, deliberately.** `Renderer` mounts them in a DOM
`SceneLayer` above `SceneCanvas`, so a text box paints over every bulk entity
whatever its layer says; ranking one by a layer order the renderer does not
consult would introduce a divergence rather than close one. Wave 5 recorded text
boxes and connector label chips as the out-of-sort set with their own follow-up
trigger, and §5 of the gate pins the exclusion.

Gate widened in the same change (its §4 pin said closing this must come here and
do exactly that):
[`pickerAgreement.contract.test.ts`](packages/axoview-lib/src/utils/__tests__/pickerAgreement.contract.test.ts)
— 22 tests, §4 the layer tier and §5 cross-type. Verified able to go red four
times over, one per moving part: the item sort's layer term, the rectangle sort's
layer term, the cross-type ranking, and the tile-index cache's `layers` key.

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

**Status:** Fixed in wave 3 (2026-07-31). `ConnectorsCanvas` shifts the first
and last vertex by the anchored node's residual — but NOT by "the same endpoint
delta": `connectorEndpointVertexDelta` exists because the DOM path draws
vertices in tile-space and then projects them, so a screen-plane offset has to be
inverted through the projection first. The WebGL path's points are already
SceneLayer px (`getTilePosition` output) and `offset` is a SceneLayer-px
residual, so composing it is the plain vector add `renderedGeometry` documents.
Using the DOM helper here would have applied the inverse projection twice.
The lookup map is built only from items that carry a residual, so an all-snapped
diagram pays nothing on the render path.

The suggested `renderedGeometry.invariant.test.tsx` case was not added: that
suite is a jsdom render/hit-zone corpus and the defect is in a WebGL vertex
buffer, which it cannot observe. The promoted regression is
[`projection-geometry.spec.ts`](packages/axoview-e2e/tests/projection-geometry.spec.ts) instead, which drives the real thing —
select the connector so `Renderer.connectorHybridIds` PROMOTES it to the DOM
path, which is the swap that made the wire jump.

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

**Status:** Fixed in wave 3 (2026-07-31), all three, with one correction to (a).

**(a) — generation-tagged, not a free-list, and NOT "evict when a key's content
changes".** That last variant cannot work here: the leak is KEY CHURN, so there
is no "same key, new content" to detect — `texKey` interpolates the node name
and every style token, so a rename mints a wholly new key. A free-list is also
the wrong shape for a SHELF packer (reclaiming an interior slot is what a shelf
packer specifically cannot do). Instead every key touched during a build is
recorded, and a build that leaves more dead keys than live ones marks the atlas
stale so the next `beginInstances` compacts through the reset machinery that
already existed. The threshold is RELATIVE (`dead > 8 && dead > live`) because a
256 atlas holds ~15 chips — any fixed threshold quiet enough for a big atlas is
never reached on a small one, and an absolute one would also fire on a
viewport-culled pan, where compacting re-rasterises the whole visible set every
frame.

**(b) — `SpriteBatch.atlasOverflowed()`**, true at most once per overflow
episode and re-arming after any build that packs everything, so `NodesCanvas`
and `LabelsCanvas` schedule exactly one follow-up rebuild and a scene that
genuinely does not fit degrades instead of spinning. This is what closes
**R3/GPU-14** as well: the layer reported a completed build while painting an
incomplete frame (276 of 300 chips), and nothing asked for another.

**(c)** one `console.warn` per context when `MAX_TEXTURE_SIZE` clamps.

The recording WebGL2 stub was promoted out of the lane to
[`src/webgl/glStub.ts`](packages/axoview-lib/src/webgl/glStub.ts) — `glSpriteBatch`
had ZERO tests and this is the only way to reach the real packer from jsdom.
Promoted regressions: [`glSpriteBatch.atlas.test.ts`](packages/axoview-lib/src/webgl/__tests__/glSpriteBatch.atlas.test.ts). Note what the
churn test asserts: not "never misses" but "never STAYS unpacked" — a build that
overflows drops the chip for one frame and the next compacts. One dropped frame,
not a dead layer.

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

**Status:** Fixed in wave 3 (2026-07-31) via the first half: `isWebGL2Supported`
builds a real `createSpriteBatch` on a 64px atlas and destroys it, so a shader
compile or link failure now routes to `WebGLUnsupportedScreen` — an actual
explanation — instead of a silently blank canvas. It costs one shader compile
once per tab (memoised for the tab's life) and the probe context is released
either way. The in-code NOTE that recorded this as a known weakness ("strictly
WEAKER than what createSpriteBatch needs … the layers surface that with a
console.warn and a blank layer") is gone; it was the bug written down as a
caveat.

**The per-layer notification + retry was NOT added**, deliberately. With the gate
agreeing with the substrate, the per-layer path is only reachable for a failure
that appears mid-session — and mid-session context LOSS already has a real
recovery path (`attachContextLossRecovery`). Adding a notification surface for
the residue would be speculative UI with no entry asking for it. Promoted
regressions: [`glSpriteBatch.atlas.test.ts`](packages/axoview-lib/src/webgl/__tests__/glSpriteBatch.atlas.test.ts), including the control
that the gate is not simply always-false now.

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

**Status:** Fixed in wave 3 (2026-07-31) via the first direction — the hit
threshold FOLLOWS the draw threshold, for both label kinds:

- **Floating Labels (GPU-04).** `LabelsCanvas` has no zoom gate, so
  `LabelHitLayer` no longer has one either. Its `HIT_MIN_ZOOM` is gone.
- **Node names (GPU-05).** The chip draws below `LABEL_LOD_ZOOM` whenever "keep
  labels readable" is on, so `NodeLabelHitLayer` asks the same question the
  renderer asks: `isNodeLabelDrawn(zoom, readableLabels)`.

The rule is stated where both sides read it —
[`config/labelSettings.ts`](packages/axoview-lib/src/config/labelSettings.ts),
which is also where `LABEL_LOD_ZOOM` now lives (it was module-private to
`NodesCanvas`, which is how the two thresholds came to be authored
independently). The div-count concern the old comment gave as the reason for the
0.4 floor is real but unchanged in shape — one proxy per VISIBLE label — and
"hard to grab" beats "impossible to grab while visible". Promoted regressions:
[`itemRaster.ellipsize.test.ts`](packages/axoview-lib/src/webgl/__tests__/itemRaster.ellipsize.test.ts), which includes the case that pins
the old fixed 0.4 as disagreeing with the draw decision.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, plus one thing the
direction did not resolve. `getImage` gained `img.onerror` and the
already-failed `complete && naturalWidth === 0` branch; both drop the url from
`iconCacheRef` (so the next build re-requests — GPU-03's transient 503 recovers)
and record it as resolved-as-unavailable (so it stops holding
`data-all-icons-drawn` down — GPU-01).

Those two pull against each other: "retry on the next build" and "stop treating
it as pending" would, together, re-request a permanently dead url on every
geometry rebuild forever. The failure record is therefore an attempt COUNT with
a cap (`MAX_ICON_LOAD_ATTEMPTS = 3`) rather than a boolean — bounded on both
sides, because zero retries is what cached a transient failure as permanent and
unbounded retries is a request storm.

**The tombstone was NOT drawn.** The suggestion mirrors what an unknown icon
*ref* does, but the two cases differ: an unknown ref means "this diagram names an
icon that does not exist", where a tombstone is informative, while a failed
*load* is usually transient (offline, a slow CDN, a 503) and permanently
stamping a tombstone over a node whose icon is merely late would misreport it.
The chip and stalk still draw, as they did. Promoted regression:
[`gpu-icon-recovery.spec.ts`](packages/axoview-e2e/tests/gpu-icon-recovery.spec.ts).

**Addendum (wave 4, 2026-07-31) — the attempt budget is session-scoped, and the
GPU-03 spec was racing it.** The recovery test went red on a machine running ~4×
slow, and the cause was the reconciliation above rather than any wave-4 change.
`markFailed` deletes the cache entry AND schedules a redraw, so the three
attempts burn back-to-back over a few frames on their own — `forceRebuilds` is
not what drives them. The spec flipped its fake server from `down` to `up`
*after* polling for the first request, which is a race against that cascade: on
a fast machine the flip landed before attempts 2–3, on a slow one the budget was
already spent and `forceRebuilds` legitimately produced nothing. **The layer had
given up, which is GPU-01's bound working as designed.** Fixed spec-side — the
flip now happens inside the `down` branch, on the first request, so exhaustion is
impossible and the assertion tests what it names.

**The reconciliation was deliberately NOT changed.** Granting fresh attempts on
an explicit geometry rebuild is defensible — it would mean a user who fixes their
network mid-session sees the icon return — but it re-opens exactly the tension
this entry settled, and it would make the bound depend on how often something
happens to rebuild. If it is revisited, the shape to consider is a user-visible
"retry icons" affordance (an explicit intent, not an incidental rebuild), which
keeps GPU-01's bound honest.

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

**Status:** Fixed in wave 3 (2026-07-31) with the MEASURED ELLIPSIS, and the
non-parity is deliberate and stated rather than closed.

`rasterizeNodeChip` truncates the name to the chip's inner width with a binary
search over an appended `…`. What it does NOT do is match the DOM, which wraps.
Wrapping the bulk chip means `measureNodeLabel` returning a line list and
`chipH` growing per line — which changes chip geometry for every node in the
diagram AND for `NodeLabelHitLayer`, whose proxy mirrors that measurement. That
is a layout change to the whole node layer, verifiable only by eye, and it is
not what this entry's headline asks for. Truncated-with-an-ellipsis and wrapped
are both legible; cut mid-glyph at the texture edge is not, and that is what has
gone. **The shared line-breaking decision the direction asks for is still
unbuilt** — recorded here so the next reader knows the two paths still each
decide, they just no longer produce a rendering defect. Promoted regression:
[`itemRaster.ellipsize.test.ts`](packages/axoview-lib/src/webgl/__tests__/itemRaster.ellipsize.test.ts).

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

**Status:** Open, cosmetic. **Deliberately NOT fixed in wave 3** — the one R2/R3
entry left open, with the analysis sharpened so the decision it needs is properly
framed.

Neither offered direction is the small change it looks like:

- **"an analytic rounded-rect `shapeMode`"** would cover the FILL quad only.
  `RectanglesCanvas` does not draw a rectangle as one quad: the border is four
  analytic-AA line quads plus discs at the corners for the joins. A rounded fill
  under square-cornered edges is worse than what is there now, so this option
  is really "restructure the bulk rectangle border path", not "add an SDF mode".
  (The instance layout would accommodate it — `i_misc.w` is spare and the edge
  lengths are derivable from `i_basis` — so the shader is not the obstacle.)
- **"drop the DOM rect's `cornerRadius` to 0"** is one line, but it changes the
  look of every grouping rectangle in the product, permanently, to fix a
  momentary shape change on grab. That is a product decision, not a bug fix.

Repro:
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

**Status:** Fixed in wave 3 (2026-07-31): the lower bound is `MIN_ZOOM`, and
the product question is ACCEPTED rather than engineered around. A diagram too
large to fit at `MIN_ZOOM` is framed with content off-screen. Fit means "get as
close to the whole thing as the zoom range allows", not "widen the zoom range" —
a content-dependent `MIN_ZOOM` for this one path would let fit reach a zoom the
user then cannot return to, because every other control (the buttons, the wheel,
the pinch) still clamps at `MIN_ZOOM`. Promoted regression:
[`fitToView.test.ts`](packages/axoview-lib/src/utils/__tests__/fitToView.test.ts),
with a mid-sized control so the clamp cannot have flattened the function into a
constant.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, through the existing
`makeInteractableCheck` helper rather than a new hook — and the "cannot skip the
gate by omission" half is done as a CLASS GATE instead, which is what ADR 0047 §3
asks for and what a helper alone would not achieve (a new layer can decline to
call a helper; it cannot decline to be enumerated).
[`layerFilter.contract.test.ts`](packages/axoview-lib/src/components/SceneLayers/__tests__/layerFilter.contract.test.ts) lists every canvas paint and affordance
layer with what its filter must cover and why, and a layer added without an entry
fails on the enumeration. It was verified able to go red — and the first version
of it was NOT: an unused `import { useLayerContext }` satisfied the scan, so the
gate now strips imports and comments before looking.

Locked is deliberately NOT filtered here: a locked connector's label still DRAWS,
it just cannot be edited. Hidden and locked are different verdicts, and the gate
records which layers owe which.

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

**Status:** Open. **Deliberately not attempted in wave 3.** Both directions are
new interaction surface rather than a corrected filter or gate, which is what the
rest of this wave was: option one mounts a whole new hit-proxy layer (and then
owes the layer-filter class gate an entry, a locked/hidden verdict, and a zoom
LOD decision like every other proxy — see
[`layerFilter.contract.test.ts`](packages/axoview-lib/src/components/SceneLayers/__tests__/layerFilter.contract.test.ts)),
and option two adds `<a>` resolution to the canvas click path, which is the
pipeline wave 3 spent its I-block budget narrowing rather than widening.

The observation that carries forward is the entry's last sentence, and it is the
strongest argument for doing this properly: the ADR 0034 link feature has NO
end-to-end coverage of the resting state at all, so whichever route is taken has
to arrive with that coverage rather than after it. Repro:
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

**Status:** Fixed in wave 5 (2026-08-02), with R3/GPU-13's canvas merge, as the
wave-3 note said it had to be. The restructure it predicted is exactly what
landed: "where the node paints" and "where its interactive chrome lives" are now
two different things.

With one merged bulk canvas (ADR 0038 §8) the promotion could not simply be
re-stacked — a promoted element is a DOM sibling of the canvas, so it can only
paint ABOVE or BELOW the whole of it, never in its own place in the document
order. So **selection promotes nothing**: `hybridIds` in
[`Renderer.tsx`](packages/axoview-lib/src/components/Renderer/Renderer.tsx) drops
`itemControls` and the element stays in the sorted draw. Only selection CHROME
floats (the TransformControls handles and outline, which are their own overlays
and always were). Owner ruling, GPU-13 brief §7 Q1.

**What had to change with it, and was not obvious from the entry.** The DOM
overlay was also how F2 inline-rename got a `contentEditable`, and `<Node>`
learned it should open one from a synchronous `inlineEditNodeName` window event —
which a node that has not mounted yet cannot hear. The rename INTENT is store
state now (`uiState.inlineEditNodeId`), it is what promotes, and the same write
un-culls the node, so RND-14's "reveal, then act" ruling still lands a rename
started on an off-screen selection. The three dispatch sites (F2, the context
menu, the label-chip double-click) write the store for a node and keep the event
for text boxes and connector labels, which are always DOM.

**The connector half went the other way.** A selected connector was promoted for
its S3/A2 halo, which is DOM-only in `<Connector>`; promoting it now would lift
its BODY above every node. The halo is emitted by the bulk instead, on the
connector's own instance run, with the same 3.5×/0.35 metrics — so the DOM
connector layer keeps only the degenerate-dot and unroutable-badge cues, which
the bulk cannot draw at all.

**Two DOM promotions still float, deliberately**, and both are named in ADR 0038
§8: the DRAGGED node/rectangle (the `--ff-drag` compositor preview needs a real
element, and the brief's sign-off keeps drag out of the ruling) and the
inline-rename session. Dragging is not selecting.

Promoted regression:
[`cross-type-z-order.spec.ts`](packages/axoview-e2e/tests/cross-type-z-order.spec.ts)
— selecting a node that sits under a higher-`zIndex` rectangle must not change
the pixels at the overlap, and no DOM overlay copy may mount; a companion case
proves renaming still DOES promote, so the affordance was not silently deleted.
The probe is retired.

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

**Status:** Fixed in wave 3 (2026-07-31) via the second direction, and decided
with GPU-04/GPU-05 as suggested — one predicate,
`isNodeLabelDrawn(zoom, readableLabels)` in
[`config/labelSettings.ts`](packages/axoview-lib/src/config/labelSettings.ts),
read by `NodesCanvas` (bulk paint), the DOM `<Node>` overlay (this entry),
`NodeLabelHitLayer` (GPU-05) and stated as the rule the whole ladder follows:
**nothing may be painted at a zoom where it cannot be hit.** `LABEL_LOD_ZOOM`
moved there too — it was module-private to `NodesCanvas`, which is how the
thresholds came to be authored independently in the first place.

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

**Status:** Fixed in wave 3 (2026-07-31), decided alongside RND-01 as suggested.
The call: **fit targets the VISIBLE canvas.** Letting panels overlap is
defensible when they are translucent or transient; ours are opaque and
persistent, so anything behind them is simply not shown, and a user who asked to
see everything could not.

Only the WIDTH is inset. The docks are full-height columns on the left and
right; nothing opaque is stacked above or below the canvas, so subtracting height
would shrink the fit for no reason.

**One gap, stated rather than papered over:** the file-explorer column is NOT
subtracted. Its open state is a PROP the app passes to `LeftDock`, not uiState,
so `useDiagramUtils` cannot see it — a fit taken with the explorer open is still
~280px too wide. Narrower than the bug this fixes, and it needs the flag lifted
into uiState (or the viewport measured rather than computed) to close properly.
Promoted regression: the responds-to-width case in
[`fitToView.test.ts`](packages/axoview-lib/src/utils/__tests__/fitToView.test.ts)
— without it the inset could be a silent no-op.

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

**Status:** Fixed in wave 3 (2026-07-31) via the first option: `ID_KEY_SEP =
'\u0000'`, applied to all FOUR joined-id primitives in `Renderer` (dragged
items, dragged rectangles, resizing nodes, selected connectors) — the campaign
found it through the drag preview, but every one of them had the same shape.
Deriving the Set from `mode.items` with the key only as a memo dependency was
rejected: it re-introduces an object dependency the primitive selector exists to
avoid, and the point of the key is that the selector re-runs on drag start/end
rather than per frame.

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

**Status:** Fixed in wave 3 (2026-07-31). `NodeLabelHitLayer` gates its EDIT
gestures on `lockedIds`, exactly as `LabelHitLayer` does — and the "structurally
rather than by hand" half is a CLASS GATE
([`layerFilter.contract.test.ts`](packages/axoview-lib/src/components/SceneLayers/__tests__/layerFilter.contract.test.ts)) rather than a shared hook. A hook is
the weaker instrument here: a new layer can simply not call it, which is how this
class produced four instances in the first place. The gate enumerates every paint
and affordance layer, and one added without an entry fails.

Edit-mode only, matching the sibling: the view-mode proxy is a pure hover
surface, and the tile hit-test the other element types hover through never
consults `lockedIds`, so parity keeps a locked node's link card reachable while
presenting.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed, and decided together with
GPU-04 and GPU-05 as suggested. `NodeLabelHitLayer` now carries the same
`display: contents` wrapper publishing `--axoview-label-scale` from a direct
store subscription (no per-zoom React re-render), and each proxy composes it into
`transform: scale(...)` about the same centre the chip scales about. The rule the
three share is stated once in
[`config/labelSettings.ts`](packages/axoview-lib/src/config/labelSettings.ts).

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed: the layer mounts
for `editable || viewMode`, and in view mode the press, double-click and
context-menu handlers are all `undefined` — so the chip is hover-only, a linked
node's name raises its card, and a pan started over the chip still reaches the
window-level pan handlers. The cursor drops from `grab` to the default there
too, since a view-mode chip is not grabbable.

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

**Status:** Open. **Deliberately not attempted in wave 3**, with the scope
corrected — both offered options are wider than the entry assumed.

"Pack it into the sprite instance" is the right shape and is feasible (`i_misc.w`
is spare, and the vertex shader's `mix(1.0, u_counterScale, i_misc.x)` would
become a per-instance select), but it is NOT the whole fix: the counter-scale has
**three** consumers, not one. `LabelHitLayer` and `NodeLabelHitLayer` publish
`--axoview-label-scale` from the same base-font computation, so a per-node scale
landed on the GPU alone would leave both grab boxes scaled differently from the
chips they proxy — which is R5/OVL-12, the bug wave 3 just fixed, reintroduced
from the other side. All three have to move together.

The "disable it for restyled labels" alternative is genuinely cheap but is a
regression for the user it is meant to serve: a node whose label the user
enlarged would stop being kept readable precisely because they styled it.

Wave 3 did make the ladder decidable rather than scattered — the LOD predicate
and the constants now live in
[`config/labelSettings.ts`](packages/axoview-lib/src/config/labelSettings.ts),
which is where a per-node scale would be introduced. Repro:
[`scale-nudge-ovl-02-14.explore.test.ts`](packages/axoview-lib/src/__explore__/R5/scale-nudge-ovl-02-14.explore.test.ts).

**Direction ruled 2026-07-31 (owner review, wave-3 handoff):** fix in wave 4 as
**one PR moving all three consumers together** — the per-label factor is derived
in exactly one place (`config/labelSettings.ts`, fed the label's *effective*
font so `factor = max(1, floor / effectiveOnScreenPx)`: an enlarged label above
the floor gets no boost, a shrunk one is lifted to the floor), consumed by the
GL instance buffer (`i_misc.w`, `mix` → per-instance select) and by both hit
layers' `--axoview-label-scale`. Ships with a contract gate (shape of
`layerFilter.contract`) forbidding any counter-scale computed from
`LABEL_BASE_FONT_PX` outside the shared derivation, and a dated ADR 0015
addendum ("on-screen font size" now means the per-label effective size — ADR
0032's per-node sizes postdate 0015). The "disable for restyled labels"
alternative is **rejected** for the reason this entry gives. Rendered output
changes for styled labels → full Playwright run, per the wave-2/3 lesson.

**Status:** Fixed in wave 4 (2026-08-02), as ruled — one change, the derivation
in `labelSettings.labelCounterScaleFor`, every consumer moved with it, the
contract gate, the dated ADR 0015 addendum, and the full Playwright run.

**Correction to the scope: there are SIX consumers, not three.** The entry names
the GL node layer and the two hit layers; the sweep found `LabelsCanvas` (the GL
floating-Label layer), `ConnectorLabel` and `ExpandableLabel` computing the same
factor from the same constant. All six moved. Leaving any one behind would have
been the OVL-12 failure the entry warns about — the counter-scale decides where
a *grab box* sits as well as how big a chip is drawn.

Two structural consequences the ruling implies but does not state, both of which
turned out to be the actual work:

- **The GPU factor had to become per INSTANCE.** `i_misc.w` was spare exactly as
  the entry says, and the shader's `mix(1.0, u_counterScale, i_misc.x)` became a
  per-instance select. The uniform survives as the fallback for an instance that
  carries no per-instance value, so an emitter that has not been migrated keeps
  its old behaviour rather than collapsing to 1.
- **The DOM factor had to become per ELEMENT.** All three DOM consumers published
  a single `--axoview-label-scale` on a shared `display: contents` wrapper —
  correct while the factor was one value, and unable to carry a per-label one.
  Each label element now carries `data-label-font` and the store subscription
  sets the variable on that element, which preserves the reason the wrapper
  existed: pan/zoom writes the DOM directly and never re-renders React.

The `maxCounterScale` bound still governs, and it is worth being explicit that
this does not fully rescue every label: one shrunk past what the cap can lift
lands short of the floor. That is the trade ADR 0015 already made, now applied
per label instead of once for everyone.

Contract gate:
[`labelCounterScale.contract.test.ts`](packages/axoview-lib/src/config/__tests__/labelCounterScale.contract.test.ts),
red-verified three ways — a second derivation planted **inside the exempted
file** (the hole wave 4's lean-save gate had, and the reason the exemption names
the FUNCTION rather than the file), a hit layer reverted to the wrapper
variable, and a consumer silently dropping the counter-scale altogether.

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

**Status:** Fixed in wave 3 (2026-07-31) exactly as directed, through
`batchUpdateLabelTiles` — the same updater `DragItems.mouseup` commits a label
move with — inside the existing bracket, so one press is one undo step however
many types it touched. The residual rides along like every other type (SEL-01).

**The mixed-selection question is answered: move what it CAN**, i.e. today's
behaviour, kept deliberately. A selection of a node plus a connector is the
common shape (Ctrl+A produces it), and refusing the whole nudge because one
member is not tile-nudge-able would make the arrows useless on most real
selections. Promoted regressions: [`handleArrowKey.test.ts`](packages/axoview-lib/src/interaction/__tests__/handleArrowKey.test.ts),
including the mixed Label + node case asserting ONE transaction.

**Rig correction (2026-07-31).** Promoting this probe surfaced a defect in the
JEST half of the exploratory lane, in the same family as wave 2's TCH-14
protocol-error false red. One of OVL-14's two `it.failing` probes was written
`expect(calls.scroll, 'the canvas must not pan').toEqual([])` — and Jest's
`expect` **throws `"Expect takes at most one argument."`**, so that probe was red
for the arity error rather than for the bug, and would have stayed red after any
fix. (Playwright's `expect(value, message)` DOES take a description, which is
where the habit came from; the campaign's e2e invariant fixture uses it 178 times
and is unaffected — had it not worked there, every explore spec would have failed
at the fixture rather than at its assertions.)

The bug itself is unaffected: OVL-14's other `it.failing` and both
characterizations used the single-argument form and were genuinely red. A scan of
every Jest suite in the repo, main and lane, found this to be the **only**
occurrence, so no other entry's evidence rests on it.

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

**Status:** Fixed in wave 3 (2026-07-31) as directed: a `FAILED` symbol in the
aspect cache, seeded synchronously on the next mount, so a dead url is requested
once per session instead of on every mount of every selection outline naming it.

The caches were **not** unified while fixing GPU-01/GPU-03, and the reason is
worth recording: they answer different questions. `useImageAspect` needs the
natural aspect ratio and can serve a square fallback immediately;
`NodesCanvas.getImage` needs a DECODED bitmap safe for `texSubImage2D` and must
not serve anything until `decode()` resolves (an undecoded upload bakes a black
atlas tile). Unifying them means one cache carrying two readiness states, which
is a design change rather than a bug fix. Both now memoise failure, which was the
actual defect on each side — noting that they had it wrong in OPPOSITE directions
(this one never cached a miss; GPU-03 cached a transient one as permanent).

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

**Status:** Fixed in wave 3 (2026-07-31) via the first option — the `Cursor`
ghost reads the same `cursorTileResidual` + `isSnappedPlacement` pair the
placement modes do, and composes the residual through
`getRenderedDragTransform`, the same wrapper `<Rectangle>` and `<TextBox>` use.
A snapped placement renders with no wrapper at all, so the common path is
untouched.

The "better" option was rejected on cost: publishing the resolved placement to
uiState means a store write per pointer MOVE on the hot path, which is precisely
what the CSS-preview design exists to avoid. Reading the same two functions is
the cheap half of the guarantee — a divergence would now require changing one of
them.

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

**Status:** Fixed in ded36c6b (2026-07-30) — `markDriveScopeMissing()` now performs the
same `clearAuthTimeout()` + `_waiters` drain + `_absorbStaleError` reset
`markExpired()` always did, exactly as the fix direction proposed. The waiters
are **rejected** rather than resolved: a resolving piggybacker reads the
just-nulled `accessToken` and reports "Not signed in", which is the AUTH-06
entry below — `GoogleDriveProvider.request()` consults the status instead and
names the real condition. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — both call sites derive the flag from one helper,
as the fix direction proposed. But the derivation the entry implied (read the
status) is not sufficient, and the promoted test caught it: fixing AUTH-01 moves
the session OUT of `REFRESHING`, while the superseded GIS request is still
genuinely outstanding in the browser — which is the very route into
`grantDriveAccess`. The store records that separately now
(`_silentRequestOutstanding`), set when a `prompt: ''` request is issued and
spent by the first callback that arrives, so it can absorb at most one error per
silent request. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — `markExpired()` returns early when the status is
`AUTHENTICATING`. Of the two options the fix direction offered, "skip the
transition entirely" was chosen over "record it as pending": if the interactive
attempt fails, `_onError` reaches `UNAUTHENTICATED` on its own, so the pending
machinery would have had nothing to add. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — both halves the fix direction named. The synthetic
timeout is tagged (`isTimeoutReason`) so `_onError` never absorbs it, and an
error that IS absorbed re-arms the deadline it did not spend, so the request
still has one. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — `signIn()` attaches a waiter and returns when a
request is already `AUTHENTICATING`, the same piggyback `getValidToken()` uses.
One GIS request, one popup, and both callers settle from it. Promoted
regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — at the consumer, not the waiter. The scope-less
waiters are rejected now (AUTH-01), so every piggybacker still reads `null`;
what changed is that `GoogleDriveProvider.request()` no longer assumes a null
token means "signed out". It reads the auth status, and in
`DRIVE_ACCESS_REQUIRED` throws a typed
`DriveError('Google Drive access is required', 403, 'drive-scope-required')` —
so the caller can suppress its own surface while the blocking dialog owns the
recovery, instead of contradicting it. Promoted regression: [`GoogleDriveProvider.authFailures.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.authFailures.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — `DriveError` carries the classification as a
`reason` field (`rate-limit` / `drive-scope-required` / `session-expired` /
`network` / `unknown`), and `handleCreateBlankDiagram` tests that instead of the
bare status. An exhausted rate limit keeps its valid token and its retriable
treatment. Also fixed while here: `DriveError`'s prototype chain, which
downlevelled `extends Error` had broken — `instanceof` read false and
`constructor.name` read `'Error'`, the same trap the DRV-08 rig note records for
`DriveShareError`. Promoted regression: [`GoogleDriveProvider.authFailures.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.authFailures.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — exactly as the fix direction proposed: the scope
403 is classified in `request()` (see AUTH-08) and calls
`markDriveScopeMissing()` there, so save, load, list, rename, move, folder
operations and the tree manifest all inherit the recovery ladder rather than one
call site re-implementing it. Promoted regression: [`GoogleDriveProvider.authFailures.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.authFailures.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — the second of the two options: a userinfo failure
installs a placeholder identity (`name: 'Google account'`, no email) rather than
leaving `user` null, so `AuthControl` takes its signed-in branch and the Sign
out item renders. Rendering from `status` alone was rejected because
`needsReconnect` reads `user` too, so the null case would still have had to be
handled. The placeholder is in-memory only — it is never written as a profile
hint, which is the AUTH-13 ruling. Promoted regressions: [`AuthControl.identity.test.tsx`](packages/axoview-app/src/components/__tests__/AuthControl.identity.test.tsx) (the DOM
consequence) and [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts) (the store half).

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

**Status:** Fixed in ded36c6b (2026-07-30) — the first of the two options, plus the general rule
the second implied. `signIn({ prompt: 'select_account' })` gets Google's chooser
without spending the session first, so `handleSwitchAccount` no longer calls
`signOut()` at all; and a cancelled interactive request now restores a
still-valid session instead of dropping to `UNAUTHENTICATED`, so closing the
chooser leaves the viewer exactly where they were — identity, reconnect
affordance and token intact. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — `markDriveScopeMissing()` calls
`clearProfileHint()` like its `_onToken` twin, so the two functions that park the
session in the same state leave the same trail. Promoted regression: [`authStore.sessionIntegrity.test.ts`](packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts).

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

**Status:** Fixed in ded36c6b (2026-07-30) — the "single invalidate + re-probe entry point" the
fix direction asked for. `signOut()` fires a session-reset handler that
`GoogleDriveProvider` registers (the store cannot import the provider — the
provider reads the token from it), clearing `rootFolderId`, `rootProbe` and the
`axoview-drive-root` localStorage entry. The parenthetical is covered too: a
grant whose userinfo names a DIFFERENT email fires the same reset, so switching
account without signing out is handled. The related in-session staleness the
entry names (the root cache is never revalidated within a session) stays open —
this closes the account-boundary half. Promoted regression: [`GoogleDriveProvider.authFailures.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.authFailures.test.ts).

## The first autosave after sharing orphans the public snapshot

**Found by:** exploratory campaign SHARE-01

**Symptom:** Copy a share link, keep editing, and the link keeps working while the
app forgets it exists. Pressing Share again produces a *different* link, so the one
already sent to colleagues is now a frozen copy nobody can revoke: Unshare and
Delete both clean up only the newest uuid.

**Root cause:** `saveDiagram` in
[`routes.js`](packages/axoview-backend/src/routes.js) implements PUT as a whole-document
replace (`{ ...body, id, lastModified }`), and the app's autosave body is
`leanIfModel(model)` where `model` comes from the lib model store — a `modelSchema`
document (title/items/views/icons/colors) with no `shareUuid`, because `shareUuid` is
a backend-only field. So the first autosave after sharing deletes it while
`public/<uuid>` stays on disk. `shareDiagram` then sees no `shareUuid`, mints a new
one, and `unshareDiagram`/`deleteDiagram` — which both cascade off
`diagram.shareUuid` — can never reach the previous snapshot again. Measured: after
one autosave the snapshot still answers 200 and the diagram's `shareUuid` is
`undefined`; after a second Share there are two live snapshots and unshare removes
one. `patchDiagram` (rename / trash) preserves the field, so the loss is specific to
the full replace.

**Workaround:** none for an already-orphaned snapshot short of deleting the file
under `<STORAGE_PATH>/public/`. Sharing again immediately before sending the link
minimises the window.

**Status:** Fixed in 6878df1c (2026-07-30) — the first of the two options: `saveDiagram` reads
the existing document and carries the server-owned fields (`shareUuid`,
`created`) across, the way `patchDiagram` already did, so the two write paths
now agree about what a client may overwrite. The side index was rejected as a
larger storage change for the same outcome. The same `stripServerOwnedFields`
helper backs SHARE-15's PATCH filter, so "the client cannot write these" is one
rule rather than two. Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## A diagram id can overwrite the folder tree — reserved storage keys are not reserved

**Found by:** exploratory campaign SHARE-02

**Symptom:** A diagram whose id is `folders` destroys the whole folder tree. Every
folder disappears from the file explorer, and the next folder the user creates
"heals" `folders.json` by finishing the deletion. The diagram that caused it is
invisible in the listing, so nothing in the UI points at the cause. `tree-manifest`,
`metadata` and `diagrams-index` behave the same way.

**Root cause:** two layers each assume the other validates. `assertId`'s
`ID_PATTERN` (`/^[a-zA-Z0-9_-]{1,64}$/`) accepts all four reserved names, and the fs
adapter's `keyToPath` deliberately flattens `diagrams/<id>` to
`<STORAGE_PATH>/<id>.json` to preserve the pre-5A layout — the same file the
`folders` key resolves to. `saveDiagram` has no existence check at all, so
`PUT /api/diagrams/folders` returns 200 and replaces the tree. `createDiagram` looks
accidentally safe (its existence probe reads `folders.json` and 409s) but only when
a `folders.json` already exists; on a fresh workspace the POST succeeds and creates
`folders.json` as a diagram, which the user's first folder then wipes. The
read side already knows these names are special — `listDiagramMeta` skips them,
which is why the offending diagram is invisible.

Note for future probes: the in-memory adapter used by the regression suite keeps
`diagrams/folders` and `folders` in separate map slots **and** carries its own
`RESERVED_DIAGRAM_KEYS` filter, so the collision is invisible against the double.
Only the fs adapter reproduces it.

**Workaround:** don't import or create a diagram with one of those four ids. There is
no recovery for the lost folder tree beyond re-creating the folders.

**Status:** Fixed in 6878df1c (2026-07-30) — the first of the two options: `assertId` rejects
the four reserved names with a 400. Giving the fs adapter a real `diagrams/`
subdirectory is the more thorough fix, but it changes the on-disk layout every
existing deployment has, for the same outcome. Documented in
[deployment.md](docs/deployment.md) §D alongside the id pattern. The probe note
about the in-memory adapter hiding the collision is why the guard sits in the
ROUTE layer, above both adapters. Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## Concurrent folder writes silently lose one another (folders.json has no locking)

**Found by:** exploratory campaign SHARE-03

**Symptom:** Two folder operations that overlap in time both report success and one
is silently discarded. Most visible during a project import, which dispatches folder
creates in a burst, or when an import overlaps a user's rename.

**Root cause:** every folder route in
[`routes.js`](packages/axoview-backend/src/routes.js) — `createFolder`,
`renameFolder`, `moveFolder`, `deleteFolder` — reads the entire `folders.json` array,
mutates a copy and writes the whole array back, with no lock, no version and no
compare-and-swap. Two requests that read before either writes each produce a
complete array missing the other's change; the later `put` wins. The adapter's
tmp-file + rename gives *file* atomicity (ADR 0010 Decision 3) but that is the wrong
granularity — it guarantees no torn file, not no lost update. Measured: two
concurrent `createFolder` calls return 201 with distinct ids and leave one folder;
a concurrent rename + create returns 200 for both and drops the rename. The same two
calls made sequentially both land, so the ids-are-distinct fix from MQA #21 does not
help here.

**Workaround:** avoid concurrent folder edits; re-check the tree after a project
import.

**Status:** Fixed in 6878df1c (2026-07-30) — the first of the two options: a per-key async
mutex (`withKeyLock`) that every folder mutation and every per-diagram write
passes through. Per-folder documents remain the durable fix and are still worth
doing — **the mutex is single-process only**, so a multi-worker deployment can
still interleave; the Cloudflare target does not run these routes at all today.
Recorded here rather than left implicit. Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## Two simultaneous shares publish two snapshots and record one

**Found by:** exploratory campaign SHARE-04

**Symptom:** Two Share requests that overlap on a never-shared diagram publish two
independent public snapshots. Only one is recorded on the diagram, so Unshare takes
down one link and leaves the other serving the diagram's content indefinitely, with
nothing in the app aware of it.

**Root cause:** `shareDiagram` is read-then-write with no reservation: both calls
read the `shareUuid`-less document, both take the "no uuid → generate one" branch,
both write their own `public/<uuid>` snapshot, and the second diagram write wins the
record. Measured with `Promise.all`: two distinct uuids, two entries under `public/`,
one recorded; `unshare` removes the recorded one and the survivor still answers 200.
Sequential shares are correctly idempotent, so the whole exposure is the concurrency
window. Same class as SHARE-03 (unserialised read-modify-write) but with a worse
consequence — the lost write is a *published* artifact rather than a dropped edit.

**Workaround:** don't double-click Share. An orphaned snapshot can only be removed
from `<STORAGE_PATH>/public/` by hand.

**Status:** Fixed in 6878df1c (2026-07-30) — the first of the two options: `shareDiagram` runs
inside the same per-diagram lock, so the read-then-write is atomic and two
concurrent shares converge on one uuid and one snapshot. The deterministic-uuid
alternative would have worked too, but it makes the uuid derivable from the
diagram id + salt, which is a weaker property for an unguessable public link.
Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## A non-recursive folder delete orphans its whole subtree

**Found by:** exploratory campaign SHARE-05

**Symptom:** Deleting a folder without the recursive flag removes only that folder.
Its child folders stay in `folders.json` pointing at a `parentId` that no longer
exists, so they are unreachable from the root — invisible in the tree but still
present in storage — and the diagrams inside them survive too. A shared diagram
stranded that way keeps its public link live while being unreachable in the UI.

**Root cause:** `deleteFolder`'s non-recursive branch splices exactly one row out of
the array and sets `toDelete = new Set([id])`; `sweepOrphanedDiagrams` then only
sweeps diagrams whose `folderId` is in that one-element set. The recursive branch
does the right thing via `collectDescendantFolderIds`, so the two branches disagree
about what "delete this folder" means. Reachable from the product:
`useFileTree` calls `deleteFolder(id, recursive)` and
`LocalStorageProvider.serverDeleteFolder` forwards it as `?recursive=<bool>`.
Measured: deleting `parent` non-recursively leaves `child` (dangling parentId) and
`grandchild` in the array, and the diagram inside `child` unswept with its
`folderId` intact.

**Workaround:** always delete folders recursively.

**Status:** Fixed in 6878df1c (2026-07-30) — the first of the two options: a non-recursive
delete of a folder that has child folders is a 409 the UI can turn into "this
folder isn't empty". Re-parenting the orphans was rejected because it invents a
placement the user never asked for. A LEAF folder still deletes non-recursively
and still sweeps its diagrams, so the import paths (`projectZip` deletes
depth-first) are unaffected. Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## Trashing a shared diagram leaves its public link live, and unreachable

**Found by:** exploratory campaign SHARE-06

**Symptom:** Delete a shared diagram from the file explorer and its share link keeps
serving the full diagram. Because the diagram is now in the trash it cannot be
opened, and Unshare lives on the open diagram's toolbar — so the owner has deleted
the diagram and has no way left to take the link down.

**Root cause:** the file explorer's delete is a *soft* delete —
`LocalStorageProvider.serverDeleteDiagram(id, soft=true)` sends
`PATCH { deletedAt }`, and `patchDiagram` merges it, preserving `shareUuid`. Only the
permanent delete (`deleteDiagram`) cascades to `public/<uuid>`. `getPublicSnapshot`
reads the snapshot with no reference back to the diagram, so it has no `deletedAt` to
consult — and the snapshot document does not carry one either, so a viewer-side gate
cannot be written against it. Sharing a diagram that is *already* trashed is accepted
too. This is direct sibling drift with the worker's Drive read proxy, which fetches
`fields=trashed,size` first specifically so that "a trashed file must stop resolving
here — matching Drive's own web-share semantics" and answers 410.

**Correction (cross-area mop-up, 2026-07-30 — MOP-02).** The *symptom* above is not
reachable from the file explorer as-built: its delete is `tree.hardDeleteDiagram` →
`deleteDiagram(id, false)` → HTTP `DELETE`, which *does* cascade to
`public/<uuid>`. Nothing in the UI calls the soft path at all — that is A4/FEX-02
("the whole soft-delete / trash machine is unreachable"), filed after this entry.
The route-level gap this entry describes is real and stays Open (a `PATCH
{ deletedAt }` preserves `shareUuid` and the snapshot keeps serving), but today it
can only be reached by an API client, not by trashing from the explorer. Whichever
fix lands first must keep the two consistent: wiring the trash UI up (FEX-02) makes
this symptom reachable exactly as described.

**Workaround:** not needed from the UI today (the explorer's delete cascades); for
API clients, unshare before soft-deleting.

**Status:** Fixed in 6878df1c (2026-07-30) — the second of the two options, which is also the
one MOP-02's correction points at: `getPublicSnapshot` resolves `sourceId` and
answers **410** when the source carries `deletedAt`, mirroring the worker's
Drive read proxy exactly ("a trashed file must stop resolving here"). Restoring
the diagram restores the link, which is what a trash implies. Unsharing as part
of the trash transition was rejected for that reason — it is not reversible.
Sharing something already trashed is refused (409) too. Snapshots written before
`sourceId` existed carry no back-reference and are served as before. Promoted
regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## The anonymous Drive proxy's 10 MB cap is skipped when Drive reports no file size

**Found by:** exploratory campaign SHARE-07

**Symptom:** The worker's anonymous read proxy will stream a file of any size when
Drive's metadata response omits `size` — the 10 MB guard evaluates as 0 and passes.
An unbounded body then flows through the Worker to the viewer.

**Root cause:** the gate is `Number(meta.size ?? '0') > 10 * 1024 * 1024` in
[`app.ts`](packages/axoview-worker/src/app.ts). Drive reports `size` only for files
with binary content stored in Drive; when it is absent the `?? '0'` default reads as
a zero-byte file. A non-numeric value is just as bad — `Number('unknown')` is `NaN`
and `NaN > cap` is `false`. Measured: metadata `{trashed:false}` with a 30 MB body
returns 200 with all 31 457 280 bytes and both Drive reads fire. The neighbouring
`trashed` gate on the same metadata read fails *closed* on a missing field (absent =
not trashed is the safe reading), so the size cap is the outlier — a missing size
should mean "unknown", not "zero".

**Workaround:** none server-side. Axoview's own diagrams always report a size, so
this needs a hand-crafted or unusual Drive file to hit.

**Status:** Fixed in 6878df1c (2026-07-30) — fail closed, as the fix direction proposed: an
absent, empty or unparseable `size` is treated as over the cap, so the gate
matches the `trashed` gate beside it on the same metadata read. A hard byte
budget on the stream (which would also cover a size Drive UNDER-reports) is the
stronger version and is not done — the declared-size check is what the proxy
can enforce without buffering. Promoted regression: [`app.spec.ts`](packages/axoview-worker/src/__tests__/app.spec.ts).

## A malformed or oversized request body returns an HTML error page with a stack trace

**Found by:** exploratory campaign SHARE-08

**Symptom:** Saving a diagram larger than 10 MB, or any request whose JSON body is
truncated in flight, fails with an unparseable response: the client's
`response.json()` throws, so instead of the ADR 0011 failure dialog naming the cause
the user gets a generic error or nothing at all. The response body is Express's
default HTML error page and contains a Node stack trace.

**Root cause:** [`server.js`](packages/axoview-backend/server.js) mounts no
error-handling middleware, so a `body-parser` rejection never reaches the `adapt()`
wrapper that produces `{ error }` JSON — it falls through to Express's built-in
handler. Measured against the real server: a truncated JSON body returns
**400 `text/html`** containing `SyntaxError`, and an 11 MB body returns
**413 `text/html`** containing `entity too large` and `at ` stack frames. A
handler-raised error on the same route is correctly `application/json`
`{"error":"Diagram not found"}`, so the contract exists — body-parser failures escape
it. The worker is the correct sibling here: its `bodyLimit` returns
`{ error: 'Payload too large' }` as JSON with 413, and its `onError` deliberately logs
the stack while keeping it out of the response.

**Workaround:** none; keep diagrams under 10 MB.

**Status:** Fixed in 6878df1c (2026-07-30) — a terminal error middleware maps
`entity.too.large` → 413 and `entity.parse.failed` → 400, both `{ error }` JSON
with no stack, matching the worker. Mounted last so a parser error raised before
any route still lands there. The 413's client-side copy is NOT wired into the
save-failure dialog yet — that is the second half of this entry's fix direction
and belongs with the wave 4 dialog work. Promoted regression: [`server.wiring.spec.js`](packages/axoview-backend/src/__tests__/server.wiring.spec.js).

## The CORS allowlist does not stop cross-origin writes — a web page can publish your diagrams

**Found by:** exploratory campaign SHARE-09

**Symptom:** On the default self-host configuration (`AUTH_MODE=none`), any web page
the operator visits while the backend is reachable can silently publish their
diagrams to public snapshot links, and create documents in their workspace. The
attacking page cannot read the responses, but the writes land.

**Root cause:** CORS is a *response*-side control. The allowlist added in the
2026-07-05 security review makes the browser withhold the response from an unknown
origin, but the request has already executed on the server. Any request the browser
classes as CORS-safelisted skips the preflight entirely — including
`POST` with `Content-Type: text/plain` — and `POST /api/diagrams/:id/share` needs no
body at all. Measured against the real server: a cross-origin
`POST /api/diagrams/<id>/share` with `Origin: https://evil.example` and
`Content-Type: text/plain` returns 200 with **no** `access-control-allow-origin`
header, and the diagram is genuinely published (`shareUuid` set,
`GET /api/public/diagrams/<uuid>` → 200). The same shape also creates a document
(the unparsed body yields an empty diagram). `PUT`/`PATCH`/`DELETE` *are* protected,
because they force a preflight the allowlist correctly refuses — confirmed in the
same probe, along with `http://localhost:3000`'s preflight being allowed. So the
exposure is exactly the safelisted-request subset, and the ACAO check the security
review relied on cannot see it.

Escalation is limited: the attacker cannot read the minted uuid cross-origin, so this
is an integrity/availability issue (unwanted publication, workspace pollution, and an
orphan snapshot per SHARE-04) rather than a direct exfiltration.

**Workaround:** set `AUTH_MODE=shared-token` + `AUTH_SHARED_SECRET` — a Bearer header
is not CORS-safelisted, so it forces a preflight on every route and closes this. The
existing startup `[SECURITY]` warning already recommends this for a different reason.

**Status:** Fixed in 6878df1c (2026-07-30) — both halves the fix direction named, the first as
the load-bearing one: a middleware refuses any `/api/*` request whose `Origin`
header is present and not allowlisted, with 403, BEFORE a handler runs. Requests
with no `Origin` (same-origin, curl, server-to-server) are untouched, matching
the CORS callback. The regression asserts the diagram is genuinely not
published, not merely that the response was withheld — the distinction this
entry exists for. Promoted regression: [`server.wiring.spec.js`](packages/axoview-backend/src/__tests__/server.wiring.spec.js).

## A shared diagram loses its icon packs and its description

**Found by:** exploratory campaign SHARE-11

**Symptom:** A diagram built with any icon pack (AWS, Azure, Material…) opens through
its share link with its icons unresolved — the shape and layout are right, the icons
are not. The diagram's description is missing from the shared view too.

**Root cause:** the snapshot `shareDiagram` writes is a hand-written field whitelist —
`title, name, icons, colors, items, views, fitToScreen, sharedAt, sourceId` — so every
other top-level field is dropped, including `description` and `version` (both
`modelSchema` fields) and `requiredPacks`. `requiredPacks` is the damaging one: under
ADR 0003 lean-save the stored diagram has its pack icons stripped from `icons` and
records the packs it needs in `requiredPacks`, and
`iconPackManager.loadPacksForDiagram` resolves what to fetch from that field first,
falling back to an items × icons cross-reference. On a lean snapshot with
`requiredPacks` gone, the fallback cannot work either — mapping `item.icon` to a
collection needs the icons array to contain that icon, which lean-save removed — so it
resolves to zero collections. Lazy pack loading defaults to **on**, so nothing else
loads them. Measured: `leanIfModel` on a one-AWS-icon model yields
`requiredPacks: ['aws']` with `aws-ec2` absent from `icons` and still referenced by
the item; through the snapshot whitelist the resolver's cross-reference returns `[]`.
The owner's own load path keeps `requiredPacks` and works, and a non-lean payload
resolves through the fallback — so the resolver is sound and the snapshot is the only
place the signal is lost.

**Workaround:** the recipient can turn off lazy icon-pack loading (Settings) so all
packs load eagerly.

**Status:** Fixed in 6878df1c (2026-07-30) — the "better" option, inverted: the snapshot is a
DENY-list of the fields the server owns or that are meaningless to an anonymous
reader (`id`, `shareUuid`, `folderId`, `deletedAt`, `created`, `lastModified`),
so `requiredPacks`, `description`, `version` and any future `modelSchema` field
are carried rather than silently dropped. Deriving the list from the schema
itself would mean importing the lib's zod model into a package that is
deliberately dependency-free and shared with the Worker. The array/title
normalisations the whitelist applied are kept, so a malformed stored document
still yields a loadable snapshot. Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## A share link opened on the wrong deployment tells the recipient to deploy a server

**Found by:** exploratory campaign SHARE-12

**Symptom:** Opening a `/display/p/<uuid>` snapshot link on any deployment without
server storage — which includes **axoview.app**, the Cloudflare production site, and
any `npm run dev` without the Express backend — shows a dialog reading "This share
link needs a session backend. Share links can only be opened from an Axoview instance
running with server storage. Deploy via Docker or Cloudflare to view shared
diagrams.", with OK as the only action. The person reading it is normally the
recipient of someone else's link, who owns no deployment. The advice is also wrong:
the Cloudflare worker hardcodes `serverStorage: false` and has no
`/api/public/diagrams` handler at all, so "deploy via Cloudflare" can never make the
link work.

**Root cause:** `App.tsx` raises the dialog on
`showLocalModeShareError = isPublicShareUrl && !serverStorageAvailable`, where
`isPublicShareUrl = !!shareUuid` — the route shape alone. Nothing in the condition
distinguishes a recipient from a mis-deployed operator, so both get operator-facing
copy. The sibling dead-end gets this right: `DriveDisplayGate`'s unreachable-file
branch tells its viewer to switch accounts or "ask the owner to share the file with
you", and never mentions deploying.

**Workaround:** open the link against the Docker/self-host origin that minted it.

**Status:** Fixed in 6878df1c (2026-07-30) — the copy is rewritten for the reader who actually
sees it ("This link belongs to a different Axoview site… ask whoever sent it for
a link from that site"), and the Cloudflare claim is gone: the worker hardcodes
`serverStorage: false` and has no `/api/public/diagrams` handler, so that advice
could never have worked. The route-shape condition is unchanged — it genuinely
cannot tell a recipient from a mis-deployed operator, so the copy has to serve
both. The longer-term reading stands: this is the ADR 0010 D6 public-namespace
cutout showing through.

## A PATCH can point one diagram at another's share link, or publish over it

**Found by:** exploratory campaign SHARE-15

**Symptom:** `PATCH /api/diagrams/<a>` with `{"shareUuid": "<b's uuid>"}` is accepted.
Unsharing or deleting diagram A then takes down diagram B's live link while B's
document still records it as published, and re-sharing A **republishes B's link with
A's content** — anyone holding B's link now sees A.

**Root cause:** `patchDiagram` merges the request body over the stored document with
no key filter, re-asserting only `id` and `lastModified`. `shareUuid` is a
server-owned field with no protection, and every cascade
(`unshareDiagram`, `deleteDiagram`, `deletePublicSnapshot`) trusts it as the
authoritative pointer to a snapshot without checking that the snapshot's own
`sourceId` matches. Measured: the impostor's unshare 404s the victim's uuid while the
victim's `shareUuid` is unchanged, and a subsequent share rewrites the snapshot's
`title` and `sourceId`. The same PATCH cannot change `id`, so the merge is
selectively — not accidentally — unguarded. Same class as the engine block's finding
that reference integrity is checked and *identity* integrity is not (CLIP-01).

**Workaround:** none at the API level; the app never sends `shareUuid` in a PATCH, so
this needs a direct API call (or another client) to trigger.

**Status:** Fixed in 6878df1c (2026-07-30) — both halves the fix direction named. `shareUuid`
and `created` are stripped from the PATCH body the way `id` always was, and
every cascade (`deleteDiagram`, `unshareDiagram`, the folder-delete sweep) now
verifies `snapshot.sourceId === id` before deleting or overwriting. Both,
because the strip closes the route in while the ownership check also covers a
document written by an older build that already carries a borrowed uuid.
Promoted regression: [`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## A slow Drive grant turns the Picker rung into a dead end

**Found by:** exploratory campaign DRV-01

**Symptom:** A recipient opens a `/display/drive/<fileId>` link, clicks "Open with
Google Drive access", picks the right file — and lands on "Could not open this
diagram." Its only button is "Back to editor", which navigates away from the link.
Reloading the page works, because the grant has propagated by then, but nothing on
screen suggests that.

**Root cause:** `driveAfterGrantRef` in
[`DiagramLifecycleProvider.tsx`](packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx)
is set by `retryDriveDisplayRead(afterGrant)` and cleared in exactly one other place:
the effect that fires when `driveFileId` goes falsy, i.e. when the route unmounts. So
once the Picker has been used, every subsequent read on that route is an `afterGrant`
read — and `afterGrant` is precisely what turns a recoverable answer into a terminal
one. Measured through the real ladder: the same Drive 404 maps to `needs-grant` with
`afterGrant:false` and to `not-found` with `afterGrant:true`. Drive grants take a
moment to register (the ladder's own doc comment says drive.file "hides files until
the Picker grant registers"), so the post-Picker retry routinely sees the pre-Picker
answer. `not-found` is the only reason mapped to `failed`, and the rendered `failed`
state has one button whose action is `navigate('/', { replace: true })` — no Retry,
and no route back to the gate's Picker rung.

**Workaround:** reload the page.

**Status:** Fixed in 1c49e6fa (2026-07-30) — option (a), the root cause: `driveAfterGrantRef`
is cleared by the read it was set for, immediately after that read settles,
rather than only when the route unmounts. Option (b) landed too but as part of
DRV-02 rather than as a patch over this one: the post-grant answer is no longer
`not-found` at all, it is `grant-not-registered`, which the gate renders with a
Try-again button — because propagation is the expected cause, exactly as this
entry says. Promoted regression: [`drivePublicRead.test.ts`](packages/axoview-app/src/services/drive/__tests__/drivePublicRead.test.ts).

## Four different reasons a shared Drive diagram will not open render one message

**Found by:** exploratory campaign DRV-02

**Symptom:** "Could not open this diagram. The diagram may have been deleted, or you
may not have access to it." is shown when the owner trashed the file, when the file is
over the 10 MB proxy cap, when access was revoked after a Picker grant, and when a
Picker grant simply has not registered yet. Two of those four are not what the message
says, and the one that a viewer could fix by waiting a moment is indistinguishable
from the one that is permanent.

**Root cause:** `readDriveDisplayFile` in
[`drivePublicRead.ts`](packages/axoview-app/src/services/drive/drivePublicRead.ts)
collapses four distinct upstream answers — proxy 410 (trashed), proxy 413 (too large),
post-grant 403, post-grant 404 — into the single `not-found` reason, which
`DiagramLifecycleProvider` maps to `failed`, which `DriveDisplayGate` renders as
`ReadonlyLoadErrorDialog`. Measured: all four produce
`{ok:false, reason:'not-found'}`. The gate demonstrably CAN differentiate when it is
given something to differentiate on — `transient`, `needs-signin` and `needs-grant`
each get their own copy and their own action — so the information is lost at the
ladder, not at the UI.

**Workaround:** none; the viewer has to ask the owner what happened.

**Status:** Fixed in 1c49e6fa (2026-07-30) — as the fix direction proposed, `gone`,
`too-large` and `grant-not-registered` join the reason union (plus `bad-link`
from DRV-12), and each gets its own gate copy. No new upstream work was needed:
the worker already returned distinct statuses for all of them, which is what
made this a pure information-loss bug at the ladder. `not-found` survives for
what it always meant — unreadable for a reason none of the others covers.
Promoted regression: [`drivePublicRead.test.ts`](packages/axoview-app/src/services/drive/__tests__/drivePublicRead.test.ts).

## Picking the wrong file in the Drive Picker does nothing and says nothing

**Found by:** exploratory campaign DRV-03

**Symptom:** On the Drive display gate, clicking "Open with Google Drive access" and
then selecting the wrong file in the Picker returns the user to exactly the same wall
with no message. It is indistinguishable from having closed the Picker deliberately,
so the natural next action is to click the button and pick the same wrong file again.

**Root cause:** `launchDrivePicker` resolves `'cancelled'` for two different
outcomes — a real CANCEL, and a PICKED whose `docs` array does not contain the target
file (the documented wrong-grant trap, since a pick only registers a `drive.file`
grant for the file actually picked). `DriveDisplayGate.handleGrant` acts only on
`'picked'`; its two `setPickerError` sites are the reset-to-null at the top and the
`catch`, and a resolved `'cancelled'` reaches neither. Measured against the real
picker fake: the target file resolves `'picked'`, another file resolves `'cancelled'`.
The gate's own comment — "'cancelled' keeps the gate up — the user can pick again" —
is correct for a deliberate cancel and wrong for a wrong-file pick, because both
arrive as the same value.

**Workaround:** pick the file named in the link.

**Status:** Fixed in 1c49e6fa (2026-07-30) — exactly as the fix direction proposed:
`launchDrivePicker` gained a third outcome, `'wrong-file'`, and the gate
surfaces "that isn't the diagram this link points to" inline next to the
existing `pickerError` treatment. The distinction was already computed —
`grantedTarget` — it simply had nowhere to go. Promoted regression: [`drivePicker.test.ts`](packages/axoview-app/src/services/drive/__tests__/drivePicker.test.ts).

## A domain-shared Drive diagram is reported as "restricted"

**Found by:** exploratory campaign DRV-04

**Symptom:** A diagram shared with an entire Google Workspace domain — anyone at the
company can open the link — shows as **Restricted** with nobody listed, and copying
the link warns "only people with access can open it". The owner is told the opposite
of the truth about who can read their diagram.

**Root cause:** `getAccessOverview` in
[`driveSharing.ts`](packages/axoview-app/src/services/drive/driveSharing.ts) derives
`summary` from `perms.some((p) => p.type === 'anyone')` and `peopleCount` from
`p.type === 'user' || p.type === 'group'`. `type:'domain'` — one of the four values
the module's own `DrivePermission` interface declares — matches neither, so a
domain-wide grant is invisible to both. Measured: `[owner, {type:'domain'}]` yields
`{summary:'restricted', peopleCount:0}`, and both copy predicates (toolbar and Manage
dialog), replayed over the same list, agree it is not shared. A `group` grant IS
counted and an `anyone` grant IS detected, so the omission is specific to `domain`.

**Workaround:** check the file's sharing state in Drive's own UI.

**Status:** Fixed in 1c49e6fa (2026-07-30) — both halves. `type:'domain'` counts as shared,
and it is its own `summary` value rather than being folded into
`anyone-with-link`: the two are different promises (everyone at the company vs
everyone with the link), and telling an owner their diagram is public when it is
company-wide would be the same class of error in the other direction. Domains
are surfaced as their own list rather than counted as people, and `domain` was
added to the `permissions.list` field mask so the grant can be named. The
`allowFileDiscovery` question the entry raises is NOT addressed — it is about
which `anyone` grants are discoverable, a separate distinction. Promoted
regression: [`driveSharing.test.ts`](packages/axoview-app/src/services/drive/__tests__/driveSharing.test.ts).

## Copying a Drive link reports success when the app could not read the access list

**Found by:** exploratory campaign DRV-06

**Symptom:** Copying a Drive diagram's preview link from the toolbar's caret menu
confirms "Preview link copied to clipboard" even when the diagram is restricted and the
link will not open for anyone. It happens exactly when the ACL read failed — the one
case where the app does not know whether the link works. The Manage-access dialog's
Copy button warns in the same situation.

**Root cause:** `AppToolbar.handleQuickCopyLink` chooses its toast with
`shared || !driveOverview` — the `!driveOverview` disjunct is a deliberate
"don't cry wolf" clause for a failed `getAccessOverview`, but it makes an *unknown*
ACL report as a *good* one. `DriveShareManageDialog.handleCopy` computes the same
question as `isPublic || hasPeople` over a `permissions` array that is null/empty when
its own load failed, so it warns. Measured by replaying both shipped predicates over
the same "ACL unknown" state: toolbar `true`, dialog `false`. On a known-restricted ACL
both agree and warn, so the divergence is precisely the unknown case.

**Workaround:** open the Manage-access dialog to see the real state.

**Status:** Fixed in 1c49e6fa (2026-07-30) — as the fix direction proposed, the unknown case
is its own message in the toolbar path: "Link copied. We couldn't check who has
access — open Manage access to be sure." The two surfaces agree now because both
ask one predicate (`isShared`), so the divergence cannot reopen by one of them
being edited. Promoted regression: the DRV-04 legs of [`driveSharing.test.ts`](packages/axoview-app/src/services/drive/__tests__/driveSharing.test.ts) cover the predicate;
the toast selection itself is component code with no separate suite.

## Revoking a Drive share link leaves the diagram readable from cache

**Found by:** exploratory campaign DRV-07

**Symptom:** Setting a Drive diagram's access back to Restricted does not take effect
immediately for anyone who has already opened its link — their browser keeps serving
the diagram for up to a minute. Because the response is marked cacheable by *any*
cache, a shared/proxy cache may also hold it and hand it to other requesters.

**Root cause:** the anonymous read proxy in
[`app.ts`](packages/axoview-worker/src/app.ts) returns
`Cache-Control: public, max-age=60` on the 200 path. The in-code rationale is
browser-side dedupe of repeat opens, which `private` would serve just as well;
`public` additionally authorises shared caches, and there is no `must-revalidate` or
`no-store`. Measured: the 200 carries that header while the 404 and 410 paths carry no
cache header at all — so only the readable body lingers. The trashed path (410)
revokes immediately, which confirms the window is specific to an ACL change rather
than to deletion.

**Workaround:** trash the diagram instead of un-sharing it if the revocation is
urgent (the trashed gate is immediate), then restore it.

**Status:** Fixed in 1c49e6fa (2026-07-30) — `private, max-age=60, must-revalidate`. The
minimum the fix direction named, plus `must-revalidate` so a stale entry cannot
be served past the window; `no-store` was not taken, because the dedupe of
repeat opens is real and a 60 s private window is not a shared-cache exposure.
Promoted regression: [`app.spec.ts`](packages/axoview-worker/src/__tests__/app.spec.ts).

## A failed "add person" clears the email field and remembers the address anyway

**Found by:** exploratory campaign DRV-08

**Symptom:** In Manage access, adding a person whose address Google rejects ("The user
… could not be found") shows the error — and clears the address out of the input, so
the user has to retype it to fix a typo. The mistyped address is also added to the
Add-people autocomplete, where it will be suggested as if it had been granted access.

**Root cause:** `runAction` in
[`DriveShareManageDialog.tsx`](packages/axoview-app/src/components/DriveShareManageDialog.tsx)
catches the failure into `actionError`, so `await runAction(...)` resolves on both
outcomes and the three statements after it in `handleAdd` —
`addRecentShareEmail(email)`, `setRecentEmails(...)`, `setAddEmail('')` — always run,
with no outcome check between them. Measured by rendering the dialog with a rejecting
`addPersonPermission`: the error appears, the field is empty, and the address is in the
local history. The success CONTROL produces the identical end state, so the two
outcomes are indistinguishable in the UI.

**Workaround:** retype the address.

**Status:** Fixed in 1c49e6fa (2026-07-30) — as the fix direction proposed: `runAction`
returns whether the action succeeded, and `handleAdd` guards its tail on it, so
a rejected address keeps the field populated and stays out of the local
history. The rig note about mocking `driveSharing` without re-exporting
`DriveShareError` is preserved above — it is still live for anyone writing a
test against this dialog.

## A link inside a shared diagram dead-ends for the recipient

**Found by:** exploratory campaign DRV-09

**Symptom:** A diagram shared by link (Drive preview or snapshot) that contains a link
to another diagram gives the recipient a dead affordance: following it shows "Could not
open this diagram", with nothing explaining that the target lives in the sender's
workspace and was never shared.

**Root cause:** the `axoview-navigate-to-diagram` handler in
[`App.tsx`](packages/axoview-app/src/App.tsx) does
``navigate(`/display/${id}`)`` with the raw embedded id and no branch on the current
route — nothing maps the sharing context onto the target, and there is no
`display/drive` or share-uuid form of the hop. `/display/<id>` is the owner-readonly
loader, which resolves the id against the *recipient's* own storage; measured,
`LocalStorageProvider.loadDiagram('owners-diagram-id')` rejects, which is what raises
the generic readonly-load failure. This is the coverage gap the baseline already lists
as "sharing a diagram that links to other diagrams (link behavior in shared view)".

**Workaround:** ask the sender to share the linked diagram too, and to send its own
link.

**Status:** Fixed in 1c49e6fa (2026-07-30) — the product answer, decided here rather than
deferred: **explain, do not suppress.** On a shared route the hop no longer
navigates; it says the target lives in the sender's workspace and was not shared.
Suppressing the affordance was rejected because it silently changes what the
shared diagram says — the link is content its author put there, and a reader who
cannot see it cannot ask for it. Carrying the sharing context was rejected
because there is nothing to carry: a share publishes ONE diagram, so the
sibling the link names was never published and no `/display/drive/<fileId>` or
share-uuid form of it exists. The coverage gap the baseline lists ("link
behavior in shared view") is closed by that decision.

## A malformed Drive link asks the viewer to sign in and then to grant access

**Found by:** exploratory campaign DRV-12

**Symptom:** A `/display/drive/<id>` link whose file id is truncated or mistyped (a
copy-paste that lost characters) sends the viewer through the whole authorization
ladder — "Sign in with Google so Axoview can check whether this diagram has been
shared with you", then "Open with Google Drive access" — for an id Drive itself
rejects as malformed. Neither step can ever work.

**Root cause:** the proxy answers `400 bad-file-id` for an id outside its allowlist,
and rung 1 of `readDriveDisplayFile` classifies only 410/413 (→ terminal) and
429/5xx (→ transient); every other non-OK status falls through to the token rung.
Measured: signed out the ladder returns `needs-signin` after one request; signed in it
returns `needs-grant` after two.

**Workaround:** get an intact link.

**Status:** Fixed in 1c49e6fa (2026-07-30) — both halves the fix direction named. The proxy's
400 is its own terminal reason (`bad-link`), and the client applies the same
`/^[A-Za-z0-9_-]{10,120}$/` check the worker uses BEFORE making any request, so
a truncated link is named immediately instead of after two round trips. Note the
existing ladder tests used a toy `'fid'` fixture, which the check now correctly
refuses — they carry a realistic Drive id, and the reason why, so the fixture
does not drift back. Promoted regression: [`drivePublicRead.test.ts`](packages/axoview-app/src/services/drive/__tests__/drivePublicRead.test.ts).

## A failed share shows the raw string "Share failed: 404"

**Found by:** exploratory campaign DRV-14

**Symptom:** If a session-place diagram is deleted (in another tab, or from the file
tree) between being opened and being shared, the share popover displays the literal
text `Share failed: 404`. Nothing tells the user the diagram no longer exists or what
to do.

**Root cause:** `LocalStorageProvider.shareDiagram` throws
``new Error(`Share failed: ${response.status}`)``, discarding the backend's own
`{ error: 'Diagram not found' }` body, and `AppToolbar.handleShareClick` surfaces
`err.message` verbatim into the popover. Measured against the real provider with a 404
response: the message is exactly `Share failed: 404` and contains none of the
backend's text. ADR 0011 §1 requires a failure-of-intent to surface copy the user can
act on.

**Workaround:** none; refresh and try again.

**Status:** Fixed in 1c49e6fa (2026-07-30) — as the fix direction proposed, modelled on
`DriveShareError`: `LocalStorageProvider.shareDiagram` throws a typed
`ShareRequestError` carrying the status and the backend's own `error` string,
and the message is what the popover should show — 404 → "This diagram no longer
exists", 5xx → the retryable treatment, anything else → the backend's own text.
Promoted regression: [`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## A multi-row text box whose rows are not `<p>`/`<li>` measures one row tall

**Found by:** exploratory campaign TXT-01 / TXT-02

**Symptom:** A text box whose content is plain text with newlines, or HTML whose
rows are `<div>` blocks or `<br>` breaks, paints every row on the canvas but
occupies a ONE-row footprint. Its selection outline, its transform-handle box and
its `getItemAtTile` hit area cover only the first row; the remaining rows overhang
into the neighbouring tiles, where clicking them selects whatever is underneath.
For the plain-text case the box is also far too WIDE — all the lines are measured
as one continuous run.

**Root cause:** `scene.textBoxes[id].size` has exactly one writer,
`syncTextBox` → `getTextBoxDimensions` (`utils/isoMath.ts`), and both of its
row-counting helpers only recognise the block vocabulary the Quill editor emits:

- `countHtmlLines` returns 1 immediately when the content does not start with
  `<` — so `"alpha\nbeta\ngamma"` is one row, even though the resting render
  hands that string to a `white-space: pre` `<Typography>` that draws three.
- Its regex is `/<\/(p|li|h[1-6]|blockquote|pre)>/gi`, so `<div>` rows count
  zero (floored to 1) and `<br>` inside one `<p>` counts as a single row.
  `sanitizeHtml` keeps both `<div>` and `<br>` (DOMPurify's html profile), so
  they reach `dangerouslySetInnerHTML` unchanged and lay out as N rows.
- `splitIntoMeasurableBlocks` has the same two blind spots on the WIDTH axis: a
  non-HTML string becomes a single block holding every line, so `getTextWidth`
  measures the lines concatenated.

Neither shape is producible from the on-canvas editor (Quill normalises
everything to `<p>`/`<li>`), but both are producible by the supported input
surfaces — hand-edited or imported JSON, a project ZIP, or a diagram from the
upstream lineage. The repo's own `packages/axoview-e2e/fixtures/view-mode-info-diagram.json`
already stores a plain-text `content`.

**Workaround:** open the box in the on-canvas editor and press a key; the commit
re-serialises the content as `<p>` rows and the next `syncTextBox` measures it
correctly.

**Status:** Fixed in wave 4 (2026-07-31) — the first option, at the measurement
rather than at load. A non-HTML content splits on `\n` (matching the
`white-space: pre` the resting render uses for it), `div` joins the block
vocabulary, and a `<br>` counts as a row wherever it is not the last thing in
its block — so Quill's own `<p><br></p>` blank line stays ONE row. Both axes
moved together: `splitIntoMeasurableBlocks` returns one block per row, so a
multi-line plain-text box is no longer measured with its lines concatenated.
One consequence worth naming: a single row of plain text now weighs the same as
a single `<p>` row (the old flat `1` was the bug seen from the other side), and
the rendered footprint is unchanged for it — both round to one tile. Promoted
regression:
[`textBoxContentVocabulary.test.ts`](packages/axoview-lib/src/utils/__tests__/textBoxContentVocabulary.test.ts).

## A text box whose text starts with '<' silently loses that token

**Found by:** exploratory campaign TXT-14

**Symptom:** A text box reading `<T> is a type parameter` renders as
` is a type parameter` — the `<T>` is gone, on the canvas and in the on-canvas
editor. Opening and saving the diagram once makes the loss permanent: the stored
`content` no longer contains the token.

**Root cause:** "is this content HTML?" is decided by
`content.trim().startsWith('<')` (`isHtmlContent` in `utils/richTextTransform.ts`,
mirrored inline in `TextBox.tsx`). Plain text beginning with an angle bracket
answers yes, so it is routed to `sanitizeHtml` and `dangerouslySetInnerHTML`,
and DOMPurify drops the unknown `<T>` element while keeping its text content —
here, nothing. `useInitialDataManager` writes the sanitized string BACK into the
model (`content: sanitizeHtml(normalizeQuillHtmlSpaces(folded.content))`), so
the token cannot be recovered after one load.

`TextBoxInlineEditor`'s seed comment states that "plain-text legacy content
[is] escaped so a literal leading '<' can't be misparsed (catalog I-23)", but
the escape lives in `ensureHtmlContent`'s `plainTextToHtml` branch, which runs
only when `isHtmlContent` is FALSE — i.e. never for exactly the input it was
meant to protect. The guard is unreachable code.

**Workaround:** none once loaded. Before loading, wrap the value in `<p>` and
escape the brackets by hand (`<p>&lt;T&gt; is a type parameter</p>`).

**Status:** Fixed in wave 4 (2026-07-31), with a **correction to the recorded
fix direction**. Sniffing for a tag SHAPE does not fix this entry's own example:
HTML tag names are case-insensitive, so `<T>` matches `[a-z]` under `/i` and
would still take the HTML branch, where DOMPurify would still drop it. The
discriminator has to be the tag NAME — `isHtmlContent` now requires an opening
token naming a tag the sanitizer actually keeps, which is also the honest
predicate ("will this survive the pipeline as markup?"). Anything else takes the
plain-text branch that escapes it, so the guard that was written for exactly
this input is reachable at last. One sniff, three consumers: the renderer, the
measurement and the editors all import it. Promoted regression:
[`textBoxContentVocabulary.test.ts`](packages/axoview-lib/src/utils/__tests__/textBoxContentVocabulary.test.ts).

## Two strip presses flatten a text box's per-word formatting

**Found by:** exploratory campaign TXT-13

**Symptom:** A text box with one bolded word. Select the box (do NOT open the
on-canvas editor), press the strip's **B** — the whole box goes bold, as
expected — then press **B** again to undo that. The box comes back with NO bold
at all: the word the user had bolded inside the editor is gone too. The same
holds for italic, underline and strikethrough.

**Root cause:** For a merely-selected box the strip formats stored HTML through
`richTextTransform` (ADR 0034 §2 dual scope), and those two transforms are not
inverses over partially-formatted content:

- `getWholeContentFormats` reports `bold: false` unless EVERY leaf block is
  fully covered, so a box with one bolded run reads as not-bold and
  `toggleFormat` sends `on = true`.
- `applyInlineFormat(…, true)` wraps each leaf's children in one `<strong>`,
  which swallows the existing inner `<strong>`.
- `applyInlineFormat(…, false)` then unwraps EVERY `STRONG`/`B` in the
  document — it has no memory of which wrapper it added — so both the outer and
  the pre-existing inner run disappear.

`richTextTransform.test.ts` pins the round trip, but only from content that was
unformatted to begin with, where apply→remove is genuinely the identity.

**Workaround:** re-apply the per-word formatting from inside the on-canvas
editor (double-click the box first) — the live-editing branch routes to Quill
and is range-scoped, so it does not have this failure mode.

**Status:** Fixed in wave 4 (2026-07-31) — the FIRST option, and deliberately
not the second. `getWholeContentFormats` now reports `partial` alongside the
all-or-nothing flags, so a box with one bolded word reads as **mixed** rather
than as not-bold: the strip renders it indeterminate, the first press is
visibly "apply to all", and the destructive "unwrap every STRONG" branch is
only ever reached from a genuinely all-on box. That is also exactly the model
the STYL-02 ruling locked in for every other element type on the same day, so
the text box no longer behaves differently from its neighbours.

The second option (record the wrappers `applyInlineFormat(on)` added so the
matching `off` removes only those) was rejected on re-derivation: it would make
the fully-plain state UNREACHABLE from the strip for a partly-formatted box —
press applies, press restores the original mixed state, press applies again —
and it would make the text box the one type whose toggle is not a toggle. Word,
Docs, Slides and Figma all normalise a mixed selection and leave recovery to
undo, which is now one Ctrl+Z away because the whole session is one history
entry (TXT-04's bracket).

## An imported project's in-text diagram links point at the diagrams you imported FROM

**Found by:** exploratory campaign TXT-09

**Symptom:** Export a project as a ZIP, import it (into the same account or a
fresh one), and open a text box that links to a sibling diagram (the
"link to a diagram" suggestion in the on-canvas link card, Ctrl+K). The link
dead-ends: it navigates to the ORIGINAL diagram's id, which does not exist in
the imported copy. Node-level "linked diagram" links in the same import work.

**Root cause:** ADR 0001 §1 requires the importer to rewrite every id and every
cross-reference. `rewriteRefsInModel` (`services/project/projectZip.ts`) is a
deep object walk that rewrites exactly ONE key:

```js
if (k === 'link' && typeof v === 'string' && idMap.has(v)) out[k] = idMap.get(v);
```

That covers `item.link`, the only cross-diagram reference that existed when it
was written. Since ADR 0034's addendum (2026-07-04) a cross-diagram reference
can also live inside a text box's Quill content as an
`<a href="#diagram:&lt;id&gt;">` run authored by `TextBoxLinkCard` — a string
inside an HTML blob, which the key-based walk cannot see. The old id survives
verbatim, and `TextBox.onRestingClick` dispatches
`axoview-navigate-to-diagram` with it.

**Workaround:** re-author the link in the imported copy.

**Status:** Fixed in wave 4 (2026-07-31) — exactly as directed: `rewriteIds`
now rewrites by SENTINEL as well as by key, so any current or future HTML
surface carrying `#diagram:` is covered by construction rather than by someone
remembering to add it. A sentinel whose target is not in the archive is left
alone — `TextBox.onRestingClick` already no-ops on an unresolvable id, and
silently repointing it would be worse than a dead link. Promoted regression:
[`projectZipEmbeddedLinks.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZipEmbeddedLinks.test.ts).

## Undo after abandoning a new text box brings back an invisible ghost box

**Found by:** exploratory campaign TXT-04

**Symptom:** Place a text box, then abandon it without typing (Escape, or click
away) — the ADR 0034 empty-box lifecycle correctly deletes it. Press Ctrl+Z
once. The box comes back with no content: nothing is drawn, but it is a real
entity at a 1×1-tile footprint. It can be clicked, lassoed, dragged, it is
included by Ctrl+A and by the project bounding box, and it is written to every
save and export. This is exactly the "invisible zero-width ghost" the
empty-box lifecycle exists to prevent.

**Root cause:** The lifecycle is a DELETE, not a rollback. Placement records one
history entry (`createTextBox`) and `discardEmpty` records a second
(`deleteTextBox` → `saveToHistoryBeforeChange`), so undo simply reverses the
second and lands on the state between them: an existing, empty text box. Nothing
re-applies the empty check after an undo, and `getTextBoxDimensions` floors an
empty box at `{width: 1, height: 1}` (the "graspable footprint while editing"
floor), so the resurrected entity is invisible rather than zero-sized.

**Workaround:** press Ctrl+Z a second time, or select the ghost (Ctrl+A shows
its selection outline) and Delete.

**Status:** Fixed in wave 4 (2026-07-31) — the first shape, built out of the
existing drag-transaction primitive rather than a new one. The whole on-canvas
edit session is ONE history bracket: the placement mode opens it before the
create, and `useInlineEditHistoryBracket` closes it when the session ends.
A session whose net patch set is empty pushes no entry at all, so an abandoned
box leaves nothing for Ctrl+Z to land on. The floating Label got the same
bracket with its TXT-07 lifecycle.

**Where the bracket has to live, and why.** The Renderer promotes the edited box
into its own `TextBoxes` layer so the editor can receive pointer events, which
unmounts and remounts the component mid-session. A bracket owned by `TextBox`
therefore closed itself the instant the session began — committing the placement
as its own entry and leaving the discard as a second, i.e. reproducing this bug
exactly. It is owned by the Renderer and keyed on the two store flags instead.

**One residual, recorded rather than hidden:** the create and the delete are each
a real action that stamps the view's `lastUpdated`, and those do not cancel, so
an abandoned placement can leave one entry carrying only a timestamp. Its undo
cannot produce a text box, which is what this entry filed. Promoted regression:
[`text-entity-lifecycle.spec.ts`](packages/axoview-e2e/tests/text-entity-lifecycle.spec.ts).

## Discarding an empty text box leaves it selected — `setItemControls(null)` is a half-deselect

**Found by:** exploratory campaign TXT-15

**Symptom:** Place a text box and abandon it without typing. The box is deleted
(ADR 0034 empty-box lifecycle) and the Properties dock target is cleared, but
`uiState.selectedIds` still holds `{ type: 'TEXTBOX', id: <deleted id> }`.
The canvas is left with a selection pointing at nothing until the next click:
Delete, arrow-nudge, the strip's writers and every other `selectedIds`
consumer act on an id that no longer resolves.

**Root cause:** `discardEmpty` (`SceneLayers/TextBoxes/TextBox.tsx`) clears the
selection with `uiActions.setItemControls(null)`, but that action's null branch
sets only `itemControls` and `selectedConnectorLabel`:

```js
} else {
  const autoOpened = get().rightSidebarAutoOpened;
  set({ itemControls, selectedConnectorLabel: null, ...(autoOpened && {…}) });
}
```

It deliberately does not touch `selectedIds` — a multi-selection legitimately
has `itemControls === null` (see `setSelectedIds`' ADR-0006 derivation), so
clearing it there would drop a live multi-select. The consequence is that
`setItemControls(null)` cannot be used as "deselect", and `discardEmpty` uses
it as exactly that. `setSelectedIds([])` is the real deselect.

This is the same end state as the already-filed *Deleting a selected item
leaves it selected* (HIST-13), but a different cause: there nothing tries to
deselect; here the code calls a deselect API that does not deselect.

**Workaround:** click empty canvas after abandoning a text box.

**Status:** Fixed in wave 4 (2026-07-31) — `discardEmpty` calls
`setSelectedIds([])`, which derives `itemControls` itself, and the floating
Label's discard (TXT-07) uses the same call rather than repeating the mistake in
a second place. The central INV-2 enforcement the entry asks for longer term is
still outstanding and stays with HIST-13. Promoted regression:
[`text-entity-lifecycle.spec.ts`](packages/axoview-e2e/tests/text-entity-lifecycle.spec.ts).

## Renaming a node in Layers moves its canvas text — but only until the diagram is reloaded

**Found by:** exploratory campaign TXT-05

**Symptom:** Drop a node on the canvas, then rename it in the Layers panel. The
on-canvas text changes with it. Save, reload, rename the same node again — this
time the canvas text does not move. The same gesture on the same node has two
different outcomes depending on whether the diagram has been through a load.
The first outcome is the exact cross-persona confusion the ADR 0032 amendment
was written to remove ("renaming identity name in Layers must never move canvas
text").

**Root cause:** The decouple has two halves and only one of them runs at
creation time:

- The renderer draws `label ?? name` (`Node.tsx`, mirrored in `NodesCanvas`),
  so the identity `name` is still the fallback whenever `label` is absent.
- `seedNodeLabel` gives every node an explicit `label = name` so the fallback
  is never reached — but it is a LOAD-path normaliser, mapped over
  `rawData.items` in `useInitialDataManager`. Nothing seeds a node created
  during the session: `PlaceIcon` writes `{ id, name: 'Untitled', icon }`
  with no `label`.

So a never-reloaded node has no `label`, the fallback is live, and
`LayersPanel.handleItemRename`'s `updateModelItem(id, { name })` moves the
canvas text. `node-label-decouple.spec.ts` covers loaded nodes only.

**Workaround:** rename on the canvas (F2 / double-click) instead — that writes
`label`, which pins the node out of the fallback for good.

**Status:** Fixed in wave 4 (2026-07-31) — the second option. `seedNodeLabel`
runs inside the `createModelItem` reducer, so every path that creates a model
item (`PlaceIcon`, quick-add, paste, import) is covered by one chokepoint
instead of three call sites that each have to remember. It stays idempotent: an
explicit `label` wins, including an empty one that deliberately hides the
label, and an item with no `name` has nothing to seed from. Promoted
regressions: [`modelItem.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/modelItem.test.ts)
and [`text-entity-lifecycle.spec.ts`](packages/axoview-e2e/tests/text-entity-lifecycle.spec.ts).

## Pressing any strip control while renaming a label ends the rename

**Found by:** exploratory campaign TXT-06

**Symptom:** Double-click a floating Label (or a node name, or a connector
label) to rename it, then reach for the top strip to change its colour or size.
The press on the strip closes the rename session before the control does
anything. Doing the same during a TEXT BOX edit session works fine — the
session stays open and the control formats the live selection.

**Root cause:** Two implementations of the same click-away contract, and only
one learned about the strip. `TextBoxInlineEditor` allow-lists it explicitly:

```js
if (target.closest?.('[data-axoview-strip]') ||
    target.closest?.('.MuiPopover-root, .MuiPopper-root, .MuiModal-root')) return;
```

`useInlineRename` — the shared hook behind the Label, node-name and
connector-label editors — has no such branch: any capture-phase `pointerdown`
outside the editor element blurs it, which commits and unmounts. (It also binds
`pointerdown` only, where its sibling binds `pointerdown` and `mousedown`.)

Confirmed with real mouse input against the same control
(`strip-text-size`) in both sessions: text box survives, Label rename does not.

**Workaround:** commit the rename first (Enter), then use the strip on the
selected element — the element stays selected, so the controls still target it.

**Status:** Fixed in wave 4 (2026-07-31) — exactly as directed:
`isSessionPreservingTarget` is the one allow-list and both editors ask it.

**One more cause the entry did not name.** The allow-list alone was not enough.
`useInlineRename` committed on `blur`, and a plain mousedown on a strip control
moves focus — so the rename ended whatever the press-away listener allowed. The
press-away/key handlers are now the AUTHORITY (an idempotent `finish`), and
`blur` defers to them unless focus went somewhere outside the session. Promoted
regressions: [`useInlineRename.test.tsx`](packages/axoview-lib/src/hooks/__tests__/useInlineRename.test.tsx)
and [`inline-edit-session-scope.spec.ts`](packages/axoview-e2e/tests/inline-edit-session-scope.spec.ts).

## Escape after a mid-edit style change keeps half of it

**Found by:** exploratory campaign TXT-08

**Symptom:** With a text box open in the on-canvas editor, open the strip's
alignment control and set BOTH axes — horizontal centre and vertical middle —
then press Escape to cancel the edit. The horizontal alignment is gone, as a
cancel implies. The vertical alignment stayed. One control, one gesture, two
opposite cancel semantics.

The same split applies to every other strip write made during a session: range
colour, B/I/U/S, lists and links are discarded by Escape, while font size,
line spacing, manual width/height, border and fill are kept.

**Root cause:** ADR 0034 §2's dual scope decides where a strip write goes, and
Escape only knows about one of the two destinations. Writes routed through the
`textBoxEditorBridge` land in the mounted Quill instance and are thrown away
with the draft when `finish('cancel')` runs; writes made straight to the model
(`applyTextBox` / `updateTextBox`) are already committed by the time Escape
arrives, and the cancel path does not roll anything back — it only clears
`editingTextBoxId`.

`TopBarStyleControls.applyVerticalAlign` makes the split visible inside a
single control: the horizontal half calls `handle.quill.formatLine(...)`, the
vertical half calls `applyTextBox(textBox.id, patch)` even while
`liveEditing` is true.

**Workaround:** undo (Ctrl+Z) after the cancel to reverse the element-level
writes — each is its own history entry.

**Status:** Fixed in wave 4 (2026-07-31) — the FIRST contract: **everything the
session did is undone by Escape.** The element-level fields the strip can write
are snapshotted when the session opens and restored on cancel, and because the
whole session sits inside one history bracket (TXT-04) a cancelled session's
net patch set is empty, so it leaves no entry either. Commit keeps everything,
as before.

**A second defect this exposed, on the commit side — SILENT DATA LOSS, and the
wave-2 un-deadening lesson is what found it.** `TextBoxInlineEditor.finish`
treated `commit` with no TEXT change as a cheap "nothing to write" path and fell
through to `onCancel()`:

```js
if (kind === 'commit' && changedRef.current) { …onCommit(html)… }
else onCancel();
```

That was invisible for as long as cancel merely cleared `editingTextBoxId` — the
two branches did the same observable thing, so the fallthrough was dead code in
all but name. **Giving cancel a real job made it reachable**, and it became a
path where a user who opened a box, changed only its STYLING, and left-clicked
away lost the change with no message and no undo entry to recover from. Exactly
the shape of CTX-15's dormant `Pan.mouseup` branch in wave 2: *un-deadening a
code path is a change to that path*, and here the un-deadening was our own fix
one function away.

The generalisation, worth carrying forward: **when a branch that was previously
indistinguishable from its sibling gains behaviour, every caller that fell into
it "harmlessly" becomes a live defect** — look for those callers before shipping
the behaviour, not after.

A commit is a commit now; the parent already no-ops on unchanged content, and an
empty box still round-trips to `''` and hits the discard. Named regression pin
(its own file, because the class is data loss rather than UX):
[`TextBoxInlineEditor.commitContract.test.tsx`](packages/axoview-lib/src/components/SceneLayers/TextBoxes/__tests__/TextBoxInlineEditor.commitContract.test.tsx),
verified to go red against the old `&& changedRef.current`. End-to-end coverage:
[`inline-edit-session-scope.spec.ts`](packages/axoview-e2e/tests/inline-edit-session-scope.spec.ts).

## Annotation ink follows you to the next diagram, and to the next page

**Found by:** exploratory campaign VIEW-01 / VIEW-02

**Symptom:** Draw over a diagram with the annotation pen, then open a different
diagram (or switch to another page of the same one). The strokes are still on
screen, sitting at canvas coordinates that mean nothing in the new content.
Nothing in the UI explains where they came from, and the pen palette is closed
(so the Clear button is not even visible until the pen is re-opened).

**Root cause:** ADR 0014 calls the overlay ephemeral, and the strokes live in
`uiState.annotation.strokes` — but none of the resets that fire on those two
transitions owns that slice:

- `resetUiState()` — the only reset `useInitialDataManager` calls on load —
  sets `mode`, `scroll`, `itemControls`, `selectedIds` and `zoom`, and
  nothing else.
- `setView(viewId)` (a page switch) clears `previewLayerOverrides` and
  nothing else.

`setEditorMode` deliberately keeps the strokes (documented: "session-scoped;
only the open flag is reset"), which is the right call for an
edit↔present toggle on the SAME diagram — but that decision was never revisited
for the two transitions that change what is on the canvas underneath.

**Workaround:** open the pen and press Clear before switching.

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed — the annotation
slice is cleared in `resetUiState` (diagram load) and in `setView` (page
switch), and `setEditorMode` still keeps the strokes.

The line the fix draws, which is what makes it defensible rather than arbitrary:
**clear when the CONTENT under the ink changes identity, keep when only the
PRESENTATION changes.** A page switch and a diagram load change what is
underneath; an edit<->present toggle does not — that is the case `setEditorMode`
was always right about. The same line decides VIEW-03 the other way (a
projection switch is presentation, so the ink is re-projected rather than
cleared).

The operation log is cleared with the strokes, not just the strokes: otherwise
Undo after a page switch would re-materialise the previous page's ink onto the
new one, which is a worse version of the original bug. Promoted regression:
[`annotationSlice.test.ts`](packages/axoview-lib/src/stores/__tests__/annotationSlice.test.ts).

## Switching projection leaves the annotation ink behind

**Found by:** exploratory campaign VIEW-03

**Symptom:** Circle a node with the annotation pen, then toggle iso↔2D. The
diagram re-projects; the ink does not. The circle now sits over empty canvas or
over a different element.

**Root cause:** Strokes are stored in scene-canvas pixels and drawn inside a
`<g>` whose transform is rebuilt from `scroll` / `zoom` /
`rendererSize` only (`AnnotationLayer`'s store subscription). A projection
switch changes where a TILE lands in canvas space — that is the whole point of
`getCanvasModeSwitchScroll` — so everything anchored to a tile moves and
everything anchored to raw canvas px stays. Measured: the probe's node moved
>20 px on screen while the stroke's bounding box did not follow it.

The rendering guidelines (§8) already require every projected layer to list
`strategy.projectionName` in its rebuild deps; the annotation overlay is a
projected layer that does not.

**Workaround:** pick a projection before annotating.

**Status:** Fixed in wave 4 (2026-08-02) — option (a)'s behaviour, by a
narrower mechanism than the entry's wording.

**Why (a) and not (b) or (c).** The ink already follows scroll and zoom, so it
is already scene-anchored; leaving it behind on a projection switch alone was
the inconsistency. (b) — clear on the switch — would contradict the line VIEW-01/02
draws: clear when the CONTENT changes, keep when only the PRESENTATION does, and
a projection change is presentation. (c) — freeze to the viewport — would also
stop the ink following a pan, which it correctly does today.

**Mechanism.** Not "store strokes in tile space" as written, but a point re-map
at the switch: `reprojectAnnotationStrokes` runs the same
px -> fractional tile -> px map (`reprojectOffset`) that the scroll correction
and the PROJ-07 residual already use. `fromCanvasPoint` returns a FRACTIONAL
tile, so freehand keeps its sub-tile precision. Stroke thickness, the eraser
radius and the path builder all stay in px and are untouched — a tile-space
rewrite would have had to answer for each of them, in the same change as the
VIEW-07 restructure.

It runs for VIEWERS too, deliberately: the EDITABLE-only guard beside it exists
because re-projecting `offset` is a MODEL write that VIEW-08 forbids a viewer
from making, and annotation strokes are uiState. The log is re-mapped with the
live strokes, so an undo after the switch puts the stroke back where the content
is now. Promoted regressions:
[`annotationSlice.test.ts`](packages/axoview-lib/src/stores/__tests__/annotationSlice.test.ts)
and [`view-mode-annotation.spec.ts`](packages/axoview-e2e/tests/view-mode-annotation.spec.ts).

## Erasing an annotation stroke cannot be undone — and Undo then deletes a different one

**Found by:** exploratory campaign VIEW-07

**Symptom:** Draw three strokes, erase the middle one, then press the palette's
Undo. The erased stroke does not come back; instead the LAST stroke you drew
disappears. Press Undo again and the one before that goes too. There is no way
to recover an erased stroke.

A second shape of the same bug: undo a stroke (so it is sitting on the redo
stack), then erase anything — the redo stack is silently emptied and the undone
stroke is gone for good.

**Root cause:** `eraseAnnotationStroke` filters the stroke out of
`annotation.strokes` and sets `redoStack: []`. It pushes nothing onto any
history: the annotation history is a pair of plain stacks
(`undoAnnotationStroke` pops the LAST element of `strokes`,
`redoAnnotationStroke` pushes it back), so it can only model
"draw / un-draw" at the tail. An erase is a delete at an arbitrary index and has
no representation in that model, so the next Undo simply eats the tail.

**Workaround:** none.

**Status:** Fixed in wave 4 (2026-08-02) — the operation log the entry
specifies, `{ kind: 'add' | 'erase' | 'clear', stroke/strokes, index }`, with
`past`/`future` replacing the two stroke stacks. The VIEW-13 ruling rides it
(Clear is now an entry in the log, so it is undoable like the Undo/Redo pair
beside it).

`applyAnnotationOp` / `revertAnnotationOp` are pure and are the log's whole
semantics; the property under test is that they are exact INVERSES, rather than
each branch being asserted separately. Two details that were not obvious:

- Reverting an `add` is keyed on stroke IDENTITY, not position — the list may
  have shifted under it when an intervening erase was undone.
- Reverting an `erase` restores at its own index, because later strokes paint
  over earlier ones: re-appending would silently reorder the drawing.

An erase of nothing and a clear of nothing record no operation — an inert log
entry costs a real Undo press to get past. The palette's Undo/Redo now gate on
the log lengths rather than on `strokes.length`; gating Undo on the stroke count
would grey it out after a Clear, which is exactly the case VIEW-13 adds.
Promoted regressions:
[`annotationOps.test.ts`](packages/axoview-lib/src/utils/__tests__/annotationOps.test.ts)
and [`annotationSlice.test.ts`](packages/axoview-lib/src/stores/__tests__/annotationSlice.test.ts).

## A click with the annotation pen leaves an invisible stroke

**Found by:** exploratory campaign VIEW-04

**Symptom:** Click once with the pencil or highlighter without dragging. Nothing
is drawn — but a stroke was committed. It costs an Undo press to remove, it
counts toward what Clear removes, and enough of them accumulate silently over a
presentation.

**Root cause:** `AnnotationLayer.endStroke` gates the commit on `hasExtent`,
and that gate has two branches:

```js
const hasExtent = isShapeOrSeg
  ? cur.points[0].x !== cur.points[1].x || cur.points[0].y !== cur.points[1].y
  : cur.points.length >= 1;
```

The shape/segment branch correctly rejects a zero-extent click (verified for
rectangle, ellipse, line and arrow). The freehand branch reduces to "always
true": a click with no move produces exactly one point, and
`polylinePathD([p])` is `'M 5 5'` — a moveto with no geometry, which draws
nothing at any stroke width.

**Workaround:** none; press Undo after a stray click.

**Status:** Fixed in wave 4 (2026-08-02) — `points.length >= 2` for freehand,
the first of the two options.

Rejected rather than rendered as a dot because the sibling branch already
discards a zero-extent shape, and because in present mode — where the pen mostly
lives — an accidental click leaving a permanent mark is the worse of the two
failure modes. Reversible: emit `M x y L x y` in `strokeHasExtent`'s freehand
branch instead if a deliberate dot turns out to be wanted.

The gate moved out of `AnnotationLayer.endStroke` into
`utils/annotationOps.strokeHasExtent`. That is not tidying: this entry's own
probe TRANSCRIBED the gate into the test file because the real one was buried in
a `useCallback` inside a pointer-driven component, so it asserted its own copy
and could never flip. The extraction is what lets the promoted regression import
the thing that ships. (Queued as a probe-authoring rule for the wave-6
appendix.) Promoted regression:
[`annotationOps.test.ts`](packages/axoview-lib/src/utils/__tests__/annotationOps.test.ts).

## A floating Label's link and notes are unreachable in present mode

**Found by:** exploratory campaign VIEW-05

**Symptom:** Give a floating Label a link (Ctrl+K on the label, or the strip's
Link control) and switch to view/present mode. The ADR 0012 info popover never
appears for it — not on hover unless the Label also has notes, and not at all
when it is selected. The same content on a node opens the popover with a
clickable link.

**Root cause:** `ViewModeInfoPopover` resolves its source from two places and
only one of them knows about labels:

- the hover path has a dedicated `viewModeHoveredLabelId` branch that builds
  `{ type: 'LABEL', id }`, and
- `deriveItemInfo` has a full `case 'LABEL'` returning name / notes /
  headerLink / anchor,

but the selection path is gated on
`const INFO_TYPES = new Set(['ITEM', 'CONNECTOR', 'RECTANGLE', 'TEXTBOX'])`,
which has no `'LABEL'`. So a selected Label is filtered out before
`deriveItemInfo` is ever called. The hover branch that does exist is
notes-gated (hover shows only for items with notes), so a link-only Label has no
route at all. Verified with a node carrying the same content as the CONTROL: the
node pins the popover and renders its link; the Label pins nothing.

**Workaround:** give the Label notes as well, and hover rather than click.

**Status:** Fixed in wave 4 (2026-08-02) — `'LABEL'` added to `INFO_TYPES`,
exactly as directed; `deriveItemInfo`'s `case 'LABEL'` already handled the type
completely, so nothing else changed.

The regression is written for a link-only Label with NO notes, which is the
shape that had no route at all: the hover branch is notes-gated (owner
2026-07-01), so notes+link would have passed through the branch that already
worked. Promoted regression:
[`view-mode-annotation.spec.ts`](packages/axoview-e2e/tests/view-mode-annotation.spec.ts).

## The view-mode popover mangles a mailto: or tel: link

**Found by:** exploratory campaign VIEW-06

**Symptom:** Set an element's link to `mailto:ops@example.com` (the strip's
Link control accepts it verbatim) and open the item's info popover in view mode.
The rendered link is `https://mailto:ops@example.com` — a dead URL. Same for
`tel:` and for a bare fragment.

**Root cause:** Two URL normalisers written for the same job at different times.
`normalizeWebLinkUrl` (`utils/quillLinkShortcut.ts`), used by the text-box
link card and the strip, passes `https?:` / `mailto:` / `tel:` / `#`
through and prefixes everything else. `toHref`
(`ViewModeInfoPopover.helpers.ts`), used to render an element's
`headerLink`, is `/^https?:\/\//i.test(link) ? link : `https://${link}``
— an http(s)-only allowlist. Element-level `headerLink`s are written RAW
(`TopBarStyleControls.onLinkChange`: "element headerLinks keep their raw
semantics"), so whatever the user typed is what the popover has to render.

Note the prefixing is also what neutralises a `javascript:` payload, and both
normalisers do that — a fix must keep an allowlist, not swap in a
"does it have a scheme" check.

**Workaround:** none from the UI.

**Status:** Fixed in wave 4 (2026-08-02) as directed — `toHref` delegates to
`normalizeWebLinkUrl`, and the promoted test asserts the two agree across the
whole scheme matrix rather than only checking `toHref`'s outputs. That
distinction is the point: a second implementation is how this bug happened, and
an output-only table would pass again the day someone reintroduces one.

The allowlist is kept, per the entry's warning — the prefixing is also what
defangs a `javascript:` / `data:` / `vbscript:` payload, so the tempting "does
it have a scheme?" simplification would have turned a cosmetic fix into an XSS
vector. Those four payloads are asserted to be prefixed rather than passed
through. Promoted regression:
[`toHref.test.ts`](packages/axoview-lib/src/components/ViewModeInfoPopover/__tests__/toHref.test.ts).

## Every element panel except the node's is fully editable in view mode

**Found by:** exploratory campaign VIEW-11

**Symptom:** In view/present mode (`EXPLORABLE_READONLY` — the `/display`
viewer route), select a floating Label, a text box, a rectangle or a connector
and open the right-hand panel. It renders its full editing surface, and the
edits stick: typing in the Notes editor writes `label.notes` on a diagram the
viewer is only supposed to be reading. A node's panel, on the same screen in the
same mode, is correctly read-only.

**Root cause:** `RightSidebar` derives `readOnly` correctly
(`editorMode === EXPLORABLE_READONLY`) and passes it to
`ItemControlsManager` — which forwards it to exactly one of its six branches:

```jsx
case 'ITEM':      return <NodePanelWrapper id={…} readOnly={readOnly} />;
case 'CONNECTOR': return <ConnectorControls key={…} id={…} />;
case 'TEXTBOX':   return <TextBoxControls   key={…} id={…} />;
case 'LABEL':     return <LabelControls     key={…} id={…} />;
case 'RECTANGLE': return <RectangleControls key={…} id={…} />;
```

The other four components take no `readOnly` prop at all, so they render their
editable Notes editor (and their other controls) regardless of mode. This is the
same class as the already-filed *Read-only mode is keyboard-editable*
(PTR-01/02/03): `EXPLORABLE_READONLY` is enforced at some surfaces and not
others.

**Workaround:** none.

**Status:** Fixed in 72989e3a (2026-07-30) — `readOnly` is threaded through all
five branches, and `NotesSection` / `MetadataSection` take it (the connector
panel's Add-label button, per-label text field and line select go with them).
One thing the fix direction did not anticipate: `RightSidebar` derived
`readOnly` from an `editorMode` **prop** while every other read-only consumer
reads the store — two sources for one fact, agreeing only because
`Axoview.tsx` is the store's sole production writer. It now fails closed on
either. Promoted regression: the panel legs of
[`readonly-enforcement.spec.ts`](packages/axoview-e2e/tests/readonly-enforcement.spec.ts),
plus the class gate [`readonlyPanels.contract.test.tsx`](packages/axoview-lib/src/components/ItemControls/__tests__/readonlyPanels.contract.test.tsx)
— the "parity test that renders every branch in both modes" this entry asked
for, which also fails if the manager stops forwarding the prop to any branch.

## "Hide view controls" has no writer, and would trap an armed annotation tool if it did

**Found by:** exploratory campaign VIEW-09

**Symptom (a):** The documented present-mode affordance for hiding the on-canvas
chrome for a clean screenshot does not exist. `uiState.hideViewControls` is
declared, defaulted, cleared on mode switch, and read by three components
(`UiOverlay`'s present chrome, its annotation palette, `Axoview`'s bottom
dock) — but `setHideViewControls` has **no caller anywhere in the repo**. No
button, no shortcut, no URL parameter.

**Symptom (b), latent:** If it is wired up as-is, turning it on while an
annotation draw tool is armed leaves the user stranded. `<AnnotationLayer />`
is mounted unconditionally, while the palette is behind
`{!hideViewControls && <AnnotationPalette />}` — so the overlay keeps
`pointer-events: auto` at z-index 25 over the whole canvas with its pen and
tool row gone. Verified: after the flag is set the palette is absent, the layer
still reports `pointer-events: auto` and the tool is still `pencil`. The
only way out is the undocumented Escape/V key.

**Workaround:** n/a (a); press Escape (b).

**Status:** Symptom (b) fixed in wave 4 (2026-08-02); symptom (a) left open
deliberately, with a reason.

**(b) — the latent trap is closed.** `setHideViewControls` now resets
`annotation.tool` to `'select'`, so hiding the chrome can no longer leave a
full-canvas overlay at `pointer-events: auto` with its pen and tool row gone and
only the undocumented Escape/V key as a way out. Disarming rather than keeping
the palette mounted (the entry's other option): the point of the toggle is a
clean screenshot, and a mounted palette defeats it. This was fixed even though
symptom (a) means nothing in the app calls the setter — it is on the PUBLIC
action surface, so an embedder can reach the trap today.

**(a) — the flag is kept, not deleted.** Deleting it would be a breaking change
to `UiStateActions`, and wiring a control is new product surface rather than
remediation. `docs/features.md` referred to "the same 'hide all controls'
toggle" as though it existed; that wording is corrected. Whether to ship a
control is a product decision, deliberately not taken here. Promoted regression:
[`annotationSlice.test.ts`](packages/axoview-lib/src/stores/__tests__/annotationSlice.test.ts)
and [`view-mode-annotation.spec.ts`](packages/axoview-e2e/tests/view-mode-annotation.spec.ts).

## Bolding a multi-selection wipes its italic and underline

**Found by:** exploratory campaign STYL-01 / STYL-06

**Symptom:** Select two floating Labels where one is italic, press the strip's
**B**. Both go bold — and the italic one silently loses its italic. The same
happens to underline and strikethrough, on node labels and connector labels as
well, and the text-box path reaches the same place by a different route: with a
bold box and a plain box selected, one press un-bolds the bold one and leaves
the plain one plain (or bolds both, depending on which box you selected first).

**Root cause:** `TopBarStyleControls.toggleFormat` builds a full quartet from
the REPRESENTATIVE member (`sel = bulk.ids[0]`) and hands the whole thing to
the bulk fan-out:

```js
const next = {
  bold:      name === 'bold' ? !formatValue.bold : !!formatValue.bold,
  italic:    name === 'italic' ? !formatValue.italic : !!formatValue.italic,
  underline: …, strike: …
};
updateLabel(label.id, { isBold: next.bold, isItalic: next.italic,
                        isStrikethrough: next.strike, isUnderline: next.underline });
```

`updateLabel` is the bulk-aware shadow (`applyToTargets('LABEL', …)`), so
every selected label receives the representative's values for all four fields —
not just the one the user pressed. `formatValue` also reads the representative
only, so there is no mixed state and the press direction is decided by one
arbitrary member (STYL-02, STYL-08).

The text-box branch has the same defect in a different shape:
`next = !getWholeContentFormats(representative).bold`, then
`applyInlineFormat(target.content, 'bold', next)` per target — the value is
per-target but the DIRECTION is not.

**Workaround:** style items one at a time.

**Status:** Fixed in wave 4 (2026-07-31) — together with the STYL-02 and STYL-08
rulings, which are the same defect seen from the display side. The strip no
longer derives anything from `bulk.ids[0]`: a toggle reads the whole selection
as a tri-state (`all`/`none`/`mixed`), one press applies to everyone unless
everyone already has the format, and the patch carries **exactly** the pressed
field via `formatFieldPatch` — so italic/underline/strike survive a Bold press
and the selection ORDER no longer changes the outcome. Absolute controls show
"Mixed" instead of one member's value. Recorded as the ADR 0030 2026-07-31
addendum. Probes promoted to
[`bulk-format-mixed.spec.ts`](packages/axoview-e2e/tests/bulk-format-mixed.spec.ts)
and [`bulkStyleDerivation.test.ts`](packages/axoview-lib/src/utils/__tests__/bulkStyleDerivation.test.ts),
with the class gate in
[`bulkStyleFanOut.contract.test.ts`](packages/axoview-lib/src/utils/__tests__/bulkStyleFanOut.contract.test.ts).

## The text-box border opacity slider does nothing on a box with no border

**Found by:** exploratory campaign STYL-05

**Symptom:** Select a text box that has no border, open the strip's Border
popover and drag the Opacity slider. Nothing appears. Pressing a line style or
the width slider in the same popover DOES produce a visible border — because
those two seed a colour and opacity does not. The dragged value is stored all
the same, so a later style press produces a border at whatever opacity was left
behind rather than the opaque default.

**Root cause:** Two of the three writers in that popover carry a seed and the
third does not:

```js
onChange={(style) => updateTextBox(id, { borderStyle: style,
  ...(textBox.borderColor ? {} : { borderColor: '#000000' }) })}   // seeds
onChange={(borderWidth) => updateTextBox(id, { borderWidth,
  ...(textBox.borderColor ? {} : { borderColor: '#000000' }) })}   // seeds
onChange={(v) => updateTextBox(id, { borderOpacity: v >= 1 ? undefined : v })} // does not
```

and `TextBox`'s `borderCss` returns `undefined` whenever `borderColor`
is absent, so an opacity-only write can never render.

**Workaround:** set a line style or width first, then the opacity.

**Status:** Fixed in wave 4 (2026-07-31) — the second option. All three controls
in the popover now write through one `updateTextBoxBorder` helper that seeds
`borderColor` **per target**, so a bulk cannot overwrite the colour of a member
that already has one. Gated by §4 of
[`bulkStyleFanOut.contract.test.ts`](packages/axoview-lib/src/utils/__tests__/bulkStyleFanOut.contract.test.ts):
the helper exists, all three controls call it, and no border field is written
through the raw text-box writer — so a fourth control cannot miss the seed.

## Reordering layers moves the nodes and nothing else

**Found by:** exploratory campaign LAY-01

**Symptom:** Drag a layer above another in the Layers panel. The nodes on it
come to the front, as expected. Floating Labels and rectangles on the same
layers do not move at all — their stacking is unchanged. So a layer is a
z-order concept for one entity type and a visibility/lock group for the rest.

**Root cause:** `layer.order` reaches the shared paint key
(`resolveRenderOrder(layerOrder, zIndex, -x - y)`) in exactly two files, both
of them the node layers — `SceneLayers/Nodes/Nodes.tsx` (DOM) and
`SceneLayers/Nodes/NodesCanvas.tsx` (bulk). Every other layer takes the
context's `layers` only to FILTER visibility:

```js
// LabelsCanvas.tsx — layers is used for the filter, never for the sort
const filtered = allLabels.filter((l) => layersNow.length === 0 || visible.has(l.id));
sorted = [...filtered].reverse().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
```

Verified both ways: for nodes the layer order dominates a `zIndex` of 99 and
the tile position, and swapping two layers' `order` swaps them; for Labels,
reassigning two chips to the opposite layers leaves the sort byte-identical.

This compounds the already-filed layer-`order` collision (RED-04/05) — the
collision is not theoretical precisely because `order` does drive node paint
order.

**Workaround:** use per-element z-order (bring to front / send to back) for
labels and rectangles.

**Status:** Fixed in wave 4 (2026-07-31) for the two layers that sorted on
`zIndex` alone — `LabelsCanvas` and `Rectangles` now key on the shared
`resolveRenderOrder(layerOrder, zIndex, isoDepth)`, so the layer's stack
position dominates the per-element z-index exactly as it does for nodes. The
connector and text-box layers do not sort among themselves at all (they paint in
model order), so there was nothing to re-key there.

It did NOT cross entity types at the time — a rectangle kept painting
structurally under a node — which was GPU-13. **Closed in wave 5 (2026-08-02):**
the four bulk canvases merged into one sorted draw (ADR 0038 §8), so the layer
bucket and `zIndex` now order across types too, and a rectangle on a high-`order`
layer really does paint above a node on a lower one. Promoted regression:
[`layerRenderOrder.test.ts`](packages/axoview-lib/src/utils/__tests__/layerRenderOrder.test.ts),
which carries the zIndex-only comparator as a CONTROL so the test can be seen to
distinguish the two.

## New elements never join a layer

**Found by:** exploratory campaign LAY-03

**Symptom:** Create a layer, move some elements onto it, select that layer's row
in the Layers panel, then drop a new element on the canvas. It lands unassigned.
There is no way to place anything directly onto a layer — every new element goes
into the "unassigned" bucket and has to be dragged across afterwards. On a
diagram that is organised into layers this pile grows with every edit.

**Root cause:** There is no active-layer concept anywhere in the store. The
placement modes write a fixed shape:

```js
scene.placeIcon({ modelItem: { id, name: 'Untitled', icon },
                  viewItem: { ...VIEW_ITEM_DEFAULTS, id, tile, offset } });
```

`VIEW_ITEM_DEFAULTS` carries no `layerId`, and the same is true of
`modes/TextBox.ts`, `modes/Label.ts` and the rectangle draw. Selecting a
layer row sets the panel's own highlight and nothing the placement path reads.

**Workaround:** place first, then drag the row onto the layer in the panel.

**Status:** Fixed in wave 4 (2026-07-31) — exactly as directed. `activeLayerId`
lives in uiState (the selected Layers-panel row IS it, rather than component
state nothing outside the panel could see), and `activeLayerPatch` in the
`resolvePlacement` chokepoint stamps it onto every entity the four placement
modes create.

Two guards, because a stale active layer would be an E2/RED-03 dangling
reference: the panel drops the id as soon as it stops naming a live layer (a
delete from anywhere, a switch to a page without it), and the patch re-checks
against the view's layers at the placement site. It returns `{}` when nothing
is active, so an unlayered diagram's entities stay exactly as lean as before.
Promoted regression:
[`layerAssignment.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/layerAssignment.test.ts).

## Deleting a hidden layer reveals everything it was hiding

**Found by:** exploratory campaign LAY-05

**Symptom:** Hide a layer, then delete it. The elements it contained do not
disappear with it and do not stay hidden — they reappear on the canvas. The only
way to keep them out of sight is to remember to move them to another hidden
layer before deleting.

**Root cause:** `deleteLayer` removes the layer row and unassigns its members:

```js
view.value.layers = view.value.layers.filter((l) => l.id !== layerId);
const unassign = (entity) => { if (entity.layerId === layerId) delete entity.layerId; };
```

and visibility is derived as `baseVisible = !layer || layer.visible`
(`useLayerContext`), so an entity with no layer is unconditionally visible.
The delete therefore inverts the visibility of everything it touches. Verified
with a CONTROL: the same rule reports the entity hidden before the delete and
visible after.

**Workaround:** move the elements to another hidden layer, or delete them, before
deleting the layer.

**Status:** Fixed in wave 4 (2026-07-31) — the product call is the **E2/RED-13
ruling** (owner 2026-07-30), and the two entries ship as ONE change because they
are one gesture: RED-13 asks which meaning applies, and LAY-05's harm is what
makes its "extra warning when the layer is hidden" necessary.

Deleting a layer that HOLDS something now asks: **Keep contents** (unassign, the
historical behaviour) or **Delete contents too** (the Photoshop reading). An
EMPTY layer skips the dialog — there is nothing to decide. When the layer is
hidden the dialog raises an Alert saying in as many words that keeping the
contents makes them visible again, because an element with no layer is
unconditionally shown.

Axoview layers are TAGS, not owners, which is why the ruling took the Visio
pattern (ask) over AutoCAD's (refuse) or Photoshop's (delete silently).

One thing the reducer had to get right that the entry does not mention: "delete
contents" removes connectors **anchored to** a deleted node as well as those on
the layer. Leaving them would be E2/RED-07's shape — an anchor pointing at
nothing, permanently unroutable. Promoted regression:
[`deleteLayerContents.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/deleteLayerContents.test.ts),
which transcribes `useLayerContext`'s visibility derivation to demonstrate the
inversion directly.

## Assigning a layer moves every entity that shares the id

**Found by:** exploratory campaign LAY-11

**Symptom:** Assign a node to a layer (panel drag, or the context menu) and a
rectangle that happens to share the node's id moves onto that layer too.

**Root cause:** `assignLayerToItems` takes bare ids and applies one id-set
filter across all five entity collections:

```js
const idSet = new Set(itemIds);
const assign = (entity) => { if (!idSet.has(entity.id)) return; … };
(view.items ?? []).forEach(assign);
(view.connectors ?? []).forEach(assign);
(view.rectangles ?? []).forEach(assign);
(view.textBoxes ?? []).forEach(assign);
(view.labels ?? []).forEach(assign);
```

The caller has typed `ItemReference`s and drops the type on the way in. Cross-
collection id collisions are not prevented anywhere — *Nothing enforces id
uniqueness* (CLIP-01) is the filed root — so this is that bug's newest consumer.
The same reducer also accepts a `layerId` that names no layer, which is RED-03
through a second door.

**Workaround:** none; the collision is invisible until something moves.

**Status:** Fixed in wave 4 (2026-07-31) — exactly as directed:
`ASSIGN_LAYER_TO_ITEMS` carries `ItemReference[]`, and the reducer buckets them
by type and dispatches per collection. The callers had the typed form in their
hands the whole time. (The `layerId` validation the entry mentions had already
landed in wave 1 with RED-03; it is unchanged.) Promoted regression:
[`layerAssignment.test.ts`](packages/axoview-lib/src/stores/reducers/__tests__/layerAssignment.test.ts),
whose fixture deliberately gives a node, a rectangle and a label the SAME id.

## "Export as JSON" writes the entire icon catalog into the file

**Found by:** exploratory campaign ICON-01 / ICON-02

**Symptom:** Saving a diagram writes a handful of icons. Exporting the SAME
diagram to JSON writes every icon the session has loaded —
the whole AWS / GCP / Azure / Kubernetes / Material catalog, SVG payloads and
all — producing a file many times larger than the stored document.

**Root cause:** ADR 0003's lean-save exists twice, with different rules, and the
export half does nothing:

- `leanIfModel` (`axoview-app/src/services/storage/leanModel.ts`) — used by
  every StorageProvider. Keeps `collection === 'imported'` icons and records
  `requiredPacks` so the load path can re-fetch the packs.
- `stripDefaultIcons` (`axoview-lib/src/utils/leanSave.ts`) — used by
  `exportAsJSON` and the project-ZIP export. Drops an icon only when it is a
  byte-for-byte duplicate of a **bundled fixture** — and
  `axoview-lib/src/fixtures/icons.ts` exports `[]`.

With an empty fixture list nothing can ever match, so `stripDefaultIcons` is
the identity function. Its load-side twin `mergeBundledFixtures` is inert for
the same reason, which means ADR 0002's "the side dock always has the full
catalog regardless of what was saved" is delivered by the app's pack manager
alone — the lib merge contributes nothing.

Measured on a realistic loaded model (one AWS icon in use, plus GCP, core and
one imported icon): the storage path emits one icon and `requiredPacks: ['aws']`;
the export path emits four, and the serialised result is more than twice the size.

Not a data-integrity problem — re-importing the fat file and saving it strips
the pack icons again — but the file is what users mail around.

**Correction (wave 4, 2026-08-01): the project ZIP was never fat.** The entry
names it alongside `exportAsJSON`, but `exportProject` archives the STORED blobs
via `storage.loadDiagram`, and every provider already leans on write. The ZIP
dialog did import and re-export `stripDefaultIcons` without ever calling it,
which is presumably where the claim came from — a dead import read as a code
path. Only the single-diagram "Export as JSON" was genuinely writing the whole
loaded catalog.

**Workaround:** none.

**Status:** Fixed in wave 4 (2026-08-01), with the direction **amended by owner
ruling** and recorded as a dated ADR 0003 addendum.

**The recorded direction could not be followed as written.** "Have
`exportAsJSON` call the same `leanIfModel`" is not a call that can be made:
`leanIfModel` is APP-side and depends on `ALL_ICON_PACK_NAMES`, while
`exportAsJSON` is LIB-side, and the lib cannot import from the app. The
question the entry was really asking is *where the one lean-save lives*.

**The ruling: the ALGORITHM lives in the lib, the CATALOG is a parameter the
host injects.** `stripDefaultIcons` / `mergeBundledFixtures` stay as the only
implementation and now take `catalog: readonly Icon[]`; `src/fixtures/icons.ts`
is retired; the app owns one canonical `services/icons/bundledCatalog.ts`
(pack names + core icons + a live registry the pack manager publishes into), and
`leanIfModel` composes with it instead of re-deriving. An EMPTY catalog strips
nothing, so a host that forgets to inject loses bytes, never data.

**The rejected alternative, for the record:** filling the lib's fixture with the
real catalog. It duplicates the catalog on both sides of the package boundary —
the exact class this wave is closing — bloats a library that publishes
standalone under a bundle-size gate, and drifts the moment a pack changes. *The
empty fixture was a symptom; the defect was that a library held an opinion about
host data.*

**There was a THIRD implementation nobody had counted.** The app's jest mock
stubbed `stripDefaultIcons` as `(model) => model`, so every app-side test of
stripping ran against an identity function — and the lib's own `leanSave.test.ts`
used the empty fixture as both catalog and data, so it asserted that `[]` strips
to `[]` and explicitly skipped the override case as "unreachable in production".
**The one suite whose job was to catch this bug could not see it.** The mock now
re-exports the real lib source; both suites were rewritten against an explicit
catalog. Class gate:
[`leanSaveSingleImplementation.contract.test.ts`](packages/axoview-app/src/services/__tests__/leanSaveSingleImplementation.contract.test.ts).

## A corrupt icon-pack preference breaks icon loading instead of falling back

**Found by:** exploratory campaign ICON-04

**Symptom:** If `localStorage['axoview-enabled-icon-packs']` holds well-formed
JSON of the wrong shape — a bare string, `null`, or a list containing a name
that is not a pack — the pack loader rejects with `Unknown icon pack: …`
instead of falling back to the default set. The value survives across sessions,
so the failure repeats on every boot until the key is cleared by hand.

**Root cause:** `loadEnabledPacks` guards the PARSE and not the SHAPE:

```js
if (!stored) return ALL;
try { return JSON.parse(stored) as IconPackName[]; } catch { return ALL; }
```

The `as IconPackName[]` is an assertion, not a check, so anything that parses
is returned. `loadIconPack` then hits its `default: throw new Error(...)`.
Verified: `'"aws"'` returns the string `'aws'`, `'null'` returns `null`,
and `'["aws","AWS","not-a-pack"]'` returns all three verbatim.

**Workaround:** clear `axoview-enabled-icon-packs` from localStorage.

**Status:** Fixed in wave 4 (2026-08-01) — exactly as directed, both halves.
`loadEnabledPacks` filters against `ALL_ICON_PACK_NAMES` and falls back only
when NOTHING survives, so one bad entry in an otherwise good list costs the user
that one pack rather than all of them; and `loadIconPack` returns null for an
unknown name instead of throwing. The second half matters beyond this entry:
a name can also arrive from a diagram's `requiredPacks`, which is untrusted
file content, and a diagram must never be able to break icon loading. Promoted
regression: [`iconPackPreferences.test.ts`](packages/axoview-app/src/services/__tests__/iconPackPreferences.test.ts).

## The icon-pack manager crashes when localStorage is unavailable

**Found by:** exploratory campaign ICON-05

**Symptom:** In a browser that throws on `localStorage` access — Safari private
browsing, or an iframe with third-party storage blocked — the icon pack manager's
preference readers throw a `SecurityError` instead of falling back to defaults.

**Root cause:** `iconPackManager` touches storage bare:

```js
export const loadLazyLoadingPreference = () => {
  const stored = localStorage.getItem(LAZY_LOADING_KEY);   // no guard
  …
};
export const loadEnabledPacks = (): IconPackName[] => {
  const stored = localStorage.getItem(ENABLED_PACKS_KEY);  // no guard
  …
};
```

Its sibling `axoview-lib/src/config/persistedSettings.ts` wraps every access
("Errors are silently swallowed so a corrupt/missing entry never crashes the
editor") — the same lesson, learned on one side of the boundary only. Verified
with a throwing `localStorage` getter: both pack-manager readers propagate,
while the guarded shape returns `null`.

**Workaround:** none from the UI.

**Status:** Fixed in wave 4 (2026-08-01). Both keys and both writers go through
guarded `safeRead`/`safeWrite` helpers, local to the pack manager rather than
lifted into a shared module: the lib's `persistedSettings` cannot be imported
from the app's services layer, and a third home for four lines would be its own
small duplication. A preference that cannot be persisted no longer costs the
session — the in-memory state is still right for the tab. Promoted regression:
[`iconPackPreferences.test.ts`](packages/axoview-app/src/services/__tests__/iconPackPreferences.test.ts),
which installs a genuinely throwing `localStorage` and carries a CONTROL proving
the stub is in place.

## Deleting an icon says it is unused when only a trashed diagram uses it

**Found by:** exploratory campaign ICON-06

**Symptom:** Delete an imported icon. The confirm dialog reports it is used by no
diagram, so the delete goes through. A diagram in the trash was using it — restore
that diagram and its nodes have an icon reference that resolves to nothing.

**Root cause:** `scanIconUsage` deliberately skips soft-deleted diagrams:

```js
const visible = metas.filter((m) => !m.deletedAt && m.id !== currentDiagramId);
```

The comment explains the reasoning — "surfacing their counts would only confuse
the warning" — which is right for a usage REPORT and wrong for a DELETE gate: the
trashed diagram is restorable, so its reference is live. Verified: the same
diagram is reported when live and invisible once it carries a `deletedAt`.
Nothing downstream catches the result — an unknown icon reference passes both the
schema and `validateView` (CLIP-14).

This is the same shape as the already-filed *Trashing a shared diagram leaves its
public link live* (SHARE-06): the soft delete hides a row from one query and the
row keeps mattering somewhere else.

**Workaround:** empty the trash before deleting icons.

**Status:** Fixed in wave 4 (2026-08-01) — exactly as directed. `scanIconUsage`
scans the trash, the report carries `inTrash`, and the confirm dialog labels
those rows "(in Trash)". The distinction the entry draws is the load-bearing
one: hiding the row was right for a usage REPORT and wrong for a DELETE GATE,
and the fix is to return it LABELLED rather than to hide it from one more place.
Promoted regression:
[`iconUsageTrash.test.ts`](packages/axoview-app/src/services/__tests__/iconUsageTrash.test.ts).

## A resized icon is only clickable on its original tile

**Found by:** exploratory campaign ICON-08

**Symptom:** Enlarge a node with the on-canvas resize handles (ADR 0044). The
icon draws bigger, but only the part sitting over its original single tile
responds to a click — pressing the visibly-drawn area outside that tile selects
nothing. On a 2.5x node most of what the user sees is inert.

**Root cause:** ADR 0044 section 6 states the resize is deliberately visual: the
node keeps a single-tile footprint for collision, hit-testing and anchoring, and
`getItemAtTile` resolves a press to a tile. The rendering side does honour the
scale — every reader resolves `viewItem.iconScale ?? icon.scale ?? 1` and they
all agree (verified across all five readers) — so the drawn extent and the
interactive extent are correct on their own terms and simply describe different
shapes.

Measured with the read-back pixel oracle on the nodes canvas: after scaling to
2.5x the painted bounding box extends well left of where the 1x icon ended, and a
real press there at the node's own vertical band selects nothing, while a press
on the node's tile still selects it.

**Workaround:** click the node's original tile (roughly the centre-bottom of the
drawn icon).

**Status:** Open. This is a documented trade-off rather than an oversight, so the
fix is a product call: either extend the hit test to the scaled extent (which
also has to answer what happens when two enlarged icons overlap), or make the
selectable region visible so the user is not misled about what is clickable.
Repro:
[`iconscale.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/F5-icons/iconscale.explore.spec.ts).

## A failed auto-save throws the unsaved edit away

**Found by:** exploratory campaign A1/LIFE-01

**Symptom:** An auto-save that fails (backend down, Drive 5xx, quota) leaves the
status bar on "Save failed" — and the edit it was carrying is already gone from
the app's memory of what needs saving. Nothing retries it. Pressing Retry, or
Ctrl+S, or opening another diagram, all flush *nothing*; the only thing that puts
the work back in the queue is making another edit.

**Root cause:** `useAutoSave.executeSave` clears the queue before it attempts the
write:

    const pending = pendingRef.current;
    if (!pending || !storageRef.current) return;
    pendingRef.current = null;      // <- before the await
    setSaveStatus('saving');
    try { await storageRef.current.saveDiagram(pending.diagramId, pending.model); }
    catch (e) { setSaveStatus('error'); onErrorRef.current?.(...); }

The catch reports the failure but never restores `pendingRef`, so `saveNow()`
(which returns early on `!pendingRef.current`) has nothing left to send. Combined
with A1/LIFE-03 (the Retry affordance is gated shut) and A1/LIFE-02 (the unload
warning does not fire on `error`), a single failed auto-save is silent data loss
for everything typed since the previous successful save.

**Workaround:** after "Save failed", touch the diagram again (move any element)
to re-queue the model, then wait for the status to clear.

**Status:** Fixed in 2b629c6e (2026-07-30) — the catch path puts the model back in
`pendingRef` unless a newer edit has superseded it, so `saveNow()`, Ctrl+S and the
StatusCluster Retry all have something to send. Promoted regression:
[`useAutoSave.test.ts`](packages/axoview-app/src/hooks/__tests__/useAutoSave.test.ts).

## After a failed auto-save the tab closes without warning

**Found by:** exploratory campaign A1/LIFE-02

**Symptom:** In remote mode (self-host server backend, or Google Drive) make an
edit and let the auto-save fail. While it was still saving, closing the tab
prompted "leave site?". Once the save has *failed* the prompt stops appearing —
the situation got worse and the guard got quieter. The unsaved edit leaves with
the tab.

**Root cause:** two `beforeunload` listeners guard the app and neither knows about
`saveStatus === 'error'`. The first
(`DiagramLifecycleProvider.tsx` ~line 339) triggers on
`hasUnsavedChangesRef.current || (!serverStorageAvailable && sessionWorkUnexportedRef.current)`,
and `hasUnsavedChanges` is hard-coded `false` whenever `remoteStorageActive`
("toolbar uses saveStatus directly in server mode"). The second (~line 795)
triggers on `remoteStorageActive ? autoSave.saveStatus === 'saving' : dirtyDiagramIds.size > 0`
— it enumerates `'saving'` and stops there. So in remote mode `'error'` is
indistinguishable from `'idle'`: the one state that definitely has unpersisted
work is the one state nothing objects to. Same enum-coverage shape as the S3
finding S-e ("enum coverage stops at the values the happy path produces").

**Workaround:** watch the status cluster — do not close the tab while it reads
"Save failed".

**Status:** Fixed in 2b629c6e (2026-07-30) — the two guards are now one
`hasUnsavedWork()` predicate (queued, in flight, or failed, plus session-place
dirt), so the failure state is the loudest rather than the quietest. Promoted
regression: [`DiagramLifecycleProvider.save.test.tsx`](packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx).

## The "Retry" button after a failed auto-save does nothing

**Found by:** exploratory campaign A1/LIFE-03

**Symptom:** When an auto-save fails, the toolbar status cluster renders
"Save failed" with a Retry button next to it. Clicking Retry — even after the
outage is over — performs no write, shows no toast, opens no dialog and leaves
the status on "Save failed". Ctrl+S does the same nothing. The affordance offers
recovery and delivers none.

**Root cause:** `StatusCluster`'s Retry is wired to `handleSaveClick`, whose
remote branch is

    await autoSave.saveNow();
    if (autoSave.saveStatus === 'idle') { ...saveDiagram + success toast... }

`autoSave.saveStatus` is read from the render-time closure, so on the render that
*shows* the Retry button it is `'error'` and the explicit-save branch is skipped
outright. `saveNow()` is the other half of the failure: A1/LIFE-01 already
cleared `pendingRef`, so it returns immediately. Neither half of the function
does anything. This is the caller-side pattern S3 recorded as thread S-d — the
service classifies a failure correctly and the consumer drops it.

**Workaround:** make another edit to the diagram; the next debounced auto-save
re-queues and (once the backend is healthy) succeeds.

**Status:** Fixed in 2b629c6e (2026-07-30) — `saveNow()` returns a
`FlushOutcome` (`nothing-pending` | `saved` | `error`) and `handleSaveClick` acts
on that instead of the closure-stale `saveStatus`; with A1/LIFE-01's re-queue,
Retry writes the unsaved model and confirms it. Promoted regression:
[`DiagramLifecycleProvider.save.test.tsx`](packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx).

## Ctrl+S right after an edit saves but never says so

**Found by:** exploratory campaign A1/LIFE-04

**Symptom:** In remote mode, pressing Ctrl+S (or the toolbar Save) from an idle
diagram shows a `"<name>" saved` toast. Pressing it within two seconds of an
edit — the normal reflex — writes the diagram but shows nothing at all: no
toast, no other confirmation. The same keystroke gives feedback or not depending
on how recently the user typed.

**Root cause:** the same closure read as A1/LIFE-03. `handleSaveClick` awaits
`autoSave.saveNow()` (which does flush the debounced write, so no data is lost)
and then gates the *confirmation* on `autoSave.saveStatus === 'idle'` — a value
captured before the flush, still `'saving'` because `scheduleSave` sets it
immediately for the status bar. So the branch holding both the explicit
`saveDiagram` call and the success toast is skipped precisely when the user has
just edited something.

**Workaround:** none needed for durability — the work is saved; the missing toast
is the whole symptom. Wait for the status cluster to stop saying "Saving…" if you
want confirmation.

**Status:** Fixed in 2b629c6e (2026-07-30) — same change as A1/LIFE-03: the
flush reports its own outcome, so a save inside the debounce window confirms like
any other (and writes the edit exactly once). Promoted regression:
[`DiagramLifecycleProvider.save.test.tsx`](packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx).

## An armed auto-save is cancelled, never flushed — nothing ever drains the debounce

**Found by:** exploratory campaign A1/LIFE-05 (and A1/LIFE-07)

**Symptom:** Edit a diagram and navigate within the app inside the two-second
debounce window (for example to a `/display/...` view). The queued auto-save is
discarded: no write is ever issued, and the status bar the user last saw said
"Saving…".

**Root cause:** `useAutoSave` has exactly one exit for an armed timer and it is
always a cancel, never a flush. The unmount cleanup is

    useEffect(() => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    }, []);

with no `executeSave()`. `App.tsx` renders `<EditorPage />` as the element of
every route, so an in-app route change tears down `AppStorageProvider` →
`AuthProvider` → `DiagramLifecycleProvider` and the hook with them. The one
in-app navigation onto a readonly route (`handlePreviewClick`) does call
`saveNow()` first; anything else — a link, browser back/forward, an
`ErrorBoundary` reset — does not.

The same missing cancellation shows up from the other direction (A1/LIFE-07):
`enabled` is checked only inside `scheduleSave`, so a timer armed while enabled
still fires after `enabled` goes false. A new schedule in that state is correctly
ignored, which confirms the flag itself took effect — only the already-armed
timeout escapes. That leg is latent today (the sole disabling transition flushes
first), but it is the same defect and the same fix.

**Workaround:** pause for two seconds after your last edit before navigating.

**Status:** Fixed in 2b629c6e (2026-07-30) — the unmount cleanup flushes the
queue instead of clearing the timer over it, and `enabled:false` now disarms an
already-armed timer while keeping the queued model for an explicit flush
(A1/LIFE-07). Promoted regression: [`useAutoSave.test.ts`](packages/axoview-app/src/hooks/__tests__/useAutoSave.test.ts).

## `saveNow()` reports "flushed" while the write is still in flight

**Found by:** exploratory campaign A1/LIFE-06

**Symptom:** Signing out of Google within a couple of seconds of an edit can lose
that edit: the app believes it flushed the pending Drive write before revoking
the token, then revokes it out from under the in-flight request. The same race
sits on the open-another-diagram path, where the flush is supposed to land in the
*old* place before the active provider moves.

**Root cause:** `useAutoSave.saveNow()` decides whether there is anything to wait
for by looking at the queue, not at the work:

    if (debounceTimerRef.current) { clearTimeout(...); }
    if (!pendingRef.current) return;      // <- a live write already nulled this
    await executeSave();

`executeSave` nulls `pendingRef` before awaiting the write, so from the moment the
debounce timer fires until the response lands, `saveNow()` sees an empty queue and
resolves immediately. Measured: with a write outstanding, `saveNow()` returns
while `onSaved` has not fired and `saveStatus` is still `'saving'`. Both callers
treat that resolution as durable —
`handleGoogleSignedOut` ("flush any pending debounced autosave to Drive while the
token is still valid — this must run BEFORE the caller revokes it") and
`openDiagramById` ("flush pending writes to the CURRENT place before anything
moves"). ADR 0037 §2 requires that ordering.

**Workaround:** pause for a few seconds after your last edit before signing out
or switching diagrams.

**Status:** Fixed in 2b629c6e (2026-07-30) — the in-flight write is kept in a
ref and `saveNow()` awaits it, so callers that treat the resolution as "the old
place is flushed" (token revoke, place swap) get what they assumed. Promoted
regression: [`useAutoSave.test.ts`](packages/axoview-app/src/hooks/__tests__/useAutoSave.test.ts).

## Overlapping auto-saves report "saved" while the newer write is still outstanding

**Found by:** exploratory campaign A1/LIFE-08

**Symptom:** On a slow connection, where one auto-save is still in flight when the
next one starts, the status bar can settle to "Saved at HH:MM" while the most
recent edit has not reached storage. Every guard that reads that state — the
unload warning, the Ctrl+S gate — is then reading a lie.

**Root cause:** `useAutoSave` tracks no generation and no in-flight set: each
`executeSave` call unconditionally writes the shared status on completion.

    await storageRef.current.saveDiagram(pending.diagramId, pending.model);
    setLastSaved(new Date()); setSaveStatus('idle');

Nothing serialises the writes either, so with two outstanding the *first* one to
resolve — which the network does not guarantee is the older one — stamps
`lastSaved` and `'idle'`. Measured: two writes in flight, resolve the older, and
the hook reports idle + a fresh `lastSaved` with the newer write still pending.
Same shape as the share-backend thread S-b (nothing serialises a
read-modify-write) applied to the client.

**Workaround:** none. Treat "Saved at" as advisory on a slow link.

**Status:** Fixed in 2b629c6e (2026-07-30) — writes serialise (each queues
behind the one on the wire) and a success only reports `idle` when nothing newer
is queued, so an older write can neither land after nor report over a newer one.
Promoted regression: [`useAutoSave.test.ts`](packages/axoview-app/src/hooks/__tests__/useAutoSave.test.ts).

## "New diagram" throws away the last two seconds of the diagram you were in

**Found by:** exploratory campaign A1/LIFE-09

**Symptom:** Edit a diagram, then create a new one (empty-state card, file-tree
"new diagram") within the two-second auto-save debounce. The new diagram opens
normally and the status bar goes clean — but the edit you had just made to the
previous diagram was never written.

**Root cause:** `handleCreateBlankDiagram` puts its flush inside the
place-change branch:

    const targetPlace = placeId ?? defaultPlaceId;
    if (storageManager && storageManager.activeProviderId !== targetPlace) {
      await autoSave.saveNow();
      autoSave.resetStatus();
      setActiveProviderId(targetPlace);
    }

Creating in the place you are already in — the normal case — skips it. The path
then calls `handleDiagramManagerLoad`, which unconditionally runs
`autoSave.resetStatus()`, and `resetStatus` sets `pendingRef.current = null`. So
the queued model is dropped, and because it also sets the status to `'idle'`
nothing on screen suggests anything was lost. The two sibling entry points do
this correctly: `handleNewDiagram` and `openDiagramById` both `await
autoSave.saveNow()` before anything else. Third instance of the S1 thread S-a
shape — one ritual written several times, each forgetting a different part.

**Workaround:** pause two seconds after your last edit before creating a new
diagram.

**Status:** Fixed in 2b629c6e (2026-07-30) — `await autoSave.saveNow()` is
hoisted out of the place-change branch, and `resetStatus()` flushes the queue
rather than discarding it (the pending model is keyed by its own diagram id, so
it cannot collide with the diagram being adopted). Promoted regression:
[`DiagramLifecycleProvider.save.test.tsx`](packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx).

## A corrupt session list makes the app unbootable

**Found by:** exploratory campaign A1/LIFE-10

**Symptom:** If `axoview-diagrams` in localStorage is not valid JSON (an
interrupted write, a quota failure mid-write, a manual edit), `/app` shows the
"⚠️ Something went wrong!" crash screen instead of the editor. Refreshing —
the obvious thing to try — reproduces it exactly, because nothing clears the bad
value. The user has no in-app route back.

**Root cause:** the mount effect in `DiagramLifecycleProvider` parses the same
string twice and guards only the second one:

    const savedDiagrams = localStorage.getItem('axoview-diagrams');
    if (savedDiagrams) {
      setDiagrams(JSON.parse(savedDiagrams));      // <- unguarded
      setIsDiagramsInitialized(true);
    }
    const lastOpenedId = localStorage.getItem('axoview-last-opened');
    if (lastOpenedId && savedDiagrams) {
      try { const all = JSON.parse(savedDiagrams); ... }
      catch (e) { console.error('Failed to restore last diagram metadata:', e); }
    }

The throw escapes the effect and the root `ErrorBoundary` in `index.tsx` swaps
the whole app for the fallback UI. The neighbouring `axoview-last-opened-data`
reader shows what the recovery should look like — it validates the shape,
`localStorage.removeItem`s the bad value and warns. Measured with a
well-formed-value control that boots clean, so the crash is the corrupt value and
not the harness: `Uncaught SyntaxError: Unexpected end of JSON input` at
`DiagramLifecycleProvider.tsx:747`.

**Workaround:** clear site data (or delete the `axoview-diagrams` key in
DevTools).

**Status:** Open. Fix direction: wrap the first parse the way the last-opened
reader is wrapped — warn, `removeItem`, boot with an empty list. Closes the
catalogued coverage gap "boot with a corrupted localStorage session (recovery
path)". Repro: [`boot-life-10.explore.spec.ts`](packages/axoview-e2e/tests-exploratory/A1-lifecycle/boot-life-10.explore.spec.ts).

## Ctrl+S on a read-only /display page saves — and says it saved

**Found by:** exploratory campaign A1/LIFE-11

**Symptom:** On the owner read-only route (`/display/<id>`, where the "Back to
editing" preview lands) pressing Ctrl+S writes the diagram through the storage
provider and shows a `"<name>" saved` toast. A page the app presents as
non-editable performs a write on a keystroke.

**Root cause:** the read-only contract is enforced on the edit path and not on
the save path. `handleModelUpdated` has `if (isReadonlyUrl) return;` — verified
inert, a model update on this route dirties nothing. `handleSaveClick` has no
such guard: with `currentDiagram` populated by the readonly loader it goes
straight to `saveDiagram()` → `executeSave` → `storage.saveDiagram`, and the
window-level Ctrl+S listener is registered by the same provider on every route.
On the public-share route (`/display/p/<uuid>`, server mode) the same call targets
the share uuid as if it were a diagram id, which is a `PUT /api/diagrams/<uuid>`
against a nonexistent id. This is thread C from the interaction block —
`EXPLORABLE_READONLY` exposing a mutating path it should block — reproduced on
an app-shell surface.

**Workaround:** don't press Ctrl+S on a `/display` URL.

**Status:** Open. Fix direction: return early from `handleSaveClick` when
`isReadonlyUrl` (and, for symmetry, from the Ctrl+O branch of the same listener).
Repro: [`readonly-rename-life-11-12-15.explore.test.tsx`](packages/axoview-app/src/__explore__/A1/readonly-rename-life-11-12-15.explore.test.tsx).

## Renaming from the toolbar reverts the name inside the file

**Found by:** exploratory campaign A1/LIFE-12

**Symptom:** Rename the open diagram through the toolbar. The breadcrumb and the
file listing show the new name, but the name stored *inside* the diagram stays
the old one — so an "Export as JSON" writes the old title, and the next save
writes it back into the blob. Renaming the same diagram from the file explorer
does not have this problem.

**Root cause:** two rename paths, one of which updates the model and one of which
does not. `notifyDiagramRenamedFromTree` writes through:

    const updatedModel = { ...currentModelRef.current, title: trimmed };
    setCurrentModel(updatedModel);
    axoviewRef.current.load(updatedModel, { preserveViewport: true });

`handleRenameCurrentDiagram` sets `diagramName` and `currentDiagram.name` and
calls `storage.renameDiagram`, and stops there. Every payload builder prefers the
model: `buildSaveData` is `title: currentModel?.title || diagramName || 'Untitled
Diagram'`, so with a model title present the freshly-typed `diagramName` is never
reached. Measured: after a toolbar rename the next save's payload carries the old
title. Same one-geometry-two-derivations shape as the rendering block's thread
R-a.

**Workaround:** rename from the file explorer (F2) rather than the toolbar.

**Status:** Fixed in 3af90693 (2026-07-30) — both rename paths go through one
`applyDiagramName`, which owns the breadcrumb, `currentDiagram.name` and
`currentModel.title` together; a failed rename reverts all three. Promoted
regression: [`DiagramLifecycleProvider.save.test.tsx`](packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx).

## Deleting a diagram from the Load dialog does not delete it

**Found by:** exploratory campaign A1/LIFE-13

**Symptom:** In the Open/Load dialog, deleting a diagram removes the row and the
confirmation looks complete — but the stored diagram is still there. Nothing is
reclaimed from the session-storage budget, and `axoview-last-opened` keeps
pointing at the row the user just deleted.

**Root cause:** `deleteDiagram` (the dialog's `onDelete`) is only a state filter:

    setPendingConfirm({ message: t('alert.confirmDelete'), onConfirm: () => {
      setDiagrams(diagrams.filter((d) => d.id !== id));
      if (currentDiagram?.id === id) { setCurrentDiagram(null); setDiagramName(''); }
    }});

There is no `storage.deleteDiagram(id)` call and no cleanup of the persistence
triple (`axoview-diagrams` / `axoview-last-opened` /
`axoview-last-opened-data`) beyond the list itself. Measured through the rendered
dialog pair: the list empties, `deleteDiagram` on the provider is never called,
and both last-opened keys still name the deleted diagram. The file-explorer delete
path does call the provider, so this is again two rituals for one operation
(thread S-a).

**Workaround:** delete from the file explorer instead.

**Status:** Open. Fix direction: route the dialog's delete through the same
provider call the explorer uses, and clear the last-opened pointer when it names
the deleted id. Repro: [`open-delete-life-09-13.explore.test.tsx`](packages/axoview-app/src/__explore__/A1/open-delete-life-09-13.explore.test.tsx).

## Diagrams opened from the Load dialog lose their imported icons

**Found by:** exploratory campaign A1/LIFE-15

**Symptom:** In session mode, reload the browser and open a diagram through the
Open/Load dialog: every icon the user imported into it renders as a missing
tombstone. Opening the *same* diagram from the file explorer shows the icons
normally.

**Root cause:** the session persist effect deliberately strips icons out of the
diagram list to stay inside the localStorage budget —

    const diagramsToStore = diagrams.map((d) => ({ ...d, data: { ...d.data, icons: [] } }));
    localStorage.setItem('axoview-diagrams', JSON.stringify(diagramsToStore));

— and `executeLoad`, the Load dialog's handler, loads `diagram.data` **straight
from that restored list**, never asking the storage provider, which still holds
the complete blob. Measured with the list seeded exactly as the app writes it
(`icons: []`) while the provider returns the imported icon: the explorer path
(`openDiagramById` → `storage.loadDiagram`) calls the provider once and gets the
icon; the dialog path calls it zero times and commits a model with `icons: []` to
the canvas. Only the last-opened diagram escapes, because
`axoview-last-opened-data` is a separate unstripped copy.

**Workaround:** open diagrams from the file explorer.

**Status:** Open. Fix direction: have `executeLoad` fetch the blob from the
storage provider (as `openDiagramById` does) and use the list entry only for the
name/timestamps. Repro:
[`readonly-rename-life-11-12-15.explore.test.tsx`](packages/axoview-app/src/__explore__/A1/readonly-rename-life-11-12-15.explore.test.tsx).

## Record correction — area A2's entries were never filed (2026-07-30)

The 2026-07 exploratory campaign's A2 area file
([A2-storage-places.md](docs/reviews/exploratory-2026-07/areas/A2-storage-places.md)) records 13
confirmed bugs, each ending `known_issues: A2/STOR-nn`, but no A2 entry ever
reached this register — the file goes straight from A1/LIFE-15 to A3/ZIP-01.
Found while landing wave 1 of the remediation program (the retired tactical
`docs/tactical/exploratory-remediation.md`; see [ADR 0047](docs/adr/0047-exploratory-testing-program.md)
and git history). The
area file is the evidence of record for those findings; entries are filed here
as each is fixed. **All 13 are now filed** — STOR-11 and STOR-12 with the
single-source-of-truth cluster, the other eleven with the storage cluster
(STOR-15 stays DEFERRED in the area file: it needs two live Google accounts).
Same lesson as the campaign's own MOP-02: a frozen record and the register
drift, and the correction belongs in the register.

## The active storage place is remembered in two places, and a route change splits them

**Found by:** exploratory campaign A2/STOR-12

**Symptom:** Open a Google Drive diagram, navigate to any `/display/*` route and
come back. The app now behaves as if you were in the local place — the autosave
branch, the status cluster and the navigation guards all read
`remoteStorageActive: false` — while every read and write still goes to Drive.

**Root cause:** "which place is active" was held twice: in the module-level
`StorageManager` singleton, which outlives every React tree, and in
`AppStorageProvider`'s `useState('local')`, which does not. `EditorPage` is the
element of every route, so an in-app route change remounts the provider (measured
in a real browser, not inferred from the router's source) and re-seeds the React
copy to `'local'` while the singleton keeps routing to Drive.

**Workaround:** reload the page after coming back from a `/display` route.

**Status:** Fixed in 3af90693 (2026-07-30) — the singleton owns the active place
and the provider state seeds from it (`useState(() => manager.activeProviderId)`).
Promoted regression:
[`AppStorageContext.place.test.tsx`](packages/axoview-app/src/providers/__tests__/AppStorageContext.place.test.tsx).

## A slow /api/config probe hides a whole server workspace for the session

**Found by:** exploratory campaign A2/STOR-11 (product question — ruled 2026-07-30)

**Symptom:** On a server deploy whose backend answers correctly but slowly (cold
start, loaded host, tunnelled dev backend), the app boots into Local mode with a
`console.warn` as the only trace: the file tree shows an empty *local* place
rather than an error, and the user's server-stored diagrams stay invisible until
they happen to reload.

**Root cause:** `fetchRuntimeConfig` wrote its Local-mode fallback into the
module-level `cached`, and `if (cached) return cached` then won for the life of
the page — so a *transport* failure (the 800 ms `AbortSignal.timeout`) was
latched as the answer. Measured: a backend answering in 1.2 s yields
`serverStorage: false` and is never re-probed; the same backend at 400 ms is
detected correctly.

**Workaround:** reload.

**Status:** Fixed in 3af90693 (2026-07-30) — owner ruling
([DECISIONS.md](docs/reviews/exploratory-2026-07/DECISIONS.md)): cache success only. A response
that was actually received is cached (4xx/5xx included — that is this deploy
answering); a transport failure falls back for that caller alone. `inflight`
still dedupes concurrent boot callers, so ADR 0009 D2's single-probe fast path is
unchanged. Promoted regression:
[`useRuntimeConfig.test.ts`](packages/axoview-app/src/hooks/__tests__/useRuntimeConfig.test.ts).

## The server deploy's first save of every diagram writes the whole icon catalog

**Found by:** exploratory campaign A2/STOR-01

**Symptom:** On a self-host/server deployment, the file a diagram is *created*
with contains every icon in the catalog and records no `requiredPacks`. The very
next save rewrites it lean, so the only trace is a fat first write and a diagram
that, if it is never saved again, re-opens without its pack hint.

**Root cause:** `serverCreateDiagram` POSTed `data` straight through.
`leanIfModel` (ADR 0003 — strip bundled pack icons, record the packs the items
need) is applied by the session create, by both save paths and by both Drive
paths; the server create was the one sibling that skipped it.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — the server create applies
`leanIfModel` like every other write path. Promoted regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## `deleteFolder(id, recursive)` means three different things

**Found by:** exploratory campaign A2/STOR-02

**Symptom:** The same call with the same arguments does something different in
each place. Deleting a folder "without its contents" on Google Drive threw the
contents away; deleting one "with its contents" in the browser session kept them.

**Root cause:** the server path forwarded `?recursive=`; the Drive path ignored
the flag and always cascaded (Drive trashes descendants with their parent); the
session path ignored it the other way and only ever removed the folder row. So
`recursive: true` in the session place was *weaker* than `recursive: false` on
Drive.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — all three honour the flag. Drive
moves the children out to the deleted folder's parent before trashing it; the
session place removes the contents on a recursive delete and re-parents them on a
non-recursive one (see A2/STOR-03). Promoted regressions:
[`GoogleDriveProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.test.ts)
and
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## Deleting a folder in the browser session orphans the diagrams inside it

**Found by:** exploratory campaign A2/STOR-03

**Symptom:** Delete a non-empty folder in the local place. The folder disappears
and the diagrams that were in it disappear too — but they are not gone: they are
still in `axoview_diagrams` with a `folderId` naming a folder that no longer
exists, so no listing shows them, nothing can delete them, and they still count
against the 5 MB session budget and against every `listDiagrams()` consumer
(the storage gauge, icon-usage scans, export scope).

**Root cause:** `localDeleteFolder` only ever rewrote the FOLDER list. The
`recursive` flag widened the folder sweep and nothing else; the diagrams were
never touched on either branch.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — a recursive delete removes the
diagrams and their blobs; a non-recursive one moves them (and any child folders)
up to the deleted folder's parent, so nothing is ever left pointing at a folder
that is gone. Promoted regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## A server outage silently replaces your workspace with an empty one

**Found by:** exploratory campaign A2/STOR-04

**Symptom:** On a server deployment, a backend blip empties the file tree: no
error, no toast, no console line — it looks like an empty workspace. Saving from
that state throws, because the write half still targets the server.

**Root cause:** `listDiagrams`, `loadDiagram`, `listFolders` and
`getTreeManifest` all catch every server error and return the per-tab
sessionStorage answer instead. The read half and the write half disagreed about
whether the backend exists, silently.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — the fallback stays (a transient blip
must not empty the screen with an exception) but is no longer silent: it logs the
failure and dispatches `axoview-server-unreachable` so the shell can surface it.
Promoted regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## One corrupt storage value bricks the whole file tree

**Found by:** exploratory campaign A2/STOR-05

**Symptom:** A single malformed `axoview_diagrams`, `axoview-folders` or
`axoview-tree-manifest` value makes every listing throw `SyntaxError`, so the
file explorer shows nothing and cannot recover — including on a server
deployment, where the fallback was supposed to make listing failure-proof.

**Root cause:** those three readers called `JSON.parse` unguarded, while the
`renameDiagram` blob parse in the same file was guarded. In server mode the
fallback sits *inside* the catch, so the fallback's own throw escaped the try.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — one guarded parse helper for all
three: a corrupt value degrades to empty and is reported, never thrown. Promoted
regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## A quota failure mid-save leaves bytes nothing can reach

**Found by:** exploratory campaign A2/STOR-06

**Symptom:** With the session store near its 5 MB cap, a save that fails leaves
the diagram's bytes behind: the save reports an error, no listing shows the
diagram, nothing can delete it, and the space it takes is gone for the rest of
the session.

**Root cause:** `sessionSaveDiagram` wrote the blob first and the index second.
A `QuotaExceededError` on the index write left the blob committed with nothing
referencing it.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — the blob write is rolled back (or
restored to its previous value) before the error propagates, so a failed save
costs the save but not the budget. Promoted regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## Renaming, restoring or moving a diagram does not update the storage gauge

**Found by:** exploratory campaign A2/STOR-07

**Symptom:** The session storage gauge and the "you have unexported work"
export guard miss some mutations: rename a diagram, restore one from the trash or
drag one into a folder and neither notices.

**Root cause:** `axoview-session-changed` was dispatched by `sessionSaveDiagram`
and `sessionDeleteDiagram` only. `renameDiagram`, `restoreDiagram` and the
diagram branch of `moveItem` mutate `sessionStorage` and stayed quiet — the
ritual-drift shape the campaign's thread S-a describes.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — one `notifySessionChanged()` helper,
called by every path that mutates the session place. Promoted regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## A Drive hiccup during "new diagram" can create the file twice

**Found by:** exploratory campaign A2/STOR-08

**Symptom:** Creating a diagram (or a folder) on Google Drive while Drive is
flaky can leave two files. The call reports success and returns the second id, so
the first is an orphan the app never mentions and no listing explains.

**Root cause:** `GoogleDriveProvider.request()` retries 429/5xx/network errors by
replaying the same request — including the non-idempotent multipart POST that
creates a file. A 5xx returned *after* the write committed made the retry create
a second one. The existing retry tests drive `loadDiagram`, a GET.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — POST is no longer replay-safe: it
fails fast and the caller decides. Every other method still retries. (Drive's
resumable uploads carry an upload id and would make the create genuinely
retriable; that is a larger change, and failing fast beats silently duplicating
the user's file.) Promoted regression:
[`GoogleDriveProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.test.ts).

## "Move to Drive" can report failure for a diagram it successfully copied

**Found by:** exploratory campaign A2/STOR-09

**Symptom:** Moving diagrams to Drive reports one as failed. It is not: the Drive
copy exists and is verified — only the removal of the session copy failed, so the
diagram is now in both places. The report gives no way to tell, and moving the
same selection again creates a *second* Drive copy.

**Root cause:** `moveDiagramsToDrive` wraps create + verify + source-delete in one
try/catch. A throw from the source delete produced `ok: false` with `driveId`
dropped, which is indistinguishable from "the create failed".

**Status:** Fixed in 2b0e5f41 (2026-07-30) — a failed source delete reports
`ok: true` with the `driveId` it created and a `sourceRemained` flag;
`MigrateSessionDialog` names the diagrams that now exist in both places, so a
retry cannot mint a second copy. Promoted regression:
[`driveTransfer.test.ts`](packages/axoview-app/src/services/storage/__tests__/driveTransfer.test.ts).

## A Drive diagram moved out of the Axoview folder becomes invisible

**Found by:** exploratory campaign A2/STOR-13

**Symptom:** Move an Axoview diagram out of the Axoview folder using Drive's own
UI. It vanishes from the file explorer — not into another folder, into nothing —
while still being counted by everything that consumes the listing.

**Root cause:** `GoogleDriveProvider.listDiagrams(undefined)` queries by the app
marker with no root term (Drive has no recursive-parent query), so it matches the
whole account. The file comes back with a `folderId` naming a folder
`listFolders()` knows nothing about, and `buildTree` places diagrams by exact
`folderId` match — so it appeared under no folder and at no root.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — `useFileTree` re-homes a diagram
whose folder is not in the tree to root, where the user can see it and move it
back. Done there rather than in the provider because that hook already holds both
lists; the provider would pay an extra Drive listing per call. Promoted
regression:
[`useFileTree.orphans.test.ts`](packages/axoview-app/src/hooks/__tests__/useFileTree.orphans.test.ts).

## Saving discards icons that exporting preserves

**Found by:** exploratory campaign A2/STOR-14

**Symptom:** An icon from a pack this build no longer ships survives an "Export
as JSON" but is dropped by every save, and comes back as a tombstone on the next
load.

**Root cause:** the app's `leanIfModel` keeps `collection === 'imported'` only —
a stricter rule than ADR 0003 and than the lib's `stripDefaultIcons`, which keeps
anything a bundled fixture does not reproduce. Save and export disagreed about
what counts as user data, and `mergeBundledFixtures` cannot restore what no pack
supplies.

**Status (override half, wave 4 — 2026-08-01):** closed. The remaining case ADR
0003 lists as an acceptance criterion — a bundled icon the user OVERRODE
(renamed, re-pointed) — needed a catalog to compare against, and the app had
none. It has one now: `services/icons/bundledCatalog.ts`, built as part of the
F5/ICON-01/02 ruling (ADR 0003 addendum 2026-08-01). `leanIfModel` keeps an
override, so the bundled original can no longer silently take its place on the
next load. The comparison itself is DELEGATED to the lib's `stripDefaultIcons`
rather than re-implemented app-side, which is the same ruling's point.

**Status (wave 1 half):** Fixed in 2b0e5f41 (2026-07-30) — an icon is kept unless a collection
the load path can actually rehydrate (the bundled `isoflow` set or a shippable
pack) supplies it. The remaining half of this entry — a user's *override* of a
bundled icon, which ADR 0003 lists as an acceptance criterion — needs the bundled
catalog to compare against, and the app's half of that catalog is itself empty:
that is wave 4's F5/ICON-01/02. Promoted regression:
[`leanModel.test.ts`](packages/axoview-app/src/services/storage/__tests__/leanModel.test.ts).

## A failed folder-order save reports success and then silently reverts

**Found by:** exploratory campaign A2/STOR-16

**Symptom:** On a server deployment, reordering folders while the backend is
unhappy appears to work. The next time the tree loads cleanly, the ordering is
back to what it was, with no error at any point.

**Root cause:** `saveTreeManifest` caught the server failure and wrote
localStorage instead, then resolved — so the UI saw success. `getTreeManifest`
prefers the server copy and only falls back to localStorage on error, so the
stale server copy won the next healthy read. The read and write halves fell back
to the same store with opposite authority.

**Status:** Fixed in 2b0e5f41 (2026-07-30) — in server mode the server owns the
manifest: a failed save rejects (so the caller can report it) and leaves no local
copy to shadow it, and a later successful save clears any stale one. Promoted
regression:
[`LocalStorageProvider.test.ts`](packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts).

## A project ZIP whose folders form a loop freezes the app

**Found by:** exploratory campaign A3/ZIP-01

**Symptom:** Importing a project ZIP whose manifest describes a folder that is
(directly or transitively) its own parent hangs the tab — no error, no progress,
no way out but closing it. The anti-zip-bomb caps do not help: the archive can be
a few hundred bytes.

**Root cause:** `importProject` orders folders by climbing the parent chain with
no visited set:

    const depthIn = (f: FolderMeta): number => {
      let n = 0; let cur = f;
      while (cur && cur.parentId) {
        const next = rewritten.folders.find((x) => x.id === cur!.parentId);
        if (!next) break;
        cur = next; n++;
      }
      return n;
    };

With `A.parent = B` and `B.parent = A` the `while` never terminates.
`wipeWorkspace`'s `depth` helper has the identical shape. The same file already
knows the fix — `collectFolderSubtree` (the export side) carries a
`seen` set precisely to survive this — and `rewriteIds` maps parents through
`idMap` with no walk at all, so it terminates on the same input. Nothing between
`parseProject` and the walk validates acyclicity: `validateFolderIds` checks the
id characters only.

Measured by capping `Array.prototype.find` (the walk calls it once per step, and
a jest timeout cannot help because the loop never yields): an acyclic two-folder
manifest completes in under 100 calls, the cyclic one is still going at 10 000.

**Workaround:** none from inside the app.

**Status:** Fixed in cef61900 (2026-07-30) — both halves. `parseProject` rejects
a cyclic folder graph with a domain error (`BAD_FOLDER_GRAPH`), so the reachable
path now surfaces the import-error dialog; and one `folderDepth` helper carrying
the `seen` set replaces both walks, so they terminate on their own —
`wipeWorkspace` needs that independently (its folders come from storage, where a
cycle cannot be rejected at parse time) and `importProject` is exported, so a
caller can bypass the parse gate. Promoted regression:
[`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## Importing part of a project leaves its cross-diagram links pointing nowhere

**Found by:** exploratory campaign A3/ZIP-02

**Symptom:** Export a single folder (or a single diagram) and import it
somewhere else. Any node in it that linked to a diagram left behind still
carries the *source workspace's* id, so the link is dead — and nothing in the
import result or the UI mentions it.

**Root cause:** `rewriteRefsInModel` rewrites a reference only when the id is in
the map it built from this archive's manifest:

    if (k === 'link' && typeof v === 'string' && idMap.has(v)) { out[k] = idMap.get(v); }
    else { out[k] = rewriteRefsInModel(v, idMap); }

A folder- or diagram-scope export cannot contain every diagram the models point
at, so `idMap.has(v)` is false for exactly those and the old id is copied
through untouched. `importProject` returns `{ folderCount, diagramCount }` and
nothing else, so there is no channel for "3 references could not be resolved".
Measured with an in-archive control that IS rewritten, so the rewrite pass is
demonstrably running.

Worth noting for anyone extending this: `modelItems.link` is the only schema
field that can hold a diagram id — `textBox` has no link field and
`headerLink` is a plain URL — so the rewrite list is complete as far as diagram
references go. The hole is scope, not coverage.

**Workaround:** export whole projects rather than subtrees when links cross
folders; re-point the links by hand after a partial import.

**Status:** Fixed in d195c032 (2026-07-30) — a `link` whose target is not in
the archive is dropped rather than carried through to resolve against the
importer's own storage, and the count is reported in the import summary (which
drops from success to warning when anything was lost). URL-shaped values are
left alone. Promoted regressions:
[`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts)
and
[`importSummary.test.ts`](packages/axoview-app/src/utils/__tests__/importSummary.test.ts).

## A failed "replace everything" import destroys part of the workspace and imports nothing

**Found by:** exploratory campaign A3/ZIP-03

**Symptom:** The import dialog's "replace all" (the destination that needs
`replace` typed to confirm) wipes the workspace first. If any single delete
fails part-way through — a network blip on the server backend, a Drive
permission error — the import aborts, and the user is left with neither their old
workspace nor the new one: whatever was deleted before the failure is gone.

**Root cause:** `wipeWorkspace` is a plain sequential loop with no snapshot and
no rollback, and `importProject` runs it before anything else:

    if (opts.destination.kind === 'replaceAll') { await wipeWorkspace(storage); }
    …
    for (const d of diagrams) await storage.deleteDiagram(d.id, false);

A throw propagates straight out of `importProject`. Measured with the second
`deleteDiagram` failing: one diagram gone, two plus the folder still there,
`createDiagram` never called. The module already models the all-or-nothing
principle elsewhere — its own test suite asserts "a failed parse does not modify
storage" — but only for failures before the wipe.

**Workaround:** export a project ZIP before using "replace all".

**Status:** Fixed in e894a593 (2026-07-30) — the import snapshots the existing
workspace, creates alongside it, and deletes the old content only once every
create has succeeded. A failure mid-import now leaves the workspace as it was
rather than destroying it and importing nothing. Promoted regression (including
the positive control that replaceAll still replaces): [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## The import success message counts diagrams that were not imported

**Found by:** exploratory campaign A3/ZIP-05

**Symptom:** After importing a project ZIP the toast reports how many diagrams
the archive *claimed*, not how many arrived. A ZIP with an entry whose diagram
file is literally `null` reports one more than exists.

**Root cause:** `importProject` skips such entries —

    const rawModel = rewritten.models.get(d.newId);
    if (rawModel == null) continue;

— and returns the true `diagramCount`. `App.tsx` discards that return value and
builds the message from the manifest instead:

    await importProject({ storage }, parsed, { destination: { kind: 'root' } });
    …
    message: buildZipImportSummary(parsed.manifest.diagrams.length, parsed.manifest.folders.length)

Measured with a three-entry manifest (`null` / `42` / valid):
`diagramCount` is 2, the manifest length is 3, and the user is told 3. See also
A3/ZIP-15 — the `42` entry is the one that *does* get counted, as a blank
diagram.

**Workaround:** check the file tree against the number in the toast.

**Status:** Fixed in 11cae8e7 (2026-07-30) — the summary is built from
`importProject`'s return value, and when it disagrees with the manifest's claim
the toast says so and drops from success to warning. `buildZipImportSummary`
moved to `utils/importSummary.ts` so it can be tested without dragging
react-router in. Promoted regression:
[`importSummary.test.ts`](packages/axoview-app/src/utils/__tests__/importSummary.test.ts).

## A JSON file can file itself into a folder that does not exist

**Found by:** exploratory campaign A3/ZIP-06

**Symptom:** Importing a single `.json` diagram that happens to carry a
`folderId` field (one exported from another workspace, or hand-edited) creates a
diagram the file tree never shows. It counts against the storage budget and
appears in listings, but it is in no folder the tree knows about.

**Root cause:** both single-JSON call sites spread the untrusted file straight
into the create:

    const blob = isPersistedDiagramBlob(data) ? data : {};
    const newId = await storage.createDiagram({ ...blob, name, title: name }, null);

`isPersistedDiagramBlob` is a shape check, not a field whitelist, so
`folderId` (and `id`, and `deletedAt`) ride along.
`LocalStorageProvider.sessionSaveDiagram` then prefers the blob's value over the
caller's:
`const folderId = blob.folderId !== undefined ? blob.folderId : existing?.folderId ?? null`
— so the explicit `null` destination loses. The ZIP importer strips the blob's
`id` for exactly this class of reason, with a comment about the 409 it once
caused; this path strips nothing. End state is the same orphan as A2/STOR-03.

Measured against the real provider, with a control showing the same call lands at
the root when the field is absent.

**Workaround:** delete `folderId` from the file before importing it.

**Status:** Fixed in 087f3a8c (2026-07-30) — `sanitizeImportedBlob` strips the
fields storage owns (`id`, `folderId`, `deletedAt`) from an imported document and
applies the resolved name, so the create's destination argument wins. Landed
together with the A3/ZIP-09 ruling, which removes the second single-JSON call
site entirely. Promoted regression:
[`importedBlob.test.ts`](packages/axoview-app/src/services/storage/__tests__/importedBlob.test.ts).

## Exporting and re-importing a project brings deleted diagrams back

**Found by:** exploratory campaign A3/ZIP-07

**Symptom:** Delete a diagram, export the project, import it again (into this or
another workspace): the deleted diagram is back in the tree as a normal
diagram.

**Root cause:** the UI's delete is a *soft* delete (`deletedAt`, recoverable from
the trash), and nothing on the export path filters it. `exportProject` walks
`storage.listDiagrams()`, which returns trashed rows, and writes each one's model
into the archive; `importProject` then creates every manifest entry as a live
diagram. `deletedAt` is carried in the manifest and used by nothing.

Measured end to end through a real ZIP: a soft-deleted diagram appears in
`parsed.manifest.diagrams`, and after `importProject` its copy has no
`deletedAt`.

**Workaround:** empty the trash before exporting.

**Status:** Fixed in 11cae8e7 (2026-07-30) — the export filters `deletedAt` rows,
so export and import now hold the same position: the trash is not part of a
project export. (The alternative — carrying the flag through the import — was
available and is recorded in the entry above; filtering keeps the archive a
description of the live workspace.) Promoted regression: [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## Every import failure shows the same message, and one of them is wrong

**Found by:** exploratory campaign A3/ZIP-08

**Symptom:** Whatever goes wrong with an import — a non-ZIP file, a ZIP with no
manifest, an archive over the size cap, a valid archive missing one of its
diagram files, or a project exported by a genuinely newer Axoview — the dialog
says the same thing: *"This file isn't a valid Axoview diagram. Make sure it's a
.json or .zip exported from Axoview."* For most of those causes that sentence is
false and points the user at the wrong fix.

**Root cause:** `projectZip.ts` classifies carefully — nine
`ProjectZipError` codes (`BAD_ZIP`, `NO_MANIFEST`, `BAD_MANIFEST`,
`BAD_FORMAT`, `UNSUPPORTED_VERSION`, `MISSING_DIAGRAM`, `BAD_DIAGRAM`,
`TOO_LARGE`, `BAD_ID`), several with messages written for the user (Google's own
wording is even threaded through elsewhere in the codebase for the same reason).
None of it survives the caller. `App.tsx` does
`console.error('handleDirectImportFile failed:', err); setImportError(true)` and
`ImportErrorDialog`'s props are `{ open, onDismiss }` — no error, no code, a
constant body string. `err.code` is read nowhere in the app.

Compounding it, a manifest with **no** `version` at all is classified as
`UNSUPPORTED_VERSION` ("exported by a newer Axoview (version undefined); please
upgrade") because `SUPPORTED_VERSIONS.has(undefined)` is false — so a merely
corrupt manifest, if its message were shown, would tell the user to upgrade an
already-current app.

This is thread S-d from the share/backend block: a typed failure is only as good
as what the caller does with it.

**Workaround:** none — the cause is not recoverable from the UI.

**Status:** Fixed in 96a8bff8 (2026-07-30) — the error reaches
`ImportErrorDialog`, which maps `ProjectZipError.code` to copy that is true for
that failure (too large / newer version / incomplete archive / damaged manifest),
with the generic body kept for anything unclassified. A versionless manifest is
reclassified `BAD_MANIFEST`. Promoted regressions:
[`ImportErrorDialog.test.tsx`](packages/axoview-app/src/components/__tests__/ImportErrorDialog.test.tsx)
and
[`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## Folder ordering never survives an export/import round trip

**Found by:** exploratory campaign A3/ZIP-10

**Symptom:** Import a project ZIP and the folder ordering the user arranged is
gone — folders come back in whatever order the tree derives by default. The
ordering *is* in the archive; it is read and then dropped.

**Root cause:** `exportProject` writes `tree-manifest.json` and `parseProject`
surfaces it as `ParsedProject.treeManifest` — but `importProject` never
references `parsed.treeManifest` and never calls `storage.saveTreeManifest`.
ADR 0001 lists the file as part of the format. Separately, the export does not
scope it: a single-*diagram* export (an archive with zero folders) still embeds
the entire workspace's folder ordering.

Measured: a diagram-scope ZIP whose `manifest.folders` is `[]` carries
`treeManifest: { folders: [{ id, order: 7 }] }`, and after import the destination
still has its empty default.

**Workaround:** re-order folders by hand after importing.

**Status:** Fixed in e894a593 (2026-07-30) — the import applies the archive's
tree manifest, remapping each folder id through the ids it just minted, and
merges rather than replaces so an import into an existing workspace keeps the
rows already there; the export scopes the manifest to the folders actually in the
archive. Best-effort on both sides — ordering is cosmetic and must never fail an
import. Promoted regression: [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## One unreadable diagram aborts the whole project export

**Found by:** exploratory campaign A3/ZIP-11

**Symptom:** If any single diagram cannot be read while a project ZIP is being
built — a 404 mid-listing on Drive, a corrupt session blob, a permission error —
the export fails outright and no archive is produced. For a gesture whose entire
purpose is "get my work out", losing everything because of one bad row is the
worst available outcome.

**Root cause:** the per-diagram read is unguarded while the optional read beside
it is explicitly best-effort — the same function, two policies:

    for (const meta of diagrams) {
      const model = await storage.loadDiagram(meta.id);   // any throw ends the export
      …
    }
    try { const treeManifest = await storage.getTreeManifest(); … }
    catch { /* Tree manifest is best-effort — failure must not block export. */ }

Measured with both halves in one test: a failing `loadDiagram` rejects
`exportProject`, a failing `getTreeManifest` still yields a ZIP.

**Workaround:** export a narrower scope (a folder or a single diagram) to route
around the unreadable one.

**Status:** Fixed in 11cae8e7 (2026-07-30) — the export skips a diagram it cannot
read, returns it in `skipped`, and `ExportProjectZipDialog` reports which ones
are missing from the archive the user just downloaded. 41 of 42 reach disk
instead of none. Promoted regression: [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## Importing renames a diagram back to a stale title

**Found by:** exploratory campaign A3/ZIP-13

**Symptom:** A diagram renamed from the toolbar (or any Drive diagram, where the
file name and the stored title are separate things) comes back from an
export/import round trip under its old name. The manifest recorded the right one.

**Root cause:** `importProject` creates from the model alone and passes no name:

    await storage.createDiagram(model, folderId);

so the provider falls back to the blob (`blob.name ?? blob.title`), while
`manifest.diagrams[].name` — the listing name, which is what the user sees and
what the export correctly captured — is used for nothing. Any workspace where
the listing name and the blob title disagree loses the listing name on import.
A1/LIFE-12 is one way to reach that state from the toolbar; on Drive it is the
normal state, because the file name lives on the Drive file and the title lives
inside the blob.

Measured end to end: exported with `manifest.diagrams[0].name === 'Name The User
Sees'`, imported as `'Old Title'`.

**Workaround:** rename from the file explorer (which syncs both) before
exporting.

**Status:** Fixed in 11cae8e7 (2026-07-30) — the import writes the manifest's
name onto both `name` and `title` before the create, so what the export recorded
(the name the workspace actually showed) wins over the blob's stale title.
Promoted regression: [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## A corrupt diagram entry imports as a blank diagram and counts as a success

**Found by:** exploratory campaign A3/ZIP-15

**Symptom:** A project ZIP whose diagram file contains valid JSON that is not an
object (`42`, `"text"`, `[]`) imports as an empty untitled diagram, counted as
imported, with no warning. Three kinds of broken entry get three different
outcomes and only one of them is reported.

**Root cause:** `importProject` normalises a non-object model to an object and
then spreads it:

    const { id: _strippedId, ...model } =
      rawModel && typeof rawModel === 'object'
        ? (rawModel as Record<string, unknown>)
        : { id: undefined };
    await storage.createDiagram(model, folderId);

For `42` that destructure yields `{}`, so a blank diagram is created and
`diagramCount` is incremented. Compare the other two cases: unparseable JSON is
correctly rejected up front (`BAD_DIAGRAM`), and a `null` model is silently
skipped by `if (rawModel == null) continue` (see A3/ZIP-05 for the resulting
overcount). Measured with all three in one manifest: two diagrams created, named
`Good one` and `Untitled Diagram`, the latter with `data === {}`.

**Workaround:** none — the blank diagram has to be deleted by hand.

**Status:** Fixed in 11cae8e7 (2026-07-30) — `parseProject` rejects a diagram
entry that is not an object with `BAD_DIAGRAM`, so `null`, a number and an array
all take the one error path that already existed instead of importing as a blank
diagram that counts as a success. Promoted regression: [`projectZip.test.ts`](packages/axoview-app/src/services/project/__tests__/projectZip.test.ts).

## Deleting the open diagram blanks the canvas before the storage delete, so a failed delete hides work that is still there

**Found by:** exploratory campaign A4/FEX-08

**Symptom:** Delete the diagram that is currently open. If the storage delete
fails — offline, a Drive 403, a server 500 — the toast says "Delete failed", but
the canvas has already been reset to blank and the diagram's autosave cancelled.
The work is still in storage, and nothing on screen says so; re-opening it from
the tree is the only way back.

**Root cause:** `confirmDelete` in `FileExplorer.tsx` calls
`notifyDiagramDeletedFromTree(target.id)` (canvas reset + autosave cancel)
*before* `await tree.hardDeleteDiagram(target.id)`, and the `catch` that shows
"Delete failed" does not undo it. The comment above the call explains the
ordering as protecting against an in-flight autosave recreating the diagram
after the delete — a real concern, but it makes the failure path lose the
canvas. The folder branch immediately above needs no reset at all, so the two
branches already disagree about when the UI may be torn down.

Measured: with `deleteDiagram` rejecting, the ordered trace is
`['canvas-reset(d1)', 'storage-delete']`, the error toast is shown, and the
diagram is still in the provider's listing.

**Workaround:** re-open the diagram from the file explorer after a failed
delete.

**Status:** Fixed in wave 4 (2026-08-02) — the entry's SECOND option, restore
the diagram into the canvas in the `catch`.

Not the first ("reset only after storage confirms"), because the reset-first
ordering is load-bearing and the comment above it is right: it cancels the
in-flight autosave so a save cannot recreate the diagram after the delete
lands. Deferring it would trade this bug for that one. Restoring on failure is
safe precisely because the delete did NOT happen — the work is still in storage,
and re-opening it is the same call the user would make by hand.

Scoped to the diagram that was OPEN: re-opening an unrelated one would navigate
the user somewhere they never asked to go, and there is a test for that.

Note this is why the probe could not flip — it asserted the MECHANISM (`order`
must not contain the canvas reset) rather than the outcome, so a legitimate
alternative fix reads as no fix. Re-derived on promotion; queued as a
probe-authoring rule for the wave-6 appendix. Promoted regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## The name-collision dialog offers "Replace" and only moves — leaving two identically-named siblings

**Found by:** exploratory campaign A4/FEX-09

**Symptom:** Drag a diagram into a folder that already holds one with the same
name. The dialog asks "already exists in this folder. Replace it?" and offers
Cancel / Replace. Press Replace and both end up side by side with the same name
— the folder now has two rows the user cannot tell apart, and the one they meant
to replace is still there.

**Root cause:** `confirmMove` calls `treeFor(placeId).moveItem(...)` and nothing
else. There is no delete of the colliding sibling, and no rename-with-suffix
either, so "Replace" is exactly the same operation the non-colliding path
performs. `detectCollision` (`utils/fileOperations`) only decides whether to
raise the dialog.

Measured: after Replace, the provider log holds one `moveItem` and no delete,
and the destination folder holds two rows named `Report`.

**Workaround:** rename one of the two afterwards.

**Status:** Fixed in wave 4 (2026-08-02) — the entry's SECOND option: the
dialog now says **"Keep both"** and does exactly that, moving the item in under
a `copySuffix` name. The other button is **Skip**, which resolves just that
collision and leaves the rest of the queue offered (see FEX-10).

Implementing a real replace was rejected for the reason the entry itself flags:
it has to DELETE the colliding sibling inside this confirmation, and for a
folder that means inheriting the delete's own descendant-count semantics — a
destructive action behind a dialog whose copy never mentioned it. The
non-destructive reading is also the one that cannot lose work.

The regression asserts both items survive **under distinct names**, since the
bug was two rows the user could not tell apart rather than the move itself.
Promoted regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## A multi-select drag is abandoned at the first item that is skipped or collides

**Found by:** exploratory campaign A4/FEX-10

**Symptom:** Select several diagrams and drag them into a folder. If any one of
them is already in that folder, or its name collides with something already
there, the *rest of the selection never moves* — silently: no error, no toast,
nothing in the tree to say the gesture was half-applied. With a collision the
dialog appears for one item and the others are dropped from the operation
entirely.

**Root cause:** `handleMove` iterates `dragIds`, but two branches inside the loop
`return` instead of `continue`: the same-parent reorder guard
(`if (currentParentId === target.folderId) return;`) and the collision guard,
which parks one `dragId` in `collisionDialog` and returns. `collisionDialog`
holds a single id, so even confirming Replace cannot resume the remaining items.

Measured: dragging `[already-in-f1, mover]` into `f1` produces zero `moveItem`
calls and leaves `mover` at the root, with an empty notification queue.

**Workaround:** drag items one at a time.

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed — `continue` in
both branches, and `collisionDialog` became a QUEUE presented one item at a time
after the loop, so every collision in a drag is offered rather than only the
first.

The queued item carries the destination's `siblingNames` with it. Re-deriving
them when the dialog resolves would miss the items from the SAME drag that have
already landed, so two colliding items could be renamed to the same suffix —
which is the bug this cluster is about, reintroduced by the fix. Promoted
regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## A rename resolves the entity type from a second, independently refreshed list — so it can rename the wrong kind of thing, silently

**Found by:** exploratory campaign A4/FEX-11

**Symptom:** Start renaming a folder (F2 / double-click), and while the input is
open the tree refreshes without that folder — another tab deleted it, a Drive
listing dropped it, a refresh landed mid-edit. Submitting the rename calls the
*diagram* rename API with the folder's id. Nothing happens, and nothing says so:
the row shows the new name until the next refresh, and no error is raised.

**Root cause:** `handleRenameSubmit` decides which API to call from a lookup
against possibly-stale hook state rather than from the node arborist handed it:
`const isFolder = tree.folders.some((f) => f.id === id);`. `onRename` receives
the node (with its `type`), and the composed row carries `type` too; neither is
consulted. A miss falls through to `renameDiagram`, and a provider that no-ops
on an unknown id (rather than throwing) never reaches the `catch` that would
show "Rename failed" and refresh the row back.

Measured: after the folder is dropped from the listing, the submit produces
`renameDiagram(f1,Renamed)`, no `renameFolder`, and an empty notification queue.

**Workaround:** refresh the tree and rename again.

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed. `onRename` now
passes the node through, `handleRenameSubmit` takes the TYPE from it (falling
back to the composed row via `findComposedNode`, then to the place's own lists
via `typeOfId`), and an id that resolves to neither raises "Rename failed"
instead of falling through to `renameDiagram`.

The regression drives the exact repro — the folder is dropped from the listing
while the input is open — rather than a synthetic unknown id, because the
fallback chain has to be exercised at the point where the first link is stale.
Fixed together with FEX-12 and FEX-16: all three are the same handler answering
a question from re-derived state instead of from the row the user was editing.
Promoted regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## A tree operation whose place cannot be resolved is executed against the session place

**Found by:** exploratory campaign A4/FEX-12

**Symptom:** Two shapes, one cause. (a) Rename a Google Drive diagram while the
token lapses (`AUTHENTICATED` to `RECONNECTING`): the Drive rows are cleared,
and the submit is sent to the *session* provider instead — a Drive operation
executed against local storage, silently doing nothing. (b) If one id ever
exists in both places, every id-routed operation resolves to Drive, including
one started from the session row.

**Root cause:** `placeOfId` is a `Map<string, PlaceId>` built by writing session
ids first and Drive ids second, so a shared id resolves to Drive (last
`Map.set` wins), and consumers read it with a default:
`const placeId = placeOfId.get(id) ?? 'local';`. An id that is *unknown* —
because its place's tree was cleared by the `enabled` gate mid-operation — is
therefore assumed to be session work. `placeOf(node)` (which prefers the node's
own stamped `placeId`) exists and is used elsewhere, but `handleRenameSubmit`
has only an id.

Measured: with the Drive tree gated off mid-rename, the session provider logs
`renameDiagram(gd1,Renamed)` and the Drive provider logs nothing; with one id
in both places, the Drive copy is renamed and the session copy is untouched.

**Workaround:** wait for the tree to finish reconnecting before renaming.

**Status:** Fixed in wave 4 (2026-08-02) for the rename path — the node's own
stamped `placeId` decides, and an unresolvable id is an error rather than a
default. That closes shape (a) (a Drive rename sent to the session provider when
the Drive tree was cleared mid-operation) and shape (b) for this path (a shared
id resolving to Drive because the map is built Drive-last), since the node's
stamp is unambiguous where the map is not.

`placeOfId` still exists and is still last-write-wins; it is now a FALLBACK for
callers that genuinely have only an id, not the primary answer. **Still open:**
duplicate ids across places are not detected during composition, so the map
remains ambiguous for any future id-only caller. That is the entry's third
sentence and it is deliberately not done here — it is a composition-time
integrity check, the same shape as the model-side CLIP-01, and it wants to be
one change covering every consumer rather than a second special case in the
rename path. Promoted regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## A failed rename is rolled back in the tree only — the open diagram keeps the name that was never saved

**Found by:** exploratory campaign A4/FEX-16

**Symptom:** Rename the diagram that is currently open and let the rename fail
(offline, Drive 403). The toast says "Rename failed" and the tree row reverts to
the stored name — but the app title and the in-memory model keep the new name.
The diagram is now titled one thing on the canvas and another in storage, and
the next save writes the name the user was told did not stick.

**Root cause:** `handleRenameSubmit` performs two optimistic updates before the
await — `tree.optimisticRename(id, trimmed)` and
`notifyDiagramRenamedFromTree(id, trimmed)` — and the `catch` undoes only the
first (`tree.refresh()`). `notifyDiagramRenamedFromTree` is not a display-only
update: it calls `setDiagramName`, `setCurrentDiagram`, and reloads the model
with `title: trimmed` (`DiagramLifecycleProvider.tsx`), so the failed name is
now in the model that the next autosave persists.

Measured: with `renameDiagram` rejecting, the tree row is back to `Original`,
the error toast is present, and the only lifecycle notification is
`notifyDiagramRenamedFromTree(d1,New name)` — never re-notified with the stored
name.

**Workaround:** reload the diagram after a failed rename.

**Status:** Fixed in wave 4 (2026-08-02) — the second option, re-notify with
the stored name in the `catch`.

Not "notify after the storage call succeeds": the optimistic update is what
makes the rename feel immediate, and a Drive round-trip is long enough that
deferring it would be a visible regression in the common (successful) case. The
`catch` now undoes BOTH optimistic updates rather than only `tree.refresh()`.

Two things the fix also had to get right. The previous name is captured BEFORE
the optimistic rename, since that is the only moment it is still knowable. And
`notifyDiagramRenamedFromTree` is now called only for a DIAGRAM — it used to
fire for folders too, handing a folder id to `setDiagramName`. Promoted
regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## Moving a diagram to Drive copies the last SAVED blob, so edits made while it moves are deleted with the source

**Found by:** exploratory campaign A4/FEX-13

**Symptom:** Drag the open diagram onto the Google Drive section (or use "Move
to Google Drive"). The move flushes first, so edits made before it are safe —
but anything typed *while* the move runs is lost without a word. The move ends
with a success toast and the diagram reopened from Drive, missing the last few
seconds of work. The session copy that held it has been deleted.

**Root cause:** `handleMoveToDrive` awaits `saveAllDirty()` and then calls
`moveDiagramsToDrive`, which reads `opts.source.loadDiagram(meta.id)` — the
*persisted* blob — creates the Drive file from it, and then
`opts.source.deleteDiagram(meta.id, false)`. Between the flush and the read sit
at least two Drive listings and, on the first item, root resolution; the delete
is later still. Nothing re-checks dirtiness before the source is removed, and
the in-memory model is not consulted at all.

Measured: with an edit landing during the Drive listing, the Drive copy holds
the pre-move flush, the later edit is still only in memory, and the source row
is gone (`notifyDiagramDeletedFromTree` then `openDiagramById` on the Drive id).

**Workaround:** stop editing until the move finishes.

**Status:** Fixed in wave 4 (2026-08-02) — re-flush immediately before the
source delete, on BOTH paths, and refuse the delete if the flush fails.

`moveDiagramsToDrive` takes a `flushSource(id)` hook, called at the last moment
before `deleteDiagram`: it flushes that diagram's in-memory edits to the source
and reports whether it wrote, and the Drive copy is refreshed from the source
when it did. Deliberately at that point rather than earlier — the whole bug is
the size of the window between the read and the delete, so anything checked
sooner just reopens it. A flush that throws reports `sourceRemained: true`
instead of deleting: the source holds the only copy of whatever could not be
written, and the flag tells the caller the Drive copy is real so a retry does
not mint a second one (the A2/STOR-09 contract).

The hook rather than a model reference keeps `driveTransfer` storage-only, which
is what lets the bulk `MigrateSessionDialog` path use the same code — and it has
the same window, wider, because every item waits for the ones before it. The
lifecycle side is `flushDiagramIfDirty`, which reads the dirty set through its
ref so an edit made after the caller built its closure is still seen. Promoted
regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx) and the harness's own `flushDiagramIfDirty` double.

## The Drive section can keep showing "Finish Google Drive setup…" after the root is configured

**Found by:** exploratory campaign A4/FEX-14

**Symptom:** The Drive section shows the "Finish Google Drive setup…" row over a
place that is actually ready — its diagrams are not listed, and dragging into
Drive stays blocked — until something unrelated re-renders the explorer.
Reachable whenever the root becomes ready by a route other than the first-connect
dialog's Confirm: another tab configuring it, or `ensureRoot()` creating it
during a write.

**Root cause:** `driveRootMissing` in `FileExplorer.tsx` is derived during render
from `(driveProvider as GoogleDriveProvider)?.getCachedRootId?.()` — a
synchronous read of a value owned by an async probe, with no subscription. The
explorer does not listen for `axoview-drive-root-ready` (only
`MigrateSessionDialog` does), so the row clears only when a re-render happens
for another reason. `DriveSetupGate.handleConfirm` calls `refreshFileTree()`
right after dispatching the event, which is what hides this on the common path;
the gate's other dispatch site (`hasConfiguredRoot()` resolving true) does not.

Measured: with the tree loaded and no cached root, the Drive section renders
exactly one `placeState:setup` row and `disableDrop` refuses a session→Drive
drag; after the root id appears and `axoview-drive-root-ready` fires, the row is
unchanged — and a refresh-token bump alone (no new Drive data) clears it.

**Workaround:** collapse/expand or refresh the file explorer.

**Status:** Fixed in wave 4 (2026-08-02) as directed — the root id is held in
state and re-read on `axoview-drive-root-ready`, so the "Finish Google Drive
setup…" row clears when the root actually appears rather than when something
unrelated happens to re-render.

It also re-reads on `driveTree.status` and `fileTreeRefreshToken` changes,
because the root can be created by a WRITE (`ensureRoot()`) that fires no event
— which is one of the two routes the entry names, and the one
`DriveSetupGate.handleConfirm`'s `refreshFileTree()` was accidentally covering.
Promoted regression: [`fileExplorerHandlers.test.tsx`](packages/axoview-app/src/components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx).

## One transient listing failure permanently consumes the "move session diagrams to Drive" offer

**Found by:** exploratory campaign A4/FEX-15

**Symptom:** Sign in to Google with session-only diagrams open. If the session
listing hiccups at that moment, the migration dialog never appears — and never
appears again for the rest of the session, however long it stays signed in. The
diagrams it exists to rescue stay session-only until the tab closes and they are
gone.

**Root cause:** `MigrateSessionDialog`'s auth effect sets
`offeredThisGrantRef.current = true` and `pendingOfferRef.current = true`, then
calls `tryAutoOffer()`, which clears `pendingOfferRef` *before* its first await
and then calls `enumerateSession()`. `enumerateSession` catches every failure
and returns `[]`, which the caller cannot distinguish from "nothing to move", so
it returns silently. Both refs are now spent: the `axoview-drive-root-ready`
listener finds `pendingOfferRef` false, and `offeredThisGrantRef` is reset only
on `UNAUTHENTICATED` / `SESSION_EXPIRED`.

Measured: with `listDiagrams` rejecting once at the moment of the grant, the
dialog never opens; after storage recovers and the root-ready event fires again,
there is still no dialog and no second enumeration attempt.

The other half of the hypothesis — the offer firing *twice* — does not
reproduce: `pendingOfferRef` is cleared synchronously before the first await, so
every later caller returns at the first line (probe `FEX-15a`).

**Workaround:** open it by hand from the avatar menu / session section header
("Move to Drive"), which goes through the `axoview-open-migrate` path.

**Status:** Fixed in wave 4 (2026-08-02) as directed — `enumerateSession`
returns `null` for FAILED and `[]` for genuinely empty, and `tryAutoOffer`
re-arms both refs when it sees `null`, so the `axoview-drive-root-ready`
listener can try again once storage recovers.

`pendingOfferRef` is still cleared BEFORE the await, which is what stops a
re-entrant second offer — the refs are restored on the failure path rather than
the clear being moved, so the "offer at most once per grant" property is
unchanged for every path that does not fail. The on-demand path (avatar menu /
session header) now reports the failure instead of saying "No session diagrams
to move", which was the same conflation told to the user's face. Promoted
regression: the probe's own assertions, moved into
[`MigrateSessionDialog`'s suite](packages/axoview-app/src/components/__tests__/MigrateSessionDialog.offer.test.tsx).

## The quota-full "Clear All Diagrams" deletes your settings and none of your diagrams

**Found by:** exploratory campaign A5/CHR-01 (and A5/CHR-03)

**Symptom:** localStorage fills up, the Storage Manager opens, and the user
presses "Clear All Diagrams" and confirms "This will remove all saved
diagrams". Nothing is freed and no diagram is deleted. What *is* deleted: the
Google profile hint (the next boot cannot silently reconnect), the Drive root
cache (the Drive section falls back to "Finish Google Drive setup…" — A4/FEX-14),
the enabled icon-pack preference, the folder tree, the tree manifest, the
last-opened pointer and the explorer's open/closed state.

Worse, the folders are deleted while the diagrams keep their `folderId`
(CHR-03): every diagram that was inside a folder now points at a folder that
does not exist, which `buildTree` renders nowhere and the trash does not hold
either (A4/FEX-01). The clear makes work invisible instead of deleting it —
and the storage it occupies is still occupied.

**Root cause:** `LocalStorageInspector.confirmClear` sweeps `localStorage` for
keys starting `axoview-`. The app uses two prefixes with two stores:
session-place *diagrams* live in `sessionStorage` under `axoview_` (underscore)
— `SESSION_DIAGRAMS_KEY = 'axoview_diagrams'` and `axoview_diagram_<id>` in
`LocalStorageProvider` — while folders, the tree manifest and every preference
live in `localStorage` under `axoview-` (hyphen). The sweep hits exactly the
set that is not diagrams. The component predates the places model (2026-07-06)
and was never re-pointed.

Measured: after Clear, `axoview-google-profile`, `axoview-drive-root`,
`axoview-enabled-icon-packs`, `axoview-folders` and `axoview-tree-manifest` are
gone; `axoview_diagrams` and `axoview_diagram_d1` are untouched, and the
surviving diagram still carries `folderId: 'f1'` for a folder that no longer
exists.

**Workaround:** none — and the action is irreversible (it hard-reloads).

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed — the clear goes
through the session provider, so the diagram index and the folder tree stay
coherent, and **configuration is never swept**. The raw-key path survives only
as a fallback for when no provider is reachable, and it is scoped to
`sessionStorage`'s diagram keys.

The classification moved into `services/storage/storageAccounting.ts`, which
names the two key sets the component had conflated — `sessionStorage` +
`axoview_` (underscore) is DIAGRAMS, `localStorage` + `axoview-` (hyphen) is
CONFIGURATION. One character apart, and every symptom in CHR-01/02/03/04 follows
from taking the second set for the first.

Three consequences worth recording. The confirm copy now says what it does
("every diagram stored in this browser session… your folders, settings and
Google Drive diagrams are not affected") — the old copy promised "all saved
diagrams" and delivered the complement. The hard `window.location.reload()` is
gone: it made an already-irreversible action look like a crash and hid whether
anything had happened. And CHR-03 is closed by construction rather than by a
second fix — the folders are not deleted, so no diagram is left pointing at one
that is gone. Promoted regression:
[`storageAccounting.test.ts`](packages/axoview-app/src/services/storage/__tests__/storageAccounting.test.ts).

## The storage gauge labels preference bytes "Axoview diagrams" and never measures the diagrams

**Found by:** exploratory campaign A5/CHR-02

**Symptom:** The Storage Manager — shown at the moment the user must decide
what to delete — reports "Axoview diagrams: 412 Bytes" for a workspace holding
50 KB of diagrams, and a percentage bar that is a fraction of a 5 MB cap it
assumes. The number the user acts on measures preferences.

**Root cause:** `calculateStorage` walks `localStorage` only, and buckets a key
as a diagram when it starts with `axoview-` — the configuration prefix
(see A5/CHR-01). Session-place diagrams are in `sessionStorage` under
`axoview_`, so they contribute zero to both the "diagrams" line and the total.
The `~5 MB` denominator is a hardcoded assumption about one of the two stores,
while the quota error that opened the dialog can come from either.

Measured: with a 50 KB session diagram seeded, the "Axoview diagrams" line
reads in bytes, not kilobytes.

**Workaround:** none.

**Status:** Fixed in wave 4 (2026-08-02) — all three, as directed. `measureStorage`
walks both stores and buckets by the real key sets; the denominator comes from
`navigator.storage.estimate()` where available, which is the browser's own
answer and covers both stores, with the 5 MB constant surviving only as a
labelled fallback (the UI shows `~` in front of it).

Both stores are scanned with the SAME classifier rather than one each — a key in
the "wrong" store is precisely the confusion this cluster is about, and
hard-coding which store to look in would rebuild it.

The lines are named for what they now measure: "Session diagrams", "Axoview
settings and folders", "Other site data". The old label — "Axoview diagrams"
over the configuration bytes — is what made the dialog actively misleading at
the exact moment the user had to decide what to delete. Promoted regression:
[`storageAccounting.test.ts`](packages/axoview-app/src/services/storage/__tests__/storageAccounting.test.ts).

## "Export All Diagrams" — the backup offered before the destructive clear — silently does nothing

**Found by:** exploratory campaign A5/CHR-04

**Symptom:** In the Storage Manager, "Export All Diagrams" is the safety net
next to "Clear All Diagrams". With diagrams in the session place it produces no
file, no error and no toast — the click appears to do nothing. Users who take
the backup before clearing get nothing.

**Root cause:** `exportAllDiagrams` reads `localStorage.getItem('axoview-diagrams')`
and returns early when it is null. That key is the pre-places-model store,
written only by `DiagramLifecycleProvider`'s legacy session-mode effect; the
session place writes `sessionStorage`'s `axoview_diagrams` / `axoview_diagram_<id>`.
When the legacy key does exist, the exported file is that stale copy rather than
the current workspace.

Measured: with both session keys populated, clicking Export creates no object
URL and no anchor click.

**Workaround:** export from the file explorer (Export project ZIP) instead.

**Status:** Fixed in wave 4 (2026-08-02) — routed through the storage provider,
not dropped. The button sits beside a destructive action and is the only thing
offered as a safety net, so removing it would leave the clear unaccompanied;
making it real is the smaller change now that the provider is reachable from
this component.

It also **reports**. Silence is what made the original a trap rather than a
missing feature: the user takes the backup, sees nothing, and clears anyway. An
empty session says so, a failure says "do not clear until you have a backup",
and a success names the count. Promoted regression:
[`storageAccounting.test.ts`](packages/axoview-app/src/services/storage/__tests__/storageAccounting.test.ts)
plus the download-helper pin below (CHR-11) — the export used one of the five
broken copies, so it could have produced no file even after being pointed at the
right data.

## The boot-time service-worker cleanup never finishes on a machine that has no service worker

**Found by:** exploratory campaign A5/CHR-05

**Symptom:** Harmless today, load-bearing tomorrow: `index.tsx` ends every boot
with `serviceWorkerRegistration.unregister()`, and on the overwhelmingly common
case — no service worker registered — that promise chain never settles. Anything
ever sequenced after it (a cleanup, a telemetry ping, an `await` in a future
refactor) would hang forever, on every boot, with no error.

**Root cause:** `unregister()` awaits `navigator.serviceWorker.ready`, which by
spec resolves only when there is an ACTIVE registration — it does not reject or
resolve when there is none. The API that answers the question being asked is
`navigator.serviceWorker.getRegistrations()`, which resolves to `[]`. The same
function's `.catch(error => console.error(error.message))` also assumes an
`Error`: a string rejection logs `undefined`, and a null/undefined rejection
throws inside the handler.

Measured: with `ready` pending, the chain is still unsettled after the
microtask queue and a macrotask drain; with a resolved registration,
`unregister()` is called exactly once; with a string rejection the handler logs
`undefined`.

**Workaround:** none needed today.

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed — `getRegistrations()`,
which is the API that answers the question being asked and resolves to `[]` when
there is nothing to unregister, and the rejection VALUE is logged rather than
`.message`.

`unregister()` returns its promise now. That is the point of the fix rather than
a side effect: the bug was that awaiting it would hang forever on every boot, so
"you may now await this" is the property that changed. It also covers a
registration that exists but is not yet ACTIVE, which `ready` would have waited
on indefinitely. Promoted regression:
[`serviceWorkerRegistration.test.ts`](packages/axoview-app/src/__tests__/serviceWorkerRegistration.test.ts).

## A storage migration that fails partway is recorded as complete, stranding the rest of the data forever

**Found by:** exploratory campaign A5/CHR-06

**Symptom:** A user upgrading from the FossFLOW-era build on a nearly-full
browser profile — i.e. exactly the user with the most legacy data — can have
half their keys migrated and the other half left under the old prefix. Nothing
reads the old prefix, and the migration never runs again, so that data is
present in the profile and invisible to the app permanently.

**Root cause:** `migrateFossflowStorageKeys` wraps each `migrateStorage(...)`
call in a `try {} catch {}` that swallows the error ("skip — best effort"), and
then writes the `axoview_migration_v1` sentinel unconditionally. A
QuotaExceededError partway through the key loop therefore ends as
`{ ran: true }` with legacy keys still in place; the next boot short-circuits on
the sentinel. The sentinel's own `catch` reasons correctly about this case
("can't set sentinel; migration will retry next boot") — the migration body
does not.

Measured: with `setItem` throwing on the second migrated key, the sentinel is
`done`, `fossflow-*` keys remain, and a second `migrateFossflowStorageKeys()`
returns `ran: false` and changes nothing.

**Workaround:** clear `axoview_migration_v1` from localStorage by hand and
reload.

**Status:** Fixed in wave 4 (2026-08-02) — the first option: the sentinel is
written only when both passes completed without throwing, and `MigrationResult`
carries `complete` so a caller can tell a full run from a partial one.

Both passes are still ATTEMPTED even when the first throws. A quota failure in
one store says nothing about the other, and migrating what can be migrated is
strictly better than stopping — the retry picks up the rest, and the migration
is idempotent by construction.

The sentinel's own `catch` already reasoned about exactly this case ("can't set
sentinel; migration will retry next boot"); the migration body did not. Promoted
regression:
[`migrationShim.test.ts`](packages/axoview-app/src/utils/__tests__/migrationShim.test.ts).

## The Docker deployment sends every API call cross-origin, where the app's own CSP blocks it

**Found by:** exploratory campaign A5/CHR-07

**Symptom:** `npm run docker:run` (`compose.dev.yml`) serves the app at
`http://localhost:3000`. Every `/api/*` call the SPA makes is addressed to
`http://localhost:3001` instead — bypassing the nginx proxy that fronts the API
and violating the app's own Content-Security-Policy, whose `connect-src` is
`'self'`. Server storage appears broken in the deployment the README documents.

**Root cause:** `apiBaseUrl()` identifies the dev split (`SPA :3000 → backend
:3001`) by sniffing `window.location.hostname === 'localhost' && port === '3000'`.
`compose.dev.yml` publishes nginx as `"3000:80"`, so the container is served
from the same hostname and port as `npm start`, and the sniff cannot tell them
apart. In the container `/api/` is same-origin behind `location /api/ { proxy_pass
http://localhost:3001; }`, and the CSP nginx emits (`connect-src 'self'`) does
not include `localhost:3001` — a different port is a different origin.

Measured from source: `compose.dev.yml` publishes `"3000:80"`; `nginx.conf`
proxies `/api/` and emits `connect-src 'self'` with no `localhost:3001`
allowance; `apiBaseUrl()` returns `http://localhost:3001` for a
`http://localhost:3000` page.

**Workaround:** publish the container on a host port other than 3000
(e.g. `"3100:80"`).

**Status:** Fixed in wave 4 (2026-08-02) as directed — the split is gated on
`process.env.NODE_ENV`, which rsbuild inlines at build time, and the default is
same-origin.

The port check is KEPT, but only to narrow the development case further: a
development build served from somewhere other than `localhost:3000` gets
same-origin too. The port alone could never distinguish the two, because the
container deliberately publishes on the port developers expect — that is the
whole finding.

Same-origin as the default is the safe direction, and worth stating: a wrong
same-origin guess produces a visible 404, while a wrong cross-origin guess
produces a CSP violation in the console and a silently dead feature, which is
how this survived. Promoted regression:
[`apiBaseUrl.test.ts`](packages/axoview-app/src/utils/__tests__/apiBaseUrl.test.ts).

## Every shipped locale is missing strings — including the nine documented as fully covered

**Found by:** exploratory campaign A5/CHR-09 (and A5/CHR-10)

**Symptom:** All twelve non-English catalogues are short of `en-US`: 34 keys
each for zh-CN, es-ES, pt-BR, fr-FR, hi-IN, bn-BD, ru-RU, it-IT, tr-TR and
pl-PL, 35 for zh-CN, and 65–66 for de-DE and id-ID. The missing strings fall
back to English mid-screen. This contradicts the existing entry *"Partial-coverage
i18n locales (de-DE + id-ID)"* above, which tells users to "switch … to one of
the fully-covered locales (zh-CN, es-ES, pt-BR, fr-FR, hi-IN, bn-BD, ru-RU,
it-IT, tr-TR)" — none of which is fully covered.

Drift runs the other way too (CHR-10): every catalogue also carries 1–3 keys
that `en-US` no longer has — renames or deletions the translations never
followed. i18next resolves per key, so neither direction is ever reported.

**Root cause:** nothing keeps the catalogues in step. `src/i18n/*.json` are
hand-maintained and copied verbatim into the bundle by rsbuild; no lint, test or
CI gate compares key sets, so every feature that adds strings to `en-US` widens
the gap silently. (This is the *record* being wrong as much as the data — the
same stale-invariant class as the S1–S3 thread S-f.)

**Workaround:** use en-US for complete coverage.

**Status:** Fixed in wave 4 (2026-08-02) — both halves of the fix direction.
The partial-coverage entry at the top of this file now names all twelve locales
with their real numbers, and `localeKeyParity.contract.test.ts` is the key-set
gate: `en-US` as the superset, both directions, per-locale budgets that may go
DOWN freely and fail when they go up. The translation debt itself stays
deferred.

Budgets rather than a demand for parity, deliberately: requiring parity today
would be a permanently red suite, which is not a gate. What the gate stops is
the SILENT widening — a new `en-US` string with no translations now fails the
build, and closing debt means lowering a number in a file, which is the visible
record the entry asks for.

Red-verified by planting one untranslated `en-US` string: all twelve locales
went red with the count and the new keys named. The gate's own "can this
comparison detect a difference at all" CONTROL earned its place on the first
run — it caught the package's es5 `[...someSet]` trap, which had made the gate
report twelve perfectly-translated catalogues.

## One file-download helper is written five times, and every copy revokes the URL before the download can start

**Found by:** exploratory campaign A5/CHR-11

**Symptom:** Downloads (Export JSON, project ZIP, diagnostics bundle, storage
backup) can silently produce nothing on browsers that treat a revoked object URL
as a cancelled download — the app's own class of "the click appeared to do
nothing" report. Fixing it means finding all five copies.

**Root cause:** the same eight lines exist in `utils/downloadBlob.ts` (one
caller: `ExportProjectZipDialog`), `LocalStorageInspector.exportAllDiagrams`,
`DiagramLifecycleProvider`'s JSON export, `DiagnosticsOverlay.downloadFile` and
the lib's `exportOptions.downloadFile`. Every copy calls `a.click()` and then
`URL.revokeObjectURL(...)` synchronously in the same block, and none attaches
the anchor to the document first. The shared helper that exists is used by
exactly one of the five surfaces — the ADR 0047 "app/lib dual implementations of
one contract" class, here at five.

Measured by source sweep across all five files.

**Workaround:** none.

**Status:** Fixed in wave 4 (2026-08-02) exactly as directed — one helper,
lib-side (`utils/downloadFile.ts`), re-exported for the app; it appends the
anchor, clicks, removes it, and revokes on a later tick. The four copies are
deleted.

Its own module rather than staying inside `exportOptions.ts`: that file imports
`dom-to-image-more`, and the app's jest mock exists precisely to keep that out
of unit tests — so leaving it there would have meant either a heavy test import
or a STUBBED download helper, which is the same "third implementation the tests
actually run" trap the F5 lean-save gate caught. The mock re-exports the real
one from source.

The 60-second revoke delay is a named constant because "why 60 seconds" is the
question a reader will have: long enough for a slow disk to have started the
write, short enough that repeated exports do not accumulate blobs. Promoted
regression:
[`downloadFile.test.ts`](packages/axoview-lib/src/utils/__tests__/downloadFile.test.ts).

## Duplicating (or importing) a shared diagram copies its share link, so two documents claim one public snapshot

**Found by:** exploratory campaign MOP-01 (cross-area mop-up: A4 × A3 × S2)

**Symptom:** Duplicate a diagram that has been shared. The copy is created
carrying the original's `shareUuid`, so both documents point at the same public
snapshot. From there: pressing Share on the copy republishes *the copy's
content* over the original's live link (the uuid is reused, not minted), and
deleting or unsharing the copy deletes `public/<uuid>` — the original's
snapshot — leaving the original marked shared with a dead link. The same
happens on both import paths.

**Root cause:** every copy path treats `id` as the only identity-bearing field.
`FileExplorer.handleDuplicate` does `const { id: _id, ...dataWithoutId } = data`
and re-creates from the rest; `projectZip`'s import does
`const { id: _strippedId, ...model } = rawModel`; the single-JSON import spreads
`{ ...(data as object), name, title }`. `shareUuid` and `sharedAt` are ordinary
document fields (the backend stores them on the diagram document — that is what
SHARE-01 and SHARE-15 are about), so they ride along. Nothing downstream
detects two documents holding one uuid: `shareDiagram` reuses an existing valid
`shareUuid` rather than minting, and both `deleteDiagram` and `unshareDiagram`
delete `public/<uuid>` unconditionally.

Measured: duplicating a diagram whose blob carries
`shareUuid: '1111…'` creates a copy whose blob carries the same `shareUuid` and
`sharedAt`, with only `id` stripped.

**Workaround:** unshare before duplicating, or unshare the copy immediately —
noting that unsharing the copy is what takes the original's link down.

**Status:** Fixed in 7206d5e2 (2026-07-30) — the first half exactly as proposed: one
`stripSourceIdentity` helper drops `id`, `shareUuid`, `sharedAt` (and `created`),
used by all three copy paths — duplicate, project-ZIP import, single-JSON import
— so they cannot drift apart again, which is how this came to differ per path.
`createDiagram` strips the same server-owned fields backend-side too, so neither
side of the wire is trusted alone.

The second half — "make `shareDiagram` refuse to adopt a `shareUuid` another
document already claims" — is covered differently, and better: S2/SHARE-15's
`deleteOwnedSnapshot` verifies `snapshot.sourceId === id` before any cascade
touches a snapshot, so a borrowed uuid cannot take down or overwrite another
diagram's link even if a document written by an older build still carries one.
A scan across every diagram at share time would be O(n) on every share for the
same guarantee. Promoted regression:
[`importedBlob.test.ts`](packages/axoview-app/src/services/storage/__tests__/importedBlob.test.ts)
and the SHARE-15 legs of
[`routes.shareIntegrity.spec.js`](packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js).

## Image export could show a permanently incomplete preview — FIXED (residual below)

**Found by:** PR #86 CI, 2026-08-09

**Symptom (as first understood):** For a short window after "Export as image"
opens, the preview shows an incomplete render — on a slow machine, essentially
just the background — and corrects itself a moment later.

**Corrected the same day, by two instrumentation rounds:** the incomplete
preview could be FINAL, not provisional — the capture-readiness signal lied in
two independent ways, each able to approve a blank capture AND (because
readiness read true) skip the recovery recapture permanently via
`if (iconsReady) return`:

1. **Vacuous content readiness** — `data-all-icons-drawn` is `"true"` on any
   paint whose build saw no node with a pending icon, including mount-time
   paints that precede the export scene's content build.
2. **Degenerate buffer** — before the hidden export container's ResizeObserver
   → `rendererSize` update lands, the canvas backing store is 1×1, and every
   readiness attribute can be honestly true about a paint into that one pixel
   (measured: `build=2, nodes=1, drawn=true`, `toDataURL` → 142 bytes).

Order-dependent, not machine-dependent: a warm cache (running the
import-export-image spec file in sequence) flips readiness before the resize
lands; cold solo runs flip it after — which is why #10 passed alone everywhere
and failed in ordered runs. See ADR 0038 §8, second 2026-08-09 correction.

**Fixed** in `4f518bbc` + `4abca8f7`: readiness additionally requires ≥1 drawn
node whenever the exported view has items AND a backing store larger than 1×1;
the recovery recapture runs unconditionally (5 s budget) once a capture went
out not-ready.

**Residual — still open:** during the window between a not-ready first capture
and its replacement, **the Download button is live**, so a user who clicks
inside that window still gets the provisional PNG. Nothing tells the user or the
download handler that the on-screen image is not yet settled.

**This is what `import-export-image.spec.ts` #10 was failing on**, and it is
worth recording why it took three attempts. The spec sampled the preview the
instant the `<img>` appeared, so it asserted on the first capture. On a fast
machine the icons decode inside the 400 ms budget and that capture is already
complete, which is why it passed locally and everywhere for months. Two fixes
were attempted from the symptom — the readiness-flag write site (wave 5) and its
seed (reverted in `0163c2ae`) — and neither could have worked, because the
product was never broken. The spec now polls the settled outcome. See the
2026-08-09 correction in [ADR 0038](docs/adr/0038-webgl-instanced-render-substrate.md) §8.

**Workaround:** wait a moment before downloading a large or icon-heavy diagram.

**Status:** Open — the capture race is closed for the test, but the product
should either disable Download until the recapture settles or show that the
preview is still refining.
