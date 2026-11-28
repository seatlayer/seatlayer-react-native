import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import {
  seatLayerSeasonConfigurationKey,
  seatLayerSeasonConfigurationProblem,
  seatLayerSeasonPageUrl,
  seatLayerSeasonProfile,
} from '../src/season/configuration';
import { SeatLayerSeasonController } from '../src/season/controller';
import { decodeSeatLayerSeasonStatus } from '../src/season/models';

class RecordingTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(envelope: Envelope): void { this.frames.push(envelope); }
  last(): Envelope { return this.frames[this.frames.length - 1]!; }
}

const handoff = (operationId = 'sop_1') => ({
  seasonKey: 'sea_1',
  planActivationId: 'pa_1',
  operationId,
  holdId: 'hold_1',
  expiresAt: 1_700_000_000_000,
  lines: [{ label: 'A-1' }],
});

let sequence = 0;
function event(controller: SeatLayerSeasonController, type: string, payload?: unknown): void {
  sequence += 1;
  controller.session.ingestRaw({ sl: 1, k: 'evt', t: type, n: sequence, p: payload });
}

async function started(commands: string[] = []): Promise<{
  controller: SeatLayerSeasonController;
  transport: RecordingTransport;
}> {
  const controller = new SeatLayerSeasonController();
  const transport = new RecordingTransport();
  const ready = controller.beginHandshake(
    transport,
    { publicKey: 'pk_test' },
    seatLayerSeasonProfile({ season: 'sea_1' }),
  );
  controller.session.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: ['season-surface-v1', 'season-app-shell-v1'],
      commands,
      events: [],
    },
  });
  event(controller, 'sys.ready', { protocol: 2 });
  await ready;
  return { controller, transport };
}

function answer(controller: SeatLayerSeasonController, transport: RecordingTransport, payload: unknown): void {
  const command = transport.last();
  controller.session.ingestRaw({ sl: 1, k: 'res', t: command.type, id: command.id, p: payload });
}

afterEach(() => vi.useRealTimers());

describe('Season configuration', () => {
  it('opens the pinned Season page with the app bar, its own fields and the boot', () => {
    expect(seatLayerSeasonPageUrl).toMatch(/^https:\/\/cdn\.seatlayer\.io\/seatlayer-js@[\d.]+\/season\.html$/);
    const profile = seatLayerSeasonProfile({
      season: 'sea_1',
      publicKey: 'pk_test',
      package: 'full',
      priceTypes: ['adult', 'child'],
      ticketsByEmail: true,
      maxSelection: 4,
      initialOperationId: 'sop_kept',
      enable3D: false,
      touchNavigation3D: 'classic',
    }, { theme: 'dark' });
    expect(profile.surface).toBe('season');
    expect(profile.requiredCapabilities).toEqual(['season-surface-v1', 'season-app-shell-v1']);
    expect(profile.config).toEqual({
      season: 'sea_1',
      package: 'full',
      priceTypes: ['adult', 'child'],
      ticketsByEmail: true,
      maxSelection: 4,
      enable3D: false,
      touchNavigation3D: 'classic',
      theme: 'dark',
      initialOperationId: 'sop_kept',
      appBar: true,
    });
  });

  it('opens a page that takes another one place on the hold it is given, or on none', () => {
    const configuration = { season: 'sea_1', initialOperationId: 'sop_gone' };
    expect(seatLayerSeasonProfile(configuration, { operationId: 'sop_now' }).config)
      .toMatchObject({ initialOperationId: 'sop_now' });
    expect(seatLayerSeasonProfile(configuration, { operationId: null }).config)
      .not.toHaveProperty('initialOperationId');
  });

  it('refuses what the page would refuse, and keys equal content equally', () => {
    expect(seatLayerSeasonConfigurationProblem({ season: ' ' })?.code).toBe('bad_payload');
    expect(seatLayerSeasonConfigurationProblem({ season: 'sea_1', maxSelection: 0 })?.code).toBe('bad_payload');
    expect(seatLayerSeasonConfigurationProblem({ season: 'sea_1', buyerAccessToken: { token: '' } })?.code)
      .toBe('bad_payload');
    expect(seatLayerSeasonConfigurationProblem({ season: 'sea_1' })).toBeUndefined();
    const provider = () => ({ token: 't' });
    expect(seatLayerSeasonConfigurationKey({ season: 'sea_1', buyerAccessTokenProvider: provider }))
      .toBe(seatLayerSeasonConfigurationKey({ season: 'sea_1', buyerAccessTokenProvider: () => ({ token: 'u' }) }));
    expect(seatLayerSeasonConfigurationKey({ season: 'sea_1' }))
      .not.toBe(seatLayerSeasonConfigurationKey({ season: 'sea_2' }));
  });
});

