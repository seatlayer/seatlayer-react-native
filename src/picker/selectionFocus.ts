import { useEffect, useRef } from 'react';

/**
 * §3.8.1a — the runtime paints the candidate the card is asking about.
 *
 * The glass quiets the map; it does not say WHICH seat the question is about,
 * because every selected seat is drawn alike. So the card names its seat:
 * `{ seatId }` when it opens and `{ seatId: null }` when it closes. Both an
 * add card and a remove card focus, and only one card is ever up, so only one
 * seat is ever the candidate.
 *
 * The command selects nothing, holds nothing and moves no camera, so it is
 * safe on a read-only picker and carries no busy action. It reports no state:
 * the runtime drops the focus itself when the seat leaves the selection, so
 * this side only ever mirrors what it last asked for.
 */
export interface SeatLayerPickerSelectionFocusSink {
  readonly supportsSelectionFocus: boolean;
  setSelectionFocus(seatId: string | null): Promise<void>;
}

/**
 * Coalesces the card's seat — reported from a render that runs every frame —
 * into at most one command per change, deferred off the render itself so a
 * command never publishes state in the middle of one.
 */
export class SeatLayerPickerSelectionFocus {
  private asked: string | null = null;
  private queued: string | null = null;
  private scheduled = false;
  private disposed = false;
  private generation = 0;

  constructor(private readonly sink: SeatLayerPickerSelectionFocusSink) {}

  /** The seat this side last asked the runtime to paint. */
  get focusedSeatId(): string | null {
    return this.asked;
  }

  /** Ask for `seatId`, or for nothing at all with `null`. */
  focus(seatId: string | null): void {
    const next = typeof seatId === 'string' && seatId.trim().length > 0 ? seatId : null;
    if (this.disposed || !this.sink.supportsSelectionFocus || next === this.queued) return;
    this.queued = next;
    if (this.scheduled) return;
    this.scheduled = true;
    const generation = this.generation;
    // Off the render: a command publishes state, and a listener notified from
    // inside a render would be re-rendering mid-frame.
    void Promise.resolve().then(() => {
      this.scheduled = false;
      if (this.disposed || generation !== this.generation) return;
      this.send(this.queued);
    });
  }

  /** Clear the focus and stop; the card, or the whole picker, is going away. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    if (this.asked !== null) void this.sink.setSelectionFocus(null).catch(() => undefined);
    this.asked = null;
    this.queued = null;
  }

  private send(seatId: string | null): void {
    if (seatId === this.asked) return;
    this.asked = seatId;
    // A runtime that advertises the command and still refuses it is swallowed:
    // the seat is painted the way it was, and there is nothing there for a
    // buyer to act on. Every other failure is contained the same way, because
    // a card the buyer is answering must not fall over for a paint.
    void this.sink.setSelectionFocus(seatId).catch(() => undefined);
  }
}

/** Keeps the runtime's candidate paint on `seatId` for as long as a card is up. */
export function useSeatLayerPickerSelectionFocus(
  sink: SeatLayerPickerSelectionFocusSink,
  seatId: string | null | undefined,
): void {
  const focusRef = useRef<SeatLayerPickerSelectionFocus | undefined>(undefined);
  useEffect(() => {
    const focus = new SeatLayerPickerSelectionFocus(sink);
    focusRef.current = focus;
    return () => {
      focusRef.current = undefined;
      focus.dispose();
    };
  }, [sink]);
  useEffect(() => {
    focusRef.current?.focus(seatId ?? null);
  }, [seatId, sink]);
}
