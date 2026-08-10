import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Este é um texto de exemplo'
  },
  rightSidebar: {
    collapsePanel: 'Recolher painel',
    emptyState: 'Selecione um nó, conector ou forma para ver suas propriedades'
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
    togglePanToolAction: 'Alternar Ferramenta de Movimentação',
    togglePanToolShortcut: 'Clique direito',
    togglePanToolDescription:
      'Ativar/desativar modo de movimentação; clique esquerdo para retornar ao modo de seleção',
    lassoSelectAction: 'Seleção com Laço',
    lassoSelectShortcut: 'Clique esquerdo + Arrastar (área vazia)',
    lassoSelectDescription:
      'Desenhe uma caixa de seleção retangular para selecionar vários itens',
    deselectAction: 'Desselecionar',
    deselectShortcut: 'Clique esquerdo (área vazia)',
    deselectDescription:
      'Desfazer a seleção atual e retornar ao modo de seleção',
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
    deleteSelectedAction: 'Excluir Selecionados',
    deleteSelectedShortcut: 'Delete (Backspace no Mac)',
    deleteSelectedDescription:
      'Excluir o item selecionado ou todos os itens em uma seleção com laço; suporta desfazer/refazer',
    cutAction: 'Recortar',
    cutDescription:
      'Recortar os itens selecionados para a área de transferência — itens são removidos e podem ser colados em outro lugar; suporta desfazer/refazer',
    copyAction: 'Copiar',
    copyDescription:
      'Copiar os itens selecionados para a área de transferência',
    pasteAction: 'Colar',
    pasteDescription:
      'Colar itens da área de transferência na posição do mouse; deslocado para evitar sobreposição',
    // D10 — Select all row
    selectAllAction: 'Selecionar tudo',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Selecionar todos os itens visíveis e desbloqueados na vista ativa (itens, retângulos, caixas de texto, conectores + seus pontos de rota)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Renomear',
    keyRenameShortcut: 'F2',
    keyRenameDescription: 'Renomear o item ou diagrama selecionado em linha',
    keyAddItemAction: 'Adicionar item / Elementos',
    keyAddItemShortcut: 'N',
    keyAddItemDescription:
      'Alternar o painel Elementos para colocar um novo item',
    keyConnectorAction: 'Conector',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Mudar para a ferramenta de conector',
    keyLassoAction: 'Seleção por laço',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Mudar para a ferramenta de seleção por laço',
    keySelectAction: 'Selecionar',
    keySelectShortcut: 'S',
    keySelectDescription: 'Mudar para a ferramenta de seleção',
    // D10 — mouse interactions
    miSelectAction: 'Selecionar',
    miSelectMethod: 'Clique esquerdo',
    miSelectDescription:
      'Clique em um item para selecioná-lo (destaca-o e mostra a barra de ações flutuante). Clique na tela vazia para limpar a seleção.',
    miOpenDetailsAction: 'Abrir detalhes',
    miOpenDetailsMethod: 'Clique duplo',
    miOpenDetailsDescription:
      'Clique duas vezes em um item para abrir o painel de detalhes — igual à entrada «Detalhes…» do menu de contexto.',
    miToggleSelectionAction: 'Alternar seleção',
    miToggleSelectionMethod: 'Ctrl/Cmd + Clique esquerdo',
    miToggleSelectionDescription:
      'Adicionar ou remover um item da seleção múltipla; um conector é alternado junto com seus pontos de rota.',
    miPanAction: 'Mover',
    miPanMethod: 'Clique direito + arrastar',
    miPanDescription:
      'Segure o botão direito e arraste para mover a tela. Arrastar com o botão do meio também move; as setas a deslocam.',
    miContextMenuAction: 'Menu de contexto',
    miContextMenuMethod: 'Clique direito (toque)',
    miContextMenuDescription:
      'Um clique direito sem arrastar abre o menu de contexto — o menu do item sobre um item, ou o menu da tela sobre um espaço vazio. No touch, pressione e segure.',
    miRemoveWaypointAction: 'Remover ponto de rota',
    miRemoveWaypointMethod: 'Alt + Clique esquerdo',
    miRemoveWaypointDescription:
      'Alt+clique em um ponto de rota de um conector para removê-lo (sem precisar selecionar o conector primeiro); as âncoras das extremidades são preservadas.',
    miZoomAction: 'Zoom',
    miZoomMethod: 'Roda do mouse',
    miZoomDescription: 'Role para aplicar zoom em direção ao cursor.'
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
    // D3 — SettingsDialog chrome
    title: 'Configurações',
    close: 'Fechar',
    canvas: 'Tela',
    language: 'Idioma',
    about: 'Sobre',
    languageDescription:
      'Selecione o idioma de exibição da interface do aplicativo.',
    zoomSection: 'Zoom',
    labelsSection: 'Rótulos',
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
      fixedShortcutsTitle: 'Atalhos Fixos (Sempre Ativos)',
      fixedCut: 'Recortar',
      fixedCopy: 'Copiar',
      fixedPaste: 'Colar',
      fixedUndo: 'Desfazer',
      fixedRedo: 'Refazer'
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
    title: 'Bem-vindo ao Axoview',
    message:
      'O Axoview é uma ferramenta gratuita e de código aberto para criar diagramas isométricos e 2D impressionantes — arquitetura de nuvem, redes e infraestrutura, com ícones de AWS, GCP, Azure e Kubernetes já incluídos. Tudo funciona no seu navegador, salvando localmente ou no seu próprio Google Drive. Construído sobre os projetos de código aberto FossFLOW e Isoflow e em expansão ativa — encontre o código-fonte, relate um bug ou solicite um recurso em github.com/molikas/axoview.',
    configPath: 'Clique no ícone do Menu',
    configPath2: 'no canto superior esquerdo para acessar a Configuração.',
    canDisable: 'Você pode desativar esse comportamento se desejar.',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Adicionar página',
    deletePage: 'Excluir página',
    renameDiagram: 'Renomear diagrama',
    addPageDisabled: 'Limite de páginas atingido (5)'
  },
  nodePanel: {
    notes: 'Notas',
    close: 'Fechar'
  },
  nodeDeck: {
    metadata: 'Metadados',
    name: 'Nome',
    namePlaceholder: 'Nome do nó…',
    label: 'Rótulo',
    labelPlaceholder: 'Rótulo exibido na forma…'
  },
  connectorControls: {
    metadata: 'Metadados',
    close: 'Fechar',
    notes: 'Notas',
    name: 'Nome',
    namePlaceholder: 'Rótulo da aresta…',
    labels: 'Rótulos',
    addLabel: 'Adicionar rótulo',
    noLabels: 'Ainda não há rótulos.',
    labelN: 'Rótulo {count}',
    positionHint:
      'Arraste um rótulo na tela para posicioná-lo; use a barra superior para o tamanho e a cor do texto.',
    line: 'Linha',
    line1: 'Linha 1',
    line2: 'Linha 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Pesquisar ou colar um link',
    linkCopy: 'Copiar link',
    linkCopied: 'Copiado',
    linkEdit: 'Editar link',
    linkRemove: 'Remover link',
    placeholder: 'Digite algo',
    metadata: 'Metadados',
    notes: 'Notas',
    close: 'Fechar',
    name: 'Nome',
    namePlaceholder: 'Nome do elemento…'
  },
  rectangleControls: {
    metadata: 'Metadados',
    notes: 'Notas',
    close: 'Fechar',
    name: 'Nome',
    namePlaceholder: 'Nome do elemento…'
  },
  topBarStyleControls: {
    mixed: 'Variado',
    rotate90: 'Girar 90°',
    noColor: 'Sem cor',
    pickColorFromScreen: 'Selecionar cor da tela',
    customColor: 'Cor personalizada',
    textSize: 'Tamanho do texto',
    lineSpacing: 'Espaçamento entre linhas',
    alignment: 'Alinhamento',
    alignmentDisabled: 'Selecione uma caixa de texto para alinhar o texto',
    alignLeft: 'Alinhar à esquerda',
    alignCenter: 'Centralizar',
    alignRight: 'Alinhar à direita',
    alignTop: 'Alinhar ao topo',
    alignMiddle: 'Alinhar ao meio',
    alignBottom: 'Alinhar à base',
    textColor: 'Cor do texto',
    textColorDisabled:
      'Selecione um nó, uma caixa de texto, um rótulo ou um rótulo de conexão para definir a cor do texto',
    textSizeDisabled:
      'Selecione um nó, uma caixa de texto, um rótulo ou um rótulo de conexão para definir o tamanho do texto',
    labelSizeAllSelected: 'Tamanho do rótulo (todos os selecionados)',
    textColorAllSelected: 'Cor do texto (todos os selecionados)',
    armedToolPlaceFirst:
      'O novo elemento usa o estilo padrão — posicione-o primeiro e depois estilize-o aqui',
    decreaseLabelSize: 'Diminuir tamanho do rótulo',
    increaseLabelSize: 'Aumentar tamanho do rótulo',
    labelSize: 'Tamanho do rótulo',
    decreaseSize: 'Diminuir tamanho',
    increaseSize: 'Aumentar tamanho',
    stepAll: 'Ajustar todos',
    size: 'Tamanho',
    bold: 'Negrito',
    italic: 'Itálico',
    underline: 'Sublinhado',
    strikethrough: 'Tachado',
    format: 'Negrito / itálico / sublinhado / tachado',
    formatDisabled:
      'Selecione um nó, uma caixa de texto, um rótulo ou um rótulo de conexão para formatar o texto',
    lists: 'Listas',
    listsDisabled: 'Selecione uma caixa de texto para usar listas',
    bulletList: 'Lista com marcadores',
    numberedList: 'Lista numerada',
    background: 'Cor de fundo',
    backgroundDisabled:
      'Selecione um retângulo, rótulo ou caixa de texto para definir sua cor de fundo',
    opacity: 'Opacidade',
    border: 'Borda',
    borderDisabled:
      'Selecione um retângulo ou caixa de texto para definir sua borda',
    lineStyle: 'Estilo de linha',
    width: 'Largura',
    borderColor: 'Cor da borda',
    link: 'Link',
    linkDisabled: 'Selecione um nó, conexão ou rótulo para adicionar um link',
    linkSelection: 'Adicionar link ao texto selecionado',
    linkDisabledTextBox:
      'Selecione texto durante a edição para adicionar um link',
    linkToWeb: 'Link para a web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Link para o diagrama',
    searchDiagrams: 'Pesquisar diagramas…',
    openLinkedDiagram: 'Abrir diagrama vinculado',
    showLabel: 'Mostrar rótulo',
    hideLabel: 'Ocultar rótulo',
    showHideLabelDisabled:
      'Selecione um nó ou uma conexão para mostrar ou ocultar seu rótulo',
    changeIconBulk: 'Alterar ícone aplica-se a um nó por vez',
    changeIcon: 'Alterar ícone',
    changeIconDisabled: 'Selecione um nó para alterar seu ícone',
    connectionColorPredraw: 'Cor para a próxima conexão que você desenhar',
    connectionColor: 'Cor da conexão',
    connectionColorDisabled:
      'Selecione uma conexão (ou a ferramenta de conector) para definir sua cor',
    lineOptionsPredraw:
      'Estilo de linha para a próxima conexão que você desenhar',
    lineOptions: 'Opções de linha',
    lineOptionsDisabled:
      'Selecione uma conexão (ou a ferramenta de conector) para definir suas opções de linha',
    lineType: 'Tipo de linha',
    showArrow: 'Mostrar seta',
    showDottedLine: 'Mostrar linha pontilhada'
  },
  quickAddNodePopover: {
    add: 'Adicionar',
    rectangle: 'Grupo'
  },
  zoomControls: {
    zoomOut: 'Diminuir zoom',
    zoomIn: 'Aumentar zoom',
    fitToScreen: 'Ajustar à tela',
    keepLabelsReadable: 'Manter rótulos legíveis',
    help: 'Ajuda (F1)',
    selected: '{count} selecionados'
  },
  modeHints: {
    connector: 'Arraste entre os itens para conectar • Esc para cancelar',
    textBox: 'Clique para inserir uma caixa de texto • Esc para cancelar',
    label: 'Clique para inserir um rótulo • Esc para cancelar',
    rectangle: 'Arraste para desenhar um retângulo • Esc para cancelar'
  },
  previewLayerSwitcher: {
    layers: 'Camadas',
    showLayer: 'Mostrar camada',
    hideLayer: 'Ocultar camada',
    solo: 'Solo',
    unsolo: 'Sair do solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Ocultar rótulos',
    showLabels: 'Mostrar rótulos'
  },
  annotationPalette: {
    pen: 'Anotar',
    select: 'Selecionar',
    draw: 'Desenhar',
    shapes: 'Formas',
    pencil: 'Lápis',
    highlighter: 'Marca-texto',
    line: 'Linha',
    arrow: 'Seta',
    rectangle: 'Retângulo',
    ellipse: 'Elipse',
    eraser: 'Borracha',
    undo: 'Desfazer',
    redo: 'Refazer',
    clear: 'Limpar tudo'
  },
  viewModeInfoPopover: {
    close: 'Fechar'
  },
  labelSettings: {
    description: 'Configurar ajustes de exibição de rótulos',
    expandButtonPadding: 'Preenchimento do botão expandir',
    expandButtonPaddingDesc:
      'Preenchimento inferior quando o botão expandir está visível (evita sobreposição de texto)',
    // D13
    currentValue: 'Atual: {value} unidades de tema'
  },
  iconSelectionControls: {
    close: 'Fechar',
    importIcons: 'Importar ícones',
    addMoreIcons: 'Adicionar mais ícones',
    isometricLabel: 'Tratar como isométrico (visão 3D)',
    isometricHint: 'Desmarcar para ícones planos (logos, elementos de UI)',
    dragHint: 'Você pode arrastar e soltar qualquer item abaixo na tela.',
    aiPromptTooltip: 'Gerar ícones com IA',
    aiPromptTitle: 'Gerar ícones isométricos com IA',
    aiPromptBody:
      "Cole este prompt em uma IA geradora de imagens. Substitua 'my object' pelo que você precisa e importe o PNG gerado.",
    aiPromptCopy: 'Copiar prompt',
    aiPromptCopied: 'Copiado'
  },
  searchbox: {
    placeholder: 'Pesquisar ícones'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Exportar como imagem',
    compatibilityTitle: 'Aviso de compatibilidade do navegador',
    compatibilityMessage:
      'Para melhores resultados, use Chrome ou Edge. O Firefox atualmente tem problemas de compatibilidade com o recurso de exportação.',
    cropInstruction:
      'Clique e arraste para selecionar a área que deseja exportar',
    options: 'Opções',
    showGrid: 'Mostrar grade',
    showLabels: 'Mostrar rótulos',
    screenshotPreset: 'Captura de tela (recomendado)',
    scaleClamped:
      'Tamanho de exportação reduzido para se ajustar ao limite de imagem do navegador:',
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
    label: 'Label',
    undo: 'Desfazer',
    redo: 'Refazer',
    select: 'Selecionar',
    lassoSelect: 'Seleção com laço',
    freehandLasso: 'Laço livre',
    pan: 'Mover',
    addItem: 'Adicionar item',
    rectangle: 'Retângulo',
    connector: 'Conector',
    text: 'Texto',
    common: 'Comuns',
    // D5
    switchTo2D: 'Mudar para vista 2D',
    switchToIsometric: 'Mudar para vista isométrica',
    clickMode: 'Clicar',
    dragMode: 'Arrastar'
  },
  quickIconSelector: {
    recentlyUsed: 'USADOS RECENTEMENTE',
    searchResults: 'RESULTADOS DA BUSCA ({count} ícones)',
    noIconsFound: 'Nenhum ícone encontrado para "{term}"'
  },
  canvasContextMenu: {
    addNote: 'Adicionar nota',
    addLabel: 'Adicionar rótulo',
    details: 'Detalhes…',
    rename: 'Renomear',
    cut: 'Recortar',
    copy: 'Copiar',
    paste: 'Colar',
    duplicate: 'Duplicar',
    bringForward: 'Trazer para frente',
    sendBackward: 'Enviar para trás',
    bringToFront: 'Trazer para a frente',
    sendToBack: 'Enviar para trás',
    assignToLayer: 'Atribuir à camada',
    fitToText: 'Ajustar ao texto',
    snapToGrid: 'Ajustar à grade',
    unsnapFromGrid: 'Desafixar da grade',
    disableCollision: 'Desativar colisão',
    enableCollision: 'Ativar colisão',
    delete: 'Excluir',
    addItem: 'Adicionar item',
    selectAll: 'Selecionar tudo',
    enableSnapToGrid: 'Ativar ajuste à grade',
    disableSnapToGrid: 'Desativar ajuste à grade',
    itemsSelectedOne: '{count} item selecionado',
    itemsSelectedOther: '{count} itens selecionados',
    deleteItemsOne: 'Excluir {count} item',
    deleteItemsOther: 'Excluir {count} itens',
    removeFromLayer: 'Remover da camada',
    noLayers: 'Sem camadas — adicione uma no painel de camadas'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Explorador de arquivos',
    elements: 'Elementos',
    layers: 'Camadas',
    settings: 'Configurações',
    openDiagramFirst: 'abra ou crie um diagrama primeiro',
    collapsePanel: 'Recolher painel'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: 'Excluir a camada?',
    deleteLayerBody: 'Esta camada contém {count} elemento(s). O que deve acontecer com eles?',
    deleteLayerHiddenWarning: 'Esta camada está OCULTA. Manter o conteúdo o tornará VISÍVEL novamente — um elemento sem camada é sempre exibido.',
    deleteLayerCancel: 'Cancelar',
    deleteLayerKeep: 'Manter o conteúdo',
    deleteLayerDeleteContents: 'Excluir o conteúdo também',
    header: 'Camadas',
    addLayer: 'Adicionar camada',
    deleteSelectedLayer: 'Excluir camada selecionada',
    noLayersYet: 'Ainda não há camadas. Clique em + para adicionar uma.',
    unassigned: 'Não atribuído ({count})',
    dropToUnassign: 'Solte itens aqui para desatribuir',
    layerN: 'Camada {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} item copiado',
    copiedOther: '{count} itens copiados',
    cutOne: '{count} item recortado',
    cutOther: '{count} itens recortados',
    pastedOne: '{count} item colado',
    pastedOther: '{count} itens colados',
    nothingToPaste: 'Nada para colar',
    couldNotPaste: 'Não foi possível colar — o conteúdo copiado não é compatível com este diagrama',
    routingConnectors: 'Colando… roteando conectores ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Página {count}'
  }
};

export default locale;
