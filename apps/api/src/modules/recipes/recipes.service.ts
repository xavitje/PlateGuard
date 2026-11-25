import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ComponentInput,
  DishInput,
  IngredientInput,
  MenuDraftResponse,
  MenuVersionSummary,
  PublishWarning,
} from '@plateguard/contracts';
import { can, type Component, type Principal, type ResolvedDish } from '@plateguard/domain';
import type { TenantContext } from '../auth/permissions.js';
import { RecipesRepository, type MenuSnapshot } from './recipes.repository.js';

/** Problems a chef should see before guests do. Publishing is still allowed: the engine says UNKNOWN. */
export function publishWarnings(dishes: ResolvedDish[]): PublishWarning[] {
  const warnings = new Map<string, PublishWarning>();
  const walk = (dish: ResolvedDish, c: Component) => {
    if (c.ingredients.length === 0 && c.components.length === 0)
      warnings.set(`${dish.id}:c:${c.id}`, {
        code: 'EMPTY_COMPONENT',
        dishId: dish.id,
        dishName: dish.name,
        name: c.name,
      });
    for (const i of c.ingredients)
      if (!i.verified)
        warnings.set(`${dish.id}:i:${i.id}`, {
          code: 'UNVERIFIED_INGREDIENT',
          dishId: dish.id,
          dishName: dish.name,
          name: i.name,
        });
    for (const child of c.components) walk(dish, child);
    for (const s of c.substitutions) walk(dish, s.replacement);
  };
  for (const d of dishes) for (const c of d.components) walk(d, c);
  return [...warnings.values()];
}

/** True when adding parent → child edges makes a component contain itself. */
export function makesCycle(graph: Map<string, string[]>, parent: string, children: string[]) {
  const seen = new Set<string>();
  const stack = [...children];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === parent) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(graph.get(id) ?? []));
  }
  return false;
}

/**
 * The recipe database and the menu. Edits change the draft only; service keeps working from
 * the published version until someone with menu.publish publishes again.
 */
@Injectable()
export class RecipesService {
  constructor(private readonly repo: RecipesRepository) {}

  allergens(ctx: TenantContext, locale: string) {
    return this.repo.allergens(ctx, locale);
  }

  ingredients(ctx: TenantContext) {
    return this.repo.ingredients(ctx);
  }

  async saveIngredient(
    ctx: TenantContext,
    user: Principal,
    location: { id: string; organizationId: string },
    id: string | null,
    input: IngredientInput,
  ) {
    if (input.verified && !can(user, 'ingredient.verify', location))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: { permission: 'ingredient.verify' },
      });
    const saved = await this.repo.saveIngredient(ctx, id, input, user.userId);
    if (!saved) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    return saved;
  }

  equipment(ctx: TenantContext) {
    return this.repo.equipment(ctx);
  }

  async saveEquipment(
    ctx: TenantContext,
    id: string | null,
    input: { name: string; allergens: string[] },
  ) {
    const saved = await this.repo.saveEquipment(ctx, id, input);
    if (!saved) throw new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND' });
    return saved;
  }

  components(ctx: TenantContext) {
    return this.repo.components(ctx);
  }

  async saveComponent(ctx: TenantContext, id: string | null, input: ComponentInput) {
    const replacements = input.substitutions.map((s) => s.replacementId);
    await this.requireAll(ctx, 'ingredient', input.ingredientIds);
    await this.requireAll(ctx, 'equipment', input.equipmentIds);
    await this.requireAll(ctx, 'component', [...input.childIds, ...replacements]);
    if (id && replacements.includes(id)) throw new BadRequestException({ code: 'COMPONENT_CYCLE' });
    if (id && makesCycle(await this.repo.componentGraph(ctx), id, input.childIds))
      throw new BadRequestException({ code: 'COMPONENT_CYCLE' });
    const saved = await this.repo.saveComponent(ctx, id, input);
    if (!saved) throw new NotFoundException({ code: 'COMPONENT_NOT_FOUND' });
    return saved;
  }

  dishes(ctx: TenantContext, locationId: string) {
    return this.repo.dishes(ctx, locationId);
  }

  async saveDish(ctx: TenantContext, locationId: string, id: string | null, input: DishInput) {
    await this.requireAll(ctx, 'component', input.componentIds);
    const saved = await this.repo.saveDish(ctx, locationId, id, input);
    if (!saved) throw new NotFoundException({ code: 'DISH_NOT_FOUND' });
    return saved;
  }

  async menu(ctx: TenantContext, locationId: string): Promise<MenuDraftResponse> {
    const { menu, dishIds, versions } = await this.repo.menu(ctx, locationId);
    const draft = await this.repo.draftSnapshot(ctx, locationId, dishIds);
    const summaries = versions.map(summary);
    const published = versions.find((v) => v.status === 'PUBLISHED');
    return {
      menuId: menu.id,
      name: menu.name,
      dishIds,
      changed: !published || canonical(published.snapshot) !== canonical(draft),
      published: published ? summary(published) : null,
      versions: summaries,
      warnings: publishWarnings(draft.dishes.en),
    };
  }

  async setMenuItems(ctx: TenantContext, locationId: string, dishIds: string[]) {
    const unique = [...new Set(dishIds)];
    const own = new Set((await this.repo.dishes(ctx, locationId)).map((d) => d.id));
    if (unique.some((id) => !own.has(id)))
      throw new BadRequestException({ code: 'DISH_NOT_FOUND' });
    const { menu } = await this.repo.menu(ctx, locationId);
    await this.repo.setMenuItems(ctx, locationId, menu.id, unique);
    return this.menu(ctx, locationId);
  }

  async publish(ctx: TenantContext, locationId: string, userId: string) {
    const { menu, dishIds } = await this.repo.menu(ctx, locationId);
    if (dishIds.length === 0) throw new BadRequestException({ code: 'MENU_EMPTY' });
    const snapshot = await this.repo.draftSnapshot(ctx, locationId, dishIds);
    await this.repo.publish(ctx, locationId, menu.id, snapshot, userId);
    return this.menu(ctx, locationId);
  }

  private async requireAll(
    ctx: TenantContext,
    kind: 'ingredient' | 'equipment' | 'component',
    ids: string[],
  ) {
    const found = await this.repo.existing(ctx, kind, [...new Set(ids)]);
    if (ids.some((id) => !found.has(id)))
      throw new BadRequestException({ code: `UNKNOWN_${kind.toUpperCase()}` });
  }
}

/** JSON with sorted keys: Postgres jsonb does not keep key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function summary(v: {
  id: string;
  version: number;
  publishedAt: Date | null;
  snapshot: unknown;
}): MenuVersionSummary {
  return {
    id: v.id,
    version: v.version,
    publishedAt: (v.publishedAt ?? new Date(0)).toISOString(),
    dishCount: (v.snapshot as MenuSnapshot | null)?.dishes.en.length ?? 0,
  };
}
