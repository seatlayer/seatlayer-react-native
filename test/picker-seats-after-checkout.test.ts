import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerError } from '../src/errors';
import { SeatLayerPickerController } from '../src/picker/controller';
import {
  completeSeatLayerPickerCartLines,
  seatLayerPickerCartLineFromSelectedSeat,
  seatLayerPickerCartLineQuantity,
} from '../src/picker/cartCompletion';
import { decodeSeatLayerPickerSnapshot } from '../src/picker/decode';
import {
  seatLayerPickerHoldOwnershipStore,
  seatLayerPickerUnsolicitedHoldOwnershipCodes,
} from '../src/picker/holdOwnership';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

/* --- the cart is completed from the selection ------------------------- */

const line = (label: string, price: number) => Object.freeze({
  lineKey: label, label, objectId: label, objectType: 'seat',
  categoryKey: 'std', unitPrice: price, currency: 'EUR', quantity: 1,
});

describe('seats added after checkout join the cart at once (Flutter 0.9.1)', () => {
  it('completes the cart from a seat the runtime selected but did not list', () => {
    const completed = completeSeatLayerPickerCartLines(
      [line('A-1', 25)],
      [
        { id: 's1', label: 'A-1', price: 25 },
        { id: 's2', label: 'A-2', price: 30, sectionLabel: '103', rowLabel: 'A', seatNumber: '2' },
      ],
    );
    expect(completed.completed).toBe(true);
    expect(completed.lines.map((entry) => entry.label)).toEqual(['A-1', 'A-2']);
    expect(completed.lines[1]).toMatchObject({
      label: 'A-2', unitPrice: 30, quantity: 1, sectionLabel: '103', rowLabel: 'A', seatNumber: '2',
    });
  });

  it('adds nothing where the runtime already lists every selected seat', () => {
    const completed = completeSeatLayerPickerCartLines(
      [line('A-1', 25), line('A-2', 30)],
      [{ id: 's1', label: 'A-1' }, { id: 's2', label: 'A-2' }],
    );
    expect(completed.completed).toBe(false);
    // The runtime's own lines are handed back untouched, object identity and all.
    expect(completed.lines).toHaveLength(2);
  });

  it('never doubles a label, however often the selection repeats it', () => {
    const completed = completeSeatLayerPickerCartLines(
      [],
      [{ id: 's1', label: 'A-1' }, { id: 's1', label: 'A-1' }],
    );
    expect(completed.lines).toHaveLength(1);
  });

  it('invents no price: a seat without one is a line at zero', () => {
    expect(seatLayerPickerCartLineFromSelectedSeat({ id: 's', label: 'A-1' }))
      .toMatchObject({ unitPrice: 0, quantity: 1, currency: 'USD', objectType: 'seat' });
  });
});

/* --- and the snapshot says so ----------------------------------------- */

function decode(cart: object, seats: readonly object[]) {
  return decodeSeatLayerPickerSnapshot({
    schema: seatLayerPickerSnapshotSchema,
    sessionId: 'session',
    revision: 3,
    event: { key: 'ev', currency: 'EUR' },
    branding: {}, catalog: {}, map: {},
    selection: { seats },
    cart,
    hold: { active: true, owner: 'host' },
    access: {},
  });
}

describe('the snapshot counts the seat the hold does not carry', () => {
  it('recounts tickets and total once a line has been added', () => {
    const snapshot = decode(
      { items: [{ label: 'A-1', unitPrice: 25, quantity: 1, currency: 'EUR' }], quantity: 1, total: 25 },
      [
        { id: 's1', label: 'A-1', price: 25 },
        { id: 's2', label: 'A-2', price: 30 },
      ],
    );
    expect(snapshot?.cartLines.map((entry) => entry.label)).toEqual(['A-1', 'A-2']);
    // The runtime's own 1 / €25 described the HOLD; the cart is now two seats.
    expect(snapshot?.ticketCount).toBe(2);
    expect(snapshot?.cartTotal).toBe(55);
  });

  it('keeps the runtime own quantity and total where nothing was added', () => {
    const snapshot = decode(
      { items: [{ label: 'A-1', unitPrice: 25, quantity: 1, currency: 'EUR' }], quantity: 4, total: 99 },
      [{ id: 's1', label: 'A-1', price: 25 }],
    );
    expect(snapshot?.ticketCount).toBe(4);
    expect(snapshot?.cartTotal).toBe(99);
  });

  it('counts the lines it holds', () => {
    expect(seatLayerPickerCartLineQuantity([
      { ...line('A-1', 10), quantity: 2 },
      line('A-2', 10),
    ])).toBe(3);
  });
});

/* --- Continue replaces the hold rather than refusing ------------------ */

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void { this.frames.push(frame); }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

const snapshot = (revision: number, hold: object) => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId: 'session',
  revision,
  event: { key: 'ev', currency: 'EUR' },
  branding: {}, catalog: {}, map: {},
  selection: { seats: [] },
  cart: { items: [] },
  hold,
  access: {},
});

