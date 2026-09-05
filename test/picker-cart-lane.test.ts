import { describe, expect, it } from 'vitest';

import { seatLayerCheckoutCtaState, splitSeatLayerFromPrice } from '../src/picker/checkoutCta';
import {
  seatLayerCartSwipeCommitFraction,
  seatLayerCartSwipeCommits,
  seatLayerCartSwipeFlingVelocity,
  seatLayerCartSwipeTravel,
} from '../src/picker/cartSwipe';
import {
  seatLayerHoldAnnouncementFor,
  seatLayerHoldClockText,
  seatLayerHoldExpiring,
  seatLayerHoldPillDrawn,
} from '../src/picker/holdCountdownAnnounce';
import {
  seatLayerSheetDetentAt,
  seatLayerSheetDetents,
  seatLayerSheetFlingVelocity,
  seatLayerSheetRubberBanded,
  seatLayerSheetSettle,
  seatLayerSheetSpring,
} from '../src/picker/sheetDrag';
import { SeatLayerToastQueue, seatLayerToastActionHitBox, seatLayerToastCardLift, seatLayerToastDwellMs } from '../src/picker/toastQueue';
import { seatLayerHeaderInitial } from '../src/picker/headerIdentity';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';
import type { SeatLayerPickerSnapshot } from '../src/picker/models';

const strings = {
  locale: 'en',
  accessNeed: (need: string) => need,
  translate: (key: string, options?: { count?: number; values?: Record<string, unknown> }) => {
    const suffix = options?.count === undefined ? '' : `.${options.count === 1 ? 'one' : 'other'}`;
    const values = options?.values ?? {};
    const rendered = Object.entries(values).map(([name, value]) => `${name}=${String(value)}`).join(',');
    return rendered ? `${key}${suffix}(${rendered})` : `${key}${suffix}`;
  },
};

function snapshot(overrides: Record<string, unknown> = {}): SeatLayerPickerSnapshot {
  return {
    sessionId: 's', revision: 1, event: { salesClosed: false }, hold: { active: false },
    cartLines: [], categories: [], currency: 'EUR', ...overrides,
  } as unknown as SeatLayerPickerSnapshot;
}

// ---------------------------------------------------------------- §3.1 header

class FakeTimer {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();
  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown): void { this.tasks.delete(handle as number); }
  advance(milliseconds: number): void {
    this.now += milliseconds;
    for (const [id, task] of [...this.tasks]) {
      if (task.at > this.now) continue;
      this.tasks.delete(id);
      task.callback();
    }
  }
}

describe('§3.1 header', () => {
  it('draws the header on its generated geometry, never a transcribed number', () => {
    expect(seatLayerPickerTokens.size.headerHeight).toBe(38);
    expect(seatLayerPickerTokens.size.headerLogoSize).toBe(22);
    expect(seatLayerPickerTokens.size.headerCloseSize).toBe(26);
    expect(seatLayerPickerTokens.size.headerNameFontSize).toBe(12.5);
    expect(seatLayerPickerTokens.radius.headerLogo).toBe(6);
  });

  it('takes the brand mark from the organizer letter, falling back to the event name', () => {
    expect(seatLayerHeaderInitial('Paiteq Live', 'Some event')).toBe('P');
    expect(seatLayerHeaderInitial(undefined, 'arena night')).toBe('A');
    expect(seatLayerHeaderInitial('   ', undefined)).toBe('');
    // A grapheme, not a UTF-16 unit: an emoji brand still yields one mark.
    expect(seatLayerHeaderInitial('🎪 Circus')).toBe('🎪');
  });

  it('draws the hold pill for as long as the hold lives, and never for a host-owned one', () => {
    expect(seatLayerHoldPillDrawn({ active: true, expiresAt: 1, owner: 'picker' })).toBe(true);
    // §4.8: a hold handed to the host is the host's to display.
    expect(seatLayerHoldPillDrawn({ active: true, expiresAt: 1, owner: 'host' })).toBe(false);
    expect(seatLayerHoldPillDrawn({ active: true, expiresAt: 1 }, true)).toBe(false);
    expect(seatLayerHoldPillDrawn({ active: false })).toBe(false);
    expect(seatLayerHoldPillDrawn(undefined)).toBe(false);
  });

  it('floors the clock at zero and inverts at one minute remaining', () => {
    expect(seatLayerHoldClockText(605)).toBe('10:05');
    expect(seatLayerHoldClockText(-5)).toBe('00:00');
    expect(seatLayerHoldClockText('nonsense')).toBe('00:00');
    expect(seatLayerHoldExpiring(61)).toBe(false);
    expect(seatLayerHoldExpiring(60)).toBe(true);
  });
});

