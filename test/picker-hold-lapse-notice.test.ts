import { describe, expect, it } from 'vitest';

import { SeatLayerPickerScopeHoldLapse } from '../src/picker/scopeHoldLapse';

describe('cart hold-lapse notice ownership', () => {
  it('does not re-open a dismissed epoch and resets only when a newer active hold arrives', () => {
    const state = new SeatLayerPickerScopeHoldLapse();
    state.accept({ holdLapsed: true, lapsedLabels: ['A-1'], recoverableLabels: ['A-1'], revision: 2 } as never);
    const key = state.value!.key;
    state.dismiss();
    expect(state.value).toBeUndefined();
    state.observeSnapshot({ revision: 2, hold: { active: true } } as never);
    expect(state.value).toBeUndefined();
    state.observeSnapshot({ revision: 3, hold: { active: true } } as never);
    expect(state.value).toBeUndefined();
    expect(state.matches(key)).toBe(false);
  });
});
