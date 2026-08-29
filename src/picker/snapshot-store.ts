import { decodeSeatLayerPickerSnapshot } from './decode';
import type { SeatLayerPickerSnapshot } from './models';

/** Immutable, revision-ordered state source compatible with useSyncExternalStore. */
export class SeatLayerPickerSnapshotStore {
  private current: SeatLayerPickerSnapshot | undefined;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): SeatLayerPickerSnapshot | undefined => this.current;

  subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(snapshot: SeatLayerPickerSnapshot): boolean {
    const previous = this.current;
    if (previous && previous.sessionId !== snapshot.sessionId) {
      return false;
    }
    if (previous && snapshot.revision <= previous.revision) {
      return false;
    }
    this.current = snapshot;
    this.notify();
    return true;
  }

  ingest(value: unknown): SeatLayerPickerSnapshot | undefined {
    const snapshot = decodeSeatLayerPickerSnapshot(value);
    return snapshot && this.apply(snapshot) ? snapshot : undefined;
  }

  clear(): void {
    if (!this.current) return;
    this.current = undefined;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
