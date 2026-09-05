import type { SeatLayerPickerStringResolver } from './locale';
import type { SeatLayerPickerSnapshot } from './models';

/**
 * What the checkout call to action says, and whether it can be pressed.
 *
 * One resolver drives the collapsed peek pill, the expanded sheet's footer
 * button and the wide bar, so the three can never disagree — spec §3.9/§3.10.3.
 * It is pure: every fact the picker state cannot supply (an open seat card, a
 * handoff still running inside the host) is passed in.
 */

/** The collapsed bar's own reading of the same situation (spec §3.9 table). */
export interface SeatLayerPeekLine {
  /** `3 tickets`, `From €25` — null when a sentence has taken the whole line. */
  readonly summary: string | null;
  /** A whole-line statement that replaces the pill. */
  readonly sentence: string | null;
  /** The substring of `summary` that carries the money on the empty bar. */
  readonly fromAmount: string | null;
  /** `Continue`, `Secure more` — null for no pill. */
  readonly pillLabel: string | null;
  /** The money that follows `pillLabel`, or null where prices are suppressed. */
  readonly total: string | null;
  /**
   * Whether a hold is running behind this line. The pill draws NO clock
   * (owner call, 2026-09-05): the header's hold pill is the picker's one clock.
   */
  readonly holdActive: boolean;
  /** Whether the empty bar offers its way into the best-seats form. */
  readonly offerFind: boolean;
}

export interface SeatLayerCheckoutCtaState {
  readonly label: string;
  readonly enabled: boolean;
  /** Only ever true while work the buyer already asked for is in flight. */
  readonly busy: boolean;
  /** Whether `label` is a reason rather than the caller's own wording. */
  readonly statesReason: boolean;
  /** Almost always `statesReason`; parts from it behind an open seat card. */
  readonly peekStatesReason: boolean;
  readonly peekLine: SeatLayerPeekLine;
}

export interface SeatLayerCheckoutCtaInput {
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  readonly strings: SeatLayerPickerStringResolver;
  /** The caller's own wording for the ordinary case. */
  readonly label: string;
  /** The controller's composite permission: ready, not busy, not read-only. */
  readonly canCheckout: boolean;
  readonly seatCardOpen: boolean;
  /** A general-admission quantity prompt the buyer has not answered. */
  readonly generalAdmissionPending?: boolean;
  /** The hold this press would create is already being made. */
  readonly creatingHold?: boolean;
  readonly handoffInFlight?: boolean;
  /** Supplying it turns on the hold and empty-cart readings and the peek line. */
  readonly ticketCount?: number;
  readonly pendingCount?: number;
  readonly totalText?: string;
  readonly fromPriceText?: string;
  readonly showPrices?: boolean;
  readonly canOfferFind?: boolean;
}

const emptyPeekLine: SeatLayerPeekLine = Object.freeze({
  summary: null,
  sentence: null,
  fromAmount: null,
  pillLabel: null,
  total: null,
  holdActive: false,
  offerFind: false,
});

function peekLine(input: SeatLayerCheckoutCtaInput, count: number, holdActive: boolean): SeatLayerPeekLine {
  const { snapshot, strings } = input;
  const showPrices = input.showPrices !== false;
  const totalText = input.totalText ?? null;
  const fromPriceText = input.fromPriceText ?? null;
  if (count > 0) {
    if (input.creatingHold === true) {
      return Object.freeze({ ...emptyPeekLine, sentence: strings.translate('securingSeats'), holdActive });
    }
    if (input.handoffInFlight === true) {
      return Object.freeze({
        ...emptyPeekLine,
        sentence: showPrices && totalText !== null
          ? strings.translate('peekSecured', { count, values: { count, total: totalText } })
          : strings.translate('seatsSecuredOpeningCheckout'),
        holdActive,
      });
    }
    const pendingCount = input.pendingCount ?? 0;
    return Object.freeze({
      ...emptyPeekLine,
      summary: strings.translate('ticketCount', { count, values: { count } }),
      pillLabel: holdActive && pendingCount > 0
        ? strings.translate('secureMore')
        : strings.translate('continueWord'),
      total: showPrices ? totalText : null,
      holdActive,
    });
  }
  if (snapshot?.event.salesClosed === true) {
    return Object.freeze({ ...emptyPeekLine, sentence: strings.translate('salesClosedPill') });
  }
  return Object.freeze({
    ...emptyPeekLine,
    summary: fromPriceText === null
      ? strings.translate('pickYourSeats')
      : strings.translate('fromPrice', { values: { price: fromPriceText } }),
    fromAmount: fromPriceText,
    offerFind: input.canOfferFind === true,
  });
}

