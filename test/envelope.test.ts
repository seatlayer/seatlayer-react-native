import { describe, expect, it } from 'vitest';

import {
  decodeEnvelope,
  encodeEnvelope,
  envelopeMarker,
} from '../src/bridge/envelope';

describe('bridge envelopes', () => {
  it('round-trips a correlated command', () => {
    const encoded = encodeEnvelope({
      kind: 'cmd',
      type: 'bestAvailable',
      id: 'rn4',
      payload: { qty: 4 },
    });
    expect(decodeEnvelope(encoded)).toEqual({
      kind: 'cmd',
      type: 'bestAvailable',
      id: 'rn4',
      payload: { qty: 4 },
    });
  });

  it('accepts integral JavaScript numbers for event sequences', () => {
    expect(
      decodeEnvelope({
        sl: envelopeMarker,
        k: 'evt',
        t: 'selection.changed',
        n: 2.0,
      }),
    ).toMatchObject({ kind: 'evt', sequence: 2 });
  });

  it('preserves unknown future envelope kinds for forward compatibility', () => {
    expect(
      decodeEnvelope({
        sl: envelopeMarker,
        k: 'snapshot',
        t: 'future.snapshot',
      }),
    ).toMatchObject({ kind: 'snapshot', type: 'future.snapshot' });
  });

  it.each([
    'not-json',
    null,
    [],
    { sl: 2, k: 'evt', t: 'ready' },
    { sl: 1, k: 'evt', t: '' },
    { sl: 1, k: 'evt', t: 'ready', n: 1.5 },
    { sl: 1, k: 'res', t: 'hold', id: 4 },
  ])('drops malformed traffic: %j', (value) => {
    expect(decodeEnvelope(value)).toBeUndefined();
  });
});
