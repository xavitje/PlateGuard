import type { Component, ResolvedDish } from '@plateguard/domain';
import type { TenantTx } from './tenant.js';

/**
 * Reads the recipe tree of a location's dishes as the engine needs it. Components are loaded
 * once and resolved in memory: nesting, substitutes and shared equipment included. Names come
 * in the requested locale when translated.
 */
export async function loadDishes(
  tx: Pick<TenantTx, 'dish' | 'component'>,
  locationId: string,
  locale: string,
): Promise<ResolvedDish[]> {
  const [dishes, components] = await Promise.all([
    tx.dish.findMany({
      where: { locationId },
      include: {
        components: { orderBy: { sortOrder: 'asc' } },
        translations: { where: { locale } },
      },
      orderBy: [{ course: 'asc' }, { name: 'asc' }],
    }),
    tx.component.findMany({
      include: {
        ingredients: { include: { ingredient: true } },
        equipment: { include: { equipment: true } },
        children: true,
        substitutions: true,
        translations: { where: { locale } },
      },
    }),
  ]);
  const rows = new Map(components.map((c) => [c.id, c]));
  const cache = new Map<string, Component>();

  const resolve = (id: string, path: Set<string>): Component | null => {
    const cached = cache.get(id);
    if (cached) return cached;
    const c = rows.get(id);
    // A cycle in the data is a data error: leave the component out rather than loop.
    if (!c || path.has(id)) return null;
    const next = new Set(path).add(id);
    const resolved: Component = {
      id: c.id,
      name: c.translations[0]?.name ?? c.name,
      omittable: c.omittable,
      premixed: c.premixed,
      suitableForSevere: c.suitableForSevere,
      preparedWith: c.equipment.map((e) => ({
        id: e.equipment.id,
        name: e.equipment.name,
        allergens: e.equipment.allergens,
      })),
      ingredients: c.ingredients.map((ci) => ({
        id: ci.ingredient.id,
        name: ci.ingredient.name,
        contains: ci.ingredient.contains,
        mayContain: ci.ingredient.mayContain,
        verified: ci.ingredient.verifiedAt !== null,
      })),
      components: c.children.flatMap((ch) => resolve(ch.childId, next) ?? []),
      substitutions: c.substitutions.flatMap((s) => {
        const replacement = resolve(s.replacementId, next);
        return replacement ? [{ replacement, suitableForSevere: s.suitableForSevere }] : [];
      }),
    };
    cache.set(id, resolved);
    return resolved;
  };

  return dishes.map((d) => ({
    kind: 'dish',
    id: d.id,
    name: d.translations[0]?.name ?? d.name,
    components: d.components.flatMap((dc) => resolve(dc.componentId, new Set()) ?? []),
  }));
}
