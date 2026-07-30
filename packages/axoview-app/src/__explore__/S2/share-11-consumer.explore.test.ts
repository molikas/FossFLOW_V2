/**
 * S2 / SHARE-11 (consumer half) — pairs the backend finding with the code that
 * breaks on it.
 *
 * The backend probe shows `requiredPacks` is absent from the share snapshot. On
 * its own that is arithmetic; this is the consumer. `loadPacksForDiagram` resolves
 * which icon packs to fetch from TWO signals — `requiredPacks`, and an
 * items × icons cross-reference — and a lean blob (ADR 0003) defeats the second
 * because the pack icons it would need to map an id to a collection are exactly
 * what lean-save stripped. With lazy pack loading ON (the default) nothing else
 * loads them.
 */
import { leanIfModel } from '../../services/storage/leanModel';
import { loadLazyLoadingPreference } from '../../services/iconPackManager';

const AWS_ICON = {
  id: 'aws-ec2',
  name: 'EC2',
  collection: 'aws',
  url: 'data:image/svg+xml,<svg/>'
};

/** A full (non-lean) editor model using one pack icon. */
function fullModel() {
  return {
    title: 'Architecture',
    items: [{ id: 'i1', name: 'Web server', icon: 'aws-ec2' }],
    views: [],
    icons: [AWS_ICON],
    colors: []
  };
}

/** What `shareDiagram` emits — the snapshot field whitelist, applied verbatim. */
function snapshotOf(diagram: Record<string, unknown>) {
  return {
    title: diagram.title,
    name: diagram.name ?? diagram.title,
    icons: Array.isArray(diagram.icons) ? diagram.icons : [],
    colors: Array.isArray(diagram.colors) ? diagram.colors : [],
    items: Array.isArray(diagram.items) ? diagram.items : [],
    views: Array.isArray(diagram.views) ? diagram.views : [],
    fitToScreen: diagram.fitToScreen !== false,
    sharedAt: '2026-07-30T00:00:00.000Z',
    sourceId: 'd1'
  };
}

describe('SHARE-11 consumer — a shared diagram cannot discover its icon packs', () => {
  test('lazy pack loading is ON by default, so nothing loads a pack the payload does not ask for', () => {
    localStorage.removeItem('axoview-lazy-loading-enabled');
    expect(loadLazyLoadingPreference()).toBe(true);
  });

  test('CHARACTERIZATION: lean-save moves the pack signal into requiredPacks, and the snapshot drops it', () => {
    const lean = leanIfModel(fullModel()) as Record<string, unknown>;
    // --- preconditions: this IS the lean shape the backend stores ---
    expect(lean.requiredPacks).toEqual(['aws']);
    const leanIcons = lean.icons as Array<{ id: string }>;
    expect(leanIcons.map((i) => i.id)).not.toContain('aws-ec2'); // pack icon stripped
    const leanItems = lean.items as Array<{ icon: string }>;
    expect(leanItems[0].icon).toBe('aws-ec2'); // ...but still referenced

    const snapshot = snapshotOf(lean);

    // The only surviving record of "this diagram needs the aws pack" is gone.
    expect((snapshot as Record<string, unknown>).requiredPacks).toBeUndefined();
    // And the fallback signal cannot recover it: resolving `item.icon` to a
    // collection needs the icons array to contain that icon, which lean-save
    // removed. So the resolver sees no collections at all.
    const idToCollection = new Map(
      snapshot.icons
        .filter((i): i is typeof AWS_ICON => typeof (i as { collection?: unknown }).collection === 'string')
        .map((i) => [i.id, i.collection])
    );
    const resolved = snapshot.items
      .map((it) => idToCollection.get((it as { icon: string }).icon))
      .filter(Boolean);
    expect(resolved).toEqual([]);
  });

  test('CONTROL: the same resolution DOES work on the owner\'s load path, which keeps requiredPacks', () => {
    // The owner's open path reads `data.requiredPacks` straight off the stored
    // blob (DiagramLifecycleProvider passes it through), so the signal survives
    // there — the snapshot route is the only place it is lost.
    const lean = leanIfModel(fullModel()) as { requiredPacks?: string[] };
    expect(lean.requiredPacks).toEqual(['aws']);
  });

  test('CONTROL: a NON-lean payload resolves through the fallback, so the resolver itself is sound', () => {
    // A single-JSON import keeps pack icons inline; the cross-reference works and
    // finds the collection with no requiredPacks at all.
    const snapshot = snapshotOf(fullModel());
    const idToCollection = new Map(
      snapshot.icons.map((i) => [
        (i as typeof AWS_ICON).id,
        (i as typeof AWS_ICON).collection
      ])
    );
    const resolved = snapshot.items
      .map((it) => idToCollection.get((it as { icon: string }).icon))
      .filter(Boolean);
    expect(resolved).toEqual(['aws']);
  });
});
