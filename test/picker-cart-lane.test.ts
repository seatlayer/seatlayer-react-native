import { describe, expect, it } from 'vitest';

import { seatLayerCheckoutCtaState } from '../src/picker/checkoutCta';
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
  seatLayerSheetAnswer,
  seatLayerSheetDetents,
  seatLayerSheetDragThreshold,
  seatLayerSheetFlingVelocity,
  seatLayerSheetHeightOf,
  seatLayerSheetOffered,
  seatLayerSheetOffersFull,
  seatLayerSheetRubberBanded,
  seatLayerSheetSettle,
  seatLayerSheetSpring,
} from '../src/picker/sheetDrag';
import { seatLayerCartSeatsLine, seatLayerCartSheetCeilings } from '../src/picker/cartSheetUi';
import { seatLayerPickerSeatNotes, seatLayerPickerSeatNoteSpoken } from '../src/picker/seatNotes';
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

  it('draws the hold pill for as long as the hold lives, whoever owns it', () => {
    expect(seatLayerHoldPillDrawn({ active: true, expiresAt: 1, owner: 'picker' })).toBe(true);
    // §3.1/§4.8, owner call 2026-09-05: the buyer's time runs on a host-owned
    // hold too, and the header is the one place the picker states it. What
    // ownership still governs is what the controls may DO with the hold.
    expect(seatLayerHoldPillDrawn({ active: true, expiresAt: 1, owner: 'host' })).toBe(true);
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
    // A SEAT CARD KEEPS THE BUTTON'S OWN LABEL AND HOLDS IT DOWN (0.9.0): the
    // card is the question, so the foot goes on stating the buyer's cart
    // underneath it rather than answering a question already on screen.
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), seatCardOpen: true, ticketCount: 2,
    })).toMatchObject({ label: 'holdAndCheckout', enabled: false, statesReason: false });
    // Not even the finder is pressable while the card is asking.
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), seatCardOpen: true, ticketCount: 0, canOfferFind: true,
    })).toMatchObject({ enabled: false, findsBestSeats: false });
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

describe('§3.10.3 the empty cart has a door, not a dead button', () => {
  const base = { strings, label: 'holdAndCheckout', canCheckout: true, seatCardOpen: false } as const;

  it('offers the finder on an empty cart, and only where a form could open', () => {
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot(), ticketCount: 0, canOfferFind: true,
    })).toMatchObject({ label: 'findBestSeatsCta', enabled: true, findsBestSeats: true });
    // A door into an empty room is worse than none: a hold already exists, so
    // the finder would be refused.
    expect(seatLayerCheckoutCtaState({
      ...base, snapshot: snapshot({ hold: { active: true } }), ticketCount: 0, canOfferFind: true,
    }).findsBestSeats).toBe(false);
    // A width that shows the map beside the panel passes no door at all.
    expect(seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 0 }))
      .toMatchObject({ label: 'selectSeats', enabled: false, findsBestSeats: false });
  });

  it('has no From line and no second summary left to say it on', () => {
    const resolved = seatLayerCheckoutCtaState({ ...base, snapshot: snapshot(), ticketCount: 0 });
    // §3.9: `fromAmount`/`fromPriceText` and every path that carried them are
    // gone, and so is the peek line they were printed on.
    expect(Object.keys(resolved).sort())
      .toEqual(['busy', 'enabled', 'findsBestSeats', 'label', 'statesReason']);
  });
});

describe('§3.9 the collapsed sheet says what it holds', () => {
  it('lists the seats under the count in the runtime\'s own labels', () => {
    expect(seatLayerCartSeatsLine([{ label: 'A-12' }, { label: 'A-13' }]))
      .toBe('A \u00b7 12,  A \u00b7 13');
    expect(seatLayerCartSeatsLine([{ label: '  ' }, { label: 'GA' }])).toBe('GA');
    expect(seatLayerCartSeatsLine([])).toBe('');
  });

  it('caps the cart on its own fraction, measuring the chrome rather than guessing it', () => {
    const filled = seatLayerCartSheetCeilings(800, 200, true);
    expect(filled.body).toBe(Math.min(
      800 * seatLayerPickerTokens.size.sheetMaxHeightFraction,
      seatLayerPickerTokens.size.sheetMaxHeight,
    ) - 200);
    const empty = seatLayerCartSheetCeilings(800, 200, false);
    expect(empty.body).toBe(Math.min(
      800 * seatLayerPickerTokens.size.emptyTrayMaxHeightFraction,
      seatLayerPickerTokens.size.emptyTrayMaxHeight,
    ) - 200);
    expect(filled.full).toBe(800 * seatLayerPickerTokens.size.sheetFullHeightFraction - 200);
    // A foot taller than the ceiling leaves the cart nothing, never a negative.
    expect(seatLayerCartSheetCeilings(800, 10_000, true).body).toBe(0);
  });

  it('draws three whole cards and a sliver of the fourth behind the handle', () => {
    // The cap is generated, never transcribed: the tray padding, three cards,
    // the gap after each of them, and five points of the fourth showing.
    const { cartPeekMaxHeight, cartCardMinHeight, cartCardGap, cartTrayPadTop } =
      seatLayerPickerTokens.size;
    expect(cartPeekMaxHeight)
      .toBe(cartTrayPadTop + (3 * cartCardMinHeight) + (3 * cartCardGap) + 5);
  });
});

// --------------------------------------------------------- §3.10.1 the sheet

