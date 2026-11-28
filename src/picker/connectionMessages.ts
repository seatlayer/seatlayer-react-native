import { useEffect, useRef } from 'react';

import { SeatLayerError } from '../errors';
import { seatLayerPickerNoConnection, seatLayerPickerSecuresSeats } from './errorWords';
import { seatLayerPickerFailureFor } from './failureLog';
import type { SeatLayerPickerScopeValue } from './pickerScopeTypes';
import type { SeatLayerToastRequest } from './toastQueue';

/**
 * How a failure is told: a lost line (`connection`: no answer, nothing came
 * back in time), a server that answered with a fault of its own (`server`,
 * 5xx), or anything else, a refusal included (`other`).
 */
export type SeatLayerPickerFailureKind = 'connection' | 'server' | 'other';

const pageHttpStatus = /page returned HTTP (\d{3})/;

/** Which kind of failure `error` is. */
export function seatLayerPickerFailureKind(error: unknown): SeatLayerPickerFailureKind {
  if (!(error instanceof SeatLayerError)) return 'other';
  const { code } = error;
  if (code === 'sl_timeout' || code === 'host_timeout') return 'connection';
  if (code === 'sl_transport') {
    const status = Number(pageHttpStatus.exec(error.message)?.[1]);
    if (Number.isFinite(status)) return status >= 500 ? 'server' : 'other';
    return /page load failed/i.test(error.message) ? 'connection' : 'other';
  }
  const meta = error.details?.meta;
  const status = typeof meta?.status === 'number' && Number.isFinite(meta.status) ? meta.status : undefined;
  const pageMessage = error.details?.message ?? '';
  if (status === undefined) return seatLayerPickerNoConnection.test(pageMessage) ? 'connection' : 'other';
  return status >= 500 && (
    code === 'command_failed' || code === 'picker_error' || code === 'internal_error'
    || pageMessage.startsWith('request_failed')
  ) ? 'server' : 'other';
}

/**
 * Whether the server answered and said no (a 4xx the page passes on): the
 * run, Season or event is not there, or not for this buyer. Nothing a
 * connection would change.
 */
export function seatLayerPickerServerRefused(error: unknown): boolean {
  if (!(error instanceof SeatLayerError) || error.code === 'sl_transport') return false;
  const status = error.details?.meta?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Whether `error` is told by the small message rather than the red line: no
 * answer, or a server fault while securing seats.
 */
export function seatLayerPickerToldAsMessage(error: unknown): boolean {
  const kind = seatLayerPickerFailureKind(error);
  return kind === 'connection'
    || (kind === 'server' && seatLayerPickerSecuresSeats(seatLayerPickerFailureFor(error)?.command));
}

/** How long a hold or a best-seats search runs before the buyer is told to wait. */
export const seatLayerPickerTakingLongerMs = 10_000;

/**
 * The presses that wait on the server, per picker: the checkout flight and the
 * best-seats search say when they start and end, and the checkout leaves how
 * to run it again.
 */
export class SeatLayerPickerPressWatch {
  private waiting = 0;
  private retryValue: (() => void) | undefined;
  private readonly listeners = new Set<(waiting: boolean) => void>();

  /** A press now waits on the server; call the returned function when it ends. */
  begin(): () => void {
    let ended = false;
    this.waiting += 1;
    if (this.waiting === 1) this.tell(true);
    return () => {
      if (ended) return;
      ended = true;
      this.waiting -= 1;
      if (this.waiting === 0) this.tell(false);
    };
  }

  /** How to run the app's checkout again, through the same path as its button. */
  setRetry(retry: (() => void) | undefined): void {
    this.retryValue = retry;
  }

  get retry(): (() => void) | undefined {
    return this.retryValue;
  }

  subscribe(listener: (waiting: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private tell(waiting: boolean): void {
    for (const listener of [...this.listeners]) listener(waiting);
  }
}

const watches = new WeakMap<object, SeatLayerPickerPressWatch>();

/** The press watch of the picker `controller`. */
export function seatLayerPickerPressWatch(controller: object): SeatLayerPickerPressWatch {
  let watch = watches.get(controller);
  if (watch === undefined) {
    watch = new SeatLayerPickerPressWatch();
    watches.set(controller, watch);
  }
  return watch;
}

/**
 * What the picker says by the button when the line, not the seats, is the
 * trouble:
 * - a press without an answer: "Check your connection and try again." as a
 *   small message, where it was the red line; the red line stays for refusals;
 * - a server fault on a hold or on the way to checkout: "Couldn’t reach
 *   checkout." with "Try again", which runs the app's checkout again;
 * - from 10 s into a hold or a best-seats search without an answer: "This is
 *   taking longer than usual. Please wait…".
 */
export function useSeatLayerPickerConnectionMessages(
  scope: SeatLayerPickerScopeValue,
  show: (request: SeatLayerToastRequest) => void,
): void {
  const told = useRef<unknown>(undefined);
  const latest = useRef({ show, strings: scope.strings });
  latest.current = { show, strings: scope.strings };
  const { error, isReady } = scope;
  useEffect(() => {
    if (!isReady || error === undefined || told.current === error) return;
    if (!seatLayerPickerToldAsMessage(error)) return;
    const kind = seatLayerPickerFailureKind(error);
    told.current = error;
    const retry = seatLayerPickerPressWatch(scope.controller).retry;
    show(kind === 'server'
      ? {
        message: scope.strings.translate('couldNotReachCheckout'),
        tone: 'warning',
        ...(retry === undefined ? {} : { actionLabel: scope.strings.translate('retry'), onAction: retry }),
      }
      : { message: scope.strings.translate('checkConnection'), tone: 'warning' });
    scope.clearError();
  }, [error, isReady, scope, show]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = seatLayerPickerPressWatch(scope.controller).subscribe((waiting) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = waiting
        ? setTimeout(() => {
          const { show: say, strings } = latest.current;
          say({ message: strings.translate('takingLonger'), tone: 'neutral' });
        }, seatLayerPickerTakingLongerMs)
        : undefined;
    });
    return () => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [scope.controller]);
}
