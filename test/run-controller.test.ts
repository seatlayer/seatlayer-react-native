import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { seatLayerPageInit } from '../src/bridge/init';
import {
  seatLayerRunConfigurationKey,
  seatLayerRunConfigurationProblem,
  seatLayerRunPageUrl,
  seatLayerRunProfile,
} from '../src/run/configuration';
import { SeatLayerRunController } from '../src/run/controller';

class RecordingTransport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(envelope: Envelope): void { this.frames.push(envelope); }
  last(): Envelope { return this.frames[this.frames.length - 1]!; }
}

const handoff = (operationId = 'pghop_1') => ({
  operationId,
  holdId: 'pgh_1',
  expiresAt: 1_700_000_000_000,
  performanceKeys: ['ev_1', 'ev_2'],
  seatLabels: ['A-1', 7],
  selectionMode: 'same_seat',
  bookingState: 'held',
  allocations: [{ eventKey: 'ev_1', seatLabels: ['A-1'] }],
});

let sequence = 0;
function event(controller: SeatLayerRunController, type: string, payload?: unknown): void {
  sequence += 1;
  controller.session.ingestRaw({ sl: 1, k: 'evt', t: type, n: sequence, p: payload });
}

async function started(): Promise<{ controller: SeatLayerRunController; transport: RecordingTransport }> {
  const controller = new SeatLayerRunController();
  const transport = new RecordingTransport();
  const ready = controller.beginHandshake(transport, {}, seatLayerRunProfile({ run: 'pg_1' }));
  controller.session.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: ['group-surface-v1', 'group-app-shell-v1'],
      commands: [],
      events: [],
    },
  });
  event(controller, 'sys.ready', { protocol: 2 });
  await ready;
  return { controller, transport };
}

function answer(controller: SeatLayerRunController, transport: RecordingTransport, payload: unknown): void {
  const command = transport.last();
  controller.session.ingestRaw({ sl: 1, k: 'res', t: command.type, id: command.id, p: payload });
}

afterEach(() => vi.useRealTimers());

describe('run configuration', () => {
  it('opens the pinned run page with the app bar, handoff checkout, its own fields and the boot', () => {
    expect(seatLayerRunPageUrl).toMatch(/^https:\/\/cdn\.seatlayer\.io\/seatlayer-js@[\d.]+\/group\.html$/);
    const configuration = {
      run: 'pg_1',
      apiBase: 'https://api.example.test',
      selectionMode: 'per_performance',
      allowSelectionModeSwitch: true,
      numberOfPlacesToSelect: 2,
      maxSelection: 4,
      initialHoldId: 'pgh_kept',
      initialOperationId: 'pghop_kept',
      enable3D: false,
      locale: 'de',
    } as const;
    const init = seatLayerPageInit(configuration, seatLayerRunProfile(configuration, { theme: 'dark' }));
    expect(init.surface).toEqual({ kind: 'group' });
    expect(init.config).toEqual({
      apiBase: 'https://api.example.test',
      locale: 'de',
      performanceGroup: 'pg_1',
      selectionMode: 'per_performance',
      allowSelectionModeSwitch: true,
      numberOfPlacesToSelect: 2,
      maxSelection: 4,
      enable3D: false,
      theme: 'dark',
      initialHoldId: 'pgh_kept',
      initialOperationId: 'pghop_kept',
      header: false,
      appBar: true,
      checkout: 'handoff',
    });
    expect(seatLayerRunProfile(configuration).requiredCapabilities).toEqual(['group-surface-v1', 'group-app-shell-v1']);
  });

  it('opens a page that takes another one\'s place on the hold it is given, or on none', () => {
    const configuration = { run: 'pg_1', initialHoldId: 'pgh_kept', initialOperationId: 'pghop_kept' };
    expect(seatLayerRunProfile(configuration, { resumed: { holdId: 'pgh_now', operationId: 'pghop_now' } }).config)
      .toMatchObject({ initialHoldId: 'pgh_now', initialOperationId: 'pghop_now' });
    const none = seatLayerRunProfile(configuration, { resumed: null }).config!;
    expect(none).not.toHaveProperty('initialHoldId');
    expect(none).not.toHaveProperty('initialOperationId');
  });

  it('refuses what the page would refuse', () => {
    const problem = (configuration: object) =>
      seatLayerRunConfigurationProblem(configuration as never)?.message;
    expect(problem({ run: 'pg_1' })).toBeUndefined();
    expect(problem({ run: ' ' })).toMatch(/run is required/);
    expect(problem({ run: 'pg_1', maxSelection: 0 })).toMatch(/maxSelection/);
    expect(problem({ run: 'pg_1', numberOfPlacesToSelect: 1.5 })).toMatch(/numberOfPlacesToSelect/);
    expect(problem({ run: 'pg_1', selectionMode: 'per_performance' })).toMatch(/is required with per-performance/);
    expect(problem({ run: 'pg_1', allowSelectionModeSwitch: true })).toMatch(/is required with per-performance/);
    expect(problem({ run: 'pg_1', allowSelectionModeSwitch: true, numberOfPlacesToSelect: 2 })).toBeUndefined();
    expect(problem({ run: 'pg_1', initialHoldId: 'pgh_1' })).toMatch(/both or neither/);
    expect(problem({ run: 'pg_1', buyerAccessToken: { token: '' } })).toMatch(/buyerAccessToken/);
  });

  it('keeps the page for an equal configuration and an inline provider', () => {
    const provider = async () => ({ token: 't' });
    expect(seatLayerRunConfigurationKey({ run: 'pg_1', buyerAccessTokenProvider: provider }))
      .toBe(seatLayerRunConfigurationKey({ run: 'pg_1', buyerAccessTokenProvider: async () => ({ token: 't' }) }));
    expect(seatLayerRunConfigurationKey({ run: 'pg_1' })).not.toBe(seatLayerRunConfigurationKey({ run: 'pg_2' }));
  });
});

