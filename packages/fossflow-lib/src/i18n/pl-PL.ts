import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: 'To jest przykładowy tekst'
  },
  mainMenu: {
    undo: 'Cofnij',
    redo: 'Ponów',
    new: 'New diagram',
    open: 'Otwórz',
    exportJson: 'Eksportuj do JSON',
    exportCompactJson: 'Eksportuj jako kompaktowy JSON',
    exportImage: 'Eksportuj do obrazu',
    clearCanvas: 'Wyczyść obszar roboczy',
    settings: 'Ustawienia',
    gitHub: 'GitHub'
  },
  helpDialog: {
    title: 'Skróty klawiaturowe i Pomoc',
    close: 'Zamknij',
    keyboardShortcuts: 'Skróty klawiaturowe',
    mouseInteractions: 'Interakcje myszy',
    action: 'Operacja',
    shortcut: 'Skrót',
    method: 'Metoda',
    description: 'Opis',
    note: 'Uwagi:',
    noteContent:
      'Skróty klawiaturowe są wyłączone podczas wpisywania danych w polach wprowadzania danych, obszarach tekstowych lub elementach z edytowalną treścią, aby zapobiec konfliktom.',
    // Keyboard shortcuts
    undoAction: 'Cofnij',
    undoDescription: 'Cofnij do ostatniej operacji',
    redoAction: 'Powtórz',
    redoDescription: 'Ponów ostatnia operację',
    redoAltAction: 'Powtórz (alternatywa)',
    redoAltDescription: 'Alternatywny skrót do ponownego wykonania',
    helpAction: 'Pomoc',
    helpDescription:
      'Otwórz okno dialogowe pomocy za pomocą skrótów klawiaturowych',
    zoomInAction: 'Powiększ',
    zoomInShortcut: 'Kółko myszy w górę',
    zoomInDescription: 'Powiększ obszar roboczy',
    zoomOutAction: 'Pomniejsz',
    zoomOutShortcut: 'Kółko muszy w dół',
    zoomOutDescription: 'Pomniejsz obszar roboczy',
    panCanvasAction: 'Przesuwanie obszaru roboczego',
    panCanvasShortcut: 'Kliknij lewym przyciskiem myszy + przeciągnij',
    panCanvasDescription: 'Przesuwaj obszar roboczy w trybie przesuwania',
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
    addNodeGroupAction: 'Add Node / Group',
    addNodeGroupShortcut: 'Double-click (empty area)',
    addNodeGroupDescription:
      'Opens the Add popover at the cursor: pick an icon to place a node, or click Group to add a background area for visually grouping nodes',
    // Mouse interactions
    selectToolAction: 'Wybierz narzędzie',
    selectToolShortcut: 'Kliknij przycisk Wybierz',
    selectToolDescription: 'Przejdź do trybu wyboru',
    panToolAction: 'Narzędzie przesuwania',
    panToolShortcut: 'Kliknij przycisk „Przesuwania”',
    panToolDescription:
      'Przejdź do trybu przesuwania, aby przesuwać obszar roboczy',
    addItemAction: 'Dodaj element',
    addItemShortcut: 'Kliknij przycisk Dodaj element',
    addItemDescription:
      'Otwórz narzędzie do wyboru opcji, aby dodać nowe elementy.',
    drawRectangleAction: 'Narysuj prostokąt',
    drawRectangleShortcut: 'Kliknij przycisk Prostokąt',
    drawRectangleDescription: 'Przejdź do trybu rysowania prostokątów',
    createConnectorAction: 'Stwórz połączenie',
    createConnectorShortcut: 'Kliknij przycisk Połączenie',
    createConnectorDescription: 'Przełącz do trybu połączenia',
    addTextAction: 'Dodaj Tekst',
    addTextShortcut: 'Kliknij przycisk Tekst',
    addTextDescription: 'Utwórz nowe pole tekstowe',
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
    tipCreatingConnectors: 'Wskazówka: Tworzenie połączeń',
    tipConnectorTools: 'Wskazówka: Narzędzia do połączeń',
    clickInstructionStart: 'Kliknij',
    clickInstructionMiddle: 'w pierwszym węźle lub punkcie, a następnie',
    clickInstructionEnd:
      'na drugim węźle lub punkcie, aby utworzyć połączenie.',
    nowClickTarget: 'Teraz kliknij na cel, aby zakończyć połączenie.',
    dragStart: 'Przeciagnij',
    dragEnd: 'od pierwszego węzła do drugiego węzła, aby utworzyć połączenie.',
    rerouteStart: 'Aby zmienić trasę połączenia,',
    rerouteMiddle: 'prawy przycisk myszy',
    rerouteEnd:
      'w dowolnym miejscu wzdłuż linii łącznika i przeciągnij, aby utworzyć lub przenieść punkty kotwiczenia.'
  },
  lassoHintTooltip: {
    tipLasso: 'Wskazówka: Zaznaczanie za pomocą narzędzia Lasso',
    tipFreehandLasso: 'Wskazówka: Zaznaczanie narzędziem Lasso z wolnej ręki',
    lassoDragStart: 'Kliknij i przeciągnij',
    lassoDragEnd:
      'aby narysować prostokątne pole wyboru wokół elementów, które chcesz zaznaczyć.',
    freehandDragStart: 'Kliknij i przeciągnij',
    freehandDragMiddle: 'aby rysować',
    freehandDragEnd: 'dowolny kształt',
    freehandComplete:
      'wokół elementów. Zwolnij, aby zaznaczyć wszystkie elementy wewnątrz kształtu.',
    moveStart: 'Po wybraniu',
    moveMiddle: 'kliknij wewnątrz zaznaczenia,',
    moveEnd: 'i przeciągnij, aby przenieść wszystkie zaznaczone elementy razem.'
  },
  importHintTooltip: {
    title: 'Importuj Diagramy',
    instructionStart: 'Aby zaimportować diagramy, kliknij przycisk',
    menuButton: 'Przycisk menu',
    instructionMiddle: '(☰) w lewym górnym rogu, a następnie wybierz',
    openButton: '"Otwórz"',
    instructionEnd: 'aby załadować pliki diagramów.'
  },
  connectorRerouteTooltip: {
    title: 'Wskazówka: Zmiana trasy połączenia',
    instructionStart:
      'Po umieszczeniu połączenia można je dowolnie przekierowywać..',
    instructionSelect: 'Wybierz połączenie',
    instructionMiddle: 'następnie',
    instructionClick: 'kliknij na ścieżkę połączenia',
    instructionAnd: 'i',
    instructionDrag: 'przesuń',
    instructionEnd: 'aby zmienić!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Aby połączyć to połączenie z węzłem,',
    instruction:
      'kliknij lewym przyciskiem myszy koniec połączenia i przeciągnij go do żądanego węzła.'
  },
  settings: {
    zoom: {
      description:
        'Skonfiguruj zachowanie powiększania podczas korzystania z kółka myszy.',
      zoomToCursor: 'Powiększ do kursora',
      zoomToCursorDesc:
        'Po włączeniu funkcji powiększanie/pomniejszanie odbywa się w oparciu o położenie kursora myszy. Po wyłączeniu funkcji <strong>Powiększ do kursora</strong> odbywa się w oparciu o położenie obszaru roboczego.'
    },
    hotkeys: {
      title: 'Ustawienia skrótów klawiszowych',
      profile: 'Profil skrótów klawiszowych',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'bez skrótów',
      tool: 'Narzędzie',
      hotkey: 'Skrót',
      toolSelect: 'Wybór',
      toolPan: 'Przesuwanie',
      toolAddItem: 'Dodaj element',
      toolRectangle: 'Prostokąt',
      toolConnector: 'Połączenia',
      toolText: 'Tekst',
      note: 'Uwaga: Skróty klawiszowe działają, gdy nie wpisujesz tekstu w polach tekstowych.',
      fixedShortcutsTitle: 'Fixed Shortcuts (Always Active)',
      fixedCut: 'Cut',
      fixedCopy: 'Copy',
      fixedPaste: 'Paste',
      fixedUndo: 'Undo',
      fixedRedo: 'Redo'
    },
    pan: {
      title: 'Ustawienia przesuwania',
      mousePanOptions: 'Opcje przesuwania myszą',
      emptyAreaClickPan: 'Kliknij i przesuń obszar',
      middleClickPan: 'Kliknij środkowym przyciskiem myszy i przeciągnij',
      rightClickPan: 'Kliknij prawym przyciskiem myszy i przeciągnij',
      ctrlClickPan: 'Ctrl + kliknij i przeciągnij',
      altClickPan: 'Alt + kliknij i przeciągnij',
      keyboardPanOptions: 'Opcje przesuwania klawiaturą',
      arrowKeys: 'Klawisze strzałek',
      wasdKeys: 'Klawisze WASD',
      ijklKeys: 'Klawisze IJKL',
      keyboardPanSpeed: 'Szybkość przesuwu klawiatury',
      note: 'Uwaga: Opcje przesuwania działają dodatkowo w stosunku do dedykowanego narzędzia przesuwania.'
    },
    connector: {
      title: 'Ustawienia połączeń',
      connectionMode: 'Tryb tworzenia połączenia',
      clickMode: 'Tryb kliknięcia (zalecany)',
      clickModeDesc:
        'Kliknij pierwszy węzeł, a następnie kliknij drugi węzeł, aby utworzyć połączenie.',
      dragMode: 'Tryb przeciągania',
      dragModeDesc:
        'Kliknij i przeciągnij od pierwszego węzła do drugiego węzła.',
      note: 'Uwaga: To ustawienie można zmienić w dowolnym momencie. Wybrany tryb będzie używany, gdy narzędzie Połączeń jest aktywne..'
    },
    iconPacks: {
      title: 'Zarządzanie pakietami ikon',
      lazyLoading: 'Włącz opóźnione ładowanie',
      lazyLoadingDesc:
        'Wczytuj pakiety ikon na żądanie, aby przyspieszyć uruchamianie',
      availablePacks: 'Dostępne pakiety ikon',
      coreIsoflow: 'Core Isoflow (Zawsze wczytane)',
      alwaysEnabled: 'Zawsze włączone',
      awsPack: 'AWS Icons',
      gcpPack: 'Google Cloud Icons',
      azurePack: 'Azure Icons',
      kubernetesPack: 'Kubernetes Icons',
      loading: 'Wczytywanie...',
      loaded: 'Wczytane',
      notLoaded: 'Niewczytane',
      iconCount: '{count} icon',
      lazyLoadingDisabledNote:
        'Opóźnione ładowanie jest wyłączone. Wszystkie pakiety ikon są ładowane podczas uruchamiania.',
      note: 'Pakiety ikon można włączać lub wyłączać w zależności od potrzeb. Wyłączone pakiety zmniejszają zużycie pamięci i poprawiają wydajność.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Nowa funkcja: Opóźnione ładowanie!',
    message:
      'Hej! W odpowiedzi na liczne prośby wprowadziliśmy funkcję opóźnionego ładowania ikon, więc teraz, jeśli chcesz włączyć niestandardowe pakiety ikon, możesz to zrobić w sekcji „Ustawienia”.',
    configPath: 'Kliknij ikonę manu.',
    configPath2: 'w lewym górnym rogu, aby uzyskać dostęp do ustawień.',
    canDisable: 'Jeśli chcesz, możesz wyłączyć tę funkcję..',
    signature: '-Stan'
  },
  viewTabs: {
    addPage: 'Add page',
    deletePage: 'Delete page',
    renameDiagram: 'Rename diagram'
  },
  nodePanel: {
    details: 'Szczegóły',
    style: 'Styl',
    notes: 'Notatki',
    notesModified: 'Notatki ●',
    close: 'Zamknij',
    openLink: 'Otwórz link',
    caption: 'Podpis',
    noCaption: 'Brak podpisu.'
  },
  nodeInfoTab: {
    name: 'Nazwa',
    namePlaceholder: 'Nazwa węzła…',
    removeLink: 'Usuń link',
    addLink: 'Dodaj link do nazwy',
    linkPlaceholder: 'https://…',
    caption: 'Podpis',
    captionHint: 'Wyświetlany na płótnie poniżej nazwy węzła',
    openLink: 'Otwórz link',
    diagramLink: 'Link to diagram',
    diagramLinkPlaceholder: 'Select a diagram…',
    diagramLinkHint: 'Clicking this node in read-only mode opens the linked diagram',
    openDiagramLink: 'Open linked diagram'
  },
  nodeStyleTab: {
    icon: 'Ikona',
    close: 'Zamknij',
    change: 'Zmień…',
    iconSize: 'Rozmiar ikony',
    labelFontSize: 'Rozmiar czcionki etykiety',
    labelColor: 'Kolor etykiety',
    labelHeight: 'Wysokość etykiety'
  },
  connectorControls: {
    close: 'Zamknij',
    labels: 'Etykiety'
  },
  textBoxControls: {
    close: 'Zamknij',
    text: 'Tekst',
    textSize: 'Rozmiar tekstu',
    textColor: 'Kolor tekstu',
    alignment: 'Wyrównanie'
  },
  rectangleControls: {
    close: 'Zamknij',
    color: 'Kolor',
    useCustomColor: 'Użyj niestandardowego koloru'
  },
  labelColorPicker: {
    customColor: 'Niestandardowy kolor'
  },
  deleteButton: {
    delete: 'Usuń'
  },
  nodeActionBar: {
    style: 'Styl',
    editName: 'Edytuj nazwę',
    editLink: 'Edytuj link',
    addLink: 'Dodaj link',
    editNotes: 'Edytuj notatki',
    addNotes: 'Dodaj notatki',
    startConnector: 'Start connector',
    delete: 'Usuń'
  },
  quickAddNodePopover: {
    add: 'Dodaj',
    rectangle: 'Grupa'
  },
  zoomControls: {
    zoomOut: 'Pomniejsz',
    zoomIn: 'Powiększ',
    fitToScreen: 'Dopasuj do ekranu',
    help: 'Pomoc (F1)'
  },
  labelSettings: {
    description: 'Konfiguracja ustawień wyświetlania etykiet',
    expandButtonPadding: 'Wypełnienie przycisku rozwiń',
    expandButtonPaddingDesc:
      'Dolne wypełnienie gdy przycisk rozwiń jest widoczny (zapobiega nakładaniu się tekstu)'
  },
  iconSelectionControls: {
    close: 'Zamknij',
    importIcons: 'Importuj ikony',
    isometricLabel: 'Traktuj jako izometryczny (widok 3D)',
    isometricHint: 'Odznacz dla płaskich ikon (loga, elementy UI)',
    dragHint: 'Możesz przeciągnąć i upuścić dowolny element poniżej na płótno.'
  },
  searchbox: {
    placeholder: 'Szukaj ikon'
  },
  exportImageDialog: {
    title: 'Eksportuj jako obraz',
    compatibilityTitle: 'Uwaga dotycząca zgodności przeglądarki',
    compatibilityMessage:
      'Aby uzyskać najlepsze wyniki, użyj Chrome lub Edge. Firefox ma obecnie problemy ze zgodnością z funkcją eksportu.',
    cropInstruction: 'Kliknij i przeciągnij, aby wybrać obszar do eksportu',
    options: 'Opcje',
    showGrid: 'Pokaż siatkę',
    expandDescriptions: 'Rozwiń opisy',
    cropToContent: 'Przytnij do zawartości',
    backgroundColor: 'Kolor tła',
    transparentBackground: 'Przezroczyste tło',
    exportQuality: 'Jakość eksportu (DPI)',
    custom: 'Niestandardowy',
    recrop: 'Przytnij ponownie',
    cropApplied: 'Przycięcie zastosowane pomyślnie',
    applyCrop: 'Zastosuj przycięcie',
    clearSelection: 'Wyczyść zaznaczenie',
    cropHint:
      'Wybierz obszar do przycięcia lub odznacz "Przytnij do zawartości", aby użyć pełnego obrazu',
    cancel: 'Anuluj',
    downloadSvg: 'Pobierz jako SVG',
    downloadPng: 'Pobierz jako PNG',
    error: 'Nie można wyeksportować obrazu'
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
