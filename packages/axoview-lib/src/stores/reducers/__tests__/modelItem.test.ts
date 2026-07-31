import { model as modelFixture } from 'src/fixtures/model';
import { ModelItem } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
import {
  createModelItem,
  updateModelItem,
  deleteModelItem
} from '../modelItem';

const scene = {
  connectors: {},
  textBoxes: {}
};

describe('Model item reducers works correctly', () => {
  test('Item is added to model correctly', () => {
    const newItem: ModelItem = {
      id: 'newItem',
      name: 'newItem'
    };

    const newState = createModelItem(newItem, {
      model: modelFixture,
      scene
    });

    // TXT-05: the reducer is now the ONE chokepoint that seeds `label = name`
    // (ADR 0032 decouple), so a stored item carries the seeded label alongside
    // everything it was created with.
    expect(newState.model.items[newState.model.items.length - 1]).toStrictEqual(
      { ...newItem, label: 'newItem' }
    );
  });

  test('Item is updated correctly', () => {
    const nodeId = 'node1';
    const updates: Partial<ModelItem> = {
      name: 'test'
    };

    const newState = updateModelItem(nodeId, updates, {
      model: modelFixture,
      scene
    });

    const updatedItem = getItemByIdOrThrow(newState.model.items, nodeId);

    expect(updatedItem.value.name).toBe(updates.name);
  });

  test('Item is deleted correctly', () => {
    const nodeId = 'node1';

    const newState = deleteModelItem(nodeId, {
      model: modelFixture,
      scene
    });

    const deletedItem = () => {
      getItemByIdOrThrow(newState.model.items, nodeId);
    };

    expect(deletedItem).toThrow();
  });
});

describe('createModelItem — no double-write regression', () => {
  const baseState = { model: modelFixture, scene };

  test('item appears exactly once in model.items', () => {
    const newItem: ModelItem = { id: 'unique-once', name: 'Once Only' };
    const newState = createModelItem(newItem, baseState);
    const matches = newState.model.items.filter((i) => i?.id === 'unique-once');
    expect(matches).toHaveLength(1);
  });

  test('returned item equals the input plus the seeded label, and nothing else', () => {
    const newItem: ModelItem = { id: 'exact-match', name: 'Exact' };
    const newState = createModelItem(newItem, baseState);
    const stored = newState.model.items[newState.model.items.length - 1];
    expect(stored).toStrictEqual({ ...newItem, label: 'Exact' });
  });

  // TXT-05 — the ADR 0032 seed runs at CREATION, not only on load. Without it a
  // never-reloaded node has no `label`, the renderer's `label ?? name` fallback
  // is live, and renaming the node in Layers moves its canvas text: the same
  // gesture on the same node behaved differently before and after a reload.
  test('a created node is seeded out of the name fallback (TXT-05)', () => {
    const newState = createModelItem(
      { id: 'seeded', name: 'Untitled' },
      baseState
    );
    const stored = newState.model.items[newState.model.items.length - 1];
    expect(stored.label).toBe('Untitled');
  });

  test('an explicit label wins — including an empty one that hides the label', () => {
    const withLabel = createModelItem(
      { id: 'explicit', name: 'Identity', label: 'On canvas' },
      baseState
    );
    expect(
      withLabel.model.items[withLabel.model.items.length - 1].label
    ).toBe('On canvas');

    const hidden = createModelItem(
      { id: 'hidden', name: 'Identity', label: '' },
      baseState
    );
    expect(hidden.model.items[hidden.model.items.length - 1].label).toBe('');
  });

  test('an item with no name is left alone (nothing to seed from)', () => {
    const newState = createModelItem({ id: 'nameless', name: '' }, baseState);
    const stored = newState.model.items[newState.model.items.length - 1];
    expect(stored.label).toBeUndefined();
  });

  test('input state is not mutated (immutability)', () => {
    const newItem: ModelItem = { id: 'immut-check', name: 'Immutable' };
    const before = baseState.model.items.length;
    createModelItem(newItem, baseState);
    expect(baseState.model.items.length).toBe(before);
  });
});

describe('deleteModelItem — sparse array pin', () => {
  test('deleted item is no longer findable by id', () => {
    const nodeId = 'node1';
    const newState = deleteModelItem(nodeId, { model: modelFixture, scene });
    expect(() => getItemByIdOrThrow(newState.model.items, nodeId)).toThrow();
  });

  test('array length is unchanged after delete (sparse — documents current behavior)', () => {
    const nodeId = 'node1';
    const before = modelFixture.items.length;
    const newState = deleteModelItem(nodeId, { model: modelFixture, scene });
    // delete operator creates a hole; length is preserved. This pin documents
    // the known sparse-array behavior (§10 gotcha) so any future splice-based
    // fix will be caught by the change in this assertion.
    expect(newState.model.items.length).toBe(before);
  });
});
