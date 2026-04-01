import PF from 'pathfinding';
import { Size, Coords } from 'src/types';

interface Args {
  gridSize: Size;
  from: Coords;
  to: Coords;
}

// LRU-style bounded cache keyed by "fromX,fromY→toX,toY@gridWxgridH".
// Prevents redundant A* runs for identical endpoint pairs (common after paste).
const PATH_CACHE_MAX = 2000;
const pathCache = new Map<string, Coords[]>();

const pathCacheKey = ({ gridSize, from, to }: Args) =>
  `${from.x},${from.y}→${to.x},${to.y}@${gridSize.width}x${gridSize.height}`;

export const findPath = ({ gridSize, from, to }: Args): Coords[] => {
  const key = pathCacheKey({ gridSize, from, to });

  if (pathCache.has(key)) {
    return pathCache.get(key)!;
  }

  const grid = new PF.Grid(gridSize.width, gridSize.height);
  const finder = new PF.AStarFinder({
    heuristic: PF.Heuristic.manhattan,
    diagonalMovement: PF.DiagonalMovement.Always
  });
  const path = finder.findPath(from.x, from.y, to.x, to.y, grid);

  const pathTiles = path.map((tile) => ({ x: tile[0], y: tile[1] }));

  // Evict oldest entry if at capacity (Map preserves insertion order).
  if (pathCache.size >= PATH_CACHE_MAX) {
    pathCache.delete(pathCache.keys().next().value!);
  }
  pathCache.set(key, pathTiles);

  return pathTiles;
};
