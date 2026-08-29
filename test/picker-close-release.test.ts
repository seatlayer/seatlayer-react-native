import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerPickerController } from '../src/picker/controller';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

const config = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config });

function snapshot(
  revision: number,
  hold: Readonly<{ active?: boolean; owner?: 'picker' | 'host' }> = {},
) {
  return {
    schema: seatLayerPickerSnapshotSchema,
    sessionId: 'close-release',
    revision,
    event: { key: 'event', currency: 'USD' },
    branding: {},
    catalog: {},
    map: {},
    selection: { seats: [] },
    cart: { items: [] },
    hold: {
      active: hold.active ?? false,
      ...(hold.owner === undefined ? {} : { ownership: hold.owner }),
    },
    access: {},
  };
}

class ManualTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];

  send(frame: Envelope): void {
    this.frames.push(frame);
  }

  commands(): Envelope[] {
    return this.frames.filter((frame) => frame.kind === 'cmd');
  }
}

async function mounted(initial = snapshot(1)) {
  const transport = new ManualTransport();
  const picker = new SeatLayerPickerController();
  const ready = picker.beginHandshake(transport, { event: 'event' }, { config });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: profile.requiredCapabilities,
      commands: profile.requiredCommands,
      events: profile.requiredEvents,
    },
  });
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'evt',
    t: 'sys.ready',
    n: 1,
    p: { protocol: 2, snapshot: initial },
  });
  await ready;
  return { picker, transport };
}

function respond(
  picker: SeatLayerPickerController,
  frame: Envelope,
  result: unknown,
): void {
  picker.mapController.ingestRaw({
    sl: 1,
    k: 'res',
    t: frame.type,
    id: frame.id,
    p: result,
  });
}

async function nextCommand(
  transport: ManualTransport,
  index: number,
): Promise<Envelope> {
  for (let turn = 0; turn < 10; turn += 1) {
    const frame = transport.commands()[index];
    if (frame) return frame;
    await Promise.resolve();
  }
  throw new Error(`Expected command ${index}.`);
}

describe('picker releasePickerOwnedHold', () => {
  it('reads the post-queue snapshot before deciding whether to abort a picker hold', async () => {
    const { picker, transport } = await mounted();
    const selection = picker.selectObjects(['seat-1']);
    const release = picker.releasePickerOwnedHold();
    const select = await nextCommand(transport, 0);
    expect(select.type).toBe('picker.selectObjects');
    expect(transport.commands()).toHaveLength(1);

    respond(picker, select, { snapshot: snapshot(2, { active: true, owner: 'picker' }) });
    await selection;
    const abort = await nextCommand(transport, 1);
    expect(abort.type).toBe('picker.abort');
    respond(picker, abort, { snapshot: snapshot(3, { active: false }) });

    await expect(release).resolves.toMatchObject({ revision: 3, hold: { active: false } });
    picker.dispose();
  });

  it.each([
    ['host-owned', { active: true, owner: 'host' as const }],
    ['inactive', { active: false }],
  ])('does not send picker.abort for a %s hold', async (_name, hold) => {
    const { picker, transport } = await mounted(snapshot(1, hold));
    await expect(picker.releasePickerOwnedHold()).resolves.toMatchObject({ hold });
    expect(transport.commands()).toHaveLength(0);
    picker.dispose();
  });
});
