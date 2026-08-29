import type { SeatLayerPickerSnapshot } from './models';

/** Structural GA click state; resolve its display data from the current snapshot. */
export interface SeatLayerPickerGACandidate {
  readonly areaId: string;
  readonly clickEpoch: number;
}

/** Immutable external store for the latest valid GA click. */
export class SeatLayerPickerGACandidateStore {
  private candidate: SeatLayerPickerGACandidate | undefined;
  private clickEpoch = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly isAvailable: () => boolean,
    private readonly getPickerSnapshot: () => SeatLayerPickerSnapshot | undefined,
  ) {}

  getSnapshot = (): SeatLayerPickerGACandidate | undefined => this.candidate;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  accept(areaId: string): void {
    this.reconcile();
    const snapshot = this.getPickerSnapshot();
    if (!this.isAvailable() || !snapshot) return;
    if (!snapshot.generalAdmissionAreas.some((area) => area.id === areaId)) return;
    this.clickEpoch += 1;
    this.set(Object.freeze({ areaId, clickEpoch: this.clickEpoch }));
  }

  clearExact(clickEpoch: number): boolean {
    if (this.candidate?.clickEpoch !== clickEpoch) return false;
    this.set(undefined);
    return true;
  }

  reset(): void {
    this.set(undefined);
  }

  reconcile(): void {
    const snapshot = this.getPickerSnapshot();
    if (
      this.candidate &&
      (!this.isAvailable() ||
        !snapshot ||
        !snapshot.generalAdmissionAreas.some(
          (area) => area.id === this.candidate?.areaId,
        ))
    ) {
      this.set(undefined);
    }
  }

  dispose(): void {
    this.reset();
    this.listeners.clear();
  }

  private set(candidate: SeatLayerPickerGACandidate | undefined): void {
    if (this.candidate === candidate) return;
    this.candidate = candidate;
    for (const listener of this.listeners) listener();
  }
}
