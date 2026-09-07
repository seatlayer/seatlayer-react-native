import type { TextStyle } from 'react-native';

/**
 * The nearest weight React Native can actually paint.
 *
 * `design/tokens.json` states weights off the hundred — `type.peekFromPrice`
 * at 850 and `type.noteTitleCompact` at 750 — because the design data describes
 * a variable face. React Native only understands the nine hundreds, and a string
 * it does not understand is not an error: it silently paints the regular
 * weight, which is how the peek bar's from-price lost its emphasis entirely.
 * A tie rounds down, which is the weight the reference implementation picks for
 * both of them (w800 and w700).
 */
export function seatLayerPickerFontWeight(weight: number): TextStyle['fontWeight'] {
  if (!Number.isFinite(weight)) return '400';
  const step = Math.ceil(weight / 100 - 0.5);
  const clamped = Math.min(9, Math.max(1, step));
  return String(clamped * 100) as TextStyle['fontWeight'];
}
