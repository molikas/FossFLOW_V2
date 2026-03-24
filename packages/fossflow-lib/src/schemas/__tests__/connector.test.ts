import { anchorSchema, connectorLabelSchema, connectorSchema } from '../connector';


describe('anchorSchema', () => {
  it('validates a correct anchor', () => {
    const valid = { id: 'a1', ref: { item: 'item1' } };
    expect(anchorSchema.safeParse(valid).success).toBe(true);
  });
  it('fails if id is missing', () => {
    const invalid = { ref: { item: 'item1' } };
    const result = anchorSchema.safeParse(invalid);
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

describe('anchorSchema — ref field contracts', () => {
  it('accepts anchor with only tile ref', () => {
    expect(anchorSchema.safeParse({ id: 'a1', ref: { tile: { x: 5, y: 10 } } }).success).toBe(true);
  });

  it('accepts anchor with empty ref (all ref fields are optional)', () => {
    expect(anchorSchema.safeParse({ id: 'a1', ref: {} }).success).toBe(true);
  });

  it('accepts anchor with both item AND tile set — documents no exclusivity guard at schema level', () => {
    // The anchorSchema uses .partial() which allows all ref fields simultaneously.
    // There is currently NO Zod validation preventing both item and tile being set.
    // The 2-ref exclusivity rule is an application-level invariant only.
    // If .refine() exclusivity is added in the future, update this test to expect failure.
    const result = anchorSchema.safeParse({
      id: 'a1',
      ref: { item: 'item1', tile: { x: 0, y: 0 } }
    });
    expect(result.success).toBe(true);
  });
});

describe('connectorSchema', () => {
  it('validates a correct connector', () => {
    const valid = { id: 'c1', anchors: [{ id: 'a1', ref: { item: 'item1' } }] };
    expect(connectorSchema.safeParse(valid).success).toBe(true);
  });
  it('fails if anchors is missing', () => {
    const invalid = { id: 'c1' };
    const result = connectorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue: any) => {
          return issue.path.includes('anchors');
        })
      ).toBe(true);
    }
  });
});

describe('connectorLabelSchema', () => {
  const baseLabel = { id: 'l1', text: 'Label', position: 50 };

  it('validates a minimal label', () => {
    expect(connectorLabelSchema.safeParse(baseLabel).success).toBe(true);
  });

  it('accepts optional fontSize within range', () => {
    expect(connectorLabelSchema.safeParse({ ...baseLabel, fontSize: 8 }).success).toBe(true);
    expect(connectorLabelSchema.safeParse({ ...baseLabel, fontSize: 24 }).success).toBe(true);
    expect(connectorLabelSchema.safeParse({ ...baseLabel, fontSize: 14 }).success).toBe(true);
  });

  it('rejects fontSize outside 8–24', () => {
    expect(connectorLabelSchema.safeParse({ ...baseLabel, fontSize: 7 }).success).toBe(false);
    expect(connectorLabelSchema.safeParse({ ...baseLabel, fontSize: 25 }).success).toBe(false);
  });

  it('accepts optional labelColor as hex string', () => {
    expect(connectorLabelSchema.safeParse({ ...baseLabel, labelColor: '#ff0000' }).success).toBe(true);
    expect(connectorLabelSchema.safeParse({ ...baseLabel, labelColor: '#000000' }).success).toBe(true);
  });

  it('fontSize and labelColor are fully optional', () => {
    expect(connectorLabelSchema.safeParse(baseLabel).success).toBe(true);
  });

  it('fails if id is missing', () => {
    const result = connectorLabelSchema.safeParse({ text: 'Label', position: 50 });
    expect(result.success).toBe(false);
  });
});

describe('connectorSchema — anchor count at schema level', () => {
  it('accepts connector with 0 anchors (no minimum enforced at schema level)', () => {
    // The 2-anchor minimum is an application-level invariant, not a Zod constraint.
    // If z.array(anchorSchema).min(2) is added in the future, update this test.
    expect(connectorSchema.safeParse({ id: 'c1', anchors: [] }).success).toBe(true);
  });

  it('accepts connector with exactly 1 anchor', () => {
    const result = connectorSchema.safeParse({
      id: 'c1',
      anchors: [{ id: 'a1', ref: { item: 'x' } }]
    });
    expect(result.success).toBe(true);
  });
});
