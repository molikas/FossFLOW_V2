# FossFlow — Implementation Plan
> **Living document.** Point Claude to this file at the start of any session: "read PLAN.md and implement the next incomplete phase."
> Last updated: 2026-04-18

---

## How to Use This Document

### Starting a new session
Tell Claude: *"Read PLAN.md and [implement Phase X / continue the current phase]"*

Claude should then:
1. Read this file fully
2. Run the **Session Startup Checklist** for the target phase
3. Use `TodoWrite` to track sub-tasks for that session
4. Mark checkboxes `[x]` in this file as tasks complete
5. Update the **Phase Status** table before ending the session

### Conventions
- `[ ]` = not started
- `[~]` = in progress
- `[x]` = complete
- `[!]` = blocked — see note
- ⚠️ **TOKEN-HEAVY** = read the guardrail before starting
- 🚫 **OUT OF SCOPE** = E2E tests — deferred to post-UX phase (see bottom)

---

## Phase Status Dashboard

| Phase | Name | Status | Token Load | Notes |
|---|---|---|---|---|
| **0A** | App.tsx Decomposition | `[x]` | ⚠️ Very High | Prerequisite for all phases |
| **0B** | Notification System (E7) | `[x]` | Medium | Prerequisite for all phases |
| **1A** | 2D Canvas Mode (E1) | `[x]` | Medium | Self-contained |
| **1B** | Material Icons (E2) | `[x]` | Low | Self-contained |
| **2A** | Storage Interface Refactor (E4-local) | `[x]` | High | Depends on 0A |
| **2B** | File Explorer UI (E3) | `[x]` | ⚠️ Very High | Depends on 2A |
| **2B-R** | File Explorer UX Revision | `[x]` | High | Revises 2B — do before 2C |
| **2C** | Diagram-to-Diagram Links | `[x]` | Low | Depends on 2A, 2B-R |
| **3A** | Google Auth — authStore (E5) | `[ ]` | Medium | Depends on 0B |
| **3B** | Google Drive Provider (E4) | `[ ]` | High | Depends on 3A |
| **3C** | S3 Provider + Backend (E4) | `[ ]` | High | Depends on 2A |
| **4A** | External Diagram Registry (E6) | `[ ]` | Low | Depends on 3A |
| **POST** | E2E Test Suite | 🚫 OUT OF SCOPE | — | Pick up after full UX ships |

---

## Codebase Snapshot (read-only reference — do not modify this section)

### Monorepo structure
```
c:\myTemp\FossFLOW\
├── packages/
│   ├── fossflow-lib/          # Core React library (published as "fossflow")
│   │   └── src/
│   │       ├── Isoflow.tsx            # Main library export (forwardRef, ~200 lines)
│   │       ├── stores/
│   │       │   ├── modelStore.tsx     # Diagram data + undo/redo (Immer patches)
│   │       │   ├── sceneStore.tsx     # Computed scene data
│   │       │   ├── uiStateStore.tsx   # UI mode, zoom, scroll, dialogs, settings
│   │       │   └── localeStore.tsx    # i18n
│   │       ├── components/
│   │       │   ├── Renderer/          # Main canvas SVG renderer
│   │       │   ├── SceneLayers/       # Nodes, Connectors, TextBoxes, Rectangles
│   │       │   ├── Grid/              # Isometric grid background (SVG tile)
│   │       │   ├── LeftDock/          # Elements + Layers tabs (library-owned)
│   │       │   ├── RightSidebar/      # Item property controls
│   │       │   ├── ToolMenu/          # Floating toolbar (select/pan/lasso + undo/redo)
│   │       │   ├── MainMenu/          # File/Edit/View menus (portal-injected)
│   │       │   └── ContextMenu/       # Right-click menu
│   │       ├── types/
│   │       │   ├── model.ts           # Model, Icon, Connector, Item types
│   │       │   ├── isoflowProps.ts    # Library component props
│   │       │   └── ui.ts              # UI state types
│   │       └── config.ts              # Constants (tile size, zoom limits, etc.)
│   │
│   ├── fossflow-app/          # Web application consuming the library
│   │   └── src/
│   │       ├── App.tsx                # ⚠️ 745 lines — decompose in Phase 0A
│   │       ├── index.tsx              # Entry: ErrorBoundary > I18n > App
│   │       ├── components/
│   │       │   ├── AppToolbar.tsx     # Top bar: name, save, open, export, share
│   │       │   ├── DiagramManager.tsx # Server diagram list modal
│   │       │   ├── SaveDialog.tsx     # Save prompt
│   │       │   ├── LoadDialog.tsx     # Load diagram picker
│   │       │   ├── ExportDialog.tsx   # Export options
│   │       │   └── ErrorBoundary.tsx  # Crash fallback UI
│   │       └── services/
│   │           ├── storageService.ts  # StorageManager → ServerStorage | SessionStorage
│   │           └── iconPackManager.ts # Lazy icon pack loader
│   │
│   ├── fossflow-backend/      # Express server
│   │   └── server.js          # /api/diagrams/*, /api/storage/status
│   │
│   └── fossflow-e2e/          # Playwright tests (OUT OF SCOPE this phase)
│       └── tests/             # smoke, connector, node, pan, undo-redo, visual
│
├── new_features.md            # Original feature spec
├── PLAN.md                    # This file
└── package.json               # Monorepo root (Yarn workspaces)
```

### Key existing patterns (Claude must follow these)
- **State**: Zustand stores. Add new stores in `fossflow-app/src/stores/` (app-level) or `fossflow-lib/src/stores/` (library-level). Never add app-level state to lib stores.
- **UI**: MUI v7. Use MUI components exclusively — no raw HTML divs for layout.
- **Error handling**: After Phase 0B, always use `notificationStore.push()` — never `alert()` or custom toasts.
- **Icons**: Only modify `fossflow-app/src/services/iconPackManager.ts` to register new packs.
- **Storage**: Only interact with storage via `StorageManager` — never import `ServerStorage` or `SessionStorage` directly in components.
- **Async**: All async storage calls need try/catch. Re-throw to caller. Caller shows notification.
- **Testing (unit)**: Jest + ts-jest + jsdom. Place tests in `__tests__/` adjacent to the file under test.
- **E2E**: 🚫 Out of scope this phase.

### Critical config values
- Tile size (iso): width multiplier 1.415, height multiplier 0.819
- Tile size (unprojected): 100×100
- Zoom range: MIN_ZOOM (0.1) to MAX_ZOOM (1.0)
- Storage server check timeout: 5s availability, 10s load, 15s save
- History limit: 50 entries (Immer patches)
- localStorage key prefix: `fossflow-`

---

## Phase 0A — App.tsx Decomposition
**Status:** `[x]` | **Token load:** ⚠️ Very High | **Prerequisite for:** All phases

### Why this must go first
`App.tsx` is 745 lines handling: diagram lifecycle, storage initialization, dialog state, keyboard shortcuts, URL routing, unsaved-changes guard, and icon pack management. Every subsequent phase adds code here. Decompose first or every feature becomes a coupling hazard.

### Token guardrail
> ⚠️ **Do not attempt this in one pass.**
> Session 1: Read App.tsx fully. Extract only `DiagramLifecycleProvider`.
> Session 2: Extract `AppStorageContext`. Verify nothing is broken.
> Session 3: Extract `FileExplorerLayout` shell (empty — wired up in Phase 2B).
> Run `yarn build` after each extraction before proceeding.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/App.tsx                (full)
  packages/fossflow-app/src/index.tsx              (full)
  packages/fossflow-app/src/services/storageService.ts  (full)
  packages/fossflow-app/src/components/AppToolbar.tsx   (full)
