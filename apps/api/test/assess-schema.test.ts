import { describe, expect, it } from 'vitest';
import { AssessRequestZ } from '../src/modules/safety/assess.schema.js';
import { SafetyService } from '../src/modules/safety/safety.service.js';

describe('assess preview', () => {
  it('validates the request and runs the engine, including custom allergies', () => {
    const input = AssessRequestZ.parse({
      dish: {
        kind: 'dish',
        id: 'd1',
        name: 'Soup',
        components: [
          {
            id: 'c1',
            name: 'Soup',
            omittable: false,
            premixed: false,
            suitableForSevere: false,
            preparedWith: [],
            ingredients: [
              { id: 'i1', name: 'Tomato', contains: [], mayContain: ['CELERY'], verified: true },
            ],
            components: [],
            substitutions: [],
          },
        ],
      },
      guest: [{ allergen: 'CELERY', severity: 'ALLERGY' }, { custom: 'tomato' }],
    });
    const result = new SafetyService().preview(input);
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.perAllergy.map((r) => r.outcome)).toEqual(['CAUTION', 'UNKNOWN']);
  });

  it('rejects an unknown severity', () => {
    expect(() =>
      AssessRequestZ.parse({
        dish: { kind: 'unmapped', externalId: 'x', name: 'x' },
        guest: [{ allergen: 'MILK', severity: 'MILD' }],
      }),
    ).toThrow();
  });
});
