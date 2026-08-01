/**
 * ADR 0003 lean-save, app side — A2/STOR-14. Promoted from the 2026-07
 * exploratory campaign's probe lane (`__explore__/A2/local-place-*`).
 *
 * `leanIfModel` kept only `collection === 'imported'`, a STRICTER rule than
 * ADR 0003 and than the lib's `stripDefaultIcons` — so every SAVE discarded
 * icons that every EXPORT preserved, and `mergeBundledFixtures` could not
 * restore them on load: they came back as tombstones.
 */
import { leanIfModel } from '../leanModel';
import {
  publishLoadedPackIcons,
  getBundledCatalog
} from '../../icons/bundledCatalog';

const icon = (id: string, collection?: string) => ({
  id,
  name: id,
  url: `data:${id}`,
  ...(collection ? { collection } : {})
});

const model = (icons: unknown[], iconRef = 'aws-ec2') => ({
  title: 'T',
  icons,
  items: [{ id: 'n1', name: 'N', icon: iconRef }],
  views: []
});

const iconsOf = (result: unknown) =>
  ((result as { icons: Array<{ id: string }> }).icons ?? []).map((i) => i.id);

// ADR 0003 addendum (2026-08-01): lean-save now compares against the HOST's
// catalog, so these tests publish one instead of depending on whatever the real
// isopacks happen to contain. That is the injection seam doing its job — the
// rule is under test, not the pack contents.
const CATALOG_AWS = {
  id: 'aws-ec2',
  name: 'aws-ec2',
  url: 'data:aws-ec2',
  collection: 'aws',
  isIsometric: true
};

beforeEach(() => {
  publishLoadedPackIcons([CATALOG_AWS] as never);
});

describe('leanIfModel keeps what the load path cannot bring back', () => {
  it('CONTROL: the catalog under test is the published one', () => {
    expect(getBundledCatalog().some((i) => i.id === 'aws-ec2')).toBe(true);
  });

  it('strips a pack icon — it is rehydrated from the pack on load', () => {
    // Byte-identical to the catalog entry, so it is reproducible on load.
    const result = leanIfModel(model([{ ...CATALOG_AWS }]));
    expect(iconsOf(result)).toEqual([]);
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual(['aws']);
  });

  it('keeps an imported icon — the user uploaded it', () => {
    const result = leanIfModel(model([icon('mine', 'imported')], 'mine'));
    expect(iconsOf(result)).toEqual(['mine']);
  });

  it('keeps an icon from a pack this build no longer ships', () => {
    // Its collection is neither `imported` nor loadable, so the save used to
    // drop it and nothing could restore it — the diagram reloaded with a
    // tombstone where the user's icon was.
    const result = leanIfModel(model([icon('legacy-1', 'retired-pack')], 'legacy-1'));
    expect(iconsOf(result)).toEqual(['legacy-1']);
  });

  it('keeps an icon with no collection at all', () => {
    const result = leanIfModel(model([icon('orphan')], 'orphan'));
    expect(iconsOf(result)).toEqual(['orphan']);
  });

  it('strips a bundled isoflow icon, which the loader always merges back', () => {
    // PRECONDITION: the core set really is in the catalog. (One argument —
    // Jest rejects the Playwright `expect(value, 'message')` form, which is
    // what `jestExpectArity.contract.test.ts` gates. It caught this line.)
    const core = getBundledCatalog().find((i) => i.collection === 'isoflow');
    expect(core).toBeTruthy();
    const result = leanIfModel(model([{ ...core }], core!.id));
    expect(iconsOf(result)).toEqual([]);
  });

  // A2/STOR-14's remaining half, closed in wave 4. Same id, different metadata:
  // the user renamed or re-pointed a bundled icon. Dropping it would let the
  // bundled original silently take its place on the next load.
  it('KEEPS a user OVERRIDE of a bundled icon', () => {
    const core = getBundledCatalog().find((i) => i.collection === 'isoflow')!;
    const overridden = { ...core, name: 'My renamed icon' };
    const result = leanIfModel(model([overridden], core.id));
    expect(iconsOf(result)).toEqual([core.id]);
  });

  // …and the boundary the other way: a pack icon whose pack is not loaded is
  // still reproducible, because requiredPacks refetches it on load. Keeping it
  // is what made the export fat (F5/ICON-01/02).
  it('strips a pack icon whose pack is NOT currently loaded', () => {
    const result = leanIfModel(model([icon('gcp-run', 'gcp')], 'gcp-run'));
    expect(iconsOf(result)).toEqual([]);
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual(['gcp']);
  });
});
