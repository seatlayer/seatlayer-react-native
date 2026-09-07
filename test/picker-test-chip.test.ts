import { describe, expect, it } from 'vitest';

import {
  seatLayerPickerContrastRatio,
  seatLayerPickerTestChipContrastFloor,
  seatLayerPickerTestChipInk,
  seatLayerPickerTestChipWash,
} from '../src/picker/testChipInk';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const warning = seatLayerPickerTokens.color.light.warning;
const wash = seatLayerPickerTokens.opacity.warnPillWash;

function chip(surface: string, text: string): Readonly<{ ground: string; ink: string }> {
  const ground = seatLayerPickerTestChipWash(warning, surface, wash);
  return { ground, ink: seatLayerPickerTestChipInk(warning, text, ground) };
}

describe('3.4 test chip', () => {
  it('carries the amber recipe from the tokens, never the accent', () => {
    expect(warning).toBe('#F4B740');
    expect(warning).not.toBe(seatLayerPickerTokens.color.light.accent);
    expect(seatLayerPickerTokens.size.testChipHeight).toBe(26);
    expect(seatLayerPickerTokens.size.testChipDotSize).toBe(7);
    expect(seatLayerPickerTokens.size.testChipFontSize).toBe(11);
    expect(wash).toBe(0.18);
  });

  it('is sentence case, with the long form reserved for the screen reader', () => {
    expect(seatLayerPickerTokens.strings.testMode).toBe('Test mode');
    expect(seatLayerPickerTokens.strings.testModeLong).toBe('Test mode · books nothing');
    expect(seatLayerPickerTokens.strings.testModeExplained)
      .toBe('Bookings here are not real and no card is charged');
  });

  it('measures the ink against the wash, not the bare surface', () => {
    const light = chip(seatLayerPickerTokens.color.light.surface, seatLayerPickerTokens.color.light.text);
    const dark = chip(seatLayerPickerTokens.color.dark.surface, seatLayerPickerTokens.color.dark.text);
    for (const resolved of [light, dark]) {
      expect(seatLayerPickerContrastRatio(resolved.ink, resolved.ground))
        .toBeGreaterThanOrEqual(seatLayerPickerTestChipContrastFloor);
    }
    // The wash is a different, always-warmer colour than the surface it sits on.
    expect(light.ground).not.toBe(seatLayerPickerTokens.color.light.surface);
  });

  it('stops at the first candidate that clears, keeping as much amber as it can', () => {
    // A very dark ground: the hue itself already clears, so it is kept whole.
    const onBlack = seatLayerPickerTestChipWash(warning, '#000000', wash);
    expect(seatLayerPickerTestChipInk(warning, '#FFFFFF', onBlack)).toBe(warning);
  });

  it('gives up the hue on a mid-tone ground rather than returning an illegible one', () => {
    // Step 3: no mix of a mid-tone gold and a mid-tone ink clears the floor.
    const midGround = seatLayerPickerTestChipWash(warning, '#7A7A7A', wash);
    const ink = seatLayerPickerTestChipInk(warning, '#808080', midGround);
    expect(['#172033', '#EEF1F8']).toContain(ink);
    expect(seatLayerPickerContrastRatio(ink, midGround))
      .toBeGreaterThan(seatLayerPickerContrastRatio('#808080', midGround));
  });

  it('reports a known contrast pair correctly', () => {
    expect(seatLayerPickerContrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
});
