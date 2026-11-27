import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import {
  seatLayerConnectionChangedEvent,
  seatLayerConnectionStateCapability,
} from '../src/bridge/protocol';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

const snapshot = (revision = 1) => ({
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
});

async function readyPicker(capabilities: readonly string[]): Promise<SeatLayerPickerController> {
  const picker = new SeatLayerPickerController();
  const started = picker.beginHandshake(new Transport(), { event: 'ev' }, { config: baseConfig });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, ...capabilities],
      commands: [...profile.requiredCommands],
      events: ['sys.ready', 'picker.snapshot', seatLayerConnectionChangedEvent],
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
  return picker;
}

let sequence = 1;
function line(picker: SeatLayerPickerController, state: unknown): void {
  sequence += 1;
  picker.mapController.ingestRaw({ sl: 1, k: 'evt', t: seatLayerConnectionChangedEvent, n: sequence, p: { state } });
}
function seats(picker: SeatLayerPickerController): void {
  sequence += 1;
  picker.mapController.ingestRaw({ sl: 1, k: 'evt', t: 'picker.snapshot', n: sequence, p: { snapshot: snapshot(sequence) } });
}

describe('the page line through the bridge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows connection.changed and says Back online once the seats are read again', async () => {
    const picker = await readyPicker([seatLayerConnectionStateCapability]);
    vi.useFakeTimers();
    let calls = 0;
    const stop = picker.subscribeConnection(() => {
      calls += 1;
    });
    expect(picker.getConnection()).toBeNull();

    line(picker, 'offline');
    expect(picker.getConnection()).toBe('offline');
    expect(picker.getConnectionShown()).toBe('none');
    vi.advanceTimersByTime(3000);
    expect(picker.getConnectionShown()).toBe('offline');

    line(picker, 'live');
    expect(picker.getConnectionShown()).toBe('updating');
    seats(picker);
    expect(picker.getConnectionShown()).toBe('back');

    // A word this SDK does not know changes nothing.
    line(picker, 'satellite');
    expect(picker.getConnection()).toBe('live');
    expect(calls).toBeGreaterThan(0);
    stop();
    picker.dispose();
  });

  it('stays silent when the page does not name connection-state-v1', async () => {
    const picker = await readyPicker([]);
    line(picker, 'offline');
    expect(picker.getConnection()).toBeNull();
    picker.dispose();
  });
});
