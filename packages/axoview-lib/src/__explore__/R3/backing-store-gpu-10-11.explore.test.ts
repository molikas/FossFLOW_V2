/**
 * R3 — GPU-10 / GPU-11: the clamped backing store and the two device-pixel
 * ratios in play on the bulk layers.
 *
 * `computeBackingStore`'s own doc is emphatic: "the caller MUST feed the
 * returned `dpr` into the ENTIRE render path — the `zoom·dpr` view scale AND the
 * device origin — not just the backing-store size, or the scene and its buffer
 * desync". The four bulk layers are copy-adapted from one skeleton (the mapper
 * note for this area), so GPU-10 asks whether any of them sizes its buffer from
 * the clamped dpr while still scaling `u_view` from the raw one. GPU-11 asks the
 * matching question about chip SUPERSAMPLE, which reads `min(devicePixelRatio, 2)`
 * directly.
 *
 * The wiring half is asserted against the layer SOURCES (the same idiom as
 * R2/atlas-gl-*'s reachability checks and `ExportImageDialog`'s own static
 * tests) because mounting four WebGL2 layers under jsdom to read a uniform costs
 * far more than it proves. The reachability half runs the real
 * `computeBackingStore` over real viewport sizes — the R2 lesson that a sweep can
 * be arithmetically right and still be inert applies directly here.
 */
import { computeBackingStore, DEFAULT_RENDER_CAPS } from 'src/utils/renderTarget';

const fs = require('fs');
const path = require('path');

const LAYERS = [
  ['NodesCanvas', 'components/SceneLayers/Nodes/NodesCanvas.tsx'],
  ['LabelsCanvas', 'components/SceneLayers/Labels/LabelsCanvas.tsx'],
  ['ConnectorsCanvas', 'components/SceneLayers/Connectors/ConnectorsCanvas.tsx'],
  ['RectanglesCanvas', 'components/SceneLayers/Rectangles/RectanglesCanvas.tsx']
] as const;

const readLayer = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('GPU-10 — does any bulk layer mix the clamped and raw dpr?', () => {
  it.each(LAYERS.map(([name, rel]) => ({ name, rel })))(
    '$name feeds one dpr into the buffer size, the view scale and the origin',
    ({ rel }) => {
      const src = readLayer(rel);

      // PRECONDITION: the layer really does clamp its backing store — otherwise
      // "it never mixes the two" would just mean "it never clamps".
      expect(src).toContain('computeBackingStore(');
      const clampCall = /computeBackingStore\(\s*W,\s*H,\s*window\.devicePixelRatio \|\| 1\s*\)/;
      expect(src).toMatch(clampCall);

      // The render path: `b.render(bw, bh, zoom * dpr, originX, originY, …)` and
      // the two origin lines must all use the SAME identifier the buffer size
      // came from (`dpr` destructured from the result, or `backing.dpr` aliased
      // as `v.dpr`) — never `window.devicePixelRatio` again.
      const originLines = src
        .split('\n')
        .filter((l) => /originXDev|originYDev/.test(l) && l.includes('*'));
      expect(originLines.length).toBeGreaterThanOrEqual(2);
      for (const line of originLines) {
        expect(line).toMatch(/\*\s*(v\.)?dpr/);
        expect(line).not.toContain('devicePixelRatio');
      }

      const renderLine = src
        .split('\n')
        .find((l) => /\bb\.render\(/.test(l));
      expect(renderLine).toBeDefined();
      expect(renderLine!).toMatch(/zoom \* (v\.)?dpr/);
      expect(renderLine!).not.toContain('devicePixelRatio');

      // And the buffer size passed to render is the clamped one, not W/H·raw.
      expect(renderLine!).toMatch(/\((v\.)?bw,\s*(v\.)?bh,/);
    }
  );
});

describe('GPU-11 — chip supersampling reads the RAW dpr, the buffer the clamped one', () => {
  it('both chip rasterisers still use min(devicePixelRatio, 2)', () => {
    // This is the mixed-dpr fact the seed seam records: chips are rasterised for
    // `min(raw dpr, 2) × CHIP_SUPERSAMPLE`, while the surface they land on is
    // sized by the CLAMPED dpr. The two can only disagree when the clamp
    // engages — see the reachability test below.
    for (const rel of [
      'components/SceneLayers/Nodes/NodesCanvas.tsx',
      'components/SceneLayers/Labels/LabelsCanvas.tsx'
    ]) {
      const src = readLayer(rel);
      expect(src).toContain('Math.min(f.dpr, 2) * CHIP_SUPERSAMPLE');
      // f.dpr is the RAW ratio, captured in the frame state…
      expect(src).toMatch(/const dpr = window\.devicePixelRatio \|\| 1;/);
      // …and it is NOT the value the render path uses.
      expect(src).toContain('computeBackingStore(');
    }
  });

  it('REACHABILITY: the clamp cannot engage on any real viewport', () => {
    // Every plausible display, at every plausible dpr. If none of these clamp,
    // the clamped and raw dprs are equal in the field and GPU-10/GPU-11 are
    // latent traps for a future edit rather than live defects.
    const viewports = [
      [1280, 720],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [3440, 1440], // ultrawide
      [3840, 2160], // 4K
      [5120, 2160], // 5K ultrawide
      [7680, 4320] // 8K
    ];
    const clamped: string[] = [];
    for (const [w, h] of viewports) {
      for (const dpr of [1, 1.25, 1.5, 2, 3]) {
        const r = computeBackingStore(w, h, dpr);
        if (r.wasClamped) clamped.push(`${w}x${h}@${dpr}`);
        else expect(r.dpr).toBeCloseTo(dpr, 6);
      }
    }
    // Exactly ONE combination in the whole sweep clamps: 8K at 3×, whose long
    // side is 23040 device px against the 16384 cap. 5120×2160@3 (15360 px) and
    // 7680×4320@2 (15360 px) both fit. So on every viewport that exists as a
    // browser window today, clamped dpr === raw dpr.
    expect(clamped).toEqual(['7680x4320@3']);

    // And in that single reachable case the two values diverge the OTHER way
    // from the hypothesis: the surface keeps dpr 2.13 while chip supersampling
    // is capped at min(raw, 2) = 2. Chips are therefore rasterised at slightly
    // LOWER resolution than the buffer — which is already true of any dpr > 2
    // screen, clamped or not, and is the documented CHIP_SUPERSAMPLE trade. The
    // clamp adds nothing to it.
    const r = computeBackingStore(7680, 4320, 3);
    expect(r.wasClamped).toBe(true);
    expect(r.dpr).toBeCloseTo(DEFAULT_RENDER_CAPS.maxDimension / 7680, 4);
    expect(r.dpr).toBeGreaterThan(Math.min(3, 2));
    expect(r.width).toBeLessThanOrEqual(DEFAULT_RENDER_CAPS.maxDimension);
    // The scene math stays self-consistent regardless: the same clamped dpr
    // scales u_view AND sizes the buffer (asserted per layer in GPU-10 above),
    // so nothing is offset — only the chip texture is marginally softer.
  });
});
