/**
 * Identity & range repair, applied on the way in — before `modelSchema`.
 *
 * The 2026-07 exploratory campaign's biggest cross-area finding was that the
 * model has *reference*-integrity checks but no *identity* or *range* checks:
 * duplicate ids, dangling layer refs and unbounded/non-finite tile coordinates
 * all validated clean, saved, and reloaded (E4/CLIP-01, E2/RED-03, E4/CLIP-15).
 * Wave 1 closed the write sites, which stops NEW violations
 * (`schemas/__tests__/modelIdentity.contract.test.ts`). This module is the other
 * half: the files those bugs have already produced.
 *
 * **Repair, not reject** (owner ruling 2026-07-30). Turning these into schema
 * errors would make `safeParse` fail, i.e. the affected diagrams stop opening —
 * which is precisely the harm E4/CLIP-02 is filed for. Each repair takes the
 * option that loses the least:
 *
 * - a duplicate id keeps the FIRST occurrence, because the later one was already
 *   unreachable (that is CLIP-01's own symptom) — dropping it changes nothing
 *   the user could see, and stops it silently shadowing its twin;
 * - a `layerId` naming no layer becomes unassigned, which the app already
 *   renders as visible-and-editable;
 * - a non-finite or absurd coordinate is clamped, because it poisons the
 *   TileIndex and the projection math and renders the scene blank.
 *
 * The caller reports what was repaired: a silent rewrite of the user's document
 * is its own failure (ADR 0011).
 */

import { sweepDanglingAnchorRefs } from 'src/stores/reducers/anchorGraph';

type RawObject = Record<string, unknown>;

const isObj = (v: unknown): v is RawObject => typeof v === 'object' && v !== null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Far beyond any real diagram — the array ceilings in `schemas/common.ts` cap a
 * view at 50 000 entities, so nothing legitimate reaches even a fraction of
 * this. It exists so a crafted or corrupt coordinate cannot poison the
 * projection math.
 */
export const MAX_TILE_COORD = 1_000_000;

export interface ModelRepairReport {
  /** Entities dropped because an earlier one already owned the id. */
  duplicateIds: number;
  /** `layerId` references cleared because the view has no such layer. */
  danglingLayerRefs: number;
  /** Coordinates clamped because they were non-finite or out of range. */
  outOfRangeCoords: number;
  /**
   * Anchor-to-anchor refs that resolved to nothing (E2/RED-02 + RED-07/14).
   * The tile the anchor used to sit on is gone by load time, so these are
   * dropped rather than re-pointed; a connector left with fewer than two
   * anchors goes with them.
   */
  danglingAnchorRefs: number;
}

export const isCleanRepair = (r: ModelRepairReport): boolean =>
  r.duplicateIds === 0 &&
  r.danglingLayerRefs === 0 &&
  r.outOfRangeCoords === 0 &&
  r.danglingAnchorRefs === 0;

/** Human-readable summary of a non-clean report, for the load-time notification. */
export const describeRepair = (r: ModelRepairReport): string => {
  const parts: string[] = [];
  if (r.duplicateIds > 0) {
    parts.push(
      `${r.duplicateIds} duplicate id${r.duplicateIds !== 1 ? 's' : ''} removed`
    );
  }
  if (r.danglingLayerRefs > 0) {
    parts.push(
      `${r.danglingLayerRefs} item${r.danglingLayerRefs !== 1 ? 's' : ''} unassigned from a layer that no longer exists`
    );
  }
  if (r.outOfRangeCoords > 0) {
    parts.push(
      `${r.outOfRangeCoords} out-of-range coordinate${r.outOfRangeCoords !== 1 ? 's' : ''} clamped`
    );
  }
  if (r.danglingAnchorRefs > 0) {
    parts.push(
      `${r.danglingAnchorRefs} connection${r.danglingAnchorRefs !== 1 ? 's' : ''} detached from a connection that no longer exists`
    );
  }
  return parts.join('; ');
};

/** Drop later entries whose `id` an earlier entry already owns. */
const dedupeById = (list: unknown[], report: ModelRepairReport): unknown[] => {
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (!isObj(entry) || typeof entry.id !== 'string') return true;
    if (seen.has(entry.id)) {
      report.duplicateIds += 1;
      return false;
    }
    seen.add(entry.id);
    return true;
  });
};

const clampCoord = (v: unknown, report: ModelRepairReport): unknown => {
  if (typeof v !== 'number') return v;
  if (!Number.isFinite(v)) {
    report.outOfRangeCoords += 1;
    return 0;
  }
  if (v > MAX_TILE_COORD || v < -MAX_TILE_COORD) {
    report.outOfRangeCoords += 1;
    return v > 0 ? MAX_TILE_COORD : -MAX_TILE_COORD;
  }
  return v;
};

