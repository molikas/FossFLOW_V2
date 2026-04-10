import { LocaleProps } from '../types/isoflowProps';

const locale: LocaleProps = {
  common: {
    exampleText: "Bu bir örnek metindir"
  },
  mainMenu: {
    undo: "Geri Al",
    redo: "Yinele", 
    new: "New diagram",
    open: "Aç",
    exportJson: "JSON olarak dışa aktar",
    exportCompactJson: "Kompakt JSON olarak dışa aktar",
    exportImage: "Görüntü olarak dışa aktar",
    clearCanvas: "Tuvali temizle",
    settings: "Ayarlar",
    gitHub: "GitHub"
  },
  helpDialog: {
    title: "Klavye Kısayolları ve Yardım",
    close: "Kapat",
    keyboardShortcuts: "Klavye Kısayolları",
    mouseInteractions: "Fare Etkileşimleri",
    action: "Eylem",
    shortcut: "Kısayol",
    method: "Yöntem",
    description: "Açıklama",
    note: "Not:",
    noteContent: "Klavye kısayolları, çakışmaları önlemek için giriş alanlarında, metin alanlarında veya içerik düzenlenebilir öğelerde yazarken devre dışı bırakılır.",
    // Keyboard shortcuts
    undoAction: "Geri Al",
    undoDescription: "Son eylemi geri al",
    redoAction: "Yinele",
    redoDescription: "Son geri alınan eylemi yinele",
    redoAltAction: "Yinele (Alternatif)",
    redoAltDescription: "Alternatif yineleme kısayolu",
    helpAction: "Yardım",
    helpDescription: "Klavye kısayollarıyla yardım diyaloğunu aç",
    zoomInAction: "Yakınlaştır",
    zoomInShortcut: "Fare Tekerleği Yukarı",
    zoomInDescription: "Tuvalde yakınlaştır",
    zoomOutAction: "Uzaklaştır",
    zoomOutShortcut: "Fare Tekerleği Aşağı",
    zoomOutDescription: "Tuvalden uzaklaştır",
    panCanvasAction: "Tuvali Kaydır",
    panCanvasShortcut: "Sol tık + Sürükle",
    panCanvasDescription: "Kaydırma modundayken tuvali kaydır",
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
    selectToolAction: "Seçim Aracı",
    selectToolShortcut: "Seç butonuna tıkla",
    selectToolDescription: "Seçim moduna geç",
    panToolAction: "Kaydırma Aracı",
    panToolShortcut: "Kaydır butonuna tıkla",
    panToolDescription: "Tuvali hareket ettirmek için kaydırma moduna geç",
    addItemAction: "Öğe Ekle",
    addItemShortcut: "Öğe ekle butonuna tıkla",
    addItemDescription: "Yeni öğeler eklemek için simge seçiciyi aç",
    drawRectangleAction: "Dikdörtgen Çiz",
    drawRectangleShortcut: "Dikdörtgen butonuna tıkla",
    drawRectangleDescription: "Dikdörtgen çizim moduna geç",
    createConnectorAction: "Bağlayıcı Oluştur",
    createConnectorShortcut: "Bağlayıcı butonuna tıkla",
    createConnectorDescription: "Bağlayıcı moduna geç",
    addTextAction: "Metin Ekle",
    addTextShortcut: "Metin butonuna tıkla",
    addTextDescription: "Yeni bir metin kutusu oluştur",
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
    tipCreatingConnectors: "İpucu: Bağlayıcı Oluşturma",
    tipConnectorTools: "İpucu: Bağlayıcı Araçları",
    clickInstructionStart: "İlk düğüme veya noktaya",
    clickInstructionMiddle: "tıklayın, ardından",
    clickInstructionEnd: "bir bağlantı oluşturmak için ikinci düğüme veya noktaya tıklayın.",
    nowClickTarget: "Bağlantıyı tamamlamak için şimdi hedefe tıklayın.",
    dragStart: "Bir bağlantı oluşturmak için",
    dragEnd: "ilk düğümden ikinci düğüme sürükleyin.",
    rerouteStart: "Bir bağlayıcıyı yeniden yönlendirmek için,",
    rerouteMiddle: "bağlayıcı çizgisi boyunca herhangi bir noktaya",
    rerouteEnd: "sol tıklayın ve çapa noktaları oluşturmak veya taşımak için sürükleyin."
  },
  lassoHintTooltip: {
    tipLasso: "İpucu: Lasso Seçimi",
    tipFreehandLasso: "İpucu: Serbest El Lasso Seçimi",
    lassoDragStart: "Seçmek istediğiniz öğelerin etrafına",
    lassoDragEnd: "dikdörtgen bir seçim kutusu çizmek için tıklayın ve sürükleyin.",
    freehandDragStart: "Tıklayın ve sürükleyin",
    freehandDragMiddle: "bir",
    freehandDragEnd: "serbest form şekli",
    freehandComplete: "öğelerin etrafına çizin. Şeklin içindeki tüm öğeleri seçmek için bırakın.",
    moveStart: "Seçildikten sonra,",
    moveMiddle: "seçimin içine tıklayın",
    moveEnd: "ve tüm seçili öğeleri birlikte taşımak için sürükleyin."
  },
  importHintTooltip: {
    title: "Diyagramları İçe Aktar",
    instructionStart: "Diyagramları içe aktarmak için, sol üst köşedeki",
    menuButton: "menü butonuna",
    instructionMiddle: "(☰) tıklayın, ardından",
    openButton: "\"Aç\"",
    instructionEnd: "seçerek diyagram dosyalarınızı yükleyin."
  },
  connectorRerouteTooltip: {
    title: "İpucu: Bağlayıcıları Yeniden Yönlendir",
    instructionStart: "Bağlayıcılarınız yerleştirildikten sonra istediğiniz gibi yeniden yönlendirebilirsiniz.",
    instructionSelect: "Önce bağlayıcıyı seçin",
    instructionMiddle: ", ardından",
    instructionClick: "bağlayıcı yoluna tıklayın",
    instructionAnd: "ve",
    instructionDrag: "değiştirmek için sürükleyin",
    instructionEnd: "!"
  },
  connectorEmptySpaceTooltip: {
    message: "Bu bağlayıcıyı bir düğüme bağlamak için,",
    instruction: "bağlayıcının ucuna sol tıklayın ve istediğiniz düğüme sürükleyin."
  },
  settings: {
    zoom: {
      description: "Fare tekerleği kullanılırken yakınlaştırma davranışını yapılandırın.",
      zoomToCursor: "İmlece Yakınlaştır",
      zoomToCursorDesc: "Etkinleştirildiğinde, fare imleci konumunda merkezlenmiş olarak yakınlaştırır/uzaklaştırır. Devre dışı bırakıldığında, yakınlaştırma tuvalde merkezlenir."
    },
    hotkeys: {
      title: "Kısayol Tuşu Ayarları",
      profile: "Kısayol Tuşu Profili",
      profileQwerty: "QWERTY (Q, W, E, R, T, Y)",
      profileSmnrct: "SMNRCT (S, M, N, R, C, T)",
      profileNone: "Kısayol Tuşu Yok",
      tool: "Araç",
      hotkey: "Kısayol Tuşu",
      toolSelect: "Seç",
      toolPan: "Kaydır",
      toolAddItem: "Öğe Ekle",
      toolRectangle: "Dikdörtgen",
      toolConnector: "Bağlayıcı",
      toolText: "Metin",
      note: "Not: Kısayol tuşları metin alanlarında yazarken çalışmaz",
      fixedShortcutsTitle: "Fixed Shortcuts (Always Active)",
      fixedCut: "Cut",
      fixedCopy: "Copy",
      fixedPaste: "Paste",
      fixedUndo: "Undo",
      fixedRedo: "Redo"
    },
    pan: {
      title: "Kaydırma Ayarları",
      mousePanOptions: "Fare Kaydırma Seçenekleri",
      emptyAreaClickPan: "Boş alanda tıkla ve sürükle",
      middleClickPan: "Orta tık ve sürükle",
      rightClickPan: "Sağ tık ve sürükle",
      ctrlClickPan: "Ctrl + tık ve sürükle",
      altClickPan: "Alt + tık ve sürükle",
      keyboardPanOptions: "Klavye Kaydırma Seçenekleri",
      arrowKeys: "Ok tuşları",
      wasdKeys: "WASD tuşları",
      ijklKeys: "IJKL tuşları",
      keyboardPanSpeed: "Klavye Kaydırma Hızı",
      note: "Not: Kaydırma seçenekleri özel Kaydırma aracına ek olarak çalışır"
    },
    connector: {
      title: "Bağlayıcı Ayarları",
      connectionMode: "Bağlantı Oluşturma Modu",
      clickMode: "Tıklama Modu (Önerilen)",
      clickModeDesc: "Bir bağlantı oluşturmak için ilk düğüme tıklayın, ardından ikinci düğüme tıklayın",
      dragMode: "Sürükleme Modu",
      dragModeDesc: "İlk düğümden ikinci düğüme tıklayın ve sürükleyin",
      note: "Not: Bu ayarı istediğiniz zaman değiştirebilirsiniz. Seçilen mod, Bağlayıcı aracı etkin olduğunda kullanılacaktır."
    },
    iconPacks: {
      title: "Simge Paketi Yönetimi",
      lazyLoading: "Tembel Yükleme Etkinleştir",
      lazyLoadingDesc: "Daha hızlı başlangıç için simge paketlerini isteğe bağlı yükle",
      availablePacks: "Mevcut Simge Paketleri",
      coreIsoflow: "Çekirdek Isoflow (Her Zaman Yüklenir)",
      alwaysEnabled: "Her zaman etkin",
      awsPack: "AWS Simgeleri",
      gcpPack: "Google Cloud Simgeleri",
      azurePack: "Azure Simgeleri",
      kubernetesPack: "Kubernetes Simgeleri",
      loading: "Yükleniyor...",
      loaded: "Yüklendi",
      notLoaded: "Yüklenmedi",
      iconCount: "{count} simge",
      lazyLoadingDisabledNote: "Tembel yükleme devre dışı. Tüm simge paketleri başlangıçta yüklenir.",
      note: "Simge paketleri ihtiyaçlarınıza göre etkinleştirilebilir veya devre dışı bırakılabilir. Devre dışı bırakılan paketler bellek kullanımını azaltır ve performansı artırır."
    }
  },
  lazyLoadingWelcome: {
    title: "Yeni Özellik: Tembel Yükleme!",
    message: "Merhaba! Popüler talep üzerine, simgelerin Tembel Yüklenmesini uyguladık, bu yüzden artık standart olmayan simge paketlerini etkinleştirmek isterseniz bunları 'Yapılandırma' bölümünde etkinleştirebilirsiniz.",
    configPath: "Yapılandırmaya erişmek için",
    configPath2: "sol üstteki Hamburger simgesine tıklayın.",
    canDisable: "İsterseniz bu davranışı devre dışı bırakabilirsiniz.",
    signature: "-Stan"
  },
  viewTabs: {
    addPage: "Add page",
    deletePage: "Delete page",
    renameDiagram: "Rename diagram"
  },
  nodePanel: {
    details: "Ayrıntılar",
    style: "Stil",
    notes: "Notlar",
    notesModified: "Notlar ●",
    close: "Kapat",
    openLink: "Bağlantıyı aç",
    caption: "Altyazı",
    noCaption: "Altyazı yok."
  },
  nodeInfoTab: {
    name: "Ad",
    namePlaceholder: "Düğüm adı…",
    removeLink: "Bağlantıyı kaldır",
    addLink: "Ada bağlantı ekle",
    linkPlaceholder: "https://…",
    caption: "Altyazı",
    captionHint: "Tuvalde düğüm adının altında gösterilir",
    openLink: "Bağlantıyı aç"
  },
  nodeStyleTab: {
    icon: "Simge",
    close: "Kapat",
    change: "Değiştir…",
    iconSize: "Simge boyutu",
    labelFontSize: "Etiket yazı tipi boyutu",
    labelColor: "Etiket rengi",
    labelHeight: "Etiket yüksekliği"
  },
  connectorControls: {
    close: "Kapat",
    labels: "Etiketler"
  },
  textBoxControls: {
    close: "Kapat",
    text: "Metin",
    textSize: "Metin boyutu",
    textColor: "Metin rengi",
    alignment: "Hizalama"
  },
  rectangleControls: {
    close: "Kapat",
    color: "Renk",
    useCustomColor: "Özel Renk Kullan"
  },
  labelColorPicker: {
    customColor: "Özel renk"
  },
  deleteButton: {
    delete: "Sil"
  },
  nodeActionBar: {
    style: "Stil",
    editName: "Adı düzenle",
    editLink: "Bağlantıyı düzenle",
    addLink: "Bağlantı ekle",
    editNotes: "Notları düzenle",
    addNotes: "Not ekle",
    startConnector: "Start connector",
    delete: "Sil"
  },
  quickAddNodePopover: {
    add: "Ekle",
    rectangle: "Grup"
  },
  zoomControls: {
    zoomOut: "Uzaklaştır",
    zoomIn: "Yaklaştır",
    fitToScreen: "Ekrana sığdır",
    help: "Yardım (F1)"
  },
  labelSettings: {
    description: "Etiket görüntüleme ayarlarını yapılandır",
    expandButtonPadding: "Genişlet düğmesi dolgusu",
    expandButtonPaddingDesc: "Genişlet düğmesi görünür olduğunda alt dolgu (metin üst üste binmesini önler)"
  },
  iconSelectionControls: {
    close: "Kapat",
    importIcons: "Simge İçe Aktar",
    isometricLabel: "İzometrik olarak değerlendir (3D görünüm)",
    isometricHint: "Düz simgeler için işareti kaldırın (logolar, UI öğeleri)",
    dragHint: "Aşağıdaki herhangi bir öğeyi tuvale sürükleyip bırakabilirsiniz."
  },
  searchbox: {
    placeholder: "Simge ara"
  },
  exportImageDialog: {
    title: "Resim olarak dışa aktar",
    compatibilityTitle: "Tarayıcı Uyumluluk Bildirimi",
    compatibilityMessage: "En iyi sonuçlar için lütfen Chrome veya Edge kullanın. Firefox şu anda dışa aktarma özelliğiyle uyumluluk sorunları yaşamaktadır.",
    cropInstruction: "Dışa aktarmak istediğiniz alanı seçmek için tıklayıp sürükleyin",
    options: "Seçenekler",
    showGrid: "Kılavuzu göster",
    expandDescriptions: "Açıklamaları genişlet",
    cropToContent: "İçeriğe göre kırp",
    backgroundColor: "Arka plan rengi",
    transparentBackground: "Şeffaf arka plan",
    exportQuality: "Dışa Aktarma Kalitesi (DPI)",
    custom: "Özel",
    recrop: "Yeniden kırp",
    cropApplied: "Kırpma başarıyla uygulandı",
    applyCrop: "Kırpmayı Uygula",
    clearSelection: "Seçimi Temizle",
    cropHint: "Kırpılacak bir alan seçin veya tam resmi kullanmak için \"İçeriğe göre kırp\" seçeneğinin işaretini kaldırın",
    cancel: "İptal",
    downloadSvg: "SVG olarak indir",
    downloadPng: "PNG olarak indir",
    error: "Resim dışa aktarılamadı"
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
