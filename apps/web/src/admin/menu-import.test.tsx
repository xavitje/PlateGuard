import { describe, expect, it } from 'vitest';
import { createMemoryClient } from '../api/memory-client';
import { importDishes } from './MenuImport';

describe('menu import', () => {
  it('saves dishes unverified, shares components and ingredients, and only touches the draft', async () => {
    const { admin } = createMemoryClient();
    const loc = 'loc';
    const before = await admin.menuDraft(loc);
    const friesBefore = (await admin.components(loc)).filter((c) => c.name === 'Fries').length;
    const fries = {
      name: 'Fries',
      ingredients: [{ name: 'Potato', contains: [], mayContain: [] }],
    };
    const count = await importDishes(admin, loc, [
      {
        name: 'Steak',
        category: 'Mains',
        priceCents: 2400,
        description: null,
        components: [
          { name: 'Steak', ingredients: [{ name: 'Beef', contains: [], mayContain: [] }] },
          fries,
        ],
      },
      {
        name: 'Fish',
        category: 'Mains',
        priceCents: 2200,
        description: null,
        components: [
          { name: 'Cod', ingredients: [{ name: 'Cod', contains: ['FISH'], mayContain: [] }] },
          fries,
        ],
      },
    ]);
    expect(count).toBe(2);
    const ingredients = await admin.ingredients(loc);
    const cod = ingredients.find((i) => i.name === 'Cod')!;
    expect(cod.contains).toEqual(['FISH']);
    expect(cod.verifiedAt).toBeNull();
    expect(ingredients.filter((i) => i.name === 'Potato')).toHaveLength(1);
    expect((await admin.components(loc)).filter((c) => c.name === 'Fries')).toHaveLength(
      friesBefore + 1,
    );
    const after = await admin.menuDraft(loc);
    expect(after.dishIds.length).toBe(before.dishIds.length + 2);
    expect(after.versions).toEqual(before.versions);
  });
});
