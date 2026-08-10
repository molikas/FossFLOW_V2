/**
 * CLASS GATE — the label counter-scale is derived in exactly ONE place
 * (R5/OVL-02, owner ruling 2026-07-31).
 *
 * ADR 0015 states the readable floor in terms of "the label's on-screen font
 * size". Six consumers each computed that from the module constant
 * `LABEL_BASE_FONT_PX` instead of the label's own size, so the toggle got both
 * non-default cases wrong — an enlarged label was boosted again, and a shrunk
 * one (the label the setting exists for) stayed below the floor.
 *
 * They had to move TOGETHER, which is the reason this is a gate and not a test:
 * the two GPU layers paint the chips while the two hit layers publish
 * `--axoview-label-scale` for the grab boxes that proxy them. A factor that
 * moved on one side alone would put the hit box somewhere other than the chip —
 * R5/OVL-12, the bug wave 3 fixed, reintroduced from the other side.
 *
 * §1 no consumer computes its own factor
 * §2 the derivation behaves the way the ruling specifies
 * §3 CONTROLs — the sweep can find files, and can go red
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  labelCounterScaleFor,
  LABEL_BASE_FONT_PX,
  LABEL_MIN_READABLE_PX,
  LABEL_MAX_COUNTER_SCALE
} from '../labelSettings';

const SRC = path.resolve(__dirname, '../..');

/** Every .ts/.tsx under src, excluding tests and the quarantined lane. */
const sourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__explore__') continue;
      if (entry.name === '__perf_refactor_regression__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const FILES = sourceFiles(SRC);
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/');

/**
 * The ONE permitted call site, by NAME — not by file.
 *
 * Wave 4's lean-save gate exempted a whole FILE and then passed a duplicate
 * planted in that same file, because the duplicate's natural home IS the file
 * that already owns the concern. Naming the function closes that hole: another
 * derivation added to `labelSettings.ts` is still caught.
 */
const DERIVATION_FILE = 'config/labelSettings.ts';
const DERIVATION_FN = 'labelCounterScaleFor';

describe('§1 — one derivation, and every consumer uses it', () => {
  it('CONTROL: the sweep really walked the source tree', () => {
    // A path typo would otherwise make every assertion below vacuously true.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.map(rel)).toContain(DERIVATION_FILE);
    expect(FILES.map(rel)).toContain('components/SceneLayers/SceneCanvas.tsx');
  });

  it('only the shared derivation calls `computeLabelCounterScale`', () => {
    const callers = FILES.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      // The import alone is not a call; look for an invocation.
      return /computeLabelCounterScale\s*\(/.test(src);
    }).map(rel);
    expect(callers).toEqual([DERIVATION_FILE]);
  });

  it('…and it does so from `labelCounterScaleFor`, not from somewhere else in that file', () => {
    // The call-site rule, applied to the exemption itself: a SECOND derivation
    // added to this file would otherwise inherit the exemption.
    const src = fs.readFileSync(path.join(SRC, DERIVATION_FILE), 'utf8');
    const fnStart = src.indexOf(`export const ${DERIVATION_FN} =`);
    expect(fnStart).toBeGreaterThan(-1);
    const before = src.slice(0, fnStart);
    expect(/computeLabelCounterScale\s*\(/.test(before)).toBe(false);
    expect(
      (src.match(/computeLabelCounterScale\s*\(/g) ?? []).length
    ).toBe(1);
  });

  it('no consumer feeds a counter-scale from LABEL_BASE_FONT_PX', () => {
    // The exact shape of the bug: `baseFontPx: LABEL_BASE_FONT_PX` handed to the
    // scale math. The constant itself is still a legitimate DEFAULT elsewhere
    // (chip rasterisation, `fontSize ?? LABEL_BASE_FONT_PX`), so the pattern is
    // scoped to the scale parameter rather than to the identifier.
    const offenders = FILES.filter((f) =>
      /baseFontPx\s*:\s*LABEL_BASE_FONT_PX/.test(fs.readFileSync(f, 'utf8'))
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it('every layer that paints or proxies a label reaches the shared derivation', () => {
    // Named explicitly: this is the "all consumers move together" half of the
    // ruling, and a consumer that quietly stopped counter-scaling at all would
    // pass the negative checks above.
    const CONSUMERS = [
      'components/Label/ExpandableLabel.tsx',
      // R3/GPU-13: the two GPU chip emitters moved out of the four merged
      // canvases into `webgl/scene/` — same emission, one context. Listing the
      // EMITTERS rather than the component keeps this pointed at the code that
      // actually derives a per-chip factor.
      'webgl/scene/labelEmitter.ts',
      'webgl/scene/nodeEmitter.ts',
      'components/SceneLayers/Labels/LabelHitLayer.tsx',
      'components/SceneLayers/Nodes/NodeLabelHitLayer.tsx',
      'components/SceneLayers/ConnectorLabels/ConnectorLabel.tsx'
    ];
    for (const consumer of CONSUMERS) {
      const src = fs.readFileSync(path.join(SRC, consumer), 'utf8');
      expect(`${consumer}: ${/labelCounterScaleFor\s*\(/.test(src)}`).toBe(
        `${consumer}: true`
      );
    }
  });
});

describe('§2 — the derivation behaves as ruled', () => {
  // A zoom at which the DEFAULT label sits at exactly half the readable floor.
  const ZOOM = LABEL_MIN_READABLE_PX / 2 / LABEL_BASE_FONT_PX;

  it('a DEFAULT-sized label is lifted to the floor', () => {
    expect(labelCounterScaleFor(ZOOM, true)).toBeCloseTo(2, 6);
  });

  it('an ENLARGED label already above the floor gets NO boost', () => {
    // The entry's first symptom: a 3x label received the full factor and landed
    // at 3x the floor, several times larger than everything around it.
    expect(labelCounterScaleFor(ZOOM, true, LABEL_BASE_FONT_PX * 3)).toBe(1);
  });

  it('a SHRUNK label is lifted TO the floor, not merely scaled by the default factor', () => {
    // The second symptom, and the one that matters most: this is the label the
    // setting exists for, and it used to stay below the floor.
    //
    // 2/3 of the base, chosen so the required factor (3x) sits UNDER
    // LABEL_MAX_COUNTER_SCALE — otherwise the cap, not the fix, decides the
    // outcome and the assertion would be testing the bound instead.
    const shrunk = (LABEL_BASE_FONT_PX * 2) / 3;
    const factor = labelCounterScaleFor(ZOOM, true, shrunk);
    expect(factor).toBeLessThan(LABEL_MAX_COUNTER_SCALE);
    expect(shrunk * ZOOM * factor).toBeCloseTo(LABEL_MIN_READABLE_PX, 6);
    // …and it is a BIGGER factor than the default label's, which is exactly
    // what the old shared-constant version could never produce.
    expect(factor).toBeGreaterThan(labelCounterScaleFor(ZOOM, true));
  });

  it('a label shrunk PAST what the cap can rescue gets the cap, not silence', () => {
    // The existing bound still governs (ADR 0015: "bounded so it can't grow
    // without limit at extreme low zoom"). It lands short of the floor, which
    // is the deliberate trade — but it is still the LARGEST factor available,
    // where the old code gave it the default label's.
    const tiny = LABEL_BASE_FONT_PX / 3;
    const factor = labelCounterScaleFor(ZOOM, true, tiny);
    expect(factor).toBe(LABEL_MAX_COUNTER_SCALE);
    expect(tiny * ZOOM * factor).toBeLessThan(LABEL_MIN_READABLE_PX);
  });

  it('the toggle still gates everything', () => {
    expect(labelCounterScaleFor(ZOOM, false, LABEL_BASE_FONT_PX / 3)).toBe(1);
  });

  it('the upper bound still holds at extreme zoom-out', () => {
    expect(labelCounterScaleFor(0.0001, true, 1)).toBe(LABEL_MAX_COUNTER_SCALE);
  });

  it('a missing or degenerate size falls back to the base, not to "disabled"', () => {
    // A label with no size of its own must behave exactly as before; a zero or
    // negative one must not silently opt out of the accessibility setting.
    const base = labelCounterScaleFor(ZOOM, true);
    expect(labelCounterScaleFor(ZOOM, true, undefined)).toBe(base);
    expect(labelCounterScaleFor(ZOOM, true, null)).toBe(base);
    expect(labelCounterScaleFor(ZOOM, true, 0)).toBe(base);
    expect(labelCounterScaleFor(ZOOM, true, -5)).toBe(base);
  });
});

describe('§3 — the GPU layer carries the factor per instance', () => {
  it('the vertex shader reads i_misc.w, not only the uniform', () => {
    // The structural half: one uniform per draw could only ever be right for a
    // default-sized label, so a per-label factor requires the instance buffer.
    const src = fs.readFileSync(
      path.join(SRC, 'webgl/glSpriteBatch.ts'),
      'utf8'
    );
    expect(src).toMatch(/i_misc\.w/);
    // …and the uniform survives as the fallback, so an un-migrated emitter
    // keeps its old behaviour instead of collapsing to 1.
    expect(src).toMatch(/u_counterScale/);
  });

  it('both GPU label emitters pass a per-instance value', () => {
    for (const f of [
      'webgl/scene/nodeEmitter.ts',
      'webgl/scene/labelEmitter.ts'
    ]) {
      const src = fs.readFileSync(path.join(SRC, f), 'utf8');
      // The per-chip factor is computed inside the emission, from the chip's
      // own font size — not hoisted to one value for the whole build.
      expect(`${f}: ${/labelCounterScaleFor\([\s\S]{0,120}?labelFontPx|labelCounterScaleFor\([\s\S]{0,120}?labelFontSize/.test(src)}`).toBe(
        `${f}: true`
      );
    }
  });

  it('both hit layers scale PER PROXY, not from one wrapper variable', () => {
    // A shared wrapper variable cannot carry a per-label factor, and leaving it
    // there would put every grab box at the default label's scale while the
    // chips beneath them moved — OVL-12 from the other side.
    for (const f of [
      'components/SceneLayers/Labels/LabelHitLayer.tsx',
      'components/SceneLayers/Nodes/NodeLabelHitLayer.tsx',
      'components/SceneLayers/ConnectorLabels/ConnectorLabel.tsx'
    ]) {
      const src = fs.readFileSync(path.join(SRC, f), 'utf8');
      expect(`${f}: ${/data-label-font/.test(src)}`).toBe(`${f}: true`);
      expect(`${f}: ${/querySelectorAll<HTMLElement>\('\[data-label-font\]'\)/.test(src)}`).toBe(
        `${f}: true`
      );
    }
  });
});
