import { describe, expect, it } from 'vitest';

import {
  seatLayerPickerConfirmBandDarkInk,
  seatLayerPickerConfirmBandInk,
  seatLayerPickerConfirmCancelShare,
  seatLayerPickerConfirmCardSentence,
  seatLayerPickerConfirmIdentityCells,
  seatLayerPickerConfirmMissingValue,
  seatLayerPickerContrastRatio,
  seatLayerPickerReadableAccent,
} from '../src/picker/confirmCardIdentity';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';
import type { SelectedSeat } from '../src/types';

const words: Record<string, string> = {
  sectionWord: 'Section',
  rowWord: 'Row',
  seatWord: 'Seat',
  placeWord: 'Place',
};
const translate = (key: string, options?: { values?: Record<string, string> }): string =>
  key === 'seatIdentity' ? options?.values?.parts ?? '' : words[key] ?? key;

const seat = (overrides: Partial<SelectedSeat> = {}): SelectedSeat => ({
  id: 'seat-a', label: 'inventory-a', sectionLabel: '209', rowLabel: 'C', seatNumber: '12', ...overrides,
});

describe('§3.8.3 identity grid', () => {
  it('names three equal cells by the chart’s own words', () => {
    expect(seatLayerPickerConfirmIdentityCells(seat(), undefined, translate)).toEqual([
      { key: 'Section', value: '209', long: false },
      { key: 'Row', value: 'C', long: false },
      { key: 'Seat', value: '12', long: false },
    ]);
  });

  it('drops to two cells where the chart named no section', () => {
    const cells = seatLayerPickerConfirmIdentityCells(seat({ sectionLabel: '  ' }), undefined, translate);
    expect(cells.map((cell) => cell.key)).toEqual(['Row', 'Seat']);
  });

  it('strips the section prefix from the row it prints', () => {
    const cells = seatLayerPickerConfirmIdentityCells(
      seat({ sectionLabel: 'Stalls D', rowLabel: 'Stalls D C' }), undefined, translate,
    );
    expect(cells[1]).toEqual({ key: 'Row', value: 'C', long: false });
  });

  it('marks only a section longer than confirmSectionShortMax as long', () => {
    expect(seatLayerPickerTokens.size.confirmSectionShortMax).toBe(6);
    expect(seatLayerPickerConfirmIdentityCells(seat({ sectionLabel: 'Box 4' }), undefined, translate)[0]?.long).toBe(false);
    expect(seatLayerPickerConfirmIdentityCells(seat({ sectionLabel: 'Upper Grand Circle' }), undefined, translate)[0]?.long).toBe(true);
  });

  it('follows the object’s own row word and calls a booth place a place', () => {
    const cells = seatLayerPickerConfirmIdentityCells(
      seat({ displayType: 'Table', objectType: 'booth' }), undefined, translate,
    );
    expect(cells[1]?.key).toBe('Table');
    expect(cells[2]?.key).toBe('Place');
  });

  it('prints an em dash where the present cell names nothing', () => {
    const cells = seatLayerPickerConfirmIdentityCells(
      { id: 's', label: '   ', sectionLabel: '209' } as SelectedSeat, undefined, translate,
    );
    expect(cells[cells.length - 1]?.value).toBe(seatLayerPickerConfirmMissingValue);
    expect(seatLayerPickerConfirmMissingValue).toBe('—');
  });
});

describe('§3.8.6 the identity reads as one sentence', () => {
  it('carries section, row, seat, category and price in that order', () => {
    expect(seatLayerPickerConfirmCardSentence(seat(), undefined, translate, ['Gold', '$42']))
      .toBe('209 · Row C · Seat 12 · Gold · $42');
  });

  it('drops an absent extra rather than printing an empty separator', () => {
    expect(seatLayerPickerConfirmCardSentence(seat(), undefined, translate, [undefined, '  ']))
      .toBe('209 · Row C · Seat 12');
  });
});

describe('§3.8.3 the band chooses its ink per colour', () => {
  it('prints white on a saturated ground and the near-black on a pale one', () => {
    expect(seatLayerPickerConfirmBandInk('#B42318')).toBe('#FFFFFF');
    expect(seatLayerPickerConfirmBandInk('#F5E663')).toBe(seatLayerPickerConfirmBandDarkInk);
    expect(seatLayerPickerConfirmBandInk('#D9D9D9')).toBe(seatLayerPickerConfirmBandDarkInk);
  });

  it('never offers a third candidate', () => {
    for (const ground of ['#000000', '#FFFFFF', '#5B4B8A', '#9B8AFB', '#F4B740']) {
      expect(['#FFFFFF', seatLayerPickerConfirmBandDarkInk]).toContain(seatLayerPickerConfirmBandInk(ground));
    }
  });

  it('keeps the chosen ink at or above the 3:1 floor wherever it can', () => {
    const ground = '#5B4B8A';
    expect(seatLayerPickerContrastRatio(seatLayerPickerConfirmBandInk(ground), ground)).toBeGreaterThanOrEqual(3);
  });

  it('measures the WCAG ratio', () => {
    expect(seatLayerPickerContrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(seatLayerPickerContrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('§3.8.7 the readable accent', () => {
  it('blends toward the ink until it clears 4.5:1 on both grounds', () => {
    const accent = '#9B8AFB';
    const surface = '#1A2234';
    const ground = '#22293C';
    const readable = seatLayerPickerReadableAccent(accent, surface, ground, '#EEF1F8');
    expect(seatLayerPickerContrastRatio(readable, surface)).toBeGreaterThanOrEqual(4.5);
    expect(seatLayerPickerContrastRatio(readable, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the accent itself where it already clears both', () => {
    expect(seatLayerPickerReadableAccent('#5B4B8A', '#FFFFFF', '#F6F7FB', '#172033')).toBe('#5B4B8A');
  });
});

describe('§3.8.3 the decision row', () => {
  it('gives the quiet answer just over a third, never a half', () => {
    expect(seatLayerPickerConfirmCancelShare).toBeCloseTo(0.34, 5);
  });
});
