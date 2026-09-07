/**
 * One point of line, everywhere the picker draws one.
 *
 * The reference has no hairline: every border it paints is a Flutter
 * `BorderSide` at its default width of 1.0, and it draws them at that width on
 * a 3x screen as much as on a 1x one. React Native's `StyleSheet.hairlineWidth`
 * is a THIRD of a point there, so the same divider came out a third as dark and
 * a third as wide — measured on the reference's cart row, its sheet head and
 * the seat card's identity grid, all of which sample a full point of `divider`
 * against RN's 0.33.
 *
 * A host that wants the platform's thinnest line still has it: the picker's
 * style slots take a `borderWidth` of their own.
 */
export const seatLayerPickerLineWidth = 1;
