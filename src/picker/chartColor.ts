import { pickerColor } from './colors';

/**
 * Chart transport colours use the #AARRGGBB wire form. Host/theme
 * colours must never pass through here: React Native's eight-digit form is
 * #RRGGBBAA and is handled by colors.ts.
 */
export function chartSeatLayerPickerColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return pickerColor(value, fallback);
  const source = value.trim();
  const match = /^#([\da-f]{8})$/i.exec(source);
  if (!match?.[1]) return pickerColor(source, fallback);
  const argb = match[1];
  return pickerColor(`#${argb.slice(2)}${argb.slice(0, 2)}`, fallback);
}
