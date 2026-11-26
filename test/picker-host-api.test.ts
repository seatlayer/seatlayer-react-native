import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { decodeSelectedSeat } from '../src/decode';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerHostPricesPayload } from '../src/picker/hostPricing';
import { useSeatLayerHostPricingSync } from '../src/picker/hostPricingSync';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';
import { resolveSeatLayerPickerOptions, seatLayerPickerBridgeConfigFromOptions } from '../src/picker/options';
import { freezeSeatLayerPickerConfiguration } from '../src/picker/scopeConfiguration';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
  sent(command: string): unknown[] {
    return this.frames.filter((frame) => frame.kind === 'cmd' && frame.type === command).map((frame) => frame.payload);
  }
}

const config = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config });
const page = {
  capabilities: ['host-pricing-v1', 'hold-mark-booked-v1'],
  commands: ['picker.setPricing', 'picker.markBooked'],
};

const snapshot = (revision: number, hold: object = { active: false }) => ({
  schema: seatLayerPickerSnapshotSchema, sessionId: 'session', revision,
  event: { key: 'ev', currency: 'EUR' },
  branding: {}, catalog: {}, map: {}, selection: { seats: [] }, cart: { items: [] }, hold, access: {},
});

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function open(offers: typeof page, telemetry?: boolean) {
  const transport = new Transport();
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(
    transport, { event: 'ev', ...(telemetry === undefined ? {} : { telemetry }) }, { config },
  );
  picker.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, 'checkout-handoff-v1', ...offers.capabilities],
      commands: [...profile.requiredCommands, 'picker.continue', ...offers.commands],
      events: ['sys.ready', 'picker.snapshot', 'hold.expired'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'sys.ready', n: 1, p: { protocol: 2, snapshot: snapshot(1) },
  });
  await started;
  await flush();
  const reply = async (payload: unknown) => {
    const last = transport.frames[transport.frames.length - 1];
    picker.mapController.ingestRaw({ sl: 1, k: 'res', t: 'res', id: last?.id, p: payload as never });
    await flush();
  };
  return { picker, reply, transport };
}

