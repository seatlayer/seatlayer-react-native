import type { SeatLayerPickerCheckoutHandoff, SeatLayerPickerSnapshot } from './models';

/**
 * The three refusals the runtime answers once a hold belongs to the host. None
 * of them is a failure the buyer can read as one, so the picker says the STATE
 * instead and the runtime's own sentence is never shown (§3.13.13, N1 = B).
 */
export const seatLayerPickerHoldOwnershipCodes = Object.freeze([
  'hold_owned_by_host',
  'hold_selection_mismatch',
  'hold_already_active',
] as const);

export type SeatLayerPickerHoldOwnershipCode =
  typeof seatLayerPickerHoldOwnershipCodes[number];

/**
 * The refusals the runtime raises UNPROMPTED, on the map, with no native
 * command in flight — a second tap on a seat under a host-owned hold, a second
 * hold. Those are the ones an unsolicited bridge `error` may turn into the
 * notice.
 *
 * `hold_selection_mismatch` is deliberately NOT one of them. It is only ever
 * the answer to `picker.continue`, and since Flutter 0.9.1 that path answers
 * it by REPLACING the hold with every selected seat and asking again, rather
 * than by refusing with "Your seats are already in checkout". An echo of that
 * attempt on the event channel must not raise a notice for a Continue that
 * went on to succeed. The code stays in the list above, because the same
 * refusal reaching a command the picker cannot retry is still a state
 * (§3.13.13).
 */
export const seatLayerPickerUnsolicitedHoldOwnershipCodes = Object.freeze([
  'hold_owned_by_host',
  'hold_already_active',
] as const satisfies readonly SeatLayerPickerHoldOwnershipCode[]);

/**
 * What the inline action bar says instead of the refusal. `inCheckout` has one
 * action — release the handoff so the seats go back on sale; `alreadyHeld` has
 * no handoff to give back and so offers nothing but dismiss.
 */
export interface SeatLayerPickerHoldOwnershipNotice {
  readonly kind: 'inCheckout' | 'alreadyHeld';
  readonly titleKey: 'holdInCheckoutTitle' | 'holdAlreadyHeldTitle';
  readonly bodyKey: 'holdInCheckoutBody' | 'holdAlreadyHeldBody';
  readonly actionKey?: 'releaseAndChangeSeats';
  readonly holdId?: string;
  readonly code: SeatLayerPickerHoldOwnershipCode;
}

