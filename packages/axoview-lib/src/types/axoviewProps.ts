import type React from 'react';
import type { EditorModeEnum } from './common';
import type { Model } from './model';
import type { RendererProps } from './rendererProps';

export type InitialData = Model & {
  fitToView?: boolean;
  /**
   * App-facing alias for `fitToView`. The ZoomControls button and the saved
   * per-diagram preference are labelled "Fit to screen", and the app persists
   * the flag under this name — so the loader honours either as a request to fit
   * the diagram to the viewport on open.
   */
  fitToScreen?: boolean;
  view?: string;
};

export interface LocaleProps {
  common: {
    exampleText: string;
  };
  webglUnsupported: {
    title: string;
    body: string;
    hint: string;
  };
  rightSidebar: {
    collapsePanel: string;
    emptyState: string;
  };
  helpDialog: {
    title: string;
    close: string;
    keyboardShortcuts: string;
    mouseInteractions: string;
    action: string;
    shortcut: string;
    method: string;
    description: string;
    note: string;
    noteContent: string;
    // Keyboard shortcuts
    undoAction: string;
    undoDescription: string;
    redoAction: string;
    redoDescription: string;
    redoAltAction: string;
    redoAltDescription: string;
    helpAction: string;
    helpDescription: string;
    zoomInAction: string;
    zoomInShortcut: string;
    zoomInDescription: string;
    zoomOutAction: string;
    zoomOutShortcut: string;
    zoomOutDescription: string;
    panCanvasAction: string;
    panCanvasShortcut: string;
    panCanvasDescription: string;
    togglePanToolAction: string;
    togglePanToolShortcut: string;
    togglePanToolDescription: string;
    lassoSelectAction: string;
    lassoSelectShortcut: string;
    lassoSelectDescription: string;
    deselectAction: string;
    deselectShortcut: string;
    deselectDescription: string;
    deleteSelectedAction: string;
    deleteSelectedShortcut: string;
    deleteSelectedDescription: string;
    // Mouse interactions
    selectToolAction: string;
    selectToolShortcut: string;
    selectToolDescription: string;
    panToolAction: string;
    panToolShortcut: string;
    panToolDescription: string;
    addItemAction: string;
    addItemShortcut: string;
    addItemDescription: string;
    drawRectangleAction: string;
    drawRectangleShortcut: string;
    drawRectangleDescription: string;
    createConnectorAction: string;
    createConnectorShortcut: string;
    createConnectorDescription: string;
    addTextAction: string;
    addTextShortcut: string;
    addTextDescription: string;
    cutAction: string;
    cutDescription: string;
    copyAction: string;
    copyDescription: string;
    pasteAction: string;
    pasteDescription: string;
    // D10 — "Select all" keyboard-shortcut row (was hardcoded English).
    selectAllAction: string;
    selectAllShortcut: string;
    selectAllDescription: string;
    // D10 — undocumented tool-activation keys (ADR 0022 §6 locked defaults):
    // F2 rename · N add item/Elements · C connector · L lasso · S select.
    keyRenameAction: string;
    keyRenameShortcut: string;
    keyRenameDescription: string;
    keyAddItemAction: string;
    keyAddItemShortcut: string;
    keyAddItemDescription: string;
    keyConnectorAction: string;
    keyConnectorShortcut: string;
    keyConnectorDescription: string;
    keyLassoAction: string;
    keyLassoShortcut: string;
    keyLassoDescription: string;
    keySelectAction: string;
    keySelectShortcut: string;
    keySelectDescription: string;
    // D10 — mouse-interactions block (was a hardcoded array). One pointer model
    // per ADR 0022. `*Method` is the shortcut/gesture shown in the Method column.
    miSelectAction: string;
    miSelectMethod: string;
    miSelectDescription: string;
    miOpenDetailsAction: string;
    miOpenDetailsMethod: string;
    miOpenDetailsDescription: string;
    miToggleSelectionAction: string;
    miToggleSelectionMethod: string;
    miToggleSelectionDescription: string;
    miPanAction: string;
    miPanMethod: string;
    miPanDescription: string;
    miContextMenuAction: string;
    miContextMenuMethod: string;
    miContextMenuDescription: string;
    miRemoveWaypointAction: string;
    miRemoveWaypointMethod: string;
    miRemoveWaypointDescription: string;
    miZoomAction: string;
    miZoomMethod: string;
    miZoomDescription: string;
  };
  connectorHintTooltip: {
    tipCreatingConnectors: string;
    tipConnectorTools: string;
    clickInstructionStart: string;
    clickInstructionMiddle: string;
    clickInstructionEnd: string;
    nowClickTarget: string;
    dragStart: string;
    dragEnd: string;
    rerouteStart: string;
    rerouteMiddle: string;
    rerouteEnd: string;
  };
  lassoHintTooltip: {
    tipLasso: string;
    tipFreehandLasso: string;
    lassoDragStart: string;
    lassoDragEnd: string;
    freehandDragStart: string;
    freehandDragMiddle: string;
    freehandDragEnd: string;
    freehandComplete: string;
    moveStart: string;
    moveMiddle: string;
    moveEnd: string;
  };
  importHintTooltip: {
    title: string;
    instructionStart: string;
    menuButton: string;
    instructionMiddle: string;
    openButton: string;
    instructionEnd: string;
  };
  connectorRerouteTooltip: {
    title: string;
    instructionStart: string;
    instructionSelect: string;
    instructionMiddle: string;
    instructionClick: string;
    instructionAnd: string;
    instructionDrag: string;
    instructionEnd: string;
  };
  connectorEmptySpaceTooltip: {
    message: string;
    instruction: string;
  };
  settings: {
    // D3 — SettingsDialog chrome: dialog title, Close, the Canvas/Language/About
    // tab labels, the language-tab description and the Zoom/Labels section titles.
    title: string;
    close: string;
    canvas: string;
    language: string;
    about: string;
    languageDescription: string;
    zoomSection: string;
    labelsSection: string;
    zoom: {
      description: string;
      zoomToCursor: string;
      zoomToCursorDesc: string;
    };
    hotkeys: {
      title: string;
      profile: string;
      profileQwerty: string;
      profileSmnrct: string;
      profileNone: string;
      tool: string;
      hotkey: string;
      toolSelect: string;
      toolPan: string;
      toolAddItem: string;
      toolRectangle: string;
      toolConnector: string;
      toolText: string;
      note: string;
      fixedShortcutsTitle: string;
      fixedCut: string;
      fixedCopy: string;
      fixedPaste: string;
      fixedUndo: string;
      fixedRedo: string;
    };
    connector: {
      title: string;
      connectionMode: string;
      clickMode: string;
      clickModeDesc: string;
      dragMode: string;
      dragModeDesc: string;
      note: string;
    };
    iconPacks: {
      title: string;
      lazyLoading: string;
      lazyLoadingDesc: string;
      availablePacks: string;
      coreIsoflow: string;
      alwaysEnabled: string;
      awsPack: string;
      gcpPack: string;
      azurePack: string;
      kubernetesPack: string;
      loading: string;
      loaded: string;
      notLoaded: string;
      iconCount: string;
      lazyLoadingDisabledNote: string;
      note: string;
    };
  };
  lazyLoadingWelcome: {
    title: string;
    message: string;
    configPath: string;
    configPath2: string;
    canDisable: string;
    signature: string;
  };
  viewTabs: {
    addPage: string;
    deletePage: string;
    renameDiagram: string;
    addPageDisabled: string;
  };
  nodePanel: {
    notes: string;
    close: string;
  };
  // addLink/removeLink/linkPlaceholder + nodePanel show/hideName retired
  // 2026-07-05: the deck's link + hide-name affordances were duplicates of
  // the strip's Link control and show/hide eye.
  nodeDeck: {
    name: string;
    namePlaceholder: string;
    metadata: string;
    label: string;
    labelPlaceholder: string;
  };
  connectorControls: {
    close: string;
    metadata: string;
    notes: string;
    name: string;
    namePlaceholder: string;
    labels: string;
    addLabel: string;
    noLabels: string;
    labelN: string;
    positionHint: string;
    line: string;
    line1: string;
    line2: string;
  };
  textBoxControls: {
    close: string;
    metadata: string;
    notes: string;
    name: string;
    namePlaceholder: string;
    // Inline-editor ghost text for an EMPTY on-canvas text box (ADR 0034
    // addendum 2026-07-03) — display-only, never persisted.
    placeholder: string;
    // Docs-style link card over linked text in the on-canvas editor
    // (ADR 0034 addendum 2026-07-04).
    linkCopy: string;
    linkCopied: string;
    linkEdit: string;
    linkRemove: string;
    // Card URL-field ghost text ("Search or paste a link" — Docs wording;
    // the field also filters the diagram suggestions).
    linkSearchPlaceholder: string;
  };
  topBarStyleControls: {
    // Readout for an absolute control whose bulk members disagree (STYL-08
    // ruling — never show `selectedIds[0]`'s value for the whole selection).
    mixed: string;
    noColor: string;
    pickColorFromScreen: string;
    customColor: string;
    textSize: string;
    lineSpacing: string;
    // Alignment (text box only — ADR 0034 addenda 2026-07-03/04): one
    // Lucid-style control; horizontal (content) × vertical (element) grid.
    alignment: string;
    alignmentDisabled: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignTop: string;
    alignMiddle: string;
    alignBottom: string;
    textColor: string;
    textColorDisabled: string;
    textSizeDisabled: string;
    labelSizeAllSelected: string;
    textColorAllSelected: string;
    armedToolPlaceFirst: string;
    decreaseLabelSize: string;
    increaseLabelSize: string;
    labelSize: string;
    decreaseSize: string;
    increaseSize: string;
    stepAll: string;
    size: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    format: string;
    formatDisabled: string;
    lists: string;
    listsDisabled: string;
    bulletList: string;
    numberedList: string;
    background: string;
    backgroundDisabled: string;
    opacity: string;
    border: string;
    borderDisabled: string;
    lineStyle: string;
    width: string;
    borderColor: string;
    link: string;
    linkDisabled: string;
    linkSelection: string;
    linkDisabledTextBox: string;
    linkToWeb: string;
    webLinkPlaceholder: string;
    linkToDiagram: string;
    searchDiagrams: string;
    openLinkedDiagram: string;
    showLabel: string;
    hideLabel: string;
    showHideLabelDisabled: string;
    changeIconBulk: string;
    changeIcon: string;
    changeIconDisabled: string;
    connectionColorPredraw: string;
    connectionColor: string;
    connectionColorDisabled: string;
    lineOptionsPredraw: string;
    lineOptions: string;
    lineOptionsDisabled: string;
    lineType: string;
    showArrow: string;
    showDottedLine: string;
    // On-canvas rotate handle tooltip (TextBox iso-plane flip / Rectangle
    // footprint transpose) — replaced the strip's textDirection toggle
    // (2026-07-04).
    rotate90: string;
  };
  rectangleControls: {
    close: string;
    metadata: string;
    notes: string;
    name: string;
    namePlaceholder: string;
  };
  quickAddNodePopover: {
    add: string;
    rectangle: string;
  };
  zoomControls: {
    zoomOut: string;
    zoomIn: string;
    fitToScreen: string;
    keepLabelsReadable: string;
    help: string;
    selected: string;
  };
  modeHints: {
    connector: string;
    textBox: string;
    label: string;
    rectangle: string;
  };
  previewLayerSwitcher: {
    layers: string;
    showLayer: string;
    hideLayer: string;
    solo: string;
    unsolo: string;
  };
  previewLabelsToggle: {
    hideLabels: string;
    showLabels: string;
  };
  viewModeInfoPopover: {
    close: string;
  };
  annotationPalette: {
    pen: string;
    select: string;
    draw: string;
    shapes: string;
    pencil: string;
    highlighter: string;
    line: string;
    arrow: string;
    rectangle: string;
    ellipse: string;
    eraser: string;
    undo: string;
    redo: string;
    clear: string;
  };
  labelSettings: {
    description: string;
    expandButtonPadding: string;
    expandButtonPaddingDesc: string;
    // D13 — "Current: {value} theme units" caption (was hardcoded English).
    currentValue: string;
  };
  iconSelectionControls: {
    close: string;
    importIcons: string;
    addMoreIcons?: string;
    isometricLabel: string;
    isometricHint: string;
    dragHint: string;
    aiPromptTooltip: string;
    aiPromptTitle: string;
    aiPromptBody: string;
    aiPromptCopy: string;
    aiPromptCopied: string;
  };
  searchbox: {
    placeholder: string;
  };
  exportImageDialog: {
    title: string;
    compatibilityTitle: string;
    compatibilityMessage: string;
    cropInstruction: string;
    options: string;
    groupAppearance: string;
    groupBackground: string;
    groupCrop: string;
    showGrid: string;
    showLabels: string;
    screenshotPreset: string;
    scaleClamped: string;
    cropToContent: string;
    backgroundColor: string;
    transparentBackground: string;
    exportQuality: string;
    custom: string;
    recrop: string;
    cropApplied: string;
    applyCrop: string;
    clearSelection: string;
    cropHint: string;
    cancel: string;
    downloadSvg: string;
    downloadPng: string;
    error: string;
  };
  toolMenu: {
    undo: string;
    redo: string;
    select: string;
    lassoSelect: string;
    freehandLasso: string;
    pan: string;
    addItem: string;
    rectangle: string;
    connector: string;
    text: string;
    label: string;
    // D9 — region header for the LeftDock "Common" elements group. The
    // rectangle/text/connector labels reuse the keys above.
    common: string;
    // D5 — canvas-mode toggle tooltips + the connector-mode chip (Click/Drag).
    switchTo2D: string;
    switchToIsometric: string;
    clickMode: string;
    dragMode: string;
  };
  quickIconSelector: {
    /** @deprecated removed in 2026-05 shake-out; kept optional for non-English locales pending cleanup */
    searchPlaceholder?: string;
    recentlyUsed: string;
    searchResults: string;
    noIconsFound: string;
    /** @deprecated removed in 2026-05 shake-out; kept optional for non-English locales pending cleanup */
    helpSearch?: string;
    /** @deprecated removed in 2026-05 shake-out; kept optional for non-English locales pending cleanup */
    helpBrowse?: string;
  };
  // D1 — CanvasContextMenu (ADR 0027). Item / multi / canvas variants + the
  // layer-assign flyout. Count rows pluralise via separate one/other keys with
  // a `{count}` placeholder (interpolated at the component with .replace), never
  // by appending an 's'.
  canvasContextMenu: {
    details: string;
    rename: string;
    addNote: string;
    addLabel: string;
    cut: string;
    copy: string;
    paste: string;
    duplicate: string;
    bringForward: string;
    sendBackward: string;
    bringToFront: string;
    sendToBack: string;
    assignToLayer: string;
    // Manually-sized text box → back to auto size (ADR 0034 addenda
    // 2026-07-03/04); shown only while a manual width/height is set.
    fitToText: string;
    snapToGrid: string;
    unsnapFromGrid: string;
    disableCollision: string;
    enableCollision: string;
    delete: string;
    addItem: string;
    selectAll: string;
    enableSnapToGrid: string;
    disableSnapToGrid: string;
    // Multi-selection count row + bulk delete (singular / plural, {count}).
    itemsSelectedOne: string;
    itemsSelectedOther: string;
    deleteItemsOne: string;
    deleteItemsOther: string;
    // Layer-assign flyout.
    removeFromLayer: string;
    noLayers: string;
  };
  // D4 — LeftDock icon-strip tooltips + the disabled-state hint suffix shown
  // when no diagram is loaded ("<tab> — open or create a diagram first").
  leftDock: {
    fileExplorer: string;
    elements: string;
    layers: string;
    settings: string;
    openDiagramFirst: string;
    collapsePanel: string;
  };
  // D8 — LayersPanel chrome: header, add/delete tooltips, empty-state, the
  // Unassigned group header (with a {count} placeholder) + its drop hint, and
  // the default "Layer {count}" name (interpolated, never concatenated).
  layersPanel: {
    // F4/LAY-05 + E2/RED-13 ruling — the delete-layer confirm.
    deleteLayerTitle: string;
    deleteLayerBody: string;
    deleteLayerHiddenWarning: string;
    deleteLayerCancel: string;
    deleteLayerKeep: string;
    deleteLayerDeleteContents: string;
    header: string;
    addLayer: string;
    deleteSelectedLayer: string;
    noLayersYet: string;
    unassigned: string;
    dropToUnassign: string;
    layerN: string;
  };
  // D7 — useCopyPaste toast strings. Counts pluralise via separate one/other
  // keys with a `{count}` placeholder (interpolated at the hook with .replace),
  // never by appending an 's'. The routing toast interpolates `{percent}`.
  clipboard: {
    copiedOne: string;
    copiedOther: string;
    cutOne: string;
    cutOther: string;
    pastedOne: string;
    pastedOther: string;
    nothingToPaste: string;
    // E3/SCN-12 — shown when the assembled paste fails validation and is
    // rejected whole (Ctrl+V used to appear to do nothing).
    couldNotPaste: string;
    routingConnectors: string;
  };
  // D13 — default page name. Interpolated via `{count}` (never concatenated)
  // and applied at creation time in useSceneActions (mirrors layersPanel.layerN).
  page: {
    pageName: string;
  };
  // other namespaces can be added here
}

