import { pageBridgeProfile, type BridgeProfile } from '../bridge/profile';
import { SeatLayerError } from '../errors';
import { compactObject, type JsonObject } from '../json';
import {
  seatLayerHostedWebVersion,
  seatLayerMobileOrigin,
  type SeatLayerSurfaceConfiguration,
} from '../types';
import type { SeatLayerRunSelectionMode } from './models';

/** The run page of the map version this release is pinned to. */
export const seatLayerRunPageUrl =
  `${seatLayerMobileOrigin}/seatlayer-js@${seatLayerHostedWebVersion}/group.html`;

/**
 * Everything needed to open a run: a few performances sold to one buyer as one
 * hold, with your app's own checkout. Field names are the web
 * `PerformanceGroupPicker` option names.
 */
export interface SeatLayerRunConfiguration extends Omit<SeatLayerSurfaceConfiguration, 'publicKey'> {
  /** Run key, for example `pg_...`. Required. */
  readonly run: string;
  /** The same seat for every performance (the default) or a choice per performance. */
  readonly selectionMode?: SeatLayerRunSelectionMode;
  /** Shows the page's own switch between the two modes. */
  readonly allowSelectionModeSwitch?: boolean;
  /** How many places the buyer picks. Required with per-performance selection or the switch. */
  readonly numberOfPlacesToSelect?: number;
  /** Most seats the buyer may hold at once. */
  readonly maxSelection?: number;
  /**
   * A hold this buyer already has: both or neither. Only the buyer who placed
   * the hold gets it back: pass that buyer's token too. Without one, a hold
   * cannot be opened again once the app or the page has ended.
   */
  readonly initialHoldId?: string;
  /** The `pghop_` operation id of `initialHoldId`. */
  readonly initialOperationId?: string;
  /** Whether the 3D venue is offered. Omitted keeps the web default. */
  readonly enable3D?: boolean;
}

/** The capabilities a run page must name. */
export const seatLayerRunCapabilities = Object.freeze(['group-surface-v1', 'group-app-shell-v1']);

function atLeastOne(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1);
}

/** Why `configuration` cannot open a run, or undefined. */
export function seatLayerRunConfigurationProblem(
  configuration: SeatLayerRunConfiguration,
): SeatLayerError | undefined {
  const bad = (message: string) => new SeatLayerError('bad_payload', message);
  if (typeof configuration?.run !== 'string' || !configuration.run.trim()) {
    return bad('SeatLayer configuration.run is required.');
  }
  if (!atLeastOne(configuration.maxSelection)) {
    return bad('SeatLayer configuration.maxSelection must be at least 1.');
  }
  if (!atLeastOne(configuration.numberOfPlacesToSelect)) {
    return bad('SeatLayer configuration.numberOfPlacesToSelect must be at least 1.');
  }
  // The page refuses both with bad_payload and opens nothing.
  if ((configuration.selectionMode === 'per_performance' || configuration.allowSelectionModeSwitch === true) &&
    configuration.numberOfPlacesToSelect === undefined) {
    return bad('SeatLayer configuration.numberOfPlacesToSelect is required with per-performance selection or the switch.');
  }
  if ((configuration.initialHoldId === undefined) !== (configuration.initialOperationId === undefined)) {
    return bad('SeatLayer configuration.initialHoldId and initialOperationId come both or neither.');
  }
  const token = configuration.buyerAccessToken;
  if (token !== undefined && (!token.token?.trim() ||
    (token.expiresAt !== undefined && !Number.isFinite(token.expiresAt)))) {
    return bad('SeatLayer configuration.buyerAccessToken is invalid.');
  }
  return undefined;
}

/** How a run page boots: the side it is painted on, and the hold it opens on. */
export interface SeatLayerRunBoot {
  readonly theme?: 'light' | 'dark';
  /**
   * A page that takes another's place opens on this hold, not on the one the
   * configuration names, which may be gone. Null: on none.
   */
  readonly resumed?: { readonly holdId: string; readonly operationId: string } | null;
}

/** The run page's profile: its capabilities and its own `init.config`. */
export function seatLayerRunProfile(
  configuration: SeatLayerRunConfiguration,
  boot: SeatLayerRunBoot = {},
): BridgeProfile {
  const resumed = boot.resumed === undefined
    ? configuration.initialHoldId === undefined || configuration.initialOperationId === undefined
      ? null
      : { holdId: configuration.initialHoldId, operationId: configuration.initialOperationId }
    : boot.resumed;
  const config: JsonObject = {
    ...compactObject({
      performanceGroup: configuration.run,
      selectionMode: configuration.selectionMode,
      allowSelectionModeSwitch: configuration.allowSelectionModeSwitch,
      numberOfPlacesToSelect: configuration.numberOfPlacesToSelect,
      maxSelection: configuration.maxSelection,
      enable3D: configuration.enable3D,
      theme: boot.theme,
    }),
    ...(resumed === null ? {} : { initialHoldId: resumed.holdId, initialOperationId: resumed.operationId }),
    // The app's bar is the only one, with the name, the clock and the ✕;
    // checkout is the app's.
    header: false,
    appBar: true,
    checkout: 'handoff',
  };
  return pageBridgeProfile('group', seatLayerRunCapabilities, config);
}

/**
 * Whether two configurations open the same run the same way, so a new render
 * keeps its page instead of opening another.
 */
export function seatLayerRunConfigurationKey(configuration: SeatLayerRunConfiguration): string {
  return JSON.stringify([
    configuration.run,
    configuration.apiBase,
    configuration.selectionMode,
    configuration.allowSelectionModeSwitch,
    configuration.numberOfPlacesToSelect,
    configuration.maxSelection,
    configuration.buyerAccessToken?.token,
    configuration.buyerAccessToken?.expiresAt,
    // A provider written inline is a new function each render; the page asks
    // through the session, which holds the newest.
    configuration.buyerAccessTokenProvider !== undefined,
    configuration.initialHoldId,
    configuration.initialOperationId,
    configuration.locale,
    configuration.colorblindSafe,
    configuration.enable3D,
    configuration.commandTimeoutMs,
    configuration.handshakeTimeoutMs,
    configuration.hostInfo,
  ]);
}
