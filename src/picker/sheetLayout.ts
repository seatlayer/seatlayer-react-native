import { seatLayerPickerDefaultLayout, type SeatLayerPickerLayout } from './layout';

/**
 * The layout a chrome surface draws on.
 *
 * A resolved theme always carries one; a bare theme object handed in by a host
 * — or by a test — may not, and the generated defaults are the honest answer
 * there rather than a crash inside a measurement.
 */
export function seatLayerPickerSheetLayout(
  theme: Readonly<{ layout?: Partial<SeatLayerPickerLayout> }> | undefined,
): SeatLayerPickerLayout {
  const layout = theme?.layout;
  if (layout === undefined || layout === null) return seatLayerPickerDefaultLayout;
  return layout as SeatLayerPickerLayout;
}
