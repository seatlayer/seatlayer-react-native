import { I18nManager, type TextStyle, type ViewStyle } from 'react-native';

/**
 * For a shape drawn from borders and turned by a transform, and for a thing that
 * stands at a point of the map. In a right-to-left interface the platform swaps
 * `left` with `right` and leaves rotations and points alone: a tick becomes an
 * arrow, the four corners of a frame become brackets, and the light on a seat
 * stands on the other half of the map. Set on the shape's own view, this keeps
 * the sides where they were drawn; a shape that has to point the other way says
 * so with its rotation.
 */
export const seatLayerPickerDrawnShape: ViewStyle = { direction: 'ltr' };

/**
 * Room at the sides of the screen itself, for a camera or a rounded corner. The
 * platform swaps `paddingLeft` with `paddingRight` in a right-to-left interface;
 * the phone's own sides stay where they are.
 */
export function seatLayerPickerScreenSides(
  insets: Readonly<{ left: number; right: number }>, more = 0,
): Readonly<{ paddingLeft: number; paddingRight: number }> {
  return I18nManager.isRTL
    ? { paddingLeft: insets.right + more, paddingRight: insets.left + more }
    : { paddingLeft: insets.left + more, paddingRight: insets.right + more };
}

/**
 * The start of the line in either reading direction: the platform swaps `left`
 * here too. Left to itself, iOS starts every line at the left edge, so in a
 * right-to-left interface a text with room beside it stood on the far side.
 */
export const seatLayerPickerLineStart: Readonly<{ textAlign: 'left' }> = { textAlign: 'left' };

/** Arabic script, its supplements and presentation forms. */
const joined = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * Letters that join up take no spacing between them: spaced, the platform
 * draws the gap through the join. Nothing for any other text.
 */
export function seatLayerPickerJoinedLetters(text: string | undefined): TextStyle | null {
  return text !== undefined && joined.test(text) ? { letterSpacing: 0 } : null;
}
