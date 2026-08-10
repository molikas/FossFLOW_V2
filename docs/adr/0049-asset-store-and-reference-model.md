# ADR 0049 — Asset Store and Reference Model (content-addressed, three tiers)

**Status:** Proposed (open decisions closed 2026-08-10 — see §13)
**Date:** 2026-08-10
**Supersedes:** none
**Superseded by:** none
**Related:** [ADR 0003](0003-session-storage-lean-icon-save.md) (lean save — the rule this generalises), [ADR 0002](0002-icon-catalog-merge-on-load.md) (catalog merge on load), [ADR 0037](0037-storage-places-model.md) (places), [ADR 0036](0036-google-drive-storage-provider.md) (Drive provider), [ADR 0009](0009-deployment-topology.md) (Cloudflare is storage-less), [ADR 0042](0042-drive-native-sharing-and-readonly-preview.md) (anonymous read proxy), [ADR 0001](0001-project-zip-format.md) (export bundle), [ADR 0048](0048-imported-image-asset-pipeline.md) (what produces the bytes)

## Context

`Icon.url` is a string that holds either an `https://…` catalog URL or a
**base64 data URL** for anything the user imported ([schemas/icons.ts](../../packages/axoview-lib/src/schemas/icons.ts)).
That worked while imported icons were rare 128 px thumbnails. Three forces have
made it untenable at once:

**1. Imported icons are now the only icon payload that survives a save.**
PR #86 rewrote [leanSave.ts](../../packages/axoview-lib/src/utils/leanSave.ts)
so the catalog is host-injected and `stripDefaultIcons` actually strips — it was
previously the identity function over an empty fixture. Everything catalogued is
now dropped on write and re-merged on load; **what remains in the file is the
user's own imported art.** Icon bytes went from "a rounding error we ignore" to
"the dominant term in every saved diagram."

**2. The budget is small, shared, and partly ephemeral.** Session diagrams live
in `sessionStorage` under the `axoview_` prefix (`SESSION_DIAGRAM_PREFIX` in
[storageAccounting.ts](../../packages/axoview-app/src/services/storage/storageAccounting.ts))
— per-tab and cleared on close — against a quota of a few MB shared across every
diagram. [ADR 0009](0009-deployment-topology.md) makes the Cloudflare deploy
**storage-less** (`/api/diagrams/*` short-circuits `503`), so on the primary
public deploy there is no server to spill to. Drive is the only durable place.

**3. [ADR 0048](0048-imported-image-asset-pipeline.md) and [ADR 0050](0050-terrain-paint-layer.md)
multiply the payload.** Higher-resolution assets, plus terrain *tilesets* rather
than single icons, plus per-diagram reuse of the same art. A tileset of twenty
tiles inlined as data URLs exceeds the entire session budget by itself.

Meanwhile the same bytes are duplicated per diagram: paint the same grass in
five diagrams and it is stored five times, because a data URL has no identity.

**Grep-confirmed constraints on any design here:**

- **There is no IndexedDB anywhere in this repo.** `indexedDB|IDBDatabase|idb`
  returns zero hits outside `node_modules`. This is a from-scratch build, not an
  extension point.
- **`importedBlob.ts` is not a home for this** despite its name — it sanitises
  imported *diagram documents* ([importedBlob.ts](../../packages/axoview-app/src/services/storage/importedBlob.ts)).
- **The Storage Manager gauge cannot see IndexedDB.** `measureStorage` in
  [storageAccounting.ts](../../packages/axoview-app/src/services/storage/storageAccounting.ts)
  enumerates `localStorage` + `sessionStorage` only. Adding a store it does not
  count reproduces the exact CHR-02 defect that module was written to fix — a
  gauge that reads comfortable while the thing that throws is full.

## Decision

### 1. Assets are content-addressed and referenced, never inlined

An asset is identified by the SHA-256 of its **encoded bytes**:

```
axo-asset:sha256-<base64url digest>
```

`Icon.url` may hold such a reference. Content addressing is chosen over a random
id because it gives deduplication, immutability, and cache-safety for free:
the same grass tile imported twice, or arriving via two different diagrams, is
one stored object; a reference can be cached forever because it can never mean
different bytes.

The model stores the reference plus the small metadata the UI needs without a
fetch (`width`, `height`, `mime`, `byteLength`) so listings and layout do not
block on resolution.

### 2. Three tiers, one resolver

