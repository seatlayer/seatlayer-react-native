import type { JsonObject } from '../json';
import type { SeatLayerThemeMode } from './theme';

export interface SeatLayerPickerChartTheme {
  readonly mode: Exclude<SeatLayerThemeMode, 'auto'>;
  readonly mapTheme: JsonObject;
}

export interface SeatLayerPickerChartThemeRetryScheduler {
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

const defaultRetryScheduler: SeatLayerPickerChartThemeRetryScheduler = {
  schedule: (callback) => setTimeout(callback, 0),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function keyOf(theme: SeatLayerPickerChartTheme): string {
  return JSON.stringify(theme);
}

/** Coalesces pre-ready appearance changes into one in-place picker command. */
export class SeatLayerPickerChartThemeSync {
  private desired: SeatLayerPickerChartTheme;
  private sentKey: string;
  private ready = false;
  private inFlight: Promise<void> | undefined;
  private retryHandle: unknown;
  private retriedKey: string | undefined;
  private disposed = false;

  constructor(
    bootTheme: SeatLayerPickerChartTheme,
    private readonly retryScheduler: SeatLayerPickerChartThemeRetryScheduler = defaultRetryScheduler,
  ) {
    this.desired = bootTheme;
    this.sentKey = keyOf(bootTheme);
  }

  setDesired(theme: SeatLayerPickerChartTheme): void {
    if (this.disposed) return;
    this.desired = theme;
  }

  markReady(): void {
    if (this.disposed) return;
    this.ready = true;
  }

  flush(
    send: (theme: SeatLayerPickerChartTheme) => Promise<void>,
  ): Promise<void> {
    if (this.disposed || !this.ready || this.sentKey === keyOf(this.desired)) {
      return Promise.resolve();
    }
    if (this.inFlight) return this.inFlight;
    const flight = (async () => {
      while (!this.disposed && this.ready && this.sentKey !== keyOf(this.desired)) {
        const target = this.desired;
        const targetKey = keyOf(target);
        await send(target);
        this.sentKey = targetKey;
      }
    })();
    const wrapped = flight.finally(() => {
      if (this.inFlight === wrapped) this.inFlight = undefined;
    });
    void wrapped.catch(() => this.scheduleOneRetry(send));
    this.inFlight = wrapped;
    return wrapped;
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryHandle === undefined) return;
    this.retryScheduler.cancel(this.retryHandle);
    this.retryHandle = undefined;
  }

  private scheduleOneRetry(
    send: (theme: SeatLayerPickerChartTheme) => Promise<void>,
  ): void {
    const key = keyOf(this.desired);
    if (this.disposed || this.retryHandle !== undefined || this.retriedKey === key) return;
    this.retriedKey = key;
    this.retryHandle = this.retryScheduler.schedule(() => {
      this.retryHandle = undefined;
      if (this.disposed) return;
      void this.flush(send).catch(() => undefined);
    });
  }
}
