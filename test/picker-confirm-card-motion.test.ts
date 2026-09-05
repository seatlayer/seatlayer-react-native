import { describe, expect, it } from 'vitest';

import {
  seatLayerPickerConfirmAcceptsPress,
  seatLayerPickerConfirmMotionInitial,
  seatLayerPickerConfirmMotionPlan,
  seatLayerPickerConfirmMotionReduce,
  type SeatLayerPickerConfirmMotionEvent,
} from '../src/picker/confirmCardMotion';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const plan = seatLayerPickerConfirmMotionPlan(false);
const still = seatLayerPickerConfirmMotionPlan(true);

const run = (events: SeatLayerPickerConfirmMotionEvent[], active = plan) =>
  events.reduce(
    (state, event) => seatLayerPickerConfirmMotionReduce(state, event, active),
    seatLayerPickerConfirmMotionInitial(active),
  );

describe('§3.8.4 the card’s durations are the tokens’ own', () => {
  it('reads every moment off the token file', () => {
    expect(plan.enterMs).toBe(seatLayerPickerTokens.motion.duration.cardEnter);
    expect(plan.pressSweepMs).toBe(seatLayerPickerTokens.motion.duration.pressSweep);
    expect(plan.exitMs).toBe(seatLayerPickerTokens.motion.duration.exit);
    expect(plan.inviteDelayMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.inviteDelay);
    expect(plan.inviteSweepMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.inviteSweep);
    expect(plan.inviteBreatheDelayMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.inviteBreatheDelay);
    expect(plan.inviteBreatheMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.inviteBreathe);
    expect(plan.flightMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.confirmFlight);
  });

  it('collapses to nothing at all under reduced motion', () => {
    expect(still).toEqual({ enterMs: 0, pressSweepMs: 0, exitMs: 0, flight: false, flightMs: 0 });
    expect(seatLayerPickerConfirmMotionInitial(still).phase).toBe('resting');
    expect(seatLayerPickerConfirmMotionInitial(still).inviting).toBe(false);
  });
});

describe('§3.8.4 the invitation', () => {
  it('is armed on arrival and stops on the first touch anywhere on the card', () => {
    expect(seatLayerPickerConfirmMotionInitial(plan).inviting).toBe(true);
    expect(run([{ kind: 'engaged' }]).inviting).toBe(false);
  });

  it('never restarts once it has been stopped', () => {
    expect(run([{ kind: 'engaged' }, { kind: 'entered' }]).inviting).toBe(false);
  });
});

describe('§3.8.4 commit-on-press ordering is fixed', () => {
  it('commits the cart on the press and only departs after the sweep', () => {
    const pressed = run([{ kind: 'entered' }, { kind: 'press' }]);
    expect(pressed.committed).toBe(true);
    expect(pressed.answered).toBe(true);
    expect(pressed.phase).toBe('committing');
    expect(seatLayerPickerConfirmMotionReduce(pressed, { kind: 'swept' }, plan).phase).toBe('leaving');
  });

  it('departs on the press without waiting under reduced motion', () => {
    const pressed = run([{ kind: 'press' }], still);
    expect(pressed.committed).toBe(true);
    expect(pressed.phase).toBe('leaving');
  });

  it('ignores a second press while the first is committing', () => {
    const pressed = run([{ kind: 'press' }]);
    const again = seatLayerPickerConfirmMotionReduce(pressed, { kind: 'press' }, plan);
    expect(again).toBe(pressed);
    expect(seatLayerPickerConfirmAcceptsPress(pressed)).toBe(false);
  });

  it('accepts a press while entering — the button is live as it lands', () => {
    expect(seatLayerPickerConfirmAcceptsPress(seatLayerPickerConfirmMotionInitial(plan))).toBe(true);
  });
});

describe('§3.8.4 dismissal', () => {
  it('takes the card out from any resting or entering state', () => {
    expect(run([{ kind: 'dismissed' }]).phase).toBe('leaving');
    expect(run([{ kind: 'entered' }, { kind: 'dismissed' }]).committed).toBe(false);
  });

  it('never un-answers a card that already committed', () => {
    const left = run([{ kind: 'press' }, { kind: 'swept' }, { kind: 'dismissed' }]);
    expect(left.committed).toBe(true);
    expect(left.phase).toBe('leaving');
  });
});
