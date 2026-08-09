# Axoview Documentation Index

**Axoview** is an isometric diagramming tool (a community fork of FossFLOW / Isoflow). For the product overview, feature list, and lineage, start at the [root README](../README.md). This page is the **map of the `docs/` tree** — what each document is for and when to read it.

## The tree

```
docs/
├── guidelines/   Durable how-we-build references — read before touching a surface (living)
├── reviews/      Frozen reviewer-grade snapshots, immutable once cut
├── adr/          One durable decision each (Proposed → Accepted → Superseded)
├── tactical/     Short-lived working docs; deleted at /feature wrap
└── (root)        README · workflow · deployment · features · manual-test-baseline · upstream-changelog
```

Four kinds of document, by change discipline (see [workflow.md Design principle 4](workflow.md)):

- **Living references** — how the system works *today*; kept in sync with the code. They live in `guidelines/` (how we build) plus a few at `docs/` root (process, deploy, product).
- **Frozen baselines** — point-in-time deep snapshots in `reviews/`. **Never updated after they're cut** — they record what was true on a date, for reviewer hand-off and historical comparison.
- **Decision records (ADRs)** — one durable decision each, with rationale. Change only via the `/feature extend|supersede` discipline.
- **Operational** — moving-state trackers: the roadmap, the open-issues register, the manual-test record.

When a living reference and a frozen baseline disagree, the **living reference wins** for "what's true now"; the baseline tells you what changed since its date.

---

## Living references

Read these before touching the relevant surface. Each is a quick-reference, not a comprehensive description — they cross-link to the deeper baselines and ADRs for detail.

### `guidelines/` — how we build

| Doc | Read it when… | Scope |
|---|---|---|
| [architecture.md](guidelines/architecture.md) | You need the 5-minute orientation: what the codebase contains and where each piece lives | Feature inventory, store/mode/reducer/scene maps, lessons learned, pointers to all deeper sources |
| [ux-principles.md](guidelines/ux-principles.md) | Building or reviewing any UI surface (canvas, panels, file explorer, layers, dialogs) | The shipped **design language**, expressed as principles so new work doesn't drift |
| [canvas-interaction.md](guidelines/canvas-interaction.md) | Touching canvas **input** — event routing, hit-testing, modes, drag, selection, gestures | The input contract: dispatch spine, the `isRendererInteraction` gate, the 13-mode registry, algorithm contracts, and the load-bearing drag/perf invariants |
| [canvas-rendering-guidelines.md](guidelines/canvas-rendering-guidelines.md) | Touching the GPU bulk layers, the sprite atlas, line-style geometry, or image export | The **pixel**-fidelity contract for the WebGL2 substrate |
| [testing.md](guidelines/testing.md) | You need the regression-suite catalogue — which suite pins which contract, and the coverage gaps | Per-layer suite breakdown, classifications, how to run, CI sharding model |
| [perf-troubleshooting.md](guidelines/perf-troubleshooting.md) | Chasing a render/drag/startup performance problem in the React/DOM layer | Diagnostic playbook + case studies (drag GC cliff, cold-start gap). For GPU-substrate fidelity/perf, use canvas-rendering-guidelines instead |

### `docs/` root — process, deploy, product

| Doc | Read it when… | Scope |
|---|---|---|
| [workflow.md](workflow.md) | Starting a session — which skill fires when, where artifacts land | Canonical session cadence, skill decision table, seven design principles |
| [deployment.md](deployment.md) | Deploying to local dev / Docker / Cloudflare Pages | From-scratch walkthrough per target, auth modes, smoke tests, troubleshooting |
| [features.md](features.md) | You need the complete list of what this fork adds vs upstream | The durable feature inventory, with ADR links. Maintained by `/notes`; the root README carries only the condensed Highlights. Tracks `integration`, so it may list features not yet in a release |

---

## Frozen baselines — `reviews/`

Deep snapshots cut on a date and left immutable. Read for the comprehensive narrative the living docs deliberately don't restate, or to see what a past state looked like. **Each is true as of its freeze point — never as current state.**

**Retention rule (owner, 2026-08-09): the series keeps the latest assessment plus landmark records; superseded per-wave snapshots are retired to git history.** (Retired under that rule: the 2026-05, 2026-06, 2026-07 and 2026-07-08 reviews.)