```

### Target file structure after this phase
```
packages/fossflow-app/src/
├── App.tsx                          # Slim shell: ~100 lines, composes providers
├── providers/
│   ├── DiagramLifecycleProvider.tsx # save/load/delete/create + unsaved-changes guard
│   └── AppStorageContext.tsx        # storage init, isServerStorage, isInitialized
├── layout/
│   └── FileExplorerLayout.tsx       # Shell for left panel (empty for now, wired in 2B)
└── components/
    └── AppToolbar.tsx               # Unchanged, but now reads from context not App state
```

### Sub-tasks
- [x] Read App.tsx fully and identify all state variables + their owners
- [x] Create `providers/AppStorageContext.tsx` — extract storage init logic
- [x] Create `providers/DiagramLifecycleProvider.tsx` — extract: currentDiagram, hasUnsavedChanges, handleSave, handleLoad, handleDelete, handleNew, beforeUnload guard
- [x] Create `layout/FileExplorerLayout.tsx` — empty shell with a left-panel placeholder div
- [x] Rewrite `App.tsx` to compose the above providers
- [x] Update `AppToolbar.tsx` to consume `DiagramLifecycleProvider` context instead of prop-drilling
- [x] Verify `yarn build` passes in `fossflow-app`
- [x] Verify `yarn build` passes in root

### Done criteria
- [x] App.tsx is ≤ 150 lines (103 lines)
- [x] No logic in App.tsx — only provider composition and route rendering
- [x] All existing functionality works identically (manual smoke: save, load, export, share, read-only URL)
- [x] `yarn build` clean

---

## Phase 0B — Notification System (E7)
**Status:** `[x]` | **Token load:** Medium | **Prerequisite for:** All phases that show user feedback

### Why this must go before features
Current code has ~6 `alert()` calls and a custom inline toast. Every new feature (save failure, auth expiry, Drive errors) needs notifications. Build once, use everywhere.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/App.tsx                          (relevant sections: alert() calls)
  packages/fossflow-app/src/components/AppToolbar.tsx        (current save toast implementation)
  packages/fossflow-app/src/components/DiagramManager.tsx    (current error display)
```

### Target file structure
```
packages/fossflow-app/src/
├── stores/
│   └── notificationStore.ts         # New Zustand store
└── components/
    └── NotificationStack.tsx        # MUI Snackbar stack (max 3 visible)
```

### TypeScript interface (implement exactly)
```typescript
// stores/notificationStore.ts
type NotificationSeverity = 'success' | 'error' | 'warning' | 'info'

interface NotificationAction {
  label: string
  onClick: () => void
}

interface Notification {
  id: string                    // crypto.randomUUID()
  severity: NotificationSeverity
  message: string
  action?: NotificationAction   // e.g., "Try again", "Sign in"
  autoDismiss?: number          // ms. Omit = sticky (warning/error are sticky by default)
  persistent?: boolean          // survives route changes (e.g., session-expired banner)
}

// Auto-dismiss defaults:
// success → 3000ms
// info    → 4000ms
// warning → sticky
// error   → sticky
// Max visible: 3. Additional notifications queue and appear as older ones dismiss.

interface NotificationStore {
  queue: Notification[]
  push(n: Omit<Notification, 'id'>): void
  dismiss(id: string): void
  dismissAll(): void
}
```

### Sub-tasks
- [x] Create `stores/notificationStore.ts` with Zustand (not persisted)
- [x] Create `components/NotificationStack.tsx` using MUI `Snackbar` + `Alert` (max 3 visible, queue)
- [x] Mount `NotificationStack` in `App.tsx` at root level
- [x] Replace all `alert()` calls in App.tsx / AppToolbar.tsx with `notificationStore.push()`
- [x] Replace existing inline `saveToast` in AppToolbar with `notificationStore.push({ severity: 'success', ... })`
- [x] Replace existing MUI `Alert` session-storage warning with `notificationStore.push({ severity: 'warning', persistent: true, ... })`
- [x] Write unit tests: `stores/__tests__/notificationStore.test.ts`

### Unit tests (must write — not E2E)
```
notificationStore.test.ts:
  ✓ push() adds notification with generated id
  ✓ success notification has autoDismiss = 3000
  ✓ error notification has no autoDismiss (sticky)
  ✓ dismiss() removes by id
  ✓ max 3 visible: 4th notification is in queue, not visible
  ✓ queue drains: after dismiss, next queued item becomes visible
```

