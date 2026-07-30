/**
 * R2 / GL-01 … GL-05, GL-07, GL-09 … GL-12 — the atlas packer and the batch
 * lifecycle, driven through the REAL `createSpriteBatch` on the recording stub
 * in `./glStub.ts`.
 *
 * `glSpriteBatch.ts` has zero tests. The module's own jsdom guard (it
 * feature-checks `createVertexArray` / `vertexAttribDivisor` / `getParameter`
 * so a canvas-mock falls back to null) is the way in: supply those and the real
 * packer, the real UV math and the real staging buffer all run.
 *
 * Rig rules: each block asserts its PRECONDITION (that the batch was created at
 * all, that the atlas really overflowed, that the upload really happened)
 * before drawing a conclusion, and every `it.failing` is paired with a passing
 * characterization of the observed behaviour.
 */
import { installDrawing2DStub, makeStubCanvas, chip } from './glStub';

installDrawing2DStub();

// eslint-disable-next-line import/first
import { createSpriteBatch, atlasUVRect } from 'src/webgl/glSpriteBatch';

/** The two built-ins the batch packs during construction: dot (32) + white (4). */
const BUILTIN_UPLOADS = 2;

describe('rig: the stub really drives the real batch', () => {
  it('createSpriteBatch succeeds and packs its two built-ins', () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 4096);
    expect(batch).not.toBeNull();
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS);
    expect(rec.uploads[0]).toMatchObject({ x: 0, y: 0, w: 32, h: 32 });
    expect(rec.uploads[1]).toMatchObject({ x: 34, y: 0, w: 4, h: 4 });
    // The dot UV is the real half-texel inset of its slot.
    expect(batch!.dot).toEqual(atlasUVRect(0, 0, 32, 32, 4096));
  });
});

// ---------------------------------------------------------------------------
// GL-01 — putImage ignores the version its sibling putCanvas honours
// ---------------------------------------------------------------------------

describe('GL-01 — putImage has no version check', () => {
  const setup = () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 4096)!;
    expect(batch).not.toBeNull();
    rec.uploads.length = 0; // drop the two built-ins
    return { batch, rec };
  };

  it('characterization: putCanvas re-packs on a version bump', () => {
    const { batch, rec } = setup();
    const a = batch.putCanvas('k', 0, () => chip(16, 16, 'A'));
    const b = batch.putCanvas('k', 1, () => chip(16, 16, 'B'));
    expect(rec.uploads).toHaveLength(2);
    expect((rec.uploads[0].source as { tag: string }).tag).toBe('A');
    expect((rec.uploads[1].source as { tag: string }).tag).toBe('B');
    expect(a).not.toEqual(b); // a NEW slot, so a new UV rect
  });

  it('characterization: putImage returns the first UV and uploads nothing new', () => {
    const { batch, rec } = setup();
    const a = batch.putImage('icon.svg', chip(16, 16, 'A'), 16, 16);
    const b = batch.putImage('icon.svg', chip(16, 16, 'B'), 16, 16);
    expect(rec.uploads).toHaveLength(1);
    expect((rec.uploads[0].source as { tag: string }).tag).toBe('A');
    expect(b).toEqual(a);
  });

  it.failing('BUG-SHAPE: new pixels under an existing key never reach the atlas', () => {
    const { batch, rec } = setup();
    batch.putImage('icon.svg', chip(16, 16, 'A'), 16, 16);
    batch.putImage('icon.svg', chip(16, 16, 'B'), 16, 16);
    const tags = rec.uploads.map((u) => (u.source as { tag: string }).tag);
    expect(tags).toContain('B');
  });

  it('REACHABILITY: the key is the icon URL, and custom icons are data URIs', () => {
    // NodesCanvas passes the icon `url` as the key. A custom icon's URL is a
    // data URI derived from its own bytes, so changing the artwork changes the
    // key — the stale-texture window needs a key that outlives its pixels
    // (a re-fetched http(s) icon URL, or a future stable icon id as the key).
    const { batch, rec } = setup();
    batch.putImage('data:image/svg+xml;base64,AAA', chip(16, 16, 'A'), 16, 16);
    batch.putImage('data:image/svg+xml;base64,BBB', chip(16, 16, 'B'), 16, 16);
    expect(rec.uploads).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// GL-02 / GL-03 / GL-05 — overflow, compaction, and UVs captured across it
// ---------------------------------------------------------------------------

/**
 * A tiny atlas so overflow is two puts away. 64 texels: the dot (32) + white (4)
 * take the first shelf; one 40×40 chip then needs a second shelf that does not
 * fit.
 */
const tinyBatch = () => {
  const { canvas, rec } = makeStubCanvas();
  const batch = createSpriteBatch(canvas, 64)!;
  expect(batch).not.toBeNull();
  return { batch, rec };
};

describe('GL-02 — an overflowing chip is skipped and nothing schedules a rebuild', () => {
  it('PRECONDITION: the atlas really overflows on the second shelf', () => {
    const { batch, rec } = tinyBatch();
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS);
    // Shelf 0 is 32 tall (the dot) and has 64-40 = 24 texels of width left.
    expect(batch.putCanvas('big', 0, () => chip(40, 40, 'big'))).toBeNull();
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS); // nothing uploaded
  });

  it('characterization: the SpriteBatch surface exposes no overflow signal', () => {
    const { batch } = tinyBatch();
    batch.putCanvas('big', 0, () => chip(40, 40, 'big'));
    // No flag, no callback, no counter — the caller cannot know a chip is
    // missing, so it cannot schedule the rebuild that would compact the atlas.
    expect(Object.keys(batch).sort()).toEqual(
      [
        'addSprite',
        'beginInstances',
        'commitInstances',
        'destroy',
        'dot',
        'instanceCount',
        'putCanvas',
        'putImage',
        'render',
        'white'
      ].sort()
    );
  });

  it('the compaction happens only on the NEXT beginInstances', () => {
    const { batch, rec } = tinyBatch();
    batch.putCanvas('a', 0, () => chip(8, 8, 'a')); // fits on shelf 0
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS + 1);
    expect(batch.putCanvas('big', 0, () => chip(40, 40, 'big'))).toBeNull();

    // Still cached — no compaction yet, so a re-put of 'a' is a cache hit.
    batch.putCanvas('a', 0, () => chip(8, 8, 'a2'));
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS + 1);

    // Only now does the atlas compact.
    batch.beginInstances();
    batch.putCanvas('a', 0, () => chip(8, 8, 'a3'));
    expect(rec.uploads).toHaveLength(BUILTIN_UPLOADS + 2);
  });
});

