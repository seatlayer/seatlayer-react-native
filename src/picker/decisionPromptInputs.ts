export interface SeatLayerPickerDecisionPromptInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export type SeatLayerPickerDecisionPromptInsetInput = Partial<SeatLayerPickerDecisionPromptInsets>;

export function seatLayerPickerDecisionOwnData(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function inset(value: unknown): number {
  const number = finite(value);
  return number === undefined ? 0 : Math.max(0, number);
}
/** Safe-area geometry accepts finite nonnegative device values without a visual cap. */
export function normalizeSeatLayerPickerDecisionPromptInsets(
  value: SeatLayerPickerDecisionPromptInsetInput | unknown,
): SeatLayerPickerDecisionPromptInsets {
  return Object.freeze({
    top: inset(seatLayerPickerDecisionOwnData(value, 'top')),
    right: inset(seatLayerPickerDecisionOwnData(value, 'right')),
    bottom: inset(seatLayerPickerDecisionOwnData(value, 'bottom')),
    left: inset(seatLayerPickerDecisionOwnData(value, 'left')),
  });
}
