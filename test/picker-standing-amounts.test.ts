import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { decodeGAArea } from '../src/decode';
import { SeatLayerPickerController } from '../src/picker/controller';
import { projectSeatLayerPickerGAAmounts } from '../src/picker/generalAdmissionAmounts';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';
import type { GAArea } from '../src/types';

const amounts = (area: Partial<GAArea>, options: { remaining?: number; wheelchairOnly?: boolean } = {}) =>
  projectSeatLayerPickerGAAmounts({ id: 'ga', ...area }, options.remaining ?? 10, options.wheelchairOnly ?? false);

describe('what one standing area or box can be asked for', () => {
  it('reads the box and wheelchair facts the page sends', () => {
    expect(decodeGAArea({
      id: 'box', available: 6, bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 6,
      wheelchairPlaces: 1, wheelchairAvailable: 1,
    })).toEqual({
      id: 'box', available: 6, bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 6,
      wheelchairPlaces: 1, wheelchairAvailable: 1,
    });
    // An older page sends none of them.
    expect(decodeGAArea({ id: 'ga', available: 6 })).toEqual({ id: 'ga', available: 6 });
  });

  it('sells per person from one up to what is free and left in the order', () => {
    expect(amounts({ available: 4 })).toEqual({ minimum: 1, maximum: 4, available: 4 });
    expect(amounts({ available: 99 })).toEqual({ minimum: 1, maximum: 10, available: 99 });
    expect(amounts({})).toEqual({ minimum: 1, maximum: 10, available: 0 });
    expect(amounts({ available: 0 })).toBeUndefined();
  });

  it('sells a whole box as exactly its places', () => {
    expect(amounts({ available: 8, bookingMode: 'whole', maxOccupancy: 8 })).toEqual({ minimum: 8, maximum: 8, available: 8 });
    // The places come from the capacity when no maximum is named.
    expect(amounts({ available: 8, bookingMode: 'whole', capacity: 8 })).toEqual({ minimum: 8, maximum: 8, available: 8 });
    expect(amounts({ available: 0, bookingMode: 'whole', maxOccupancy: 8 })).toBeUndefined();
    // More places than the order may still take: it cannot be offered.
    expect(amounts({ available: 8, bookingMode: 'whole', maxOccupancy: 8 }, { remaining: 7 })).toBeUndefined();
  });

  it('sells a party box inside its range', () => {
    const box = { available: 6, bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 6 };
    expect(amounts(box)).toEqual({ minimum: 2, maximum: 6, available: 6 });
    expect(amounts(box, { remaining: 4 })).toEqual({ minimum: 2, maximum: 4, available: 6 });
    expect(amounts(box, { remaining: 1 })).toBeUndefined();
    expect(amounts({ ...box, minOccupancy: undefined })).toEqual({ minimum: 1, maximum: 6, available: 6 });
  });

  it('offers wheelchair places alone while the wheelchair filter is on', () => {
    const only = { wheelchairOnly: true };
    expect(amounts({ available: 40, wheelchairPlaces: 4, wheelchairAvailable: 3 }, only))
      .toEqual({ minimum: 1, maximum: 3, available: 3 });
    expect(amounts({ available: 40 }, only)).toBeUndefined();
    const box = { available: 6, bookingMode: 'variable', minOccupancy: 2, maxOccupancy: 6 };
    expect(amounts(box, only)).toBeUndefined();
    expect(amounts({ ...box, wheelchairPlaces: 1 }, only)).toEqual({ minimum: 2, maximum: 6, available: 6 });
  });
});

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}

async function readyPicker(): Promise<{ picker: SeatLayerPickerController; transport: Transport }> {
  const config = { enable3D: false, enableSeatView: false };
  const profile = pickerBridgeProfile({ config });
  const transport = new Transport();
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(transport, { event: 'ev' }, { config });
  picker.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 }, capabilities: [...profile.requiredCapabilities],
      commands: [...profile.requiredCommands], events: ['sys.ready', 'picker.snapshot'],
    },
  });
  picker.mapController.ingestRaw({ sl: 1, k: 'evt', t: 'sys.ready', n: 1, p: { protocol: 2, snapshot: snapshot(1) } });
  await started;
  return { picker, transport };
}

const snapshot = (revision: number) => ({
  schema: seatLayerPickerSnapshotSchema, sessionId: 'session', revision,
  event: { key: 'ev', currency: 'EUR' }, branding: {}, catalog: {}, map: {},
  selection: { seats: [] }, cart: { items: [] }, hold: { active: false }, access: {},
});

describe('a standing amount the page refuses', () => {
  const hold = async (reply: object) => {
    const { picker, transport } = await readyPicker();
    const flight = picker.holdGA('ga', 2);
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const id = transport.frames[transport.frames.length - 1]?.id;
    picker.mapController.ingestRaw({ sl: 1, k: 'res', t: 'res', id, p: { ...reply, snapshot: snapshot(2) } });
    return flight.finally(() => picker.dispose());
  };

  it('is refused to the caller as well', async () => {
    await expect(hold({ held: false, expiresAt: null })).rejects.toMatchObject({ code: 'hold_unavailable' });
  });

  it('is a hold when the page says so, or is older than the answer', async () => {
    await expect(hold({ held: true, expiresAt: 9_000 })).resolves.toMatchObject({ revision: 2 });
    await expect(hold({})).resolves.toMatchObject({ revision: 2 });
  });
});
