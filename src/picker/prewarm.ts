/**
 * §4.7 step 1. A host may start the runtime page ahead of time; it lives on a
 * short TTL and is discarded under memory pressure.
 *
 * **Platform note for a Swift/Compose port.** Flutter can hold a live
 * `WebViewController` and hand it to the view that claims it, so its prewarm is
 * a whole warm JavaScript context. React Native's `WebView` exposes no
 * detachable controller — a page belongs to the component that rendered it —
 * so this warms the *transport* instead: DNS, TLS, the CDN edge and the HTTP
 * cache entry for the runtime document and, where the host names them, its
 * bundles. The observable effect is the same shape (a claim that is cheaper
 * than a cold start, a short TTL, a drop under memory pressure) and strictly
 * smaller; a native iOS port with `WKWebView` should warm the page itself, the
 * way Flutter does.
 */

/**
 * Long enough for a buyer to read an event screen and decide; short enough that
 * a prewarm nobody wanted is not still holding resources three screens later.
 */
export const seatLayerPickerPrewarmDefaultTtlMs = 5 * 60_000;

/**
 * How long a warm entry is still worth counting on. The HTTP cache outlives
 * this, but past it the claim is reported as stale so a caller can decide not
 * to shorten its own loading backstop on the strength of it.
 */
export const seatLayerPickerPrewarmFreshnessMs = 60_000;

export interface SeatLayerPickerWarmPage {
  readonly url: string;
  readonly warmedAt: number;
  /** False once the entry is past `seatLayerPickerPrewarmFreshnessMs`. */
  readonly fresh: boolean;
}

export interface SeatLayerPickerPrewarmOptions {
  readonly ttlMs?: number;
  /** Additional documents to warm with the page — its bundle, its styles. */
  readonly assets?: readonly string[];
}

type Entry = {
  readonly url: string;
  warmedAt: number;
  expiresAt: number;
  failed: boolean;
};

type Fetcher = (url: string) => Promise<unknown>;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * Process-wide, like the runtime page it stands in for. A host warms from its
 * event screen and the picker claims on the way in; a claim on a cold registry
 * is simply a cold start, never a failure.
 */
export class SeatLayerRuntimePrewarm {
  private static readonly pages = new Map<string, Entry>();
  private static timers = new Map<string, unknown>();

  /** Real time: the HTTP cache's own clock is real time too. */
  static now: () => number = () => Date.now();
  static fetcher: Fetcher | undefined;
  static setTimer: (callback: () => void, ms: number) => unknown =
    (callback, ms) => setTimeout(callback, ms) as unknown;
  static clearTimer: (handle: unknown) => void =
    (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>);

  static get warmUrls(): readonly string[] {
    return Object.freeze([...SeatLayerRuntimePrewarm.pages.keys()]);
  }

  /**
   * Start `url` now. Idempotent: warming an entry that is already up only
   * refreshes how long it is kept. A non-http document is ignored — a bundled
   * fixture loads from disk and has nothing to gain.
   */
  static start(url: string, options: SeatLayerPickerPrewarmOptions = {}): void {
    const target = httpUrl(url);
    if (target === undefined) return;
    const ttl = typeof options.ttlMs === 'number' && Number.isFinite(options.ttlMs) &&
      options.ttlMs > 0
      ? options.ttlMs
      : seatLayerPickerPrewarmDefaultTtlMs;
    const now = SeatLayerRuntimePrewarm.now();
    const existing = SeatLayerRuntimePrewarm.pages.get(target);
    if (existing !== undefined && !existing.failed) {
      existing.expiresAt = now + ttl;
      SeatLayerRuntimePrewarm.arm(target, ttl);
      return;
    }
    const entry: Entry = { url: target, warmedAt: now, expiresAt: now + ttl, failed: false };
    SeatLayerRuntimePrewarm.pages.set(target, entry);
    SeatLayerRuntimePrewarm.arm(target, ttl);
    for (const asset of [target, ...(options.assets ?? [])]) {
      SeatLayerRuntimePrewarm.warm(entry, asset);
    }
  }

  /**
   * Take the warm entry for `url`, if one is up and healthy. It is handed out
   * once: a second claim is a cold start, so two pickers cannot both believe
   * they got the warm one.
   */
  static claim(url: string): SeatLayerPickerWarmPage | undefined {
    const target = httpUrl(url);
    if (target === undefined) return undefined;
    const entry = SeatLayerRuntimePrewarm.pages.get(target);
    if (entry === undefined) return undefined;
    SeatLayerRuntimePrewarm.release(target);
    if (entry.failed) return undefined;
    const now = SeatLayerRuntimePrewarm.now();
    if (now >= entry.expiresAt) return undefined;
    return Object.freeze({
      url: target,
      warmedAt: entry.warmedAt,
      fresh: now - entry.warmedAt < seatLayerPickerPrewarmFreshnessMs,
    });
  }

  static discard(url: string): void {
    const target = httpUrl(url);
    if (target !== undefined) SeatLayerRuntimePrewarm.release(target);
  }

  /**
   * Throw away every unclaimed entry. A prewarm is a convenience; work the
   * buyer never asked for is not worth an out-of-memory kill on the host.
   */
  static discardAll(): void {
    for (const url of [...SeatLayerRuntimePrewarm.pages.keys()]) {
      SeatLayerRuntimePrewarm.release(url);
    }
  }

  private static arm(url: string, ttl: number): void {
    const previous = SeatLayerRuntimePrewarm.timers.get(url);
    if (previous !== undefined) SeatLayerRuntimePrewarm.clearTimer(previous);
    SeatLayerRuntimePrewarm.timers.set(
      url,
      SeatLayerRuntimePrewarm.setTimer(() => SeatLayerRuntimePrewarm.release(url), ttl),
    );
  }

  private static release(url: string): void {
    SeatLayerRuntimePrewarm.pages.delete(url);
    const handle = SeatLayerRuntimePrewarm.timers.get(url);
    if (handle !== undefined) SeatLayerRuntimePrewarm.clearTimer(handle);
    SeatLayerRuntimePrewarm.timers.delete(url);
  }

  private static warm(entry: Entry, url: string): void {
    const target = httpUrl(url);
    if (target === undefined) return;
    const fetcher = SeatLayerRuntimePrewarm.fetcher ??
      (globalThis as { fetch?: Fetcher }).fetch?.bind(globalThis);
    if (typeof fetcher !== 'function') return;
    try {
      void Promise.resolve(fetcher(target)).catch(() => {
        // A document that failed to warm is worse than no warm document only
        // if a claimant trusts it. Mark it and let the picker start cold.
        if (target === entry.url) entry.failed = true;
      });
    } catch {
      entry.failed = true;
    }
  }
}

/**
 * Drops warm entries the moment the platform says memory is short. Call once
 * from the host; returns its own teardown.
 */
export function observeSeatLayerPickerMemoryPressure(
  subscribe: (listener: () => void) => (() => void) | undefined,
): () => void {
  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = subscribe(() => SeatLayerRuntimePrewarm.discardAll());
  } catch {
    // A host that cannot report pressure simply keeps the TTL as its only bound.
  }
  return () => {
    try {
      unsubscribe?.();
    } catch {
      // Teardown is best effort.
    }
  };
}
