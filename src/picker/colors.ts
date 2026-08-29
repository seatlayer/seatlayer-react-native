/** React Native host colours: #RGB, #RGBA, #RRGGBB or #RRGGBBAA. */
export type SeatLayerPickerRgba = Readonly<{
  red: number;
  green: number;
  blue: number;
  alpha: number;
}>;

export function parseSeatLayerPickerColor(value: unknown): SeatLayerPickerRgba | undefined {
  if (typeof value !== 'string') return undefined;
  const source = value.trim();
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i.exec(source);
  if (rgb) {
    const channel = (input: string): number | undefined => {
      const parsed = Number(input);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 255 ? parsed : undefined;
    };
    const red = channel(rgb[1]!);
    const green = channel(rgb[2]!);
    const blue = channel(rgb[3]!);
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (red === undefined || green === undefined || blue === undefined ||
      !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return undefined;
    return Object.freeze({ red, green, blue, alpha });
  }
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(source);
  if (match?.[1] === undefined) return undefined;
  const hex = match[1];
  const expanded = hex.length < 5 ? [...hex].map((part) => part + part).join('') : hex;
  const read = (start: number) => Number.parseInt(expanded.slice(start, start + 2), 16);
  return Object.freeze({
    alpha: expanded.length === 8 ? read(6) / 255 : 1,
    red: read(0),
    green: read(2),
    blue: read(4),
  });
}

function opacity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

export function seatLayerPickerColorAlpha(color: unknown, value: number): string {
  const parsed = parseSeatLayerPickerColor(color);
  // A host string such as a named CSS colour is safe at full opacity, but
  // cannot be reliably composed by React Native. Never return it opaque when
  // an alpha overlay was requested.
  if (!parsed) {
    return opacity(value) === 1 && typeof color === 'string' && color.trim()
      ? color.trim()
      : 'rgba(0, 0, 0, 0)';
  }
  return `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${parsed.alpha * opacity(value)})`;
}

export function pickerColor(color: unknown, fallback: string, value = 1): string {
  const parsed = parseSeatLayerPickerColor(color);
  if (!parsed && opacity(value) === 1 && typeof color === 'string' && color.trim()) {
    return color.trim();
  }
  const resolved = parsed ?? parseSeatLayerPickerColor(fallback);
  return resolved
    ? `rgba(${resolved.red}, ${resolved.green}, ${resolved.blue}, ${resolved.alpha * opacity(value)})`
    : fallback;
}

export function blendSeatLayerPickerColor(
  foreground: unknown, background: unknown, value: number, fallback: string,
): string {
  const back = parseSeatLayerPickerColor(background) ?? parseSeatLayerPickerColor(fallback);
  const front = parseSeatLayerPickerColor(foreground);
  if (!back || !front) return fallback;
  const alpha = front.alpha * opacity(value);
  const blend = (from: number, to: number) => Math.round(from * alpha + to * (1 - alpha));
  return `rgb(${blend(front.red, back.red)}, ${blend(front.green, back.green)}, ${blend(front.blue, back.blue)})`;
}
