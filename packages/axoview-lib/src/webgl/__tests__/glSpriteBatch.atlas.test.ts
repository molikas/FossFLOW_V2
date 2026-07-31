/**
 * Promoted from the 2026-07 exploratory lane (R2/GL-02, GL-05, GL-07, GL-12 and
 * their R3 amplifier GPU-14). `glSpriteBatch.ts` had ZERO tests — jsdom has no
 * WebGL2, and the module feature-checks for it precisely so a stub falls back to
 * null. That check is also the way in: `glStub` supplies exactly what the batch
 * calls, so these drive the REAL packer, the REAL UV math and the REAL staging
 * buffer.
 *
 * The area's headline was that the atlas has no eviction at all, only a full
 * reset — and the leak is KEY CHURN (`texKey` interpolates the node name and
 * every style token, so a rename mints a new key and leaks the old slot), which
 * reaches overflow without any node-count growth.
 */
import {
  installDrawing2DStub,
  makeStubCanvas,
  chip
} from '../glStub';
import { createSpriteBatch, isWebGL2Supported } from '../glSpriteBatch';

installDrawing2DStub();

const build = (
  atlasSize = 256,
  opts: Parameters<typeof makeStubCanvas>[0] = {}
) => {
  const { canvas } = makeStubCanvas(opts);
  const batch = createSpriteBatch(canvas, atlasSize);
  if (!batch) throw new Error('rig: createSpriteBatch returned null');
  return batch;
};

/** One full build cycle packing `keys`, returning how many packed successfully. */
const packBuild = (
  batch: ReturnType<typeof build>,
  keys: string[],
  size = 60
) => {
  batch.beginInstances();
  let packed = 0;
  for (const key of keys) {
    if (batch.putCanvas(key, 0, () => chip(size, size, key))) packed += 1;
  }
  batch.commitInstances();
  return packed;
};

describe('atlas overflow is signalled to the caller (GL-02)', () => {
  it('reports an overflow once, so the layer can schedule ONE rebuild', () => {
    const batch = build(256);

    // Enough 60px chips to exhaust a 256 atlas several times over.
    const many = Array.from({ length: 60 }, (_, i) => `k${i}`);
    const packed = packBuild(batch, many);
    expect(packed).toBeLessThan(many.length); // precondition: it really overflowed

    // Before this there was no flag, counter or callback on the surface at all,
    // so the caller could not know a chip was missing — and the compaction only
    // happens inside the NEXT beginInstances, which only a geometry change
    // triggers. Missing chips persisted on screen indefinitely.
    expect(batch.atlasOverflowed()).toBe(true);
    // …and only once per episode, or a scene that genuinely does not fit spins.
    expect(batch.atlasOverflowed()).toBe(false);
  });

  it('does not report an overflow for a build that packed everything', () => {
    const batch = build(1024);
    const packed = packBuild(batch, ['a', 'b', 'c']);
    expect(packed).toBe(3);
    expect(batch.atlasOverflowed()).toBe(false);
  });

  it('re-arms after a build that fits, so a later overflow is reported again', () => {
    const batch = build(256);
    packBuild(batch, Array.from({ length: 60 }, (_, i) => `x${i}`));
    expect(batch.atlasOverflowed()).toBe(true);

    // A clean build in between.
    packBuild(batch, ['solo']);
    expect(batch.atlasOverflowed()).toBe(false);

    packBuild(batch, Array.from({ length: 60 }, (_, i) => `y${i}`));
    expect(batch.atlasOverflowed()).toBe(true);
  });
});

