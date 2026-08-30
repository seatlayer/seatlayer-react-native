import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import { pickerBridgeProfile } from '../src/bridge/profile';
import type { Envelope } from '../src/bridge/envelope';
import { SeatLayerController } from '../src/controller';
import { SeatLayerPickerController } from '../src/picker/controller';
import { decodeSeatLayerPickerSnapshot } from '../src/picker/decode';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';
import { SeatLayerPickerSnapshotStore } from '../src/picker/snapshot-store';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}
const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });
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
const hello = (
  capabilities = [...profile.requiredCapabilities],
  commands = [...profile.requiredCommands, 'picker.setThemeMode'],
) => ({
  sl: 1,
  k: 'hello',
  t: 'hello',
  p: {
    protocol: { min: 2, max: 2 },
    capabilities,
    commands,
    events: ['sys.ready', 'picker.snapshot', 'seatView.changed'],
  },
});
const ready = (controller: SeatLayerController, state = snapshot()) =>
  controller.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: state },
  });

describe('protocol-2 picker substrate', () => {
  it(
    'keeps raw init v1 while picker init is v2 and capability-gated chrome suppression',
    async () => {
      const rawTransport = new Transport();
      const raw = new SeatLayerController();
      const rawReady = raw.beginHandshake(rawTransport, { event: 'ev' });
      raw.ingestRaw({
        sl: 1,
        k: 'hello',
        t: 'hello',
        p: {
          protocol: { min: 1, max: 1 },
          commands: [],
          capabilities: [],
          events: [],
        },
      });
      expect(rawTransport.frames[0]).toMatchObject({
        type: 'init',
        payload: {
          protocol: { min: 1, max: 1 },
          chrome: { seatTooltip: false },
        },
      });
      raw.dispose();
      await expect(rawReady).rejects.toMatchObject({ code: 'destroyed' });
      const transport = new Transport();
      const picker = new SeatLayerPickerController();
      const started = picker.beginHandshake(transport, { event: 'ev' }, {
        config: baseConfig,
      });
      picker.mapController.ingestRaw(
        hello([...profile.requiredCapabilities, 'native-seat-view-chrome-v1']),
      );
      expect(transport.frames[0]).toMatchObject({
        type: 'init',
        payload: {
          protocol: { min: 2, max: 2 },
          surface: { kind: 'picker', stateContract: 1, chromeOwner: 'native' },
          chrome: {
            seatViewTitle: false,
            seatViewCaption: false,
            seatViewBadge: false,
          },
          requirements: { capabilities: [...profile.requiredCapabilities] },
        },
      });
      ready(picker.mapController);
      await started;
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'seatView.changed',
        n: 2,
        p: { seatView: { seatId: 's1', title: 'View', real: true } },
      });
      expect(picker.getSeatView()).toMatchObject({
        seatId: 's1',
        title: 'View',
        real: true,
      });
      picker.dispose();
      const incompatible = new SeatLayerPickerController();
      const rejected = incompatible.beginHandshake(new Transport(), {
        event: 'ev',
      }, { config: baseConfig });
      incompatible.mapController.ingestRaw(hello([]));
      await expect(rejected).rejects.toMatchObject({ code: 'sl_incompatible' });
      incompatible.dispose();
    },
  );

  it(
    'decodes no invented chrome node, freezes nested data, and only publishes accepted revisions',
    () => {
      const decoded = decodeSeatLayerPickerSnapshot(snapshot(4, {
        catalog: {
          categories: [{
            key: 'a',
            tiers: [{
              id: 'low',
              name: 'Low',
              price: 50,
              currency: 'USD',
              restriction: 'limited',
              buyerMessage: 'Note',
            }, { id: 'high', name: 'High', price: 100 }],
          }],
        },
        map: {
          view3dTargetSeatId: 'seat-3d',
          view3dTargetSeat: {
            id: 'seat-3d',
            label: 'E-29',
            sectionLabel: 'Orchestra',
            rowLabel: 'E',
            seatNumber: '29',
            categoryKey: 'premium',
            price: 150,
            currency: 'EUR',
          },
          view3dPreviousSeatId: 'seat-28',
          view3dNextSeatId: null,
          view3dFocusedSectionId: 'orchestra',
          floorMode: 'all',
          floorLabelStyle: 'number',
          floors: [{ id: 'f1', name: 'Ground', level: 0 }],
          accessNeeds: [
            { key: 'wheelchair', count: -3 },
            { key: '  ', count: 4 },
            { key: 'wheelchair', count: 9 },
            { key: 'hearing', count: 2 },
          ],
        },
        selection: {
          seats: [{
            id: 's1',
            label: 'A-1',
            objectType: 'table',
            sectionLabel: 'Stalls',
            quantity: 2,
            bookingMode: 'variable',
          }],
        },
        future: { allowed: true },
      }))!;
      expect('chrome' in decoded).toBe(false);
      expect([decoded.categories[0]?.priceMin, decoded.categories[0]?.priceMax])
        .toEqual([50, 100]);
      expect(decoded.categories[0]?.tiers[0]).toMatchObject({
        currency: 'USD',
        restriction: 'limited',
        buyerMessage: 'Note',
      });
      expect(decoded.selection[0]).toMatchObject({
        objectType: 'table',
        sectionLabel: 'Stalls',
        quantity: 2,
        bookingMode: 'variable',
      });
      expect(decoded.map).toMatchObject({
        view3DTargetSeatId: 'seat-3d',
        view3DTargetSeat: {
          id: 'seat-3d',
          label: 'E-29',
          sectionLabel: 'Orchestra',
          rowLabel: 'E',
          seatNumber: '29',
        },
        view3DPreviousSeatId: 'seat-28',
        view3DNextSeatId: null,
        view3DFocusedSectionId: 'orchestra',
        floorMode: 'all',
        floorLabelStyle: 'number',
        floors: [{ name: 'Ground', level: 0 }],
        accessNeeds: [{ key: 'wheelchair', count: 0 }, { key: 'hearing', count: 2 }],
      });
      expect(Object.isFrozen(decoded)).toBe(true);
      expect(Object.isFrozen(decoded.categories)).toBe(true);
      expect(Object.isFrozen(decoded.categories[0]!)).toBe(true);
      expect(Object.isFrozen(decoded.map.view3DTargetSeat!)).toBe(true);
      expect(() =>
        (decoded.categories as unknown as { push(value: unknown): void }).push(
          {},
        )
      ).toThrow();
      const store = new SeatLayerPickerSnapshotStore();
      const listener = vi.fn();
      store.subscribe(listener);
      expect(store.apply(decoded)).toBe(true);
      expect(store.apply(decoded)).toBe(false);
      expect(store.ingest(snapshot(3))).toBeUndefined();
      expect(store.ingest(snapshot(1, { sessionId: 'new-session' })))
        .toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot()).toBe(decoded);
      expect(store.ingest({ schema: seatLayerPickerSnapshotSchema }))
        .toBeUndefined();
    },
  );

  it('keeps a step back to sections on legacy deep-map snapshots', () => {
    expect(decodeSeatLayerPickerSnapshot(snapshot(1, {
      map: { rung: 'overview', canZoomOut: false },
    }))?.map.canZoomOut).toBe(false);
    expect(decodeSeatLayerPickerSnapshot(snapshot(2, {
      map: { rung: 'seats', canZoomOut: false },
    }))?.map.canZoomOut).toBe(true);
    expect(decodeSeatLayerPickerSnapshot(snapshot(3, {
      map: { rung: 'overview', focusedSectionId: 'orchestra', canZoomOut: false },
    }))?.map.canZoomOut).toBe(true);
    expect(decodeSeatLayerPickerSnapshot(snapshot(4, {
      map: { rung: 'overview', focusedSection: { id: 'terrace', label: 'Terrace' }, canZoomOut: false },
    }))?.map.canZoomOut).toBe(true);
  });

  it(
    'gates individual commands, serializes mutations, and borrows controllers safely',
    async () => {
      const borrowed = new SeatLayerController();
      const borrowedDispose = vi.spyOn(borrowed, 'dispose');
      const picker = new SeatLayerPickerController(borrowed);
      const transport = new Transport();
      const started = picker.beginHandshake(transport, { event: 'ev' }, {
        config: baseConfig,
      });
      borrowed.ingestRaw(hello());
      ready(borrowed);
      await started;
      const first = picker.bestAvailable(1);
      const second = picker.clearSelection();
      await Promise.resolve();
      expect(transport.frames).toHaveLength(2);
      const firstFrame = transport.frames[1]!;
      borrowed.ingestRaw({
        sl: 1,
        k: 'res',
        t: firstFrame.type,
        id: firstFrame.id,
        p: { revision: 2 },
      });
      await Promise.resolve();
      borrowed.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'picker.snapshot',
        n: 2,
        p: { snapshot: snapshot(2) },
      });
      await first;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(transport.frames[2]).toMatchObject({
        type: 'picker.clearSelection',
      });
      const secondFrame = transport.frames[2]!;
      borrowed.ingestRaw({
        sl: 1,
        k: 'res',
        t: secondFrame.type,
        id: secondFrame.id,
        p: { snapshot: snapshot(3) },
      });
      await second;
      picker.dispose();
      expect(borrowedDispose).not.toHaveBeenCalled();
      const missing = new SeatLayerPickerController();
      const missingTransport = new Transport();
      const missingStarted = missing.beginHandshake(missingTransport, {
        event: 'ev',
      }, { config: baseConfig });
      missing.mapController.ingestRaw(hello());
      ready(missing.mapController);
      await missingStarted;
      await expect(missing.openSeatView('s1')).resolves.toBeUndefined();
      missing.dispose();
    },
  );

  it(
    'falls back for optional capability/commands and never adopts presentation response snapshots',
    async () => {
      const transport = new Transport();
      const picker = new SeatLayerPickerController();
      const started = picker.beginHandshake(transport, { event: 'ev' }, {
        config: baseConfig,
      });
      picker.mapController.ingestRaw(
        hello([...profile.requiredCapabilities, 'native-chrome-contract-v1'], [
          ...profile.requiredCommands,
          'picker.setThemeMode',
        ]),
      );
      ready(picker.mapController);
      await started;
      await picker.setViewportInsets({ top: 1, right: 0, bottom: 1, left: 0 });
      expect(transport.frames).toHaveLength(1);
      const changing = picker.setThemeMode('dark', { background: '#000000' });
      await Promise.resolve();
      const command = transport.frames[1]!;
      expect(command).toMatchObject({
        type: 'picker.setThemeMode',
        payload: { mode: 'dark', mapTheme: { background: '#000000' } },
      });
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'res',
        t: command.type,
        id: command.id,
        p: { snapshot: snapshot(99) },
      });
      await changing;
      expect(picker.getSnapshot()?.revision).toBe(1);
      const clearing = picker.setThemeMode('light', null);
      await Promise.resolve();
      const clearCommand = transport.frames[2]!;
      expect(clearCommand).toMatchObject({
        type: 'picker.setThemeMode',
        payload: { mode: 'light', mapTheme: null },
      });
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'res',
        t: clearCommand.type,
        id: clearCommand.id,
        p: {},
      });
      await clearing;
      picker.dispose();
    },
  );

  it('rejects cyclic picker config asynchronously without replacing a ready chart', async () => {
    const controller = new SeatLayerController();
    const chartReady = controller.beginHandshake(new Transport(), { event: 'chart' });
    controller.ingestRaw({
      sl: 1,
      k: 'hello',
      t: 'hello',
      p: {
        protocol: { min: 1, max: 1 },
        capabilities: [],
        commands: [],
        events: [],
      },
    });
    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 1,
      p: { protocol: 1 },
    });
    await chartReady;

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let pickerReady: Promise<unknown> | undefined;
    expect(() => {
      pickerReady = controller.beginPickerHandshake(
        new Transport(),
        { event: 'picker' },
        { config: cyclic as never },
      );
    }).not.toThrow();
    await expect(pickerReady).rejects.toMatchObject({ code: 'bad_payload' });
    expect(controller.isReady).toBe(true);
    controller.dispose();
  });

  it('preserves a ready picker snapshot and seat view when config validation fails', async () => {
    const picker = new SeatLayerPickerController();
    const activeTransport = new Transport();
    const active = picker.beginHandshake(
      activeTransport,
      { event: 'picker' },
      { config: baseConfig },
    );
    picker.mapController.ingestRaw(
      hello([...profile.requiredCapabilities, 'native-seat-view-chrome-v1']),
    );
    ready(picker.mapController, snapshot(4));
    await active;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'seatView.changed',
      n: 2,
      p: { seatView: { seatId: 's1', real: true } },
    });
    const initialSnapshot = picker.getSnapshot();
    const replacementTransport = new Transport();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let replacement: Promise<unknown> | undefined;
    expect(() => {
      replacement = picker.beginHandshake(
        replacementTransport,
        { event: 'replacement' },
        { config: cyclic as never },
      );
    }).not.toThrow();
    await expect(replacement).rejects.toMatchObject({ code: 'bad_payload' });
    expect(picker.getSnapshot()).toBe(initialSnapshot);
    expect(picker.getSeatView()).toMatchObject({ seatId: 's1', real: true });
    expect(picker.mapController.isReady).toBe(true);
    expect(replacementTransport.frames).toHaveLength(0);
    picker.dispose();
  });

  it('preserves a ready picker session when replacement event is empty', async () => {
    const picker = new SeatLayerPickerController();
    const activeTransport = new Transport();
    const active = picker.beginHandshake(
      activeTransport,
      { event: 'picker' },
      { config: baseConfig },
    );
    picker.mapController.ingestRaw(
      hello([...profile.requiredCapabilities, 'native-seat-view-chrome-v1']),
    );
    ready(picker.mapController, snapshot(5));
    await active;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'seatView.changed',
      n: 2,
      p: { seatView: { seatId: 's2', real: true } },
    });
    const initialSnapshot = picker.getSnapshot();
    const replacementTransport = new Transport();
    const replacement = picker.beginHandshake(
      replacementTransport,
      { event: '' },
      { config: baseConfig },
    );
    await expect(replacement).rejects.toMatchObject({ code: 'bad_payload' });
    expect(picker.getSnapshot()).toBe(initialSnapshot);
    expect(picker.getSeatView()).toMatchObject({ seatId: 's2', real: true });
    expect(picker.mapController.isReady).toBe(true);
    expect(replacementTransport.frames).toHaveLength(0);
    picker.dispose();
  });

  it('reads stateful bridge config only once before replacing a picker session', async () => {
    const picker = new SeatLayerPickerController();
    const active = picker.beginHandshake(
      new Transport(),
      { event: 'picker' },
      { config: baseConfig },
    );
    picker.mapController.ingestRaw(hello());
    ready(picker.mapController);
    await active;

    let reads = 0;
    const options = Object.defineProperty({}, 'config', {
      get: () => {
        reads += 1;
        if (reads > 1) throw new Error('config was read twice');
        return { enable3D: false, enableSeatView: false };
      },
    });
    const replacementTransport = new Transport();
    const replacement = picker.beginHandshake(
      replacementTransport,
      { event: 'replacement' },
      options as never,
    );
    expect(reads).toBe(1);
    picker.mapController.ingestRaw(hello());
    ready(picker.mapController, snapshot(1, { sessionId: 'replacement' }));
    await expect(replacement).resolves.toMatchObject({ protocolRevision: 2 });
    picker.dispose();
  });

  it('rejects protected init identity and access fields in picker config', async () => {
    const controller = new SeatLayerController();
    const transport = new Transport();
    const started = controller.beginPickerHandshake(
      transport,
      {
        event: 'real-event',
        apiBase: 'https://real.example',
        publicKey: 'real-public-key',
        buyerAccessToken: { token: 'real-access-token' },
      },
      {
        config: {
          enable3D: false,
          enableSeatView: false,
          panelCollapsed: true,
          event: 'injected-event',
          apiBase: 'https://injected.example',
          publicKey: 'injected-public-key',
          buyerAccessToken: { token: 'injected-access-token' },
          nativeAccessProvider: false,
        } as never,
      },
    );
    await expect(started).rejects.toMatchObject({ code: 'bad_payload' });
    expect(transport.frames).toEqual([]);
    controller.dispose();
  });
});
