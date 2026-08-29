import type { SeatLayerPickerCallbacks, SeatLayerPickerCloseReason } from './callbacks';
import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerSnapshot } from './models';

export interface SeatLayerPickerCloseScope {
  readonly controller: SeatLayerPickerController;
  readonly sessionId: number;
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  reportError(error: unknown): void;
}

export interface SeatLayerPickerCloseLifecycleInputs {
  readonly getScope: () => SeatLayerPickerCloseScope;
  readonly getCallbacks: () => SeatLayerPickerCallbacks | undefined;
}

export interface SeatLayerPickerCloseLease {
  readonly controller: SeatLayerPickerController;
  readonly scopeSessionId: number;
  readonly runtimeSessionId: string;
}

type Flight = Readonly<{ readonly generation: number; readonly promise: Promise<boolean> }>;

/**
 * Serializes one presentation close without letting an old controller/session
 * abort, report into, or close a replacement picker.
 */
export class SeatLayerPickerCloseLifecycle {
  private flight: Flight | undefined;
  private generation = 0;
  private active = true;
  private closedGeneration: number | undefined;

  constructor(private readonly inputs: SeatLayerPickerCloseLifecycleInputs) {}

  request(reason: SeatLayerPickerCloseReason): Promise<boolean> {
    if (!this.active) return Promise.resolve(false);
    const existing = this.flight;
    if (existing !== undefined) return existing.promise;
    if (this.closedGeneration === this.generation) return Promise.resolve(true);
    const scope = this.inputs.getScope();
    const lease = captureSeatLayerPickerCloseLease(scope);
    const generation = this.generation;
    let settle!: (result: boolean) => void;
    const promise = new Promise<boolean>((resolve) => { settle = resolve; });
    const flight = Object.freeze({ generation, promise });
    this.flight = flight;
    void this.run(lease, generation, reason).then(settle, () => settle(false));
    void promise.finally(() => {
      if (this.flight === flight) this.flight = undefined;
    });
    return promise;
  }

  /** Retires a controlled presentation on unmount or provider replacement. */
  retire(): void {
    this.generation += 1;
    this.active = false;
    this.flight = undefined;
    this.closedGeneration = undefined;
  }

  /** Starts a fresh controlled visibility epoch; old flights remain inert. */
  reset(): void {
    this.generation += 1;
    this.active = true;
    this.flight = undefined;
    this.closedGeneration = undefined;
  }

  private async run(
    lease: SeatLayerPickerCloseLease,
    generation: number,
    reason: SeatLayerPickerCloseReason,
  ): Promise<boolean> {
    if (!this.current(lease, generation)) return false;
    try {
      await lease.controller.releasePickerOwnedHold();
    } catch (error) {
      this.report(lease, generation, error);
      return false;
    }
    if (!this.current(lease, generation)) return false;
    this.closedGeneration = generation;
    this.emitClosed(lease, generation, reason);
    return true;
  }

  private current(lease: SeatLayerPickerCloseLease, generation: number): boolean {
    if (!this.active || generation !== this.generation) return false;
    const scope = this.inputs.getScope();
    return scope.controller === lease.controller && scope.sessionId === lease.scopeSessionId &&
      (scope.snapshot?.sessionId ?? '') === lease.runtimeSessionId &&
      (lease.controller.getSnapshot()?.sessionId ?? '') === lease.runtimeSessionId;
  }

  private report(lease: SeatLayerPickerCloseLease, generation: number, error: unknown): void {
    if (!this.current(lease, generation)) return;
    try { this.inputs.getScope().reportError(error); } catch { /* Reporting is observational. */ }
  }

  private emitClosed(
    lease: SeatLayerPickerCloseLease,
    generation: number,
    reason: SeatLayerPickerCloseReason,
  ): void {
    if (!this.current(lease, generation)) return;
    const callback = this.inputs.getCallbacks()?.onClosed;
    try {
      void Promise.resolve(callback?.(reason)).catch((error) => this.report(lease, generation, error));
    } catch (error) {
      this.report(lease, generation, error);
    }
  }
}

export function captureSeatLayerPickerCloseLease(
  scope: SeatLayerPickerCloseScope,
): SeatLayerPickerCloseLease {
  return Object.freeze({
    controller: scope.controller,
    scopeSessionId: scope.sessionId,
    runtimeSessionId: scope.snapshot?.sessionId ?? scope.controller.getSnapshot()?.sessionId ?? '',
  });
}
