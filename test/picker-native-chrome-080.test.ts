import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import {
  seatLayerAccessibilityFocusCapability,
  seatLayerCategoryAvailabilityCapability,
  seatLayerFocusAccessibilityFilterCommand,
  seatLayerFocusNextAccessibleSectionCommand,
  seatLayerFrameSeatCommand,
  seatLayerSeatRetapEvent,
  seatLayerSeatScreenPointCapability,
  seatLayerSeatViewThumbnailCapability,
  seatLayerSectionAccessCountsCapability,
  seatLayerSetBlockedRegionsCommand,
  seatLayerSetSelectionFocusCommand,
} from '../src/bridge/protocol';
import { SeatLayerPickerController } from '../src/picker/controller';
import {
  decodeSeatLayerPickerAccessibleSectionStep,
  decodeSeatLayerPickerFrameSeatResult,
  decodeSeatLayerPickerSeatRetap,
  decodeSeatLayerPickerSnapshot,
} from '../src/picker/decode';
import {
  seatLayerPickerSnapshotSchema,
  type SeatLayerPickerSelectedSeat,
} from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

const contractCommands = [
  seatLayerSetSelectionFocusCommand,
  seatLayerSetBlockedRegionsCommand,
  seatLayerFrameSeatCommand,
  seatLayerFocusAccessibilityFilterCommand,
  seatLayerFocusNextAccessibleSectionCommand,
];

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

async function readyPicker(
  capabilities: readonly string[] = [],
  commands: readonly string[] = contractCommands,
  events: readonly string[] = ['sys.ready', 'picker.snapshot', seatLayerSeatRetapEvent],
): Promise<{ picker: SeatLayerPickerController; transport: Transport }> {
  const transport = new Transport();
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(transport, { event: 'ev' }, {
    config: baseConfig,
  });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, ...capabilities],
      commands: [...profile.requiredCommands, ...commands],
      events: [...events],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: snapshot() },
  });
  await started;
  return { picker, transport };
}

function reply(
  picker: SeatLayerPickerController,
  transport: Transport,
  payload: unknown,
): void {
  const last = transport.frames[transport.frames.length - 1] as
    | { id?: string }
    | undefined;
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'res',
    t: 'res',
    id: last?.id,
    p: payload,
  });
}

