import { describe, expect, it } from 'vitest';

import { seatLayerHostedWebVersion } from '../src/types';
import { decodeSeatLayerPickerSnapshot } from '../src/picker/decode';
import { seatLayerPickerSnapshotSchema, type SeatLayerPickerSelectedSeat } from '../src/picker/models';

const snapshot = (revision = 1, extra: object = {}) => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId: 'session',
  revision,
  event: { key: 'ev', currency: 'USD' },
  branding: {},
  catalog: {},
  map: {},
  selection: { seats: [] },
  cart: { items: [] },
  hold: {},
  access: {},
  ...extra,
});

describe('runtime pin', () => {
  it('pins the newest published hosted runtime', () => {
    // `cdn/versions.json` on the runtime's main lists 0.84.1 as `latest`, and
    // the post-checkout cart-line fix is NOT in it — see the note on the
    // cart-line test below.
    expect(seatLayerHostedWebVersion).toBe('0.84.1');
  });
});

describe('0.84 zoom readings decode as present-only', () => {
  it('carries atVenueFit and canZoomIn only when the runtime answered them', () => {
    const answered = decodeSeatLayerPickerSnapshot(snapshot(2, {
      map: { rung: 'overview', atVenueFit: true, canZoomIn: false, canZoomOut: false },
    }));
    expect(answered?.map.atVenueFit).toBe(true);
    expect(answered?.map.canZoomIn).toBe(false);

    const negative = decodeSeatLayerPickerSnapshot(snapshot(3, {
      map: { rung: 'overview', atVenueFit: false, canZoomIn: true, canZoomOut: true },
    }));
    expect(negative?.map.atVenueFit).toBe(false);
    expect(negative?.map.canZoomIn).toBe(true);
  });

  it('leaves both keys ABSENT on a runtime that cannot answer, never false', () => {
    // 0.80.3 and older report neither. Absent has to stay distinguishable from
    // `false`, or a host dims its "−" and its "+" on a map that can still move.
    const older = decodeSeatLayerPickerSnapshot(snapshot(4, { map: { rung: 'overview' } }));
    expect(older?.map && 'atVenueFit' in older.map).toBe(false);
    expect(older?.map && 'canZoomIn' in older.map).toBe(false);
    // The fallback reading is still there and still answers.
    expect(older?.map.canZoomOut).toBe(false);

    const malformed = decodeSeatLayerPickerSnapshot(snapshot(5, {
      map: { rung: 'overview', atVenueFit: 'yes', canZoomIn: 1 },
    }));
    expect(malformed?.map && 'atVenueFit' in malformed.map).toBe(false);
    expect(malformed?.map && 'canZoomIn' in malformed.map).toBe(false);
  });
});

describe('0.84 seat attributes reach the cart surface', () => {
  it('decodes accommodation types, the wheelchair provision and the commercial marks', () => {
    const decoded = decodeSeatLayerPickerSnapshot(snapshot(6, {
      selection: {
        seats: [{
          id: 's1',
          label: 'A-1',
          accessibility: ['wheelchair', 'companion', 'lift-armrest'],
          wheelchairSpaceType: 'no-seat',
          commercial: {
            restrictedView: true,
            obstructedView: false,
            premium: true,
            note: 'Behind the sound desk.',
          },
        }],
      },
    }));
    const seat = decoded?.selection[0] as SeatLayerPickerSelectedSeat | undefined;
    expect(seat?.accessibility).toEqual(['wheelchair', 'companion', 'lift-armrest']);
    expect(seat?.wheelchairSpaceType).toBe('no-seat');
    expect(seat?.commercial).toEqual({
      restrictedView: true,
      obstructedView: false,
      premium: true,
      note: 'Behind the sound desk.',
    });
  });

  it('keeps every attribute group present-only', () => {
    const decoded = decodeSeatLayerPickerSnapshot(snapshot(7, {
      selection: { seats: [{ id: 's1', label: 'A-1' }] },
    }));
    const seat = decoded?.selection[0] as SeatLayerPickerSelectedSeat | undefined;
    expect(seat?.label).toBe('A-1');
    expect(seat && 'accessibility' in seat).toBe(false);
    expect(seat && 'wheelchairSpaceType' in seat).toBe(false);
    expect(seat && 'commercial' in seat).toBe(false);
  });
});

describe('cart lines for seats added after checkout', () => {
  it('renders every line the runtime sends, held lines and later taps alike', () => {
    // The runtime builds `cart.items` as "the hold's lines first, then every
    // selected seat the hold does not cover yet" — packages/js/src/bridge/picker.ts,
    // commit 5f03ef3, which lands AFTER the v0.84.1 tag. Pinned at 0.84.1 the
    // second line does not arrive; the decode has always carried whatever the
    // runtime sends, so nothing here has to change when 0.84.2 ships it.
    const decoded = decodeSeatLayerPickerSnapshot(snapshot(8, {
      cart: {
        currency: 'USD',
        quantity: 2,
        total: 120,
        items: [
          { label: 'A-1', objectId: 'a1', categoryKey: 'gold', unitPrice: 60, currency: 'USD', quantity: 1 },
          { label: 'A-2', objectId: 'a2', categoryKey: 'gold', unitPrice: 60, currency: 'USD', quantity: 1 },
        ],
      },
      hold: { active: true, expiresAt: 1_800_000, ownership: 'picker' },
    }));
    expect(decoded?.cartLines.map((line) => line.label)).toEqual(['A-1', 'A-2']);
    expect(decoded?.ticketCount).toBe(2);
    expect(decoded?.cartTotal).toBe(120);
  });
});
