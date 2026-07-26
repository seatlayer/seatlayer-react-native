import { asArray, asBoolean, asObject, asString } from './json';
import type { BridgeErrorDetails, HoldConflict } from './types';

export class SeatLayerError extends Error {
  readonly code: string;
  readonly retryable: boolean | undefined;
  readonly conflicts: HoldConflict[] | undefined;
  readonly details: BridgeErrorDetails | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      conflicts?: HoldConflict[];
      details?: BridgeErrorDetails;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = 'SeatLayerError';
    this.code = code;
    this.retryable = options.retryable;
    this.conflicts = options.conflicts;
    this.details = options.details;
  }

  static bridge(payload: unknown): SeatLayerError {
    const details = decodeBridgeError(payload);
    return new SeatLayerError(details.code, details.message, {
      retryable: details.retryable,
      conflicts: details.conflicts,
      details,
    });
  }

  static timeout(command: string, timeoutMs: number): SeatLayerError {
    return new SeatLayerError(
      'sl_timeout',
      `SeatLayer command "${command}" did not reply within ${timeoutMs}ms.`,
      { retryable: true },
    );
  }

  static transport(message: string, cause?: unknown): SeatLayerError {
    return new SeatLayerError('sl_transport', message, { retryable: true, cause });
  }

  static incompatible(message: string): SeatLayerError {
    return new SeatLayerError('sl_incompatible', message);
  }

  static destroyed(): SeatLayerError {
    return new SeatLayerError('destroyed', 'The SeatLayer controller was destroyed.');
  }
}

export function decodeBridgeError(payload: unknown): BridgeErrorDetails {
  const object = asObject(payload) ?? {};
  const bridgeDetails = asObject(object.details);
  const conflicts = asArray(bridgeDetails?.conflicts ?? object.conflicts)
    .map((item): HoldConflict | undefined => {
      const conflict = asObject(item);
      if (!conflict) return undefined;
      const label = asString(conflict.label);
      const status = asString(conflict.status);
      return label === undefined && status === undefined ? undefined : { label, status };
    })
    .filter((item): item is HoldConflict => item !== undefined);

  const metaObject = asObject(object.meta) ?? bridgeDetails;
  return {
    code: asString(object.code) ?? asString(bridgeDetails?.reason) ?? 'unknown',
    message: asString(object.message) ?? 'SeatLayer reported an unknown error.',
    retryable: asBoolean(object.retryable),
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    meta: metaObject as BridgeErrorDetails['meta'],
  };
}