### Done criteria
- [x] Zero `alert()` or `window.confirm()` calls remain in fossflow-app (except browser beforeunload which can't be replaced)
- [x] All save/load error feedback uses `notificationStore`
- [x] Unit tests pass (10/10)
- [x] `yarn build` clean

---

## Phase 1A — 2D Canvas Mode (E1)
**Status:** `[x]` | **Token load:** Medium | **Depends on:** 0A, 0B

### Behavior
User toggles between isometric view (current) and standard 2D cartesian grid. Toggle lives in the floating `ToolMenu`. State persisted to localStorage. Export works in both modes.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-lib/src/components/Grid/Grid.tsx        (full)
  packages/fossflow-lib/src/stores/uiStateStore.tsx         (full — note persisted settings)
  packages/fossflow-lib/src/components/ToolMenu/ToolMenu.tsx (full)
  packages/fossflow-lib/src/config.ts                       (tile size constants)
  packages/fossflow-lib/src/utils/isoMath.ts                (or wherever isoToScreen/screenToIso live)
```

### Key insight (do not miss this)
Node positions are stored as abstract tile coordinates `(tileX, tileY)`. Only the *projection* changes. No data migration needed. The fix is entirely in the transform functions and grid tile SVG.

### Target file structure (changes only)
```
packages/fossflow-lib/src/
├── utils/
│   └── coordinateTransforms.ts      # NEW: strategy pattern for ISO vs 2D
├── contexts/
│   └── CanvasModeContext.tsx         # NEW: provides active transform strategy
├── components/
│   ├── Grid/Grid.tsx                 # MODIFY: switch tile background by mode
│   └── ToolMenu/ToolMenu.tsx         # MODIFY: add 2D/ISO toggle button
└── stores/
    └── uiStateStore.tsx              # MODIFY: add canvasMode to persisted settings
```

### TypeScript interface (implement exactly)
```typescript
// utils/coordinateTransforms.ts
export interface CoordinateTransformStrategy {
  toScreen(tileX: number, tileY: number, tileSize: number, zoom: number): { x: number; y: number }
  fromScreen(screenX: number, screenY: number, tileSize: number, zoom: number): { tileX: number; tileY: number }
  gridTileUrl: string   // path to the SVG tile asset
  projectionName: 'ISOMETRIC' | '2D'
}

export const isometricStrategy: CoordinateTransformStrategy = { ... }
export const cartesian2DStrategy: CoordinateTransformStrategy = { ... }

// uiStateStore.tsx additions
canvasMode: 'ISOMETRIC' | '2D'   // add to persisted settings
setCanvasMode(mode: 'ISOMETRIC' | '2D'): void
```

### Sub-tasks
- [x] Add `canvasMode: 'ISOMETRIC' | '2D'` to `uiStateStore` persisted settings (default: `'ISOMETRIC'`)
- [x] Create `utils/coordinateTransforms.ts` with both strategies
- [x] Create `contexts/CanvasModeContext.tsx` — provides active strategy based on `canvasMode`
- [x] Wrap renderer root in `CanvasModeContext.Provider` (in `Isoflow.tsx` or `Renderer.tsx`)
- [x] Update all `isoToScreen` / `screenToIso` call sites to read from context
- [x] Update `Grid.tsx` to switch SVG tile background when mode changes
- [x] Create `assets/grid-tile-2d.svg` (standard square grid tile, matching existing tile dimensions)
- [x] Add 2D/ISO toggle icon button to `ToolMenu.tsx`
- [x] Verify connector routing (`pathfinding` library tile dimensions) is mode-aware
- [x] Verify `dom-to-image-more` export works in both modes
- [x] Write unit tests: `utils/__tests__/coordinateTransforms.test.ts`

### Unit tests (must write — not E2E)
```
coordinateTransforms.test.ts:
  ✓ isometricStrategy.toScreen: known tile → expected pixel position
  ✓ isometricStrategy.fromScreen: known pixel → expected tile
  ✓ cartesian2DStrategy.toScreen: known tile → expected pixel (90° cartesian)
  ✓ cartesian2DStrategy.fromScreen: known pixel → expected tile
  ✓ round-trip: toScreen → fromScreen returns original tile coords (both modes)
```

### Done criteria
- [x] Toggle button in ToolMenu switches grid rendering visually
- [x] Node/connector positions are consistent after mode switch (same diagram, different view)
- [x] `canvasMode` persists across page reload
- [x] Export produces valid image in both modes
- [x] Unit tests pass
- [x] `yarn build` clean

---

## Phase 1B — Material Design Icons (E2)
**Status:** `[x]` | **Token load:** Low | **Depends on:** Nothing (standalone)

### Behavior
A "Material Icons" category appears in the left dock `ElementsPanel`. Icons are searchable, browsable, and draggable to the canvas identically to AWS/GCP packs.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/services/iconPackManager.ts    (full)
  packages/fossflow-lib/src/components/LeftDock/           (understand ElementsPanel structure)
  packages/fossflow-lib/src/types/model.ts                 (Icon type definition)
  node_modules/@mui/icons-material/index.js                (first 50 lines — understand export shape)
```

### Key decision
MUI icons ship as React components. The canvas needs SVG path data. **Build a static JSON pack at build time** via a prebuild script — not runtime dynamic imports. The JSON format must match the `@isoflow/isopacks` structure that the icon manager already understands.

### Target file structure
```
packages/fossflow-app/
├── scripts/
│   └── generateMaterialIconPack.ts  # NEW: runs at prebuild
└── src/
    └── assets/
        └── material-icons-pack.json # GENERATED: ~2000 icons, gitignored
```

```
packages/fossflow-app/package.json:
  "prebuild": "ts-node scripts/generateMaterialIconPack.ts"
```

### Sub-tasks
- [x] Inspect `@mui/icons-material` export shape to understand SVG path extraction approach
- [x] Write `scripts/generateMaterialIconPack.js` — outputs `material-icons-pack.json` in isopack format (plain JS, ts-node unavailable)
- [x] Add `material-icons-pack.json` to `.gitignore` (generated artifact)
- [x] Register Material pack in `iconPackManager.ts` as a toggleable pack (same as aws/gcp/azure/k8s)
- [x] Verify icons appear in `ElementsPanel` under "Material" category
- [x] Verify icons are draggable to canvas
- [x] `collection` is already an optional string in iconSchema — no type change needed
- [x] Write unit test: `scripts/__tests__/generateMaterialIconPack.test.ts`

### Unit tests (must write — not E2E)
```
generateMaterialIconPack.test.ts:
  ✓ Output JSON has > 1000 icons (2179 generated)
  ✓ Each icon has: id, collection: 'material', name, url fields
  ✓ No icon has an empty url
  ✓ No duplicate ids
  ✓ All urls are valid data:image/svg+xml data URLs
```

### Done criteria
- [x] Pack generates at prebuild without errors
- [x] Material icons visible and searchable in ElementsPanel
- [x] Drag-to-canvas works
- [x] Unit tests pass (5/5)
- [x] `yarn build` clean

---

## Phase 2A — Pluggable Storage Interface (E4 — Local Only)
**Status:** `[x]` | **Token load:** High | **Depends on:** 0A, 0B

### Token guardrail
> ⚠️ **Do not implement all providers in one session.**
> Session 1: Define the interface + refactor existing server/session into `LocalStorageProvider`.
> Session 2 (Phase 3B): Google Drive provider.
> Session 3 (Phase 3C): S3 provider + backend signed URLs.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/services/storageService.ts      (full)
  packages/fossflow-app/src/providers/AppStorageContext.tsx (from Phase 0A)
  packages/fossflow-backend/server.js                       (full — understand existing endpoints)
```

### Target file structure
```
packages/fossflow-app/src/services/storage/
├── types.ts                         # StorageProvider interface + shared types
├── StorageManager.ts                # Refactored: provider registry + active provider delegation
├── providers/
│   ├── LocalStorageProvider.ts      # Merges existing ServerStorage + SessionStorage
│   ├── GoogleDriveProvider.ts       # STUB only in this phase — implemented in 3B
│   └── S3Provider.ts               # STUB only in this phase — implemented in 3C
└── index.ts                         # Re-exports
```

### TypeScript interface (implement exactly — all providers must implement this)
```typescript
// services/storage/types.ts

export interface DiagramMeta {
  id: string
  name: string
  lastModified: string     // ISO 8601
  folderId: string | null  // null = root
  isDirty?: boolean        // client-side only
  thumbnail?: string       // base64 PNG, generated on save
  lockedBy?: string        // reserved for P3 collaboration — leave undefined for now
  deletedAt?: string       // ISO 8601 — soft delete, null = not deleted
}

export interface FolderMeta {
  id: string
  name: string
  parentId: string | null
  isExpanded?: boolean     // tree UI state
}

export interface TreeManifest {
  folders: FolderMeta[]
  // diagram folderId is stored on DiagramMeta, not here
}

export interface StorageProvider {
  id: 'local' | 'google-drive' | 's3'
  displayName: string
  requiresAuth: boolean

  isAvailable(): Promise<boolean>

  // Diagrams
  listDiagrams(folderId?: string | null): Promise<DiagramMeta[]>
  loadDiagram(id: string): Promise<unknown>          // returns raw diagram JSON
  saveDiagram(id: string, data: unknown): Promise<void>
  createDiagram(data: unknown, folderId?: string | null): Promise<string>  // returns new id
  deleteDiagram(id: string, soft?: boolean): Promise<void>

  // Folders
  listFolders(parentId?: string | null): Promise<FolderMeta[]>
  createFolder(name: string, parentId?: string | null): Promise<string>
  deleteFolder(id: string, recursive: boolean): Promise<void>
  renameFolder(id: string, name: string): Promise<void>
  moveItem(id: string, type: 'diagram' | 'folder', targetFolderId: string | null): Promise<void>

  // Tree manifest (open/close state, ordering)
  getTreeManifest(): Promise<TreeManifest>
  saveTreeManifest(manifest: TreeManifest): Promise<void>

  // Reserved for P3 — no-op stubs for now
  subscribe?(diagramId: string, callback: () => void): () => void  // returns unsubscribe fn
}
```

### Sub-tasks
- [x] Create `services/storage/types.ts` with all interfaces above
- [x] Create `services/storage/providers/LocalStorageProvider.ts` — merge existing `ServerStorage` + `SessionStorage` logic into one provider implementing `StorageProvider`
- [x] Add folder support to `LocalStorageProvider`: folders stored as `fossflow_folders` JSON in localStorage (key: `fossflow-folders`), folder membership stored as `folderId` on diagram metadata
- [x] Create stub `services/storage/providers/GoogleDriveProvider.ts` — throws `NotImplementedError` on all methods
- [x] Create stub `services/storage/providers/S3Provider.ts` — throws `NotImplementedError` on all methods
- [x] Refactor `services/storage/StorageManager.ts` — provider registry pattern, `registerProvider()`, `setActiveProvider()`, delegates all calls to active provider
- [x] Update `providers/AppStorageContext.tsx` to initialize `StorageManager` with `LocalStorageProvider` as default
- [x] Update `fossflow-backend/server.js` — add folder endpoints:
  - `GET /api/folders` → list folders
  - `POST /api/folders` → create folder
  - `PUT /api/folders/:id` → rename folder
  - `DELETE /api/folders/:id` → delete folder (with `?recursive=true` support)
  - `PATCH /api/diagrams/:id/move` → move diagram to folder (`{ targetFolderId }`)
  - `GET /api/tree-manifest` → get manifest
  - `PUT /api/tree-manifest` → save manifest
- [x] Write unit tests: `services/storage/__tests__/LocalStorageProvider.test.ts`

### Unit tests (must write — not E2E)
```
LocalStorageProvider.test.ts (use MSW to mock fetch):
  ✓ listDiagrams() returns parsed list from server
  ✓ listDiagrams() falls back to sessionStorage when server unavailable
  ✓ saveDiagram() sends correct PUT body
  ✓ createDiagram() returns new id
  ✓ deleteDiagram(id, soft=true) sets deletedAt timestamp, does not remove
  ✓ deleteDiagram(id, soft=false) removes permanently
  ✓ createFolder() creates and returns id
  ✓ moveItem() sends correct PATCH body
  ✓ server timeout (>5s) falls back to sessionStorage
```

### Done criteria
- [x] All existing save/load/delete flows work via `LocalStorageProvider`
- [x] Folder CRUD works against the dev server
- [x] Stub providers exist (return `NotImplementedError`) — no broken imports
- [x] Unit tests pass (9/9 — jest.fn fetch mock, MSW skipped: ESM conflict with Jest CJS config)
- [x] `yarn build` clean

---

## Phase 2B — File Explorer UI (E3)
**Status:** `[x]` | **Token load:** ⚠️ Very High | **Depends on:** 0A, 2A

### Token guardrail
> ⚠️ **Break this into 3 sessions minimum.**
> Session 1: Install react-arborist. Implement basic tree with folder/diagram nodes (read-only, no interactions). Wire into FileExplorerLayout shell from Phase 0A.
> Session 2: Implement CRUD — create, rename (inline), delete (with confirmation), soft delete/trash.
> Session 3: Implement drag-and-drop, context menu, search/filter, dirty indicators, thumbnail previews.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/layout/FileExplorerLayout.tsx   (from Phase 0A — shell to fill)
  packages/fossflow-app/src/services/storage/types.ts       (from Phase 2A — data model)
  packages/fossflow-app/src/providers/DiagramLifecycleProvider.tsx  (from Phase 0A)
  packages/fossflow-app/src/stores/notificationStore.ts     (from Phase 0B)
  https://github.com/jameskerr/react-arborist               (README — understand API)
```

### Target file structure
```
packages/fossflow-app/src/
├── layout/
│   └── FileExplorerLayout.tsx        # MODIFY: fill shell with actual panel + toggle
├── components/fileExplorer/
│   ├── FileExplorer.tsx              # Root component: arborist tree + toolbar
│   ├── FileTreeNode.tsx              # Custom arborist node renderer
│   ├── FileTreeToolbar.tsx           # New folder, search input
│   ├── TrashSection.tsx              # Soft-deleted items (30 day)
│   ├── ContextMenuItems.tsx          # Right-click menu content
│   └── useThumbnail.ts              # Hook: generate/cache diagram thumbnails
├── hooks/
│   └── useFileTree.ts               # Tree state management (open/close, selection)
└── utils/
    └── fileOperations.ts             # Naming, collision, sanitization pure functions
```

### Key UX rules to implement
| Behavior | Implementation |
|---|---|
| Infinite nesting | react-arborist handles |
| Expansion memory | `TreeManifest.folders[].isExpanded` persisted via storage provider |
| Inline rename | Double-click or F2 → arborist's built-in `Input` rename mode |
| Spring-loading DnD | react-arborist `openDelay={500}` prop |
| Selection persistence after move | react-arborist selection state — re-select by id after move |
| Long name truncation | CSS `text-overflow: ellipsis` on node; full name in MUI `Tooltip` |
| Dirty indicator | `DiagramMeta.isDirty` → render a dot (·) suffix on node label |
| Dirty propagation | If any child `isDirty`, parent folder node also shows indicator |
| Soft delete (trash) | Set `deletedAt`. Show "Trash" section at bottom of tree. Auto-purge after 30 days. |
| Delete confirmation | MUI Dialog: "Delete '[name]' and [n] items inside?" + item count |
| Thumbnail on hover | MUI `Tooltip` with `<img src={thumbnail}>`, generated on save |
| Name collision on move | MUI Dialog: "Keep Both / Replace / Cancel" |

### fileOperations.ts pure functions (all unit-testable)
```typescript
sequentialName(baseName: string, existingNames: string[]): string
// "Untitled" → "Untitled-1" → "Untitled-2"

copySuffix(name: string, existingNames: string[]): string
// "MyDiagram" → "MyDiagram - Copy" → "MyDiagram - Copy (1)"

sanitizeName(name: string): string
// Remove: / \ : * ? " < > |   Replace with _

detectCollision(name: string, targetFolderNames: string[]): boolean

countDescendants(folderId: string, tree: TreeManifest): number
// For delete confirmation dialog

propagateDirty(tree: TreeManifest, diagrams: DiagramMeta[]): Map<string, boolean>
// Returns folderId → hasDirtyDescendant
```

### Sub-tasks (Session 1 — basic tree)
- [x] `yarn add react-arborist` in fossflow-app
- [x] Implement `useFileTree.ts` — loads tree manifest + diagram list, builds arborist-compatible node array
- [x] Implement `FileTreeNode.tsx` — renders folder (ChevronRight icon) and diagram (ArticleOutlined icon) nodes
- [x] Wire `FileExplorer.tsx` with `<Tree>` from react-arborist
- [x] Mount in `FileExplorerLayout.tsx` — collapsible left panel, 280px wide, pushes canvas right
- [x] Add toggle button in `AppToolbar.tsx` to open/close the panel

### Sub-tasks (Session 2 — CRUD)
- [x] Inline create folder: toolbar button → new node with `sequentialName()` → arborist rename mode
- [x] Inline rename: F2 / double-click → arborist rename mode → `renameFolder()` or update diagram name
- [x] Delete (single diagram): context menu → `notificationStore` undo toast (5s) → soft delete after 5s
- [x] Delete (folder with children): dialog with count → soft delete all descendants
- [x] Trash section: filtered list of `deletedAt !== null` items
- [x] Restore from trash: context menu "Restore" → clears `deletedAt`
- [x] Permanent delete from trash: "Delete permanently" → `deleteDiagram(id, soft=false)`

### Sub-tasks (Session 3 — interactions)
- [x] Drag-and-drop: arborist `onMove` → `moveItem()` → optimistic update → rollback on failure
- [x] Name collision on DnD: check before confirming move → show merge/replace/keep-both dialog
- [x] Context menu: right-click → MUI Menu with: Open, Rename, Duplicate, Move to Trash, Copy Path
- [x] Search/filter: text input in `FileTreeToolbar` → filter arborist nodes by name (real-time)
- [x] Dirty indicators: subscribe to `DiagramLifecycleProvider.hasUnsavedChanges`
- [x] Dirty propagation: compute `propagateDirty()` on each tree render
- [x] Thumbnail: `useThumbnail.ts` — reads `DiagramMeta.thumbnail` base64; generates on save via `dom-to-image-more`

### Unit tests (must write — not E2E)
```
fileOperations.test.ts:
  ✓ sequentialName: no conflict → returns baseName unchanged
  ✓ sequentialName: conflict → appends -1, -2, etc.
  ✓ copySuffix: no conflict → appends " - Copy"
  ✓ copySuffix: Copy exists → appends " - Copy (1)"
  ✓ sanitizeName: removes all illegal characters
  ✓ sanitizeName: empty string after sanitize → returns "Untitled"
  ✓ countDescendants: returns correct count including nested folders
  ✓ propagateDirty: returns true for folder with dirty child
  ✓ propagateDirty: returns false when all children clean
```

### Done criteria
- [x] File tree visible as collapsible left panel
- [x] Full CRUD (create folder, rename, soft delete, restore, permanent delete)
- [x] Drag-and-drop with spring-loading
- [x] Context menu with all actions
- [x] Search/filter
- [x] Dirty indicators + propagation
- [x] Thumbnail on hover (after first save)
- [x] Trash section
- [x] Unit tests pass (21/21)
- [x] `yarn build` clean

---

## Phase 2B-R — File Explorer UX Revision
**Status:** `[x]` | **Token load:** High | **Depends on:** 2B | **Must complete before:** 2C

### Why this revision exists
Phase 2B shipped a "draft auto-creation" model where editing an unsaved canvas automatically created a timestamped Draft entry in storage. After UX review this was replaced with a VS Code-style approach: explicit inline creation from the file tree, a "Blank diagram" canvas card for the empty-state, and no auto-draft behavior. Several supporting pieces (DraftsSection, search box, pre-creation-then-rename flow) were also revised.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/providers/DiagramLifecycleProvider.tsx   (full)
  packages/fossflow-app/src/components/fileExplorer/FileExplorer.tsx  (full)
  packages/fossflow-app/src/components/fileExplorer/FileTreeToolbar.tsx
  packages/fossflow-app/src/components/fileExplorer/FileTreeNode.tsx
  packages/fossflow-app/src/hooks/useFileTree.ts
  packages/fossflow-app/src/App.tsx
  packages/fossflow-app/src/components/AppToolbar.tsx
```

### Decisions & constraints (do not revisit)
| Decision | Rule |
|---|---|
| Search | Removed entirely — no search in file tree |
| Auto-sort | Folders first (alpha), then diagrams (alpha) — implemented in `buildTree`; always wins |
| DnD | Cross-folder move only — same-parent reorder silently rejected (`currentParentId === parentId` guard) |
| Draft auto-creation | Removed entirely — no auto-draft, no DraftsSection |
| Explorer header label | Dynamic from `storage.id`: `local` → "DIAGRAMS", `google-drive` → "GOOGLE DRIVE", `s3` → "S3" |
| Explorer default open | First server-mode session only (localStorage `fossflow-explorer-initialized` flag); persisted after |
| Session mode | Explorer defaults closed; no "Blank diagram" canvas card — old canvas behavior |
| Canvas "Blank diagram" card | Shown when `serverStorageAvailable && currentDiagram === null && !isReadonlyUrl` |
| AppToolbar "New diagram" button | Removed |
| Inline creation | `__pending__` node injected into `treeDataWithPending`; empty name or Escape = cancel; non-empty + Enter/blur = create in storage |
| New Diagram from tree | Flush auto-save (server) or show unsaved-changes dialog (session) → create → load blank canvas |
| Canvas card creation location | Always root |
| File tree button creation location | Selected folder, or root if nothing selected |
| Unsaved changes guard (session mode) | ConfirmDialog with Save / Discard / Cancel (3 buttons) |

### Target file structure changes
```
DELETED:
  packages/fossflow-app/src/components/fileExplorer/DraftsSection.tsx

REWRITTEN:
  packages/fossflow-app/src/components/fileExplorer/FileTreeToolbar.tsx
    — VS Code-style: [PROVIDER LABEL] + [New Diagram] [New Folder] [Refresh] [Collapse All]
    — Props: { providerLabel, onNewDiagram, onNewFolder, onRefresh, onCollapseAll }

NEW:
  packages/fossflow-app/src/components/EmptyStateScreen.tsx
    — Full canvas replacement (not overlay) when serverStorageAvailable && !currentDiagram
    — ISO grid CSS background + centered Paper card with AddCircleOutline icon + "New diagram" button
    — Props: { onCreate: () => void }
    — A/B test: GRID_VARIANT constant at top ('iso' | '2d') — flip to compare, delete unused branch

MODIFIED:
  DiagramLifecycleProvider.tsx  — remove draft logic; add handleCreateBlankDiagram, checkUnsavedBeforeNavigate
  FileExplorer.tsx              — pendingNew state, treeDataWithPending, inline creation handlers; TrashSection removed; context menu simplified to Open/Rename/Duplicate/Delete (hard delete with confirmation, no undo toast)
  FileTreeNode.tsx              — Escape/blur cancellation for __pending__ node
  useFileTree.ts                — remove draftsData; auto-sort in buildTree
  AppToolbar.tsx                — remove "New diagram" button
  App.tsx (EditorShell)         — render EmptyStateScreen when no diagram open (replaces canvas entirely)
  ConfirmDialog.tsx             — add optional onDiscard prop for 3-button variant; standardized dialog style (soft shadow, X button, h6 600 title, body2 body)

DELETED:
  packages/fossflow-app/src/components/fileExplorer/TrashSection.tsx
    — Removed: no trash UX; delete is immediate (hard delete) with confirmation dialog
```

### DiagramLifecycleProvider changes (precise)
- **Remove:** `formatDraftName()`, `draftsFolderId` state+ref, `isCreatingDraftRef`, `ensureDraftsFolder()`,
  its pre-fetch `useEffect`, auto-draft block in `handleModelUpdated` (the `else if (!isCreatingDraftRef.current)` branch),
  `draftsFolderId` from context interface + value
- **Change `handleModelUpdated` server-mode block:** when `currentDiagram === null`, do nothing (no draft, no save)
- **Change `fileExplorerOpen` init:** first server session → `true`; subsequent → read `fossflow-explorer-open` from localStorage; session mode → always `false`
- **Add `useEffect`** persisting `fileExplorerOpen` to `fossflow-explorer-open` in localStorage
- **Add `handleCreateBlankDiagram(folderId: string | null)`:** sequential-named "Untitled", creates in storage, calls `handleDiagramManagerLoad`, opens explorer, fires refresh token
- **Add `checkUnsavedBeforeNavigate(onProceed: () => void)`:** no-op in server mode; in session mode with `hasUnsavedChanges` → ConfirmDialog (Save / Discard / Cancel)
- **Expose** `handleCreateBlankDiagram` and `checkUnsavedBeforeNavigate` in context interface + value

### useFileTree changes (precise)
- Remove `draftsFolderId` param; remove `draftsData` from result type and return
- In `buildTree`: sort `childFolders` and `folderDiagrams` alphabetically before pushing to `nodes`

### FileExplorer changes (precise)
- Remove: `DraftsSection` import + render, `draftsFolderId` destructure, `searchTerm` state
- Add: `selectedNode` state; `pendingNew` state; `selectedFolderId` memo; `treeDataWithPending` memo
- Add: `injectPendingNode()` helper (inline or in fileOperations.ts)
- Add: `useEffect` calling `treeRef.current?.edit('__pending__')` when `pendingNew` is set
- Replace `handleNewFolder`: set `pendingNew = { type: 'folder', parentId: selectedFolderId }`
- Add `handleNewDiagramInline`: set `pendingNew = { type: 'diagram', parentId: selectedFolderId }`
- Rewrite `handleRenameSubmit`: intercepts `id === '__pending__'` — empty → cancel; non-empty folder → `createFolder`; non-empty diagram → `checkUnsavedBeforeNavigate` → `createDiagram` → `openDiagramById`
- Remove `handleCreate` (arborist `onCreate` handler) entirely; remove `onCreate` prop from `<Tree>`
- Update `handleMove`: add `if (currentParentId === parentId) return;` guard at top of loop
- Add `handleCollapseAll`: `treeRef.current?.closeAll()`
- Update `<Tree>`: remove `searchTerm`, `searchMatch`, `onCreate`; add `onSelect`; use `treeDataWithPending`
- Update `<FileTreeToolbar>`: new prop signature

### FileTreeNode changes (precise)
- In edit input `onBlur`: if `node.data.id === '__pending__' && !value.trim()` → `node.submit('')` instead of `node.submit(value)` (routes to cancel path in handleRenameSubmit)
- In edit input `onKeyDown` for Escape: if `node.data.id === '__pending__'` → `node.submit('')`; else → `node.reset()`
- Skip tooltip when `node.data.id === '__pending__'` (name is empty)

### BlankDiagramCard spec
- Absolute overlay: `position: absolute; inset: 0; z-index: 10`
- Background: semi-transparent `background.default` (blocks canvas interaction while showing it dimly)
- Centered content: MUI `Paper elevation=0` with dashed border, ~200×160px, fully clickable (`ButtonBase`)
- Contents: `AddCircleOutlineIcon` 64px + `Typography` "Blank diagram" (body1, text.secondary)
- Hover: border → `primary.main`, icon → `primary.main`

### Sub-tasks
- [x] Delete `DraftsSection.tsx`
- [x] Remove all draft logic from `DiagramLifecycleProvider.tsx`; add `handleCreateBlankDiagram` + `checkUnsavedBeforeNavigate`
- [x] Update `fileExplorerOpen` initialization (first-session logic + localStorage persistence)
- [x] Remove `draftsFolderId` from context interface and all consumers
- [x] Update `useFileTree.ts`: remove `draftsData`, add auto-sort in `buildTree`
- [x] Rewrite `FileTreeToolbar.tsx` to VS Code header layout
- [x] Update `FileExplorer.tsx`: `pendingNew` inline creation, `treeDataWithPending`, updated handlers
- [x] Update `FileTreeNode.tsx`: `__pending__` Escape/blur cancellation
- [x] Add `EmptyStateScreen.tsx` (implemented as full canvas replacement, not overlay — see target structure note)
- [x] Wire `EmptyStateScreen` into `App.tsx` EditorShell
- [x] Remove "New diagram" button from `AppToolbar.tsx`
- [x] Add `onDiscard` prop to `ConfirmDialog.tsx`
- [x] Update `PLAN.md` Phase 2B sub-tasks 2B (Session 2 "Inline create folder") and (Session 3 "Search/filter") to note they are revised
- [x] `yarn build` clean

### Done criteria
- [x] `DraftsSection.tsx` deleted; no draft folder auto-created on app start
- [x] File explorer header: dynamic label + 4 icon buttons; no search box
- [x] "New Diagram" inline: placeholder appears → empty/Escape cancels → name confirms → blank diagram opens in canvas
- [x] "New Folder" inline: same placeholder flow; folder appears in tree sorted
- [x] Auto-sort: folders before diagrams, alphabetical, at every level
- [x] DnD: cross-folder move works; same-folder reorder is silently ignored
- [x] EmptyStateScreen appears on server-mode empty state (ISO grid bg + card); clicking creates "Untitled" at root
- [x] File explorer open by default on first server-mode session; closed by default on session mode
- [x] AppToolbar "New diagram" button gone
- [x] Unsaved-changes guard works before inline diagram creation in session mode
- [x] TrashSection removed; context menu = Open / Rename / Duplicate / Delete (hard delete, confirmation dialog)
- [x] Dialogs standardized: soft shadow, X close button, h6 600 title, body2 text.secondary body, proper DialogActions padding
- [x] `yarn build` clean

---

## Phase 2C — Diagram-to-Diagram Links
**Status:** `[x]` | **Token load:** Low | **Depends on:** 2A, 2B-R

### Behavior
In the right sidebar, a node can be assigned a link to another diagram. In read-only preview mode (`/display/:id`), clicking a linked node opens the target diagram in a new tab.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-lib/src/types/model.ts            (Item/Node type)
  packages/fossflow-lib/src/components/RightSidebar/  (node controls panel)
  packages/fossflow-app/src/App.tsx                   (read-only route handler)
```

### Sub-tasks
- [x] Add `link?: string` (diagramId) to `modelItemSchema` Zod schema in `fossflow-lib/src/schemas/modelItems.ts`
- [x] Update UI types: add `linkedDiagrams` to `UiState` + `UiStateActions` in `types/ui.ts`
- [x] Add `linkedDiagrams` state + `setLinkedDiagrams` action to `uiStateStore.tsx`
- [x] Add `linkedDiagrams` prop to `IsoflowProps` (isoflowProps.ts) and wire via useEffect in Isoflow.tsx
- [x] Add "Link to diagram" dropdown in `NodeInfoTab.tsx` (edit mode, only shown when linkedDiagrams non-empty)
- [x] Add locale strings: `diagramLink`, `diagramLinkPlaceholder`, `diagramLinkHint`, `openDiagramLink` to all locales
- [x] In `Node.tsx`: in `EXPLORABLE_READONLY` mode, nodes with `modelItem.link` are clickable → opens `/display/{link}` in `_blank`; show small primary-colored badge with ExternalLink icon
- [x] In `App.tsx` EditorShell: load `linkedDiagrams` from `storage.listDiagrams()`, refresh on `fileTreeRefreshToken`, pass as prop to `<Isoflow>`

### Done criteria
- [x] Node can be linked to another diagram via right sidebar (Details tab dropdown)
- [x] Clicking linked node in read-only mode opens correct diagram in new tab
- [x] Diagram IDs remain stable across renames
- [x] `yarn build` clean

---

## Phase 3A — Google Authentication (E5)
**Status:** `[ ]` | **Token load:** Medium | **Depends on:** 0A, 0B

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/providers/AppStorageContext.tsx  (from Phase 0A)
  packages/fossflow-app/src/components/AppToolbar.tsx        (where avatar goes)
  packages/fossflow-app/src/stores/notificationStore.ts      (from Phase 0B)
  https://www.npmjs.com/package/@react-oauth/google          (README — GoogleOAuthProvider setup)
```

### Target file structure
```
packages/fossflow-app/src/
├── stores/
│   └── authStore.ts                  # NEW Zustand store (NOT persisted)
├── providers/
│   └── AuthProvider.tsx              # NEW: wraps GoogleOAuthProvider, initializes authStore
└── components/
    ├── AppToolbar.tsx                 # MODIFY: add avatar/sign-in button
    └── StorageProviderPicker.tsx     # NEW: local / Drive / S3 selector (Drive gated by auth)
```

### Auth state machine (implement exactly)
```
UNAUTHENTICATED  →(signIn())→     AUTHENTICATING
AUTHENTICATING   →(success)→     AUTHENTICATED
AUTHENTICATING   →(denied)→      UNAUTHENTICATED  + push info toast "Sign-in cancelled"
AUTHENTICATING   →(popup blocked)→ UNAUTHENTICATED + show tooltip near button
AUTHENTICATED    →(token near expiry)→ REFRESHING (background)
REFRESHING       →(success)→     AUTHENTICATED
REFRESHING       →(fail)→        SESSION_EXPIRED
SESSION_EXPIRED  →(signIn())→    AUTHENTICATING
AUTHENTICATED    →(signOut())→   UNAUTHENTICATED  + switch storage to local
```

### TypeScript interface (implement exactly)
```typescript
// stores/authStore.ts
type AuthStatus =
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'REFRESHING'
  | 'SESSION_EXPIRED'

interface AuthUser {
  name: string
  email: string
  avatarUrl: string
}

interface AuthStore {
  status: AuthStatus
  user: AuthUser | null
  accessToken: string | null    // in-memory ONLY — never persisted to localStorage
  expiresAt: number | null      // epoch ms
  signIn(): Promise<void>
  signOut(): void
  refreshToken(): Promise<boolean>
  getValidToken(): Promise<string | null>  // refreshes if <5min to expiry; null if unauth
}
```

### Security rules (enforce in code)
1. `authStore` must NOT use `zustand/middleware/persist` — token must never hit localStorage
2. `getValidToken()` is the ONLY way any other module gets the access token — no direct `accessToken` reads
3. Scopes: request ONLY `profile email https://www.googleapis.com/auth/drive.file`
4. On sign-out: call `authStore.signOut()` which nulls the token, then switch storage to local

### Sub-tasks
- [ ] `yarn add @react-oauth/google` in fossflow-app
- [ ] Create `stores/authStore.ts` with Zustand (no persist middleware)
- [ ] Create `providers/AuthProvider.tsx` — wraps `<GoogleOAuthProvider clientId={...}>`, attempts silent token refresh on mount
- [ ] Mount `AuthProvider` in `App.tsx` (above `AppStorageContext`)
- [ ] Add to `AppToolbar.tsx`:
  - Unauthenticated: "Sign in with Google" button (top-right)
  - Authenticating: CircularProgress spinner
  - Authenticated: MUI Avatar (photo) + name chip
  - Session expired: amber chip "Session expired" → click re-opens sign-in
- [ ] Create `StorageProviderPicker.tsx` — icon row in AppToolbar or Settings: Local | Google Drive (disabled if unauth, tooltip: "Sign in to use Google Drive") | S3 (disabled if backend not configured)
- [ ] Handle popup-blocked: catch error in `signIn()`, show tooltip, offer redirect fallback
- [ ] `SESSION_EXPIRED`: push persistent warning notification with "Sign in again" action
- [ ] Write unit tests: `stores/__tests__/authStore.test.ts`

### Unit tests (must write — not E2E)
```
authStore.test.ts (mock @react-oauth/google):
  ✓ initial status is UNAUTHENTICATED
  ✓ signIn() moves to AUTHENTICATING then AUTHENTICATED on success
  ✓ signIn() moves back to UNAUTHENTICATED on denial, pushes info notification
  ✓ accessToken never written to localStorage (spy on localStorage.setItem)
  ✓ getValidToken() returns token when AUTHENTICATED and not near expiry
  ✓ getValidToken() calls refreshToken() when within 5min of expiry
  ✓ getValidToken() returns null when UNAUTHENTICATED
  ✓ signOut() sets status UNAUTHENTICATED and nulls token
  ✓ SESSION_EXPIRED: push notification with 'Sign in again' action
```

### Done criteria
- [ ] Sign-in flow works end-to-end with Google popup
- [ ] Silent refresh works on page reload for returning user
- [ ] Token not present in localStorage at any point (manual DevTools check + unit test)
- [ ] Google Drive option in storage picker gated by auth
- [ ] Unit tests pass
- [ ] `yarn build` clean

---

## Phase 3B — Google Drive Provider (E4)
**Status:** `[ ]` | **Token load:** High | **Depends on:** 2A, 3A

### Token guardrail
> ⚠️ **Do not attempt Drive integration without first mocking it.**
> Session 1: Implement full `GoogleDriveProvider` with MSW mocking Drive API responses. All unit tests pass.
> Session 2: Wire to real Drive API. Manual test only (OAuth required — no automated E2E).

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/services/storage/types.ts          (StorageProvider interface)
  packages/fossflow-app/src/services/storage/providers/GoogleDriveProvider.ts  (current stub)
  packages/fossflow-app/src/stores/authStore.ts                (getValidToken())
  packages/fossflow-app/src/stores/notificationStore.ts
```

### Drive API mapping
| StorageProvider method | Drive API call |
|---|---|
| `listDiagrams(folderId)` | `GET /drive/v3/files?q=mimeType='application/json' and '{folderId}' in parents` |
| `loadDiagram(id)` | `GET /drive/v3/files/{id}?alt=media` |
| `saveDiagram(id, data)` | `PATCH /upload/drive/v3/files/{id}?uploadType=media` |
| `createDiagram(data, folderId)` | `POST /upload/drive/v3/files?uploadType=multipart` (with metadata) |
| `deleteDiagram(id, soft)` | soft: update `appProperties.deletedAt`. hard: `DELETE /drive/v3/files/{id}` |
| `listFolders(parentId)` | `GET /drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and '{parentId}' in parents` |
| `createFolder(name, parentId)` | `POST /drive/v3/files` (mimeType: vnd.google-apps.folder) |
| `getTreeManifest()` | `GET /drive/v3/files?q=name='fossflow-manifest.json'` then `GET .../alt=media` |
| `saveTreeManifest(m)` | `PATCH /upload/drive/v3/files/{manifestId}` |

**Root folder:** All FossFlow files live under a `FossFlow/` folder in the user's Drive, created on first use.

### Sub-tasks
- [ ] Set up MSW Drive API handlers in `src/mocks/handlers/driveHandlers.ts`
- [ ] Implement `GoogleDriveProvider.ts` — all `StorageProvider` methods using Drive API v3
- [ ] All Drive API calls use `authStore.getValidToken()` — never raw `accessToken`
- [ ] Implement exponential backoff retry (3×: 500ms, 1s, 2s) for transient errors (5xx, timeout)
- [ ] Handle `401`: trigger `authStore` → `SESSION_EXPIRED` state
- [ ] Handle `403 userRateLimitExceeded`: back-off, push warning toast (not error)
- [ ] Implement offline write queue: failed writes buffered to IndexedDB, replayed on reconnect
- [ ] Register `GoogleDriveProvider` with `StorageManager` in `AppStorageContext`
- [ ] Migration flow: when user switches to Drive, offer "Migrate local diagrams?" → progress dialog
- [ ] Write unit tests: `services/storage/__tests__/GoogleDriveProvider.test.ts`

### Unit tests (must write — not E2E)
```
GoogleDriveProvider.test.ts (MSW mocking googleapis.com):
  ✓ listDiagrams() maps Drive file list to DiagramMeta[]
  ✓ loadDiagram() fetches file content and returns parsed JSON
  ✓ saveDiagram() sends PATCH with correct Content-Type
  ✓ createDiagram() creates file in correct folder
  ✓ 401 response → authStore SESSION_EXPIRED state
  ✓ 503 → retries 3× with backoff → success on 3rd attempt
  ✓ 503 × 3 → pushes error notification with "Try again" action
  ✓ offline → queues write to IndexedDB
  ✓ reconnect → replays queued writes in order
```

### Done criteria
- [ ] Drive provider implements full `StorageProvider` interface
- [ ] Retry + backoff working
- [ ] Auth error handling triggers correct auth state
- [ ] Offline queue works
- [ ] Unit tests pass (with MSW)
- [ ] Manual test: create diagram → save to Drive → reload page → diagram loads from Drive
- [ ] `yarn build` clean

---

## Phase 3C — S3 Provider + Backend (E4)
**Status:** `[ ]` | **Token load:** High | **Depends on:** 2A

### Token guardrail
> ⚠️ **Integration tests require MinIO running in Docker.**
> Unit tests use MSW to mock both the backend signed-URL endpoint AND the S3 PUT/GET calls.
> Integration tests use `docker-compose.test.yml` with MinIO.
> Do NOT test against real AWS S3 in CI — use MinIO.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/services/storage/types.ts       (StorageProvider interface)
  packages/fossflow-app/src/services/storage/providers/S3Provider.ts  (current stub)
  packages/fossflow-backend/server.js                        (existing endpoints — add signed URL)
```

### Architecture (must follow exactly)
```
Browser (S3Provider.ts)
  1. POST /api/storage/s3/signed-url  { operation, key }
  ↓
fossflow-backend (server.js)
  Validates: key starts with configured prefix
  Generates: pre-signed URL via @aws-sdk/client-s3
  Returns: { signedUrl, expiresAt }
  ↓ (back to browser)
  2. fetch(signedUrl) — direct to S3/MinIO
```

**Credential flow:** AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_PREFIX, S3_ENDPOINT, S3_REGION) set as env vars on Docker instance. Never in browser.

