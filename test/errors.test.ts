import { describe, expect, it } from 'vitest';

import { decodeBridgeError } from '../src/errors';

describe('bridge errors', () => {
  it('decodes conflicts nested in the Web SDK error details', () => {
    expect(
      decodeBridgeError({
        code: 'hold_conflict',
        message: 'Some seats are no longer available.',
        details: {
          status: 409,
          conflicts: [{ label: 'A-1', status: 'held' }],
        },
      }),
    ).toMatchObject({
      code: 'hold_conflict',
      conflicts: [{ label: 'A-1', status: 'held' }],
    });
  });

  it('falls back to the bridge reason when no top-level code is present', () => {
    expect(
      decodeBridgeError({
        message: 'The hold expired.',
        details: { reason: 'hold_expired' },
      }),
    ).toMatchObject({
      code: 'hold_expired',
      message: 'The hold expired.',
    });
  });
});
