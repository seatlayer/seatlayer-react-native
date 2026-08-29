import type { SeatLayerPickerViewportInsets } from './models';
import {
  createSeatLayerPickerViewportInsetCoordinator,
  type SeatLayerPickerAnimationFrameScheduler,
  type SeatLayerPickerViewportInsetCoordinator,
  type SeatLayerPickerViewportInsetInput,
} from './viewportInsets';

export interface SeatLayerPickerInsetSink {
  setViewportInsets(insets: SeatLayerPickerViewportInsets | null): Promise<void>;
}

function sameInsets(
  left: SeatLayerPickerViewportInsets | undefined,
  right: SeatLayerPickerViewportInsets,
): boolean {
  return left !== undefined && left.top === right.top && left.right === right.right &&
    left.bottom === right.bottom && left.left === right.left;
}

/** Buffers chrome bands until the protocol-2 session is ready. */
export class SeatLayerPickerScopeInsets {
  private readonly coordinator: SeatLayerPickerViewportInsetCoordinator;
  private latest: SeatLayerPickerViewportInsets | undefined;
  private sent: SeatLayerPickerViewportInsets | undefined;
  private attempted: SeatLayerPickerViewportInsets | undefined;
  private ready = false;
  private inFlight: Promise<unknown> | undefined;
  private disposed = false;

  constructor(
    scheduler: SeatLayerPickerAnimationFrameScheduler,
    private readonly sink: SeatLayerPickerInsetSink,
    private readonly reportError: (error: unknown) => void,
  ) {
    this.coordinator = createSeatLayerPickerViewportInsetCoordinator(
      scheduler,
      (insets) => {
        this.latest = insets;
        this.flush();
      },
    );
  }

  setBand(band: string, insets: SeatLayerPickerViewportInsetInput): void {
    if (this.disposed) return;
    this.coordinator.setBand(band, insets);
  }

  removeBand(band: string): void {
    if (this.disposed) return;
    this.coordinator.removeBand(band);
  }

  markReady(): void {
    if (this.disposed) return;
    this.ready = true;
    this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.coordinator.dispose();
    if (this.ready && (this.sent !== undefined || this.attempted !== undefined)) {
      try {
        Promise.resolve(this.sink.setViewportInsets(null)).catch(() => undefined);
      } catch {
        // A retired owner must never surface a late bridge rejection.
      }
    }
    this.latest = undefined;
  }

  private flush(): void {
    if (this.disposed || !this.ready || this.latest === undefined || this.inFlight ||
      sameInsets(this.sent, this.latest) || sameInsets(this.attempted, this.latest)) {
      return;
    }
    const target = this.latest;
    this.attempted = target;
    let send: Promise<void>;
    try {
      send = this.sink.setViewportInsets(target);
    } catch (error) {
      send = Promise.reject(error);
    }
    const flight = send.then(
      () => {
        if (!this.disposed) this.sent = target;
      },
      (error: unknown) => {
        if (!this.disposed) this.reportError(error);
      },
    );
    const wrapped = flight.finally(() => {
      if (this.inFlight === wrapped) this.inFlight = undefined;
      if (!this.disposed) this.flush();
    });
    this.inFlight = wrapped;
  }
}
