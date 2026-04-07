import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Это пример текста"
  },
  mainMenu: {
    undo: "Отменить",
    redo: "Повторить",
    open: "Открыть",
    exportJson: "Экспортировать как JSON",
    exportCompactJson: "Экспортировать как компактный JSON",
    exportImage: "Экспортировать как изображение",
    clearCanvas: "Очистить холст",
    settings: "Настройки",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Горячие клавиши и справка",
    close: "Закрыть",
    keyboardShortcuts: "Горячие клавиши",
    mouseInteractions: "Взаимодействие с мышью",
    action: "Действие",
    shortcut: "Горячая клавиша",
    method: "Метод",
    description: "Описание",
    note: "Примечание:",
    noteContent: "Горячие клавиши отключены при вводе в полях ввода, текстовых областях или редактируемых элементах во избежание конфликтов.",
    // Keyboard shortcuts
    undoAction: "Отменить",
    undoDescription: "Отменить последнее действие",
    redoAction: "Повторить",
    redoDescription: "Повторить последнее отмененное действие",
    redoAltAction: "Повторить (альтернатива)",
    redoAltDescription: "Альтернативная горячая клавиша для повтора",
    helpAction: "Справка",
    helpDescription: "Открыть диалог справки с горячими клавишами",
    zoomInAction: "Увеличить",
    zoomInShortcut: "Колесико мыши вверх",
    zoomInDescription: "Увеличить масштаб холста",
    zoomOutAction: "Уменьшить",
    zoomOutShortcut: "Колесико мыши вниз",
    zoomOutDescription: "Уменьшить масштаб холста",
    panCanvasAction: "Переместить холст",
    panCanvasShortcut: "Левая кнопка + перетаскивание",
    panCanvasDescription: "Переместить холст в режиме перемещения",
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
    selectToolAction: "Инструмент выделения",
    selectToolShortcut: "Нажать кнопку Выделить",
    selectToolDescription: "Переключиться в режим выделения",
    panToolAction: "Инструмент перемещения",
    panToolShortcut: "Нажать кнопку Переместить",
    panToolDescription: "Переключиться в режим перемещения холста",
    addItemAction: "Добавить элемент",
    addItemShortcut: "Нажать кнопку Добавить элемент",
    addItemDescription: "Открыть выбор иконок для добавления новых элементов",
    drawRectangleAction: "Нарисовать прямоугольник",
    drawRectangleShortcut: "Нажать кнопку Прямоугольник",
    drawRectangleDescription: "Переключиться в режим рисования прямоугольников",
    createConnectorAction: "Создать соединитель",
    createConnectorShortcut: "Нажать кнопку Соединитель",
    createConnectorDescription: "Переключиться в режим соединителя",
    addTextAction: "Добавить текст",
    addTextShortcut: "Нажать кнопку Текст",
    addTextDescription: "Создать новое текстовое поле",
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
    tipCreatingConnectors: "Совет: Создание соединителей",
    tipConnectorTools: "Совет: Инструменты соединителей",
    clickInstructionStart: "Нажмите",
    clickInstructionMiddle: "на первый узел или точку, затем",
    clickInstructionEnd: "на второй узел или точку, чтобы создать соединение.",
    nowClickTarget: "Теперь нажмите на цель, чтобы завершить соединение.",
    dragStart: "Перетащите",
    dragEnd: "от первого узла ко второму узлу, чтобы создать соединение.",
    rerouteStart: "Чтобы изменить маршрут соединителя,",
    rerouteMiddle: "нажмите левой кнопкой",
    rerouteEnd: "на любую точку вдоль линии соединителя и перетащите, чтобы создать или переместить опорные точки."
  },
  lassoHintTooltip: {
    tipLasso: "Совет: Выделение лассо",
    tipFreehandLasso: "Совет: Свободное выделение лассо",
    lassoDragStart: "Нажмите и перетащите",
    lassoDragEnd: "чтобы нарисовать прямоугольную область выделения вокруг элементов, которые вы хотите выбрать.",
    freehandDragStart: "Нажмите и перетащите",
    freehandDragMiddle: "чтобы нарисовать",
    freehandDragEnd: "произвольную форму",
    freehandComplete: "вокруг элементов. Отпустите, чтобы выбрать все элементы внутри формы.",
    moveStart: "После выделения",
    moveMiddle: "нажмите внутри выделения",
    moveEnd: "и перетащите, чтобы переместить все выделенные элементы вместе."
  },
  importHintTooltip: {
    title: "Импорт диаграмм",
    instructionStart: "Чтобы импортировать диаграммы, нажмите",
    menuButton: "кнопку меню",
    instructionMiddle: "(☰) в верхнем левом углу, затем выберите",
    openButton: "\"Открыть\"",
    instructionEnd: "чтобы загрузить файлы диаграмм."
  },
  connectorRerouteTooltip: {
    title: "Совет: Изменение маршрута соединителей",
    instructionStart: "После размещения соединителей вы можете изменить их маршрут по своему усмотрению.",
    instructionSelect: "Выберите соединитель",
    instructionMiddle: "сначала, затем",
    instructionClick: "нажмите на путь соединителя",
    instructionAnd: "и",
    instructionDrag: "перетащите",
    instructionEnd: "чтобы изменить его!"
  },
  connectorEmptySpaceTooltip: {
    message: "Чтобы подключить этот соединитель к узлу,",
    instruction: "щелкните левой кнопкой мыши на конце соединителя и перетащите его к нужному узлу."
  },
  settings: {
    zoom: {
      description: "Настройте поведение масштабирования при использовании колесика мыши.",
      zoomToCursor: "Масштабировать к курсору",
      zoomToCursorDesc: "При включении масштабирование центрируется на позиции курсора мыши. При выключении масштабирование центрируется на холсте."
    },
    hotkeys: {
      title: "Настройки горячих клавиш",
      profile: "Профиль горячих клавиш",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Без горячих клавиш",
      tool: "Инструмент",
      hotkey: "Горячая клавиша",
      toolSelect: "Выделить",
      toolPan: "Переместить",
      toolAddItem: "Добавить элемент",
      toolRectangle: "Прямоугольник",
      toolConnector: "Соединитель",
      toolText: "Текст",
      note: "Примечание: Горячие клавиши работают, когда вы не вводите текст в текстовых полях",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "Настройки перемещения",
      mousePanOptions: "Параметры перемещения мышью",
      emptyAreaClickPan: "Нажать и перетащить на пустой области",
      middleClickPan: "Средняя кнопка и перетаскивание",
      rightClickPan: "Правая кнопка и перетаскивание",
      ctrlClickPan: "Ctrl + нажатие и перетаскивание",
      altClickPan: "Alt + нажатие и перетаскивание",
      keyboardPanOptions: "Параметры перемещения клавиатурой",
      arrowKeys: "Клавиши стрелок",
      wasdKeys: "Клавиши WASD",
      ijklKeys: "Клавиши IJKL",
      keyboardPanSpeed: "Скорость перемещения клавиатурой",
      note: "Примечание: Параметры перемещения работают в дополнение к специальному инструменту перемещения"
    },
    connector: {
      title: "Настройки соединителя",
      connectionMode: "Режим создания соединения",
      clickMode: "Режим нажатия (рекомендуется)",
      clickModeDesc: "Нажмите на первый узел, затем нажмите на второй узел, чтобы создать соединение",
      dragMode: "Режим перетаскивания",
      dragModeDesc: "Нажмите и перетащите от первого узла ко второму узлу",
      note: "Примечание: Вы можете изменить эту настройку в любое время. Выбранный режим будет использоваться, когда инструмент соединителя активен."
    },
    iconPacks: {
      title: "Управление Пакетами Иконок",
      lazyLoading: "Включить Ленивую Загрузку",
      lazyLoadingDesc: "Загружать пакеты иконок по требованию для более быстрого запуска",
      availablePacks: "Доступные Пакеты Иконок",
      coreIsoflow: "Core Isoflow (Всегда Загружен)",
      alwaysEnabled: "Всегда включено",
      awsPack: "Иконки AWS",
      gcpPack: "Иконки Google Cloud",
      azurePack: "Иконки Azure",
      kubernetesPack: "Иконки Kubernetes",
      loading: "Загрузка...",
      loaded: "Загружено",
      notLoaded: "Не загружено",
      iconCount: "{count} иконок",
      lazyLoadingDisabledNote: "Ленивая загрузка отключена. Все пакеты иконок загружаются при запуске.",
      note: "Пакеты иконок могут быть включены или отключены в зависимости от ваших потребностей. Отключенные пакеты уменьшат использование памяти и улучшат производительность."
    }
  },
  lazyLoadingWelcome: {
    title: "Новая Функция: Ленивая Загрузка!",
    message: "Привет! По многочисленным просьбам мы реализовали Ленивую Загрузку иконок, поэтому теперь, если вы хотите включить нестандартные пакеты иконок, вы можете включить их в разделе 'Конфигурация'.",
    configPath: "Нажмите на иконку Гамбургер",
    configPath2: "в верхнем левом углу, чтобы получить доступ к Конфигурации.",
    canDisable: "Вы можете отключить это поведение, если хотите.",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "Подробности",
    style: "Стиль",
    notes: "Заметки",
    notesModified: "Заметки ●",
    close: "Закрыть",
    openLink: "Открыть ссылку",
    caption: "Подпись",
    noCaption: "Нет подписи."
  },
  nodeInfoTab: {
    name: "Название",
    namePlaceholder: "Имя узла…",
    removeLink: "Удалить ссылку",
    addLink: "Добавить ссылку к названию",
    linkPlaceholder: "https://…",
    caption: "Подпись",
    captionHint: "Отображается на холсте под именем узла",
    openLink: "Открыть ссылку"
  },
  nodeStyleTab: {
    icon: "Иконка",
    close: "Закрыть",
    change: "Изменить…",
    iconSize: "Размер иконки",
    labelFontSize: "Размер шрифта метки",
    labelColor: "Цвет метки",
    labelHeight: "Высота метки"
  },
  connectorControls: {
    close: "Закрыть",
    labels: "Метки"
  },
  textBoxControls: {
    close: "Закрыть",
    text: "Текст",
    textSize: "Размер текста",
    textColor: "Цвет текста",
    alignment: "Выравнивание"
  },
  rectangleControls: {
    close: "Закрыть",
    color: "Цвет",
    useCustomColor: "Использовать пользовательский цвет"
  },
  labelColorPicker: {
    customColor: "Пользовательский цвет"
  },
  deleteButton: {
    delete: "Удалить"
  },
  nodeActionBar: {
    style: "Стиль",
    editName: "Редактировать название",
    editLink: "Редактировать ссылку",
    addLink: "Добавить ссылку",
    editNotes: "Редактировать заметки",
    addNotes: "Добавить заметки",
    delete: "Удалить"
  },
  quickAddNodePopover: {
    add: "Добавить",
    group: "Группа"
  },
  zoomControls: {
    zoomOut: "Уменьшить",
    zoomIn: "Увеличить",
    fitToScreen: "По размеру экрана",
    help: "Помощь (F1)"
  },
  labelSettings: {
    description: "Настройка параметров отображения меток",
    expandButtonPadding: "Отступ кнопки развернуть",
    expandButtonPaddingDesc: "Нижний отступ при видимой кнопке развернуть (предотвращает перекрытие текста)"
  },
  iconSelectionControls: {
    close: "Закрыть",
    importIcons: "Импортировать иконки",
    isometricLabel: "Использовать как изометрический (3D вид)",
    isometricHint: "Снимите галочку для плоских иконок (логотипы, элементы UI)",
    dragHint: "Вы можете перетащить любой элемент ниже на холст."
  },
  searchbox: {
    placeholder: "Поиск иконок"
  },
  exportImageDialog: {
    title: "Экспортировать как изображение",
    compatibilityTitle: "Уведомление о совместимости браузера",
    compatibilityMessage: "Для наилучших результатов используйте Chrome или Edge. Firefox в настоящее время имеет проблемы совместимости с функцией экспорта.",
    cropInstruction: "Щёлкните и перетащите, чтобы выбрать область для экспорта",
    options: "Параметры",
    showGrid: "Показать сетку",
    expandDescriptions: "Развернуть описания",
    cropToContent: "Обрезать по содержимому",
    backgroundColor: "Цвет фона",
    transparentBackground: "Прозрачный фон",
    exportQuality: "Качество экспорта (DPI)",
    custom: "Пользовательский",
    recrop: "Обрезать снова",
    cropApplied: "Обрезка успешно применена",
    applyCrop: "Применить обрезку",
    clearSelection: "Снять выделение",
    cropHint: "Выберите область для обрезки или снимите галочку «Обрезать по содержимому», чтобы использовать полное изображение",
    cancel: "Отмена",
    downloadSvg: "Скачать как SVG",
    downloadPng: "Скачать как PNG",
    error: "Не удалось экспортировать изображение"
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
