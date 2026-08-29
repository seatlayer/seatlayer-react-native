import { describe, expect, it, vi } from 'vitest';

import { SeatLayerPickerCloseLifecycle } from '../src/picker/closeLifecycle';

type Snapshot = { readonly sessionId: string; readonly hold: { readonly active: boolean; readonly owner?: string } };

function setup(snapshot: Snapshot) {
  let currentSnapshot: Snapshot | undefined = snapshot;
  const releasePickerOwnedHold = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const controller = { getSnapshot: () => currentSnapshot, releasePickerOwnedHold } as any;
  let scope: any = { controller, sessionId: 1, snapshot: currentSnapshot, reportError: vi.fn() };
  let callbacks: any;
  const lifecycle = new SeatLayerPickerCloseLifecycle({ getScope: () => scope, getCallbacks: () => callbacks });
  return {
    lifecycle, releasePickerOwnedHold, errors: () => scope.reportError, closed: (value: unknown) => { callbacks = { onClosed: value }; },
    replaceController: () => { scope = { ...scope, controller: { getSnapshot: () => currentSnapshot, releasePickerOwnedHold: vi.fn() } }; },
    replaceScope: () => { scope = { ...scope, sessionId: scope.sessionId + 1 }; },
    replaceRuntime: () => { currentSnapshot = { ...snapshot, sessionId: 'runtime-next' }; scope = { ...scope, snapshot: currentSnapshot }; },
  };
}

describe('SeatLayerPickerCloseLifecycle', () => {
  it('dedupes concurrent picker-owned close requests and emits the first reason once', async () => {
    let release!: () => void;
    const runtime = setup({ sessionId: 'runtime', hold: { active: true, owner: 'picker' } });
    runtime.releasePickerOwnedHold.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const closed = vi.fn(); runtime.closed(closed);
    const first = runtime.lifecycle.request('closeButton');
    const second = runtime.lifecycle.request('systemBack');
    expect(second).toBe(first);
    expect(runtime.releasePickerOwnedHold).toHaveBeenCalledOnce();
    release();
    await expect(first).resolves.toBe(true);
    expect(closed).toHaveBeenCalledExactlyOnceWith('closeButton');
  });

  it('uses the atomic release operation for host-owned and inactive holds', async () => {
    for (const hold of [{ active: true, owner: 'host' }, { active: false }] as const) {
      const runtime = setup({ sessionId: 'runtime', hold });
      const closed = vi.fn(); runtime.closed(closed);
      await expect(runtime.lifecycle.request('barrier')).resolves.toBe(true);
      expect(runtime.releasePickerOwnedHold).toHaveBeenCalledOnce();
      expect(closed).toHaveBeenCalledExactlyOnceWith('barrier');
    }
  });

  it('reports an atomic release failure to its current lease without closing it', async () => {
    const runtime = setup({ sessionId: 'runtime', hold: { active: true, owner: 'picker' } });
    const failure = new Error('abort failed'); runtime.releasePickerOwnedHold.mockRejectedValueOnce(failure);
    const closed = vi.fn(); runtime.closed(closed);
    await expect(runtime.lifecycle.request('systemBack')).resolves.toBe(false);
    expect(runtime.errors()).toHaveBeenCalledExactlyOnceWith(failure);
    expect(closed).not.toHaveBeenCalled();
  });

  it('quarantines late atomic release completion after controller, scope, runtime, or explicit retirement', async () => {
    for (const replace of ['controller', 'scope', 'runtime', 'retire'] as const) {
      let release!: () => void;
      const runtime = setup({ sessionId: 'runtime', hold: { active: true, owner: 'picker' } });
      runtime.releasePickerOwnedHold.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
      const closed = vi.fn(); runtime.closed(closed);
      const request = runtime.lifecycle.request('closeButton');
      if (replace === 'controller') runtime.replaceController();
      if (replace === 'scope') runtime.replaceScope();
      if (replace === 'runtime') runtime.replaceRuntime();
      if (replace === 'retire') runtime.lifecycle.retire();
      release();
      await expect(request).resolves.toBe(false);
      expect(closed).not.toHaveBeenCalled();
      expect(runtime.errors()).not.toHaveBeenCalled();
    }
  });

  it('contains closed callback throw/rejection and permits one close in each reset epoch', async () => {
    const runtime = setup({ sessionId: 'runtime', hold: { active: false } });
    const failure = new Error('observer');
    runtime.closed(() => Promise.reject(failure));
    await expect(runtime.lifecycle.request('programmatic')).resolves.toBe(true);
    await Promise.resolve();
    expect(runtime.errors()).toHaveBeenCalledExactlyOnceWith(failure);

    runtime.lifecycle.retire();
    await expect(runtime.lifecycle.request('closeButton')).resolves.toBe(false);
    runtime.lifecycle.reset();
    const synchronous = new Error('synchronous observer');
    runtime.closed(() => { throw synchronous; });
    await expect(runtime.lifecycle.request('closeButton')).resolves.toBe(true);
    expect(runtime.errors()).toHaveBeenLastCalledWith(synchronous);

    runtime.lifecycle.reset();
    const closed = vi.fn(); runtime.closed(closed);
    await expect(runtime.lifecycle.request('closeButton')).resolves.toBe(true);
    await expect(runtime.lifecycle.request('closeButton')).resolves.toBe(true);
    expect(closed).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenLastCalledWith('closeButton');
  });

  it('contains a late rejected close observer after its scope lease is replaced', async () => {
    let reject!: (error: Error) => void;
    const runtime = setup({ sessionId: 'runtime', hold: { active: false } });
    runtime.closed(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
    await expect(runtime.lifecycle.request('programmatic')).resolves.toBe(true);
    runtime.replaceScope();
    reject(new Error('late observer'));
    await Promise.resolve();
    expect(runtime.errors()).not.toHaveBeenCalled();
  });
});
