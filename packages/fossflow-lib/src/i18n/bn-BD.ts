import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "এটি একটি উদাহরণ পাঠ্য"
  },
  mainMenu: {
    undo: "পূর্বাবস্থায় ফেরান",
    redo: "পুনরায় করুন",
    new: "New diagram",
    open: "খুলুন",
    exportJson: "JSON হিসাবে রপ্তানি করুন",
    exportCompactJson: "কমপ্যাক্ট JSON হিসাবে রপ্তানি করুন",
    exportImage: "ছবি হিসাবে রপ্তানি করুন",
    clearCanvas: "ক্যানভাস পরিষ্কার করুন",
    settings: "সেটিংস",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "কীবোর্ড শর্টকাট এবং সহায়তা",
    close: "বন্ধ করুন",
    keyboardShortcuts: "কীবোর্ড শর্টকাট",
    mouseInteractions: "মাউস ইন্টারঅ্যাকশন",
    action: "ক্রিয়া",
    shortcut: "শর্টকাট",
    method: "পদ্ধতি",
    description: "বিবরণ",
    note: "নোট:",
    noteContent: "দ্বন্দ্ব এড়াতে ইনপুট ফিল্ড, টেক্সট এরিয়া বা সম্পাদনাযোগ্য উপাদানে টাইপ করার সময় কীবোর্ড শর্টকাট নিষ্ক্রিয় থাকে।",
    // Keyboard shortcuts
    undoAction: "পূর্বাবস্থায় ফেরান",
    undoDescription: "শেষ ক্রিয়াটি পূর্বাবস্থায় ফেরান",
    redoAction: "পুনরায় করুন",
    redoDescription: "শেষ পূর্বাবস্থায় ফেরানো ক্রিয়া পুনরায় করুন",
    redoAltAction: "পুনরায় করুন (বিকল্প)",
    redoAltDescription: "পুনরায় করার জন্য বিকল্প শর্টকাট",
    helpAction: "সহায়তা",
    helpDescription: "কীবোর্ড শর্টকাট সহ সহায়তা ডায়ালগ খুলুন",
    zoomInAction: "জুম ইন করুন",
    zoomInShortcut: "মাউস হুইল উপরে",
    zoomInDescription: "ক্যানভাসে জুম ইন করুন",
    zoomOutAction: "জুম আউট করুন",
    zoomOutShortcut: "মাউস হুইল নিচে",
    zoomOutDescription: "ক্যানভাস থেকে জুম আউট করুন",
    panCanvasAction: "ক্যানভাস প্যান করুন",
    panCanvasShortcut: "বাম-ক্লিক + টেনে আনুন",
    panCanvasDescription: "প্যান মোডে ক্যানভাস প্যান করুন",
    togglePanToolAction: "Toggle Pan Tool",
    togglePanToolShortcut: "Right-click",
    togglePanToolDescription: "Toggle pan mode on/off; left-click to return to select mode",
    lassoSelectAction: "Lasso Select",
    lassoSelectShortcut: "Left-click + Drag (empty area)",
    lassoSelectDescription: "Draw a rectangular selection box to select multiple items",
    deselectAction: "Deselect",
    deselectShortcut: "Left-click (empty area)",
    deselectDescription: "Deselect the current selection and return to select mode",
    addNodeGroupAction: "Add Node / Group",
    addNodeGroupShortcut: "Double-click (empty area)",
    addNodeGroupDescription: "Opens the Add popover at the cursor: pick an icon to place a node, or click Group to add a background area for visually grouping nodes",
    // Mouse interactions
    selectToolAction: "নির্বাচন টুল",
    selectToolShortcut: "নির্বাচন বোতামে ক্লিক করুন",
    selectToolDescription: "নির্বাচন মোডে স্যুইচ করুন",
    panToolAction: "প্যান টুল",
    panToolShortcut: "প্যান বোতামে ক্লিক করুন",
    panToolDescription: "ক্যানভাস সরানোর জন্য প্যান মোডে স্যুইচ করুন",
    addItemAction: "আইটেম যোগ করুন",
    addItemShortcut: "আইটেম যোগ করুন বোতামে ক্লিক করুন",
    addItemDescription: "নতুন আইটেম যোগ করতে আইকন পিকার খুলুন",
    drawRectangleAction: "আয়তক্ষেত্র আঁকুন",
    drawRectangleShortcut: "আয়তক্ষেত্র বোতামে ক্লিক করুন",
    drawRectangleDescription: "আয়তক্ষেত্র অঙ্কন মোডে স্যুইচ করুন",
    createConnectorAction: "সংযোগকারী তৈরি করুন",
    createConnectorShortcut: "সংযোগকারী বোতামে ক্লিক করুন",
    createConnectorDescription: "সংযোগকারী মোডে স্যুইচ করুন",
    addTextAction: "পাঠ্য যোগ করুন",
    addTextShortcut: "পাঠ্য বোতামে ক্লিক করুন",
    addTextDescription: "একটি নতুন টেক্সট বক্স তৈরি করুন",
    deleteSelectedAction: "Delete Selected",
    deleteSelectedShortcut: "Delete (Backspace on Mac)",
    deleteSelectedDescription: "Delete the selected item or all items in a lasso selection; supports undo/redo",
    cutAction: "Cut",
    cutDescription: "Cut selected item(s) to clipboard — items are removed and can be pasted elsewhere; supports undo/redo",
    copyAction: "Copy",
    copyDescription: "Copy selected item(s) to clipboard",
    pasteAction: "Paste",
    pasteDescription: "Paste clipboard items at mouse position; offsets to avoid overlap"
  },
  connectorHintTooltip: {
    tipCreatingConnectors: "টিপ: সংযোগকারী তৈরি করা",
    tipConnectorTools: "টিপ: সংযোগকারী টুল",
    clickInstructionStart: "ক্লিক করুন",
    clickInstructionMiddle: "প্রথম নোড বা পয়েন্টে, তারপর",
    clickInstructionEnd: "দ্বিতীয় নোড বা পয়েন্টে একটি সংযোগ তৈরি করতে।",
    nowClickTarget: "সংযোগ সম্পূর্ণ করতে এখন লক্ষ্যে ক্লিক করুন।",
    dragStart: "টেনে আনুন",
    dragEnd: "প্রথম নোড থেকে দ্বিতীয় নোডে একটি সংযোগ তৈরি করতে।",
    rerouteStart: "একটি সংযোগকারী পুনর্নির্দেশ করতে,",
    rerouteMiddle: "বাম-ক্লিক করুন",
    rerouteEnd: "সংযোগকারী লাইনের সাথে যে কোনও পয়েন্টে এবং অ্যাঙ্কর পয়েন্ট তৈরি বা সরাতে টেনে আনুন।"
  },
  lassoHintTooltip: {
    tipLasso: "টিপ: ল্যাসো নির্বাচন",
    tipFreehandLasso: "টিপ: ফ্রিহ্যান্ড ল্যাসো নির্বাচন",
    lassoDragStart: "ক্লিক করুন এবং টেনে আনুন",
    lassoDragEnd: "আপনি যে আইটেমগুলি নির্বাচন করতে চান তার চারপাশে একটি আয়তক্ষেত্রাকার নির্বাচন বক্স আঁকতে।",
    freehandDragStart: "ক্লিক করুন এবং টেনে আনুন",
    freehandDragMiddle: "একটি আঁকতে",
    freehandDragEnd: "মুক্ত আকৃতি",
    freehandComplete: "আইটেমগুলির চারপাশে। আকৃতির ভিতরের সমস্ত আইটেম নির্বাচন করতে ছেড়ে দিন।",
    moveStart: "একবার নির্বাচিত হলে,",
    moveMiddle: "নির্বাচনের ভিতরে ক্লিক করুন",
    moveEnd: "এবং সমস্ত নির্বাচিত আইটেম একসাথে সরাতে টেনে আনুন।"
  },
  importHintTooltip: {
    title: "ডায়াগ্রাম আমদানি করুন",
    instructionStart: "ডায়াগ্রাম আমদানি করতে, ক্লিক করুন",
    menuButton: "মেনু বোতাম",
    instructionMiddle: "(☰) উপরের বাম কোণে, তারপর নির্বাচন করুন",
    openButton: "\"খুলুন\"",
    instructionEnd: "আপনার ডায়াগ্রাম ফাইল লোড করতে।"
  },
  connectorRerouteTooltip: {
    title: "টিপ: সংযোগকারী পুনর্নির্দেশ করুন",
    instructionStart: "একবার আপনার সংযোগকারী স্থাপন করা হলে আপনি আপনার ইচ্ছামতো তাদের পুনর্নির্দেশ করতে পারেন।",
    instructionSelect: "সংযোগকারী নির্বাচন করুন",
    instructionMiddle: "প্রথমে, তারপর",
    instructionClick: "সংযোগকারী পথে ক্লিক করুন",
    instructionAnd: "এবং",
    instructionDrag: "টেনে আনুন",
    instructionEnd: "এটি পরিবর্তন করতে!"
  },
  connectorEmptySpaceTooltip: {
    message: "এই সংযোগকারীটিকে একটি নোডের সাথে সংযোগ করতে,",
    instruction: "সংযোগকারীর শেষে বাম-ক্লিক করুন এবং এটিকে পছন্দসই নোডে টানুন।"
  },
  settings: {
    zoom: {
      description: "মাউস হুইল ব্যবহার করার সময় জুম আচরণ কনফিগার করুন।",
      zoomToCursor: "কার্সারে জুম করুন",
      zoomToCursorDesc: "সক্রিয় থাকলে, মাউস কার্সার অবস্থানে কেন্দ্রীভূত জুম ইন/আউট। নিষ্ক্রিয় থাকলে, জুম ক্যানভাসে কেন্দ্রীভূত।"
    },
    hotkeys: {
      title: "শর্টকাট সেটিংস",
      profile: "শর্টকাট প্রোফাইল",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "কোন শর্টকাট নেই",
      tool: "টুল",
      hotkey: "শর্টকাট",
      toolSelect: "নির্বাচন করুন",
      toolPan: "প্যান করুন",
      toolAddItem: "আইটেম যোগ করুন",
      toolRectangle: "আয়তক্ষেত্র",
      toolConnector: "সংযোগকারী",
      toolText: "পাঠ্য",
      note: "নোট: টেক্সট ফিল্ডে টাইপ না করার সময় শর্টকাটগুলি কাজ করে",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "প্যান সেটিংস",
      mousePanOptions: "মাউস প্যান বিকল্প",
      emptyAreaClickPan: "খালি এলাকায় ক্লিক করুন এবং টেনে আনুন",
      middleClickPan: "মধ্য ক্লিক করুন এবং টেনে আনুন",
      rightClickPan: "ডান ক্লিক করুন এবং টেনে আনুন",
      ctrlClickPan: "Ctrl + ক্লিক করুন এবং টেনে আনুন",
      altClickPan: "Alt + ক্লিক করুন এবং টেনে আনুন",
      keyboardPanOptions: "কীবোর্ড প্যান বিকল্প",
      arrowKeys: "তীর কী",
      wasdKeys: "WASD কী",
      ijklKeys: "IJKL কী",
      keyboardPanSpeed: "কীবোর্ড প্যান গতি",
      note: "নোট: নিবেদিত প্যান টুলের পাশাপাশি প্যান বিকল্পগুলি কাজ করে"
    },
    connector: {
      title: "সংযোগকারী সেটিংস",
      connectionMode: "সংযোগ তৈরির মোড",
      clickMode: "ক্লিক মোড (প্রস্তাবিত)",
      clickModeDesc: "প্রথম নোডে ক্লিক করুন, তারপর একটি সংযোগ তৈরি করতে দ্বিতীয় নোডে ক্লিক করুন",
      dragMode: "টেনে আনার মোড",
      dragModeDesc: "প্রথম নোড থেকে দ্বিতীয় নোডে ক্লিক করুন এবং টেনে আনুন",
      note: "নোট: আপনি যেকোনো সময় এই সেটিং পরিবর্তন করতে পারেন। সংযোগকারী টুল সক্রিয় থাকলে নির্বাচিত মোড ব্যবহার করা হবে।"
    },
    iconPacks: {
      title: "আইকন প্যাক ব্যবস্থাপনা",
      lazyLoading: "লেজি লোডিং সক্ষম করুন",
      lazyLoadingDesc: "দ্রুত স্টার্টআপের জন্য চাহিদা অনুযায়ী আইকন প্যাক লোড করুন",
      availablePacks: "উপলব্ধ আইকন প্যাক",
      coreIsoflow: "Core Isoflow (সর্বদা লোড)",
      alwaysEnabled: "সর্বদা সক্রিয়",
      awsPack: "AWS আইকন",
      gcpPack: "Google Cloud আইকন",
      azurePack: "Azure আইকন",
      kubernetesPack: "Kubernetes আইকন",
      loading: "লোড হচ্ছে...",
      loaded: "লোড করা হয়েছে",
      notLoaded: "লোড করা হয়নি",
      iconCount: "{count} আইকন",
      lazyLoadingDisabledNote: "লেজি লোডিং নিষ্ক্রিয়। সমস্ত আইকন প্যাক স্টার্টআপে লোড করা হয়।",
      note: "আইকন প্যাকগুলি আপনার প্রয়োজন অনুসারে সক্রিয় বা নিষ্ক্রিয় করা যেতে পারে। নিষ্ক্রিয় প্যাকগুলি মেমরি ব্যবহার হ্রাস করবে এবং কর্মক্ষমতা উন্নত করবে।"
    }
  },
  lazyLoadingWelcome: {
    title: "নতুন বৈশিষ্ট্য: লেজি লোডিং!",
    message: "হেই! জনপ্রিয় চাহিদার পরে, আমরা আইকনগুলির লেজি লোডিং প্রয়োগ করেছি, তাই এখন আপনি যদি অ-মানক আইকন প্যাক সক্ষম করতে চান তবে আপনি 'কনফিগারেশন' বিভাগে সেগুলি সক্ষম করতে পারেন।",
    configPath: "হ্যামবার্গার আইকনে ক্লিক করুন",
    configPath2: "কনফিগারেশন অ্যাক্সেস করতে উপরের বাম দিকে।",
    canDisable: "আপনি চাইলে এই আচরণ নিষ্ক্রিয় করতে পারেন।",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "বিবরণ",
    style: "স্টাইল",
    notes: "নোট",
    notesModified: "নোট ●",
    close: "বন্ধ করুন",
    openLink: "লিঙ্ক খুলুন",
    caption: "ক্যাপশন",
    noCaption: "কোনো ক্যাপশন নেই।"
  },
  nodeInfoTab: {
    name: "নাম",
    namePlaceholder: "নোডের নাম…",
    removeLink: "লিঙ্ক সরান",
    addLink: "নামে লিঙ্ক যোগ করুন",
    linkPlaceholder: "https://…",
    caption: "ক্যাপশন",
    captionHint: "ক্যানভাসে নোডের নামের নিচে দেখানো হয়",
    openLink: "লিঙ্ক খুলুন"
  },
  nodeStyleTab: {
    icon: "আইকন",
    close: "বন্ধ করুন",
    change: "পরিবর্তন করুন…",
    iconSize: "আইকনের আকার",
    labelFontSize: "লেবেল ফন্ট আকার",
    labelColor: "লেবেলের রং",
    labelHeight: "লেবেলের উচ্চতা"
  },
  connectorControls: {
    close: "বন্ধ করুন",
    labels: "লেবেল"
  },
  textBoxControls: {
    close: "বন্ধ করুন",
    text: "পাঠ্য",
    textSize: "পাঠ্যের আকার",
    textColor: "পাঠ্যের রং",
    alignment: "সারিবদ্ধতা"
  },
  rectangleControls: {
    close: "বন্ধ করুন",
    color: "রং",
    useCustomColor: "কাস্টম রং ব্যবহার করুন"
  },
  labelColorPicker: {
    customColor: "কাস্টম রং"
  },
  deleteButton: {
    delete: "মুছুন"
  },
  nodeActionBar: {
    style: "স্টাইল",
    editName: "নাম সম্পাদনা করুন",
    editLink: "লিঙ্ক সম্পাদনা করুন",
    addLink: "লিঙ্ক যোগ করুন",
    editNotes: "নোট সম্পাদনা করুন",
    addNotes: "নোট যোগ করুন",
    startConnector: "Start connector",
    delete: "মুছুন"
  },
  quickAddNodePopover: {
    add: "যোগ করুন",
    rectangle: "গ্রুপ"
  },
  zoomControls: {
    zoomOut: "জুম আউট",
    zoomIn: "জুম ইন",
    fitToScreen: "স্ক্রিনে ফিট করুন",
    help: "সাহায্য (F1)"
  },
  labelSettings: {
    description: "লেবেল প্রদর্শন সেটিংস কনফিগার করুন",
    expandButtonPadding: "বিস্তার বোতাম প্যাডিং",
    expandButtonPaddingDesc: "বিস্তার বোতাম দৃশ্যমান হলে নিচের প্যাডিং (পাঠ্য ওভারল্যাপ প্রতিরোধ করে)"
  },
  iconSelectionControls: {
    close: "বন্ধ করুন",
    importIcons: "আইকন আমদানি করুন",
    isometricLabel: "আইসোমেট্রিক হিসেবে বিবেচনা করুন (3D দৃশ্য)",
    isometricHint: "সমতল আইকনের জন্য আনচেক করুন (লোগো, UI উপাদান)",
    dragHint: "আপনি নিচের যেকোনো আইটেম ক্যানভাসে টেনে নামাতে পারেন।"
  },
  searchbox: {
    placeholder: "আইকন খুঁজুন"
  },
  exportImageDialog: {
    title: "ছবি হিসেবে রপ্তানি করুন",
    compatibilityTitle: "ব্রাউজার সামঞ্জস্যতা বিজ্ঞপ্তি",
    compatibilityMessage: "সেরা ফলাফলের জন্য Chrome বা Edge ব্যবহার করুন। Firefox-এ বর্তমানে রপ্তানি বৈশিষ্ট্যের সাথে সামঞ্জস্যতার সমস্যা রয়েছে।",
    cropInstruction: "রপ্তানি করতে চান এমন অঞ্চল নির্বাচন করতে ক্লিক করুন এবং টেনে আনুন",
    options: "বিকল্প",
    showGrid: "গ্রিড দেখান",
    expandDescriptions: "বিবরণ প্রসারিত করুন",
    cropToContent: "বিষয়বস্তুতে ক্রপ করুন",
    backgroundColor: "পটভূমির রং",
    transparentBackground: "স্বচ্ছ পটভূমি",
    exportQuality: "রপ্তানি মান (DPI)",
    custom: "কাস্টম",
    recrop: "আবার ক্রপ করুন",
    cropApplied: "ক্রপ সফলভাবে প্রয়োগ হয়েছে",
    applyCrop: "ক্রপ প্রয়োগ করুন",
    clearSelection: "নির্বাচন সাফ করুন",
    cropHint: "ক্রপ করার জন্য একটি অঞ্চল নির্বাচন করুন, অথবা পুরো ছবি ব্যবহার করতে \"বিষয়বস্তুতে ক্রপ করুন\" আনচেক করুন",
    cancel: "বাতিল করুন",
    downloadSvg: "SVG হিসেবে ডাউনলোড করুন",
    downloadPng: "PNG হিসেবে ডাউনলোড করুন",
    error: "ছবি রপ্তানি করা যায়নি"
  },
  toolMenu: {
    undo: "Undo",
    redo: "Redo",
    select: "Select",
    lassoSelect: "Lasso select",
    freehandLasso: "Freehand lasso",
    pan: "Pan",
    addItem: "Add item",
    rectangle: "Rectangle",
    connector: "Connector",
    text: "Text"
  },
  quickIconSelector: {
    searchPlaceholder: "Search icons (press Enter to select)",
    recentlyUsed: "RECENTLY USED",
    searchResults: "SEARCH RESULTS ({count} icons)",
    noIconsFound: "No icons found matching \"{term}\"",
    helpSearch: "Use arrow keys to navigate • Enter to select • Double-click to select and close",
    helpBrowse: "Type to search • Click category to expand • Double-click to select and close"
  }
};

export default locale;
