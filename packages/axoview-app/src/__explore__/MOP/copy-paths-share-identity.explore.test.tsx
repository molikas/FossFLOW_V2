/**
 * Cross-area mop-up (APPROACH §8) — the completeness-critic wave.
 *
 * Pairs no hypothesis crossed, probed here:
 *   MOP-01  A4 (explorer copy paths) × A3 (project ZIP import) × S2 (share
 *           backend) — only `id` is treated as identity when a document is
 *           copied, so `shareUuid` rides along.
 *   MOP-02  A4/FEX-02 × S2/SHARE-06 — two filed entries that cannot both be
 *           true about which delete the file explorer performs.
 */
import { act, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';

jest.mock('react-arborist', () => require('../A4/arboristStub'));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === 'string'
        ? fallback
        : typeof fallback === 'object' && fallback && 'defaultValue' in fallback
          ? (fallback as { defaultValue: string }).defaultValue
          : key,
    i18n: { language: 'en' }
  })
}));

let appStorage: Record<string, unknown> = {};
jest.mock('../../providers/AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

let lifecycleCtx: Record<string, unknown> = {};
jest.mock('../../providers/DiagramLifecycleProvider', () => ({
  useDiagramLifecycle: () => lifecycleCtx,
  DiagramLifecycleProvider: ({ children }: { children: unknown }) => children
}));

let auth: Record<string, unknown> = {};
jest.mock('../../stores/authStore', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) => sel(auth)
}));

import {
  appStorageValue,
  dg,
  flush,
  makeAuth,
  makeLifecycle,
  makePlace,
  renderExplorer
} from '../A4/harness';
import { treeProps } from '../A4/arboristStub';
import type { FileNode } from '../../hooks/useFileTree';

const read = (p: string) => readFileSync(p, 'utf8');
const SHARED_BLOB = {
  title: 'Roadmap',
  items: [],
  views: [],
  // What the backend stores on a shared document (routes.js `shareDiagram`).
  shareUuid: '11111111-2222-4333-8444-555555555555',
  sharedAt: '2026-07-30T00:00:00.000Z'
};

beforeEach(() => { auth = makeAuth(); });

