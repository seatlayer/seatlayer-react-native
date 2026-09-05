import { SeatLayerError } from '../errors';
import type { JsonValue } from '../json';

/**
 * The controller's command plumbing, with no knowledge of the picker contract:
 * one serial action queue, one cancellable in-flight command, and one bounded
 * wait for a revision to land. It is split out of the controller so the
 * controller file stays about the bridge's commands rather than about promises.
 *
 * Every wait registered here is cancelled by {@link cancelAll}, which is what
 * makes a disposed controller settle its callers instead of stranding them.
 */
export class SeatLayerPickerCommandDispatch {
  private readonly commandCancels = new Set<() => void>();
  private readonly revisionCancels = new Set<() => void>();
  private actionTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly isDisposed: () => boolean,
    private readonly revisionWaitMs: number,
  ) {}

  /** Serialises mutations so inventory commands never interleave on the wire. */
  serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isDisposed()) return Promise.reject(SeatLayerError.destroyed());
    const guarded = () =>
      this.isDisposed() ? Promise.reject(SeatLayerError.destroyed()) : operation();
    const next = this.actionTail.then(guarded, guarded);
    this.actionTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * Runs one bridge command so that a dispose settles it. A synchronous throw
   * from the transport is reported through the same promise as a rejection.
   */
  run(send: () => Promise<JsonValue | undefined>): Promise<JsonValue | undefined> {
    return new Promise<JsonValue | undefined>((resolve, reject) => {
      let settled = false;
      let cancel: () => void;
      const finish = (
        outcome: 'resolve' | 'reject',
        value: JsonValue | undefined | unknown,
      ) => {
        if (settled) return;
        settled = true;
        this.commandCancels.delete(cancel);
        if (outcome === 'resolve') {
          resolve(value as JsonValue | undefined);
        } else {
          reject(value);
        }
      };
      cancel = () => finish('reject', SeatLayerError.destroyed());
      this.commandCancels.add(cancel);
      let raw: Promise<JsonValue | undefined>;
      try {
        raw = send();
      } catch (error) {
        finish('reject', error);
        return;
      }
      void raw.then(
        (value) => finish('resolve', value),
        (error: unknown) => finish('reject', error),
      );
    });
  }

  /**
   * Waits for `reached()` to answer true, bounded by the configured wait. A
   * timeout resolves rather than rejecting: the caller decides whether a
   * missed revision is a failure, because only it knows what it asked for.
   */
  awaitRevision(
    reached: () => boolean,
    subscribe: (listener: () => void) => () => void,
  ): Promise<void> {
    if (reached()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: SeatLayerError) => {
        clearTimeout(timer);
        unsubscribe();
        this.revisionCancels.delete(cancel);
        if (error) reject(error);
        else resolve();
      };
      const unsubscribe = subscribe(() => {
        if (reached()) finish();
      });
      const timer = setTimeout(() => finish(), this.revisionWaitMs);
      const cancel = () => finish(SeatLayerError.destroyed());
      this.revisionCancels.add(cancel);
    });
  }

  /** Settles every waiting caller as destroyed. Safe to call more than once. */
  cancelAll(): void {
    for (const cancel of [...this.commandCancels]) cancel();
    this.commandCancels.clear();
    for (const cancel of [...this.revisionCancels]) cancel();
    this.revisionCancels.clear();
  }
}
