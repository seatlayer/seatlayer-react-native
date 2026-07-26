import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeClient, type BridgeSignal } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { SeatLayerError } from '../src/errors';

class RecordingTransport {
  readonly frames: Envelope[] = [];
  send(envelope: Envelope): void {
    this.frames.push(envelope);
  }
}

afterEach(() => vi.useRealTimers());

describe('BridgeClient', () => {
  it('correlates a response exactly once', async () => {
    const transport = new RecordingTransport();
    const client = new BridgeClient(transport);
    const result = client.command('getSelection');
    const command = transport.frames[0]!;
    client.ingest({
      kind: 'res',
      type: command.type,
      id: command.id,
      payload: { seats: [] },
    });
    client.ingest({
      kind: 'res',
      type: command.type,
      id: command.id,
      payload: { seats: [{ id: 'duplicate' }] },
    });
    await expect(result).resolves.toEqual({ seats: [] });
    expect(client.openCommandCount).toBe(0);
  });

  it('times out and drops a late response', async () => {
    vi.useFakeTimers();
    const transport = new RecordingTransport();
    const client = new BridgeClient(transport, 100);
    const result = client.command('getFloors');
    const command = transport.frames[0]!;
    const assertion = expect(result).rejects.toMatchObject({
      code: 'sl_timeout',
    });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    client.ingest({
      kind: 'res',
      type: command.type,
      id: command.id,
      payload: { floors: [] },
    });
    expect(client.openCommandCount).toBe(0);
  });

  it('drops stale sequences independently per event type', () => {
    const client = new BridgeClient(new RecordingTransport());
    const signals: BridgeSignal[] = [];
    client.onSignal((signal) => signals.push(signal));
    client.ingest({
      kind: 'evt',
      type: 'selection.changed',
      sequence: 4,
    });
    client.ingest({
      kind: 'evt',
      type: 'selection.changed',
      sequence: 3,
    });
    client.ingest({
      kind: 'evt',
      type: 'hint',
      sequence: 1,
    });
    expect(signals).toHaveLength(2);
    expect(client.highestSequenceFor('selection.changed')).toBe(4);
    expect(client.highestSequenceFor('hint')).toBe(1);
  });

  it('attributes an out-of-band inventory error to the latest hold command', async () => {
    const client = new BridgeClient(new RecordingTransport());
    const result = client.command('bestAvailable', { qty: 4 });
    client.ingest({
      kind: 'evt',
      type: 'error',
      sequence: 8,
      payload: {
        code: 'sold_out',
        message: 'No seats remain.',
      },
    });
    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<SeatLayerError>>({ code: 'sold_out' }),
    );
  });

  it('fails all open commands when closed', async () => {
    const client = new BridgeClient(new RecordingTransport());
    const first = client.command('getSelection');
    const second = client.command('getFloors');
    client.close();
    await expect(first).rejects.toMatchObject({ code: 'destroyed' });
    await expect(second).rejects.toMatchObject({ code: 'destroyed' });
  });
});
