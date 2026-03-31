import { Coords } from 'src/types';
import { useScene } from 'src/hooks/useScene';

const tileKey = (t: Coords) => `${t.x},${t.y}`;

/**
 * Finds the nearest unoccupied tile to the target tile using a spiral search pattern.
 * Uses a Set-based O(1) lookup instead of O(N) getItemAtTile on every candidate tile.
 */
export const findNearestUnoccupiedTile = (
  targetTile: Coords,
  scene: ReturnType<typeof useScene>,
  maxDistance: number = 10
): Coords | null => {
  // Build a Set of all occupied item tiles once — O(N) upfront, O(1) per probe.
  const occupiedTiles = new Set<string>(scene.items.map((i) => tileKey(i.tile)));

  if (!occupiedTiles.has(tileKey(targetTile))) {
    return targetTile;
  }

  // Spiral search pattern: right, down, left, up
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 }
  ];

  for (let distance = 1; distance <= maxDistance; distance++) {
    let currentTile = {
      x: targetTile.x - distance,
      y: targetTile.y - distance
    };

    for (let side = 0; side < 4; side++) {
      const direction = directions[side];
      const sideLength = distance * 2;

      for (let step = 0; step < sideLength; step++) {
        currentTile = {
          x: currentTile.x + direction.x,
          y: currentTile.y + direction.y
        };

        if (!occupiedTiles.has(tileKey(currentTile))) {
          return currentTile;
        }
      }
    }
  }

  return null;
};

/**
 * Finds the nearest unoccupied tile for multiple items being placed/moved.
 * Ensures all items can be placed without overlapping.
 * Uses only a Set for collision detection — no O(N) getItemAtTile calls.
 */
export const findNearestUnoccupiedTilesForGroup = (
  items: { id: string; targetTile: Coords }[],
  scene: ReturnType<typeof useScene>,
  excludeIds: string[] = []
): Coords[] | null => {
  const result: Coords[] = [];
  const occupiedTiles = new Set<string>();

  // Add existing item tiles to the occupied Set (excluding the ones being moved).
  scene.items.forEach((item) => {
    if (!excludeIds.includes(item.id)) {
      occupiedTiles.add(tileKey(item.tile));
    }
  });

  for (const item of items) {
    let foundTile: Coords | null = null;
    const targetKey = tileKey(item.targetTile);

    if (!occupiedTiles.has(targetKey)) {
      foundTile = item.targetTile;
    } else {
      // Search for nearest unoccupied tile in expanding rings.
      outer: for (let distance = 1; distance <= 10; distance++) {
        for (let dx = -distance; dx <= distance; dx++) {
          for (let dy = -distance; dy <= distance; dy++) {
            if (Math.abs(dx) === distance || Math.abs(dy) === distance) {
              const checkTile = {
                x: item.targetTile.x + dx,
                y: item.targetTile.y + dy
              };
              if (!occupiedTiles.has(tileKey(checkTile))) {
                foundTile = checkTile;
                break outer;
              }
            }
          }
        }
      }
    }

    if (!foundTile) {
      return null;
    }

    result.push(foundTile);
    occupiedTiles.add(tileKey(foundTile));
  }

  return result;
};