| Tier | Holds | Lifetime | Reachable when |
|---|---|---|---|
| **Shared library** | A small curated set shipped/served by us | Immutable, versioned | Always (CDN, long-cached) |
| **IndexedDB** | Signed in: cache of the other two. **Signed out: primary storage** (§8) | Per-origin, evictable | Offline, same browser |
| **Google Drive** | The user's own imported assets, durably | User-owned | Signed in |

One `AssetResolver` answers `resolve(ref) → Blob | ObjectURL`, trying
IndexedDB → shared library → Drive, and populating IndexedDB on the way back.
**Every consumer goes through the resolver**; none parses the reference itself.

The **shared library is deliberately limited** — a curated starter set (a few
terrain tiles, a few props) so a new user can build something before importing
anything. It is not a marketplace and not user-writable.

### 3. Lean-save generalises ADR 0003's rule

[ADR 0003](0003-session-storage-lean-icon-save.md) says: drop what the host can
reproduce on load. That rule extends unchanged to assets — a reference whose
bytes are in the shared library needs no payload. The generalisation is that
**referenced-not-inlined is the default for every asset**, and the diagram
records only the reference.

This makes the load-time resolution contract load-bearing in exactly the way
ADR 0003 flagged as its own top risk ("Reliance on ADR 0002"). Extended over the
network, an unresolvable reference is now a *missing-art* failure mode, not just
an empty dock. §6 covers it.

### 4. The Storage Manager must count asset bytes

`StorageBreakdown` gains an `assets` bucket and `measureStorage` becomes
async (or gains an async sibling) so it can call `navigator.storage.estimate()`
and the asset store's own accounting. Non-negotiable: see the CHR-02 note above.

### 5. Export bundles assets

A project ZIP ([ADR 0001](0001-project-zip-format.md)) carries an `assets/`
directory keyed by digest, and single-diagram JSON export inlines referenced
assets back into data URLs so a mailed file stays self-contained. Import
reverses it, re-deriving the digest to dedupe against what is already stored.

`requiredPacks` ([ADR 0003](0003-session-storage-lean-icon-save.md), 2026-05-02)
is the precedent shape: the saved document names what it needs so a loader can
fetch it before the merge runs. Assets get the same treatment.

**This inlining path is also the Drive save format** (§9) — the same code, so
the self-contained serialisation cannot drift from the export it is built on.
`sessionStorage` keeps the lean referenced form.

### 6. Unresolvable references degrade visibly, never silently

A reference that resolves nowhere renders a placeholder and is reported once per
diagram in the notification surface. It must **never** silently vanish, and must
**never** be garbage-collected on the assumption it is unused — the existing
`iconPending` / `MAX_ICON_LOAD_ATTEMPTS` give-up logic in
[SceneCanvas.tsx](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx)
is the local precedent for bounded retries.

### 7. Drive layout — one file per asset

Assets are stored as **individual Drive files** under an Axoview `assets/`
folder tree, named by digest, each carrying the digest in `appProperties`.
Not `appDataFolder` — that is deleted when the user uninstalls the app, which
would silently destroy their art.

The manifest is a **rebuildable cache, not a system of record.** An earlier
draft of this ADR claimed a lost manifest would be unrecoverable under the
`drive.file` scope ([ADR 0035](0035-google-identity-and-drive-authorization.md)).
That was **wrong**: `files.list` with an `appProperties` query works fine under
`drive.file` for app-created files, and
[GoogleDriveProvider](../../packages/axoview-app/src/services/storage/providers/GoogleDriveProvider.ts)
already does exactly this (`APP_MARKER_Q` / `ROOT_MARKER_Q` against
`files?q=…&spaces=drive`). A lost manifest is re-derived by listing.

One object per content hash is also the industry norm (Figma, Excalidraw,
tldraw). The per-asset round-trip cost on cold load is real but bounded by
IndexedDB caching (§2) and by the fact that a diagram references few assets.

### 8. Signed-out users — allow import, never block

Anonymous import is **permitted**. No comparable tool blocks it.

- One-time honest notice on first import: stored in this browser only, can be
  cleared, export a project ZIP to keep it.
- **Project-ZIP export is the escape hatch** and must be discoverable from that
  notice.
- Sign-in is pitched as the *durability upgrade*, not as a gate.

**Invariant:** for a signed-out user, IndexedDB is **primary storage, not a
cache.** App-side eviction never runs for them (§10). Conflating the two would
delete the only copy of the user's work.

### 9. Shared-diagram viewing — inline into the Drive serialization