describe('§4.10 hold countdown announcements', () => {
  it('announces on the minute, then every second of the last minute, and never in between', () => {
    // A live region fed a running clock speaks once a second for a quarter of
    // an hour, so the throttle IS the policy.
    expect(seatLayerHoldAnnouncementFor(600)).toEqual({ key: 'holdMinutesLeft', count: 10 });
    expect(seatLayerHoldAnnouncementFor(599)).toBeNull();
    expect(seatLayerHoldAnnouncementFor(121)).toBeNull();
    expect(seatLayerHoldAnnouncementFor(120)).toEqual({ key: 'holdMinutesLeft', count: 2 });
    expect(seatLayerHoldAnnouncementFor(61)).toBeNull();
    expect(seatLayerHoldAnnouncementFor(60)).toEqual({ key: 'holdSecondsLeft', count: 60 });
    expect(seatLayerHoldAnnouncementFor(31)).toEqual({ key: 'holdSecondsLeft', count: 31 });
    expect(seatLayerHoldAnnouncementFor(1)).toEqual({ key: 'holdSecondsLeft', count: 1 });
    expect(seatLayerHoldAnnouncementFor(0)).toEqual({ key: 'holdSecondsLeft', count: 0 });
    expect(seatLayerHoldAnnouncementFor(undefined)).toBeNull();
  });

  it('has a plural form for each counted sentence', () => {
    expect(seatLayerPickerTokens.strings.holdMinutesLeftOne).toBe('{count} minute left');
    expect(seatLayerPickerTokens.strings.holdMinutesLeftOther).toBe('{count} minutes left');
    expect(seatLayerPickerTokens.strings.holdSecondsLeftOne).toBe('{count} second left');
    expect(seatLayerPickerTokens.strings.holdSecondsLeftOther).toBe('{count} seconds left');
  });
});

// ------------------------------------------------ §3.9/§3.10.3 checkout ladder

describe('§3.10.3 checkout call to action', () => {
  const base = { strings, label: 'holdAndCheckout', canCheckout: true, seatCardOpen: false } as const;

  it('resolves the ladder in the web picker\'s own order', () => {
    // 1. Sales closed outranks everything else.
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ event: { salesClosed: true } }), ticketCount: 3, seatCardOpen: true,
    })).toMatchObject({ label: 'salesClosedCta', enabled: false });
    // 2. An unanswered prompt outranks the hold a press behind it would create.
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), generalAdmissionPending: true, creatingHold: true,
    }).label).toBe('confirmYourTickets');
    // The footer states the reason; the pill behind the card does not.
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), seatCardOpen: true }))
      .toMatchObject({ label: 'confirmOrCancelSeat', statesReason: true, peekStatesReason: false });
    // 3. and 4. Work the buyer already asked for, in that order.
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), creatingHold: true, handoffInFlight: true }))
      .toMatchObject({ label: 'securingSeats', busy: true });
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), handoffInFlight: true }))
      .toMatchObject({ label: 'openingCheckout', busy: true });
  });

  it('says what would fix a rejected selection, and falls back where there is no number', () => {
    const validity = (over: Record<string, unknown>) => snapshot({
      selectionValidity: { isValid: false, count: 0, required: 0, remaining: 0, ...over },
    });
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: validity({ remaining: 1 }) }).label)
      .toBe('chooseMore(count=1)');
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: validity({ required: 2, count: 4 }) }).label)
      .toBe('removeTickets.other(count=2)');
    // `required` is 0 for a rule about the SHAPE of a selection, where
    // "Remove 1 ticket" would be a wrong instruction.
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: validity({}) }).label).toBe('adjustSelection');
  });

  it('offers the till once a hold exists, and states an empty cart without calling it a failure', () => {
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ hold: { active: true } }), ticketCount: 2,
    })).toMatchObject({ label: 'continueToCheckout', enabled: true, statesReason: false });
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ hold: { active: true } }), ticketCount: 2, pendingCount: 1,
    }).label).toBe('secureMoreAndCheckout.one(count=1)');
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 0 }))
      .toMatchObject({ label: 'selectSeats', enabled: false });
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 2 }))
      .toMatchObject({ label: 'holdAndCheckout', enabled: true });
  });
});