**Pre-signed URL expiry:** GET: 15 min | PUT: 5 min | DELETE: 2 min

### Backend additions (`server.js`)
```
POST /api/storage/s3/signed-url
  body: { operation: 'GET' | 'PUT' | 'DELETE', key: string }
  validates: key starts with process.env.S3_PREFIX
  generates: pre-signed URL
  returns: { signedUrl: string, expiresAt: string }

GET /api/storage/s3/status
  returns: { configured: boolean, bucket: string, prefix: string }
```

### Sub-tasks
- [ ] `yarn add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` in fossflow-backend
- [ ] Add signed URL endpoint to `server.js` with path traversal validation
- [ ] Add `express-rate-limit` to signed URL endpoint (60 req/min per IP)
- [ ] Implement `S3Provider.ts` — full `StorageProvider` interface via signed URLs
- [ ] S3 "folders" = key prefix segments. `listFolders()` = list common prefixes.
- [ ] Tree manifest stored at `{S3_PREFIX}/fossflow-manifest.json`
- [ ] Create `docker-compose.test.yml` with MinIO service for integration tests
- [ ] Write unit tests: `services/storage/__tests__/S3Provider.test.ts` (MSW)
- [ ] Write integration tests: `services/storage/__tests__/S3Provider.integration.test.ts` (MinIO)
- [ ] Write backend tests: `fossflow-backend/__tests__/s3.test.js` (supertest)

