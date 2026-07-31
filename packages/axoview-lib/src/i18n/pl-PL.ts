import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'To jest przykładowy tekst'
  },
  rightSidebar: {
    collapsePanel: 'Zwiń panel',
    emptyState:
      'Wybierz węzeł, łącznik lub kształt, aby zobaczyć jego właściwości'
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
    togglePanToolAction: 'Przełącz narzędzie przesuwania',
    togglePanToolShortcut: 'Prawy przycisk myszy',
    togglePanToolDescription:
      'Przełącz tryb przesuwania; lewy przycisk aby wrócić do trybu zaznaczania',
    lassoSelectAction: 'Zaznaczanie lasso',
    lassoSelectShortcut: 'Lewy przycisk + Przeciągnij (pusty obszar)',
    lassoSelectDescription:
      'Narysuj prostokątne pole zaznaczenia, aby wybrać wiele elementów',
    deselectAction: 'Odznacz',
    deselectShortcut: 'Lewy przycisk (pusty obszar)',
    deselectDescription:
      'Odznacz bieżące zaznaczenie i wróć do trybu zaznaczania',
    // Mouse interactions
    selectToolAction: 'Wybierz narzędzie',
    selectToolShortcut: 'Kliknij przycisk Wybierz',
    selectToolDescription: 'Przejdź do trybu wyboru',
    panToolAction: 'Narzędzie przesuwania',
    panToolShortcut: 'Kliknij przycisk „Przesuwania"',
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
    deleteSelectedAction: 'Usuń zaznaczone',
    deleteSelectedShortcut: 'Delete (Backspace na Mac)',
    deleteSelectedDescription:
      'Usuń zaznaczony element lub wszystkie elementy w zaznaczeniu lasso; obsługuje cofanie/ponawianie',
    cutAction: 'Wytnij',
    cutDescription:
      'Wytnij zaznaczone elementy do schowka — elementy są usuwane i mogą być wklejone w innym miejscu; obsługuje cofanie/ponawianie',
    copyAction: 'Kopiuj',
    copyDescription: 'Kopiuj zaznaczone elementy do schowka',
    pasteAction: 'Wklej',
    pasteDescription:
      'Wklej elementy ze schowka w pozycji myszy; przesunięte, aby uniknąć nakładania',
    // D10 — Select all row
    selectAllAction: 'Zaznacz wszystko',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Zaznacz wszystkie widoczne, odblokowane elementy w aktywnym widoku (elementy, prostokąty, pola tekstowe, łączniki + ich punkty trasy)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Zmień nazwę',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Zmień nazwę zaznaczonego elementu lub diagramu w miejscu',
    keyAddItemAction: 'Dodaj element / Elementy',
    keyAddItemShortcut: 'N',
    keyAddItemDescription: 'Przełącz panel Elementy, aby umieścić nowy element',
    keyConnectorAction: 'Łącznik',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Przełącz na narzędzie łącznika',
    keyLassoAction: 'Zaznaczanie lasso',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Przełącz na narzędzie zaznaczania lasso',
    keySelectAction: 'Zaznacz',
    keySelectShortcut: 'S',
    keySelectDescription: 'Przełącz na narzędzie zaznaczania',
    // D10 — mouse interactions
    miSelectAction: 'Zaznacz',
    miSelectMethod: 'Lewy przycisk',
    miSelectDescription:
      'Kliknij element, aby go zaznaczyć (podświetla go i pokazuje pływający pasek akcji). Kliknij pustą kanwę, aby wyczyścić zaznaczenie.',
    miOpenDetailsAction: 'Otwórz szczegóły',
    miOpenDetailsMethod: 'Podwójne kliknięcie',
    miOpenDetailsDescription:
      'Kliknij dwukrotnie element, aby otworzyć jego panel szczegółów — tak samo jak pozycja „Szczegóły…” w menu kontekstowym.',
    miToggleSelectionAction: 'Przełącz zaznaczenie',
    miToggleSelectionMethod: 'Ctrl/Cmd + Lewy przycisk',
    miToggleSelectionDescription:
      'Dodaj lub usuń element z zaznaczenia wielokrotnego; łącznik przełącza się razem ze swoimi punktami trasy.',
    miPanAction: 'Przesuń',
    miPanMethod: 'Prawy przycisk + przeciągnij',
    miPanDescription:
      'Przytrzymaj prawy przycisk i przeciągnij, aby przesunąć kanwę. Przeciąganie środkowym przyciskiem też przesuwa; strzałki ją przesuwają.',
    miContextMenuAction: 'Menu kontekstowe',
    miContextMenuMethod: 'Prawy przycisk (dotknięcie)',
    miContextMenuDescription:
      'Kliknięcie prawym przyciskiem bez przeciągania otwiera menu kontekstowe — menu elementu nad elementem lub menu kanwy nad pustą przestrzenią. Na ekranie dotykowym przytrzymaj dłużej.',
    miRemoveWaypointAction: 'Usuń punkt trasy',
    miRemoveWaypointMethod: 'Alt + Lewy przycisk',
    miRemoveWaypointDescription:
      'Alt+kliknij punkt trasy łącznika, aby go usunąć (bez konieczności wcześniejszego zaznaczania łącznika); kotwice końcowe są zachowywane.',
    miZoomAction: 'Powiększenie',
    miZoomMethod: 'Kółko myszy',
    miZoomDescription: 'Przewijaj, aby powiększać w kierunku kursora.'
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
    // D3 — SettingsDialog chrome
    title: 'Ustawienia',
    close: 'Zamknij',
    canvas: 'Płótno',
    language: 'Język',
    about: 'O programie',
    languageDescription: 'Wybierz język wyświetlania interfejsu aplikacji.',
    zoomSection: 'Powiększenie',
    labelsSection: 'Etykiety',
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
      fixedShortcutsTitle: 'Stałe skróty (zawsze aktywne)',
      fixedCut: 'Wytnij',
      fixedCopy: 'Kopiuj',
      fixedPaste: 'Wklej',
      fixedUndo: 'Cofnij',
      fixedRedo: 'Ponów'
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
      awsPack: 'Ikony AWS',
      gcpPack: 'Ikony Google Cloud',
      azurePack: 'Ikony Azure',
      kubernetesPack: 'Ikony Kubernetes',
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
    title: 'Witamy w Axoview',
    message:
      'Axoview to darmowe narzędzie open source do tworzenia pięknych diagramów izometrycznych i 2D — architektury chmury, sieci i infrastruktury, z wbudowanymi ikonami AWS, GCP, Azure i Kubernetes. Wszystko działa w Twojej przeglądarce, zapisując dane lokalnie lub na Twoim własnym Google Drive. Zbudowane na bazie projektów open source FossFLOW i Isoflow oraz aktywnie rozwijane — kod źródłowy, zgłaszanie błędów i propozycje funkcji znajdziesz na github.com/molikas/axoview.',
    configPath: 'Kliknij ikonę manu.',
    configPath2: 'w lewym górnym rogu, aby uzyskać dostęp do ustawień.',
    canDisable: 'Jeśli chcesz, możesz wyłączyć tę funkcję..',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Dodaj stronę',
    deletePage: 'Usuń stronę',
    renameDiagram: 'Zmień nazwę diagramu',
    addPageDisabled: 'Osiągnięto limit stron (5)'
  },
  nodePanel: {
    notes: 'Notatki',
    close: 'Zamknij'
  },
  nodeDeck: {
    metadata: 'Metadane',
    name: 'Nazwa',
    namePlaceholder: 'Nazwa węzła…',
    label: 'Etykieta',
    labelPlaceholder: 'Etykieta widoczna na kształcie…'
  },
  connectorControls: {
    metadata: 'Metadane',
    close: 'Zamknij',
    notes: 'Notatki',
    name: 'Nazwa',
    namePlaceholder: 'Etykieta krawędzi…',
    labels: 'Etykiety',
    addLabel: 'Dodaj etykietę',
    noLabels: 'Brak etykiet.',
    labelN: 'Etykieta {count}',
    positionHint:
      'Przeciągnij etykietę na płótnie, aby ustawić jej położenie; użyj górnego paska, aby zmienić rozmiar i kolor tekstu.',
    line: 'Linia',
    line1: 'Linia 1',
    line2: 'Linia 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Wyszukaj lub wklej link',
    linkCopy: 'Kopiuj link',
    linkCopied: 'Skopiowano',
    linkEdit: 'Edytuj link',
    linkRemove: 'Usuń link',
    placeholder: 'Wpisz coś',
    metadata: 'Metadane',
    notes: 'Notatki',
    close: 'Zamknij',
    name: 'Nazwa',
    namePlaceholder: 'Nazwa elementu…'
  },
  rectangleControls: {
    metadata: 'Metadane',
    notes: 'Notatki',
    close: 'Zamknij',
    name: 'Nazwa',
    namePlaceholder: 'Nazwa elementu…'
  },
  topBarStyleControls: {
    mixed: 'Mieszane',
    rotate90: 'Obróć o 90°',
    noColor: 'Brak koloru',
    pickColorFromScreen: 'Pobierz kolor z ekranu',
    customColor: 'Kolor niestandardowy',
    textSize: 'Rozmiar tekstu',
    lineSpacing: 'Interlinia',
    alignment: 'Wyrównanie',
    alignmentDisabled: 'Zaznacz pole tekstowe, aby wyrównać tekst',
    alignLeft: 'Wyrównaj do lewej',
    alignCenter: 'Wyśrodkuj',
    alignRight: 'Wyrównaj do prawej',
    alignTop: 'Wyrównaj do góry',
    alignMiddle: 'Wyrównaj do środka',
    alignBottom: 'Wyrównaj do dołu',
    textColor: 'Kolor tekstu',
    textColorDisabled:
      'Zaznacz węzeł, pole tekstowe, etykietę lub etykietę połączenia, aby ustawić kolor tekstu',
    textSizeDisabled:
      'Zaznacz węzeł, pole tekstowe, etykietę lub etykietę połączenia, aby ustawić rozmiar tekstu',
    labelSizeAllSelected: 'Rozmiar etykiety (wszystkie zaznaczone)',
    textColorAllSelected: 'Kolor tekstu (wszystkie zaznaczone)',
    armedToolPlaceFirst:
      'Nowy element używa domyślnego stylu — najpierw go umieść, a potem ostyluj tutaj',
    decreaseLabelSize: 'Zmniejsz rozmiar etykiety',
    increaseLabelSize: 'Zwiększ rozmiar etykiety',
    labelSize: 'Rozmiar etykiety',
    decreaseSize: 'Zmniejsz rozmiar',
    increaseSize: 'Zwiększ rozmiar',
    stepAll: 'Zmień wszystkie',
    size: 'Rozmiar',
    bold: 'Pogrubienie',
    italic: 'Kursywa',
    underline: 'Podkreślenie',
    strikethrough: 'Przekreślenie',
    format: 'Pogrubienie / kursywa / podkreślenie / przekreślenie',
    formatDisabled:
      'Zaznacz węzeł, pole tekstowe, etykietę lub etykietę połączenia, aby sformatować tekst',
    lists: 'Listy',
    listsDisabled: 'Zaznacz pole tekstowe, aby używać list',
    bulletList: 'Lista punktowana',
    numberedList: 'Lista numerowana',
    background: 'Kolor tła',
    backgroundDisabled:
      'Zaznacz prostokąt, etykietę lub pole tekstowe, aby ustawić kolor tła',
    opacity: 'Przezroczystość',
    border: 'Obramowanie',
    borderDisabled:
      'Zaznacz prostokąt lub pole tekstowe, aby ustawić jego obramowanie',
    lineStyle: 'Styl linii',
    width: 'Grubość',
    borderColor: 'Kolor obramowania',
    link: 'Link',
    linkDisabled: 'Zaznacz węzeł, połączenie lub etykietę, aby dodać link',
    linkSelection: 'Dodaj link do zaznaczonego tekstu',
    linkDisabledTextBox: 'Zaznacz tekst podczas edycji, aby dodać link',
    linkToWeb: 'Link do strony',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Link do diagramu',
    searchDiagrams: 'Szukaj diagramów…',
    openLinkedDiagram: 'Otwórz powiązany diagram',
    showLabel: 'Pokaż etykietę',
    hideLabel: 'Ukryj etykietę',
    showHideLabelDisabled:
      'Zaznacz węzeł lub połączenie, aby pokazać lub ukryć jego etykietę',
    changeIconBulk: 'Zmiana ikony dotyczy jednego węzła naraz',
    changeIcon: 'Zmień ikonę',
    changeIconDisabled: 'Zaznacz węzeł, aby zmienić jego ikonę',
    connectionColorPredraw: 'Kolor następnego rysowanego połączenia',
    connectionColor: 'Kolor połączenia',
    connectionColorDisabled:
      'Zaznacz połączenie (lub narzędzie łącznika), aby ustawić jego kolor',
    lineOptionsPredraw: 'Styl linii następnego rysowanego połączenia',
    lineOptions: 'Opcje linii',
    lineOptionsDisabled:
      'Zaznacz połączenie (lub narzędzie łącznika), aby ustawić jego opcje linii',
    lineType: 'Typ linii',
    showArrow: 'Pokaż strzałkę',
    showDottedLine: 'Pokaż linię kropkowaną'
  },
  quickAddNodePopover: {
    add: 'Dodaj',
    rectangle: 'Grupa'
  },
  zoomControls: {
    zoomOut: 'Pomniejsz',
    zoomIn: 'Powiększ',
    fitToScreen: 'Dopasuj do ekranu',
    keepLabelsReadable: 'Zachowaj czytelność etykiet',
    help: 'Pomoc (F1)',
    selected: 'Zaznaczono: {count}'
  },
  modeHints: {
    connector:
      'Przeciągnij między elementami, aby połączyć • Esc, aby anulować',
    textBox: 'Kliknij, aby umieścić pole tekstowe • Esc, aby anulować',
    label: 'Kliknij, aby umieścić etykietę • Esc, aby anulować',
    rectangle: 'Przeciągnij, aby narysować prostokąt • Esc, aby anulować'
  },
  previewLayerSwitcher: {
    layers: 'Warstwy',
    showLayer: 'Pokaż warstwę',
    hideLayer: 'Ukryj warstwę',
    solo: 'Solo',
    unsolo: 'Wyłącz solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Ukryj etykiety',
    showLabels: 'Pokaż etykiety'
  },
  annotationPalette: {
    pen: 'Adnotuj',
    select: 'Zaznacz',
    draw: 'Rysuj',
    shapes: 'Kształty',
    pencil: 'Ołówek',
    highlighter: 'Zakreślacz',
    line: 'Linia',
    arrow: 'Strzałka',
    rectangle: 'Prostokąt',
    ellipse: 'Elipsa',
    eraser: 'Gumka',
    undo: 'Cofnij',
    redo: 'Ponów',
    clear: 'Wyczyść wszystko'
  },
  viewModeInfoPopover: {
    close: 'Zamknij'
  },
  labelSettings: {
    description: 'Konfiguracja ustawień wyświetlania etykiet',
    expandButtonPadding: 'Wypełnienie przycisku rozwiń',
    expandButtonPaddingDesc:
      'Dolne wypełnienie gdy przycisk rozwiń jest widoczny (zapobiega nakładaniu się tekstu)',
    // D13
    currentValue: 'Bieżąca: {value} jednostek motywu'
  },
  iconSelectionControls: {
    close: 'Zamknij',
    importIcons: 'Importuj ikony',
    addMoreIcons: 'Dodaj więcej ikon',
    isometricLabel: 'Traktuj jako izometryczny (widok 3D)',
    isometricHint: 'Odznacz dla płaskich ikon (loga, elementy UI)',
    dragHint: 'Możesz przeciągnąć i upuścić dowolny element poniżej na płótno.',
    aiPromptTooltip: 'Generuj ikony za pomocą AI',
    aiPromptTitle: 'Generuj ikony izometryczne za pomocą AI',
    aiPromptBody:
      "Wklej ten prompt do AI generującej obrazy. Zastąp 'my object' tym, czego potrzebujesz, a następnie zaimportuj wygenerowany PNG.",
    aiPromptCopy: 'Kopiuj prompt',
    aiPromptCopied: 'Skopiowano'
  },
  searchbox: {
    placeholder: 'Szukaj ikon'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Eksportuj jako obraz',
    compatibilityTitle: 'Uwaga dotycząca zgodności przeglądarki',
    compatibilityMessage:
      'Aby uzyskać najlepsze wyniki, użyj Chrome lub Edge. Firefox ma obecnie problemy ze zgodnością z funkcją eksportu.',
    cropInstruction: 'Kliknij i przeciągnij, aby wybrać obszar do eksportu',
    options: 'Opcje',
    showGrid: 'Pokaż siatkę',
    showLabels: 'Pokaż etykiety',
    screenshotPreset: 'Zrzut ekranu (zalecane)',
    scaleClamped:
      'Rozmiar eksportu zmniejszony, aby zmieścić się w limicie obrazu przeglądarki:',
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
    label: 'Label',
    undo: 'Cofnij',
    redo: 'Ponów',
    select: 'Wybierz',
    lassoSelect: 'Zaznaczanie lasso',
    freehandLasso: 'Lasso odręczne',
    pan: 'Przesuń',
    addItem: 'Dodaj element',
    rectangle: 'Prostokąt',
    connector: 'Połączenie',
    text: 'Tekst',
    common: 'Wspólne',
    // D5
    switchTo2D: 'Przełącz na widok 2D',
    switchToIsometric: 'Przełącz na widok izometryczny',
    clickMode: 'Kliknij',
    dragMode: 'Przeciągnij'
  },
  quickIconSelector: {
    recentlyUsed: 'OSTATNIO UŻYWANE',
    searchResults: 'WYNIKI WYSZUKIWANIA ({count} ikon)',
    noIconsFound: 'Nie znaleziono ikon pasujących do "{term}"'
  },
  canvasContextMenu: {
    addNote: 'Dodaj notatkę',
    addLabel: 'Dodaj etykietę',
    details: 'Szczegóły…',
    rename: 'Zmień nazwę',
    cut: 'Wytnij',
    copy: 'Kopiuj',
    paste: 'Wklej',
    duplicate: 'Duplikuj',
    bringForward: 'Przesuń do przodu',
    sendBackward: 'Przesuń do tyłu',
    bringToFront: 'Przesuń na wierzch',
    sendToBack: 'Przesuń na spód',
    assignToLayer: 'Przypisz do warstwy',
    fitToText: 'Dopasuj do tekstu',
    snapToGrid: 'Przyciągnij do siatki',
    unsnapFromGrid: 'Odepnij od siatki',
    disableCollision: 'Wyłącz kolizję',
    enableCollision: 'Włącz kolizję',
    delete: 'Usuń',
    addItem: 'Dodaj element',
    selectAll: 'Zaznacz wszystko',
    enableSnapToGrid: 'Włącz przyciąganie do siatki',
    disableSnapToGrid: 'Wyłącz przyciąganie do siatki',
    itemsSelectedOne: 'Zaznaczono {count} element',
    itemsSelectedOther: 'Zaznaczono elementy: {count}',
    deleteItemsOne: 'Usuń {count} element',
    deleteItemsOther: 'Usuń elementy: {count}',
    removeFromLayer: 'Usuń z warstwy',
    noLayers: 'Brak warstw — dodaj jedną w panelu warstw'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Eksplorator plików',
    elements: 'Elementy',
    layers: 'Warstwy',
    settings: 'Ustawienia',
    openDiagramFirst: 'najpierw otwórz lub utwórz diagram',
    collapsePanel: 'Zwiń panel'
  },
  // D8 — LayersPanel
  layersPanel: {
    header: 'Warstwy',
    addLayer: 'Dodaj warstwę',
    deleteSelectedLayer: 'Usuń wybraną warstwę',
    noLayersYet: 'Brak warstw. Kliknij +, aby dodać.',
    unassigned: 'Nieprzypisane ({count})',
    dropToUnassign: 'Upuść tutaj elementy, aby cofnąć przypisanie',
    layerN: 'Warstwa {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: 'Skopiowano {count} element',
    copiedOther: 'Skopiowano {count} elementów',
    cutOne: 'Wycięto {count} element',
    cutOther: 'Wycięto {count} elementów',
    pastedOne: 'Wklejono {count} element',
    pastedOther: 'Wklejono {count} elementów',
    nothingToPaste: 'Nie ma czego wkleić',
    routingConnectors: 'Wklejanie… trasowanie łączników ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Strona {count}'
  }
};

export default locale;
