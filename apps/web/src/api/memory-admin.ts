import type {
  ComponentResponse,
  DishResponse,
  EquipmentResponse,
  IngredientResponse,
  MenuDraftResponse,
  MenuVersionSummary,
} from '@plateguard/contracts';
import type { Component, ResolvedDish } from '@plateguard/domain';
import { ALLERGEN_NAMES } from '../allergens';
import { ApiError, type AdminClient } from './client';
import type { createMemorySetup } from './memory-setup';
import type { createMemoryPrinters } from './memory-printers';

type Setup = ReturnType<typeof createMemorySetup>;
type PrinterAdmin = ReturnType<typeof createMemoryPrinters>['admin'];

/** The recipe database in memory, built from the demo dishes. For tests and offline demos. */
export function createMemoryAdmin(
  dishes: ResolvedDish[],
): Omit<AdminClient, keyof Setup | 'settings' | 'saveSettings' | keyof PrinterAdmin> {
  const ingredients = new Map<string, IngredientResponse>();
  const equipment = new Map<string, EquipmentResponse>();
  const components = new Map<string, ComponentResponse>();
  const walk = (c: Component) => {
    if (components.has(c.id)) return;
    for (const i of c.ingredients)
      ingredients.set(i.id, {
        id: i.id,
        name: i.name,
        synonyms: [],
        contains: i.contains,
        mayContain: i.mayContain,
        supplier: null,
        brand: null,
        articleNumber: null,
        verifiedAt: i.verified ? new Date(0).toISOString() : null,
        verifiedSource: i.verified ? 'demo' : null,
        usedIn: 0,
      });
    for (const e of c.preparedWith) equipment.set(e.id, { ...e });
    components.set(c.id, {
      id: c.id,
      name: c.name,
      nameNl: null,
      omittable: c.omittable,
      premixed: c.premixed,
      suitableForSevere: c.suitableForSevere,
      ingredientIds: c.ingredients.map((i) => i.id),
      equipmentIds: c.preparedWith.map((e) => e.id),
      childIds: c.components.map((x) => x.id),
      substitutions: c.substitutions.map((s) => ({
        replacementId: s.replacement.id,
        suitableForSevere: s.suitableForSevere,
      })),
    });
    c.components.forEach(walk);
    c.substitutions.forEach((s) => walk(s.replacement));
  };
  dishes.forEach((d) => d.components.forEach(walk));
  const dishRows = new Map<string, DishResponse>(
    dishes.map((d) => [
      d.id,
      {
        id: d.id,
        name: d.name,
        nameNl: null,
        course: 1,
        priceCents: null,
        componentIds: d.components.map((c) => c.id),
      },
    ]),
  );
  let draft = dishes.map((d) => d.id);
  let published: string | null = JSON.stringify(draft);
  const versions: MenuVersionSummary[] = [
    { id: 'v1', version: 1, publishedAt: new Date(0).toISOString(), dishCount: draft.length },
  ];
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-new-${nextId++}`;
  const usedIn = (i: IngredientResponse) => ({
    ...i,
    usedIn: [...components.values()].filter((c) => c.ingredientIds.includes(i.id)).length,
  });
  const fingerprint = () =>
    JSON.stringify([
      draft,
      [...components.values()],
      [...ingredients.values()],
      [...dishRows.values()],
    ]);
  let publishedFingerprint = fingerprint();

  const menu = (): MenuDraftResponse => ({
    menuId: 'menu',
    name: 'Menu',
    dishIds: draft,
    changed: published !== JSON.stringify(draft) || publishedFingerprint !== fingerprint(),
    published: versions[0] ?? null,
    versions,
    warnings: draft.flatMap((dishId) => {
      const dish = dishRows.get(dishId)!;
      const seen = new Set<string>();
      const visit = (cid: string): IngredientResponse[] => {
        if (seen.has(cid)) return [];
        seen.add(cid);
        const c = components.get(cid)!;
        return [...c.ingredientIds.map((i) => ingredients.get(i)!), ...c.childIds.flatMap(visit)];
      };
      return dish.componentIds
        .flatMap(visit)
        .filter((i) => !i.verifiedAt)
        .map((i) => ({
          code: 'UNVERIFIED_INGREDIENT' as const,
          dishId,
          dishName: dish.name,
          name: i.name,
        }));
    }),
  });

  return {
    allergens: async (_, locale) =>
      Object.entries(ALLERGEN_NAMES).map(([code, names]) => ({
        code,
        parent: code.includes('_') ? code.split('_')[0]! : null,
        name: locale === 'nl' ? names.nl : names.en,
      })),
    ingredients: async () => [...ingredients.values()].map(usedIn),
    saveIngredient: async (_, existing, body) => {
      const key = existing ?? id('i');
      const before = ingredients.get(key);
      if (existing && !before) throw new ApiError(404, 'INGREDIENT_NOT_FOUND');
      const row: IngredientResponse = {
        id: key,
        name: body.name,
        synonyms: body.synonyms ?? [],
        contains: body.contains ?? [],
        mayContain: body.mayContain ?? [],
        supplier: body.supplier ?? null,
        brand: body.brand ?? null,
        articleNumber: body.articleNumber ?? null,
        verifiedAt: body.verified ? (before?.verifiedAt ?? new Date().toISOString()) : null,
        verifiedSource: body.verified ? 'manual' : null,
        usedIn: 0,
      };
      ingredients.set(key, row);
      return usedIn(row);
    },
    equipment: async () => [...equipment.values()],
    saveEquipment: async (_, existing, body) => {
      const row = { id: existing ?? id('e'), name: body.name, allergens: body.allergens ?? [] };
      equipment.set(row.id, row);
      return row;
    },
    components: async () => [...components.values()],
    saveComponent: async (_, existing, body) => {
      const row: ComponentResponse = {
        id: existing ?? id('c'),
        name: body.name,
        nameNl: body.nameNl ?? null,
        omittable: body.omittable ?? false,
        premixed: body.premixed ?? false,
        suitableForSevere: body.suitableForSevere ?? false,
        ingredientIds: body.ingredientIds ?? [],
        equipmentIds: body.equipmentIds ?? [],
        childIds: body.childIds ?? [],
        substitutions: (body.substitutions ?? []).map((s) => ({
          replacementId: s.replacementId,
          suitableForSevere: s.suitableForSevere ?? false,
        })),
      };
      components.set(row.id, row);
      return row;
    },
    dishes: async () => [...dishRows.values()],
    saveDish: async (_, existing, body) => {
      const row: DishResponse = {
        id: existing ?? id('d'),
        name: body.name,
        nameNl: body.nameNl ?? null,
        course: body.course ?? 0,
        priceCents: body.priceCents ?? null,
        componentIds: body.componentIds,
      };
      dishRows.set(row.id, row);
      return row;
    },
    menuDraft: async () => menu(),
    setMenuItems: async (_, dishIds) => {
      draft = [...new Set(dishIds)];
      return menu();
    },
    allergenCard: async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    publishMenu: async () => {
      if (draft.length === 0) throw new ApiError(400, 'MENU_EMPTY');
      published = JSON.stringify(draft);
      publishedFingerprint = fingerprint();
      versions.unshift({
        id: `v${versions.length + 1}`,
        version: versions.length + 1,
        publishedAt: new Date().toISOString(),
        dishCount: draft.length,
      });
      return menu();
    },
  };
}