### Unit tests (must write — not E2E)
```
S3Provider.test.ts (MSW mocking backend + S3):
  ✓ listDiagrams() calls backend for list, fetches key prefixes
  ✓ saveDiagram() fetches signed PUT URL then PUTs data
  ✓ loadDiagram() fetches signed GET URL then GETs data
  ✓ expired signed URL (403): re-fetches URL and retries once
  ✓ backend unavailable → error notification, storage stays on local

s3.test.js (supertest against backend):
  ✓ POST /api/storage/s3/signed-url returns signed URL for valid key
  ✓ Key outside S3_PREFIX → 400 Bad Request
  ✓ Key with path traversal (../../etc) → 400 Bad Request
  ✓ Rate limit: 61st request in 1min → 429
  ✓ GET /api/storage/s3/status returns configured: false when env not set

S3Provider.integration.test.ts (requires MinIO):
  ✓ Full CRUD cycle: create → load → save → delete
  ✓ Folder operations: create folder → list → rename → delete
```

### Done criteria
- [ ] S3 provider implements full `StorageProvider` interface
- [ ] Backend signed URL endpoint with path traversal protection
- [ ] Unit tests pass (MSW)
- [ ] Integration tests pass (MinIO)
- [ ] Backend security tests pass (supertest)
- [ ] `yarn build` clean

