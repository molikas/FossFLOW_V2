/**
 * A4 shared harness — renders the real `FileExplorer` (both `useFileTree`
 * instances live) with in-memory place doubles, a lifecycle-context double and
 * the arborist capture stub (`./arboristStub`).
 *
 * Why render the component rather than test the pieces: every FEX-08..15 claim
 * is about a handler's *composition* — which provider a rename resolves to,
 * what order `confirmDelete` does two awaits in, whether a loop `return`s or
 * `continue`s. None of that is observable below `FileExplorer`, and the two
 * hooks it composes are what make `placeOfId` ambiguous in the first place.
 *
 * Callers MUST declare these mocks before importing this module (jest.mock is
 * hoisted, so the harness's own `import { FileExplorer }` already sees them):
 *   react-arborist, react-i18next, ../../providers/AppStorageContext,
 *   ../../providers/DiagramLifecycleProvider, ../../stores/authStore
 * See any A4 probe for the canonical block.
 *
 * Rig traps found building this (2026-07-30):
 *  - jsdom has no `ResizeObserver`; `FileExplorer`'s height measurement throws
 *    at mount without `installResizeObserver()` — an `it.failing` probe whose
 *    body throws during SETUP reports as a confirmed bug (LEDGER rig note).
 *  - The place doubles mutate their own arrays, so a `refresh()` after a
 *    mutation shows the real post-state; a probe asserting "the row is gone"
 *    is asserting storage, not a stale render.
 *  - **`[...someMap]` silently evaluates to `[]` in this package.** The app
 *    tsconfig targets `es5` with no `downlevelIteration`, so ts-jest lowers
 *    spread to the array-like helper: a `Map`/`Set` has no `.length`, so the
 *    spread yields nothing and an assertion built on it "proves" whatever the
 *    probe hoped — and `for (const x of someMap)` lowers the same way, so it
 *    iterates zero times. (`[...nodeList]` is fine — array-like.) Use
 *    `blobValues()` / `Array.from(...)` / `.forEach(...)`. No product code or
 *    earlier probe spreads or `for...of`-iterates a Map or Set, so no shipped
 *    verdict rests on this; it cost two wrong readings here.
 */
