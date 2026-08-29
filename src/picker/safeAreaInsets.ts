export interface SeatLayerPickerSafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type SeatLayerPickerSafeAreaInsetInput = Readonly<
  Partial<SeatLayerPickerSafeAreaInsets>
>;

export interface SeatLayerPickerSafeAreaBounds {
  readonly width?: number;
  readonly height?: number;
}

const insetCeiling = 10_000;

/**
 * Safely projects host safe-area measurements for picker layout. Values cross
 * an untyped boundary, so accessors, prototypes, and impossible geometry are
 * ignored before any component consumes them.
 */
export function normalizeSeatLayerPickerSafeAreaInsets(
  input: SeatLayerPickerSafeAreaInsetInput | unknown,
  bounds?: SeatLayerPickerSafeAreaBounds | unknown,
): Readonly<SeatLayerPickerSafeAreaInsets> {
  const rawTop = insetOf(ownData(input, 'top'));
  const rawRight = insetOf(ownData(input, 'right'));
  const rawBottom = insetOf(ownData(input, 'bottom'));
  const rawLeft = insetOf(ownData(input, 'left'));
  const width = dimensionOf(ownData(bounds, 'width'));
  const height = dimensionOf(ownData(bounds, 'height'));
  const left = width === undefined ? rawLeft : Math.min(rawLeft, width);
  const right = width === undefined ? rawRight : Math.min(rawRight, Math.max(0, width - left));
  const top = height === undefined ? rawTop : Math.min(rawTop, height);
  const bottom = height === undefined ? rawBottom : Math.min(rawBottom, Math.max(0, height - top));
  return Object.freeze({ top, right, bottom, left });
}

function ownData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function insetOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, insetCeiling)
    : 0;
}

function dimensionOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, insetCeiling)
    : undefined;
}
