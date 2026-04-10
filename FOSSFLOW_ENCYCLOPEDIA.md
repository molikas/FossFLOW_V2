# FossFLOW Codebase Encyclopedia

**Last Updated**: April 2026
**Original Created**: August 14, 2025 (commit 94bf3c0)
**Major Updates**: New diagram UX with unsaved-changes guard, flat icon elevation fix, connector single-shot from Elements panel, Rectangle rename (was Group), ToolMenu cleanup, ImportIconsDialog, connector anchor reconnect UX, transient right-click pan, node header links, performance improvements, full i18n, and service worker overhaul — plus many prior commits

---

## Overview

FossFLOW is a monorepo containing both a React component library for drawing isometric network diagrams (fossflow-lib), a Progressive Web App that uses this library (fossflow-app), and an optional backend server for persistent storage (fossflow-backend). This encyclopedia provides a comprehensive guide to navigating and understanding the codebase structure, making it easy to locate specific functionality and understand the architecture.

## Table of Contents

1. [Monorepo Structure](#monorepo-structure)
2. [Library Architecture (fossflow-lib)](#library-architecture-fossflow-lib)
3. [Application Architecture (fossflow-app)](#application-architecture-fossflow-app)
4. [Backend Architecture (fossflow-backend)](#backend-architecture-fossflow-backend) **[NEW]**
5. [State Management](#state-management)
6. [Component Organization](#component-organization)
7. [Configuration System](#configuration-system) **[NEW]**
8. [Internationalization (i18n)](#internationalization-i18n) **[NEW]**
9. [Key Technologies](#key-technologies)
10. [Build System](#build-system)
11. [Testing Structure](#testing-structure)
12. [Development Workflow](#development-workflow)

## Monorepo Structure

```
fossflow-monorepo/
├── packages/
│   ├── fossflow-lib/            # React component library
│   │   ├── src/                 # Library source code
│   │   │   ├── Isoflow.tsx     # Main component entry
│   │   │   ├── index.tsx       # Development entry
│   │   │   ├── config/         # Configuration (NEW)
│   │   │   │   ├── hotkeys.ts  # Hotkey profiles
│   │   │   │   ├── panSettings.ts
│   │   │   │   └── zoomSettings.ts
│   │   │   ├── components/     # React components
│   │   │   ├── stores/         # State management (Zustand)
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── types/          # TypeScript types
│   │   │   ├── schemas/        # Zod validation
│   │   │   ├── interaction/    # Interaction handling
│   │   │   ├── i18n/           # Translations (NEW)
│   │   │   │   ├── en-US.ts
│   │   │   │   └── zh-CN.ts
│   │   │   ├── utils/          # Utility functions
│   │   │   ├── assets/         # Static assets
│   │   │   └── styles/         # Styling
│   │   ├── webpack.config.js   # Webpack configuration
│   │   ├── package.json        # Library dependencies
│   │   └── tsconfig.json       # TypeScript config
│   │
│   ├── fossflow-app/            # Progressive Web App
│   │   ├── src/                 # App source code
│   │   │   ├── index.tsx       # App entry point
│   │   │   ├── App.tsx         # Main app component
│   │   │   ├── components/     # App-specific components
│   │   │   ├── services/       # Services (storage)
│   │   │   ├── i18n.ts         # i18n configuration (NEW)
│   │   │   ├── serviceWorkerRegistration.ts
│   │   │   └── setupTests.ts
│   │   ├── public/             # Static assets
│   │   │   └── locales/        # i18n translation files (NEW)
│   │   ├── rsbuild.config.ts   # RSBuild configuration
│   │   ├── package.json        # App dependencies
│   │   └── tsconfig.json       # TypeScript config
│   │
│   └── fossflow-backend/        # Backend server (NEW - Added ~Aug 2025)
│       ├── server.js           # Express server
│       ├── package.json        # Backend dependencies
│       └── .env.example        # Environment config template
│
├── package.json                 # Root workspace configuration
├── Dockerfile                   # Multi-stage Docker build
├── compose.yml                  # Docker Compose config
├── README.md                    # Project documentation
├── CONTRIBUTORS.md              # Contributing guidelines
└── FOSSFLOW_TODO.md            # Issues and roadmap
```

## Library Architecture (fossflow-lib)

### Entry Points

- **`packages/fossflow-lib/src/index.tsx`**: Development mode entry with examples
- **`packages/fossflow-lib/src/Isoflow.tsx`**: Main component exported for library usage
- **`packages/fossflow-lib/src/index-docker.tsx`**: Docker-specific entry point

### Provider Hierarchy

```typescript
<ThemeProvider>
  <LocaleProvider>         // i18n support
    <ModelProvider>        // Core data model
      <SceneProvider>      // Visual state
        <UiStateProvider>  // UI interaction state
          <ClipboardProvider>  // Instance-scoped clipboard (2026-04-07)
            <App>
              <Renderer />   // Canvas rendering
              <UiOverlay />  // UI controls
            </App>
          </ClipboardProvider>
        </UiStateProvider>
      </SceneProvider>
    </ModelProvider>
  </LocaleProvider>
</ThemeProvider>
```

### Data Flow

1. **Model Data** → Items, Views, Icons, Colors
2. **Scene Data** → Connector paths, Connector labels, Text box sizes
3. **UI State** → Zoom, Pan, Selection, Mode, Hotkey profile, Pan settings

## Backend Architecture (fossflow-backend)

**Added**: August 2025 (commit bf3a30f)
**Purpose**: Optional Express.js server for persistent diagram storage

### Overview

The backend package provides server-side storage capabilities, allowing diagrams to persist across browser sessions and devices. It's particularly useful in Docker deployments.

**Location**: `/packages/fossflow-backend/`

### Key Files

#### Server (`server.js`)
- **Technology**: Express.js with ES modules
- **Port**: 3001 (configurable via `BACKEND_PORT`)
- **Features**:
  - CORS enabled for cross-origin requests
  - 10MB JSON payload limit for large diagrams
  - Filesystem-based storage
  - Optional Git backup support

### API Endpoints

#### Storage Status
```
GET /api/storage/status
Response: { enabled: boolean, gitBackup: boolean, version: string }
```

#### List Diagrams
```
GET /api/diagrams
Response: Array<{ id, name, lastModified, size }>
```

#### Get Diagram
```
GET /api/diagrams/:id
Response: Diagram JSON data
```

#### Save Diagram
```
POST /api/diagrams/:id
Body: Diagram JSON data
Response: { success: boolean, message: string }
```

#### Delete Diagram
```
DELETE /api/diagrams/:id
Response: { success: boolean }
```

### Configuration

**Environment Variables** (`.env`):
- `ENABLE_SERVER_STORAGE`: Enable/disable storage endpoints (default: `true`)
- `STORAGE_PATH`: Directory for diagram files (default: `/data/diagrams`)
- `BACKEND_PORT`: Server port (default: `3001`)
- `ENABLE_GIT_BACKUP`: Enable Git version control (default: `false`)

### Storage Format

- **Directory**: `/data/diagrams/` (or `STORAGE_PATH`)
- **File Format**: `{diagram-id}.json`
- **Structure**: Full diagram data including icons, nodes, connectors

### Integration with App

**App Service** (`packages/fossflow-app/src/services/storageService.ts`):
- Detects server availability on startup
- Provides unified interface for server/local storage
- Handles timeouts and error states

## State Management

### 1. ModelStore (`src/stores/modelStore.tsx`)

**Purpose**: Core business data

**Key Data**:
- `items`: Diagram elements (nodes)
- `views`: Different diagram perspectives
- `icons`: Available icon library
- `colors`: Color palette

**New Features** (since Aug 2025):
- Undo/redo history tracking
- Transaction system for atomic operations
- Orphaned connector cleanup

**Location**: `/packages/fossflow-lib/src/stores/modelStore.tsx`
**Types**: `/packages/fossflow-lib/src/types/model.ts`

### 2. SceneStore (`src/stores/sceneStore.tsx`)

**Purpose**: Visual/rendering state

**Key Data**:
- `connectors`: Path and position data
- `connectorLabels`: New flexible label system (Added: commit d5e02ea)
- `textBoxes`: Size information

**New Features** (since Aug 2025):
- Multiple labels per connector (up to 256)
- Undo/redo history tracking
- Label migration from legacy format

**Location**: `/packages/fossflow-lib/src/stores/sceneStore.tsx`
**Types**: `/packages/fossflow-lib/src/types/scene.ts`

### 3. UiStateStore (`src/stores/uiStateStore.tsx`)

**Purpose**: User interface state

**Key Data**:
- `zoom`: Current zoom level
- `scroll`: Viewport position
- `mode`: Interaction mode
- `editorMode`: Edit/readonly state
- `hotkeyProfile`: Selected hotkey scheme (NEW)
- `panSettings`: Pan control configuration (NEW)
- `connectorInteractionMode`: 'click' or 'drag'
- `isDirty`: boolean — set by `useDirtyTracker` on any model change after load; cleared by `markClean()` after export or new-diagram flow
- `activeLeftTab`: `'ELEMENTS' | 'LAYERS' | null` — which left-dock tab is open
- `rightSidebarOpen`: boolean — whether the right Properties panel is visible

**New Features** (since Aug 2025):
- Configurable hotkey profiles (qwerty, smnrct, none)
- Advanced pan control settings
- `isDirty` flag + `useDirtyTracker` hook for unsaved-changes detection
- Connector creation mode toggle
- i18n locale state
- Settings persistence (2026-04-07): `hotkeyProfile`, `panSettings`, `zoomSettings`, `labelSettings`, `connectorInteractionMode`, `expandLabels` are loaded from `localStorage` on init via `loadPersistedSettings()`. `Isoflow.tsx` saves them back on change via `savePersistedSettings()`.

**Settings types**: Canonical home is `types/settings.ts` — `HotkeyProfile`, `PanSettings`, `ZoomSettings`, `LabelSettings`. Config files (`config/hotkeys.ts` etc.) re-export from `types/settings.ts` for backwards compatibility.

**Location**: `/packages/fossflow-lib/src/stores/uiStateStore.tsx`
**Types**: `/packages/fossflow-lib/src/types/ui.ts`, `/packages/fossflow-lib/src/types/settings.ts`

## Application Architecture (fossflow-app)

### Overview

The FossFLOW application is a Progressive Web App (PWA) built with RSBuild that provides a complete diagram editor interface using the fossflow-lib library.

### Key Components

#### App Entry (`packages/fossflow-app/src/index.tsx`)
- Initializes the React app
- Registers service worker for PWA functionality
- Sets up Quill editor styles
- Initializes i18n (NEW)

#### Main App (`packages/fossflow-app/src/App.tsx`)
- Contains the Isoflow component from fossflow-lib
- Manages auto-save functionality
- Handles import/export operations
- Provides UI for session management
- Server storage integration (NEW)
- i18n language switching (NEW)

**Major Updates** (since Aug 2025):
- Server storage detection and UI (commit bf3a30f)
- Language switcher component (commit 5d6cf0e)
- Enhanced diagram loading with icon persistence (commit 4e13033)

#### Service Worker
- **Location**: `packages/fossflow-app/public/service-worker.js`
- Replaced the legacy CRA cache-first service worker with a **self-unregistering** version: on `activate` it unregisters itself and clears all caches, then lets the browser fetch fresh resources normally
- This eliminates the stale-build serving loop that caused the app to load outdated JS after a rebuild
- FossFLOW is not a PWA and does not need offline caching; the registration call in `index.tsx` always unregisters (2026-03)

### App Features

- **Auto-Save**: Saves diagram to session storage every 5 seconds
- **Import/Export**: JSON file format for diagram sharing
- **Session Storage**: Quick save without file dialogs
- **Server Storage**: Persistent backend storage (NEW)
- **Multi-language**: English and Chinese support (NEW)

## Component Organization

### Core Components (Library)

#### Renderer (`packages/fossflow-lib/src/components/Renderer/`)
- **Purpose**: Main canvas rendering
- **Key Files**:
  - `Renderer.tsx`: Container component
- **Renders**: All visual layers including new connector labels

#### UiOverlay (`src/components/UiOverlay/`)
- **Purpose**: UI controls overlay
- **Key Files**:
  - `UiOverlay.tsx`: Control panel container
- **New**: Renders tooltip components (hint tooltips for various tools)

#### SceneLayer (`src/components/SceneLayer/`)
- **Purpose**: Transformable layer wrapper
- **Uses**: GSAP for animations
- **Key Files**:
  - `SceneLayer.tsx`: Transform container

### Scene Layers (`packages/fossflow-lib/src/components/SceneLayers/`)

#### Nodes (`/Nodes/`)
- **Purpose**: Render diagram nodes/icons
- **Key Files**:
  - `Node.tsx`: Individual node component
  - `Nodes.tsx`: Node collection renderer
- **Icon Types**:
  - `IsometricIcon.tsx`: 3D-style icons
  - `NonIsometricIcon.tsx`: Flat icons — must use `top: 0` (not `top: -halfH`). The isometric CSS matrix is applied with `transformOrigin: top left`; a negative top offset shifts the icon before the matrix rotates it, causing ~41 px elevation. Fix: always anchor at `top: 0`. (2026-04-10)
- **Updates**:
  - Support for custom imported icons with scaling (commit dd80e86)
  - Header link: when `modelItem.headerLink` is set the node name renders as a clickable `<a>` tag that opens the URL in a new tab (2026-03)
  - Description empty-state: HTML-strip check replaces fragile `MARKDOWN_EMPTY_VALUE` exact-string comparison — all Quill empty variants correctly collapse the label (2026-03)

#### Connectors (`/Connectors/`)
- **Purpose**: Lines between nodes
- **Key Files**:
  - `Connector.tsx`: Individual connector
  - `Connectors.tsx`: Connector collection
- **Major Updates** (commits d5e02ea, 607389a):
  - Multiple line types (solid, dashed, dotted)
  - Bidirectional arrows
  - Click/drag creation modes
- **Updated (2026-04)**: Anchor circle rendering removed from `Connector.tsx` — circles are now exclusively handled by `ConnectorAnchorOverlay` (HTML layer above nodes).

#### ConnectorAnchorOverlay (`/ConnectorAnchorOverlay/`) **[NEW 2026-04]**
**Purpose**: Renders draggable anchor handles for the selected connector above all canvas layers, including node icons.

**Key File**: `ConnectorAnchorOverlay.tsx`

**Design**:
- Glass-morphism circles: `rgba(255,255,255,0.82)` background, `backdrop-filter: blur(4px)`, soft border and shadow
- Accent color `#a5b8f3` (matches app palette)
- Source endpoint: filled dot; Target endpoint: hollow ring; Waypoints: small square
- Active reconnect state: CSS keyframe pulse animation (`fossflow-anchor-pulse`)

**Positioning**:
- Node-attached endpoints: positioned at the last path tile before entering the node icon (`connectorPathTileToGlobal`), not at the node center — so handles are always visible above the icon
- Free-floating and waypoint anchors: positioned with `getAnchorTile` + `getTilePosition`

**Layer order**: Rendered in a `SceneLayer` immediately after the Nodes layer in `Renderer.tsx`, ensuring handles are always visible above icons.

#### ConnectorLabels (`/ConnectorLabels/`) **[NEW]**
**Added**: August 2025 (commit d5e02ea)
**Purpose**: Multiple labels along connector paths

**Key Files**:
- `ConnectorLabel.tsx`: Individual label component
- `ConnectorLabels.tsx`: Label collection renderer

**Features**:
- Up to 256 labels per connector
- Position anywhere along path (0-100%)
- Support for line 1 and line 2 in double connectors
- Backward compatible with legacy label format
- Expandable labels (commit 3cbcada)

**Related Utilities**:
- `/src/utils/connectorLabels.ts`: Label migration and positioning logic

#### Rectangles (`/Rectangles/`)
- **Purpose**: Background shapes/regions
- **Key Files**:
  - `Rectangle.tsx`: Individual rectangle
  - `Rectangles.tsx`: Rectangle collection
- **Updates**: Fixed lasso priority issue (commit 1282320)

#### TextBoxes (`/TextBoxes/`)
- **Purpose**: Text annotations
- **Key Files**:
  - `TextBox.tsx`: Individual text box
  - `TextBoxes.tsx`: Text box collection

### Selection Tools **[NEW]**

#### Lasso (`/Lasso/`)
**Added**: August 2025 (commit fec8878)
**Purpose**: Rectangle-based multi-selection

**Key Files**:
- `Lasso.tsx`: Rectangle lasso component

**Features**:
- Drag to create selection rectangle
- Select multiple nodes/items
- Visual feedback with dashed border

#### FreehandLasso (`/FreehandLasso/`)
**Added**: August 2025 (commit 96047f3)
**Purpose**: Freeform multi-selection

**Key Files**:
- `FreehandLasso.tsx`: Freehand lasso component

**Features**:
- Draw arbitrary selection shape
- Path-based item selection
- Real-time visual feedback

**Interaction Modes**:
- `/src/interaction/modes/Lasso.ts`: Rectangle lasso mode
- `/src/interaction/modes/FreehandLasso.ts`: Freehand lasso mode

### UI Components (Library)

#### MainMenu (`packages/fossflow-lib/src/components/MainMenu/`)
- **Purpose**: Application menu
- **Features**: New diagram (with unsaved-changes guard), Open, Export JSON, Export Compact JSON, Export Image, Clear canvas, Settings, GitHub
- **New diagram UX**: Reads `uiStateStore.isDirty`. If dirty, shows `ConfirmDiscardDialog` (Save & continue / Discard / Cancel). "Save & continue" calls `saveModelLocally()` (localStorage, falls back to JSON download) then executes the action.
- **Updates**: i18n support; `ACTION.NEW` added to `MainMenuOptionsEnum` and `MAIN_MENU_OPTIONS` config

#### ToolMenu (`packages/fossflow-lib/src/components/ToolMenu/`)
- **Purpose**: Drawing tools palette
- **Tools**: Undo, Redo, Select, Lasso, Freehand Lasso, Pan, Connector
- **Note**: Rectangle and Text were removed from ToolMenu (2026-04-10) — both are accessible from the Elements panel (LeftDock). This reduces toolbar clutter and keeps element creation tools in one place.
- **Updates**:
  - Hotkey indicators
  - All tool names use i18n `t()` from `toolMenu` namespace — no hardcoded English strings

#### LeftDock (`packages/fossflow-lib/src/components/LeftDock/`)

**Architecture:** A 40 px icon strip always visible on the left edge, plus a 240 px sliding panel that animates in/out. `position:absolute`, full-height, `zIndex:10` — never resizes the canvas. `activeLeftTab: 'ELEMENTS' | 'LAYERS' | null` in `uiStateStore` controls which panel is open. Clicking an active tab closes the panel.

**Tabs:**
- **Elements** (`WidgetsOutlined` icon) → `ElementsPanel`
- **Layers** (`LayersOutlined` icon) → `LayersPanel`

**ElementsPanel** (`ElementsPanel.tsx`):
- Icon search grid: drag an icon to begin `PLACE_ICON` mode; a ghost icon (`DragAndDrop`) tracks the cursor across the isometric grid
- **Rectangle card**: mousedown → `RECTANGLE.DRAW` mode
- **Connector card**: mousedown → `CONNECTOR` mode with `returnToCursor: true` (single-shot — returns to cursor after one connection; contrast with the toolbar button which stays persistent)
- **Import Icons button**: file input → `setPendingFiles` → opens `ImportIconsDialog`

**ImportIconsDialog** (`ImportIconsDialog.tsx`): Per-import confirm dialog showing file count and an isometric toggle (default: flat). Props: `open`, `fileCount`, `onConfirm(isIsometric: boolean)`, `onCancel`. Replaced the persistent "Treat as isometric" checkbox (removed 2026-04-10).

**CommonElements** (`CommonElements.tsx`): shared Rectangle and Connector card components used by `ElementsPanel`.

**DragAndDrop** (`components/DragAndDrop/DragAndDrop.tsx`): Ghost icon rendered by `UiOverlay` during `PLACE_ICON` mode. Positioned at `getTilePosition(BOTTOM).y - halfH` — mirrors `Node.tsx` exactly so the ghost lands at the correct tile center.

#### LayersPanel (`packages/fossflow-lib/src/components/LayersPanel/`)

**Purpose:** Manage named layers for the current view. Layers control visibility and lock state for all canvas element types.

**Layer data model** (`schemas/layer.ts`):
```typescript
Layer = { id: string; name: string; visible: boolean; locked: boolean; order: number }
```
Stored as `view.layers: Layer[]` — per-view, not global. All canvas entities (`ViewItem`, `Connector`, `Rectangle`, `TextBox`) carry an optional `layerId`.

**Features:**
- **Add / delete layers** — `+` button creates `Layer N`; delete button on selected layer
- **Inline rename** — click layer name to edit in-place
- **Visibility toggle** — eye icon; hidden-layer entities are excluded from rendering
- **Lock toggle** — lock icon; locked-layer entities cannot be interacted with
- **Drag to reorder** — drag handle reorders layer stack (order = render z-order)
- **Expandable item list** — per-layer list of assigned items (nodes, connectors, rectangles, text boxes); clicking an item selects it on canvas
- **Bidirectional canvas↔panel selection sync** — clicking a canvas item highlights its row in the panel; clicking a panel row selects it on canvas
- **Drag item to layer** — drag an item row onto a layer row to reassign it; unassigned items are always visible and interactive
- **Unassigned section** — items with no `layerId` shown at the bottom

**Hooks:**
- `useLayerContext` — reads `LayerContextValue` (visibleIds, lockedIds, layers, itemCountByLayerId, unassignedCount, itemsByLayerId) from `LayerContext`
- `useLayerActions` — dispatches `CREATE_LAYER`, `UPDATE_LAYER`, `DELETE_LAYER`, `REORDER_LAYERS`, `ASSIGN_LAYER_TO_ITEMS`, `REORDER_VIEWITEM` via the view reducer

**`LayerContextProvider`** (`hooks/useLayerContext.ts`): React context provider (not Zustand). Wraps the full editor tree. Derives `LayerContextValue` from `modelStore.views` + `uiState.view` via `useMemo` — recomputed on view or model change. Thin read-only derived state; mutations go through `useLayerActions`.

#### RightSidebar (`packages/fossflow-lib/src/components/Sidebars/RightSidebar.tsx`)

**Purpose:** Properties panel for the selected canvas element. `position:absolute`, right edge, 300 px wide. Slides via `transform: translateX(100%)` when closed — does not affect canvas layout.

**Open/close:** `uiState.rightSidebarOpen` (boolean), toggled by a button rendered in `UiOverlay`'s sidebar portal.

**Content:**
- Item selected (`itemControls !== null`): renders `<ItemControlsManager>` — full-height scrollable; shows NodePanel (Details/Style/Notes), ConnectorControls, RectangleControls, or TextBoxControls depending on selection type
- Nothing selected: empty-state with `TuneOutlined` icon and hint text

**Note:** `LeftSidebar` (`components/Sidebars/LeftSidebar.tsx`) is a legacy wrapper that renders only `<LayersPanel>`. Superseded by `LeftDock` and no longer used in the main render path.

#### ItemControls (`packages/fossflow-lib/src/components/ItemControls/`)
- **Purpose**: Property panels for selected items
- **Subdirectories**:
  - `/NodeControls/`: Node properties
    - `QuickIconSelector.tsx`: Quick icon picker (NEW - commit 8576e30)
    - `NodeSettings.tsx`: Name field now has an **Insert Link** button (`InsertLinkIcon`) that reveals a URL input. The URL is stored as `modelItem.headerLink` and rendered as a clickable `<a>` on the canvas. Clearing the link removes it from the model. (2026-03)
  - `/ConnectorControls/`: Connector properties
    - Enhanced with multiple labels support (commit d5e02ea)
    - Line type selection (solid, dashed, dotted)
    - Arrow direction controls
    - **Updated (2026-04)**: "Detach source" and "Detach target" buttons removed — endpoint reconnection is now handled by clicking and dragging anchor handles on the canvas (`RECONNECT_ANCHOR` mode).
  - `/RectangleControls/`: Rectangle properties
  - `/TextBoxControls/`: Text properties
  - `/IconSelectionControls/`: Icon picker
    - Improved layout for small screens (commit 77231c9)
    - Icon scaling slider (commit 108b5e2)

#### Settings Components **[NEW]**

**HotkeySettings** (`/HotkeySettings/`)
**Added**: August 2025 (commit ef258df)
**Purpose**: Configure keyboard shortcuts

**Features**:
- Three profiles: QWERTY, SMNRCT, None
- Visual hotkey mapping display
- Per-tool hotkey customization

**ConnectorSettings** (`/ConnectorSettings/`)
**Added**: August 2025 (commit 5ff21cc)
**Purpose**: Configure connector creation mode

**Features**:
- Toggle between click and drag modes
- Mode descriptions and usage hints

**PanSettings** (`/PanSettings/`)
**Added**: August 2025 (commit 83c9b3a)
**Purpose**: Configure pan controls

**Features**:
- Mouse pan options (middle-click, right-click, Ctrl, Alt, empty area)
- Keyboard pan options (arrows, WASD, IJKL)
- Pan speed adjustment

#### Tooltip Components **[NEW]**

**Added**: August-September 2025 (commits 9d9a0dd, a2a47b4, 5df41f9)

**ConnectorHintTooltip** (`/ConnectorHintTooltip/`)
- Shows when connector tool is active
- Explains click vs drag creation modes

**ConnectorRerouteTooltip** (`/ConnectorRerouteTooltip/`)
- Shows how to reroute existing connectors
- Explains drag waypoint interaction

**ConnectorEmptySpaceTooltip** (`/ConnectorEmptySpaceTooltip/`)
- Appears when creating connector in empty space
- Guides user on connector placement

**LassoHintTooltip** (`/LassoHintTooltip/`)
- Shows when lasso tool is active
- Explains lasso selection modes
- i18n support (commit 5df41f9)

**ImportHintTooltip** (`/ImportHintTooltip/`)
- Replaced import toolbar
- Guides users on icon import

#### TransformControlsManager (`packages/fossflow-lib/src/components/TransformControlsManager/`)
- **Purpose**: Selection and manipulation handles
- **Key Files**:
  - `TransformAnchor.tsx`: Resize handles
  - `NodeTransformControls.tsx`: Node-specific controls

#### ErrorBoundary (`/ErrorBoundary/`) **[NEW]**
**Added**: August 2025 (commit 179b512)
**Purpose**: Graceful error handling

**Features**:
- Catches React component errors
- Displays user-friendly error UI
- Prevents full app crashes

### Other Components

- **Grid** (`/Grid/`): Isometric grid overlay
- **Cursor** (`/Cursor/`): Custom cursor display
- **ContextMenu** (`/ContextMenu/`): Right-click menus
- **ZoomControls** (`/ZoomControls/`): Zoom in/out buttons
  - Updated: Zoom-to-pan conversion (commit d3fdfea)
- **ColorSelector** (`/ColorSelector/`): Color picker UI
- **ExportImageDialog** (`/ExportImageDialog/`): Export to PNG dialog
  - Updates: Window-based sizing (commit c664cfc)
  - Performance improvements (commits e1b0a50, c626261)

## Configuration System

**Added**: August 2025 (commits ef258df, 83c9b3a)
**Refactored**: April 2026 — settings types extracted to `types/settings.ts`; `config/persistedSettings.ts` added for localStorage persistence.

### Overview

The configuration system provides type-safe, centralized settings for hotkeys, pan controls, and zoom behavior. Settings types are now declared in `types/settings.ts` and re-exported from the config files for backwards compatibility.

**Location**: `/packages/fossflow-lib/src/config/`

### Settings Types (`types/settings.ts`) **[NEW 2026-04]**

Canonical home for all settings type declarations. Config files re-export from here.

```typescript
export type HotkeyProfile = 'qwerty' | 'smnrct' | 'none';
export interface PanSettings { middleClickPan: boolean; rightClickPan: boolean; ... }
export interface ZoomSettings { zoomToCursor: boolean; }
export interface LabelSettings { expandButtonPadding: number; }
```

### Settings Persistence (`config/persistedSettings.ts`) **[NEW 2026-04]**

Thin localStorage wrapper. `loadPersistedSettings()` is called at `UiStateProvider` init. `savePersistedSettings()` is called from `Isoflow.tsx` whenever persistable fields change. Errors are silently swallowed — safe for SSR and private-mode browsing.

Key: `'fossflow_user_settings'`. Persists: `hotkeyProfile`, `panSettings`, `zoomSettings`, `labelSettings`, `connectorInteractionMode`, `expandLabels`.

### Hotkey Configuration (`hotkeys.ts`)

**Purpose**: Define keyboard shortcuts for tools — re-exports `HotkeyProfile` from `types/settings`

**Types**:
```typescript
type HotkeyProfile = 'qwerty' | 'smnrct' | 'none';
```

**Profiles**:
1. **QWERTY** (Q-W-E-R-T-Y layout):
   - Q: Select, W: Pan, E: Add Item, R: Rectangle, T: Connector, Y: Text, L: Lasso, F: Freehand

2. **SMNRCT** (Default - S-M-N-R-C-T layout):
   - S: Select, M: Pan, N: Add Item, R: Rectangle, C: Connector, T: Text, L: Lasso, F: Freehand

3. **None**: All hotkeys disabled

**Usage**:
- Configurable via Settings → Hotkeys
- Visual indicators in ToolMenu
- Stored in UI state

### Pan Settings (`panSettings.ts`)

**Purpose**: Configure pan/scroll controls

**Settings**:
- **Mouse Options**:
  - `middleClickPan`: Middle mouse button (default: true)
  - `rightClickPan`: Right mouse button
  - `ctrlClickPan`: Ctrl+Click
  - `altClickPan`: Alt+Click
  - `emptyAreaClickPan`: Click empty canvas area (default: true)

- **Keyboard Options**:
  - `arrowKeysPan`: Arrow keys (default: true)
  - `wasdPan`: WASD keys
  - `ijklPan`: IJKL keys
  - `keyboardPanSpeed`: Pan distance (default: 20px)

### Zoom Settings (`zoomSettings.ts`)

**Purpose**: Zoom behavior configuration

**Settings**:
- Minimum/maximum zoom levels
- Zoom step increments
- Zoom-to-pan conversion (added commit d3fdfea)

## Internationalization (i18n)

**Added**: August 2025 (commits 2145981, 5d6cf0e, a2a47b4)

### Overview

FossFLOW supports multiple languages using react-i18next with automatic language detection.

### Library i18n (`packages/fossflow-lib/src/i18n/`)

**Supported Languages**:
- `en-US.ts`: English (default)
- `zh-CN.ts`: Simplified Chinese (added commit 556ef4a)

**Translation Structure**:
```typescript
{
  tools: { select: "Select", pan: "Pan", ... },
  contextMenu: { addNode: "Add Node", ... },
  settings: { hotkeys: "Hotkeys", ... },
  tooltips: { connector: "Click mode: ...", ... }
}
```

**Components**:
- `/src/stores/localeStore.tsx`: Locale state management
- `/src/components/ChangeLanguage/`: Language switcher (app-level)

### App i18n (`packages/fossflow-app/src/`)

**Configuration**: `i18n.ts`
- Automatic language detection
- Fallback to English
- Browser language preference detection

**Translation Files**: `public/locales/{lang}/app.json`
- App-specific translations (menus, dialogs, alerts)
- Storage-related messages

**Features** (commit 4d12c01):
- Remaining app text fully translated
- Translation enabled for all dialogs
- Chinese README added

## Key Technologies

### Core Framework
- **React** (^18.2.0): UI framework
- **TypeScript** (^5.3.3): Type safety
- **Zustand** (^4.3.3): State management
- **Immer** (^10.0.2): Immutable updates

### UI Libraries
- **Material-UI** (@mui/material ^5.11.10): Component library
- **Emotion** (@emotion/react): CSS-in-JS styling

### Graphics & Animation
- **Paper.js** (^0.12.17): Vector graphics
- **GSAP** (^3.11.4): Animations
- **Pathfinding** (^0.4.18): Connector routing

### Internationalization **[NEW]**
- **react-i18next** (^13.0.0): Translation framework
- **i18next** (^23.0.0): i18n core
- **i18next-browser-languagedetector**: Auto-detect user language

### Image Export
- **dom-to-image-more** (^3.7.1): Canvas to image (upgraded commit 650045d)

### Validation & Forms
- **Zod** (3.22.2): Schema validation
- **React Hook Form** (^7.43.2): Form handling

### Build Tools
- **Webpack** (^5.76.2): Module bundler (library)
- **RSBuild**: Modern bundler (app)
- **Jest** (^29.5.0): Testing framework

### Backend **[NEW]**
- **Express** (^4.18.2): Web server
- **CORS** (^2.8.5): Cross-origin support
- **dotenv** (^16.0.3): Environment configuration
- **UUID** (^9.0.0): ID generation

## Build System

### Monorepo Build Architecture

The project uses NPM workspaces to manage three packages:
- **fossflow-lib**: Built with Webpack (CommonJS2 format)
- **fossflow-app**: Built with RSBuild (modern bundler)
- **fossflow-backend**: Node.js ES modules (no build step)

### Build Configurations

#### Library (Webpack)
- **Config**: `/packages/fossflow-lib/webpack.config.js`
- **Output**: CommonJS2 module for npm publishing
- **Externals**: React, React-DOM

#### Application (RSBuild)
- **Config**: `/packages/fossflow-app/rsbuild.config.ts`
- **Features**: Hot reload, PWA support, optimized production builds
- **Output**: Static files in `build/` directory

#### Backend (Node.js)
- **No build step**: Runs directly with Node.js
- **ES Modules**: Uses `"type": "module"` in package.json

### NPM Scripts (Root Level)

```bash
# Development
npm run dev          # Start app development server
npm run dev:lib      # Watch mode for library development
npm run dev:backend  # Start backend server (NEW)

# Building
npm run build        # Build both library and app
npm run build:lib    # Build library only
npm run build:app    # Build app only

# Testing & Quality
npm test             # Run tests in all workspaces
npm run lint         # Lint all workspaces

# Publishing
npm run publish:lib  # Build and publish library to npm

# Docker
npm run docker:build # Build Docker image locally
npm run docker:run   # Run with Docker Compose

# Clean
npm run clean        # Clean all build artifacts
```

### Docker Build

```dockerfile
# Multi-stage build
FROM node:22 AS build
WORKDIR /app
# Install dependencies for monorepo
RUN npm install
# Build library first, then app
RUN npm run build:lib && npm run build:app

# Production stage with backend
FROM node:22-alpine
# Install backend dependencies
COPY packages/fossflow-backend /app/backend
# Copy built frontend
COPY --from=build /app/packages/fossflow-app/build /app/frontend
# Start backend server serving frontend
```

**Updates** (commit bf3a30f):
- Added backend server to Docker image
- Environment variable configuration
- Persistent volume mounting for diagrams

## Testing Structure

### Test Files Location
- Library tests: `packages/fossflow-lib/src/**/__tests__/`
- App tests: `packages/fossflow-app/src/**/*.test.tsx`
- Test utilities: `packages/fossflow-lib/src/fixtures/`

### Key Test Areas
- `/packages/fossflow-lib/src/schemas/__tests__/`: Schema validation (completed ✅)
- `/packages/fossflow-lib/src/stores/reducers/__tests__/`: State logic
  - Connector reducer tests (commit 70b1f56)
- `/packages/fossflow-lib/src/utils/__tests__/`: Utility functions

### CI/CD Testing
**Updates** (commits 70b1f56, 2bd1318):
- GitHub Actions workflow with build step
- Test coverage reporting
- Artifact retention policies

## Development Workflow

### Monorepo Development Setup

1. **Clone and Install**:
```bash
git clone https://github.com/stan-smith/FossFLOW
cd FossFLOW
npm install  # Installs dependencies for all workspaces
```

2. **Development Mode**:
```bash
# First build the library (required for initial setup)
npm run build:lib

# Start app development (includes library in dev mode)
npm run dev

# Optional: Start backend server in separate terminal
npm run dev:backend
```

3. **Making Library Changes**:
- Edit files in `packages/fossflow-lib/src/`
- Changes are immediately available in the app
- No need to rebuild or republish during development

4. **Making App Changes**:
- Edit files in `packages/fossflow-app/src/`
- Hot reload updates the browser automatically

5. **Making Backend Changes** (NEW):
- Edit `packages/fossflow-backend/server.js`
- Restart server or use nodemon for auto-reload

### Key Development Files

#### 1. Configuration (`packages/fossflow-lib/src/config.ts`)

**Key Constants**:
- `TILE_SIZE`: Base tile dimensions
- `INITIAL_UI_STATE.zoom`: Initial zoom level — **0.9** (90%) as of 2026-03; previously 1.0
- `DEFAULT_FONT_SIZE`: Text defaults
- `INITIAL_DATA`: Default model state

#### 2. Hooks Directory (`packages/fossflow-lib/src/hooks/`)

**Common Hooks**:
- `useScene.ts`: Thin 13-line combiner — merges `useSceneData` + `useSceneActions` into one unified API. Callers unchanged. **(Split 2026-04)**
- `useSceneData.ts`: Pure read selectors — `currentView`, `items`, `colors`, `connectors`, `hitConnectors`, `rectangles`, `textBoxes`. No write operations. **(NEW 2026-04)**
- `useSceneActions.ts`: All write operations + `transaction()` machinery + `computePathsAsync` + `pasteItems`. `getState()` is transaction-aware — returns `pendingStateRef` inside a transaction so chained actions see each other's intermediate writes. **(NEW 2026-04)**
- `useModelItem.ts`: Individual item access (returns `ModelItem | null`)
- `useViewItem.ts`: View item access (returns `ViewItem | null`)
- `useConnector.ts`: Connector management (returns `Connector | null`)
- `useRectangle.ts`: Rectangle access (returns `Rectangle | null`)
- `useTextBox.ts`: Text box access (returns `TextBox | null`)
- `useIcon.tsx`: Icon access (returns `Icon | null`)
- `useColor.ts`: Color access (returns `Color | null`)
- `useIsoProjection.ts`: Coordinate conversion
- `useDiagramUtils.ts`: Diagram operations
- `useHistory.ts`: Undo/redo transaction system

**Important**: All item access hooks return `null` instead of throwing when items don't exist, preventing React unmount errors.

#### 3. Interaction System (`packages/fossflow-lib/src/interaction/`)

**Main File**: `useInteractionManager.ts`

**Interaction Modes** (`/modes/`):
- `Cursor.ts`: Selection mode
  - Updated (2026-04): Detects endpoint anchor clicks on selected connectors and enters `RECONNECT_ANCHOR` mode. Shows `grab` cursor on hover over any anchor of a selected connector. Uses `getAnchorHitTile` helper which resolves the junction path tile (not the node center) for node-attached endpoints.
- `Pan.ts`: Canvas panning
- `PlaceIcon.ts`: Icon placement
  - Updated: Nearest unoccupied tile placement (commit f5ebad6)
- `Connector.ts`: Drawing connections
  - Major update: Click/drag modes (commits d78ccdb, ea0bce0, 5ff21cc)
  - Updated (2026-04): Respects `returnToCursor` flag — when set, finalizing a connector returns to `CURSOR` mode instead of staying in `CONNECTOR` mode (used by NodeActionBar "Start connector" button).
- `DragItems.ts`: Moving elements
- `ReconnectAnchor.ts`: Connector anchor repositioning **[NEW 2026-04]**
  - Entered when user clicks an endpoint/waypoint anchor of a selected connector.
  - `entry`/`exit`: sets `crosshair`/`default` cursor.
  - `mousemove`: live preview — re-routes the dragged anchor to the current tile, snapping to `ref.item` when hovering a node, `ref.tile` otherwise.
  - `mouseup`: finalizes; returns to `CURSOR` mode keeping the connector selected.
- `Rectangle/`: Rectangle tools
- `TextBox.ts`: Text editing
- `Lasso.ts`: Rectangle lasso selection **[NEW]**
- `FreehandLasso.ts`: Freehand lasso selection **[NEW]**

**Right-click pan — transient model (2026-03):**

`usePanHandlers.ts` implements a deferred, transient right-click pan:
- **Right mousedown**: consumes the event (returns `true`) but does NOT enter `PAN` immediately. Sets `rightDownRef` and captures `previousModeTypeRef` (which tool was active).
- **Right mousemove**: returns `true` (suppresses `processMouseUpdate`) while below the 4 px drag threshold, preventing `Cursor.mousemove` from triggering a lasso. Once threshold is exceeded, calls `startPan('right')` and returns `false` so `Pan.mousemove` can scroll normally.
- **Right mouseup without drag**: deselect path — calls `setItemControls(null)`, clears `mouse.mousedown`, resets any active lasso selection. Returns `true`.
- **Right mouseup after drag**: calls `endPan()`, which clears `mouse.mousedown` and calls `restorePreviousMode()` to reconstruct a clean mode matching the tool that was active before the pan. Returns `true`.
- `rightClickPan=false`: right-click is still fully consumed (no Cursor.mousedown/mouseup interference), but no pan or deselect side-effects are applied.
- This implements FF-001 from `future_features.md`.

#### 4. Utilities (`packages/fossflow-lib/src/utils/`)

**Key Utilities**:
- `CoordsUtils.ts`: Coordinate calculations
- `SizeUtils.ts`: Size computations
- `isoMath.ts`: All pure isometric coordinate math — `screenToIso`, `getTilePosition`, `isoToScreen`, `sortByPosition`, `getBoundingBox`, `getBoundingBoxSize`, `getConnectorPath`, `connectorPathTileToGlobal`, `getTextBoxDimensions`, zoom helpers, anchor helpers. **(Split from renderer.ts, 2026-04)**
- `hitDetection.ts`: WeakMap spatial index (`itemTileIndexCache`) and `getItemAtTile` — O(1) tile hit testing. **(Split from renderer.ts, 2026-04)**
- `renderer.ts`: Screen-space helpers — `getMouse`, `getProjectBounds`, `getVisualBounds`, `getUnprojectedBounds`, `getFitToViewParams`. Barrel re-exports `isoMath.ts` and `hitDetection.ts` so existing `import { X } from 'src/utils/renderer'` call sites work unchanged. **(Slimmed from 866 → ~210 lines, 2026-04)**
- `model.ts`: Model manipulation
- `pathfinder.ts`: Connector routing (A* pathfinding, LRU cache)
- `connectorLabels.ts`: Label migration and positioning
- `common.ts`: Common helpers — `getItemById`, `clamp`, `generateId`, etc.

#### 5. Type System (`packages/fossflow-lib/src/types/`)

**Core Types**:
- `model.ts`: Business data types
- `scene.ts`: Visual state types — `SceneConnector` now includes `unroutable?: boolean` flag
- `ui.ts`: Interface types — imports settings types from `./settings`
- `settings.ts`: Settings types — `HotkeyProfile`, `PanSettings`, `ZoomSettings`, `LabelSettings`. Canonical location; config files re-export from here. **(NEW 2026-04)**
- `common.ts`: Shared types
- `interactions.ts`: Interaction types
- `isoflowProps.ts`: Component prop types

#### 6. Schema Validation (`packages/fossflow-lib/src/schemas/`)

**Validation Schemas**:
- `model.ts`: Model validation
- `connector.ts`: Connector validation
  - Updated: Label array validation (commit d5e02ea)
- `rectangle.ts`: Rectangle validation
- `textBox.ts`: Text box validation
- `views.ts`: View validation

## Undo/Redo System

**Added**: August 2025 (contributor: pi22by7)
**Status**: ⚠️ Implemented but has known issues under investigation

### Implementation Details

The undo/redo system uses a transaction-based approach to ensure atomic operations:

**Key Components**:
- **Transaction System**: Groups related operations together (`useHistory.ts`)
- **Dual Store Coordination**: Synchronizes model and scene stores
- **History Tracking**: Maintains separate history for each store

**Key File**: `/packages/fossflow-lib/src/hooks/useHistory.ts`

**API**:
```typescript
const { undo, redo, canUndo, canRedo, transaction } = useHistory();

// Group multiple operations
transaction(() => {
  // Multiple state changes here
  // All will be undone/redone together
});
```

**Important Considerations**:
- Operations that affect both model and scene (like placing icons) must use transactions
- Without transactions, undo/redo can cause "Invalid item in view" errors
- The system prevents partial states by grouping related changes

### Known Issues

⚠️ **Current Status**: Stan is investigating edge cases and bugs in the undo/redo system. While functional for basic operations, some complex interactions may cause issues.

### Error Handling Patterns

**Problem**: Components can try to access deleted items during React unmounting
**Solution**: Graceful null handling throughout the codebase

**Key Changes**:
1. Added `getItemById` utility that returns `null` instead of throwing
2. Updated all hooks to return `null` when items don't exist
3. Added null checks in all components using these hooks

**Affected Files**:
- `/src/utils/common.ts`: Added `getItemById` function
- All hooks in `/src/hooks/`: Updated to handle missing items
- All components: Added null checks and early returns

**Related Fixes**:
- Orphaned connector cleanup (commit d698a1a)
- Scene deletion synchronization (commits 32bcce5, 67f0dde)

## Navigation Quick Reference

### Need to modify...

**Icons?** → `/src/components/ItemControls/IconSelectionControls/`
**Custom icon import?** → `/src/components/ItemControls/IconSelectionControls/IconGrid.tsx`
**Node rendering?** → `/src/components/SceneLayers/Nodes/`
**Node header link?** → `ModelItem.headerLink` + `Node.tsx` + `NodeSettings.tsx`
**Connector drawing?** → `/src/components/SceneLayers/Connectors/`
**Connector labels?** → `/src/components/SceneLayers/ConnectorLabels/` **[NEW]**
**Connector creation mode?** → `/src/interaction/modes/Connector.ts` + `/src/components/ConnectorSettings/` **[NEW]**
**Connector anchor handles / reconnect?** → `/src/components/ConnectorAnchorOverlay/ConnectorAnchorOverlay.tsx` + `/src/interaction/modes/ReconnectAnchor.ts` **[NEW]**
**Start connector from node?** → `/src/components/NodeActionBar/NodeActionBar.tsx` (Start connector button) + `ConnectorMode.returnToCursor`
**Lasso selection?** → `/src/components/Lasso/`, `/src/components/FreehandLasso/` **[NEW]**
**Zoom behavior?** → `/src/stores/uiStateStore.tsx` + `/src/components/ZoomControls/`
**Grid display?** → `/src/components/Grid/`
**Export functionality?** → `/src/components/ExportImageDialog/`
**Color picker?** → `/src/components/ColorSelector/`
**Context menus?** → `/src/components/ContextMenu/`
**Keyboard shortcuts?** → `/src/interaction/useInteractionManager.ts` + `/src/config/hotkeys.ts` **[NEW]**
**Tool selection?** → `/src/components/ToolMenu/`
**Selection handles?** → `/src/components/TransformControlsManager/`
**Undo/Redo?** → `/src/hooks/useHistory.ts` **[NEW]**
**i18n translations?** → `/src/i18n/en-US.ts`, `/src/i18n/zh-CN.ts` **[NEW]**
**Server storage?** → `/packages/fossflow-backend/server.js` **[NEW]**
**Pan settings?** → `/src/config/panSettings.ts` + `/src/components/PanSettings/` **[NEW]**
**Tooltips?** → Various `/src/components/*Tooltip/` components **[NEW]**

### Want to understand...

**How items are positioned?** → `/src/hooks/useIsoProjection.ts`
**How connectors find paths?** → `/src/utils/pathfinder.ts`
**How state updates work?** → `/src/stores/reducers/`
**How validation works?** → `/src/schemas/`
**Available icons?** → `/src/fixtures/icons.ts`
**Default configurations?** → `/src/config.ts` + `/src/config/*` **[NEW]**
**How labels are positioned?** → `/src/utils/connectorLabels.ts` **[NEW]**
**How transactions work?** → `/src/hooks/useHistory.ts` **[NEW]**
**How i18n works?** → `/src/i18n/`, `/src/stores/localeStore.tsx` **[NEW]**
**Backend API?** → `/packages/fossflow-backend/server.js` **[NEW]**

## Key Files Reference

| Purpose | File Path | Notes |
|---------|-----------|-------|
| Main entry | `/src/Isoflow.tsx` | |
| Configuration | `/src/config.ts` | |
| Hotkey config | `/src/config/hotkeys.ts` | **[NEW]** |
| Pan settings | `/src/config/panSettings.ts` | **[NEW]** |
| Model types | `/src/types/model.ts` | Updated with ConnectorLabel |
| UI state types | `/src/types/ui.ts` | Updated with hotkeys, pan, locale |
| Model store | `/src/stores/modelStore.tsx` | With undo/redo |
| Scene store | `/src/stores/sceneStore.tsx` | With connector labels |
| UI store | `/src/stores/uiStateStore.tsx` | With new settings |
| Locale store | `/src/stores/localeStore.tsx` | **[NEW]** |
| Main renderer | `/src/components/Renderer/Renderer.tsx` | |
| UI overlay | `/src/components/UiOverlay/UiOverlay.tsx` | With tooltips |
| Interaction manager | `/src/interaction/useInteractionManager.ts` | Updated modes |
| Coordinate utils | `/src/utils/CoordsUtils.ts` | |
| Connector labels util | `/src/utils/connectorLabels.ts` | **[NEW]** |
| History/Undo hook | `/src/hooks/useHistory.ts` | **[NEW]** |
| Public API hook | `/src/hooks/useIsoflow.ts` | |
| Backend server | `/packages/fossflow-backend/server.js` | **[NEW]** |
| App i18n config | `/packages/fossflow-app/src/i18n.ts` | **[NEW]** |
| English translations | `/src/i18n/en-US.ts` | **[NEW]** |
| Chinese translations | `/src/i18n/zh-CN.ts` | **[NEW]** |

## Recent Major Changes Summary

### August 2025
- **Backend Storage**: Express server for persistent diagrams (bf3a30f)
- **i18n Support**: English + Chinese translations (2145981, 5d6cf0e)
- **Hotkey System**: Configurable keyboard shortcuts (ef258df)
- **Pan Controls**: Advanced pan configuration (83c9b3a)
- **Connector Labels**: Multiple labels per connector (d5e02ea)
- **Click Connector Mode**: Alternative to drag mode (5ff21cc, ea0bce0)
- **Custom Icons**: Import with scaling slider (dd80e86, 108b5e2)
- **Error Boundary**: Graceful error handling (179b512)

### September 2025
- **Lasso Tools**: Rectangle and freehand selection (fec8878, 96047f3)
- **Tooltip System**: Contextual hints for all tools (9d9a0dd, a2a47b4, 5df41f9)
- **Icon Panel**: Improved small screen layout (77231c9)
- **Quick Icon Selector**: Faster icon selection workflow (8576e30)
- **Orphaned Connectors**: Automatic cleanup (d698a1a)

### October 2025
- **Connector Label Overhaul**: Up to 256 labels, per-line support (2a53437)
- **Expanded Labels**: Default expanded in exports (3cbcada)
- **Zoom to Pan**: Improved zoom behavior (d3fdfea)
- **Race Condition Fixes**: Diagram loading improvements (4e13033)
- **Reroute Tooltips**: Connector manipulation guidance (d5db93c)

### March 2026
- **Transient Right-click Pan (FF-001)**: Right-click single press → deselect; right-click drag → pan; release → restore previous tool. Gated by `rightClickPan` pan setting. `usePanHandlers` extended with deferred-pan refs, drag threshold guard, and `restorePreviousMode()`.
- **Default Zoom 90%**: `INITIAL_UI_STATE.zoom` changed from 1.0 to 0.9; `useInitialDataManager` load path updated to use config constant instead of hardcoded `1`.
- **Node Header Link**: `ModelItem` gains `headerLink?: string`; node name renders as a clickable `<a>` when set; `NodeSettings` panel adds Insert Link button.
- **Node Description Empty-State Fix**: HTML-strip empty detection in `Node.tsx` and `NodeSettings.tsx` replaces fragile `MARKDOWN_EMPTY_VALUE` exact-string check — all Quill empty variants now correctly collapse the canvas label.
- **Service Worker Overhaul**: Legacy CRA cache-first SW replaced with a self-unregistering cleanup SW; `index.tsx` always unregisters. FossFLOW is no longer treated as a PWA.
- **StrictMode Double-Load Fix**: `Isoflow.tsx` `loadRef` pattern prevents the initial-data effect from firing twice under React 18 StrictMode.
- **Storage Dev Bypass**: `storageService.ts` uses `process.env.NODE_ENV !== 'production'` (rsbuild-statically-replaced) instead of `import.meta.env.DEV` which was not inlined.
- **Perf — Subscription Tightening (R-1)**: Zustand equality functions added to mouse-state selectors; `usePanHandlers` reactive subscription removed.
- **Perf — Grid Off Zustand (R-2)**: `Grid.tsx` reads scroll position via `useRef` + resize-observer; eliminates per-frame store writes during pan.

### April 2026 (2026-04-10)

- **New Diagram UX**: `ACTION.NEW` added to MainMenu. Clicking "New diagram" when `isDirty=true` shows `ConfirmDiscardDialog` (Save & continue / Discard / Cancel). Save path: `saveModelLocally()` → `localStorage` autosave (key `fossflow-autosave`), falls back to JSON download. Tab-close triggers native `beforeunload` warning.
- **`useDirtyTracker` hook**: Subscribes to `modelStore` 100 ms after `isReady`. Any model change sets `uiState.isDirty = true`. Installed in `Isoflow.tsx`.
- **Flat icon elevation fix**: `NonIsometricIcon.tsx` corrected `top: -halfH` → `top: 0`. The isometric CSS matrix requires the element origin at `top: 0`; the negative offset was causing ~41 px elevation of all flat icons.
- **Connector single-shot from Elements panel**: Connector card in LeftDock sets `returnToCursor: true`; mode is reset to cursor after one connection. Toolbar Connector stays persistent.
- **Rectangle rename**: "Group" button in `QuickAddNodePopover` and Elements panel card renamed to "Rectangle". All 13 i18n locale files updated (`group` key → `rectangle` in `quickAddNodePopover` section). Internal mode types (`RECTANGLE.DRAW`, `RECTANGLE.TRANSFORM`) unchanged.
- **ToolMenu cleanup**: Rectangle and Text `IconButton` components removed from `ToolMenu.tsx`. Both accessible from ElementsPanel (LeftDock).
- **ImportIconsDialog**: Per-import isometric toggle dialog (`components/LeftDock/ImportIconsDialog.tsx`) replaces the persistent "Treat as isometric" checkbox in ElementsPanel. Default: flat.
- **Default zoom 85%**: `INITIAL_UI_STATE.zoom` changed from 0.9 to 0.85.

---

This encyclopedia serves as a comprehensive guide to the FossFLOW codebase. Use the table of contents and quick references to efficiently navigate to the areas you need to modify or understand.

**For Contributors**: See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.
