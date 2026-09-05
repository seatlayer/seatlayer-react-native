import type { BuyerAccessToken, BuyerAccessTokenProvider, SeatLayerConfiguration } from '../types';

/**
 * Flutter 0.5.0 / §3.8.7 — the buyer-scoped images the native chrome draws.
 *
 * A seat-view thumbnail is NOT a URL an image view can load on its own: on a
 * private event the same path answers 401 without the buyer's bearer, and
 * putting that bearer on an `<Image>` source would leak it into the platform's
 * shared image cache key. This mirrors the web transport instead —
 * `GET {apiBase}{reference}` with `Authorization: Bearer …` and no cookies —
 * and keeps the result in its own small cache.
 *
 * Every failure resolves to `undefined`. "No photograph" is an ordinary state
 * of the confirm card, and a thrown error there would take down a card the
 * buyer is answering.
 */

/** The default API origin, matching the runtime's own. */
export const seatLayerPickerDefaultApiBase = 'https://api.seatlayer.io';

/** How many resolved references the loader keeps. */
export const seatLayerPickerAssetCacheEntries = 12;

/** How long before a bearer's stated expiry it stops being used. */
export const seatLayerPickerAssetTokenSafetyMarginMs = 30_000;

/** How long the default transport may take before the card gives up. */
export const seatLayerPickerAssetTimeoutMs = 15_000;

/** The refresh reason a bearer minted for an image is asked for under. */
export const seatLayerPickerAssetRefreshReason = 'asset';

/** `/pub/events/{key}/assets/{asset}`, and nothing else. */
const referencePattern = /^\/pub\/events\/([^/]+)\/assets\/([a-zA-Z0-9._-]+)$/;

/**
 * How the bytes for one event-scoped image are actually fetched, already
 * turned into something an `<Image>` can take. Injected so tests never open a
 * socket, and so a host with its own HTTP stack can supply one.
 */
export type SeatLayerPickerAssetFetch = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => Promise<string>;

export interface SeatLayerPickerBuyerAssetLoaderOptions {
  readonly eventKey: string;
  readonly apiBase?: string;
  readonly token?: BuyerAccessToken;
  readonly tokenProvider?: BuyerAccessTokenProvider;
  readonly fetch?: SeatLayerPickerAssetFetch;
  readonly now?: () => number;
}

export class SeatLayerPickerBuyerAssetLoader {
  readonly eventKey: string;
  readonly apiBase: string;
  private readonly tokenProvider: BuyerAccessTokenProvider | undefined;
  private readonly transport: SeatLayerPickerAssetFetch;
  private readonly now: () => number;
  private token: BuyerAccessToken | undefined;
  private readonly resolved = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string | undefined>>();

  constructor(options: SeatLayerPickerBuyerAssetLoaderOptions) {
    this.eventKey = options.eventKey;
    this.apiBase = trimTrailingSlash(options.apiBase ?? seatLayerPickerDefaultApiBase);
    this.token = options.token;
    this.tokenProvider = options.tokenProvider;
    this.transport = options.fetch ?? defaultAssetFetch;
    this.now = options.now ?? Date.now;
  }

  /** A loader built from what the host configured the picker with. */
  static fromConfiguration(
    configuration: SeatLayerConfiguration,
    fetch?: SeatLayerPickerAssetFetch,
  ): SeatLayerPickerBuyerAssetLoader {
    return new SeatLayerPickerBuyerAssetLoader({
      eventKey: configuration.event,
      apiBase: configuration.apiBase,
      token: configuration.buyerAccessToken,
      tokenProvider: configuration.buyerAccessTokenProvider,
      fetch,
    });
  }

  /**
   * The source for `reference`, or `undefined` where there is no photograph.
   *
   * `undefined` covers every reason at once — a reference this event does not
   * own, a 403 or 404, no bearer, a dead network — because the card does the
   * same thing for all of them.
   */
  load(reference: string): Promise<string | undefined> {
    const cached = this.resolved.get(reference);
    if (cached !== undefined) {
      // Reading an entry makes it the most recent one.
      this.resolved.delete(reference);
      this.resolved.set(reference, cached);
      return Promise.resolve(cached);
    }
    // One request per reference however many cards ask for it: two seats in
    // one row can share a photograph, and a scrubbing buyer can reopen the
    // same card before the first fetch has landed.
    const running = this.inFlight.get(reference);
    if (running !== undefined) return running;
    const request = this.fetchReference(reference).finally(() => {
      this.inFlight.delete(reference);
    });
    this.inFlight.set(reference, request);
    return request;
  }

