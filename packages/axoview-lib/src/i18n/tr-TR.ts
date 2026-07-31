import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Bu bir örnek metindir'
  },
  rightSidebar: {
    collapsePanel: 'Paneli daralt',
    emptyState:
      'Özelliklerini görüntülemek için bir düğüm, bağlayıcı veya şekil seçin'
  },
  helpDialog: {
    title: 'Klavye Kısayolları ve Yardım',
    close: 'Kapat',
    keyboardShortcuts: 'Klavye Kısayolları',
    mouseInteractions: 'Fare Etkileşimleri',
    action: 'Eylem',
    shortcut: 'Kısayol',
    method: 'Yöntem',
    description: 'Açıklama',
    note: 'Not:',
    noteContent:
      'Klavye kısayolları, çakışmaları önlemek için giriş alanlarında, metin alanlarında veya içerik düzenlenebilir öğelerde yazarken devre dışı bırakılır.',
    // Keyboard shortcuts
    undoAction: 'Geri Al',
    undoDescription: 'Son eylemi geri al',
    redoAction: 'Yinele',
    redoDescription: 'Son geri alınan eylemi yinele',
    redoAltAction: 'Yinele (Alternatif)',
    redoAltDescription: 'Alternatif yineleme kısayolu',
    helpAction: 'Yardım',
    helpDescription: 'Klavye kısayollarıyla yardım diyaloğunu aç',
    zoomInAction: 'Yakınlaştır',
    zoomInShortcut: 'Fare Tekerleği Yukarı',
    zoomInDescription: 'Tuvalde yakınlaştır',
    zoomOutAction: 'Uzaklaştır',
    zoomOutShortcut: 'Fare Tekerleği Aşağı',
    zoomOutDescription: 'Tuvalden uzaklaştır',
    panCanvasAction: 'Tuvali Kaydır',
    panCanvasShortcut: 'Sol tık + Sürükle',
    panCanvasDescription: 'Kaydırma modundayken tuvali kaydır',
    togglePanToolAction: 'Kaydırma Aracını Aç/Kapat',
    togglePanToolShortcut: 'Sağ tık',
    togglePanToolDescription:
      'Kaydırma modunu aç/kapat; seçim moduna dönmek için sol tık',
    lassoSelectAction: 'Lasso Seçimi',
    lassoSelectShortcut: 'Sol tık + Sürükle (boş alan)',
    lassoSelectDescription:
      'Birden fazla öğe seçmek için dikdörtgen bir seçim kutusu çiz',
    deselectAction: 'Seçimi Kaldır',
    deselectShortcut: 'Sol tık (boş alan)',
    deselectDescription: 'Mevcut seçimi kaldır ve seçim moduna dön',
    // Mouse interactions
    selectToolAction: 'Seçim Aracı',
    selectToolShortcut: 'Seç butonuna tıkla',
    selectToolDescription: 'Seçim moduna geç',
    panToolAction: 'Kaydırma Aracı',
    panToolShortcut: 'Kaydır butonuna tıkla',
    panToolDescription: 'Tuvali hareket ettirmek için kaydırma moduna geç',
    addItemAction: 'Öğe Ekle',
    addItemShortcut: 'Öğe ekle butonuna tıkla',
    addItemDescription: 'Yeni öğeler eklemek için simge seçiciyi aç',
    drawRectangleAction: 'Dikdörtgen Çiz',
    drawRectangleShortcut: 'Dikdörtgen butonuna tıkla',
    drawRectangleDescription: 'Dikdörtgen çizim moduna geç',
    createConnectorAction: 'Bağlayıcı Oluştur',
    createConnectorShortcut: 'Bağlayıcı butonuna tıkla',
    createConnectorDescription: 'Bağlayıcı moduna geç',
    addTextAction: 'Metin Ekle',
    addTextShortcut: 'Metin butonuna tıkla',
    addTextDescription: 'Yeni bir metin kutusu oluştur',
    deleteSelectedAction: 'Seçilenleri Sil',
    deleteSelectedShortcut: "Delete (Mac'te Backspace)",
    deleteSelectedDescription:
      'Seçili öğeyi veya lasso seçimindeki tüm öğeleri sil; geri al/yinele desteklenir',
    cutAction: 'Kes',
    cutDescription:
      'Seçili öğeleri panoya kes — öğeler kaldırılır ve başka yere yapıştırılabilir; geri al/yinele desteklenir',
    copyAction: 'Kopyala',
    copyDescription: 'Seçili öğeleri panoya kopyala',
    pasteAction: 'Yapıştır',
    pasteDescription:
      'Pano öğelerini fare konumuna yapıştır; üst üste binmeyi önlemek için kaydırılır',
    // D10 — Select all row
    selectAllAction: 'Tümünü seç',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Etkin görünümdeki tüm görünür, kilitli olmayan öğeleri seç (öğeler, dikdörtgenler, metin kutuları, bağlayıcılar + ara noktaları)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Yeniden adlandır',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Seçili öğeyi veya diyagramı yerinde yeniden adlandır',
    keyAddItemAction: 'Öğe ekle / Öğeler',
    keyAddItemShortcut: 'N',
    keyAddItemDescription:
      'Yeni bir öğe yerleştirmek için Öğeler panelini aç/kapat',
    keyConnectorAction: 'Bağlayıcı',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Bağlayıcı aracına geç',
    keyLassoAction: 'Kement seçimi',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Kement seçim aracına geç',
    keySelectAction: 'Seç',
    keySelectShortcut: 'S',
    keySelectDescription: 'Seçim aracına geç',
    // D10 — mouse interactions
    miSelectAction: 'Seç',
    miSelectMethod: 'Sol tıklama',
    miSelectDescription:
      'Bir öğeyi seçmek için tıklayın (vurgular ve kayan eylem çubuğunu gösterir). Seçimi temizlemek için boş tuvale tıklayın.',
    miOpenDetailsAction: 'Ayrıntıları aç',
    miOpenDetailsMethod: 'Çift tıklama',
    miOpenDetailsDescription:
      'Ayrıntılar panelini açmak için bir öğeye çift tıklayın — bağlam menüsündeki «Ayrıntılar…» girişiyle aynı.',
    miToggleSelectionAction: 'Seçimi değiştir',
    miToggleSelectionMethod: 'Ctrl/Cmd + Sol tıklama',
    miToggleSelectionDescription:
      'Bir öğeyi çoklu seçime ekleyin veya çıkarın; bir bağlayıcı, ara noktalarıyla birlikte değişir.',
    miPanAction: 'Kaydır',
    miPanMethod: 'Sağ tıklama + sürükle',
    miPanDescription:
      'Tuvali kaydırmak için sağ düğmeyi basılı tutup sürükleyin. Orta düğmeyle sürükleme de kaydırır; ok tuşları onu iter.',
    miContextMenuAction: 'Bağlam menüsü',
    miContextMenuMethod: 'Sağ tıklama (dokunma)',
    miContextMenuDescription:
      'Sürüklemeden yapılan sağ tıklama bağlam menüsünü açar — bir öğenin üzerinde öğe menüsü veya boş alanın üzerinde tuval menüsü. Dokunmatik ekranda uzun basın.',
    miRemoveWaypointAction: 'Ara noktayı kaldır',
    miRemoveWaypointMethod: 'Alt + Sol tıklama',
    miRemoveWaypointDescription:
      'Bir bağlayıcı ara noktasını çıkarmak için Alt+tıklayın (önce bağlayıcıyı seçmeye gerek yok); uç bağlantı noktaları korunur.',
    miZoomAction: 'Yakınlaştır',
    miZoomMethod: 'Fare tekerleği',
    miZoomDescription: 'İmlece doğru yakınlaştırmak için kaydırın.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'İpucu: Bağlayıcı Oluşturma',
    tipConnectorTools: 'İpucu: Bağlayıcı Araçları',
    clickInstructionStart: 'İlk düğüme veya noktaya',
    clickInstructionMiddle: 'tıklayın, ardından',
    clickInstructionEnd:
      'bir bağlantı oluşturmak için ikinci düğüme veya noktaya tıklayın.',
    nowClickTarget: 'Bağlantıyı tamamlamak için şimdi hedefe tıklayın.',
    dragStart: 'Bir bağlantı oluşturmak için',
    dragEnd: 'ilk düğümden ikinci düğüme sürükleyin.',
    rerouteStart: 'Bir bağlayıcıyı yeniden yönlendirmek için,',
    rerouteMiddle: 'bağlayıcı çizgisi boyunca herhangi bir noktaya',
    rerouteEnd:
      'sol tıklayın ve çapa noktaları oluşturmak veya taşımak için sürükleyin.'
  },
  lassoHintTooltip: {
    tipLasso: 'İpucu: Lasso Seçimi',
    tipFreehandLasso: 'İpucu: Serbest El Lasso Seçimi',
    lassoDragStart: 'Seçmek istediğiniz öğelerin etrafına',
    lassoDragEnd:
      'dikdörtgen bir seçim kutusu çizmek için tıklayın ve sürükleyin.',
    freehandDragStart: 'Tıklayın ve sürükleyin',
    freehandDragMiddle: 'bir',
    freehandDragEnd: 'serbest form şekli',
    freehandComplete:
      'öğelerin etrafına çizin. Şeklin içindeki tüm öğeleri seçmek için bırakın.',
    moveStart: 'Seçildikten sonra,',
    moveMiddle: 'seçimin içine tıklayın',
    moveEnd: 've tüm seçili öğeleri birlikte taşımak için sürükleyin.'
  },
  importHintTooltip: {
    title: 'Diyagramları İçe Aktar',
    instructionStart: 'Diyagramları içe aktarmak için, sol üst köşedeki',
    menuButton: 'menü butonuna',
    instructionMiddle: '(☰) tıklayın, ardından',
    openButton: '"Aç"',
    instructionEnd: 'seçerek diyagram dosyalarınızı yükleyin.'
  },
  connectorRerouteTooltip: {
    title: 'İpucu: Bağlayıcıları Yeniden Yönlendir',
    instructionStart:
      'Bağlayıcılarınız yerleştirildikten sonra istediğiniz gibi yeniden yönlendirebilirsiniz.',
    instructionSelect: 'Önce bağlayıcıyı seçin',
    instructionMiddle: ', ardından',
    instructionClick: 'bağlayıcı yoluna tıklayın',
    instructionAnd: 've',
    instructionDrag: 'değiştirmek için sürükleyin',
    instructionEnd: '!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Bu bağlayıcıyı bir düğüme bağlamak için,',
    instruction:
      'bağlayıcının ucuna sol tıklayın ve istediğiniz düğüme sürükleyin.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Ayarlar',
    close: 'Kapat',
    canvas: 'Tuval',
    language: 'Dil',
    about: 'Hakkında',
    languageDescription: 'Uygulama arayüzü için görüntüleme dilini seçin.',
    zoomSection: 'Yakınlaştırma',
    labelsSection: 'Etiketler',
    zoom: {
      description:
        'Fare tekerleği kullanılırken yakınlaştırma davranışını yapılandırın.',
      zoomToCursor: 'İmlece Yakınlaştır',
      zoomToCursorDesc:
        'Etkinleştirildiğinde, fare imleci konumunda merkezlenmiş olarak yakınlaştırır/uzaklaştırır. Devre dışı bırakıldığında, yakınlaştırma tuvalde merkezlenir.'
    },
    hotkeys: {
      title: 'Kısayol Tuşu Ayarları',
      profile: 'Kısayol Tuşu Profili',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Kısayol Tuşu Yok',
      tool: 'Araç',
      hotkey: 'Kısayol Tuşu',
      toolSelect: 'Seç',
      toolPan: 'Kaydır',
      toolAddItem: 'Öğe Ekle',
      toolRectangle: 'Dikdörtgen',
      toolConnector: 'Bağlayıcı',
      toolText: 'Metin',
      note: 'Not: Kısayol tuşları metin alanlarında yazarken çalışmaz',
      fixedShortcutsTitle: 'Sabit Kısayollar (Her Zaman Aktif)',
      fixedCut: 'Kes',
      fixedCopy: 'Kopyala',
      fixedPaste: 'Yapıştır',
      fixedUndo: 'Geri Al',
      fixedRedo: 'Yinele'
    },
    connector: {
      title: 'Bağlayıcı Ayarları',
      connectionMode: 'Bağlantı Oluşturma Modu',
      clickMode: 'Tıklama Modu (Önerilen)',
      clickModeDesc:
        'Bir bağlantı oluşturmak için ilk düğüme tıklayın, ardından ikinci düğüme tıklayın',
      dragMode: 'Sürükleme Modu',
      dragModeDesc: 'İlk düğümden ikinci düğüme tıklayın ve sürükleyin',
      note: 'Not: Bu ayarı istediğiniz zaman değiştirebilirsiniz. Seçilen mod, Bağlayıcı aracı etkin olduğunda kullanılacaktır.'
    },
    iconPacks: {
      title: 'Simge Paketi Yönetimi',
      lazyLoading: 'Tembel Yükleme Etkinleştir',
      lazyLoadingDesc:
        'Daha hızlı başlangıç için simge paketlerini isteğe bağlı yükle',
      availablePacks: 'Mevcut Simge Paketleri',
      coreIsoflow: 'Çekirdek Axoview (Her Zaman Yüklenir)',
      alwaysEnabled: 'Her zaman etkin',
      awsPack: 'AWS Simgeleri',
      gcpPack: 'Google Cloud Simgeleri',
      azurePack: 'Azure Simgeleri',
      kubernetesPack: 'Kubernetes Simgeleri',
      loading: 'Yükleniyor...',
      loaded: 'Yüklendi',
      notLoaded: 'Yüklenmedi',
      iconCount: '{count} simge',
      lazyLoadingDisabledNote:
        'Tembel yükleme devre dışı. Tüm simge paketleri başlangıçta yüklenir.',
      note: 'Simge paketleri ihtiyaçlarınıza göre etkinleştirilebilir veya devre dışı bırakılabilir. Devre dışı bırakılan paketler bellek kullanımını azaltır ve performansı artırır.'
    }
  },
  lazyLoadingWelcome: {
    title: "Axoview'a Hoş Geldiniz",
    message:
      'Axoview, güzel izometrik ve 2D diyagramlar için ücretsiz, açık kaynaklı bir araçtır — bulut, ağ ve altyapı mimarisi; AWS, GCP, Azure ve Kubernetes simgeleri dahili olarak gelir. Tamamı tarayıcınızda çalışır, yerel olarak ya da kendi Google Drive hesabınıza kaydeder. Açık kaynaklı FossFLOW ve Isoflow projeleri üzerine inşa edilmiştir ve etkin biçimde geliştirilmektedir — kaynak koduna ulaşmak, hata bildirmek veya özellik istemek için: github.com/molikas/axoview.',
    configPath: 'Yapılandırmaya erişmek için',
    configPath2: 'sol üstteki Hamburger simgesine tıklayın.',
    canDisable: 'İsterseniz bu davranışı devre dışı bırakabilirsiniz.',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Sayfa ekle',
    deletePage: 'Sayfayı sil',
    renameDiagram: 'Diyagramı yeniden adlandır',
    addPageDisabled: 'Sayfa sınırına ulaşıldı (5)'
  },
  nodePanel: {
    notes: 'Notlar',
    close: 'Kapat'
  },
  nodeDeck: {
    metadata: 'Meta veriler',
    name: 'Ad',
    namePlaceholder: 'Düğüm adı…',
    label: 'Etiket',
    labelPlaceholder: 'Şekilde gösterilen etiket…'
  },
  connectorControls: {
    metadata: 'Meta veriler',
    close: 'Kapat',
    notes: 'Notlar',
    name: 'Ad',
    namePlaceholder: 'Kenar etiketi…',
    labels: 'Etiketler',
    addLabel: 'Etiket ekle',
    noLabels: 'Henüz etiket yok.',
    labelN: 'Etiket {count}',
    positionHint:
      'Konumlandırmak için tuvalde bir etiketi sürükleyin; metin boyutu ve rengi için üst çubuğu kullanın.',
    line: 'Çizgi',
    line1: 'Çizgi 1',
    line2: 'Çizgi 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Ara veya bağlantı yapıştır',
    linkCopy: 'Bağlantıyı kopyala',
    linkCopied: 'Kopyalandı',
    linkEdit: 'Bağlantıyı düzenle',
    linkRemove: 'Bağlantıyı kaldır',
    placeholder: 'Bir şeyler yazın',
    metadata: 'Meta veriler',
    notes: 'Notlar',
    close: 'Kapat',
    name: 'Ad',
    namePlaceholder: 'Eleman adı…'
  },
  rectangleControls: {
    metadata: 'Meta veriler',
    notes: 'Notlar',
    close: 'Kapat',
    name: 'Ad',
    namePlaceholder: 'Eleman adı…'
  },
  topBarStyleControls: {
    mixed: 'Karışık',
    rotate90: '90° döndür',
    noColor: 'Renk yok',
    pickColorFromScreen: 'Ekrandan renk seç',
    customColor: 'Özel renk',
    textSize: 'Metin boyutu',
    lineSpacing: 'Satır aralığı',
    alignment: 'Hizalama',
    alignmentDisabled: 'Metni hizalamak için bir metin kutusu seçin',
    alignLeft: 'Sola hizala',
    alignCenter: 'Ortala',
    alignRight: 'Sağa hizala',
    alignTop: 'Üste hizala',
    alignMiddle: 'Ortaya hizala',
    alignBottom: 'Alta hizala',
    textColor: 'Metin rengi',
    textColorDisabled:
      'Metin rengini ayarlamak için bir düğüm, metin kutusu, etiket veya bağlantı etiketi seçin',
    textSizeDisabled:
      'Metin boyutunu ayarlamak için bir düğüm, metin kutusu, etiket veya bağlantı etiketi seçin',
    labelSizeAllSelected: 'Etiket boyutu (tümü seçili)',
    textColorAllSelected: 'Metin rengi (tümü seçili)',
    armedToolPlaceFirst:
      'Yeni öğe varsayılan stili kullanır — önce yerleştirin, sonra burada biçimlendirin',
    decreaseLabelSize: 'Etiket boyutunu küçült',
    increaseLabelSize: 'Etiket boyutunu büyüt',
    labelSize: 'Etiket boyutu',
    decreaseSize: 'Boyutu küçült',
    increaseSize: 'Boyutu büyüt',
    stepAll: 'Tümünü ayarla',
    size: 'Boyut',
    bold: 'Kalın',
    italic: 'İtalik',
    underline: 'Altı çizili',
    strikethrough: 'Üstü çizili',
    format: 'Kalın / italik / altı çizili / üstü çizili',
    formatDisabled:
      'Metni biçimlendirmek için bir düğüm, metin kutusu, etiket veya bağlantı etiketi seçin',
    lists: 'Listeler',
    listsDisabled: 'Listeleri kullanmak için bir metin kutusu seçin',
    bulletList: 'Madde işaretli liste',
    numberedList: 'Numaralı liste',
    background: 'Arka plan rengi',
    backgroundDisabled:
      'Arka plan rengini ayarlamak için bir dikdörtgen, etiket veya metin kutusu seçin',
    opacity: 'Saydamlık',
    border: 'Kenarlık',
    borderDisabled:
      'Kenarlığını ayarlamak için bir dikdörtgen veya metin kutusu seçin',
    lineStyle: 'Çizgi stili',
    width: 'Kalınlık',
    borderColor: 'Kenarlık rengi',
    link: 'Bağlantı',
    linkDisabled: 'Bağlantı eklemek için bir düğüm, bağlantı veya etiket seçin',
    linkSelection: 'Seçili metne bağlantı ekle',
    linkDisabledTextBox: 'Bağlantı eklemek için düzenlerken metin seçin',
    linkToWeb: 'Web bağlantısı',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Diyagrama bağlantı',
    searchDiagrams: 'Diyagram ara…',
    openLinkedDiagram: 'Bağlantılı diyagramı aç',
    showLabel: 'Etiketi göster',
    hideLabel: 'Etiketi gizle',
    showHideLabelDisabled:
      'Etiketini göstermek veya gizlemek için bir düğüm veya bağlantı seçin',
    changeIconBulk: 'Simge değiştirme aynı anda tek bir düğüme uygulanır',
    changeIcon: 'Simgeyi değiştir',
    changeIconDisabled: 'Simgesini değiştirmek için bir düğüm seçin',
    connectionColorPredraw: 'Çizeceğiniz sonraki bağlantının rengi',
    connectionColor: 'Bağlantı rengi',
    connectionColorDisabled:
      'Rengini ayarlamak için bir bağlantı (veya bağlayıcı aracı) seçin',
    lineOptionsPredraw: 'Çizeceğiniz sonraki bağlantının çizgi stili',
    lineOptions: 'Çizgi seçenekleri',
    lineOptionsDisabled:
      'Çizgi seçeneklerini ayarlamak için bir bağlantı (veya bağlayıcı aracı) seçin',
    lineType: 'Çizgi türü',
    showArrow: 'Oku göster',
    showDottedLine: 'Noktalı çizgiyi göster'
  },
  quickAddNodePopover: {
    add: 'Ekle',
    rectangle: 'Grup'
  },
  zoomControls: {
    zoomOut: 'Uzaklaştır',
    zoomIn: 'Yaklaştır',
    fitToScreen: 'Ekrana sığdır',
    keepLabelsReadable: 'Etiketleri okunabilir tut',
    help: 'Yardım (F1)',
    selected: '{count} seçildi'
  },
  modeHints: {
    connector: 'Bağlamak için öğeler arasında sürükleyin • İptal için Esc',
    textBox: 'Metin kutusu yerleştirmek için tıklayın • İptal için Esc',
    label: 'Etiket yerleştirmek için tıklayın • İptal için Esc',
    rectangle: 'Dikdörtgen çizmek için sürükleyin • İptal için Esc'
  },
  previewLayerSwitcher: {
    layers: 'Katmanlar',
    showLayer: 'Katmanı göster',
    hideLayer: 'Katmanı gizle',
    solo: 'Solo',
    unsolo: 'Solodan çık'
  },
  previewLabelsToggle: {
    hideLabels: 'Etiketleri gizle',
    showLabels: 'Etiketleri göster'
  },
  annotationPalette: {
    pen: 'Açıklama',
    select: 'Seç',
    draw: 'Çiz',
    shapes: 'Şekiller',
    pencil: 'Kalem',
    highlighter: 'Fosforlu kalem',
    line: 'Çizgi',
    arrow: 'Ok',
    rectangle: 'Dikdörtgen',
    ellipse: 'Elips',
    eraser: 'Silgi',
    undo: 'Geri al',
    redo: 'Yinele',
    clear: 'Tümünü temizle'
  },
  viewModeInfoPopover: {
    close: 'Kapat'
  },
  labelSettings: {
    description: 'Etiket görüntüleme ayarlarını yapılandır',
    expandButtonPadding: 'Genişlet düğmesi dolgusu',
    expandButtonPaddingDesc:
      'Genişlet düğmesi görünür olduğunda alt dolgu (metin üst üste binmesini önler)',
    // D13
    currentValue: 'Geçerli: {value} tema birimi'
  },
  iconSelectionControls: {
    close: 'Kapat',
    importIcons: 'Simge İçe Aktar',
    addMoreIcons: 'Daha fazla simge ekle',
    isometricLabel: 'İzometrik olarak değerlendir (3D görünüm)',
    isometricHint: 'Düz simgeler için işareti kaldırın (logolar, UI öğeleri)',
    dragHint:
      'Aşağıdaki herhangi bir öğeyi tuvale sürükleyip bırakabilirsiniz.',
    aiPromptTooltip: 'Yapay zekâ ile simge oluştur',
    aiPromptTitle: 'Yapay zekâ ile izometrik simgeler oluştur',
    aiPromptBody:
      "Bu istemi bir görsel üreten yapay zekâya yapıştırın. 'my object' kısmını ihtiyacınızla değiştirin ve oluşturulan PNG'yi içe aktarın.",
    aiPromptCopy: 'İstemi kopyala',
    aiPromptCopied: 'Kopyalandı'
  },
  searchbox: {
    placeholder: 'Simge ara'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Resim olarak dışa aktar',
    compatibilityTitle: 'Tarayıcı Uyumluluk Bildirimi',
    compatibilityMessage:
      'En iyi sonuçlar için lütfen Chrome veya Edge kullanın. Firefox şu anda dışa aktarma özelliğiyle uyumluluk sorunları yaşamaktadır.',
    cropInstruction:
      'Dışa aktarmak istediğiniz alanı seçmek için tıklayıp sürükleyin',
    options: 'Seçenekler',
    showGrid: 'Kılavuzu göster',
    showLabels: 'Etiketleri göster',
    screenshotPreset: 'Ekran görüntüsü (önerilen)',
    scaleClamped:
      'Dışa aktarma boyutu, tarayıcı görüntü sınırına uyacak şekilde küçültüldü:',
    cropToContent: 'İçeriğe göre kırp',
    backgroundColor: 'Arka plan rengi',
    transparentBackground: 'Şeffaf arka plan',
    exportQuality: 'Dışa Aktarma Kalitesi (DPI)',
    custom: 'Özel',
    recrop: 'Yeniden kırp',
    cropApplied: 'Kırpma başarıyla uygulandı',
    applyCrop: 'Kırpmayı Uygula',
    clearSelection: 'Seçimi Temizle',
    cropHint:
      'Kırpılacak bir alan seçin veya tam resmi kullanmak için "İçeriğe göre kırp" seçeneğinin işaretini kaldırın',
    cancel: 'İptal',
    downloadSvg: 'SVG olarak indir',
    downloadPng: 'PNG olarak indir',
    error: 'Resim dışa aktarılamadı'
  },
  toolMenu: {
    label: 'Label',
    undo: 'Geri Al',
    redo: 'Yinele',
    select: 'Seç',
    lassoSelect: 'Lasso seçimi',
    freehandLasso: 'Serbest lasso',
    pan: 'Kaydır',
    addItem: 'Öğe ekle',
    rectangle: 'Dikdörtgen',
    connector: 'Bağlayıcı',
    text: 'Metin',
    common: 'Ortak',
    // D5
    switchTo2D: '2D görünüme geç',
    switchToIsometric: 'İzometrik görünüme geç',
    clickMode: 'Tıkla',
    dragMode: 'Sürükle'
  },
  quickIconSelector: {
    recentlyUsed: 'SON KULLANILAN',
    searchResults: 'ARAMA SONUÇLARI ({count} simge)',
    noIconsFound: '"{term}" ile eşleşen simge bulunamadı'
  },
  canvasContextMenu: {
    addNote: 'Not ekle',
    addLabel: 'Etiket ekle',
    details: 'Ayrıntılar…',
    rename: 'Yeniden adlandır',
    cut: 'Kes',
    copy: 'Kopyala',
    paste: 'Yapıştır',
    duplicate: 'Çoğalt',
    bringForward: 'Öne getir',
    sendBackward: 'Arkaya gönder',
    bringToFront: 'En öne getir',
    sendToBack: 'En arkaya gönder',
    assignToLayer: 'Katmana ata',
    fitToText: 'Metne sığdır',
    snapToGrid: 'Izgaraya yapıştır',
    unsnapFromGrid: 'Izgaradan ayır',
    disableCollision: 'Çakışmayı devre dışı bırak',
    enableCollision: 'Çakışmayı etkinleştir',
    delete: 'Sil',
    addItem: 'Öğe ekle',
    selectAll: 'Tümünü seç',
    enableSnapToGrid: 'Izgaraya yapışmayı etkinleştir',
    disableSnapToGrid: 'Izgaraya yapışmayı devre dışı bırak',
    itemsSelectedOne: '{count} öğe seçildi',
    itemsSelectedOther: '{count} öğe seçildi',
    deleteItemsOne: '{count} öğeyi sil',
    deleteItemsOther: '{count} öğeyi sil',
    removeFromLayer: 'Katmandan kaldır',
    noLayers: 'Katman yok — Katmanlar panelinden bir tane ekleyin'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Dosya gezgini',
    elements: 'Öğeler',
    layers: 'Katmanlar',
    settings: 'Ayarlar',
    openDiagramFirst: 'önce bir diyagram açın veya oluşturun',
    collapsePanel: 'Paneli daralt'
  },
  // D8 — LayersPanel
  layersPanel: {
    header: 'Katmanlar',
    addLayer: 'Katman ekle',
    deleteSelectedLayer: 'Seçili katmanı sil',
    noLayersYet: 'Henüz katman yok. Eklemek için + simgesine tıklayın.',
    unassigned: 'Atanmamış ({count})',
    dropToUnassign: 'Atamayı kaldırmak için öğeleri buraya bırakın',
    layerN: 'Katman {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} öğe kopyalandı',
    copiedOther: '{count} öğe kopyalandı',
    cutOne: '{count} öğe kesildi',
    cutOther: '{count} öğe kesildi',
    pastedOne: '{count} öğe yapıştırıldı',
    pastedOther: '{count} öğe yapıştırıldı',
    nothingToPaste: 'Yapıştırılacak bir şey yok',
    routingConnectors:
      'Yapıştırılıyor… bağlayıcılar yönlendiriliyor ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Sayfa {count}'
  }
};

export default locale;
