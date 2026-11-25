import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, eventJsonSchemas, parseEvent } from '../src/index.js';

const plate = {
  plateId: '6f1c1a52-6a0b-4a4c-9f0e-2d9a1c1d1e01',
  locationId: '6f1c1a52-6a0b-4a4c-9f0e-2d9a1c1d1e02',
  servicePoint: '12',
  seat: 3,
};

describe('event contracts', () => {
  it('every event name carries a version', () => {
    for (const t of EVENT_TYPES) expect(t).toMatch(/\.v\d+$/);
  });

  it('parses a valid plate.flagged.v1', () => {
    const data = parseEvent('plate.flagged.v1', {
      ...plate,
      outcome: 'ADAPTABLE',
      modifications: [],
    });
    expect(data.outcome).toBe('ADAPTABLE');
  });

  it('strips fields that are not in the contract, such as a guest name', () => {
    const data = parseEvent('plate.rejected.v1', {
      ...plate,
      reason: 'wrong sauce',
      guestName: 'J. Jansen',
    });
    expect(data).not.toHaveProperty('guestName');
  });

  it('rejects an unknown outcome', () => {
    expect(() =>
      parseEvent('plate.flagged.v1', { ...plate, outcome: 'SAFE', modifications: [] }),
    ).toThrow();
  });

  it('publishes a JSON Schema per event', () => {
    const schemas = eventJsonSchemas();
    expect(Object.keys(schemas)).toEqual(EVENT_TYPES);
  });
});
