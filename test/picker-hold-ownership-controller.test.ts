import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerPickerController } from '../src/picker/controller';
import {
  seatLayerPickerSnapshotSchema,
  type SeatLayerPickerCheckoutHandoff,
} from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

const snapshot = (revision: number, hold: object) => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId: 'session',
  revision,
  event: { key: 'ev', currency: 'EUR' },
  branding: {},
  catalog: {},
  map: {},
  selection: { seats: [] },
  cart: { items: [] },
  hold,
  access: {},
});

async function readyPicker(): Promise<{ picker: SeatLayerPickerController; transport: Transport }> {
  const transport = new Transport();
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(transport, { event: 'ev' }, { config: baseConfig });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [
        ...profile.requiredCapabilities,
        'hold-ownership-v1',
        'checkout-handoff-v1',
        'checkout-handoff-reject-v1',
      ],
      commands: [...profile.requiredCommands, 'picker.continue', 'picker.rejectHandoff'],
      events: ['sys.ready', 'picker.snapshot', 'hold.expired'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: snapshot(1, { active: false }) },
  });
  await started;
  return { picker, transport };
}

function reply(picker: SeatLayerPickerController, transport: Transport, payload: unknown): void {
  const last = transport.frames[transport.frames.length - 1];
  picker.mapController.ingestRaw({ sl: 1, k: 'res', t: 'res', id: last?.id, p: payload });
}

function push(picker: SeatLayerPickerController, revision: number, hold: object): void {
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'picker.snapshot',
    n: revision + 1,
    p: { snapshot: snapshot(revision, hold) },
  });
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function handOff(
  picker: SeatLayerPickerController,
  transport: Transport,
): Promise<SeatLayerPickerCheckoutHandoff> {
  const flight = picker.checkout();
  await flush();
  reply(picker, transport, {
    snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }),
    handoff: {
      holdId: 'hold-9',
      expiresAt: 9_000,
      currency: 'EUR',
      lineItems: [],
      total: 0,
    },
  });
  return flight;
}

describe('§4.8 the hold id arrives only at the handoff', () => {
  it('is absent before the handoff and retained after it', async () => {
    const { picker, transport } = await readyPicker();
    expect(picker.getCheckoutHandoff()).toBeUndefined();
    const handoff = await handOff(picker, transport);
    expect(handoff.holdId).toBe('hold-9');
    expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
    // Snapshots deliberately never carry the booking capability.
    expect(JSON.stringify(picker.getSnapshot())).not.toContain('hold-9');
    picker.dispose();
  });

  it('releases the handoff so the seats go back on sale', async () => {
    const { picker, transport } = await readyPicker();
    await handOff(picker, transport);
    const flight = picker.releaseHandoffAndChangeSeats();
    await flush();
    const frame = transport.frames[transport.frames.length - 1]!;
    expect(frame.type).toBe('picker.rejectHandoff');
    expect(frame.payload).toMatchObject({ holdId: 'hold-9' });
    reply(picker, transport, { snapshot: snapshot(3, { active: false }) });
    expect(await flight).toBe(true);
    expect(picker.getCheckoutHandoff()).toBeUndefined();
    expect(picker.getBookedHandoff()).toBeUndefined();
    picker.dispose();
  });

  it('answers false with no handoff to give back', async () => {
    const { picker } = await readyPicker();
    expect(await picker.releaseHandoffAndChangeSeats()).toBe(false);
    picker.dispose();
  });
});

describe('a hold that leaves the map is no sale', () => {
  async function watched() {
    const { picker, transport } = await readyPicker();
    const booked = vi.fn();
    picker.subscribeBooked(booked);
    const handoff = await handOff(picker, transport);
    return { booked, handoff, picker, transport };
  }

  it('when the app rejects the checkout, as for a declined payment', async () => {
    const { booked, handoff, picker, transport } = await watched();
    const flight = picker.rejectHandoff(handoff.holdId);
    await flush();
    reply(picker, transport, { snapshot: snapshot(3, { active: false }) });
    await flight;
    expect(booked).not.toHaveBeenCalled();
    expect(picker.getBookedHandoff()).toBeUndefined();
    expect(picker.getCheckoutHandoff()).toBeUndefined();
    picker.dispose();
  });

  it('when the server no longer has it', async () => {
    const { booked, picker } = await watched();
    push(picker, 4, { active: false });
    push(picker, 5, { active: false });
    expect(booked).not.toHaveBeenCalled();
    expect(picker.getBookedHandoff()).toBeUndefined();
    picker.dispose();
  });

  it('when its time is up', async () => {
    const { booked, picker } = await watched();
    picker.mapController.ingestRaw({ sl: 1, k: 'evt', t: 'hold.expired', n: 40, p: {} });
    push(picker, 4, { active: false });
    expect(booked).not.toHaveBeenCalled();
    expect(picker.getBookedHandoff()).toBeUndefined();
    picker.dispose();
  });
});
