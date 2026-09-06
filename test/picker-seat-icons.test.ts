import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Image: 'Image' }));

import {
  seatLayerPickerHasSeatIcon, seatLayerPickerSeatGlyphs,
  seatLayerPickerSeatIconSource, seatLayerPickerSeatIconStrokeWidth,
  seatLayerPickerSeatIconSvg, seatLayerPickerSeatIconViewBox,
} from '../src/picker/seatIcons';

/**
 * §3.8.9 — the path data IS the contract. These assertions exist so a port
 * that "redraws a glyph close enough" fails here rather than in a screenshot
 * six weeks later; the numbers are the shared runtime set's, transcribed.
 */
describe('§3.8.9 the shared icon set', () => {
  it('carries the sixteen drawings the picker can ask for, plus the sheet disc', () => {
    expect(Object.keys(seatLayerPickerSeatGlyphs).sort()).toEqual([
      'cart', 'companion', 'contrast', 'designated-aisle', 'hearing',
      'lift-armrest', 'low-vision', 'note', 'obstructedView', 'plus-size',
      'premium', 'restrictedView', 'semi-ambulatory', 'sensory-friendly',
      'sign-language', 'step-free', 'wheelchair',
    ]);
  });

  it('is authored in a 20-unit box, stroke-only at 1.45', () => {
    expect(seatLayerPickerSeatIconViewBox).toBe(20);
    expect(seatLayerPickerSeatIconStrokeWidth).toBe(1.45);
    for (const [key, glyph] of Object.entries(seatLayerPickerSeatGlyphs)) {
      const shapes = (glyph.circles?.length ?? 0) + (glyph.paths?.length ?? 0) + (glyph.fills?.length ?? 0);
      expect(shapes, key).toBeGreaterThan(0);
      for (const circle of glyph.circles ?? []) {
        expect(circle.length, key).toBe(3);
        for (const value of circle) expect(Number.isFinite(value), key).toBe(true);
      }
      for (const data of [...(glyph.paths ?? []), ...(glyph.fills ?? [])]) {
        expect(data, key).toMatch(/^[Mm]/);
        // Arc flags are separated from their neighbours in the authored data;
        // the glued `010` form is a transcription error, not a glyph style.
        expect(data, key).not.toMatch(/[Aa][\d.\s,-]*?\s\d\d\d\s/);
      }
    }
  });

  it('keeps the two marks that used to collapse into one another apart', () => {
    // An eye struck through — the view is BLOCKED — versus an eye with a
    // caution mark. One shared drawing for both is how "restricted beat
    // obstructed" survived on five surfaces.
    expect(seatLayerPickerSeatGlyphs.obstructedView?.paths?.[1]).toBe('m4 17 12-14');
    expect(seatLayerPickerSeatGlyphs.restrictedView?.paths?.[1]).toBe('M10 7.5v3.5M10 13.5h.01');
    expect(seatLayerPickerSeatGlyphs.premium?.paths?.[0])
      .toBe('m10 2.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z');
    // The organizer's note is a drawn circled i, never the emoji it replaced.
    expect(seatLayerPickerSeatGlyphs.note?.circles?.[0]).toEqual([10, 10, 7.5]);
  });

  it('inherits the row ink rather than carrying a colour of its own', () => {
    const markup = seatLayerPickerSeatIconSvg('premium', '#DCCBA5', 17);
    expect(markup).toContain('stroke="#DCCBA5"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke-width="1.45"');
    expect(markup).toContain('viewBox="0 0 20 20"');
    expect(markup).toContain('width="17" height="17"');
    // A tone is one colour away, with no second icon set to keep in step.
    expect(seatLayerPickerSeatIconSvg('premium', '#745F2C', 17)).toContain('stroke="#745F2C"');
    // The one filled shape paints in the same ink.
    expect(seatLayerPickerSeatIconSvg('contrast', '#111', 20)).toContain('fill="#111" stroke="none"');
    expect(seatLayerPickerSeatIconSource('note', '#111')?.uri).toMatch(/^data:image\/svg\+xml;utf8,/);
  });

  it('draws NOTHING for a key this build does not know', () => {
    expect(seatLayerPickerHasSeatIcon('telepathy')).toBe(false);
    expect(seatLayerPickerSeatIconSvg('telepathy', '#111')).toBeUndefined();
    expect(seatLayerPickerSeatIconSource('telepathy', '#111')).toBeUndefined();
    expect(seatLayerPickerHasSeatIcon('toString')).toBe(false);
  });
});
