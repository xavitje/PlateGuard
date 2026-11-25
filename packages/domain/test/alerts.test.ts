import { describe, expect, it } from 'vitest';
import { orderAlerts, type SeatOrders } from '../src/index.js';
import { component, dish, ingredient, simple, substitute } from './fixtures.js';

const steak = dish('Steak', [
  component('Jus', {
    id: 'jus',
    ingredients: [ingredient('Flour', { contains: ['GLUTEN_WHEAT'] })],
    substitutions: [substitute(simple('GF jus', {}, { suitableForSevere: true }), true)],
  }),
]);
const salad = dish('Salad', [
  simple('Croutons', { contains: ['GLUTEN_WHEAT'] }, { omittable: true }),
]);
const soup = dish('Soup', [simple('Soup', {})]);
const dishes = [steak, salad, soup];
const severeGluten = [{ allergen: 'GLUTEN', severity: 'SEVERE' as const }];

const seat = (allergies: SeatOrders['allergies'], dishIds: string[]): SeatOrders => ({
  table: '3',
  seat: 1,
  allergies,
  orders: dishIds.map((dishId, i) => ({ id: `o${i + 1}`, dishId })),
});

describe('orderAlerts', () => {
  it('raises nothing for a guest with an allergy who has not ordered yet', () => {
    expect(orderAlerts([seat(severeGluten, [])], dishes)).toEqual([]);
  });

  it('raises nothing for orders at a seat without allergies', () => {
    expect(orderAlerts([seat([], [salad.id])], dishes)).toEqual([]);
  });

  it('raises one alert per ordered dish that needs attention, worst first', () => {
    const alerts = orderAlerts([seat(severeGluten, [steak.id, salad.id, soup.id])], dishes);
    expect(alerts.map((a) => [a.id, a.kind, a.result.outcome])).toEqual([
      ['o2', 'stop', 'DO_NOT_SERVE'],
      ['o1', 'warn', 'ADAPTABLE'],
    ]);
  });
});
