import {
  type SeatLayerCartLineLike,
  type TicketIdentity,
  ticketIdentityOf,
} from './cartDense';

/**
 * The press is answered by the row (spec §3.10.2 and §3.13).
 *
 * `picker.removeCartLine` re-holds the rest of the cart on the server, which
 * takes close to two seconds on a real event. So the row is marked *removing*
 * in the same frame as the press: it fades to `opacity.removing`, its × goes
 * inert and it can no longer be swiped. The mark is dropped by the first
 * snapshot that no longer carries the line; a mutation that fails restores the
 * row and states itself through the inline action error.
 *
 * NOTHING IS SAID. There is no toast and no Undo — the line has gone from the
 * tray, the total has moved and the checkout action has recounted. The Undo
 * this file used to carry made a one-tap action into a two-tap one and put a
 * timer on the second tap; re-picking the seat is the same gesture that chose
 * it in the first place.
 */

export interface CartRemoveIntent<T extends SeatLayerCartLineLike> {
  readonly kind: 'remove';
  readonly lines: readonly T[];
  /** Stable inventory labels for picker.removeCartLine. */
  readonly labels: readonly string[];
}

export interface MarkedCartRemoval<T extends SeatLayerCartLineLike> {
  readonly token: number;
  readonly sessionId: number;
  readonly line: T;
  readonly identity: TicketIdentity;
  /** A folded run is one buyer intent and one mark. */
  readonly lines: readonly T[];
  readonly labels: readonly string[];
}

export interface CartRemovalMarkState<T extends SeatLayerCartLineLike> {
  readonly nextToken: number;
  readonly marks: readonly MarkedCartRemoval<T>[];
}

export interface BeginCartRemovalResult<T extends SeatLayerCartLineLike> {
  readonly state: CartRemovalMarkState<T>;
  readonly intent: CartRemoveIntent<T> | null;
  readonly mark: MarkedCartRemoval<T> | null;
}

/**
 * Transport-free local coordinator. The host owns bridge dispatch and
 * authoritative snapshots; this only remembers which rows are on their way out.
 */
export class CartRemovalMarkCoordinator<T extends SeatLayerCartLineLike> {
  private stateValue: CartRemovalMarkState<T> = { nextToken: 1, marks: [] };

  constructor(private readonly onChanged?: () => void) {}

  get state(): CartRemovalMarkState<T> {
    return freezeState(this.stateValue);
  }

  /** Marks one line (or one folded run) as removing and returns its intent. */
  begin(line: T, sessionId = 0): BeginCartRemovalResult<T> {
    return this.beginMany([line], sessionId);
  }

  beginMany(lines: readonly T[], sessionId = 0): BeginCartRemovalResult<T> {
    const line = lines[0];
    if (!line) return { state: freezeState(this.stateValue), intent: null, mark: null };
    const identity = ticketIdentityOf(line);
    const labels = lines
      .map((item) => ticketIdentityOf(item).removalLabel)
      .filter((label): label is string => label !== null);
    if (identity.removalLabel === null || labels.length !== lines.length) {
      return { state: freezeState(this.stateValue), intent: null, mark: null };
    }
    // A row already on its way out cannot be pressed again.
    if (this.isRemoving(line)) {
      return { state: freezeState(this.stateValue), intent: null, mark: null };
    }
    const mark: MarkedCartRemoval<T> = {
      token: this.stateValue.nextToken,
      sessionId,
      line,
      identity,
      lines: Object.freeze([...lines]),
      labels: Object.freeze([...labels]),
    };
    this.stateValue = { nextToken: mark.token + 1, marks: [...this.stateValue.marks, mark] };
    this.changed();
    return {
      state: freezeState(this.stateValue),
      intent: Object.freeze({ kind: 'remove', lines: mark.lines, labels: mark.labels }),
      mark: freezeMark(mark),
    };
  }

  /** Whether this line is already on its way out: faded, inert, un-swipeable. */
  isRemoving(line: SeatLayerCartLineLike): boolean {
    const identity = ticketIdentityOf(line);
    return this.stateValue.marks.some((mark) =>
      mark.lines.some((hidden) => sameCartIdentity(ticketIdentityOf(hidden), identity)));
  }

  get hasMarks(): boolean {
    return this.stateValue.marks.length > 0;
  }

  /**
   * A failed mutation, or a reply that left the line standing, brings the row
   * back. Where the line really did go this is already a no-op.
   */
  release(token: number): boolean {
    const remaining = this.stateValue.marks.filter((mark) => mark.token !== token);
    if (remaining.length === this.stateValue.marks.length) return false;
    this.stateValue = { ...this.stateValue, marks: remaining };
    this.changed();
    return true;
  }

  /**
   * The mark is dropped by the first snapshot that no longer carries the line.
   * A mark whose lines are all gone has been honoured by the server.
   */
  reconcile(items: readonly T[]): CartRemovalMarkState<T> {
    const identities = items.map((item) => ticketIdentityOf(item));
    const remaining = this.stateValue.marks.filter((mark) =>
      mark.lines.some((hidden) =>
        identities.some((identity) => sameCartIdentity(ticketIdentityOf(hidden), identity))));
    if (remaining.length !== this.stateValue.marks.length) {
      this.stateValue = { ...this.stateValue, marks: remaining };
      this.changed();
    }
    return freezeState(this.stateValue);
  }

  reset(): void {
    if (this.stateValue.marks.length === 0) return;
    this.stateValue = { ...this.stateValue, marks: [] };
    this.changed();
  }

  dispose(): void {
    this.stateValue = { ...this.stateValue, marks: [] };
  }

  private changed(): void {
    try { this.onChanged?.(); } catch { /* observation cannot break a removal */ }
  }
}

function freezeState<T extends SeatLayerCartLineLike>(
  state: CartRemovalMarkState<T>,
): CartRemovalMarkState<T> {
  return Object.freeze({
    nextToken: state.nextToken,
    marks: Object.freeze(state.marks.map((mark) => freezeMark(mark))),
  });
}

function freezeMark<T extends SeatLayerCartLineLike>(mark: MarkedCartRemoval<T>): MarkedCartRemoval<T> {
  return Object.freeze({
    ...mark,
    identity: Object.freeze({ ...mark.identity }),
    lines: Object.freeze([...mark.lines]),
    labels: Object.freeze([...mark.labels]),
  });
}

function sameCartIdentity(left: TicketIdentity, right: TicketIdentity): boolean {
  if (left.removalLabel !== null) return left.removalLabel === right.removalLabel;
  if (left.seatId !== null) return left.seatId === right.seatId;
  return left.objectId !== null && left.objectId === right.objectId;
}
