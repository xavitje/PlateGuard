import { describe, expect, it } from 'vitest';
import { allergiesFromText } from '../src/index.js';

const codes = (...t: string[]) => allergiesFromText(...t).map((a) => a.allergen ?? `"${a.custom}"`);

describe('allergiesFromText', () => {
  it('reads a till button and a modifier', () => {
    expect(codes('Allergie: melk')).toEqual(['MILK']);
    expect(codes('Notenallergie')).toEqual(['NUTS']);
    expect(codes('Glutenvrij')).toEqual(['GLUTEN']);
    expect(codes('pinda-allergie')).toEqual(['PEANUTS']);
  });

  it('reads free notes in Dutch and English', () => {
    expect(codes('geen noten graag')).toEqual(['NUTS']);
    expect(codes('Zonder ei en zonder sesam')).toEqual(['EGGS', 'SESAME']);
    expect(codes('lactose intolerant')).toEqual(['MILK']);
    expect(codes('severe peanut allergy, no shellfish')).toEqual([
      'PEANUTS',
      'CRUSTACEANS',
      'MOLLUSCS',
    ]);
    expect(codes('allergisch voor hazelnoot')).toEqual(['NUTS_HAZELNUT']);
  });

  it('ignores ingredients without an allergy word', () => {
    expect(codes('extra kaas', 'met vis', 'Stoel 2', 'medium rare')).toEqual([]);
    expect(codes('geen ui')).toEqual([]);
    expect(codes('geen allergieën')).toEqual([]);
    // A whole word only: nootmuskaat is not a nut.
    expect(codes('geen nootmuskaat')).toEqual([]);
  });

  it('keeps an allergy it cannot name as text for the cook', () => {
    expect(codes('Allergie kiwi')).toEqual(['"Allergie kiwi"']);
  });

  it('lists each allergen once over all texts', () => {
    expect(codes('geen noten', 'Notenallergie', 'nut free')).toEqual(['NUTS']);
  });
});
