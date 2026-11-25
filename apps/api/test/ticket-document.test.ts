import { describe, expect, it } from 'vitest';
import { toPlainText, toStarMarkup, wrap } from '../src/integrations/core/ticket-document.js';

describe('printed ticket', () => {
  it('wraps on spaces, and breaks a word longer than a line', () => {
    expect(wrap('Leave off the croutons please', 12)).toEqual([
      'Leave off',
      'the croutons',
      'please',
    ]);
    expect(wrap('Hollandaisesauce', 6)).toEqual(['Hollan', 'daises', 'auce']);
  });

  it('indents a long checklist point under its box', () => {
    const text = toPlainText([{ kind: 'check', text: 'Check by hand: sunflower oil' }], 20);
    expect(text.split('\n').slice(0, 2)).toEqual(['[ ] Check by hand:', '    sunflower oil']);
  });

  it('escapes brackets in markup, so a label cannot become a printer command', () => {
    const markup = toStarMarkup([
      { kind: 'title', text: 'Allergy ticket' },
      { kind: 'text', text: 'Note [cut] here', bold: true },
    ]);
    expect(markup).toContain('[magnify: width 2; height 2][bold: on]ALLERGY TICKET');
    expect(markup).toContain('[bold: on]Note \\[cut] here[bold: off]');
    expect(markup.endsWith('[cut: feed; partial]')).toBe(true);
  });
});
