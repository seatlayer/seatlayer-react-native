import type { ReadyInfo } from '../types';
import {
  decodeSeatLayerChartLoadEvent,
  SeatLayerChartLoadAttempt,
  type SeatLayerChartLoad,
  type SeatLayerChartLoadClock,
} from './chartLoad';

export type SeatLayerChartLoadListener = (load: SeatLayerChartLoad) => unknown;

/** Delivers advertised chart-load events without replaying them to later listeners. */
export class SeatLayerPickerChartLoadSubscriptions {
  private readonly listeners = new Set<SeatLayerChartLoadListener>();
  private readonly attempt: SeatLayerChartLoadAttempt;
  private disposed = false;

  constructor(
    private readonly supported: () => boolean,
    clock?: SeatLayerChartLoadClock,
  ) {
    this.attempt = new SeatLayerChartLoadAttempt(clock);
  }

  begin(startedAt?: number): void {
    if (!this.disposed) this.attempt.begin(startedAt);
  }

  markReady(info: ReadyInfo | undefined): void {
    if (!this.disposed) this.attempt.markReady(info);
  }

  subscribe(listener: SeatLayerChartLoadListener): () => void {
    if (this.disposed || typeof listener !== 'function') return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  accept(payload: unknown): void {
    if (this.disposed || !this.supported()) return;
    const trace = decodeSeatLayerChartLoadEvent(payload);
    if (trace === undefined) return;
    const load = this.attempt.merge(trace);
    for (const listener of this.listeners) {
      try {
        const result = listener(load);
        void Promise.resolve(result).catch(() => undefined);
      } catch {
        // Observer failures cannot affect the controller or another observer.
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