import { render, act } from '@testing-library/react';
import type { PlaceId } from '../../hooks/useFileTree';
import type {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from '../../services/storage/types';
import { FileExplorer } from '../../components/fileExplorer/FileExplorer';
import { resetArborist } from './arboristStub';

// ---------------------------------------------------------------------------
// jsdom gaps
// ---------------------------------------------------------------------------

/** jsdom ships no ResizeObserver; FileExplorer constructs one at mount. */
export function installResizeObserver(): void {
  if ((globalThis as { ResizeObserver?: unknown }).ResizeObserver) return;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// ---------------------------------------------------------------------------
// Place doubles — one per storage place, backed by mutable in-memory rows
// ---------------------------------------------------------------------------

export interface PlaceDouble {
  provider: StorageProvider;
  folders: FolderMeta[];
  diagrams: DiagramMeta[];
  /** Persisted diagram bodies, by id — what `loadDiagram` returns. */
  blobs: Map<string, unknown>;
  /** Every provider call, in order: `'moveItem(d1,diagram,f2)'`. */
  log: string[];
  /** Op names that reject when called. */
  fail: Set<string>;
  /** Ran (and awaited) at the START of the named op — interleaving hook. */
  before: Map<string, () => void | Promise<void>>;
  /** Drive only: what `getCachedRootId()` returns. */
  rootId: string | null;
  seq: number;
}

export const dg = (
  id: string,
  name: string,
  folderId: string | null = null,
  extra: Partial<DiagramMeta> = {}
): DiagramMeta => ({
  id,
  name,
  folderId,
  lastModified: '2026-07-30T00:00:00.000Z',
  ...extra
});

export const fld = (id: string, name: string, parentId: string | null = null): FolderMeta =>
  ({ id, name, parentId });

export function makePlace(
  place: PlaceId,
  init: { folders?: FolderMeta[]; diagrams?: DiagramMeta[]; blobs?: Record<string, unknown> } = {}
): PlaceDouble {
  const p: PlaceDouble = {
    folders: init.folders ?? [],
    diagrams: init.diagrams ?? [],
    blobs: new Map(Object.entries(init.blobs ?? {})),
    log: [],
    fail: new Set(),
    before: new Map(),
    rootId: place === 'google-drive' ? 'drive-root' : null,
    seq: 0,
    provider: null as unknown as StorageProvider
  };

  const op = async (name: string, args: unknown[], body: () => unknown) => {
    p.log.push(`${name}(${args.map(String).join(',')})`);
    const hook = p.before.get(name);
    if (hook) await hook();
    if (p.fail.has(name)) throw new Error(`${name} failed (injected)`);
    return body();
  };

  p.provider = {
    id: place,
    displayName: place,
    requiresAuth: place === 'google-drive',
    isAvailable: async () => true,
    listDiagrams: async () => (await op('listDiagrams', [], () => p.diagrams.map((d) => ({ ...d })))) as DiagramMeta[],
    listFolders: async () => (await op('listFolders', [], () => p.folders.map((f) => ({ ...f })))) as FolderMeta[],
    getTreeManifest: async () => (await op('getTreeManifest', [], () => ({ folders: [] }))) as TreeManifest,
    saveTreeManifest: async (m: TreeManifest) => { await op('saveTreeManifest', [], () => m); },
    loadDiagram: async (id: string) => op('loadDiagram', [id], () => p.blobs.get(id) ?? { title: id }),
    saveDiagram: async (id: string, data: unknown) => {
      await op('saveDiagram', [id], () => p.blobs.set(id, data));
    },
    createDiagram: async (data: unknown, folderId?: string | null) =>
      (await op('createDiagram', [(data as { name?: string })?.name ?? '', folderId ?? null], () => {
        const id = `${place}-new-${++p.seq}`;
        p.diagrams.push(dg(id, (data as { name?: string })?.name ?? id, folderId ?? null));
        p.blobs.set(id, data);
        return id;
      })) as string,
    deleteDiagram: async (id: string, soft?: boolean) => {
      await op('deleteDiagram', [id, soft ? 'soft' : 'hard'], () => {
        const row = p.diagrams.find((d) => d.id === id);
        if (soft && row) row.deletedAt = '2026-07-30T00:00:00.000Z';
        else {
          p.diagrams = p.diagrams.filter((d) => d.id !== id);
          p.blobs.delete(id);
        }
      });
    },
    restoreDiagram: async (id: string) => {
      await op('restoreDiagram', [id], () => {
        const row = p.diagrams.find((d) => d.id === id);
        if (row) delete row.deletedAt;
      });
    },
    renameDiagram: async (id: string, name: string) => {
      await op('renameDiagram', [id, name], () => {
        const row = p.diagrams.find((d) => d.id === id);
        if (row) row.name = name;
      });
    },
    createFolder: async (name: string, parentId?: string | null) =>
      (await op('createFolder', [name, parentId ?? null], () => {
        const id = `${place}-f-${++p.seq}`;
        p.folders.push(fld(id, name, parentId ?? null));
        return id;
      })) as string,
    renameFolder: async (id: string, name: string) => {
      await op('renameFolder', [id, name], () => {
        const row = p.folders.find((f) => f.id === id);
        if (row) row.name = name;
      });
    },
    deleteFolder: async (id: string, recursive: boolean) => {
      await op('deleteFolder', [id, String(recursive)], () => {
        p.folders = p.folders.filter((f) => f.id !== id);
      });
    },
    moveItem: async (id: string, type: 'diagram' | 'folder', targetFolderId: string | null) => {
      await op('moveItem', [id, type, targetFolderId], () => {
        if (type === 'folder') {
          const row = p.folders.find((f) => f.id === id);
          if (row) row.parentId = targetFolderId;
        } else {
          const row = p.diagrams.find((d) => d.id === id);
          if (row) row.folderId = targetFolderId;
        }
      });
    },
    // Drive-place UI accelerator the explorer reads synchronously (FEX-14).
    getCachedRootId: () => p.rootId
  } as unknown as StorageProvider;

  return p;
}

// ---------------------------------------------------------------------------
// Context doubles
// ---------------------------------------------------------------------------

export interface LifecycleDouble {
  ctx: Record<string, unknown>;
  /** Ordered trace of lifecycle calls, interleaved with provider calls. */
  log: string[];
  /** `saveAllDirty` flushes this into the session place's blobs. */
  pendingFlush: Map<string, unknown>;
}

export function makeLifecycle(
  sessionPlace: PlaceDouble | null,
  over: Record<string, unknown> = {}
): LifecycleDouble {
  const d: LifecycleDouble = { ctx: {}, log: [], pendingFlush: new Map() };
  d.ctx = {
    currentDiagram: null,
    fileTreeRefreshToken: 0,
    dirtyDiagramIds: new Set<string>(),
    isReadonlyUrl: false,
    axoviewRef: { current: null },
    openDiagramById: async (id: string, name: string, place: string) => {
      d.log.push(`openDiagramById(${id},${name},${place})`);
    },
    checkUnsavedBeforeNavigate: (cb: () => void) => {
      d.log.push('checkUnsavedBeforeNavigate');
      cb();
    },
    markProjectExported: () => d.log.push('markProjectExported'),
    notifyDiagramRenamedFromTree: (id: string, name: string) =>
      d.log.push(`notifyDiagramRenamedFromTree(${id},${name})`),
    notifyDiagramDeletedFromTree: (id: string) => d.log.push(`notifyDiagramDeletedFromTree(${id})`),
    saveAllDirty: async () => {
      d.log.push('saveAllDirty');
      d.pendingFlush.forEach((blob, id) => sessionPlace?.blobs.set(id, blob));
      d.pendingFlush.clear();
    },
    refreshFileTree: () => d.log.push('refreshFileTree'),
    setFileExplorerOpen: () => {},
    ...over
  };
  return d;
}

export interface AuthDouble {
  status: string;
  user: { email?: string } | null;
  driveScopeGranted: boolean | null;
  signIn: () => void;
  grantDriveAccess: () => void;
  log: string[];
}

export function makeAuth(over: Partial<AuthDouble> = {}): AuthDouble {
  const a: AuthDouble = {
    status: 'UNAUTHENTICATED',
    user: null,
    driveScopeGranted: null,
    log: [],
    signIn: () => a.log.push('signIn'),
    grantDriveAccess: () => a.log.push('grantDriveAccess'),
    ...over
  };
  return a;
}

/** The value the mocked `useAppStorage` should return. */
export function appStorageValue(opts: {
  session: PlaceDouble;
  drive?: PlaceDouble | null;
  googleDriveConfigured?: boolean;
  serverStorageAvailable?: boolean;
  defaultPlaceId?: PlaceId;
}) {
  const providers: Record<string, StorageProvider | null> = {
    local: opts.session.provider,
    'google-drive': opts.drive?.provider ?? null
  };
  return {
    storage: opts.session.provider,
    storageManager: {
      activeProviderId: 'local',
      getProvider: (id: string) => providers[id] ?? null,
      setActiveProvider: () => {}
    },
    isInitialized: true,
    isServerStorage: !!opts.serverStorageAvailable,
    serverStorageAvailable: !!opts.serverStorageAvailable,
    activeProviderId: 'local',
    setActiveProviderId: () => {},
    remoteStorageActive: false,
    googleDriveConfigured: !!opts.googleDriveConfigured,
    defaultPlaceId: opts.defaultPlaceId ?? 'local',
    runtimeConfig: null
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderExplorer() {
  installResizeObserver();
  resetArborist();
  const utils = render(<FileExplorer />);
  return {
    ...utils,
    /**
     * Re-render the SAME mounted instance — the mocked contexts are plain
     * objects, so a probe changes `auth`/`lifecycleCtx` and calls this to let
     * the component read them. Remounting instead would reset both trees and
     * lose the very state these hypotheses are about.
     */
    update: () => utils.rerender(<FileExplorer />)
  };
}

/** Map values as an array — see the `es5` spread trap in the header. */
export function blobValues(p: PlaceDouble): unknown[] {
  return Array.from(p.blobs.values());
}

/** Let queued microtasks + the two tree loads settle inside act(). */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
