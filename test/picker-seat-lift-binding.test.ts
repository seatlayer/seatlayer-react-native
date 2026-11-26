import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seatLayerPickerSheetLiftFraction } from '../src/picker/seatLift';
import { useSeatLayerPickerSeatLiftBinding } from '../src/picker/seatLiftBinding';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// What a phone held sideways measured with a seat card open on a back-row seat:
// the card covers most of a short map, and nothing else changes size.
const sideways = { mapHeight: 236, top: 56, bottom: 56, sheet: 170.6666717529297 };

/** Frames one at a time: React draws again only once each act has ended. */
async function frames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  }
}

describe('seat lift binding', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('lifts the seat when nothing else draws again after the card opens', async () => {
    const frameSeat = vi.fn(async () => ({ dy: -120, gestures: 0 }));
    const controller = { supportsFrameSeat: true, frameSeat } as never;
    let renders = 0;
    function Probe(): null {
      renders += 1;
      useSeatLayerPickerSeatLiftBinding({ controller, sessionId: 1, seatId: 'row-f:6', revision: 7, ...sideways });
      return null;
    }
    await act(async () => { create(React.createElement(Probe)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(frameSeat).toHaveBeenCalledTimes(1);
    expect(frameSeat).toHaveBeenCalledWith('row-f:6', {
      fraction: seatLayerPickerSheetLiftFraction(sideways),
      gestures: undefined,
    });
    // It asks for one more frame to see the height hold, then stops.
    const settled = renders;
    await frames(30);
    expect(renders).toBe(settled);
    expect(renders).toBeLessThanOrEqual(3);
  });

  it('stops asking for frames when the card band goes while the seat is kept', async () => {
    const frameSeat = vi.fn(async () => ({ dy: -120, gestures: 0 }));
    const controller = { supportsFrameSeat: true, frameSeat } as never;
    let renders = 0;
    function Probe({ sheet }: { sheet: number }): null {
      renders += 1;
      useSeatLayerPickerSeatLiftBinding({ controller, sessionId: 1, seatId: 'row-f:6', revision: 7, ...sideways, sheet });
      return null;
    }
    let renderer!: ReactTestRenderer;
    // The card opens: the lift waits for the height to hold.
    await act(async () => { renderer = create(React.createElement(Probe, { sheet: sideways.sheet })); });
    // Before the next frame the card's band is gone, the seat still named.
    await act(async () => { renderer.update(React.createElement(Probe, { sheet: 0 })); });
    const settled = renders;
    await frames(30);

    expect(renders - settled).toBeLessThanOrEqual(1);
    expect(frameSeat).not.toHaveBeenCalled();
  });
});
