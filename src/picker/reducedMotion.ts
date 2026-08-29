import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

export interface SeatLayerPickerReducedMotionSubscription { remove(): void; }
export interface SeatLayerPickerReducedMotionSource {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(event: 'reduceMotionChanged', listener: (enabled: boolean) => void): SeatLayerPickerReducedMotionSubscription;
}

/** Live accessibility store: each active subscription refreshes and listens anew. */
export class SeatLayerPickerReducedMotionStore {
  private value = false;
  private readonly listeners = new Set<() => void>();
  private subscription: SeatLayerPickerReducedMotionSubscription | undefined;
  private generation = 0;
  constructor(private readonly source: SeatLayerPickerReducedMotionSource) {}
  getSnapshot = (): boolean => this.value;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };
  private start(): void {
    const generation = ++this.generation;
    let liveObservation = 0;
    const apply = (enabled: unknown, observation = liveObservation) => {
      if (typeof enabled !== 'boolean' || observation !== liveObservation || generation !== this.generation || this.listeners.size === 0 || this.value === enabled) return;
      this.value = enabled;
      for (const listener of this.listeners) listener();
    };
    try {
      this.subscription = this.source.addEventListener('reduceMotionChanged', (enabled) => {
        if (typeof enabled !== 'boolean') return;
        liveObservation += 1;
        apply(enabled);
      });
    } catch { /* Optional RN event surface. */ }
    try {
      const initialObservation = liveObservation;
      void this.source.isReduceMotionEnabled().then((enabled) => apply(enabled, initialObservation), () => {});
    } catch { /* Accessibility detection remains safely false. */ }
  }
  private stop(): void {
    this.generation += 1;
    try { this.subscription?.remove(); } catch { /* Best-effort native cleanup. */ }
    this.subscription = undefined;
  }
}

const seatLayerPickerReducedMotionStore = new SeatLayerPickerReducedMotionStore(AccessibilityInfo);

export function useSeatLayerPickerReducedMotion(
  store: SeatLayerPickerReducedMotionStore = seatLayerPickerReducedMotionStore,
): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
