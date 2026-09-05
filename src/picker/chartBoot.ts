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

/* --- 4.7 Prewarm, adopt-after-layout, reveal-after-framing ---------------- */
//
// Three separate things, in this order. Prewarm lives in `prewarm.ts`; the
// other two are decisions about when the picker may mount and when it may show
// what it mounted, and they are pure so every platform can hold the same rule.

/**
 * How long the map may be held back waiting to be framed.
 *
 * The insets normally settle on the frame after the first snapshot. This is the
 * backstop for a runtime that never answers: a buyer must never be left on a
 * loading screen by a refinement.
 */
export const seatLayerPickerRevealGraceMs = 700;

/**
 * Adopt after layout. Claiming a warm page before the picker has a size answers
 * the runtime's hello with an init at zero size, so the chart paints small and
 * then re-fits in front of the buyer.
 */
export function seatLayerPickerCanAdoptRuntime(
  size: Readonly<{ width: number; height: number }> | undefined,
): boolean {
  if (size === undefined) return false;
  const { width, height } = size;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

export interface SeatLayerPickerRevealState {
  /** The runtime has answered and the picker is callable. */
  readonly ready: boolean;
  /**
   * The runtime has framed the map inside the chrome standing on it — true from
   * the first viewport-inset report that lands after the picker is ready.
   * Presentation only: nothing waits on it, and the picker is fully callable
   * while it is still false.
   */
  readonly framed: boolean;
  /** The backstop ran out. One way, until the runtime is reloaded. */
  readonly lapsed: boolean;
}

export type SeatLayerPickerRevealEvent =
  | 'ready'
  | 'insetsReported'
  | 'graceLapsed'
  | 'reset';

export const seatLayerPickerInitialRevealState: SeatLayerPickerRevealState =
  Object.freeze({ ready: false, framed: false, lapsed: false });

export function reduceSeatLayerPickerReveal(
  state: SeatLayerPickerRevealState,
  event: SeatLayerPickerRevealEvent,
): SeatLayerPickerRevealState {
  if (event === 'reset') return seatLayerPickerInitialRevealState;
  if (event === 'ready') {
    return state.ready ? state : Object.freeze({ ...state, ready: true });
  }
  if (event === 'insetsReported') {
    // Only a report that lands AFTER the runtime is ready says anything about
    // framing: the first snapshot arrives before the renderer has been told
    // what the native chrome covers.
    if (!state.ready || state.framed) return state;
    return Object.freeze({ ...state, framed: true });
  }
  if (!state.ready || state.lapsed) return state;
  return Object.freeze({ ...state, lapsed: true });
}

/** The loading surface stays up until this is true, then fades. */
export function seatLayerPickerRevealed(state: SeatLayerPickerRevealState): boolean {
  return state.ready && (state.framed || state.lapsed);
}

/** True only while the backstop should be running. */
export function seatLayerPickerAwaitingFraming(
  state: SeatLayerPickerRevealState,
): boolean {
  return state.ready && !state.framed && !state.lapsed;
}
