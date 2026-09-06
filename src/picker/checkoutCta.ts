import type { SeatLayerPickerStringResolver } from './locale';
import type { SeatLayerPickerSnapshot } from './models';

/**
 * What the checkout call to action says, and whether it can be pressed.
 *
 * ONE resolver, ONE button (spec §3.10.3). The sheet used to draw a second,
 * smaller `Continue` on a collapsed bar and this had a second reading for it;
 * the collapsed sheet IS the footer now, so there is one reading and the wide
 * layout's bar shares it. It is pure: every fact the picker state cannot
 * supply — an open seat card, a handoff still running inside the host — is
 * passed in.
 */

/** One resolved reading of the checkout call to action. */
export interface SeatLayerCheckoutCtaState {
  readonly label: string;
  readonly enabled: boolean;
  /** Only ever true while work the buyer already asked for is in flight. */
  readonly busy: boolean;
  /** Whether `label` is a reason rather than the caller's own wording. */
  readonly statesReason: boolean;
  /**
   * Whether a press opens the best-seats form rather than starting a checkout.
   *
   * The phone's empty cart, and only that: the wide foot's `Select seats` is a
   * disabled label telling a buyer to use the map beside it, which is fair on
   * a width that shows both at once.
   */
  readonly findsBestSeats: boolean;
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
  /** Supplying it turns on the hold and empty-cart readings. */
  readonly ticketCount?: number;
  readonly pendingCount?: number;
  readonly canOfferFind?: boolean;
}

function state(
  label: string,
  enabled: boolean,
  options: Readonly<{ busy?: boolean; statesReason?: boolean; findsBestSeats?: boolean }> = {},
): SeatLayerCheckoutCtaState {
  return Object.freeze({
    label,
    enabled,
    busy: options.busy === true,
    statesReason: options.statesReason === true,
    findsBestSeats: options.findsBestSeats === true,
  });
}

/**
 * Resolve the checkout call to action. The order is the web picker's, and it
 * matters: sales closing outranks an open prompt, an open prompt outranks the
 * hold a press behind it would create, and a selection the event's rules reject
 * is only worth mentioning once nothing is in flight.
 */
export function seatLayerCheckoutCtaState(
  input: SeatLayerCheckoutCtaInput,
): SeatLayerCheckoutCtaState {
  const { snapshot, strings } = input;
  const count = input.ticketCount ?? 0;
  const holdActive = snapshot?.hold.active === true;
  const reason = (label: string, busy = false): SeatLayerCheckoutCtaState =>
    state(label, false, { busy, statesReason: true });

  // 1. Nothing else is worth saying about an event that has stopped selling.
  if (snapshot?.event.salesClosed === true) return reason(strings.translate('salesClosedCta'));

  // 2. A prompt the buyer has not answered.
  if (input.generalAdmissionPending === true) return reason(strings.translate('confirmYourTickets'));

  // 3. A SEAT CARD KEEPS THE BUTTON'S OWN LABEL AND HOLDS IT DOWN. The card
  //    standing over the map is the question; a footer that turns into
  //    "Confirm or cancel the seat" answers a question the card is already
  //    asking, and takes the buyer's cart off the one line that states it.
  if (input.seatCardOpen) {
    const under = seatLayerCheckoutCtaState({ ...input, seatCardOpen: false });
    return state(under.label, false, {
      busy: under.busy,
      statesReason: under.statesReason,
      // Not even the finder: nothing on the sheet is pressable while the card
      // is asking.
      findsBestSeats: false,
    });
  }

  // 4. and 5. Work the buyer has already asked for.
  if (input.creatingHold === true) return reason(strings.translate('securingSeats'), true);
  if (input.handoffInFlight === true) return reason(strings.translate('openingCheckout'), true);

  // 6. A selection the event's own rules reject. `required` is 0 for a rule
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

  // 7. THE EMPTY PHONE CART HAS A DOOR, NOT A DEAD BUTTON. Gated exactly as
  //    the tray's own card is — a door into an empty room is worse than none.
  if (input.ticketCount !== undefined && count === 0 &&
    input.canOfferFind === true && !holdActive) {
    return state(strings.translate('findBestSeatsCta'), true, { findsBestSeats: true });
  }

  // 8. A hold that already exists changes what the button is offering.
  if (input.ticketCount !== undefined && holdActive) {
    const pendingCount = input.pendingCount ?? 0;
    return state(pendingCount > 0
      ? strings.translate('secureMoreAndCheckout', { count: pendingCount, values: { count: pendingCount } })
      : strings.translate('continueToCheckout'), input.canCheckout);
  }

  // 9. An empty cart with no finder to offer: not a failure, but still the one
  //    thing left to do.
  if (input.ticketCount !== undefined && count === 0) {
    return state(strings.translate('selectSeats'), false, { statesReason: true });
  }

  // 10. Nothing in the way: the caller's own label.
  return state(input.label, input.canCheckout);
}
