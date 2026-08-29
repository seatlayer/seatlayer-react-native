export type SeatLayerPickerModalPresentation = 'adaptive' | 'fullScreen' | 'dialog';

/** Modal geometry is kept local until design tokens own it. */
export const seatLayerPickerModalPresentationInset = 24;
export const seatLayerPickerModalMaximumWidth = 1180;
export const seatLayerPickerModalMaximumHeight = 820;
export const seatLayerPickerModalDialogBreakpoint = 700;

export function resolveSeatLayerPickerModalPresentation(
  requested: SeatLayerPickerModalPresentation | undefined,
  width: unknown,
): 'fullScreen' | 'dialog' {
  if (requested === 'fullScreen' || requested === 'dialog') return requested;
  return typeof width === 'number' && Number.isFinite(width) && width >= seatLayerPickerModalDialogBreakpoint
    ? 'dialog'
    : 'fullScreen';
}
