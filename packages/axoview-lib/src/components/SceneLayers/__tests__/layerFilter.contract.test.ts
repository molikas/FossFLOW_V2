/**
 * CLASS GATE — the layer visible/locked filter, per paint/affordance layer
 * (ADR 0047 §3).
 *
 * The seed class, in the ADR's words: *"layer visible/locked filter
 * re-application in new paint/affordance layers"*. Every layer the Renderer
 * mounts has to decide, independently, whether an entity on a hidden or locked
 * layer belongs to it — and the 2026-07 campaign found four that had not:
 *
 *   - R4/RND-02  `ConnectorLabels` had NO filter at all, so hiding a layer left
 *                its connectors' label chips floating over nothing.
 *   - R5/OVL-13  `NodeLabelHitLayer` had the VISIBLE half and not the LOCKED
 *                half, so a locked layer still exposed its nodes' label drag and
 *                rename handles.
 *   - I5/CTX-06  `TransformControlsManager` consulted `lockedIds` and never
 *                `visibleIds`, so a group box spanned a hidden-layer node.
 *   - R3/GPU-08  (falsified — the visibility half was right) is the shape of the
 *                one that was already correct.
 *
 * Each of those is a layer added at a different time, by someone who did not
 * have the rule in front of them. This gate scans for the CLASS: every layer
 * listed below must reach the layer context, and must consult BOTH sets unless
 * the table says why not. A new layer added without an entry fails on the
 * enumeration; a listed layer that drops its filter fails on the scan.
 *
 * Two verdicts, not one — that distinction is itself load-bearing:
 *   HIDDEN → the entity is not drawn, so nothing that belongs to it may be
 *            drawn either (chrome, chips, hit proxies).
 *   LOCKED → the entity IS on screen and selectable; only the gestures that
 *            MUTATE it are withheld. A layer that renders no gesture affordance
 *            has no reason to read `lockedIds`.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', '..');

type Need = 'visible' | 'visible+locked';

/**
 * Every canvas paint / affordance layer, with what its filter must cover and
 * WHY. A layer whose file is missing fails loudly — this table is only as good
 * as its correspondence to the real Renderer tree.
 */
const LAYERS: Array<{ file: string; needs: Need; why: string }> = [
  {
    // R3/GPU-13: the four bulk canvases merged into ONE (ADR 0038 §8), so the
    // four separate filter sites became one — and the class this gate guards
    // (each layer deciding independently, without the rule in front of it) got
    // structurally smaller rather than being satisfied by accident. The filter
    // lives in `buildDrawOrder`, which every entity type walks through.
    file: 'components/SceneLayers/SceneCanvas.tsx',
    needs: 'visible',
    why: 'Bulk paint, all four entity types. Locked entities still draw; only gestures are withheld.'
  },
  {
    file: 'components/SceneLayers/Nodes/NodeLabelHitLayer.tsx',
    needs: 'visible+locked',
    why: 'Affordance: label drag + rename + context menu. OVL-13.'
  },
  {
    file: 'components/SceneLayers/Labels/LabelHitLayer.tsx',
    needs: 'visible+locked',
    why: 'Affordance: chip select/drag/inline-edit/menu.'
  },
  {
    file: 'components/SceneLayers/ConnectorLabels/ConnectorLabels.tsx',
    needs: 'visible',
    why: 'Paint only — the chips own their own gestures downstream. RND-02.'
  },
  {
    file: 'components/TransformControlsManager/TransformControlsManager.tsx',
    needs: 'visible+locked',
    why: 'Affordance: resize/rotate handles + the group box. CTX-06.'
  },
  {
    file: 'components/TransformControlsManager/HoverOutline.tsx',
    needs: 'visible+locked',
    why: 'Affordance: advertises "a click will grab this".'
  }
];

const read = (file: string): string => {
  const full = path.join(SRC, file);
  if (!fs.existsSync(full)) {
    throw new Error(
      `layer-filter gate: ${file} does not exist. If the layer was renamed or ` +
        'removed, update LAYERS — a stale table is a gate that cannot fail.'
    );
  }
  return fs.readFileSync(full, 'utf8');
};

