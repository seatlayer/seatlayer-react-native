import { describe, expect, it } from 'vitest';

import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerPickerController } from '../src/picker/controller';
import { SeatLayerController } from '../src/controller';
import type { BridgeTransport } from '../src/bridge/client';

class SilentTransport implements BridgeTransport {
  send(): void {}
}

describe('picker profile and action guards', () => {
  it('matches the exact protocol-2 picker contract', () => {
    const profile = pickerBridgeProfile();
    expect(profile.protocolRange).toEqual({ min: 2, max: 2 });
    expect(profile.requiredCapabilities).toEqual([
      'picker-session-v2',
      'picker-snapshot-v1',
      'picker-actions-v1',
      'native-picker-chrome-v1',
      'checkout-handoff-v1',
      'checkout-handoff-reject-v1',
      'hold-ownership-v1',
      'cart-line-remove-v1',
      'table-quantity-v1',
      'venue-3d-v1',
      'venue-3d-controls-v1',
      'seat-view-v1',
    ]);
    expect(profile.requiredCommands).toEqual([
      'picker.getSnapshot',
      'picker.selectObjects',
      'picker.deselectObjects',
      'picker.clearSelection',
      'picker.selectCategories',
      'picker.deselectCategories',
      'picker.setSeatTier',
      'picker.removeCartLine',
      'picker.setTableQuantity',
      'picker.setSelectableObjects',
      'picker.setMaxSelection',
      'picker.setCategoryFilter',
      'picker.setAccessibilityFilter',
      'picker.setLimitedViewFilter',
      'picker.focusSection',
      'picker.overview',
      'picker.setRung',
      'picker.setFloor',
      'picker.setColorblindSafe',
      'picker.setThemeMode',
      'picker.setViewMode',
      'picker.setInteractionEnabled',
      'picker.zoomIn',
      'picker.zoomOut',
      'picker.zoomToFit',
      'picker.holdGA',
      'picker.bestAvailable',
      'picker.resumeHold',
      'picker.extendHold',
      'picker.continue',
      'picker.rejectHandoff',
      'picker.abort',
      'picker.lifecycle',
      'picker.destroy',
      'picker.setBuyerView',
      'picker.setVenue3DNavigationMode',
      'picker.openSeatView',
    ]);
    expect(profile.requiredEvents).toEqual(['picker.snapshot']);
    expect(profile.optionalCapabilities).toEqual([
      'native-chrome-contract-v1',
      'native-seat-view-chrome-v1',
      'viewport-insets-v1',
      'floor-stack-v1',
      'chart-load-trace-v1',
      'availability-refresh-v1',
      'access-needs-v1',
      'hold-selection-v1',
    ]);
    const reduced = pickerBridgeProfile({
      config: { enable3D: false, enableSeatView: false },
    });
    expect(reduced.requiredCapabilities).not.toContain('venue-3d-v1');
    expect(reduced.requiredCapabilities).not.toContain('seat-view-v1');
    expect(reduced.requiredCommands).not.toContain('picker.setBuyerView');
    expect(reduced.requiredCommands).not.toContain('picker.openSeatView');
  });

  it('keeps only named picker floors and preserves explicit empty GA tiers', async () => {
    const { decodeSeatLayerPickerSnapshot } = await import(
      '../src/picker/decode'
    );
    const snapshot = decodeSeatLayerPickerSnapshot({
      schema: 'seatlayer.picker.snapshot/1',
      sessionId: 's',
      revision: 1,
      event: { key: 'ev', currency: 'USD' },
      branding: {},
      catalog: { gaAreas: [{ id: 'ga', tiers: [] }] },
      map: {
        floors: [
          { id: 'missing-name' },
          { id: 'named', name: 'Ground', level: 0 },
          { id: 'tolerant-level', name: 'Upper', level: 'unknown' },
        ],
      },
      selection: { seats: [] },
      cart: { items: [] },
      hold: {},
      access: {},
    });
    expect(snapshot?.map.floors).toEqual([
      { id: 'named', name: 'Ground', level: 0 },
      { id: 'tolerant-level', name: 'Upper' },
    ]);
    expect(snapshot?.generalAdmissionAreas[0]).toMatchObject({
      id: 'ga',
      tiers: [],
    });
  });
  it('freezes a cloned picker config', () => {
    const config = { enable3D: false, nested: { value: 'before' } };
    const profile = pickerBridgeProfile({ config });
    config.nested.value = 'after';
    expect(profile.config).toMatchObject({ nested: { value: 'before' } });
    expect(Object.isFrozen(profile.config?.nested)).toBe(true);
  });

  it('requires 3d commands only when enabled', () => {
    expect(
      pickerBridgeProfile({ config: { enable3D: false } }).requiredCommands,
    ).not.toContain('picker.setBuyerView');
    expect(pickerBridgeProfile().requiredCommands).toContain(
      'picker.setBuyerView',
    );
  });

  it('requires seat view only when enabled', () => {
    expect(
      pickerBridgeProfile({ config: { enableSeatView: false } })
        .requiredCommands,
    ).not.toContain('picker.openSeatView');
    expect(pickerBridgeProfile().requiredCommands).toContain(
      'picker.openSeatView',
    );
  });

  it('rejects invalid inventory arguments before transport', async () => {
    const picker = new SeatLayerPickerController();
    await expect(picker.bestAvailable(0)).rejects.toMatchObject({
      code: 'bad_payload',
    });
    await expect(picker.holdGA('', 1)).rejects.toMatchObject({
      code: 'bad_payload',
    });
    await expect(picker.setTableQuantity('line', 0)).rejects.toMatchObject({
      code: 'bad_payload',
    });
    picker.dispose();
  });

  it('returns typed validation errors for malformed JavaScript inputs', async () => {
    const picker = new SeatLayerPickerController();
    await expect(
      picker.selectObjects(42 as unknown as string[]),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(
      picker.setViewMode(42 as unknown as string),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    let malformedInsets: Promise<void> | undefined;
    expect(() => {
      malformedInsets = picker.setViewportInsets(undefined as unknown as null);
    }).not.toThrow();
    await expect(malformedInsets).rejects.toMatchObject({
      code: 'bad_payload',
    });
    await expect(
      picker.setInteractionEnabled('true' as unknown as boolean),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(
      picker.setThemeMode('dark', [] as unknown as Record<string, never>),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(
      picker.setThemeMode('dark', { unexpected: '#000000' } as never),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(
      picker.setThemeMode('dark', { background: '#000' }),
    ).rejects.toMatchObject({ code: 'bad_payload' });
    picker.dispose();
  });

  it('rejects post-dispose presentation work', async () => {
    const picker = new SeatLayerPickerController();
    picker.dispose();
    await expect(picker.setThemeMode('dark')).rejects.toMatchObject({
      code: 'destroyed',
    });
    await expect(picker.setViewportInsets(null)).rejects.toMatchObject({
      code: 'destroyed',
    });
  });

  it('uses no optional surface before capability negotiation', async () => {
    const picker = new SeatLayerPickerController();
    await expect(picker.showAllFloors()).resolves.toBeUndefined();
    await expect(picker.openSeatView('s1')).resolves.toBeUndefined();
    picker.dispose();
  });

  it('does not run picker commands after an incompatible handshake', async () => {
    const controller = new SeatLayerController();
    const ready = controller.beginPickerHandshake(
      new SilentTransport(),
      { event: 'ev' },
      { config: { enable3D: false, enableSeatView: false } },
    );
    controller.ingestRaw({
      sl: 1,
      k: 'hello',
      t: 'hello',
      p: {
        protocol: { min: 2, max: 2 },
        capabilities: [],
        commands: [],
        events: [],
      },
    });
    await expect(ready).rejects.toMatchObject({ code: 'sl_incompatible' });
    await expect(controller.runPickerCommand('picker.getSnapshot')).rejects
      .toMatchObject({
        code: 'sl_incompatible',
      });
    controller.dispose();
  });
});