---

## Phase 4A — External Diagram Registry (E6)
**Status:** `[ ]` | **Token load:** Low | **Depends on:** 3A

### Behavior
Users can add external diagram URLs (draw.io, Lucidchart, Miro) to the file tree as reference entries. Clicking opens in a new tab. draw.io files in Google Drive can be browsed using the existing auth token.

### Session startup checklist
```
Before coding, read these files:
  packages/fossflow-app/src/components/fileExplorer/FileExplorer.tsx  (from Phase 2B)
  packages/fossflow-app/src/services/storage/types.ts                  (extend with ExternalDiagramNode)
```

### Sub-tasks
- [ ] Add `ExternalDiagramNode` type: `{ id, name, sourceType: 'drawio' | 'lucidchart' | 'miro' | 'other', url, thumbnailUrl? }`
- [ ] External nodes stored in tree manifest (not in storage provider)
- [ ] "Add external diagram" in file tree context menu → paste URL dialog
- [ ] For draw.io: if user is signed in with Google, offer Google Picker to browse Drive files
- [ ] External nodes render with a distinct icon (OpenInNew) and no dirty indicator
- [ ] Click opens `url` in `_blank` tab
- [ ] No preview panel — `_blank` navigation only (as specified)

### Done criteria
- [ ] External entries appear in file tree
- [ ] Clicking opens in new tab
- [ ] draw.io files browsable via Google Picker (if signed in)
- [ ] `yarn build` clean

