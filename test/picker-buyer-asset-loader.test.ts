import { describe, expect, it, vi } from 'vitest';

import {
  SeatLayerPickerBuyerAssetLoader,
  seatLayerPickerAssetCacheEntries,
  seatLayerPickerAssetRefreshReason,
  seatLayerPickerAssetTokenSafetyMarginMs,
  seatLayerPickerDefaultApiBase,
} from '../src/picker/buyerAssetLoader';

const reference = (asset = 'asset_1', event = 'ev') => `/pub/events/${event}/assets/${asset}`;

function loader(options: Partial<ConstructorParameters<typeof SeatLayerPickerBuyerAssetLoader>[0]> = {}) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const instance = new SeatLayerPickerBuyerAssetLoader({
    eventKey: 'ev',
    token: { token: 'buyer-token' },
    fetch: async (url, headers) => { requests.push({ url, headers: { ...headers } }); return `data:image/jpeg;base64,${url.length}`; },
    ...options,
  });
  return { instance, requests };
}

describe('the reference is validated before any request is made', () => {
  it('accepts only this event’s own asset path', () => {
    const { instance } = loader();
    expect(instance.resolve(reference())).toBe(`${seatLayerPickerDefaultApiBase}${reference()}`);
    expect(instance.resolve(reference('asset_1', 'other'))).toBeUndefined();
    expect(instance.resolve('/pub/events/ev/assets/../../secret')).toBeUndefined();
    expect(instance.resolve('https://evil.test/pub/events/ev/assets/a')).toBeUndefined();
    expect(instance.resolve('/pub/events/ev/assets/a/b')).toBeUndefined();
    expect(instance.resolve('/pub/events/ev/assets/')).toBeUndefined();
  });

  it('refuses a foreign reference without opening a connection', async () => {
    const { instance, requests } = loader();
    expect(await instance.load(reference('asset_1', 'other'))).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('trims a trailing slash off the host’s API origin', () => {
    const { instance } = loader({ apiBase: 'https://api.example.test/' });
    expect(instance.resolve(reference())).toBe(`https://api.example.test${reference()}`);
  });
});

describe('the bearer', () => {
  it('travels in the Authorization header and nowhere else', async () => {
    const { instance, requests } = loader();
    await instance.load(reference());
    expect(requests[0]?.headers).toEqual({ Authorization: 'Bearer buyer-token' });
    expect(requests[0]?.url).not.toContain('buyer-token');
  });

  it('is re-minted through the host’s provider thirty seconds before expiry', async () => {
    const reasons: string[] = [];
    let now = 1_000_000;
    const { instance, requests } = loader({
      token: { token: 'stale', expiresAt: now + seatLayerPickerAssetTokenSafetyMarginMs - 1 },
      tokenProvider: async ({ reason }) => { reasons.push(reason); return { token: 'fresh', expiresAt: now + 600_000 }; },
      now: () => now,
    });
    await instance.load(reference());
    expect(reasons).toEqual([seatLayerPickerAssetRefreshReason]);
    expect(requests[0]?.headers.Authorization).toBe('Bearer fresh');
    // The fresh bearer is then held for the session.
    await instance.load(reference('asset_2'));
    expect(reasons).toHaveLength(1);
  });

  it('is no photograph when there is no bearer and none can be minted', async () => {
    const { instance, requests } = loader({ token: undefined });
    expect(await instance.load(reference())).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('is no photograph when the provider refuses', async () => {
    const { instance, requests } = loader({
      token: { token: 'stale', expiresAt: 0 },
      tokenProvider: async () => { throw new Error('revoked'); },
      now: () => 1_000_000,
    });
    expect(await instance.load(reference())).toBeUndefined();
    expect(requests).toHaveLength(0);
  });
});

describe('every failure is “no photograph”', () => {
  it('never throws into the card and never logs the request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const instance = new SeatLayerPickerBuyerAssetLoader({
        eventKey: 'ev', token: { token: 't' },
        fetch: async () => { throw new Error('403 for https://api…?token=t'); },
      });
      await expect(instance.load(reference())).resolves.toBeUndefined();
      expect(error).not.toHaveBeenCalled();
    } finally { error.mockRestore(); }
  });

  it('retries the next time, because a miss is not cached', async () => {
    let attempts = 0;
    const instance = new SeatLayerPickerBuyerAssetLoader({
      eventKey: 'ev', token: { token: 't' },
      fetch: async () => { attempts += 1; throw new Error('offline'); },
    });
    await instance.load(reference());
    await instance.load(reference());
    expect(attempts).toBe(2);
  });
});

describe('the session cache', () => {
  it('shares one request between concurrent readers of one reference', async () => {
    let attempts = 0;
    const instance = new SeatLayerPickerBuyerAssetLoader({
      eventKey: 'ev', token: { token: 't' },
      fetch: async () => { attempts += 1; return 'data:image/jpeg;base64,AA'; },
    });
    const [first, second] = await Promise.all([instance.load(reference()), instance.load(reference())]);
    expect(attempts).toBe(1);
    expect(first).toBe(second);
  });

  it('answers a second open from the cache', async () => {
    const { instance, requests } = loader();
    await instance.load(reference());
    await instance.load(reference());
    expect(requests).toHaveLength(1);
  });

  it('keeps twelve references, evicting the least recently read', async () => {
    expect(seatLayerPickerAssetCacheEntries).toBe(12);
    const { instance, requests } = loader();
    for (let index = 0; index < seatLayerPickerAssetCacheEntries; index += 1) {
      await instance.load(reference(`asset_${index}`));
    }
    // Reading the oldest makes it the most recent, so the next one out is #1.
    await instance.load(reference('asset_0'));
    await instance.load(reference('asset_new'));
    expect(requests).toHaveLength(seatLayerPickerAssetCacheEntries + 1);
    await instance.load(reference('asset_0'));
    expect(requests).toHaveLength(seatLayerPickerAssetCacheEntries + 1);
    await instance.load(reference('asset_1'));
    expect(requests).toHaveLength(seatLayerPickerAssetCacheEntries + 2);
  });

  it('forgets one reference on request', async () => {
    const { instance, requests } = loader();
    await instance.load(reference());
    instance.evict(reference());
    await instance.load(reference());
    expect(requests).toHaveLength(2);
  });

  it('forgets the bytes and the bearer alike when the session ends', async () => {
    let minted = 0;
    const { instance, requests } = loader({
      token: undefined,
      tokenProvider: async () => { minted += 1; return { token: `t${minted}` }; },
    });
    await instance.load(reference());
    expect(minted).toBe(1);
    instance.clear();
    await instance.load(reference());
    expect(requests).toHaveLength(2);
    expect(minted).toBe(2);
  });
});

describe('a loader built from the host’s own configuration', () => {
  it('carries the event, the origin and the bearer through', async () => {
    const requests: string[] = [];
    const instance = SeatLayerPickerBuyerAssetLoader.fromConfiguration(
      { event: 'ev-42', apiBase: 'https://api.example.test', buyerAccessToken: { token: 'k' } },
      async (url) => { requests.push(url); return 'data:image/png;base64,AA'; },
    );
    expect(instance.eventKey).toBe('ev-42');
    await instance.load(reference('a', 'ev-42'));
    expect(requests).toEqual(['https://api.example.test/pub/events/ev-42/assets/a']);
  });

  it('refuses every reference when the picker names no event', () => {
    const instance = SeatLayerPickerBuyerAssetLoader.fromConfiguration({ event: '' });
    expect(instance.resolve('/pub/events//assets/a')).toBeUndefined();
  });
});
