import { describe, expect, it } from 'vitest';

import {
  resolveSeatLayerPickerModalPresentation,
  seatLayerPickerModalDialogBreakpoint,
  seatLayerPickerModalMaximumHeight,
  seatLayerPickerModalMaximumWidth,
  seatLayerPickerModalOrientations,
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
    expect(resolveSeatLayerPickerModalPresentation('adaptive', 699, 900)).toBe('fullScreen');
    expect(resolveSeatLayerPickerModalPresentation('adaptive', 700, 900)).toBe('dialog');
  });

  it('keeps explicit presentation choices pinned', () => {
    expect(resolveSeatLayerPickerModalPresentation('dialog', 0, 0)).toBe('dialog');
    expect(resolveSeatLayerPickerModalPresentation('fullScreen', 9_999, 9_999)).toBe('fullScreen');
  });

  it('is full screen on a phone however it is held', () => {
    for (const [long, short] of [[667, 375], [844, 390], [932, 430], [915, 412]] as const) {
      expect(resolveSeatLayerPickerModalPresentation(undefined, short, long)).toBe('fullScreen');
      expect(resolveSeatLayerPickerModalPresentation(undefined, long, short)).toBe('fullScreen');
    }
    expect(resolveSeatLayerPickerModalPresentation(undefined, 1180, 820)).toBe('dialog');
    expect(resolveSeatLayerPickerModalPresentation(undefined, 820, 1180)).toBe('dialog');
  });

  it('leaves at least one way to be held to every app', () => {
    // An app's own list with none of the modal's ways in it stops on iOS.
    const apps = {
      portraitOnly: ['portrait'],
      landscapeOnly: ['landscape-left', 'landscape-right'],
      oneSide: ['landscape-right'],
      all: ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'],
    };
    for (const [app, ways] of Object.entries(apps)) {
      expect(ways.filter((way) => seatLayerPickerModalOrientations.includes(way as never)), app).toEqual(ways);
    }
  });
});
