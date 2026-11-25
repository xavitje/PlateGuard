import { describe, expect, it } from 'vitest';
import { DEMO_DISHES, DEMO_SERVICE } from '../demo';
import { orderAlerts } from './alerts';
import type { ServiceState } from './state';

const severeGluten = [{ allergen: 'GLUTEN' as const, severity: 'SEVERE' as const }];

describe('orderAlerts', () => {
  it('raises nothing for a guest with an allergy who has not ordered yet', () => {
    const state: ServiceState = {
      '3': { 1: { allergies: severeGluten, noAllergy: false, orders: [] } },
    };
    expect(orderAlerts(state, DEMO_DISHES)).toEqual([]);
  });

  it('raises nothing for orders at a seat without allergies', () => {
    const state: ServiceState = {
      '3': { 1: { allergies: [], noAllergy: true, orders: [{ id: 'o1', dishId: 'd-salad' }] } },
    };
    expect(orderAlerts(state, DEMO_DISHES)).toEqual([]);
  });

  it('raises one alert per ordered dish that needs attention, worst first', () => {
    const state: ServiceState = {
      '3': {
        1: {
          allergies: severeGluten,
          noAllergy: false,
          orders: [
            { id: 'o1', dishId: 'd-steak' }, // jus swapped: modify
            { id: 'o2', dishId: 'd-salad' }, // croutons cannot be fixed for severe: do not serve
            { id: 'o3', dishId: 'd-soup' }, // nothing found: no alert
          ],
        },
      },
    };
    expect(orderAlerts(state, DEMO_DISHES).map((a) => [a.id, a.kind, a.result.outcome])).toEqual([
      ['o2', 'stop', 'DO_NOT_SERVE'],
      ['o1', 'warn', 'ADAPTABLE'],
    ]);
  });

  it('the demo service only alerts on what was ordered', () => {
    expect(
      orderAlerts(DEMO_SERVICE, DEMO_DISHES).map((a) => [a.table, a.seat, a.dish.name, a.kind]),
    ).toEqual([
      ['7', 2, 'Tomato soup', 'stop'],
      ['12', 3, 'Steak, jus and fries', 'warn'],
    ]);
  });
});