| Doc | Covers | What it is |
|---|---|---|
| [technical-review-2026-07-29.md](reviews/technical-review-2026-07-29.md) | Whole-system audit · `master` @ v3.7.0 | **The latest assessment.** Re-runs the full `/audit` gate set across all five packages and adversarially re-verifies the gates themselves; health scorecard, findings + same-session fixes, the three checks promoted into CI. |
| [exploratory-2026-07.md](reviews/exploratory-2026-07.md) | The exploratory campaign + remediation program · [ADR 0047](adr/0047-exploratory-testing-program.md) | **Landmark.** 385 hypotheses / 240 bugs across 27 areas, in one file: heat map, per-area defect classes, the 22 owner rulings, the wave-5 sign-offs, and the delta anchor `/explore` sweeps diff against. |
| [phaser-render-engine-evaluation-2026-07-19.md](reviews/phaser-render-engine-evaluation-2026-07-19.md) | Render-engine adopt-vs-keep evaluation | **Landmark.** The measured **NO-GO** on replacing the bespoke WebGL2 substrate ([ADR 0038](adr/0038-webgl-instanced-render-substrate.md)) with Phaser 4 — its pan/zoom cost is O(visible objects) per frame where the substrate is O(1). The durable record of a reverted spike. |

**Lineage:** [upstream-changelog.md](upstream-changelog.md) — the verbatim pre-fork `stan-smith/FossFLOW` changelog, preserved for traceability and not maintained going forward. Frozen, but kept at `docs/` root rather than in `reviews/` because it is upstream history, not a review of this codebase.

---

## Decision records (ADRs)

[docs/adr/](adr/) — **41 ADRs** (40 Accepted · 1 superseded-in-part; 0016/0017 are unused numbers), one durable decision each. Start any new work by reading the ADR header for the contract you're about to touch. *(Table rebuilt 2026-07-15 — it had been stale at 35 rows, ending at 0037, since the Drive-storage promotion; 0038–0043 were missing entirely. Same sweep corrected four statuses: 0022/0023/0025/0028 had sat `Proposed` for weeks after their work shipped — 0028 while `workflow.md` already named it the governing protocol. **Nothing is Proposed today**; if you add one, keep this line honest.)*

