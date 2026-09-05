import { useEffect, useRef, useState } from 'react';

import type { SelectedSeat } from '../types';
import { seatLayerPickerSeatIdentity } from './pendingConfirmationState';

/**
 * §3.8.4a — the same card, asking the opposite question.
 *
 * A second tap on a seat already in the cart used to drop it in silence. A
 * runtime that speaks it now KEEPS the seat selected and reports the tap as
 * `seat.retap`; the chrome raises the same card in its remove state. Cancel,
 * the tap outside, the downward drag and the platform's back gesture are ways
 * out of the question, not answers to it — only Remove takes the seat back
 * out, down the same path the cart's ✕ uses.
 *
 * The seat stays counted the whole time: it is not a candidate, so unlike an
 * unanswered add it keeps its ticket, its line and its money until the
 * question is actually answered.
 */

export type SeatLayerPickerConfirmCardMode = 'add' | 'remove';

export interface SeatLayerPickerSeatRetapSource {
  subscribeSeatRetap(listener: (seat: SelectedSeat) => void): () => void;
}

export interface SeatLayerPickerSeatRetapPolicy {
  /** A read-only picker never raises the question at all. */
  readonly readOnly: boolean;
  /** An unanswered ADD outranks a retap. */
  readonly hasPendingAdd: boolean;
  /** The seat an add card is already open about, if any. */
  readonly pendingSeatIdentity: string | null;
}

/** Whether a retapped seat may raise the remove card at all. */
export function seatLayerPickerAcceptsSeatRetap(
  seat: SelectedSeat,
  policy: SeatLayerPickerSeatRetapPolicy,
): boolean {
  if (policy.readOnly) return false;
  const identity = seatLayerPickerSeatIdentity(seat);
  if (identity === null) return false;
  // Turning an open question round under the buyer's finger is a worse
  // surprise than the silence it replaces.
  if (policy.hasPendingAdd) return false;
  return policy.pendingSeatIdentity !== identity;
}

/**
 * Holds the one seat a remove card is open about, outside React state, so a
 * runtime event that lands between renders cannot be lost.
 */
export class SeatLayerPickerSeatRemovalStore {
  private seat: SelectedSeat | null = null;
  private readonly listeners = new Set<() => void>();
  private stopSource: (() => void) | undefined;

  constructor(
    private readonly source: SeatLayerPickerSeatRetapSource,
    private readonly policy: () => SeatLayerPickerSeatRetapPolicy,
  ) {}

  getSnapshot = (): SelectedSeat | null => this.seat;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  /** Put the question away without answering it; the seat is left alone. */
  dismiss = (): void => {
    this.publish(null);
  };

  /**
   * Drop a question about a seat the newest snapshot no longer carries — the
   * seat left the selection some other way, so there is nothing left to ask.
   */
  reconcile(selection: readonly SelectedSeat[]): void {
    const seat = this.seat;
    if (seat === null) return;
    const identity = seatLayerPickerSeatIdentity(seat);
    const live = selection.find((item) => seatLayerPickerSeatIdentity(item) === identity);
    if (live === undefined) this.publish(null);
    else if (live !== seat) this.publish(live);
  }

  private start(): void {
    // A controller that predates `seat.retap` simply never raises the
    // question; there is nothing here for the card to fall over on.
    if (typeof this.source?.subscribeSeatRetap !== 'function') return;
    this.stopSource = this.source.subscribeSeatRetap((seat) => {
      if (!seatLayerPickerAcceptsSeatRetap(seat, this.policy())) return;
      this.publish(seat);
    });
  }

  private stop(): void {
    try { this.stopSource?.(); } catch { /* the source is going away anyway */ }
    this.stopSource = undefined;
    this.seat = null;
  }

  private publish(seat: SelectedSeat | null): void {
    if (this.seat === seat) return;
    this.seat = seat;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* one broken reader never stops the rest */ }
    }
  }
}

export interface SeatLayerPickerSeatRemoval {
  readonly seatAwaitingRemoval: SelectedSeat | null;
  readonly dismissSeatRemoval: () => void;
}

/** Subscribes one card to the retap question for one controller session. */
export function useSeatLayerPickerSeatRemoval(
  source: SeatLayerPickerSeatRetapSource,
  policy: SeatLayerPickerSeatRetapPolicy,
  selection: readonly SelectedSeat[],
  sessionKey: string,
): SeatLayerPickerSeatRemoval {
  const policyRef = useRef(policy);
  policyRef.current = policy;
  const [store, setStore] = useState(
    () => new SeatLayerPickerSeatRemovalStore(source, () => policyRef.current),
  );
  const [seat, setSeat] = useState<SelectedSeat | null>(null);
  const keyRef = useRef(sessionKey);
  if (keyRef.current !== sessionKey) {
    keyRef.current = sessionKey;
    setStore(new SeatLayerPickerSeatRemovalStore(source, () => policyRef.current));
    setSeat(null);
  }
  useEffect(() => {
    const stop = store.subscribe(() => setSeat(store.getSnapshot()));
    setSeat(store.getSnapshot());
    return stop;
  }, [store]);
  useEffect(() => {
    store.reconcile(selection);
    setSeat(store.getSnapshot());
  }, [selection, store]);
  return { seatAwaitingRemoval: seat, dismissSeatRemoval: store.dismiss };
}
