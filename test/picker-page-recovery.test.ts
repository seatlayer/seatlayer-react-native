import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import type { Envelope } from '../src/bridge/envelope';
import { pickerBridgeProfile } from '../src/bridge/profile';
import { SeatLayerController } from '../src/controller';
import type { JsonObject } from '../src/json';
import { SeatLayerPickerController } from '../src/picker/controller';
import { SeatLayerPickerPageRecovery } from '../src/picker/pageRecovery';
import { seatLayerPickerSnapshotSchema } from '../src/picker/models';

class Transport implements BridgeTransport {
  readonly frames: Envelope[] = [];
  send(frame: Envelope): void {
    this.frames.push(frame);
  }
  commands(): string[] {
    return this.frames.filter((frame) => frame.kind === 'cmd').map((frame) => frame.type);
  }
}

const baseConfig = { enable3D: false, enableSeatView: false };
const profile = pickerBridgeProfile({ config: baseConfig });

const snapshot = (revision: number, hold: object, sessionId = 'page-1') => ({
  schema: seatLayerPickerSnapshotSchema,
  sessionId,
  revision,
  event: { key: 'ev', currency: 'EUR' },
  branding: {}, catalog: {}, map: {}, selection: { seats: [] }, cart: { items: [] }, hold, access: {},
});

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function start(
  picker: SeatLayerPickerController,
  options: { page?: string; config?: JsonObject; event?: string; hold?: object } = {},
): Promise<Transport> {
  const transport = new Transport();
  const started = picker.beginHandshake(
    transport, { event: options.event ?? 'ev' }, { config: { ...baseConfig, ...options.config } },
  );
  picker.mapController.ingestRaw({
    sl: 1, k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: [...profile.requiredCapabilities, 'hold-ownership-v1', 'checkout-handoff-v1'],
      commands: [...profile.requiredCommands, 'picker.continue'],
      events: ['sys.ready', 'picker.snapshot', 'hold.expired'],
    },
  });
  picker.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'sys.ready', n: 1,
    p: { protocol: 2, snapshot: snapshot(1, options.hold ?? { active: false }, options.page) },
  });
  await started;
  await flush();
  return transport;
}

function answer(picker: SeatLayerPickerController, transport: Transport, kind: 'res' | 'err', payload: unknown): void {
  const last = transport.frames[transport.frames.length - 1];
  picker.mapController.ingestRaw({ sl: 1, k: kind, t: kind, id: last?.id, p: payload });
}

function push(picker: SeatLayerPickerController, revision: number, hold: object, sessionId = 'page-1'): void {
  picker.mapController.ingestRaw({
    sl: 1, k: 'evt', t: 'picker.snapshot', n: revision + 1, p: { snapshot: snapshot(revision, hold, sessionId) },
  });
}

async function handOff(picker: SeatLayerPickerController, transport: Transport, sessionId?: string): Promise<void> {
  const flight = picker.checkout();
  await flush();
  answer(picker, transport, 'res', {
    snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }, sessionId),
    handoff: { holdId: 'hold-9', expiresAt: 9_000, currency: 'EUR', lineItems: [], total: 0 },
  });
  await flight;
}

function initConfig(transport: Transport): Record<string, unknown> {
  const init = transport.frames.find((frame) => frame.kind === 'init');
  return (init?.payload as { config: Record<string, unknown> }).config;
}

afterEach(() => vi.useRealTimers());

