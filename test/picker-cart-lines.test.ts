import { describe, expect, it } from 'vitest';

import {
  projectConfirmedCart,
  projectCartTotals,
  resolveSeatLayerTicketLines,
  type SeatLayerCartLineLike,
} from '../src/picker/cartLines';

const seat = (overrides: Partial<SeatLayerCartLineLike> = {}): SeatLayerCartLineLike => ({
  lineKey: 'line-1',
  label: 'A-1',
  objectId: 'row-a',
  objectType: 'seat',
  categoryKey: 'standard',
  tierId: null,
  unitPrice: 25,
  currency: 'EUR',
  quantity: 1,
  sectionLabel: 'Gallery',
  rowLabel: 'A',
  seatNumber: '1',
  ...overrides,
});

describe('cart line resolution', () => {
  it('prints the row with its section prefix stripped', () => {
    // A chart that authors `206-I` inside section `206` made the line read
    // `206 · 206-I · 4`: the section twice and the row not at all.
    const [line] = resolveSeatLayerTicketLines([
      seat({ lineKey: 'one', label: '206-I-4', sectionLabel: '206', rowLabel: '206-I', seatNumber: '4' }),
    ]);
    expect(line?.section).toBe('206');
    expect(line?.rowLabel).toBe('I');

    // A row that does not repeat its section is printed exactly as authored,
    // through the same normalizer the seat card's identity grid uses.
    const [bare] = resolveSeatLayerTicketLines([
      seat({ lineKey: 'two', label: 'R-6', sectionLabel: '205', rowLabel: 'R', seatNumber: '6' }),
    ]);
    expect(bare?.rowLabel).toBe('R');
  });

});

describe('cart projections and identity safety', () => {
  it('uses cart-owned identity before selection and refuses ambiguous fallback labels', () => {
    const cart = seat({ seatId: 'seat-9', sectionLabel: 'Choir', rowLabel: 'Choir A', seatNumber: '9' });
    const [addressed] = resolveSeatLayerTicketLines([cart], [{ id: 'seat-9', label: 'A-9', sectionLabel: 'Wrong', rowLabel: 'Wrong', seatNumber: '99' }]);
    expect(addressed?.section).toBe('Choir');
    expect(addressed?.seatLabel).toBe('9');

    const [ambiguous] = resolveSeatLayerTicketLines([seat({ seatId: null, sectionLabel: null, rowLabel: null, seatNumber: null })], [
      { label: 'A-1', sectionLabel: 'First', rowLabel: 'A', seatNumber: '1' },
      { label: 'A-1', sectionLabel: 'Second', rowLabel: 'B', seatNumber: '2' },
    ]);
    expect(ambiguous?.selection).toBeNull();
    expect(ambiguous?.section).toBe('standard');
  });

  it('projects GA and table quantities but does not claim one amount for mixed currencies', () => {
    const projection = projectCartTotals([
      seat({ objectType: 'ga', quantity: 3, unitPrice: 12, currency: 'EUR' }),
      seat({ objectType: 'table', quantity: 4, unitPrice: 20, currency: 'USD' }),
    ]);
    expect(projection).toEqual({ quantity: 7, total: 116, currency: null, hasMixedCurrencies: true });
  });

  it('defaults an omitted decoded quantity to one and excludes malformed quantities', () => {
    const projection = projectCartTotals([
      seat({ quantity: undefined }),
      seat({ quantity: null }),
      seat({ quantity: 0 }),
      seat({ quantity: -1 }),
      seat({ quantity: 1.5 }),
    ]);
    expect(projection).toMatchObject({ quantity: 2, total: 50 });
  });

  it('matches pending exclusion independently for every cart line', () => {
    const items = [
      seat({ lineKey: 'one', label: 'same', seatId: 'seat-1', unitPrice: 25 }),
      seat({ lineKey: 'two', label: 'same', seatId: 'seat-2', unitPrice: 30 }),
      seat({ lineKey: 'three', label: 'same', seatId: null, unitPrice: 20 }),
      seat({ lineKey: 'four', label: 'other', seatId: null, unitPrice: 15 }),
    ];
    // `seat-2` removes by id, while the separate legacy line still removes by
    // label because the comparison is independent for each line.
    expect(projectConfirmedCart(items, { id: 'seat-2', label: 'same' })).toMatchObject({ quantity: 2, total: 40 });
    // Without a pending id, addressed lines remain; every matching legacy line
    // is excluded, which is the controller's exact fallback behavior.
    expect(projectConfirmedCart(items, { label: 'same' })).toMatchObject({ quantity: 3, total: 70 });
    expect(projectConfirmedCart(items, { id: 'missing', label: 'other' })).toMatchObject({ quantity: 3, total: 75 });
  });

});
