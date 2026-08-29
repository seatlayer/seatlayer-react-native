import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerController } from '../src/controller';
import { SeatLayerPickerController } from '../src/picker/controller';
import { pickerLifecycleAvailabilitySink, reselectSeatLayerPickerLapse } from '../src/picker/availabilityActions';
import { SeatLayerPickerLifecycleCoordinator } from '../src/picker/scopeLifecycle';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

const config = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config });
const snapshot = (revision: number) => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId: 'lifecycle',
  revision,
  event: { key: 'ev', currency: 'USD' },
  branding: {},
  catalog: {},
  map: {},
  selection: { seats: [] },
  cart: { items: [] },
  hold: {},
  access: {},
});

const settleLifecycle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class ManualTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
  commands(): Envelope[] {
    return this.frames.filter((frame) => frame.kind === 'cmd');
  }
}

async function mounted(
  options: {
    borrowed?: SeatLayerController;
    capabilities?: readonly string[];
    commands?: readonly string[];
    events?: readonly string[];
    wait?: number;
  } = {},
) {
  const transport = new ManualTransport();
  const picker = new SeatLayerPickerController(options.borrowed, {
    revisionWaitMs: options.wait,
  });
  const ready = picker.beginHandshake(transport, { event: 'ev' }, { config });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: options.capabilities ?? [...profile.requiredCapabilities],
      commands: options.commands ?? [...profile.requiredCommands],
      events: options.events ?? ['picker.snapshot'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: snapshot(1) },
  });
  await ready;
  return { picker, transport };
}

function reply(
  picker: SeatLayerPickerController,
  frame: Envelope,
  payload: object,
): void {
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'res',
    t: frame.type,
    id: frame.id,
    p: payload,
  });
}

