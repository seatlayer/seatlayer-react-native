import { compactObject, type JsonObject } from '../json';
import {
  seatLayerSdkVersion,
  type BundleInfo,
  type SeatLayerConfiguration,
  type SeatLayerSurfaceConfiguration,
} from '../types';
import type { BridgeProfile } from './profile';

/** Who is asking: this SDK, then the app's own non-secret details. */
function host(configuration: SeatLayerSurfaceConfiguration): JsonObject {
  return {
    platform: 'react-native',
    sdk: seatLayerSdkVersion,
    ...(configuration.hostInfo ?? {}),
  };
}

function protocol(profile: BridgeProfile): JsonObject {
  return { min: profile.protocolRange.min, max: profile.protocolRange.max };
}

/** The fields every page shares. A token is sent as its value and expiry only. */
function sharedConfig(configuration: SeatLayerSurfaceConfiguration): JsonObject {
  return compactObject({
    apiBase: configuration.apiBase,
    publicKey: configuration.publicKey,
    buyerAccessToken: configuration.buyerAccessToken === undefined
      ? undefined
      : compactObject({
          token: configuration.buyerAccessToken.token,
          expiresAt: configuration.buyerAccessToken.expiresAt,
        }),
    nativeAccessProvider: configuration.buyerAccessTokenProvider === undefined ? undefined : true,
  });
}

/** The event's `init`, for the raw chart or the native-chrome picker. */
export function seatLayerEventInit(
  configuration: SeatLayerConfiguration,
  profile: BridgeProfile,
  info: BundleInfo,
): JsonObject {
  const config = compactObject({
    event: configuration.event,
    ...sharedConfig(configuration),
    maxSelection: configuration.maxSelection,
    selectedObjects: configuration.selectedObjects,
    selectableObjects: configuration.selectableObjects,
    numberOfPlacesToSelect: configuration.numberOfPlacesToSelect,
    selectionValidators: configuration.selectionValidators,
    locale: configuration.locale,
    messages: configuration.messages,
    currency: configuration.currency,
    colorblindSafe: configuration.colorblindSafe,
    initialView: configuration.initialView,
    telemetry: configuration.telemetry,
  });
  const picker = profile.surface === 'picker';
  return {
    protocol: protocol(profile),
    host: host(configuration),
    chrome: picker
      ? {
          owner: 'native', seatTooltip: false, testModeIndicator: false, attribution: false,
          ...(info.capabilities.includes('native-seat-view-chrome-v1')
            && info.events.includes('seatView.changed')
            ? { seatViewTitle: false, seatViewCaption: false, seatViewBadge: false }
            : {}),
        }
      : { seatTooltip: configuration.showsWebSeatTooltip ?? false },
    config: picker ? { ...config, ...(profile.config ?? {}) } : config,
    ...(picker ? {
      surface: { kind: 'picker', stateContract: 1, chromeOwner: 'native' },
      requirements: { capabilities: [...profile.requiredCapabilities] },
    } : {}),
  };
}

/**
 * The `init` of a page of its own (the Season page, the run page): the shared
 * fields from `configuration`, then the page's own from its profile. A null
 * there leaves a field out.
 */
export function seatLayerPageInit(
  configuration: SeatLayerSurfaceConfiguration,
  profile: BridgeProfile,
): JsonObject {
  const config: JsonObject = {
    ...sharedConfig(configuration),
    ...compactObject({
      locale: configuration.locale,
      colorblindSafe: configuration.colorblindSafe,
    }),
    ...(profile.config ?? {}),
  };
  for (const key of Object.keys(config)) if (config[key] === null) delete config[key];
  return {
    protocol: protocol(profile),
    host: host(configuration),
    surface: { kind: profile.surface },
    config,
  };
}