describe('GL-03 — a UV captured before a compaction points at reused texels', () => {
  it('PRECONDITION: the capture-once pattern is what ConnectorsCanvas uses', () => {
    // ConnectorsCanvas.tsx packs `__arrow__` / `__ring__` ONCE at effect setup
    // and holds the UVRects for the life of the batch (re-packed only on
    // context RESTORE). Model that here.
    const { batch, rec } = tinyBatch();
    const arrowUV = batch.putCanvas('__arrow__', 0, () => chip(8, 8, 'arrow'));
    expect(arrowUV).not.toBeNull();
    const arrowSlot = rec.uploads[rec.uploads.length - 1];
    expect(arrowSlot).toMatchObject({ w: 8, h: 8 });
    expect(arrowUV).toEqual(atlasUVRect(arrowSlot.x, arrowSlot.y, 8, 8, 64));
  });

  it.failing('BUG-SHAPE: after a compaction another chip owns the arrow texels', () => {
    const { batch, rec } = tinyBatch();
    const arrowUV = batch.putCanvas('__arrow__', 0, () => chip(8, 8, 'arrow'))!;
    const arrowSlot = { ...rec.uploads[rec.uploads.length - 1] };

    // Overflow, then compact.
    expect(batch.putCanvas('big', 0, () => chip(40, 40, 'big'))).toBeNull();
    batch.beginInstances();

    // A DIFFERENT chip now lands on the arrow's texels, while `arrowUV` — still
    // held by the caller — keeps pointing at them.
    const otherUV = batch.putCanvas('other', 0, () => chip(8, 8, 'other'));
    const otherSlot = rec.uploads[rec.uploads.length - 1];
    expect((otherSlot.source as { tag: string }).tag).toBe('other');
    expect({ x: otherSlot.x, y: otherSlot.y }).not.toEqual({
      x: arrowSlot.x,
      y: arrowSlot.y
    });
    expect(otherUV).not.toEqual(arrowUV);
  });

  it('CONTROL: the reserved dot/white texels DO survive the compaction', () => {
    const { batch, rec } = tinyBatch();
    const dotBefore = batch.dot;
    const whiteBefore = batch.white;
    batch.putCanvas('big', 0, () => chip(40, 40, 'big'));
    batch.beginInstances();
    batch.putCanvas('other', 0, () => chip(8, 8, 'other'));
    const otherSlot = rec.uploads[rec.uploads.length - 1];
    // The compaction resumes the cursor past the reserved region (x >= 40).
    expect(otherSlot.x).toBeGreaterThanOrEqual(40);
    expect(batch.dot).toEqual(dotBefore);
    expect(batch.white).toEqual(whiteBefore);
  });
});

