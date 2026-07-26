import { describe, expect, it } from 'vitest';

import {
  decodeProtocolRange,
  negotiateProtocol,
} from '../src/bridge/protocol';

describe('protocol negotiation', () => {
  it('normalizes a bare revision', () => {
    expect(decodeProtocolRange(1)).toEqual({ min: 1, max: 1 });
  });

  it('chooses the highest shared revision', () => {
    expect(
      negotiateProtocol(
        { min: 1, max: 3 },
        { min: 1, max: 2 },
      ),
    ).toBe(2);
  });

  it('rejects non-overlapping ranges before rendering', () => {
    expect(() =>
      negotiateProtocol(
        { min: 2, max: 4 },
        { min: 1, max: 1 },
      ),
    ).toThrow(/No shared SeatLayer protocol revision/);
  });
});
