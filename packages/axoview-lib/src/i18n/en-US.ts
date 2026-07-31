import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'This is an example text'
  },
  rightSidebar: {
    collapsePanel: 'Collapse panel',
    emptyState: 'Select a node, connector or shape to view its properties'
  },
  helpDialog: {
    title: 'Keyboard Shortcuts & Help',
    close: 'Close',
    keyboardShortcuts: 'Keyboard Shortcuts',
    mouseInteractions: 'Mouse Interactions',
    action: 'Action',
    shortcut: 'Shortcut',
    method: 'Method',
    description: 'Description',
    note: 'Note:',
    noteContent:
      'Keyboard shortcuts are disabled when typing in input fields, text areas, or content-editable elements to prevent conflicts.',
    // Keyboard shortcuts
    undoAction: 'Undo',
    undoDescription: 'Undo the last action',
    redoAction: 'Redo',
    redoDescription: 'Redo the last undone action',
    redoAltAction: 'Redo (Alternative)',
    redoAltDescription: 'Alternative redo shortcut',
    helpAction: 'Help',
    helpDescription: 'Open help dialog with keyboard shortcuts',
    zoomInAction: 'Zoom In',
    zoomInShortcut: 'Mouse Wheel Up',
    zoomInDescription: 'Zoom in on the canvas',
    zoomOutAction: 'Zoom Out',
    zoomOutShortcut: 'Mouse Wheel Down',
    zoomOutDescription: 'Zoom out from the canvas',
    panCanvasAction: 'Pan Canvas',
    panCanvasShortcut: 'Right-click + Drag',
    panCanvasDescription: 'Pan the canvas when in Pan mode',
    togglePanToolAction: 'Toggle Pan Tool',
    togglePanToolShortcut: 'Right-click',
    togglePanToolDescription:
      'Toggle pan mode on/off; left-click to return to select mode',
    lassoSelectAction: 'Lasso Select',
    lassoSelectShortcut: 'Left-click + Drag (empty area)',
    lassoSelectDescription:
      'Draw a rectangular selection box to select multiple items',
    deselectAction: 'Deselect',
    deselectShortcut: 'Left-click (empty area)',
    deselectDescription:
      'Deselect the current selection and return to select mode',
    // Mouse interactions
    selectToolAction: 'Select Tool',
    selectToolShortcut: 'Click Select button',
    selectToolDescription: 'Switch to selection mode',
    panToolAction: 'Pan Tool',
    panToolShortcut: 'Click Pan button or Right-click',
    panToolDescription:
      'Switch to pan mode for moving the canvas; right-click toggles on/off',
    addItemAction: 'Add Item',
    addItemShortcut: 'Click Add item button',
    addItemDescription: 'Open icon picker to add new items',
    drawRectangleAction: 'Draw Rectangle',
    drawRectangleShortcut: 'Click Rectangle button',
    drawRectangleDescription: 'Switch to rectangle drawing mode',
    createConnectorAction: 'Create Connector',
    createConnectorShortcut: 'Click Connector button',
    createConnectorDescription: 'Switch to connector mode',
    addTextAction: 'Add Text',
    addTextShortcut: 'Click Text button',
    addTextDescription: 'Create a new text box',
    deleteSelectedAction: 'Delete Selected',
    deleteSelectedShortcut: 'Delete (Backspace on Mac)',
    deleteSelectedDescription:
      'Delete the selected item or all items in a lasso selection; supports undo/redo',
    cutAction: 'Cut',
    cutDescription:
      'Cut selected item(s) to clipboard — items are removed and can be pasted elsewhere; supports undo/redo',
    copyAction: 'Copy',
    copyDescription: 'Copy selected item(s) to clipboard',
    pasteAction: 'Paste',
    pasteDescription:
      'Paste clipboard items at mouse position; offsets to avoid overlap',
    // D10 — Select all row
    selectAllAction: 'Select all',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Select every visible, unlocked item in the active view (items, rectangles, text boxes, connectors + their waypoints)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Rename',
    keyRenameShortcut: 'F2',
    keyRenameDescription: 'Rename the selected item or diagram inline',
    keyAddItemAction: 'Add item / Elements',
    keyAddItemShortcut: 'N',
    keyAddItemDescription: 'Toggle the Elements panel to place a new item',
    keyConnectorAction: 'Connector',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Switch to the connector tool',
    keyLassoAction: 'Lasso select',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Switch to the lasso selection tool',
    keySelectAction: 'Select',
    keySelectShortcut: 'S',
    keySelectDescription: 'Switch to the select tool',
    // D10 — mouse interactions
    miSelectAction: 'Select',
    miSelectMethod: 'Left-click',
    miSelectDescription:
      'Click an item to select it (highlights it and shows the floating action bar). Click empty canvas to clear the selection.',
    miOpenDetailsAction: 'Open details',
    miOpenDetailsMethod: 'Double-click',
    miOpenDetailsDescription:
      'Double-click an item to open its details panel — the same as the “Details…” context-menu entry.',
    miToggleSelectionAction: 'Toggle selection',
    miToggleSelectionMethod: 'Ctrl/Cmd + Left-click',
    miToggleSelectionDescription:
      'Add or remove an item from the multi-selection; a connector toggles together with its waypoints.',
    miPanAction: 'Pan',
    miPanMethod: 'Right-click + drag',
    miPanDescription:
      'Hold the right button and drag to pan the canvas. Middle-click drag pans too; arrow keys nudge it.',
    miContextMenuAction: 'Context menu',
    miContextMenuMethod: 'Right-click (tap)',
    miContextMenuDescription:
      'A right-click without dragging opens the context menu — the item menu over an item, or the canvas menu over empty space. On touch, long-press.',
    miRemoveWaypointAction: 'Remove waypoint',
    miRemoveWaypointMethod: 'Alt + Left-click',
    miRemoveWaypointDescription:
      'Alt+click a connector waypoint to splice it out (no need to select the connector first); endpoint anchors are preserved.',
    miZoomAction: 'Zoom',
    miZoomMethod: 'Scroll wheel',
    miZoomDescription: 'Scroll to zoom toward the cursor.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'Tip: Creating Connectors',
    tipConnectorTools: 'Tip: Connector Tools',
    clickInstructionStart: 'Click',
    clickInstructionMiddle: 'on the first node or point, then',
    clickInstructionEnd: 'on the second node or point to create a connection.',
    nowClickTarget: 'Now click on the target to complete the connection.',
    dragStart: 'Drag',
    dragEnd: 'from the first node to the second node to create a connection.',
    rerouteStart: 'To reroute a connector,',
    rerouteMiddle: 'left-click',
    rerouteEnd:
      'on any point along the connector line and drag to create or move anchor points.'
  },
  lassoHintTooltip: {
    tipLasso: 'Tip: Lasso Selection',
    tipFreehandLasso: 'Tip: Freehand Lasso Selection',
    lassoDragStart: 'Click and drag',
    lassoDragEnd:
      'to draw a rectangular selection box around items you want to select.',
    freehandDragStart: 'Click and drag',
    freehandDragMiddle: 'to draw a',
    freehandDragEnd: 'freeform shape',
    freehandComplete:
      'around items. Release to select all items inside the shape.',
    moveStart: 'Once selected,',
    moveMiddle: 'click inside the selection',
    moveEnd: 'and drag to move all selected items together.'
  },
  importHintTooltip: {
    title: 'Import Diagrams',
    instructionStart: 'To import diagrams, click the',
    menuButton: 'menu button',
    instructionMiddle: '(☰) in the top left corner, then select',
    openButton: '"Open"',
    instructionEnd: 'to load your diagram files.'
  },
  connectorRerouteTooltip: {
    title: 'Tip: Reroute Connectors',
    instructionStart:
      'Once your connectors are placed you can reroute them as you please.',
    instructionSelect: 'Select the connector',
    instructionMiddle: 'first, then',
    instructionClick: 'click on the connector path',
    instructionAnd: 'and',
    instructionDrag: 'drag',
    instructionEnd: 'to change it!'
  },
  connectorEmptySpaceTooltip: {
    message: 'To connect this connector to a node,',
    instruction:
      'left-click on the end of the connector and drag it to the desired node.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Settings',
    close: 'Close',
    canvas: 'Canvas',
    language: 'Language',
    about: 'About',
    languageDescription:
      'Select the display language for the application interface.',
    zoomSection: 'Zoom',
    labelsSection: 'Labels',
    zoom: {
      description: 'Configure zoom behavior when using the mouse wheel.',
      zoomToCursor: 'Zoom to Cursor',
      zoomToCursorDesc:
        'When enabled, zoom in/out centered on the mouse cursor position. When disabled, zoom is centered on the canvas.'
    },
    hotkeys: {
      title: 'Keyboard shortcuts',
      profile: 'Hotkey Profile',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'No Hotkeys',
      tool: 'Tool',
      hotkey: 'Hotkey',
      toolSelect: 'Select',
      toolPan: 'Pan',
      toolAddItem: 'Add Item',
      toolRectangle: 'Rectangle',
      toolConnector: 'Connector',
      toolText: 'Text',
      note: 'Note: Hotkeys work when not typing in text fields',
      fixedShortcutsTitle: 'Fixed Shortcuts (Always Active)',
      fixedCut: 'Cut',
      fixedCopy: 'Copy',
      fixedPaste: 'Paste',
      fixedUndo: 'Undo',
      fixedRedo: 'Redo'
    },
    connector: {
      title: 'Connector Settings',
      connectionMode: 'Connection Creation Mode',
      clickMode: 'Click Mode (Recommended)',
      clickModeDesc:
        'Click the first node, then click the second node to create a connection',
      dragMode: 'Drag Mode',
      dragModeDesc: 'Click and drag from the first node to the second node',
      note: 'Note: You can change this setting at any time. The selected mode will be used when the Connector tool is active.'
    },
    iconPacks: {
      title: 'Icon Pack Management',
      lazyLoading: 'Enable Lazy Loading',
      lazyLoadingDesc: 'Load icon packs on demand for faster startup',
      availablePacks: 'Available Icon Packs',
      coreIsoflow: 'Core Isoflow (Always Loaded)',
      alwaysEnabled: 'Always enabled',
      awsPack: 'AWS Icons',
      gcpPack: 'Google Cloud Icons',
      azurePack: 'Azure Icons',
      kubernetesPack: 'Kubernetes Icons',
      loading: 'Loading...',
      loaded: 'Loaded',
      notLoaded: 'Not loaded',
      iconCount: '{count} icons',
      lazyLoadingDisabledNote:
        'Lazy loading is disabled. All icon packs are loaded at startup.',
      note: 'Icon packs can be enabled or disabled based on your needs. Disabled packs will reduce memory usage and improve performance.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Welcome to Axoview',
    message:
      'Axoview is a free, open-source tool for beautiful isometric and 2D diagrams — cloud, network and infrastructure architecture, with AWS, GCP, Azure and Kubernetes icons built in. It all runs in your browser, saving locally or to your own Google Drive. Built on the open-source FossFLOW and Isoflow projects and actively expanded — find the source, report a bug or request a feature at github.com/molikas/axoview.',
    configPath: 'Click on the Hamburger icon',
    configPath2: 'in the top left to access Configuration.',
    canDisable: 'Happy diagramming!',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Add page',
    deletePage: 'Delete page',
    renameDiagram: 'Rename diagram',
    addPageDisabled: 'Page limit reached (5)'
  },
  nodePanel: {
    notes: 'Notes',
    close: 'Close'
  },
  nodeDeck: {
    metadata: 'Metadata',
    name: 'Name',
    namePlaceholder: 'Node name…',
    label: 'Label',
    labelPlaceholder: 'Label shown on the shape…'
  },
  connectorControls: {
    metadata: 'Metadata',
    close: 'Close',
    notes: 'Notes',
    name: 'Name',
    namePlaceholder: 'Edge label…',
    labels: 'Labels',
    addLabel: 'Add label',
    noLabels: 'No labels yet.',
    labelN: 'Label {count}',
    positionHint:
      'Drag a label on the canvas to position it; use the top bar for its text size and colour.',
    line: 'Line',
    line1: 'Line 1',
    line2: 'Line 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Search or paste a link',
    linkCopy: 'Copy link',
    linkCopied: 'Copied',
    linkEdit: 'Edit link',
    linkRemove: 'Remove link',
    placeholder: 'Type something',
    metadata: 'Metadata',
    notes: 'Notes',
    close: 'Close',
    name: 'Name',
    namePlaceholder: 'Name (shown in Layers)…'
  },
  rectangleControls: {
    metadata: 'Metadata',
    notes: 'Notes',
    close: 'Close',
    name: 'Name',
    namePlaceholder: 'Name (shown in Layers)…'
  },
  topBarStyleControls: {
    mixed: 'Mixed',
    rotate90: 'Rotate 90°',
    noColor: 'No color',
    pickColorFromScreen: 'Pick color from screen',
    customColor: 'Custom color',
    textSize: 'Text size',
    lineSpacing: 'Line spacing',
    alignment: 'Alignment',
    alignmentDisabled: 'Select a text box to align text',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    alignTop: 'Align top',
    alignMiddle: 'Align middle',
    alignBottom: 'Align bottom',
    textColor: 'Text color',
    textColorDisabled:
      'Select a node, text box, label, or connection label to set text color',
    textSizeDisabled:
      'Select a node, text box, label, or connection label to set text size',
    labelSizeAllSelected: 'Label size (all selected)',
    textColorAllSelected: 'Text color (all selected)',
    armedToolPlaceFirst:
      'The new element uses default styling — place it, then style it here',
    decreaseLabelSize: 'Decrease label size',
    increaseLabelSize: 'Increase label size',
    labelSize: 'Label size',
    decreaseSize: 'Decrease size',
    increaseSize: 'Increase size',
    stepAll: 'Step all',
    size: 'Size',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
    format: 'Bold / italic / underline / strikethrough',
    formatDisabled:
      'Select a node, text box, label, or connection label to format text',
    lists: 'Lists',
    listsDisabled: 'Select a text box to use lists',
    bulletList: 'Bulleted list',
    numberedList: 'Numbered list',
    background: 'Background color',
    backgroundDisabled:
      'Select a rectangle, label, or text box to set its background color',
    opacity: 'Opacity',
    border: 'Border',
    borderDisabled: 'Select a rectangle or text box to set its border',
    lineStyle: 'Line style',
    width: 'Width',
    borderColor: 'Border color',
    link: 'Link',
    linkDisabled: 'Select a node, connection, or label to add a link',
    linkSelection: 'Link selected text',
    linkDisabledTextBox: 'Select text while editing to add a link',
    linkToWeb: 'Link to web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Link to diagram',
    searchDiagrams: 'Search diagrams…',
    openLinkedDiagram: 'Open linked diagram',
    showLabel: 'Show label',
    hideLabel: 'Hide label',
    showHideLabelDisabled:
      'Select a node or connection to show or hide its label',
    changeIconBulk: 'Change icon applies to one node at a time',
    changeIcon: 'Change icon',
    changeIconDisabled: 'Select a node to change its icon',
    connectionColorPredraw: 'Color for the next connection you draw',
    connectionColor: 'Connection color',
    connectionColorDisabled:
      'Select a connection (or the connector tool) to set its color',
    lineOptionsPredraw: 'Line style for the next connection you draw',
    lineOptions: 'Line options',
    lineOptionsDisabled:
      'Select a connection (or the connector tool) to set its line options',
    lineType: 'Line type',
    showArrow: 'Show arrow',
    showDottedLine: 'Show dotted line'
  },
  quickAddNodePopover: {
    add: 'Add',
    rectangle: 'Rectangle'
  },
  zoomControls: {
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    fitToScreen: 'Fit to screen',
    keepLabelsReadable: 'Keep labels readable',
    help: 'Help (F1)',
    selected: '{count} selected'
  },
  modeHints: {
    connector: 'Drag between items to connect • Esc to cancel',
    textBox: 'Click to place a text box • Esc to cancel',
    label: 'Click to place a label • Esc to cancel',
    rectangle: 'Drag to draw a rectangle • Esc to cancel'
  },
  previewLayerSwitcher: {
    layers: 'Layers',
    showLayer: 'Show layer',
    hideLayer: 'Hide layer',
    solo: 'Solo',
    unsolo: 'Exit solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Hide labels',
    showLabels: 'Show labels'
  },
  annotationPalette: {
    pen: 'Annotate',
    select: 'Select',
    draw: 'Draw',
    shapes: 'Shapes',
    pencil: 'Pencil',
    highlighter: 'Highlighter',
    line: 'Line',
    arrow: 'Arrow',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    eraser: 'Eraser',
    undo: 'Undo',
    redo: 'Redo',
    clear: 'Clear all'
  },
  viewModeInfoPopover: {
    close: 'Close'
  },
  labelSettings: {
    description: 'Configure label display settings',
    expandButtonPadding: 'Expand Button Padding',
    expandButtonPaddingDesc:
      'Bottom padding when expand button is visible (prevents text overlap)',
    // D13
    currentValue: 'Current: {value} theme units'
  },
  iconSelectionControls: {
    close: 'Close',
    importIcons: 'Import Icons',
    addMoreIcons: 'Add more icons',
    isometricLabel: 'Treat as isometric (3D view)',
    isometricHint: 'Uncheck for flat icons (logos, UI elements)',
    dragHint: 'You can drag and drop any item below onto the canvas.',
    aiPromptTooltip: 'Generate icons with AI',
    aiPromptTitle: 'Generate isometric icons with AI',
    aiPromptBody:
      'Paste this prompt into an image-generating AI. Replace "my object" with what you need, then import the generated PNG.',
    aiPromptCopy: 'Copy prompt',
    aiPromptCopied: 'Copied'
  },
  searchbox: {
    placeholder: 'Search icons'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Export as image',
    compatibilityTitle: 'Browser Compatibility Notice',
    compatibilityMessage:
      'For best results, please use Chrome or Edge. Firefox currently has compatibility issues with the export feature.',
    cropInstruction: 'Drag the edges or corners to set the crop area',
    options: 'Options',
    showGrid: 'Show grid',
    showLabels: 'Show labels',
    screenshotPreset: 'Screenshot (recommended)',
    scaleClamped: 'Export size reduced to fit the browser image limit:',
    cropToContent: 'Crop to content',
    backgroundColor: 'Background color',
    transparentBackground: 'Transparent background',
    exportQuality: 'Export Quality (DPI)',
    custom: 'Custom',
    recrop: 'Recrop',
    cropApplied: 'Crop applied successfully',
    applyCrop: 'Apply Crop',
    clearSelection: 'Reset',
    cropHint:
      'Select an area to crop, or uncheck "Crop to content" to use full image',
    cancel: 'Cancel',
    downloadSvg: 'Download as SVG',
    downloadPng: 'Download as PNG',
    error: 'Could not export image'
  },
  toolMenu: {
    label: 'Label',
    undo: 'Undo',
    redo: 'Redo',
    select: 'Select',
    lassoSelect: 'Lasso select',
    freehandLasso: 'Freehand lasso',
    pan: 'Pan',
    addItem: 'Add item',
    rectangle: 'Rectangle',
    connector: 'Connector',
    text: 'Text',
    common: 'Common',
    // D5
    switchTo2D: 'Switch to 2D view',
    switchToIsometric: 'Switch to isometric view',
    clickMode: 'Click',
    dragMode: 'Drag'
  },
  quickIconSelector: {
    recentlyUsed: 'RECENTLY USED',
    searchResults: 'SEARCH RESULTS ({count} icons)',
    noIconsFound: 'No icons found matching "{term}"'
  },
  // D1 — CanvasContextMenu (ADR 0027). Sentence case per ux §7.2.
  canvasContextMenu: {
    addNote: 'Add/edit note',
    addLabel: 'Add label',
    details: 'Details…',
    rename: 'Rename',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    duplicate: 'Duplicate',
    bringForward: 'Bring forward',
    sendBackward: 'Send backward',
    bringToFront: 'Bring to front',
    sendToBack: 'Send to back',
    assignToLayer: 'Assign to layer',
    fitToText: 'Fit to text',
    snapToGrid: 'Snap to grid',
    unsnapFromGrid: 'Unsnap from grid',
    disableCollision: 'Disable collision',
    enableCollision: 'Enable collision',
    delete: 'Delete',
    addItem: 'Add item',
    selectAll: 'Select all',
    enableSnapToGrid: 'Enable snap to grid',
    disableSnapToGrid: 'Disable snap to grid',
    itemsSelectedOne: '{count} item selected',
    itemsSelectedOther: '{count} items selected',
    deleteItemsOne: 'Delete {count} item',
    deleteItemsOther: 'Delete {count} items',
    removeFromLayer: 'Remove from layer',
    noLayers: 'No layers — add one in the Layers panel'
  },
  // D4 — LeftDock icon-strip tooltips + disabled-state hint. Sentence case.
  leftDock: {
    fileExplorer: 'File explorer',
    elements: 'Elements',
    layers: 'Layers',
    settings: 'Settings',
    openDiagramFirst: 'open or create a diagram first',
    collapsePanel: 'Collapse panel'
  },
  // D8 — LayersPanel chrome. Sentence case; {count} is interpolated.
  layersPanel: {
    deleteLayerTitle: 'Delete layer?',
    deleteLayerBody: 'This layer holds {count} element(s). What should happen to them?',
    deleteLayerHiddenWarning: 'This layer is HIDDEN. Keeping its contents makes them VISIBLE again — an element with no layer is always shown.',
    deleteLayerCancel: 'Cancel',
    deleteLayerKeep: 'Keep contents',
    deleteLayerDeleteContents: 'Delete contents too',
    header: 'Layers',
    addLayer: 'Add layer',
    deleteSelectedLayer: 'Delete selected layer',
    noLayersYet: 'No layers yet. Click + to add one.',
    unassigned: 'Unassigned ({count})',
    dropToUnassign: 'Drop items here to unassign',
    layerN: 'Layer {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated, never concat.
  clipboard: {
    copiedOne: 'Copied {count} item',
    copiedOther: 'Copied {count} items',
    cutOne: 'Cut {count} item',
    cutOther: 'Cut {count} items',
    pastedOne: 'Pasted {count} item',
    pastedOther: 'Pasted {count} items',
    nothingToPaste: 'Nothing to paste',
    routingConnectors: 'Pasting… routing connectors ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Page {count}'
  }
};

export default locale;
