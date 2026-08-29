import { describe, expect, it } from 'vitest';

import {
  resolveSeatLayerPickerModalPresentation,
  seatLayerPickerModalDialogBreakpoint,
  seatLayerPickerModalMaximumHeight,
  seatLayerPickerModalMaximumWidth,
  seatLayerPickerModalPresentationInset,
} from '../src/picker/modalPresentation';

describe('picker modal presentation', () => {
  it('uses dialog geometry and the exact adaptive breakpoint', () => {
    expect({
      inset: seatLayerPickerModalPresentationInset,
      maxWidth: seatLayerPickerModalMaximumWidth,
      maxHeight: seatLayerPickerModalMaximumHeight,
      breakpoint: seatLayerPickerModalDialogBreakpoint,
    }).toEqual({ inset: 24, maxWidth: 1180, maxHeight: 820, breakpoint: 700 });
    expect(resolveSeatLayerPickerModalPresentation('adaptive', 699)).toBe('fullScreen');
    expect(resolveSeatLayerPickerModalPresentation('adaptive', 700)).toBe('dialog');
  });

  it('keeps explicit presentation choices pinned', () => {
    expect(resolveSeatLayerPickerModalPresentation('dialog', 0)).toBe('dialog');
    expect(resolveSeatLayerPickerModalPresentation('fullScreen', 9_999)).toBe('fullScreen');
  });
});
