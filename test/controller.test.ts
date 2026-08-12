import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { SeatLayerController } from '../src/controller';

class RecordingTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(envelope: Envelope): void {
    this.frames.push(envelope);
  }
}

describe('SeatLayerController', () => {
  it('negotiates, reports ready and runs a typed command', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const ready = controller.beginHandshake(transport, {
      event: 'ev_test',
      currency: 'USD',
    });

    controller.ingestRaw(
      JSON.stringify({
        sl: 1,
        k: 'hello',
        t: 'hello',
        p: {
          bundle: '0.30.1',
          protocol: { min: 1, max: 1 },
          commands: ['getSelection'],
          events: ['sys.ready'],
        },
      }),
    );
    expect(transport.frames[0]).toMatchObject({
      kind: 'init',
      payload: {
        host: { platform: 'react-native', sdk: '0.1.2' },
        config: { event: 'ev_test', currency: 'USD' },
      },
    });

    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 1,
      p: {
        protocol: 1,
        mode: 'test',
        transport: 'rn',
        chart: { event: 'ev_test' },
      },
    });
    await expect(ready).resolves.toMatchObject({
      protocolRevision: 1,
      mode: 'test',
      platform: 'rn',
      eventKey: 'ev_test',
    });

    const selection = controller.getSelection();
    const command = transport.frames[transport.frames.length - 1]!;
    controller.ingestRaw({
      sl: 1,
      k: 'res',
      t: 'getSelection',
      id: command.id,
      p: {
        seats: [
          {
            id: 's1',
            label: 'A-1',
            displayLabel: 'Row A, Seat 1',
            price: 45,
          },
        ],
      },
    });
    await expect(selection).resolves.toEqual([
      {
        id: 's1',
        label: 'A-1',
        displayLabel: 'Row A, Seat 1',
        price: 45,
      },
    ]);
    controller.dispose();
  });

  it('buffers an early hello until the view transport attaches', async () => {
    const controller = new SeatLayerController();
    controller.ingestRaw({
      sl: 1,
      k: 'hello',
      t: 'hello',
      p: {
        bundle: '0.30.1',
        protocol: { min: 1, max: 1 },
        commands: [],
        events: [],
      },
    });
    const transport = new RecordingTransport();
    const ready = controller.beginHandshake(transport, { event: 'ev_buffered' });
    expect(transport.frames[0]).toMatchObject({ kind: 'init' });
    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 1,
      p: { protocol: 1 },
    });
    await expect(ready).resolves.toMatchObject({ protocolRevision: 1 });
    controller.dispose();
  });
});
