import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
}));

import { SeatLayerError } from '../src/errors';
import { seatLayerPickerHoldOwnershipStore } from '../src/picker/holdOwnership';
import { SeatLayerPickerHoldOwnershipObserver } from '../src/picker/holdOwnershipObserver';

function setup(handoff?: { holdId: string }) {
  const listeners = new Set<(error: unknown) => void>();
  const controller = {
    getCheckoutHandoff: () => handoff,
    mapController: {
      on: (name: string, listener: (error: unknown) => void) => {
        if (name !== 'error') return () => undefined;
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
  };
  scope = { controller, sessionId: 1 };
  return { controller, emit: (error: unknown) => { for (const l of [...listeners]) l(error); } };
}

describe('§3.13.13 the picker hears the refusal the runtime answers a tap with', () => {
  it('raises the in-checkout notice from an UNSOLICITED bridge error', async () => {
    // The buyer's tap is answered inside the map: no native command is in
    // flight, so nothing rejects and the refusal only ever arrives as an
    // event. Before this observer the tap was absorbed in silence.
    const runtime = setup({ holdId: 'hold-1' });
    await act(async () => { create(React.createElement(SeatLayerPickerHoldOwnershipObserver)); });
    expect(seatLayerPickerHoldOwnershipStore(runtime.controller).getSnapshot()).toBeUndefined();
    await act(async () => {
      runtime.emit(new SeatLayerError('hold_owned_by_host', 'Hold is owned by the host.'));
    });
    expect(seatLayerPickerHoldOwnershipStore(runtime.controller).getSnapshot()).toMatchObject({
      kind: 'inCheckout',
      titleKey: 'holdInCheckoutTitle',
      bodyKey: 'holdInCheckoutBody',
      actionKey: 'releaseAndChangeSeats',
      holdId: 'hold-1',
    });
  });

  it('says "already held" where the picker made no hand-off to give back', async () => {
    const runtime = setup();
    await act(async () => { create(React.createElement(SeatLayerPickerHoldOwnershipObserver)); });
    await act(async () => {
      runtime.emit(new SeatLayerError('hold_already_active', 'A hold is already active.'));
    });
    const notice = seatLayerPickerHoldOwnershipStore(runtime.controller).getSnapshot();
    expect(notice).toMatchObject({ kind: 'alreadyHeld' });
    expect(notice?.actionKey).toBeUndefined();
  });

  it('leaves every other refusal to the host, and unsubscribes with the session', async () => {
    const runtime = setup({ holdId: 'hold-2' });
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(React.createElement(SeatLayerPickerHoldOwnershipObserver)); });
    await act(async () => { runtime.emit(new SeatLayerError('rate_limited', 'Slow down.')); });
    expect(seatLayerPickerHoldOwnershipStore(runtime.controller).getSnapshot()).toBeUndefined();
    await act(async () => { tree!.unmount(); });
    await act(async () => {
      runtime.emit(new SeatLayerError('hold_owned_by_host', 'Hold is owned by the host.'));
    });
    expect(seatLayerPickerHoldOwnershipStore(runtime.controller).getSnapshot()).toBeUndefined();
  });
});