---

## E2E Test Suite — POST-UX PHASE (Out of Scope Now)
🚫 **Do not implement during the above phases.**

When the new UX ships, pick up this section. The Playwright infrastructure already exists at `packages/fossflow-e2e/`. All existing tests continue to run. New test files to add:

```
packages/fossflow-e2e/tests/
├── file-explorer.spec.ts       # Create folder, rename, DnD, delete, trash, search
├── 2d-canvas-mode.spec.ts      # Toggle, visual regression, export in 2D mode
├── material-icons.spec.ts      # Search, drag to canvas
├── diagram-links.spec.ts       # Link node, click in read-only, new tab
├── auth-google.spec.ts         # Mocked GIS: sign in, sign out, session expired
├── storage-drive.spec.ts       # Mocked Drive API: save, load, switch provider
├── storage-s3.spec.ts          # Mocked S3: save, load, switch provider
└── notifications.spec.ts       # Error toasts, undo toasts, persistent banners
```

Playwright mock approach:
- `page.route()` to intercept and mock Google auth endpoints + Drive API
- `page.route()` to mock backend S3 signed URL endpoint
- `storageState` injection for pre-authenticated test scenarios

---

## Dependency Graph (visual reference)

```
0A (App decompose) ──┬──▶ 2A (Storage interface) ──┬──▶ 2B (File Explorer)
                     │                              ├──▶ 2C (Diagram links)
                     │                              └──▶ 3C (S3 provider)
                     │
0B (Notifications) ──┴──▶ 3A (Google Auth) ──────────▶ 3B (Drive provider)
                                                         │
                                          3A ────────────▶ 4A (External diagrams)

1A (2D canvas) ── standalone (can run parallel to 0A/0B)
1B (Material icons) ── standalone (can run parallel to 0A/0B)
```

