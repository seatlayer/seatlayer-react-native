import { describe, expect, it, vi } from 'vitest';

// The row model is pure; the glyph module it is checked against is a component
// file, so React Native is stubbed rather than parsed.
vi.mock('react-native', () => ({ Image: 'Image' }));

import {
  seatLayerPickerSeatNoteAccessLabel, seatLayerPickerSeatNoteHairline,
  seatLayerPickerSeatNotePalette, seatLayerPickerSeatNoteRows,
  seatLayerPickerSeatNoteToneColors, seatLayerPickerSeatNotes,
  type SeatLayerPickerSeatNoteTone,
} from '../src/picker/seatNotes';
import { seatLayerPickerHasSeatIcon } from '../src/picker/seatIcons';
import { parseSeatLayerPickerColor } from '../src/picker/colors';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';
import { createSeatLayerPickerStringResolver } from '../src/picker/locale';

const strings = createSeatLayerPickerStringResolver();

describe('§3.8.9 seat notes — one row model', () => {
  it('lists every attribute the seat carries, in the one fixed order', () => {
    const rows = seatLayerPickerSeatNotes({
      accessibility: ['hearing', 'companion'],
      wheelchairSpaceType: 'no-seat',
      commercial: { restrictedView: true, obstructedView: true, premium: true },
    }, strings);
    expect(rows.map((row) => row.key)).toEqual([
      'access:hearing', 'access:companion', 'wheelchair:no-seat',
      'mark:restrictedView', 'mark:obstructedView', 'mark:premium',
    ]);
    expect(rows.map((row) => row.tone)).toEqual([
      'access', 'access', 'access', 'warn', 'warn', 'premium',
    ]);
  });

  it('keeps restricted and obstructed as SEPARATE rows', () => {
    const rows = seatLayerPickerSeatNotes({ commercial: { restrictedView: true, obstructedView: true } }, strings);
    expect(rows.map((row) => row.title)).toEqual(['Restricted view', 'Obstructed view']);
  });

  it('gives a wheelchair accommodation with a provision the PROVISION row only', () => {
    const noSeat = seatLayerPickerSeatNotes({ accessibility: ['wheelchair'], wheelchairSpaceType: 'no-seat' }, strings);
    expect(noSeat.map((row) => row.key)).toEqual(['wheelchair:no-seat']);
    expect(noSeat[0]?.title).toBe('Empty wheelchair space');
    const present = seatLayerPickerSeatNotes({ accessibility: ['wheelchair'], wheelchairSpaceType: 'seat-present' }, strings);
    expect(present.map((row) => row.key)).toEqual(['wheelchair:seat-present']);
    expect(present[0]?.title).toBe('Accessible physical seat');
    const bare = seatLayerPickerSeatNotes({ accessibility: ['wheelchair'] }, strings);
    expect(bare.map((row) => row.key)).toEqual(['access:wheelchair']);
    expect(bare[0]?.title).toBe('Wheelchair space');
  });

  it('attaches the organizer sentence to the first selling mark, or gives it a row', () => {
    const explained = seatLayerPickerSeatNotes({
      commercial: { restrictedView: true, premium: true, note: 'Pillar at the aisle end.' },
    }, strings);
    expect(explained[0]?.key).toBe('mark:restrictedView');
    expect(explained[0]?.note).toBe('Pillar at the aisle end.');
    expect(explained[1]?.note).toBeUndefined();
    const alone = seatLayerPickerSeatNotes({
      accessibility: ['hearing'], commercial: { note: 'Ask an usher for the receiver.' },
    }, strings);
    expect(alone.map((row) => row.key)).toEqual(['access:hearing', 'note']);
    expect(alone[1]?.title).toBe('Organizer note');
    expect(alone[1]?.tone).toBe('note');
  });

  it('drops a key this build has no name for rather than printing it raw', () => {
    const rows = seatLayerPickerSeatNotes({ accessibility: ['telepathy', 'step-free'] }, strings);
    expect(rows.map((row) => row.key)).toEqual(['access:step-free']);
    expect(seatLayerPickerSeatNoteAccessLabel('telepathy', strings)).toBeUndefined();
  });

  it('names all twelve accommodations and draws each of them', () => {
    const keys = [
      'wheelchair', 'companion', 'semi-ambulatory', 'designated-aisle', 'step-free', 'hearing',
      'cart', 'sign-language', 'low-vision', 'sensory-friendly', 'plus-size', 'lift-armrest',
    ];
    for (const key of keys) {
      expect(seatLayerPickerSeatNoteAccessLabel(key, strings), key).toBeTypeOf('string');
      expect(seatLayerPickerHasSeatIcon(key), key).toBe(true);
    }
    expect(seatLayerPickerSeatNoteAccessLabel('wheelchair', strings)).toBe('Wheelchair space');
    // The accommodation names come from the runtime's own dictionary, so a
    // localized picker says them in the buyer's language.
    const french = createSeatLayerPickerStringResolver({ locale: 'fr' });
    expect(seatLayerPickerSeatNoteAccessLabel('wheelchair', french)).not.toBe('Wheelchair space');
  });

  it('produces the same list twice for the same attributes', () => {
    const seat = { accessibility: ['companion'], commercial: { premium: true, note: 'Wide arm.' } };
    expect(seatLayerPickerSeatNotes(seat, strings)).toEqual(seatLayerPickerSeatNotes(seat, strings));
    expect(seatLayerPickerSeatNoteRows({ strings })).toEqual([]);
  });

  it('draws every row with a glyph the shared set actually has', () => {
    const rows = seatLayerPickerSeatNotes({
      accessibility: ['low-vision'], wheelchairSpaceType: 'seat-present',
      commercial: { restrictedView: true, obstructedView: true, premium: true, note: '' },
    }, strings);
    for (const row of rows) expect(seatLayerPickerHasSeatIcon(row.iconKey), row.key).toBe(true);
    expect(seatLayerPickerHasSeatIcon('note')).toBe(true);
  });
});