/**
 * Resolve the checkout call to action. The order is the web picker's, and it
 * matters: sales closing outranks an open prompt, an open prompt outranks the
 * hold a press behind it would create, and a selection the event's rules reject
 * is only worth mentioning once nothing is in flight.
 */
export function seatLayerCheckoutCtaState(input: SeatLayerCheckoutCtaInput): SeatLayerCheckoutCtaState {
  const { snapshot, strings } = input;
  const count = input.ticketCount ?? 0;
  const holdActive = snapshot?.hold.active === true;
  const peek = peekLine(input, count, holdActive);
  const reason = (
    label: string,
    options?: Readonly<{ busy?: boolean; onPeek?: boolean }>,
  ): SeatLayerCheckoutCtaState => Object.freeze({
    label,
    enabled: false,
    busy: options?.busy === true,
    statesReason: true,
    peekStatesReason: options?.onPeek !== false,
    peekLine: peek,
  });

  // 1. Nothing else is worth saying about an event that has stopped selling.
  if (snapshot?.event.salesClosed === true) return reason(strings.translate('salesClosedCta'));

  // 2. A prompt the buyer has not answered.
  if (input.generalAdmissionPending === true) return reason(strings.translate('confirmYourTickets'));
  // The footer says why it is down; the pill behind the card does not, because
  // the card IS the answer to it and the sheet is dimmed and inert underneath.
  if (input.seatCardOpen) {
    return reason(strings.translate('confirmOrCancelSeat'), { onPeek: false });
  }

  // 3. and 4. Work the buyer has already asked for.
  if (input.creatingHold === true) return reason(strings.translate('securingSeats'), { busy: true });
  if (input.handoffInFlight === true) return reason(strings.translate('openingCheckout'), { busy: true });

  // 5. A selection the event's own rules reject. `required` is 0 for a rule
  //    about the SHAPE of a selection rather than its size, where
  //    "Remove 1 ticket" would be a wrong instruction.
  const validity = snapshot?.selectionValidity;
  if (validity !== undefined && !validity.isValid) {
    if (validity.remaining > 0) {
      return reason(strings.translate('chooseMore', { values: { count: validity.remaining } }));
    }
    if (validity.required > 0 && validity.count > validity.required) {
      const extra = validity.count - validity.required;
      return reason(strings.translate('removeTickets', { count: extra, values: { count: extra } }));
    }
    return reason(strings.translate('adjustSelection'));
  }

  // 6. A hold that already exists changes what the button is offering.
  if (input.ticketCount !== undefined && holdActive) {
    const pendingCount = input.pendingCount ?? 0;
    return Object.freeze({
      label: pendingCount > 0
        ? strings.translate('secureMoreAndCheckout', { count: pendingCount, values: { count: pendingCount } })
        : strings.translate('continueToCheckout'),
      enabled: input.canCheckout,
      busy: false,
      statesReason: false,
      peekStatesReason: false,
      peekLine: peek,
    });
  }

  // 7. An empty cart: not a failure, but still the one thing left to do.
  if (input.ticketCount !== undefined && count === 0) {
    return Object.freeze({
      label: strings.translate('selectSeats'),
      enabled: false,
      busy: false,
      statesReason: true,
      peekStatesReason: true,
      peekLine: peek,
    });
  }

  // 8. Nothing in the way: the caller's own label.
  return Object.freeze({
    label: input.label,
    enabled: input.canCheckout,
    busy: false,
    statesReason: false,
    peekStatesReason: false,
    peekLine: peek,
  });
}
