import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'यह एक उदाहरण पाठ है'
  },
  rightSidebar: {
    collapsePanel: 'पैनल संक्षिप्त करें',
    emptyState: 'गुण देखने के लिए एक नोड, कनेक्टर या आकृति चुनें'
  },
  helpDialog: {
    title: 'कीबोर्ड शॉर्टकट और सहायता',
    close: 'बंद करें',
    keyboardShortcuts: 'कीबोर्ड शॉर्टकट',
    mouseInteractions: 'माउस इंटरैक्शन',
    action: 'क्रिया',
    shortcut: 'शॉर्टकट',
    method: 'विधि',
    description: 'विवरण',
    note: 'नोट:',
    noteContent:
      'टकराव से बचने के लिए इनपुट फ़ील्ड, टेक्स्ट एरिया या संपादन योग्य तत्वों में टाइप करते समय कीबोर्ड शॉर्टकट अक्षम हो जाते हैं।',
    // Keyboard shortcuts
    undoAction: 'पूर्ववत करें',
    undoDescription: 'अंतिम क्रिया को पूर्ववत करें',
    redoAction: 'फिर से करें',
    redoDescription: 'अंतिम पूर्ववत की गई क्रिया को फिर से करें',
    redoAltAction: 'फिर से करें (वैकल्पिक)',
    redoAltDescription: 'फिर से करने के लिए वैकल्पिक शॉर्टकट',
    helpAction: 'सहायता',
    helpDescription: 'कीबोर्ड शॉर्टकट के साथ सहायता संवाद खोलें',
    zoomInAction: 'ज़ूम इन करें',
    zoomInShortcut: 'माउस व्हील ऊपर',
    zoomInDescription: 'कैनवास पर ज़ूम इन करें',
    zoomOutAction: 'ज़ूम आउट करें',
    zoomOutShortcut: 'माउस व्हील नीचे',
    zoomOutDescription: 'कैनवास से ज़ूम आउट करें',
    panCanvasAction: 'कैनवास को पैन करें',
    panCanvasShortcut: 'बाएँ-क्लिक + ड्रैग',
    panCanvasDescription: 'पैन मोड में कैनवास को पैन करें',
    togglePanToolAction: 'पैन टूल टॉगल करें',
    togglePanToolShortcut: 'राइट-क्लिक',
    togglePanToolDescription:
      'पैन मोड चालू/बंद करें; चयन मोड में वापस जाने के लिए बाएँ-क्लिक करें',
    lassoSelectAction: 'लासो चयन',
    lassoSelectShortcut: 'बाएँ-क्लिक + ड्रैग (खाली क्षेत्र)',
    lassoSelectDescription: 'कई आइटम चुनने के लिए एक आयताकार चयन बॉक्स खींचें',
    deselectAction: 'चयन रद्द करें',
    deselectShortcut: 'बाएँ-क्लिक (खाली क्षेत्र)',
    deselectDescription: 'वर्तमान चयन रद्द करें और चयन मोड में वापस जाएं',
    // Mouse interactions
    selectToolAction: 'चयन उपकरण',
    selectToolShortcut: 'चयन बटन क्लिक करें',
    selectToolDescription: 'चयन मोड पर स्विच करें',
    panToolAction: 'पैन उपकरण',
    panToolShortcut: 'पैन बटन क्लिक करें',
    panToolDescription:
      'कैनवास को स्थानांतरित करने के लिए पैन मोड पर स्विच करें',
    addItemAction: 'आइटम जोड़ें',
    addItemShortcut: 'आइटम जोड़ें बटन क्लिक करें',
    addItemDescription: 'नए आइटम जोड़ने के लिए आइकन पिकर खोलें',
    drawRectangleAction: 'आयत बनाएं',
    drawRectangleShortcut: 'आयत बटन क्लिक करें',
    drawRectangleDescription: 'आयत ड्राइंग मोड पर स्विच करें',
    createConnectorAction: 'कनेक्टर बनाएं',
    createConnectorShortcut: 'कनेक्टर बटन क्लिक करें',
    createConnectorDescription: 'कनेक्टर मोड पर स्विच करें',
    addTextAction: 'टेक्स्ट जोड़ें',
    addTextShortcut: 'टेक्स्ट बटन क्लिक करें',
    addTextDescription: 'एक नया टेक्स्ट बॉक्स बनाएं',
    deleteSelectedAction: 'चयनित हटाएं',
    deleteSelectedShortcut: 'Delete (Mac पर Backspace)',
    deleteSelectedDescription:
      'चयनित आइटम या लासो चयन के सभी आइटम हटाएं; पूर्ववत/पुनः करें समर्थित है',
    cutAction: 'काटें',
    cutDescription:
      'चयनित आइटम क्लिपबोर्ड पर काटें — आइटम हटा दिए जाते हैं और कहीं और पेस्ट किए जा सकते हैं; पूर्ववत/पुनः करें समर्थित है',
    copyAction: 'कॉपी करें',
    copyDescription: 'चयनित आइटम क्लिपबोर्ड पर कॉपी करें',
    pasteAction: 'पेस्ट करें',
    pasteDescription:
      'क्लिपबोर्ड आइटम माउस की स्थिति पर पेस्ट करें; ओवरलैप से बचने के लिए ऑफसेट',
    // D10 — Select all row
    selectAllAction: 'सभी चुनें',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'सक्रिय दृश्य में सभी दृश्यमान, अनलॉक आइटम चुनें (आइटम, आयत, टेक्स्ट बॉक्स, कनेक्टर + उनके वेपॉइंट)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'नाम बदलें',
    keyRenameShortcut: 'F2',
    keyRenameDescription: 'चयनित आइटम या आरेख का नाम इनलाइन बदलें',
    keyAddItemAction: 'आइटम जोड़ें / एलिमेंट्स',
    keyAddItemShortcut: 'N',
    keyAddItemDescription: 'नया आइटम रखने के लिए एलिमेंट्स पैनल टॉगल करें',
    keyConnectorAction: 'कनेक्टर',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'कनेक्टर टूल पर स्विच करें',
    keyLassoAction: 'लासो चयन',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'लासो चयन टूल पर स्विच करें',
    keySelectAction: 'चुनें',
    keySelectShortcut: 'S',
    keySelectDescription: 'चयन टूल पर स्विच करें',
    // D10 — mouse interactions
    miSelectAction: 'चुनें',
    miSelectMethod: 'बायाँ-क्लिक',
    miSelectDescription:
      'किसी आइटम को चुनने के लिए उस पर क्लिक करें (इसे हाइलाइट करता है और फ़्लोटिंग एक्शन बार दिखाता है)। चयन हटाने के लिए खाली कैनवास पर क्लिक करें।',
    miOpenDetailsAction: 'विवरण खोलें',
    miOpenDetailsMethod: 'डबल-क्लिक',
    miOpenDetailsDescription:
      'किसी आइटम का विवरण पैनल खोलने के लिए उस पर डबल-क्लिक करें — संदर्भ मेनू की «विवरण…» प्रविष्टि के समान।',
    miToggleSelectionAction: 'चयन टॉगल करें',
    miToggleSelectionMethod: 'Ctrl/Cmd + बायाँ-क्लिक',
    miToggleSelectionDescription:
      'किसी आइटम को बहु-चयन में जोड़ें या हटाएँ; कनेक्टर अपने वेपॉइंट के साथ टॉगल होता है।',
    miPanAction: 'पैन करें',
    miPanMethod: 'दायाँ-क्लिक + खींचें',
    miPanDescription:
      'कैनवास को पैन करने के लिए दायाँ बटन दबाए रखें और खींचें। मध्य-बटन खींचने से भी पैन होता है; तीर कुंजियाँ इसे खिसकाती हैं।',
    miContextMenuAction: 'संदर्भ मेनू',
    miContextMenuMethod: 'दायाँ-क्लिक (टैप)',
    miContextMenuDescription:
      'बिना खींचे दायाँ-क्लिक संदर्भ मेनू खोलता है — किसी आइटम पर आइटम मेनू, या खाली स्थान पर कैनवास मेनू। टच पर, देर तक दबाएँ।',
    miRemoveWaypointAction: 'वेपॉइंट हटाएँ',
    miRemoveWaypointMethod: 'Alt + बायाँ-क्लिक',
    miRemoveWaypointDescription:
      'किसी कनेक्टर वेपॉइंट को हटाने के लिए Alt+क्लिक करें (पहले कनेक्टर चुनने की आवश्यकता नहीं); अंतिम-बिंदु एंकर सुरक्षित रहते हैं।',
    miZoomAction: 'ज़ूम',
    miZoomMethod: 'स्क्रॉल व्हील',
    miZoomDescription: 'कर्सर की ओर ज़ूम करने के लिए स्क्रॉल करें।'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'टिप: कनेक्टर बनाना',
    tipConnectorTools: 'टिप: कनेक्टर उपकरण',
    clickInstructionStart: 'क्लिक करें',
    clickInstructionMiddle: 'पहले नोड या बिंदु पर, फिर',
    clickInstructionEnd: 'दूसरे नोड या बिंदु पर कनेक्शन बनाने के लिए।',
    nowClickTarget: 'अब कनेक्शन पूरा करने के लिए लक्ष्य पर क्लिक करें।',
    dragStart: 'ड्रैग करें',
    dragEnd: 'पहले नोड से दूसरे नोड तक कनेक्शन बनाने के लिए।',
    rerouteStart: 'कनेक्टर को पुनर्मार्गित करने के लिए,',
    rerouteMiddle: 'बाएँ-क्लिक करें',
    rerouteEnd:
      'कनेक्टर लाइन के साथ किसी भी बिंदु पर और एंकर बिंदुओं को बनाने या स्थानांतरित करने के लिए ड्रैग करें।'
  },
  lassoHintTooltip: {
    tipLasso: 'टिप: लासो चयन',
    tipFreehandLasso: 'टिप: फ्रीहैंड लासो चयन',
    lassoDragStart: 'क्लिक करें और ड्रैग करें',
    lassoDragEnd:
      'उन आइटम के चारों ओर एक आयताकार चयन बॉक्स बनाने के लिए जिन्हें आप चुनना चाहते हैं।',
    freehandDragStart: 'क्लिक करें और ड्रैग करें',
    freehandDragMiddle: 'एक बनाने के लिए',
    freehandDragEnd: 'मुक्त आकार',
    freehandComplete:
      'आइटम के चारों ओर। आकार के अंदर सभी आइटम का चयन करने के लिए छोड़ें।',
    moveStart: 'एक बार चयनित होने पर,',
    moveMiddle: 'चयन के अंदर क्लिक करें',
    moveEnd: 'और सभी चयनित आइटम को एक साथ स्थानांतरित करने के लिए ड्रैग करें।'
  },
  importHintTooltip: {
    title: 'आरेख आयात करें',
    instructionStart: 'आरेख आयात करने के लिए, क्लिक करें',
    menuButton: 'मेनू बटन',
    instructionMiddle: '(☰) ऊपरी बाएँ कोने में, फिर चुनें',
    openButton: '"खोलें"',
    instructionEnd: 'अपनी आरेख फ़ाइलें लोड करने के लिए।'
  },
  connectorRerouteTooltip: {
    title: 'टिप: कनेक्टर्स को पुनर्मार्गित करें',
    instructionStart:
      'एक बार आपके कनेक्टर्स स्थापित हो जाने के बाद आप उन्हें अपनी इच्छानुसार पुनर्मार्गित कर सकते हैं।',
    instructionSelect: 'कनेक्टर का चयन करें',
    instructionMiddle: 'पहले, फिर',
    instructionClick: 'कनेक्टर पथ पर क्लिक करें',
    instructionAnd: 'और',
    instructionDrag: 'ड्रैग करें',
    instructionEnd: 'इसे बदलने के लिए!'
  },
  connectorEmptySpaceTooltip: {
    message: 'इस कनेक्टर को एक नोड से कनेक्ट करने के लिए,',
    instruction:
      'कनेक्टर के अंत पर बाईं-क्लिक करें और इसे वांछित नोड पर खींचें।'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'सेटिंग्स',
    close: 'बंद करें',
    canvas: 'कैनवास',
    language: 'भाषा',
    about: 'परिचय',
    languageDescription: 'एप्लिकेशन इंटरफ़ेस के लिए प्रदर्शन भाषा चुनें।',
    zoomSection: 'ज़ूम',
    labelsSection: 'लेबल',
    zoom: {
      description:
        'माउस व्हील का उपयोग करते समय ज़ूम व्यवहार को कॉन्फ़िगर करें।',
      zoomToCursor: 'कर्सर पर ज़ूम करें',
      zoomToCursorDesc:
        'सक्षम होने पर, माउस कर्सर की स्थिति पर केंद्रित ज़ूम इन/आउट। अक्षम होने पर, ज़ूम कैनवास पर केंद्रित होता है।'
    },
    hotkeys: {
      title: 'शॉर्टकट सेटिंग्स',
      profile: 'शॉर्टकट प्रोफ़ाइल',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'कोई शॉर्टकट नहीं',
      tool: 'उपकरण',
      hotkey: 'शॉर्टकट',
      toolSelect: 'चयन करें',
      toolPan: 'पैन करें',
      toolAddItem: 'आइटम जोड़ें',
      toolRectangle: 'आयत',
      toolConnector: 'कनेक्टर',
      toolText: 'टेक्स्ट',
      note: 'नोट: टेक्स्ट फ़ील्ड में टाइप न करने पर शॉर्टकट काम करते हैं',
      fixedShortcutsTitle: 'स्थायी शॉर्टकट (हमेशा सक्रिय)',
      fixedCut: 'काटें',
      fixedCopy: 'कॉपी करें',
      fixedPaste: 'पेस्ट करें',
      fixedUndo: 'पूर्ववत करें',
      fixedRedo: 'फिर से करें'
    },
    connector: {
      title: 'कनेक्टर सेटिंग्स',
      connectionMode: 'कनेक्शन निर्माण मोड',
      clickMode: 'क्लिक मोड (अनुशंसित)',
      clickModeDesc:
        'पहले नोड पर क्लिक करें, फिर कनेक्शन बनाने के लिए दूसरे नोड पर क्लिक करें',
      dragMode: 'ड्रैग मोड',
      dragModeDesc: 'पहले नोड से दूसरे नोड तक क्लिक करें और ड्रैग करें',
      note: 'नोट: आप किसी भी समय इस सेटिंग को बदल सकते हैं। जब कनेक्टर उपकरण सक्रिय होता है तो चयनित मोड का उपयोग किया जाएगा।'
    },
    iconPacks: {
      title: 'आइकन पैक प्रबंधन',
      lazyLoading: 'लेज़ी लोडिंग सक्षम करें',
      lazyLoadingDesc: 'तेज़ स्टार्टअप के लिए आवश्यकता पर आइकन पैक लोड करें',
      availablePacks: 'उपलब्ध आइकन पैक',
      coreIsoflow: 'Core Isoflow (हमेशा लोड)',
      alwaysEnabled: 'हमेशा सक्षम',
      awsPack: 'AWS आइकन',
      gcpPack: 'Google Cloud आइकन',
      azurePack: 'Azure आइकन',
      kubernetesPack: 'Kubernetes आइकन',
      loading: 'लोड हो रहा है...',
      loaded: 'लोड किया गया',
      notLoaded: 'लोड नहीं किया गया',
      iconCount: '{count} आइकन',
      lazyLoadingDisabledNote:
        'लेज़ी लोडिंग अक्षम है। सभी आइकन पैक स्टार्टअप पर लोड किए जाते हैं।',
      note: 'आइकन पैक आपकी आवश्यकताओं के आधार पर सक्षम या अक्षम किए जा सकते हैं। अक्षम पैक मेमोरी उपयोग को कम करेंगे और प्रदर्शन में सुधार करेंगे।'
    }
  },
  lazyLoadingWelcome: {
    title: 'Axoview में आपका स्वागत है',
    message:
      'Axoview सुंदर आइसोमेट्रिक और 2D डायग्राम बनाने के लिए एक निःशुल्क, ओपन-सोर्स टूल है — क्लाउड, नेटवर्क और इंफ्रास्ट्रक्चर आर्किटेक्चर, जिसमें AWS, GCP, Azure और Kubernetes आइकन पहले से मौजूद हैं। यह सब आपके ब्राउज़र में चलता है, और स्थानीय रूप से या आपकी अपनी Google Drive में सहेजता है। ओपन-सोर्स FossFLOW और Isoflow प्रोजेक्ट्स पर आधारित और सक्रिय रूप से विस्तारित — सोर्स देखें, बग रिपोर्ट करें या कोई फ़ीचर github.com/molikas/axoview पर अनुरोध करें।',
    configPath: 'हैमबर्गर आइकन पर क्लिक करें',
    configPath2: 'कॉन्फ़िगरेशन तक पहुंचने के लिए ऊपरी बाएं में।',
    canDisable: 'यदि आप चाहें तो आप इस व्यवहार को अक्षम कर सकते हैं।',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'पृष्ठ जोड़ें',
    deletePage: 'पृष्ठ हटाएं',
    renameDiagram: 'आरेख का नाम बदलें',
    addPageDisabled: 'पृष्ठ सीमा पहुंच गई (5)'
  },
  nodePanel: {
    notes: 'नोट्स',
    close: 'बंद करें'
  },
  nodeDeck: {
    metadata: 'मेटाडेटा',
    name: 'नाम',
    namePlaceholder: 'नोड का नाम…',
    label: 'लेबल',
    labelPlaceholder: 'आकृति पर दिखाया गया लेबल…'
  },
  connectorControls: {
    metadata: 'मेटाडेटा',
    close: 'बंद करें',
    notes: 'नोट्स',
    name: 'नाम',
    namePlaceholder: 'किनारे का लेबल…',
    labels: 'लेबल',
    addLabel: 'लेबल जोड़ें',
    noLabels: 'अभी कोई लेबल नहीं।',
    labelN: 'लेबल {count}',
    positionHint:
      'किसी लेबल को स्थिति में रखने के लिए उसे कैनवास पर खींचें; उसके पाठ के आकार और रंग के लिए ऊपरी बार का उपयोग करें।',
    line: 'रेखा',
    line1: 'रेखा 1',
    line2: 'रेखा 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'खोजें या लिंक पेस्ट करें',
    linkCopy: 'लिंक कॉपी करें',
    linkCopied: 'कॉपी हो गया',
    linkEdit: 'लिंक संपादित करें',
    linkRemove: 'लिंक हटाएं',
    placeholder: 'कुछ लिखें',
    metadata: 'मेटाडेटा',
    notes: 'नोट्स',
    close: 'बंद करें',
    name: 'नाम',
    namePlaceholder: 'तत्व का नाम…'
  },
  rectangleControls: {
    metadata: 'मेटाडेटा',
    notes: 'नोट्स',
    close: 'बंद करें',
    name: 'नाम',
    namePlaceholder: 'तत्व का नाम…'
  },
  topBarStyleControls: {
    mixed: 'मिश्रित',
    rotate90: '90° घुमाएं',
    noColor: 'कोई रंग नहीं',
    pickColorFromScreen: 'स्क्रीन से रंग चुनें',
    customColor: 'कस्टम रंग',
    textSize: 'पाठ का आकार',
    lineSpacing: 'पंक्ति रिक्ति',
    alignment: 'संरेखण',
    alignmentDisabled: 'पाठ संरेखित करने के लिए एक टेक्स्ट बॉक्स चुनें',
    alignLeft: 'बाएँ संरेखित करें',
    alignCenter: 'केंद्र में रखें',
    alignRight: 'दाएँ संरेखित करें',
    alignTop: 'ऊपर संरेखित करें',
    alignMiddle: 'मध्य में संरेखित करें',
    alignBottom: 'नीचे संरेखित करें',
    textColor: 'पाठ का रंग',
    textColorDisabled:
      'पाठ का रंग सेट करने के लिए एक नोड, टेक्स्ट बॉक्स, लेबल या कनेक्शन लेबल चुनें',
    textSizeDisabled:
      'पाठ का आकार सेट करने के लिए एक नोड, टेक्स्ट बॉक्स, लेबल या कनेक्शन लेबल चुनें',
    labelSizeAllSelected: 'लेबल का आकार (सभी चयनित)',
    textColorAllSelected: 'पाठ का रंग (सभी चयनित)',
    armedToolPlaceFirst:
      'नया एलिमेंट डिफ़ॉल्ट स्टाइल उपयोग करता है — पहले उसे रखें, फिर यहाँ स्टाइल करें',
    decreaseLabelSize: 'लेबल का आकार घटाएं',
    increaseLabelSize: 'लेबल का आकार बढ़ाएं',
    labelSize: 'लेबल का आकार',
    decreaseSize: 'आकार घटाएं',
    increaseSize: 'आकार बढ़ाएं',
    stepAll: 'सभी को समायोजित करें',
    size: 'आकार',
    bold: 'बोल्ड',
    italic: 'इटैलिक',
    underline: 'रेखांकित',
    strikethrough: 'स्ट्राइकथ्रू',
    format: 'बोल्ड / इटैलिक / रेखांकित / स्ट्राइकथ्रू',
    formatDisabled:
      'पाठ को फ़ॉर्मैट करने के लिए एक नोड, टेक्स्ट बॉक्स, लेबल या कनेक्शन लेबल चुनें',
    lists: 'सूचियाँ',
    listsDisabled: 'सूचियों का उपयोग करने के लिए एक टेक्स्ट बॉक्स चुनें',
    bulletList: 'बुलेट सूची',
    numberedList: 'क्रमांकित सूची',
    background: 'पृष्ठभूमि रंग',
    backgroundDisabled:
      'पृष्ठभूमि रंग सेट करने के लिए एक आयत, लेबल या टेक्स्ट बॉक्स चुनें',
    opacity: 'अपारदर्शिता',
    border: 'सीमा',
    borderDisabled: 'बॉर्डर सेट करने के लिए एक आयत या टेक्स्ट बॉक्स चुनें',
    lineStyle: 'रेखा शैली',
    width: 'चौड़ाई',
    borderColor: 'सीमा का रंग',
    link: 'लिंक',
    linkDisabled: 'लिंक जोड़ने के लिए एक नोड, कनेक्शन या लेबल चुनें',
    linkSelection: 'चयनित पाठ को लिंक करें',
    linkDisabledTextBox: 'लिंक जोड़ने के लिए संपादन करते समय पाठ चुनें',
    linkToWeb: 'वेब से लिंक करें',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'आरेख से लिंक करें',
    searchDiagrams: 'आरेख खोजें…',
    openLinkedDiagram: 'लिंक किया गया आरेख खोलें',
    showLabel: 'लेबल दिखाएं',
    hideLabel: 'लेबल छुपाएं',
    showHideLabelDisabled:
      'लेबल दिखाने या छुपाने के लिए एक नोड या कनेक्शन चुनें',
    changeIconBulk: 'आइकन बदलना एक समय में एक नोड पर लागू होता है',
    changeIcon: 'आइकन बदलें',
    changeIconDisabled: 'आइकन बदलने के लिए एक नोड चुनें',
    connectionColorPredraw: 'आपके द्वारा बनाए जाने वाले अगले कनेक्शन का रंग',
    connectionColor: 'कनेक्शन का रंग',
    connectionColorDisabled:
      'रंग सेट करने के लिए एक कनेक्शन (या कनेक्टर उपकरण) चुनें',
    lineOptionsPredraw: 'आपके द्वारा बनाए जाने वाले अगले कनेक्शन की रेखा शैली',
    lineOptions: 'रेखा विकल्प',
    lineOptionsDisabled:
      'रेखा विकल्प सेट करने के लिए एक कनेक्शन (या कनेक्टर उपकरण) चुनें',
    lineType: 'रेखा प्रकार',
    showArrow: 'तीर दिखाएं',
    showDottedLine: 'बिंदीदार रेखा दिखाएं'
  },
  quickAddNodePopover: {
    add: 'जोड़ें',
    rectangle: 'समूह'
  },
  zoomControls: {
    zoomOut: 'ज़ूम आउट',
    zoomIn: 'ज़ूम इन',
    fitToScreen: 'स्क्रीन में फ़िट करें',
    keepLabelsReadable: 'लेबल पठनीय रखें',
    help: 'सहायता (F1)',
    selected: '{count} चयनित'
  },
  modeHints: {
    connector:
      'कनेक्ट करने के लिए आइटम के बीच ड्रैग करें • रद्द करने के लिए Esc',
    textBox: 'टेक्स्ट बॉक्स रखने के लिए क्लिक करें • रद्द करने के लिए Esc',
    label: 'लेबल रखने के लिए क्लिक करें • रद्द करने के लिए Esc',
    rectangle: 'आयत बनाने के लिए खींचें • रद्द करने के लिए Esc'
  },
  previewLayerSwitcher: {
    layers: 'परतें',
    showLayer: 'परत दिखाएं',
    hideLayer: 'परत छिपाएं',
    solo: 'सोलो',
    unsolo: 'सोलो से बाहर'
  },
  previewLabelsToggle: {
    hideLabels: 'लेबल छिपाएं',
    showLabels: 'लेबल दिखाएं'
  },
  annotationPalette: {
    pen: 'व्याख्या',
    select: 'चुनें',
    draw: 'ड्रॉ',
    shapes: 'आकृतियाँ',
    pencil: 'पेंसिल',
    highlighter: 'हाइलाइटर',
    line: 'रेखा',
    arrow: 'तीर',
    rectangle: 'आयत',
    ellipse: 'दीर्घवृत्त',
    eraser: 'इरेज़र',
    undo: 'पूर्ववत करें',
    redo: 'फिर से करें',
    clear: 'सब हटाएं'
  },
  viewModeInfoPopover: {
    close: 'बंद करें'
  },
  labelSettings: {
    description: 'लेबल प्रदर्शन सेटिंग कॉन्फ़िगर करें',
    expandButtonPadding: 'विस्तार बटन पैडिंग',
    expandButtonPaddingDesc:
      'विस्तार बटन दृश्यमान होने पर नीचे की पैडिंग (टेक्स्ट ओवरलैप रोकता है)',
    // D13
    currentValue: 'वर्तमान: {value} थीम इकाइयाँ'
  },
  iconSelectionControls: {
    close: 'बंद करें',
    importIcons: 'आइकन आयात करें',
    addMoreIcons: 'और आइकन जोड़ें',
    isometricLabel: 'आइसोमेट्रिक के रूप में मानें (3D दृश्य)',
    isometricHint: 'फ्लैट आइकन के लिए अनचेक करें (लोगो, UI तत्व)',
    dragHint: 'आप नीचे दिए किसी भी आइटम को कैनवास पर खींच और छोड़ सकते हैं।',
    aiPromptTooltip: 'AI से आइकन बनाएं',
    aiPromptTitle: 'AI से आइसोमेट्रिक आइकन बनाएं',
    aiPromptBody:
      "इस प्रॉम्प्ट को किसी इमेज जनरेट करने वाली AI में पेस्ट करें। 'my object' को आवश्यकतानुसार बदलें, फिर बने PNG को इम्पोर्ट करें।",
    aiPromptCopy: 'प्रॉम्प्ट कॉपी करें',
    aiPromptCopied: 'कॉपी हुआ'
  },
  searchbox: {
    placeholder: 'आइकन खोजें'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'छवि के रूप में निर्यात करें',
    compatibilityTitle: 'ब्राउज़र संगतता सूचना',
    compatibilityMessage:
      'सर्वोत्तम परिणामों के लिए कृपया Chrome या Edge उपयोग करें। Firefox में वर्तमान में निर्यात सुविधा के साथ संगतता समस्याएं हैं।',
    cropInstruction:
      'निर्यात करने के लिए क्षेत्र चुनने हेतु क्लिक करें और खींचें',
    options: 'विकल्प',
    showGrid: 'ग्रिड दिखाएं',
    showLabels: 'लेबल दिखाएं',
    screenshotPreset: 'स्क्रीनशॉट (अनुशंसित)',
    scaleClamped:
      'ब्राउज़र छवि सीमा में फिट करने के लिए निर्यात आकार घटाया गया:',
    cropToContent: 'सामग्री पर क्रॉप करें',
    backgroundColor: 'पृष्ठभूमि रंग',
    transparentBackground: 'पारदर्शी पृष्ठभूमि',
    exportQuality: 'निर्यात गुणवत्ता (DPI)',
    custom: 'कस्टम',
    recrop: 'फिर से क्रॉप करें',
    cropApplied: 'क्रॉप सफलतापूर्वक लागू किया गया',
    applyCrop: 'क्रॉप लागू करें',
    clearSelection: 'चयन साफ़ करें',
    cropHint:
      'क्रॉप करने के लिए क्षेत्र चुनें, या पूरी छवि उपयोग करने के लिए "सामग्री पर क्रॉप करें" अनचेक करें',
    cancel: 'रद्द करें',
    downloadSvg: 'SVG के रूप में डाउनलोड करें',
    downloadPng: 'PNG के रूप में डाउनलोड करें',
    error: 'छवि निर्यात नहीं हो सकी'
  },
  toolMenu: {
    label: 'Label',
    undo: 'पूर्ववत करें',
    redo: 'फिर से करें',
    select: 'चयन करें',
    lassoSelect: 'लासो चयन',
    freehandLasso: 'फ्रीहैंड लासो',
    pan: 'पैन करें',
    addItem: 'आइटम जोड़ें',
    rectangle: 'आयत',
    connector: 'कनेक्टर',
    text: 'पाठ',
    common: 'सामान्य',
    // D5
    switchTo2D: '2D दृश्य पर स्विच करें',
    switchToIsometric: 'आइसोमेट्रिक दृश्य पर स्विच करें',
    clickMode: 'क्लिक',
    dragMode: 'खींचें'
  },
  quickIconSelector: {
    recentlyUsed: 'हाल ही में उपयोग किए गए',
    searchResults: 'खोज परिणाम ({count} आइकन)',
    noIconsFound: '"{term}" से मेल खाने वाला कोई आइकन नहीं मिला'
  },
  canvasContextMenu: {
    addNote: 'नोट जोड़ें',
    addLabel: 'लेबल जोड़ें',
    details: 'विवरण…',
    rename: 'नाम बदलें',
    cut: 'काटें',
    copy: 'कॉपी करें',
    paste: 'पेस्ट करें',
    duplicate: 'डुप्लिकेट करें',
    bringForward: 'आगे लाएँ',
    sendBackward: 'पीछे भेजें',
    bringToFront: 'सबसे आगे लाएँ',
    sendToBack: 'सबसे पीछे भेजें',
    assignToLayer: 'परत को असाइन करें',
    fitToText: 'पाठ के अनुसार समायोजित करें',
    snapToGrid: 'ग्रिड पर स्नैप करें',
    unsnapFromGrid: 'ग्रिड से अनस्नैप करें',
    disableCollision: 'टकराव अक्षम करें',
    enableCollision: 'टकराव सक्षम करें',
    delete: 'हटाएँ',
    addItem: 'आइटम जोड़ें',
    selectAll: 'सभी चुनें',
    enableSnapToGrid: 'ग्रिड स्नैप सक्षम करें',
    disableSnapToGrid: 'ग्रिड स्नैप अक्षम करें',
    itemsSelectedOne: '{count} आइटम चयनित',
    itemsSelectedOther: '{count} आइटम चयनित',
    deleteItemsOne: '{count} आइटम हटाएँ',
    deleteItemsOther: '{count} आइटम हटाएँ',
    removeFromLayer: 'परत से हटाएँ',
    noLayers: 'कोई परत नहीं — परत पैनल में एक जोड़ें'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'फ़ाइल एक्सप्लोरर',
    elements: 'तत्व',
    layers: 'परतें',
    settings: 'सेटिंग्स',
    openDiagramFirst: 'पहले कोई आरेख खोलें या बनाएं',
    collapsePanel: 'पैनल छिपाएँ'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: 'लेयर हटाएं?',
    deleteLayerBody: 'इस लेयर में {count} एलिमेंट हैं। उनका क्या किया जाए?',
    deleteLayerHiddenWarning: 'यह लेयर छिपी हुई है। सामग्री रखने पर वह फिर से दिखने लगेगी — बिना लेयर वाला एलिमेंट हमेशा दिखता है।',
    deleteLayerCancel: 'रद्द करें',
    deleteLayerKeep: 'सामग्री रखें',
    deleteLayerDeleteContents: 'सामग्री भी हटाएं',
    header: 'परतें',
    addLayer: 'परत जोड़ें',
    deleteSelectedLayer: 'चयनित परत हटाएं',
    noLayersYet: 'अभी तक कोई परत नहीं। जोड़ने के लिए + पर क्लिक करें।',
    unassigned: 'अनिर्दिष्ट ({count})',
    dropToUnassign: 'असाइन हटाने के लिए आइटम यहां छोड़ें',
    layerN: 'परत {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} आइटम कॉपी किया गया',
    copiedOther: '{count} आइटम कॉपी किए गए',
    cutOne: '{count} आइटम कट किया गया',
    cutOther: '{count} आइटम कट किए गए',
    pastedOne: '{count} आइटम पेस्ट किया गया',
    pastedOther: '{count} आइटम पेस्ट किए गए',
    nothingToPaste: 'पेस्ट करने के लिए कुछ नहीं',
    routingConnectors: 'पेस्ट हो रहा है… कनेक्टर रूट हो रहे हैं ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'पृष्ठ {count}'
  }
};

export default locale;
