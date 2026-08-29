import {
  cancelPending,
  completePendingCancel,
  type PendingConfirmationState,
  type SeatLayerSelectedSeatLike,
} from "./pendingConfirmationState";

export interface SeatLayerPickerPendingSelectionSink {
  deselectObjects(objects: string[]): Promise<unknown>;
}

export interface SeatLayerPickerPendingCancelOutcome {
  readonly state: PendingConfirmationState;
  readonly cancelled: boolean;
}

export interface SeatLayerPickerPendingCancelStateAccess {
  getState(): PendingConfirmationState;
  setState(state: PendingConfirmationState): void;
  setBusy(busy: boolean): void;
  reportError(error: unknown): void;
}

/**
 * Serializes cancellation outside React state. A second press before React has
 * committed the first state update therefore cannot send a second deselect.
 */
export class SeatLayerPickerPendingCancelCoordinator {
  private inFlight = false;
  private disposed = false;

  constructor(
    private readonly controller: SeatLayerPickerPendingSelectionSink,
    private readonly state: SeatLayerPickerPendingCancelStateAccess,
  ) {}

  get isInFlight(): boolean {
    return this.inFlight;
  }

  /** Retires late command completion when its scope starts a new session. */
  dispose(): void {
    this.disposed = true;
  }

  async cancel(expected?: SeatLayerSelectedSeatLike): Promise<boolean> {
    if (this.disposed || this.inFlight) return false;
    const result = cancelPending(this.state.getState(), expected);
    if (result.intent === null) return false;

    this.inFlight = true;
    this.state.setBusy(true);
    try {
      await this.controller.deselectObjects([result.intent.label]);
      if (this.disposed) return false;
      // A newer snapshot may have arrived while the command was in flight.
      // Complete against that latest state, and only for this exact intent.
      this.state.setState(
        completePendingCancel(this.state.getState(), result.intent),
      );
      return true;
    } catch (error) {
      if (!this.disposed) {
        try { this.state.reportError(error); } catch { /* observer only */ }
      }
      return false;
    } finally {
      this.inFlight = false;
      if (!this.disposed) this.state.setBusy(false);
    }
  }
}

/** Cancels only the snapshot's exact pending selection; it never aborts a hold. */
export async function cancelSeatLayerPickerPending(
  state: PendingConfirmationState,
  controller: SeatLayerPickerPendingSelectionSink,
): Promise<SeatLayerPickerPendingCancelOutcome> {
  const result = cancelPending(state);
  if (result.intent === null) return { state, cancelled: false };
  await controller.deselectObjects([result.intent.label]);
  return {
    state: completePendingCancel(state, result.intent),
    cancelled: true,
  };
}
