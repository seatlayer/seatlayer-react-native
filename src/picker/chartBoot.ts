import type { JsonObject } from '../json';
import { SeatLayerError } from '../errors';
import type { SeatLayerConfiguration } from '../types';
import { sanitizeSeatLayerPickerBridgeConfig } from '../bridge/profile';
import { freezeSeatLayerPickerConfiguration } from './scopeConfiguration';

export interface SeatLayerPickerChartBoot {
  readonly configuration: SeatLayerConfiguration;
  readonly bridgeConfig: JsonObject;
}

export type SeatLayerPickerChartBootResult =
  | { readonly boot: SeatLayerPickerChartBoot; readonly error?: undefined }
  | { readonly boot?: undefined; readonly error: SeatLayerError };

/** Immutable init input. Live appearance changes must use the picker command. */
export function createSeatLayerPickerChartBoot(
  configuration: SeatLayerConfiguration,
  bridgeConfig: JsonObject | undefined,
  mapTheme: JsonObject,
  mode: 'light' | 'dark',
  readOnly: boolean,
): SeatLayerPickerChartBoot {
  if (typeof configuration.event !== 'string' || !configuration.event.trim()) {
    throw new SeatLayerError('bad_payload', 'SeatLayer configuration.event is required.');
  }
  if (typeof readOnly !== 'boolean') {
    throw new SeatLayerError('bad_payload', 'SeatLayer picker readOnly must be a boolean.');
  }
  const safeBridgeConfig = sanitizeSeatLayerPickerBridgeConfig(bridgeConfig);
  const safeMapTheme = sanitizeSeatLayerPickerBridgeConfig(mapTheme);
  const merged = sanitizeSeatLayerPickerBridgeConfig({
    ...safeBridgeConfig,
    theme: { mode },
    mapTheme: safeMapTheme,
    readOnly,
  });
  return Object.freeze({
    configuration: freezeSeatLayerPickerConfiguration(configuration),
    bridgeConfig: merged,
  });
}

/** Turns an unsafe boot input into a contained typed scope/load error. */
export function tryCreateSeatLayerPickerChartBoot(
  configuration: SeatLayerConfiguration,
  bridgeConfig: JsonObject | undefined,
  mapTheme: JsonObject,
  mode: 'light' | 'dark',
  readOnly: boolean,
): SeatLayerPickerChartBootResult {
  try {
    return {
      boot: createSeatLayerPickerChartBoot(
        configuration,
        bridgeConfig,
        mapTheme,
        mode,
        readOnly,
      ),
    };
  } catch (error) {
    return {
      error: error instanceof SeatLayerError
        ? error
        : new SeatLayerError(
          'bad_payload',
          'SeatLayer picker chart boot configuration is invalid.',
          { cause: error },
        ),
    };
  }
}
