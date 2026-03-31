import { ModelItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';

// WeakMap keyed by the items array reference — GC'd automatically when the array is replaced by Immer.
// Builds a Map<id, ModelItem> once per unique array reference, then O(1) per lookup.
const itemIndexCache = new WeakMap<ModelItem[], Map<string, ModelItem>>();

const getItemFromIndex = (items: ModelItem[], id: string): ModelItem | null => {
  if (!itemIndexCache.has(items)) {
    itemIndexCache.set(items, new Map(items.map((item) => [item.id, item])));
  }
  return itemIndexCache.get(items)!.get(id) ?? null;
};

export const useModelItem = (id: string): ModelItem | null => {
  return useModelStore(
    (state) => getItemFromIndex(state.items, id),
    // Immer preserves object references for unchanged items — === comparison is correct here.
    (a, b) => a === b
  );
};
