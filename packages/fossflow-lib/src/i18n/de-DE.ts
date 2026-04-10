import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Dies ist ein Beispieltext"
  },
  mainMenu: {
    undo: "Rückgängig",
    redo: "Wiederholen",
    new: "New diagram",
    open: "Öffnen",
    exportJson: "Als JSON exportieren",
    exportCompactJson: "Als kompaktes JSON exportieren",
    exportImage: "Als Bild exportieren",
    clearCanvas: "Leinwand leeren",
    settings: "Einstellungen",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Tastaturkürzel und Hilfe",
    close: "Schließen",
    keyboardShortcuts: "Tastaturkürzel",
    mouseInteractions: "Mausinteraktionen",
    action: "Aktion",
    shortcut: "Kürzel",
    method: "Methode",
    description: "Beschreibung",
    note: "Hinweis:",
    noteContent: "Tastaturkürzel sind beim Tippen in Eingabefeldern, Textbereichen oder bearbeitbaren Elementen deaktiviert, um Konflikte zu vermeiden.",
    // Keyboard shortcuts
    undoAction: "Rückgängig",
    undoDescription: "Letzte Aktion rückgängig machen",
    redoAction: "Wiederholen",
    redoDescription: "Letzte rückgängig gemachte Aktion wiederholen",
    redoAltAction: "Wiederholen (Alternativ)",
    redoAltDescription: "Alternatives Kürzel zum Wiederholen",
    helpAction: "Hilfe",
    helpDescription: "Hilfedialog mit Tastaturkürzeln öffnen",
    zoomInAction: "Vergrößern",
    zoomInShortcut: "Mausrad nach oben",
    zoomInDescription: "Auf der Leinwand vergrößern",
    zoomOutAction: "Verkleinern",
    zoomOutShortcut: "Mausrad nach unten",
    zoomOutDescription: "Auf der Leinwand verkleinern",
    panCanvasAction: "Leinwand verschieben",
    panCanvasShortcut: "Linksklick + Ziehen",
    panCanvasDescription: "Leinwand im Verschiebbemodus bewegen",
    togglePanToolAction: "Verschiebbemodus umschalten",
    togglePanToolShortcut: "Rechtsklick",
    togglePanToolDescription: "Verschiebbemodus ein-/ausschalten; Linksklick kehrt zum Auswahlmodus zurück",
    lassoSelectAction: "Lasso-Auswahl",
    lassoSelectShortcut: "Linksklick + Ziehen (leerer Bereich)",
    lassoSelectDescription: "Einen rechteckigen Auswahlrahmen zeichnen, um mehrere Elemente auszuwählen",
    deselectAction: "Auswahl aufheben",
    deselectShortcut: "Linksklick (leerer Bereich)",
    deselectDescription: "Aktuelle Auswahl aufheben und zum Auswahlmodus zurückkehren",
    addNodeGroupAction: "Knoten / Gruppe hinzufügen",
    addNodeGroupShortcut: "Doppelklick (leerer Bereich)",
    addNodeGroupDescription: "Öffnet das Hinzufügen-Popover am Cursor: Symbol auswählen, um einen Knoten zu platzieren, oder auf Gruppe klicken, um einen Hintergrundbereich für die visuelle Gruppierung von Knoten hinzuzufügen",
    // Mouse interactions
    selectToolAction: "Auswahlwerkzeug",
    selectToolShortcut: "Auswahl-Schaltfläche klicken",
    selectToolDescription: "Zum Auswahlmodus wechseln",
    panToolAction: "Verschiebewerkzeug",
    panToolShortcut: "Verschieben-Schaltfläche klicken oder Rechtsklick",
    panToolDescription: "Zum Verschiebbemodus wechseln, um die Leinwand zu bewegen; Rechtsklick schaltet um",
    addItemAction: "Element hinzufügen",
    addItemShortcut: "Element-hinzufügen-Schaltfläche klicken",
    addItemDescription: "Symbolauswahl öffnen, um neue Elemente hinzuzufügen",
    drawRectangleAction: "Rechteck zeichnen",
    drawRectangleShortcut: "Rechteck-Schaltfläche klicken",
    drawRectangleDescription: "Zum Rechteck-Zeichenmodus wechseln",
    createConnectorAction: "Verbindung erstellen",
    createConnectorShortcut: "Verbindungs-Schaltfläche klicken",
    createConnectorDescription: "Zum Verbindungsmodus wechseln",
    addTextAction: "Text hinzufügen",
    addTextShortcut: "Text-Schaltfläche klicken",
    addTextDescription: "Neues Textfeld erstellen",
    deleteSelectedAction: "Ausgewähltes löschen",
    deleteSelectedShortcut: "Entf (Rücktaste auf Mac)",
    deleteSelectedDescription: "Ausgewähltes Element oder alle Elemente einer Lasso-Auswahl löschen; unterstützt Rückgängig/Wiederholen",
    cutAction: "Ausschneiden",
    cutDescription: "Ausgewählte(s) Element(e) in die Zwischenablage ausschneiden — Elemente werden entfernt und können anderswo eingefügt werden; unterstützt Rückgängig/Wiederholen",
    copyAction: "Kopieren",
    copyDescription: "Ausgewählte(s) Element(e) in die Zwischenablage kopieren",
    pasteAction: "Einfügen",
    pasteDescription: "Zwischenablage-Elemente an der Mausposition einfügen; wird versetzt, um Überlappungen zu vermeiden"
  },
  connectorHintTooltip: {
    tipCreatingConnectors: "Tipp: Verbindungen erstellen",
    tipConnectorTools: "Tipp: Verbindungswerkzeuge",
    clickInstructionStart: "Klicken Sie",
    clickInstructionMiddle: "auf den ersten Knoten oder Punkt, dann",
    clickInstructionEnd: "auf den zweiten Knoten oder Punkt, um eine Verbindung zu erstellen.",
    nowClickTarget: "Klicken Sie nun auf das Ziel, um die Verbindung abzuschließen.",
    dragStart: "Ziehen Sie",
    dragEnd: "vom ersten Knoten zum zweiten Knoten, um eine Verbindung zu erstellen.",
    rerouteStart: "Um eine Verbindung umzuleiten,",
    rerouteMiddle: "linksklicken Sie",
    rerouteEnd: "auf einen beliebigen Punkt entlang der Verbindungslinie und ziehen Sie, um Ankerpunkte zu erstellen oder zu verschieben."
  },
  lassoHintTooltip: {
    tipLasso: "Tipp: Lasso-Auswahl",
    tipFreehandLasso: "Tipp: Freihand-Lasso-Auswahl",
    lassoDragStart: "Klicken und ziehen",
    lassoDragEnd: "Sie, um einen rechteckigen Auswahlrahmen um die gewünschten Elemente zu zeichnen.",
    freehandDragStart: "Klicken und ziehen",
    freehandDragMiddle: "Sie, um eine",
    freehandDragEnd: "freie Form",
    freehandComplete: "um Elemente zu zeichnen. Loslassen, um alle Elemente innerhalb der Form auszuwählen.",
    moveStart: "Nach der Auswahl",
    moveMiddle: "in die Auswahl klicken",
    moveEnd: "und ziehen, um alle ausgewählten Elemente gemeinsam zu bewegen."
  },
  importHintTooltip: {
    title: "Diagramme importieren",
    instructionStart: "Um Diagramme zu importieren, klicken Sie auf die",
    menuButton: "Menü-Schaltfläche",
    instructionMiddle: "(☰) oben links, dann wählen Sie",
    openButton: "\"Öffnen\"",
    instructionEnd: "um Ihre Diagrammdateien zu laden."
  },
  connectorRerouteTooltip: {
    title: "Tipp: Verbindungen umleiten",
    instructionStart: "Sobald Ihre Verbindungen platziert sind, können Sie diese nach Belieben umleiten.",
    instructionSelect: "Verbindung auswählen",
    instructionMiddle: "zuerst, dann",
    instructionClick: "auf den Verbindungspfad klicken",
    instructionAnd: "und",
    instructionDrag: "ziehen",
    instructionEnd: "um ihn zu ändern!"
  },
  connectorEmptySpaceTooltip: {
    message: "Um diese Verbindung mit einem Knoten zu verbinden,",
    instruction: "linksklicken Sie auf das Ende der Verbindung und ziehen Sie es zum gewünschten Knoten."
  },
  settings: {
    zoom: {
      description: "Zoom-Verhalten beim Verwenden des Mausrads konfigurieren.",
      zoomToCursor: "Zoom zum Cursor",
      zoomToCursorDesc: "Wenn aktiviert, wird der Zoom auf die Mauszeiger-Position zentriert. Wenn deaktiviert, wird der Zoom auf die Leinwand zentriert."
    },
    hotkeys: {
      title: "Tastaturkürzel-Einstellungen",
      profile: "Tastaturkürzel-Profil",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Keine Tastaturkürzel",
      tool: "Werkzeug",
      hotkey: "Tastaturkürzel",
      toolSelect: "Auswählen",
      toolPan: "Verschieben",
      toolAddItem: "Element hinzufügen",
      toolRectangle: "Rechteck",
      toolConnector: "Verbindung",
      toolText: "Text",
      note: "Hinweis: Tastaturkürzel funktionieren, wenn Sie nicht in Textfeldern tippen",
      fixedShortcutsTitle: "Feste Kürzel (immer aktiv)",
      fixedCut: "Ausschneiden",
      fixedCopy: "Kopieren",
      fixedPaste: "Einfügen",
      fixedUndo: "Rückgängig",
      fixedRedo: "Wiederholen"
    },
    pan: {
      title: "Verschiebe-Einstellungen",
      mousePanOptions: "Maus-Verschiebe-Optionen",
      emptyAreaClickPan: "Auf leeren Bereich klicken und ziehen",
      middleClickPan: "Mittlere Maustaste und ziehen",
      rightClickPan: "Rechtsklick und ziehen",
      ctrlClickPan: "Strg + Klick und ziehen",
      altClickPan: "Alt + Klick und ziehen",
      keyboardPanOptions: "Tastatur-Verschiebe-Optionen",
      arrowKeys: "Pfeiltasten",
      wasdKeys: "WASD-Tasten",
      ijklKeys: "IJKL-Tasten",
      keyboardPanSpeed: "Tastatur-Verschiebegeschwindigkeit",
      note: "Hinweis: Verschiebe-Optionen funktionieren zusätzlich zum dedizierten Verschiebewerkzeug"
    },
    connector: {
      title: "Verbindungs-Einstellungen",
      connectionMode: "Verbindungserstellungsmodus",
      clickMode: "Klick-Modus (Empfohlen)",
      clickModeDesc: "Ersten Knoten klicken, dann zweiten Knoten klicken, um eine Verbindung zu erstellen",
      dragMode: "Zieh-Modus",
      dragModeDesc: "Vom ersten Knoten zum zweiten Knoten klicken und ziehen",
      note: "Hinweis: Diese Einstellung kann jederzeit geändert werden. Der ausgewählte Modus wird verwendet, wenn das Verbindungswerkzeug aktiv ist."
    },
    iconPacks: {
      title: "Symbol-Paket-Verwaltung",
      lazyLoading: "Lazy Loading aktivieren",
      lazyLoadingDesc: "Symbol-Pakete bei Bedarf laden für schnelleren Start",
      availablePacks: "Verfügbare Symbol-Pakete",
      coreIsoflow: "Core Isoflow (immer geladen)",
      alwaysEnabled: "Immer aktiviert",
      awsPack: "AWS-Symbole",
      gcpPack: "Google Cloud-Symbole",
      azurePack: "Azure-Symbole",
      kubernetesPack: "Kubernetes-Symbole",
      loading: "Wird geladen...",
      loaded: "Geladen",
      notLoaded: "Nicht geladen",
      iconCount: "{count} Symbole",
      lazyLoadingDisabledNote: "Lazy Loading ist deaktiviert. Alle Symbol-Pakete werden beim Start geladen.",
      note: "Symbol-Pakete können je nach Bedarf aktiviert oder deaktiviert werden. Deaktivierte Pakete reduzieren den Speicherverbrauch und verbessern die Leistung."
    }
  },
  lazyLoadingWelcome: {
    title: "Willkommen bei FossFLOW Community Edition",
    message: "Dies ist ein von der Community modifizierter Fork von FossFLOW mit zusätzlichen Funktionen und Verbesserungen. Mehr über die Änderungen erfahren Sie und den Quellcode finden Sie unter https://github.com/molikas/FossFLOW_V2 — Bug gefunden oder Funktionswunsch? Öffnen Sie ein Issue auf GitHub!",
    configPath: "Klicken Sie auf das Hamburger-Symbol",
    configPath2: "oben links, um auf die Konfiguration zuzugreifen.",
    canDisable: "Viel Spaß beim Diagrammerstellen!",
    signature: "— FossFLOW Community & Opus"
  },
  viewTabs: {
    addPage: "Seite hinzufügen",
    deletePage: "Seite löschen",
    renameDiagram: "Diagramm umbenennen"
  },
  nodePanel: {
    details: "Details",
    style: "Stil",
    notes: "Notizen",
    notesModified: "Notizen ●",
    close: "Schließen",
    openLink: "Link öffnen",
    caption: "Beschriftung",
    noCaption: "Keine Beschriftung."
  },
  nodeInfoTab: {
    name: "Name",
    namePlaceholder: "Knotenname…",
    removeLink: "Link entfernen",
    addLink: "Link zum Namen hinzufügen",
    linkPlaceholder: "https://…",
    caption: "Beschriftung",
    captionHint: "Wird auf der Leinwand unterhalb des Knotennamens angezeigt",
    openLink: "Link öffnen"
  },
  nodeStyleTab: {
    icon: "Symbol",
    close: "Schließen",
    change: "Ändern…",
    iconSize: "Symbolgröße",
    labelFontSize: "Beschriftungsschriftgröße",
    labelColor: "Beschriftungsfarbe",
    labelHeight: "Beschriftungshöhe"
  },
  connectorControls: {
    close: "Schließen",
    labels: "Beschriftungen"
  },
  textBoxControls: {
    close: "Schließen",
    text: "Text",
    textSize: "Textgröße",
    textColor: "Textfarbe",
    alignment: "Ausrichtung"
  },
  rectangleControls: {
    close: "Schließen",
    color: "Farbe",
    useCustomColor: "Benutzerdefinierte Farbe verwenden"
  },
  labelColorPicker: {
    customColor: "Benutzerdefinierte Farbe"
  },
  deleteButton: {
    delete: "Löschen"
  },
  nodeActionBar: {
    style: "Stil",
    editName: "Name bearbeiten",
    editLink: "Link bearbeiten",
    addLink: "Link hinzufügen",
    editNotes: "Notizen bearbeiten",
    addNotes: "Notizen hinzufügen",
    startConnector: "Start connector",
    delete: "Löschen"
  },
  quickAddNodePopover: {
    add: "Hinzufügen",
    rectangle: "Gruppe"
  },
  zoomControls: {
    zoomOut: "Verkleinern",
    zoomIn: "Vergrößern",
    fitToScreen: "An Bildschirm anpassen",
    help: "Hilfe (F1)"
  },
  labelSettings: {
    description: "Beschriftungsanzeigeeinstellungen konfigurieren",
    expandButtonPadding: "Erweitern-Schaltfläche Innenabstand",
    expandButtonPaddingDesc: "Unterer Innenabstand bei sichtbarer Erweitern-Schaltfläche (verhindert Textüberlappung)"
  },
  iconSelectionControls: {
    close: "Schließen",
    importIcons: "Symbole importieren",
    isometricLabel: "Als isometrisch behandeln (3D-Ansicht)",
    isometricHint: "Für flache Symbole deaktivieren (Logos, UI-Elemente)",
    dragHint: "Sie können beliebige Elemente unten per Drag & Drop auf die Leinwand ziehen."
  },
  searchbox: {
    placeholder: "Symbole suchen"
  },
  exportImageDialog: {
    title: "Als Bild exportieren",
    compatibilityTitle: "Browser-Kompatibilitätshinweis",
    compatibilityMessage: "Für beste Ergebnisse verwenden Sie bitte Chrome oder Edge. Firefox hat derzeit Kompatibilitätsprobleme mit der Exportfunktion.",
    cropInstruction: "Klicken und ziehen, um den zu exportierenden Bereich auszuwählen",
    options: "Optionen",
    showGrid: "Raster anzeigen",
    expandDescriptions: "Beschreibungen erweitern",
    cropToContent: "Auf Inhalt zuschneiden",
    backgroundColor: "Hintergrundfarbe",
    transparentBackground: "Transparenter Hintergrund",
    exportQuality: "Exportqualität (DPI)",
    custom: "Benutzerdefiniert",
    recrop: "Erneut zuschneiden",
    cropApplied: "Zuschnitt erfolgreich angewendet",
    applyCrop: "Zuschnitt anwenden",
    clearSelection: "Auswahl aufheben",
    cropHint: "Bereich zum Zuschneiden auswählen oder \"Auf Inhalt zuschneiden\" deaktivieren, um das vollständige Bild zu verwenden",
    cancel: "Abbrechen",
    downloadSvg: "Als SVG herunterladen",
    downloadPng: "Als PNG herunterladen",
    error: "Bild konnte nicht exportiert werden"
  },
  toolMenu: {
    undo: "Rückgängig",
    redo: "Wiederholen",
    select: "Auswählen",
    lassoSelect: "Lasso-Auswahl",
    freehandLasso: "Freihand-Lasso",
    pan: "Schwenken",
    addItem: "Element hinzufügen",
    rectangle: "Rechteck",
    connector: "Verbinder",
    text: "Text"
  },
  quickIconSelector: {
    searchPlaceholder: "Symbole suchen (Enter zum Auswählen)",
    recentlyUsed: "ZULETZT VERWENDET",
    searchResults: "SUCHERGEBNISSE ({count} Symbole)",
    noIconsFound: "Keine Symbole für \"{term}\" gefunden",
    helpSearch: "Pfeiltasten zum Navigieren • Enter zum Auswählen • Doppelklick zum Auswählen und Schließen",
    helpBrowse: "Tippen zum Suchen • Kategorie anklicken zum Erweitern • Doppelklick zum Auswählen und Schließen"
  }
};

export default locale;