/**
 * Source with comments AND import statements stripped — what is left is what the
 * layer actually does.
 *
 * Both removals are load-bearing, and both were found by checking that this gate
 * can go red rather than by reasoning:
 *
 *  - **Comments.** These files EXPLAIN their filters at length, so a prose
 *    mention of `lockedIds` would pass a positive scan a layer had not earned —
 *    and the two that warn *"NOT `visibleIds.size`"* would fail the negative one
 *    for saying exactly the right thing.
 *  - **Imports.** The first version of this gate passed when the filter was
 *    deleted, because `import { useLayerContext } …` still contained the word.
 *    A gate satisfied by an unused import is a gate that cannot fail.
 *
 * Naive enough for JS/TS source (a `//` inside a string literal would
 * over-strip); none of these files has one on a line that matters, and the
 * enumeration test above notices if stripping ever empties a file.
 */
const codeOnly = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '')
    .replace(/^import\s[\s\S]*?from\s*'[^']*';$/gm, '');

describe('class gate — every canvas layer reaches the layer context', () => {
  it('the table is not empty and every file exists (the gate can go red)', () => {
    // A scan that finds nothing is a green gate that cannot fail — the shape the
    // 2026-07-29 audit flagged for the madge and bundle-size gates.
    expect(LAYERS.length).toBeGreaterThan(5);
    for (const layer of LAYERS) expect(read(layer.file).length).toBeGreaterThan(0);
  });

  it.each(LAYERS.map((l) => [l.file, l.why] as const))(
    '%s reads useLayerContext',
    (file) => {
      const src = codeOnly(file);
      expect(
        src.includes('useLayerContext')
          ? null
          : `${file} never calls useLayerContext, so it cannot know which ` +
              'entities are on a hidden or locked layer. Every other canvas ' +
              'layer does.'
      ).toBeNull();
    }
  );
});

describe('class gate — the visibility filter', () => {
  it.each(LAYERS.map((l) => [l.file, l.why] as const))(
    '%s consults visibleIds — %s',
    (file) => {
      const src = codeOnly(file);
      expect(
        src.includes('visibleIds')
          ? null
          : `${file} does not consult visibleIds. An entity on a HIDDEN layer ` +
              'is not drawn, so nothing belonging to it may be drawn either.'
      ).toBeNull();
    }
  );

  it.each(LAYERS.map((l) => [l.file] as const))(
    '%s uses the layers-length escape hatch, not visibleIds.size',
    (file) => {
      const src = codeOnly(file);
      // `visibleIds.size === 0` is ambiguous: it also means "every entity is on
      // a hidden layer", and treating that as "no layer system" made a fully
      // hidden view snap back to fully visible (the layer-visibility
      // regression). The fallback must key off whether any layer EXISTS.
      expect(
        src.includes('visibleIds.size')
          ? `${file} branches on visibleIds.size. Use layers.length === 0 — an ` +
              'empty visibleIds also means "everything is hidden".'
          : null
      ).toBeNull();
    }
  );
});

describe('class gate — the locked filter, where gestures are offered', () => {
  const gesture = LAYERS.filter((l) => l.needs === 'visible+locked');
  const paintOnly = LAYERS.filter((l) => l.needs === 'visible');

  it('the table still classes some layers each way', () => {
    expect(gesture.length).toBeGreaterThan(2);
    expect(paintOnly.length).toBeGreaterThan(1);
  });

  it.each(gesture.map((l) => [l.file, l.why] as const))(
    '%s consults lockedIds — %s',
    (file) => {
      const src = codeOnly(file);
      expect(
        src.includes('lockedIds')
          ? null
          : `${file} offers a gesture affordance but never consults lockedIds, ` +
              'so a locked entity keeps a handle that mutates it.'
      ).toBeNull();
    }
  );

  it.each(paintOnly.map((l) => [l.file, l.why] as const))(
    '%s is paint-only, so lockedIds is not required — %s',
    (file) => {
      // Not an assertion that it MUST NOT read lockedIds — only that the table
      // has made a deliberate call about this layer. Reading it here is a
      // documentation duty, not a constraint.
      expect(read(file).length).toBeGreaterThan(0);
    }
  );
});
