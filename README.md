This work aims to improve UX and other friction and experiment. This is for personal use and maybe "inspiration" for the original project...
All code is generated using Claude with sanity check reviews + manual testing. I cannot guarantee the code 100% makes sense for the long term project vision, rather it focuses on eliminating friction fast.


See original project: FossFLOW for details more details
## [Unreleased]

### 2026-03-19

#### Bug Fixes
- **Security:** Resolve Quill XSS vulnerability (GHSA-v3m3-f69x-jf25) — pinned `react-quill-new` to avoid affected `quill@2.0.3` (vulnerability is in `getSemanticHTML()`, not used by FossFLOW)

#### Performance
- **SVG Export Optimizer — Phase 1/2/3:** Reduce exported SVG size from ~940 KB to ~750 KB (~20% reduction)
  - Phase 1: Strip irrelevant CSS properties (vendor prefixes, animation, transition, scroll, print props)
  - Phase 2: Round floating-point coordinates to 2 decimal places (layout-safe, skips width/height/font-size etc.)
  - Phase 3: Prune `display:none` subtrees before serialization

#### Chores
- Remove unused dependencies from `fossflow-lib`: `auto-bind`, `paper`, `dom-to-image` (old fork), `react-hook-form`, `react-router-dom`, `recharts`, `css-loader`, `style-loader`, `@types/dom-to-image`
- Move `dom-to-image-more` from root to `fossflow-lib` where it is actually imported
- Bundle size reduced: 3,438 kB → 3,403 kB (−35 kB)

---

### 2026-03-18

#### Features
- **Node header links:** Add clickable hyperlink support to node header labels — set a URL on any node to make its name a clickable link in the diagram
- **Diagram management:** Imperative diagram loading, multi-view management, and diagram/view renaming
- **Interaction controls:**
  - Right-click toggles pan tool; left-click exits back to select mode
  - Delete key shortcut for removing selected elements
  - Lasso (rubber-band) selection of multiple elements
  - Context menu restore
- **Help dialog:** Update help dialog to reflect new interaction controls (pan, select, lasso, delete)

#### Performance
- **Render cycle elimination:** Remove React render cycle for pan/zoom operations; add `memo` to scene layer components — pan/zoom no longer triggers component re-renders
- **Hotspot fixes:** Address CPU/memory hotspots identified in architecture review (dependency stability, resize observer, RAF throttle)
- **Render isolation:** Eliminate N-1 through N-5, H-3, M-1 render hotspots — connector render isolation, expandable label selector consolidation, export dialog memo

#### Tests
- Add performance-refactoring regression baseline suite (381 tests, 42 test suites) covering: grid background formula, keyboard dispatch, UI overlay editor modes, RAF throttle cleanup, resize observer lifecycle, scene list shape, reference stability, view operations integration, connector render isolation, expandable label selector consolidation, export image dialog memo, GSAP dependency, interaction manager dependency stability, renderer size shared observer
