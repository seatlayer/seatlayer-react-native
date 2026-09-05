import { seatLayerPickerTokens } from './tokens.g';

/**
 * The picker's OWN toast queue (spec §3.12).
 *
 * Not the host's messenger: a picker that borrowed the host's snackbar could
 * not place its card above the seat card, lift it over the dock, or guarantee
 * it was announced. ONE queue — a second toast replaces the first rather than
 * stacking — and the dwell is `motion.durationOutsideBudget.toastDwell`.
 */

export type SeatLayerToastTone = 'neutral' | 'error' | 'warning' | 'success';

export const seatLayerToastDwellMs =
  seatLayerPickerTokens.motion.durationOutsideBudget.toastDwell;
/** The card sits this far above the bottom edge, clear of the dock. */
export const seatLayerToastCardLift = seatLayerPickerTokens.size.toastCardLift;
/** An action is a fixed 44 pt hit box, never sized by its own words. */
export const seatLayerToastActionHitBox = seatLayerPickerTokens.size.minimumHitTarget;

export interface SeatLayerToast {
  readonly id: number;
  readonly message: string;
  readonly tone: SeatLayerToastTone;
  readonly actionLabel: string | null;
}

export interface SeatLayerToastRequest {
  readonly message: string;
  readonly tone?: SeatLayerToastTone;
  readonly actionLabel?: string | null;
  readonly onAction?: () => void;
}

export interface SeatLayerToastTimer {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Transport-free toast state. The surface draws `current`; the queue owns only
 * which sentence is up and for how long.
 */
export class SeatLayerToastQueue {
  private currentToast: SeatLayerToast | null = null;
  private action: (() => void) | undefined;
  private nextId = 1;
  private handle: unknown = null;

  constructor(
    private readonly timer: SeatLayerToastTimer,
    private readonly onChanged?: () => void,
  ) {}

  get current(): SeatLayerToast | null {
    return this.currentToast === null ? null : Object.freeze({ ...this.currentToast });
  }

  /** Shows one sentence. A second toast REPLACES the first, never stacking. */
  show(request: SeatLayerToastRequest): SeatLayerToast | null {
    const message = typeof request.message === 'string' ? request.message.trim() : '';
    if (!message) return null;
    this.clearTimer();
    const toast: SeatLayerToast = {
      id: this.nextId++,
      message,
      // Tones change only the border; the ground stays the surface.
      tone: request.tone ?? 'neutral',
      actionLabel: typeof request.actionLabel === 'string' && request.actionLabel.trim()
        ? request.actionLabel.trim()
        : null,
    };
    this.currentToast = toast;
    this.action = request.onAction;
    this.handle = this.timer.setTimeout(() => this.expire(toast.id), seatLayerToastDwellMs);
    this.changed();
    return Object.freeze({ ...toast });
  }

  press(id: number): boolean {
    if (this.currentToast?.id !== id || this.action === undefined) return false;
    const action = this.action;
    this.dismiss(id);
    try { action(); } catch { /* the host's action cannot break the queue */ }
    return true;
  }

  dismiss(id: number): boolean {
    if (this.currentToast?.id !== id) return false;
    this.clearTimer();
    this.currentToast = null;
    this.action = undefined;
    this.changed();
    return true;
  }

  reset(): void {
    this.clearTimer();
    if (this.currentToast === null) return;
    this.currentToast = null;
    this.action = undefined;
    this.changed();
  }

  dispose(): void {
    this.clearTimer();
    this.currentToast = null;
    this.action = undefined;
  }

  private expire(id: number): void {
    this.handle = null;
    // Leaving resets the queue to neutral.
    if (this.currentToast?.id === id) this.dismiss(id);
  }

  private clearTimer(): void {
    if (this.handle === null) return;
    this.timer.clearTimeout(this.handle);
    this.handle = null;
  }

  private changed(): void {
    try { this.onChanged?.(); } catch { /* observation cannot break the queue */ }
  }
}
