import { layerSchema, layersSchema } from '../layer';

describe('layerSchema', () => {
  const validLayer = {
    id: 'layer1',
    name: 'Background',
    visible: true,
    locked: false,
    order: 0
  };

  it('validates a correct layer', () => {
    expect(layerSchema.safeParse(validLayer).success).toBe(true);
  });

  it('fails if id is missing', () => {
    const { id: _, ...rest } = validLayer;
    const result = layerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails if visible is missing', () => {
    const { visible: _, ...rest } = validLayer;
    const result = layerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails if locked is missing', () => {
    const { locked: _, ...rest } = validLayer;
    const result = layerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails if order is not an integer', () => {
    const result = layerSchema.safeParse({ ...validLayer, order: 1.5 });
    expect(result.success).toBe(false);
  });

  it('round-trips through parse', () => {
    const result = layerSchema.safeParse(validLayer);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validLayer);
    }
  });
});

describe('layersSchema', () => {
  it('validates an array of layers', () => {
    const valid = [
      { id: 'l1', name: 'L1', visible: true, locked: false, order: 0 },
      { id: 'l2', name: 'L2', visible: false, locked: true, order: 1 }
    ];
    expect(layersSchema.safeParse(valid).success).toBe(true);
  });

  it('validates an empty array', () => {
    expect(layersSchema.safeParse([]).success).toBe(true);
  });

  it('fails if any layer is invalid', () => {
    const invalid = [
      { id: 'l1', name: 'L1', visible: true, locked: false, order: 0 },
      { name: 'Missing id', visible: true, locked: false, order: 1 }
    ];
    expect(layersSchema.safeParse(invalid).success).toBe(false);
  });
});