async function readyPicker(commands: readonly string[] = ['hold']): Promise<{
  picker: SeatLayerPickerController; transport: Transport;
}> {
  const transport = new Transport();
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(transport, { event: 'ev' }, { config: baseConfig });
  picker.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, 'checkout-handoff-v1'],
      commands: [...profile.requiredCommands, 'picker.continue', ...commands],
      events: ['sys.ready', 'picker.snapshot', 'hold.expired'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'sys.ready', n: 1,
    p: { protocol: 2, snapshot: snapshot(1, { active: false }) },
  });
  await started;
  return { picker, transport };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function lastFrame(transport: Transport): Envelope {
  return transport.frames[transport.frames.length - 1]!;
}

function replyError(picker: SeatLayerPickerController, transport: Transport, code: string): void {
  picker.mapController.ingestRaw({
    sl: 1, k: 'err', t: 'err', id: lastFrame(transport).id, p: { code, message: 'nope' },
  });
}

function reply(picker: SeatLayerPickerController, transport: Transport, payload: unknown): void {
  picker.mapController.ingestRaw({
    sl: 1, k: 'res', t: 'res', id: lastFrame(transport).id, p: payload,
  });
}

const handoffReply = {
  snapshot: snapshot(2, { active: true, owner: 'host' }),
  handoff: { holdId: 'hold-9', expiresAt: 9_000, currency: 'EUR', lineItems: [], total: 0 },
};

describe('§3.13.13 Continue replaces the hold with every seat', () => {
  it('re-holds the whole selection and asks again, instead of refusing', async () => {
    const { picker, transport } = await readyPicker();
    const flight = picker.checkout(60_000);
    await flush();
    expect(lastFrame(transport).type).toBe('picker.continue');
    // Back from checkout with a seat the hold does not cover.
    replyError(picker, transport, 'hold_selection_mismatch');
    await flush();
    // The runtime's own hold call carries every held seat with the new ones.
    expect(lastFrame(transport).type).toBe('hold');
    expect(lastFrame(transport).payload).toMatchObject({ ttlMs: 60_000 });
    reply(picker, transport, { hold: { id: 'hold-9', expiresAt: 9_000 } });
    await flush();
    expect(lastFrame(transport).type).toBe('picker.continue');
    reply(picker, transport, handoffReply);
    expect((await flight).holdId).toBe('hold-9');
    picker.dispose();
  });

  it('keeps the refusal where the retry is refused in turn', async () => {
    const { picker, transport } = await readyPicker();
    const flight = picker.checkout();
    await flush();
    replyError(picker, transport, 'hold_selection_mismatch');
    await flush();
    reply(picker, transport, { hold: { id: 'hold-9' } });
    await flush();
    replyError(picker, transport, 'hold_selection_mismatch');
    await expect(flight).rejects.toMatchObject({ code: 'hold_selection_mismatch' });
    picker.dispose();
  });

  it('keeps the refusal where the runtime does not advertise its own hold', async () => {
    const { picker, transport } = await readyPicker([]);
    const flight = picker.checkout();
    await flush();
    replyError(picker, transport, 'hold_selection_mismatch');
    await expect(flight).rejects.toMatchObject({ code: 'hold_selection_mismatch' });
    // Nothing was tried behind the buyer's back.
    expect(transport.frames.filter((frame) => frame.type === 'hold')).toHaveLength(0);
    picker.dispose();
  });

  it('never replaces the hold for a refusal the picker may not answer', async () => {
    const { picker, transport } = await readyPicker();
    const flight = picker.checkout();
    await flush();
    replyError(picker, transport, 'hold_owned_by_host');
    await expect(flight).rejects.toMatchObject({ code: 'hold_owned_by_host' });
    expect(transport.frames.filter((frame) => frame.type === 'hold')).toHaveLength(0);
    picker.dispose();
  });

  it('clears a standing notice when a handoff lands', async () => {
    const { picker, transport } = await readyPicker();
    const store = seatLayerPickerHoldOwnershipStore(picker);
    expect(store.raise(new SeatLayerError('hold_already_active', 'x'), undefined)).toBe(true);
    const flight = picker.checkout();
    await flush();
    reply(picker, transport, handoffReply);
    await flight;
    expect(store.getSnapshot()).toBeUndefined();
    picker.dispose();
  });
});

describe('the notice states only what the runtime still refuses', () => {
  it('leaves the mismatch off the unsolicited path, and keeps the other two', () => {
    // `hold_selection_mismatch` is only ever the answer to `picker.continue`,
    // and that path now replaces the hold; an echo of it on the event channel
    // would state a stuck cart the buyer no longer has.
    expect([...seatLayerPickerUnsolicitedHoldOwnershipCodes])
      .toEqual(['hold_owned_by_host', 'hold_already_active']);
    const store = seatLayerPickerHoldOwnershipStore({});
    expect(store.raiseUnsolicited(new SeatLayerError('hold_selection_mismatch', 'x'), undefined))
      .toBe(false);
    expect(store.getSnapshot()).toBeUndefined();
    expect(store.raiseUnsolicited(new SeatLayerError('hold_owned_by_host', 'x'), { holdId: 'h' } as never))
      .toBe(true);
    // §3.13.13 is unchanged for a refusal that answers a command the picker
    // cannot retry — the cart row's own x still states it.
    expect(store.raise(new SeatLayerError('hold_selection_mismatch', 'x'), undefined)).toBe(true);
  });
});
