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

    expect(newState.model.items[newState.model.items.length - 1]).toStrictEqual(
      newItem
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

  test('returned item equals the input newModelItem exactly', () => {
    const newItem: ModelItem = { id: 'exact-match', name: 'Exact' };
    const newState = createModelItem(newItem, baseState);
    const stored = newState.model.items[newState.model.items.length - 1];
    expect(stored).toStrictEqual(newItem);
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
