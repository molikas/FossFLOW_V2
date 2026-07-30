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

describe('leanIfModel keeps what the load path cannot bring back', () => {
  it('strips a pack icon — it is rehydrated from the pack on load', () => {
    const result = leanIfModel(model([icon('aws-ec2', 'aws')]));
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

  it('strips the bundled isoflow set, which the loader always merges back', () => {
    const result = leanIfModel(model([icon('block', 'isoflow')], 'block'));
    expect(iconsOf(result)).toEqual([]);
  });
});
