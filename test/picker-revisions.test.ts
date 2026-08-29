import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import { pickerBridgeProfile } from '../src/bridge/profile';
import type { Envelope } from '../src/bridge/envelope';
import { SeatLayerController } from '../src/controller';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}

const config = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config });
const state = (revision = 1, sessionId = 'audit') => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId,
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
const hello = (
  commands = [...profile.requiredCommands],
  events = ['picker.snapshot'],
) => ({
  sl: 1,
  k: 'hello',
  t: 'hello',
  p: {
    protocol: { min: 2, max: 2 },
    capabilities: [...profile.requiredCapabilities],
    commands,
    events,
  },
});

async function mounted(
  options: { borrowed?: SeatLayerController; wait?: number } = {},
) {
  const map = options.borrowed;
  const picker = new SeatLayerPickerController(map, {
    revisionWaitMs: options.wait,
  });
  const transport = new Transport();
  const ready = picker.beginHandshake(transport, { event: 'ev' }, { config });
  picker.mapController.ingestRaw(hello());
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: state() },
  });
  await ready;
  return { picker, transport };
}

describe('picker revision and lifecycle audit', () => {
  it('rejects missing required command or picker snapshot event before init', async () => {
    const absentCommand = new SeatLayerPickerController();
    const commandReady = absentCommand.beginHandshake(new Transport(), {
      event: 'ev',
    }, { config });
    absentCommand.mapController.ingestRaw(
      hello(profile.requiredCommands.slice(1)),
    );
    await expect(commandReady).rejects.toMatchObject({
      code: 'sl_incompatible',
    });
    absentCommand.dispose();

    const absentEvent = new SeatLayerPickerController();
    const eventReady = absentEvent.beginHandshake(new Transport(), {
      event: 'ev',
    }, { config });
    absentEvent.mapController.ingestRaw(hello(undefined, []));
    await expect(eventReady).rejects.toMatchObject({ code: 'sl_incompatible' });
    absentEvent.dispose();
  });

  it('accepts an event revision before the bounded timeout', async () => {
    const { picker, transport } = await mounted({ wait: 5 });
    const action = picker.clearSelection();
    await Promise.resolve();
    const command = transport.frames[transport.frames.length - 1]!;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'res',
      t: command.type,
      id: command.id,
      p: { revision: 2 },
    });
    await Promise.resolve();
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'picker.snapshot',
      n: 2,
      p: { snapshot: state(2) },
    });
    await expect(action).resolves.toMatchObject({ revision: 2 });
    picker.dispose();
  });

  it('does not issue a fallback command for destroy', async () => {
    const { picker, transport } = await mounted({ wait: 1 });
    const destroyed = picker.destroy();
    await Promise.resolve();
    const command = transport.frames[transport.frames.length - 1]!;
    expect(command.type).toBe('picker.destroy');
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'res',
      t: command.type,
      id: command.id,
      p: { revision: 2 },
    });
    await destroyed;
    expect(
      transport.frames.filter((frame) => frame.type === 'picker.getSnapshot'),
    ).toHaveLength(0);
    await expect(picker.zoomIn()).rejects.toMatchObject({ code: 'destroyed' });
    picker.dispose();
  });

  it('makes only successful destroy terminal for a borrowed map controller', async () => {
    const borrowed = new SeatLayerController();
    const { picker, transport } = await mounted({ borrowed });
    const borrowedDispose = vi.spyOn(borrowed, 'dispose');
    const failed = picker.destroy();
    await Promise.resolve();
    const failedCommand = transport.frames[transport.frames.length - 1]!;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'err',
      t: failedCommand.type,
      id: failedCommand.id,
      p: { message: 'destroy failed' },
    });
    await expect(failed).rejects.toBeInstanceOf(Error);
    const active = picker.zoomIn();
    await Promise.resolve();
    const zoomCommand = transport.frames[transport.frames.length - 1]!;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'res',
      t: zoomCommand.type,
      id: zoomCommand.id,
      p: { snapshot: state(2) },
    });
    await active;
    const succeeded = picker.destroy();
    await Promise.resolve();
    const destroyCommand = transport.frames[transport.frames.length - 1]!;
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'res',
      t: destroyCommand.type,
      id: destroyCommand.id,
      p: { revision: 2 },
    });
    await succeeded;
    expect(borrowedDispose).not.toHaveBeenCalled();
    expect(borrowed.isReady).toBe(false);
    await expect(picker.zoomIn()).rejects.toMatchObject({ code: 'destroyed' });
  });

  it('does not ingest picker snapshots when the advertised event is absent', async () => {
    const map = new SeatLayerController();
    const picker = new SeatLayerPickerController(map);
    const transport = new Transport();
    const pending = picker.beginHandshake(transport, { event: 'ev' }, {
      config,
    });
    map.ingestRaw(hello(undefined, []));
    await expect(pending).rejects.toMatchObject({ code: 'sl_incompatible' });
    map.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'picker.snapshot',
      n: 2,
      p: { snapshot: state(2) },
    });
    expect(picker.getSnapshot()).toBeUndefined();
    picker.dispose();
  });

  it('ignores pre-ready and foreign-session picker snapshots', async () => {
    const picker = new SeatLayerPickerController();
    const transport = new Transport();
    const pending = picker.beginHandshake(transport, { event: 'ev' }, {
      config,
    });
    picker.mapController.ingestRaw(hello());
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'picker.snapshot',
      n: 1,
      p: { snapshot: state(9, 'old-session') },
    });
    expect(picker.getSnapshot()).toBeUndefined();
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 2,
      p: { protocol: 2, snapshot: state(1, 'new-session') },
    });
    await pending;
    expect(picker.getSnapshot()?.sessionId).toBe('new-session');
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'picker.snapshot',
      n: 3,
      p: { snapshot: state(10, 'old-session') },
    });
    expect(picker.getSnapshot()).toMatchObject({
      sessionId: 'new-session',
      revision: 1,
    });
    picker.dispose();
  });

  it('rejects missing or wrong picker-ready protocol revisions', async () => {
    for (const protocol of [undefined, 1]) {
      const picker = new SeatLayerPickerController();
      const pending = picker.beginHandshake(new Transport(), { event: 'ev' }, {
        config,
      });
      picker.mapController.ingestRaw(hello());
      picker.mapController.ingestRaw({
        sl: 1,
        k: 'evt',
        t: 'sys.ready',
        n: 1,
        p: {
          ...(protocol === undefined ? {} : { protocol }),
          snapshot: state(),
        },
      });
      await expect(pending).rejects.toMatchObject({ code: 'sl_incompatible' });
      picker.dispose();
    }
  });

  it(
    'cancels an in-flight raw command after disposal without a later send',
    async () => {
      const borrowed = new SeatLayerController();
      const { picker, transport } = await mounted({ borrowed });
      const first = picker.clearSelection();
      await Promise.resolve();
      const second = picker.zoomIn();
      picker.dispose();
      await expect(first).rejects.toMatchObject({ code: 'destroyed' });
      await expect(second).rejects.toMatchObject({ code: 'destroyed' });
      expect(transport.frames.filter((frame) => frame.kind === 'cmd'))
        .toHaveLength(1);
    },
    150,
  );

  it('registers cancellation before a synchronous transport disposal', async () => {
    const picker = new SeatLayerPickerController();
    const transport = new Transport();
    const ready = picker.beginHandshake(transport, { event: 'ev' }, { config });
    picker.mapController.ingestRaw(hello());
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 1,
      p: { protocol: 2, snapshot: state() },
    });
    await ready;
    const send = transport.send.bind(transport);
    transport.send = (frame) => {
      send(frame);
      if (frame.type === 'picker.clearSelection') {
        picker.dispose();
      }
    };
    await expect(picker.clearSelection()).rejects.toMatchObject({
      code: 'destroyed',
    });
    expect(transport.frames.filter((frame) => frame.kind === 'cmd'))
      .toHaveLength(1);
  });

  it('keeps duplicate checkout requests referentially identical and validates ttl', async () => {
    const { picker } = await mounted();
    expect(picker.checkout()).toBe(picker.checkout());
    await expect(picker.checkout(0)).rejects.toMatchObject({
      code: 'bad_payload',
    });
    picker.dispose();
  });

  it('retains absent/null versus present-empty selected arrays', async () => {
    const { decodeSelectedSeat } = await import('../src/decode');
    expect(decodeSelectedSeat({ id: 's', label: 'A' })).not.toHaveProperty(
      'tiers',
    );
    expect(decodeSelectedSeat({ id: 's', label: 'A', tiers: null })).not
      .toHaveProperty('tiers');
    expect(
      decodeSelectedSeat({ id: 's', label: 'A', tiers: [], accessibility: [] }),
    ).toMatchObject({ tiers: [], accessibility: [] });
  });
});
