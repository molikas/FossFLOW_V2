/**
 * @jest-environment node
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generatePack } = require('../generateMaterialIconPack.js');

describe('generateMaterialIconPack', () => {
  let icons: ReturnType<typeof generatePack>['icons'];

  beforeAll(() => {
    const pack = generatePack();
    icons = pack.icons;
  });

  it('produces > 1000 icons', () => {
    expect(icons.length).toBeGreaterThan(1000);
  });

  it('every icon has id, collection="material", name, and url fields', () => {
    for (const icon of icons) {
      expect(icon.id).toBeTruthy();
      expect(icon.collection).toBe('material');
      expect(icon.name).toBeTruthy();
      expect(icon.url).toBeTruthy();
    }
  });

  it('no icon has an empty url', () => {
    const empty = icons.filter((i) => !i.url || i.url === '');
    expect(empty).toHaveLength(0);
  });

  it('no duplicate ids', () => {
    const ids = icons.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all urls are valid data:image/svg+xml data URLs', () => {
    for (const icon of icons) {
      expect(icon.url).toMatch(/^data:image\/svg\+xml,/);
    }
  });
});