describe('picker optional capability and event ownership matrix', () => {
  it('uses a decoded lifecycle outcome once and otherwise makes exactly one refresh/synchronize fallback', async () => {
    const run = async (
      lifecycle: unknown,
      refreshed: unknown | Error,
    ) => {
      const calls = { refresh: 0, synchronize: 0, seen: 0 };
      const coordinator = new SeatLayerPickerLifecycleCoordinator({
        setLifecycle: async () => lifecycle,
        refreshAvailability: async () => {
          calls.refresh += 1;
          if (refreshed instanceof Error) throw refreshed;
          return refreshed;
        },
        synchronize: async () => { calls.synchronize += 1; },
      }, vi.fn(), () => { calls.seen += 1; });
      coordinator.markReady();
      coordinator.markReady();
      await settleLifecycle();
      return calls;
    };

    await expect(run({ outcome: { holdLapsed: true } }, undefined)).resolves.toEqual({ refresh: 0, synchronize: 0, seen: 1 });
    const accessor = {};
    Object.defineProperty(accessor, 'outcome', { get: () => { throw new Error('getter'); } });
    const descriptorTrap = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('descriptor'); } });
    for (const lifecycle of [{ outcome: null }, { outcome: 1 }, { outcome: [] }, accessor, descriptorTrap]) {
      await expect(run(lifecycle, undefined)).resolves.toEqual({ refresh: 1, synchronize: 1, seen: 0 });
    }
    await expect(run(undefined, { outcome: { holdLapsed: true } })).resolves.toEqual({ refresh: 1, synchronize: 0, seen: 1 });
    await expect(run(undefined, { snapshot: { revision: 2 } })).resolves.toEqual({ refresh: 1, synchronize: 0, seen: 0 });
    const refreshAccessor = {};
    Object.defineProperty(refreshAccessor, 'snapshot', { get: () => { throw new Error('getter'); } });
    const refreshTrap = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('descriptor'); } });
    for (const refreshed of [undefined, { snapshot: null }, { snapshot: 1 }, { snapshot: [] }, refreshAccessor, refreshTrap, new Error('refresh')]) {
      await expect(run(undefined, refreshed)).resolves.toEqual({ refresh: 1, synchronize: 1, seen: 0 });
    }
  });

  it('skips only foreground availability refresh when refresh-on-resume is disabled', async () => {
    const run = async (refreshOnResume: boolean) => {
      const calls: string[] = [];
      const coordinator = new SeatLayerPickerLifecycleCoordinator({
        setLifecycle: async (state) => { calls.push(`lifecycle:${state}`); return undefined; },
        refreshAvailability: async () => { calls.push('refresh'); return undefined; },
        synchronize: async () => { calls.push('synchronize'); },
      }, vi.fn(), undefined, refreshOnResume);
      coordinator.markReady();
      await settleLifecycle();
      return calls;
    };
    await expect(run(true)).resolves.toEqual(['lifecycle:foreground', 'refresh', 'synchronize']);
    await expect(run(false)).resolves.toEqual(['lifecycle:foreground', 'synchronize']);
  });

  it('keeps the v2 required profile byte-for-byte compatible while advertising recovery capabilities as optional', () => {
    expect(profile.requiredCapabilities).toEqual([
      'picker-session-v2', 'picker-snapshot-v1', 'picker-actions-v1',
      'native-picker-chrome-v1', 'checkout-handoff-v1',
      'checkout-handoff-reject-v1', 'hold-ownership-v1',
      'cart-line-remove-v1', 'table-quantity-v1',
    ]);
    expect(profile.requiredCommands).toEqual([
      'picker.getSnapshot', 'picker.selectObjects', 'picker.deselectObjects',
      'picker.clearSelection', 'picker.selectCategories',
      'picker.deselectCategories', 'picker.setSeatTier',
      'picker.removeCartLine', 'picker.setTableQuantity',
      'picker.setSelectableObjects', 'picker.setMaxSelection',
      'picker.setCategoryFilter', 'picker.setAccessibilityFilter',
      'picker.setLimitedViewFilter', 'picker.focusSection', 'picker.overview',
      'picker.setRung', 'picker.setFloor', 'picker.setColorblindSafe',
      'picker.setThemeMode', 'picker.setViewMode',
      'picker.setInteractionEnabled', 'picker.zoomIn', 'picker.zoomOut',
      'picker.zoomToFit', 'picker.holdGA', 'picker.bestAvailable',
      'picker.resumeHold', 'picker.extendHold', 'picker.continue',
      'picker.rejectHandoff', 'picker.abort', 'picker.lifecycle',
      'picker.destroy',
    ]);
    expect(profile.optionalCapabilities).toEqual(expect.arrayContaining([
      'availability-refresh-v1', 'access-needs-v1', 'hold-selection-v1',
    ]));
  });

  it('coalesces refresh, ignores malformed snapshots, and retains combined reply data', async () => {
    const { picker, transport } = await mounted({
      capabilities: [...profile.requiredCapabilities, 'availability-refresh-v1'],
      commands: [...profile.requiredCommands, 'picker.refreshAvailability'],
    });
    const first = picker.refreshAvailability();
    expect(first).toBe(picker.refreshAvailability());
    await Promise.resolve();
    const refresh = transport.commands()[0]!;
    expect(refresh.type).toBe('picker.refreshAvailability');
    reply(picker, refresh, { snapshot: { junk: true } });
    await expect(first).resolves.toBeUndefined();

    const accessor = {};
    Object.defineProperty(accessor, 'snapshot', { get: () => { throw new Error('getter'); } });
    const accessorFlight = picker.refreshAvailability();
    await Promise.resolve();
    reply(picker, transport.commands()[1]!, accessor);
    await expect(accessorFlight).resolves.toBeUndefined();

    const combined = picker.refreshAvailability();
    await Promise.resolve();
    reply(picker, transport.commands()[2]!, {
      snapshot: snapshot(2),
      outcome: { holdLapsed: true, lapsedLabels: ['A-1'], recoverableLabels: ['A-1'] },
    });
    await expect(combined).resolves.toMatchObject({
      snapshot: { revision: 2 },
      outcome: { holdLapsed: true, lapsedLabels: ['A-1'] },
    });
    picker.dispose();
  });

  it('keeps setLifecycle compatible by returning the current snapshot for an outcome-only reply', async () => {
    const { picker, transport } = await mounted();
    const lifecycle = picker.setLifecycle('foreground');
    await Promise.resolve();
    reply(picker, transport.commands()[0]!, {
      outcome: { holdLapsed: true, lapsedLabels: ['A-1'], recoverableLabels: ['A-1'] },
    });
    await expect(lifecycle).resolves.toMatchObject({ revision: 1 });
    picker.dispose();
  });

  it('validates hold selection before optional capability fallback and preserves its payload', async () => {
    const unsupported = await mounted();
    await expect((unsupported.picker.holdSelection as unknown as (value: unknown) => Promise<unknown>)(null)).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(unsupported.picker.holdSelection({ ttlMs: 0 })).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(unsupported.picker.holdSelection()).resolves.toBeUndefined();
    expect(unsupported.transport.commands()).toHaveLength(0);
    unsupported.picker.dispose();
    await expect(unsupported.picker.holdSelection()).rejects.toMatchObject({ code: 'destroyed' });

    const supported = await mounted({
      capabilities: [...profile.requiredCapabilities, 'hold-selection-v1'],
      commands: [...profile.requiredCommands, 'picker.holdSelection'],
    });
    const omitted = supported.picker.holdSelection();
    await Promise.resolve();
    expect(supported.transport.commands()[0]).toMatchObject({ type: 'picker.holdSelection' });
    expect(supported.transport.commands()[0]).not.toHaveProperty('payload');
    reply(supported.picker, supported.transport.commands()[0]!, { revision: 1 });
    await omitted;
    const ttl = supported.picker.holdSelection({ ttlMs: 120000 });
    await Promise.resolve();
    expect(supported.transport.commands()[1]).toMatchObject({ type: 'picker.holdSelection', payload: { ttlMs: 120000 } });
    reply(supported.picker, supported.transport.commands()[1]!, { revision: 1 });
    await ttl;
    supported.picker.dispose();
  });

  it('preserves a lifecycle lapse outcome and does not issue a refresh afterwards', async () => {
    const { picker, transport } = await mounted({
      capabilities: [...profile.requiredCapabilities, 'availability-refresh-v1'],
      commands: [...profile.requiredCommands, 'picker.refreshAvailability'],
    });
    const seen = vi.fn();
    const coordinator = new SeatLayerPickerLifecycleCoordinator(pickerLifecycleAvailabilitySink(picker), vi.fn(), seen);
    coordinator.markReady();
    await Promise.resolve();
    const lifecycle = transport.commands()[transport.commands().length - 1]!;
    expect(lifecycle.type).toBe('picker.lifecycle');
    reply(picker, lifecycle, { revision: 1, outcome: { holdLapsed: true, lapsedLabels: ['A-1'], recoverableLabels: ['A-1'] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ holdLapsed: true, lapsedLabels: ['A-1'] }));
    expect(transport.commands().filter((frame) => frame.type === 'picker.refreshAvailability')).toHaveLength(0);
    picker.dispose();
  });

  it('orders recovery select then an optional TTL hold without checkout', async () => {
    const { picker, transport } = await mounted({
      capabilities: [...profile.requiredCapabilities, 'hold-selection-v1'],
      commands: [...profile.requiredCommands, 'picker.holdSelection'],
    });
    const flight = reselectSeatLayerPickerLapse(picker, ['A-1'], 120000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const select = transport.commands()[transport.commands().length - 1]!;
    expect(select.type).toBe('picker.selectObjects');
    expect(select.payload).toEqual({ objects: ['A-1'] });
    reply(picker, select, { revision: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hold = transport.commands()[transport.commands().length - 1]!;
    expect(hold.type).toBe('picker.holdSelection');
    expect(hold.payload).toEqual({ ttlMs: 120000 });
    reply(picker, hold, { revision: 1 });
    await flight;
    expect(transport.commands().some((frame) => frame.type === 'picker.continue')).toBe(false);
    picker.dispose();
  });

  it('does not send an empty recovery selection', async () => {
    const { picker, transport } = await mounted();
    await expect(reselectSeatLayerPickerLapse(picker, [])).resolves.toBeUndefined();
    expect(transport.commands()).toHaveLength(0);
    picker.dispose();
  });
  it(
    'no-ops when either viewport-inset prerequisite is absent and clamps/nulls payloads',
    async () => {
      const capabilitiesOnly = await mounted({
        capabilities: [...profile.requiredCapabilities, 'viewport-insets-v1'],
      });
      await expect(
        capabilitiesOnly.picker.setViewportInsets({
          top: 1,
          right: 1,
          bottom: 1,
          left: 1,
        }),
      ).resolves.toBeUndefined();
      expect(capabilitiesOnly.transport.commands()).toHaveLength(0);
      capabilitiesOnly.picker.dispose();

      const commandsOnly = await mounted({
        commands: [...profile.requiredCommands, 'picker.setViewportInsets'],
      });
      await expect(
        commandsOnly.picker.setViewportInsets({
          top: 1,
          right: 1,
          bottom: 1,
          left: 1,
        }),
      ).resolves.toBeUndefined();
      expect(commandsOnly.transport.commands()).toHaveLength(0);
      commandsOnly.picker.dispose();

      const active = await mounted({
        capabilities: [...profile.requiredCapabilities, 'viewport-insets-v1'],
        commands: [...profile.requiredCommands, 'picker.setViewportInsets'],
      });
      const clamped = active.picker.setViewportInsets({
        top: -1,
        right: Number.POSITIVE_INFINITY,
        bottom: Number.NaN,
        left: 4,
      });
      await Promise.resolve();
      const first = active.transport.commands()[0]!;
      expect(first).toMatchObject({
        type: 'picker.setViewportInsets',
        payload: { top: 0, right: 0, bottom: 0, left: 4 },
      });
      reply(active.picker, first, { snapshot: snapshot(99) });
      await clamped;
      expect(active.picker.getSnapshot()?.revision).toBe(1);
      const cleared = active.picker.setViewportInsets(null);
      await Promise.resolve();
      const second = active.transport.commands()[1]!;
      expect(second).toMatchObject({
        type: 'picker.setViewportInsets',
        payload: { insets: null },
      });
      reply(active.picker, second, { snapshot: snapshot(100) });
      await cleared;
      active.picker.dispose();
    },
  );

  it.each([
    ['capability only', ['native-seat-view-chrome-v1'], ['picker.snapshot']],
    ['event only', [], ['picker.snapshot', 'seatView.changed']],
  ])(
    'does not grant native seat-view ownership with %s',
    async (_name, capabilities, events) => {
      const { picker } = await mounted({
        capabilities: [...profile.requiredCapabilities, ...capabilities],
        events,
      });
      const listener = vi.fn();
      picker.subscribeSeatView(listener);
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'seatView.changed',
        n: 2,
        p: { seatView: { seatId: 's1', real: true } },
      });
      expect(picker.supportsNativeSeatViewChrome).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      picker.dispose();
    },
  );

  it(
    'owns seat-view events only with cap plus event, deduping and notifying clear once',
    async () => {
      const { picker } = await mounted({
        capabilities: [
          ...profile.requiredCapabilities,
          'native-seat-view-chrome-v1',
        ],
        events: ['picker.snapshot', 'seatView.changed'],
      });
      const listener = vi.fn();
      picker.subscribeSeatView(listener);
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'seatView.changed',
        n: 2,
        p: { seatView: { seatId: 's1', real: true } },
      });
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'seatView.changed',
        n: 3,
        p: { seatView: { seatId: 's1', real: true } },
      });
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'seatView.changed',
        n: 4,
        p: { seatView: null },
      });
      expect(picker.supportsNativeSeatViewChrome).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(picker.getSeatView()).toBeUndefined();
      picker.dispose();
    },
  );
});

