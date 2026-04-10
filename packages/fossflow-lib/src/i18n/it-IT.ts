import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Questo è un testo di esempio"
  },
  mainMenu: {
    undo: "Annulla",
    redo: "Ripeti", 
    new: "New diagram",
    open: "Apri",
    exportJson: "Esporta come JSON",
    exportCompactJson: "Esporta come JSON compatto",
    exportImage: "Esporta come immagine",
    clearCanvas: "Pulisci la tela",
    settings: "Impostazioni",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Scorciatoie da tastiera e aiuto",
    close: "Chiudi",
    keyboardShortcuts: "Scorciatoie da tastiera",
    mouseInteractions: "Interazioni del mouse",
    action: "Azione",
    shortcut: "Scorciatoia",
    method: "Metodo",
    description: "Descrizione",
    note: "Nota:",
    noteContent: "Le scorciatoie da tastiera sono disattivate durante la digitazione in campi di testo o elementi modificabili per evitare conflitti.",
    // Keyboard shortcuts
    undoAction: "Annulla",
    undoDescription: "Annulla l'ultima azione",
    redoAction: "Ripeti",
    redoDescription: "Ripeti l'ultima azione annullata",
    redoAltAction: "Ripeti (Alternativa)",
    redoAltDescription: "Scorciatoia alternativa per ripetere",
    helpAction: "Aiuto",
    helpDescription: "Apri la finestra di aiuto con le scorciatoie da tastiera",
    zoomInAction: "Ingrandisci",
    zoomInShortcut: "Rotella del mouse su",
    zoomInDescription: "Ingrandisci la tela",
    zoomOutAction: "Rimpicciolisci",
    zoomOutShortcut: "Rotella del mouse giù",
    zoomOutDescription: "Rimpicciolisci la tela",
    panCanvasAction: "Sposta la tela",
    panCanvasShortcut: "Clic sinistro + trascina",
    panCanvasDescription: "Muovi la tela in modalità panoramica",
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
    selectToolAction: "Strumento Selezione",
    selectToolShortcut: "Clicca il pulsante Selezione",
    selectToolDescription: "Passa alla modalità selezione",
    panToolAction: "Strumento Panoramica",
    panToolShortcut: "Clicca il pulsante Panoramica",
    panToolDescription: "Passa alla modalità panoramica per spostare la tela",
    addItemAction: "Aggiungi elemento",
    addItemShortcut: "Clicca il pulsante Aggiungi elemento",
    addItemDescription: "Apri il selettore di icone per aggiungere nuovi elementi",
    drawRectangleAction: "Disegna rettangolo",
    drawRectangleShortcut: "Clicca il pulsante Rettangolo",
    drawRectangleDescription: "Passa alla modalità disegno rettangolo",
    createConnectorAction: "Crea connettore",
    createConnectorShortcut: "Clicca il pulsante Connettore",
    createConnectorDescription: "Passa alla modalità connettore",
    addTextAction: "Aggiungi testo",
    addTextShortcut: "Clicca il pulsante Testo",
    addTextDescription: "Crea una nuova casella di testo",
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
    tipCreatingConnectors: "Suggerimento: Creazione connettori",
    tipConnectorTools: "Suggerimento: Strumenti connettore",
    clickInstructionStart: "Clicca",
    clickInstructionMiddle: "sul primo nodo o punto, poi",
    clickInstructionEnd: "sul secondo nodo o punto per creare una connessione.",
    nowClickTarget: "Ora clicca sull'obiettivo per completare la connessione.",
    dragStart: "Trascina",
    dragEnd: "dal primo nodo al secondo nodo per creare una connessione.",
    rerouteStart: "Per riorientare un connettore,",
    rerouteMiddle: "clicca con il tasto sinistro",
    rerouteEnd: "su un punto qualsiasi lungo la linea del connettore e trascina per creare o spostare i punti di ancoraggio."
  },
  lassoHintTooltip: {
    tipLasso: "Suggerimento: Selezione Lasso",
    tipFreehandLasso: "Suggerimento: Selezione Lasso a mano libera",
    lassoDragStart: "Clicca e trascina",
    lassoDragEnd: "per disegnare un riquadro di selezione rettangolare attorno agli elementi da selezionare.",
    freehandDragStart: "Clicca e trascina",
    freehandDragMiddle: "per disegnare una",
    freehandDragEnd: "forma libera",
    freehandComplete: "attorno agli elementi. Rilascia per selezionare tutti gli elementi all'interno della forma.",
    moveStart: "Una volta selezionati,",
    moveMiddle: "clicca all'interno della selezione",
    moveEnd: "e trascina per muovere tutti gli elementi selezionati insieme."
  },
  importHintTooltip: {
    title: "Importa diagrammi",
    instructionStart: "Per importare diagrammi, clicca sul",
    menuButton: "pulsante del menu",
    instructionMiddle: "(☰) in alto a sinistra, poi seleziona",
    openButton: "\"Apri\"",
    instructionEnd: "per caricare i tuoi file di diagramma."
  },
  connectorRerouteTooltip: {
    title: "Suggerimento: Riorienta connettori",
    instructionStart: "Una volta posizionati i connettori, puoi riorientarli come preferisci.",
    instructionSelect: "Seleziona prima il connettore,",
    instructionMiddle: "poi",
    instructionClick: "clicca sul percorso del connettore",
    instructionAnd: "e",
    instructionDrag: "trascina",
    instructionEnd: "per modificarlo!"
  },
  connectorEmptySpaceTooltip: {
    message: "Per collegare questo connettore a un nodo,",
    instruction: "clicca con il tasto sinistro sulla fine del connettore e trascinalo sul nodo desiderato."
  },
  settings: {
    zoom: {
      description: "Configura il comportamento dello zoom quando si usa la rotella del mouse.",
      zoomToCursor: "Zoom sul cursore",
      zoomToCursorDesc: "Se abilitato, ingrandisci o riduci centrando sul cursore del mouse. Se disabilitato, lo zoom è centrato sulla tela."
    },
    hotkeys: {
      title: "Impostazioni scorciatoie",
      profile: "Profilo scorciatoie",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Nessuna scorciatoia",
      tool: "Strumento",
      hotkey: "Scorciatoia",
      toolSelect: "Seleziona",
      toolPan: "Panoramica",
      toolAddItem: "Aggiungi elemento",
      toolRectangle: "Rettangolo",
      toolConnector: "Connettore",
      toolText: "Testo",
      note: "Nota: Le scorciatoie funzionano quando non stai digitando nei campi di testo",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "Impostazioni Panoramica",
      mousePanOptions: "Opzioni panoramica con mouse",
      emptyAreaClickPan: "Clicca e trascina su un'area vuota",
      middleClickPan: "Clic centrale e trascina",
      rightClickPan: "Clic destro e trascina",
      ctrlClickPan: "Ctrl + clic e trascina",
      altClickPan: "Alt + clic e trascina",
      keyboardPanOptions: "Opzioni panoramica con tastiera",
      arrowKeys: "Tasti freccia",
      wasdKeys: "Tasti WASD",
      ijklKeys: "Tasti IJKL",
      keyboardPanSpeed: "Velocità panoramica tastiera",
      note: "Nota: Le opzioni di panoramica funzionano insieme allo strumento Panoramica dedicato"
    },
    connector: {
      title: "Impostazioni Connettore",
      connectionMode: "Modalità creazione connessione",
      clickMode: "Modalità clic (consigliata)",
      clickModeDesc: "Clicca sul primo nodo, poi sul secondo per creare una connessione",
      dragMode: "Modalità trascinamento",
      dragModeDesc: "Clicca e trascina dal primo nodo al secondo per creare una connessione",
      note: "Nota: Puoi modificare questa impostazione in qualsiasi momento. La modalità selezionata verrà usata quando lo strumento Connettore è attivo."
    },
    iconPacks: {
      title: "Gestione pacchetti di icone",
      lazyLoading: "Abilita caricamento ritardato (Lazy Loading)",
      lazyLoadingDesc: "Carica i pacchetti di icone su richiesta per un avvio più rapido",
      availablePacks: "Pacchetti di icone disponibili",
      coreIsoflow: "Isoflow di base (sempre caricato)",
      alwaysEnabled: "Sempre abilitato",
      awsPack: "Icone AWS",
      gcpPack: "Icone Google Cloud",
      azurePack: "Icone Azure",
      kubernetesPack: "Icone Kubernetes",
      loading: "Caricamento...",
      loaded: "Caricato",
      notLoaded: "Non caricato",
      iconCount: "{count} icone",
      lazyLoadingDisabledNote: "Il caricamento ritardato è disabilitato. Tutti i pacchetti di icone vengono caricati all'avvio.",
      note: "I pacchetti di icone possono essere abilitati o disabilitati in base alle tue esigenze. I pacchetti disabilitati riducono l'uso di memoria e migliorano le prestazioni."
    }
  },
  lazyLoadingWelcome: {
    title: "Nuova funzione: Lazy Loading!",
    message: "Ciao! Su grande richiesta, abbiamo implementato il caricamento ritardato (Lazy Loading) delle icone. Ora, se desideri abilitare pacchetti di icone non standard, puoi farlo nella sezione 'Configurazione'.",
    configPath: "Clicca sull'icona dell'hamburger",
    configPath2: "in alto a sinistra per accedere alla Configurazione.",
    canDisable: "Puoi disattivare questo comportamento se lo desideri.",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "Dettagli",
    style: "Stile",
    notes: "Note",
    notesModified: "Note ●",
    close: "Chiudi",
    openLink: "Apri link",
    caption: "Didascalia",
    noCaption: "Nessuna didascalia."
  },
  nodeInfoTab: {
    name: "Nome",
    namePlaceholder: "Nome del nodo…",
    removeLink: "Rimuovi link",
    addLink: "Aggiungi link al nome",
    linkPlaceholder: "https://…",
    caption: "Didascalia",
    captionHint: "Mostrato sulla tela sotto il nome del nodo",
    openLink: "Apri link"
  },
  nodeStyleTab: {
    icon: "Icona",
    close: "Chiudi",
    change: "Cambia…",
    iconSize: "Dimensione icona",
    labelFontSize: "Dimensione font etichetta",
    labelColor: "Colore etichetta",
    labelHeight: "Altezza etichetta"
  },
  connectorControls: {
    close: "Chiudi",
    labels: "Etichette"
  },
  textBoxControls: {
    close: "Chiudi",
    text: "Testo",
    textSize: "Dimensione testo",
    textColor: "Colore testo",
    alignment: "Allineamento"
  },
  rectangleControls: {
    close: "Chiudi",
    color: "Colore",
    useCustomColor: "Usa colore personalizzato"
  },
  labelColorPicker: {
    customColor: "Colore personalizzato"
  },
  deleteButton: {
    delete: "Elimina"
  },
  nodeActionBar: {
    style: "Stile",
    editName: "Modifica nome",
    editLink: "Modifica link",
    addLink: "Aggiungi link",
    editNotes: "Modifica note",
    addNotes: "Aggiungi note",
    startConnector: "Start connector",
    delete: "Elimina"
  },
  quickAddNodePopover: {
    add: "Aggiungi",
    group: "Gruppo"
  },
  zoomControls: {
    zoomOut: "Riduci zoom",
    zoomIn: "Aumenta zoom",
    fitToScreen: "Adatta allo schermo",
    help: "Aiuto (F1)"
  },
  labelSettings: {
    description: "Configura le impostazioni di visualizzazione delle etichette",
    expandButtonPadding: "Spaziatura pulsante espandi",
    expandButtonPaddingDesc: "Spaziatura inferiore quando il pulsante espandi è visibile (evita la sovrapposizione del testo)"
  },
  iconSelectionControls: {
    close: "Chiudi",
    importIcons: "Importa icone",
    isometricLabel: "Tratta come isometrico (vista 3D)",
    isometricHint: "Deseleziona per icone piatte (loghi, elementi UI)",
    dragHint: "Puoi trascinare e rilasciare qualsiasi elemento qui sotto sulla tela."
  },
  searchbox: {
    placeholder: "Cerca icone"
  },
  exportImageDialog: {
    title: "Esporta come immagine",
    compatibilityTitle: "Avviso di compatibilità del browser",
    compatibilityMessage: "Per i migliori risultati, usa Chrome o Edge. Firefox attualmente ha problemi di compatibilità con la funzione di esportazione.",
    cropInstruction: "Clicca e trascina per selezionare l'area da esportare",
    options: "Opzioni",
    showGrid: "Mostra griglia",
    expandDescriptions: "Espandi descrizioni",
    cropToContent: "Ritaglia al contenuto",
    backgroundColor: "Colore di sfondo",
    transparentBackground: "Sfondo trasparente",
    exportQuality: "Qualità di esportazione (DPI)",
    custom: "Personalizzato",
    recrop: "Ritaglia di nuovo",
    cropApplied: "Ritaglio applicato con successo",
    applyCrop: "Applica ritaglio",
    clearSelection: "Cancella selezione",
    cropHint: "Seleziona un'area da ritagliare, o deseleziona \"Ritaglia al contenuto\" per usare l'immagine completa",
    cancel: "Annulla",
    downloadSvg: "Scarica come SVG",
    downloadPng: "Scarica come PNG",
    error: "Impossibile esportare l'immagine"
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
