import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Dies ist ein Beispieltext'
  },
  rightSidebar: {
    collapsePanel: 'Panel einklappen',
    emptyState:
      'Wählen Sie einen Knoten, Verbinder oder eine Form, um die Eigenschaften anzuzeigen'
  },
  helpDialog: {
    title: 'Tastaturkürzel und Hilfe',
    close: 'Schließen',
    keyboardShortcuts: 'Tastaturkürzel',
    mouseInteractions: 'Mausinteraktionen',
    action: 'Aktion',
    shortcut: 'Kürzel',
    method: 'Methode',
    description: 'Beschreibung',
    note: 'Hinweis:',
    noteContent:
      'Tastaturkürzel sind beim Tippen in Eingabefeldern, Textbereichen oder bearbeitbaren Elementen deaktiviert, um Konflikte zu vermeiden.',
    // Keyboard shortcuts
    undoAction: 'Rückgängig',
    undoDescription: 'Letzte Aktion rückgängig machen',
    redoAction: 'Wiederholen',
    redoDescription: 'Letzte rückgängig gemachte Aktion wiederholen',
    redoAltAction: 'Wiederholen (Alternativ)',
    redoAltDescription: 'Alternatives Kürzel zum Wiederholen',
    helpAction: 'Hilfe',
    helpDescription: 'Hilfedialog mit Tastaturkürzeln öffnen',
    zoomInAction: 'Vergrößern',
    zoomInShortcut: 'Mausrad nach oben',
    zoomInDescription: 'Auf der Leinwand vergrößern',
    zoomOutAction: 'Verkleinern',
    zoomOutShortcut: 'Mausrad nach unten',
    zoomOutDescription: 'Auf der Leinwand verkleinern',
    panCanvasAction: 'Leinwand verschieben',
    panCanvasShortcut: 'Linksklick + Ziehen',
    panCanvasDescription: 'Leinwand im Verschiebbemodus bewegen',
    togglePanToolAction: 'Verschiebbemodus umschalten',
    togglePanToolShortcut: 'Rechtsklick',
    togglePanToolDescription:
      'Verschiebbemodus ein-/ausschalten; Linksklick kehrt zum Auswahlmodus zurück',
    lassoSelectAction: 'Lasso-Auswahl',
    lassoSelectShortcut: 'Linksklick + Ziehen (leerer Bereich)',
    lassoSelectDescription:
      'Einen rechteckigen Auswahlrahmen zeichnen, um mehrere Elemente auszuwählen',
    deselectAction: 'Auswahl aufheben',
    deselectShortcut: 'Linksklick (leerer Bereich)',
    deselectDescription:
      'Aktuelle Auswahl aufheben und zum Auswahlmodus zurückkehren',
    // Mouse interactions
    selectToolAction: 'Auswahlwerkzeug',
    selectToolShortcut: 'Auswahl-Schaltfläche klicken',
    selectToolDescription: 'Zum Auswahlmodus wechseln',
    panToolAction: 'Verschiebewerkzeug',
    panToolShortcut: 'Verschieben-Schaltfläche klicken oder Rechtsklick',
    panToolDescription:
      'Zum Verschiebbemodus wechseln, um die Leinwand zu bewegen; Rechtsklick schaltet um',
    addItemAction: 'Element hinzufügen',
    addItemShortcut: 'Element-hinzufügen-Schaltfläche klicken',
    addItemDescription: 'Symbolauswahl öffnen, um neue Elemente hinzuzufügen',
    drawRectangleAction: 'Rechteck zeichnen',
    drawRectangleShortcut: 'Rechteck-Schaltfläche klicken',
    drawRectangleDescription: 'Zum Rechteck-Zeichenmodus wechseln',
    createConnectorAction: 'Verbindung erstellen',
    createConnectorShortcut: 'Verbindungs-Schaltfläche klicken',
    createConnectorDescription: 'Zum Verbindungsmodus wechseln',
    addTextAction: 'Text hinzufügen',
    addTextShortcut: 'Text-Schaltfläche klicken',
    addTextDescription: 'Neues Textfeld erstellen',
    deleteSelectedAction: 'Ausgewähltes löschen',
    deleteSelectedShortcut: 'Entf (Rücktaste auf Mac)',
    deleteSelectedDescription:
      'Ausgewähltes Element oder alle Elemente einer Lasso-Auswahl löschen; unterstützt Rückgängig/Wiederholen',
    cutAction: 'Ausschneiden',
    cutDescription:
      'Ausgewählte(s) Element(e) in die Zwischenablage ausschneiden — Elemente werden entfernt und können anderswo eingefügt werden; unterstützt Rückgängig/Wiederholen',
    copyAction: 'Kopieren',
    copyDescription: 'Ausgewählte(s) Element(e) in die Zwischenablage kopieren',
    pasteAction: 'Einfügen',
    pasteDescription:
      'Zwischenablage-Elemente an der Mausposition einfügen; wird versetzt, um Überlappungen zu vermeiden',
    // D10 — Select all row
    selectAllAction: 'Alles auswählen',
    selectAllShortcut: 'Strg+A',
    selectAllDescription:
      'Alle sichtbaren, nicht gesperrten Elemente der aktiven Ansicht auswählen (Elemente, Rechtecke, Textfelder, Verbindungen + ihre Wegpunkte)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Umbenennen',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Ausgewähltes Element oder Diagramm inline umbenennen',
    keyAddItemAction: 'Element hinzufügen / Elemente',
    keyAddItemShortcut: 'N',
    keyAddItemDescription:
      'Elemente-Panel umschalten, um ein neues Element zu platzieren',
    keyConnectorAction: 'Verbindung',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Zum Verbindungswerkzeug wechseln',
    keyLassoAction: 'Lasso-Auswahl',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Zum Lasso-Auswahlwerkzeug wechseln',
    keySelectAction: 'Auswählen',
    keySelectShortcut: 'S',
    keySelectDescription: 'Zum Auswahlwerkzeug wechseln',
    // D10 — mouse interactions
    miSelectAction: 'Auswählen',
    miSelectMethod: 'Linksklick',
    miSelectDescription:
      'Auf ein Element klicken, um es auszuwählen (hebt es hervor und zeigt die schwebende Aktionsleiste). Auf die leere Leinwand klicken, um die Auswahl aufzuheben.',
    miOpenDetailsAction: 'Details öffnen',
    miOpenDetailsMethod: 'Doppelklick',
    miOpenDetailsDescription:
      'Auf ein Element doppelklicken, um sein Detailfenster zu öffnen — wie der Eintrag „Details…“ im Kontextmenü.',
    miToggleSelectionAction: 'Auswahl umschalten',
    miToggleSelectionMethod: 'Strg/Cmd + Linksklick',
    miToggleSelectionDescription:
      'Ein Element zur Mehrfachauswahl hinzufügen oder daraus entfernen; eine Verbindung schaltet zusammen mit ihren Wegpunkten um.',
    miPanAction: 'Verschieben',
    miPanMethod: 'Rechtsklick + Ziehen',
    miPanDescription:
      'Rechte Maustaste halten und ziehen, um die Leinwand zu verschieben. Ziehen mit der mittleren Taste verschiebt ebenfalls; Pfeiltasten bewegen sie schrittweise.',
    miContextMenuAction: 'Kontextmenü',
    miContextMenuMethod: 'Rechtsklick (Tippen)',
    miContextMenuDescription:
      'Ein Rechtsklick ohne Ziehen öffnet das Kontextmenü — das Elementmenü über einem Element oder das Leinwandmenü über leerem Raum. Auf Touch-Geräten: langes Drücken.',
    miRemoveWaypointAction: 'Wegpunkt entfernen',
    miRemoveWaypointMethod: 'Alt + Linksklick',
    miRemoveWaypointDescription:
      'Mit Alt+Klick auf einen Verbindungs-Wegpunkt diesen herausnehmen (die Verbindung muss nicht zuerst ausgewählt werden); Endpunkt-Anker bleiben erhalten.',
    miZoomAction: 'Zoomen',
    miZoomMethod: 'Mausrad',
    miZoomDescription: 'Scrollen, um zum Cursor zu zoomen.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'Tipp: Verbindungen erstellen',
    tipConnectorTools: 'Tipp: Verbindungswerkzeuge',
    clickInstructionStart: 'Klicken Sie',
    clickInstructionMiddle: 'auf den ersten Knoten oder Punkt, dann',
    clickInstructionEnd:
      'auf den zweiten Knoten oder Punkt, um eine Verbindung zu erstellen.',
    nowClickTarget:
      'Klicken Sie nun auf das Ziel, um die Verbindung abzuschließen.',
    dragStart: 'Ziehen Sie',
    dragEnd:
      'vom ersten Knoten zum zweiten Knoten, um eine Verbindung zu erstellen.',
    rerouteStart: 'Um eine Verbindung umzuleiten,',
    rerouteMiddle: 'linksklicken Sie',
    rerouteEnd:
      'auf einen beliebigen Punkt entlang der Verbindungslinie und ziehen Sie, um Ankerpunkte zu erstellen oder zu verschieben.'
  },
  lassoHintTooltip: {
    tipLasso: 'Tipp: Lasso-Auswahl',
    tipFreehandLasso: 'Tipp: Freihand-Lasso-Auswahl',
    lassoDragStart: 'Klicken und ziehen',
    lassoDragEnd:
      'Sie, um einen rechteckigen Auswahlrahmen um die gewünschten Elemente zu zeichnen.',
    freehandDragStart: 'Klicken und ziehen',
    freehandDragMiddle: 'Sie, um eine',
    freehandDragEnd: 'freie Form',
    freehandComplete:
      'um Elemente zu zeichnen. Loslassen, um alle Elemente innerhalb der Form auszuwählen.',
    moveStart: 'Nach der Auswahl',
    moveMiddle: 'in die Auswahl klicken',
    moveEnd: 'und ziehen, um alle ausgewählten Elemente gemeinsam zu bewegen.'
  },
  importHintTooltip: {
    title: 'Diagramme importieren',
    instructionStart: 'Um Diagramme zu importieren, klicken Sie auf die',
    menuButton: 'Menü-Schaltfläche',
    instructionMiddle: '(☰) oben links, dann wählen Sie',
    openButton: '"Öffnen"',
    instructionEnd: 'um Ihre Diagrammdateien zu laden.'
  },
  connectorRerouteTooltip: {
    title: 'Tipp: Verbindungen umleiten',
    instructionStart:
      'Sobald Ihre Verbindungen platziert sind, können Sie diese nach Belieben umleiten.',
    instructionSelect: 'Verbindung auswählen',
    instructionMiddle: 'zuerst, dann',
    instructionClick: 'auf den Verbindungspfad klicken',
    instructionAnd: 'und',
    instructionDrag: 'ziehen',
    instructionEnd: 'um ihn zu ändern!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Um diese Verbindung mit einem Knoten zu verbinden,',
    instruction:
      'linksklicken Sie auf das Ende der Verbindung und ziehen Sie es zum gewünschten Knoten.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Einstellungen',
    close: 'Schließen',
    canvas: 'Leinwand',
    language: 'Sprache',
    about: 'Über',
    languageDescription:
      'Wählen Sie die Anzeigesprache für die Anwendungsoberfläche.',
    zoomSection: 'Zoom',
    labelsSection: 'Beschriftungen',
    zoom: {
      description: 'Zoom-Verhalten beim Verwenden des Mausrads konfigurieren.',
      zoomToCursor: 'Zoom zum Cursor',
      zoomToCursorDesc:
        'Wenn aktiviert, wird der Zoom auf die Mauszeiger-Position zentriert. Wenn deaktiviert, wird der Zoom auf die Leinwand zentriert.'
    },
    hotkeys: {
      title: 'Tastaturkürzel-Einstellungen',
      profile: 'Tastaturkürzel-Profil',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Keine Tastaturkürzel',
      tool: 'Werkzeug',
      hotkey: 'Tastaturkürzel',
      toolSelect: 'Auswählen',
      toolPan: 'Verschieben',
      toolAddItem: 'Element hinzufügen',
      toolRectangle: 'Rechteck',
      toolConnector: 'Verbindung',
      toolText: 'Text',
      note: 'Hinweis: Tastaturkürzel funktionieren, wenn Sie nicht in Textfeldern tippen',
      fixedShortcutsTitle: 'Feste Kürzel (immer aktiv)',
      fixedCut: 'Ausschneiden',
      fixedCopy: 'Kopieren',
      fixedPaste: 'Einfügen',
      fixedUndo: 'Rückgängig',
      fixedRedo: 'Wiederholen'
    },
    connector: {
      title: 'Verbindungs-Einstellungen',
      connectionMode: 'Verbindungserstellungsmodus',
      clickMode: 'Klick-Modus (Empfohlen)',
      clickModeDesc:
        'Ersten Knoten klicken, dann zweiten Knoten klicken, um eine Verbindung zu erstellen',
      dragMode: 'Zieh-Modus',
      dragModeDesc: 'Vom ersten Knoten zum zweiten Knoten klicken und ziehen',
      note: 'Hinweis: Diese Einstellung kann jederzeit geändert werden. Der ausgewählte Modus wird verwendet, wenn das Verbindungswerkzeug aktiv ist.'
    },
    iconPacks: {
      title: 'Symbol-Paket-Verwaltung',
      lazyLoading: 'Lazy Loading aktivieren',
      lazyLoadingDesc: 'Symbol-Pakete bei Bedarf laden für schnelleren Start',
      availablePacks: 'Verfügbare Symbol-Pakete',
      coreIsoflow: 'Core Isoflow (immer geladen)',
      alwaysEnabled: 'Immer aktiviert',
      awsPack: 'AWS-Symbole',
      gcpPack: 'Google Cloud-Symbole',
      azurePack: 'Azure-Symbole',
      kubernetesPack: 'Kubernetes-Symbole',
      loading: 'Wird geladen...',
      loaded: 'Geladen',
      notLoaded: 'Nicht geladen',
      iconCount: '{count} Symbole',
      lazyLoadingDisabledNote:
        'Lazy Loading ist deaktiviert. Alle Symbol-Pakete werden beim Start geladen.',
      note: 'Symbol-Pakete können je nach Bedarf aktiviert oder deaktiviert werden. Deaktivierte Pakete reduzieren den Speicherverbrauch und verbessern die Leistung.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Willkommen bei Axoview',
    message:
      'Axoview ist ein kostenloses Open-Source-Tool für schöne isometrische und 2D-Diagramme — Cloud-, Netzwerk- und Infrastrukturarchitektur, mit integrierten Icons für AWS, GCP, Azure und Kubernetes. Alles läuft direkt in Ihrem Browser und wird lokal oder in Ihrem eigenen Google Drive gespeichert. Aufgebaut auf den Open-Source-Projekten FossFLOW und Isoflow und aktiv weiterentwickelt — den Quellcode finden Sie, einen Bug melden oder eine Funktion vorschlagen können Sie unter github.com/molikas/axoview.',
    configPath: 'Klicken Sie auf das Hamburger-Symbol',
    configPath2: 'oben links, um auf die Konfiguration zuzugreifen.',
    canDisable: 'Viel Spaß beim Diagrammerstellen!',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Seite hinzufügen',
    deletePage: 'Seite löschen',
    renameDiagram: 'Diagramm umbenennen',
    addPageDisabled: 'Seitenlimit erreicht (5)'
  },
  nodePanel: {
    notes: 'Notizen',
    close: 'Schließen'
  },
  nodeDeck: {
    metadata: 'Metadaten',
    name: 'Name',
    namePlaceholder: 'Knotenname…',
    label: 'Beschriftung',
    labelPlaceholder: 'Auf dem Element angezeigte Beschriftung…'
  },
  connectorControls: {
    metadata: 'Metadaten',
    close: 'Schließen',
    notes: 'Notizen',
    name: 'Name',
    namePlaceholder: 'Kantenbezeichnung…',
    labels: 'Beschriftungen',
    addLabel: 'Beschriftung hinzufügen',
    noLabels: 'Noch keine Beschriftungen.',
    labelN: 'Beschriftung {count}',
    positionHint:
      'Ziehen Sie eine Beschriftung auf die Leinwand, um sie zu positionieren; verwenden Sie die obere Leiste für ihre Textgröße und -farbe.',
    line: 'Linie',
    line1: 'Linie 1',
    line2: 'Linie 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Suchen oder Link einfügen',
    linkCopy: 'Link kopieren',
    linkCopied: 'Kopiert',
    linkEdit: 'Link bearbeiten',
    linkRemove: 'Link entfernen',
    placeholder: 'Text eingeben',
    metadata: 'Metadaten',
    notes: 'Notizen',
    close: 'Schließen',
    name: 'Name',
    namePlaceholder: 'Elementname…'
  },
  rectangleControls: {
    metadata: 'Metadaten',
    notes: 'Notizen',
    close: 'Schließen',
    name: 'Name',
    namePlaceholder: 'Elementname…'
  },
  topBarStyleControls: {
    mixed: 'Gemischt',
    rotate90: 'Um 90° drehen',
    noColor: 'Keine Farbe',
    pickColorFromScreen: 'Farbe vom Bildschirm auswählen',
    customColor: 'Benutzerdefinierte Farbe',
    textSize: 'Textgröße',
    lineSpacing: 'Zeilenabstand',
    alignment: 'Ausrichtung',
    alignmentDisabled: 'Wählen Sie ein Textfeld aus, um Text auszurichten',
    alignLeft: 'Linksbündig',
    alignCenter: 'Zentriert',
    alignRight: 'Rechtsbündig',
    alignTop: 'Oben ausrichten',
    alignMiddle: 'Mittig ausrichten',
    alignBottom: 'Unten ausrichten',
    textColor: 'Textfarbe',
    textColorDisabled:
      'Wählen Sie einen Knoten, ein Textfeld, eine Beschriftung oder eine Verbindungsbeschriftung, um die Textfarbe festzulegen',
    textSizeDisabled:
      'Wählen Sie einen Knoten, ein Textfeld, eine Beschriftung oder eine Verbindungsbeschriftung, um die Textgröße festzulegen',
    labelSizeAllSelected: 'Beschriftungsgröße (alle ausgewählten)',
    textColorAllSelected: 'Textfarbe (alle ausgewählten)',
    armedToolPlaceFirst:
      'Das neue Element nutzt die Standard-Formatierung — platzieren Sie es zuerst und gestalten Sie es dann hier',
    decreaseLabelSize: 'Beschriftungsgröße verringern',
    increaseLabelSize: 'Beschriftungsgröße erhöhen',
    labelSize: 'Beschriftungsgröße',
    decreaseSize: 'Größe verringern',
    increaseSize: 'Größe erhöhen',
    stepAll: 'Alle anpassen',
    size: 'Größe',
    bold: 'Fett',
    italic: 'Kursiv',
    underline: 'Unterstrichen',
    strikethrough: 'Durchgestrichen',
    format: 'Fett / kursiv / unterstrichen / durchgestrichen',
    formatDisabled:
      'Wählen Sie einen Knoten, ein Textfeld, eine Beschriftung oder eine Verbindungsbeschriftung, um Text zu formatieren',
    lists: 'Listen',
    listsDisabled: 'Wählen Sie ein Textfeld, um Listen zu verwenden',
    bulletList: 'Aufzählungsliste',
    numberedList: 'Nummerierte Liste',
    background: 'Hintergrundfarbe',
    backgroundDisabled:
      'Wählen Sie ein Rechteck, eine Beschriftung oder ein Textfeld aus, um die Hintergrundfarbe festzulegen',
    opacity: 'Deckkraft',
    border: 'Rahmen',
    borderDisabled:
      'Wählen Sie ein Rechteck oder Textfeld, um dessen Rahmen festzulegen',
    lineStyle: 'Linienstil',
    width: 'Breite',
    borderColor: 'Rahmenfarbe',
    link: 'Link',
    linkDisabled:
      'Wählen Sie einen Knoten, eine Verbindung oder eine Beschriftung, um einen Link hinzuzufügen',
    linkSelection: 'Ausgewählten Text verlinken',
    linkDisabledTextBox:
      'Wählen Sie beim Bearbeiten Text aus, um einen Link hinzuzufügen',
    linkToWeb: 'Link zum Web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Link zum Diagramm',
    searchDiagrams: 'Diagramme suchen…',
    openLinkedDiagram: 'Verknüpftes Diagramm öffnen',
    showLabel: 'Beschriftung anzeigen',
    hideLabel: 'Beschriftung ausblenden',
    showHideLabelDisabled:
      'Wählen Sie einen Knoten oder eine Verbindung, um die Beschriftung ein- oder auszublenden',
    changeIconBulk: 'Symbol ändern gilt jeweils für einen Knoten',
    changeIcon: 'Symbol ändern',
    changeIconDisabled: 'Wählen Sie einen Knoten, um sein Symbol zu ändern',
    connectionColorPredraw:
      'Farbe für die nächste Verbindung, die Sie zeichnen',
    connectionColor: 'Verbindungsfarbe',
    connectionColorDisabled:
      'Wählen Sie eine Verbindung (oder das Verbindungswerkzeug), um ihre Farbe festzulegen',
    lineOptionsPredraw:
      'Linienstil für die nächste Verbindung, die Sie zeichnen',
    lineOptions: 'Linienoptionen',
    lineOptionsDisabled:
      'Wählen Sie eine Verbindung (oder das Verbindungswerkzeug), um ihre Linienoptionen festzulegen',
    lineType: 'Linientyp',
    showArrow: 'Pfeil anzeigen',
    showDottedLine: 'Gepunktete Linie anzeigen'
  },
  quickAddNodePopover: {
    add: 'Hinzufügen',
    rectangle: 'Gruppe'
  },
  zoomControls: {
    zoomOut: 'Verkleinern',
    zoomIn: 'Vergrößern',
    fitToScreen: 'An Bildschirm anpassen',
    keepLabelsReadable: 'Beschriftungen lesbar halten',
    help: 'Hilfe (F1)',
    selected: '{count} ausgewählt'
  },
  modeHints: {
    connector: 'Zum Verbinden zwischen Elementen ziehen • Esc zum Abbrechen',
    textBox: 'Klicken, um ein Textfeld zu platzieren • Esc zum Abbrechen',
    label: 'Klicken, um eine Beschriftung zu platzieren • Esc zum Abbrechen',
    rectangle: 'Ziehen, um ein Rechteck zu zeichnen • Esc zum Abbrechen'
  },
  previewLayerSwitcher: {
    layers: 'Ebenen',
    showLayer: 'Ebene einblenden',
    hideLayer: 'Ebene ausblenden',
    solo: 'Solo',
    unsolo: 'Solo beenden'
  },
  previewLabelsToggle: {
    hideLabels: 'Beschriftungen ausblenden',
    showLabels: 'Beschriftungen einblenden'
  },
  annotationPalette: {
    pen: 'Anmerken',
    select: 'Auswählen',
    draw: 'Zeichnen',
    shapes: 'Formen',
    pencil: 'Stift',
    highlighter: 'Textmarker',
    line: 'Linie',
    arrow: 'Pfeil',
    rectangle: 'Rechteck',
    ellipse: 'Ellipse',
    eraser: 'Radierer',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    clear: 'Alle löschen'
  },
  viewModeInfoPopover: {
    close: 'Schließen'
  },
  labelSettings: {
    description: 'Beschriftungsanzeigeeinstellungen konfigurieren',
    expandButtonPadding: 'Erweitern-Schaltfläche Innenabstand',
    expandButtonPaddingDesc:
      'Unterer Innenabstand bei sichtbarer Erweitern-Schaltfläche (verhindert Textüberlappung)',
    // D13
    currentValue: 'Aktuell: {value} Theme-Einheiten'
  },
  iconSelectionControls: {
    close: 'Schließen',
    importIcons: 'Symbole importieren',
    addMoreIcons: 'Mehr Symbole hinzufügen',
    isometricLabel: 'Als isometrisch behandeln (3D-Ansicht)',
    isometricHint: 'Für flache Symbole deaktivieren (Logos, UI-Elemente)',
    dragHint:
      'Sie können beliebige Elemente unten per Drag & Drop auf die Leinwand ziehen.',
    aiPromptTooltip: 'Symbole mit KI generieren',
    aiPromptTitle: 'Isometrische Symbole mit KI erstellen',
    aiPromptBody:
      'Fügen Sie diese Eingabeaufforderung in eine bildgenerierende KI ein. Ersetzen Sie „my object" durch Ihr Motiv und importieren Sie dann das erzeugte PNG.',
    aiPromptCopy: 'Prompt kopieren',
    aiPromptCopied: 'Kopiert'
  },
  searchbox: {
    placeholder: 'Symbole suchen'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Als Bild exportieren',
    compatibilityTitle: 'Browser-Kompatibilitätshinweis',
    compatibilityMessage:
      'Für beste Ergebnisse verwenden Sie bitte Chrome oder Edge. Firefox hat derzeit Kompatibilitätsprobleme mit der Exportfunktion.',
    cropInstruction:
      'Klicken und ziehen, um den zu exportierenden Bereich auszuwählen',
    options: 'Optionen',
    showGrid: 'Raster anzeigen',
    showLabels: 'Beschriftungen anzeigen',
    screenshotPreset: 'Screenshot (empfohlen)',
    scaleClamped:
      'Exportgröße reduziert, um das Bildlimit des Browsers einzuhalten:',
    cropToContent: 'Auf Inhalt zuschneiden',
    backgroundColor: 'Hintergrundfarbe',
    transparentBackground: 'Transparenter Hintergrund',
    exportQuality: 'Exportqualität (DPI)',
    custom: 'Benutzerdefiniert',
    recrop: 'Erneut zuschneiden',
    cropApplied: 'Zuschnitt erfolgreich angewendet',
    applyCrop: 'Zuschnitt anwenden',
    clearSelection: 'Auswahl aufheben',
    cropHint:
      'Bereich zum Zuschneiden auswählen oder "Auf Inhalt zuschneiden" deaktivieren, um das vollständige Bild zu verwenden',
    cancel: 'Abbrechen',
    downloadSvg: 'Als SVG herunterladen',
    downloadPng: 'Als PNG herunterladen',
    error: 'Bild konnte nicht exportiert werden'
  },
  toolMenu: {
    label: 'Label',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    select: 'Auswählen',
    lassoSelect: 'Lasso-Auswahl',
    freehandLasso: 'Freihand-Lasso',
    pan: 'Schwenken',
    addItem: 'Element hinzufügen',
    rectangle: 'Rechteck',
    connector: 'Verbinder',
    text: 'Text',
    common: 'Allgemein',
    // D5
    switchTo2D: 'Zur 2D-Ansicht wechseln',
    switchToIsometric: 'Zur isometrischen Ansicht wechseln',
    clickMode: 'Klicken',
    dragMode: 'Ziehen'
  },
  quickIconSelector: {
    recentlyUsed: 'ZULETZT VERWENDET',
    searchResults: 'SUCHERGEBNISSE ({count} Symbole)',
    noIconsFound: 'Keine Symbole für "{term}" gefunden'
  },
  canvasContextMenu: {
    addNote: 'Notiz hinzufügen',
    addLabel: 'Beschriftung hinzufügen',
    details: 'Details…',
    rename: 'Umbenennen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einfügen',
    duplicate: 'Duplizieren',
    bringForward: 'Nach vorne',
    sendBackward: 'Nach hinten',
    bringToFront: 'In den Vordergrund',
    sendToBack: 'In den Hintergrund',
    assignToLayer: 'Ebene zuweisen',
    fitToText: 'An Text anpassen',
    snapToGrid: 'Am Raster ausrichten',
    unsnapFromGrid: 'Vom Raster lösen',
    disableCollision: 'Kollision deaktivieren',
    enableCollision: 'Kollision aktivieren',
    delete: 'Löschen',
    addItem: 'Element hinzufügen',
    selectAll: 'Alles auswählen',
    enableSnapToGrid: 'Rasterausrichtung aktivieren',
    disableSnapToGrid: 'Rasterausrichtung deaktivieren',
    itemsSelectedOne: '{count} Element ausgewählt',
    itemsSelectedOther: '{count} Elemente ausgewählt',
    deleteItemsOne: '{count} Element löschen',
    deleteItemsOther: '{count} Elemente löschen',
    removeFromLayer: 'Von Ebene entfernen',
    noLayers: 'Keine Ebenen — fügen Sie eine im Ebenen-Panel hinzu'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Datei-Explorer',
    elements: 'Elemente',
    layers: 'Ebenen',
    settings: 'Einstellungen',
    openDiagramFirst: 'öffnen oder erstellen Sie zuerst ein Diagramm',
    collapsePanel: 'Bereich einklappen'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: 'Ebene löschen?',
    deleteLayerBody: 'Diese Ebene enthält {count} Element(e). Was soll damit geschehen?',
    deleteLayerHiddenWarning: 'Diese Ebene ist AUSGEBLENDET. Wenn der Inhalt erhalten bleibt, wird er wieder SICHTBAR — ein Element ohne Ebene wird immer angezeigt.',
    deleteLayerCancel: 'Abbrechen',
    deleteLayerKeep: 'Inhalt behalten',
    deleteLayerDeleteContents: 'Inhalt ebenfalls löschen',
    header: 'Ebenen',
    addLayer: 'Ebene hinzufügen',
    deleteSelectedLayer: 'Ausgewählte Ebene löschen',
    noLayersYet: 'Noch keine Ebenen. Klicken Sie auf +, um eine hinzuzufügen.',
    unassigned: 'Nicht zugewiesen ({count})',
    dropToUnassign: 'Elemente hier ablegen, um die Zuweisung aufzuheben',
    layerN: 'Ebene {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} Element kopiert',
    copiedOther: '{count} Elemente kopiert',
    cutOne: '{count} Element ausgeschnitten',
    cutOther: '{count} Elemente ausgeschnitten',
    pastedOne: '{count} Element eingefügt',
    pastedOther: '{count} Elemente eingefügt',
    nothingToPaste: 'Nichts zum Einfügen',
    routingConnectors:
      'Wird eingefügt… Verbindungen werden geroutet ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Seite {count}'
  }
};

export default locale;
