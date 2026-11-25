import type { ModalProps } from 'react-native';

import { seatLayerPickerTabletShortestSide } from './options';

export type SeatLayerPickerModalPresentation = 'adaptive' | 'fullScreen' | 'dialog';

/** Modal geometry is kept local until design tokens own it. */
export const seatLayerPickerModalPresentationInset = 24;
export const seatLayerPickerModalMaximumWidth = 1180;
export const seatLayerPickerModalMaximumHeight = 820;
export const seatLayerPickerModalDialogBreakpoint = 700;

/**
 * Every way a phone can be held. iOS stands a modal upright on a phone unless
 * told otherwise; the app's own list still decides which of these it may take.
 */
export const seatLayerPickerModalOrientations: NonNullable<ModalProps['supportedOrientations']> = [
  'portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right',
];

/** A phone is full screen however it is held; a dialog needs a tablet's room. */
export function resolveSeatLayerPickerModalPresentation(
  requested: SeatLayerPickerModalPresentation | undefined,
  width: unknown,
  height: unknown,
): 'fullScreen' | 'dialog' {
  if (requested === 'fullScreen' || requested === 'dialog') return requested;
  return atLeast(width, seatLayerPickerModalDialogBreakpoint)
    && atLeast(height, seatLayerPickerTabletShortestSide)
    ? 'dialog'
    : 'fullScreen';
}

function atLeast(value: unknown, least: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= least;
}
