export interface SeatLayerPickerLifecycleSink {
  setLifecycle(state: string): Promise<unknown>;
  synchronize(): Promise<unknown>;
  refreshAvailability?(): Promise<unknown>;
}

/** Serializes lifecycle catch-up and discards callbacks from a retired session. */
export class SeatLayerPickerLifecycleCoordinator {
  private state = "active";
  private ready = false;
  private disposed = false;
  private inFlight = false;
  private dirty = false;

  constructor(
    private readonly controller: SeatLayerPickerLifecycleSink,
    private readonly reportError: (error: unknown) => void,
    private readonly onForegroundOutcome?: (outcome: unknown) => void,
    private readonly refreshOnResume = true,
  ) {}

  setAppState(state: string): void {
    if (this.disposed) return;
    this.state = state;
    this.request();
  }

  markReady(): void {
    if (this.disposed || this.ready) return;
    this.ready = true;
    this.request();
  }

  dispose(): void {
    this.disposed = true;
  }

  private request(): void {
    if (!this.ready || this.disposed) return;
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    void this.flush();
  }

  private async flush(): Promise<void> {
    this.inFlight = true;
    this.dirty = false;
    const state = this.state;
    try {
      const result = await this.controller.setLifecycle(
        state === "active" ? "foreground" : "background",
      );
      await this.recover(state, result);
    } catch (error) {
      if (!this.disposed) {
        try { this.reportError(error); } catch { /* observer only */ }
      }
      await this.recover(state, undefined);
    } finally {
      if (this.disposed) return;
      this.inFlight = false;
      if (this.dirty || this.state !== state) this.request();
    }
  }

  private async recover(state: string, result: unknown): Promise<void> {
    if (this.disposed || this.state !== state || state !== "active") return;
    const outcome = lifecycleOutcome(result);
    if (outcome !== undefined) { this.emitOutcome(outcome); return; }
    let refreshed: unknown;
    if (this.refreshOnResume && this.controller.refreshAvailability) try { refreshed = await this.controller.refreshAvailability(); } catch { /* housekeeping */ }
    if (this.disposed || this.state !== state) return;
    const refreshedOutcome = lifecycleOutcome(refreshed);
    if (refreshedOutcome !== undefined) { this.emitOutcome(refreshedOutcome); return; }
    if (this.refreshOnResume && hasSnapshot(refreshed)) return;
    try { await this.controller.synchronize(); } catch { /* housekeeping */ }
  }

  private emitOutcome(outcome: unknown): void {
    try { this.onForegroundOutcome?.(outcome); } catch { /* observer only */ }
  }
}

function lifecycleOutcome(value: unknown): unknown {
  return dataObject(ownData(value, "outcome"));
}

function hasSnapshot(value: unknown): boolean {
  return dataObject(ownData(value, "snapshot")) !== undefined;
}

function dataObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function ownData(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** One-shot compatibility helper for callers without a retained coordinator. */
export function synchronizeSeatLayerPickerLifecycle(
  ready: boolean,
  state: string,
  controller: SeatLayerPickerLifecycleSink,
  reportError: (error: unknown) => void,
): void {
  if (!ready) return;
  const coordinator = new SeatLayerPickerLifecycleCoordinator(
    controller,
    reportError,
  );
  coordinator.setAppState(state);
  coordinator.markReady();
}
