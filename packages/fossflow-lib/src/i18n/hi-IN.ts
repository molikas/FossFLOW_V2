import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "यह एक उदाहरण पाठ है"
  },
  mainMenu: {
    undo: "पूर्ववत करें",
    redo: "फिर से करें",
    new: "New diagram",
    open: "खोलें",
    exportJson: "JSON के रूप में निर्यात करें",
    exportCompactJson: "संक्षिप्त JSON के रूप में निर्यात करें",
    exportImage: "छवि के रूप में निर्यात करें",
    clearCanvas: "कैनवास साफ़ करें",
    settings: "सेटिंग्स",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "कीबोर्ड शॉर्टकट और सहायता",
    close: "बंद करें",
    keyboardShortcuts: "कीबोर्ड शॉर्टकट",
    mouseInteractions: "माउस इंटरैक्शन",
    action: "क्रिया",
    shortcut: "शॉर्टकट",
    method: "विधि",
    description: "विवरण",
    note: "नोट:",
    noteContent: "टकराव से बचने के लिए इनपुट फ़ील्ड, टेक्स्ट एरिया या संपादन योग्य तत्वों में टाइप करते समय कीबोर्ड शॉर्टकट अक्षम हो जाते हैं।",
    // Keyboard shortcuts
    undoAction: "पूर्ववत करें",
    undoDescription: "अंतिम क्रिया को पूर्ववत करें",
    redoAction: "फिर से करें",
    redoDescription: "अंतिम पूर्ववत की गई क्रिया को फिर से करें",
    redoAltAction: "फिर से करें (वैकल्पिक)",
    redoAltDescription: "फिर से करने के लिए वैकल्पिक शॉर्टकट",
    helpAction: "सहायता",
    helpDescription: "कीबोर्ड शॉर्टकट के साथ सहायता संवाद खोलें",
    zoomInAction: "ज़ूम इन करें",
    zoomInShortcut: "माउस व्हील ऊपर",
    zoomInDescription: "कैनवास पर ज़ूम इन करें",
    zoomOutAction: "ज़ूम आउट करें",
    zoomOutShortcut: "माउस व्हील नीचे",
    zoomOutDescription: "कैनवास से ज़ूम आउट करें",
    panCanvasAction: "कैनवास को पैन करें",
    panCanvasShortcut: "बाएँ-क्लिक + ड्रैग",
    panCanvasDescription: "पैन मोड में कैनवास को पैन करें",
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
    selectToolAction: "चयन उपकरण",
    selectToolShortcut: "चयन बटन क्लिक करें",
    selectToolDescription: "चयन मोड पर स्विच करें",
    panToolAction: "पैन उपकरण",
    panToolShortcut: "पैन बटन क्लिक करें",
    panToolDescription: "कैनवास को स्थानांतरित करने के लिए पैन मोड पर स्विच करें",
    addItemAction: "आइटम जोड़ें",
    addItemShortcut: "आइटम जोड़ें बटन क्लिक करें",
    addItemDescription: "नए आइटम जोड़ने के लिए आइकन पिकर खोलें",
    drawRectangleAction: "आयत बनाएं",
    drawRectangleShortcut: "आयत बटन क्लिक करें",
    drawRectangleDescription: "आयत ड्राइंग मोड पर स्विच करें",
    createConnectorAction: "कनेक्टर बनाएं",
    createConnectorShortcut: "कनेक्टर बटन क्लिक करें",
    createConnectorDescription: "कनेक्टर मोड पर स्विच करें",
    addTextAction: "टेक्स्ट जोड़ें",
    addTextShortcut: "टेक्स्ट बटन क्लिक करें",
    addTextDescription: "एक नया टेक्स्ट बॉक्स बनाएं",
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
    tipCreatingConnectors: "टिप: कनेक्टर बनाना",
    tipConnectorTools: "टिप: कनेक्टर उपकरण",
    clickInstructionStart: "क्लिक करें",
    clickInstructionMiddle: "पहले नोड या बिंदु पर, फिर",
    clickInstructionEnd: "दूसरे नोड या बिंदु पर कनेक्शन बनाने के लिए।",
    nowClickTarget: "अब कनेक्शन पूरा करने के लिए लक्ष्य पर क्लिक करें।",
    dragStart: "ड्रैग करें",
    dragEnd: "पहले नोड से दूसरे नोड तक कनेक्शन बनाने के लिए।",
    rerouteStart: "कनेक्टर को पुनर्मार्गित करने के लिए,",
    rerouteMiddle: "बाएँ-क्लिक करें",
    rerouteEnd: "कनेक्टर लाइन के साथ किसी भी बिंदु पर और एंकर बिंदुओं को बनाने या स्थानांतरित करने के लिए ड्रैग करें।"
  },
  lassoHintTooltip: {
    tipLasso: "टिप: लासो चयन",
    tipFreehandLasso: "टिप: फ्रीहैंड लासो चयन",
    lassoDragStart: "क्लिक करें और ड्रैग करें",
    lassoDragEnd: "उन आइटम के चारों ओर एक आयताकार चयन बॉक्स बनाने के लिए जिन्हें आप चुनना चाहते हैं।",
    freehandDragStart: "क्लिक करें और ड्रैग करें",
    freehandDragMiddle: "एक बनाने के लिए",
    freehandDragEnd: "मुक्त आकार",
    freehandComplete: "आइटम के चारों ओर। आकार के अंदर सभी आइटम का चयन करने के लिए छोड़ें।",
    moveStart: "एक बार चयनित होने पर,",
    moveMiddle: "चयन के अंदर क्लिक करें",
    moveEnd: "और सभी चयनित आइटम को एक साथ स्थानांतरित करने के लिए ड्रैग करें।"
  },
  importHintTooltip: {
    title: "आरेख आयात करें",
    instructionStart: "आरेख आयात करने के लिए, क्लिक करें",
    menuButton: "मेनू बटन",
    instructionMiddle: "(☰) ऊपरी बाएँ कोने में, फिर चुनें",
    openButton: "\"खोलें\"",
    instructionEnd: "अपनी आरेख फ़ाइलें लोड करने के लिए।"
  },
  connectorRerouteTooltip: {
    title: "टिप: कनेक्टर्स को पुनर्मार्गित करें",
    instructionStart: "एक बार आपके कनेक्टर्स स्थापित हो जाने के बाद आप उन्हें अपनी इच्छानुसार पुनर्मार्गित कर सकते हैं।",
    instructionSelect: "कनेक्टर का चयन करें",
    instructionMiddle: "पहले, फिर",
    instructionClick: "कनेक्टर पथ पर क्लिक करें",
    instructionAnd: "और",
    instructionDrag: "ड्रैग करें",
    instructionEnd: "इसे बदलने के लिए!"
  },
  connectorEmptySpaceTooltip: {
    message: "इस कनेक्टर को एक नोड से कनेक्ट करने के लिए,",
    instruction: "कनेक्टर के अंत पर बाईं-क्लिक करें और इसे वांछित नोड पर खींचें।"
  },
  settings: {
    zoom: {
      description: "माउस व्हील का उपयोग करते समय ज़ूम व्यवहार को कॉन्फ़िगर करें।",
      zoomToCursor: "कर्सर पर ज़ूम करें",
      zoomToCursorDesc: "सक्षम होने पर, माउस कर्सर की स्थिति पर केंद्रित ज़ूम इन/आउट। अक्षम होने पर, ज़ूम कैनवास पर केंद्रित होता है।"
    },
    hotkeys: {
      title: "शॉर्टकट सेटिंग्स",
      profile: "शॉर्टकट प्रोफ़ाइल",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "कोई शॉर्टकट नहीं",
      tool: "उपकरण",
      hotkey: "शॉर्टकट",
      toolSelect: "चयन करें",
      toolPan: "पैन करें",
      toolAddItem: "आइटम जोड़ें",
      toolRectangle: "आयत",
      toolConnector: "कनेक्टर",
      toolText: "टेक्स्ट",
      note: "नोट: टेक्स्ट फ़ील्ड में टाइप न करने पर शॉर्टकट काम करते हैं",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "पैन सेटिंग्स",
      mousePanOptions: "माउस पैन विकल्प",
      emptyAreaClickPan: "खाली क्षेत्र पर क्लिक करें और ड्रैग करें",
      middleClickPan: "मध्य क्लिक करें और ड्रैग करें",
      rightClickPan: "राइट क्लिक करें और ड्रैग करें",
      ctrlClickPan: "Ctrl + क्लिक करें और ड्रैग करें",
      altClickPan: "Alt + क्लिक करें और ड्रैग करें",
      keyboardPanOptions: "कीबोर्ड पैन विकल्प",
      arrowKeys: "एरो कुंजी",
      wasdKeys: "WASD कुंजी",
      ijklKeys: "IJKL कुंजी",
      keyboardPanSpeed: "कीबोर्ड पैन गति",
      note: "नोट: समर्पित पैन उपकरण के अलावा पैन विकल्प काम करते हैं"
    },
    connector: {
      title: "कनेक्टर सेटिंग्स",
      connectionMode: "कनेक्शन निर्माण मोड",
      clickMode: "क्लिक मोड (अनुशंसित)",
      clickModeDesc: "पहले नोड पर क्लिक करें, फिर कनेक्शन बनाने के लिए दूसरे नोड पर क्लिक करें",
      dragMode: "ड्रैग मोड",
      dragModeDesc: "पहले नोड से दूसरे नोड तक क्लिक करें और ड्रैग करें",
      note: "नोट: आप किसी भी समय इस सेटिंग को बदल सकते हैं। जब कनेक्टर उपकरण सक्रिय होता है तो चयनित मोड का उपयोग किया जाएगा।"
    },
    iconPacks: {
      title: "आइकन पैक प्रबंधन",
      lazyLoading: "लेज़ी लोडिंग सक्षम करें",
      lazyLoadingDesc: "तेज़ स्टार्टअप के लिए आवश्यकता पर आइकन पैक लोड करें",
      availablePacks: "उपलब्ध आइकन पैक",
      coreIsoflow: "Core Isoflow (हमेशा लोड)",
      alwaysEnabled: "हमेशा सक्षम",
      awsPack: "AWS आइकन",
      gcpPack: "Google Cloud आइकन",
      azurePack: "Azure आइकन",
      kubernetesPack: "Kubernetes आइकन",
      loading: "लोड हो रहा है...",
      loaded: "लोड किया गया",
      notLoaded: "लोड नहीं किया गया",
      iconCount: "{count} आइकन",
      lazyLoadingDisabledNote: "लेज़ी लोडिंग अक्षम है। सभी आइकन पैक स्टार्टअप पर लोड किए जाते हैं।",
      note: "आइकन पैक आपकी आवश्यकताओं के आधार पर सक्षम या अक्षम किए जा सकते हैं। अक्षम पैक मेमोरी उपयोग को कम करेंगे और प्रदर्शन में सुधार करेंगे।"
    }
  },
  lazyLoadingWelcome: {
    title: "नई सुविधा: लेज़ी लोडिंग!",
    message: "अरे! लोकप्रिय मांग के बाद, हमने आइकन की लेज़ी लोडिंग लागू की है, इसलिए अब यदि आप गैर-मानक आइकन पैक सक्षम करना चाहते हैं तो आप उन्हें 'कॉन्फ़िगरेशन' अनुभाग में सक्षम कर सकते हैं।",
    configPath: "हैमबर्गर आइकन पर क्लिक करें",
    configPath2: "कॉन्फ़िगरेशन तक पहुंचने के लिए ऊपरी बाएं में।",
    canDisable: "यदि आप चाहें तो आप इस व्यवहार को अक्षम कर सकते हैं।",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "विवरण",
    style: "शैली",
    notes: "नोट्स",
    notesModified: "नोट्स ●",
    close: "बंद करें",
    openLink: "लिंक खोलें",
    caption: "कैप्शन",
    noCaption: "कोई कैप्शन नहीं।"
  },
  nodeInfoTab: {
    name: "नाम",
    namePlaceholder: "नोड का नाम…",
    removeLink: "लिंक हटाएं",
    addLink: "नाम में लिंक जोड़ें",
    linkPlaceholder: "https://…",
    caption: "कैप्शन",
    captionHint: "कैनवास पर नोड के नाम के नीचे दिखाया गया",
    openLink: "लिंक खोलें"
  },
  nodeStyleTab: {
    icon: "आइकन",
    close: "बंद करें",
    change: "बदलें…",
    iconSize: "आइकन का आकार",
    labelFontSize: "लेबल फ़ॉन्ट आकार",
    labelColor: "लेबल का रंग",
    labelHeight: "लेबल की ऊँचाई"
  },
  connectorControls: {
    close: "बंद करें",
    labels: "लेबल"
  },
  textBoxControls: {
    close: "बंद करें",
    text: "पाठ",
    textSize: "पाठ का आकार",
    textColor: "पाठ का रंग",
    alignment: "संरेखण"
  },
  rectangleControls: {
    close: "बंद करें",
    color: "रंग",
    useCustomColor: "कस्टम रंग उपयोग करें"
  },
  labelColorPicker: {
    customColor: "कस्टम रंग"
  },
  deleteButton: {
    delete: "हटाएं"
  },
  nodeActionBar: {
    style: "शैली",
    editName: "नाम संपादित करें",
    editLink: "लिंक संपादित करें",
    addLink: "लिंक जोड़ें",
    editNotes: "नोट्स संपादित करें",
    addNotes: "नोट्स जोड़ें",
    startConnector: "Start connector",
    delete: "हटाएं"
  },
  quickAddNodePopover: {
    add: "जोड़ें",
    group: "समूह"
  },
  zoomControls: {
    zoomOut: "ज़ूम आउट",
    zoomIn: "ज़ूम इन",
    fitToScreen: "स्क्रीन में फ़िट करें",
    help: "सहायता (F1)"
  },
  labelSettings: {
    description: "लेबल प्रदर्शन सेटिंग कॉन्फ़िगर करें",
    expandButtonPadding: "विस्तार बटन पैडिंग",
    expandButtonPaddingDesc: "विस्तार बटन दृश्यमान होने पर नीचे की पैडिंग (टेक्स्ट ओवरलैप रोकता है)"
  },
  iconSelectionControls: {
    close: "बंद करें",
    importIcons: "आइकन आयात करें",
    isometricLabel: "आइसोमेट्रिक के रूप में मानें (3D दृश्य)",
    isometricHint: "फ्लैट आइकन के लिए अनचेक करें (लोगो, UI तत्व)",
    dragHint: "आप नीचे दिए किसी भी आइटम को कैनवास पर खींच और छोड़ सकते हैं।"
  },
  searchbox: {
    placeholder: "आइकन खोजें"
  },
  exportImageDialog: {
    title: "छवि के रूप में निर्यात करें",
    compatibilityTitle: "ब्राउज़र संगतता सूचना",
    compatibilityMessage: "सर्वोत्तम परिणामों के लिए कृपया Chrome या Edge उपयोग करें। Firefox में वर्तमान में निर्यात सुविधा के साथ संगतता समस्याएं हैं।",
    cropInstruction: "निर्यात करने के लिए क्षेत्र चुनने हेतु क्लिक करें और खींचें",
    options: "विकल्प",
    showGrid: "ग्रिड दिखाएं",
    expandDescriptions: "विवरण विस्तृत करें",
    cropToContent: "सामग्री पर क्रॉप करें",
    backgroundColor: "पृष्ठभूमि रंग",
    transparentBackground: "पारदर्शी पृष्ठभूमि",
    exportQuality: "निर्यात गुणवत्ता (DPI)",
    custom: "कस्टम",
    recrop: "फिर से क्रॉप करें",
    cropApplied: "क्रॉप सफलतापूर्वक लागू किया गया",
    applyCrop: "क्रॉप लागू करें",
    clearSelection: "चयन साफ़ करें",
    cropHint: "क्रॉप करने के लिए क्षेत्र चुनें, या पूरी छवि उपयोग करने के लिए \"सामग्री पर क्रॉप करें\" अनचेक करें",
    cancel: "रद्द करें",
    downloadSvg: "SVG के रूप में डाउनलोड करें",
    downloadPng: "PNG के रूप में डाउनलोड करें",
    error: "छवि निर्यात नहीं हो सकी"
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