describe('key churn is reclaimed (GL-05)', () => {
  it('a chip restyled many times keeps drawing', () => {
    const batch = build(256);

    // The measured shape: ONE logical chip, a new key per restyle (`texKey`
    // interpolates the name and every style token). Each build uses only the
    // current key, so every previous slot is dead the moment the next build
    // runs. Six bumps used to occupy six slots and one chip filled a 256 atlas
    // on its own; from there it never drew again for the session.
    //
    // The guarantee is "never STAYS unpacked", not "never misses once": a build
    // that overflows drops the chip for that frame and the next build compacts
    // (the generation sweep usually gets there first). One dropped frame, not a
    // dead layer.
    let misses = 0;
    for (let i = 0; i < 400; i += 1) {
      batch.beginInstances();
      const uv = batch.putCanvas(`chip@v${i}`, 0, () => chip(60, 60, `v${i}`));
      batch.commitInstances();
      if (uv === null) {
        misses += 1;
        // A miss must be recoverable on the very next build.
        batch.beginInstances();
        const retry = batch.putCanvas(`chip@v${i}`, 0, () =>
          chip(60, 60, `v${i}`)
        );
        batch.commitInstances();
        if (retry === null) {
          throw new Error(`restyle #${i}: still unpacked after a compaction`);
        }
      }
    }
    // 400 restyles into a 256 atlas (~15 chips) leaked 400 slots before the fix.
    // A handful of compaction frames is the cost; a fifth of them is not.
    expect(misses).toBeLessThan(80);
  });

  it('keeps a chip that IS still in use across builds', () => {
    const batch = build(1024);
    batch.beginInstances();
    const first = batch.putCanvas('keep', 0, () => chip(60, 60, 'keep'));
    batch.commitInstances();

    for (let i = 0; i < 5; i += 1) {
      batch.beginInstances();
      const again = batch.putCanvas('keep', 0, () => {
        throw new Error('rig: a cached key must not be re-rasterised');
      });
      batch.commitInstances();
      expect(again).toEqual(first);
    }
  });
});

describe('the substrate gate agrees with the substrate (GL-07)', () => {
  /** Point `document.createElement('canvas')` at a stub for one call. */
  const withStubCanvas = <T,>(
    opts: Parameters<typeof makeStubCanvas>[0],
    run: () => T
  ): T => {
    const { canvas } = makeStubCanvas(opts);
    const original = document.createElement.bind(document);
    jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, ...rest: unknown[]) =>
        tag === 'canvas'
          ? canvas
          : (original(tag as never, ...(rest as never[])) as never)
      );
    try {
      return run();
    } finally {
      (document.createElement as unknown as jest.SpyInstance).mockRestore();
    }
  };

  /** Fresh module registry — the gate memoises for the tab's life. */
  const freshGate = (): (() => boolean) => {
    let fn: () => boolean = () => false;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      fn = require('../glSpriteBatch').isWebGL2Supported;
    });
    return fn;
  };

  it('is FALSE for a context that passes the old checks but cannot build', () => {
    // The exact shape the campaign found: a `webgl2` context whose
    // `createVertexArray` is a function — everything the OLD gate asked — but
    // whose shader compile fails. It returned true, `WebGLUnsupportedScreen` was
    // waved through, and the node layer rendered nothing, permanently, with a
    // console.warn as the only trace. The diagram simply appeared empty.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const supported = withStubCanvas({ failCompile: true }, () =>
        freshGate()()
      );
      expect(supported).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('is TRUE for a context that really can build one', () => {
    // Control — the gate is not simply always-false now.
    expect(withStubCanvas({}, () => freshGate()())).toBe(true);
  });

  it('the exported gate is still callable in this environment', () => {
    expect(typeof isWebGL2Supported()).toBe('boolean');
  });
});

describe('a clamped atlas is diagnosable (GL-12)', () => {
  it('warns when MAX_TEXTURE_SIZE shrinks the requested atlas', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // A device whose cap is 2048, asked for the 8192 NodesCanvas requests —
      // the atlas silently held under a third of the chips, and the overflow
      // above became reachable at ordinary diagram sizes with no diagnostic.
      build(8192, { maxTextureSize: 2048 });
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes('atlas clamped'))
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('is silent when the requested atlas fits', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      build(1024, { maxTextureSize: 4096 });
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes('atlas clamped'))
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