function lastFrame(transport: Transport): Envelope | undefined {
  return transport.frames[transport.frames.length - 1];
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('0.80.3 native-chrome capabilities in the picker profile', () => {
  it('offers each additive capability without ever requiring one', () => {
    const optional = pickerBridgeProfile().optionalCapabilities;
    for (const capability of [
      seatLayerSeatScreenPointCapability,
      seatLayerCategoryAvailabilityCapability,
      seatLayerSeatViewThumbnailCapability,
      seatLayerAccessibilityFocusCapability,
      seatLayerSectionAccessCountsCapability,
    ]) {
      expect(optional).toContain(capability);
      expect(pickerBridgeProfile().requiredCapabilities).not.toContain(capability);
    }
    for (const command of contractCommands) {
      expect(pickerBridgeProfile().requiredCommands).not.toContain(command);
    }
  });
});

describe('0.80.3 snapshot additions decode as present-only', () => {
  it('reads the screen point, seat view evidence, free counts and access counts', () => {
    const decoded = decodeSeatLayerPickerSnapshot(snapshot(2, {
      catalog: {
        categories: [
          { key: 'gold', price: 60, available: 0, free: 4 },
          { key: 'silver', price: 40, available: 0 },
          { key: 'bronze', price: 20, available: 0, free: 0 },
        ],
        sections: [
          { id: 'a', label: 'A', accessibleFree: { wheelchair: 2, companion: 2 } },
          { id: 'b', label: 'B', accessibleFree: {} },
          { id: 'c', label: 'C' },
        ],
      },
      selection: {
        seats: [{
          id: 's1',
          label: 'A-1',
          screenPoint: { x: 120.5, y: 310 },
          seatViewThumb: { reference: 'asset_1', kind: 'real' },
          sightlineMetres: 24.5,
          seatViewConfidence: {
            headline: 'Real photo',
            model: 'Exact seat',
            reality: 'Photographed',
            coverage: 'Exact seat in the model',
            provenance: 'Organizer upload',
            freshness: 'Assessed 2026-08-01',
            limitations: ['Taken before the new stage.'],
          },
        }],
      },
    }));
    const seat = decoded?.selection[0] as SeatLayerPickerSelectedSeat | undefined;
    expect(decoded?.categories[0]?.free).toBe(4);
    expect(decoded?.categories[1] && 'free' in decoded.categories[1]).toBe(false);
    expect(decoded?.categories[2]?.free).toBe(0);
    expect(decoded?.sections[0]?.accessibleFree).toEqual({ wheelchair: 2, companion: 2 });
    expect(decoded?.sections[1]?.accessibleFree).toBeUndefined();
    expect(decoded?.sections[2]?.accessibleFree).toBeUndefined();
    expect(seat?.screenPoint).toEqual({ x: 120.5, y: 310 });
    expect(seat?.seatViewThumb).toEqual({ reference: 'asset_1', kind: 'real' });
    expect(seat?.sightlineMetres).toBe(24.5);
    expect(seat?.seatViewConfidence?.headline).toBe('Real photo');
    expect(seat?.seatViewConfidence?.limitations).toEqual(['Taken before the new stage.']);
    expect(decoded?.map.canZoomOut).toBe(false);
  });

  it('drops evidence it could not honestly render and keeps the seat', () => {
    const decoded = decodeSeatLayerPickerSnapshot(snapshot(3, {
      catalog: { sections: [{ id: 'a', label: 'A', accessibleFree: { wheelchair: 0, companion: 1.5, '  ': 3 } }] },
      selection: {
        seats: [{
          id: 's1',
          label: 'A-1',
          screenPoint: { x: 10 },
          seatViewThumb: { reference: 'asset_1', kind: 'generated' },
          sightlineMetres: -4,
          seatViewConfidence: { headline: 'Only a headline' },
        }],
      },
      map: { rung: 'seats' },
    }));
    const seat = decoded?.selection[0] as SeatLayerPickerSelectedSeat | undefined;
    expect(seat?.label).toBe('A-1');
    expect(seat?.screenPoint).toBeUndefined();
    expect(seat?.seatViewThumb).toBeUndefined();
    expect(seat?.sightlineMetres).toBeUndefined();
    expect(seat?.seatViewConfidence).toBeUndefined();
    expect(decoded?.sections[0]?.accessibleFree).toBeUndefined();
    // Already present before this round; the seats rung still answers true.
    expect(decoded?.map.canZoomOut).toBe(true);
  });

  it('decodes the frame reply, the tour step and a retapped seat', () => {
    expect(decodeSeatLayerPickerFrameSeatResult({ dy: -212, gestures: 3 }))
      .toEqual({ dy: -212, gestures: 3 });
    expect(decodeSeatLayerPickerFrameSeatResult({})).toEqual({ dy: 0, gestures: 0 });
    expect(decodeSeatLayerPickerFrameSeatResult(null)).toEqual({ dy: 0, gestures: 0 });
    expect(decodeSeatLayerPickerAccessibleSectionStep({
      id: 'a', label: 'A', free: 12, index: 0, total: 3,
    })).toEqual({ id: 'a', label: 'A', free: 12, index: 0, total: 3 });
    expect(decodeSeatLayerPickerAccessibleSectionStep({
      id: 'a', free: 1, index: 3, total: 3,
    })).toBeUndefined();
    expect(decodeSeatLayerPickerAccessibleSectionStep(null)).toBeUndefined();
    expect(decodeSeatLayerPickerSeatRetap({ seat: { id: 's1', label: 'A-1' } })?.label)
      .toBe('A-1');
    expect(decodeSeatLayerPickerSeatRetap({})).toBeUndefined();
  });
});

describe('0.80.3 command gating', () => {
  it('sends each contract command when the hello table lists it', async () => {
    const { picker, transport } = await readyPicker([
      seatLayerAccessibilityFocusCapability,
    ]);
    expect(picker.supportsSelectionFocus).toBe(true);
    expect(picker.supportsBlockedRegions).toBe(true);
    expect(picker.supportsFrameSeat).toBe(true);
    expect(picker.supportsAccessibilityFocus).toBe(true);
    expect(picker.supportsAccessibleSectionTour).toBe(true);

    const focus = picker.setSelectionFocus('s1');
    await flush();
    expect(lastFrame(transport)).toMatchObject({
      type: seatLayerSetSelectionFocusCommand,
      payload: { seatId: 's1' },
    });
    reply(picker, transport, {});
    await focus;

    const cleared = picker.setSelectionFocus(null);
    await flush();
    expect(lastFrame(transport)).toMatchObject({ payload: { seatId: null } });
    reply(picker, transport, {});
    await cleared;

    const regions = picker.setBlockedRegions([{ x: 330, y: 680, w: 50, h: 50 }]);
    await flush();
    expect(lastFrame(transport)).toMatchObject({
      type: seatLayerSetBlockedRegionsCommand,
      payload: { rects: [{ x: 330, y: 680, w: 50, h: 50 }] },
    });
    reply(picker, transport, {});
    await regions;

    const cleanup = picker.setBlockedRegions(null);
    await flush();
    expect(lastFrame(transport)).toMatchObject({ payload: { rects: null } });
    reply(picker, transport, {});
    await cleanup;

    const framed = picker.frameSeat('s1', { fraction: 0.48, gestures: 3 });
    await flush();
    expect(lastFrame(transport)).toMatchObject({
      type: seatLayerFrameSeatCommand,
      payload: { seatId: 's1', fraction: 0.48, gestures: 3 },
    });
    reply(picker, transport, { dy: -212, gestures: 3 });
    expect(await framed).toEqual({ dy: -212, gestures: 3 });

    const tour = picker.focusNextAccessibleSection(['wheelchair']);
    await flush();
    expect(lastFrame(transport)).toMatchObject({
      type: seatLayerFocusNextAccessibleSectionCommand,
      payload: { types: ['wheelchair'] },
    });
    reply(picker, transport, {
      step: { id: 'a', label: 'A', free: 12, index: 0, total: 3 },
    });
    expect(await tour).toEqual({ id: 'a', label: 'A', free: 12, index: 0, total: 3 });

    picker.dispose();
  });

  it('offers nothing, and never throws, when the runtime advertises neither', async () => {
    const { picker, transport } = await readyPicker([], []);
    const before = transport.frames.length;
    expect(picker.supportsSelectionFocus).toBe(false);
    expect(picker.supportsBlockedRegions).toBe(false);
    expect(picker.supportsFrameSeat).toBe(false);
    expect(picker.supportsAccessibilityFocus).toBe(false);
    expect(picker.supportsAccessibleSectionTour).toBe(false);
    await expect(picker.setSelectionFocus('s1')).resolves.toBeUndefined();
    await expect(picker.setBlockedRegions([])).resolves.toBeUndefined();
    await expect(picker.frameSeat('s1')).resolves.toBeUndefined();
    await expect(picker.focusAccessibilityFilter()).resolves.toBeUndefined();
    await expect(picker.focusNextAccessibleSection()).resolves.toBeUndefined();
    expect(transport.frames).toHaveLength(before);
    picker.dispose();
  });

  it('keeps the camera commands behind their capability, not the command alone', async () => {
    const { picker } = await readyPicker([]);
    expect(picker.supportsSelectionFocus).toBe(true);
    expect(picker.supportsAccessibilityFocus).toBe(false);
    expect(picker.supportsAccessibleSectionTour).toBe(false);
    picker.dispose();
  });

  it('rejects a malformed blocked region and an impossible frame before the wire', async () => {
    const { picker, transport } = await readyPicker([]);
    const before = transport.frames.length;
    await expect(picker.setBlockedRegions([{ x: 0, y: 0, w: -1, h: 4 }]))
      .rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.setBlockedRegions(
      [{ x: Number.NaN, y: 0, w: 1, h: 1 }],
    )).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.setSelectionFocus('  ')).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.frameSeat('s1', { fraction: 1.5 })).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.frameSeat('s1', { gestures: -1 })).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.frameSeat('')).rejects.toMatchObject({ code: 'bad_payload' });
    expect(transport.frames).toHaveLength(before);
    picker.dispose();
  });
});