The Drive save format is **self-contained**: it reuses §5's export path, with
referenced assets inlined as data URLs. `sessionStorage` keeps the lean,
referenced form.

This means an anonymous reader costs **one** Worker-proxy hit
([ADR 0042](0042-drive-native-sharing-and-readonly-preview.md)'s
`GET /api/public/drive/:fileId`), not N per-asset fetches against Drive quota
with no edge cache — and there is no per-asset ACL to keep in sync, just the one
existing toggle. The proxy's 10 MB cap polices size. This is draw.io's model,
which ADR 0042 already mirrors.

### 10. Garbage collection — two code paths that never merge

**IndexedDB (cache tier, signed-in only).** LRU under a self-imposed budget.
An asset is evictable only when **all** hold: unused by any open diagram, a
grace period (~24 h) has elapsed, and the copy **provably** exists in Drive or
the shared library. Never runs for signed-out users (§8).

**Drive (durable tier).** **Never auto-deleted.** Removal is user-confirmed
only, through a Storage Manager "unused assets" review driven by a generalised
`IconUsageScan` ([axoviewProps.ts](../../packages/axoview-lib/src/types/axoviewProps.ts)) —
which already carries the trashed-diagram subtlety (F5/ICON-06), and a trashed
diagram's references must keep counting.

### 11. Quota — request persistence at the moment of first import

Call `navigator.storage.persist()` on the **first asset import**, because that
is a user gesture and Firefox's prompt then lands in context. Check
`persisted()` first. Chrome decides silently; a Safari grant does **not** stop
the 7-day ITP eviction, so persistence is never treated as a guarantee.

**Denial is the normal case** — reflect the state in the Storage Manager gauge,
never a modal. Catch `QuotaExceededError` on every write.
`navigator.storage.estimate()` feeds the `assets` bucket in §4.

### 12. Migration — convert on load, write on next save

