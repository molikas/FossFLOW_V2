import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Ceci est un texte d'exemple"
  },
  mainMenu: {
    undo: "Annuler",
    redo: "Refaire",
    new: "New diagram",
    open: "Ouvrir",
    exportJson: "Exporter en JSON",
    exportCompactJson: "Exporter en JSON compact",
    exportImage: "Exporter en image",
    clearCanvas: "Effacer le canevas",
    settings: "Paramètres",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Raccourcis clavier et aide",
    close: "Fermer",
    keyboardShortcuts: "Raccourcis clavier",
    mouseInteractions: "Interactions de la souris",
    action: "Action",
    shortcut: "Raccourci",
    method: "Méthode",
    description: "Description",
    note: "Remarque :",
    noteContent: "Les raccourcis clavier sont désactivés lors de la saisie dans les champs de saisie, les zones de texte ou les éléments modifiables pour éviter les conflits.",
    // Keyboard shortcuts
    undoAction: "Annuler",
    undoDescription: "Annuler la dernière action",
    redoAction: "Refaire",
    redoDescription: "Refaire la dernière action annulée",
    redoAltAction: "Refaire (Alternatif)",
    redoAltDescription: "Raccourci alternatif pour refaire",
    helpAction: "Aide",
    helpDescription: "Ouvrir la boîte de dialogue d'aide avec les raccourcis clavier",
    zoomInAction: "Zoom avant",
    zoomInShortcut: "Molette de la souris vers le haut",
    zoomInDescription: "Effectuer un zoom avant sur le canevas",
    zoomOutAction: "Zoom arrière",
    zoomOutShortcut: "Molette de la souris vers le bas",
    zoomOutDescription: "Effectuer un zoom arrière sur le canevas",
    panCanvasAction: "Déplacer le canevas",
    panCanvasShortcut: "Clic gauche + Glisser",
    panCanvasDescription: "Déplacer le canevas en mode déplacement",
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
    selectToolAction: "Outil de sélection",
    selectToolShortcut: "Cliquer sur le bouton Sélectionner",
    selectToolDescription: "Passer en mode sélection",
    panToolAction: "Outil de déplacement",
    panToolShortcut: "Cliquer sur le bouton Déplacer",
    panToolDescription: "Passer en mode déplacement pour déplacer le canevas",
    addItemAction: "Ajouter un élément",
    addItemShortcut: "Cliquer sur le bouton Ajouter un élément",
    addItemDescription: "Ouvrir le sélecteur d'icônes pour ajouter de nouveaux éléments",
    drawRectangleAction: "Dessiner un rectangle",
    drawRectangleShortcut: "Cliquer sur le bouton Rectangle",
    drawRectangleDescription: "Passer en mode dessin de rectangles",
    createConnectorAction: "Créer un connecteur",
    createConnectorShortcut: "Cliquer sur le bouton Connecteur",
    createConnectorDescription: "Passer en mode connecteur",
    addTextAction: "Ajouter du texte",
    addTextShortcut: "Cliquer sur le bouton Texte",
    addTextDescription: "Créer une nouvelle zone de texte",
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
    tipCreatingConnectors: "Astuce : Créer des connecteurs",
    tipConnectorTools: "Astuce : Outils de connecteurs",
    clickInstructionStart: "Cliquez",
    clickInstructionMiddle: "sur le premier nœud ou point, puis",
    clickInstructionEnd: "sur le deuxième nœud ou point pour créer une connexion.",
    nowClickTarget: "Cliquez maintenant sur la cible pour terminer la connexion.",
    dragStart: "Glissez",
    dragEnd: "du premier nœud au deuxième nœud pour créer une connexion.",
    rerouteStart: "Pour réacheminer un connecteur,",
    rerouteMiddle: "cliquez avec le bouton gauche",
    rerouteEnd: "sur n'importe quel point le long de la ligne du connecteur et glissez pour créer ou déplacer des points d'ancrage."
  },
  lassoHintTooltip: {
    tipLasso: "Astuce : Sélection au lasso",
    tipFreehandLasso: "Astuce : Sélection au lasso libre",
    lassoDragStart: "Cliquez et glissez",
    lassoDragEnd: "pour dessiner une zone de sélection rectangulaire autour des éléments que vous souhaitez sélectionner.",
    freehandDragStart: "Cliquez et glissez",
    freehandDragMiddle: "pour dessiner une",
    freehandDragEnd: "forme libre",
    freehandComplete: "autour des éléments. Relâchez pour sélectionner tous les éléments à l'intérieur de la forme.",
    moveStart: "Une fois sélectionnés,",
    moveMiddle: "cliquez à l'intérieur de la sélection",
    moveEnd: "et glissez pour déplacer tous les éléments sélectionnés ensemble."
  },
  importHintTooltip: {
    title: "Importer des diagrammes",
    instructionStart: "Pour importer des diagrammes, cliquez sur le",
    menuButton: "bouton de menu",
    instructionMiddle: "(☰) dans le coin supérieur gauche, puis sélectionnez",
    openButton: "\"Ouvrir\"",
    instructionEnd: "pour charger vos fichiers de diagramme."
  },
  connectorRerouteTooltip: {
    title: "Astuce : Réacheminer les connecteurs",
    instructionStart: "Une fois vos connecteurs placés, vous pouvez les réacheminer comme vous le souhaitez.",
    instructionSelect: "Sélectionnez le connecteur",
    instructionMiddle: "d'abord, puis",
    instructionClick: "cliquez sur le chemin du connecteur",
    instructionAnd: "et",
    instructionDrag: "glissez",
    instructionEnd: "pour le modifier !"
  },
  connectorEmptySpaceTooltip: {
    message: "Pour connecter ce connecteur à un nœud,",
    instruction: "cliquez avec le bouton gauche sur l'extrémité du connecteur et faites-le glisser vers le nœud souhaité."
  },
  settings: {
    zoom: {
      description: "Configurer le comportement du zoom lors de l'utilisation de la molette de la souris.",
      zoomToCursor: "Zoom sur le curseur",
      zoomToCursorDesc: "Lorsqu'il est activé, le zoom est centré sur la position du curseur de la souris. Lorsqu'il est désactivé, le zoom est centré sur le canevas."
    },
    hotkeys: {
      title: "Paramètres des raccourcis",
      profile: "Profil de raccourcis",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Aucun raccourci",
      tool: "Outil",
      hotkey: "Raccourci",
      toolSelect: "Sélectionner",
      toolPan: "Déplacer",
      toolAddItem: "Ajouter un élément",
      toolRectangle: "Rectangle",
      toolConnector: "Connecteur",
      toolText: "Texte",
      note: "Remarque : Les raccourcis fonctionnent lorsque vous ne tapez pas dans des champs de texte",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "Paramètres de déplacement",
      mousePanOptions: "Options de déplacement à la souris",
      emptyAreaClickPan: "Cliquer et glisser sur une zone vide",
      middleClickPan: "Clic du milieu et glisser",
      rightClickPan: "Clic droit et glisser",
      ctrlClickPan: "Ctrl + clic et glisser",
      altClickPan: "Alt + clic et glisser",
      keyboardPanOptions: "Options de déplacement au clavier",
      arrowKeys: "Touches fléchées",
      wasdKeys: "Touches WASD",
      ijklKeys: "Touches IJKL",
      keyboardPanSpeed: "Vitesse de déplacement au clavier",
      note: "Remarque : Les options de déplacement fonctionnent en plus de l'outil de déplacement dédié"
    },
    connector: {
      title: "Paramètres des connecteurs",
      connectionMode: "Mode de création de connexion",
      clickMode: "Mode clic (Recommandé)",
      clickModeDesc: "Cliquez sur le premier nœud, puis cliquez sur le deuxième nœud pour créer une connexion",
      dragMode: "Mode glisser",
      dragModeDesc: "Cliquez et glissez du premier nœud au deuxième nœud",
      note: "Remarque : Vous pouvez modifier ce paramètre à tout moment. Le mode sélectionné sera utilisé lorsque l'outil de connecteur est actif."
    },
    iconPacks: {
      title: "Gestion des Packs d'Icônes",
      lazyLoading: "Activer le Chargement Paresseux",
      lazyLoadingDesc: "Charger les packs d'icônes à la demande pour un démarrage plus rapide",
      availablePacks: "Packs d'Icônes Disponibles",
      coreIsoflow: "Core Isoflow (Toujours Chargé)",
      alwaysEnabled: "Toujours activé",
      awsPack: "Icônes AWS",
      gcpPack: "Icônes Google Cloud",
      azurePack: "Icônes Azure",
      kubernetesPack: "Icônes Kubernetes",
      loading: "Chargement...",
      loaded: "Chargé",
      notLoaded: "Non chargé",
      iconCount: "{count} icônes",
      lazyLoadingDisabledNote: "Le chargement paresseux est désactivé. Tous les packs d'icônes sont chargés au démarrage.",
      note: "Les packs d'icônes peuvent être activés ou désactivés selon vos besoins. Les packs désactivés réduiront l'utilisation de la mémoire et amélioreront les performances."
    }
  },
  lazyLoadingWelcome: {
    title: "Nouvelle Fonctionnalité : Chargement Paresseux !",
    message: "Salut ! Suite à une forte demande, nous avons implémenté le Chargement Paresseux des icônes, donc maintenant si vous voulez activer des packs d'icônes non standard, vous pouvez les activer dans la section 'Configuration'.",
    configPath: "Cliquez sur l'icône Hamburger",
    configPath2: "en haut à gauche pour accéder à la Configuration.",
    canDisable: "Vous pouvez désactiver ce comportement si vous le souhaitez.",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "Détails",
    style: "Style",
    notes: "Notes",
    notesModified: "Notes ●",
    close: "Fermer",
    openLink: "Ouvrir le lien",
    caption: "Légende",
    noCaption: "Aucune légende."
  },
  nodeInfoTab: {
    name: "Nom",
    namePlaceholder: "Nom du nœud…",
    removeLink: "Supprimer le lien",
    addLink: "Ajouter un lien au nom",
    linkPlaceholder: "https://…",
    caption: "Légende",
    captionHint: "Affiché sur le canevas sous le nom du nœud",
    openLink: "Ouvrir le lien"
  },
  nodeStyleTab: {
    icon: "Icône",
    close: "Fermer",
    change: "Modifier…",
    iconSize: "Taille de l'icône",
    labelFontSize: "Taille de police de l'étiquette",
    labelColor: "Couleur de l'étiquette",
    labelHeight: "Hauteur de l'étiquette"
  },
  connectorControls: {
    close: "Fermer",
    labels: "Étiquettes"
  },
  textBoxControls: {
    close: "Fermer",
    text: "Texte",
    textSize: "Taille du texte",
    textColor: "Couleur du texte",
    alignment: "Alignement"
  },
  rectangleControls: {
    close: "Fermer",
    color: "Couleur",
    useCustomColor: "Utiliser une couleur personnalisée"
  },
  labelColorPicker: {
    customColor: "Couleur personnalisée"
  },
  deleteButton: {
    delete: "Supprimer"
  },
  nodeActionBar: {
    style: "Style",
    editName: "Modifier le nom",
    editLink: "Modifier le lien",
    addLink: "Ajouter un lien",
    editNotes: "Modifier les notes",
    addNotes: "Ajouter des notes",
    startConnector: "Start connector",
    delete: "Supprimer"
  },
  quickAddNodePopover: {
    add: "Ajouter",
    group: "Groupe"
  },
  zoomControls: {
    zoomOut: "Zoom arrière",
    zoomIn: "Zoom avant",
    fitToScreen: "Ajuster à l'écran",
    help: "Aide (F1)"
  },
  labelSettings: {
    description: "Configurer les paramètres d'affichage des étiquettes",
    expandButtonPadding: "Rembourrage du bouton développer",
    expandButtonPaddingDesc: "Rembourrage inférieur lorsque le bouton développer est visible (évite le chevauchement du texte)"
  },
  iconSelectionControls: {
    close: "Fermer",
    importIcons: "Importer des icônes",
    isometricLabel: "Traiter comme isométrique (vue 3D)",
    isometricHint: "Décocher pour les icônes plates (logos, éléments UI)",
    dragHint: "Vous pouvez faire glisser et déposer n'importe quel élément ci-dessous sur le canevas."
  },
  searchbox: {
    placeholder: "Rechercher des icônes"
  },
  exportImageDialog: {
    title: "Exporter en image",
    compatibilityTitle: "Avis de compatibilité du navigateur",
    compatibilityMessage: "Pour de meilleurs résultats, veuillez utiliser Chrome ou Edge. Firefox a actuellement des problèmes de compatibilité avec la fonction d'exportation.",
    cropInstruction: "Cliquez et faites glisser pour sélectionner la zone à exporter",
    options: "Options",
    showGrid: "Afficher la grille",
    expandDescriptions: "Développer les descriptions",
    cropToContent: "Recadrer au contenu",
    backgroundColor: "Couleur de fond",
    transparentBackground: "Fond transparent",
    exportQuality: "Qualité d'exportation (DPI)",
    custom: "Personnalisé",
    recrop: "Recadrer à nouveau",
    cropApplied: "Recadrage appliqué avec succès",
    applyCrop: "Appliquer le recadrage",
    clearSelection: "Effacer la sélection",
    cropHint: "Sélectionnez une zone à recadrer, ou décochez \"Recadrer au contenu\" pour utiliser l'image entière",
    cancel: "Annuler",
    downloadSvg: "Télécharger en SVG",
    downloadPng: "Télécharger en PNG",
    error: "Impossible d'exporter l'image"
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
