import { describe, expect, it } from 'vitest';

import { seatLayerPickerFontWeight } from '../src/picker/fontWeight';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('picker font weight', () => {
  it('rounds a design weight to a weight React Native paints', () => {
    expect(seatLayerPickerFontWeight(800)).toBe('800');
    expect(seatLayerPickerFontWeight(700)).toBe('700');
    // The off-hundred design weights, and the weights the reference picks.
    expect(seatLayerPickerFontWeight(seatLayerPickerTokens.type.peekFromPrice.weight)).toBe('800');
    expect(seatLayerPickerFontWeight(seatLayerPickerTokens.type.noteTitleCompact.weight)).toBe('700');
    expect(seatLayerPickerFontWeight(851)).toBe('900');
  });

  it('clamps out of range and refuses a weight that is not a number', () => {
    expect(seatLayerPickerFontWeight(0)).toBe('100');
    expect(seatLayerPickerFontWeight(4000)).toBe('900');
    expect(seatLayerPickerFontWeight(Number.NaN)).toBe('400');
  });

  it('leaves no design weight the platform would drop', () => {
    const painted = new Set(['100', '200', '300', '400', '500', '600', '700', '800', '900']);
    const weights = Object.values(seatLayerPickerTokens.type)
      .flatMap((entry: unknown) => {
        const weight = (entry as { weight?: unknown }).weight;
        return typeof weight === 'number' ? [weight] : [];
      });
    expect(weights.length).toBeGreaterThan(10);
    for (const weight of weights) {
      expect(painted.has(String(seatLayerPickerFontWeight(weight)))).toBe(true);
    }
  });
});
