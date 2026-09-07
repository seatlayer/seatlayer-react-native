import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
  AccessibilityInfo: {
    isBoldTextEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

import {
  seatLayerPickerBold,
  seatLayerPickerBoldFontWeight,
  seatLayerPickerBoldStyles,
  seatLayerPickerBoldTextEnabled,
  setSeatLayerPickerBoldText,
} from '../src/picker/boldText';
import { seatLayerPickerBoldTextStep } from '../src/picker/a11y';

afterEach(() => { setSeatLayerPickerBoldText(false); });

describe('§4.10 every stated weight answers the platform Bold Text switch', () => {
  it('moves a weight by one step of 200, clamped at 900', () => {
    expect(seatLayerPickerBoldTextStep).toBe(200);
    setSeatLayerPickerBoldText(true);
    expect(seatLayerPickerBold(400)).toBe('600');
    expect(seatLayerPickerBold(600)).toBe('800');
    expect(seatLayerPickerBold(700)).toBe('900');
    // Clamped, not wrapped: 800 and 900 both land on the heaviest RN paints.
    expect(seatLayerPickerBold(800)).toBe('900');
    expect(seatLayerPickerBold(900)).toBe('900');
    // A design weight off the hundred is still rounded to one RN can paint.
    expect(seatLayerPickerBold(850)).toBe('900');
    expect(seatLayerPickerBold(650)).toBe('800');
  });

  it('changes NOTHING while the switch is off — the same weights, the same objects', () => {
    expect(seatLayerPickerBoldTextEnabled()).toBe(false);
    expect(seatLayerPickerBold(800)).toBe('800');
    expect(seatLayerPickerBold(650)).toBe('600');
    expect(seatLayerPickerBoldFontWeight('700')).toBe('700');
    expect(seatLayerPickerBoldFontWeight(undefined)).toBeUndefined();
    const sheet = seatLayerPickerBoldStyles({ label: { fontSize: 12, fontWeight: '800' as const } });
    expect(sheet.label).toBe(sheet.label);
    expect(sheet.label.fontWeight).toBe('800');
  });

  it('bolds a sheet read AFTER the flip, though the sheet was frozen at import', () => {
    // This is the whole point: `StyleSheet.create` runs once, at import, long
    // before the platform value is known, so the weight has to be answered on
    // the way out rather than on the way in.
    const sheet = seatLayerPickerBoldStyles({
      label: { fontSize: 12, fontWeight: '800' as const },
      plate: { backgroundColor: '#fff' },
    });
    const resting = sheet.label;
    setSeatLayerPickerBoldText(true);
    expect(sheet.label.fontWeight).toBe('900');
    expect(sheet.label.fontSize).toBe(12);
    // A style that names no weight is handed back untouched, not copied.
    expect(sheet.plate).toBe(sheet.plate);
    // The bolded copy is built once per change of the setting, not per read.
    expect(sheet.label).toBe(sheet.label);
    setSeatLayerPickerBoldText(false);
    expect(sheet.label).toBe(resting);
  });

  it('leaves text at the system weight alone, for the platform to thicken', () => {
    setSeatLayerPickerBoldText(true);
    expect(seatLayerPickerBoldFontWeight(undefined)).toBeUndefined();
    expect(seatLayerPickerBoldFontWeight('normal')).toBe('600');
    expect(seatLayerPickerBoldFontWeight('bold')).toBe('900');
  });

  it('keeps the picker root in step with the platform', async () => {
    const { SeatLayerPickerBoldTextRoot } = await import('../src/picker/boldText');
    const { SeatLayerPickerBoldTextStore } = await import('../src/picker/a11y');
    const store = new SeatLayerPickerBoldTextStore({
      isBoldTextEnabled: () => Promise.resolve(true),
      addEventListener: () => ({ remove: () => undefined }),
    });
    await act(async () => {
      create(React.createElement(SeatLayerPickerBoldTextRoot, { store } as never));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(seatLayerPickerBoldTextEnabled()).toBe(true);
  });
});
