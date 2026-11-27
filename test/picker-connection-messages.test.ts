import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SeatLayerError } from '../src/errors';
import {
  SeatLayerPickerPressWatch,
  seatLayerPickerFailureKind,
  seatLayerPickerPressWatch,
  seatLayerPickerToldAsMessage,
  useSeatLayerPickerConnectionMessages,
} from '../src/picker/connectionMessages';
import { rememberSeatLayerPickerFailure } from '../src/picker/failureLog';
import type { SeatLayerToastRequest } from '../src/picker/toastQueue';

function refused(code: string, status: number | null, message = code): SeatLayerError {
  return SeatLayerError.bridge({ code, message, details: status === null ? {} : { status } });
}
async function during(error: SeatLayerError, command: string): Promise<SeatLayerError> {
  await rememberSeatLayerPickerFailure(Promise.reject(error), command).catch(() => undefined);
  return error;
}

describe('which failures are the line, the server or neither', () => {
  it('reads no answer as the line', () => {
    expect(seatLayerPickerFailureKind(SeatLayerError.timeout('picker.holdSelection', 45_000))).toBe('connection');
    expect(seatLayerPickerFailureKind(SeatLayerError.transport('SeatLayer page load failed: The Internet connection appears to be offline.'))).toBe('connection');
    expect(seatLayerPickerFailureKind(refused('unknown', null, 'TypeError: Failed to fetch'))).toBe('connection');
  });

  it('reads a server fault as the server, and a refusal or a 4xx as neither', () => {
    expect(seatLayerPickerFailureKind(refused('command_failed', 502))).toBe('server');
    expect(seatLayerPickerFailureKind(refused('internal_error', 500))).toBe('server');
    expect(seatLayerPickerFailureKind(SeatLayerError.transport('SeatLayer page returned HTTP 503.'))).toBe('server');
    expect(seatLayerPickerFailureKind(SeatLayerError.transport('SeatLayer page returned HTTP 404.'))).toBe('other');
    expect(seatLayerPickerFailureKind(refused('conflict', 409))).toBe('other');
    expect(seatLayerPickerFailureKind(new Error('app'))).toBe('other');
  });

  it('tells a server fault as a message only while securing seats', async () => {
    expect(seatLayerPickerToldAsMessage(await during(refused('command_failed', 502), 'picker.holdSelection'))).toBe(true);
    expect(seatLayerPickerToldAsMessage(await during(refused('command_failed', 502), 'picker.removeCartLine'))).toBe(false);
    expect(seatLayerPickerToldAsMessage(await during(refused('conflict', 409), 'picker.holdSelection'))).toBe(false);
    expect(seatLayerPickerToldAsMessage(SeatLayerError.timeout('picker.bestAvailable', 15_000))).toBe(true);
  });
});

describe('the press watch', () => {
  it('says when the first press starts waiting and the last one ends, once each', () => {
    const watch = new SeatLayerPickerPressWatch();
    const seen: boolean[] = [];
    watch.subscribe((waiting) => seen.push(waiting));
    const first = watch.begin();
    const second = watch.begin();
    first();
    first();
    second();
    expect(seen).toEqual([true, false]);
  });
});

const words: Record<string, string> = {
  checkConnection: 'Check your connection and try again.', couldNotReachCheckout: 'Couldn’t reach checkout.',
  retry: 'Try again', takingLonger: 'This is taking longer than usual. Please wait…',
};

describe('what is said by the button', () => {
  let shown: SeatLayerToastRequest[];
  let cleared: number;
  let controller: object;
  const scopeWith = (error: unknown) => ({
    controller, error, isReady: true,
    strings: { translate: (key: string) => words[key] ?? key },
    clearError: () => { cleared += 1; },
  }) as any;
  function Harness({ scope }: { scope: any }): null {
    useSeatLayerPickerConnectionMessages(scope, (request) => shown.push(request));
    return null;
  }
  beforeEach(() => {
    shown = [];
    cleared = 0;
    controller = {};
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says "Check your connection" for a press without an answer, once, and clears the red line', () => {
    const error = SeatLayerError.timeout('picker.holdSelection', 45_000);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(React.createElement(Harness, { scope: scopeWith(error) })); });
    act(() => { tree.update(React.createElement(Harness, { scope: scopeWith(error) })); });
    expect(shown).toEqual([{ message: words.checkConnection, tone: 'warning' }]);
    expect(cleared).toBe(1);
  });

  it('says "Couldn’t reach checkout." with Try again running the checkout again', async () => {
    const retry = vi.fn();
    seatLayerPickerPressWatch(controller).setRetry(retry);
    const error = await during(refused('command_failed', 502), 'picker.continue');
    act(() => { create(React.createElement(Harness, { scope: scopeWith(error) })); });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ message: words.couldNotReachCheckout, tone: 'warning', actionLabel: 'Try again' });
    shown[0]!.onAction!();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('leaves a refusal to the red line', async () => {
    const error = await during(refused('conflict', 409), 'picker.holdSelection');
    act(() => { create(React.createElement(Harness, { scope: scopeWith(error) })); });
    expect(shown).toEqual([]);
    expect(cleared).toBe(0);
  });

  it('says "taking longer" ten seconds into a press without an answer, and not after it ends', () => {
    act(() => { create(React.createElement(Harness, { scope: scopeWith(undefined) })); });
    const watch = seatLayerPickerPressWatch(controller);
    const ended = watch.begin();
    act(() => { vi.advanceTimersByTime(9_999); });
    expect(shown).toEqual([]);
    act(() => { vi.advanceTimersByTime(1); });
    expect(shown).toEqual([{ message: words.takingLonger, tone: 'neutral' }]);
    ended();
    const again = watch.begin();
    act(() => { vi.advanceTimersByTime(5_000); });
    again();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(shown).toHaveLength(1);
  });
});