Legacy 128 px data-URL icons are digested and moved into IndexedDB **on load, in
memory**; the runtime then holds `axo-asset:` references only. The file on disk
changes only when the user next saves. (tldraw's v1→v2 pattern.)

The tolerant loader is **permanent**, per ADR 0003's backward-compat clause —
old saves must keep loading forever. **The runtime is never dual-path; only the
(de)serialiser is.**

### 13. Asset groups — a group is a Drive folder

Assets carry an optional `group`, materialised as a subfolder of the Axoview
`assets/` tree, app-created with marker `appProperties` exactly as the existing
root folder is.

Rules that keep grouping from becoming a correctness problem:

- **Group is organisation metadata only.** Identity remains the digest.
  `axo-asset:` references **never encode the group**, so regrouping an asset can
  never break a diagram.
- **Single-valued** — one Drive parent, one group.
- Maps onto the existing `collection` concept for dock grouping, and is
  **orthogonal to `kind: node | tile`** ([ADR 0048](0048-imported-image-asset-pipeline.md) §7).
- Signed-out: group lives in IndexedDB metadata only.
- **ZIP export keeps `assets/` flat and digest-keyed**; the group rides in the
  manifest.
- `group` is a persisted field, so it **must** be added to
  `ICON_COMPARE_FIELDS` — as must `kind` and `tileFootprint`. Omitting it
  reproduces the `scale` bug ([ADR 0048](0048-imported-image-asset-pipeline.md)).

---

**Decision record.** §7–§13 were opened as TODOs when this ADR was drafted and
closed the same day (2026-08-10) against comparative research — Excalidraw,
tldraw, draw.io, Figma, and current MDN/WebKit storage documentation. Every
ruling is compatible with the storage-less Cloudflare free tier by construction
([ADR 0009](0009-deployment-topology.md)). The §7 correction to the `drive.file`
claim is verified against the shipped provider, not assumed.

## Consequences

**Positive:**

- Decouples asset size from the session-storage budget entirely, which is what
  makes [ADR 0048](0048-imported-image-asset-pipeline.md)'s higher resolutions
  and [ADR 0050](0050-terrain-paint-layer.md)'s tilesets affordable at all.
- Content addressing deduplicates across diagrams and makes assets immutable and
  infinitely cacheable.
- Fits the Cloudflare topology without asking [ADR 0009](0009-deployment-topology.md)
  to grow server storage: browser-local plus user-owned Drive.

**Negative / risks:**

- **The largest architectural change in this arc.** A new store, a new resolver,
  a new lifecycle, and a touch on every path that reads `Icon.url` — the DOM
  icon components, `SceneCanvas.getImage`, [ExportImageDialog](../../packages/axoview-lib/src/components/ExportImageDialog/ExportImageDialog.tsx),
  the ZIP importer/exporter, and lean save.
- **`Icon.url` becomes polymorphic** (`https:` | `data:` | `axo-asset:`). Any
  consumer that passes it straight to `new Image()` breaks. The resolver must
  land *before* the first producer of references.
- **Async where it used to be sync.** `getImage` is called from the synchronous
  instance-build path; a resolver that can miss introduces a pending state into
  a hot loop that currently assumes a decoded bitmap or nothing.
- **A network dependency for the user's own art.** Offline with a cold
  IndexedDB and a Drive-tier asset = a placeholder. §6 makes it honest, not absent.
- Digest computation adds a hash pass per import (cheap, but not free on a large
  tileset import).
- **Two storage semantics for one store.** IndexedDB is a cache when signed in
  and primary storage when signed out (§8). The eviction path must branch on
  auth state, and getting that branch wrong destroys an anonymous user's only
  copy. This is the highest-consequence bug available in this ADR.
- **Drive-saved diagrams are large**, because §9 inlines assets. That is the
  deliberate trade for one proxy hit and no per-asset ACL sync, and the 10 MB
  proxy cap bounds it — but a heavily-tiled diagram will approach that cap, and
  the failure needs to be legible when it does.
- **Persistence is never guaranteed.** Safari evicts after 7 days of no
  interaction regardless of a granted `persist()` (§11), so an anonymous
  Safari user can lose assets they were told were stored locally. The §8 notice
  must not overpromise.

## Implementation notes (non-binding)

- Wrap IndexedDB thinly ourselves rather than adding a dependency — the schema
  is one object store keyed by digest plus one metadata store. The bundle-size
  gate is a live CI constraint.
- `crypto.subtle.digest('SHA-256', bytes)` is available in every target browser;
  base64url the result for a filesystem- and URL-safe key.
- Hold resolved `ObjectURL`s in an LRU keyed by digest and revoke on eviction —
  leaking object URLs in a long editing session is a real memory cost.
- The resolver is a natural seam for the e2e suite to stub, which the current
  data-URL path is not.

## Acceptance criteria

- **Unit test:** the same bytes imported twice yield one stored object and equal
  references.
- **Unit test:** the resolver falls IndexedDB → shared library → Drive, and a
  hit in a later tier back-fills IndexedDB.
- **Unit test:** `measureStorage` (or its successor) reports asset bytes in a
  dedicated `assets` bucket — a diagram with a 1 MB asset must not read as
  1 MB of "other".
- **Unit test:** lean save of a model whose icons are all references produces a
  document containing no image payload, and load restores every icon.
- **Unit test:** an unresolvable reference renders the placeholder and reports
  once — it does not throw, and does not remove the icon from the model.
- **Round-trip test:** project ZIP export → import in a clean profile restores
  every asset by digest, with no duplication of assets already present.
- **Unit test (§8/§10, the highest-consequence branch):** with no signed-in
  account, the eviction pass is a no-op — an asset that is unused, past the
  grace period, and absent from Drive is **still retained**.
- **Unit test (§10):** an asset is evicted only when unused ∧ past grace ∧
  provably present in Drive or the shared library; removing any one conjunct
  retains it.
- **Unit test (§10):** a reference held only by a **trashed** diagram still
  counts as used and is never offered for deletion.
- **Unit test (§7):** with the manifest deleted, an `appProperties` listing
  re-derives the full asset set — the manifest is a cache, not the record.
- **Unit test (§12):** loading a legacy data-URL model yields a runtime holding
  only `axo-asset:` refs, and the persisted document is **byte-unchanged** until
  an explicit save.
- **Unit test (§13):** changing an asset's `group` leaves every `axo-asset:`
  reference and every diagram intact.
- **Unit test (§13):** `stripDefaultIcons` preserves an icon differing from the
  catalog only by `group`, `kind`, or `tileFootprint`.
- **Unit test (§9):** the Drive serialisation of a model with referenced assets
  is self-contained — it resolves with the asset store empty and offline.
- **Manual verification:** import a tileset, save, close the tab, reopen —
  assets survive (signed in), and the Storage Manager gauge reflects their size.
- **Manual verification (§8):** signed out, import an asset, reload the tab —
  the asset is still there and the first-import notice appeared exactly once.
