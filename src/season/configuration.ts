import { pageBridgeProfile, type BridgeProfile } from '../bridge/profile';
import { SeatLayerError } from '../errors';
import { compactObject, type JsonObject } from '../json';
import type { SeatLayer3DTouchNavigation } from '../picker/options';
import {
  seatLayerHostedWebVersion,
  seatLayerMobileOrigin,
  type SeatLayerSurfaceConfiguration,
} from '../types';

/** The Season page of the map version this release is pinned to. */
export const seatLayerSeasonPageUrl =
  `${seatLayerMobileOrigin}/seatlayer-js@${seatLayerHostedWebVersion}/season.html`;

/**
 * Everything needed to open a Season: a fixed package of dates, sold as the
 * same seat for every date, with your app's own checkout. Field names are the
 * web `SeasonPicker` option names.
 */
export interface SeatLayerSeasonConfiguration extends SeatLayerSurfaceConfiguration {
  /** Season key, for example `sea_...`. Required. */
  readonly season: string;
  /**
   * The package to open on, by its key. Without it, or for a key that is not
   * on sale, the Season opens on its first package. Ignored with a buyer
   * access token, which is bound to one package.
   */
  readonly package?: string;
  /**
   * The price types the buyer may choose per seat (`adult`, `child`, …), for a
   * package priced by type. Absent or `['adult']`: every seat is adult.
   */
  readonly priceTypes?: readonly string[];
  /** Your checkout emails a ticket for every date, so the first step says so. */
  readonly ticketsByEmail?: boolean;
  /** Most seats the buyer may hold at once. */
  readonly maxSelection?: number;
  /**
   * A hold your app already has, by its `sop_` operation id: the page opens on
   * it instead of starting a new one. Only the buyer who placed the hold gets
   * it back: pass that buyer's token too. Without one, a hold cannot be opened
   * again once the app or the page has ended.
   */
  readonly initialOperationId?: string;
  /** Whether the 3D venue is offered. Omitted keeps the web default (on). */
  readonly enable3D?: boolean;
  /** False hides the standing crowd in 3D. */
  readonly enable3DCrowd?: boolean;
  /** How a finger moves the 3D venue. */
  readonly touchNavigation3D?: SeatLayer3DTouchNavigation;
}

/** The capabilities a Season page must name. */
export const seatLayerSeasonCapabilities = Object.freeze(['season-surface-v1', 'season-app-shell-v1']);

/** Why `configuration` cannot open a Season, or undefined. */
export function seatLayerSeasonConfigurationProblem(
  configuration: SeatLayerSeasonConfiguration,
): SeatLayerError | undefined {
  if (typeof configuration?.season !== 'string' || !configuration.season.trim()) {
    return new SeatLayerError('bad_payload', 'SeatLayer configuration.season is required.');
  }
  const max = configuration.maxSelection;
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    return new SeatLayerError('bad_payload', 'SeatLayer configuration.maxSelection must be at least 1.');
  }
  const token = configuration.buyerAccessToken;
  if (token !== undefined && (!token.token?.trim() ||
    (token.expiresAt !== undefined && !Number.isFinite(token.expiresAt)))) {
    return new SeatLayerError('bad_payload', 'SeatLayer configuration.buyerAccessToken is invalid.');
  }
  return undefined;
}

/** How a Season page boots: the side it is painted on, and the hold it opens on. */
export interface SeatLayerSeasonBoot {
  readonly theme?: 'light' | 'dark';
  /**
   * A page that takes another's place opens on this hold, not on the one the
   * configuration names, which may be gone. Null: on none.
   */
  readonly operationId?: string | null;
}

/** The Season page's profile: its capabilities and its own `init.config`. */
export function seatLayerSeasonProfile(
  configuration: SeatLayerSeasonConfiguration,
  boot: SeatLayerSeasonBoot = {},
): BridgeProfile {
  const initialOperationId = boot.operationId === undefined
    ? configuration.initialOperationId
    : boot.operationId;
  const config: JsonObject = {
    ...compactObject({
      season: configuration.season,
      package: configuration.package,
      priceTypes: configuration.priceTypes === undefined ? undefined : [...configuration.priceTypes],
      ticketsByEmail: configuration.ticketsByEmail,
      maxSelection: configuration.maxSelection,
      enable3D: configuration.enable3D,
      enable3DCrowd: configuration.enable3DCrowd,
      touchNavigation3D: configuration.touchNavigation3D,
      theme: boot.theme,
    }),
    ...(initialOperationId == null ? {} : { initialOperationId }),
    // The app's bar is the only one, with the name, the clock and the ✕. A
    // page that does not know `appBar` ignores it and draws its own.
    appBar: true,
  };
  return pageBridgeProfile('season', seatLayerSeasonCapabilities, config);
}

/**
 * Whether two configurations open the same Season the same way, so a new
 * render keeps its page instead of opening another.
 */
export function seatLayerSeasonConfigurationKey(configuration: SeatLayerSeasonConfiguration): string {
  return JSON.stringify([
    configuration.season,
    configuration.apiBase,
    configuration.publicKey,
    configuration.package,
    configuration.priceTypes,
    configuration.ticketsByEmail,
    configuration.maxSelection,
    configuration.buyerAccessToken?.token,
    configuration.buyerAccessToken?.expiresAt,
    // A provider written inline is a new function each render; the page asks
    // through the session, which holds the newest.
    configuration.buyerAccessTokenProvider !== undefined,
    configuration.initialOperationId,
    configuration.locale,
    configuration.colorblindSafe,
    configuration.enable3D,
    configuration.enable3DCrowd,
    configuration.touchNavigation3D,
    configuration.commandTimeoutMs,
    configuration.handshakeTimeoutMs,
    configuration.hostInfo,
  ]);
}