const repairCoords = (value: unknown, report: ModelRepairReport): unknown => {
  if (!isObj(value)) return value;
  return { ...value, x: clampCoord(value.x, report), y: clampCoord(value.y, report) };
};

/** Every view-level collection that carries entity ids. */
const VIEW_COLLECTIONS = [
  'items',
  'connectors',
  'rectangles',
  'textBoxes',
  'labels',
  'layers'
] as const;

/** Every entity type that can carry a `layerId`. */
const LAYERED_COLLECTIONS = [
  'items',
  'connectors',
  'rectangles',
  'textBoxes',
  'labels'
] as const;

/** Entity fields holding a coordinate pair. */
const COORD_FIELDS = ['tile', 'offset', 'from', 'to'] as const;

export const repairModelIdentity = (
  raw: RawObject
): { data: RawObject; report: ModelRepairReport } => {
  const report: ModelRepairReport = {
    duplicateIds: 0,
    danglingLayerRefs: 0,
    outOfRangeCoords: 0,
    danglingAnchorRefs: 0
  };

  const data: RawObject = { ...raw };

  // Model-level identity: two items sharing an id makes one of them
  // permanently unreachable, and `assignLayerToItems` moves BOTH (F4/LAY-11).
  if (Array.isArray(data.items)) data.items = dedupeById(data.items, report);

  if (!Array.isArray(data.views)) return { data, report };

  data.views = dedupeById(data.views, report).map((view) => {
    if (!isObj(view)) return view;
    const next: RawObject = { ...view };

    for (const key of VIEW_COLLECTIONS) {
      if (Array.isArray(next[key])) {
        next[key] = dedupeById(next[key] as unknown[], report);
      }
    }

    // Connector anchor ids are their own namespace, aggregated across the whole
    // view — an anchor→anchor ref resolves against all of them (E3/SCN-03).
    if (Array.isArray(next.connectors)) {
      const seenAnchors = new Set<string>();
      next.connectors = asArray(next.connectors).map((c) => {
        if (!isObj(c) || !Array.isArray(c.anchors)) return c;
        const anchors = (c.anchors as unknown[]).filter((a) => {
          if (!isObj(a) || typeof a.id !== 'string') return true;
          if (seenAnchors.has(a.id)) {
            report.duplicateIds += 1;
            return false;
          }
          seenAnchors.add(a.id);
          return true;
        });
        return { ...c, anchors };
      });
    }

    const layerIds = new Set(
      asArray(next.layers)
        .filter(isObj)
        .map((l) => l.id)
        .filter((id): id is string => typeof id === 'string')
    );

    for (const key of LAYERED_COLLECTIONS) {
      if (!Array.isArray(next[key])) continue;
      next[key] = (next[key] as unknown[]).map((entity) => {
        if (!isObj(entity)) return entity;
        let out: RawObject = entity;

        if (typeof out.layerId === 'string' && !layerIds.has(out.layerId)) {
          report.danglingLayerRefs += 1;
          const { layerId: _dropped, ...rest } = out;
          out = rest;
        }

        for (const field of COORD_FIELDS) {
          if (isObj(out[field])) {
            const repaired = repairCoords(out[field], report);
            if (repaired !== out[field]) out = { ...out, [field]: repaired };
          }
        }
        return out;
      });
    }

    // E2/RED-02's LOAD half, and the other side of RED-07/RED-14.
    //
    // Wave 1's repair-don't-reject ruling: bad refs already in users' files get
    // REPAIRED on load, and the write sites stop producing them. The write
    // sites are the two delete paths (they sweep the anchor graph now); this is
    // the repair for every file the bug already wrote — and for hand-edited or
    // partially-migrated imports, which no write-site fix can reach.
    //
    // Without it, a stored dangling ref survived load and was then a permanent
    // `INVALID_ANCHOR_TO_ANCHOR_REF` — which, until RED-02, made the whole view
    // un-editable. Both halves are needed and neither is sufficient: the sweep
    // stops new ones, this heals the old ones, and RED-02 stops either from
    // taking the editor down while they exist.
    if (Array.isArray(next.connectors)) {
      const before = next.connectors as unknown[];
      const swept = sweepDanglingAnchorRefs(before as never);
      const lost =
        swept.dropped +
        // A removed connector's own anchors stop existing too; count the
        // connector once rather than each of its refs.
        swept.removed;
      if (lost > 0) report.danglingAnchorRefs += lost;
      next.connectors = swept.connectors as unknown as RawObject[];
    }

    return next;
  });

  return { data, report };
};