describe("the app's own prices", () => {
  it('become what the map page takes, and nothing that is not a price', () => {
    expect(seatLayerHostPricesPayload({
      formatter: () => '',
      categories: {
        stalls: 45,
        circle: { base: 30, tiers: { child: 12.5, bad: -1 } },
        box: { tiers: { adult: 0 } },
        negative: -1, word: '45', nothing: {}, none: null, endless: Infinity, list: [1],
      },
      objects: { 'A-12': 60, 'A-13': { tiers: { adult: 60 } }, 'A-14': { base: 9 }, '': 4 },
    })).toEqual({
      prices: { stalls: 45, circle: { base: 30, tiers: { child: 12.5 } }, box: { tiers: { adult: 0 } } },
      objects: { 'A-12': 60, 'A-13': { tiers: { adult: 60 } } },
    });
    for (const none of [undefined, null, 4, 'x', [], {}, { categories: {} }, { objects: { a: 'b' } }]) {
      expect(seatLayerHostPricesPayload(none)).toBeNull();
    }
  });

  it('never calls a getter and never throws on a hostile object', () => {
    const read = vi.fn(() => 45);
    expect(seatLayerHostPricesPayload({
      categories: Object.defineProperty({}, 'stalls', { enumerable: true, get: read }),
    })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(seatLayerHostPricesPayload(new Proxy({}, { ownKeys: () => { throw new Error('no'); } }))).toBeNull();
  });

  it('keep the formatter apart, and stay out of what reloads the map', () => {
    const formatter = (): string => 'x';
    const options = resolveSeatLayerPickerOptions({ pricing: { formatter, categories: { stalls: 45 } } });
    expect(options.pricing).toEqual({ formatter, categories: { stalls: 45 } });
    expect(resolveSeatLayerPickerOptions({ pricing: { categories: { stalls: 45 } } }).pricing)
      .toEqual({ categories: { stalls: 45 } });
    expect(resolveSeatLayerPickerOptions({ pricing: {} }).pricing).toBeUndefined();
    expect(seatLayerPickerBridgeConfigFromOptions(options)).not.toHaveProperty('pricing');
  });

  it('reach an open map, and null gives it back its own', async () => {
    const { picker, reply, transport } = await open(page);
    expect(picker.supportsHostPricing).toBe(true);
    const told = picker.setPricing({ categories: { stalls: 45 } });
    await flush();
    await reply({ revision: 2, snapshot: snapshot(2) });
    await expect(told).resolves.toBeUndefined();
    const back = picker.setPricing(null);
    await flush();
    await reply({ revision: 3, snapshot: snapshot(3) });
    await back;
    expect(transport.sent('picker.setPricing')).toEqual([
      { pricing: { prices: { stalls: 45 } } }, { pricing: null },
    ]);
    await expect(picker.setPricing(4 as never)).rejects.toMatchObject({ code: 'bad_payload' });
  });

  it('are told again when they change or another page takes the place, and only then', () => {
    const setPricing = vi.fn(() => Promise.resolve());
    const controller = { setPricing } as unknown as SeatLayerPickerController;
    const boot = { prices: { stalls: 45 } };
    const onError = vi.fn();
    function Probe(props: { amount: number; ready?: boolean; session?: string }): null {
      useSeatLayerHostPricingSync({
        boot, controller, isReady: props.ready ?? true, onError,
        pricing: { categories: { stalls: props.amount } }, session: props.session ?? 'one',
      });
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    const draw = (props: React.ComponentProps<typeof Probe>) => act(() => {
      if (tree === undefined) tree = TestRenderer.create(React.createElement(Probe, props));
      else tree.update(React.createElement(Probe, props));
    });
    draw({ amount: 45, ready: false });
    draw({ amount: 45 });
    draw({ amount: 45 });
    expect(setPricing).not.toHaveBeenCalled();
    draw({ amount: 50 });
    draw({ amount: 50 });
    expect(setPricing).toHaveBeenCalledTimes(1);
    draw({ amount: 50, session: 'two' });
    expect(setPricing).toHaveBeenCalledTimes(2);
    draw({ amount: 45, session: 'three' });
    expect(setPricing).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });
});

describe('a hold the app has booked', () => {
  async function handedOff(offers = page) {
    const opened = await open(offers);
    const flight = opened.picker.checkout();
    await flush();
    await opened.reply({
      snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }),
      handoff: { holdId: 'hold-9', expiresAt: 9_000, currency: 'EUR', lineItems: [], total: 0 },
    });
    await flight;
    const booked = vi.fn();
    opened.picker.subscribeBooked(booked);
    return { ...opened, booked };
  }

  it('is settled at once, and the app hears of the sale once', async () => {
    const { booked, picker, reply, transport } = await handedOff();
    expect(picker.supportsMarkBooked).toBe(true);
    const marked = picker.markBooked({ holdId: 'hold-9' });
    await flush();
    await reply({ booked: true, status: 'booked', holdId: 'hold-9', revision: 3, snapshot: snapshot(3) });
    await expect(marked).resolves.toBe(true);
    expect(transport.sent('picker.markBooked')).toEqual([{ holdId: 'hold-9' }]);
    expect(booked).toHaveBeenCalledOnce();
    expect(booked.mock.calls[0]?.[0]).toMatchObject({ holdId: 'hold-9' });
  });

  it('is a sale too when the page let go of the hold before it answered', async () => {
    const { booked, picker, reply } = await handedOff();
    const marked = picker.markBooked();
    await flush();
    picker.mapController.ingestRaw({ sl: 1, k: 'evt', t: 'picker.snapshot', n: 9, p: snapshot(3) as never });
    expect(picker.getSnapshot()?.hold.active).toBe(false);
    expect(booked).not.toHaveBeenCalled();
    await reply({ booked: true, status: 'booked', holdId: 'hold-9', revision: 4, snapshot: snapshot(4) });
    await expect(marked).resolves.toBe(true);
    expect(booked).toHaveBeenCalledOnce();
    expect(picker.getBookedHandoff()).toMatchObject({ holdId: 'hold-9' });
  });

  it('without an id means the hold handed to checkout', async () => {
    const { picker, reply, transport } = await handedOff();
    const marked = picker.markBooked();
    await flush();
    await reply({ booked: true, status: 'booked', holdId: 'hold-9', revision: 3, snapshot: snapshot(3) });
    await expect(marked).resolves.toBe(true);
    expect(transport.sent('picker.markBooked')).toEqual([{}]);
  });

  it('is left alone when it is another hold', async () => {
    const { booked, picker, reply } = await handedOff();
    const marked = picker.markBooked({ holdId: 'hold-1' });
    await flush();
    await reply({ booked: false, status: 'different_hold', revision: 2 });
    await expect(marked).resolves.toBe(false);
    expect(booked).not.toHaveBeenCalled();
    expect(picker.getSnapshot()?.hold.active).toBe(true);
    await expect(picker.markBooked({ holdId: ' ' })).rejects.toMatchObject({ code: 'bad_payload' });
  });
});