describe('SeatLayerRunController', () => {
  it('reports the run, its status, its hold and its selection mode, and forgets them with the page', async () => {
    const { controller } = await started();
    const changed = vi.fn();
    const selection = vi.fn();
    controller.on('changed', changed);
    controller.on('selectionMode', selection);
    event(controller, 'group.ready', {
      performanceGroup: {
        key: 'pg_1',
        name: 'Ring cycle',
        state: 'active',
        performances: [
          { position: 1, eventKey: 'ev_1', name: 'Rheingold', startsAt: 1_700_000_000_000, startsAtLabel: 'Sat 15 Aug · 15:00' },
          { position: 2, name: 'no key' },
        ],
      },
      selectionMode: 'same_seat',
    });
    expect(controller.descriptor).toMatchObject({ key: 'pg_1', name: 'Ring cycle', state: 'active' });
    expect(controller.descriptor!.performances).toEqual([
      { position: 1, eventKey: 'ev_1', name: 'Rheingold', startsAt: 1_700_000_000_000, startsAtLabel: 'Sat 15 Aug · 15:00' },
    ]);
    expect(controller.selectionMode).toBe('same_seat');
    event(controller, 'group.status', { kind: 'recovery_failed', message: 'Try again', reference: 'R-1', branding: { brandName: 'Opera' } });
    expect(controller.status).toMatchObject({ kind: 'recovery_failed', reference: 'R-1', branding: { brandName: 'Opera' } });
    event(controller, 'group.hold', { handoff: handoff() });
    expect(controller.hold).toMatchObject({
      operationId: 'pghop_1',
      holdId: 'pgh_1',
      performanceKeys: ['ev_1', 'ev_2'],
      seatLabels: ['A-1'],
      selectionMode: 'same_seat',
      booked: false,
    });
    expect(controller.hold!.json.allocations).toEqual([{ eventKey: 'ev_1', seatLabels: ['A-1'] }]);
    event(controller, 'group.selectionMode.changed', { selectionMode: 'per_performance' });
    expect(selection).toHaveBeenCalledWith('per_performance');
    expect(changed).toHaveBeenCalledTimes(3);
    controller.pageLost();
    expect(controller.descriptor).toBeUndefined();
    expect(controller.selectionMode).toBeUndefined();
    expect(controller.status).toBeUndefined();
    expect(controller.hold).toBeUndefined();
  });

  it('hands each hold to checkout once, reports it booked once, and hears access news', async () => {
    const { controller } = await started();
    const continued = vi.fn();
    const booked = vi.fn();
    const expired = vi.fn();
    controller.on('continue', continued);
    controller.on('booked', booked);
    controller.on('accessExpired', expired);
    event(controller, 'group.checkout', { handoff: handoff() });
    event(controller, 'group.checkout', { handoff: handoff() });
    expect(continued).toHaveBeenCalledTimes(1);
    event(controller, 'group.booked', { handoff: { ...handoff(), bookingState: 'booked' } });
    event(controller, 'group.booked', { handoff: { ...handoff(), bookingState: 'booked' } });
    expect(booked).toHaveBeenCalledTimes(1);
    expect(booked.mock.calls[0]![0]).toMatchObject({ booked: true });
    event(controller, 'group.access.expired', { reason: 'expired', refreshed: false });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('sends the run commands under their page names', async () => {
    const { controller, transport } = await started();
    const continued = controller.continueToCheckout();
    expect(transport.last()).toMatchObject({ type: 'group.continue', payload: {} });
    answer(controller, transport, { handoff: handoff() });
    await expect(continued).resolves.toMatchObject({ operationId: 'pghop_1' });

    const held = controller.getHeldOrder();
    expect(transport.last().type).toBe('group.getHeldOrder');
    answer(controller, transport, { heldOrder: null });
    await expect(held).resolves.toBeUndefined();

    const released = controller.release();
    expect(transport.last().type).toBe('group.release');
    answer(controller, transport, { released: true });
    await expect(released).resolves.toBe(true);

    const mode = controller.setSelectionMode('per_performance');
    expect(transport.last()).toMatchObject({ type: 'group.setSelectionMode', payload: { mode: 'per_performance' } });
    answer(controller, transport, { changed: true });
    await expect(mode).resolves.toBe(true);

    const marked = controller.markBooked({ operationId: 'pghop_1' });
    expect(transport.last()).toMatchObject({ type: 'group.markBooked', payload: { operationId: 'pghop_1' } });
    answer(controller, transport, { status: 'already_booked' });
    await expect(marked).resolves.toBe('already_booked');

    const insets = controller.setViewportInsets({ bottom: 34 });
    expect(transport.last()).toMatchObject({ type: 'group.setViewportInsets', payload: { top: 0, right: 0, bottom: 34, left: 0 } });
    answer(controller, transport, {});
    await insets;

    const foreground = controller.setForeground(true);
    expect(transport.last()).toMatchObject({ type: 'group.lifecycle', payload: { state: 'foreground' } });
    answer(controller, transport, { held: true });
    await expect(foreground).resolves.toBe(true);
  });

  it('refuses a continue the page answers without a hold', async () => {
    const { controller, transport } = await started();
    const continued = controller.continueToCheckout();
    answer(controller, transport, {});
    await expect(continued).rejects.toMatchObject({ code: 'bad_payload' });
  });

  it('gives a continue as long as the page gives the server', async () => {
    vi.useFakeTimers();
    const { controller, transport } = await started();
    const continued = controller.continueToCheckout();
    vi.advanceTimersByTime(44_000);
    answer(controller, transport, { handoff: handoff() });
    await expect(continued).resolves.toMatchObject({ operationId: 'pghop_1' });
  });

  it('reads a hold the page resumed at boot, unless an event named one', async () => {
    const { controller, transport } = await started();
    const hold = vi.fn();
    controller.on('hold', hold);
    const read = controller.readHeldOrder();
    expect(transport.last().type).toBe('group.getHeldOrder');
    answer(controller, transport, { heldOrder: handoff('pghop_resumed') });
    await read;
    expect(controller.hold?.operationId).toBe('pghop_resumed');
    expect(hold).toHaveBeenCalledTimes(1);
    const frames = transport.frames.length;
    await controller.readHeldOrder();
    expect(transport.frames).toHaveLength(frames);
  });

  it('tears the page down and lets it go even when the page does not answer', async () => {
    const { controller, transport } = await started();
    const destroyed = controller.destroy();
    expect(transport.last().type).toBe('group.destroy');
    answer(controller, transport, {});
    await destroyed;
    expect(controller.isReady).toBe(false);
  });
});