  /** Forget `reference`, so the next open tries again. */
  evict(reference: string): void {
    this.resolved.delete(reference);
  }

  /** Forget everything, including the bearer. The picker session has ended. */
  clear(): void {
    this.resolved.clear();
    this.inFlight.clear();
    this.token = undefined;
  }

  /**
   * The absolute URL `reference` names, or `undefined` when it is not this
   * event's.
   *
   * The runtime applies this predicate before emitting the field; it is
   * applied again here because a reference that reached this side wrong is a
   * request that must not be MADE, not a request that fails.
   */
  resolve(reference: string): string | undefined {
    const match = referencePattern.exec(reference);
    if (match?.[1] === undefined) return undefined;
    let event: string;
    try { event = decodeURIComponent(match[1]); } catch { return undefined; }
    if (event !== this.eventKey || this.eventKey.length === 0) return undefined;
    return `${this.apiBase}${reference}`;
  }

  private async fetchReference(reference: string): Promise<string | undefined> {
    const url = this.resolve(reference);
    if (url === undefined) return undefined;
    const authorization = await this.authorization();
    if (authorization === undefined) return undefined;
    try {
      const source = await this.transport(url, Object.freeze({ Authorization: authorization }));
      if (typeof source !== 'string' || source.length === 0) return undefined;
      this.remember(reference, source);
      return source;
    } catch {
      // Deliberately opaque: the failure may carry the request that carried
      // the bearer, and nothing here may log or rethrow it.
      return undefined;
    }
  }

  private remember(reference: string, source: string): void {
    this.resolved.set(reference, source);
    while (this.resolved.size > seatLayerPickerAssetCacheEntries) {
      const oldest = this.resolved.keys().next();
      if (oldest.done === true) break;
      this.resolved.delete(oldest.value);
    }
  }

  private async authorization(): Promise<string | undefined> {
    const held = this.token;
    if (held !== undefined && !this.expiring(held)) return `Bearer ${held.token}`;
    if (this.tokenProvider === undefined) {
      // A one-shot token that has already expired is not refreshable, and a
      // public event has no token at all. Both are "no photograph".
      return held === undefined ? undefined : `Bearer ${held.token}`;
    }
    try {
      const fresh = await this.tokenProvider({ reason: seatLayerPickerAssetRefreshReason });
      if (typeof fresh?.token !== 'string' || fresh.token.length === 0) return undefined;
      this.token = fresh;
      return `Bearer ${fresh.token}`;
    } catch {
      return undefined;
    }
  }

  private expiring(token: BuyerAccessToken): boolean {
    const expiresAt = token.expiresAt;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return false;
    return this.now() >= expiresAt - seatLayerPickerAssetTokenSafetyMarginMs;
  }
}

/**
 * The default transport: the platform's own `fetch`, read into a data URI so
 * an `<Image>` can take it without ever seeing the bearer.
 */
export const defaultAssetFetch: SeatLayerPickerAssetFetch = async (url, headers) => {
  const host = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
    AbortController?: typeof AbortController;
    FileReader?: typeof FileReader;
  };
  if (host.fetch === undefined) throw new Error('No fetch available.');
  const abort = host.AbortController === undefined ? undefined : new host.AbortController();
  const timer = abort === undefined
    ? undefined
    : setTimeout(() => abort.abort(), seatLayerPickerAssetTimeoutMs);
  try {
    const response = await host.fetch(url, {
      method: 'GET',
      headers: { ...headers },
      credentials: 'omit',
      ...(abort === undefined ? {} : { signal: abort.signal }),
    });
    if (!response.ok) throw new Error('Asset unavailable.');
    return await readAsDataUri(await response.blob(), host.FileReader);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

function readAsDataUri(blob: Blob, Reader: typeof FileReader | undefined): Promise<string> {
  if (Reader === undefined) throw new Error('No FileReader available.');
  return new Promise<string>((resolve, reject) => {
    const reader = new Reader();
    reader.onerror = () => reject(new Error('Asset unreadable.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.length > 0) resolve(result);
      else reject(new Error('Asset unreadable.'));
    };
    reader.readAsDataURL(blob);
  });
}

function trimTrailingSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}