describe('§3.9 every line the peek can say', () => {
  const base = { strings, label: 'holdAndCheckout', canCheckout: true, seatCardOpen: false } as const;

  it('follows the collapsed bar\'s own table, where work in flight outranks closed sales', () => {
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ event: { salesClosed: true } }), ticketCount: 3, creatingHold: true,
    }).peekLine).toMatchObject({ sentence: 'securingSeats', pillLabel: null });
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), ticketCount: 3, handoffInFlight: true, totalText: '€285',
    }).peekLine.sentence).toBe('peekSecured.other(count=3,total=€285)');
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), ticketCount: 3, handoffInFlight: true, totalText: '€285', showPrices: false,
    }).peekLine.sentence).toBe('seatsSecuredOpeningCheckout');
    // Idle with tickets: the summary and the pill, and the TOTAL ONLY ONCE.
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 3, totalText: '€285' }).peekLine)
      .toMatchObject({
        summary: 'ticketCount.other(count=3)', pillLabel: 'continueWord', total: '€285', sentence: null,
      });
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ event: { salesClosed: true } }), ticketCount: 0,
    }).peekLine).toMatchObject({ sentence: 'salesClosedPill', offerFind: false });
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), ticketCount: 0, fromPriceText: '€25', canOfferFind: true,
    }).peekLine).toMatchObject({ summary: 'fromPrice(price=€25)', fromAmount: '€25', offerFind: true });
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 0 }).peekLine)
      .toMatchObject({ summary: 'pickYourSeats', fromAmount: null });
  });

  it('never puts a clock on the Continue pill, whatever the hold is doing', () => {
    const line = seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ hold: { active: true } }), ticketCount: 2, totalText: '€50',
    }).peekLine;
    // The header's hold pill is the picker's ONE clock (owner call 2026-09-05).
    expect(line.holdActive).toBe(true);
    expect(Object.keys(line)).not.toContain('clockText');
    expect(line.pillLabel).toBe('continueWord');
  });

  it('lifts only the amount inside the locale\'s own From sentence', () => {
    expect(splitSeatLayerFromPrice('From €25', '€25'))
      .toEqual({ before: 'From ', amount: '€25', after: '' });
    expect(splitSeatLayerFromPrice('25 €-tól', '25 €'))
      .toEqual({ before: '', amount: '25 €', after: '-tól' });
    // Where the amount cannot be found the whole line stays at caption weight
    // rather than being guessed at.
    expect(splitSeatLayerFromPrice('Desde 25 euros', '€25'))
      .toEqual({ before: 'Desde 25 euros', amount: null, after: '' });
    expect(splitSeatLayerFromPrice('Pick your seats', null))
      .toEqual({ before: 'Pick your seats', amount: null, after: '' });
  });
});

// --------------------------------------------------------- §3.10.1 the sheet

describe('§3.10.1 sheet detents and physics', () => {
  const input = {
    viewportHeight: 800, peekHeight: 58, contentHeight: 300, bottomInset: 34, hasTickets: true,
  };

  it('derives the peek from the head it holds, plus the lift and the safe inset', () => {
    // THE BAR IS EXACTLY ITS HEAD: a clip taken from a different number cuts
    // the bottom off the head's own 44 pt buttons.
    expect(seatLayerSheetDetents(input).peek).toBe(58 + seatLayerPickerTokens.size.peekClockLift + 34);
  });

  it('caps a filled sheet and an empty tray on their own fractions', () => {
    const filled = seatLayerSheetDetents({ ...input, contentHeight: 10_000 });
    expect(filled.content).toBe(Math.min(
      800 * seatLayerPickerTokens.size.sheetMaxHeightFraction,
      seatLayerPickerTokens.size.sheetMaxHeight,
    ) + 34);
    const empty = seatLayerSheetDetents({ ...input, contentHeight: 10_000, hasTickets: false });
    expect(empty.content).toBe(Math.min(
      800 * seatLayerPickerTokens.size.emptyTrayMaxHeightFraction,
      seatLayerPickerTokens.size.emptyTrayMaxHeight,
    ) + 34);
    expect(filled.full).toBe(800 * seatLayerPickerTokens.size.sheetFullHeightFraction);
  });

  it('rubber-bands over-drag rather than refusing it', () => {
    const detents = seatLayerSheetDetents(input);
    expect(seatLayerSheetRubberBanded(detents.full + 100, detents))
      .toBeCloseTo(detents.full + 100 * seatLayerPickerTokens.motion.physics.rubberBand);
    expect(seatLayerSheetRubberBanded(detents.peek - 100, detents))
      .toBeCloseTo(detents.peek - 100 * seatLayerPickerTokens.motion.physics.rubberBand);
    expect(seatLayerSheetRubberBanded(detents.content, detents)).toBe(detents.content);
  });

  it('lets a flick decide on its own, and otherwise settles on the nearest stop', () => {
    const detents = seatLayerSheetDetents(input);
    expect(seatLayerSheetFlingVelocity).toBe(seatLayerPickerTokens.motion.physics.sheetFlingVelocity);
    expect(seatLayerSheetSettle(detents.peek + 2, seatLayerSheetFlingVelocity, detents)).toBe(detents.content);
    expect(seatLayerSheetSettle(detents.content - 2, -seatLayerSheetFlingVelocity, detents)).toBe(detents.peek);
    expect(seatLayerSheetSettle(detents.peek + 2, 0, detents)).toBe(detents.peek);
    expect(seatLayerSheetSettle(detents.content - 2, 0, detents)).toBe(detents.content);
    expect(seatLayerSheetDetentAt(detents.peek, detents)).toBe('peek');
    expect(seatLayerSheetDetentAt(detents.content, detents)).toBe('content');
    expect(seatLayerSheetDetentAt(detents.full, detents)).toBe('full');
  });

  it('springs rather than tweens, on the generated physics', () => {
    expect(seatLayerSheetSpring).toEqual({
      mass: seatLayerPickerTokens.motion.physics.sheetSpringMass,
      stiffness: seatLayerPickerTokens.motion.physics.sheetSpringStiffness,
      damping: seatLayerPickerTokens.motion.physics.sheetSpringDamping,
    });
  });
});

