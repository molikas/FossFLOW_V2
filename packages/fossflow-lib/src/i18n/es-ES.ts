import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Este es un texto de ejemplo"
  },
  mainMenu: {
    undo: "Deshacer",
    redo: "Rehacer",
    open: "Abrir",
    exportJson: "Exportar como JSON",
    exportCompactJson: "Exportar como JSON compacto",
    exportImage: "Exportar como imagen",
    clearCanvas: "Limpiar el lienzo",
    settings: "Configuración",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Atajos de teclado y ayuda",
    close: "Cerrar",
    keyboardShortcuts: "Atajos de teclado",
    mouseInteractions: "Interacciones del ratón",
    action: "Acción",
    shortcut: "Atajo",
    method: "Método",
    description: "Descripción",
    note: "Nota:",
    noteContent: "Los atajos de teclado se desactivan al escribir en campos de entrada, áreas de texto o elementos editables para evitar conflictos.",
    // Keyboard shortcuts
    undoAction: "Deshacer",
    undoDescription: "Deshacer la última acción",
    redoAction: "Rehacer",
    redoDescription: "Rehacer la última acción deshecha",
    redoAltAction: "Rehacer (Alternativo)",
    redoAltDescription: "Atajo alternativo para rehacer",
    helpAction: "Ayuda",
    helpDescription: "Abrir diálogo de ayuda con atajos de teclado",
    zoomInAction: "Acercar",
    zoomInShortcut: "Rueda del ratón hacia arriba",
    zoomInDescription: "Acercar en el lienzo",
    zoomOutAction: "Alejar",
    zoomOutShortcut: "Rueda del ratón hacia abajo",
    zoomOutDescription: "Alejar del lienzo",
    panCanvasAction: "Desplazar lienzo",
    panCanvasShortcut: "Clic izquierdo + Arrastrar",
    panCanvasDescription: "Desplazar el lienzo en modo desplazamiento",
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
    selectToolAction: "Herramienta de selección",
    selectToolShortcut: "Clic en botón Seleccionar",
    selectToolDescription: "Cambiar al modo de selección",
    panToolAction: "Herramienta de desplazamiento",
    panToolShortcut: "Clic en botón Desplazar",
    panToolDescription: "Cambiar al modo de desplazamiento para mover el lienzo",
    addItemAction: "Añadir elemento",
    addItemShortcut: "Clic en botón Añadir elemento",
    addItemDescription: "Abrir selector de iconos para añadir nuevos elementos",
    drawRectangleAction: "Dibujar rectángulo",
    drawRectangleShortcut: "Clic en botón Rectángulo",
    drawRectangleDescription: "Cambiar al modo de dibujo de rectángulos",
    createConnectorAction: "Crear conector",
    createConnectorShortcut: "Clic en botón Conector",
    createConnectorDescription: "Cambiar al modo de conector",
    addTextAction: "Añadir texto",
    addTextShortcut: "Clic en botón Texto",
    addTextDescription: "Crear un nuevo cuadro de texto",
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
    tipCreatingConnectors: "Consejo: Crear conectores",
    tipConnectorTools: "Consejo: Herramientas de conectores",
    clickInstructionStart: "Haz clic",
    clickInstructionMiddle: "en el primer nodo o punto, luego",
    clickInstructionEnd: "en el segundo nodo o punto para crear una conexión.",
    nowClickTarget: "Ahora haz clic en el objetivo para completar la conexión.",
    dragStart: "Arrastra",
    dragEnd: "desde el primer nodo al segundo nodo para crear una conexión.",
    rerouteStart: "Para cambiar la ruta de un conector,",
    rerouteMiddle: "haz clic izquierdo",
    rerouteEnd: "en cualquier punto a lo largo de la línea del conector y arrastra para crear o mover puntos de anclaje."
  },
  lassoHintTooltip: {
    tipLasso: "Consejo: Selección de lazo",
    tipFreehandLasso: "Consejo: Selección de lazo libre",
    lassoDragStart: "Haz clic y arrastra",
    lassoDragEnd: "para dibujar un cuadro de selección rectangular alrededor de los elementos que deseas seleccionar.",
    freehandDragStart: "Haz clic y arrastra",
    freehandDragMiddle: "para dibujar una",
    freehandDragEnd: "forma libre",
    freehandComplete: "alrededor de los elementos. Suelta para seleccionar todos los elementos dentro de la forma.",
    moveStart: "Una vez seleccionados,",
    moveMiddle: "haz clic dentro de la selección",
    moveEnd: "y arrastra para mover todos los elementos seleccionados juntos."
  },
  importHintTooltip: {
    title: "Importar diagramas",
    instructionStart: "Para importar diagramas, haz clic en el",
    menuButton: "botón de menú",
    instructionMiddle: "(☰) en la esquina superior izquierda, luego selecciona",
    openButton: "\"Abrir\"",
    instructionEnd: "para cargar tus archivos de diagrama."
  },
  connectorRerouteTooltip: {
    title: "Consejo: Cambiar ruta de conectores",
    instructionStart: "Una vez que tus conectores estén colocados, puedes cambiar su ruta como desees.",
    instructionSelect: "Selecciona el conector",
    instructionMiddle: "primero, luego",
    instructionClick: "haz clic en la ruta del conector",
    instructionAnd: "y",
    instructionDrag: "arrastra",
    instructionEnd: "para cambiarlo!"
  },
  connectorEmptySpaceTooltip: {
    message: "Para conectar este conector a un nodo,",
    instruction: "haz clic izquierdo en el extremo del conector y arrástralo al nodo deseado."
  },
  settings: {
    zoom: {
      description: "Configura el comportamiento del zoom al usar la rueda del ratón.",
      zoomToCursor: "Zoom al cursor",
      zoomToCursorDesc: "Cuando está habilitado, el zoom se centra en la posición del cursor del ratón. Cuando está deshabilitado, el zoom se centra en el lienzo."
    },
    hotkeys: {
      title: "Configuración de atajos",
      profile: "Perfil de atajos",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Sin atajos",
      tool: "Herramienta",
      hotkey: "Atajo",
      toolSelect: "Seleccionar",
      toolPan: "Desplazar",
      toolAddItem: "Añadir elemento",
      toolRectangle: "Rectángulo",
      toolConnector: "Conector",
      toolText: "Texto",
      note: "Nota: Los atajos funcionan cuando no estás escribiendo en campos de texto",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "Configuración de desplazamiento",
      mousePanOptions: "Opciones de desplazamiento con ratón",
      emptyAreaClickPan: "Clic y arrastrar en área vacía",
      middleClickPan: "Clic central y arrastrar",
      rightClickPan: "Clic derecho y arrastrar",
      ctrlClickPan: "Ctrl + clic y arrastrar",
      altClickPan: "Alt + clic y arrastrar",
      keyboardPanOptions: "Opciones de desplazamiento con teclado",
      arrowKeys: "Teclas de flechas",
      wasdKeys: "Teclas WASD",
      ijklKeys: "Teclas IJKL",
      keyboardPanSpeed: "Velocidad de desplazamiento con teclado",
      note: "Nota: Las opciones de desplazamiento funcionan además de la herramienta de desplazamiento dedicada"
    },
    connector: {
      title: "Configuración de conectores",
      connectionMode: "Modo de creación de conexiones",
      clickMode: "Modo clic (Recomendado)",
      clickModeDesc: "Haz clic en el primer nodo, luego haz clic en el segundo nodo para crear una conexión",
      dragMode: "Modo arrastrar",
      dragModeDesc: "Haz clic y arrastra desde el primer nodo hasta el segundo nodo",
      note: "Nota: Puedes cambiar esta configuración en cualquier momento. El modo seleccionado se usará cuando la herramienta de conector esté activa."
    },
    iconPacks: {
      title: "Gestión de Paquetes de Iconos",
      lazyLoading: "Activar Carga Diferida",
      lazyLoadingDesc: "Cargar paquetes de iconos bajo demanda para un inicio más rápido",
      availablePacks: "Paquetes de Iconos Disponibles",
      coreIsoflow: "Core Isoflow (Siempre Cargado)",
      alwaysEnabled: "Siempre activado",
      awsPack: "Iconos AWS",
      gcpPack: "Iconos Google Cloud",
      azurePack: "Iconos Azure",
      kubernetesPack: "Iconos Kubernetes",
      loading: "Cargando...",
      loaded: "Cargado",
      notLoaded: "No cargado",
      iconCount: "{count} iconos",
      lazyLoadingDisabledNote: "La carga diferida está desactivada. Todos los paquetes de iconos se cargan al iniciar.",
      note: "Los paquetes de iconos se pueden activar o desactivar según tus necesidades. Los paquetes desactivados reducirán el uso de memoria y mejorarán el rendimiento."
    }
  },
  lazyLoadingWelcome: {
    title: "Nueva Funcionalidad: ¡Carga Diferida!",
    message: "¡Hola! Después de la demanda popular, hemos implementado la Carga Diferida de iconos, así que ahora si quieres activar paquetes de iconos no estándar puedes activarlos en la sección 'Configuración'.",
    configPath: "Haz clic en el icono de Hamburguesa",
    configPath2: "en la esquina superior izquierda para acceder a la Configuración.",
    canDisable: "Puedes desactivar este comportamiento si lo deseas.",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "Detalles",
    style: "Estilo",
    notes: "Notas",
    notesModified: "Notas ●",
    close: "Cerrar",
    openLink: "Abrir enlace",
    caption: "Leyenda",
    noCaption: "Sin leyenda."
  },
  nodeInfoTab: {
    name: "Nombre",
    namePlaceholder: "Nombre del nodo…",
    removeLink: "Eliminar enlace",
    addLink: "Añadir enlace al nombre",
    linkPlaceholder: "https://…",
    caption: "Leyenda",
    captionHint: "Se muestra en el lienzo debajo del nombre del nodo",
    openLink: "Abrir enlace"
  },
  nodeStyleTab: {
    icon: "Icono",
    close: "Cerrar",
    change: "Cambiar…",
    iconSize: "Tamaño del icono",
    labelFontSize: "Tamaño de fuente de la etiqueta",
    labelColor: "Color de la etiqueta",
    labelHeight: "Altura de la etiqueta"
  },
  connectorControls: {
    close: "Cerrar",
    labels: "Etiquetas"
  },
  textBoxControls: {
    close: "Cerrar",
    text: "Texto",
    textSize: "Tamaño del texto",
    textColor: "Color del texto",
    alignment: "Alineación"
  },
  rectangleControls: {
    close: "Cerrar",
    color: "Color",
    useCustomColor: "Usar color personalizado"
  },
  labelColorPicker: {
    customColor: "Color personalizado"
  },
  deleteButton: {
    delete: "Eliminar"
  },
  nodeActionBar: {
    style: "Estilo",
    editName: "Editar nombre",
    editLink: "Editar enlace",
    addLink: "Añadir enlace",
    editNotes: "Editar notas",
    addNotes: "Añadir notas",
    delete: "Eliminar"
  },
  quickAddNodePopover: {
    add: "Añadir",
    group: "Grupo"
  },
  zoomControls: {
    zoomOut: "Alejar",
    zoomIn: "Acercar",
    fitToScreen: "Ajustar a pantalla",
    help: "Ayuda (F1)"
  },
  labelSettings: {
    description: "Configurar ajustes de visualización de etiquetas",
    expandButtonPadding: "Relleno del botón expandir",
    expandButtonPaddingDesc: "Relleno inferior cuando el botón expandir es visible (evita solapamiento de texto)"
  },
  iconSelectionControls: {
    close: "Cerrar",
    importIcons: "Importar iconos",
    isometricLabel: "Tratar como isométrico (vista 3D)",
    isometricHint: "Desmarcar para iconos planos (logos, elementos de UI)",
    dragHint: "Puedes arrastrar y soltar cualquier elemento de abajo sobre el lienzo."
  },
  searchbox: {
    placeholder: "Buscar iconos"
  },
  exportImageDialog: {
    title: "Exportar como imagen",
    compatibilityTitle: "Aviso de compatibilidad del navegador",
    compatibilityMessage: "Para mejores resultados, usa Chrome o Edge. Firefox actualmente tiene problemas de compatibilidad con la función de exportación.",
    cropInstruction: "Haz clic y arrastra para seleccionar el área que deseas exportar",
    options: "Opciones",
    showGrid: "Mostrar cuadrícula",
    expandDescriptions: "Expandir descripciones",
    cropToContent: "Recortar al contenido",
    backgroundColor: "Color de fondo",
    transparentBackground: "Fondo transparente",
    exportQuality: "Calidad de exportación (DPI)",
    custom: "Personalizado",
    recrop: "Recortar de nuevo",
    cropApplied: "Recorte aplicado con éxito",
    applyCrop: "Aplicar recorte",
    clearSelection: "Borrar selección",
    cropHint: "Selecciona un área para recortar, o desmarca \"Recortar al contenido\" para usar la imagen completa",
    cancel: "Cancelar",
    downloadSvg: "Descargar como SVG",
    downloadPng: "Descargar como PNG",
    error: "No se pudo exportar la imagen"
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