describe('GL-05 — a version bump leaks the previous slot', () => {
  it('characterization: every bump consumes fresh atlas area', () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 4096)!;
    rec.uploads.length = 0;
    const slots: string[] = [];
    for (let v = 0; v < 6; v += 1) {
      batch.putCanvas('chip', v, () => chip(64, 32, `v${v}`));
      const u = rec.uploads[rec.uploads.length - 1];
      slots.push(`${u.x},${u.y}`);
    }
    expect(rec.uploads).toHaveLength(6);
    // Six distinct slots for ONE logical chip — the first five are unreachable.
    expect(new Set(slots).size).toBe(6);
  });

  it('BUG: enough restyling overflows the atlas with a single chip', () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 256)!;
    rec.uploads.length = 0;
    let firstNull = -1;
    for (let v = 0; v < 200; v += 1) {
      if (batch.putCanvas('chip', v, () => chip(64, 32, `v${v}`)) === null) {
        firstNull = v;
        break;
      }
    }
    // One chip, restyled — and the atlas is full well before 200 edits.
    expect(firstNull).toBeGreaterThan(0);
    expect(firstNull).toBeLessThan(200);
    // Every one of those uploads was the SAME logical chip.
    expect(rec.uploads.length).toBe(firstNull);
  });
});

// ---------------------------------------------------------------------------
// GL-04 — an oversized chip is rejected without arming the compaction
// ---------------------------------------------------------------------------

describe('GL-04 — an oversized chip never arms atlasFull', () => {
  it('PRECONDITION: a chip wider than the atlas is rejected', () => {
    const { batch } = tinyBatch();
    expect(batch.putCanvas('huge', 0, () => chip(64, 8, 'huge'))).toBeNull();
  });

  it('BUG: the rejection does NOT arm a compaction, so nothing ever changes', () => {
    const { batch, rec } = tinyBatch();
    batch.putCanvas('a', 0, () => chip(8, 8, 'a'));
    const before = rec.uploads.length;

    expect(batch.putCanvas('huge', 0, () => chip(64, 8, 'huge'))).toBeNull();
    batch.beginInstances();
    // No compaction ran: 'a' is still cached, so no re-upload.
    batch.putCanvas('a', 0, () => chip(8, 8, 'a2'));
    expect(rec.uploads).toHaveLength(before);

    // …whereas a normal overflow DOES compact (contrast, same batch shape).
    expect(batch.putCanvas('big', 0, () => chip(40, 40, 'big'))).toBeNull();
    batch.beginInstances();
    batch.putCanvas('a', 0, () => chip(8, 8, 'a3'));
    expect(rec.uploads.length).toBe(before + 1);
  });

  it('and the oversized chip is indistinguishable from a transient overflow', () => {
    const { batch } = tinyBatch();
    const oversized = batch.putCanvas('huge', 0, () => chip(64, 8, 'huge'));
    const transient = batch.putCanvas('big', 0, () => chip(40, 40, 'big'));
    expect(oversized).toBeNull();
    expect(transient).toBeNull(); // same return, opposite recoverability
  });
});

// ---------------------------------------------------------------------------
// GL-07 / GL-12 — the capability gate and the device texture cap
// ---------------------------------------------------------------------------