describe('seat.retap', () => {
  it('delivers a retapped seat to every listener and stops on unsubscribe', async () => {
    const { picker } = await readyPicker([]);
    const seen: string[] = [];
    const stop = picker.subscribeSeatRetap((seat) => seen.push(seat.label));
    picker.subscribeSeatRetap(() => {
      throw new Error('a host listener must not break the pump');
    });
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: seatLayerSeatRetapEvent,
      n: 2,
      p: { seat: { id: 's1', label: 'A-1' } },
    });
    expect(seen).toEqual(['A-1']);
    stop();
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: seatLayerSeatRetapEvent,
      n: 3,
      p: { seat: { id: 's2', label: 'A-2' } },
    });
    expect(seen).toEqual(['A-1']);
    picker.dispose();
  });

  it('stays silent when the runtime does not advertise the event', async () => {
    const { picker } = await readyPicker([], contractCommands, ['sys.ready', 'picker.snapshot']);
    const seen: string[] = [];
    picker.subscribeSeatRetap((seat) => seen.push(seat.label));
    picker.mapController.ingestRaw({
      sl: 1,
      k: 'evt',
      t: seatLayerSeatRetapEvent,
      n: 2,
      p: { seat: { id: 's1', label: 'A-1' } },
    });
    expect(seen).toEqual([]);
    picker.dispose();
  });
});
