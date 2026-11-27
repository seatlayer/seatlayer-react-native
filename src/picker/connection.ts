
/**
 * The page's line to the server, as `connection.changed` and the snapshot's
 * `map.connection` name it: `live` (the live line is open), `reconnecting`
 * (it closed and a retry is set), `polling` (seats come by the page's regular
 * poll), `offline` (the device says it has no network).
 */
export type SeatLayerConnectionState = 'live' | 'reconnecting' | 'polling' | 'offline';

/** The state `value` names, or null for a value this SDK does not know. */
export function seatLayerConnectionStateFrom(value: unknown): SeatLayerConnectionState | null {
  return value === 'live' || value === 'reconnecting' || value === 'polling' || value === 'offline'
    ? value
    : null;
}

/** Whether the line is down: the page says `offline` or `reconnecting`. */
export function seatLayerLineDown(state: SeatLayerConnectionState | null | undefined): boolean {
  return state === 'offline' || state === 'reconnecting';
}

/**
 * What the picker's connection status says: nothing, "You're offline",
 * "Updating…" (coming back, or no seat news for a while), or "Back online"
 * for a moment after an outage the buyer was told about.
 */
export type SeatLayerConnectionShown = 'none' | 'offline' | 'updating' | 'back';

export interface SeatLayerConnectionWatchTimings {
  readonly offlineAfterMs?: number;
  readonly updatingAfterMs?: number;
  readonly backForMs?: number;
}

/**
 * Turns the page's line into what the buyer is told, and when.
 *
 * "You're offline" waits `offlineAfterMs`, so a blink of the network says
 * nothing. A line that is merely retrying says "Updating…" after
 * `updatingAfterMs`. "Back online" follows only an outage the buyer was told
 * about, and only once the seats have been read again; it stays `backForMs`.
 */
export class SeatLayerConnectionWatch {
  readonly offlineAfterMs: number;
  readonly updatingAfterMs: number;
  readonly backForMs: number;

  private shownValue: SeatLayerConnectionShown = 'none';
  private stateValue: SeatLayerConnectionState | null = null;
  private saidOfflineValue = false;
  private waitingForSeats = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly listeners = new Set<(shown: SeatLayerConnectionShown) => void>();
  private readonly stateListeners = new Set<() => void>();

  constructor(timings: SeatLayerConnectionWatchTimings = {}) {
    this.offlineAfterMs = timings.offlineAfterMs ?? 3000;
    this.updatingAfterMs = timings.updatingAfterMs ?? 10000;
    this.backForMs = timings.backForMs ?? 2500;
  }

  /** What the status says now. */
  get shown(): SeatLayerConnectionShown {
    return this.shownValue;
  }

  /** The page's latest state, or null when it has said none. */
  get state(): SeatLayerConnectionState | null {
    return this.stateValue;
  }

  /** Whether the buyer has been told they are offline and is not yet back. */
  get saidOffline(): boolean {
    return this.saidOfflineValue;
  }

  subscribe(listener: (shown: SeatLayerConnectionShown) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Called when the page's state changes, whether or not the status does. */
  subscribeState(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /** The page reported `next`. Null (a value this SDK does not know) and a repeat change nothing. */
  heard(next: SeatLayerConnectionState | null): void {
    if (this.disposed || next === null || next === this.stateValue) return;
    this.stateValue = next;
    this.clearTimer();
    this.stateChanged();
    switch (next) {
      case 'offline':
        this.waitingForSeats = false;
        if (this.saidOfflineValue) {
          this.show('offline');
        } else {
          this.timer = setTimeout(() => {
            this.timer = null;
            this.saidOfflineValue = true;
            this.show('offline');
          }, this.offlineAfterMs);
        }
        return;
      case 'reconnecting':
        this.waitingForSeats = false;
        if (this.saidOfflineValue) {
          this.show('updating');
        } else if (this.shownValue !== 'updating') {
          this.timer = setTimeout(() => {
            this.timer = null;
            this.show('updating');
          }, this.updatingAfterMs);
        }
        return;
      case 'live':
      case 'polling':
        if (this.saidOfflineValue) {
          // Back: say so once the seats have been read again.
          this.waitingForSeats = true;
          this.show('updating');
        } else {
          this.show('none');
        }
        return;
    }
  }

  /** The page's seats were read: a snapshot arrived. */
  seatsRead(): void {
    if (this.disposed || !this.waitingForSeats) return;
    this.waitingForSeats = false;
    this.saidOfflineValue = false;
    this.show('back');
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.show('none');
    }, this.backForMs);
  }

  /** A new page: nothing it has not said yet is known. */
  reset(): void {
    if (this.disposed) return;
    this.clearTimer();
    const hadState = this.stateValue !== null;
    this.stateValue = null;
    this.saidOfflineValue = false;
    this.waitingForSeats = false;
    if (hadState) this.stateChanged();
    this.show('none');
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
    this.stateListeners.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private stateChanged(): void {
    for (const listener of [...this.stateListeners]) listener();
  }

  private show(shown: SeatLayerConnectionShown): void {
    if (this.disposed || shown === this.shownValue) return;
    this.shownValue = shown;
    for (const listener of [...this.listeners]) listener(shown);
  }
}
