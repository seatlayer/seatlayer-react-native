import { seatLayerPickerTokens } from './tokens.g';

/**
 * §3.8.2 — the map moves out from under the seat card.
 *
 * The phone seat card is a fixed bottom sheet. The seat and its card are kept
 * together by PANNING the map — x untouched, zoom untouched, the seat landing
 * at a constant fraction of the band the reported insets leave clear — and the
 * map goes back when the card leaves, unless the buyer has moved it themselves
 * in between. The sheet is folded into the fraction rather than reported as an
 * inset, because an inset re-frames the whole section and changes the zoom.
 */

/** Where in the clear band the seat comes to rest. The web sheet's number. */
export const seatLayerPickerSheetSeatFraction = 0.48;

/**
 * Where the seat rests once its card has gone: the middle of the band.
 *
 * The web sheet undoes its own pans exactly. Over the bridge that sum is not
 * trustworthy — the map re-fits itself when it changes size under a collapsing
 * sheet, so a lift can be undone by a refit this side never sees and asked for
 * again, and undoing both throws the section off the screen. A fixed resting
 * place is honest; the gesture guard still leaves a buyer who moved the map
 * where they put it.
 */
export const seatLayerPickerSheetRestoreFraction = 0.5;

/**
 * When the lift is asked again after it first lands.
 *
 * The runtime re-fits on its own when its surface changes size, and the web
 * view finishes growing under a collapsing sheet a frame or two AFTER the
 * layout has settled. Asking again, with the gesture count as the guard, costs
 * one `dy: 0` reply when the seat is already in place.
 */
export const seatLayerPickerSheetSettleDelaysMs: readonly number[] = Object.freeze([350, 800]);

export interface SeatLayerPickerSeatFrame {
  readonly dy: number;
  readonly gestures: number;
}

export interface SeatLayerPickerSeatLiftSink {
  frameSeat(
    seatId: string,
    options: { readonly fraction?: number; readonly gestures?: number },
  ): Promise<SeatLayerPickerSeatFrame | undefined>;
}

export interface SeatLayerPickerSeatLiftSync {
  readonly seatId: string | null;
  readonly mapHeight: number;
  readonly top: number;
  readonly bottom: number;
  /** The band the card covers, measured from the map's foot; 0 before layout. */
  readonly sheet: number;
  readonly revision: number;
}

export interface SeatLayerPickerSeatLiftTimers {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Where, within the band the runtime frames in, the seat has to rest so that
 * it sits at `at` of the band the SHEET leaves clear.
 *
 * The runtime frames between `top` and `mapHeight − bottom` and knows nothing
 * of the sheet, which is deliberately not reported. Clamped to the band; 0
 * where there is no band at all.
 */
export function seatLayerPickerSheetLiftFraction(input: Readonly<{
  mapHeight: number; top: number; bottom: number; sheet: number; at?: number;
}>): number {
  const at = input.at ?? seatLayerPickerSheetSeatFraction;
  const band = input.mapHeight - input.top - input.bottom;
  const clear = input.mapHeight - input.top - input.sheet;
  if (!(band > 0) || !(clear > 0)) return 0;
  return Math.min(1, Math.max(0, (clear * at) / band));
}

/**
 * The lift the layout makes for one seat card, and its undoing.
 *
 * Driven from the layout's render, every frame, with what the card and the
 * chrome measure; it sends only when the question has changed. One lift per
 * card: a card replaced by another seat's card without a dismiss in between
 * keeps the first lift standing and the second ADDS to it, so the one restore
 * at the end puts the map back where the buyer had it rather than half way.
 */
export class SeatLayerPickerSeatLift {
  private readonly timers: unknown[] = [];
  private seatId: string | null = null;
  private fraction = 0;
  private total = 0;
  private anchor = 0;
  private gestures: number | undefined;
  private revision = -1;
  private generation = 0;
  private seenHeight: number | undefined;
  private settling = false;
  private anchorListener: ((dy: number) => void) | undefined;

  /**
   * Watch the pan standing over the current snapshot.
   *
   * The lift moves the map from an async command reply, so a surface drawn
   * against `selection[].screenPoint` — the spotlight hole — cannot learn about
   * it from a render. It is told.
   */
  setAnchorListener(listener: ((dy: number) => void) | undefined): void {
    this.anchorListener = listener;
  }

  constructor(
    private readonly sink: SeatLayerPickerSeatLiftSink,
    private readonly clock: SeatLayerPickerSeatLiftTimers = globalThis as unknown as SeatLayerPickerSeatLiftTimers,
    private readonly settleDelaysMs: readonly number[] = seatLayerPickerSheetSettleDelaysMs,
  ) {}

  /** The seat the map is lifted for, or null. */
  get liftedSeatId(): string | null {
    return this.seatId;
  }

  /** The total pan standing, in screen pixels. */
  get dy(): number {
    return this.total;
  }

