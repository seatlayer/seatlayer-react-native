import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

const config = { enable3D: true, enableSeatView: true };
const profile = pickerBridgeProfile({ config });
const optionalCapabilities = [
  'floor-stack-v1',
  'viewport-insets-v1',
  'native-chrome-contract-v1',
  'native-seat-view-chrome-v1',
];
const optionalCommands = ['picker.setViewportInsets'];

const snapshot = (revision: number) => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId: 'matrix',
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
const handoff = {
  holdId: 'hold_1',
  expiresAt: 1_700_000_000_000,
  currency: 'USD',
  lineItems: [],
  total: 0,
};

class AutoReplyTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  controller: SeatLayerPickerController | undefined;
  private revision = 1;

  send(frame: Envelope): void {
    this.frames.push(frame);
    if (frame.kind !== 'cmd') return;
    queueMicrotask(() =>
      this.controller?.mapController.ingestRaw({
        sl: 1,
        k: 'res',
        t: frame.type,
        id: frame.id,
        p: frame.type === 'picker.continue'
          ? { handoff }
          : { snapshot: snapshot(++this.revision) },
      })
    );
  }

  commands(): Envelope[] {
    return this.frames.filter((frame) => frame.kind === 'cmd');
  }
}

async function mounted(
  options: {
    capabilities?: readonly string[];
    commands?: readonly string[];
    events?: readonly string[];
  } = {},
) {
  const transport = new AutoReplyTransport();
  const picker = new SeatLayerPickerController();
  transport.controller = picker;
  const ready = picker.beginHandshake(transport, { event: 'ev' }, { config });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: options.capabilities ??
        [...profile.requiredCapabilities, ...optionalCapabilities],
      commands: options.commands ??
        [...profile.requiredCommands, ...optionalCommands],
      events: options.events ?? ['picker.snapshot', 'seatView.changed'],
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

describe('picker controller action matrix', () => {
  it('sends the exact command and payload for every public picker action', async () => {
    const { picker, transport } = await mounted();
    const actions: ReadonlyArray<
      {
        readonly command: string;
        readonly payload?: unknown;
        readonly presentation?: boolean;
        readonly run: () => Promise<unknown>;
      }
    > = [
      { command: 'picker.getSnapshot', run: () => picker.synchronize() },
      { command: 'picker.clearSelection', run: () => picker.clearSelection() },
      {
        command: 'picker.removeCartLine',
        payload: { label: 'A-1' },
        run: () => picker.removeCartLine('A-1'),
      },
      {
        command: 'picker.setSeatTier',
        payload: { seatId: 's1', tierId: null },
        run: () => picker.setSeatTier('s1', null),
      },
      {
        command: 'picker.selectObjects',
        payload: { objects: ['s1'] },
        run: () => picker.selectObjects(['s1']),
      },
      {
        command: 'picker.deselectObjects',
        payload: { objects: ['s1'] },
        run: () => picker.deselectObjects(['s1']),
      },
      {
        command: 'picker.setMaxSelection',
        payload: { maxSelection: 2 },
        run: () => picker.setMaxSelection(2),
      },
      {
        command: 'picker.setFloor',
        payload: { floorId: 'f1' },
        run: () => picker.setFloor('f1'),
      },
      {
        command: 'picker.setFloor',
        payload: { floorId: 'all' },
        run: () => picker.showAllFloors(),
      },
      {
        command: 'picker.selectCategories',
        payload: { categoryKeys: ['adult'] },
        run: () => picker.selectCategories(['adult']),
      },
      {
        command: 'picker.deselectCategories',
        payload: { categoryKeys: ['adult'] },
        run: () => picker.deselectCategories(['adult']),
      },
      {
        command: 'picker.setSelectableObjects',
        payload: { objects: null },
        run: () => picker.setSelectableObjects(null),
      },
      {
        command: 'picker.setCategoryFilter',
        payload: { categoryKeys: ['adult'], focus: true },
        run: () => picker.setCategoryFilter(['adult'], true),
      },
      {
        command: 'picker.setLimitedViewFilter',
        payload: { on: true },
        run: () => picker.setLimitedViewFilter(true),
      },
      {
        command: 'picker.setAccessibilityFilter',
        payload: { types: ['wheelchair'] },
        run: () => picker.setAccessibilityFilter(['wheelchair']),
      },
      {
        command: 'picker.focusSection',
        payload: { sectionId: 'balcony' },
        run: () => picker.focusSection('balcony'),
      },
      { command: 'picker.overview', run: () => picker.overview() },
      {
        command: 'picker.setRung',
        payload: { rung: 'select' },
        run: () => picker.setRung('select'),
      },
      {
        command: 'picker.setColorblindSafe',
        payload: { on: true },
        run: () => picker.setColorblindSafe(true),
      },
      {
        command: 'picker.setViewMode',
        payload: { mode: 'iso' },
        run: () => picker.setViewMode('iso'),
      },
      {
        command: 'picker.setBuyerView',
        payload: { view: '3d', flyToSeatId: 's1', resetView: true },
        run: () =>
          picker.setBuyerView('3d', { flyToSeatId: 's1', resetView: true }),
      },
      {
        command: 'picker.openSeatView',
        payload: { seatId: 's1' },
        run: () => picker.openSeatView('s1'),
      },
      {
        command: 'picker.setVenue3DNavigationMode',
        payload: { mode: 'orbit' },
        run: () => picker.setVenue3DNavigationMode('orbit'),
      },
      { command: 'picker.zoomIn', run: () => picker.zoomIn() },
      { command: 'picker.zoomOut', run: () => picker.zoomOut() },
      { command: 'picker.zoomToFit', run: () => picker.zoomToFit() },
      {
        command: 'picker.setTableQuantity',
        payload: { label: 'table-1', quantity: 2, ttlMs: 300 },
        run: () => picker.setTableQuantity('table-1', 2, { ttlMs: 300 }),
      },
      {
        command: 'picker.rejectHandoff',
        payload: { holdId: 'hold_1' },
        run: () => picker.rejectHandoff('hold_1'),
      },
      {
        command: 'picker.lifecycle',
        payload: { state: 'foreground' },
        run: () => picker.setLifecycle('resumed'),
      },
      {
        command: 'picker.bestAvailable',
        payload: {
          qty: 2,
          categoryKey: 'adult',
          zoneId: 'east',
          preferPremium: true,
          ttlMs: 300,
        },
        run: () =>
          picker.bestAvailable(2, {
            categoryKey: 'adult',
            zoneId: 'east',
            preferPremium: true,
            ttlMs: 300,
          }),
      },
      {
        command: 'picker.holdGA',
        payload: { areaId: 'ga-1', qty: 2, tierId: null, ttlMs: 300 },
        run: () => picker.holdGA('ga-1', 2, { tierId: null, ttlMs: 300 }),
      },
      {
        command: 'picker.resumeHold',
        payload: { holdId: 'hold_1' },
        run: () => picker.resumeHold('hold_1'),
      },
      {
        command: 'picker.extendHold',
        payload: { ttlMs: 300 },
        run: () => picker.extendHold(300),
      },
      { command: 'picker.abort', run: () => picker.abort() },
      {
        command: 'picker.setThemeMode',
        payload: { mode: 'dark', mapTheme: { background: '#000000' } },
        presentation: true,
        run: () => picker.setThemeMode('dark', { background: '#000000' }),
      },
      {
        command: 'picker.setInteractionEnabled',
        payload: { enabled: false },
        presentation: true,
        run: () => picker.setInteractionEnabled(false),
      },
      {
        command: 'picker.setViewportInsets',
        payload: { top: 1, right: 2, bottom: 3, left: 4 },
        presentation: true,
        run: () =>
          picker.setViewportInsets({ top: 1, right: 2, bottom: 3, left: 4 }),
      },
      {
        command: 'picker.setViewportInsets',
        payload: { insets: null },
        presentation: true,
        run: () => picker.setViewportInsets(null),
      },
      {
        command: 'picker.continue',
        payload: { ttlMs: 300 },
        run: () => picker.checkout(300),
      },
      { command: 'picker.destroy', run: () => picker.destroy() },
    ];

    for (const action of actions) {
      const beforeRevision = picker.getSnapshot()?.revision;
      const result = await action.run();
      const commands = transport.commands();
      const frame = commands[commands.length - 1]!;
      expect(frame.type).toBe(action.command);
      expect(frame.payload).toEqual(action.payload);
      if (action.presentation) {
        expect(picker.getSnapshot()?.revision).toBe(beforeRevision);
      }
      if (action.command === 'picker.continue') expect(result).toEqual(handoff);
    }
    picker.dispose();
  });

  it.each([
    [
      'removeCartLine',
      (picker: SeatLayerPickerController) => picker.removeCartLine(' '),
    ],
    [
      'setSeatTier seat',
      (picker: SeatLayerPickerController) => picker.setSeatTier(' ', null),
    ],
    [
      'setSeatTier optional tier',
      (picker: SeatLayerPickerController) => picker.setSeatTier('s1', ' '),
    ],
    [
      'selectObjects',
      (picker: SeatLayerPickerController) => picker.selectObjects([' ']),
    ],
    [
      'deselectObjects',
      (picker: SeatLayerPickerController) => picker.deselectObjects([' ']),
    ],
    [
      'selectCategories',
      (picker: SeatLayerPickerController) => picker.selectCategories([' ']),
    ],
    [
      'deselectCategories',
      (picker: SeatLayerPickerController) => picker.deselectCategories([' ']),
    ],
    [
      'setSelectableObjects',
      (picker: SeatLayerPickerController) => picker.setSelectableObjects([' ']),
    ],
    [
      'setCategoryFilter',
      (picker: SeatLayerPickerController) => picker.setCategoryFilter([' ']),
    ],
    [
      'setAccessibilityFilter',
      (picker: SeatLayerPickerController) =>
        picker.setAccessibilityFilter([' ']),
    ],
    [
      'focusSection',
      (picker: SeatLayerPickerController) => picker.focusSection(' '),
    ],
    ['setRung', (picker: SeatLayerPickerController) => picker.setRung(' ')],
    [
      'setViewMode',
      (picker: SeatLayerPickerController) => picker.setViewMode(' '),
    ],
    [
      'setBuyerView',
      (picker: SeatLayerPickerController) => picker.setBuyerView(' '),
    ],
    [
      'setBuyerView optional seat',
      (picker: SeatLayerPickerController) =>
        picker.setBuyerView('3d', { flyToSeatId: ' ' }),
    ],
    [
      'openSeatView',
      (picker: SeatLayerPickerController) => picker.openSeatView(' '),
    ],
    [
      'setVenue3DNavigationMode',
      (picker: SeatLayerPickerController) =>
        picker.setVenue3DNavigationMode(' '),
    ],
    [
      'setTableQuantity',
      (picker: SeatLayerPickerController) => picker.setTableQuantity(' ', 1),
    ],
    [
      'rejectHandoff',
      (picker: SeatLayerPickerController) => picker.rejectHandoff(' '),
    ],
    [
      'setLifecycle',
      (picker: SeatLayerPickerController) => picker.setLifecycle(' '),
    ],
    [
      'bestAvailable category',
      (picker: SeatLayerPickerController) =>
        picker.bestAvailable(1, { categoryKey: ' ' }),
    ],
    [
      'bestAvailable zone',
      (picker: SeatLayerPickerController) =>
        picker.bestAvailable(1, { zoneId: ' ' }),
    ],
    [
      'holdGA optional tier',
      (picker: SeatLayerPickerController) =>
        picker.holdGA('ga-1', 1, { tierId: ' ' }),
    ],
    [
      'resumeHold',
      (picker: SeatLayerPickerController) => picker.resumeHold(' '),
    ],
    [
      'setTableQuantity ttl',
      (picker: SeatLayerPickerController) =>
        picker.setTableQuantity('table', 1, { ttlMs: 0 }),
    ],
    [
      'bestAvailable ttl',
      (picker: SeatLayerPickerController) =>
        picker.bestAvailable(1, { ttlMs: 0 }),
    ],
    [
      'holdGA ttl',
      (picker: SeatLayerPickerController) =>
        picker.holdGA('ga-1', 1, { ttlMs: 0 }),
    ],
    [
      'extendHold ttl',
      (picker: SeatLayerPickerController) => picker.extendHold(0),
    ],
    ['checkout ttl', (picker: SeatLayerPickerController) => picker.checkout(0)],
  ])('validates %s before transport', async (_name, invoke) => {
    const { picker, transport } = await mounted();
    const before = transport.commands().length;
    const outcome = await invoke(picker).then(
      () => 'resolved',
      () => 'rejected',
    );
    expect({ outcome, commandCount: transport.commands().length }).toEqual({
      outcome: 'rejected',
      commandCount: before,
    });
    picker.dispose();
  });
});
