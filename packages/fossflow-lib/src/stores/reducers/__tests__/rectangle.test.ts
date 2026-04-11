import {
  createRectangle,
  updateRectangle,
  deleteRectangle
} from '../rectangle';
import { State, ViewReducerContext } from '../types';
import { Rectangle, View } from 'src/types';

// Mock the utility functions
jest.mock('src/utils', () => ({
  getItemByIdOrThrow: jest.fn((items: any[], id: string) => {
    const index = items.findIndex(
      (item: any) => (typeof item === 'object' && item.id === id) || item === id
    );
    if (index === -1) {
      throw new Error(`Item with id ${id} not found`);
    }
    return { value: items[index], index };
  })
}));

describe('rectangle reducer', () => {
  let mockState: State;
  let mockContext: ViewReducerContext;
  let mockRectangle: Rectangle;
  let mockView: View;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRectangle = {
      id: 'rect1',
      from: { x: 0, y: 0 },
      to: { x: 5, y: 3 },
      color: 'color1'
    };

    mockView = {
      id: 'view1',
      name: 'Test View',
      items: [],
      connectors: [],
      rectangles: [mockRectangle],
      textBoxes: []
    };

    mockState = {
      model: {
        version: '1.0',
        title: 'Test Model',
        description: '',
        colors: [],
        icons: [],
        items: [],
        views: [mockView]
      },
      scene: {
        connectors: {},
        textBoxes: {}
      }
    };

    mockContext = {
      viewId: 'view1',
      state: mockState
    };
  });

  describe('updateRectangle', () => {
    it('should update rectangle color', () => {
      const updates = {
        id: 'rect1',
        color: 'color3'
      };

      const result = updateRectangle(updates, mockContext);

      expect(result.model.views[0].rectangles![0].color).toBe('color3');
    });

    it('should update rectangle coordinates', () => {
      const updates = {
        id: 'rect1',
        from: { x: 1, y: 1 },
        to: { x: 10, y: 8 }
      };

      const result = updateRectangle(updates, mockContext);

      expect(result.model.views[0].rectangles![0].from).toEqual({ x: 1, y: 1 });
      expect(result.model.views[0].rectangles![0].to).toEqual({ x: 10, y: 8 });
    });

    it('should preserve other properties when partially updating', () => {
      const updates = {
        id: 'rect1',
        color: 'color4'
      };

      const result = updateRectangle(updates, mockContext);

      // Original coordinates should be preserved
      expect(result.model.views[0].rectangles![0].from).toEqual(
        mockRectangle.from
      );
      expect(result.model.views[0].rectangles![0].to).toEqual(mockRectangle.to);
      // Updated property
      expect(result.model.views[0].rectangles![0].color).toBe('color4');
    });

    it('should handle undefined rectangles array', () => {
      mockState.model.views[0].rectangles = undefined;

      const result = updateRectangle(
        { id: 'rect1', color: 'test' },
        mockContext
      );

      // Should return state unchanged
      expect(result).toEqual(mockState);
    });

    it('should throw error when rectangle does not exist', () => {
      expect(() => {
        updateRectangle({ id: 'nonexistent', color: 'test' }, mockContext);
      }).toThrow('Item with id nonexistent not found');
    });

    it('should throw error when view does not exist', () => {
      mockContext.viewId = 'nonexistent';

      expect(() => {
        updateRectangle({ id: 'rect1', color: 'test' }, mockContext);
      }).toThrow('Item with id nonexistent not found');
    });

    it('should update layerId', () => {
      const updates = {
        id: 'rect1',
        layerId: 'layer1'
      };

      const result = updateRectangle(updates, mockContext);

      expect(result.model.views[0].rectangles![0].layerId).toBe('layer1');
    });
  });

  describe('createRectangle', () => {
    it('should create a new rectangle', () => {
      const newRectangle: Rectangle = {
        id: 'rect2',
        from: { x: 5, y: 5 },
        to: { x: 10, y: 8 }
      };

      const result = createRectangle(newRectangle, mockContext);

      // Should be added at the beginning (unshift)
      expect(result.model.views[0].rectangles).toHaveLength(2);
      expect(result.model.views[0].rectangles![0].id).toBe('rect2');
      expect(result.model.views[0].rectangles![1].id).toBe('rect1');
    });

    it('should initialize rectangles array if undefined', () => {
      mockState.model.views[0].rectangles = undefined;

      const newRectangle: Rectangle = {
        id: 'rect2',
        from: { x: 5, y: 5 },
        to: { x: 10, y: 8 }
      };

      const result = createRectangle(newRectangle, mockContext);

      expect(result.model.views[0].rectangles).toHaveLength(1);
      expect(result.model.views[0].rectangles![0].id).toBe('rect2');
    });

    it('should create rectangle with all supported properties', () => {
      const newRectangle: Rectangle = {
        id: 'rect2',
        from: { x: 2, y: 2 },
        to: { x: 8, y: 6 },
        color: 'color6',
        customColor: '#ff0000',
        layerId: 'layer1'
      };

      const result = createRectangle(newRectangle, mockContext);

      const created = result.model.views[0].rectangles![0];
      expect(created.color).toBe('color6');
      expect(created.customColor).toBe('#ff0000');
      expect(created.layerId).toBe('layer1');
      expect(created.from).toEqual({ x: 2, y: 2 });
      expect(created.to).toEqual({ x: 8, y: 6 });
    });

    it('should throw error when view does not exist', () => {
      mockContext.viewId = 'nonexistent';

      const newRectangle: Rectangle = {
        id: 'rect2',
        from: { x: 5, y: 5 },
        to: { x: 10, y: 8 }
      };

      expect(() => {
        createRectangle(newRectangle, mockContext);
      }).toThrow('Item with id nonexistent not found');
    });

    it('should persist all coordinates after creation', () => {
      const newRectangle: Rectangle = {
        id: 'rect2',
        from: { x: 5, y: 5 },
        to: { x: 10, y: 8 }
      };

      const result = createRectangle(newRectangle, mockContext);

      expect(result.model.views[0].rectangles![0]).toMatchObject(newRectangle);
    });
  });

  describe('deleteRectangle', () => {
    it('should delete a rectangle from model', () => {
      const result = deleteRectangle('rect1', mockContext);

      expect(result.model.views[0].rectangles).toHaveLength(0);
    });

    it('should throw error when rectangle does not exist', () => {
      expect(() => {
        deleteRectangle('nonexistent', mockContext);
      }).toThrow('Item with id nonexistent not found');
    });

    it('should throw error when view does not exist', () => {
      mockContext.viewId = 'nonexistent';

      expect(() => {
        deleteRectangle('rect1', mockContext);
      }).toThrow('Item with id nonexistent not found');
    });

    it('should handle empty rectangles array', () => {
      mockState.model.views[0].rectangles = [];

      expect(() => {
        deleteRectangle('rect1', mockContext);
      }).toThrow('Item with id rect1 not found');
    });

    it('should not affect other rectangles when deleting one', () => {
      const rect2: Rectangle = {
        id: 'rect2',
        from: { x: 10, y: 10 },
        to: { x: 15, y: 14 }
      };

      mockState.model.views[0].rectangles = [mockRectangle, rect2];

      const result = deleteRectangle('rect1', mockContext);

      expect(result.model.views[0].rectangles).toHaveLength(1);
      expect(result.model.views[0].rectangles![0].id).toBe('rect2');
    });
  });

  describe('edge cases and state immutability', () => {
    it('should not mutate the original state', () => {
      const originalState = JSON.parse(JSON.stringify(mockState));

      deleteRectangle('rect1', mockContext);

      expect(mockState).toEqual(originalState);
    });

    it('should handle multiple operations in sequence', () => {
      // Create
      let result = createRectangle(
        {
          id: 'rect2',
          from: { x: 20, y: 20 },
          to: { x: 25, y: 23 }
        },
        { ...mockContext, state: mockState }
      );

      // Update
      result = updateRectangle(
        {
          id: 'rect2',
          color: 'updatedColor'
        },
        { ...mockContext, state: result }
      );

      // Delete original
      result = deleteRectangle('rect1', { ...mockContext, state: result });

      expect(result.model.views[0].rectangles).toHaveLength(1);
      expect(result.model.views[0].rectangles![0].id).toBe('rect2');
      expect(result.model.views[0].rectangles![0].color).toBe('updatedColor');
    });

    it('should handle view with multiple rectangles', () => {
      const rectangles: Rectangle[] = Array.from({ length: 5 }, (_, i) => ({
        id: `rect${i}`,
        from: { x: i * 2, y: i * 2 },
        to: { x: i * 2 + 2, y: i * 2 + 2 }
      }));

      mockState.model.views[0].rectangles = rectangles;

      const result = deleteRectangle('rect2', mockContext);

      expect(result.model.views[0].rectangles).toHaveLength(4);
      expect(
        result.model.views[0].rectangles!.find((r) => r.id === 'rect2')
      ).toBeUndefined();
    });
  });
});
