import type { JsonObject } from '../json';
import { SeatLayerError } from '../errors';
import type { ProtocolRange } from '../types';
import { chartProtocolRange, pickerProtocolRange } from './protocol';

export type BridgeSurface = 'chart' | 'picker';

export interface BridgeProfile {
  readonly surface: BridgeSurface;
  readonly protocolRange: ProtocolRange;
  readonly requiredCapabilities: readonly string[];
  readonly requiredCommands: readonly string[];
  readonly requiredEvents: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly config?: JsonObject;
}

export const chartBridgeProfile: BridgeProfile = {
  surface: 'chart',
  protocolRange: chartProtocolRange,
  requiredCapabilities: Object.freeze([]),
  requiredCommands: Object.freeze([]),
  requiredEvents: Object.freeze([]),
  optionalCapabilities: Object.freeze([]),
};

const pickerRequiredCapabilities = [
  'picker-session-v2',
  'picker-snapshot-v1',
  'picker-actions-v1',
  'native-picker-chrome-v1',
  'checkout-handoff-v1',
  'checkout-handoff-reject-v1',
  'hold-ownership-v1',
  'cart-line-remove-v1',
  'table-quantity-v1',
] as const;

export interface PickerBridgeProfileOptions {
  config?: JsonObject;
}

const pickerReservedConfigKeys = new Set([
  'event',
  'apiBase',
  'publicKey',
  'buyerAccessToken',
  'nativeAccessProvider',
]);

function badConfig(message: string, cause?: unknown): SeatLayerError {
  return new SeatLayerError('bad_payload', message, cause === undefined ? undefined : { cause });
}

function freezeConfig<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) freezeConfig(child);
    Object.freeze(value);
  }
  return value;
}

function cloneConfigValue(
  value: unknown,
  seen: Set<object>,
  topLevel = false,
): JsonObject | readonly unknown[] | string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw badConfig('SeatLayer picker bridge config must not contain non-finite numbers.');
  }
  if (!value || typeof value !== 'object') {
    throw badConfig('SeatLayer picker bridge config must contain JSON values.');
  }
  if (seen.has(value)) throw badConfig('SeatLayer picker bridge config must not contain cycles.');
  if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) {
    throw badConfig('SeatLayer picker bridge config must contain plain arrays only.');
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw badConfig('SeatLayer picker bridge config must contain plain objects only.');
  }
  seen.add(value);
  try {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw badConfig('SeatLayer picker bridge config cannot contain symbol keys.');
    }
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          throw badConfig('SeatLayer picker bridge config arrays cannot contain holes or accessors.');
        }
        output.push(cloneConfigValue(descriptor.value, seen));
      }
      if (Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key))) {
        throw badConfig('SeatLayer picker bridge config arrays cannot contain named properties.');
      }
      return output;
    }
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (topLevel && pickerReservedConfigKeys.has(key)) {
        throw badConfig(`SeatLayer picker bridge config cannot set reserved key "${key}".`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw badConfig('SeatLayer picker bridge config cannot contain accessors.');
      }
      Object.defineProperty(output, key, {
        value: cloneConfigValue(descriptor.value, seen),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output as JsonObject;
  } finally {
    seen.delete(value);
  }
}

/** Validates, clones and deeply freezes externally supplied picker init config. */
export function sanitizeSeatLayerPickerBridgeConfig(value: unknown): JsonObject {
  try {
    if (value === undefined) return freezeConfig({});
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw badConfig('SeatLayer picker bridge config must be an object.');
    }
    return freezeConfig(cloneConfigValue(value, new Set<object>(), true) as JsonObject);
  } catch (error) {
    if (error instanceof SeatLayerError) throw error;
    throw badConfig('SeatLayer picker bridge config is invalid.', error);
  }
}

function clonePickerConfig(options: unknown): JsonObject {
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
    throw badConfig('SeatLayer picker bridge options must be an object.');
  }
  const candidate = (options as { config?: unknown } | undefined)?.config;
  return sanitizeSeatLayerPickerBridgeConfig(candidate);
}

/**
 * The v2 picker contract is intentionally exact. Newer capabilities and
 * commands remain optional so an old native host does not guess semantics.
 */
export function pickerBridgeProfile(
  options: PickerBridgeProfileOptions = {},
): BridgeProfile {
  const config = clonePickerConfig(options);
  const requiredCommands = [
    'picker.getSnapshot',
    'picker.selectObjects',
    'picker.deselectObjects',
    'picker.clearSelection',
    'picker.selectCategories',
    'picker.deselectCategories',
    'picker.setSeatTier',
    'picker.removeCartLine',
    'picker.setTableQuantity',
    'picker.setSelectableObjects',
    'picker.setMaxSelection',
    'picker.setCategoryFilter',
    'picker.setAccessibilityFilter',
    'picker.setLimitedViewFilter',
    'picker.focusSection',
    'picker.overview',
    'picker.setRung',
    'picker.setFloor',
    'picker.setColorblindSafe',
    'picker.setThemeMode',
    'picker.setViewMode',
    'picker.setInteractionEnabled',
    'picker.zoomIn',
    'picker.zoomOut',
    'picker.zoomToFit',
    'picker.holdGA',
    'picker.bestAvailable',
    'picker.resumeHold',
    'picker.extendHold',
    'picker.continue',
    'picker.rejectHandoff',
    'picker.abort',
    'picker.lifecycle',
    'picker.destroy',
    ...(config.enable3D === false
      ? []
      : ['picker.setBuyerView', 'picker.setVenue3DNavigationMode']),
    ...(config.enableSeatView === false ? [] : ['picker.openSeatView']),
  ];
  return freezeConfig({
    surface: 'picker',
    protocolRange: pickerProtocolRange,
    requiredCapabilities: [
      ...pickerRequiredCapabilities,
      ...(config.enable3D === false
        ? []
        : ['venue-3d-v1', 'venue-3d-controls-v1']),
      ...(config.enableSeatView === false ? [] : ['seat-view-v1']),
    ],
    requiredCommands: Object.freeze(requiredCommands),
    requiredEvents: Object.freeze(['picker.snapshot']),
    optionalCapabilities: [
      'native-chrome-contract-v1',
      'native-seat-view-chrome-v1',
      'viewport-insets-v1',
      'floor-stack-v1',
      'chart-load-trace-v1',
      'availability-refresh-v1',
      'access-needs-v1',
      'hold-selection-v1',
    ],
    ...(options && typeof options === 'object' && 'config' in options
      ? { config }
      : {}),
  }) as BridgeProfile;
}
