/**
 * F5 / ICON-04, ICON-05, ICON-06 — the icon-pack manager's persisted
 * preferences and the icon-usage scan.
 *
 * `iconPackManager` reads two localStorage keys at boot and hands the result
 * straight to `loadIconPack`, which throws on an unknown name. `persistedSettings`
 * (the lib's equivalent) wraps every access in try/catch and validates nothing
 * either — the probes below ask what each one does with a hostile store.
 */
import {
  loadEnabledPacks,
  loadLazyLoadingPreference,
  loadIconPack
} from '../../services/iconPackManager';
import { scanIconUsage } from '../../services/iconUsage';

const ALL = ['aws', 'gcp', 'azure', 'kubernetes', 'material'];

beforeEach(() => {
  localStorage.clear();
});

describe('ICON-04 — a corrupt enabled-packs preference', () => {
  it('CONTROL: valid input round-trips, and a JSON parse error falls back to every pack', () => {
    localStorage.setItem('axoview-enabled-icon-packs', JSON.stringify(['aws']));
    expect(loadEnabledPacks()).toEqual(['aws']);
    localStorage.setItem('axoview-enabled-icon-packs', '{not json');
    expect(loadEnabledPacks()).toEqual(ALL);
  });

  it('ICON-04: well-formed JSON of the WRONG SHAPE passes the try/catch untouched', () => {
    // The guard is `try { JSON.parse(...) } catch { return ALL }` with no shape
    // check, so anything that parses is returned as-is and typed as
    // `IconPackName[]` by assertion.
    localStorage.setItem('axoview-enabled-icon-packs', JSON.stringify('aws'));
    expect(loadEnabledPacks()).toBe('aws' as never);

    localStorage.setItem('axoview-enabled-icon-packs', JSON.stringify(null));
    expect(loadEnabledPacks()).toBeNull();

    localStorage.setItem(
      'axoview-enabled-icon-packs',
      JSON.stringify(['aws', 'AWS', 'not-a-pack'])
    );
    expect(loadEnabledPacks()).toEqual(['aws', 'AWS', 'not-a-pack']);
  });

  it('CHARACTERIZATION: and the consumer of a bad name throws rather than skipping it', async () => {
    await expect(loadIconPack('not-a-pack' as never)).rejects.toThrow(
      /Unknown icon pack/
    );
  });
});

describe('ICON-05 — localStorage that throws', () => {
  const withHostileStorage = <T>(fn: () => T): T | Error => {
    const real = Object.getOwnPropertyDescriptor(
      window,
      'localStorage'
    ) as PropertyDescriptor;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }
    });
    try {
      return fn();
    } catch (e) {
      return e as Error;
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
  };

  it('CONTROL: the hostile store really throws, and a GUARDED reader of the same shape survives it', () => {
    // Without this the probe below could pass for the wrong reason.
    expect(withHostileStorage(() => localStorage.getItem('x'))).toBeInstanceOf(
      Error
    );
    // The shape `config/persistedSettings.ts` uses for every access — the lib's
    // own preference reader, which is why a blocked store does not crash it.
    const guarded = () => {
      try {
        return localStorage.getItem('x');
      } catch {
        return null;
      }
    };
    expect(withHostileStorage(guarded)).toBeNull();
  });

  it('ICON-05: the pack manager\'s readers do not — they propagate the throw', () => {
    expect(withHostileStorage(() => loadEnabledPacks())).toBeInstanceOf(Error);
    expect(withHostileStorage(() => loadLazyLoadingPreference())).toBeInstanceOf(
      Error
    );
  });
});

describe('ICON-06 — the icon-usage scan and soft-deleted diagrams', () => {
  const makeStorage = (
    diagrams: Array<{ meta: Record<string, unknown>; data: unknown }>
  ) =>
    ({
      listDiagrams: async () => diagrams.map((d) => d.meta),
      loadDiagram: async (id: string) =>
        diagrams.find((d) => d.meta.id === id)?.data
    }) as never;

  const args = (storage: unknown) => ({
    storage: storage as never,
    iconId: 'aws-ec2',
    currentDiagramId: null,
    currentDiagramName: null,
    currentDiagramItems: null
  });

  it('CONTROL: a live diagram using the icon IS reported', async () => {
    const storage = makeStorage([
      {
        meta: { id: 'd1', name: 'Live' },
        data: { items: [{ icon: 'aws-ec2' }] }
      }
    ]);
    const report = await scanIconUsage(args(storage));
    expect(report.map((r) => r.diagramId)).toEqual(['d1']);
  });

  it('ICON-06: a SOFT-DELETED diagram using the same icon is reported as using nothing', async () => {
    const storage = makeStorage([
      {
        meta: { id: 'd1', name: 'Trashed', deletedAt: '2026-07-30T00:00:00.000Z' },
        data: { items: [{ icon: 'aws-ec2' }] }
      }
    ]);
    const report = await scanIconUsage(args(storage));
    // The delete-confirm flow therefore tells the user the icon is unused, and
    // restoring the diagram later resurrects a dangling icon reference
    // (CLIP-14's class: unknown icon refs pass every validation layer).
    expect(report).toEqual([]);
  });
});
