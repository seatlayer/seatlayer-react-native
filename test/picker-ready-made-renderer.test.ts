import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  View: 'View',
  // The picker root reads the platform's Bold Text setting (§4.10); a mock
  // without it takes the whole composition down.
  AccessibilityInfo: {
    isBoldTextEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

let scope: any;
const scopeProps: any[] = [];
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  SeatLayerPickerScope: (props: any) => {
    scopeProps.push(props);
    return React.createElement('picker-scope', props, props.children);
  },
  useSeatLayerPickerScope: () => scope,
}));

vi.mock('../src/picker/SeatLayerPickerCallbackObserver', () => ({
  SeatLayerPickerCallbackObserver: (props: any) => React.createElement('callback-observer', props),
}));

vi.mock('../src/picker/SeatLayerPickerAdaptiveLayout', () => ({
  SeatLayerPickerAdaptiveLayout: (props: any) => React.createElement('adaptive-layout', props),
}));

import { SeatLayerPicker } from '../src/picker/SeatLayerPicker';

function setup() {
  const reports: unknown[] = [];
  const snapshot = { sessionId: 'runtime-1', hold: { active: false } };
  let currentSnapshot = snapshot;
  const controller = {
    getSnapshot: () => currentSnapshot,
    releasePickerOwnedHold: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
  };
  scope = { controller, sessionId: 1, snapshot, reportError: (error: unknown) => { reports.push(error); } };
  scopeProps.length = 0;
  return {
    controller,
    reports,
    snapshot,
    setSnapshot: (next: typeof snapshot) => { currentSnapshot = next; },
  };
}

async function render(props: Record<string, unknown>) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(SeatLayerPicker, {
      configuration: { event: 'event-1' },
      onCheckout: () => undefined,
      ...props,
    }));
  });
  return renderer;
}

function adaptive(renderer: ReturnType<typeof create>) {
  return renderer.root.findByType('adaptive-layout' as any);
}

