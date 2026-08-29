import { SeatLayerPickerScopeSession } from './scopeSession';
import { SeatLayerPickerController } from './controller';
import { SeatLayerError } from '../errors';
import { sanitizeSeatLayerPickerBridgeConfig } from '../bridge/profile';
import type { JsonObject } from '../json';
import type { SeatLayerConfiguration } from '../types';
import { freezeSeatLayerPickerConfiguration } from './scopeConfiguration';

/** Validates and snapshots an input before it can replace a working session. */
export function prepareSeatLayerPickerScopeConfiguration(
  configuration: SeatLayerConfiguration,
  reportError: (error: unknown) => void,
): SeatLayerConfiguration | undefined {
  try {
    return freezeSeatLayerPickerConfiguration(configuration);
  } catch (error) {
    reportError(
      error instanceof SeatLayerError
        ? error
        : new SeatLayerError(
          'bad_payload',
          'SeatLayer picker configuration is invalid.',
          { cause: error },
        ),
    );
    return undefined;
  }
}

export interface SeatLayerPickerScopeInputs {
  readonly configuration: SeatLayerConfiguration;
  readonly bridgeConfig: JsonObject;
  readonly readOnly: boolean;
}

function validateController(
  controller: unknown,
): asserts controller is SeatLayerPickerController | undefined {
  if (controller !== undefined && !(controller instanceof SeatLayerPickerController)) {
    throw new SeatLayerError('bad_payload', 'SeatLayer picker controller is invalid.');
  }
}

/**
 * Validates every init-only input before a working controller can be retired.
 * A rejected candidate deliberately leaves the active chart by identity.
 */
export function prepareSeatLayerPickerScopeInputs(
  configuration: SeatLayerConfiguration,
  bridgeConfig: unknown,
  readOnly: unknown,
  controller: unknown,
  reportError: (error: unknown) => void,
): SeatLayerPickerScopeInputs | undefined {
  const safeConfiguration = prepareSeatLayerPickerScopeConfiguration(
    configuration,
    reportError,
  );
  if (safeConfiguration === undefined) return undefined;
  try {
    validateController(controller);
    if (typeof readOnly !== 'boolean') {
      throw new SeatLayerError('bad_payload', 'SeatLayer picker readOnly must be a boolean.');
    }
    return Object.freeze({
      configuration: safeConfiguration,
      bridgeConfig: sanitizeSeatLayerPickerBridgeConfig(bridgeConfig),
      readOnly,
    });
  } catch (error) {
    reportError(
      error instanceof SeatLayerError
        ? error
        : new SeatLayerError('bad_payload', 'SeatLayer picker boot inputs are invalid.', { cause: error }),
    );
    return undefined;
  }
}

/** Contains a replacement-lock error without disturbing the working session. */
export function replaceSeatLayerPickerScopeSession(
  session: SeatLayerPickerScopeSession,
  controller: SeatLayerPickerController | undefined,
  reportError: (error: unknown) => void,
): boolean {
  try {
    session.replace(controller);
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
