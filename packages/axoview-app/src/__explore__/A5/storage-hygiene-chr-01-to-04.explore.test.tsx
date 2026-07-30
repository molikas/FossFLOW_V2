/**
 * A5 — the quota-full escape hatch (`LocalStorageInspector`).
 *
 * It is opened by exactly one caller: `persistLastOpened`'s
 * QuotaExceededError branch in `DiagramLifecycleProvider`, i.e. the moment the
 * user is out of space and is being asked to free some. CHR-01 (what "Clear All
 * Diagrams" actually deletes), CHR-02 (what the gauge actually measures),
 * CHR-03 (the orphaning the clear leaves behind), CHR-04 (what the backup
 * button actually backs up), CHR-12 (the `for…in` enumeration itself).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { LocalStorageInspector } from '../../LocalStorageInspector';

/**
 * The two prefixes the app actually uses. Session-place DIAGRAMS live in
 * sessionStorage under `axoview_` (underscore); folders, the tree manifest and
 * every preference live in localStorage under `axoview-` (hyphen).
 * `LocalStorageProvider` is the source of truth for both.
 */
const seedRealWorld = () => {
  localStorage.clear();
  sessionStorage.clear();
  // localStorage, hyphen prefix — configuration and app state, no diagrams.
  localStorage.setItem('axoview-folders', JSON.stringify([{ id: 'f1', name: 'Work', parentId: null }]));
  localStorage.setItem('axoview-tree-manifest', JSON.stringify({ folders: [{ id: 'f1', order: 0 }] }));
  localStorage.setItem('axoview-google-profile', JSON.stringify({ email: 'a@b.c' }));
  localStorage.setItem('axoview-drive-root', 'drive-root-id');
  localStorage.setItem('axoview-enabled-icon-packs', JSON.stringify(['aws']));
  localStorage.setItem('axoview-last-opened', 'd1');
  localStorage.setItem('axoview-explorer-open', 'true');
  // sessionStorage, underscore prefix — the actual diagrams.
  sessionStorage.setItem(
    'axoview_diagrams',
    JSON.stringify([{ id: 'd1', name: 'Quarterly', folderId: 'f1', lastModified: 'x' }])
  );
  sessionStorage.setItem('axoview_diagram_d1', JSON.stringify({ title: 'Quarterly', items: [] }));
};

const renderInspector = () => render(<LocalStorageInspector onClose={() => {}} />);

const clearAll = () => {
  fireEvent.click(screen.getByText('Clear All Diagrams'));
  fireEvent.click(screen.getByText('Confirm'));
};

beforeEach(() => {
  seedRealWorld();
  // jsdom has no navigation; `confirmClear` ends with window.location.reload().
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: jest.fn() }
  });
});

