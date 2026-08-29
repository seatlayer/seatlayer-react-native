import type { BridgeTransport } from './bridge/client';
import type { ReadyInfo, SeatLayerConfiguration } from './types';

export interface SeatLayerRendererHandshakeController {
  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
  ): Promise<ReadyInfo>;
}

/** One renderer mount owns one explicit handshake, regardless of bridge profile. */
export function beginSeatLayerRendererHandshake(
  controller: SeatLayerRendererHandshakeController,
  transport: BridgeTransport,
  configuration: SeatLayerConfiguration,
): Promise<ReadyInfo> {
  return controller.beginHandshake(transport, configuration);
}

export interface SeatLayerRendererHandshakeLeaseOptions {
  begin(): Promise<ReadyInfo>;
  disconnect(): void;
  onReady(info: ReadyInfo): void;
  onLoadError(error: unknown): void;
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

/**
 * Defers a renderer handshake by one task. React development Strict Mode
 * cleans up and immediately re-sets effects, so that simulated first mount is
 * cancelled before it can create a second bridge session.
 */
export class SeatLayerRendererHandshakeLease {
  private scheduled: unknown;
  private active = false;
  private started = false;
  private disconnected = false;

  constructor(private readonly options: SeatLayerRendererHandshakeLeaseOptions) {}

  setup(): void {
    this.active = true;
    this.cancelScheduled();
    this.scheduled = this.options.schedule(() => {
      this.scheduled = undefined;
      if (!this.active || this.started) return;
      this.started = true;
      let flight: Promise<ReadyInfo>;
      try {
        flight = Promise.resolve(this.options.begin());
      } catch (error) {
        if (this.active) this.notify(this.options.onLoadError, error);
        return;
      }
      void flight.then(
        (info) => {
          if (this.active) this.notify(this.options.onReady, info);
        },
        (error: unknown) => {
          if (this.active) this.notify(this.options.onLoadError, error);
        },
      );
    });
  }

  cleanup(): void {
    this.active = false;
    this.cancelScheduled();
    if (!this.disconnected) {
      this.disconnected = true;
      this.options.disconnect();
    }
  }

  private cancelScheduled(): void {
    if (this.scheduled === undefined) return;
    this.options.cancel(this.scheduled);
    this.scheduled = undefined;
  }

  private notify<Argument>(
    callback: (argument: Argument) => void,
    argument: Argument,
  ): void {
    try {
      const result = callback(argument) as unknown;
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Host callbacks cannot reject a renderer-owned promise chain.
    }
  }
}
