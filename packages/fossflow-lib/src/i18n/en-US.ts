import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: 'This is an example text'
  },
  mainMenu: {
    undo: 'Undo',
    redo: 'Redo',
    new: 'New diagram',
    open: 'Open',
    exportJson: 'Export as JSON',
    exportCompactJson: 'Export as Compact JSON',
    exportImage: 'Export as image',
    clearCanvas: 'Clear the canvas',
    settings: 'Settings',
    gitHub: 'GitHub'
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
    addNodeGroupAction: 'Add Node / Rectangle',
    addNodeGroupShortcut: 'Double-click (empty area)',
    addNodeGroupDescription:
      'Opens the Add popover at the cursor: pick an icon to place a node, or click Rectangle to add a background area for visually grouping nodes',
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
      'Paste clipboard items at mouse position; offsets to avoid overlap'
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
    zoom: {
      description: 'Configure zoom behavior when using the mouse wheel.',
      zoomToCursor: 'Zoom to Cursor',
      zoomToCursorDesc:
        'When enabled, zoom in/out centered on the mouse cursor position. When disabled, zoom is centered on the canvas.'
    },
    hotkeys: {
      title: 'Hotkey Settings',
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
    pan: {
      title: 'Pan Settings',
      mousePanOptions: 'Mouse Pan Options',
      emptyAreaClickPan: 'Click and drag on empty area',
      middleClickPan: 'Middle click and drag',
      rightClickPan: 'Right click and drag',
      ctrlClickPan: 'Ctrl + click and drag',
      altClickPan: 'Alt + click and drag',
      keyboardPanOptions: 'Keyboard Pan Options',
      arrowKeys: 'Arrow keys',
      wasdKeys: 'WASD keys',
      ijklKeys: 'IJKL keys',
      keyboardPanSpeed: 'Keyboard Pan Speed',
      note: 'Note: Pan options work in addition to the dedicated Pan tool'
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
    title: 'Welcome to FossFLOW Community Edition',
    message:
      "This is a community-modified fork of FossFLOW with additional features and improvements. Learn more about what's changed and find the source at https://github.com/molikas/FossFLOW_V2 — found a bug or have a feature request? Open an issue on GitHub!",
    configPath: 'Click on the Hamburger icon',
    configPath2: 'in the top left to access Configuration.',
    canDisable: 'Happy diagramming!',
    signature: '— FossFLOW Community & Opus'
  },
  viewTabs: {
    addPage: 'Add page',
    deletePage: 'Delete page',
    renameDiagram: 'Rename diagram'
  },
  nodePanel: {
    details: 'Details',
    style: 'Style',
    notes: 'Notes',
    notesModified: 'Notes ●',
    close: 'Close',
    openLink: 'Open link',
    caption: 'Caption',
    noCaption: 'No caption.'
  },
  nodeInfoTab: {
    name: 'Name',
    namePlaceholder: 'Node name…',
    removeLink: 'Remove link',
    addLink: 'Add link to name',
    linkPlaceholder: 'https://…',
    caption: 'Caption',
    captionHint: 'Shown on the canvas below the node name',
    openLink: 'Open link'
  },
  nodeStyleTab: {
    icon: 'Icon',
    close: 'Close',
    change: 'Change…',
    iconSize: 'Icon size',
    labelFontSize: 'Label font size',
    labelColor: 'Label color',
    labelHeight: 'Label height'
  },
  connectorControls: {
    close: 'Close',
    labels: 'Labels'
  },
  textBoxControls: {
    close: 'Close',
    text: 'Text',
    textSize: 'Text size',
    textColor: 'Text color',
    alignment: 'Alignment'
  },
  rectangleControls: {
    close: 'Close',
    color: 'Color',
    useCustomColor: 'Use Custom Color'
  },
  labelColorPicker: {
    customColor: 'Custom color'
  },
  deleteButton: {
    delete: 'Delete'
  },
  nodeActionBar: {
    style: 'Style',
    editName: 'Edit name',
    editLink: 'Edit link',
    addLink: 'Add link',
    editNotes: 'Edit notes',
    addNotes: 'Add notes',
    startConnector: 'Start connector',
    delete: 'Delete'
  },
  quickAddNodePopover: {
    add: 'Add',
    rectangle: 'Rectangle'
  },
  zoomControls: {
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    fitToScreen: 'Fit to screen',
    help: 'Help (F1)'
  },
  labelSettings: {
    description: 'Configure label display settings',
    expandButtonPadding: 'Expand Button Padding',
    expandButtonPaddingDesc:
      'Bottom padding when expand button is visible (prevents text overlap)'
  },
  iconSelectionControls: {
    close: 'Close',
    importIcons: 'Import Icons',
    isometricLabel: 'Treat as isometric (3D view)',
    isometricHint: 'Uncheck for flat icons (logos, UI elements)',
    dragHint: 'You can drag and drop any item below onto the canvas.'
  },
  searchbox: {
    placeholder: 'Search icons'
  },
  exportImageDialog: {
    title: 'Export as image',
    compatibilityTitle: 'Browser Compatibility Notice',
    compatibilityMessage:
      'For best results, please use Chrome or Edge. Firefox currently has compatibility issues with the export feature.',
    cropInstruction: 'Click and drag to select the area you want to export',
    options: 'Options',
    showGrid: 'Show grid',
    expandDescriptions: 'Expand descriptions',
    cropToContent: 'Crop to content',
    backgroundColor: 'Background color',
    transparentBackground: 'Transparent background',
    exportQuality: 'Export Quality (DPI)',
    custom: 'Custom',
    recrop: 'Recrop',
    cropApplied: 'Crop applied successfully',
    applyCrop: 'Apply Crop',
    clearSelection: 'Clear Selection',
    cropHint:
      'Select an area to crop, or uncheck "Crop to content" to use full image',
    cancel: 'Cancel',
    downloadSvg: 'Download as SVG',
    downloadPng: 'Download as PNG',
    error: 'Could not export image'
  },
  toolMenu: {
    undo: 'Undo',
    redo: 'Redo',
    select: 'Select',
    lassoSelect: 'Lasso select',
    freehandLasso: 'Freehand lasso',
    pan: 'Pan',
    addItem: 'Add item',
    rectangle: 'Rectangle',
    connector: 'Connector',
    text: 'Text'
  },
  quickIconSelector: {
    searchPlaceholder: 'Search icons (press Enter to select)',
    recentlyUsed: 'RECENTLY USED',
    searchResults: 'SEARCH RESULTS ({count} icons)',
    noIconsFound: 'No icons found matching "{term}"',
    helpSearch:
      'Use arrow keys to navigate • Enter to select • Double-click to select and close',
    helpBrowse:
      'Type to search • Click category to expand • Double-click to select and close'
  }
};

export default locale;
