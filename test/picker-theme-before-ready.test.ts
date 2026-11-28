import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
  themes(): unknown[] {
    return this.frames
      .filter((frame) => frame.kind === 'cmd' && frame.type === 'picker.setThemeMode')
      .map((frame) => frame.payload);
  }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function begin(picker: SeatLayerPickerController): { transport: Transport; started: Promise<unknown> } {
  const transport = new Transport();
  const started = picker.beginHandshake(transport, { event: 'ev' }, { config: baseConfig });
  return { transport, started };
}

async function ready(picker: SeatLayerPickerController, started: Promise<unknown>): Promise<void> {
  picker.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities],
      commands: [...profile.requiredCommands],
      events: ['sys.ready', 'picker.snapshot'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'sys.ready', n: 1,
    p: {
      protocol: 2,
      snapshot: {
        schema: seatLayerPickerSnapshotSchema, sessionId: 'page-1', revision: 1,
        event: { key: 'ev', currency: 'EUR' },
        branding: {}, catalog: {}, map: {}, selection: { seats: [] }, cart: { items: [] }, hold: { active: false }, access: {},
      },
    },
  });
  await started;
  await flush();
}

describe('a theme asked for before the page is ready', () => {
  it('reaches the page once it is ready, the latest one only', async () => {
    const picker = new SeatLayerPickerController();
    const { transport, started } = begin(picker);
    await expect(picker.setThemeMode('light')).resolves.toBeUndefined();
    await expect(picker.setThemeMode('dark')).resolves.toBeUndefined();
    expect(transport.themes()).toEqual([]);

    await ready(picker, started);
    expect(transport.themes()).toEqual([{ mode: 'dark' }]);
    picker.dispose();
  });

  it('is kept when it comes before the page is even started', async () => {
    const picker = new SeatLayerPickerController();
    await picker.setThemeMode('dark');
    const { transport, started } = begin(picker);
    await ready(picker, started);
    expect(transport.themes()).toEqual([{ mode: 'dark' }]);
    picker.dispose();
  });

  it('refuses a wrong one and keeps the last good one', async () => {
    const picker = new SeatLayerPickerController();
    const { transport, started } = begin(picker);
    await picker.setThemeMode('dark');
    await expect(picker.setThemeMode('dim' as never)).rejects.toMatchObject({ code: 'bad_payload' });
    await expect(picker.setThemeMode('light', { background: 'blue' })).rejects.toMatchObject({ code: 'bad_payload' });
    await ready(picker, started);
    expect(transport.themes()).toEqual([{ mode: 'dark' }]);
    picker.dispose();
  });

  it('is sent once: a page that is already ready gets nothing more', async () => {
    const picker = new SeatLayerPickerController();
    const { transport, started } = begin(picker);
    await ready(picker, started);
    expect(transport.themes()).toEqual([]);
    void picker.setThemeMode('dark');
    await flush();
    expect(transport.themes()).toEqual([{ mode: 'dark' }]);
    picker.dispose();
  });
});
