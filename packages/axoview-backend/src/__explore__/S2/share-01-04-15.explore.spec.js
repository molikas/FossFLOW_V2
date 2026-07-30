/**
 * S2 / SHARE-01, SHARE-04, SHARE-15 — the share lifecycle's three ways to end up
 * with a public snapshot nothing can reach.
 *
 * All three are about `shareUuid` being an ordinary field on an ordinary
 * document: a full PUT can drop it, two concurrent shares can each mint one, and
 * a PATCH can set it to a value that belongs to someone else.
 *
 * The in-memory adapter (reused from the regression suite's helpers) is the right
 * tier here — every one of these is a routes.js-level ordering question, not a
 * filesystem question. SHARE-02 is the exception and uses the fs adapter.
 */
import * as routes from '../../routes.js';
import {
  createMemoryAdapter,
  decodeJson,
  makeCtx,
  putJson
} from '../../__tests__/helpers/memoryAdapter.js';

/**
 * What the app actually PUTs on autosave: `leanIfModel(pending.model)`, where
 * `pending.model` comes from the LIB model store — a `modelSchema`-shaped
 * document (title/items/views/icons/colors [+description/version]). `shareUuid`
 * is a backend-only field and has no place in that schema, so it is never on the
 * wire. That absence is the whole of SHARE-01.
 */
function autosavePayload(overrides = {}) {
  return {
    title: 'My diagram',
    items: [],
    views: [],
    icons: [],
    colors: [],
    requiredPacks: [],
    ...overrides
  };
}

async function seedDiagram(adapter, id, extra = {}) {
  putJson(adapter, `diagrams/${id}`, {
    id,
    title: 'My diagram',
    name: 'My diagram',
    items: [],
    views: [],
    icons: [],
    colors: [],
    ...extra
  });
}

describe('SHARE-01 — the first autosave after sharing orphans the live snapshot', () => {
  test('CHARACTERIZATION: PUT strips shareUuid, the snapshot stays live, and the next share mints a second uuid', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');

    // 1. Share.
    const first = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const uuid1 = first.body.uuid;
    // --- preconditions: the snapshot exists and the diagram records it ---
    expect(decodeJson(adapter, `public/${uuid1}`)).not.toBeNull();
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(uuid1);

    // 2. One autosave — the payload the app really sends.
    await routes.saveDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: autosavePayload() })
    );

    // The link the user just copied still resolves...
    const stillPublic = await routes.getPublicSnapshot(
      adapter,
      makeCtx({ params: { uuid: uuid1 } })
    );
    expect(stillPublic.status).toBe(200);
    // ...but the diagram no longer knows about it.
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBeUndefined();

    // 3. Share again — a SECOND uuid, a SECOND live snapshot.
    const second = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const uuid2 = second.body.uuid;
    expect(uuid2).not.toBe(uuid1);
    expect(decodeJson(adapter, `public/${uuid2}`)).not.toBeNull();

    // 4. Neither unshare nor delete can ever reach the first one.
    await routes.unshareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, `public/${uuid2}`)).toBeNull();
    expect(decodeJson(adapter, `public/${uuid1}`)).not.toBeNull();

    await seedDiagram(adapter, 'd1', { shareUuid: uuid2 });
    await routes.deleteDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, `public/${uuid1}`)).not.toBeNull();
    // The orphan is still served to anyone holding the original link.
    expect(
      (await routes.getPublicSnapshot(adapter, makeCtx({ params: { uuid: uuid1 } }))).status
    ).toBe(200);
  });

  test('CONTROL: a PATCH (the shape the file tree uses for rename / trash) preserves shareUuid', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(body.uuid); // precondition

    await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { name: 'Renamed' } })
    );

    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(body.uuid);
    expect(decodeJson(adapter, 'diagrams/d1').name).toBe('Renamed');
  });

  test('SHOULD: a full save should not silently drop the share (currently fails)', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(body.uuid); // precondition

    await routes.saveDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: autosavePayload() })
    );

    // Expected-fail: this is the assertion a fix would make pass.
    let failed = false;
    try {
      expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(body.uuid);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});