describe('SeatLayerPicker ready-made embedded composition', () => {
  it('projects only resolved runtime options into one borrowed-controller scope', async () => {
    const runtime = setup();
    const options: any = {
      readOnly: true,
      refreshOnResume: false,
      holdTtlMs: 300,
      chrome: { header: false },
      layout: 'wide',
      haptics: false,
    };
    const style = { backgroundColor: '#fff' };
    const safeAreaInsets = { top: 12, bottom: 7 };
    const renderer = await render({
      controller: runtime.controller,
      options,
      safeAreaInsets,
      style,
      testID: 'ready-picker',
    });
    const provider = scopeProps[scopeProps.length - 1]!;
    expect(provider.controller).toBe(runtime.controller);
    expect(provider.readOnly).toBe(true);
    expect(provider.refreshOnResume).toBe(false);
    expect(provider.bridgeConfig).toEqual({
      holdTtlMs: 300,
      readOnly: true,
      confirmSelection: true,
      enableBestAvailable: true,
      enable3D: true,
      enableSeatView: true,
      hideEventDetails: false,
      panelCollapsed: true,
    });
    expect(provider.bridgeConfig).not.toHaveProperty('chrome');
    expect(provider.bridgeConfig).not.toHaveProperty('layout');
    const layout = adaptive(renderer);
    expect(layout.props.options).toBe(options);
    expect(layout.props.safeAreaInsets).toBe(safeAreaInsets);
    expect(layout.props.style).toBe(style);
    expect(layout.props.onClose).toBeUndefined();
    expect(renderer.root.findAllByType('View' as any).some((node) => node.props.testID === 'ready-picker')).toBe(true);
  });

  it('uses latest observational callbacks without replacing the adaptive chart composition', async () => {
    setup();
    const first = vi.fn();
    const second = vi.fn();
    const firstCheckout = vi.fn();
    const secondCheckout = vi.fn();
    const renderer = await render({ callbacks: { onReady: first }, onCheckout: firstCheckout });
    const firstLayout = adaptive(renderer);
    const stableReady = firstLayout.props.onReady;
    const stableCheckout = firstLayout.props.onCheckout;
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPicker, {
        configuration: { event: 'event-1' },
        onCheckout: secondCheckout,
        callbacks: { onReady: second },
      }));
    });
    const secondLayout = adaptive(renderer);
    expect(secondLayout.props.onReady).toBe(stableReady);
    expect(secondLayout.props.onCheckout).toBe(stableCheckout);
    await act(async () => { secondLayout.props.onReady({ protocol: 2 }); });
    await secondLayout.props.onCheckout({ holdId: 'hold', expiresAt: 1, currency: 'USD', lineItems: [], total: 0 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(firstCheckout).not.toHaveBeenCalled();
    expect(secondCheckout).toHaveBeenCalledOnce();
  });

  it('reports onContinue failures but propagates the required checkout rejection', async () => {
    const runtime = setup();
    const observationalFailure = new Error('continue observer');
    const checkoutFailure = new Error('checkout owner');
    const order: string[] = [];
    const renderer = await render({
      callbacks: { onContinue: () => { order.push('continue'); return Promise.reject(observationalFailure); } },
      onCheckout: () => { order.push('checkout'); return Promise.reject(checkoutFailure); },
    });
    const handoff = { holdId: 'hold-1', expiresAt: 1, currency: 'USD', lineItems: [], total: 0 };
    await expect(adaptive(renderer).props.onCheckout(handoff)).rejects.toBe(checkoutFailure);
    await Promise.resolve();
    expect(order).toEqual(['continue', 'checkout']);
    expect(runtime.reports).toEqual([observationalFailure]);
  });

  it('drops a late shared callback rejection after the scope lease is replaced', async () => {
    const runtime = setup();
    let reject!: (error: Error) => void;
    const renderer = await render({
      callbacks: { onContinue: () => new Promise<void>((_resolve, fail) => { reject = fail; }) },
    });
    const handoff = { holdId: 'hold-1', expiresAt: 1, currency: 'USD', lineItems: [], total: 0 };
    await adaptive(renderer).props.onCheckout(handoff);
    const replacementReports: unknown[] = [];
    const replacementSnapshot = { ...runtime.snapshot, sessionId: 'runtime-2' };
    runtime.setSnapshot(replacementSnapshot);
    scope = {
      ...scope,
      sessionId: 2,
      snapshot: replacementSnapshot,
      reportError: (error: unknown) => { replacementReports.push(error); },
    };
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPicker, {
        configuration: { event: 'event-1' },
        onCheckout: () => undefined,
        callbacks: { onContinue: () => undefined },
      }));
    });
    reject(new Error('late continue observer'));
    await act(async () => { await Promise.resolve(); });
    expect(runtime.reports).toEqual([]);
    expect(replacementReports).toEqual([]);
  });

  it('maps every ready-made action callback once through the adaptive surface', async () => {
    setup();
    const ready = vi.fn();
    const selected = vi.fn();
    const removed = vi.fn();
    const seatView = vi.fn();
    const focused = vi.fn();
    const renderer = await render({
      callbacks: {
        onReady: ready,
        onSeatSelected: selected,
        onSeatRemoved: removed,
        onSeatViewOpened: seatView,
        onSectionFocused: focused,
      },
    });
    const layout = adaptive(renderer);
    const seat = { id: 'seat-1', label: 'A-1' };
    await act(async () => {
      layout.props.onReady({ protocol: 2 });
      layout.props.onSeatSelected(seat);
      layout.props.onSeatRemoved('A-1');
      layout.props.onSeatViewOpened(seat);
      layout.props.onSectionFocused('section-1');
    });
    expect(ready).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledExactlyOnceWith(seat);
    expect(removed).toHaveBeenCalledExactlyOnceWith('A-1');
    expect(seatView).toHaveBeenCalledExactlyOnceWith(seat);
    expect(focused).toHaveBeenCalledExactlyOnceWith('section-1');
  });

  it('dedupes close, emits onClosed before onClose, and drops a stale completion', async () => {
    const runtime = setup();
    let release!: () => void;
    runtime.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const order: string[] = [];
    const renderer = await render({
      callbacks: { onClosed: () => { order.push('closed'); } },
      onClose: () => { order.push('request'); },
    });
    const close = adaptive(renderer).props.onClose;
    expect(typeof close).toBe('function');
    const first = close();
    const second = close();
    expect(second).toBe(first);
    expect(runtime.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    release();
    await first;
    expect(order).toEqual(['closed', 'request']);
    await close();
    expect(runtime.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(order).toEqual(['closed', 'request']);

    const secondSnapshot = { ...runtime.snapshot, sessionId: 'runtime-2' };
    runtime.setSnapshot(secondSnapshot);
    scope = { ...scope, sessionId: 2, snapshot: secondSnapshot };
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPicker, {
        configuration: { event: 'event-1' },
        onCheckout: () => undefined,
        callbacks: { onClosed: () => { order.push('second-closed'); } },
        onClose: () => { order.push('second-request'); },
      }));
    });
    let staleRelease!: () => void;
    runtime.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { staleRelease = resolve; }),
    );
    const stale = adaptive(renderer).props.onClose();
    const thirdSnapshot = { ...runtime.snapshot, sessionId: 'runtime-3' };
    runtime.setSnapshot(thirdSnapshot);
    scope = { ...scope, sessionId: 3, snapshot: thirdSnapshot };
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPicker, {
        configuration: { event: 'event-1' },
        onCheckout: () => undefined,
        callbacks: { onClosed: () => { order.push('stale-closed'); } },
        onClose: () => { order.push('stale-request'); },
      }));
    });
    staleRelease();
    await stale;
    expect(order).toEqual(['closed', 'request']);
    await adaptive(renderer).props.onClose();
    expect(order).toEqual(['closed', 'request', 'stale-closed', 'stale-request']);
  });

  it('does not repeat a successful close notification after onClose rejects', async () => {
    const runtime = setup();
    const requestFailure = new Error('close owner');
    const closed = vi.fn();
    const requestClose = vi.fn<() => Promise<void>>().mockRejectedValue(requestFailure);
    const renderer = await render({
      callbacks: { onClosed: closed },
      onClose: requestClose,
    });
    const close = adaptive(renderer).props.onClose;
    await close();
    await close();
    expect(runtime.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    expect(requestClose).toHaveBeenCalledOnce();
    expect(runtime.reports).toEqual([requestFailure]);
  });
});
