import { describe, expect, it } from 'vitest';

import {
  formatSeatRunLabel,
  groupDenseTicketLines,
  projectConfirmedCart,
  projectCartTotals,
  projectVisibleRuns,
  resolveDenseTicketLines,
  runMembersInSeatOrder,
  type SeatLayerCartLineLike,
} from '../src/picker/cartDense';

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

describe('dense cart grouping', () => {
  it('folds adjacent compatible seats and orders their expanded members by seat number', () => {
    const lines = resolveDenseTicketLines([
      seat({ lineKey: 'three', label: 'A-3', objectId: 'seat-a-3', seatNumber: '3' }),
      seat({ lineKey: 'one', label: 'A-1', objectId: 'seat-a-1', seatNumber: '1' }),
      seat({ lineKey: 'two', label: 'A-2', objectId: 'seat-a-2', seatNumber: '2' }),
    ]);
    const [run] = groupDenseTicketLines(lines);

    expect(run?.seatsLabel).toBe('1–3');
    expect(run?.total).toBe(75);
    expect(runMembersInSeatOrder(run!).map((member) => member.seatLabel)).toEqual(['1', '2', '3']);
  });

  it('uses the buyer-facing category and formatted amount as the dense run key', () => {
    const items = [
      seat({ lineKey: 'first', label: 'A-1', seatNumber: '1', categoryKey: 'standard' }),
      seat({ lineKey: 'second', label: 'A-2', seatNumber: '2', categoryKey: 'premium' }),
    ];
    const categorySplit = resolveDenseTicketLines(items, [], {
      displayForItem: (item) => ({
        section: 'Gallery', rowLabel: 'A', seatLabel: item.seatNumber,
        categoryLabel: item.categoryKey === 'premium' ? 'Premium' : 'Standard', amountText: '€25',
      }),
    });
    expect(groupDenseTicketLines(categorySplit)).toHaveLength(2);

    const sameRenderedValues = resolveDenseTicketLines(items, [], {
      displayForItem: (item) => ({
        section: 'Gallery', rowLabel: 'A', seatLabel: item.seatNumber,
        categoryLabel: 'Adult', amountText: '€25',
      }),
    });
    expect(groupDenseTicketLines(sameRenderedValues)).toHaveLength(1);

    const amountSplit = resolveDenseTicketLines(items, [], {
      displayForItem: (item) => ({
        section: 'Gallery', rowLabel: 'A', seatLabel: item.seatNumber,
        categoryLabel: 'Adult', amountText: item.label === 'A-2' ? '€30' : '€25',
      }),
    });
    expect(groupDenseTicketLines(amountSplit)).toHaveLength(2);

    const collisionSafe = resolveDenseTicketLines(items, [], {
      displayForItem: (item) => item.label === 'A-2'
        ? { section: 'A', rowLabel: 'B\u0000C', seatLabel: '2', categoryLabel: 'Adult', amountText: '€25' }
        : { section: 'A\u0000B', rowLabel: 'C', seatLabel: '1', categoryLabel: 'Adult', amountText: '€25' },
    });
    // The render key compares its fields rather than serializing a delimiter-
    // joined string, so buyer strings cannot cross a key boundary.
    expect(groupDenseTicketLines(collisionSafe)).toHaveLength(2);

    const separatedByArrival = resolveDenseTicketLines([
      seat({ lineKey: 'first', label: 'A-1', seatNumber: '1' }),
      seat({ lineKey: 'middle', label: 'B-1', sectionLabel: 'Balcony', rowLabel: 'B' }),
      seat({ lineKey: 'second', label: 'A-2', seatNumber: '2' }),
    ]);
    expect(groupDenseTicketLines(separatedByArrival)).toHaveLength(3);

    const held = resolveDenseTicketLines([seat({ label: 'A-1' }), seat({ label: 'A-2', seatNumber: '2' })], [], { held: true });
    const fresh = resolveDenseTicketLines([seat({ label: 'A-3', seatNumber: '3' })]);
    expect(groupDenseTicketLines([...held, ...fresh])).toHaveLength(2);
  });

  it('keeps GA and invalid controls atomic, but preserves booth and open object types', () => {
    const atomicCases: readonly SeatLayerCartLineLike[][] = [
      [seat({ label: 'A-1' }), seat({ label: 'A-2', seatNumber: '2', objectType: 'ga', quantity: 2 })],
      [seat({ label: 'A-1' }), seat({ label: 'A-2', seatNumber: '2', unitPrice: null })],
      [seat({ label: 'A-1' }), seat({ label: 'A-2', seatNumber: '2', sectionLabel: null })],
    ];

    for (const items of atomicCases) expect(groupDenseTicketLines(resolveDenseTicketLines(items))).toHaveLength(2);
    for (const objectType of ['booth', 'table', 'future-object'] as const) {
      const items = [seat({ label: 'A-1', objectType }), seat({ label: 'A-2', objectType, seatNumber: '2' })];
      expect(groupDenseTicketLines(resolveDenseTicketLines(items))).toHaveLength(1);
    }
    const tierControlled = resolveDenseTicketLines([
      seat({ label: 'A-1', seatId: 'seat-1' }),
      seat({ label: 'A-2', seatId: 'seat-2', seatNumber: '2' }),
    ], [
      { id: 'seat-1', tiers: [{}, {}] },
      { id: 'seat-2', tiers: [{}, {}] },
    ]);
    expect(groupDenseTicketLines(tierControlled)).toHaveLength(2);
  });

  it('does not invent a range for non-adjacent or duplicate seat labels', () => {
    expect(formatSeatRunLabel(['1', '2', '4', '5', '6'])).toBe('1, 2, 4 +2');
    expect(formatSeatRunLabel(['1', '1', '2'])).toBe('1, 1, 2');
    expect(formatSeatRunLabel(['A', 'C', 'E', 'G'])).toBe('A, C, E +1');
  });
});

describe('cart projections and identity safety', () => {
  it('uses cart-owned identity before selection and refuses ambiguous fallback labels', () => {
    const cart = seat({ seatId: 'seat-9', sectionLabel: 'Choir', rowLabel: 'Choir A', seatNumber: '9' });
    const [addressed] = resolveDenseTicketLines([cart], [{ id: 'seat-9', label: 'A-9', sectionLabel: 'Wrong', rowLabel: 'Wrong', seatNumber: '99' }]);
    expect(addressed?.section).toBe('Choir');
    expect(addressed?.seatLabel).toBe('9');

    const [ambiguous] = resolveDenseTicketLines([seat({ seatId: null, sectionLabel: null, rowLabel: null, seatNumber: null })], [
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

  it('reports visible runs and the exact +N-more tail', () => {
    const runs = groupDenseTicketLines(resolveDenseTicketLines([
      seat({ lineKey: '1', label: 'A-1', objectId: 'row-1', rowLabel: '1' }),
      seat({ lineKey: '2', label: 'B-1', objectId: 'row-2', rowLabel: '2' }),
      seat({ lineKey: '3', label: 'C-1', objectId: 'row-3', rowLabel: '3' }),
      seat({ lineKey: '4', label: 'D-1', objectId: 'row-4', rowLabel: '4' }),
      seat({ lineKey: '5', label: 'E-1', objectId: 'row-5', rowLabel: '5' }),
    ]));
    expect(projectVisibleRuns(runs, 3, false)).toMatchObject({ hiddenCount: 2, canToggle: true });
    expect(projectVisibleRuns(runs, 3, true)).toMatchObject({ hiddenCount: 0, canToggle: true });
  });
});