describe('a page that is ready without a map', () => {
  const unloaded = (access: object) => ({
    ...snapshot(1, { active: false }),
    event: { key: 'ev', name: 'ev' }, catalog: { categories: [], gaAreas: [] }, map: { floors: [] }, access,
  });
  async function open(access: object, changes: object = {}, pageError?: object) {
    const map = new SeatLayerController();
    const picker = new SeatLayerPickerController(map);
    const errors: unknown[] = [];
    map.on('error', (error) => errors.push(error));
    const transport = new Transport();
    const outcome = picker.beginHandshake(transport, { event: 'ev' }, { config: baseConfig })
      .then(() => 'ready', (error: unknown) => error);
    map.ingestRaw({
      sl: 1, k: 'hello', t: 'hello',
      p: {
        protocol: { min: 2, max: 2 }, capabilities: [...profile.requiredCapabilities],
        commands: [...profile.requiredCommands], events: ['sys.ready', 'picker.snapshot'],
      },
    });
    if (pageError) map.ingestRaw({ sl: 1, k: 'evt', t: 'error', n: 1, p: pageError as JsonObject });
    map.ingestRaw({
      sl: 1, k: 'evt', t: 'sys.ready', n: 2, p: { protocol: 2, snapshot: { ...unloaded(access), ...changes } } as never,
    });
    const result = await outcome;
    await flush();
    return { errors, map, picker, result };
  }

  it('did not load, whether or not the session could be asked for', async () => {
    for (const access of [{}, { status: 'public' }, { status: 'ready' }, { status: 'unavailable', reason: 'provider_failed' }]) {
      const { errors, picker, result } = await open(access);
      expect(result).toMatchObject({ code: 'sl_transport' });
      expect(errors).toEqual([result]);
      expect(picker.mapController.isReady).toBe(false);
      expect(picker.getSnapshot()).toBeUndefined();
    }
  });

  it("reports the page's own error, once", async () => {
    const { errors, result } = await open({}, {}, { code: 'not_found', message: 'Not found', details: { status: 404 } });
    expect(result).toMatchObject({ code: 'not_found' });
    expect(errors).toEqual([result]);
  });

  it('leaves a refused session to its own telling, and a map that is there alone', async () => {
    for (const reason of ['revoked', 'paused', 'invalid']) {
      expect((await open({ status: 'unavailable', reason })).result).toBe('ready');
    }
    expect((await open({ status: 'expired' })).result).toBe('ready');
    expect((await open({}, { event: { key: 'ev', name: 'Summer Night' } })).result).toBe('ready');
    expect((await open({}, { map: { floors: [{ id: 'f', name: 'Floor' }] } })).result).toBe('ready');
  });

  it('keeps the hold to take up again until a page has a map', async () => {
    const map = new SeatLayerController();
    const picker = new SeatLayerPickerController(map);
    const transport = await start(picker);
    await handOff(picker, transport);
    picker.pageLost();
    await picker.recoverLostPage();
    const offline = new Transport();
    const failed = picker.beginHandshake(offline, { event: 'ev' }, { config: baseConfig }).catch(() => 'failed');
    map.ingestRaw({
      sl: 1, k: 'hello', t: 'hello',
      p: {
        protocol: { min: 2, max: 2 }, capabilities: [...profile.requiredCapabilities, 'hold-ownership-v1'],
        commands: [...profile.requiredCommands, 'picker.resumeHold'], events: ['sys.ready'],
      },
    });
    map.ingestRaw({
      sl: 1, k: 'evt', t: 'sys.ready', n: 1,
      p: { protocol: 2, snapshot: unloaded({ status: 'unavailable', reason: 'provider_failed' }) } as never,
    });
    expect(await failed).toBe('failed');
    await picker.retry();
    const online = await start(picker, { page: 'page-3' });
    await flush();
    expect(online.frames.filter((frame) => frame.type === 'picker.resumeHold')
      .map((frame) => frame.payload)).toEqual([{ holdId: 'hold-9' }]);
  });
});