// ------------------------------------------------------ §3.10.2 swipe removal

describe('§3.10.2 swipe to remove', () => {
  it('commits past its own width fraction, or on a throw', () => {
    expect(seatLayerCartSwipeCommitFraction).toBe(seatLayerPickerTokens.motion.physics.swipeCommitFraction);
    expect(seatLayerCartSwipeFlingVelocity).toBe(seatLayerPickerTokens.motion.physics.swipeFlingVelocity);
    expect(seatLayerCartSwipeCommits({ travel: 160, width: 400, velocity: 0 })).toBe(true);
    expect(seatLayerCartSwipeCommits({ travel: 159, width: 400, velocity: 0 })).toBe(false);
    // A throw is the same instruction given faster.
    expect(seatLayerCartSwipeCommits({ travel: 12, width: 400, velocity: 700 })).toBe(true);
    expect(seatLayerCartSwipeCommits({ travel: 0, width: 400, velocity: 900 })).toBe(false);
  });

  it('clamps travel to the row and never goes backwards', () => {
    expect(seatLayerCartSwipeTravel(500, 400)).toBe(400);
    expect(seatLayerCartSwipeTravel(-20, 400)).toBe(0);
    expect(seatLayerCartSwipeTravel(Number.NaN, 400)).toBe(0);
  });
});

// ------------------------------------------------------------ §3.12 the toast

describe('§3.12 toasts', () => {
  it('is the picker\'s own queue: one card, replaced rather than stacked', () => {
    const timer = new FakeTimer();
    const queue = new SeatLayerToastQueue(timer);
    const first = queue.show({ message: 'first' })!;
    const second = queue.show({ message: 'second', tone: 'error' })!;
    expect(queue.current).toMatchObject({ id: second.id, message: 'second', tone: 'error' });
    expect(queue.dismiss(first.id)).toBe(false);
  });

  it('dwells for exactly the generated budget, then resets to neutral', () => {
    const timer = new FakeTimer();
    const changes: number[] = [];
    const queue = new SeatLayerToastQueue(timer, () => changes.push(1));
    expect(seatLayerToastDwellMs).toBe(seatLayerPickerTokens.motion.durationOutsideBudget.toastDwell);
    queue.show({ message: 'held', tone: 'warning' });
    timer.advance(seatLayerToastDwellMs - 1);
    expect(queue.current).not.toBeNull();
    timer.advance(1);
    expect(queue.current).toBeNull();
    expect(changes).toHaveLength(2);
  });

  it('runs an action once and takes the card down with it', () => {
    const timer = new FakeTimer();
    const queue = new SeatLayerToastQueue(timer);
    let pressed = 0;
    const toast = queue.show({ message: 'gone', actionLabel: 'Undo', onAction: () => { pressed += 1; } })!;
    expect(toast.actionLabel).toBe('Undo');
    expect(queue.press(toast.id)).toBe(true);
    expect(queue.press(toast.id)).toBe(false);
    expect(pressed).toBe(1);
    expect(queue.current).toBeNull();
  });

  it('refuses an empty sentence and blanks a whitespace action', () => {
    const queue = new SeatLayerToastQueue(new FakeTimer());
    expect(queue.show({ message: '   ' })).toBeNull();
    expect(queue.show({ message: 'sold', actionLabel: '  ' })!.actionLabel).toBeNull();
  });

  it('carries the fixed action hit box, the card lift and the sales-closed line', () => {
    expect(seatLayerToastActionHitBox).toBe(seatLayerPickerTokens.size.minimumHitTarget);
    expect(seatLayerToastCardLift).toBe(seatLayerPickerTokens.size.toastCardLift);
    expect(seatLayerPickerTokens.strings.salesClosedToast).toBe('Sales are closed for this event.');
  });
});
