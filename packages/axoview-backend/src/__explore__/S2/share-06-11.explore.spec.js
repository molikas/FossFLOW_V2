/**
 * S2 / SHARE-06, SHARE-11 — what the public snapshot route does and does not know
 * about the diagram behind it.
 *
 * SHARE-06 is a sibling-drift probe: the worker's Drive read proxy gates on
 * Drive's `trashed` flag and answers 410 ("a trashed file must stop resolving
 * here — matching Drive's own web-share semantics"). The snapshot route is the
 * same product promise over the app's own trash, and has no such gate.
 */
import * as routes from '../../routes.js';
import {
  createMemoryAdapter,
  decodeJson,
  makeCtx,
  putJson
} from '../../__tests__/helpers/memoryAdapter.js';

function seed(adapter, id, extra = {}) {
  putJson(adapter, `diagrams/${id}`, {
    id,
    title: 'Quarterly plan',
    name: 'Quarterly plan',
    items: [],
    views: [],
    icons: [],
    colors: [],
    ...extra
  });
}

describe('SHARE-06 — trashing a shared diagram leaves its public link live', () => {
  test('CHARACTERIZATION: the soft delete the file tree performs preserves shareUuid and the snapshot keeps serving', async () => {
    const adapter = createMemoryAdapter();
    seed(adapter, 'd1');
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    // --- preconditions ---
    expect(decodeJson(adapter, `public/${body.uuid}`)).not.toBeNull();
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(body.uuid);

    // Exactly what LocalStorageProvider.serverDeleteDiagram(id, soft=true) sends
    // — the shape `useFileTree`'s tree delete uses.
    await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { deletedAt: new Date().toISOString() } })
    );

    // The diagram is in the trash...
    const meta = (await adapter.listDiagramMeta()).find((d) => d.id === 'd1');
    expect(meta.deletedAt).not.toBeNull();
    // ...and its public link still resolves, with the full content.
    const served = await routes.getPublicSnapshot(
      adapter,
      makeCtx({ params: { uuid: body.uuid } })
    );
    expect(served.status).toBe(200);
    expect(served.body.title).toBe('Quarterly plan');
    // The snapshot carries no trace of the trash state either — a viewer-side
    // gate could not be written against it.
    expect(served.body.deletedAt).toBeUndefined();
  });

  test('CHARACTERIZATION: re-sharing a TRASHED diagram is accepted and refreshes the snapshot', async () => {
    const adapter = createMemoryAdapter();
    seed(adapter, 'd1', { deletedAt: '2026-07-30T00:00:00.000Z' });
    expect(decodeJson(adapter, 'diagrams/d1').deletedAt).not.toBeUndefined(); // precondition

    const res = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(res.status).toBe(200);
    expect(decodeJson(adapter, `public/${res.body.uuid}`).title).toBe('Quarterly plan');
  });

  test('CONTROL: the PERMANENT delete does cascade — so the gap is the trash state specifically', async () => {
    const adapter = createMemoryAdapter();
    seed(adapter, 'd1');
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    await routes.deleteDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, `public/${body.uuid}`)).toBeNull();
  });

  test('SHOULD: a trashed diagram\'s snapshot should stop resolving (currently fails)', async () => {
    const adapter = createMemoryAdapter();
    seed(adapter, 'd1');
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { deletedAt: new Date().toISOString() } })
    );
    expect(decodeJson(adapter, 'diagrams/d1').deletedAt).toBeTruthy(); // precondition

    let rejected = false;
    try {
      await routes.getPublicSnapshot(adapter, makeCtx({ params: { uuid: body.uuid } }));
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(false); // it resolves — the "should" is unmet
  });
});

describe('SHARE-11 — the snapshot whitelist drops top-level model fields', () => {
  test('CHARACTERIZATION: `description` is present on the diagram and absent from the snapshot', async () => {
    const adapter = createMemoryAdapter();
    seed(adapter, 'd1', {
      description: 'Read the notes tab before the review.',
      version: '1.2.3'
    });
    // --- precondition: both fields ARE stored ---
    const stored = decodeJson(adapter, 'diagrams/d1');
    expect(stored.description).toBe('Read the notes tab before the review.');
    expect(stored.version).toBe('1.2.3');

    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const snapshot = decodeJson(adapter, `public/${body.uuid}`);

    // `description` and `version` are both `modelSchema` fields; neither is in
    // the hand-written snapshot whitelist.
    expect(snapshot.description).toBeUndefined();
    expect(snapshot.version).toBeUndefined();
    // Everything the whitelist does name survives, so this is an omission and
    // not a general copy failure.
    expect(Object.keys(snapshot).sort()).toEqual([
      'colors',
      'fitToScreen',
      'icons',
      'items',
      'name',
      'sharedAt',
      'sourceId',
      'title',
      'views'
    ]);
  });

  test('CHARACTERIZATION: the lean-save companion field is dropped too, so a shared diagram cannot rehydrate its packs', async () => {
    const adapter = createMemoryAdapter();
    // ADR 0003 lean-save: the stored blob has pack icons stripped and records
    // which packs the load path must re-fetch.
    seed(adapter, 'd1', {
      icons: [{ id: 'imported-1', collection: 'imported', url: 'data:,' }],
      requiredPacks: ['aws'],
      items: [{ id: 'i1', name: 'n', icon: 'aws-ec2' }]
    });
    expect(decodeJson(adapter, 'diagrams/d1').requiredPacks).toEqual(['aws']); // precondition

    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const snapshot = decodeJson(adapter, `public/${body.uuid}`);

    expect(snapshot.requiredPacks).toBeUndefined();
    // The item still references a pack icon the snapshot's `icons` cannot resolve.
    expect(snapshot.items[0].icon).toBe('aws-ec2');
    expect(snapshot.icons.map((i) => i.id)).not.toContain('aws-ec2');
  });
});
