import { Injectable, NotFoundException } from '@nestjs/common';
import type { GuestMenuResponse } from '@plateguard/contracts';
import { assess, type AllergenCode } from '@plateguard/domain';
import { GuestRepository } from './guest.repository.js';

/**
 * The guest's allergen menu, judged by the same engine as service. A guest is treated as having an
 * allergy (not a severe one) to what they avoid; the server tells them to talk to their server.
 */
@Injectable()
export class GuestService {
  constructor(private readonly repo: GuestRepository) {}

  async menu(slug: string, locale: string, avoid: AllergenCode[]): Promise<GuestMenuResponse> {
    const menu = await this.repo.published(slug, locale);
    if (!menu) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    const guest = avoid.map((allergen) => ({ allergen, severity: 'ALLERGY' as const }));
    return {
      location: menu.location,
      published: menu.dishes !== null,
      dishes: (menu.dishes ?? []).map((dish) => {
        const base = { id: dish.id, name: dish.name, course: dish.course };
        if (guest.length === 0) return base;
        const result = assess({ dish, guest });
        return {
          ...base,
          outcome: result.outcome,
          changes: result.modifications.map((m) => ({
            action: m.action,
            componentName: m.componentName,
            ...(m.substitute ? { substituteName: m.substitute.name } : {}),
          })),
        };
      }),
    };
  }
}