describe('SeatLayerSeasonController events', () => {
  it('reads the status line with the name, the dates and the brand', async () => {
    const { controller } = await started();
    const statuses: unknown[] = [];
    controller.on('status', (status) => statuses.push(status));
    event(controller, 'season.status', {
      kind: 'ready',
      message: 'Choose your seats',
      season: { name: 'Season 2027' },
      branding: { brandName: 'Riverside', accent: '#0a7d32' },
      dates: [{ position: 1, eventKey: 'ev_1', name: 'Round 1', startsAt: 10, past: true }, { position: 'x' }],
    });
    expect(controller.status).toMatchObject({
      kind: 'ready',
      seasonName: 'Season 2027',
      branding: { brandName: 'Riverside', accent: '#0a7d32' },
      dates: [{ position: 1, eventKey: 'ev_1', name: 'Round 1', startsAt: 10, past: true, cancelled: false }],
    });
    expect(statuses).toHaveLength(1);
    expect(decodeSeatLayerSeasonStatus({ message: 'no kind' })).toBeUndefined();
  });

  it('follows the hold, hands each Continue over once and reports booked once', async () => {
    const { controller } = await started();
    const holds: unknown[] = [];
    const continued: unknown[] = [];
    const booked: unknown[] = [];
    let expired = 0;
    controller.on('hold', (hold) => holds.push(hold?.operationId ?? null));
    controller.on('continue', (hold) => continued.push(hold.operationId));
    controller.on('booked', (hold) => booked.push(hold.operationId));
    controller.on('holdExpired', () => { expired += 1; });

    event(controller, 'season.hold', { handoff: handoff() });
    expect(controller.hold).toMatchObject({ operationId: 'sop_1', expiresAt: 1_700_000_000_000 });
    expect(controller.hold?.json).toMatchObject({ lines: [{ label: 'A-1' }] });
    event(controller, 'season.hold', { handoff: null });
    event(controller, 'season.continue', { handoff: handoff() });
    event(controller, 'season.continue', { handoff: handoff() });
    event(controller, 'season.status', { kind: 'booked', operationId: 'sop_1' });
    event(controller, 'season.status', { kind: 'booked', operationId: 'sop_1' });
    event(controller, 'season.status', { kind: 'booked', operationId: 'sop_unknown' });
    event(controller, 'season.holdChanged', { handoff: null });
    event(controller, 'season.holdExpired', {});
    expect(holds).toEqual(['sop_1', null, null]);
    expect(continued).toEqual(['sop_1']);
    expect(booked).toEqual(['sop_1']);
    expect(expired).toBe(1);
    expect(controller.hold).toBeUndefined();
  });

  it('passes on access, errors, the line and what it does not know', async () => {
    const { controller } = await started();
    const seen: string[] = [];
    controller.on('accessExpired', (value) => seen.push(`expired:${value.reason}`));
    controller.on('accessUnavailable', (value) => seen.push(`unavailable:${value.reason}`));
    controller.on('error', (value) => seen.push(`error:${value.code}`));
    controller.on('connection', (value) => seen.push(`line:${value}`));
    controller.on('unknownEvent', (value) => seen.push(`unknown:${value.name}`));
    event(controller, 'season.accessExpired', { reason: 'expired', refreshed: false });
    event(controller, 'season.accessUnavailable', { reason: 'revoked', retryable: false });
    event(controller, 'season.error', { code: 'hold_failed', message: 'Taken' });
    event(controller, 'connection.changed', { state: 'offline' });
    event(controller, 'connection.changed', { state: 'offline' });
    event(controller, 'season.somethingNew', {});
    expect(seen).toEqual([
      'expired:expired',
      'unavailable:revoked',
      'error:hold_failed',
      'line:offline',
      'unknown:season.somethingNew',
    ]);
    expect(controller.connection).toBe('offline');
  });

  it('forgets the page state when the page goes', async () => {
    const { controller } = await started();
    event(controller, 'season.status', { kind: 'held', operationId: 'sop_1' });
    event(controller, 'season.hold', { handoff: handoff() });
    controller.pageLost();
    expect(controller.status).toBeUndefined();
    expect(controller.hold).toBeUndefined();
    expect(controller.isReady).toBe(false);
  });
});

