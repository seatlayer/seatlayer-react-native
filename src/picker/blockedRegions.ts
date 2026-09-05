import type { SeatLayerPickerBlockedRegion } from './models';
import type { SeatLayerPickerAnimationFrameScheduler } from './viewportInsets';

/**
 * §2.4 / §4.6a. Every control drawn inside the map's rectangle reports where it
 * lies, so a runtime advertising `picker.setBlockedRegions` can swallow the
 * pointer sequence that starts under it before its gesture machine or canvas
 * sees it. The rectangles are the second guard: the first one — the map taking
 * part in gesture resolution and losing it — is a platform concern the shell
 * still holds (RN: the WebView is an ordinary UIView and native chrome above it
 * wins the touch outright, so the shell rule costs nothing to keep).
 */

/** A rectangle in window coordinates, before the map surface origin is removed. */
export interface SeatLayerPickerMeasuredRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type SeatLayerPickerBlockedRegionSink = (
  regions: readonly SeatLayerPickerBlockedRegion[] | null,
) => Promise<unknown> | unknown;

export interface SeatLayerPickerBlockedRegionLease {
  /** Reports the control's rectangle in window coordinates. */
  report(rect: SeatLayerPickerMeasuredRect | undefined): void;
  /** Retires the control. Its rectangle lingers for the grace window. */
  release(): void;
}

/**
 * A control that has left keeps its guard for this long. The runtime's guard is
 * the only thing standing between a departing control's last tap and the seat
 * underneath it, and a rect withdrawn on the same frame as the unmount loses
 * that race exactly as a pointer-down guard does.
 */
export const seatLayerPickerBlockedRegionLingerMs = 600;

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Window rectangle minus the map surface origin, in the map's own logical px —
 * the same frame as `picker.setViewportInsets`. Sides are floored at zero; a
 * control overhanging the surface keeps its negative origin, which the contract
 * allows and which is what a half-covered disc actually looks like.
 */
export function seatLayerPickerBlockedRegionFromRect(
  rect: SeatLayerPickerMeasuredRect | undefined,
  surface: SeatLayerPickerMeasuredRect | undefined,
): SeatLayerPickerBlockedRegion | undefined {
  if (rect === undefined || surface === undefined) return undefined;
  const x = finite(rect.x);
  const y = finite(rect.y);
  const w = finite(rect.width);
  const h = finite(rect.height);
  const originX = finite(surface.x);
  const originY = finite(surface.y);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  if (originX === undefined || originY === undefined) return undefined;
  if (w <= 0 || h <= 0) return undefined;
  return Object.freeze({ x: x - originX, y: y - originY, w, h });
}

/** The whole map surface, for a modal that covers the page. */
export function seatLayerPickerBlockedRegionCover(
  surface: SeatLayerPickerMeasuredRect | undefined,
): SeatLayerPickerBlockedRegion | undefined {
  if (surface === undefined) return undefined;
  const w = finite(surface.width);
  const h = finite(surface.height);
  if (w === undefined || h === undefined || w <= 0 || h <= 0) return undefined;
  return Object.freeze({ x: 0, y: 0, w, h });
}

function sameRegion(
  left: SeatLayerPickerBlockedRegion,
  right: SeatLayerPickerBlockedRegion,
): boolean {
  return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h;
}

function sameList(
  left: readonly SeatLayerPickerBlockedRegion[] | undefined,
  right: readonly SeatLayerPickerBlockedRegion[],
): boolean {
  if (left === undefined || left.length !== right.length) return false;
  return left.every((region, index) => sameRegion(region, right[index]!));
}

type Entry = {
  region: SeatLayerPickerBlockedRegion | undefined;
  rect: SeatLayerPickerMeasuredRect | undefined;
  releasedAt: number | undefined;
};

export interface SeatLayerPickerBlockedRegionRegistryOptions {
  readonly scheduler: SeatLayerPickerAnimationFrameScheduler;
  readonly sink: SeatLayerPickerBlockedRegionSink;
  /** `false` while the runtime's hello command table lacks the command. */
  readonly supported: () => boolean;
  readonly reportError?: (error: unknown) => void;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly lingerMs?: number;
}

/**
 * Coalesces every registered control into one list per frame, replaces the whole
 * list on every send, never sends the same list twice, and clears with `[]` when
 * the composing layout leaves.
 */
export class SeatLayerPickerBlockedRegionRegistry {
  private readonly entries = new Map<number, Entry>();
  private surface: SeatLayerPickerMeasuredRect | undefined;
  private nextId = 0;
  private scheduled = false;
  private scheduledHandle: unknown;
  private lingerHandle: unknown;
  private delivered: readonly SeatLayerPickerBlockedRegion[] | undefined;
  private attempted: readonly SeatLayerPickerBlockedRegion[] | undefined;
  private inFlight: Promise<unknown> | undefined;
  private disposed = false;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly lingerMs: number;

