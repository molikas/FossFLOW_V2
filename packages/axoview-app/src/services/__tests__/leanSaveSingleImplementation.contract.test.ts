/**
 * CLASS GATE — one lean-save implementation, lib-owned algorithm, host-injected
 * catalog (ADR 0047 §3; ADR 0003 addendum, owner ruling 2026-08-01).
 *
 * The class: **the same rule implemented on both sides of the app/lib
 * boundary.** ADR 0003's lean-save existed twice with different answers —
 *
 *   - `axoview-lib/src/utils/leanSave.ts` ran against `src/fixtures/icons.ts`,
 *     which exported `[]`. With an empty catalog it stripped nothing, so
 *     "Export as JSON" and the project ZIP wrote every icon the session had
 *     loaded (the whole AWS / GCP / Azure / Kubernetes / Material catalog, SVG
 *     payloads and all) into the file users mail around.
 *   - `axoview-app/src/services/storage/leanModel.ts` carried its own stricter
 *     rule (`collection === 'imported'`), used by every StorageProvider, which
 *     wrote one icon for the same model — and discarded two kinds of user data
 *     on the way (A2/STOR-14).
 *
 * Neither half was obviously wrong on its own. The defect was that there were
 * two, and the lib's half was inert, so its own unit suite passed vacuously
 * (see leanSave.test.ts's header) and nothing compared the two outputs.
 *
 * WHAT THIS GATE ASSERTS
 *   §1 the algorithm exists exactly once, in the lib, and takes a catalog;
 *   §2 no app-side module re-implements the strip rule;
 *   §3 the lib holds no catalog of its own — the retired fixture stays retired;
 *   §4 the two halves agree on the same input, which is the property the class
 *      is really about (and the one a source scan alone cannot see).
 */
import fs from 'fs';
import path from 'path';
import { stripDefaultIcons } from 'axoview';
import type { Icon } from 'axoview';
import { leanIfModel } from '../storage/leanModel';
import {
  publishLoadedPackIcons,
  getBundledCatalog,
  isBundledIconOverride,
  isRehydratableIcon
} from '../icons/bundledCatalog';

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const LIB_SRC = path.join(REPO, 'packages', 'axoview-lib', 'src');
const APP_SRC = path.join(REPO, 'packages', 'axoview-app', 'src');

const readAll = (dir: string): { file: string; source: string }[] => {
  const out: { file: string; source: string }[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'dist', 'coverage', '__explore__'].includes(e.name))
          continue;
        walk(full);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push({ file: full, source: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir);
  return out;
};

// ---------------------------------------------------------------------------
// §1 — one algorithm, in the lib, catalog-parameterised
// ---------------------------------------------------------------------------

describe('class gate §1 — the algorithm exists once, in the lib', () => {
  const libFiles = readAll(LIB_SRC);

  it('CONTROL: the lib source was actually read', () => {
    expect(libFiles.length).toBeGreaterThan(100);
  });

  it('exactly one module DEFINES stripDefaultIcons', () => {
    const definers = libFiles.filter((f) =>
      /export const stripDefaultIcons\b/.test(f.source)
    );
    expect(definers.map((f) => path.basename(f.file))).toEqual(['leanSave.ts']);
  });

  it('and it takes a catalog parameter rather than reaching for one', () => {
    const leanSave = libFiles.find(
      (f) => path.basename(f.file) === 'leanSave.ts'
    )!;
    expect(leanSave.source).toMatch(/catalog: readonly Icon\[\]/);
    // The whole point of the ruling: no import of a catalog module.
    expect(leanSave.source).not.toMatch(/from '.*fixtures\/icons'/);
  });
});

// ---------------------------------------------------------------------------
// §2 — no second implementation app-side
// ---------------------------------------------------------------------------