| # | Decision |
|---|---|
| [0001](adr/0001-project-zip-format.md) | Project zip format |
| [0002](adr/0002-icon-catalog-merge-on-load.md) | Icon catalog merge on load |
| [0003](adr/0003-session-storage-lean-icon-save.md) | Lean icon save (strip default catalog) |
| [0004](adr/0004-connector-name-and-details-panel.md) | Connector name + details-panel parity |
| [0005](adr/0005-toolbar-and-dock-layout-contract.md) | Toolbar & dock layout contract |
| [0006](adr/0006-canvas-selection-contract.md) | Canvas selection contract (single + multi) |
| [0007](adr/0007-trace-harness.md) | Operational trace harness |
| [0008](adr/0008-naming-convention.md) | Naming convention (incl. the Modal/Dialog/Popover/Panel/Banner/Screen vocabulary) |
| [0009](adr/0009-deployment-topology.md) | Deployment topology |
| [0010](adr/0010-session-backend-contract.md) | Session backend contract |
| [0011](adr/0011-error-ux-contract.md) | Error-UX contract |
| [0012](adr/0012-view-mode-node-info-popover.md) | View-mode item info popover |
| [0013](adr/0013-preview-mode-layer-switcher.md) | Preview-mode layer switcher (presentation chrome) |
| [0014](adr/0014-ephemeral-annotation-overlay.md) | Ephemeral annotation overlay |
| [0015](adr/0015-node-label-legibility-scaling.md) | Node label legibility scaling |
| [0018](adr/0018-touch-pen-gesture-contract.md) | Touch / pen canvas gesture contract |
| [0019](adr/0019-canvas2d-node-render-layer.md) | Canvas2D node render layer *(superseded in part by 0038 — the bulk substrate)* |
| [0020](adr/0020-engine-perf-harness-and-measurement-protocol.md) | Engine perf harness & measurement protocol |
| [0021](adr/0021-paste-algorithmic-perf-and-spatial-index.md) | Paste algorithmic perf & the derived tile index |
| [0022](adr/0022-canvas-pointer-interaction-model.md) | Canvas pointer-interaction model |
| [0023](adr/0023-off-grid-positioning-and-collision.md) | Off-grid positioning & per-item collision |
| [0024](adr/0024-node-label-positioning-and-sizing.md) | Node label positioning & sizing |
| [0025](adr/0025-image-export-robustness-and-presets.md) | Image export robustness & presets |
| [0026](adr/0026-rectangle-edge-transform-handles.md) | Rectangle edge-midpoint transform handles |
| [0027](adr/0027-canvas-context-menu.md) | Canvas context menu (per-item command surface) |
| [0028](adr/0028-ux-journey-testing-protocol.md) | UX journey-testing protocol |
| [0029](adr/0029-sanitize-user-authored-html.md) | Sanitize user-authored HTML |
| [0030](adr/0030-docked-style-controls-strip.md) | Docked style-controls strip (canonical styling surface) |
| [0031](adr/0031-floating-label-entity-model.md) | Floating Label as a first-class entity |
| [0032](adr/0032-node-name-caption-label-model.md) | Node name / caption / label model (Option A) |
| [0033](adr/0033-element-text-style-field-convention.md) | Element text-style field convention (B/I/S) |
| [0034](adr/0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md) | Inline canvas text editing & dual-scope strip formatting |
| [0035](adr/0035-google-identity-and-drive-authorization.md) | Google identity & Drive authorization (GIS token model) |
| [0036](adr/0036-google-drive-storage-provider.md) | Google Drive storage provider |
| [0037](adr/0037-storage-places-model.md) | Storage places model (one tree, two places) |
| [0038](adr/0038-webgl-instanced-render-substrate.md) | WebGL2 instanced GPU render substrate (T4) — the **sole** bulk substrate |
| [0039](adr/0039-unified-color-picker-and-standard-palette.md) | Unified color picker & standard palette |
| [0040](adr/0040-marketing-landing-and-spa-crawlability.md) | Marketing landing & SPA crawlability (editor at `/app`) |
| [0041](adr/0041-discoverability-metadata-and-social-sharing.md) | Discoverability metadata & social-sharing contract |
| [0042](adr/0042-drive-native-sharing-and-readonly-preview.md) | Drive-native diagram sharing & read-only preview |
| [0043](adr/0043-deferred-backend-for-google-api-hardening.md) | Deferred backend for Google-API hardening (auth broker, read proxy, snapshot store) |

---

## Tactical — [`tactical/`](tactical/)

Short-lived working docs ([workflow.md](workflow.md) Design principle 4): scaffolded by `/feature start`, **deleted** by `/feature wrap` once every downstream artifact ships — the ADRs are the durable record.

**Empty is the healthy state** — see [tactical/README.md](tactical/README.md) for the lifecycle. Three docs that had calcified there were folded out on 2026-07-15: the two `canvas-interaction-*` references became [guidelines/canvas-interaction.md](guidelines/canvas-interaction.md), and `perf-charter.md` was wrapped into [ADR 0020](adr/0020-engine-perf-harness-and-measurement-protocol.md) + PLAN.md's ENG-T3 row.

| In flight | What it is |
|---|---|
| [adr-code-audit.md](tactical/adr-code-audit.md) | ADR ⇄ code conformance audit — verify all 41 ADRs' `Status`, cross-links, and decisions against the code. Scaffolded 2026-07-15. |

---

## Operational

Moving-state trackers. These change as work progresses (under their own change discipline) — they are not quick-references.

| Doc | Purpose |
|---|---|
| [PLAN.md](../PLAN.md) | Strategic phase dashboard. Read for context; edited only via `/feature wrap`. |
| [known_issues.md](../known_issues.md) | Register of open runtime issues, deferred fixes, and their risk/complexity. The register of record for divergences (e.g. D-9). |
| [manual-test-baseline.md](manual-test-baseline.md) | Point-in-time manual walk record (2026-05-21). **Historical** — it predates Drive storage, the `/app` split, and Drive-native sharing; re-walk before trusting it as "what Axoview does today." |

---

*This index is itself a living reference — when a doc is added, retired, or changes tier, update the table here in the same change.*
