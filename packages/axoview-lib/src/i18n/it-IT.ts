import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Questo è un testo di esempio'
  },
  rightSidebar: {
    collapsePanel: 'Comprimi pannello',
    emptyState:
      'Seleziona un nodo, un connettore o una forma per visualizzarne le proprietà'
  },
  helpDialog: {
    title: 'Scorciatoie da tastiera e aiuto',
    close: 'Chiudi',
    keyboardShortcuts: 'Scorciatoie da tastiera',
    mouseInteractions: 'Interazioni del mouse',
    action: 'Azione',
    shortcut: 'Scorciatoia',
    method: 'Metodo',
    description: 'Descrizione',
    note: 'Nota:',
    noteContent:
      'Le scorciatoie da tastiera sono disattivate durante la digitazione in campi di testo o elementi modificabili per evitare conflitti.',
    // Keyboard shortcuts
    undoAction: 'Annulla',
    undoDescription: "Annulla l'ultima azione",
    redoAction: 'Ripeti',
    redoDescription: "Ripeti l'ultima azione annullata",
    redoAltAction: 'Ripeti (Alternativa)',
    redoAltDescription: 'Scorciatoia alternativa per ripetere',
    helpAction: 'Aiuto',
    helpDescription: 'Apri la finestra di aiuto con le scorciatoie da tastiera',
    zoomInAction: 'Ingrandisci',
    zoomInShortcut: 'Rotella del mouse su',
    zoomInDescription: 'Ingrandisci la tela',
    zoomOutAction: 'Rimpicciolisci',
    zoomOutShortcut: 'Rotella del mouse giù',
    zoomOutDescription: 'Rimpicciolisci la tela',
    panCanvasAction: 'Sposta la tela',
    panCanvasShortcut: 'Clic sinistro + trascina',
    panCanvasDescription: 'Muovi la tela in modalità panoramica',
    togglePanToolAction: 'Attiva/Disattiva panoramica',
    togglePanToolShortcut: 'Clic destro',
    togglePanToolDescription:
      'Attiva/disattiva modalità panoramica; clic sinistro per tornare alla modalità selezione',
    lassoSelectAction: 'Selezione Lasso',
    lassoSelectShortcut: 'Clic sinistro + Trascina (area vuota)',
    lassoSelectDescription:
      'Disegna un riquadro di selezione rettangolare per selezionare più elementi',
    deselectAction: 'Deseleziona',
    deselectShortcut: 'Clic sinistro (area vuota)',
    deselectDescription:
      'Deseleziona la selezione corrente e torna alla modalità selezione',
    // Mouse interactions
    selectToolAction: 'Strumento Selezione',
    selectToolShortcut: 'Clicca il pulsante Selezione',
    selectToolDescription: 'Passa alla modalità selezione',
    panToolAction: 'Strumento Panoramica',
    panToolShortcut: 'Clicca il pulsante Panoramica',
    panToolDescription: 'Passa alla modalità panoramica per spostare la tela',
    addItemAction: 'Aggiungi elemento',
    addItemShortcut: 'Clicca il pulsante Aggiungi elemento',
    addItemDescription:
      'Apri il selettore di icone per aggiungere nuovi elementi',
    drawRectangleAction: 'Disegna rettangolo',
    drawRectangleShortcut: 'Clicca il pulsante Rettangolo',
    drawRectangleDescription: 'Passa alla modalità disegno rettangolo',
    createConnectorAction: 'Crea connettore',
    createConnectorShortcut: 'Clicca il pulsante Connettore',
    createConnectorDescription: 'Passa alla modalità connettore',
    addTextAction: 'Aggiungi testo',
    addTextShortcut: 'Clicca il pulsante Testo',
    addTextDescription: 'Crea una nuova casella di testo',
    deleteSelectedAction: 'Elimina selezionati',
    deleteSelectedShortcut: 'Canc (Backspace su Mac)',
    deleteSelectedDescription:
      "Elimina l'elemento selezionato o tutti gli elementi in una selezione lasso; supporta annulla/ripeti",
    cutAction: 'Taglia',
    cutDescription:
      'Taglia gli elementi selezionati negli appunti — gli elementi vengono rimossi e possono essere incollati altrove; supporta annulla/ripeti',
    copyAction: 'Copia',
    copyDescription: 'Copia gli elementi selezionati negli appunti',
    pasteAction: 'Incolla',
    pasteDescription:
      'Incolla gli elementi degli appunti alla posizione del mouse; sposta per evitare sovrapposizioni',
    // D10 — Select all row
    selectAllAction: 'Seleziona tutto',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Seleziona tutti gli elementi visibili e sbloccati nella vista attiva (elementi, rettangoli, caselle di testo, connettori + i loro punti di passaggio)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Rinomina',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Rinomina l’elemento o il diagramma selezionato in linea',
    keyAddItemAction: 'Aggiungi elemento / Elementi',
    keyAddItemShortcut: 'N',
    keyAddItemDescription:
      'Attiva/disattiva il pannello Elementi per inserire un nuovo elemento',
    keyConnectorAction: 'Connettore',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Passa allo strumento connettore',
    keyLassoAction: 'Selezione lazo',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Passa allo strumento di selezione lazo',
    keySelectAction: 'Seleziona',
    keySelectShortcut: 'S',
    keySelectDescription: 'Passa allo strumento di selezione',
    // D10 — mouse interactions
    miSelectAction: 'Seleziona',
    miSelectMethod: 'Clic sinistro',
    miSelectDescription:
      'Fai clic su un elemento per selezionarlo (lo evidenzia e mostra la barra delle azioni flottante). Fai clic sulla tela vuota per annullare la selezione.',
    miOpenDetailsAction: 'Apri dettagli',
    miOpenDetailsMethod: 'Doppio clic',
    miOpenDetailsDescription:
      'Fai doppio clic su un elemento per aprire il suo pannello dei dettagli, come la voce «Dettagli…» del menu contestuale.',
    miToggleSelectionAction: 'Attiva/disattiva selezione',
    miToggleSelectionMethod: 'Ctrl/Cmd + Clic sinistro',
    miToggleSelectionDescription:
      'Aggiungi o rimuovi un elemento dalla selezione multipla; un connettore si attiva/disattiva insieme ai suoi punti di passaggio.',
    miPanAction: 'Sposta',
    miPanMethod: 'Clic destro + trascina',
    miPanDescription:
      'Tieni premuto il pulsante destro e trascina per spostare la tela. Anche il trascinamento con il tasto centrale sposta; i tasti freccia la muovono.',
    miContextMenuAction: 'Menu contestuale',
    miContextMenuMethod: 'Clic destro (tocco)',
    miContextMenuDescription:
      'Un clic destro senza trascinare apre il menu contestuale: il menu dell’elemento sopra un elemento, o il menu della tela sopra uno spazio vuoto. Su touch, tieni premuto a lungo.',
    miRemoveWaypointAction: 'Rimuovi punto di passaggio',
    miRemoveWaypointMethod: 'Alt + Clic sinistro',
    miRemoveWaypointDescription:
      'Alt+clic su un punto di passaggio di un connettore per rimuoverlo (senza dover prima selezionare il connettore); gli ancoraggi terminali vengono conservati.',
    miZoomAction: 'Zoom',
    miZoomMethod: 'Rotellina',
    miZoomDescription: 'Scorri per ingrandire verso il cursore.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'Suggerimento: Creazione connettori',
    tipConnectorTools: 'Suggerimento: Strumenti connettore',
    clickInstructionStart: 'Clicca',
    clickInstructionMiddle: 'sul primo nodo o punto, poi',
    clickInstructionEnd: 'sul secondo nodo o punto per creare una connessione.',
    nowClickTarget: "Ora clicca sull'obiettivo per completare la connessione.",
    dragStart: 'Trascina',
    dragEnd: 'dal primo nodo al secondo nodo per creare una connessione.',
    rerouteStart: 'Per riorientare un connettore,',
    rerouteMiddle: 'clicca con il tasto sinistro',
    rerouteEnd:
      'su un punto qualsiasi lungo la linea del connettore e trascina per creare o spostare i punti di ancoraggio.'
  },
  lassoHintTooltip: {
    tipLasso: 'Suggerimento: Selezione Lasso',
    tipFreehandLasso: 'Suggerimento: Selezione Lasso a mano libera',
    lassoDragStart: 'Clicca e trascina',
    lassoDragEnd:
      'per disegnare un riquadro di selezione rettangolare attorno agli elementi da selezionare.',
    freehandDragStart: 'Clicca e trascina',
    freehandDragMiddle: 'per disegnare una',
    freehandDragEnd: 'forma libera',
    freehandComplete:
      "attorno agli elementi. Rilascia per selezionare tutti gli elementi all'interno della forma.",
    moveStart: 'Una volta selezionati,',
    moveMiddle: "clicca all'interno della selezione",
    moveEnd: 'e trascina per muovere tutti gli elementi selezionati insieme.'
  },
  importHintTooltip: {
    title: 'Importa diagrammi',
    instructionStart: 'Per importare diagrammi, clicca sul',
    menuButton: 'pulsante del menu',
    instructionMiddle: '(☰) in alto a sinistra, poi seleziona',
    openButton: '"Apri"',
    instructionEnd: 'per caricare i tuoi file di diagramma.'
  },
  connectorRerouteTooltip: {
    title: 'Suggerimento: Riorienta connettori',
    instructionStart:
      'Una volta posizionati i connettori, puoi riorientarli come preferisci.',
    instructionSelect: 'Seleziona prima il connettore,',
    instructionMiddle: 'poi',
    instructionClick: 'clicca sul percorso del connettore',
    instructionAnd: 'e',
    instructionDrag: 'trascina',
    instructionEnd: 'per modificarlo!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Per collegare questo connettore a un nodo,',
    instruction:
      'clicca con il tasto sinistro sulla fine del connettore e trascinalo sul nodo desiderato.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Impostazioni',
    close: 'Chiudi',
    canvas: 'Tela',
    language: 'Lingua',
    about: 'Informazioni',
    languageDescription:
      "Seleziona la lingua di visualizzazione dell'interfaccia dell'applicazione.",
    zoomSection: 'Zoom',
    labelsSection: 'Etichette',
    zoom: {
      description:
        'Configura il comportamento dello zoom quando si usa la rotella del mouse.',
      zoomToCursor: 'Zoom sul cursore',
      zoomToCursorDesc:
        'Se abilitato, ingrandisci o riduci centrando sul cursore del mouse. Se disabilitato, lo zoom è centrato sulla tela.'
    },
    hotkeys: {
      title: 'Impostazioni scorciatoie',
      profile: 'Profilo scorciatoie',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Nessuna scorciatoia',
      tool: 'Strumento',
      hotkey: 'Scorciatoia',
      toolSelect: 'Seleziona',
      toolPan: 'Panoramica',
      toolAddItem: 'Aggiungi elemento',
      toolRectangle: 'Rettangolo',
      toolConnector: 'Connettore',
      toolText: 'Testo',
      note: 'Nota: Le scorciatoie funzionano quando non stai digitando nei campi di testo',
      fixedShortcutsTitle: 'Scorciatoie fisse (sempre attive)',
      fixedCut: 'Taglia',
      fixedCopy: 'Copia',
      fixedPaste: 'Incolla',
      fixedUndo: 'Annulla',
      fixedRedo: 'Ripeti'
    },
    connector: {
      title: 'Impostazioni Connettore',
      connectionMode: 'Modalità creazione connessione',
      clickMode: 'Modalità clic (consigliata)',
      clickModeDesc:
        'Clicca sul primo nodo, poi sul secondo per creare una connessione',
      dragMode: 'Modalità trascinamento',
      dragModeDesc:
        'Clicca e trascina dal primo nodo al secondo per creare una connessione',
      note: 'Nota: Puoi modificare questa impostazione in qualsiasi momento. La modalità selezionata verrà usata quando lo strumento Connettore è attivo.'
    },
    iconPacks: {
      title: 'Gestione pacchetti di icone',
      lazyLoading: 'Abilita caricamento ritardato (Lazy Loading)',
      lazyLoadingDesc:
        'Carica i pacchetti di icone su richiesta per un avvio più rapido',
      availablePacks: 'Pacchetti di icone disponibili',
      coreIsoflow: 'Axoview di base (sempre caricato)',
      alwaysEnabled: 'Sempre abilitato',
      awsPack: 'Icone AWS',
      gcpPack: 'Icone Google Cloud',
      azurePack: 'Icone Azure',
      kubernetesPack: 'Icone Kubernetes',
      loading: 'Caricamento...',
      loaded: 'Caricato',
      notLoaded: 'Non caricato',
      iconCount: '{count} icone',
      lazyLoadingDisabledNote:
        "Il caricamento ritardato è disabilitato. Tutti i pacchetti di icone vengono caricati all'avvio.",
      note: "I pacchetti di icone possono essere abilitati o disabilitati in base alle tue esigenze. I pacchetti disabilitati riducono l'uso di memoria e migliorano le prestazioni."
    }
  },
  lazyLoadingWelcome: {
    title: 'Benvenuto in Axoview',
    message:
      'Axoview è uno strumento gratuito e open source per creare splendidi diagrammi isometrici e 2D — architetture cloud, di rete e infrastrutturali, con le icone di AWS, GCP, Azure e Kubernetes già integrate. Tutto funziona direttamente nel tuo browser, salvando in locale o sul tuo Google Drive. Costruito sui progetti open source FossFLOW e Isoflow e in continua espansione — trovi il codice sorgente, segnali un bug o richiedi una funzionalità su github.com/molikas/axoview.',
    configPath: "Clicca sull'icona dell'hamburger",
    configPath2: 'in alto a sinistra per accedere alla Configurazione.',
    canDisable: 'Puoi disattivare questo comportamento se lo desideri.',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Aggiungi pagina',
    deletePage: 'Elimina pagina',
    renameDiagram: 'Rinomina diagramma',
    addPageDisabled: 'Limite di pagine raggiunto (5)'
  },
  nodePanel: {
    notes: 'Note',
    close: 'Chiudi'
  },
  nodeDeck: {
    metadata: 'Metadati',
    name: 'Nome',
    namePlaceholder: 'Nome del nodo…',
    label: 'Etichetta',
    labelPlaceholder: 'Etichetta mostrata sulla forma…'
  },
  connectorControls: {
    metadata: 'Metadati',
    close: 'Chiudi',
    notes: 'Note',
    name: 'Nome',
    namePlaceholder: "Etichetta dell'arco…",
    labels: 'Etichette',
    addLabel: 'Aggiungi etichetta',
    noLabels: 'Nessuna etichetta ancora.',
    labelN: 'Etichetta {count}',
    positionHint:
      "Trascina un'etichetta sulla tela per posizionarla; usa la barra superiore per la dimensione e il colore del testo.",
    line: 'Linea',
    line1: 'Linea 1',
    line2: 'Linea 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Cerca o incolla un link',
    linkCopy: 'Copia link',
    linkCopied: 'Copiato',
    linkEdit: 'Modifica link',
    linkRemove: 'Rimuovi link',
    placeholder: 'Scrivi qualcosa',
    metadata: 'Metadati',
    notes: 'Note',
    close: 'Chiudi',
    name: 'Nome',
    namePlaceholder: "Nome dell'elemento…"
  },
  rectangleControls: {
    metadata: 'Metadati',
    notes: 'Note',
    close: 'Chiudi',
    name: 'Nome',
    namePlaceholder: "Nome dell'elemento…"
  },
  topBarStyleControls: {
    mixed: 'Misto',
    rotate90: 'Ruota di 90°',
    noColor: 'Nessun colore',
    pickColorFromScreen: 'Preleva colore dallo schermo',
    customColor: 'Colore personalizzato',
    textSize: 'Dimensione testo',
    lineSpacing: 'Interlinea',
    alignment: 'Allineamento',
    alignmentDisabled: 'Seleziona una casella di testo per allineare il testo',
    alignLeft: 'Allinea a sinistra',
    alignCenter: 'Centra',
    alignRight: 'Allinea a destra',
    alignTop: 'Allinea in alto',
    alignMiddle: 'Allinea al centro verticale',
    alignBottom: 'Allinea in basso',
    textColor: 'Colore testo',
    textColorDisabled:
      "Seleziona un nodo, una casella di testo, un'etichetta o un'etichetta di connessione per impostare il colore del testo",
    textSizeDisabled:
      "Seleziona un nodo, una casella di testo, un'etichetta o un'etichetta di connessione per impostare la dimensione del testo",
    labelSizeAllSelected: 'Dimensione etichetta (tutti i selezionati)',
    textColorAllSelected: 'Colore del testo (tutti i selezionati)',
    armedToolPlaceFirst:
      'Il nuovo elemento usa lo stile predefinito — posizionalo prima, poi stilizzalo qui',
    decreaseLabelSize: 'Riduci dimensione etichetta',
    increaseLabelSize: 'Aumenta dimensione etichetta',
    labelSize: 'Dimensione etichetta',
    decreaseSize: 'Riduci dimensione',
    increaseSize: 'Aumenta dimensione',
    stepAll: 'Applica a tutti',
    size: 'Dimensione',
    bold: 'Grassetto',
    italic: 'Corsivo',
    underline: 'Sottolineato',
    strikethrough: 'Barrato',
    format: 'Grassetto / corsivo / sottolineato / barrato',
    formatDisabled:
      "Seleziona un nodo, una casella di testo, un'etichetta o un'etichetta di connessione per formattare il testo",
    lists: 'Elenchi',
    listsDisabled: 'Seleziona una casella di testo per usare gli elenchi',
    bulletList: 'Elenco puntato',
    numberedList: 'Elenco numerato',
    background: 'Colore di sfondo',
    backgroundDisabled:
      "Seleziona un rettangolo, un'etichetta o una casella di testo per impostarne il colore di sfondo",
    opacity: 'Opacità',
    border: 'Bordo',
    borderDisabled:
      'Seleziona un rettangolo o una casella di testo per impostarne il bordo',
    lineStyle: 'Stile linea',
    width: 'Spessore',
    borderColor: 'Colore bordo',
    link: 'Link',
    linkDisabled:
      "Seleziona un nodo, una connessione o un'etichetta per aggiungere un link",
    linkSelection: 'Collega il testo selezionato',
    linkDisabledTextBox:
      'Seleziona del testo durante la modifica per aggiungere un link',
    linkToWeb: 'Link al web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Link al diagramma',
    searchDiagrams: 'Cerca diagrammi…',
    openLinkedDiagram: 'Apri diagramma collegato',
    showLabel: 'Mostra etichetta',
    hideLabel: 'Nascondi etichetta',
    showHideLabelDisabled:
      "Seleziona un nodo o una connessione per mostrarne o nasconderne l'etichetta",
    changeIconBulk: "La modifica dell'icona si applica a un nodo alla volta",
    changeIcon: 'Cambia icona',
    changeIconDisabled: "Seleziona un nodo per cambiarne l'icona",
    connectionColorPredraw: 'Colore per la prossima connessione che disegni',
    connectionColor: 'Colore connessione',
    connectionColorDisabled:
      'Seleziona una connessione (o lo strumento connettore) per impostarne il colore',
    lineOptionsPredraw: 'Stile linea per la prossima connessione che disegni',
    lineOptions: 'Opzioni linea',
    lineOptionsDisabled:
      'Seleziona una connessione (o lo strumento connettore) per impostarne le opzioni di linea',
    lineType: 'Tipo di linea',
    showArrow: 'Mostra freccia',
    showDottedLine: 'Mostra linea punteggiata'
  },
  quickAddNodePopover: {
    add: 'Aggiungi',
    rectangle: 'Gruppo'
  },
  zoomControls: {
    zoomOut: 'Riduci zoom',
    zoomIn: 'Aumenta zoom',
    fitToScreen: 'Adatta allo schermo',
    keepLabelsReadable: 'Mantieni le etichette leggibili',
    help: 'Aiuto (F1)',
    selected: '{count} selezionati'
  },
  modeHints: {
    connector: 'Trascina tra gli elementi per collegare • Esc per annullare',
    textBox:
      'Fai clic per posizionare una casella di testo • Esc per annullare',
    label: "Fai clic per posizionare un'etichetta • Esc per annullare",
    rectangle: 'Trascina per disegnare un rettangolo • Esc per annullare'
  },
  previewLayerSwitcher: {
    layers: 'Livelli',
    showLayer: 'Mostra livello',
    hideLayer: 'Nascondi livello',
    solo: 'Solo',
    unsolo: 'Esci da solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Nascondi etichette',
    showLabels: 'Mostra etichette'
  },
  annotationPalette: {
    pen: 'Annota',
    select: 'Seleziona',
    draw: 'Disegna',
    shapes: 'Forme',
    pencil: 'Matita',
    highlighter: 'Evidenziatore',
    line: 'Linea',
    arrow: 'Freccia',
    rectangle: 'Rettangolo',
    ellipse: 'Ellisse',
    eraser: 'Gomma',
    undo: 'Annulla',
    redo: 'Ripeti',
    clear: 'Cancella tutto'
  },
  viewModeInfoPopover: {
    close: 'Chiudi'
  },
  labelSettings: {
    description: 'Configura le impostazioni di visualizzazione delle etichette',
    expandButtonPadding: 'Spaziatura pulsante espandi',
    expandButtonPaddingDesc:
      'Spaziatura inferiore quando il pulsante espandi è visibile (evita la sovrapposizione del testo)',
    // D13
    currentValue: 'Attuale: {value} unità del tema'
  },
  iconSelectionControls: {
    close: 'Chiudi',
    importIcons: 'Importa icone',
    addMoreIcons: 'Aggiungi altre icone',
    isometricLabel: 'Tratta come isometrico (vista 3D)',
    isometricHint: 'Deseleziona per icone piatte (loghi, elementi UI)',
    dragHint:
      'Puoi trascinare e rilasciare qualsiasi elemento qui sotto sulla tela.',
    aiPromptTooltip: "Genera icone con l'IA",
    aiPromptTitle: "Genera icone isometriche con l'IA",
    aiPromptBody:
      "Incolla questo prompt in un'IA generatrice di immagini. Sostituisci 'my object' con ciò che ti serve, poi importa il PNG generato.",
    aiPromptCopy: 'Copia prompt',
    aiPromptCopied: 'Copiato'
  },
  searchbox: {
    placeholder: 'Cerca icone'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Esporta come immagine',
    compatibilityTitle: 'Avviso di compatibilità del browser',
    compatibilityMessage:
      'Per i migliori risultati, usa Chrome o Edge. Firefox attualmente ha problemi di compatibilità con la funzione di esportazione.',
    cropInstruction: "Clicca e trascina per selezionare l'area da esportare",
    options: 'Opzioni',
    showGrid: 'Mostra griglia',
    showLabels: 'Mostra etichette',
    screenshotPreset: 'Screenshot (consigliato)',
    scaleClamped:
      'Dimensione di esportazione ridotta per rientrare nel limite immagine del browser:',
    cropToContent: 'Ritaglia al contenuto',
    backgroundColor: 'Colore di sfondo',
    transparentBackground: 'Sfondo trasparente',
    exportQuality: 'Qualità di esportazione (DPI)',
    custom: 'Personalizzato',
    recrop: 'Ritaglia di nuovo',
    cropApplied: 'Ritaglio applicato con successo',
    applyCrop: 'Applica ritaglio',
    clearSelection: 'Cancella selezione',
    cropHint:
      'Seleziona un\'area da ritagliare, o deseleziona "Ritaglia al contenuto" per usare l\'immagine completa',
    cancel: 'Annulla',
    downloadSvg: 'Scarica come SVG',
    downloadPng: 'Scarica come PNG',
    error: "Impossibile esportare l'immagine"
  },
  toolMenu: {
    label: 'Label',
    undo: 'Annulla',
    redo: 'Ripeti',
    select: 'Seleziona',
    lassoSelect: 'Selezione lasso',
    freehandLasso: 'Lasso a mano libera',
    pan: 'Panoramica',
    addItem: 'Aggiungi elemento',
    rectangle: 'Rettangolo',
    connector: 'Connettore',
    text: 'Testo',
    common: 'Comuni',
    // D5
    switchTo2D: 'Passa alla vista 2D',
    switchToIsometric: 'Passa alla vista isometrica',
    clickMode: 'Clic',
    dragMode: 'Trascina'
  },
  quickIconSelector: {
    recentlyUsed: 'USATI DI RECENTE',
    searchResults: 'RISULTATI RICERCA ({count} icone)',
    noIconsFound: 'Nessuna icona trovata per "{term}"'
  },
  canvasContextMenu: {
    addNote: 'Aggiungi nota',
    addLabel: 'Aggiungi etichetta',
    details: 'Dettagli…',
    rename: 'Rinomina',
    cut: 'Taglia',
    copy: 'Copia',
    paste: 'Incolla',
    duplicate: 'Duplica',
    bringForward: 'Porta avanti',
    sendBackward: 'Porta indietro',
    bringToFront: 'Porta in primo piano',
    sendToBack: 'Porta in secondo piano',
    assignToLayer: 'Assegna al livello',
    fitToText: 'Adatta al testo',
    snapToGrid: 'Aggancia alla griglia',
    unsnapFromGrid: 'Sgancia dalla griglia',
    disableCollision: 'Disattiva collisione',
    enableCollision: 'Attiva collisione',
    delete: 'Elimina',
    addItem: 'Aggiungi elemento',
    selectAll: 'Seleziona tutto',
    enableSnapToGrid: 'Attiva aggancio alla griglia',
    disableSnapToGrid: 'Disattiva aggancio alla griglia',
    itemsSelectedOne: '{count} elemento selezionato',
    itemsSelectedOther: '{count} elementi selezionati',
    deleteItemsOne: 'Elimina {count} elemento',
    deleteItemsOther: 'Elimina {count} elementi',
    removeFromLayer: 'Rimuovi dal livello',
    noLayers: 'Nessun livello — aggiungine uno nel pannello dei livelli'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Esplora file',
    elements: 'Elementi',
    layers: 'Livelli',
    settings: 'Impostazioni',
    openDiagramFirst: 'apri o crea prima un diagramma',
    collapsePanel: 'Comprimi pannello'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: 'Eliminare il livello?',
    deleteLayerBody: 'Questo livello contiene {count} elemento/i. Cosa deve accadere?',
    deleteLayerHiddenWarning: 'Questo livello è NASCOSTO. Mantenendone il contenuto tornerà VISIBILE: un elemento senza livello è sempre mostrato.',
    deleteLayerCancel: 'Annulla',
    deleteLayerKeep: 'Mantieni il contenuto',
    deleteLayerDeleteContents: 'Elimina anche il contenuto',
    header: 'Livelli',
    addLayer: 'Aggiungi livello',
    deleteSelectedLayer: 'Elimina livello selezionato',
    noLayersYet: 'Ancora nessun livello. Fai clic su + per aggiungerne uno.',
    unassigned: 'Non assegnato ({count})',
    dropToUnassign: 'Rilascia qui gli elementi per annullarne l’assegnazione',
    layerN: 'Livello {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} elemento copiato',
    copiedOther: '{count} elementi copiati',
    cutOne: '{count} elemento tagliato',
    cutOther: '{count} elementi tagliati',
    pastedOne: '{count} elemento incollato',
    pastedOther: '{count} elementi incollati',
    nothingToPaste: 'Niente da incollare',
    couldNotPaste: 'Impossibile incollare — il contenuto copiato non è compatibile con questo diagramma',
    routingConnectors: 'Incollaggio… instradamento connettori ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Pagina {count}'
  }
};

export default locale;
