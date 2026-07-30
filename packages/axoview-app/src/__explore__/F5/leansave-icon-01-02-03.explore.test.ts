/**
 * F5 / ICON-01, ICON-02, ICON-03 — ADR 0003 lean-save, written twice.
 *
 * There are two implementations of "strip the pack icons before persisting":
 *
 *   - `leanIfModel` (axoview-app, `services/storage/leanModel.ts`) — used by
 *     every StorageProvider. Rule: keep `collection === 'imported'` only, and
 *     record `requiredPacks`.
 *   - `stripDefaultIcons` (axoview-lib, `utils/leanSave.ts`) — used by
 *     `exportAsJSON` and the project-ZIP export. Rule: drop anything that is a
 *     byte-for-byte duplicate of a BUNDLED FIXTURE.
 *
 * This probe runs one realistic model through both.
 */
import { stripDefaultIcons, mergeBundledFixtures } from 'axoview';
import type { Icon, Model } from 'axoview';
import { leanIfModel } from '../../services/storage/leanModel';

const icon = (id: string, collection: string): Icon =>
  ({ id, name: id, url: `data:image/svg+xml;base64,${'A'.repeat(2000)}`, collection }) as Icon;

/** What the model store actually holds once the app has merged the packs in. */
const loadedModel = () =>
  ({
    version: '1.0',
    title: 'probe',
    items: [{ id: 'n1', name: 'N', icon: 'aws-ec2' }],
    views: [],
    colors: [],
    icons: [
      icon('aws-ec2', 'aws'),
      icon('gcp-run', 'gcp'),
      icon('core-block', 'isoflow'),
      icon('my-logo', 'imported')
    ]
  }) as unknown as Model;

describe('ICON-01 — the two lean-save implementations disagree', () => {
  it('CONTROL: the storage path strips every pack icon and keeps the imported one', () => {
    const out = leanIfModel(loadedModel()) as Model & { requiredPacks: string[] };
    expect(out.icons.map((i) => i.id)).toEqual(['my-logo']);
    expect(out.requiredPacks).toEqual(['aws']);
  });

  it('ICON-01: the JSON-export path strips NOTHING — the whole loaded catalog is written to the file', () => {
    const out = stripDefaultIcons(loadedModel());
    expect(out.icons.map((i) => i.id)).toEqual([
      'aws-ec2',
      'gcp-run',
      'core-block',
      'my-logo'
    ]);
  });

  it('ICON-02: the reason is that the bundled-fixture list is EMPTY, so both halves of the lib round trip are inert', () => {
    // `src/fixtures/icons.ts` exports `[]`, so nothing can ever match a fixture
    // on save and nothing can ever be merged back on load.
    const merged = mergeBundledFixtures({ icons: [] as Icon[] } as Model);
    expect(merged.icons).toEqual([]);
    // …which also means the ADR 0002 "the side dock always has the full catalog
    // regardless of what was saved" guarantee is delivered by the APP's pack
    // manager alone, not by this merge.
    const strippedEmpty = stripDefaultIcons({ icons: [] as Icon[] } as Model);
    expect(strippedEmpty.icons).toEqual([]);
  });

  it('CHARACTERIZATION: the size difference is the whole payload, not a rounding error', () => {
    const model = loadedModel();
    const viaStorage = JSON.stringify(leanIfModel(model)).length;
    const viaExport = JSON.stringify(stripDefaultIcons(model)).length;
    expect(viaExport).toBeGreaterThan(viaStorage * 2);
  });
});

describe('ICON-03 — what the export file does to the importer', () => {
  it('an exported JSON carries pack icons with their real collection, so a re-import re-adds them as pack icons', () => {
    const exported = stripDefaultIcons(loadedModel());
    // Round-tripping that file through the storage lean-save strips them again
    // — so the icons only bloat the FILE, they do not become permanent.
    const reLeaned = leanIfModel(
      JSON.parse(JSON.stringify(exported))
    ) as Model & { requiredPacks: string[] };
    expect(reLeaned.icons.map((i) => i.id)).toEqual(['my-logo']);
    expect(reLeaned.requiredPacks).toEqual(['aws']);
  });

  it('CONTROL: an already-lean payload keeps its recorded requiredPacks rather than deriving []', () => {
    const lean = {
      version: '1.0',
      title: 'probe',
      items: [{ id: 'n1', name: 'N', icon: 'aws-ec2' }],
      views: [],
      colors: [],
      icons: [icon('my-logo', 'imported')],
      requiredPacks: ['aws']
    };
    const out = leanIfModel(lean) as { requiredPacks: string[] };
    expect(out.requiredPacks).toEqual(['aws']);
  });
});
