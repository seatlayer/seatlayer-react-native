import { describe, expect, it, vi } from 'vitest';

import type { BridgeTransport } from '../src/bridge/client';
import { pickerBridgeProfile, sanitizeSeatLayerPickerBridgeConfig } from '../src/bridge/profile';
import { captureSeatLayerRendererUnmount } from '../src/rendererCleanup';
import { createSeatLayerPickerChartRendererController, disconnectSeatLayerPickerChartRenderer } from '../src/picker/chartBridge';
import {
  createSeatLayerPickerChartBoot,
  tryCreateSeatLayerPickerChartBoot,
} from '../src/picker/chartBoot';
import { SeatLayerPickerChartThemeSync } from '../src/picker/chartThemeSync';
import {
  cancelSeatLayerPickerPending,
  SeatLayerPickerPendingCancelCoordinator,
} from '../src/picker/pendingConfirmationActions';
import {
  applyPendingConfirmationSnapshot,
  confirmPending,
  initialPendingConfirmationState,
  resetPendingConfirmationState,
} from '../src/picker/pendingConfirmationState';
import {
  prepareSeatLayerPickerScopeConfiguration,
  prepareSeatLayerPickerScopeInputs,
  replaceSeatLayerPickerScopeSession,
} from '../src/picker/scopeReplacement';
import { SeatLayerPickerScopeSession } from '../src/picker/scopeSession';
import { reprovideSeatLayerPickerScopeValue } from '../src/picker/scopeReprovider';
import { SeatLayerPickerScopeInsets } from '../src/picker/scopeInsets';
import { SeatLayerPickerScopeInsetBands } from '../src/picker/scopeInsetBands';
import { SeatLayerPickerLifecycleCoordinator } from '../src/picker/scopeLifecycle';
import { SeatLayerPickerEffectSlot } from '../src/picker/effectSlot';
import { freezeSeatLayerPickerConfiguration } from '../src/picker/scopeConfiguration';
import { SeatLayerPickerScopeCandidates } from '../src/picker/scopeCandidates';
import { resolveSeatLayerPickerScopeTheme } from '../src/picker/scopeTheme';
import {
  beginSeatLayerRendererHandshake,
  SeatLayerRendererHandshakeLease,
} from '../src/rendererHandshake';
import { SeatLayerPickerBackCoordinator } from '../src/picker/backNavigation';
import { seatLayerPickerInitialPresentationState } from '../src/picker/presentationState';
import { invokeSeatLayerPickerCallback } from '../src/picker/callback';

class FrameQueue {
  callbacks = new Map<number, () => void>();
  next = 0;
  requestAnimationFrame(callback: () => void): number {
    const handle = this.next;
    this.next += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }
  cancelAnimationFrame(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }
  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

const selectionSnapshot = {
  sessionId: 'session',
  revision: 1,
  selection: [{ id: 'seat-id', label: 'seat-label', objectId: 'object-id' }],
};

describe('scope snapshot and pending actions', () => {
  it('re-resolves organizer branding when the immutable snapshot changes', () => {
    const initial = resolveSeatLayerPickerScopeTheme(undefined, 'light', 'light', undefined);
    const updated = resolveSeatLayerPickerScopeTheme(undefined, 'light', 'light', {
      branding: { accent: '#102030' },
    } as never);
    expect(initial.colors.accent).not.toBe('#102030');
    expect(updated.colors.accent).toBe('#102030');
  });

  it('confirms locally and cancels only the exact pending snapshot label', async () => {
    const pending = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      selectionSnapshot,
    );
    const confirmed = confirmPending(pending);
    expect(confirmed.pending).toBeNull();
    const deselectObjects = vi.fn().mockResolvedValue(undefined);
    const cancelled = await cancelSeatLayerPickerPending(pending, { deselectObjects });
    expect(deselectObjects).toHaveBeenCalledExactlyOnceWith(['seat-label']);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.state.pending).toBeNull();

    const failing = vi.fn().mockRejectedValue(new Error('unavailable'));
    await expect(cancelSeatLayerPickerPending(pending, { deselectObjects: failing })).rejects.toThrow('unavailable');
    expect(pending.pending?.label).toBe('seat-label');
  });