describe('class gate §2 — the app implements no strip rule of its own', () => {
  const appFiles = readAll(APP_SRC);

  it('CONTROL: the app source was actually read', () => {
    expect(appFiles.length).toBeGreaterThan(50);
  });

  it('no app module defines its own strip/lean icon filter', () => {
    // The shape of the old duplicate: a predicate deciding per icon whether it
    // is the user's, defined app-side.
    //
    // `leanModel.ts` is NOT exempted, which is the point. Exempting it — the
    // obvious thing to do, since `applyIconStrip` legitimately lives there —
    // let the duplicate be re-introduced in exactly the file it used to live
    // in, and this gate passed a planted `isUserIcon` on its first red-check.
    // Only the permitted composition is named, by name.
    const PERMITTED = /const\s+applyIconStrip\s*=/;
    const offenders = appFiles
      .filter((f) =>
        /const\s+(isUserIcon|stripDefaultIcons|isBundledIcon)\s*=/.test(f.source)
      )
      .filter((f) => !PERMITTED.test(f.source) || /const\s+isUserIcon\s*=/.test(f.source))
      .map((f) => path.relative(REPO, f.file));
    expect(offenders).toEqual([]);
  });

  it('leanModel delegates to the lib rather than re-deriving', () => {
    const leanModel = appFiles.find(
      (f) => path.basename(f.file) === 'leanModel.ts'
    )!;
    expect(leanModel.source).toMatch(/from 'axoview'/);
    expect(leanModel.source).toMatch(/stripDefaultIcons\(/);
    // The one thing that legitimately stays app-side is which collections THIS
    // host can rehydrate — a question the lib cannot answer.
    expect(leanModel.source).toMatch(/isRehydratableIcon/);
  });

  it('the catalog has ONE owner, and one writer into its registry', () => {
    const writers = appFiles.filter((f) =>
      /export const publishLoadedPackIcons\b/.test(f.source)
    );
    expect(writers.map((f) => path.basename(f.file))).toEqual([
      'bundledCatalog.ts'
    ]);
    const callers = appFiles.filter(
      (f) =>
        path.basename(f.file) !== 'bundledCatalog.ts' &&
        /publishLoadedPackIcons\(/.test(f.source)
    );
    expect(callers.map((f) => path.basename(f.file))).toEqual([
      'DiagramLifecycleProvider.tsx'
    ]);
  });
});

// ---------------------------------------------------------------------------
// §3 — the lib holds no catalog
// ---------------------------------------------------------------------------

describe('class gate §3 — the retired lib-side catalog stays retired', () => {
  it('src/fixtures/icons.ts does not exist', () => {
    // Re-adding it (even "just for tests") re-creates the duplication: a
    // catalog on both sides of the boundary that drifts the moment a pack
    // changes, in a library that publishes standalone under a bundle-size gate.
    expect(fs.existsSync(path.join(LIB_SRC, 'fixtures', 'icons.ts'))).toBe(
      false
    );
  });

  it('no PRODUCTION lib module builds an icon catalog', () => {
    // Scoped deliberately. Two hits are legitimate and must not be silenced by
    // widening the gate later:
    //   - `SettingsDialog/AboutTab.tsx` names "@isoflow/isopacks" in prose (a
    //     credits line), which is text, not an import;
    //   - `src/examples/` builds one for the lib's own demo data. It is not on
    //     the published entry and nothing in the lean-save path reaches it.
    // What must stay true is that no module a HOST's save/export path can
    // reach constructs a catalog — `flattenCollections` is that construction.
    const builders = readAll(LIB_SRC)
      .filter((f) => !f.file.includes(`${path.sep}examples${path.sep}`))
      .filter((f) => /flattenCollections\s*\(/.test(f.source))
      .map((f) => path.relative(REPO, f.file));
    expect(builders).toEqual([]);
  });

  it('CONTROL: the catalog-building call IS detectable where it legitimately occurs', () => {
    // Otherwise the assertion above could pass because the pattern never
    // matches anything, anywhere.
    const anywhere = readAll(LIB_SRC).filter((f) =>
      /flattenCollections\s*\(/.test(f.source)
    );
    expect(anywhere.length).toBeGreaterThan(0);
    expect(
      anywhere.every((f) => f.file.includes(`${path.sep}examples${path.sep}`))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4 — the two halves agree (the property a scan cannot see)
// ---------------------------------------------------------------------------

describe('class gate §4 — save and export strip the SAME icons', () => {
  const CATALOG_PACK: Icon[] = [
    {
      id: 'aws-lambda',
      name: 'Lambda',
      url: 'u-lambda',
      collection: 'aws',
      isIsometric: true
    } as Icon
  ];

  const model = () => ({
    title: 'T',
    version: '1.0.0',
    items: [{ id: 'i1', name: 'N', icon: 'aws-lambda' }],
    views: [],
    colors: [],
    icons: [
      // reproducible from a pack → both halves drop it
      { ...CATALOG_PACK[0] },
      // the user's own → both halves keep it
      { id: 'mine', name: 'Mine', url: 'u-mine', collection: 'imported' },
      // an OVERRIDE of a catalog entry → both halves keep it (A2/STOR-14)
      { ...CATALOG_PACK[0], id: 'aws-lambda-2', name: 'Lambda' },
      { ...CATALOG_PACK[0], name: 'MY Lambda' }
    ] as Icon[]
  });

  beforeEach(() => {
    publishLoadedPackIcons(CATALOG_PACK);
  });

  it('CONTROL: the published catalog is live and non-empty', () => {
    const catalog = getBundledCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.some((i) => i.id === 'aws-lambda')).toBe(true);
  });

  it('the SAVE and EXPORT paths agree on every icon the catalog can speak about', () => {
    const catalog = getBundledCatalog();
    const catalogIds = new Set(catalog.map((i) => i.id));
    const saved = leanIfModel(model()) as { icons: Icon[] };
    const exported = stripDefaultIcons(model(), catalog);
    const known = (icons: Icon[]) =>
      icons
        .filter((i) => catalogIds.has(i.id))
        .map((i) => i.id)
        .sort();
    expect(known(saved.icons)).toEqual(known(exported.icons));
  });

  /**
   * The ONE case where they legitimately differ, pinned so it stays deliberate.
   *
   * A pack icon whose pack is not loaded in this session is absent from the
   * catalog, so the LIB cannot tell it from the user's own icon and keeps it.
   * The SAVE path drops it, because it knows something the lib cannot:
   * `requiredPacks` refetches that pack on load, so the icon is reproducible.
   *
   * This is not a second implementation of the strip rule — it is host
   * knowledge the lib has no way to hold. If that ever stops being true (a
   * host hands the lib its full pack list), the divergence should go, and this
   * test is where that decision gets re-made.
   */
  it('…and diverge ONLY on a pack icon whose pack is not loaded', () => {
    const catalog = getBundledCatalog();
    const catalogIds = new Set(catalog.map((i) => i.id));
    const saved = leanIfModel(model()) as { icons: Icon[] };
    const exported = stripDefaultIcons(model(), catalog);

    const savedIds = new Set(saved.icons.map((i) => i.id));
    const onlyInExport = exported.icons.filter((i) => !savedIds.has(i.id));

    // PRECONDITION: the fixture actually contains such an icon, or this passes
    // for the wrong reason.
    expect(onlyInExport.length).toBeGreaterThan(0);
    onlyInExport.forEach((icon) => {
      expect(catalogIds.has(icon.id)).toBe(false);
      expect(isRehydratableIcon(icon)).toBe(true);
    });
    // Nothing goes the other way: the save never keeps what the export drops.
    const exportedIds = new Set(exported.icons.map((i) => i.id));
    expect(saved.icons.filter((i) => !exportedIds.has(i.id))).toEqual([]);
  });

  it("…and both keep the user's OVERRIDE rather than letting the original win", () => {
    const saved = leanIfModel(model()) as { icons: Icon[] };
    const kept = saved.icons.find((i) => i.id === 'aws-lambda');
    expect(kept?.name).toBe('MY Lambda');
    expect(isBundledIconOverride(kept as Icon, getBundledCatalog())).toBe(true);
  });

  it('CONTROL: a pure duplicate really is dropped, so the agreement is not "keep everything"', () => {
    const pure = {
      ...model(),
      icons: [{ ...CATALOG_PACK[0] }] as Icon[]
    };
    expect((leanIfModel(pure) as { icons: Icon[] }).icons).toEqual([]);
    expect(stripDefaultIcons(pure, getBundledCatalog()).icons).toEqual([]);
  });
});
