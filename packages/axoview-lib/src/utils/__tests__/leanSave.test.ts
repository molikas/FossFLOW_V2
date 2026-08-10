import { stripDefaultIcons, mergeBundledFixtures } from '../leanSave';
import type { Icon } from 'src/types';

/**
 * ADR 0003 lean-save, against an INJECTED catalog (addendum 2026-08-01).
 *
 * **This suite used to be vacuous, and that is part of the finding.** It
 * imported `src/fixtures/icons`, which exported `[]`, and used it as both the
 * catalog AND the test data — so "drops icons that are pure duplicates"
 * asserted that `[]` strips to `[]`, and the override case was skipped with a
 * comment saying it was "unreachable in production". Every case passed no
 * matter what the implementation did. F5/ICON-01/02's real symptom (Export as
 * JSON writing the whole loaded catalog) was invisible to the one suite whose
 * job was to catch it, because an empty fixture makes the code and its tests
 * agree on nothing.
 *
 * The catalog below is TEST-ONLY and declared here, not in a shipped fixtures
 * module: the ruling is that the lib holds no catalog at all.
 */
const CATALOG: Icon[] = [
  {
    id: 'core-server',
    name: 'Server',
    url: 'data:image/svg+xml;base64,c2VydmVy',
    collection: 'isoflow',
    isIsometric: true
  },
  {
    id: 'core-db',
    name: 'Database',
    url: 'data:image/svg+xml;base64,ZGI=',
    collection: 'isoflow',
    isIsometric: true
  },
  {
    id: 'aws-lambda',
    name: 'Lambda',
    url: 'data:image/svg+xml;base64,bGFtYmRh',
    collection: 'aws',
    isIsometric: true
  }
] as Icon[];

const baseModel = (icons: Icon[]) => ({
  title: 'Test',
  version: '1.0.0',
  icons,
  colors: [],
  items: [],
  views: []
});

const clone = (icons: Icon[]) => icons.map((i) => ({ ...i }));

describe('stripDefaultIcons — against an injected catalog (ADR 0003)', () => {
  it('CONTROL: the catalog is non-empty, so these assertions can fail', () => {
    // The guard the old suite lacked. With an empty catalog every case below
    // passes trivially, which is exactly how ICON-01/02 survived its own tests.
    expect(CATALOG.length).toBeGreaterThan(0);
  });

  it('drops icons that are pure duplicates of a catalog entry', () => {
    const stripped = stripDefaultIcons(baseModel(clone(CATALOG)), CATALOG);
    expect(stripped.icons).toEqual([]);
  });

  it('preserves a custom icon (id absent from the catalog)', () => {
    const custom = {
      id: 'custom-1',
      name: 'Custom',
      url: 'data:image/svg+xml;base64,YWJj'
    } as Icon;
    const stripped = stripDefaultIcons(
      baseModel([...clone(CATALOG), custom]),
      CATALOG
    );
    expect(stripped.icons).toEqual([custom]);
  });

  it("preserves a user's OVERRIDE — same id, changed metadata (A2/STOR-14)", () => {
    // Dropping this would let the catalog's original silently take its place on
    // the next load, discarding the edit with no message. This is the case the
    // old suite declared untestable.
    const overridden = { ...CATALOG[0], name: 'User-renamed' };
    const stripped = stripDefaultIcons(baseModel([overridden]), CATALOG);
    expect(stripped.icons).toEqual([overridden]);
  });

  it('a differing url is an override too, not just a differing name', () => {
    const repointed = { ...CATALOG[1], url: 'data:image/svg+xml;base64,bmV3' };
    expect(stripDefaultIcons(baseModel([repointed]), CATALOG).icons).toEqual([
      repointed
    ]);
  });

  it('strips a pack icon the same way as a core one — collection is not a special case', () => {
    const lambda = CATALOG.find((i) => i.id === 'aws-lambda')!;
    expect(
      stripDefaultIcons(baseModel([{ ...lambda }]), CATALOG).icons
    ).toEqual([]);
  });

  it('an EMPTY catalog strips NOTHING — a host that forgets to inject loses bytes, never data', () => {
    const model = baseModel(clone(CATALOG));
    expect(stripDefaultIcons(model, []).icons).toHaveLength(CATALOG.length);
    expect(stripDefaultIcons(model).icons).toHaveLength(CATALOG.length);
  });

  it('handles a model with no icons array at all', () => {
    expect(
      stripDefaultIcons(
        { icons: undefined } as unknown as { icons: Icon[] },
        CATALOG
      ).icons
    ).toEqual([]);
  });
});

describe('mergeBundledFixtures — the load-side twin (ADR 0002)', () => {
  it('adds every catalog entry the model does not already carry', () => {
    const merged = mergeBundledFixtures(baseModel([]), CATALOG);
    expect(merged.icons.map((i) => i.id).sort()).toEqual(
      CATALOG.map((i) => i.id).sort()
    );
  });

  it("the MODEL's entry wins on collision, which is what preserves an override", () => {
    const overridden = { ...CATALOG[0], name: 'User-renamed' };
    const merged = mergeBundledFixtures(baseModel([overridden]), CATALOG);
    expect(merged.icons.find((i) => i.id === CATALOG[0].id)?.name).toBe(
      'User-renamed'
    );
    // …and the rest of the catalog still arrives.
    expect(merged.icons).toHaveLength(CATALOG.length);
  });

  it('an EMPTY catalog is a no-op rather than a wipe', () => {
    const model = baseModel(clone(CATALOG));
    expect(mergeBundledFixtures(model, []).icons).toHaveLength(CATALOG.length);
  });
});

describe('round-trip: strip then merge', () => {
  it('restores the full set, with the custom icon intact', () => {
    const custom = { id: 'custom-1', name: 'Custom', url: 'u' } as Icon;
    const original = baseModel([...clone(CATALOG), custom]);

    const lean = stripDefaultIcons(original, CATALOG);
    expect(lean.icons).toHaveLength(1); // only the custom one is persisted

    const restored = mergeBundledFixtures(lean, CATALOG);
    expect(restored.icons.map((i) => i.id).sort()).toEqual(
      original.icons.map((i) => i.id).sort()
    );
    expect(restored.icons.find((i) => i.id === 'custom-1')).toEqual(custom);
  });
});