describe('§3.8.9 tone — measured on the tint each pair actually paints on', () => {
  const modes = ['light', 'dark'] as const;
  for (const mode of modes) {
    const palette = seatLayerPickerSeatNotePalette(seatLayerPickerTokens.color[mode], mode);
    for (const tone of ['access', 'warn', 'premium', 'note'] as SeatLayerPickerSeatNoteTone[]) {
      it(`clears 4.5:1 for ${tone} in ${mode}`, () => {
        const colors = seatLayerPickerSeatNoteToneColors(palette, tone);
        expect(contrast(colors.ink, colors.ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.bodyInk, colors.ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`takes the amber and the gold from the tokens in ${mode}`, () => {
      const warn = seatLayerPickerSeatNoteToneColors(palette, 'warn');
      const premium = seatLayerPickerSeatNoteToneColors(palette, 'premium');
      expect(warn.ink).toBe(seatLayerPickerTokens.color[mode].warnText);
      expect(premium.ink).toBe(seatLayerPickerTokens.color[mode].premiumText);
      // The glyph takes the title's ink on a toned row, the muted ink on a neutral one.
      expect(warn.iconInk).toBe(warn.ink);
      expect(seatLayerPickerSeatNoteToneColors(palette, 'access').iconInk).toBe(palette.mutedText);
    });
  }

  it('washes the ground with the note opacity tokens, never a number of its own', () => {
    const palette = seatLayerPickerSeatNotePalette(seatLayerPickerTokens.color.light, 'light');
    const opacity = seatLayerPickerTokens.opacity;
    expect(opacity.noteToneWash).toBe(0.1);
    expect(opacity.noteNeutralWash).toBe(0.06);
    expect(opacity.noteBodyInk).toBe(0.75);
    expect(opacity.noteHairline).toBe(0.6);
    expect(seatLayerPickerSeatNoteToneColors(palette, 'access').ground)
      .not.toBe(seatLayerPickerSeatNoteToneColors(palette, 'warn').ground);
    // The hairline RE-alphas the divider rather than blending it opaque.
    const divider = seatLayerPickerTokens.color.light.divider;
    const alpha = parseSeatLayerPickerColor(divider)?.alpha ?? 1;
    expect(seatLayerPickerSeatNoteHairline(divider))
      .toBe(`rgba(23, 32, 51, ${alpha * opacity.noteHairline})`);
  });
});

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const parsed = parseSeatLayerPickerColor(color);
  if (parsed === undefined) throw new Error(`unreadable colour: ${color}`);
  return 0.2126 * channel(parsed.red) + 0.7152 * channel(parsed.green) + 0.0722 * channel(parsed.blue);
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('the note roles are THEME roles', () => {
  it('lets a host brand all four, and falls back to the mode for each', () => {
    const light = seatLayerPickerTokens.color.light;
    // A branded picker with two amber schemes in one card is what reading
    // these off the tokens regardless produced.
    const branded = seatLayerPickerSeatNotePalette({
      ...light, warning: '#123456', warnText: '#654321',
      premium: '#abcdef', premiumText: '#fedcba',
    }, 'light');
    expect(branded).toMatchObject({
      warning: '#123456', warnText: '#654321',
      premium: '#abcdef', premiumText: '#fedcba',
    });
    // Each falls back on its own: a host branding the ground alone still gets
    // an ink that reads on the mode's wash.
    const partial = seatLayerPickerSeatNotePalette({ ...light, warning: '#123456' }, 'light');
    expect(partial.warning).toBe('#123456');
    expect(partial.warnText).toBe(light.warnText);
    expect(partial.premium).toBe(light.premium);
  });
});
