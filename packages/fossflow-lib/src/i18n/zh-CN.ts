import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: '这是一段示例文本'
  },
  mainMenu: {
    undo: '撤销',
    redo: '重做',
    new: 'New diagram',
    open: '打开',
    exportJson: '导出为 JSON',
    exportCompactJson: '导出为紧凑 JSON',
    exportImage: '导出为图片',
    clearCanvas: '清空画布',
    settings: '设置',
    gitHub: 'GitHub'
  },
  helpDialog: {
    title: '键盘快捷键和帮助',
    close: '关闭',
    keyboardShortcuts: '键盘快捷键',
    mouseInteractions: '鼠标交互',
    action: '操作',
    shortcut: '快捷键',
    method: '方法',
    description: '描述',
    note: '注意：',
    noteContent:
      '在输入框、文本区域或可编辑内容元素中键入时，键盘快捷键会被禁用，以防止冲突。',
    // Keyboard shortcuts
    undoAction: '撤销',
    undoDescription: '撤销上一个操作',
    redoAction: '重做',
    redoDescription: '重做上一个撤销的操作',
    redoAltAction: '重做（备选）',
    redoAltDescription: '备选重做快捷键',
    helpAction: '帮助',
    helpDescription: '打开包含键盘快捷键的帮助对话框',
    zoomInAction: '放大',
    zoomInShortcut: '鼠标滚轮向上',
    zoomInDescription: '放大画布',
    zoomOutAction: '缩小',
    zoomOutShortcut: '鼠标滚轮向下',
    zoomOutDescription: '缩小画布',
    panCanvasAction: '平移画布',
    panCanvasShortcut: '左键拖拽',
    panCanvasDescription: '在平移模式下移动画布',
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
    selectToolAction: '选择工具',
    selectToolShortcut: '点击选择按钮',
    selectToolDescription: '切换到选择模式',
    panToolAction: '平移工具',
    panToolShortcut: '点击平移按钮',
    panToolDescription: '切换到平移模式以移动画布',
    addItemAction: '添加项目',
    addItemShortcut: '点击添加项目按钮',
    addItemDescription: '打开图标选择器以添加新项目',
    drawRectangleAction: '绘制矩形',
    drawRectangleShortcut: '点击矩形按钮',
    drawRectangleDescription: '切换到矩形绘制模式',
    createConnectorAction: '创建连接器',
    createConnectorShortcut: '点击连接器按钮',
    createConnectorDescription: '切换到连接器模式',
    addTextAction: '添加文本',
    addTextShortcut: '点击文本按钮',
    addTextDescription: '创建新的文本框',
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
    tipCreatingConnectors: '提示：创建连接器',
    tipConnectorTools: '提示：连接器工具',
    clickInstructionStart: '点击',
    clickInstructionMiddle: '第一个节点或点，然后',
    clickInstructionEnd: '第二个节点或点来创建连接。',
    nowClickTarget: '现在点击目标以完成连接。',
    dragStart: '拖拽',
    dragEnd: '从第一个节点到第二个节点来创建连接。',
    rerouteStart: '要重新规划连接器线路，请',
    rerouteMiddle: '左键点击',
    rerouteEnd: '连接器线上的任何点并拖拽以创建或移动锚点。'
  },
  lassoHintTooltip: {
    tipLasso: '提示：套索选择',
    tipFreehandLasso: '提示：自由套索选择',
    lassoDragStart: '点击并拖拽',
    lassoDragEnd: '以绘制矩形选择框来选中您想选择的项目。',
    freehandDragStart: '点击并拖拽',
    freehandDragMiddle: '以绘制',
    freehandDragEnd: '自由形状',
    freehandComplete: '围绕项目。释放以选择形状内的所有项目。',
    moveStart: '选择后，',
    moveMiddle: '在选择区域内点击',
    moveEnd: '并拖拽以一起移动所有选中的项目。'
  },
  importHintTooltip: {
    title: '导入图表',
    instructionStart: '要导入图表，请点击左上角的',
    menuButton: '菜单按钮',
    instructionMiddle: '（☰），然后选择',
    openButton: '"打开"',
    instructionEnd: '来加载您的图表文件。'
  },
  connectorRerouteTooltip: {
    title: '提示：重新规划连接器路径',
    instructionStart: '连接器放置后，您可以随意重新规划路径。',
    instructionSelect: '先选择连接器',
    instructionMiddle: '，然后',
    instructionClick: '点击连接器路径',
    instructionAnd: '并',
    instructionDrag: '拖拽',
    instructionEnd: '即可更改！'
  },
  connectorEmptySpaceTooltip: {
    message: '要将此连接器连接到节点，',
    instruction: '左键单击连接器末端并将其拖动到所需节点。'
  },
  settings: {
    zoom: {
      description: '配置使用鼠标滚轮时的缩放行为。',
      zoomToCursor: '光标缩放',
      zoomToCursorDesc:
        '启用时，以鼠标光标位置为中心进行缩放。禁用时，以画布中心进行缩放。'
    },
    hotkeys: {
      title: '快捷键设置',
      profile: '快捷键配置',
      profileQwerty: 'QWERTY（Q、W、E、R、T、Y）',
      profileSmnrct: 'SMNRCT（S、M、N、R、C、T）',
      profileNone: '无快捷键',
      tool: '工具',
      hotkey: '快捷键',
      toolSelect: '选择',
      toolPan: '平移',
      toolAddItem: '添加项目',
      toolRectangle: '矩形',
      toolConnector: '连接器',
      toolText: '文本',
      note: '注意：在文本输入框中输入时快捷键不生效',
      fixedShortcutsTitle: 'Fixed Shortcuts (Always Active)',
      fixedCut: 'Cut',
      fixedCopy: 'Copy',
      fixedPaste: 'Paste',
      fixedUndo: 'Undo',
      fixedRedo: 'Redo'
    },
    pan: {
      title: '平移设置',
      mousePanOptions: '鼠标平移选项',
      emptyAreaClickPan: '点击并拖拽空白区域',
      middleClickPan: '中键点击并拖拽',
      rightClickPan: '右键点击并拖拽',
      ctrlClickPan: 'Ctrl + 点击并拖拽',
      altClickPan: 'Alt + 点击并拖拽',
      keyboardPanOptions: '键盘平移选项',
      arrowKeys: '方向键',
      wasdKeys: 'WASD 键',
      ijklKeys: 'IJKL 键',
      keyboardPanSpeed: '键盘平移速度',
      note: '注意：平移选项可与专用的平移工具一起使用'
    },
    connector: {
      title: '连接器设置',
      connectionMode: '连接创建模式',
      clickMode: '点击模式（推荐）',
      clickModeDesc: '先点击第一个节点，然后点击第二个节点来创建连接',
      dragMode: '拖拽模式',
      dragModeDesc: '从第一个节点点击并拖拽到第二个节点',
      note: '注意：您可以随时更改此设置。所选模式将在连接器工具激活时使用。'
    },
    iconPacks: {
      title: '图标包管理',
      lazyLoading: '启用延迟加载',
      lazyLoadingDesc: '按需加载图标包以加快启动速度',
      availablePacks: '可用图标包',
      coreIsoflow: '核心 Isoflow（始终加载）',
      alwaysEnabled: '始终启用',
      awsPack: 'AWS 图标',
      gcpPack: 'Google Cloud 图标',
      azurePack: 'Azure 图标',
      kubernetesPack: 'Kubernetes 图标',
      loading: '加载中...',
      loaded: '已加载',
      notLoaded: '未加载',
      iconCount: '{count} 个图标',
      lazyLoadingDisabledNote: '延迟加载已禁用。所有图标包将在启动时加载。',
      note: '可以根据需要启用或禁用图标包。禁用的图标包将减少内存使用并提高性能。'
    }
  },
  lazyLoadingWelcome: {
    title: '新功能：延迟加载！',
    message:
      '嘿！应大家的要求，我们实现了图标的延迟加载功能，现在如果您想启用非标准图标包，可以在「配置」部分中启用它们。',
    configPath: '点击左上角的汉堡菜单图标',
    configPath2: '以访问配置。',
    canDisable: '如果您愿意，可以禁用此行为。',
    signature: '-Stan'
  },
  viewTabs: {
    addPage: '添加页面',
    deletePage: '删除页面',
    renameDiagram: '重命名图表'
  },
  nodePanel: {
    details: '详情',
    style: '样式',
    notes: '备注',
    notesModified: '备注 ●',
    close: '关闭',
    openLink: '打开链接',
    caption: '说明文字',
    noCaption: '无说明文字。'
  },
  nodeInfoTab: {
    name: '名称',
    namePlaceholder: '节点名称…',
    removeLink: '移除链接',
    addLink: '为名称添加链接',
    linkPlaceholder: 'https://…',
    caption: '说明文字',
    captionHint: '显示在画布中节点名称下方',
    openLink: '打开链接'
  },
  nodeStyleTab: {
    icon: '图标',
    close: '关闭',
    change: '更改…',
    iconSize: '图标大小',
    labelFontSize: '标签字体大小',
    labelColor: '标签颜色',
    labelHeight: '标签高度'
  },
  connectorControls: {
    close: '关闭',
    labels: '标签'
  },
  textBoxControls: {
    close: '关闭',
    text: '文本',
    textSize: '文本大小',
    textColor: '文本颜色',
    alignment: '对齐方式'
  },
  rectangleControls: {
    close: '关闭',
    color: '颜色',
    useCustomColor: '使用自定义颜色'
  },
  labelColorPicker: {
    customColor: '自定义颜色'
  },
  deleteButton: {
    delete: '删除'
  },
  nodeActionBar: {
    style: '样式',
    editName: '编辑名称',
    editLink: '编辑链接',
    addLink: '添加链接',
    editNotes: '编辑备注',
    addNotes: '添加备注',
    startConnector: 'Start connector',
    delete: '删除'
  },
  quickAddNodePopover: {
    add: '添加',
    rectangle: '分组'
  },
  zoomControls: {
    zoomOut: '缩小',
    zoomIn: '放大',
    fitToScreen: '适应屏幕',
    help: '帮助 (F1)'
  },
  labelSettings: {
    description: '配置标签显示设置',
    expandButtonPadding: '展开按钮内边距',
    expandButtonPaddingDesc: '展开按钮可见时的底部内边距（防止文字重叠）'
  },
  iconSelectionControls: {
    close: '关闭',
    importIcons: '导入图标',
    isometricLabel: '作为等轴测处理（3D 视图）',
    isometricHint: '取消勾选以使用平面图标（Logo、UI 元素）',
    dragHint: '您可以将下方任意项目拖放到画布上。'
  },
  searchbox: {
    placeholder: '搜索图标'
  },
  exportImageDialog: {
    title: '导出为图片',
    compatibilityTitle: '浏览器兼容性提示',
    compatibilityMessage:
      '为获得最佳效果，请使用 Chrome 或 Edge。Firefox 目前与导出功能存在兼容性问题。',
    cropInstruction: '点击并拖动以选择要导出的区域',
    options: '选项',
    showGrid: '显示网格',
    expandDescriptions: '展开描述',
    cropToContent: '裁剪到内容',
    backgroundColor: '背景颜色',
    transparentBackground: '透明背景',
    exportQuality: '导出质量（DPI）',
    custom: '自定义',
    recrop: '重新裁剪',
    cropApplied: '裁剪已成功应用',
    applyCrop: '应用裁剪',
    clearSelection: '清除选择',
    cropHint: '选择要裁剪的区域，或取消勾选「裁剪到内容」以使用完整图片',
    cancel: '取消',
    downloadSvg: '下载为 SVG',
    downloadPng: '下载为 PNG',
    error: '无法导出图片'
  },
  toolMenu: {
    undo: '撤销',
    redo: '重做',
    select: '选择',
    lassoSelect: '套索选择',
    freehandLasso: '自由套索',
    pan: '平移',
    addItem: '添加项目',
    rectangle: '矩形',
    connector: '连接器',
    text: '文本'
  },
  quickIconSelector: {
    searchPlaceholder: '搜索图标（按 Enter 选择）',
    recentlyUsed: '最近使用',
    searchResults: '搜索结果（{count} 个图标）',
    noIconsFound: '未找到匹配 "{term}" 的图标',
    helpSearch: '使用方向键导航 • Enter 选择 • 双击选择并关闭',
    helpBrowse: '输入以搜索 • 点击分类展开 • 双击选择并关闭'
  }
};

export default locale;
