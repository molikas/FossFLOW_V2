import { modelItemSchema, modelItemsSchema } from '../modelItems';

describe('modelItemSchema', () => {
  it('validates a correct model item', () => {
    const valid = {
      id: 'item1',
      name: 'Test',
      icon: 'icon1',
      description: 'desc'
    };
    expect(modelItemSchema.safeParse(valid).success).toBe(true);
  });

  describe('headerLink field', () => {
    it('accepts a valid URL as headerLink', () => {
      const result = modelItemSchema.safeParse({
        id: 'item1',
        name: 'Test',
        headerLink: 'https://example.com'
      });
      expect(result.success).toBe(true);
    });

    it('headerLink is optional — item without it is still valid', () => {
      const result = modelItemSchema.safeParse({ id: 'item1', name: 'Test' });
      expect(result.success).toBe(true);
    });

    it('accepts undefined headerLink explicitly', () => {
      const result = modelItemSchema.safeParse({
        id: 'item1',
        name: 'Test',
        headerLink: undefined
      });
      expect(result.success).toBe(true);
    });

    it('rejects headerLink longer than 2048 characters', () => {
      const result = modelItemSchema.safeParse({
        id: 'item1',
        name: 'Test',
        headerLink: 'https://example.com/' + 'a'.repeat(2048)
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue: any) =>
            issue.path.includes('headerLink')
          )
        ).toBe(true);
      }
    });

    it('accepts a headerLink of exactly 2048 characters', () => {
      const result = modelItemSchema.safeParse({
        id: 'item1',
        name: 'Test',
        headerLink: 'a'.repeat(2048)
      });
      expect(result.success).toBe(true);
    });

    it('round-trips through parse: headerLink is preserved', () => {
      const url = 'https://docs.example.com/architecture';
      const result = modelItemSchema.safeParse({
        id: 'item1',
        name: 'Test',
        headerLink: url
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.headerLink).toBe(url);
      }
    });
  });
  it('fails if required fields are missing', () => {
    const invalid = { name: 'Test' };
    const result = modelItemSchema.safeParse(invalid);
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

describe('modelItemsSchema', () => {
  it('validates an array of model items', () => {
    const valid = [
      { id: 'item1', name: 'Test1' },
      { id: 'item2', name: 'Test2', icon: 'icon2' }
    ];
    expect(modelItemsSchema.safeParse(valid).success).toBe(true);
  });
  it('fails if any item is invalid', () => {
    const invalid = [{ id: 'item1', name: 'Test1' }, { name: 'MissingId' }];
    const result = modelItemsSchema.safeParse(invalid);
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
