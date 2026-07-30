# F4 — Layers panel & z-order (visibility, locking, assignment, ordering)

**Status:** DONE · **Counted hypotheses:** 10 / 10 · **Bugs:** 4 (one known) · **Suspects:** 0 · **Hypothesis ID prefix:** `LAY-`

**Scope:** LayersPanel UI, layer CRUD + reorder reducers, per-entity layerId assignment across all 5 entity types, visibility/locking enforcement in every interaction path (select, drag, delete, context menu, export), z-order within and across layers, preview-layer override interplay.

**Code:**
- `packages/axoview-lib/src/components/LayersPanel/`
- `packages/axoview-lib/src/stores/reducers/ (layer parts)`
- `packages/axoview-lib/src/hooks/useLayerActions.ts, useLayerContext.ts`
- `packages/axoview-lib/src/utils/previewLayerVisibility`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Layers*, *Rectangles*; Unit: *Lib label/selection/visibility utils*, *Lib store reducers + zustand stores*. Then grep the suites directly.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0006 §3 / canvas-interaction.md §7 I-1)** selectedIds can only ever contain interactable refs — locked/hidden-layer items are excluded from every selection path (Ctrl+A, lasso, click, context menu). → *Select 5 items, then toggle their layer to hidden (or locked) in the LayersPanel while the selection is live: nothing re-validates selectedIds on a layer-state change, so Delete or a group drag then mutates now-hidden/locked items. All guards test the acquisition paths, not selection invalidation on layer toggle.*
- **(canvas-interaction.md §5.2 (computeNodeUpdates))** Node-group drag collision is all-or-nothing — any colliding target means NO node moves that frame; preview always holds the last non-colliding position, and that exact position commits on mouseup. → *Mixed group (nodes + rectangle) dragged into a collision: nodes freeze at the last valid preview but textbox/rectangle/anchor members are explicitly not collision-gated and keep translating — on mouseup the group's rigid relative offsets are torn apart. DragItems tests assert the node all-or-nothing rule in isolation, never mixed-type group rigidity across a blocked frame.*
- **(canvas-interaction.md §5.4)** Group-drag members are seeded once at drag start; free-floating CONNECTOR_ANCHOR members must be seeded from their ref.tile or paths pinch. → *A new selection source (e.g. a future context-menu 'Select all in layer' or a paste-then-drag flow) that populates selectedIds without running collectDragInitialPositions' anchor-seed branch reproduces the historical Ctrl+A pinch — tests cover the Ctrl+A path only.*
- **(ADR 0021 item 7 (D-8 fix) + D-9)** After undo/redo, resyncScene re-routes connectors with missing/empty paths — but only in the ACTIVE view. → *Paste connectors on Page 1 → switch to Page 2 before async routing completes → undo/redo: resyncScene scans only the active view, so Page 1's pasted connectors stay pathless (invisible) until a later edit touches them. useHistory tests exercise single-view scenarios only.*
- **(ADR 0023 Consequences + addendum D)** A connector anchored to an offset/unsnapped node must resolve to the RENDERED (offset) endpoint on both the WebGL bulk path and the DOM selected path. → *Select a connector attached to an off-grid node: the sparse DOM <Connector> (selection halo) and the WebGL ConnectorsCanvas body must agree on the endpoint. If one resolves via bare tile and the other via rendered position, selecting/deselecting makes the wire visibly jump at the node. The invariant suite asserts DOM/WebGL equality for rectangle vertices, not connector endpoints at offset nodes.*
- **(canvas-interaction.md §5.9 checklist item 1 + rendering §15)** Render/hit gates must filter by `layers.length === 0 || visibleIds.has(id)` — NOT `visibleIds.size === 0` (which empties when every item's layer is hidden, showing all). → *Hide ALL layers in the Layers panel: any layer using the `visibleIds.size === 0` escape-hatch predicate suddenly renders everything (paint layers use exactly `visibleIds.size > 0 && !visibleIds.has(id)`). No test hides every layer at once — all layer-visibility tests toggle one layer with others visible.*
- **(rendering guidelines §15)** Every component that paints an entity or exposes an interactive affordance re-applies the layer visible/locked filter itself — it is never inherited; locked-layer items may be selected but get a ring with NO transform handles. → *The label hit-proxies (LabelHitLayer/NodeLabelHitLayer) and the new ADR 0044 ScreenBoxTransformControls/size-readout pill are affordance layers added after the §15 sweep — if any iterates the raw scene list, a hidden layer's label chip stays grabbable (invisible drag) or a locked node still shows resize handles. The §15 fix audited RectanglesCanvas + ConnectorAnchorOverlay + TransformControlsManager; nothing prevents the next overlay from skipping the filter.*
- **(rendering guidelines §10 + ADR 0038 §5)** buildInstances runs only on scene/geometry change or LOD crossing; pan/zoom is one uniform write + one draw call, and data-build-count must stay flat across a pan. → *Adding visibleIds/lockedIds to a canvas's rebuild deps (per §15) with an unstable Set identity recreated on every store tick → geometry rebuilds per frame during pan. The anti-cheat only runs in the perf harness (PR-time, small-N), so an identity-instability regression on a rarely-run path ships green.*
- **(rendering guidelines §8)** Any GPU layer whose geometry is projected must list strategy.projectionName in its rebuild deps; a DOM hit-proxy and its GPU paint must share one projection. → *Switch iso→2D in VIEW mode using the new viewer projection toggle (PR #84): if any of the four bulk canvases (or a future one) omits projectionName from deps, its paint stays in the old projection while hit-proxies move — the exact Labels bug, now reachable from a brand-new code path (PreviewCanvasModeToggle) that no e2e drives through all four layers.*
- **(ADR 0013 (preview layer switcher))** Preview layer toggles/solo are a UI-only override merged into visibleIds; they never mutate or save layer.visible, and the override clears on leaving preview. → *Enter present mode, solo a layer, then leave via browser back-navigation or a cross-diagram link click (not the mode toggle): if the override clears only on the mode-toggle path, the stale solo override could suppress layers in the editor or leak into the next present session. previewLayerVisibility.test.ts tests the merge math; the e2e tests toggle+non-dirty, not exit-path clearing.*
- **(ADR 0014 (ephemeral annotation overlay))** Annotation strokes never enter ANY persistence path — session save, server save, Drive save, export JSON, project zip — and image export excludes them (deferred inclusion). → *Export PNG while the annotation pen is open with strokes drawn: the exporter serializes DOM via dom-to-image — if the capture root includes the annotation SVG layer (a full-area sibling in UiOverlay), strokes bake into the 'clean' export. projectZip.test.ts asserts zero annotation bytes in the zip; no test asserts the image-export capture root excludes the overlay. Drive saves are also newer than the whitelist tests.*
- **(ADR 0034 §1 + Lucid-parity pass (empty-box lifecycle))** An edit session that ends still-empty deletes the text box — commit-empty and cancel-on-never-committed alike; no invisible zero-width ghost may remain. → *End a session whose content is Quill's structural residue (`<p><br></p>`, or whitespace-only after &nbsp; normalization): if the emptiness check compares raw HTML rather than stripped text, an invisible ghost box survives, is lasso-selectable, and counts in Ctrl+A. Tests cover the plain-empty case, not the structural-residue cases.*
- **(ADR 0032 amendment (label ?? name fallback + seed))** Render source = label ?? name; seedNodeLabel copies name→label at LOAD so renaming identity name in Layers never moves canvas text. → *Create a node in-session (QuickAdd: name='Untitled', no label), then rename it in the Layers panel WITHOUT reloading: the seed only runs at load, the fallback renders name — so the canvas text moves with the identity rename, reproducing the exact #1 cross-persona confusion the amendment fixed, but only for never-reloaded nodes. Seed tests are load-path only.*
- **(ADR 0035 / authStore.test.ts)** The Google token is NEVER persisted — only the identity/profile hint survives reloads; silent reconnect re-mints via GIS. → *The regression test spies on localStorage.setItem only. A convenience change that stashes the token in sessionStorage, IndexedDB, or a cookie (e.g. to survive the popup-blocker boot problem) evades the spy entirely and ships green while violating the ADR's central security contract.*
- **(ADR 0029 + sanitizeHtml hook)** User-authored HTML is sanitized before the single dangerouslySetInnerHTML sink, and the sanitizer forces rel='noopener noreferrer' on every anchor with href. → *The rel-forcing hook lives inside sanitizeHtml — link surfaces built directly in React (view-mode popover headerLink, connector-label link chips, TextBoxLinkCard's 'open in new tab') get target=_blank from their own JSX; any of them omitting rel=noopener reintroduces reverse-tabnabbing on user-supplied URLs, invisible to the sanitizer tests which only cover the HTML path.*
- **(ADR 0044 §4 (iconScale resolution order))** Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. → *A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11).*
- **(ADR 0031 §2 + ADR 0038 fold)** A floating Label renders ABOVE nodes (cross-layer z-order was the reason Labels became a first-class entity). → *The z-order is now encoded in the mount order of sibling WebGL canvases in Renderer.tsx — a refactor that reorders canvas mounting (or an overlay inserted between them, like CanvasCompositorOverlay tweaks) silently puts labels back under nodes. Tests assert model zIndex fields; nothing asserts the paint stacking of LabelsCanvas over NodesCanvas.*

## Known coverage gaps (from the baseline inventory)

- (Rectangles) Rectangle fill/border/color styling
- (Rectangles) LEFT/BOTTOM edges and the other three corner handles
- (Rectangles) TOP edge resize in 2D projection
- (Rectangles) Inverted drag (resize past zero / crossing the opposite edge)
- (Rectangles) Rectangle copy/paste/duplicate
- (Rectangles) Undo of a rectangle resize or rotate
- (Rectangles) Zero-size / single-tile rectangle draw commit-vs-discard
- (Layers) Layer rename, delete, and reorder
- (Layers) Layer visibility/lock state round-trip through save/reload and export
- (Layers) Assign-to-layer via context menu (only panel drag covered)
- (Layers) Locked layer vs Delete key, lasso capture, and Ctrl+A
- (Layers) Which layer NEW items land on (active-layer semantics)
- (Layers) Hidden-layer items vs export image output
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/historySequence.ts — zero direct tests
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/localeStore.tsx — zero tests (translation lookup/namespace fallback)
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/uiStateStore.tsx — only indirectly tested via multiSelect.contract; most UI-state actions untested directly

## Hypotheses

Probe files:
- `L` = `packages/axoview-lib/src/__explore__/F4/layers-lay-01-05-07-11.explore.test.ts`
- `E` = `packages/axoview-e2e/tests-exploratory/F4-layers/layers.explore.spec.ts`

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|
| LAY-01 | `layer.order` reaches the paint-order key for NODES only — floating Labels sort by `zIndex` alone and rectangles are not layer-sorted either, so reordering layers in the panel moves nodes and leaves every other entity type where it was | bug-class: sibling drift (thread A) | `renderOrder.test.ts` (the shared key), `layers.spec.ts` (visibility) | `L` | **BUG** | CONTROLs first: for nodes `resolveRenderOrder(layer.order, zIndex, -x-y)` makes the layer order dominate zIndex 99 and tile position, and swapping two layers' `order` swaps the nodes. `LabelsCanvas`' comparator is `(a.zIndex ?? 0) - (b.zIndex ?? 0)` with `layers` used only to FILTER — reassigning two Labels to the opposite layers leaves the sort identical |
| LAY-02 | A hidden layer's entities still appear in the exported image — the export mounts a second `Axoview`, and the layer context is derived per instance | ADR 0025 export parity | none — listed baseline gap | `E` | FALSIFIED | With the only node on a hidden layer, opening the Export-Image dialog leaves ZERO node shells in the document — the hidden export `Axoview` mounts its own `LayerContextProvider` over the same model, so the hidden layer is hidden there too |
| LAY-03 | There is no active-layer concept: every newly placed entity lands unassigned regardless of which layer is selected, so a diagram organised into layers grows a permanent "unassigned" pile | parity / product contract | none — listed baseline gap | `E` | **BUG** | With a layer created, a node dragged onto it (precondition asserted by id, never by array index) and that layer's row clicked, a newly placed node comes out with `layerId === undefined`. `PlaceIcon` writes `{...VIEW_ITEM_DEFAULTS, id, tile, offset}` and no layer — there is no active-layer concept at all |
| LAY-04 | Layer `visible` / `locked` do not survive a save→load round trip | persistence sweep (§5.6) | none — listed baseline gap | `E` | FALSIFIED | `visible: false` + `locked: true` set through the real panel, serialised out and fed back through the model store, come back unchanged. The flags are plain schema fields with no default-stripping |
| LAY-05 | Deleting a HIDDEN layer unassigns its entities, and an unassigned entity is unconditionally visible — so "delete layer" reveals everything the layer was hiding instead of removing or keeping it hidden | boundary / cascade | `view.test.ts` (unassign only) | `L` | **BUG** | CONTROL: before the delete, `!layer \|\| layer.visible` reports the node hidden. `deleteLayer` unassigns it, and an unassigned entity has no layer to consult — so the same rule now reports it visible. Deleting a hidden layer reveals its contents |
| LAY-06 | Ctrl+A selects entities on a LOCKED layer (the keyboard path re-derives interactability and omits `lockedIds`, thread A) | thread A | `layers.spec.ts` (pointer path) | `E` | FALSIFIED | Ctrl+A on a locked layer's node selects nothing (`selectedTheLockedNode: false`) and the following Delete leaves it (`survivedDelete: true`). CONTROL: a real click on the same node also fails to select it, so the lock IS enforced and the probe can tell enforcement from a dead rig. Thread A does not extend to Ctrl+A |
| LAY-07 | An entity with a dangling `layerId` (RED-03) vanishes from the Layers panel — bucketed under a layer that does not exist — while staying on canvas | bug-class recurrence (RED-03) | none | `L` | FALSIFIED | `useLayerContext` buckets an unresolvable `layerId` under `__unassigned__` rather than a phantom key, so the entity still appears in the panel and can be reassigned. It IS unconditionally visible (`!layer \|\| layer.visible` with no layer resolving), which is the sane fallback |
| LAY-08 | Delete then removes those locked entities, so a locked layer protects against the mouse and not the keyboard | thread A | none — listed baseline gap | `E` | FALSIFIED | Covered by the same probe as LAY-06 — Delete after a Ctrl+A leaves the locked node in place. Counted with LAY-06 as one verdict |
| LAY-11 | `assignLayerToItems` matches by bare id across all five entity collections, so it ignores the entity TYPE the caller selected | bug-class recurrence (CLIP-01) | `view.test.ts` | `L` | **BUG** | `assignLayerToItems` runs one id-set filter over all five entity collections, so with a node and a rectangle sharing an id (which CLIP-01 shows nothing prevents) assigning "the node" moves both. It also accepts a `layerId` naming no layer — RED-03 through a second door |
| LAY-12 | `createLayer` after a `deleteLayer` collides orders (RED-04/05) — re-confirmed here because the Layers panel is that reducer's only real caller | bug-class recurrence (RED-04/05) | `view.test.ts` | `L` | BUG (known — RED-04/05) | `createLayer` after `deleteLayer` yields orders `[1, 1]`. Re-confirmed here because the Layers panel is that reducer pair's only real caller, and LAY-01 shows `order` really does drive node paint order — so the collision is not theoretical. No duplicate entry filed |

**Next:** area closed (10 counted, 4 bugs — one of them a re-confirmation of RED-04/05). Nothing outstanding.

## Standing thread this area adds

**F-d. Layer state is enforced well on the paths that were built for it and
absent on the ones that grew later.** The good news first, because it narrows
thread A: locking IS honoured by Ctrl+A and by Delete (LAY-06/08 falsified), a
hidden layer IS hidden in the image export (LAY-02 falsified), and a dangling
`layerId` degrades to "unassigned" rather than vanishing (LAY-07 falsified).
What is missing is everything about a layer that is not visibility or locking:
`layer.order` reaches the paint key for nodes and no other entity type
(LAY-01), nothing decides which layer a new entity joins (LAY-03), and the
delete cascade unassigns rather than preserving the hidden state (LAY-05). The
pattern is that the BOOLEAN flags were wired through and the STRUCTURAL parts
of a layer were not.

## Product questions (SUSPECT verdicts)

*none yet*