describe('a page the system ended', () => {
  it('is replaced at once, without waiting for the page that is gone', async () => {
    const picker = new SeatLayerPickerController();
    const transport = await start(picker);
    const waiting = picker.overview();
    const refused = expect(waiting).rejects.toMatchObject({ code: 'sl_transport' });
    await flush();
    const reloads = vi.fn();
    picker.subscribeReload(reloads);

    picker.pageLost();
    await refused;
    expect(picker.mapController.isReady).toBe(false);
    await picker.recoverLostPage(0);
    expect(reloads).toHaveBeenCalledTimes(1);
    expect(picker.getSnapshot()).toBeUndefined();
    expect(transport.commands()).not.toContain('picker.destroy');
    picker.dispose();
  });

  it('is not called booked when a handed-off hold is missing from the new page', async () => {
    const picker = new SeatLayerPickerController();
    const first = await start(picker);
    await handOff(picker, first);
    const booked = vi.fn();
    picker.subscribeBooked(booked);

    picker.pageLost();
    await picker.recoverLostPage(0);
    const second = await start(picker, { page: 'page-2' });
    expect(booked).not.toHaveBeenCalled();

    // The new page is asked for the same hold, and only then is it watched again.
    expect(second.frames[second.frames.length - 1]).toMatchObject({ type: 'picker.resumeHold', payload: { holdId: 'hold-9' } });
    answer(picker, second, 'res', { snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }, 'page-2') });
    await flush();
    expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
    push(picker, 3, { active: false }, 'page-2');
    expect(booked).toHaveBeenCalledTimes(1);
    expect(booked).toHaveBeenCalledWith(expect.objectContaining({ holdId: 'hold-9' }));
    picker.dispose();
  });

  it('forgets the handed-off hold when the server no longer has it', async () => {
    const picker = new SeatLayerPickerController();
    const first = await start(picker);
    await handOff(picker, first);
    const booked = vi.fn();
    picker.subscribeBooked(booked);
    picker.pageLost();
    await picker.recoverLostPage(0);
    const second = await start(picker, { page: 'page-2' });
    answer(picker, second, 'err', { code: 'hold_not_found', message: 'gone' });
    await flush();
    expect(picker.getCheckoutHandoff()).toBeUndefined();
    // A later hold of the buyer's is not mistaken for the sale of the first.
    push(picker, 2, { active: true, owner: 'picker' }, 'page-2');
    push(picker, 3, { active: false }, 'page-2');
    expect(booked).not.toHaveBeenCalled();
    picker.dispose();
  });

  it('shows the map again, with nothing in the cart and no error, when the buyer paid meanwhile', async () => {
    const picker = new SeatLayerPickerController();
    const first = await start(picker);
    await handOff(picker, first);
    const booked = vi.fn();
    const failed = vi.fn();
    picker.subscribeBooked(booked);
    picker.mapController.on('error', failed);
    picker.pageLost();
    await picker.recoverLostPage(0);
    failed.mockClear();
    const second = await start(picker, { page: 'page-2' });
    // A sold hold is answered as one that is not active any more.
    answer(picker, second, 'err', { code: 'hold_not_active', message: 'booked' });
    await flush();

    expect(picker.mapController.isReady).toBe(true);
    expect(picker.getPageLostError()).toBeUndefined();
    expect(failed).not.toHaveBeenCalled();
    expect(picker.getSnapshot()).toMatchObject({ sessionId: 'page-2', hold: { active: false }, cartLines: [], cartTotal: 0 });
    expect(second.commands()).toEqual(['picker.resumeHold']);
    // The sale is the checkout's to report: this page never saw the hold.
    expect(booked).not.toHaveBeenCalled();
    expect(picker.getBookedHandoff()).toBeUndefined();
    picker.dispose();
  });

  describe('when nobody answers the question for the hold', () => {
    const lost = { code: 'command_failed', message: 'Failed to fetch' };
    const resumes = (transport: Transport) => transport.commands().filter((name) => name === 'picker.resumeHold').length;
    async function asked(): Promise<{ picker: SeatLayerPickerController; page: Transport; booked: ReturnType<typeof vi.fn> }> {
      const picker = new SeatLayerPickerController();
      await handOff(picker, await start(picker));
      const booked = vi.fn();
      picker.subscribeBooked(booked);
      picker.pageLost();
      await picker.recoverLostPage(0);
      const page = await start(picker, { page: 'page-2' });
      vi.useFakeTimers();
      return { picker, page, booked };
    }

    it('asks once more after two seconds, and has the hold and its clock again', async () => {
      const { picker, page, booked } = await asked();
      answer(picker, page, 'err', lost);
      await vi.advanceTimersByTimeAsync(1_900);
      expect(resumes(page)).toBe(1);
      expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
      await vi.advanceTimersByTimeAsync(200);
      expect(resumes(page)).toBe(2);
      answer(picker, page, 'res', { snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }, 'page-2') });
      await flush();
      expect(picker.getSnapshot()?.hold).toMatchObject({ active: true, expiresAt: 9_000 });
      expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
      push(picker, 3, { active: false }, 'page-2');
      expect(booked).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      picker.dispose();
    });

    it('asks once more only, and then forgets the hold', async () => {
      const { picker, page } = await asked();
      answer(picker, page, 'err', lost);
      await vi.advanceTimersByTimeAsync(2_100);
      answer(picker, page, 'err', lost);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(resumes(page)).toBe(2);
      expect(picker.getCheckoutHandoff()).toBeUndefined();
      picker.dispose();
    });

    it('takes the server\'s refusal as final', async () => {
      const { picker, page } = await asked();
      answer(picker, page, 'err', { code: 'expired', message: 'hold_not_active', details: { status: 409, reason: 'expired' } });
      await flush();
      expect(picker.getCheckoutHandoff()).toBeUndefined();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(resumes(page)).toBe(1);
      picker.dispose();
    });

    it('asks nothing after the picker is gone', async () => {
      const { picker, page } = await asked();
      answer(picker, page, 'err', lost);
      await flush();
      expect(vi.getTimerCount()).toBe(1);
      picker.dispose();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(resumes(page)).toBe(1);
    });

    it('leaves the question to the next page when this one ends too', async () => {
      const { picker, page, booked } = await asked();
      answer(picker, page, 'err', lost);
      await flush();
      picker.pageLost();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(resumes(page)).toBe(1);
      await picker.recoverLostPage(1);
      expect(vi.getTimerCount()).toBe(0);
      const third = await start(picker, { page: 'page-3' });
      expect(resumes(third)).toBe(1);
      answer(picker, third, 'res', { snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }, 'page-3') });
      await flush();
      expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
      expect(booked).not.toHaveBeenCalled();
      picker.dispose();
    });

    it('leaves it to the next page when this one ends while it is asked again', async () => {
      const { picker, page } = await asked();
      answer(picker, page, 'err', lost);
      await vi.advanceTimersByTimeAsync(2_100);
      expect(resumes(page)).toBe(2);
      picker.pageLost();
      await flush();
      await picker.recoverLostPage(1);
      const third = await start(picker, { page: 'page-3' });
      expect(resumes(third)).toBe(1);
      expect(picker.getCheckoutHandoff()?.holdId).toBe('hold-9');
      picker.dispose();
    });

    it('does not replace a hold the buyer made meanwhile', async () => {
      const { picker, page, booked } = await asked();
      answer(picker, page, 'err', lost);
      await flush();
      push(picker, 2, { active: true, owner: 'picker' }, 'page-2');
      await vi.advanceTimersByTimeAsync(2_100);
      expect(resumes(page)).toBe(1);
      push(picker, 3, { active: false }, 'page-2');
      expect(booked).not.toHaveBeenCalled();
      picker.dispose();
    });
  });

  it('asks for the host\'s first hold again without failing the page when it is gone', async () => {
    const picker = new SeatLayerPickerController();
    const first = await start(picker, { config: { initialHoldId: 'hold-1' }, hold: { active: true, owner: 'host' } });
    expect(initConfig(first).initialHoldId).toBe('hold-1');
    picker.pageLost();
    await picker.recoverLostPage(0);
    const second = await start(picker, { page: 'page-2', config: { initialHoldId: 'hold-1' } });
    expect(initConfig(second)).not.toHaveProperty('initialHoldId');
    expect(second.frames[second.frames.length - 1]).toMatchObject({ type: 'picker.resumeHold', payload: { holdId: 'hold-1' } });
    answer(picker, second, 'err', { code: 'hold_not_found', message: 'gone' });
    await flush();
    expect(picker.mapController.isReady).toBe(true);

    // A later start that is not a reload is the host's own again.
    const third = await start(picker, { page: 'page-3', config: { initialHoldId: 'hold-1' } });
    expect(initConfig(third).initialHoldId).toBe('hold-1');
    picker.dispose();
  });

  it('asks for nothing when nothing was held, and never across events', async () => {
    const picker = new SeatLayerPickerController();
    await start(picker, { config: { initialHoldId: 'hold-1' } });
    picker.pageLost();
    await picker.recoverLostPage(0);
    const second = await start(picker, { page: 'page-2', config: { initialHoldId: 'hold-1' } });
    expect(second.commands()).not.toContain('picker.resumeHold');
    expect(initConfig(second)).not.toHaveProperty('initialHoldId');

    await handOff(picker, second, 'page-2');
    expect(picker.getSnapshot()?.hold.active).toBe(true);
    picker.pageLost();
    await picker.recoverLostPage(1);
    const other = await start(picker, { page: 'page-3', event: 'other' });
    expect(other.commands()).not.toContain('picker.resumeHold');
    picker.dispose();
  });

  it('keeps the first hold in the boot of a page that never loaded', async () => {
    const picker = new SeatLayerPickerController();
    await picker.retry();
    const transport = await start(picker, { config: { initialHoldId: 'hold-1' } });
    expect(initConfig(transport).initialHoldId).toBe('hold-1');
    picker.dispose();
  });

  it('stops reloading a page that keeps ending, until the buyer tries again', async () => {
    const picker = new SeatLayerPickerController();
    await start(picker);
    for (const at of [0, 1_000]) {
      picker.pageLost();
      await picker.recoverLostPage(at);
      expect(picker.getPageLostError()).toBeUndefined();
    }
    picker.pageLost();
    await picker.recoverLostPage(2_000);
    expect(picker.getPageLostError()).toMatchObject({ code: 'sl_transport' });
    await picker.retry();
    expect(picker.getPageLostError()).toBeUndefined();
    picker.dispose();
  });

  it('counts only the losses of the last minute', () => {
    const recovery = new SeatLayerPickerPageRecovery();
    expect([0, 30_000, 61_000, 200_000].map((at) => recovery.lost(at))).toEqual([true, true, true, true]);
    expect([200_001, 200_002].map((at) => recovery.lost(at))).toEqual([true, false]);
    recovery.reset();
    expect(recovery.lost(200_003)).toBe(true);
  });

  it('reaches the host of a raw view as an error it can remount on', async () => {
    const controller = new SeatLayerController();
    const errors: unknown[] = [];
    controller.on('error', (error) => errors.push(error));
    const transport = new Transport();
    const started = controller.beginHandshake(transport, { event: 'ev' });
    controller.ingestRaw({ sl: 1, k: 'hello', t: 'hello', p: { protocol: { min: 1, max: 1 }, commands: [], capabilities: [], events: [] } });
    controller.ingestRaw({ sl: 1, k: 'evt', t: 'sys.ready', n: 1, p: { protocol: 1 } });
    await started;
    const waiting = controller.getSelection();
    const refused = expect(waiting).rejects.toMatchObject({ code: 'sl_transport' });
    controller.pageLost();
    await refused;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'sl_transport', retryable: true });
    expect(controller.isReady).toBe(false);
  });
});

