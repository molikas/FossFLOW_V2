import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Este es un texto de ejemplo'
  },
  rightSidebar: {
    collapsePanel: 'Contraer panel',
    emptyState: 'Selecciona un nodo, conector o forma para ver sus propiedades'
  },
  helpDialog: {
    title: 'Atajos de teclado y ayuda',
    close: 'Cerrar',
    keyboardShortcuts: 'Atajos de teclado',
    mouseInteractions: 'Interacciones del ratón',
    action: 'Acción',
    shortcut: 'Atajo',
    method: 'Método',
    description: 'Descripción',
    note: 'Nota:',
    noteContent:
      'Los atajos de teclado se desactivan al escribir en campos de entrada, áreas de texto o elementos editables para evitar conflictos.',
    // Keyboard shortcuts
    undoAction: 'Deshacer',
    undoDescription: 'Deshacer la última acción',
    redoAction: 'Rehacer',
    redoDescription: 'Rehacer la última acción deshecha',
    redoAltAction: 'Rehacer (Alternativo)',
    redoAltDescription: 'Atajo alternativo para rehacer',
    helpAction: 'Ayuda',
    helpDescription: 'Abrir diálogo de ayuda con atajos de teclado',
    zoomInAction: 'Acercar',
    zoomInShortcut: 'Rueda del ratón hacia arriba',
    zoomInDescription: 'Acercar en el lienzo',
    zoomOutAction: 'Alejar',
    zoomOutShortcut: 'Rueda del ratón hacia abajo',
    zoomOutDescription: 'Alejar del lienzo',
    panCanvasAction: 'Desplazar lienzo',
    panCanvasShortcut: 'Clic izquierdo + Arrastrar',
    panCanvasDescription: 'Desplazar el lienzo en modo desplazamiento',
    togglePanToolAction: 'Activar/Desactivar herramienta de desplazamiento',
    togglePanToolShortcut: 'Clic derecho',
    togglePanToolDescription:
      'Activar/desactivar modo de desplazamiento; clic izquierdo para volver al modo de selección',
    lassoSelectAction: 'Selección de lazo',
    lassoSelectShortcut: 'Clic izquierdo + Arrastrar (área vacía)',
    lassoSelectDescription:
      'Dibuja un cuadro de selección rectangular para seleccionar varios elementos',
    deselectAction: 'Deseleccionar',
    deselectShortcut: 'Clic izquierdo (área vacía)',
    deselectDescription:
      'Deseleccionar la selección actual y volver al modo de selección',
    // Mouse interactions
    selectToolAction: 'Herramienta de selección',
    selectToolShortcut: 'Clic en botón Seleccionar',
    selectToolDescription: 'Cambiar al modo de selección',
    panToolAction: 'Herramienta de desplazamiento',
    panToolShortcut: 'Clic en botón Desplazar',
    panToolDescription:
      'Cambiar al modo de desplazamiento para mover el lienzo',
    addItemAction: 'Añadir elemento',
    addItemShortcut: 'Clic en botón Añadir elemento',
    addItemDescription: 'Abrir selector de iconos para añadir nuevos elementos',
    drawRectangleAction: 'Dibujar rectángulo',
    drawRectangleShortcut: 'Clic en botón Rectángulo',
    drawRectangleDescription: 'Cambiar al modo de dibujo de rectángulos',
    createConnectorAction: 'Crear conector',
    createConnectorShortcut: 'Clic en botón Conector',
    createConnectorDescription: 'Cambiar al modo de conector',
    addTextAction: 'Añadir texto',
    addTextShortcut: 'Clic en botón Texto',
    addTextDescription: 'Crear un nuevo cuadro de texto',
    deleteSelectedAction: 'Eliminar seleccionados',
    deleteSelectedShortcut: 'Suprimir (Retroceso en Mac)',
    deleteSelectedDescription:
      'Eliminar el elemento seleccionado o todos los elementos en una selección de lazo; soporta deshacer/rehacer',
    cutAction: 'Cortar',
    cutDescription:
      'Cortar los elementos seleccionados al portapapeles — los elementos son eliminados y pueden pegarse en otro lugar; soporta deshacer/rehacer',
    copyAction: 'Copiar',
    copyDescription: 'Copiar los elementos seleccionados al portapapeles',
    pasteAction: 'Pegar',
    pasteDescription:
      'Pegar los elementos del portapapeles en la posición del ratón; desplazado para evitar solapamientos',
    // D10 — Select all row
    selectAllAction: 'Seleccionar todo',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Seleccionar todos los elementos visibles y desbloqueados de la vista activa (elementos, rectángulos, cuadros de texto, conectores + sus puntos de ruta)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Renombrar',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Renombrar el elemento o diagrama seleccionado en línea',
    keyAddItemAction: 'Añadir elemento / Elementos',
    keyAddItemShortcut: 'N',
    keyAddItemDescription:
      'Alternar el panel Elementos para colocar un nuevo elemento',
    keyConnectorAction: 'Conector',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Cambiar a la herramienta de conector',
    keyLassoAction: 'Selección con lazo',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Cambiar a la herramienta de selección con lazo',
    keySelectAction: 'Seleccionar',
    keySelectShortcut: 'S',
    keySelectDescription: 'Cambiar a la herramienta de selección',
    // D10 — mouse interactions
    miSelectAction: 'Seleccionar',
    miSelectMethod: 'Clic izquierdo',
    miSelectDescription:
      'Haz clic en un elemento para seleccionarlo (lo resalta y muestra la barra de acciones flotante). Haz clic en el lienzo vacío para borrar la selección.',
    miOpenDetailsAction: 'Abrir detalles',
    miOpenDetailsMethod: 'Doble clic',
    miOpenDetailsDescription:
      'Haz doble clic en un elemento para abrir su panel de detalles, igual que la entrada «Detalles…» del menú contextual.',
    miToggleSelectionAction: 'Alternar selección',
    miToggleSelectionMethod: 'Ctrl/Cmd + Clic izquierdo',
    miToggleSelectionDescription:
      'Añadir o quitar un elemento de la selección múltiple; un conector se alterna junto con sus puntos de ruta.',
    miPanAction: 'Desplazar',
    miPanMethod: 'Clic derecho + arrastrar',
    miPanDescription:
      'Mantén el botón derecho y arrastra para desplazar el lienzo. Arrastrar con el botón central también desplaza; las flechas lo mueven.',
    miContextMenuAction: 'Menú contextual',
    miContextMenuMethod: 'Clic derecho (toque)',
    miContextMenuDescription:
      'Un clic derecho sin arrastrar abre el menú contextual: el menú del elemento sobre un elemento, o el menú del lienzo sobre un espacio vacío. En pantallas táctiles, mantén pulsado.',
    miRemoveWaypointAction: 'Quitar punto de ruta',
    miRemoveWaypointMethod: 'Alt + Clic izquierdo',
    miRemoveWaypointDescription:
      'Alt+clic en un punto de ruta de un conector para extraerlo (sin necesidad de seleccionar el conector primero); los anclajes de los extremos se conservan.',
    miZoomAction: 'Zoom',
    miZoomMethod: 'Rueda de desplazamiento',
    miZoomDescription: 'Desplázate para hacer zoom hacia el cursor.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'Consejo: Crear conectores',
    tipConnectorTools: 'Consejo: Herramientas de conectores',
    clickInstructionStart: 'Haz clic',
    clickInstructionMiddle: 'en el primer nodo o punto, luego',
    clickInstructionEnd: 'en el segundo nodo o punto para crear una conexión.',
    nowClickTarget: 'Ahora haz clic en el objetivo para completar la conexión.',
    dragStart: 'Arrastra',
    dragEnd: 'desde el primer nodo al segundo nodo para crear una conexión.',
    rerouteStart: 'Para cambiar la ruta de un conector,',
    rerouteMiddle: 'haz clic izquierdo',
    rerouteEnd:
      'en cualquier punto a lo largo de la línea del conector y arrastra para crear o mover puntos de anclaje.'
  },
  lassoHintTooltip: {
    tipLasso: 'Consejo: Selección de lazo',
    tipFreehandLasso: 'Consejo: Selección de lazo libre',
    lassoDragStart: 'Haz clic y arrastra',
    lassoDragEnd:
      'para dibujar un cuadro de selección rectangular alrededor de los elementos que deseas seleccionar.',
    freehandDragStart: 'Haz clic y arrastra',
    freehandDragMiddle: 'para dibujar una',
    freehandDragEnd: 'forma libre',
    freehandComplete:
      'alrededor de los elementos. Suelta para seleccionar todos los elementos dentro de la forma.',
    moveStart: 'Una vez seleccionados,',
    moveMiddle: 'haz clic dentro de la selección',
    moveEnd: 'y arrastra para mover todos los elementos seleccionados juntos.'
  },
  importHintTooltip: {
    title: 'Importar diagramas',
    instructionStart: 'Para importar diagramas, haz clic en el',
    menuButton: 'botón de menú',
    instructionMiddle:
      '(☰) en la esquina superior izquierda, luego selecciona',
    openButton: '"Abrir"',
    instructionEnd: 'para cargar tus archivos de diagrama.'
  },
  connectorRerouteTooltip: {
    title: 'Consejo: Cambiar ruta de conectores',
    instructionStart:
      'Una vez que tus conectores estén colocados, puedes cambiar su ruta como desees.',
    instructionSelect: 'Selecciona el conector',
    instructionMiddle: 'primero, luego',
    instructionClick: 'haz clic en la ruta del conector',
    instructionAnd: 'y',
    instructionDrag: 'arrastra',
    instructionEnd: 'para cambiarlo!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Para conectar este conector a un nodo,',
    instruction:
      'haz clic izquierdo en el extremo del conector y arrástralo al nodo deseado.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Configuración',
    close: 'Cerrar',
    canvas: 'Lienzo',
    language: 'Idioma',
    about: 'Acerca de',
    languageDescription:
      'Selecciona el idioma de la interfaz de la aplicación.',
    zoomSection: 'Zoom',
    labelsSection: 'Etiquetas',
    zoom: {
      description:
        'Configura el comportamiento del zoom al usar la rueda del ratón.',
      zoomToCursor: 'Zoom al cursor',
      zoomToCursorDesc:
        'Cuando está habilitado, el zoom se centra en la posición del cursor del ratón. Cuando está deshabilitado, el zoom se centra en el lienzo.'
    },
    hotkeys: {
      title: 'Configuración de atajos',
      profile: 'Perfil de atajos',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Sin atajos',
      tool: 'Herramienta',
      hotkey: 'Atajo',
      toolSelect: 'Seleccionar',
      toolPan: 'Desplazar',
      toolAddItem: 'Añadir elemento',
      toolRectangle: 'Rectángulo',
      toolConnector: 'Conector',
      toolText: 'Texto',
      note: 'Nota: Los atajos funcionan cuando no estás escribiendo en campos de texto',
      fixedShortcutsTitle: 'Atajos fijos (siempre activos)',
      fixedCut: 'Cortar',
      fixedCopy: 'Copiar',
      fixedPaste: 'Pegar',
      fixedUndo: 'Deshacer',
      fixedRedo: 'Rehacer'
    },
    connector: {
      title: 'Configuración de conectores',
      connectionMode: 'Modo de creación de conexiones',
      clickMode: 'Modo clic (Recomendado)',
      clickModeDesc:
        'Haz clic en el primer nodo, luego haz clic en el segundo nodo para crear una conexión',
      dragMode: 'Modo arrastrar',
      dragModeDesc:
        'Haz clic y arrastra desde el primer nodo hasta el segundo nodo',
      note: 'Nota: Puedes cambiar esta configuración en cualquier momento. El modo seleccionado se usará cuando la herramienta de conector esté activa.'
    },
    iconPacks: {
      title: 'Gestión de Paquetes de Iconos',
      lazyLoading: 'Activar Carga Diferida',
      lazyLoadingDesc:
        'Cargar paquetes de iconos bajo demanda para un inicio más rápido',
      availablePacks: 'Paquetes de Iconos Disponibles',
      coreIsoflow: 'Core Isoflow (Siempre Cargado)',
      alwaysEnabled: 'Siempre activado',
      awsPack: 'Iconos AWS',
      gcpPack: 'Iconos Google Cloud',
      azurePack: 'Iconos Azure',
      kubernetesPack: 'Iconos Kubernetes',
      loading: 'Cargando...',
      loaded: 'Cargado',
      notLoaded: 'No cargado',
      iconCount: '{count} iconos',
      lazyLoadingDisabledNote:
        'La carga diferida está desactivada. Todos los paquetes de iconos se cargan al iniciar.',
      note: 'Los paquetes de iconos se pueden activar o desactivar según tus necesidades. Los paquetes desactivados reducirán el uso de memoria y mejorarán el rendimiento.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Bienvenido a Axoview',
    message:
      'Axoview es una herramienta gratuita y de código abierto para crear diagramas isométricos y 2D con un aspecto impecable — arquitecturas de nube, red e infraestructura, con iconos de AWS, GCP, Azure y Kubernetes incluidos. Todo funciona en tu navegador, guardando localmente o en tu propio Google Drive. Está construida sobre los proyectos de código abierto FossFLOW e Isoflow y se amplía de forma activa — encuentra el código fuente, informa de un error o solicita una función en github.com/molikas/axoview.',
    configPath: 'Haz clic en el icono de Hamburguesa',
    configPath2:
      'en la esquina superior izquierda para acceder a la Configuración.',
    canDisable: 'Puedes desactivar este comportamiento si lo deseas.',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Añadir página',
    deletePage: 'Eliminar página',
    renameDiagram: 'Renombrar diagrama',
    addPageDisabled: 'Límite de páginas alcanzado (5)'
  },
  nodePanel: {
    notes: 'Notas',
    close: 'Cerrar'
  },
  nodeDeck: {
    metadata: 'Metadatos',
    name: 'Nombre',
    namePlaceholder: 'Nombre del nodo…',
    label: 'Etiqueta',
    labelPlaceholder: 'Etiqueta mostrada en la forma…'
  },
  connectorControls: {
    metadata: 'Metadatos',
    close: 'Cerrar',
    notes: 'Notas',
    name: 'Nombre',
    namePlaceholder: 'Etiqueta del enlace…',
    labels: 'Etiquetas',
    addLabel: 'Añadir etiqueta',
    noLabels: 'Aún no hay etiquetas.',
    labelN: 'Etiqueta {count}',
    positionHint:
      'Arrastra una etiqueta en el lienzo para colocarla; usa la barra superior para su tamaño de texto y color.',
    line: 'Línea',
    line1: 'Línea 1',
    line2: 'Línea 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Buscar o pegar un enlace',
    linkCopy: 'Copiar enlace',
    linkCopied: 'Copiado',
    linkEdit: 'Editar enlace',
    linkRemove: 'Quitar enlace',
    placeholder: 'Escribe algo',
    metadata: 'Metadatos',
    notes: 'Notas',
    close: 'Cerrar',
    name: 'Nombre',
    namePlaceholder: 'Nombre del elemento…'
  },
  rectangleControls: {
    metadata: 'Metadatos',
    notes: 'Notas',
    close: 'Cerrar',
    name: 'Nombre',
    namePlaceholder: 'Nombre del elemento…'
  },
  topBarStyleControls: {
    mixed: 'Variado',
    rotate90: 'Girar 90°',
    noColor: 'Sin color',
    pickColorFromScreen: 'Seleccionar color de la pantalla',
    customColor: 'Color personalizado',
    textSize: 'Tamaño del texto',
    lineSpacing: 'Interlineado',
    alignment: 'Alineación',
    alignmentDisabled: 'Selecciona un cuadro de texto para alinear el texto',
    alignLeft: 'Alinear a la izquierda',
    alignCenter: 'Centrar',
    alignRight: 'Alinear a la derecha',
    alignTop: 'Alinear arriba',
    alignMiddle: 'Alinear al medio',
    alignBottom: 'Alinear abajo',
    textColor: 'Color del texto',
    textColorDisabled:
      'Selecciona un nodo, un cuadro de texto, una etiqueta o una etiqueta de conexión para definir el color del texto',
    textSizeDisabled:
      'Selecciona un nodo, un cuadro de texto, una etiqueta o una etiqueta de conexión para definir el tamaño del texto',
    labelSizeAllSelected: 'Tamaño de etiqueta (todas las seleccionadas)',
    textColorAllSelected: 'Color del texto (todo lo seleccionado)',
    armedToolPlaceFirst:
      'El nuevo elemento usa el estilo predeterminado: colócalo primero y luego dale estilo aquí',
    decreaseLabelSize: 'Reducir tamaño de etiqueta',
    increaseLabelSize: 'Aumentar tamaño de etiqueta',
    labelSize: 'Tamaño de etiqueta',
    decreaseSize: 'Reducir tamaño',
    increaseSize: 'Aumentar tamaño',
    stepAll: 'Ajustar todo',
    size: 'Tamaño',
    bold: 'Negrita',
    italic: 'Cursiva',
    underline: 'Subrayado',
    strikethrough: 'Tachado',
    format: 'Negrita / cursiva / subrayado / tachado',
    formatDisabled:
      'Selecciona un nodo, un cuadro de texto, una etiqueta o una etiqueta de conexión para dar formato al texto',
    lists: 'Listas',
    listsDisabled: 'Selecciona un cuadro de texto para usar listas',
    bulletList: 'Lista con viñetas',
    numberedList: 'Lista numerada',
    background: 'Color de fondo',
    backgroundDisabled:
      'Selecciona un rectángulo, etiqueta o cuadro de texto para definir su color de fondo',
    opacity: 'Opacidad',
    border: 'Borde',
    borderDisabled:
      'Selecciona un rectángulo o cuadro de texto para definir su borde',
    lineStyle: 'Estilo de línea',
    width: 'Ancho',
    borderColor: 'Color del borde',
    link: 'Enlace',
    linkDisabled:
      'Selecciona un nodo, conexión o etiqueta para añadir un enlace',
    linkSelection: 'Enlazar el texto seleccionado',
    linkDisabledTextBox:
      'Selecciona texto mientras editas para añadir un enlace',
    linkToWeb: 'Enlace a la web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Enlace al diagrama',
    searchDiagrams: 'Buscar diagramas…',
    openLinkedDiagram: 'Abrir diagrama vinculado',
    showLabel: 'Mostrar etiqueta',
    hideLabel: 'Ocultar etiqueta',
    showHideLabelDisabled:
      'Selecciona un nodo o una conexión para mostrar u ocultar su etiqueta',
    changeIconBulk: 'Cambiar icono se aplica a un nodo a la vez',
    changeIcon: 'Cambiar icono',
    changeIconDisabled: 'Selecciona un nodo para cambiar su icono',
    connectionColorPredraw: 'Color de la próxima conexión que dibujes',
    connectionColor: 'Color de la conexión',
    connectionColorDisabled:
      'Selecciona una conexión (o la herramienta de conector) para definir su color',
    lineOptionsPredraw: 'Estilo de línea de la próxima conexión que dibujes',
    lineOptions: 'Opciones de línea',
    lineOptionsDisabled:
      'Selecciona una conexión (o la herramienta de conector) para definir sus opciones de línea',
    lineType: 'Tipo de línea',
    showArrow: 'Mostrar flecha',
    showDottedLine: 'Mostrar línea punteada'
  },
  quickAddNodePopover: {
    add: 'Añadir',
    rectangle: 'Grupo'
  },
  zoomControls: {
    zoomOut: 'Alejar',
    zoomIn: 'Acercar',
    fitToScreen: 'Ajustar a pantalla',
    keepLabelsReadable: 'Mantener etiquetas legibles',
    help: 'Ayuda (F1)',
    selected: '{count} seleccionados'
  },
  modeHints: {
    connector: 'Arrastra entre elementos para conectar • Esc para cancelar',
    textBox: 'Haz clic para colocar un cuadro de texto • Esc para cancelar',
    label: 'Haz clic para colocar una etiqueta • Esc para cancelar',
    rectangle: 'Arrastra para dibujar un rectángulo • Esc para cancelar'
  },
  previewLayerSwitcher: {
    layers: 'Capas',
    showLayer: 'Mostrar capa',
    hideLayer: 'Ocultar capa',
    solo: 'Solo',
    unsolo: 'Salir de solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Ocultar etiquetas',
    showLabels: 'Mostrar etiquetas'
  },
  annotationPalette: {
    pen: 'Anotar',
    select: 'Seleccionar',
    draw: 'Dibujar',
    shapes: 'Formas',
    pencil: 'Lápiz',
    highlighter: 'Marcador',
    line: 'Línea',
    arrow: 'Flecha',
    rectangle: 'Rectángulo',
    ellipse: 'Elipse',
    eraser: 'Borrador',
    undo: 'Deshacer',
    redo: 'Rehacer',
    clear: 'Borrar todo'
  },
  viewModeInfoPopover: {
    close: 'Cerrar'
  },
  labelSettings: {
    description: 'Configurar ajustes de visualización de etiquetas',
    expandButtonPadding: 'Relleno del botón expandir',
    expandButtonPaddingDesc:
      'Relleno inferior cuando el botón expandir es visible (evita solapamiento de texto)',
    // D13
    currentValue: 'Actual: {value} unidades de tema'
  },
  iconSelectionControls: {
    close: 'Cerrar',
    importIcons: 'Importar iconos',
    addMoreIcons: 'Añadir más iconos',
    isometricLabel: 'Tratar como isométrico (vista 3D)',
    isometricHint: 'Desmarcar para iconos planos (logos, elementos de UI)',
    dragHint:
      'Puedes arrastrar y soltar cualquier elemento de abajo sobre el lienzo.',
    aiPromptTooltip: 'Generar iconos con IA',
    aiPromptTitle: 'Generar iconos isométricos con IA',
    aiPromptBody:
      "Pega este prompt en una IA generadora de imágenes. Reemplaza 'my object' con lo que necesites e importa el PNG generado.",
    aiPromptCopy: 'Copiar prompt',
    aiPromptCopied: 'Copiado'
  },
  searchbox: {
    placeholder: 'Buscar iconos'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Exportar como imagen',
    compatibilityTitle: 'Aviso de compatibilidad del navegador',
    compatibilityMessage:
      'Para mejores resultados, usa Chrome o Edge. Firefox actualmente tiene problemas de compatibilidad con la función de exportación.',
    cropInstruction:
      'Haz clic y arrastra para seleccionar el área que deseas exportar',
    options: 'Opciones',
    showGrid: 'Mostrar cuadrícula',
    showLabels: 'Mostrar etiquetas',
    screenshotPreset: 'Captura de pantalla (recomendado)',
    scaleClamped:
      'Tamaño de exportación reducido para ajustarse al límite de imagen del navegador:',
    cropToContent: 'Recortar al contenido',
    backgroundColor: 'Color de fondo',
    transparentBackground: 'Fondo transparente',
    exportQuality: 'Calidad de exportación (DPI)',
    custom: 'Personalizado',
    recrop: 'Recortar de nuevo',
    cropApplied: 'Recorte aplicado con éxito',
    applyCrop: 'Aplicar recorte',
    clearSelection: 'Borrar selección',
    cropHint:
      'Selecciona un área para recortar, o desmarca "Recortar al contenido" para usar la imagen completa',
    cancel: 'Cancelar',
    downloadSvg: 'Descargar como SVG',
    downloadPng: 'Descargar como PNG',
    error: 'No se pudo exportar la imagen'
  },
  toolMenu: {
    label: 'Label',
    undo: 'Deshacer',
    redo: 'Rehacer',
    select: 'Seleccionar',
    lassoSelect: 'Selección de lazo',
    freehandLasso: 'Lazo libre',
    pan: 'Desplazar',
    addItem: 'Añadir elemento',
    rectangle: 'Rectángulo',
    connector: 'Conector',
    text: 'Texto',
    common: 'Comunes',
    // D5
    switchTo2D: 'Cambiar a vista 2D',
    switchToIsometric: 'Cambiar a vista isométrica',
    clickMode: 'Clic',
    dragMode: 'Arrastrar'
  },
  quickIconSelector: {
    recentlyUsed: 'USADOS RECIENTEMENTE',
    searchResults: 'RESULTADOS DE BÚSQUEDA ({count} iconos)',
    noIconsFound: 'No se encontraron iconos para "{term}"'
  },
  canvasContextMenu: {
    addNote: 'Añadir nota',
    addLabel: 'Añadir etiqueta',
    details: 'Detalles…',
    rename: 'Renombrar',
    cut: 'Cortar',
    copy: 'Copiar',
    paste: 'Pegar',
    duplicate: 'Duplicar',
    bringForward: 'Traer adelante',
    sendBackward: 'Enviar atrás',
    bringToFront: 'Traer al frente',
    sendToBack: 'Enviar al fondo',
    assignToLayer: 'Asignar a capa',
    fitToText: 'Ajustar al texto',
    snapToGrid: 'Ajustar a la cuadrícula',
    unsnapFromGrid: 'Desajustar de la cuadrícula',
    disableCollision: 'Desactivar colisión',
    enableCollision: 'Activar colisión',
    delete: 'Eliminar',
    addItem: 'Añadir elemento',
    selectAll: 'Seleccionar todo',
    enableSnapToGrid: 'Activar ajuste a la cuadrícula',
    disableSnapToGrid: 'Desactivar ajuste a la cuadrícula',
    itemsSelectedOne: '{count} elemento seleccionado',
    itemsSelectedOther: '{count} elementos seleccionados',
    deleteItemsOne: 'Eliminar {count} elemento',
    deleteItemsOther: 'Eliminar {count} elementos',
    removeFromLayer: 'Quitar de la capa',
    noLayers: 'Sin capas — añade una en el panel de capas'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Explorador de archivos',
    elements: 'Elementos',
    layers: 'Capas',
    settings: 'Configuración',
    openDiagramFirst: 'abre o crea un diagrama primero',
    collapsePanel: 'Contraer panel'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: '¿Eliminar la capa?',
    deleteLayerBody: 'Esta capa contiene {count} elemento(s). ¿Qué debe ocurrir con ellos?',
    deleteLayerHiddenWarning: 'Esta capa está OCULTA. Si se conserva su contenido, volverá a ser VISIBLE: un elemento sin capa siempre se muestra.',
    deleteLayerCancel: 'Cancelar',
    deleteLayerKeep: 'Conservar el contenido',
    deleteLayerDeleteContents: 'Eliminar también el contenido',
    header: 'Capas',
    addLayer: 'Añadir capa',
    deleteSelectedLayer: 'Eliminar capa seleccionada',
    noLayersYet: 'Aún no hay capas. Haz clic en + para añadir una.',
    unassigned: 'Sin asignar ({count})',
    dropToUnassign: 'Suelta elementos aquí para desasignar',
    layerN: 'Capa {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} elemento copiado',
    copiedOther: '{count} elementos copiados',
    cutOne: '{count} elemento cortado',
    cutOther: '{count} elementos cortados',
    pastedOne: '{count} elemento pegado',
    pastedOther: '{count} elementos pegados',
    nothingToPaste: 'Nada que pegar',
    couldNotPaste: 'No se pudo pegar — el contenido copiado no es compatible con este diagrama',
    routingConnectors: 'Pegando… enrutando conectores ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Página {count}'
  }
};

export default locale;
