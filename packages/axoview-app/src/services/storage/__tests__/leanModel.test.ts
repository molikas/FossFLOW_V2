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

/**
 * E4/CLIP-14, the icon-reference half — folded into the E2 reference-integrity
 * pass because that is what it is: a reference to something that is not there,
 * and the fix is a derivation next to the validation work rather than a new
 * validation rule.
 *
 * The entry's repro: paste a node from a diagram that loaded a pack into one
 * that did not. `model.items[n].icon` names an id absent from `model.icons`,
 * both `modelSchema` and `validateView` accept it (deliberately — icons come
 * from separately-loaded packs), and the save then derived `requiredPacks` only
 * from icons it could see. The pack was never named, the load path never
 * fetched it, and the node returned as a tombstone.
 */
describe('CLIP-14 — requiredPacks learns about an icon ref the model cannot resolve', () => {
  const pasted = (extra: Record<string, unknown> = {}) => ({
    title: 'T',
    icons: [],
    items: [{ id: 'n1', name: 'Pasted', icon: 'aws-ec2' }],
    views: [],
    ...extra
  });

  it('PRECONDITION: the ref really is unresolvable within the model', () => {
    expect(pasted().icons).toEqual([]);
    expect(pasted().items[0].icon).toBe('aws-ec2');
  });

  it('the pack is recovered from the catalog and recorded', () => {
    const result = leanIfModel(pasted());
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual(['aws']);
  });

  it('CONTROL: an id the catalog has never heard of records nothing', () => {
    // The derivation must not invent a pack name. An id from a pack this build
    // does not ship is genuinely unrecoverable — the right outcome is an empty
    // list, not a guess the loader would chase.
    const result = leanIfModel({
      ...pasted(),
      items: [{ id: 'n1', name: 'Pasted', icon: 'who-knows' }]
    });
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual([]);
  });

  it('CONTROL: a CORE id resolves but contributes no pack', () => {
    // `isoflow` is bundled, so naming it in requiredPacks would send the loader
    // after a pack that does not exist. Resolved, and correctly silent.
    const core = getBundledCatalog().find((i) => i.collection === 'isoflow')!;
    const result = leanIfModel({
      ...pasted(),
      items: [{ id: 'n1', name: 'Pasted', icon: core.id }]
    });
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual([]);
  });

  // The reason the derivation is a UNION now rather than an either/or. An
  // already-lean model re-saved with one unresolvable ref used to discard the
  // packs it HAD derived and fall back to the input's list wholesale; a model
  // with no list at all lost them outright.
  it('an unresolvable ref does not discard the packs that DID derive', () => {
    const result = leanIfModel({
      title: 'T',
      icons: [icon('gcp-run', 'gcp')],
      items: [
        { id: 'n1', name: 'Resolvable', icon: 'gcp-run' },
        { id: 'n2', name: 'Not', icon: 'who-knows' }
      ],
      views: []
    });
    expect(
      ((result as { requiredPacks: string[] }).requiredPacks ?? []).sort()
    ).toEqual(['gcp']);
  });

  it('and an existing list is preserved ALONGSIDE them, not instead', () => {
    const result = leanIfModel({
      title: 'T',
      icons: [icon('gcp-run', 'gcp')],
      items: [
        { id: 'n1', name: 'Resolvable', icon: 'gcp-run' },
        { id: 'n2', name: 'Not', icon: 'who-knows' }
      ],
      views: [],
      requiredPacks: ['azure']
    });
    expect(
      ((result as { requiredPacks: string[] }).requiredPacks ?? []).sort()
    ).toEqual(['azure', 'gcp']);
  });

  it('a fully-resolved model still drops a pack nothing references any more', () => {
    // The authoritative case must survive the union: `requiredPacks` is a fetch
    // list, and keeping a stale entry forever would refetch a pack the diagram
    // no longer uses on every load.
    const result = leanIfModel({
      title: 'T',
      icons: [{ ...CATALOG_AWS }],
      items: [{ id: 'n1', name: 'N', icon: 'aws-ec2' }],
      views: [],
      requiredPacks: ['azure']
    });
    expect((result as { requiredPacks: string[] }).requiredPacks).toEqual(['aws']);
  });
});