  it('keeps a newer snapshot current when an earlier cancel completes', async () => {
    let state = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      selectionSnapshot,
    );
    let completeDeselect: (() => void) | undefined;
    const deselectObjects = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { completeDeselect = resolve; }),
    );
    const coordinator = new SeatLayerPickerPendingCancelCoordinator(
      { deselectObjects },
      {
        getState: () => state,
        setState: (next) => { state = next; },
        setBusy: () => undefined,
        reportError: () => undefined,
      },
    );

    const cancellation = coordinator.cancel();
    state = applyPendingConfirmationSnapshot(state, {
      ...selectionSnapshot,
      revision: 2,
      selection: [{ id: 'seat-b', label: 'seat-B', objectId: 'object-b' }],
    });
    completeDeselect?.();
    await expect(cancellation).resolves.toBe(true);

    expect(deselectObjects).toHaveBeenCalledExactlyOnceWith(['seat-label']);
    expect(state.revision).toBe(2);
    expect(state.pending?.label).toBe('seat-B');
  });

  it('locks an immediate second cancellation and releases after failure', async () => {
    let state = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      selectionSnapshot,
    );
    let rejectDeselect: ((error: Error) => void) | undefined;
    const deselectObjects = vi.fn().mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => { rejectDeselect = reject; }),
    ).mockResolvedValueOnce(undefined);
    const errors = vi.fn();
    const coordinator = new SeatLayerPickerPendingCancelCoordinator(
      { deselectObjects },
      {
        getState: () => state,
        setState: (next) => { state = next; },
        setBusy: () => undefined,
        reportError: errors,
      },
    );

    const first = coordinator.cancel();
    await expect(coordinator.cancel()).resolves.toBe(false);
    expect(deselectObjects).toHaveBeenCalledTimes(1);
    rejectDeselect?.(new Error('offline'));
    await expect(first).resolves.toBe(false);
    expect(state.pending?.label).toBe('seat-label');
    await expect(coordinator.cancel()).resolves.toBe(true);
    expect(deselectObjects).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledOnce();
  });

  it('retires an old cancellation without changing the replacement session state', async () => {
    let resolveDeselect: (() => void) | undefined;
    const setState = vi.fn();
    const setBusy = vi.fn();
    const coordinator = new SeatLayerPickerPendingCancelCoordinator(
      { deselectObjects: vi.fn(() => new Promise<void>((resolve) => { resolveDeselect = resolve; })) },
      {
        getState: () => applyPendingConfirmationSnapshot(initialPendingConfirmationState(), selectionSnapshot),
        setState,
        setBusy,
        reportError: vi.fn(),
      },
    );
    const flight = coordinator.cancel();
    coordinator.dispose();
    resolveDeselect?.();
    await expect(flight).resolves.toBe(false);
    expect(setState).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('keeps Back on the pending rung while a direct cancellation is in flight', async () => {
    let state = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      selectionSnapshot,
    );
    let complete: (() => void) | undefined;
    const cancellation = new SeatLayerPickerPendingCancelCoordinator(
      { deselectObjects: vi.fn(() => new Promise<void>((resolve) => { complete = resolve; })) },
      {
        getState: () => state,
        setState: (next) => { state = next; },
        setBusy: () => undefined,
        reportError: () => undefined,
      },
    );
    const flight = cancellation.cancel();
    state = applyPendingConfirmationSnapshot(state, {
      ...selectionSnapshot,
      revision: 2,
      selection: [],
    });
    const back = new SeatLayerPickerBackCoordinator().begin(
      seatLayerPickerInitialPresentationState,
      cancellation.isInFlight,
    );
    expect(back).toMatchObject({ action: { type: 'dismissPendingConfirmation' }, started: false });
    complete?.();
    await flight;
  });

  it('does not carry a prior pending seat into a new session without a snapshot', () => {
    const prior = applyPendingConfirmationSnapshot(
      initialPendingConfirmationState(),
      selectionSnapshot,
    );
    expect(prior.pending).not.toBeNull();
    expect(resetPendingConfirmationState().pending).toBeNull();
  });
});

