import type { DiagramMeta, FolderMeta, TreeManifest } from '../services/storage/types';

/**
 * Returns baseName if not in existingNames; otherwise appends -1, -2, etc.
 * "Untitled" → "Untitled-1" → "Untitled-2"
 */
export function sequentialName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;
  let i = 1;
  while (existingNames.includes(`${baseName}-${i}`)) i++;
  return `${baseName}-${i}`;
}

/**
 * Returns "Name - Copy"; if that exists appends "(1)", "(2)", etc.
 * "MyDiagram" → "MyDiagram - Copy" → "MyDiagram - Copy (1)"
 */
export function copySuffix(name: string, existingNames: string[]): string {
  const base = `${name} - Copy`;
  if (!existingNames.includes(base)) return base;
  let i = 1;
  while (existingNames.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/**
 * Replaces filesystem-illegal characters (/ \ : * ? " < > |) with underscores, trims whitespace.
 * Returns 'Untitled' if the result is empty or contains only underscores (all chars were illegal).
 */
export function sanitizeName(name: string): string {
  const sanitized = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  if (!sanitized || sanitized.replace(/_/g, '').trim() === '') return 'Untitled';
  return sanitized;
}

/**
 * Returns true if name already exists in targetFolderNames (case-sensitive).
 */
export function detectCollision(name: string, targetFolderNames: string[]): boolean {
  return targetFolderNames.includes(name);
}

/**
 * Counts all descendant folders + diagrams under a given folderId.
 * diagrams parameter is required to count diagram descendants.
 */
export function countDescendants(
  folderId: string,
  tree: TreeManifest,
  diagrams: DiagramMeta[] = []
): number {
  const allFolderIds = new Set<string>();
  allFolderIds.add(folderId);
  let count = 0;

  // BFS to collect all descendant folder IDs
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = tree.folders.filter((f) => f.parentId === current);
    for (const child of children) {
      count++;
      allFolderIds.add(child.id);
      queue.push(child.id);
    }
  }

  // Count diagrams in this folder and all descendant folders
  count += diagrams.filter(
    (d) => d.folderId !== null && d.folderId !== undefined && allFolderIds.has(d.folderId)
  ).length;

  return count;
}

/**
 * Returns a Map of folderId → true when any descendant diagram has isDirty = true.
 * Walks up the ancestor chain for each dirty diagram.
 */
export function propagateDirty(
  tree: Pick<TreeManifest, 'folders'>,
  diagrams: DiagramMeta[]
): Map<string, boolean> {
  const result = new Map<string, boolean>();

  const getAncestors = (folderId: string | null): string[] => {
    if (folderId === null) return [];
    const ancestors: string[] = [];
    let current: string | null = folderId;
    const visited = new Set<string>();
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      ancestors.push(current);
      const folder = tree.folders.find((f) => f.id === current);
      current = folder?.parentId ?? null;
    }
    return ancestors;
  };

  for (const diagram of diagrams) {
    if (diagram.isDirty && diagram.folderId) {
      const ancestors = getAncestors(diagram.folderId);
      for (const id of ancestors) {
        result.set(id, true);
      }
    }
  }

  return result;
}

/**
 * Returns all folder IDs that are descendants of (or equal to) the given folderId.
 * Useful for building delete cascades.
 */
export function getAllDescendantFolderIds(
  folderId: string,
  folders: FolderMeta[]
): string[] {
  const result: string[] = [];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    const children = folders.filter((f) => f.parentId === current);
    for (const child of children) {
      queue.push(child.id);
    }
  }
  return result;
}
