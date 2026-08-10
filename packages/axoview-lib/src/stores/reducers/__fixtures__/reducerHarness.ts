/**
 * Shared reducer harness — promoted from the E2 explore lane (ADR 0047 flip
 * rule) alongside the E2 reducer/cascade fixes in wave 4.
 *
 * The reducers are pure functions over `State = { model, scene }`, so E2 needs
 * no React tree — just a state builder. Kept deliberately close to the fixtures
 * in `stores/reducers/__tests__/` so a probe's result is comparable with the
 * regression suite.
 *
 * Not a spec file — jest only collects `*.test.ts`.
 */
import type { State } from 'src/stores/reducers/types';
import type { Model, View } from 'src/types';

export const VIEW_ID = 'view-1';

export const emptyScene = () => ({ connectors: {}, textBoxes: {} });

type SeedOptions = {
  view?: Partial<View>;
  model?: Partial<Model>;
};

/**
 * Two nodes (A at 0,0 and B at 5,5), one colour, one icon — the smallest state
 * that can carry a connector, a rectangle and a layer.
 */
export function seedState(opts: SeedOptions = {}): State {
  const view: View = {
    id: VIEW_ID,
    name: 'Page 1',
    items: [
      { id: 'node-A', tile: { x: 0, y: 0 } },
      { id: 'node-B', tile: { x: 5, y: 5 } }
    ],
    connectors: [],
    rectangles: [],
    textBoxes: [],
    ...(opts.view ?? {})
  } as View;

  const model: Model = {
    version: '1.0',
    title: 'E2 probe',
    icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
    colors: [{ id: 'c1', value: '#0066cc' }],
    items: [
      { id: 'node-A', name: 'A', icon: 'block' },
      { id: 'node-B', name: 'B', icon: 'block' }
    ],
    views: [view],
    ...(opts.model ?? {})
  } as Model;

  return { model, scene: emptyScene() };
}

export const viewOf = (state: State, viewId = VIEW_ID): View =>
  state.model.views.find((v) => v.id === viewId)!;

