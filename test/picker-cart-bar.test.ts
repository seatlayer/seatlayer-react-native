import { describe, expect, it } from 'vitest';

import {
  seatLayerCartBarBalanced, seatLayerCartBarLines, seatLayerCartBarParts, seatLayerCartBarPlan,
  seatLayerCartBarTotal, type SeatLayerCartBarWidths,
} from '../src/picker/cartBarRule';
import { seatLayerCartSeatsLine } from '../src/picker/cartSeatsLine';

/** Widths of 14-point letters, each letter `letter` wide and a space of 4. */
function widths(label: string, letter = 8, space = 4): SeatLayerCartBarWidths {
  const parts = seatLayerCartBarParts(label).map((part) => [...part].length * letter);
  return { parts, whole: parts.reduce((sum, part) => sum + part, 0) + Math.max(0, parts.length - 1) * space };
}
const own = ['Find best seats', 'Hold seats & checkout', 'Continue to checkout'];
const plan = (width: number, label: string, letter = 8) => seatLayerCartBarPlan({
  width,
  own: own.map((text) => widths(text, letter)),
  label: [letter, letter * 12.5 / 14, letter * 11.5 / 14].map((size) => widths(label, size)),
  labelIsOwn: own.includes(label),
});

describe('the phone cart row', () => {
  it('breaks lines between words, and between letters where a script has no spaces', () => {
    expect(seatLayerCartBarParts('Hold seats & checkout')).toEqual(['Hold', 'seats', '&', 'checkout']);
    expect(seatLayerCartBarParts('\u9078\u3076')).toEqual(['\u9078', '\u3076']);
    expect(seatLayerCartBarLines(widths('Hold seats & checkout'), 200)).toBe(1);
    expect(seatLayerCartBarLines(widths('Hold seats & checkout'), 100)).toBe(2);
    expect(seatLayerCartBarLines(widths('Hold seats & checkout'), 70)).toBe(3);
  });

  it('balances two lines to the narrowest width that keeps them two', () => {
    const label = widths('Hold seats & checkout');
    const balanced = seatLayerCartBarBalanced(label, 120);
    expect(seatLayerCartBarLines(label, balanced)).toBe(2);
    expect(seatLayerCartBarLines(label, balanced - 2)).toBeGreaterThan(2);
    expect(balanced).toBeLessThan(90);
    expect(seatLayerCartBarBalanced(widths('Find'), 120)).toBe(32);
  });

  it('gives the button its words, at least 112 and at most 46% of the row', () => {
    expect(plan(393, 'Find best seats').buttonWidth).toBe(141);
    expect(plan(393, 'Select').buttonWidth).toBe(112);
    const wide = plan(393, 'Hold seats & checkout');
    expect(wide.buttonWidth).toBeCloseTo((393 - 24) * .46, 5);
    expect(wide.wordsWidth).toBeCloseTo(393 - 24 - 28 - 10 - 10 - wide.buttonWidth, 5);
    expect(wide.under).toBe(false);
  });

  it('puts the button under the words in every state once its own words need more', () => {
    for (const label of [...own, 'Securing your seats', 'Select seats']) {
      const tight = plan(320, label, 14);
      expect(tight.under).toBe(true);
      expect(tight.buttonWidth).toBe(296);
      expect(tight.wordsWidth).toBe(258);
      expect(tight.letters).toBe(0);
    }
  });

  it('makes a busy label smaller instead of the layout, and stops at the smallest', () => {
    expect(plan(393, 'Seats secured. Opening checkout').letters).toBe(0);
    expect(plan(320, 'Seats secured. Opening checkout').letters).toBeGreaterThan(0);
    expect(plan(320, 'Seats secured. Opening checkout').under).toBe(false);
    expect(plan(320, 'One two three four five six seven eight').letters).toBe(2);
  });

  it('drops the total to the second line, and draws it smaller before it is ever cut', () => {
    expect(seatLayerCartBarTotal(60, 40, 120)).toEqual({ beside: true, scale: 1 });
    expect(seatLayerCartBarTotal(60, 80, 120)).toEqual({ beside: false, scale: 1 });
    expect(seatLayerCartBarTotal(60, 150, 120)).toEqual({ beside: false, scale: .8 });
  });

  it('names the seats as the hosted map does', () => {
    const seat = (sectionLabel: string, rowLabel: string, seatNumber: string) => ({ sectionLabel, rowLabel, seatNumber });
    expect(seatLayerCartSeatsLine([seat('Dress Circle', 'C', '6'), seat('Dress Circle', 'C', '7')]))
      .toBe('Dress Circle \u00b7 C-6, C-7');
    expect(seatLayerCartSeatsLine([seat('Stalls', 'A', '1'), seat('Dress Circle', 'C', '7')]))
      .toBe('Stalls A-1, Dress Circle C-7');
    expect(seatLayerCartSeatsLine([{ label: 'A-12' }, { label: 'A-13' }])).toBe('A-12, A-13');
    // A table booked as one is its own name; two kinds of ticket for one place are one place.
    expect(seatLayerCartSeatsLine([{ label: 'FLEX-8', rowLabel: 'FLEX-8' }])).toBe('FLEX-8');
    expect(seatLayerCartSeatsLine([{ label: 'ga-1', displayLabel: 'Floor' }, { label: 'ga-1', displayLabel: 'Floor' }])).toBe('Floor');
    expect(seatLayerCartSeatsLine([])).toBe('');
    expect(seatLayerCartSeatsLine([{ label: '  ' }, { label: 'GA' }])).toBe('GA');
  });
});