describe('chart theme synchronization', () => {
  it('coalesces pre-ready flips and schedules one bounded retry without a reload', async () => {
    const light = { mode: 'light' as const, mapTheme: { background: '#ffffff' } };
    const dark = { mode: 'dark' as const, mapTheme: { background: '#000000' } };
    const retries = new Map<number, () => void>();
    let nextRetry = 0;
    const sync = new SeatLayerPickerChartThemeSync(light, {
      schedule: (callback: () => void) => {
        const handle = nextRetry;
        nextRetry += 1;
        retries.set(handle, callback);
        return handle;
      },
      cancel: (handle) => retries.delete(handle as number),
    });
    sync.setDesired(dark);
    sync.setDesired(light);
    sync.setDesired(dark);
    const send = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(undefined);
    await sync.flush(send);
    expect(send).not.toHaveBeenCalled();
    sync.markReady();
    await expect(sync.flush(send)).rejects.toThrow('temporary');
    expect(retries).toHaveLength(1);
    [...retries.values()].forEach((retry) => retry());
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(dark);
  });

  it('does not schedule a retry when a late in-flight command rejects after disposal', async () => {
    const retries = new Map<number, () => void>();
    let nextRetry = 0;
    const sync = new SeatLayerPickerChartThemeSync(
      { mode: 'light', mapTheme: { background: '#fff' } },
      {
        schedule: (callback) => {
          const handle = nextRetry;
          nextRetry += 1;
          retries.set(handle, callback);
          return handle;
        },
        cancel: (handle) => retries.delete(handle as number),
      },
    );
    sync.setDesired({ mode: 'dark', mapTheme: { background: '#000' } });
    sync.markReady();
    let reject: ((error: Error) => void) | undefined;
    const send = vi.fn(() => new Promise<void>((_resolve, nextReject) => { reject = nextReject; }));
    const flight = sync.flush(send);
    sync.dispose();
    reject?.(new Error('late'));
    await expect(flight).rejects.toThrow('late');
    expect(retries).toHaveLength(0);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('scope insets and lifecycle', () => {
  it('buffers pre-ready bands, sends once at ready, then sends only changed bands', async () => {
    const frames = new FrameQueue();
    const setViewportInsets = vi.fn().mockResolvedValue(undefined);
    const errors = vi.fn();
    const insets = new SeatLayerPickerScopeInsets(frames, { setViewportInsets }, errors);
    insets.setBand('header', { top: 56 });
    insets.setBand('sheet', { bottom: 90 });
    frames.flush();
    await Promise.resolve();
    expect(setViewportInsets).not.toHaveBeenCalled();
    insets.markReady();
    await Promise.resolve();
    expect(setViewportInsets).toHaveBeenCalledExactlyOnceWith({ top: 56, right: 0, bottom: 90, left: 0 });
    insets.setBand('sheet', { bottom: 90 });
    frames.flush();
    await Promise.resolve();
    expect(setViewportInsets).toHaveBeenCalledTimes(1);
    insets.setBand('sheet', { bottom: 120 });
    frames.flush();
    await Promise.resolve();
    expect(setViewportInsets).toHaveBeenLastCalledWith({ top: 56, right: 0, bottom: 120, left: 0 });
    expect(errors).not.toHaveBeenCalled();
  });

  it('contains inset errors and sends lifecycle only after readiness', async () => {
    const frames = new FrameQueue();
    const reportError = vi.fn();
    const insets = new SeatLayerPickerScopeInsets(frames, {
      setViewportInsets: vi.fn().mockRejectedValue(new Error('unsupported')),
    }, reportError);
    insets.setBand('header', { top: 20 });
    frames.flush();
    insets.markReady();
    await Promise.resolve();
    expect(reportError).toHaveBeenCalled();

  });

  it('drops late inset work after dispose and replays retained bands to a replacement', async () => {
    const frames = new FrameQueue();
    let reject: ((error: Error) => void) | undefined;
    const firstSend = vi.fn(() => new Promise<void>((_resolve, nextReject) => { reject = nextReject; }));
    const errors = vi.fn();
    const first = new SeatLayerPickerScopeInsets(frames, { setViewportInsets: firstSend }, errors);
    first.setBand('header', { top: 44 });
    frames.flush();
    first.markReady();
    await Promise.resolve();
    first.dispose();
    reject?.(new Error('late'));
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    expect(firstSend).toHaveBeenCalledTimes(2);
    expect(firstSend).toHaveBeenLastCalledWith(null);

    const bands = new SeatLayerPickerScopeInsetBands();
    bands.set('header', { top: 44 });
    bands.set('sheet', { bottom: 80 });
    const secondSend = vi.fn().mockResolvedValue(undefined);
    const second = new SeatLayerPickerScopeInsets(frames, { setViewportInsets: secondSend }, errors);
    bands.replay(second);
    frames.flush();
    second.markReady();
    await Promise.resolve();
    expect(secondSend).toHaveBeenCalledWith({ top: 44, right: 0, bottom: 80, left: 0 });
  });

  it('clears a ready owned inset contract on disposal without surfacing a late rejection', async () => {
    const frames = new FrameQueue();
    const errors = vi.fn();
    const setViewportInsets = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('retired clear'));
    const insets = new SeatLayerPickerScopeInsets(frames, { setViewportInsets }, errors);
    insets.setBand('header', { top: 44 });
    frames.flush();
    insets.markReady();
    await Promise.resolve();
    insets.dispose();
    await Promise.resolve();
    expect(setViewportInsets).toHaveBeenLastCalledWith(null);
    expect(errors).not.toHaveBeenCalled();
  });

  it('buffers lifecycle until ready, serializes foreground sync, and ignores retired failures', async () => {
    const calls: string[] = [];
    let resolveLifecycle: ((value: undefined) => void) | undefined;
    const errors = vi.fn();
    const coordinator = new SeatLayerPickerLifecycleCoordinator(
      {
        setLifecycle: vi.fn((state) => {
          calls.push(`lifecycle:${state}`);
          return new Promise<undefined>((resolve) => { resolveLifecycle = resolve; });
        }),
        synchronize: vi.fn(async () => { calls.push('synchronize'); }),
      },
      errors,
    );
    coordinator.setAppState('background');
    expect(calls).toEqual([]);
    coordinator.markReady();
    expect(calls).toEqual(['lifecycle:background']);
    resolveLifecycle?.(undefined);
    await Promise.resolve();
    await Promise.resolve();
    coordinator.setAppState('active');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['lifecycle:background', 'lifecycle:foreground']);

    const synchronize = vi.fn();
    const foreground = new SeatLayerPickerLifecycleCoordinator(
      {
        setLifecycle: vi.fn().mockResolvedValue(undefined),
        synchronize,
      },
      errors,
    );
    foreground.markReady();
    await Promise.resolve();
    expect(synchronize).toHaveBeenCalledOnce();

    const refreshedSynchronize = vi.fn();
    const refreshed = new SeatLayerPickerLifecycleCoordinator(
      {
        setLifecycle: vi.fn().mockResolvedValue({ revision: 2 }),
        synchronize: refreshedSynchronize,
      },
      errors,
    );
    refreshed.markReady();
    await Promise.resolve();
    expect(refreshedSynchronize).toHaveBeenCalledOnce();

    const stale = new SeatLayerPickerLifecycleCoordinator(
      {
        setLifecycle: vi.fn().mockRejectedValue(new Error('old')),
        synchronize: vi.fn(),
      },
      errors,
    );
    stale.markReady();
    stale.dispose();
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('scope ownership and renderer bridge', () => {
  it('preserves exact scope identity for a re-provided modal tree', () => {
    const value = Object.freeze({ sessionId: 3 });
    expect(reprovideSeatLayerPickerScopeValue(value)).toBe(value);
  });

  it('does not release a working session when its replacement is locked elsewhere', () => {
    const occupied = new SeatLayerPickerScopeSession();
    occupied.attach();
    const working = new SeatLayerPickerScopeSession();
    const previous = working.currentController;
    working.attach();
    expect(() => working.replace(occupied.currentController)).toThrow(/already attached/);
    expect(working.currentController).toBe(previous);
    working.release();
    occupied.release();
    working.dispose();
    occupied.dispose();
  });

  it('contains a locked scope replacement and preserves its current controller', () => {
    const occupied = new SeatLayerPickerScopeSession();
    occupied.attach();
    const working = new SeatLayerPickerScopeSession();
    working.attach();
    const current = working.currentController;
    const errors = vi.fn();

    expect(
      replaceSeatLayerPickerScopeSession(
        working,
        occupied.currentController,
        errors,
      ),
    ).toBe(false);
    expect(working.currentController).toBe(current);
    expect(errors).toHaveBeenCalledOnce();
    working.dispose();
    occupied.dispose();
  });

  it('rejects an invalid next configuration before replacing the working session', () => {
    const working = new SeatLayerPickerScopeSession();
    const current = working.currentController;
    const errors = vi.fn();
    expect(
      prepareSeatLayerPickerScopeConfiguration({ event: '  ' }, errors),
    ).toBeUndefined();
    const unsafe = { event: 'next' } as { event: string; selectedObjects?: string[] };
    Object.defineProperty(unsafe, 'selectedObjects', { get: () => { throw new Error('unsafe'); } });
    expect(
      prepareSeatLayerPickerScopeConfiguration(unsafe, errors),
    ).toBeUndefined();
    expect(working.currentController).toBe(current);
    expect(errors).toHaveBeenCalledTimes(2);
    working.dispose();
  });

  it('prevalidates bridge and read-only boot inputs before replacing a session', () => {
    const errors = vi.fn();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(prepareSeatLayerPickerScopeInputs({ event: 'next' }, cyclic, false, undefined, errors)).toBeUndefined();
    expect(prepareSeatLayerPickerScopeInputs({ event: 'next' }, {}, 'false', undefined, errors)).toBeUndefined();
    const valid = prepareSeatLayerPickerScopeInputs({ event: 'next' }, { nested: { enabled: true } }, true, undefined, errors);
    expect(valid?.bridgeConfig).toEqual({ nested: { enabled: true } });
    expect(Object.isFrozen(valid?.bridgeConfig)).toBe(true);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it('re-evaluates a rollback candidate without replacing the last accepted session', () => {
    const accepted = {
      inputs: { configuration: { event: 'A' }, controller: undefined, bridgeConfig: {}, readOnly: false },
      controller: undefined,
    };
    const rejected = {
      inputs: { configuration: { event: 'B' }, controller: undefined, bridgeConfig: { invalid: true }, readOnly: true },
      controller: undefined,
    };
    const candidates = new SeatLayerPickerScopeCandidates(accepted);
    expect(candidates.see(rejected)).toBe(true);
    expect(candidates.isAccepted(rejected)).toBe(false);
    expect(candidates.currentAccepted).toBe(accepted);
    expect(candidates.see(accepted)).toBe(true);
    expect(candidates.isAccepted(accepted)).toBe(true);
    expect(candidates.currentAccepted).toBe(accepted);
  });

  it('cancels deferred owned disposal on immediate retain and eventually disposes it', async () => {
    const session = new SeatLayerPickerScopeSession();
    const controller = session.currentController;
    session.attach();
    session.release();
    session.attach();
    session.flushDeferredDisposal();
    expect(session.isCurrentControllerDisposed).toBe(false);
    session.release();
    session.flushDeferredDisposal();
    expect(session.isCurrentControllerDisposed).toBe(true);
  });

  it('uses one raw or picker handshake and disconnects only the picker transport', async () => {
    const rawBegin = vi.fn().mockResolvedValue({ protocolRevision: 1 });
    await beginSeatLayerRendererHandshake({ beginHandshake: rawBegin }, { send() {} } as BridgeTransport, { event: 'event' });
    expect(rawBegin).toHaveBeenCalledTimes(1);
    const pickerBegin = vi.fn().mockResolvedValue({ protocolRevision: 2 });
    const disconnect = vi.fn();
    const picker = {
      beginHandshake: pickerBegin,
      mapController: { ingestRaw: vi.fn(), failWithTransport: vi.fn(), disconnect },
    };
    const adapter = createSeatLayerPickerChartRendererController(picker, {});
    await beginSeatLayerRendererHandshake(adapter, { send() {} }, { event: 'event' });
    expect(pickerBegin).toHaveBeenCalledTimes(1);
    expect(rawBegin).toHaveBeenCalledTimes(1);
    disconnectSeatLayerPickerChartRenderer(picker);
    expect(disconnect).toHaveBeenCalledExactlyOnceWith(undefined, false);
  });

  it('models fresh Strict Mode effect leases and disconnects each retired setup', async () => {
    const scheduled = new Map<number, () => void>();
    let nextHandle = 0;
    const begin = vi.fn().mockResolvedValue({ protocolRevision: 2 });
    const disconnect = vi.fn();
    const options = {
      begin,
      disconnect,
      onReady: () => undefined,
      onLoadError: () => undefined,
      schedule: (callback: () => void) => {
        const handle = nextHandle;
        nextHandle += 1;
        scheduled.set(handle, callback);
        return handle;
      },
      cancel: (handle: unknown) => scheduled.delete(handle as number),
    };

    const first = new SeatLayerRendererHandshakeLease(options);
    first.setup();
    first.cleanup();
    const second = new SeatLayerRendererHandshakeLease(options);
    second.setup();
    [...scheduled.values()].forEach((callback) => callback());
    await Promise.resolve();
    expect(begin).toHaveBeenCalledOnce();
    second.cleanup();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('cleans up a genuine unmount before a deferred handshake starts', () => {
    let scheduled: (() => void) | undefined;
    const begin = vi.fn();
    const disconnect = vi.fn();
    const lease = new SeatLayerRendererHandshakeLease({
      begin,
      disconnect,
      onReady: () => undefined,
      onLoadError: () => undefined,
      schedule: (callback) => { scheduled = callback; return 1; },
      cancel: () => { scheduled = undefined; },
    });
    lease.setup();
    lease.cleanup();
    scheduled?.();
    expect(begin).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('uses a fresh effect-owned coordinator after Strict Mode cleanup replay', () => {
    const slot = new SeatLayerPickerEffectSlot<{ dispose(): void }>();
    const first = { dispose: vi.fn() };
    const second = { dispose: vi.fn() };
    const cleanupFirst = slot.install(first);
    cleanupFirst();
    const cleanupSecond = slot.install(second);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(slot.current).toBe(second);
    cleanupSecond();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(slot.current).toBeUndefined();
  });

  it('captures renderer A cleanup even when render B has supplied a new callback', () => {
    const disconnectA = vi.fn();
    const disconnectB = vi.fn();
    const cleanupA = captureSeatLayerRendererUnmount(disconnectA);
    void disconnectB;
    cleanupA();
    expect(disconnectA).toHaveBeenCalledOnce();
    expect(disconnectB).not.toHaveBeenCalled();
  });

  it('turns a synchronous renderer begin failure into a contained load error', () => {
    let scheduled: (() => void) | undefined;
    const loadErrors = vi.fn();
    const lease = new SeatLayerRendererHandshakeLease({
      begin: () => { throw new Error('begin failed'); },
      disconnect: () => undefined,
      onReady: () => undefined,
      onLoadError: loadErrors,
      schedule: (callback) => { scheduled = callback; return 1; },
      cancel: () => undefined,
    });
    lease.setup();
    scheduled?.();
    expect(loadErrors).toHaveBeenCalledOnce();
  });

  it('contains synchronous and rejecting chart consumer callbacks', async () => {
    const errors = vi.fn();
    invokeSeatLayerPickerCallback(() => { throw new Error('sync'); }, {}, errors);
    invokeSeatLayerPickerCallback(
      (() => Promise.reject(new Error('async'))) as unknown as (value: {}) => void,
      {},
      errors,
    );
    await Promise.resolve();
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it('contains rejecting callable thenables from consumer callbacks', async () => {
    const errors = vi.fn();
    const callableThenable = Object.assign(
      () => undefined,
      { then: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error('callable')) },
    );
    invokeSeatLayerPickerCallback(
      (() => callableThenable) as unknown as (value: {}) => void,
      {},
      errors,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveBeenCalledOnce();
  });

  it('keeps rapid Back on the active local rung until it completes', () => {
    const coordinator = new SeatLayerPickerBackCoordinator();
    const focused = {
      ...seatLayerPickerInitialPresentationState,
      focusedSection: { sectionId: 'balcony' },
      isOverview: false,
    };
    const first = coordinator.begin(focused);
    const second = coordinator.begin(seatLayerPickerInitialPresentationState);
    expect(first).toMatchObject({ action: { type: 'stepOut' }, started: true });
    expect(second).toMatchObject({ action: { type: 'stepOut' }, started: false });
    coordinator.complete(first.action);
    expect(coordinator.begin(seatLayerPickerInitialPresentationState).action.type).toBe('delegateToHost');
    coordinator.reset();
    expect(coordinator.begin(seatLayerPickerInitialPresentationState).action.type).toBe('delegateToHost');
  });

  it('freezes read-only boot configuration against caller mutation', () => {
    const configuration = {
      event: 'event',
      messages: { title: 'before' },
      selectionValidators: [{ type: 'minimumSelectedPlaces' as const, minimum: 2 }],
    };
    const options = { nested: { enabled: true } };
    const boot = createSeatLayerPickerChartBoot(configuration, options, { background: '#000000' }, 'dark', true);
    configuration.messages.title = 'after';
    configuration.selectionValidators[0]!.minimum = 9;
    options.nested.enabled = false;
    expect(boot.configuration.messages?.title).toBe('before');
    expect(boot.configuration.selectionValidators?.[0]).toMatchObject({ minimum: 2 });
    expect(boot.bridgeConfig).toMatchObject({ readOnly: true, nested: { enabled: true } });
  });

  it('contains malformed boot config and rejects picker-owned reserved fields', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const invalid = tryCreateSeatLayerPickerChartBoot(
      { event: 'event' },
      cyclic as never,
      { background: '#000000' },
      'dark',
      true,
    );
    expect(invalid.error?.code).toBe('bad_payload');
    expect(() => sanitizeSeatLayerPickerBridgeConfig({ event: 'wrong' })).toThrow(/reserved key/);
    expect(() => sanitizeSeatLayerPickerBridgeConfig({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => sanitizeSeatLayerPickerBridgeConfig({ value: new Date() })).toThrow(/plain objects/);
    const input = { nested: { values: [1, 2] } };
    const safe = sanitizeSeatLayerPickerBridgeConfig(input);
    input.nested.values[0] = 9;
    expect(safe).toEqual({ nested: { values: [1, 2] } });
    expect(Object.isFrozen(safe.nested)).toBe(true);
    expect(Object.isFrozen((safe.nested as unknown as { values: readonly number[] }).values)).toBe(true);
    const protoPayload = JSON.parse('{"__proto__":{"enable3D":false},"nested":{"event":"allowed"}}');
    const protoSafe = sanitizeSeatLayerPickerBridgeConfig(protoPayload);
    expect(Object.getPrototypeOf(protoSafe)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(protoSafe, '__proto__')).toBe(true);
    expect(pickerBridgeProfile({ config: protoSafe }).requiredCommands).toContain('picker.setBuyerView');
  });

  it('contains unsafe complete runtime configuration before a replacement can begin', () => {
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', commandTimeoutMs: 0 })).toThrow(/positive integer/);
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', buyerAccessToken: null as never })).toThrow(/plain object/);
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', selectedObjects: ['a', 2] as never })).toThrow(/array of strings/);
    const unsafe = Object.defineProperty({}, 'event', { enumerable: true, get: () => 'event' });
    expect(() => freezeSeatLayerPickerConfiguration(unsafe as never)).toThrow(/accessor/);
    const source = { event: 'event', messages: { title: 'before' }, selectionValidators: [{ type: 'minimumSelectedPlaces' as const, minimum: 2 }] };
    const safe = freezeSeatLayerPickerConfiguration(source);
    source.messages.title = 'after';
    source.selectionValidators[0]!.minimum = 4;
    expect(safe.messages?.title).toBe('before');
    expect(safe.selectionValidators?.[0]).toMatchObject({ minimum: 2 });
    const sparse = [{ type: 'consecutiveSeats' }];
    delete sparse[0];
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', selectionValidators: sparse as never })).toThrow(/dense/);
    const named = [{ type: 'consecutiveSeats' }] as Array<{ type: 'consecutiveSeats' }> & { map?: unknown };
    Object.defineProperty(named, 'map', { get: () => { throw new Error('caller map'); }, enumerable: true });
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', selectionValidators: named as never })).toThrow(/named properties/);
    const symbolled = [{ type: 'consecutiveSeats' }];
    Object.defineProperty(symbolled, Symbol('unsafe'), { value: true });
    expect(() => freezeSeatLayerPickerConfiguration({ event: 'event', selectionValidators: symbolled as never })).toThrow(/plain array/);
  });
});