// ---------------------------------------------------------------------------
// MOP-01 — the copy paths carry the share pointer.
// ---------------------------------------------------------------------------
describe('MOP-01 — duplicating (or importing) a shared diagram copies its share link', () => {
  const duplicateViaMenu = async () => {
    const session = makePlace('local', {
      diagrams: [dg('d1', 'Roadmap')],
      blobs: { d1: SHARED_BLOB }
    });
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, serverStorageAvailable: true });
    lifecycleCtx = life.ctx;
    renderExplorer();
    await flush();

    // Select the row, then open the tree's own context menu and press
    // Duplicate — the only route to `handleDuplicate`.
    act(() => {
      treeProps().onSelect([
        { data: { id: 'd1', name: 'Roadmap', type: 'diagram', placeId: 'local' } as FileNode }
      ]);
    });
    fireEvent.contextMenu(document.querySelector('[data-axoview-id="file-explorer-tree"]')!);
    await waitFor(() => expect(document.body.textContent).toContain('Duplicate'));
    const item = [...document.querySelectorAll('li')].find((li) => li.textContent === 'Duplicate')!;
    fireEvent.click(item);
    await flush();
    return session;
  };

  it('characterization: the copy is created with the original\'s shareUuid intact', async () => {
    const session = await duplicateViaMenu();

    // PRECONDITION: a duplicate really was created from the loaded blob.
    expect(session.log).toContain('loadDiagram(d1)');
    expect(session.diagrams.map((d) => d.name)).toEqual(['Roadmap', 'Roadmap - Copy']);

    const copyId = session.diagrams[1].id;
    const copy = session.blobs.get(copyId) as Record<string, unknown>;
    // `handleDuplicate` strips exactly one field: `const { id: _id, ...rest }`.
    expect(copy.id).toBeUndefined();
    // Everything else rides along — including the pointer to the ORIGINAL's
    // published snapshot.
    expect(copy.shareUuid).toBe(SHARED_BLOB.shareUuid);
    expect(copy.sharedAt).toBe(SHARED_BLOB.sharedAt);
  });

  it('the backend treats shareUuid as the snapshot pointer, so two documents now claim one link', () => {
    const routes = read('packages/axoview-backend/src/routes.js');
    // Sharing the COPY reuses the inherited uuid rather than minting one, so
    // the copy's content is published over the original's live link…
    expect(routes).toContain('diagram.shareUuid && UUID_PATTERN.test(diagram.shareUuid)');
    expect(routes).toContain('if (diagram.shareUuid !== uuid) {');
    // …unsharing (or deleting) the copy deletes `public/<uuid>` — the
    // original's snapshot — leaving the original marked shared with a dead link.
    expect(routes).toContain('await adapter.delete(`public/${diagram.shareUuid}`)');
    expect(routes).toContain('await adapter.delete(`public/${existing.shareUuid}`)');
  });

  it('the ZIP and single-JSON import paths copy the same way (id is the only identity)', () => {
    const zip = read('packages/axoview-app/src/services/project/projectZip.ts');
    // Export writes the persisted document verbatim…
    expect(zip).toContain('const model = await storage.loadDiagram(meta.id);');
    expect(zip).toContain('JSON.stringify(model)');
    // …and import strips only `id` before re-creating it.
    expect(zip).toContain('const { id: _strippedId, ...model }');
    expect(zip).toContain('await storage.createDiagram(model, folderId);');
    // The explorer's single-JSON import spreads the parsed file wholesale.
    const explorer = read('packages/axoview-app/src/components/fileExplorer/FileExplorer.tsx');
    expect(explorer).toContain('{ ...(data as object), name: suggestedName, title: suggestedName }');
  });

  it.failing('MOP-01: a copied diagram is not published under the original\'s share link', async () => {
    const session = await duplicateViaMenu();
    expect(session.diagrams).toHaveLength(2); // precondition
    const copy = session.blobs.get(session.diagrams[1].id) as Record<string, unknown>;
    // Expected: identity-bearing fields (`id`, `shareUuid`, `sharedAt`) are
    // stripped by every copy path — a copy has not been shared. Actual: only
    // `id` is, in all three paths.
    expect(copy.shareUuid).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MOP-02 — two filed entries that contradict each other.
// ---------------------------------------------------------------------------
describe('MOP-02 — A4/FEX-02 and S2/SHARE-06 disagree about the explorer\'s delete', () => {
  it('the explorer hard-deletes, and the hard delete DOES cascade to the snapshot', () => {
    const explorer = read('packages/axoview-app/src/components/fileExplorer/FileExplorer.tsx');
    const provider = read('packages/axoview-app/src/services/storage/providers/LocalStorageProvider.ts');
    const routes = read('packages/axoview-backend/src/routes.js');

    // A4/FEX-02: the explorer's only delete is the irreversible one, and no UI
    // calls the soft path at all.
    expect(explorer).toContain('await tree.hardDeleteDiagram(target.id)');
    expect(explorer).not.toContain('softDeleteDiagram');
    // `hardDeleteDiagram` → `deleteDiagram(id, false)` → HTTP DELETE.
    expect(read('packages/axoview-app/src/hooks/useFileTree.ts')).toContain(
      'await storageRef.current.deleteDiagram(id, false)'
    );
    expect(provider).toContain('private async serverDeleteDiagram(id: string, soft = false)');
    expect(provider).toMatch(/if \(soft\) \{[\s\S]*method: 'PATCH'[\s\S]*\} else \{[\s\S]*method: 'DELETE'/);
    // …and DELETE removes the public snapshot first.
    expect(routes).toMatch(
      /export async function deleteDiagram[\s\S]*adapter\.delete\(`public\/\$\{existing\.shareUuid\}`\)[\s\S]*adapter\.delete\(`diagrams\/\$\{id\}`\)/
    );

    // So SHARE-06's premise — "The file explorer's delete is a PATCH
    // soft-delete that preserves shareUuid" — is false as-built. The
    // route-level gap it describes (PATCH `deletedAt` does not cascade) is
    // real, but nothing in the UI can reach it, because the soft path has no
    // caller (FEX-02). The two entries were filed by different waves and never
    // reconciled; the S2 wave inferred the UI's delete from the route surface.
    const known = read('known_issues.md');
    expect(known).toContain('Trashing a shared diagram leaves its public link live');
  });
});
