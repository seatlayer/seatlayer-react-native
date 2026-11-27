import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** How long the offline panel waits before its next try: 10 s, 20 s, then every 30 s. */
export function seatLayerPickerOfflineRetryAfter(tries: number): number {
  return tries === 0 ? 10_000 : tries === 1 ? 20_000 : 30_000;
}

/** A picker that has been fine this long starts the steps again. */
const freshAfterMs = 120_000;

interface Tries { count: number; last: number }
// Each try opens the page again and so draws a new panel: the steps are kept
// per picker, not per panel.
const triesOf = new WeakMap<object, Tries>();

function tries(owner: object): Tries {
  let value = triesOf.get(owner);
  if (value === undefined || Date.now() - value.last > freshAfterMs) {
    value = { count: 0, last: Date.now() };
    triesOf.set(owner, value);
  }
  return value;
}

function inFront(): boolean {
  try {
    const state = AppState?.currentState;
    return state === undefined || state === null || state === 'active';
  } catch {
    return true;
  }
}

function watchFront(listener: (state: string) => void): { remove(): void } | undefined {
  try {
    return AppState?.addEventListener?.('change', listener);
  } catch {
    return undefined;
  }
}

/**
 * While `on` and the app is in front, opens the page again by itself after
 * 10 s and 20 s, then every 30 s. In the background it waits, and starts the
 * steps again when the app comes back to the front.
 */
export function useSeatLayerPickerOfflineRetries(owner: object | undefined, on: boolean, retry: () => void): void {
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    if (!on || owner === undefined) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      const steps = tries(owner);
      timer = setTimeout(() => {
        timer = undefined;
        if (stopped) return;
        steps.count += 1;
        steps.last = Date.now();
        retryRef.current();
        // A try that leaves the panel up (it failed at once) waits for the next
        // step; one that replaces it ends here, in the clean-up.
        if (!stopped) schedule();
      }, seatLayerPickerOfflineRetryAfter(steps.count));
    };
    if (inFront()) schedule();
    const life = watchFront((state) => {
      if (state === 'active') {
        schedule();
      } else if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    });
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      life?.remove();
    };
  }, [on, owner]);
}
