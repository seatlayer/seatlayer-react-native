export interface CartSheetMeasurementKey {
  readonly controller: object;
  readonly sessionId: number;
  readonly runtimeSessionId?: string;
  readonly expanded: boolean;
  readonly ownsChrome: boolean;
}

/** Retires old layout callbacks synchronously when a provider/presentation changes. */
export class CartSheetMeasurementCoordinator {
  private key: CartSheetMeasurementKey | undefined;
  private revision = 0;
  private measured = 0;

  begin(key: CartSheetMeasurementKey, fallback: number): { readonly revision: number; readonly height: number } {
    if (!this.key || !sameKey(this.key, key)) {
      this.key = key;
      this.revision += 1;
      this.measured = fallback;
    }
    return { revision: this.revision, height: this.measured };
  }

  measure(revision: number, value: unknown): number | undefined {
    if (revision !== this.revision || typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    this.measured = value;
    return value;
  }
}

function sameKey(left: CartSheetMeasurementKey, right: CartSheetMeasurementKey): boolean {
  return left.controller === right.controller && left.sessionId === right.sessionId &&
    left.runtimeSessionId === right.runtimeSessionId &&
    left.expanded === right.expanded && left.ownsChrome === right.ownsChrome;
}