/**
 * Per-diagram usage report for a single icon id. Returned by IconUsageScan.
 * `count` is the number of items in the diagram that reference the icon id.
 */
export interface IconUsageReport {
  diagramId: string;
  diagramName: string;
  count: number;
  /**
   * F5/ICON-06: the diagram is in the TRASH. Its reference is still live —
   * a trashed diagram is restorable — so it counts for a DELETE gate even
   * though it is hidden from an ordinary usage report. The dialog labels
   * these rows so the count stays honest AND the copy stays clear.
   */
  inTrash?: boolean;
}

/**
 * Workspace-wide scan for icon usage. Implemented by the consuming app since
 * the lib has no notion of "other diagrams" — only the currently loaded model.
 * The result must include the current diagram if it uses the icon.
 *
 * When unset, ElementsPanel falls back to a current-diagram-only scan.
 */
export type IconUsageScan = (iconId: string) => Promise<IconUsageReport[]>;

export interface IconPackManagerProps {
  lazyLoadingEnabled: boolean;
  onToggleLazyLoading: (enabled: boolean) => void;
  packInfo: Array<{
    name: string;
    displayName: string;
    loaded: boolean;
    loading: boolean;
    error: string | null;
    iconCount: number;
  }>;
  enabledPacks: string[];
  onTogglePack: (packName: string, enabled: boolean) => void;
}