describe('GL-07 — createSpriteBatch fails where the gate would pass', () => {
  it('a context that passes the isWebGL2Supported probe can still fail the batch', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas } = makeStubCanvas({ failCompile: true });
    // PRECONDITION: this context satisfies exactly what isWebGL2Supported checks
    // — a webgl2 context whose `createVertexArray` is a function.
    const gl = canvas.getContext('webgl2') as unknown as {
      createVertexArray: unknown;
    };
    expect(typeof gl.createVertexArray).toBe('function');

    expect(createSpriteBatch(canvas, 4096)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[glSpriteBatch] shader compile failed:',
      expect.anything()
    );
    warn.mockRestore();
  });

  it('a link failure is the same story', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas } = makeStubCanvas({ failLink: true });
    expect(createSpriteBatch(canvas, 4096)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('GL-12 — MAX_TEXTURE_SIZE silently shrinks the atlas', () => {
  const slotsBeforeOverflow = (maxTextureSize: number): number => {
    const { canvas } = makeStubCanvas({ maxTextureSize });
    const batch = createSpriteBatch(canvas, 4096)!;
    let n = 0;
    for (; n < 5000; n += 1) {
      if (batch.putCanvas(`c${n}`, 0, () => chip(85, 85, `c${n}`)) === null) break;
    }
    return n;
  };

  it('PRECONDITION: the requested size is clamped by the device cap', () => {
    expect(slotsBeforeOverflow(16384)).toBeGreaterThan(0);
  });

  it('a 2048 cap costs roughly three quarters of the chip budget', () => {
    const big = slotsBeforeOverflow(16384); // ATLAS = 4096 (the request)
    const small = slotsBeforeOverflow(2048); // ATLAS = 2048 (the cap)
    expect(small).toBeLessThan(big / 3);
  });
});

// ---------------------------------------------------------------------------
// GL-09 — the build lifecycle
// ---------------------------------------------------------------------------

describe('GL-09 — beginInstances without commitInstances', () => {
  const addOne = (b: ReturnType<typeof createSpriteBatch>) =>
    b!.addSprite(0, 0, 0, 0, 1, 0, 0, 1, b!.white, 1, 1, 1, 1, 0);

  it('characterization: an uncommitted build leaves the last good frame drawn', () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 4096)!;

    batch.beginInstances();
    addOne(batch);
    addOne(batch);
    batch.commitInstances();
    batch.render(100, 100, 1, 0, 0, 1);
    expect(rec.draws).toEqual([2]);
    expect(rec.bufferDataFloats).toEqual([40]);

    // A build that begins and never commits.
    batch.beginInstances();
    addOne(batch);
    batch.render(100, 100, 1, 0, 0, 1);
    // No re-upload (instDirty is only set by commit), so the GPU still holds the
    // two committed instances and draws exactly those. Consistent, not torn.
    expect(rec.bufferDataFloats).toEqual([40]);
    expect(rec.draws).toEqual([2, 2]);
    expect(batch.instanceCount()).toBe(2);
  });

  it('and the next committed build is correct again', () => {
    const { canvas, rec } = makeStubCanvas();
    const batch = createSpriteBatch(canvas, 4096)!;
    batch.beginInstances();
    addOne(batch);
    batch.commitInstances();
    batch.render(100, 100, 1, 0, 0, 1);
    expect(rec.draws).toEqual([1]);
    expect(rec.lastInstanceData).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// GL-11 — atlasUVRect at a degenerate slot size
// ---------------------------------------------------------------------------

describe('GL-11 — a zero-size slot inverts the UV span', () => {
  it('characterization: uS/vS go NEGATIVE at w=0 / h=0', () => {
    const r = atlasUVRect(100, 100, 0, 0, 4096);
    expect(r.uS).toBeLessThan(0);
    expect(r.vS).toBeLessThan(0);
    expect(r.uS).toBeCloseTo(-1 / 4096, 12);
  });

  it('while w=1 collapses cleanly to the texel centre (already covered)', () => {
    const r = atlasUVRect(100, 100, 1, 1, 4096);
    expect(r.uS).toBe(0);
    expect(r.vS).toBe(0);
  });

  it('REACHABILITY: every chip source clamps its size to >= 1', () => {
    // itemRaster.getScratch does `Math.max(1, Math.ceil(...))` on both axes, so
    // no rasterised chip can be 0-sized. The remaining callers pass an icon's
    // decoded dimensions, which a decoded image cannot report as 0.
    const raster = require('src/webgl/itemRaster');
    expect(typeof raster.rasterizeNodeChip).toBe('function');
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../webgl/itemRaster.ts'),
      'utf8'
    );
    expect(src).toContain('Math.max(1, Math.ceil(wCss * ss))');
    expect(src).toContain('Math.max(1, Math.ceil(hCss * ss))');
  });
});
