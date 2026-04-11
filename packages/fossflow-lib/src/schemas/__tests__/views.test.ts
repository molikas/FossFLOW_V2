import { viewItemSchema, viewSchema, viewsSchema } from '../views';

describe('viewItemSchema', () => {
  it('validates a correct view item', () => {
    const valid = { id: 'item1', tile: { x: 1, y: 2 } };
    expect(viewItemSchema.safeParse(valid).success).toBe(true);
  });
  it('accepts optional labelColor', () => {
    expect(
      viewItemSchema.safeParse({
        id: 'item1',
        tile: { x: 0, y: 0 },
        labelColor: '#ff0000'
      }).success
    ).toBe(true);
  });
  it('labelColor is optional — omitting it still passes', () => {
    expect(
      viewItemSchema.safeParse({ id: 'item1', tile: { x: 0, y: 0 } }).success
    ).toBe(true);
  });
  it('accepts optional zIndex integer', () => {
    expect(
      viewItemSchema.safeParse({ id: 'item1', tile: { x: 0, y: 0 }, zIndex: 3 })
        .success
    ).toBe(true);
  });
  it('rejects zIndex if non-integer', () => {
    const result = viewItemSchema.safeParse({
      id: 'item1',
      tile: { x: 0, y: 0 },
      zIndex: 1.5
    });
    expect(result.success).toBe(false);
  });
  it('accepts optional layerId', () => {
    expect(
      viewItemSchema.safeParse({
        id: 'item1',
        tile: { x: 0, y: 0 },
        layerId: 'layer-abc'
      }).success
    ).toBe(true);
  });
  it('fails if required fields are missing', () => {
    const invalid = { tile: { x: 1, y: 2 } };
    const result = viewItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue: any) => {
          return issue.path.includes('id');
        })
      ).toBe(true);
    }
  });
});

describe('viewSchema', () => {
  it('validates a correct view', () => {
    const valid = {
      id: 'view1',
      name: 'View',
      items: [{ id: 'item1', tile: { x: 0, y: 0 } }]
    };
    expect(viewSchema.safeParse(valid).success).toBe(true);
  });
  it('fails if items is missing', () => {
    const invalid = { id: 'view1', name: 'View' };
    const result = viewSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue: any) => {
          return issue.path.includes('items');
        })
      ).toBe(true);
    }
  });
});

describe('viewSchema layers field', () => {
  it('accepts a view with layers array', () => {
    const valid = {
      id: 'view1',
      name: 'View',
      items: [],
      layers: [{ id: 'l1', name: 'BG', visible: true, locked: false, order: 0 }]
    };
    expect(viewSchema.safeParse(valid).success).toBe(true);
  });

  it('layers is optional — view without it still validates', () => {
    const valid = { id: 'view1', name: 'View', items: [] };
    expect(viewSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid layer in layers array', () => {
    const invalid = {
      id: 'view1',
      name: 'View',
      items: [],
      layers: [{ name: 'Missing id', visible: true, locked: false, order: 0 }]
    };
    expect(viewSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('viewsSchema', () => {
  it('validates an array of views', () => {
    const valid = [
      {
        id: 'view1',
        name: 'View',
        items: [{ id: 'item1', tile: { x: 0, y: 0 } }]
      }
    ];
    expect(viewsSchema.safeParse(valid).success).toBe(true);
  });
  it('fails if any view is invalid', () => {
    const invalid = [
      {
        id: 'view1',
        name: 'View',
        items: [{ id: 'item1', tile: { x: 0, y: 0 } }]
      },
      { id: 'view2', name: 'View2' }
    ];
    const result = viewsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue: any) => {
          return issue.path.includes('items');
        })
      ).toBe(true);
    }
  });
});