export interface AxoviewProps {
  initialData?: InitialData;
  onModelUpdated?: (Model: Model) => void;
  width?: number | string;
  height?: number | string;
  enableDebugTools?: boolean;
  /**
   * Exposes the read-only store bridge (`window.__axoview__`) WITHOUT turning on
   * the in-canvas debug tools (the SizeIndicator overlay). The perf
   * DiagnosticsOverlay reads live node/connector/textbox counts through this
   * bridge; dev builds expose it unconditionally, prod builds only when this (or
   * `enableDebugTools`) is true. Wire it to the perf-monitoring toggle so a
   * production capture isn't blind to scene counts.
   */
  exposeStoreBridge?: boolean;
  editorMode?: keyof typeof EditorModeEnum;
  renderer?: RendererProps;
  locale?: LocaleProps;
  iconPackManager?: IconPackManagerProps;
  /**
   * Optional workspace-wide icon usage scan. When supplied, the imported-icon
   * delete confirmation dialog lists every diagram that references the icon
   * before allowing the user to proceed. See ADR-0002 lifecycle section.
   */
  iconUsageScan?: IconUsageScan;
  /** Diagrams available for node-to-diagram linking (Phase 2C). Each entry is {id, name}. */
  linkedDiagrams?: Array<{ id: string; name: string }>;
  /** Slot rendered inside the Settings dialog as a "Language" tab — pass your own language-picker component. */
  languageSelector?: React.ReactNode;
  /** Portal target for the left-zone toolbar slot (currently hosts only the sidebar toggle fallback when sidebarTogglePortalTarget is omitted). */
  toolbarPortalTarget?: HTMLElement | null;
  /** Portal target for the sidebar toggle buttons (right zone). When omitted, toggles render in toolbarPortalTarget. */
  sidebarTogglePortalTarget?: HTMLElement | null;
  /** Portal target for the top-bar style controls strip (text/fill/connection colour, line style, text direction, rich text). Controls self-gate on the current selection. */
  styleControlsPortalTarget?: HTMLElement | null;
  /** @deprecated use toolbarPortalTarget */
  menuPortalTarget?: HTMLElement | null;
  /** Extra content rendered at the right end of the BottomDock (after the help icon). */
  bottomDockEnd?: React.ReactNode;
  /** When true, the first-load welcome notification is hidden (pass true when a diagram is open). */
  suppressOnboardingHints?: boolean;
  /** Whether the file-explorer panel is open (controlled by the app layer). */
  fileExplorerOpen?: boolean;
  /** Called when the user clicks the 📁 File Explorer button in the left strip. */
  onFileExplorerToggle?: () => void;
  /** When true, the LeftDock's Elements/Layers icons are disabled (e.g. no diagram is loaded yet). */
  disableLeftDockWorkingTabs?: boolean;
}

export interface LoadOptions {
  /** When true, zoom and scroll are preserved instead of being reset to defaults. */
  preserveViewport?: boolean;
}

export interface AxoviewRef {
  load: (data: InitialData, options?: LoadOptions) => void;
  /** Opens the built-in image export dialog for the currently-loaded diagram. */
  openExportImageDialog: () => void;
}