  /**
   * The pan made since the snapshot the chrome is reading, in screen pixels.
   *
   * `selection[].screenPoint` is computed when the runtime BUILDS a snapshot,
   * and `picker.frameSeat` publishes none — it is camera only, no revision, no
   * selection — so a seat's reported point is where it sat BEFORE this lift.
   * Anything the shell draws against that point adds this, or it lands a whole
   * lift band away from the seat: the spotlight hole did, on device (iOS 26.5),
   * showing the candidate's neighbours while the seat stayed under the blur.
   * A newer snapshot already contains the pans made before it, so this resets
   * the moment one arrives rather than accumulating for the card's life.
   */
  get anchorDy(): number {
    return this.anchor;
  }

  /**
   * Whether a lift is waiting for the map to hold still. The layout keeps
   * measuring while this is true, so the next `sync` can see a settled height.
   */
  get isSettling(): boolean {
    return this.settling;
  }

  /** Keep the map lifted for `seatId`, or put it back for `null`. */
  sync(input: SeatLayerPickerSeatLiftSync): void {
    if (input.seatId === null) {
      this.release();
      return;
    }
    const band = input.mapHeight - input.top - input.bottom;
    if (!(band > 0) || !(input.sheet > 0)) return;
    // The map is a web view that resizes as the cart sheet collapses under an
    // opening card, and the runtime pans against ITS height at the moment the
    // command lands. A fraction folded against a height caught mid-animation
    // puts the seat under the card, so a lift is only sent once two
    // consecutive syncs agree on the height.
    if (this.seenHeight !== input.mapHeight) {
      this.seenHeight = input.mapHeight;
      this.settling = true;
      return;
    }
    this.settling = false;
    const fraction = seatLayerPickerSheetLiftFraction(input);
    if (input.seatId === this.seatId && fraction === this.fraction && input.revision === this.revision) return;
    // A newer snapshot recomputed every screen point against the camera this
    // lift has already moved, so the pans folded into it are no longer the
    // shell's to add.
    if (input.revision !== this.revision) this.publishAnchor(0);
    this.seatId = input.seatId;
    this.fraction = fraction;
    this.revision = input.revision;
    this.cancelSettle();
    const generation = ++this.generation;
    const seatId = input.seatId;
    // Off the render, for the same reason the focus command is.
    void Promise.resolve().then(() => {
      if (generation !== this.generation) return;
      void this.lift(seatId, fraction, generation);
    });
  }

  /**
   * Put the seat at its resting place — unless the buyer has moved the map —
   * and forget the lift.
   */
  release(): void {
    const seatId = this.seatId;
    const gestures = this.gestures;
    const dy = this.total;
    this.forget();
    if (seatId === null || gestures === undefined || dy === 0) return;
    void this.sink.frameSeat(seatId, {
      fraction: seatLayerPickerSheetRestoreFraction,
      gestures,
    }).catch(() => undefined);
  }

  /** Forget the lift without touching the map — the picker is going away. */
  forget(): void {
    this.generation += 1;
    this.cancelSettle();
    this.seenHeight = undefined;
    this.settling = false;
    this.seatId = null;
    this.fraction = 0;
    this.total = 0;
    this.publishAnchor(0);
    this.gestures = undefined;
    this.revision = -1;
  }

  private async lift(seatId: string, fraction: number, generation: number): Promise<void> {
    let answer: SeatLayerPickerSeatFrame | undefined;
    try {
      answer = await this.sink.frameSeat(seatId, { fraction, gestures: this.gestures });
    } catch {
      // The map simply does not lift; the controller owns the error surface.
      return;
    }
    if (answer === undefined || generation !== this.generation) return;
    // A refused lift — the buyer has moved the map — leaves the count where it
    // was, so the restore is refused for the same reason.
    if (this.gestures !== undefined && answer.gestures !== this.gestures) return;
    this.gestures = answer.gestures;
    this.total += answer.dy;
    this.publishAnchor(this.anchor + answer.dy);
    if (this.timers.length > 0) return;
    for (const delay of this.settleDelaysMs) {
      this.timers.push(this.clock.setTimeout(() => {
        if (generation !== this.generation || this.seatId !== seatId) return;
        void this.lift(seatId, fraction, generation);
      }, delay));
    }
  }

  private publishAnchor(value: number): void {
    if (this.anchor === value) return;
    this.anchor = value;
    try { this.anchorListener?.(value); } catch { /* one broken reader never stops the lift */ }
  }

  private cancelSettle(): void {
    for (const handle of this.timers) this.clock.clearTimeout(handle);
    this.timers.length = 0;
  }
}

/**
 * The band the card covers, as a viewport inset — the fallback for a runtime
 * with no `picker.frameSeat` in its hello table.
 *
 * What the runtime does with it is `refitCurrentView`: the focused section is
 * re-framed into the band left clear, so the seat lands INSIDE that band
 * rather than at a constant fraction of it, and a pinch the buyer made inside
 * the section is refit away with it. It is the fallback, never the pair: a
 * runtime that pans is never also given the inset.
 */
export function seatLayerPickerSeatCardInsetBand(input: Readonly<{
  chromeBottom: number; cardTop: number; mapHeight: number;
}>): number {
  const band = input.mapHeight - input.cardTop + seatLayerPickerTokens.size.confirmCardSeatGap;
  if (!Number.isFinite(band)) return Math.max(0, input.chromeBottom);
  return Math.max(0, input.chromeBottom, Math.min(band, input.mapHeight));
}
