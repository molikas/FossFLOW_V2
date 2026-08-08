/**
 * A4 rig — a capture stub for `react-arborist`'s `<Tree>`.
 *
 * FEX-08..15 are all about `FileExplorer`'s OWN handlers (`handleMove`,
 * `confirmDelete`, `handleRenameSubmit`, `placeOfId`, `handleMoveToDrive`,
 * `driveRootMissing`); arborist only routes DOM gestures into them. Driving the
 * real tree under jsdom would mean react-dnd drag simulation plus a virtualizer
 * that renders zero rows at the height jsdom reports (`clientHeight === 0`) —
 * i.e. paying a large rig cost to exercise a dependency the hypotheses are not
 * about, and getting a probe that fails for reasons unrelated to the claim.
 *
 * So: the stub renders nothing and records the props `FileExplorer` handed it.
 * `captured.props.data` is the composed tree exactly as the user would see it
 * (section roots, state rows, pending node), and `onMove`/`onRename`/`onSelect`
 * are the same callbacks a real drag/rename/click would reach. The `TreeApi`
 * handle records `edit`/`open`/`closeAll` calls instead of performing them.
 *
 * Mount it from a probe with:
 *   jest.mock('react-arborist', () => require('../../testUtils/arboristStub'));
 */
import React from 'react';
import type { FileNode } from '../hooks/useFileTree';

export interface TreeProps {
  data: FileNode[];
  onMove: (args: { dragIds: string[]; parentId: string | null; index: number }) => unknown;
  onRename: (args: { id: string; name: string; node: unknown }) => unknown;
  onSelect: (nodes: Array<{ data: FileNode }>) => void;
  disableDrag: (data: FileNode) => boolean;
  disableDrop: (args: { parentNode: unknown; dragNodes: unknown[] }) => boolean;
  children: unknown;
  [k: string]: unknown;
}

export const captured: { props: TreeProps | null; renders: number } = {
  props: null,
  renders: 0
};

/** Calls FileExplorer made on the imperative TreeApi handle. */
export const apiCalls: Array<{ method: string; arg?: string }> = [];

export const treeApi = {
  edit: (id: string) => { apiCalls.push({ method: 'edit', arg: id }); },
  open: (id: string) => { apiCalls.push({ method: 'open', arg: id }); },
  closeAll: () => { apiCalls.push({ method: 'closeAll' }); }
};

export function resetArborist(): void {
  captured.props = null;
  captured.renders = 0;
  apiCalls.length = 0;
}

// This export is the module's whole reason to exist, and knip cannot see that:
// suites reach it as `jest.mock('react-arborist', () => require('…/arboristStub'))`
// and `FileExplorer` then imports `{ Tree }` from the mocked module — a require()
// inside a mock factory is invisible to static analysis, so knip reported `Tree`
// as a dead export from the moment this file left the (knip-ignored) probe lane.
// It is entry-listed in `knip.json` rather than exempted by rule; deleting it
// would take every FileExplorer suite with it.
//
// `React.forwardRef`'s inferred prop type is `Omit<TreeProps, 'ref'>`, which
// tsc will not widen back to TreeProps — so the cast is on the captured value
// rather than on the component. (Only surfaced once this file moved out of the
// tsc-excluded explore lane, 2026-08-02.)
export const Tree = React.forwardRef<typeof treeApi, TreeProps>(function Tree(
  props,
  ref
) {
  captured.props = props as TreeProps;
  captured.renders += 1;
  React.useImperativeHandle(ref, () => treeApi, []);
  return null;
});

/** Flatten the composed tree the way a user reads it, top to bottom. */
export function flatten(nodes: FileNode[] | undefined): FileNode[] {
  return (nodes ?? []).flatMap((n) => [n, ...flatten(n.children)]);
}

export function rowIds(nodes: FileNode[] | undefined): string[] {
  return flatten(nodes).map((n) => n.id);
}

/** The props the component last rendered with — throws rather than return null. */
export function treeProps(): TreeProps {
  if (!captured.props) throw new Error('arboristStub: <Tree> never rendered');
  return captured.props;
}
