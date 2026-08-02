/**
 * Multi-page atlas + material runs (R3/GPU-13, ADR 0038 §8).
 *
 * §8's measurement 2 found the assumption behind "one draw call" does NOT hold
 * universally: a merged node+label chip atlas peaks near 4 000 rows, fits the
 * 8192 desktop clamp at 51%, and does NOT fit the 4096 high-DPR clamp at N=5000
 * (4 178 > 4 096). So the merged substrate must not REQUIRE that everything fits
 * one texture — the atlas is a per-material resource, and the degradation path is
 * one bind per material run, not dropped chips.
 *
 * These drive the real packer through `glStub` (jsdom has no WebGL2 — see
 * glStub.ts for why that is the way in).
 */
import { installDrawing2DStub, makeStubCanvas, chip } from '../glStub';
import { createSpriteBatch } from '../glSpriteBatch';

installDrawing2DStub();

const build = (atlasSize: number, maxPages: number) => {
  const { canvas, rec } = makeStubCanvas();
  const batch = createSpriteBatch(canvas, atlasSize, maxPages);
  if (!batch) throw new Error('rig: createSpriteBatch returned null');
  return { batch, rec, canvas };
};

/** Pack `count` 60px chips in one build; returns how many packed. */
const packChips = (
  batch: ReturnType<typeof build>['batch'],
  count: number,
  prefix = 'k'
) => {
  const uvs: Array<ReturnType<typeof batch.putCanvas>> = [];
  for (let i = 0; i < count; i += 1) {
    uvs.push(
      batch.putCanvas(`${prefix}${i}`, 0, () => chip(60, 60, `${prefix}${i}`))
    );
  }
  return uvs;
};

describe('a single page behaves exactly as before (maxPages = 1)', () => {
  it('issues ONE draw call for a build that fits', () => {
    const { batch, rec } = build(1024, 1);
    batch.beginInstances();
    for (const uv of packChips(batch, 8)) {
      if (uv) batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, uv, 1, 1, 1, 1, 0);
    }
    batch.commitInstances();
    expect(batch.drawCallCount()).toBe(1);

    batch.render(100, 100, 1, 0, 0, 1);
    expect(rec.draws).toEqual([8]);
    expect(batch.atlasStats().pages).toBe(1);
  });

  it('still drops sprites and reports the overflow when the one page is full', () => {
    const { batch } = build(256, 1);
    batch.beginInstances();
    const uvs = packChips(batch, 60);
    batch.commitInstances();
    expect(uvs.filter((u) => u === null).length).toBeGreaterThan(0);
    expect(batch.atlasOverflowed()).toBe(true);
    expect(batch.atlasStats().pages).toBe(1);
  });
});

describe('a second page absorbs what one texture cannot hold (maxPages = 2)', () => {
  it('packs everything instead of dropping chips', () => {
    const { batch } = build(256, 2);
    batch.beginInstances();
    // Comfortably more than a 256 atlas holds (~15 60px chips), comfortably less
    // than two hold.
    const uvs = packChips(batch, 24);
    batch.commitInstances();

    expect(uvs.every((u) => u !== null)).toBe(true);
    expect(batch.atlasOverflowed()).toBe(false);
    expect(batch.atlasStats().pages).toBe(2);
    // Both pages really are in use — the second is not a decoration.
    expect(new Set(uvs.map((u) => u!.page))).toEqual(new Set([0, 1]));
  });

  it('one bind per material RUN, and the runs keep painter order', () => {
    const { batch, rec } = build(256, 2);
    batch.beginInstances();
    const uvs = packChips(batch, 24).filter(Boolean) as NonNullable<
      ReturnType<typeof batch.putCanvas>
    >[];
    // Emit in packing order: every page-0 chip, then every page-1 chip.
    for (const uv of uvs) {
      batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, uv, 1, 1, 1, 1, 0);
    }
    batch.commitInstances();

    const page0 = uvs.filter((u) => u.page === 0).length;
    const page1 = uvs.filter((u) => u.page === 1).length;
    expect(batch.drawCallCount()).toBe(2);
    batch.render(100, 100, 1, 0, 0, 1);
    // Run lengths in draw order — the sort's order survives the split.
    expect(rec.draws).toEqual([page0, page1]);
  });

  it('interleaving pages costs a run per crossing, and NOTHING is dropped', () => {
    const { batch } = build(256, 2);
    batch.beginInstances();
    const uvs = packChips(batch, 24).filter(Boolean) as NonNullable<
      ReturnType<typeof batch.putCanvas>
    >[];
    const a = uvs.find((u) => u.page === 0)!;
    const b = uvs.find((u) => u.page === 1)!;
    // The adversarial interleaving §2(a) worried about: alternate pages.
    for (let i = 0; i < 6; i += 1) {
      batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, i % 2 ? b : a, 1, 1, 1, 1, 0);
    }
    batch.commitInstances();
    expect(batch.drawCallCount()).toBe(6);
    expect(batch.instanceCount()).toBe(6);
  });
});

describe('the dot/white texels are page-wildcards, so lines never fragment a run', () => {
  it('a tinted line between two pages does not add a draw call', () => {
    const { batch } = build(256, 2);
    batch.beginInstances();
    const uvs = packChips(batch, 24).filter(Boolean) as NonNullable<
      ReturnType<typeof batch.putCanvas>
    >[];
    const a = uvs.find((u) => u.page === 0)!;
    const b = uvs.find((u) => u.page === 1)!;
    expect(batch.white.page).toBe(-1);
    expect(batch.dot.page).toBe(-1);

    // chip(p0) · line · chip(p1) · disc — two pages touched, so exactly two runs.
    // Without the wildcard this would be four.
    batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, a, 1, 1, 1, 1, 0);
    batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, batch.white, 1, 1, 1, 1, 0, 1, 2);
    batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, b, 1, 1, 1, 1, 0);
    batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, batch.dot, 1, 1, 1, 1, 0, 2, 2);
    batch.commitInstances();

    expect(batch.drawCallCount()).toBe(2);
  });

  it('a scene of nothing but lines and fills is ONE draw call', () => {
    // The connector/rectangle-only shape: every instance samples the white texel.
    const { batch, rec } = build(256, 2);
    batch.beginInstances();
    for (let i = 0; i < 50; i += 1) {
      batch.addSprite(0, 0, 0, 0, 1, 0, 0, 1, batch.white, 1, 1, 1, 1, 0, 1, 2);
    }
    batch.commitInstances();
    expect(batch.drawCallCount()).toBe(1);
    batch.render(100, 100, 1, 0, 0, 1);
    expect(rec.draws).toEqual([50]);
  });

  it('the reserved texels survive a compaction on every page', () => {
    const { batch } = build(256, 2);
    const dotBefore = { ...batch.dot };
    const whiteBefore = { ...batch.white };
    // Churn hard enough to force compactions across both pages.
    for (let i = 0; i < 40; i += 1) {
      batch.beginInstances();
      packChips(batch, 12, `gen${i}_`);
      batch.commitInstances();
    }
    expect(batch.dot).toEqual(dotBefore);
    expect(batch.white).toEqual(whiteBefore);
    // A compaction returns to page 0 rather than leaking pages forever.
    expect(batch.atlasStats().pages).toBeLessThanOrEqual(2);
  });
});
