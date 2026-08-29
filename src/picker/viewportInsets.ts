export type SeatLayerPickerViewportInsetBand =
  | 'header'
  | 'dock'
  | 'sheet'
  | 'confirmation'
  | 'immersive'
  | (string & {});

export interface SeatLayerPickerViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type SeatLayerPickerViewportInsetInput = Readonly<Partial<SeatLayerPickerViewportInsets>>;

export interface SeatLayerPickerAnimationFrameScheduler {
  requestAnimationFrame(callback: () => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
}

export interface SeatLayerPickerViewportInsetCoordinator {
  setBand(band: SeatLayerPickerViewportInsetBand, insets: SeatLayerPickerViewportInsetInput): void;
  removeBand(band: SeatLayerPickerViewportInsetBand): void;
  dispose(): void;
}

const zeroInsets: SeatLayerPickerViewportInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function clampInset(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeInsets(insets: SeatLayerPickerViewportInsetInput): SeatLayerPickerViewportInsets {
  return Object.freeze({
    top: clampInset(insets.top),
    right: clampInset(insets.right),
    bottom: clampInset(insets.bottom),
    left: clampInset(insets.left),
  });
}

function sameInsets(left: SeatLayerPickerViewportInsets | undefined, right: SeatLayerPickerViewportInsets): boolean {
  return left !== undefined
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.left === right.left;
}

function resolveInsets(bands: ReadonlyMap<string, SeatLayerPickerViewportInsets>): SeatLayerPickerViewportInsets {
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  for (const insets of bands.values()) {
    top = Math.max(top, insets.top);
    right = Math.max(right, insets.right);
    bottom = Math.max(bottom, insets.bottom);
    left = Math.max(left, insets.left);
  }
  return top === 0 && right === 0 && bottom === 0 && left === 0
    ? zeroInsets
    : Object.freeze({ top, right, bottom, left });
}

/**
 * Coordinates independently-owned native overlay bands. It only reports
 * insets; animation, layout application, capabilities, and commands remain
 * with the calling surface.
 */
export function createSeatLayerPickerViewportInsetCoordinator(
  scheduler: SeatLayerPickerAnimationFrameScheduler,
  onInsets: (insets: SeatLayerPickerViewportInsets) => void,
): SeatLayerPickerViewportInsetCoordinator {
  const bands = new Map<string, SeatLayerPickerViewportInsets>();
  let disposed = false;
  let scheduled = false;
  let scheduledHandle: unknown;
  let delivered: SeatLayerPickerViewportInsets | undefined;

  const flush = () => {
    scheduled = false;
    const resolved = resolveInsets(bands);
    if (!disposed && !sameInsets(delivered, resolved)) {
      delivered = resolved;
      onInsets(resolved);
    }
  };

  const schedule = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    scheduledHandle = scheduler.requestAnimationFrame(flush);
  };

  return {
    setBand(band, insets) {
      if (disposed) return;
      const normalized = normalizeInsets(insets);
      const key = String(band);
      if (sameInsets(bands.get(key), normalized)) return;
      bands.set(key, normalized);
      schedule();
    },
    removeBand(band) {
      if (disposed || !bands.delete(String(band))) return;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bands.clear();
      if (scheduled) scheduler.cancelAnimationFrame(scheduledHandle);
      scheduled = false;
    },
  };
}