describe('a booked hold is told once', () => {
  it('also after the buyer starts a second cart', async () => {
    const { picker, reply } = await open(page);
    const flight = picker.checkout();
    await flush();
    await reply({
      snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }),
      handoff: { holdId: 'hold-9', expiresAt: 9_000, currency: 'EUR', lineItems: [], total: 0 },
    });
    await flight;
    const booked = vi.fn();
    picker.subscribeBooked(booked);
    const first = picker.markBooked({ holdId: 'hold-9' });
    await flush();
    await reply({ booked: true, status: 'booked', holdId: 'hold-9', revision: 3, snapshot: snapshot(3) });
    await expect(first).resolves.toBe(true);
    expect(booked).toHaveBeenCalledOnce();
    // The buyer picks again: a new hold of the picker's own.
    const again = { active: true, owner: 'picker', expiresAt: 12_000 };
    picker.mapController.ingestRaw({
      sl: 1, k: 'evt', t: 'picker.snapshot', n: 20, p: { snapshot: snapshot(4, again) } as never,
    });
    for (const options of [{ holdId: 'hold-9' }, {}]) {
      const marked = picker.markBooked(options);
      await flush();
      await reply({ booked: true, status: 'booked', holdId: 'hold-9', revision: 5, snapshot: snapshot(5, again) });
      await marked;
    }
    expect(booked).toHaveBeenCalledOnce();
  });
});

describe('a map page that knows neither', () => {
  it.each([
    [{ capabilities: [], commands: [] }],
    [{ capabilities: page.capabilities, commands: [] }],
    [{ capabilities: [], commands: page.commands }],
  ])('answers "not supported", sends nothing and throws nothing', async (offers) => {
    const { picker, transport } = await open(offers);
    expect(picker.supportsHostPricing).toBe(false);
    expect(picker.supportsMarkBooked).toBe(false);
    await expect(picker.setPricing({ objects: { 'A-1': 5 } })).resolves.toBeUndefined();
    await expect(picker.markBooked({ holdId: 'hold-9' })).resolves.toBe(false);
    await expect(picker.markBooked()).resolves.toBe(false);
    expect(transport.sent('picker.setPricing')).toEqual([]);
    expect(transport.sent('picker.markBooked')).toEqual([]);
  });
});

it('a seat names its level', () => {
  const seat = { id: 's', label: 'A-1', objectId: 'o', floorId: 'floor-2', levelName: 'Balcony' };
  expect(decodeSelectedSeat(seat)).toMatchObject({ floorId: 'floor-2', levelName: 'Balcony' });
  expect(decodeSelectedSeat({ ...seat, levelName: undefined, floorId: 4 })).not.toHaveProperty('floorId');
});

it('telemetry reaches the map page only when the app says so', async () => {
  const sent = async (telemetry?: boolean) => {
    const { transport } = await open(page, telemetry);
    const init = transport.frames.find((frame) => frame.kind === 'init');
    return (init?.payload as { config: Record<string, unknown> }).config;
  };
  expect(await sent(false)).toMatchObject({ telemetry: false });
  expect(await sent()).not.toHaveProperty('telemetry');
  expect(freezeSeatLayerPickerConfiguration({ event: 'ev', telemetry: false })).toEqual({ event: 'ev', telemetry: false });
});
