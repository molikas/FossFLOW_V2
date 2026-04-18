import {
  sequentialName,
  copySuffix,
  sanitizeName,
  detectCollision,
  countDescendants,
  propagateDirty
} from '../fileOperations';
import type { DiagramMeta, TreeManifest } from '../../services/storage/types';

// ---------------------------------------------------------------------------
// sequentialName
// ---------------------------------------------------------------------------

describe('sequentialName', () => {
  it('returns baseName unchanged when no conflict', () => {
    expect(sequentialName('Untitled', ['Other', 'Another'])).toBe('Untitled');
  });

  it('appends -1 on first conflict', () => {
    expect(sequentialName('Untitled', ['Untitled'])).toBe('Untitled-1');
  });

  it('increments suffix until no conflict', () => {
    expect(sequentialName('Untitled', ['Untitled', 'Untitled-1', 'Untitled-2'])).toBe(
      'Untitled-3'
    );
  });

  it('handles empty existingNames', () => {
    expect(sequentialName('Folder', [])).toBe('Folder');
  });
});

// ---------------------------------------------------------------------------
// copySuffix
// ---------------------------------------------------------------------------

describe('copySuffix', () => {
  it('appends " - Copy" when no conflict', () => {
    expect(copySuffix('MyDiagram', [])).toBe('MyDiagram - Copy');
  });

  it('appends " - Copy (1)" when Copy already exists', () => {
    expect(copySuffix('MyDiagram', ['MyDiagram - Copy'])).toBe('MyDiagram - Copy (1)');
  });

  it('increments numbered suffix until no conflict', () => {
    expect(
      copySuffix('MyDiagram', ['MyDiagram - Copy', 'MyDiagram - Copy (1)', 'MyDiagram - Copy (2)'])
    ).toBe('MyDiagram - Copy (3)');
  });
});

// ---------------------------------------------------------------------------
// sanitizeName
// ---------------------------------------------------------------------------

describe('sanitizeName', () => {
  it('removes all illegal characters', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeName('  hello  ')).toBe('hello');
  });

  it('returns "Untitled" when result is empty after sanitize', () => {
    expect(sanitizeName('/\\:*?"<>|')).toBe('Untitled');
  });

  it('returns "Untitled" for empty string', () => {
    expect(sanitizeName('')).toBe('Untitled');
  });

  it('leaves clean names unchanged', () => {
    expect(sanitizeName('My Diagram 2024')).toBe('My Diagram 2024');
  });
});

// ---------------------------------------------------------------------------
// detectCollision
// ---------------------------------------------------------------------------

describe('detectCollision', () => {
  it('returns true when name is in list', () => {
    expect(detectCollision('foo', ['foo', 'bar'])).toBe(true);
  });

  it('returns false when name is not in list', () => {
    expect(detectCollision('baz', ['foo', 'bar'])).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(detectCollision('FOO', ['foo'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countDescendants
// ---------------------------------------------------------------------------

describe('countDescendants', () => {
  const tree: TreeManifest = {
    folders: [
      { id: 'f1', name: 'Folder 1', parentId: null },
      { id: 'f2', name: 'Folder 2', parentId: 'f1' },
      { id: 'f3', name: 'Folder 3', parentId: 'f1' },
      { id: 'f4', name: 'Folder 4', parentId: 'f2' }
    ]
  };

  const diagrams: DiagramMeta[] = [
    { id: 'd1', name: 'D1', lastModified: '', folderId: 'f1' },
    { id: 'd2', name: 'D2', lastModified: '', folderId: 'f2' },
    { id: 'd3', name: 'D3', lastModified: '', folderId: 'f4' },
    { id: 'd4', name: 'D4', lastModified: '', folderId: null }
  ];

  it('counts correct descendants including nested folders', () => {
    // f1 → f2, f3 (2 folders) + f4 via f2 (1 folder) = 3 folders
    // diagrams in f1: d1; in f2: d2; in f4: d3 → 3 diagrams total
    // total = 6
    expect(countDescendants('f1', tree, diagrams)).toBe(6);
  });

  it('counts only direct children for leaf folder', () => {
    // f4 has no child folders, no diagrams except d3
    expect(countDescendants('f4', tree, diagrams)).toBe(1);
  });

  it('returns 0 for empty folder', () => {
    expect(countDescendants('f3', tree, diagrams)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// propagateDirty
// ---------------------------------------------------------------------------

describe('propagateDirty', () => {
  const tree = {
    folders: [
      { id: 'f1', name: 'Root', parentId: null },
      { id: 'f2', name: 'Child', parentId: 'f1' }
    ]
  };

  it('returns true for folder with dirty child diagram', () => {
    const diagrams: DiagramMeta[] = [
      { id: 'd1', name: 'D1', lastModified: '', folderId: 'f2', isDirty: true }
    ];
    const map = propagateDirty(tree, diagrams);
    expect(map.get('f1')).toBe(true);
    expect(map.get('f2')).toBe(true);
  });

  it('returns false (no entry) when all children are clean', () => {
    const diagrams: DiagramMeta[] = [
      { id: 'd1', name: 'D1', lastModified: '', folderId: 'f2', isDirty: false }
    ];
    const map = propagateDirty(tree, diagrams);
    expect(map.get('f1')).toBeUndefined();
    expect(map.get('f2')).toBeUndefined();
  });

  it('handles diagrams at root (folderId null) without error', () => {
    const diagrams: DiagramMeta[] = [
      { id: 'd1', name: 'D1', lastModified: '', folderId: null, isDirty: true }
    ];
    const map = propagateDirty(tree, diagrams);
    expect(map.size).toBe(0);
  });
});