describe('SHARE-04 — two concurrent shares mint two snapshots and record one', () => {
  test('CHARACTERIZATION: the loser is a live public snapshot with no owner', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');
    // --- precondition: genuinely never shared ---
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBeUndefined();

    const [a, b] = await Promise.all([
      routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } })),
      routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }))
    ]);

    // Both read the shareUuid-less document before either wrote.
    expect(a.body.uuid).not.toBe(b.body.uuid);
    const snapshots = (await adapter.list('public')).sort();
    expect(snapshots).toHaveLength(2);

    // Only one is recorded, so unshare reaches only one.
    const recorded = decodeJson(adapter, 'diagrams/d1').shareUuid;
    await routes.unshareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const left = await adapter.list('public');
    expect(left).toHaveLength(1);
    expect(left[0]).not.toBe(`public/${recorded}`);
    // ...and the survivor is still served.
    const orphanUuid = left[0].slice('public/'.length);
    expect(
      (await routes.getPublicSnapshot(adapter, makeCtx({ params: { uuid: orphanUuid } }))).status
    ).toBe(200);
  });

  test('CONTROL: sequential shares are idempotent — one uuid, one snapshot', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');
    const a = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    const b = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(b.body.uuid).toBe(a.body.uuid);
    expect(await adapter.list('public')).toHaveLength(1);
  });
});

describe('SHARE-15 — PATCH can point one diagram at another diagram\'s snapshot', () => {
  test('CHARACTERIZATION: unsharing the impostor deletes the victim\'s live snapshot', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'victim');
    await seedDiagram(adapter, 'impostor');
    const victim = await routes.shareDiagram(
      adapter,
      makeCtx({ params: { id: 'victim' } })
    );
    const victimUuid = victim.body.uuid;
    // --- preconditions ---
    expect(decodeJson(adapter, `public/${victimUuid}`).sourceId).toBe('victim');
    expect(decodeJson(adapter, 'diagrams/impostor').shareUuid).toBeUndefined();

    // `patchDiagram` merges the body wholesale — no reserved-key filter.
    const patched = await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'impostor' }, body: { shareUuid: victimUuid } })
    );
    expect(patched.status).toBe(200);
    expect(decodeJson(adapter, 'diagrams/impostor').shareUuid).toBe(victimUuid);

    // Unsharing the impostor takes down the victim's link...
    await routes.unshareDiagram(adapter, makeCtx({ params: { id: 'impostor' } }));
    expect(decodeJson(adapter, `public/${victimUuid}`)).toBeNull();
    // ...while the victim still believes it is published.
    expect(decodeJson(adapter, 'diagrams/victim').shareUuid).toBe(victimUuid);
    await expect(
      routes.getPublicSnapshot(adapter, makeCtx({ params: { uuid: victimUuid } }))
    ).rejects.toMatchObject({ status: 404 });
  });

  test('CHARACTERIZATION: the impostor can also RE-publish itself over the victim\'s uuid', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'victim', { title: 'Victim secrets' });
    await seedDiagram(adapter, 'impostor', { title: 'Impostor content' });
    const { body } = await routes.shareDiagram(
      adapter,
      makeCtx({ params: { id: 'victim' } })
    );
    expect(decodeJson(adapter, `public/${body.uuid}`).title).toBe('Victim secrets'); // precondition

    await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'impostor' }, body: { shareUuid: body.uuid } })
    );
    await routes.shareDiagram(adapter, makeCtx({ params: { id: 'impostor' } }));

    // The victim's published link now serves the impostor's content.
    const served = decodeJson(adapter, `public/${body.uuid}`);
    expect(served.title).toBe('Impostor content');
    expect(served.sourceId).toBe('impostor');
  });

  test('CONTROL: PATCH cannot change the id — that field IS protected', async () => {
    const adapter = createMemoryAdapter();
    await seedDiagram(adapter, 'd1');
    await routes.patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { id: 'hijacked' } })
    );
    expect(decodeJson(adapter, 'diagrams/d1').id).toBe('d1');
    expect(decodeJson(adapter, 'diagrams/hijacked')).toBeNull();
  });
});
