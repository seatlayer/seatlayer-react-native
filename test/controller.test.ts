import { describe, expect, it } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { SeatLayerController } from '../src/controller';
import {
  seatLayerHostedWebVersion,
  seatLayerMobilePageUrl,
} from '../src/types';

describe('runtime metadata', () => {
  it('keeps the hosted version and immutable page in lockstep', () => {
    expect(seatLayerHostedWebVersion).toBe('0.66.0');
    expect(seatLayerMobilePageUrl).toBe(
      `https://cdn.seatlayer.io/seatlayer-js@${seatLayerHostedWebVersion}/mobile.html`,
    );
  });
});

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
        host: { platform: 'react-native', sdk: '0.2.0' },
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

  it('negotiates private selection capabilities and correlates token refresh', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const ready = controller.beginHandshake(transport, {
      event: 'ev_private',
      numberOfPlacesToSelect: 2,
      selectionValidators: [{ type: 'consecutiveSeats' }],
      buyerAccessTokenProvider: async ({ reason }) => ({
        token: `bse_${reason}`,
        expiresAt: 123,
      }),
    });

    controller.ingestRaw({
      sl: 1,
      k: 'hello',
      t: 'hello',
      p: {
        protocol: { min: 1, max: 1 },
        capabilities: [
          'native-access-provider',
          'selection-controls',
          'selection-validity',
        ],
        commands: [],
        events: [],
      },
    });
    expect(transport.frames[0]).toMatchObject({
      kind: 'init',
      payload: {
        config: {
          event: 'ev_private',
          nativeAccessProvider: true,
          numberOfPlacesToSelect: 2,
          selectionValidators: [{ type: 'consecutiveSeats' }],
        },
      },
    });

    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'sys.ready',
      n: 1,
      p: { protocol: 1 },
    });
    await ready;

    let validity: unknown;
    controller.on('selectionValidityChanged', (event) => {
      validity = event;
    });
    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'selection.validity.changed',
      n: 2,
      p: {
        validity: {
          isValid: false,
          count: 1,
          required: 2,
          remaining: 1,
          seats: [{ id: 's1', label: 'A-1' }],
          violations: ['numberOfPlacesToSelect'],
        },
      },
    });
    expect(validity).toMatchObject({
      isValid: false,
      count: 1,
      violations: ['numberOfPlacesToSelect'],
    });

    controller.ingestRaw({
      sl: 1,
      k: 'evt',
      t: 'access.token.request',
      n: 3,
      p: { requestId: 'access-1', reason: 'reconnect' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const response = transport.frames[transport.frames.length - 1]!;
    expect(response).toMatchObject({
      kind: 'cmd',
      type: 'access.token.provide',
      payload: {
        requestId: 'access-1',
        token: 'bse_reconnect',
        expiresAt: 123,
      },
    });
    controller.ingestRaw({
      sl: 1,
      k: 'res',
      t: 'access.token.provide',
      id: response.id,
      p: {},
    });
    controller.dispose();
  });
});
