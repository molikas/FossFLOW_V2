/**
 * REPRO — a diagram that needs a lazily-loaded pack must have that pack's icons
 * in the catalog the CALLER commits to the canvas after awaiting the load.
 */
import React, { useRef, useState } from 'react';
import { render, act, screen } from '@testing-library/react';
import { useIconPackManager } from '../iconPackManager';
import type { Icon } from 'axoview';

jest.mock('@isoflow/isopacks/dist/utils', () => ({
  flattenCollections: (packs: Array<{ icons: unknown[] }>) =>
    packs.flatMap((p) => p.icons)
}));

jest.mock(
  '../../assets/material-icons-pack.json',
  () => ({
    id: 'material',
    name: 'material',
    icons: [
      { id: 'material_DoubleArrow', name: 'Double Arrow', collection: 'material', url: 'data:svg1' }
    ]
  }),
  { virtual: true }
);

const CORE: Icon[] = [{ id: 'block', name: 'Block', collection: 'isoflow', url: 'x' } as Icon];

const DIAGRAM = {
  requiredPacks: ['material'],
  items: [{ id: 'i1', icon: 'material_DoubleArrow' }],
  icons: [{ id: 'imp1', name: 'Imported', collection: 'imported', url: 'data:png' }]
};

// Mirrors the real call sites in DiagramLifecycleProvider: await the pack load,
// then build the model's icon list from the manager's icons.
const Harness: React.FC<{
  onCommit: (icons: Icon[]) => void;
  onStaleRead: (icons: Icon[]) => void;
}> = ({ onCommit, onStaleRead }) => {
  const mgr = useIconPackManager(CORE);
  const [done, setDone] = useState(false);
  const ranRef = useRef(false);
  const load = async () => {
    await mgr.loadPacksForDiagram(DIAGRAM);
    const imported = DIAGRAM.icons.filter((i) => i.collection === 'imported') as Icon[];
    // What the call sites used to read — captured before the await, so it can
    // never contain the pack that was just fetched. Recorded, not used.
    onStaleRead(mgr.loadedIcons);
    onCommit([...mgr.getLoadedIcons(), ...imported]);
    setDone(true);
  };
  if (!ranRef.current) {
    ranRef.current = true;
    void load();
  }
  return <div data-testid="state">{done ? 'committed' : 'pending'}</div>;
};

describe('a diagram that needs a lazily-loaded pack', () => {
  const run = async () => {
    const commits: Icon[][] = [];
    const stale: Icon[][] = [];
    await act(async () => {
      render(
        <Harness
          onCommit={(i) => commits.push(i)}
          onStaleRead={(i) => stale.push(i)}
        />
      );
    });
    expect(screen.getByTestId('state')).toHaveTextContent('committed');
    return { committed: commits[commits.length - 1], stale: stale[stale.length - 1] };
  };

  it('commits a catalog containing the pack icon its items reference', async () => {
    const { committed } = await run();
    const ids = committed.map((i) => i.id);
    // The imported icon travels inside the diagram, so it never regressed —
    // it is the CONTROL that made the pack-icon failure look selective.
    expect(ids).toContain('imp1');
    expect(ids).toContain('material_DoubleArrow');
  });

  it('does not duplicate pack icons in the committed catalog', async () => {
    const { committed } = await run();
    expect(new Set(committed.map((i) => i.id)).size).toBe(committed.length);
  });

  it('WHY the ref exists: the state field read after the await is still stale', async () => {
    const { stale } = await run();
    expect(stale.map((i) => i.id)).not.toContain('material_DoubleArrow');
  });
});