describe('§3.10.1 sheet detents and physics', () => {
  // BODY heights, not sheet heights: peek is zero by construction, because the
  // collapsed sheet already draws the handle, the foot and the safe inset.
  const detents = seatLayerSheetDetents({ content: 300, full: 460 });

  it('makes peek zero and offers full only where the content overflows', () => {
    expect(seatLayerSheetHeightOf(detents, 'peek')).toBe(0);
    expect(seatLayerSheetHeightOf(detents, 'content')).toBe(300);
    expect(seatLayerSheetHeightOf(detents, 'full')).toBe(460);
    expect(seatLayerSheetOffered(detents)).toEqual(['peek', 'content', 'full']);
    const fits = seatLayerSheetDetents({ content: 300, full: 120 });
    // `full` is clamped up to `content`: a sheet whose content fits under the
    // ceiling has nothing to open further onto.
    expect(fits.full).toBe(300);
    expect(seatLayerSheetOffersFull(fits)).toBe(false);
    expect(seatLayerSheetOffered(fits)).toEqual(['peek', 'content']);
  });

  it('rubber-bands over-drag rather than refusing it', () => {
    expect(seatLayerSheetRubberBanded(560, 0, 460))
      .toBeCloseTo(460 + 100 * seatLayerPickerTokens.motion.physics.rubberBand);
    expect(seatLayerSheetRubberBanded(-100, 0, 460))
      .toBeCloseTo(-100 * seatLayerPickerTokens.motion.physics.rubberBand);
    expect(seatLayerSheetRubberBanded(300, 0, 460)).toBe(300);
  });

  it('lets a flick decide on its own, and otherwise settles on the nearest stop', () => {
    expect(seatLayerSheetFlingVelocity).toBe(seatLayerPickerTokens.motion.physics.sheetFlingVelocity);
    expect(seatLayerSheetSettle(detents, 2, seatLayerSheetFlingVelocity)).toBe('content');
    expect(seatLayerSheetSettle(detents, 298, -seatLayerSheetFlingVelocity)).toBe('peek');
    expect(seatLayerSheetSettle(detents, 2, 0)).toBe('peek');
    expect(seatLayerSheetSettle(detents, 298, 0)).toBe('content');
  });

  it('answers a deliberate short drag the physics would have carried back', () => {
    // The accessible floor under the springs.
    expect(seatLayerSheetAnswer(detents, 'peek', 20, 0, 20)).toBe('content');
    expect(seatLayerSheetAnswer(detents, 'peek', 5, 0, seatLayerSheetDragThreshold - 1)).toBe('peek');
    expect(seatLayerSheetAnswer(detents, 'content', 290, 0, -seatLayerSheetDragThreshold)).toBe('peek');
  });

  it('springs rather than tweens, on the generated physics', () => {
    expect(seatLayerSheetSpring).toEqual({
      mass: seatLayerPickerTokens.motion.physics.sheetSpringMass,
      stiffness: seatLayerPickerTokens.motion.physics.sheetSpringStiffness,
      damping: seatLayerPickerTokens.motion.physics.sheetSpringDamping,
    });
  });
});

// -------------------------------------------------------- §3.8.9 seat notes

describe('§3.8.9/§3.10.2 what the organizer said about the seat', () => {
  const notes = (seat: Record<string, unknown>) =>
    seatLayerPickerSeatNotes(seat as never, strings as never);

  it('says what the seat PROVIDES first, then what a buyer should know before paying', () => {
    expect(notes({
      accessibility: ['step-free', 'companion'],
      commercial: { restrictedView: true, obstructedView: true, premium: true },
    }).map((row) => row.key)).toEqual([
      'access:step-free', 'access:companion',
      'mark:restrictedView', 'mark:obstructedView', 'mark:premium',
    ]);
  });

  it('replaces the plain wheelchair accommodation with the provision it has', () => {
    // "Empty wheelchair space" already says everything "Wheelchair space"
    // would, and more precisely; listing both is one seat explained twice.
    expect(notes({ accessibility: ['wheelchair'], wheelchairSpaceType: 'no-seat' })
      .map((row) => row.key)).toEqual(['wheelchair:no-seat']);
    expect(notes({ accessibility: ['wheelchair'], wheelchairSpaceType: 'seat-present' })
      .map((row) => row.key)).toEqual(['wheelchair:seat-present']);
    // With no provision the accommodation stands on its own.
    expect(notes({ accessibility: ['wheelchair'] }).map((row) => row.key))
      .toEqual(['access:wheelchair']);
  });

  it('keeps restricted and obstructed as SEPARATE rows', () => {
    // Collapsing them told a buyer behind both a rail and a pillar about the
    // rail and never about the pillar.
    expect(notes({ commercial: { restrictedView: true, obstructedView: true } }))
      .toHaveLength(2);
  });

  it('attaches the organizer sentence to the first selling mark, or gives it a row', () => {
    const explained = notes({ commercial: { restrictedView: true, premium: true, note: ' Pillar ' } });
    expect(explained[0]).toMatchObject({ key: 'mark:restrictedView', note: 'Pillar' });
    expect(explained[1]!.note).toBeUndefined();
    expect(seatLayerPickerSeatNoteSpoken(explained[0]!)).toBe('restrictedView: Pillar');
    const alone = notes({ commercial: { note: 'Bring ID' } });
    expect(alone).toEqual([{ key: 'note', iconKey: 'note', title: 'organizerNote', tone: 'note', note: 'Bring ID' }]);
    expect(notes({ commercial: { note: '   ' } })).toEqual([]);
  });

  it('never prints a wire key this build\'s taxonomy does not know', () => {
    expect(notes({ accessibility: ['some-new-need'] })).toEqual([]);
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