describe('picker revision, checkout, and disposal matrix', () => {
  it('waits the default 2000ms then synchronizes a target revision', async () => {
    vi.useFakeTimers();
    try {
      const { picker, transport } = await mounted();
      const action = picker.clearSelection();
      await Promise.resolve();
      const mutation = transport.commands()[0]!;
      reply(picker, mutation, { revision: 2 });
      await vi.advanceTimersByTimeAsync(1999);
      expect(
        transport.commands().filter((frame) =>
          frame.type === 'picker.getSnapshot'
        ),
      ).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      const fallback = transport.commands()[1]!;
      expect(fallback.type).toBe('picker.getSnapshot');
      reply(picker, fallback, { snapshot: snapshot(2) });
      await expect(action).resolves.toMatchObject({ revision: 2 });
      picker.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects stale fallback snapshots as bad_payload', async () => {
    vi.useFakeTimers();
    try {
      const { picker, transport } = await mounted();
      const action = picker.clearSelection();
      await Promise.resolve();
      reply(picker, transport.commands()[0]!, { revision: 2 });
      await vi.advanceTimersByTimeAsync(2000);
      reply(picker, transport.commands()[1]!, { snapshot: snapshot(1) });
      await expect(action).rejects.toMatchObject({ code: 'bad_payload' });
      picker.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dedupes checkout by reference and returns the exact handoff', async () => {
    const { picker, transport } = await mounted();
    const first = picker.checkout(300);
    expect(first).toBe(picker.checkout(300));
    await Promise.resolve();
    const command = transport.commands()[0]!;
    reply(picker, command, {
      handoff: {
        holdId: 'hold_1',
        expiresAt: 5,
        currency: 'EUR',
        lineItems: [],
        total: 12,
      },
    });
    await expect(first).resolves.toEqual({
      holdId: 'hold_1',
      expiresAt: 5,
      currency: 'EUR',
      lineItems: [],
      total: 12,
    });
    picker.dispose();
  });

  it(
    'disposes owned maps, preserves borrowed maps, cancels queued work, and ignores late replies',
    async () => {
      const owned = await mounted();
      const ownedDispose = vi.spyOn(owned.picker.mapController, 'dispose');
      owned.picker.dispose();
      expect(ownedDispose).toHaveBeenCalledOnce();

      const borrowedMap = new SeatLayerController();
      const borrowed = await mounted({ borrowed: borrowedMap });
      const borrowedDispose = vi.spyOn(borrowedMap, 'dispose');
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const first = borrowed.picker.clearSelection();
      const second = borrowed.picker.zoomIn();
      await Promise.resolve();
      const firstCommand = borrowed.transport.commands()[0]!;
      borrowed.picker.dispose();
      await expect(first).rejects.toMatchObject({ code: 'destroyed' });
      await expect(second).rejects.toMatchObject({ code: 'destroyed' });
      expect(borrowed.transport.commands()).toHaveLength(1);
      reply(borrowed.picker, firstCommand, { snapshot: snapshot(2) });
      await Promise.resolve();
      expect(borrowed.picker.getSnapshot()?.revision).toBe(1);
      expect(borrowedDispose).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      process.off('unhandledRejection', unhandled);
    },
  );
});