describe('time limits', () => {
  it('waits 45 seconds for the page to start', async () => {
    vi.useFakeTimers();
    const controller = new SeatLayerController();
    let outcome: unknown;
    void controller.beginHandshake(new Transport(), { event: 'ev' }).catch((error: unknown) => { outcome = error; });
    await vi.advanceTimersByTimeAsync(44_900);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(outcome).toMatchObject({ code: 'sl_timeout' });
  });

  it('takes a hold the page answers after 41 seconds', async () => {
    const picker = new SeatLayerPickerController();
    const transport = await start(picker);
    vi.useFakeTimers();
    const flight = picker.checkout();
    await vi.advanceTimersByTimeAsync(41_000);
    answer(picker, transport, 'res', {
      snapshot: snapshot(2, { active: true, owner: 'host', expiresAt: 9_000 }),
      handoff: { holdId: 'hold-9', expiresAt: 9_000, currency: 'EUR', lineItems: [], total: 0 },
    });
    await expect(flight).resolves.toMatchObject({ holdId: 'hold-9' });
    picker.dispose();
  });

  it('keeps 15 seconds for a command that holds nothing', async () => {
    const picker = new SeatLayerPickerController();
    await start(picker);
    vi.useFakeTimers();
    const refused = expect(picker.overview()).rejects.toMatchObject({ code: 'sl_timeout' });
    await vi.advanceTimersByTimeAsync(15_100);
    await refused;
    picker.dispose();
  });
});
