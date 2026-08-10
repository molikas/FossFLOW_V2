import { LocaleProps } from '../types/axoviewProps';

const locale: LocaleProps = {
  webglUnsupported: {
    title: "This browser can't display diagrams",
    body: 'Axoview renders diagrams on your GPU using WebGL2, which this browser does not support.',
    hint: 'Update to a recent version of Chrome, Edge, Firefox, or Safari — or turn on hardware acceleration — then reload.'
  },
  common: {
    exampleText: 'Ini adalah contoh teks'
  },
  rightSidebar: {
    collapsePanel: 'Ciutkan panel',
    emptyState: 'Pilih node, konektor, atau bentuk untuk melihat propertinya'
  },
  helpDialog: {
    title: 'Pintasan Keyboard & Bantuan',
    close: 'Tutup',
    keyboardShortcuts: 'Pintasan Keyboard',
    mouseInteractions: 'Interaksi Mouse',
    action: 'Aksi',
    shortcut: 'Pintasan',
    method: 'Metode',
    description: 'Deskripsi',
    note: 'Catatan:',
    noteContent:
      'Pintasan keyboard dinonaktifkan saat mengetik di bidang input, area teks, atau elemen yang dapat diedit untuk mencegah konflik.',
    // Keyboard shortcuts
    undoAction: 'Batalkan',
    undoDescription: 'Batalkan aksi terakhir',
    redoAction: 'Ulangi',
    redoDescription: 'Ulangi aksi terakhir yang dibatalkan',
    redoAltAction: 'Ulangi (Alternatif)',
    redoAltDescription: 'Pintasan alternatif untuk mengulangi',
    helpAction: 'Bantuan',
    helpDescription: 'Buka dialog bantuan dengan pintasan keyboard',
    zoomInAction: 'Perbesar',
    zoomInShortcut: 'Roda Mouse Naik',
    zoomInDescription: 'Perbesar kanvas',
    zoomOutAction: 'Perkecil',
    zoomOutShortcut: 'Roda Mouse Turun',
    zoomOutDescription: 'Perkecil kanvas',
    panCanvasAction: 'Geser Kanvas',
    panCanvasShortcut: 'Klik Kiri + Seret',
    panCanvasDescription: 'Geser kanvas saat dalam mode Geser',
    togglePanToolAction: 'Aktifkan/Nonaktifkan Alat Geser',
    togglePanToolShortcut: 'Klik kanan',
    togglePanToolDescription:
      'Aktifkan/nonaktifkan mode geser; klik kiri untuk kembali ke mode pilih',
    lassoSelectAction: 'Seleksi Lasso',
    lassoSelectShortcut: 'Klik Kiri + Seret (area kosong)',
    lassoSelectDescription:
      'Gambar kotak seleksi persegi panjang untuk memilih beberapa item',
    deselectAction: 'Batal Pilih',
    deselectShortcut: 'Klik Kiri (area kosong)',
    deselectDescription: 'Batalkan pilihan saat ini dan kembali ke mode pilih',
    // Mouse interactions
    selectToolAction: 'Alat Pilih',
    selectToolShortcut: 'Klik tombol Pilih',
    selectToolDescription: 'Beralih ke mode pemilihan',
    panToolAction: 'Alat Geser',
    panToolShortcut: 'Klik tombol Geser',
    panToolDescription: 'Beralih ke mode geser untuk memindahkan kanvas',
    addItemAction: 'Tambah Item',
    addItemShortcut: 'Klik tombol Tambah item',
    addItemDescription: 'Buka pemilih ikon untuk menambahkan item baru',
    drawRectangleAction: 'Gambar Persegi Panjang',
    drawRectangleShortcut: 'Klik tombol Persegi Panjang',
    drawRectangleDescription: 'Beralih ke mode menggambar persegi panjang',
    createConnectorAction: 'Buat Konektor',
    createConnectorShortcut: 'Klik tombol Konektor',
    createConnectorDescription: 'Beralih ke mode konektor',
    addTextAction: 'Tambah Teks',
    addTextShortcut: 'Klik tombol Teks',
    addTextDescription: 'Buat kotak teks baru',
    deleteSelectedAction: 'Hapus yang Dipilih',
    deleteSelectedShortcut: 'Delete (Backspace di Mac)',
    deleteSelectedDescription:
      'Hapus item yang dipilih atau semua item dalam seleksi lasso; mendukung undo/redo',
    cutAction: 'Potong',
    cutDescription:
      'Potong item yang dipilih ke clipboard — item dihapus dan dapat ditempel di tempat lain; mendukung undo/redo',
    copyAction: 'Salin',
    copyDescription: 'Salin item yang dipilih ke clipboard',
    pasteAction: 'Tempel',
    pasteDescription:
      'Tempel item clipboard di posisi mouse; digeser untuk menghindari tumpang tindih',
    // D10 — Select all row
    selectAllAction: 'Pilih semua',
    selectAllShortcut: 'Ctrl+A',
    selectAllDescription:
      'Pilih semua item yang terlihat dan tidak terkunci di tampilan aktif (item, persegi panjang, kotak teks, konektor + titik jalurnya)',
    // D10 — tool-activation keys (ADR 0022 §6)
    keyRenameAction: 'Ganti nama',
    keyRenameShortcut: 'F2',
    keyRenameDescription:
      'Ganti nama item atau diagram terpilih secara langsung',
    keyAddItemAction: 'Tambah item / Elemen',
    keyAddItemShortcut: 'N',
    keyAddItemDescription: 'Alihkan panel Elemen untuk menempatkan item baru',
    keyConnectorAction: 'Konektor',
    keyConnectorShortcut: 'C',
    keyConnectorDescription: 'Beralih ke alat konektor',
    keyLassoAction: 'Pilih laso',
    keyLassoShortcut: 'L',
    keyLassoDescription: 'Beralih ke alat pilih laso',
    keySelectAction: 'Pilih',
    keySelectShortcut: 'S',
    keySelectDescription: 'Beralih ke alat pilih',
    // D10 — mouse interactions
    miSelectAction: 'Pilih',
    miSelectMethod: 'Klik kiri',
    miSelectDescription:
      'Klik item untuk memilihnya (menyorotnya dan menampilkan bilah tindakan mengambang). Klik kanvas kosong untuk menghapus pilihan.',
    miOpenDetailsAction: 'Buka detail',
    miOpenDetailsMethod: 'Klik ganda',
    miOpenDetailsDescription:
      'Klik ganda item untuk membuka panel detailnya — sama seperti entri «Detail…» di menu konteks.',
    miToggleSelectionAction: 'Alihkan pilihan',
    miToggleSelectionMethod: 'Ctrl/Cmd + Klik kiri',
    miToggleSelectionDescription:
      'Tambah atau hapus item dari pilihan ganda; konektor dialihkan bersama titik jalurnya.',
    miPanAction: 'Geser',
    miPanMethod: 'Klik kanan + seret',
    miPanDescription:
      'Tahan tombol kanan dan seret untuk menggeser kanvas. Seret klik tengah juga menggeser; tombol panah menggesernya.',
    miContextMenuAction: 'Menu konteks',
    miContextMenuMethod: 'Klik kanan (ketuk)',
    miContextMenuDescription:
      'Klik kanan tanpa menyeret membuka menu konteks — menu item di atas item, atau menu kanvas di atas ruang kosong. Pada layar sentuh, tekan lama.',
    miRemoveWaypointAction: 'Hapus titik jalur',
    miRemoveWaypointMethod: 'Alt + Klik kiri',
    miRemoveWaypointDescription:
      'Alt+klik titik jalur konektor untuk menghapusnya (tanpa perlu memilih konektor terlebih dahulu); jangkar ujung dipertahankan.',
    miZoomAction: 'Zoom',
    miZoomMethod: 'Roda gulir',
    miZoomDescription: 'Gulir untuk memperbesar ke arah kursor.'
  },
  connectorHintTooltip: {
    tipCreatingConnectors: 'Tip: Membuat Konektor',
    tipConnectorTools: 'Tip: Alat Konektor',
    clickInstructionStart: 'Klik',
    clickInstructionMiddle: 'pada node atau titik pertama, lalu',
    clickInstructionEnd: 'pada node atau titik kedua untuk membuat koneksi.',
    nowClickTarget: 'Sekarang klik pada target untuk menyelesaikan koneksi.',
    dragStart: 'Seret',
    dragEnd: 'dari node pertama ke node kedua untuk membuat koneksi.',
    rerouteStart: 'Untuk mengubah rute konektor,',
    rerouteMiddle: 'klik kiri',
    rerouteEnd:
      'pada titik mana pun di sepanjang garis konektor dan seret untuk membuat atau memindahkan titik jangkar.'
  },
  lassoHintTooltip: {
    tipLasso: 'Tip: Seleksi Lasso',
    tipFreehandLasso: 'Tip: Seleksi Lasso Bebas',
    lassoDragStart: 'Klik dan seret',
    lassoDragEnd:
      'untuk menggambar kotak seleksi persegi panjang di sekitar item yang ingin Anda pilih.',
    freehandDragStart: 'Klik dan seret',
    freehandDragMiddle: 'untuk menggambar',
    freehandDragEnd: 'bentuk bebas',
    freehandComplete:
      'di sekitar item. Lepas untuk memilih semua item di dalam bentuk.',
    moveStart: 'Setelah dipilih,',
    moveMiddle: 'klik di dalam seleksi',
    moveEnd: 'dan seret untuk memindahkan semua item yang dipilih bersama.'
  },
  importHintTooltip: {
    title: 'Impor Diagram',
    instructionStart: 'Untuk mengimpor diagram, klik',
    menuButton: 'tombol menu',
    instructionMiddle: '(☰) di pojok kiri atas, lalu pilih',
    openButton: '"Buka"',
    instructionEnd: 'untuk memuat file diagram Anda.'
  },
  connectorRerouteTooltip: {
    title: 'Tip: Ubah Rute Konektor',
    instructionStart:
      'Setelah konektor Anda ditempatkan, Anda dapat mengubah rutenya sesuai keinginan.',
    instructionSelect: 'Pilih konektor',
    instructionMiddle: 'terlebih dahulu, lalu',
    instructionClick: 'klik pada jalur konektor',
    instructionAnd: 'dan',
    instructionDrag: 'seret',
    instructionEnd: 'untuk mengubahnya!'
  },
  connectorEmptySpaceTooltip: {
    message: 'Untuk menghubungkan konektor ini ke node,',
    instruction:
      'klik kiri pada ujung konektor dan seret ke node yang diinginkan.'
  },
  settings: {
    // D3 — SettingsDialog chrome
    title: 'Pengaturan',
    close: 'Tutup',
    canvas: 'Kanvas',
    language: 'Bahasa',
    about: 'Tentang',
    languageDescription: 'Pilih bahasa tampilan untuk antarmuka aplikasi.',
    zoomSection: 'Zoom',
    labelsSection: 'Label',
    zoom: {
      description: 'Konfigurasi perilaku zoom saat menggunakan roda mouse.',
      zoomToCursor: 'Zoom ke Kursor',
      zoomToCursorDesc:
        'Saat diaktifkan, zoom masuk/keluar terpusat pada posisi kursor mouse. Saat dinonaktifkan, zoom terpusat pada kanvas.'
    },
    hotkeys: {
      title: 'Pengaturan Pintasan',
      profile: 'Profil Pintasan',
      profileQwerty: 'QWERTY (Q, W, E, R, T, Y)',
      profileSmnrct: 'SMNRCT (S, M, N, R, C, T)',
      profileNone: 'Tidak Ada Pintasan',
      tool: 'Alat',
      hotkey: 'Pintasan',
      toolSelect: 'Pilih',
      toolPan: 'Geser',
      toolAddItem: 'Tambah Item',
      toolRectangle: 'Persegi Panjang',
      toolConnector: 'Konektor',
      toolText: 'Teks',
      note: 'Catatan: Pintasan berfungsi saat tidak mengetik di bidang teks',
      fixedShortcutsTitle: 'Pintasan Tetap (Selalu Aktif)',
      fixedCut: 'Potong',
      fixedCopy: 'Salin',
      fixedPaste: 'Tempel',
      fixedUndo: 'Batalkan',
      fixedRedo: 'Ulangi'
    },
    connector: {
      title: 'Pengaturan Konektor',
      connectionMode: 'Mode Pembuatan Koneksi',
      clickMode: 'Mode Klik (Direkomendasikan)',
      clickModeDesc:
        'Klik node pertama, lalu klik node kedua untuk membuat koneksi',
      dragMode: 'Mode Seret',
      dragModeDesc: 'Klik dan seret dari node pertama ke node kedua',
      note: 'Catatan: Anda dapat mengubah pengaturan ini kapan saja. Mode yang dipilih akan digunakan saat alat Konektor aktif.'
    },
    iconPacks: {
      title: 'Manajemen Paket Ikon',
      lazyLoading: 'Aktifkan Lazy Loading',
      lazyLoadingDesc:
        'Muat paket ikon sesuai permintaan untuk startup yang lebih cepat',
      availablePacks: 'Paket Ikon Tersedia',
      coreIsoflow: 'Core Isoflow (Selalu Dimuat)',
      alwaysEnabled: 'Selalu diaktifkan',
      awsPack: 'Ikon AWS',
      gcpPack: 'Ikon Google Cloud',
      azurePack: 'Ikon Azure',
      kubernetesPack: 'Ikon Kubernetes',
      loading: 'Memuat...',
      loaded: 'Dimuat',
      notLoaded: 'Tidak dimuat',
      iconCount: '{count} ikon',
      lazyLoadingDisabledNote:
        'Lazy loading dinonaktifkan. Semua paket ikon dimuat saat startup.',
      note: 'Paket ikon dapat diaktifkan atau dinonaktifkan sesuai kebutuhan Anda. Paket yang dinonaktifkan akan mengurangi penggunaan memori dan meningkatkan performa.'
    }
  },
  lazyLoadingWelcome: {
    title: 'Selamat Datang di Axoview',
    message:
      'Axoview adalah alat gratis dan open-source untuk membuat diagram isometrik dan 2D yang indah — arsitektur cloud, jaringan, dan infrastruktur, lengkap dengan ikon AWS, GCP, Azure, dan Kubernetes yang sudah tersedia. Semuanya berjalan di peramban Anda, tersimpan secara lokal atau di Google Drive Anda sendiri. Dibangun di atas proyek open-source FossFLOW dan Isoflow serta terus dikembangkan — temukan kode sumber, laporkan bug, atau ajukan permintaan fitur di github.com/molikas/axoview.',
    configPath: 'Klik pada ikon Hamburger',
    configPath2: 'di kiri atas untuk mengakses Konfigurasi.',
    canDisable: 'Anda dapat menonaktifkan perilaku ini jika diinginkan.',
    signature: '— Axoview'
  },
  viewTabs: {
    addPage: 'Tambah halaman',
    deletePage: 'Hapus halaman',
    renameDiagram: 'Ganti nama diagram',
    addPageDisabled: 'Batas halaman tercapai (5)'
  },
  nodePanel: {
    notes: 'Catatan',
    close: 'Tutup'
  },
  nodeDeck: {
    metadata: 'Metadata',
    name: 'Nama',
    namePlaceholder: 'Nama node…',
    label: 'Label',
    labelPlaceholder: 'Label yang ditampilkan pada bentuk…'
  },
  connectorControls: {
    metadata: 'Metadata',
    close: 'Tutup',
    notes: 'Catatan',
    name: 'Nama',
    namePlaceholder: 'Label sisi…',
    labels: 'Label',
    addLabel: 'Tambah label',
    noLabels: 'Belum ada label.',
    labelN: 'Label {count}',
    positionHint:
      'Seret label di kanvas untuk memposisikannya; gunakan bilah atas untuk ukuran teks dan warnanya.',
    line: 'Garis',
    line1: 'Garis 1',
    line2: 'Garis 2'
  },
  textBoxControls: {
    linkSearchPlaceholder: 'Cari atau tempel tautan',
    linkCopy: 'Salin tautan',
    linkCopied: 'Disalin',
    linkEdit: 'Edit tautan',
    linkRemove: 'Hapus tautan',
    placeholder: 'Ketik sesuatu',
    metadata: 'Metadata',
    notes: 'Catatan',
    close: 'Tutup',
    name: 'Nama',
    namePlaceholder: 'Nama elemen…'
  },
  rectangleControls: {
    metadata: 'Metadata',
    notes: 'Catatan',
    close: 'Tutup',
    name: 'Nama',
    namePlaceholder: 'Nama elemen…'
  },
  topBarStyleControls: {
    mixed: 'Campuran',
    rotate90: 'Putar 90°',
    noColor: 'Tanpa warna',
    pickColorFromScreen: 'Ambil warna dari layar',
    customColor: 'Warna kustom',
    textSize: 'Ukuran teks',
    lineSpacing: 'Spasi baris',
    alignment: 'Perataan',
    alignmentDisabled: 'Pilih kotak teks untuk meratakan teks',
    alignLeft: 'Rata kiri',
    alignCenter: 'Rata tengah',
    alignRight: 'Rata kanan',
    alignTop: 'Rata atas',
    alignMiddle: 'Rata tengah vertikal',
    alignBottom: 'Rata bawah',
    textColor: 'Warna teks',
    textColorDisabled:
      'Pilih node, kotak teks, label, atau label koneksi untuk mengatur warna teks',
    textSizeDisabled:
      'Pilih node, kotak teks, label, atau label koneksi untuk mengatur ukuran teks',
    labelSizeAllSelected: 'Ukuran label (semua terpilih)',
    textColorAllSelected: 'Warna teks (semua terpilih)',
    armedToolPlaceFirst:
      'Elemen baru memakai gaya bawaan — letakkan dulu, lalu atur gayanya di sini',
    decreaseLabelSize: 'Perkecil ukuran label',
    increaseLabelSize: 'Perbesar ukuran label',
    labelSize: 'Ukuran label',
    decreaseSize: 'Perkecil ukuran',
    increaseSize: 'Perbesar ukuran',
    stepAll: 'Ubah semua',
    size: 'Ukuran',
    bold: 'Tebal',
    italic: 'Miring',
    underline: 'Garis bawah',
    strikethrough: 'Coret',
    format: 'Tebal / miring / garis bawah / coret',
    formatDisabled:
      'Pilih node, kotak teks, label, atau label koneksi untuk memformat teks',
    lists: 'Daftar',
    listsDisabled: 'Pilih kotak teks untuk menggunakan daftar',
    bulletList: 'Daftar poin',
    numberedList: 'Daftar bernomor',
    background: 'Warna latar belakang',
    backgroundDisabled:
      'Pilih persegi panjang, label, atau kotak teks untuk mengatur warna latar belakangnya',
    opacity: 'Opasitas',
    border: 'Batas',
    borderDisabled:
      'Pilih persegi panjang atau kotak teks untuk mengatur bingkainya',
    lineStyle: 'Gaya garis',
    width: 'Tebal',
    borderColor: 'Warna batas',
    link: 'Tautan',
    linkDisabled: 'Pilih node, koneksi, atau label untuk menambahkan tautan',
    linkSelection: 'Tautkan teks yang dipilih',
    linkDisabledTextBox: 'Pilih teks saat mengedit untuk menambahkan tautan',
    linkToWeb: 'Tautan ke web',
    webLinkPlaceholder: 'https://…',
    linkToDiagram: 'Tautan ke diagram',
    searchDiagrams: 'Cari diagram…',
    openLinkedDiagram: 'Buka diagram yang ditautkan',
    showLabel: 'Tampilkan label',
    hideLabel: 'Sembunyikan label',
    showHideLabelDisabled:
      'Pilih node atau koneksi untuk menampilkan atau menyembunyikan labelnya',
    changeIconBulk: 'Ubah ikon berlaku untuk satu node dalam satu waktu',
    changeIcon: 'Ubah ikon',
    changeIconDisabled: 'Pilih node untuk mengubah ikonnya',
    connectionColorPredraw: 'Warna untuk koneksi berikutnya yang Anda gambar',
    connectionColor: 'Warna koneksi',
    connectionColorDisabled:
      'Pilih koneksi (atau alat konektor) untuk mengatur warnanya',
    lineOptionsPredraw: 'Gaya garis untuk koneksi berikutnya yang Anda gambar',
    lineOptions: 'Opsi garis',
    lineOptionsDisabled:
      'Pilih koneksi (atau alat konektor) untuk mengatur opsi garisnya',
    lineType: 'Tipe garis',
    showArrow: 'Tampilkan panah',
    showDottedLine: 'Tampilkan garis putus-putus'
  },
  quickAddNodePopover: {
    add: 'Tambah',
    rectangle: 'Grup'
  },
  zoomControls: {
    zoomOut: 'Perkecil',
    zoomIn: 'Perbesar',
    fitToScreen: 'Sesuaikan ke layar',
    keepLabelsReadable: 'Jaga label tetap terbaca',
    help: 'Bantuan (F1)',
    selected: '{count} dipilih'
  },
  modeHints: {
    connector: 'Seret antar item untuk menghubungkan • Esc untuk membatalkan',
    textBox: 'Klik untuk menempatkan kotak teks • Esc untuk batal',
    label: 'Klik untuk menempatkan label • Esc untuk batal',
    rectangle: 'Seret untuk menggambar persegi panjang • Esc untuk batal'
  },
  previewLayerSwitcher: {
    layers: 'Lapisan',
    showLayer: 'Tampilkan lapisan',
    hideLayer: 'Sembunyikan lapisan',
    solo: 'Solo',
    unsolo: 'Keluar dari solo'
  },
  previewLabelsToggle: {
    hideLabels: 'Sembunyikan label',
    showLabels: 'Tampilkan label'
  },
  annotationPalette: {
    pen: 'Anotasi',
    select: 'Pilih',
    draw: 'Gambar',
    shapes: 'Bentuk',
    pencil: 'Pensil',
    highlighter: 'Stabilo',
    line: 'Garis',
    arrow: 'Panah',
    rectangle: 'Persegi',
    ellipse: 'Elips',
    eraser: 'Penghapus',
    undo: 'Urungkan',
    redo: 'Ulangi',
    clear: 'Hapus semua'
  },
  viewModeInfoPopover: {
    close: 'Tutup'
  },
  labelSettings: {
    description: 'Konfigurasi pengaturan tampilan label',
    expandButtonPadding: 'Padding tombol perluas',
    expandButtonPaddingDesc:
      'Padding bawah saat tombol perluas terlihat (mencegah tumpang tindih teks)',
    // D13
    currentValue: 'Saat ini: {value} unit tema'
  },
  iconSelectionControls: {
    close: 'Tutup',
    importIcons: 'Impor Ikon',
    addMoreIcons: 'Tambah lebih banyak ikon',
    isometricLabel: 'Perlakukan sebagai isometrik (tampilan 3D)',
    isometricHint: 'Hapus centang untuk ikon datar (logo, elemen UI)',
    dragHint:
      'Anda dapat menyeret dan menjatuhkan item mana pun di bawah ke kanvas.',
    aiPromptTooltip: 'Buat ikon dengan AI',
    aiPromptTitle: 'Buat ikon isometrik dengan AI',
    aiPromptBody:
      "Tempel prompt ini ke AI penghasil gambar. Ganti 'my object' dengan kebutuhan Anda, lalu impor PNG yang dihasilkan.",
    aiPromptCopy: 'Salin prompt',
    aiPromptCopied: 'Disalin'
  },
  searchbox: {
    placeholder: 'Cari ikon'
  },
  exportImageDialog: {
    groupAppearance: 'Appearance',
    groupBackground: 'Background',
    groupCrop: 'Crop',
    title: 'Ekspor sebagai gambar',
    compatibilityTitle: 'Pemberitahuan Kompatibilitas Browser',
    compatibilityMessage:
      'Untuk hasil terbaik, gunakan Chrome atau Edge. Firefox saat ini memiliki masalah kompatibilitas dengan fitur ekspor.',
    cropInstruction: 'Klik dan seret untuk memilih area yang ingin diekspor',
    options: 'Opsi',
    showGrid: 'Tampilkan kisi',
    showLabels: 'Tampilkan label',
    screenshotPreset: 'Tangkapan layar (disarankan)',
    scaleClamped:
      'Ukuran ekspor dikurangi agar sesuai dengan batas gambar browser:',
    cropToContent: 'Pangkas ke konten',
    backgroundColor: 'Warna latar belakang',
    transparentBackground: 'Latar belakang transparan',
    exportQuality: 'Kualitas Ekspor (DPI)',
    custom: 'Kustom',
    recrop: 'Pangkas ulang',
    cropApplied: 'Pemangkasan berhasil diterapkan',
    applyCrop: 'Terapkan Pemangkasan',
    clearSelection: 'Hapus Pilihan',
    cropHint:
      'Pilih area untuk dipangkas, atau hapus centang "Pangkas ke konten" untuk menggunakan gambar penuh',
    cancel: 'Batal',
    downloadSvg: 'Unduh sebagai SVG',
    downloadPng: 'Unduh sebagai PNG',
    error: 'Tidak dapat mengekspor gambar'
  },
  toolMenu: {
    label: 'Label',
    undo: 'Batalkan',
    redo: 'Ulangi',
    select: 'Pilih',
    lassoSelect: 'Seleksi lasso',
    freehandLasso: 'Lasso bebas',
    pan: 'Geser',
    addItem: 'Tambah item',
    rectangle: 'Persegi panjang',
    connector: 'Konektor',
    text: 'Teks',
    common: 'Umum',
    // D5
    switchTo2D: 'Beralih ke tampilan 2D',
    switchToIsometric: 'Beralih ke tampilan isometrik',
    clickMode: 'Klik',
    dragMode: 'Seret'
  },
  quickIconSelector: {
    recentlyUsed: 'BARU DIGUNAKAN',
    searchResults: 'HASIL PENCARIAN ({count} ikon)',
    noIconsFound: 'Tidak ada ikon yang cocok dengan "{term}"'
  },
  canvasContextMenu: {
    addNote: 'Tambah catatan',
    addLabel: 'Tambah label',
    details: 'Detail…',
    rename: 'Ganti nama',
    cut: 'Potong',
    copy: 'Salin',
    paste: 'Tempel',
    duplicate: 'Duplikat',
    bringForward: 'Bawa ke depan',
    sendBackward: 'Kirim ke belakang',
    bringToFront: 'Bawa ke depan',
    sendToBack: 'Kirim ke belakang',
    assignToLayer: 'Tetapkan ke lapisan',
    fitToText: 'Sesuaikan dengan teks',
    snapToGrid: 'Jepret ke kisi',
    unsnapFromGrid: 'Lepas dari kisi',
    disableCollision: 'Nonaktifkan tabrakan',
    enableCollision: 'Aktifkan tabrakan',
    delete: 'Hapus',
    addItem: 'Tambah item',
    selectAll: 'Pilih semua',
    enableSnapToGrid: 'Aktifkan jepret ke kisi',
    disableSnapToGrid: 'Nonaktifkan jepret ke kisi',
    itemsSelectedOne: '{count} item dipilih',
    itemsSelectedOther: '{count} item dipilih',
    deleteItemsOne: 'Hapus {count} item',
    deleteItemsOther: 'Hapus {count} item',
    removeFromLayer: 'Hapus dari lapisan',
    noLayers: 'Tidak ada lapisan — tambahkan satu di panel Lapisan'
  },
  // D4 — LeftDock
  leftDock: {
    fileExplorer: 'Penjelajah berkas',
    elements: 'Elemen',
    layers: 'Lapisan',
    settings: 'Pengaturan',
    openDiagramFirst: 'buka atau buat diagram terlebih dahulu',
    collapsePanel: 'Ciutkan panel'
  },
  // D8 — LayersPanel
  layersPanel: {
    deleteLayerTitle: 'Hapus lapisan?',
    deleteLayerBody: 'Lapisan ini berisi {count} elemen. Apa yang harus terjadi pada elemen tersebut?',
    deleteLayerHiddenWarning: 'Lapisan ini TERSEMBUNYI. Mempertahankan isinya membuatnya TERLIHAT lagi — elemen tanpa lapisan selalu ditampilkan.',
    deleteLayerCancel: 'Batal',
    deleteLayerKeep: 'Pertahankan isi',
    deleteLayerDeleteContents: 'Hapus isinya juga',
    header: 'Lapisan',
    addLayer: 'Tambah lapisan',
    deleteSelectedLayer: 'Hapus lapisan terpilih',
    noLayersYet: 'Belum ada lapisan. Klik + untuk menambahkan.',
    unassigned: 'Belum ditetapkan ({count})',
    dropToUnassign: 'Lepaskan item di sini untuk membatalkan penetapan',
    layerN: 'Lapisan {count}'
  },
  // D7 — clipboard toast strings; {count}/{percent} interpolated.
  clipboard: {
    copiedOne: '{count} item disalin',
    copiedOther: '{count} item disalin',
    cutOne: '{count} item dipotong',
    cutOther: '{count} item dipotong',
    pastedOne: '{count} item ditempel',
    pastedOther: '{count} item ditempel',
    nothingToPaste: 'Tidak ada yang bisa ditempel',
    routingConnectors: 'Menempel… merutekan konektor ({percent}%)'
  },
  // D13 — default page name; {count} interpolated.
  page: {
    pageName: 'Halaman {count}'
  }
};

export default locale;