// ---------------------------------------------------------------------------
// CHR-12 — the enumeration itself (rig honesty for everything below).
// ---------------------------------------------------------------------------
describe('CHR-12 — `for (const key in localStorage)` also yields the Storage members', () => {
  it('for…in yields six prototype members that getItem() then filters out', () => {
    const seen: string[] = [];
    for (const key in localStorage) seen.push(key);

    // The enumeration really is wrong: WebIDL declares interface operations
    // and attributes enumerable, so `for…in` walks `Storage.prototype` as well
    // as the stored keys (same in browsers — this is not a jsdom artifact).
    expect(seen).toEqual(expect.arrayContaining(['getItem', 'setItem', 'removeItem', 'clear', 'key', 'length']));
    expect(seen.length).toBe(Object.keys(localStorage).length + 6);

    // …but both consumers are accidentally safe: `calculateStorage` guards on
    // `localStorage.getItem(key)`, which is null for every prototype name, and
    // `confirmClear` filters on the `axoview-` prefix, which none of them has.
    for (const member of ['getItem', 'setItem', 'removeItem', 'clear', 'key', 'length']) {
      expect(localStorage.getItem(member)).toBeNull();
      expect(member.startsWith('axoview-')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// CHR-01 — what "Clear All Diagrams" deletes.
// ---------------------------------------------------------------------------
describe('CHR-01 — "Clear All Diagrams" clears configuration and no diagrams', () => {
  it('characterization: every axoview- key goes, every diagram stays', () => {
    renderInspector();
    // PRECONDITION: one diagram in session storage, config in local storage.
    expect(sessionStorage.getItem('axoview_diagram_d1')).not.toBeNull();
    expect(localStorage.getItem('axoview-google-profile')).not.toBeNull();

    clearAll();

    // Gone: the Google identity hint (next boot cannot silently reconnect),
    // the Drive root cache (the tree shows "finish setup" — A4/FEX-14), the
    // icon-pack preference (A4-adjacent: ICON-04's corrupt-pref path), the
    // folder tree and the tree manifest.
    expect(localStorage.getItem('axoview-google-profile')).toBeNull();
    expect(localStorage.getItem('axoview-drive-root')).toBeNull();
    expect(localStorage.getItem('axoview-enabled-icon-packs')).toBeNull();
    expect(localStorage.getItem('axoview-folders')).toBeNull();
    expect(localStorage.getItem('axoview-tree-manifest')).toBeNull();
    // Still there: every byte of diagram data. The button freed nothing it
    // promised and nothing the user was asked to free.
    expect(sessionStorage.getItem('axoview_diagrams')).not.toBeNull();
    expect(sessionStorage.getItem('axoview_diagram_d1')).not.toBeNull();
  });

  it.failing('CHR-01: "Clear All Diagrams" clears diagrams', () => {
    renderInspector();
    clearAll();
    expect(localStorage.getItem('axoview-folders')).toBeNull(); // precondition
    // Expected: the destructive action named "Clear All Diagrams", confirmed
    // with "This will remove all saved diagrams", removes diagrams. Actual: it
    // sweeps `localStorage` by the `axoview-` prefix — a prefix the diagrams
    // do not use and every preference does.
    expect(sessionStorage.getItem('axoview_diagram_d1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CHR-02 — what the gauge measures.
// ---------------------------------------------------------------------------
describe('CHR-02 — the gauge counts preferences as diagrams and ignores the diagrams', () => {
  it('characterization: "Axoview diagrams" is the config bytes; session bytes are invisible', () => {
    // Make the difference impossible to misread: a big diagram, small config.
    sessionStorage.setItem('axoview_diagram_d1', JSON.stringify({ blob: 'x'.repeat(50_000) }));
    renderInspector();

    const line = screen.getByText(/Axoview diagrams:/).textContent!;
    // PRECONDITION: the gauge rendered a number at all.
    expect(line).toMatch(/Axoview diagrams: [\d.]+ (Bytes|KB|MB)/);
    // 50 KB of diagram is in sessionStorage, which `calculateStorage` never
    // reads — so the line the user is asked to act on is under a kilobyte.
    const bytes = Number(line.replace(/[^\d.]/g, ''));
    expect(line).toContain('Bytes');
    expect(bytes).toBeLessThan(1024);
    // …and the percentage bar is a fraction of localStorage against an assumed
    // 5 MB cap, while the quota that actually overflowed may be either store.
    expect(screen.getByText(/Used: .* \/ ~5 MB/)).toBeTruthy();
  });

  it.failing('CHR-02: the storage gauge accounts for the diagrams', () => {
    sessionStorage.setItem('axoview_diagram_d1', JSON.stringify({ blob: 'x'.repeat(50_000) }));
    renderInspector();
    const line = screen.getByText(/Axoview diagrams:/).textContent!;
    expect(line).toBeTruthy(); // precondition
    // Expected: ~50 KB. Actual: the hyphen-prefixed config bytes.
    expect(line).toMatch(/Axoview diagrams: 4[0-9](\.\d+)? KB/);
  });
});

// ---------------------------------------------------------------------------
// CHR-03 — what the clear leaves behind.
// ---------------------------------------------------------------------------
describe('CHR-03 — the clear orphans every foldered diagram (A4/FEX-01 consumer)', () => {
  it('characterization: the folder list is deleted while the diagrams keep folderId', () => {
    renderInspector();
    // PRECONDITION: the diagram is inside folder f1, which exists.
    expect(JSON.parse(sessionStorage.getItem('axoview_diagrams')!)[0].folderId).toBe('f1');
    expect(localStorage.getItem('axoview-folders')).not.toBeNull();

    clearAll();

    // The folder is gone and the diagram still points at it. `buildTree` walks
    // down from `parentId === null`, so a diagram whose folder cannot be
    // resolved renders nowhere and is not in the trash either (A4/FEX-01):
    // the "clear" made the work invisible without deleting it or freeing space.
    expect(localStorage.getItem('axoview-folders')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('axoview_diagrams')!)[0].folderId).toBe('f1');
  });

  it.failing('CHR-03: clearing the folder tree does not strand diagrams inside it', () => {
    renderInspector();
    clearAll();
    expect(localStorage.getItem('axoview-folders')).toBeNull(); // precondition
    // Expected: either the diagrams go with their folders, or their `folderId`
    // is reset to the root. Actual: neither — and A4/FEX-01 makes the result
    // unreachable from every surface.
    expect(JSON.parse(sessionStorage.getItem('axoview_diagrams')!)[0].folderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CHR-04 — what the backup button backs up.
// ---------------------------------------------------------------------------
describe('CHR-04 — "Export All Diagrams" backs up a key the places model stopped writing', () => {
  const captureDownload = () => {
    const created: string[] = [];
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => {
      created.push(String(b.size));
      return 'blob:x';
    };
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = () => clicks.push((el as HTMLAnchorElement).download);
      return el;
    });
    return { created, clicks };
  };

  afterEach(() => jest.restoreAllMocks());

  it('characterization: with diagrams in the session place the export does nothing at all', () => {
    const { created, clicks } = captureDownload();
    renderInspector();
    // PRECONDITION: there ARE diagrams — two session keys hold them.
    expect(sessionStorage.getItem('axoview_diagrams')).not.toBeNull();

    fireEvent.click(screen.getByText('Export All Diagrams'));

    // `exportAllDiagrams` reads localStorage's `axoview-diagrams` — the
    // pre-places-model key that only `DiagramLifecycleProvider`'s legacy
    // session-mode effect writes. Nothing is exported and nothing says so: the
    // button offered right before the destructive clear silently no-ops.
    expect(created).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it.failing('CHR-04: the backup contains the diagrams that exist', () => {
    const { clicks } = captureDownload();
    renderInspector();
    fireEvent.click(screen.getByText('Export All Diagrams'));
    expect(sessionStorage.getItem('axoview_diagram_d1')).not.toBeNull(); // precondition
    // Expected: a backup file. Actual: no download at all — and when the legacy
    // key IS present the file is that stale copy, not the session place.
    expect(clicks).toHaveLength(1);
  });
});
