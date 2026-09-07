import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: { addEventListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: <T,>(value: T) => value, absoluteFill: {}, hairlineWidth: 1 },
  View: 'View',
}));

import {
  seatLayerPickerConfirmAddInitial, seatLayerPickerConfirmAddReduce,
  seatLayerPickerConfirmMotionPlan, seatLayerPickerConfirmSwellMs,
  seatLayerPickerConfirmSwellScale,
} from '../src/picker/confirmCardMotion';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const flighted = seatLayerPickerConfirmMotionPlan(false);
const reduced = seatLayerPickerConfirmMotionPlan(true);

describe('§3.8.4/§3.9 the add choreography, one thing at a time', () => {
  it('holds the lift through the flight, swells on the landing, releases after', () => {
    let state = seatLayerPickerConfirmAddInitial();
    expect(state).toEqual({ stage: 'idle', liftHeld: false, swelling: false });
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'press' }, flighted);
    expect(state).toEqual({ stage: 'flying', liftHeld: true, swelling: false });
    // The count must NOT swell while the chip is still in the air: the swell
    // is the chip's arrival being announced.
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'swelled' }, flighted);
    expect(state.stage).toBe('flying');
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'landed' }, flighted);
    expect(state).toEqual({ stage: 'landed', liftHeld: true, swelling: true });
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'swelled' }, flighted);
    expect(state).toEqual({ stage: 'released', liftHeld: false, swelling: false });
  });

  it('releases the map on the press itself under reduced motion', () => {
    const state = seatLayerPickerConfirmAddReduce(
      seatLayerPickerConfirmAddInitial(), { kind: 'press' }, reduced,
    );
    expect(state).toEqual({ stage: 'released', liftHeld: false, swelling: false });
    expect(seatLayerPickerConfirmSwellMs(reduced)).toBe(0);
    expect(seatLayerPickerConfirmAddReduce(state, { kind: 'landed' }, reduced)).toBe(state);
  });

  it('swells 1.3x over the bump duration, and never twice for one press', () => {
    expect(seatLayerPickerConfirmSwellScale).toBe(1.3);
    expect(seatLayerPickerConfirmSwellMs(flighted)).toBe(seatLayerPickerTokens.motion.duration.bump);
    let state = seatLayerPickerConfirmAddReduce(seatLayerPickerConfirmAddInitial(), { kind: 'press' }, flighted);
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'press' }, flighted);
    expect(state.stage).toBe('flying');
    state = seatLayerPickerConfirmAddReduce(state, { kind: 'landed' }, flighted);
    expect(seatLayerPickerConfirmAddReduce(state, { kind: 'landed' }, flighted).stage).toBe('landed');
  });

  it('owes nothing when the card leaves without an answer', () => {
    const idle = seatLayerPickerConfirmAddInitial();
    expect(seatLayerPickerConfirmAddReduce(idle, { kind: 'dismissed' }, flighted)).toBe(idle);
    const flying = seatLayerPickerConfirmAddReduce(idle, { kind: 'press' }, flighted);
    expect(seatLayerPickerConfirmAddReduce(flying, { kind: 'dismissed' }, flighted))
      .toEqual({ stage: 'released', liftHeld: false, swelling: false });
  });
});

