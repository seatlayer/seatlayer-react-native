import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerController } from '../src/controller';
import type { SeatLayerEventMap } from '../src/types';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

class Transport implements BridgeTransport {
  send(): void {}
}

const config = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config });

function state(
  revision = 1,
  areaIds: readonly string[] = ['ga-1'],
  sessionId = 'ga-session',
) {
  return {
    schema: seatLayerPickerSnapshotSchema,
    sessionId,
    revision,
    event: { key: 'event', currency: 'USD' },
    branding: {},
    catalog: { gaAreas: areaIds.map((id) => ({ id, label: `Catalog ${id}` })) },
    map: {},
    selection: { seats: [] },
    cart: { items: [] },
    hold: {},
    access: {},
  };
}

function hello(options: {
  capabilities?: readonly string[];
  commands?: readonly string[];
  events?: readonly string[];
} = {}) {
  return {
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, ...(options.capabilities ?? [])],
      commands: [...profile.requiredCommands, ...(options.commands ?? [])],
      events: [...profile.requiredEvents, ...(options.events ?? [])],
    },
  };
}

async function mounted(
  map = new SeatLayerController(),
  withSnapshot = true,
) {
  const picker = new SeatLayerPickerController(map);
  const pending = picker.beginHandshake(new Transport(), { event: 'event' }, {
    config,
  });
  map.ingestRaw(hello({ capabilities: ['ga'], events: ['ga.click'] }));
  map.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: withSnapshot ? { protocol: 2, snapshot: state() } : { protocol: 2 },
  });
  await pending;
  return { map, picker };
}

function click(map: SeatLayerController, area: Record<string, unknown>, n: number) {
  map.ingestRaw({ sl: 1, k: 'evt', t: 'ga.click', n, p: { area } });
}

function applySnapshot(
  map: SeatLayerController,
  revision: number,
  areaIds: readonly string[],
  n: number,
) {
  map.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'picker.snapshot',
    n,
    p: { snapshot: state(revision, areaIds) },
  });
}

describe('picker GA click candidates', () => {
  it('accepts only ready, advertised typed GA clicks whose id is in the snapshot catalog', async () => {
    const beforeReady = new SeatLayerPickerController();
    click(beforeReady.mapController, { id: 'ga-1' }, 1);
    expect(beforeReady.getGACandidate()).toBeUndefined();
    beforeReady.dispose();

    const { map: snapshotlessMap, picker: snapshotless } = await mounted(
      new SeatLayerController(),
      false,
    );
    click(snapshotlessMap, { id: 'ga-1' }, 2);
    expect(snapshotless.getGACandidate()).toBeUndefined();
    snapshotless.dispose();

    const { map, picker } = await mounted();
    click(map, { id: 'missing' }, 2);
    expect(picker.getGACandidate()).toBeUndefined();

    click(map, { id: 'ga-1', label: 'Untrusted', price: 1, tiers: [] }, 3);
    expect(picker.getGACandidate()).toEqual({ areaId: 'ga-1', clickEpoch: 1 });
    expect(Object.isFrozen(picker.getGACandidate())).toBe(true);

    map.bundleCapabilities = [];
    click(map, { id: 'ga-1' }, 4);
    expect(picker.getGACandidate()).toBeUndefined();
    map.bundleCapabilities = ['ga'];
    map.bundleEvents = [];
    click(map, { id: 'ga-1' }, 5);
    expect(picker.getGACandidate()).toBeUndefined();
    map.bundleEvents = ['ga.click'];
    map.bundleCommands = [];
    click(map, { id: 'ga-1' }, 6);
    expect(picker.getGACandidate()).toBeUndefined();
    picker.dispose();
  });

  it('uses increasing epochs and stable store identities, including exact clears', async () => {
    const { map, picker } = await mounted();
    const listener = vi.fn();
    const unsubscribe = picker.subscribeGACandidate(listener);
    expect(picker.getGACandidate()).toBe(picker.getGACandidate());

    click(map, { id: 'ga-1' }, 2);
    const first = picker.getGACandidate();
    expect(listener).toHaveBeenCalledTimes(1);
    click(map, { id: 'missing' }, 3);
    expect(picker.getGACandidate()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
    click(map, { id: 'ga-1' }, 4);
    const second = picker.getGACandidate();
    expect(second).toEqual({ areaId: 'ga-1', clickEpoch: 2 });
    expect(second).not.toBe(first);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(picker.clearGACandidate(first!.clickEpoch)).toBe(false);
    expect(picker.getGACandidate()).toBe(second);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(picker.clearGACandidate(second!.clickEpoch)).toBe(true);
    expect(picker.getGACandidate()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(picker.clearGACandidate(second!.clickEpoch)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    picker.dispose();
  });

  it('reconciles accepted snapshots and resets candidates for a new handshake', async () => {
    const { map, picker } = await mounted();
    const listener = vi.fn();
    picker.subscribeGACandidate(listener);
    click(map, { id: 'ga-1' }, 2);
    applySnapshot(map, 2, [], 3);
    expect(picker.getGACandidate()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);

    applySnapshot(map, 3, ['ga-1'], 4);
    click(map, { id: 'ga-1' }, 5);
    const reset = picker.beginHandshake(new Transport(), { event: 'next' }, {
      config,
    });
    map.ingestRaw(hello({ capabilities: ['ga'], events: ['ga.click'] }));
    map.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 6,
      p: { protocol: 2, snapshot: state(1, ['ga-1'], 'next-session') },
    });
    await reset;
    expect(picker.getGACandidate()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(4);
    picker.dispose();
  });

  it('clears and unsubscribes its candidate store on disposal', async () => {
    const map = new SeatLayerController();
    const unsubscribed: (keyof SeatLayerEventMap)[] = [];
    const originalOn = map.on.bind(map);
    vi.spyOn(map, 'on').mockImplementation(
      ((name, listener) => {
        const unsubscribe = originalOn(name as never, listener as never);
        return () => {
          unsubscribed.push(name);
          unsubscribe();
        };
      }) as typeof map.on,
    );
    const { picker } = await mounted(map);
    const listener = vi.fn();
    picker.subscribeGACandidate(listener);
    click(map, { id: 'ga-1' }, 2);
    picker.dispose();
    expect(picker.getGACandidate()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(unsubscribed).toContain('gaClick');
    expect(unsubscribed).toContain('unknownEvent');
    click(map, { id: 'ga-1' }, 3);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