function ownData(value: unknown, key: string): unknown {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the refusal code off a bridge error without trusting its shape. */
export function seatLayerPickerHoldOwnershipCode(
  error: unknown,
): SeatLayerPickerHoldOwnershipCode | undefined {
  const code = ownData(error, 'code');
  return typeof code === 'string' &&
      (seatLayerPickerHoldOwnershipCodes as readonly string[]).includes(code)
    ? code as SeatLayerPickerHoldOwnershipCode
    : undefined;
}

/**
 * Draws the state, never the bridge sentence. The hold id reaches this only
 * through a handoff the picker actually made — snapshots deliberately never
 * carry it — so a refusal with no handoff in hand is the picker's own hold and
 * gets the "already held" wording with nothing but a dismiss.
 */
export function seatLayerPickerHoldOwnershipNotice(
  error: unknown,
  handoff: SeatLayerPickerCheckoutHandoff | undefined,
): SeatLayerPickerHoldOwnershipNotice | undefined {
  const code = seatLayerPickerHoldOwnershipCode(error);
  if (code === undefined) return undefined;
  const holdId = typeof handoff?.holdId === 'string' && handoff.holdId.trim()
    ? handoff.holdId
    : undefined;
  return holdId === undefined
    ? Object.freeze({
      kind: 'alreadyHeld' as const,
      titleKey: 'holdAlreadyHeldTitle' as const,
      bodyKey: 'holdAlreadyHeldBody' as const,
      code,
    })
    : Object.freeze({
      kind: 'inCheckout' as const,
      titleKey: 'holdInCheckoutTitle' as const,
      bodyKey: 'holdInCheckoutBody' as const,
      actionKey: 'releaseAndChangeSeats' as const,
      holdId,
      code,
    });
}

/**
 * The cart line keeps its × while the host owns the hold (§3.13.13). Removing
 * it is refused by the runtime, and the refusal is what raises the notice — a
 * control the buyer can still press and be told about beats one that has
 * silently gone.
 */
export function seatLayerPickerCartLineKeepsRemove(
  snapshot: SeatLayerPickerSnapshot | undefined,
): boolean {
  return snapshot !== undefined;
}

/**
 * "You're all set" is never shown on the hand-off: a buyer on the way to pay
 * has not paid. It appears only when the handed-off hold SETTLES to booked —
 * the hold vanishes from the snapshot with no `hold.expired` announced first,
 * which is the web picker's own `detectBooked` rule. The expiry is read off
 * the bridge on the same hop as the snapshot that follows it, so the order on
 * the wire (expiry, then snapshot) is the order this decision sees.
 */
export class SeatLayerPickerBookedDetector {
  private handoff: SeatLayerPickerCheckoutHandoff | undefined;
  private expiryAnnounced = false;
  private holdWasActive = false;
  private booked: SeatLayerPickerCheckoutHandoff | undefined;

  /** The handoff the picker made, retained so a later release can name it. */
  handedOff(handoff: SeatLayerPickerCheckoutHandoff): void {
    this.handoff = handoff;
    this.expiryAnnounced = false;
    this.holdWasActive = true;
    this.booked = undefined;
  }

  /** From the runtime's own expiry signal, never from a snapshot. */
  expired(): void {
    this.expiryAnnounced = true;
  }

  released(): void {
    this.handoff = undefined;
    this.expiryAnnounced = false;
    this.holdWasActive = false;
    this.booked = undefined;
  }

  get pendingHandoff(): SeatLayerPickerCheckoutHandoff | undefined {
    return this.handoff;
  }

  get bookedHandoff(): SeatLayerPickerCheckoutHandoff | undefined {
    return this.booked;
  }

  /** Answers the handoff exactly once, on the hop the sale lands. */
  observe(
    snapshot: SeatLayerPickerSnapshot | undefined,
  ): SeatLayerPickerCheckoutHandoff | undefined {
    const active = snapshot?.hold.active === true;
    if (active) {
      this.holdWasActive = true;
      return undefined;
    }
    if (snapshot === undefined || !this.holdWasActive) return undefined;
    this.holdWasActive = false;
    const handoff = this.handoff;
    const expired = this.expiryAnnounced;
    this.handoff = undefined;
    this.expiryAnnounced = false;
    if (handoff === undefined || expired) return undefined;
    this.booked = handoff;
    return handoff;
  }
}

/**
 * Session-local home for the notice, so the surface that CATCHES the refusal
 * (a cart row's ×, the call to action) and the surface that DRAWS it need not
 * know about each other.
 */
export class SeatLayerPickerHoldOwnershipStore {
  private notice: SeatLayerPickerHoldOwnershipNotice | undefined;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): SeatLayerPickerHoldOwnershipNotice | undefined => this.notice;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Answers true when the error WAS one of the three refusals, so a caller can
   * swallow it rather than also showing the runtime's own sentence.
   */
  raise(
    error: unknown,
    handoff: SeatLayerPickerCheckoutHandoff | undefined,
  ): boolean {
    const notice = seatLayerPickerHoldOwnershipNotice(error, handoff);
    if (notice === undefined) return false;
    this.write(notice);
    return true;
  }

  /**
   * The same, for a refusal that arrived on the event channel rather than as
   * an answer to a command. Only the codes the runtime raises unprompted are
   * taken; see [seatLayerPickerUnsolicitedHoldOwnershipCodes].
   */
  raiseUnsolicited(
    error: unknown,
    handoff: SeatLayerPickerCheckoutHandoff | undefined,
  ): boolean {
    const code = seatLayerPickerHoldOwnershipCode(error);
    if (
      code === undefined ||
      !(seatLayerPickerUnsolicitedHoldOwnershipCodes as readonly string[]).includes(code)
    ) {
      return false;
    }
    return this.raise(error, handoff);
  }

  clear(): void {
    this.write(undefined);
  }

  private write(next: SeatLayerPickerHoldOwnershipNotice | undefined): void {
    if (next === this.notice) return;
    this.notice = next;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A subscriber cannot break the notice for the others.
      }
    }
  }
}

const noticeStores = new WeakMap<object, SeatLayerPickerHoldOwnershipStore>();

export function seatLayerPickerHoldOwnershipStore(
  owner: object,
): SeatLayerPickerHoldOwnershipStore {
  const existing = noticeStores.get(owner);
  if (existing) return existing;
  const created = new SeatLayerPickerHoldOwnershipStore();
  noticeStores.set(owner, created);
  return created;
}