describe('SeatLayerSeasonController commands', () => {
  it('sends the web picker commands with fresh caller ids', async () => {
    const { controller, transport } = await started();
    const held = controller.holdSameSeat(['A-1', 'A-2'], { priceTypes: { 'A-2': 'child' } });
    expect(transport.last()).toMatchObject({
      type: 'season.holdSameSeat',
      payload: { labels: ['A-1', 'A-2'], priceTypes: { 'A-2': 'child' } },
    });
    expect((transport.last().payload as { operationId: string }).operationId).toMatch(/^sop_[0-9a-z]{20}$/);
    answer(controller, transport, { handoff: handoff() });
    await expect(held).resolves.toMatchObject({ operationId: 'sop_1' });

    const best = controller.holdBestAvailable(2, { operationId: 'sop_2', categoryKey: 'gold', accessibility: ['wheelchair'] });
    expect(transport.last().payload).toEqual({ qty: 2, operationId: 'sop_2', categoryKey: 'gold', accessibility: ['wheelchair'] });
    answer(controller, transport, {});
    await expect(best).rejects.toMatchObject({ code: 'bad_payload' });

    const release = controller.release();
    expect((transport.last().payload as { releaseActionId: string }).releaseActionId).toMatch(/^sra_/);
    answer(controller, transport, { released: true });
    await expect(release).resolves.toBe(true);

    const marked = controller.markBooked({ operationId: 'sop_1' });
    expect(transport.last()).toMatchObject({ type: 'season.markBooked', payload: { operationId: 'sop_1' } });
    answer(controller, transport, { status: 'already_booked' });
    await expect(marked).resolves.toBe('already_booked');

    const order = controller.getHeldOrder();
    answer(controller, transport, { heldOrder: { operationId: 'sop_1', expiresAt: 5, currency: 'EUR', seats: [1], totalMinor: 4200 } });
    await expect(order).resolves.toEqual({ operationId: 'sop_1', expiresAt: 5, currency: 'EUR', seats: [1], totalMinor: 4200 });

    const restored = controller.restoreOperation('sop_kept');
    expect(transport.last().payload).toEqual({ operationId: 'sop_kept' });
    answer(controller, transport, { handoff: null });
    await expect(restored).resolves.toBeUndefined();

    void controller.choosePackage('pa_2');
    expect(transport.last()).toMatchObject({ type: 'season.choosePackage', payload: { planActivationId: 'pa_2' } });
    void controller.chooseSeats();
    expect(transport.last().type).toBe('season.chooseSeats');
    void controller.setThemeMode('dark');
    expect(transport.last()).toMatchObject({ type: 'season.setThemeMode', payload: { mode: 'dark' } });
    void controller.setViewportInsets({ bottom: 34 });
    expect(transport.last()).toMatchObject({ type: 'season.setViewportInsets', payload: { top: 0, right: 0, bottom: 34, left: 0 } });
    const foreground = controller.setForeground(true);
    expect(transport.last()).toMatchObject({ type: 'season.lifecycle', payload: { state: 'foreground' } });
    answer(controller, transport, { held: false });
    await expect(foreground).resolves.toBe(false);
  });

  it('waits for the buyer to answer the close question', async () => {
    vi.useFakeTimers();
    const { controller, transport } = await started();
    const closing = controller.requestClose();
    vi.advanceTimersByTime(120_000);
    answer(controller, transport, { outcome: 'kept', operationId: 'sop_1' });
    await expect(closing).resolves.toEqual({ outcome: 'kept', operationId: 'sop_1' });
    const again = controller.requestClose();
    answer(controller, transport, {});
    await expect(again).resolves.toEqual({ outcome: 'stayed' });
  });

  it('destroys best effort and refuses commands once disposed', async () => {
    const { controller, transport } = await started();
    const destroyed = controller.destroy();
    expect(transport.last().type).toBe('season.destroy');
    answer(controller, transport, {});
    await destroyed;
    expect(controller.isReady).toBe(false);
    controller.dispose();
    await expect(controller.chooseSeats()).rejects.toMatchObject({ code: 'destroyed' });
  });
});
