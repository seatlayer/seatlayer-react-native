import { describe, expect, it } from 'vitest';

import {
  createSeatLayerPickerHapticPlayer,
  getSeatLayerPickerHapticStrength,
} from '../src/picker/hapticPlayer';
import {
  reduceSeatLayerPickerHapticSnapshot,
  resetSeatLayerPickerHapticPolicy,
  signalSeatLayerPickerHoldExpired,
} from '../src/picker/haptics';
import {
  assertSeatLayerPickerMotionBudget,
  getSeatLayerPickerMotionDuration,
  resolveSeatLayerPickerMotion,
  seatLayerPickerMotionBudgetMs,
  seatLayerPickerUndoWindowMs,
} from '../src/picker/motion';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

describe('picker motion catalog', () => {
  it('uses generated animation durations within budget and excludes the undo window', () => {
    assertSeatLayerPickerMotionBudget();
    for (const effect of Object.keys(seatLayerPickerTokens.motion.duration) as Array<keyof typeof seatLayerPickerTokens.motion.duration>) {
      expect(getSeatLayerPickerMotionDuration(effect)).toBeLessThanOrEqual(seatLayerPickerMotionBudgetMs);
    }
    expect(seatLayerPickerUndoWindowMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.undoWindow);
    expect(seatLayerPickerUndoWindowMs).toBe(4000);
  });

  it('resolves each live reduced-motion toggle with zero duration and explicit skips', () => {
    for (const effect of Object.keys(seatLayerPickerTokens.motion.duration) as Array<keyof typeof seatLayerPickerTokens.motion.duration>) {
      expect(resolveSeatLayerPickerMotion(effect, true).durationMs).toBe(0);
    }
    expect(resolveSeatLayerPickerMotion('fly', true).skipped).toBe(true);
    expect(resolveSeatLayerPickerMotion('stagger', true).skipped).toBe(true);
    expect(resolveSeatLayerPickerMotion('enter', true).skipped).toBe(false);
    expect(resolveSeatLayerPickerMotion('enter', false).durationMs).toBe(getSeatLayerPickerMotionDuration('enter'));
  });
});

describe('picker haptic policy', () => {
  it('seeds silently, dedupes snapshots, and cues only selection growth', () => {
    let state = resetSeatLayerPickerHapticPolicy();
    let result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 2, focusedSectionId: 'A', hasHold: true });
    expect(result.cues).toEqual([]);
    state = result.state;
    result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 2, focusedSectionId: 'A', hasHold: true });
    expect(result.cues).toEqual([]);
    state = result.state;
    result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 3, focusedSectionId: 'A', hasHold: true });
    expect(result.cues).toEqual(['selectionAdded']);
    result = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 1, focusedSectionId: 'A', hasHold: true });
    expect(result.cues).toEqual([]);
  });

  it('cues section entry, hold creation and explicit expiry in stable order', () => {
    let state = reduceSeatLayerPickerHapticSnapshot(resetSeatLayerPickerHapticPolicy(), { selectionCount: 0 }).state;
    let result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 1, focusedSectionId: 'B', hasHold: true });
    expect(result.cues).toEqual(['selectionAdded', 'sectionFocused', 'holdCreated']);
    state = result.state;
    result = signalSeatLayerPickerHoldExpired(state);
    expect(result.cues).toEqual(['holdExpired']);
    expect(resetSeatLayerPickerHapticPolicy()).toMatchObject({ seeded: false, selectionCount: 0, focusedSectionId: null, hasHold: false });
  });

  it('keeps an explicit expiry terminal through a stale active snapshot until an inactive boundary', () => {
    let state = reduceSeatLayerPickerHapticSnapshot(resetSeatLayerPickerHapticPolicy(), { selectionCount: 0, hasHold: false }).state;
    let result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual(['holdCreated']);
    result = signalSeatLayerPickerHoldExpired(result.state);
    expect(result.cues).toEqual(['holdExpired']);
    result = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual([]);
    expect(signalSeatLayerPickerHoldExpired(result.state).cues).toEqual([]);
    state = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 0, hasHold: false }).state;
    expect(signalSeatLayerPickerHoldExpired(state).cues).toEqual([]);
    result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual(['holdCreated']);
    expect(signalSeatLayerPickerHoldExpired(result.state).cues).toEqual(['holdExpired']);
  });

  it('honors expiry before observation or while inactive, once per lifecycle', () => {
    let result = signalSeatLayerPickerHoldExpired(resetSeatLayerPickerHapticPolicy());
    expect(result.cues).toEqual(['holdExpired']);
    expect(signalSeatLayerPickerHoldExpired(result.state).cues).toEqual([]);
    result = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual([]);
    let state = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 0, hasHold: false }).state;
    expect(signalSeatLayerPickerHoldExpired(state).cues).toEqual([]);
    result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual(['holdCreated']);

    state = reduceSeatLayerPickerHapticSnapshot(resetSeatLayerPickerHapticPolicy(), { selectionCount: 0, hasHold: false }).state;
    result = signalSeatLayerPickerHoldExpired(state);
    expect(result.cues).toEqual(['holdExpired']);
    expect(signalSeatLayerPickerHoldExpired(result.state).cues).toEqual([]);
    state = reduceSeatLayerPickerHapticSnapshot(result.state, { selectionCount: 0, hasHold: false }).state;
    expect(signalSeatLayerPickerHoldExpired(state).cues).toEqual([]);
    result = reduceSeatLayerPickerHapticSnapshot(state, { selectionCount: 0, hasHold: true });
    expect(result.cues).toEqual(['holdCreated']);
    expect(signalSeatLayerPickerHoldExpired(result.state).cues).toEqual(['holdExpired']);
  });
});

describe('picker haptic player', () => {
  it('maps every cue to generated strengths and contains adapter failures', async () => {
    const strengths: string[] = [];
    const player = createSeatLayerPickerHapticPlayer({ play: (strength) => { strengths.push(strength); } });
    await player.play('selectionAdded');
    expect(strengths).toEqual([getSeatLayerPickerHapticStrength('selectionAdded')]);
    expect(getSeatLayerPickerHapticStrength('holdCreated')).toBe(seatLayerPickerTokens.haptics.holdCreated);
    await expect(createSeatLayerPickerHapticPlayer({ play: () => { throw new Error('sync'); } }).play('holdExpired')).resolves.toBeUndefined();
    await expect(createSeatLayerPickerHapticPlayer({ play: async () => { throw new Error('async'); } }).play('holdExpired')).resolves.toBeUndefined();
  });
});