  constructor(private readonly options: SeatLayerPickerBlockedRegionRegistryOptions) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ??
      ((callback, ms) => setTimeout(callback, ms) as unknown);
    this.clearTimer = options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.lingerMs = options.lingerMs ?? seatLayerPickerBlockedRegionLingerMs;
  }

  /** The map surface's own window rectangle. Every report is measured against it. */
  setSurface(rect: SeatLayerPickerMeasuredRect | undefined): void {
    if (this.disposed) return;
    this.surface = rect;
    for (const entry of this.entries.values()) {
      entry.region = seatLayerPickerBlockedRegionFromRect(entry.rect, rect);
    }
    this.schedule();
  }

  claim(): SeatLayerPickerBlockedRegionLease {
    if (this.disposed) {
      return Object.freeze({ report: () => undefined, release: () => undefined });
    }
    const id = ++this.nextId;
    this.entries.set(id, { region: undefined, rect: undefined, releasedAt: undefined });
    return Object.freeze({
      report: (rect: SeatLayerPickerMeasuredRect | undefined) => {
        const entry = this.entries.get(id);
        if (this.disposed || entry === undefined || entry.releasedAt !== undefined) return;
        const region = seatLayerPickerBlockedRegionFromRect(rect, this.surface);
        if (region === undefined && entry.region === undefined) return;
        if (region !== undefined && entry.region !== undefined && sameRegion(region, entry.region)) return;
        entry.rect = rect;
        entry.region = region;
        this.schedule();
      },
      release: () => {
        const entry = this.entries.get(id);
        if (this.disposed || entry === undefined || entry.releasedAt !== undefined) return;
        if (entry.region === undefined) {
          this.entries.delete(id);
          return;
        }
        entry.releasedAt = this.now();
        this.armLinger();
      },
    });
  }

  /** Registers the whole surface while a modal covers the page. */
  claimCover(): SeatLayerPickerBlockedRegionLease {
    const lease = this.claim();
    return Object.freeze({
      report: () => lease.report(this.surface),
      release: () => lease.release(),
    });
  }

  /** The current list, oldest registration first. Test seam and read model. */
  regions(): readonly SeatLayerPickerBlockedRegion[] {
    const list: SeatLayerPickerBlockedRegion[] = [];
    for (const entry of this.entries.values()) {
      if (entry.region !== undefined) list.push(entry.region);
    }
    return Object.freeze(list);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.clear();
    if (this.scheduled) this.options.scheduler.cancelAnimationFrame(this.scheduledHandle);
    this.scheduled = false;
    if (this.lingerHandle !== undefined) this.clearTimer(this.lingerHandle);
    this.lingerHandle = undefined;
    if (this.delivered !== undefined || this.attempted !== undefined) {
      this.send([]);
    }
  }

  /**
   * A report made outside a frame still gets one: `requestAnimationFrame` asks
   * for the next drawn frame rather than piggy-backing on one already running,
   * which is the Flutter round's post-frame-callback trap in RN's shape.
   */
  private schedule(): void {
    if (this.disposed || this.scheduled) return;
    this.scheduled = true;
    this.scheduledHandle = this.options.scheduler.requestAnimationFrame(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  private armLinger(): void {
    if (this.disposed || this.lingerHandle !== undefined) return;
    this.lingerHandle = this.setTimer(() => {
      this.lingerHandle = undefined;
      this.sweep();
    }, this.lingerMs);
  }

  private sweep(): void {
    if (this.disposed) return;
    const cutoff = this.now() - this.lingerMs;
    let changed = false;
    let pending = false;
    for (const [id, entry] of this.entries) {
      if (entry.releasedAt === undefined) continue;
      if (entry.releasedAt <= cutoff) {
        this.entries.delete(id);
        changed = true;
      } else {
        pending = true;
      }
    }
    if (pending) this.armLinger();
    if (changed) this.schedule();
  }

  private flush(): void {
    if (this.disposed || !this.options.supported()) return;
    const next = this.regions();
    if (sameList(this.delivered, next) || sameList(this.attempted, next)) return;
    if (this.inFlight !== undefined) return;
    this.send(next);
  }

  private send(regions: readonly SeatLayerPickerBlockedRegion[]): void {
    this.attempted = regions;
    let flight: Promise<unknown>;
    try {
      flight = Promise.resolve(this.options.sink(regions));
    } catch (error) {
      flight = Promise.reject(error);
    }
    const wrapped = flight.then(
      () => {
        if (!this.disposed) this.delivered = regions;
      },
      (error: unknown) => {
        if (this.disposed) return;
        this.attempted = undefined;
        this.options.reportError?.(error);
      },
    ).finally(() => {
      if (this.inFlight === wrapped) this.inFlight = undefined;
      if (!this.disposed) this.flush();
    });
    this.inFlight = wrapped;
  }
}