---

## Token Budget & Guardrails Summary

| Phase | Estimated token load | Guardrail |
|---|---|---|
| 0A | ⚠️ Very High | Split into 3 sessions: extract one provider per session |
| 0B | Medium | Single session |
| 1A | Medium | Single session. Read only Grid.tsx + uiStateStore + isoMath |
| 1B | Low | Single session |
| 2A | High | Session 1: interface + LocalProvider only. Stubs for others. |
| 2B | ⚠️ Very High | 3 sessions: basic tree → CRUD → interactions |
| 2B-R | High | Single session. Read Phase 2B-R session checklist first. |
| 2C | Low | Single session |
| 3A | Medium | Single session |
| 3B | High | Session 1: MSW mocks + unit tests. Session 2: real Drive API wiring |
| 3C | High | Session 1: unit tests (MSW). Session 2: integration (MinIO) |
| 4A | Low | Single session |

**General rules for every session:**
1. Start by reading `PLAN.md` + only the files listed in the phase's **Session startup checklist**
2. Use `TodoWrite` at session start to create sub-task list
3. Mark checkboxes `[x]` in this file as tasks complete
4. Run `yarn build` before ending a session — never leave a broken build
5. If a session runs long: stop at a stable checkpoint (build passes, tests pass), update status in dashboard, end

---

## New Libraries Introduced (total)

| Library | Package | Phase | Install in |
|---|---|---|---|
| `react-arborist` | `react-arborist` | 2B | fossflow-app |
| `@react-oauth/google` | `@react-oauth/google` | 3A | fossflow-app |
| `gapi-script` or raw GIS | `gapi-script` | 3B | fossflow-app |
| `@aws-sdk/client-s3` | `@aws-sdk/client-s3` | 3C | fossflow-backend |
| `@aws-sdk/s3-request-presigner` | `@aws-sdk/s3-request-presigner` | 3C | fossflow-backend |
| `express-rate-limit` | `express-rate-limit` | 3C | fossflow-backend |
| `msw` | `msw@^2` | 2A | fossflow-app (devDep) |
| `helmet` | `helmet` | 3C | fossflow-backend |

---

## Security Checklist (verify before each P2/P3 ship)

- [ ] Access token absent from localStorage (unit test + manual DevTools check)
- [ ] CORS `allowed-origins` env var set (not `*`) on backend
- [ ] S3 key path traversal test passes
- [ ] Drive scope is `drive.file` not `drive` (check OAuth consent screen)
- [ ] S3 bucket policy denies public access
- [ ] Pre-signed URL expiry: GET ≤15min, PUT ≤5min, DELETE ≤2min
- [ ] `helmet` middleware active on backend
- [ ] Rate limiting on `/api/storage/s3/signed-url`
- [ ] No `console.log(token)` or similar in auth code (grep before ship)
