import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'এটি একটি উদাহরণ পাঠ্য'
  },
  rightSidebar: {
    collapsePanel: 'প্যানেল সঙ্কুচিত করুন',
    emptyState: 'বৈশিষ্ট্য দেখতে একটি নোড, সংযোগকারী বা আকৃতি নির্বাচন করুন'
  },
  helpDialog: {
    title: 'কীবোর্ড শর্টকাট এবং সহায়তা',
    close: 'বন্ধ করুন',
    keyboardShortcuts: 'কীবোর্ড শর্টকাট',
    mouseInteractions: 'মাউস ইন্টারঅ্যাকশন',
    action: 'ক্রিয়া',
    shortcut: 'শর্টকাট',
    method: 'পদ্ধতি',
    description: 'বিবরণ',
    note: 'নোট:',
    noteContent:
      'দ্বন্দ্ব এড়াতে ইনপুট ফিল্ড, টেক্সট এরিয়া বা সম্পাদনাযোগ্য উপাদানে টাইপ করার সময় কীবোর্ড শর্টকাট নিষ্ক্রিয় থাকে।',
    // Keyboard shortcuts
    undoAction: 'পূর্বাবস্থায় ফেরান',
    undoDescription: 'শেষ ক্রিয়াটি পূর্বাবস্থায় ফেরান',
    redoAction: 'পুনরায় করুন',
    redoDescription: 'শেষ পূর্বাবস্থায় ফেরানো ক্রিয়া পুনরায় করুন',
    redoAltAction: 'পুনরায় করুন (বিকল্প)',
    redoAltDescription: 'পুনরায় করার জন্য বিকল্প শর্টকাট',
    helpAction: 'সহায়তা',
    helpDescription: 'কীবোর্ড শর্টকাট সহ সহায়তা ডায়ালগ খুলুন',
    zoomInAction: 'জুম ইন করুন',
    zoomInShortcut: 'মাউস হুইল উপরে',
    zoomInDescription: 'ক্যানভাসে জুম ইন করুন',
    zoomOutAction: 'জুম আউট করুন',
    zoomOutShortcut: 'মাউস হুইল নিচে',
    zoomOutDescription: 'ক্যানভাস থেকে জুম আউট করুন',
    panCanvasAction: 'ক্যানভাস প্যান করুন',
    panCanvasShortcut: 'বাম-ক্লিক + টেনে আনুন',
    panCanvasDescription: 'প্যান মোডে ক্যানভাস প্যান করুন',
    togglePanToolAction: 'প্যান টুল টগল করুন',
    togglePanToolShortcut: 'ডান-ক্লিক',
    togglePanToolDescription:
      'প্যান মোড চালু/বন্ধ করুন; নির্বাচন মোডে ফিরতে বাম-ক্লিক করুন',
    lassoSelectAction: 'ল্যাসো নির্বাচন',
    lassoSelectShortcut: 'বাম-ক্লিক + টেনে আনুন (খালি এলাকা)',
    lassoSelectDescription:
      'একাধিক আইটেম নির্বাচন করতে একটি আয়তক্ষেত্রাকার নির্বাচন বক্স আঁকুন',
    deselectAction: 'নির্বাচন বাতিল করুন',
    deselectShortcut: 'বাম-ক্লিক (খালি এলাকা)',
    deselectDescription: 'বর্তমান নির্বাচন বাতিল করুন এবং নির্বাচন মোডে ফিরুন',
    // Mouse interactions
    selectToolAction: 'নির্বাচন টুল',
    selectToolShortcut: 'নির্বাচন বোতামে ক্লিক করুন',
    selectToolDescription: 'নির্বাচন মোডে স্যুইচ করুন',
    panToolAction: 'প্যান টুল',
    panToolShortcut: 'প্যান বোতামে ক্লিক করুন',
    panToolDescription: 'ক্যানভাস সরানোর জন্য প্যান মোডে স্যুইচ করুন',
    addItemAction: 'আইটেম যোগ করুন',
    addItemShortcut: 'আইটেম যোগ করুন বোতামে ক্লিক করুন',
    addItemDescription: 'নতুন আইটেম যোগ করতে আইকন পিকার খুলুন',
    drawRectangleAction: 'আয়তক্ষেত্র আঁকুন',
    drawRectangleShortcut: 'আয়তক্ষেত্র বোতামে ক্লিক করুন',
    drawRectangleDescription: 'আয়তক্ষেত্র অঙ্কন মোডে স্যুইচ করুন',
    createConnectorAction: 'সংযোগকারী তৈরি করুন',
    createConnectorShortcut: 'সংযোগকারী বোতামে ক্লিক করুন',
    createConnectorDescription: 'সংযোগকারী মোডে স্যুইচ করুন',
    addTextAction: 'পাঠ্য যোগ করুন',
    addTextShortcut: 'পাঠ্য বোতামে ক্লিক করুন',
    addTextDescription: 'একটি নতুন টেক্সট বক্স তৈরি করুন',
    deleteSelectedAction: 'নির্বাচিত মুছুন',
    deleteSelectedShortcut: 'Delete (Mac-এ Backspace)',
    deleteSelectedDescription:
      'নির্বাচিত আইটেম বা ল্যাসো নির্বাচনের সমস্ত আইটেম মুছুন; পূর্বাবস্থায় ফেরা/পুনরায় করা সমর্থন করে',
    cutAction: 'কাটুন',
    cutDescription:
      'নির্বাচিত আইটেম ক্লিপবোর্ডে কাটুন — আইটেম সরানো হবে এবং অন্য জায়গায় পেস্ট করা যাবে; পূর্বাবস্থায় ফেরা/পুনরায় করা সমর্থন করে',
    copyAction: 'কপি করুন',
    copyDescription: 'নির্বাচিত আইটেম ক্লিপবোর্ডে কপি করুন',
    pasteAction: 'পেস্ট করুন',
    pasteDescription:
      'ক্লিপবোর্ড আইটেম মাউস অবস্থানে পেস্ট করুন; ওভারল্যাপ এড়াতে অফসেট',
    // D10 — Select all row
    selectAllAction: 'সব নির্বাচন করুন',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'সক্রিয় ভিউতে সমস্ত দৃশ্যমান, আনলক করা আইটেম নির্বাচন করুন (আইটেম, আয়তক্ষেত্র, টেক্সট বক্স, কানেক্টর + তাদের ওয়েপয়েন্ট)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'নাম পরিবর্তন',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'নির্বাচিত আইটেম বা ডায়াগ্রামের নাম ইনলাইন পরিবর্তন করুন',
    keyAddItemAction: 'আইটেম যোগ করুন / এলিমেন্ট',
    keyAddItemShortcut: 'N',
    keyAddItemDescription: 'নতুন আইটেম রাখতে এলিমেন্ট প্যানেল টগল করুন',
    keyConnectorAction: 'কানেক্টর',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'কানেক্টর টুলে স্যুইচ করুন',
    keyLassoAction: 'ল্যাসো নির্বাচন',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'ল্যাসো নির্বাচন টুলে স্যুইচ করুন',
    keySelectAction: 'নির্বাচন',
    keySelectShortcut: 'S',
    keySelectDescription: 'নির্বাচন টুলে স্যুইচ করুন',
    // D10 — mouse interactions
    miSelectAction: 'নির্বাচন',
    miSelectMethod: 'বাম-ক্লিক',
    miSelectDescription:
      'একটি আইটেম নির্বাচন করতে ক্লিক করুন (এটি হাইলাইট করে এবং ভাসমান অ্যাকশন বার দেখায়)। নির্বাচন মুছতে খালি ক্যানভাসে ক্লিক করুন।',
    miOpenDetailsAction: 'বিবরণ খুলুন',
    miOpenDetailsMethod: 'ডবল-ক্লিক',
    miOpenDetailsDescription:
      'একটি আইটেমের বিবরণ প্যানেল খুলতে ডবল-ক্লিক করুন — কনটেক্সট মেনুর «বিবরণ…» এন্ট্রির মতোই।',
    miToggleSelectionAction: 'নির্বাচন টগল করুন',
    miToggleSelectionMethod: 'Ctrl/Cmd + বাম-ক্লিক',
    miToggleSelectionDescription:
      'বহু-নির্বাচন থেকে একটি আইটেম যোগ বা সরান; একটি কানেক্টর তার ওয়েপয়েন্টসহ টগল হয়।',
    miPanAction: 'প্যান',
    miPanMethod: 'ডান-ক্লিক + টেনে আনুন',
    miPanDescription:
      'ক্যানভাস প্যান করতে ডান বোতাম ধরে টেনে আনুন। মধ্য-বোতাম টানলেও প্যান হয়; তীর কী এটি সরায়।',
    miContextMenuAction: 'কনটেক্সট মেনু',
    miContextMenuMethod: 'ডান-ক্লিক (ট্যাপ)',
    miContextMenuDescription:
      'টেনে না এনে ডান-ক্লিক করলে কনটেক্সট মেনু খোলে — আইটেমের উপর আইটেম মেনু, বা খালি জায়গায় ক্যানভাস মেনু। টাচে, দীর্ঘক্ষণ চাপুন।',
    miRemoveWaypointAction: 'ওয়েপয়েন্ট সরান',
    miRemoveWaypointMethod: 'Alt + বাম-ক্লিক',
    miRemoveWaypointDescription:
      'একটি কানেক্টর ওয়েপয়েন্ট সরাতে Alt+ক্লিক করুন (প্রথমে কানেক্টর নির্বাচন করার দরকার নেই); প্রান্তের অ্যাঙ্কর সংরক্ষিত থাকে।',
    miZoomAction: 'জুম',
    miZoomMethod: 'স্ক্রল হুইল',
    miZoomDescription: 'কার্সারের দিকে জুম করতে স্ক্রল করুন।'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'টিপ: সংযোগকারী তৈরি করা',
    tipConnectorTools: 'টিপ: সংযোগকারী টুল',
    clickInstructionStart: 'ক্লিক করুন',
    clickInstructionMiddle: 'প্রথম নোড বা পয়েন্টে, তারপর',
    clickInstructionEnd: 'দ্বিতীয় নোড বা পয়েন্টে একটি সংযোগ তৈরি করতে।',
    nowClickTarget: 'সংযোগ সম্পূর্ণ করতে এখন লক্ষ্যে ক্লিক করুন।',
    dragStart: 'টেনে আনুন',
    dragEnd: 'প্রথম নোড থেকে দ্বিতীয় নোডে একটি সংযোগ তৈরি করতে।',
    rerouteStart: 'একটি সংযোগকারী পুনর্নির্দেশ করতে,',
    rerouteMiddle: 'বাম-ক্লিক করুন',
    rerouteEnd:
      'সংযোগকারী লাইনের সাথে যে কোনও পয়েন্টে এবং অ্যাঙ্কর পয়েন্ট তৈরি বা সরাতে টেনে আনুন।'
  },
  lassoHintTooltip: {
    tipLasso: 'টিপ: ল্যাসো নির্বাচন',
    tipFreehandLasso: 'টিপ: ফ্রিহ্যান্ড ল্যাসো নির্বাচন',
    lassoDragStart: 'ক্লিক করুন এবং টেনে আনুন',
    lassoDragEnd:
      'আপনি যে আইটেমগুলি নির্বাচন করতে চান তার চারপাশে একটি আয়তক্ষেত্রাকার নির্বাচন বক্স আঁকতে।',
    freehandDragStart: 'ক্লিক করুন এবং টেনে আনুন',
    freehandDragMiddle: 'একটি আঁকতে',
    freehandDragEnd: 'মুক্ত আকৃতি',
    freehandComplete:
      'আইটেমগুলির চারপাশে। আকৃতির ভিতরের সমস্ত আইটেম নির্বাচন করতে ছেড়ে দিন।',
    moveStart: 'একবার নির্বাচিত হলে,',
    moveMiddle: 'নির্বাচনের ভিতরে ক্লিক করুন',
    moveEnd: 'এবং সমস্ত নির্বাচিত আইটেম একসাথে সরাতে টেনে আনুন।'
  },
  importHintTooltip: {
    title: 'ডায়াগ্রাম আমদানি করুন',
    instructionStart: 'ডায়াগ্রাম আমদানি করতে, ক্লিক করুন',
    menuButton: 'মেনু বোতাম',
    instructionMiddle: '(☰) উপরের বাম কোণে, তারপর নির্বাচন করুন',
    openButton: '"খুলুন"',
    instructionEnd: 'আপনার ডায়াগ্রাম ফাইল লোড করতে।'
  },
  connectorRerouteTooltip: {
    title: 'টিপ: সংযোগকারী পুনর্নির্দেশ করুন',
    instructionStart:
      'একবার আপনার সংযোগকারী স্থাপন করা হলে আপনি আপনার ইচ্ছামতো তাদের পুনর্নির্দেশ করতে পারেন।',
    instructionSelect: 'সংযোগকারী নির্বাচন করুন',
    instructionMiddle: 'প্রথমে, তারপর',
    instructionClick: 'সংযোগকারী পথে ক্লিক করুন',
    instructionAnd: 'এবং',
    instructionDrag: 'টেনে আনুন',
    instructionEnd: 'এটি পরিবর্তন করতে!'
  },
  connectorEmptySpaceTooltip: {
    message: 'এই সংযোগকারীটিকে একটি নোডের সাথে সংযোগ করতে,',
    instruction: 'সংযোগকারীর শেষে বাম-ক্লিক করুন এবং এটিকে পছন্দসই নোডে টানুন।'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'সেটিংস',
    close: 'বন্ধ করুন',
    canvas: 'ক্যানভাস',
    language: 'ভাষা',
    about: 'সম্পর্কে',
    languageDescription:
      'অ্যাপ্লিকেশন ইন্টারফেসের জন্য প্রদর্শন ভাষা নির্বাচন করুন।',
    zoomSection: 'জুম',
    labelsSection: 'লেবেল',
    zoom: {
      description: 'মাউস হুইল ব্যবহার করার সময় জুম আচরণ কনফিগার করুন।',
      zoomToCursor: 'কার্সারে জুম করুন',
      zoomToCursorDesc:
        'সক্রিয় থাকলে, মাউস কার্সার অবস্থানে কেন্দ্রীভূত জুম ইন/আউট। নিষ্ক্রিয় থাকলে, জুম ক্যানভাসে কেন্দ্রীভূত।'
    },
    hotkeys: {
      title: 'শর্টকাট সেটিংস',
      profile: 'শর্টকাট প্রোফাইল',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'কোন শর্টকাট নেই',
      tool: 'টুল',
      hotkey: 'শর্টকাট',
      toolSelect: 'নির্বাচন করুন',
      toolPan: 'প্যান করুন',
      toolAddItem: 'আইটেম যোগ করুন',
      toolRectangle: 'আয়তক্ষেত্র',
      toolConnector: 'সংযোগকারী',
      toolText: 'পাঠ্য',
      note: 'নোট: টেক্সট ফিল্ডে টাইপ না করার সময় শর্টকাটগুলি কাজ করে',
      fixedShortcutsTitle: 'স্থায়ী শর্টকাট (সর্বদা সক্রিয়)',
      fixedCut: 'কাটুন',
      fixedCopy: 'কপি করুন',
      fixedPaste: 'পেস্ট করুন',
      fixedUndo: 'পূর্বাবস্থায় ফেরান',
      fixedRedo: 'পুনরায় করুন'
    },
    connector: {
      title: 'সংযোগকারী সেটিংস',
      connectionMode: 'সংযোগ তৈরির মোড',
      clickMode: 'ক্লিক মোড (প্রস্তাবিত)',
      clickModeDesc:
        'প্রথম নোডে ক্লিক করুন, তারপর একটি সংযোগ তৈরি করতে দ্বিতীয় নোডে ক্লিক করুন',
      dragMode: 'টেনে আনার মোড',
      dragModeDesc: 'প্রথম নোড থেকে দ্বিতীয় নোডে ক্লিক করুন এবং টেনে আনুন',
      note: 'নোট: আপনি যেকোনো সময় এই সেটিং পরিবর্তন করতে পারেন। সংযোগকারী টুল সক্রিয় থাকলে নির্বাচিত মোড ব্যবহার করা হবে।'
    },
    iconPacks: {
      title: 'আইকন প্যাক ব্যবস্থাপনা',
      lazyLoading: 'লেজি লোডিং সক্ষম করুন',
      lazyLoadingDesc:
        'দ্রুত স্টার্টআপের জন্য চাহিদা অনুযায়ী আইকন প্যাক লোড করুন',
      availablePacks: 'উপলব্ধ আইকন প্যাক',
      coreIsoflow: 'Core Isoflow (সর্বদা লোড)',
      alwaysEnabled: 'সর্বদা সক্রিয়',
      awsPack: 'AWS আইকন',
      gcpPack: 'Google Cloud আইকন',
      azurePack: 'Azure আইকন',
      kubernetesPack: 'Kubernetes আইকন',
      loading: 'লোড হচ্ছে...',
      loaded: 'লোড করা হয়েছে',
      notLoaded: 'লোড করা হয়নি',
      iconCount: '{count} আইকন',
      lazyLoadingDisabledNote:
        'লেজি লোডিং নিষ্ক্রিয়। সমস্ত আইকন প্যাক স্টার্টআপে লোড করা হয়।',
      note: 'আইকন প্যাকগুলি আপনার প্রয়োজন অনুসারে সক্রিয় বা নিষ্ক্রিয় করা যেতে পারে। নিষ্ক্রিয় প্যাকগুলি মেমরি ব্যবহার হ্রাস করবে এবং কর্মক্ষমতা উন্নত করবে।'
    }
  },
  lazyLoadingWelcome: {
    title: 'Axoview-এ স্বাগতম',
    message:
      'Axoview হলো সুন্দর আইসোমেট্রিক ও 2D ডায়াগ্রাম তৈরির একটি ফ্রি, ওপেন-সোর্স টুল — ক্লাউড, নেটওয়ার্ক ও ইনফ্রাস্ট্রাকচার আর্কিটেকচার, সঙ্গে বিল্ট-ইন AWS, GCP, Azure ও Kubernetes আইকন। পুরোটাই চলে আপনার ব্রাউজারে, সেভ হয় লোকালি অথবা আপনার নিজের Google Drive-এ। ওপেন-সোর্স FossFLOW ও Isoflow প্রকল্পের উপর গড়া এবং সক্রিয়ভাবে সম্প্রসারিত হচ্ছে — সোর্স খুঁজতে, বাগ রিপোর্ট করতে বা নতুন ফিচার অনুরোধ করতে দেখুন github.com/molikas/axoview।',
    configPath: 'হ্যামবার্গার আইকনে ক্লিক করুন',
    configPath2: 'কনফিগারেশন অ্যাক্সেস করতে উপরের বাম দিকে।',
    canDisable: 'আপনি চাইলে এই আচরণ নিষ্ক্রিয় করতে পারেন।',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'পৃষ্ঠা যোগ করুন',
    deletePage: 'পৃষ্ঠা মুছুন',
    renameDiagram: 'ডায়াগ্রাম নামকরণ করুন',
    addPageDisabled: 'পৃষ্ঠার সীমা পৌঁছেছে (৫)'
  },
  nodePanel: {
    notes: 'নোট',
    close: 'বন্ধ করুন'
  },
  nodeDeck: {
    metadata: 'মেটাডেটা',
    name: 'নাম',
    namePlaceholder: 'নোডের নাম…',
    label: 'লেবেল',
    labelPlaceholder: 'শেপে দেখানো লেবেল…'
  },
  connectorControls: {
    metadata: 'মেটাডেটা',
    close: 'বন্ধ করুন',
    notes: 'নোট',
    name: 'নাম',
    namePlaceholder: 'প্রান্ত লেবেল…',
    labels: 'লেবেল',
    addLabel: 'লেবেল যোগ করুন',
    noLabels: 'এখনও কোনো লেবেল নেই।',
    labelN: 'লেবেল {count}',
    positionHint:
      'অবস্থান নির্ধারণ করতে ক্যানভাসে একটি লেবেল টেনে আনুন; এর পাঠ্যের আকার এবং রঙের জন্য উপরের বার ব্যবহার করুন।',
    line: 'লাইন',
    line1: 'লাইন ১',
    line2: 'লাইন ২'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'অনুসন্ধান করুন বা লিঙ্ক পেস্ট করুন',
    linkCopy: 'লিঙ্ক কপি করুন',
    linkCopied: 'কপি হয়েছে',
    linkEdit: 'লিঙ্ক সম্পাদনা করুন',
    linkRemove: 'লিঙ্ক সরান',
    placeholder: 'কিছু লিখুন',
    metadata: 'মেটাডেটা',
    notes: 'নোট',
    close: 'বন্ধ করুন',
    name: 'নাম',
    namePlaceholder: 'উপাদানের নাম…'
  },
  rectangleControls: {
    metadata: 'মেটাডেটা',
    notes: 'নোট',
    close: 'বন্ধ করুন',
    name: 'নাম',
    namePlaceholder: 'উপাদানের নাম…'
  },
  topBarStyleControls: {
    mixed: 'মিশ্র',
    rotate90: '90° ঘোরান',
    noColor: 'কোনো রং নেই',
    pickColorFromScreen: 'স্ক্রিন থেকে রং বেছে নিন',
    customColor: 'কাস্টম রং',
    textSize: 'পাঠ্যের আকার',
    lineSpacing: 'লাইনের ব্যবধান',
    alignment: 'সারিবদ্ধকরণ',
    alignmentDisabled: 'পাঠ্য সারিবদ্ধ করতে একটি টেক্সট বক্স নির্বাচন করুন',
    alignLeft: 'বামে সারিবদ্ধ করুন',
    alignCenter: 'কেন্দ্রে রাখুন',
    alignRight: 'ডানে সারিবদ্ধ করুন',
    alignTop: 'উপরে সারিবদ্ধ করুন',
    alignMiddle: 'মাঝখানে সারিবদ্ধ করুন',
    alignBottom: 'নিচে সারিবদ্ধ করুন',
    textColor: 'পাঠ্যের রং',
    textColorDisabled:
      'পাঠ্যের রং সেট করতে একটি নোড, টেক্সট বক্স, লেবেল বা সংযোগ লেবেল নির্বাচন করুন',
    textSizeDisabled:
      'পাঠ্যের আকার সেট করতে একটি নোড, টেক্সট বক্স, লেবেল বা সংযোগ লেবেল নির্বাচন করুন',
    labelSizeAllSelected: 'লেবেলের আকার (সব নির্বাচিত)',
    textColorAllSelected: 'পাঠ্যের রং (সব নির্বাচিত)',
    armedToolPlaceFirst:
      'নতুন উপাদান ডিফল্ট স্টাইল ব্যবহার করে — আগে এটি বসান, তারপর এখানে স্টাইল করুন',
    decreaseLabelSize: 'লেবেলের আকার হ্রাস করুন',
    increaseLabelSize: 'লেবেলের আকার বৃদ্ধি করুন',
    labelSize: 'লেবেলের আকার',
    decreaseSize: 'আকার হ্রাস করুন',
    increaseSize: 'আকার বৃদ্ধি করুন',
    stepAll: 'সব ধাপে পরিবর্তন করুন',
    size: 'আকার',
    bold: 'বোল্ড',
    italic: 'ইটালিক',
    underline: 'আন্ডারলাইন',
    strikethrough: 'স্ট্রাইকথ্রু',
    format: 'বোল্ড / ইটালিক / আন্ডারলাইন / স্ট্রাইকথ্রু',
    formatDisabled:
      'পাঠ্য ফরম্যাট করতে একটি নোড, টেক্সট বক্স, লেবেল বা সংযোগ লেবেল নির্বাচন করুন',
    lists: 'তালিকা',
    listsDisabled: 'তালিকা ব্যবহার করতে একটি টেক্সট বক্স নির্বাচন করুন',
    bulletList: 'বুলেট তালিকা',
    numberedList: 'সংখ্যায়িত তালিকা',
    background: 'পটভূমির রং',
    backgroundDisabled:
      'পটভূমির রং সেট করতে একটি আয়তক্ষেত্র, লেবেল বা টেক্সট বক্স নির্বাচন করুন',
    opacity: 'স্বচ্ছতা',
    border: 'বর্ডার',
    borderDisabled:
      'বর্ডার সেট করতে একটি আয়তক্ষেত্র বা টেক্সট বক্স নির্বাচন করুন',
    lineStyle: 'লাইন স্টাইল',
    width: 'প্রস্থ',
    borderColor: 'বর্ডারের রং',
    link: 'লিঙ্ক',
    linkDisabled: 'লিঙ্ক যোগ করতে একটি নোড, সংযোগ বা লেবেল নির্বাচন করুন',
    linkSelection: 'নির্বাচিত পাঠ্যে লিঙ্ক যোগ করুন',
    linkDisabledTextBox: 'লিঙ্ক যোগ করতে সম্পাদনার সময় পাঠ্য নির্বাচন করুন',
    linkToWeb: 'ওয়েবে লিঙ্ক করুন',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'ডায়াগ্রামে লিঙ্ক করুন',
    searchDiagrams: 'ডায়াগ্রাম খুঁজুন…',
    openLinkedDiagram: 'সংযুক্ত ডায়াগ্রাম খুলুন',
    showLabel: 'লেবেল দেখান',
    hideLabel: 'লেবেল লুকান',
    showHideLabelDisabled:
      'লেবেল দেখাতে বা লুকাতে একটি নোড বা সংযোগ নির্বাচন করুন',
    changeIconBulk: 'আইকন পরিবর্তন একবারে একটি নোডে প্রযোজ্য',
    changeIcon: 'আইকন পরিবর্তন করুন',
    changeIconDisabled: 'আইকন পরিবর্তন করতে একটি নোড নির্বাচন করুন',
    connectionColorPredraw: 'আপনি যে পরবর্তী সংযোগ আঁকবেন তার রং',
    connectionColor: 'সংযোগের রং',
    connectionColorDisabled:
      'রং সেট করতে একটি সংযোগ (বা সংযোগকারী টুল) নির্বাচন করুন',
    lineOptionsPredraw: 'আপনি যে পরবর্তী সংযোগ আঁকবেন তার লাইন স্টাইল',
    lineOptions: 'লাইন বিকল্প',
    lineOptionsDisabled:
      'লাইন বিকল্প সেট করতে একটি সংযোগ (বা সংযোগকারী টুল) নির্বাচন করুন',
    lineType: 'লাইন প্রকার',
    showArrow: 'তীর দেখান',
    showDottedLine: 'বিন্দুযুক্ত রেখা দেখান'
  },
  quickAddNodePopover: {
    add: 'যোগ করুন',
    rectangle: 'গ্রুপ'
  },
  zoomControls: {
    zoomOut: 'জুম আউট',
    zoomIn: 'জুম ইন',
    fitToScreen: 'স্ক্রিনে ফিট করুন',
    keepLabelsReadable: 'লেবেল পঠনযোগ্য রাখুন',
    help: 'সাহায্য (F1)',
    selected: '{count}টি নির্বাচিত'
  },
  modeHints: {
    connector: 'সংযোগ করতে আইটেমগুলির মধ্যে টেনে আনুন • বাতিল করতে Esc',
    textBox: 'টেক্সট বক্স রাখতে ক্লিক করুন • বাতিল করতে Esc',
    label: 'লেবেল রাখতে ক্লিক করুন • বাতিল করতে Esc',
    rectangle: 'আয়তক্ষেত্র আঁকতে টেনে আনুন • বাতিল করতে Esc'
  },
  previewLayerSwitcher: {
    layers: 'স্তর',
    showLayer: 'স্তর দেখান',
    hideLayer: 'স্তর লুকান',
    solo: 'একক',
    unsolo: 'একক থেকে বেরিয়ে আসুন'
  },
  previewLabelsToggle: {
    hideLabels: 'লেবেল লুকান',
    showLabels: 'লেবেল দেখান'
  },
  annotationPalette: {
    pen: 'টীকা',
    select: 'নির্বাচন',
    draw: 'আঁকুন',
    shapes: 'আকার',
    pencil: 'পেন্সিল',
    highlighter: 'হাইলাইটার',
    line: 'রেখা',
    arrow: 'তীর',
    rectangle: 'আয়ত',
    ellipse: 'উপবৃত্ত',
    eraser: 'ইরেজার',
    undo: 'পূর্বাবস্থা',
    redo: 'পুনরায় করুন',
    clear: 'সব মুছুন'
  },
  viewModeInfoPopover: {
    close: 'বন্ধ করুন'
  },
  labelSettings: {
    description: 'লেবেল প্রদর্শন সেটিংস কনফিগার করুন',
    expandButtonPadding: 'বিস্তার বোতাম প্যাডিং',
    expandButtonPaddingDesc:
      'বিস্তার বোতাম দৃশ্যমান হলে নিচের প্যাডিং (পাঠ্য ওভারল্যাপ প্রতিরোধ করে)',
    // D13
    currentValue: 'বর্তমান: {value} থিম ইউনিট'
  },
  iconSelectionControls: {
    close: 'বন্ধ করুন',
    importIcons: 'আইকন আমদানি করুন',
    addMoreIcons: 'আরও আইকন যোগ করুন',
    isometricLabel: 'আইসোমেট্রিক হিসেবে বিবেচনা করুন (3D দৃশ্য)',
    isometricHint: 'সমতল আইকনের জন্য আনচেক করুন (লোগো, UI উপাদান)',
    dragHint: 'আপনি নিচের যেকোনো আইটেম ক্যানভাসে টেনে নামাতে পারেন।',
    aiPromptTooltip: 'AI দিয়ে আইকন তৈরি করুন',
    aiPromptTitle: 'AI দিয়ে আইসোমেট্রিক আইকন তৈরি করুন',
    aiPromptBody:
      "এই প্রম্পটটি একটি ছবি-তৈরিকারী AI-তে পেস্ট করুন। 'my object' প্রতিস্থাপন করে প্রয়োজনীয় বস্তু লিখুন, তারপর তৈরি PNG আমদানি করুন।",
    aiPromptCopy: 'প্রম্পট কপি করুন',
    aiPromptCopied: 'কপি হয়েছে'
  },
  searchbox: {
    placeholder: 'আইকন খুঁজুন'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'ছবি হিসেবে রপ্তানি করুন',
    compatibilityTitle: 'ব্রাউজার সামঞ্জস্যতা বিজ্ঞপ্তি',
    compatibilityMessage:
      'সেরা ফলাফলের জন্য Chrome বা Edge ব্যবহার করুন। Firefox-এ বর্তমানে রপ্তানি বৈশিষ্ট্যের সাথে সামঞ্জস্যতার সমস্যা রয়েছে।',
    cropInstruction:
      'রপ্তানি করতে চান এমন অঞ্চল নির্বাচন করতে ক্লিক করুন এবং টেনে আনুন',
    options: 'বিকল্প',
    showGrid: 'গ্রিড দেখান',
    showLabels: 'লেবেল দেখান',
    screenshotPreset: 'স্ক্রিনশট (প্রস্তাবিত)',
    scaleClamped:
      'ব্রাউজারের ছবির সীমার সাথে মানানসই করতে রপ্তানির আকার হ্রাস করা হয়েছে:',
    cropToContent: 'বিষয়বস্তুতে ক্রপ করুন',
    backgroundColor: 'পটভূমির রং',
    transparentBackground: 'স্বচ্ছ পটভূমি',
    exportQuality: 'রপ্তানি মান (DPI)',
    custom: 'কাস্টম',
    recrop: 'আবার ক্রপ করুন',
    cropApplied: 'ক্রপ সফলভাবে প্রয়োগ হয়েছে',
    applyCrop: 'ক্রপ প্রয়োগ করুন',
    clearSelection: 'নির্বাচন সাফ করুন',
    cropHint:
      'ক্রপ করার জন্য একটি অঞ্চল নির্বাচন করুন, অথবা পুরো ছবি ব্যবহার করতে "বিষয়বস্তুতে ক্রপ করুন" আনচেক করুন',
    cancel: 'বাতিল করুন',
    downloadSvg: 'SVG হিসেবে ডাউনলোড করুন',
    downloadPng: 'PNG হিসেবে ডাউনলোড করুন',
    error: 'ছবি রপ্তানি করা যায়নি'
  },
  toolMenu: {
    label: 'Label',
    undo: 'পূর্বাবস্থায় ফেরান',
    redo: 'পুনরায় করুন',
    select: 'নির্বাচন করুন',
    lassoSelect: 'ল্যাসো নির্বাচন',
    freehandLasso: 'ফ্রিহ্যান্ড ল্যাসো',
    pan: 'প্যান করুন',
    addItem: 'আইটেম যোগ করুন',
    rectangle: 'আয়তক্ষেত্র',
    connector: 'সংযোগকারী',
    text: 'পাঠ্য',
    common: 'সাধারণ',
    // D5
    switchTo2D: '2D ভিউতে স্যুইচ করুন',
    switchToIsometric: 'আইসোমেট্রিক ভিউতে স্যুইচ করুন',
    clickMode: 'ক্লিক',
    dragMode: 'টেনে আনুন'
  },
  quickIconSelector: {
    recentlyUsed: 'সম্প্রতি ব্যবহৃত',
    searchResults: 'অনুসন্ধান ফলাফল ({count}টি আইকন)',
    noIconsFound: '"{term}" এর সাথে মিলে এমন কোনো আইকন পাওয়া যায়নি'
  },
  canvasContextMenu: {
    addNote: 'নোট যোগ করুন',
    addLabel: 'লেবেল যোগ করুন',
    details: 'বিস্তারিত…',
    rename: 'নাম পরিবর্তন করুন',
    cut: 'কাটুন',
    copy: 'কপি করুন',
    paste: 'পেস্ট করুন',
    duplicate: 'অনুলিপি করুন',
    bringForward: 'সামনে আনুন',
    sendBackward: 'পিছনে পাঠান',
    bringToFront: 'সামনে আনুন',
    sendToBack: 'পিছনে পাঠান',
    assignToLayer: 'স্তরে বরাদ্দ করুন',
    fitToText: 'পাঠ্যের সাথে মানানসই করুন',
    snapToGrid: 'গ্রিডে স্ন্যাপ করুন',
    unsnapFromGrid: 'গ্রিড থেকে আনস্ন্যাপ করুন',
    disableCollision: 'সংঘর্ষ নিষ্ক্রিয় করুন',
    enableCollision: 'সংঘর্ষ সক্রিয় করুন',
    delete: 'মুছুন',
    addItem: 'আইটেম যোগ করুন',
    selectAll: 'সব নির্বাচন করুন',
    enableSnapToGrid: 'গ্রিড স্ন্যাপ সক্রিয় করুন',
    disableSnapToGrid: 'গ্রিড স্ন্যাপ নিষ্ক্রিয় করুন',
    itemsSelectedOne: '{count}টি আইটেম নির্বাচিত',
    itemsSelectedOther: '{count}টি আইটেম নির্বাচিত',
    deleteItemsOne: '{count}টি আইটেম মুছুন',
    deleteItemsOther: '{count}টি আইটেম মুছুন',
    removeFromLayer: 'স্তর থেকে সরান',
    noLayers: 'কোনো স্তর নেই — স্তর প্যানেলে একটি যোগ করুন'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'ফাইল এক্সপ্লোরার',
    elements: 'উপাদান',
    layers: 'স্তর',
    settings: 'সেটিংস',
    openDiagramFirst: 'প্রথমে একটি ডায়াগ্রাম খুলুন বা তৈরি করুন',
    collapsePanel: 'প্যানেল সঙ্কুচিত করুন'
  },
  // D8 — LayersPanel
  layersPanel: {
    header: 'স্তর',
    addLayer: 'স্তর যোগ করুন',
    deleteSelectedLayer: 'নির্বাচিত স্তর মুছুন',
    noLayersYet: 'এখনও কোনো স্তর নেই। যোগ করতে + এ ক্লিক করুন।',
    unassigned: 'অনির্ধারিত ({count})',
    dropToUnassign: 'নির্ধারণ বাতিল করতে এখানে আইটেম ছাড়ুন',
    layerN: 'স্তর {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count}টি আইটেম কপি করা হয়েছে',
    copiedOther: '{count}টি আইটেম কপি করা হয়েছে',
    cutOne: '{count}টি আইটেম কাট করা হয়েছে',
    cutOther: '{count}টি আইটেম কাট করা হয়েছে',
    pastedOne: '{count}টি আইটেম পেস্ট করা হয়েছে',
    pastedOther: '{count}টি আইটেম পেস্ট করা হয়েছে',
    nothingToPaste: 'পেস্ট করার কিছু নেই',
    routingConnectors: 'পেস্ট করা হচ্ছে… কানেক্টর রুট করা হচ্ছে ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'পৃষ্ঠা {count}'
  }
};

export default locale;
