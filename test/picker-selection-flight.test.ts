import { describe, expect, it } from 'vitest';

import { planSeatLayerSelectionFlight } from '../src/picker/selectionFlightState';

describe('selection flight geometry', () => {
  it('links a measured confirmation card to the cart peek in local coordinates', () => {
    expect(planSeatLayerSelectionFlight(
      { x: 20, y: 40, width: 390, height: 844 },
      { x: 215, y: 430 },
      34,
    )).toEqual({
      from: { x: 195, y: 390 },
      to: { x: 195, y: 786 },
    });
  });

  it('rejects unusable measurements instead of flying from a screen corner', () => {
    expect(planSeatLayerSelectionFlight(
      { x: 0, y: 0, width: 0, height: 844 },
      { x: 10, y: 10 },
      0,
    )).toBeUndefined();
  });
});
