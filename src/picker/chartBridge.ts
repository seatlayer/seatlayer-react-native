import type { BridgeTransport } from '../bridge/client';
import type { SeatLayerError } from '../errors';
import type { JsonObject } from '../json';
import type { ReadyInfo, SeatLayerConfiguration } from '../types';
import type { SeatLayerRendererHandshakeController } from '../rendererHandshake';

export interface SeatLayerPickerChartBridge {
  beginHandshake(
    transport: BridgeTransport,
    configuration: SeatLayerConfiguration,
    options: { config: JsonObject },
  ): Promise<ReadyInfo>;
  readonly mapController: {
    ingestRaw(input: unknown): void;
    failWithTransport(detail: string, cause?: unknown): void;
    disconnect(error?: SeatLayerError, emit?: boolean): void;
  };
}

/** Adapts exactly one picker handshake to the shared renderer surface. */
export function createSeatLayerPickerChartRendererController(
  picker: SeatLayerPickerChartBridge,
  config: JsonObject,
): SeatLayerRendererHandshakeController & {
  ingestRaw(input: unknown): void;
  failWithTransport(detail: string, cause?: unknown): void;
} {
  return {
    beginHandshake: (transport, configuration) =>
      picker.beginHandshake(transport, configuration, { config }),
    ingestRaw: (input) => picker.mapController.ingestRaw(input),
    failWithTransport: (detail, cause) =>
      picker.mapController.failWithTransport(detail, cause),
  };
}

/** Detaches the transport only; borrowed picker ownership remains with its host. */
export function disconnectSeatLayerPickerChartRenderer(
  picker: SeatLayerPickerChartBridge,
): void {
  picker.mapController.disconnect(undefined, false);
}
