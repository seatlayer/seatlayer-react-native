import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
  type SeatLayerPickerSafeAreaInsets,
} from './safeAreaInsets';

export interface SeatLayerPickerAdaptiveMeasuredBounds {
  readonly width: number;
  readonly height: number;
}

export interface SeatLayerPickerAdaptiveSafeLayout {
  readonly insets: Readonly<SeatLayerPickerSafeAreaInsets>;
  readonly usableWidth: number | undefined;
}

/** Resolves adaptive breakpoints from the parent space left after safe edges. */
export function resolveSeatLayerPickerAdaptiveSafeLayout(
  bounds: SeatLayerPickerAdaptiveMeasuredBounds | undefined,
  input: SeatLayerPickerSafeAreaInsetInput | unknown,
): Readonly<SeatLayerPickerAdaptiveSafeLayout> {
  const insets = normalizeSeatLayerPickerSafeAreaInsets(input, bounds);
  const usableWidth = bounds === undefined ? undefined : Math.max(0, bounds.width - insets.left - insets.right);
  return Object.freeze({ insets, usableWidth });
}
