import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: { addEventListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: <T,>(value: T) => value, absoluteFill: {}, hairlineWidth: 1 },
  View: 'View',
}));

import { SeatLayerPickerSeatLift } from '../src/picker/seatLift';
import { seatLayerPickerSpotlightAnchor } from '../src/picker/SpotlightGlass';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('§3.8.2 the spotlight follows the seat through the lift', () => {
  function lift(replies: readonly { dy: number; gestures: number }[]) {
    const seen: number[] = [];
    let index = 0;
    const instance = new SeatLayerPickerSeatLift(
      { frameSeat: async () => replies[Math.min(index++, replies.length - 1)] },
      { setTimeout: () => 0, clearTimeout: () => undefined },
      [],
    );
    instance.setAnchorListener((dy) => seen.push(dy));
    return { instance, seen };
  }
  const band = { mapHeight: 800, top: 60, bottom: 40, sheet: 300 };

  it('reports the pan made since the snapshot the chrome is reading', async () => {
    const { instance, seen } = lift([{ dy: -120, gestures: 0 }]);
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(instance.dy).toBe(-120);
    expect(instance.anchorDy).toBe(-120);
    expect(seen).toEqual([-120]);
    // Cut the hole at the reported point alone and it lands a lift band below
    // the seat, showing the neighbours while the seat stays under the blur.
    expect(seatLayerPickerSpotlightAnchor({ x: 50, y: 400 }, instance.anchorDy)).toEqual({ x: 50, y: 280 });
  });

  it('resets the moment a newer snapshot arrives, whose points already stand', async () => {
    const { instance } = lift([{ dy: -120, gestures: 0 }, { dy: -10, gestures: 0 }]);
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    instance.sync({ seatId: 'seat-a', revision: 5, ...band });
    expect(instance.anchorDy).toBe(0);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(instance.anchorDy).toBe(-10);
    // The TOTAL pan is still the sum: the restore puts the map all the way back.
    expect(instance.dy).toBe(-130);
  });

  it('forgets the anchor when the card goes', async () => {
    const { instance } = lift([{ dy: -120, gestures: 0 }]);
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    instance.sync({ seatId: 'seat-a', revision: 4, ...band });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    instance.forget();
    expect(instance.anchorDy).toBe(0);
    expect(seatLayerPickerSpotlightAnchor({ x: 50, y: 400 }, 0)).toEqual({ x: 50, y: 400 });
    expect(seatLayerPickerSpotlightAnchor(undefined, -120)).toBeUndefined();
  });
});
