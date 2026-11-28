import { describe, expect, it } from 'vitest';

import {
  seatLayerPickerConfirmCardSentence,
  seatLayerPickerConfirmIdentity,
  seatLayerPickerConfirmIdentityCells,
} from '../src/picker/confirmCardIdentity';
import { seatLayerPickerLocaleSources } from '../src/picker/strings.g';
import type { SelectedSeat } from '../src/types';

const words: Record<string, string> = {
  sectionWord: 'Section',
  rowWord: 'Row',
  seatWord: 'Seat',
  guestsWord: 'Guests',
  tableWord: 'Table',
};
const translate = (key: string, options?: { values?: Record<string, string> }): string => {
  if (key === 'seatIdentity') return options?.values?.parts ?? '';
  if (key === 'rowIdentity') return `Row ${options?.values?.row ?? ''}`;
  if (key === 'seatNumberIdentity') return `Seat ${options?.values?.seat ?? ''}`;
  return words[key] ?? key;
};

// The runtime sends a table booked as one with its name as the row and no seat number.
const table = (overrides: Partial<SelectedSeat> = {}): SelectedSeat => ({
  id: 't-2', label: 'T2', objectType: 'table', bookingMode: 'whole', capacity: 4,
  sectionLabel: 'Garden', rowLabel: 'T2', ...overrides,
});
const cells = (seat: SelectedSeat) =>
  seatLayerPickerConfirmIdentityCells(seat, undefined, translate).map((cell) => [cell.key, cell.value]);

describe('a table booked as one on the seat card', () => {
  it('names its guests and its name after the section', () => {
    expect(cells(table())).toEqual([['Section', 'Garden'], ['Guests', '4'], ['Table', 'T2']]);
  });

  it('gives a party table its range of guests', () => {
    expect(cells(table({ bookingMode: 'variable', capacity: 4, minOccupancy: 2, maxOccupancy: 6 })))
      .toEqual([['Section', 'Garden'], ['Guests', '2–6'], ['Table', 'T2']]);
    expect(cells(table({ bookingMode: 'variable', minOccupancy: 4, maxOccupancy: 4 })))
      .toEqual([['Section', 'Garden'], ['Guests', '4'], ['Table', 'T2']]);
  });

  it('keeps the table name where the chart named no section', () => {
    expect(cells(table({ sectionLabel: undefined }))).toEqual([['Guests', '4'], ['Table', 'T2']]);
  });

  it('falls back to the display label for the name', () => {
    expect(cells(table({ rowLabel: undefined, displayLabel: 'Table two' })))
      .toEqual([['Section', 'Garden'], ['Guests', '4'], ['Table', 'Table two']]);
  });

  it('says the same cells in the card sentence and the 3D caption', () => {
    expect(seatLayerPickerConfirmCardSentence(table(), undefined, translate, ['Premium', '€60']))
      .toBe('Garden · Guests 4 · Table T2 · Premium · €60');
    expect(seatLayerPickerConfirmIdentity(table(), undefined, translate)).toBe('Garden · Guests 4 · Table T2');
  });

  it('leaves a chair at a table, sold one by one, as a seat', () => {
    const chair: SelectedSeat = { id: 'c-1', label: 'T1-1', objectType: 'seat', sectionLabel: 'Garden', rowLabel: 'T1', seatNumber: '1' };
    expect(cells(chair)).toEqual([['Section', 'Garden'], ['Row', 'T1'], ['Seat', '1']]);
    expect(cells({ ...chair, objectType: 'table' })).toEqual([['Section', 'Garden'], ['Row', 'T1'], ['Seat', '1']]);
  });

  it('takes both words from the runtime in every language', () => {
    const missing = Object.entries(seatLayerPickerLocaleSources)
      .filter(([, words]) => !words().guestsWord || !words().tableWord)
      .map(([locale]) => locale);
    expect(missing).toEqual([]);
    expect(seatLayerPickerLocaleSources.de().guestsWord).toBe('Gäste');
    expect(seatLayerPickerLocaleSources.de().tableWord).toBe('Tisch');
  });
});
