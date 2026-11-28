import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pageBridgeProfile, pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerController } from '../src/controller';

class RecordingTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(envelope: Envelope): void {
    this.frames.push(envelope);
  }
  last(): Envelope {
    return this.frames[this.frames.length - 1]!;
  }
}

const seasonCapabilities = ['season-surface-v1', 'season-app-shell-v1'];

function hello(
  controller: SeatLayerController,
  capabilities: string[] = seasonCapabilities,
  commands: string[] = ['season.requestClose', 'season.setThemeMode'],
): void {
  controller.ingestRaw({
    sl: 1,
    k: 'hello',
    t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...capabilities, 'native-access-provider'],
      commands,
      events: ['sys.ready'],
    },
  });
}

function ready(controller: SeatLayerController, sequence = 1): void {
  controller.ingestRaw({ sl: 1, k: 'evt', t: 'sys.ready', n: sequence, p: { protocol: 2 } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('pageBridgeProfile', () => {
  it('names a page of its own on protocol 2 with its own fields', () => {
    const profile = pageBridgeProfile('season', seasonCapabilities, {
      season: 'sea_1',
      theme: 'dark',
    });
    expect(profile).toMatchObject({
      surface: 'season',
      protocolRange: { min: 2, max: 2 },
      requiredCapabilities: seasonCapabilities,
      requiredCommands: [],
      requiredEvents: [],
      config: { season: 'sea_1', theme: 'dark' },
    });
    expect(Object.isFrozen(profile.config)).toBe(true);
  });

  it('keeps the shared fields for the configuration and refuses another surface', () => {
    expect(() => pageBridgeProfile('group', [], { apiBase: 'https://example.test' }))
      .toThrow(/reserved key "apiBase"/);
    expect(() => pageBridgeProfile('group', [], { buyerAccessToken: 'x' }))
      .toThrow(/reserved key "buyerAccessToken"/);
    expect(() => pageBridgeProfile('picker' as never, [])).toThrow(/season or group/);
  });
});

describe('a page of its own on the shared session', () => {
  it('answers hello with the shared fields under the page own and no event', async () => {
    let now = 10;
    const controller = new SeatLayerController(() => now);
    const transport = new RecordingTransport();
    const started = controller.beginSurfaceHandshake(
      transport,
      {
        apiBase: 'https://api.example.test',
        publicKey: 'pk_test',
        buyerAccessToken: { token: 'bat_1', expiresAt: 99 },
        buyerAccessTokenProvider: () => ({ token: 'bat_2' }),
        locale: 'de',
        hostInfo: { app: 'demo' },
      },
      pageBridgeProfile('season', seasonCapabilities, {
        season: 'sea_1',
        initialOperationId: null,
        appBar: true,
      }),
    );
    hello(controller);
    expect(transport.frames[0]).toEqual({
      kind: 'init',
      type: 'init',
      payload: {
        protocol: { min: 2, max: 2 },
        host: { platform: 'react-native', sdk: '0.6.1', app: 'demo' },
        surface: { kind: 'season' },
        config: {
          apiBase: 'https://api.example.test',
          publicKey: 'pk_test',
          buyerAccessToken: { token: 'bat_1', expiresAt: 99 },
          nativeAccessProvider: true,
          locale: 'de',
          season: 'sea_1',
          appBar: true,
        },
      },
    });
    now = 50;
    ready(controller);
    await expect(started).resolves.toMatchObject({ protocolRevision: 2, timeToReadyMs: 40 });
    expect(controller.isReady).toBe(true);
  });

  it('fails a page that lacks its capabilities before any init', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const started = controller.beginSurfaceHandshake(
      transport,
      {},
      pageBridgeProfile('group', ['group-surface-v1', 'group-app-shell-v1']),
    );
    hello(controller, ['group-surface-v1']);
    await expect(started).rejects.toMatchObject({
      code: 'sl_incompatible',
      message: expect.stringContaining('The loaded group page does not satisfy'),
    });
    expect(transport.frames).toEqual([]);
  });

  it('takes only a page profile', async () => {
    const controller = new SeatLayerController();
    await expect(controller.beginSurfaceHandshake(
      new RecordingTransport(),
      {},
      pickerBridgeProfile(),
    )).rejects.toMatchObject({ code: 'bad_payload' });
  });

  it('runs page commands once ready, and a buyer question has no deadline', async () => {
    vi.useFakeTimers();
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const started = controller.beginSurfaceHandshake(
      transport,
      { commandTimeoutMs: 1_000 },
      pageBridgeProfile('season', seasonCapabilities),
    );
    await expect(controller.runSurfaceCommand('season.setThemeMode', { mode: 'dark' }))
      .rejects.toMatchObject({ code: 'sl_incompatible' });
    hello(controller);
    ready(controller);
    await started;
    expect(controller.supportsSurfaceCommand('season.requestClose')).toBe(true);
    expect(controller.supportsSurfaceCommand('season.release')).toBe(false);
    expect(controller.supportsPickerCommand('season.requestClose')).toBe(false);

    const timed = controller.runSurfaceCommand('season.setThemeMode', { mode: 'dark' });
    expect(transport.last()).toMatchObject({ kind: 'cmd', type: 'season.setThemeMode', payload: { mode: 'dark' } });
    const asked = controller.runSurfaceCommand('season.requestClose', {}, { untimed: true });
    const askedId = transport.last().id;
    let settled = false;
    void asked.then(() => { settled = true; }, () => { settled = true; });
    vi.advanceTimersByTime(60_000);
    await expect(timed).rejects.toMatchObject({ code: 'sl_timeout' });
    await Promise.resolve();
    expect(settled).toBe(false);
    controller.ingestRaw({ sl: 1, k: 'res', t: 'season.requestClose', id: askedId, p: { outcome: 'kept' } });
    await expect(asked).resolves.toEqual({ outcome: 'kept' });
  });

  it('a lost page refuses the buyer question still waiting', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const started = controller.beginSurfaceHandshake(
      transport,
      {},
      pageBridgeProfile('season', seasonCapabilities),
    );
    hello(controller);
    ready(controller);
    await started;
    const errors: unknown[] = [];
    controller.on('error', (error) => errors.push(error));
    const asked = controller.runSurfaceCommand('season.requestClose', {}, { untimed: true });
    controller.pageLost();
    await expect(asked).rejects.toMatchObject({ code: 'sl_transport' });
    expect(errors).toHaveLength(1);
  });

  it('asks the app for buyer access on the same path as the event', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const provider = vi.fn().mockResolvedValue({ token: 'bat_fresh', expiresAt: 5 });
    void controller.beginSurfaceHandshake(
      transport,
      { buyerAccessTokenProvider: provider },
      pageBridgeProfile('season', seasonCapabilities),
    );
    hello(controller);
    controller.ingestRaw({
      sl: 1, k: 'evt', t: 'access.token.request', n: 1,
      p: { requestId: 'req_1', reason: 'initial' },
    });
    await vi.waitFor(() => expect(transport.last()).toMatchObject({
      kind: 'cmd',
      type: 'access.token.provide',
      payload: { requestId: 'req_1', token: 'bat_fresh', expiresAt: 5 },
    }));
    expect(provider).toHaveBeenCalledWith({ reason: 'initial' });
  });

  it('hands every page event it does not know to its listeners', async () => {
    const controller = new SeatLayerController();
    const transport = new RecordingTransport();
    const seen: unknown[] = [];
    controller.on('unknownEvent', (event) => seen.push(event));
    void controller.beginSurfaceHandshake(
      transport,
      {},
      pageBridgeProfile('season', seasonCapabilities),
    );
    hello(controller);
    ready(controller);
    controller.ingestRaw({ sl: 1, k: 'evt', t: 'season.status', n: 1, p: { kind: 'ready' } });
    expect(seen).toEqual([{ name: 'season.status', payload: { kind: 'ready' } }]);
  });
});
