import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: 'Este é um texto de exemplo'
  },
  mainMenu: {
    undo: 'Desfazer',
    redo: 'Refazer',
    new: 'New diagram',
    open: 'Abrir',
    exportJson: 'Exportar como JSON',
    exportCompactJson: 'Exportar como JSON compacto',
    exportImage: 'Exportar como imagem',
    clearCanvas: 'Limpar a tela',
    settings: 'Configurações',
    gitHub: 'GitHub'
  },
  helpDialog: {
    title: 'Atalhos de teclado e ajuda',
    close: 'Fechar',
    keyboardShortcuts: 'Atalhos de teclado',
    mouseInteractions: 'Interações do mouse',
    action: 'Ação',
    shortcut: 'Atalho',
    method: 'Método',
    description: 'Descrição',
    note: 'Nota:',
    noteContent:
      'Os atalhos de teclado são desabilitados ao digitar em campos de entrada, áreas de texto ou elementos editáveis para evitar conflitos.',
    // Keyboard shortcuts
    undoAction: 'Desfazer',
    undoDescription: 'Desfazer a última ação',
    redoAction: 'Refazer',
    redoDescription: 'Refazer a última ação desfeita',
    redoAltAction: 'Refazer (Alternativo)',
    redoAltDescription: 'Atalho alternativo para refazer',
    helpAction: 'Ajuda',
    helpDescription: 'Abrir diálogo de ajuda com atalhos de teclado',
    zoomInAction: 'Aumentar zoom',
    zoomInShortcut: 'Roda do mouse para cima',
    zoomInDescription: 'Aumentar o zoom na tela',
    zoomOutAction: 'Diminuir zoom',
    zoomOutShortcut: 'Roda do mouse para baixo',
    zoomOutDescription: 'Diminuir o zoom da tela',
    panCanvasAction: 'Mover tela',
    panCanvasShortcut: 'Clique esquerdo + Arrastar',
    panCanvasDescription: 'Mover a tela no modo de movimentação',
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
    selectToolAction: 'Ferramenta de seleção',
    selectToolShortcut: 'Clique no botão Selecionar',
    selectToolDescription: 'Mudar para o modo de seleção',
    panToolAction: 'Ferramenta de movimentação',
    panToolShortcut: 'Clique no botão Mover',
    panToolDescription: 'Mudar para o modo de movimentação da tela',
    addItemAction: 'Adicionar item',
    addItemShortcut: 'Clique no botão Adicionar item',
    addItemDescription: 'Abrir seletor de ícones para adicionar novos itens',
    drawRectangleAction: 'Desenhar retângulo',
    drawRectangleShortcut: 'Clique no botão Retângulo',
    drawRectangleDescription: 'Mudar para o modo de desenho de retângulos',
    createConnectorAction: 'Criar conector',
    createConnectorShortcut: 'Clique no botão Conector',
    createConnectorDescription: 'Mudar para o modo de conector',
    addTextAction: 'Adicionar texto',
    addTextShortcut: 'Clique no botão Texto',
    addTextDescription: 'Criar uma nova caixa de texto',
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
    tipCreatingConnectors: 'Dica: Criar conectores',
    tipConnectorTools: 'Dica: Ferramentas de conectores',
    clickInstructionStart: 'Clique',
    clickInstructionMiddle: 'no primeiro nó ou ponto, depois',
    clickInstructionEnd: 'no segundo nó ou ponto para criar uma conexão.',
    nowClickTarget: 'Agora clique no alvo para completar a conexão.',
    dragStart: 'Arraste',
    dragEnd: 'do primeiro nó ao segundo nó para criar uma conexão.',
    rerouteStart: 'Para redirecionar um conector,',
    rerouteMiddle: 'clique com o botão esquerdo',
    rerouteEnd:
      'em qualquer ponto ao longo da linha do conector e arraste para criar ou mover pontos de ancoragem.'
  },
  lassoHintTooltip: {
    tipLasso: 'Dica: Seleção com laço',
    tipFreehandLasso: 'Dica: Seleção com laço livre',
    lassoDragStart: 'Clique e arraste',
    lassoDragEnd:
      'para desenhar uma caixa de seleção retangular ao redor dos itens que você deseja selecionar.',
    freehandDragStart: 'Clique e arraste',
    freehandDragMiddle: 'para desenhar uma',
    freehandDragEnd: 'forma livre',
    freehandComplete:
      'ao redor dos itens. Solte para selecionar todos os itens dentro da forma.',
    moveStart: 'Uma vez selecionados,',
    moveMiddle: 'clique dentro da seleção',
    moveEnd: 'e arraste para mover todos os itens selecionados juntos.'
  },
  importHintTooltip: {
    title: 'Importar diagramas',
    instructionStart: 'Para importar diagramas, clique no',
    menuButton: 'botão de menu',
    instructionMiddle: '(☰) no canto superior esquerdo, depois selecione',
    openButton: '"Abrir"',
    instructionEnd: 'para carregar seus arquivos de diagrama.'
  },
  connectorRerouteTooltip: {
    title: 'Dica: Redirecionar conectores',
    instructionStart:
      'Uma vez que seus conectores estejam posicionados, você pode redirecioná-los como desejar.',
    instructionSelect: 'Selecione o conector',
    instructionMiddle: 'primeiro, depois',
    instructionClick: 'clique no caminho do conector',
    instructionAnd: 'e',
    instructionDrag: 'arraste',
    instructionEnd: 'para alterá-lo!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Para conectar este conector a um nó,',
    instruction:
      'clique com o botão esquerdo na extremidade do conector e arraste-o para o nó desejado.'
  },
  settings: {
    zoom: {
      description:
        'Configurar o comportamento do zoom ao usar a roda do mouse.',
      zoomToCursor: 'Zoom no cursor',
      zoomToCursorDesc:
        'Quando habilitado, o zoom é centralizado na posição do cursor do mouse. Quando desabilitado, o zoom é centralizado na tela.'
    },
    hotkeys: {
      title: 'Configurações de atalhos',
      profile: 'Perfil de atalhos',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Sem atalhos',
      tool: 'Ferramenta',
      hotkey: 'Atalho',
      toolSelect: 'Selecionar',
      toolPan: 'Mover',
      toolAddItem: 'Adicionar item',
      toolRectangle: 'Retângulo',
      toolConnector: 'Conector',
      toolText: 'Texto',
      note: 'Nota: Os atalhos funcionam quando você não está digitando em campos de texto',
      fixedShortcutsTitle: 'Fixed Shortcuts (Always Active)',
      fixedCut: 'Cut',
      fixedCopy: 'Copy',
      fixedPaste: 'Paste',
      fixedUndo: 'Undo',
      fixedRedo: 'Redo'
    },
    pan: {
      title: 'Configurações de movimentação',
      mousePanOptions: 'Opções de movimentação com mouse',
      emptyAreaClickPan: 'Clicar e arrastar em área vazia',
      middleClickPan: 'Clicar com o botão do meio e arrastar',
      rightClickPan: 'Clicar com o botão direito e arrastar',
      ctrlClickPan: 'Ctrl + clicar e arrastar',
      altClickPan: 'Alt + clicar e arrastar',
      keyboardPanOptions: 'Opções de movimentação com teclado',
      arrowKeys: 'Teclas de seta',
      wasdKeys: 'Teclas WASD',
      ijklKeys: 'Teclas IJKL',
      keyboardPanSpeed: 'Velocidade de movimentação com teclado',
      note: 'Nota: As opções de movimentação funcionam além da ferramenta de movimentação dedicada'
    },
    connector: {
      title: 'Configurações de conectores',
      connectionMode: 'Modo de criação de conexão',
      clickMode: 'Modo clique (Recomendado)',
      clickModeDesc:
        'Clique no primeiro nó, depois clique no segundo nó para criar uma conexão',
      dragMode: 'Modo arrastar',
      dragModeDesc: 'Clique e arraste do primeiro nó ao segundo nó',
      note: 'Nota: Você pode alterar esta configuração a qualquer momento. O modo selecionado será usado quando a ferramenta de conector estiver ativa.'
    },
    iconPacks: {
      title: 'Gerenciamento de Pacotes de Ícones',
      lazyLoading: 'Ativar Carregamento Sob Demanda',
      lazyLoadingDesc:
        'Carregar pacotes de ícones sob demanda para inicialização mais rápida',
      availablePacks: 'Pacotes de Ícones Disponíveis',
      coreIsoflow: 'Core Isoflow (Sempre Carregado)',
      alwaysEnabled: 'Sempre ativado',
      awsPack: 'Ícones AWS',
      gcpPack: 'Ícones Google Cloud',
      azurePack: 'Ícones Azure',
      kubernetesPack: 'Ícones Kubernetes',
      loading: 'Carregando...',
      loaded: 'Carregado',
      notLoaded: 'Não carregado',
      iconCount: '{count} ícones',
      lazyLoadingDisabledNote:
        'O carregamento sob demanda está desativado. Todos os pacotes de ícones são carregados na inicialização.',
      note: 'Os pacotes de ícones podem ser ativados ou desativados conforme suas necessidades. Pacotes desativados reduzirão o uso de memória e melhorarão o desempenho.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Novo Recurso: Carregamento Sob Demanda!',
    message:
      "Ei! Após demanda popular, implementamos o Carregamento Sob Demanda de ícones, então agora se você quiser ativar pacotes de ícones não padrão, você pode ativá-los na seção 'Configuração'.",
    configPath: 'Clique no ícone do Menu',
    configPath2: 'no canto superior esquerdo para acessar a Configuração.',
    canDisable: 'Você pode desativar esse comportamento se desejar.',
    signature: '-Stan'
  },
  viewTabs: {
    addPage: 'Add page',
    deletePage: 'Delete page',
    renameDiagram: 'Rename diagram'
  },
  nodePanel: {
    details: 'Detalhes',
    style: 'Estilo',
    notes: 'Notas',
    notesModified: 'Notas ●',
    close: 'Fechar',
    openLink: 'Abrir link',
    caption: 'Legenda',
    noCaption: 'Sem legenda.'
  },
  nodeInfoTab: {
    name: 'Nome',
    namePlaceholder: 'Nome do nó…',
    removeLink: 'Remover link',
    addLink: 'Adicionar link ao nome',
    linkPlaceholder: 'https://…',
    caption: 'Legenda',
    captionHint: 'Exibido na tela abaixo do nome do nó',
    openLink: 'Abrir link',
    diagramLink: 'Link to diagram',
    diagramLinkPlaceholder: 'Select a diagram…',
    diagramLinkHint: 'Clicking this node in read-only mode opens the linked diagram',
    openDiagramLink: 'Open linked diagram'
  },
  nodeStyleTab: {
    icon: 'Ícone',
    close: 'Fechar',
    change: 'Alterar…',
    iconSize: 'Tamanho do ícone',
    labelFontSize: 'Tamanho da fonte do rótulo',
    labelColor: 'Cor do rótulo',
    labelHeight: 'Altura do rótulo'
  },
  connectorControls: {
    close: 'Fechar',
    labels: 'Rótulos'
  },
  textBoxControls: {
    close: 'Fechar',
    text: 'Texto',
    textSize: 'Tamanho do texto',
    textColor: 'Cor do texto',
    alignment: 'Alinhamento'
  },
  rectangleControls: {
    close: 'Fechar',
    color: 'Cor',
    useCustomColor: 'Usar cor personalizada'
  },
  labelColorPicker: {
    customColor: 'Cor personalizada'
  },
  deleteButton: {
    delete: 'Excluir'
  },
  nodeActionBar: {
    style: 'Estilo',
    editName: 'Editar nome',
    editLink: 'Editar link',
    addLink: 'Adicionar link',
    editNotes: 'Editar notas',
    addNotes: 'Adicionar notas',
    startConnector: 'Start connector',
    delete: 'Excluir'
  },
  quickAddNodePopover: {
    add: 'Adicionar',
    rectangle: 'Grupo'
  },
  zoomControls: {
    zoomOut: 'Diminuir zoom',
    zoomIn: 'Aumentar zoom',
    fitToScreen: 'Ajustar à tela',
    help: 'Ajuda (F1)'
  },
  labelSettings: {
    description: 'Configurar ajustes de exibição de rótulos',
    expandButtonPadding: 'Preenchimento do botão expandir',
    expandButtonPaddingDesc:
      'Preenchimento inferior quando o botão expandir está visível (evita sobreposição de texto)'
  },
  iconSelectionControls: {
    close: 'Fechar',
    importIcons: 'Importar ícones',
    isometricLabel: 'Tratar como isométrico (visão 3D)',
    isometricHint: 'Desmarcar para ícones planos (logos, elementos de UI)',
    dragHint: 'Você pode arrastar e soltar qualquer item abaixo na tela.'
  },
  searchbox: {
    placeholder: 'Pesquisar ícones'
  },
  exportImageDialog: {
    title: 'Exportar como imagem',
    compatibilityTitle: 'Aviso de compatibilidade do navegador',
    compatibilityMessage:
      'Para melhores resultados, use Chrome ou Edge. O Firefox atualmente tem problemas de compatibilidade com o recurso de exportação.',
    cropInstruction:
      'Clique e arraste para selecionar a área que deseja exportar',
    options: 'Opções',
    showGrid: 'Mostrar grade',
    expandDescriptions: 'Expandir descrições',
    cropToContent: 'Recortar ao conteúdo',
    backgroundColor: 'Cor de fundo',
    transparentBackground: 'Fundo transparente',
    exportQuality: 'Qualidade de exportação (DPI)',
    custom: 'Personalizado',
    recrop: 'Recortar novamente',
    cropApplied: 'Recorte aplicado com sucesso',
    applyCrop: 'Aplicar recorte',
    clearSelection: 'Limpar seleção',
    cropHint:
      'Selecione uma área para recortar, ou desmarque "Recortar ao conteúdo" para usar a imagem completa',
    cancel: 'Cancelar',
    downloadSvg: 'Baixar como SVG',
    downloadPng: 'Baixar como PNG',
    error: 'Não foi possível exportar a imagem'
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
