import { seatLayerPickerTokens } from './tokens.g';

type SeatLayerPickerGeneratedSize = typeof seatLayerPickerTokens.size;

/** Immutable standalone-picker geometry generated from the canonical size tokens. */
export type SeatLayerPickerLayout = Readonly<{
  [Key in keyof SeatLayerPickerGeneratedSize]: number;
}>;

export type SeatLayerPickerLayoutOverrides = Partial<SeatLayerPickerLayout>;

export const seatLayerPickerDefaultLayout: SeatLayerPickerLayout = Object.freeze({
  ...seatLayerPickerTokens.size,
});

const seatLayerPickerLayoutKeys = new Set<string>(Object.keys(seatLayerPickerDefaultLayout));

function isSeatLayerPickerLayoutKey(value: string): value is keyof SeatLayerPickerLayout {
  return seatLayerPickerLayoutKeys.has(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidLayoutValue(
  key: keyof SeatLayerPickerLayout,
  value: unknown,
): value is number {
  if (!isFiniteNonNegativeNumber(value) || value > 4096) return false;
  if (key === 'sheetMaxHeightFraction') return value > 0 && value <= 1;
  if (key === 'minimumHitTarget') return value >= 44;
  return true;
}

/** Reads only an enumerable own data property, without invoking a getter. */
function ownDataValue(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    // A Proxy is an untrusted runtime boundary. Its trap must not break layout.
    return undefined;
  }
}

function applyLayoutOverrides(
  layout: { -readonly [Key in keyof SeatLayerPickerLayout]: number },
  overrides: unknown,
): void {
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) return;
  for (const key of seatLayerPickerLayoutKeys) {
    if (!isSeatLayerPickerLayoutKey(key)) continue;
    const value = ownDataValue(overrides, key);
    if (isValidLayoutValue(key, value)) layout[key] = value;
  }
}

/** Resolves ordered layout layers from lowest to highest priority. */
export function resolveSeatLayerPickerLayoutLayers(
  layers: ReadonlyArray<unknown>,
): SeatLayerPickerLayout {
  const layout: { -readonly [Key in keyof SeatLayerPickerLayout]: number } = {
    ...seatLayerPickerDefaultLayout,
  };
  for (const layer of layers) applyLayoutOverrides(layout, layer);
  return Object.freeze(layout);
}

/**
 * Applies valid supplied geometry while preserving every generated default.
 * This boundary receives JavaScript values at runtime, so invalid values must
 * never leak into native sizing even when TypeScript callers are well typed.
 */
export function resolveSeatLayerPickerLayout(
  overrides: SeatLayerPickerLayoutOverrides | unknown = {},
): SeatLayerPickerLayout {
  return resolveSeatLayerPickerLayoutLayers([overrides]);
}
