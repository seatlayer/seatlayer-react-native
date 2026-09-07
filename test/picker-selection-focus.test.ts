import { describe, expect, it } from 'vitest';

import { SeatLayerPickerSelectionFocus } from '../src/picker/selectionFocus';

function sink(supportsSelectionFocus = true, fail = false) {
  const asked: (string | null)[] = [];
  return {
    asked,
    supportsSelectionFocus,
    setSelectionFocus: async (seatId: string | null) => {
      asked.push(seatId);
      if (fail) throw Object.assign(new Error('unsupported'), { code: 'unsupported_command' });
    },
  };
}

const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

describe('§3.8.1a candidate paint', () => {
  it('names the card’s seat on open and clears it on close', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('s1');
    await settle();
    expect(target.asked).toEqual(['s1']);
    expect(focus.focusedSeatId).toBe('s1');
    focus.focus(null);
    await settle();
    expect(target.asked).toEqual(['s1', null]);
  });

  it('coalesces a seat reported on every frame into one command', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    for (let index = 0; index < 20; index += 1) focus.focus('s1');
    await settle();
    expect(target.asked).toEqual(['s1']);
  });

  it('carries the last seat when a card is replaced before the microtask runs', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('s1');
    focus.focus('s2');
    await settle();
    expect(target.asked).toEqual(['s2']);
  });

  it('asks nothing at all of a runtime that does not advertise the command', async () => {
    const target = sink(false);
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('s1');
    await settle();
    focus.dispose();
    await settle();
    expect(target.asked).toEqual([]);
  });

  it('swallows a refusal rather than raising it at a buyer answering a card', async () => {
    const target = sink(true, true);
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('s1');
    await settle();
    expect(target.asked).toEqual(['s1']);
  });

  it('treats a blank seat id as no candidate', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('   ');
    await settle();
    expect(target.asked).toEqual([]);
  });

  it('clears the paint when the card goes away and sends nothing after', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.focus('s1');
    await settle();
    focus.dispose();
    focus.focus('s2');
    await settle();
    expect(target.asked).toEqual(['s1', null]);
  });

  it('does not clear a paint it never asked for', async () => {
    const target = sink();
    const focus = new SeatLayerPickerSelectionFocus(target);
    focus.dispose();
    await settle();
    expect(target.asked).toEqual([]);
  });
});
