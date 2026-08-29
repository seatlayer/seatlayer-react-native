import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  SafeAreaView: 'SafeAreaView',
  View: 'View',
  useWindowDimensions: () => ({ width: 700, height: 900 }),
}));

let scope: any;
let scopeMounts = 0;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  SeatLayerPickerScope: ({ children }: any) => {
    const mount = React.useState(() => ++scopeMounts)[0];
    return React.createElement('picker-scope', { mount }, children);
  },
  SeatLayerPickerScopeReprovider: ({ children }: any) => {
    return React.createElement('scope-reprovider', undefined, children);
  },
  useSeatLayerPickerScope: () => scope,
}));
vi.mock('../src/picker/SeatLayerPickerCallbackObserver', () => ({
  SeatLayerPickerCallbackObserver: () => React.createElement('observer'),
}));
vi.mock('../src/picker/SeatLayerPickerAdaptiveLayout', () => ({
  SeatLayerPickerAdaptiveLayout: (value: any) => React.createElement('adaptive', value),
}));

import { SeatLayerPickerModal } from '../src/picker/SeatLayerPickerModal';

type Controller = ReturnType<typeof setup>['controller'];

function setup(runtimeSessionId = 'modal') {
  const snapshot = { sessionId: runtimeSessionId, hold: { active: false } };
  const controller = {
    getSnapshot: () => snapshot,
    releasePickerOwnedHold: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  scope = {
    controller,
    snapshot,
    sessionId: 1,
    reportError: vi.fn(),
    canHandleBack: () => false,
    back: vi.fn(),
    resolvedTheme: { colors: { surface: '#ffffff' }, radii: { card: 18 } },
    strings: { translate: () => 'Close' },
  };
  scopeMounts = 0;
  return { controller, snapshot };
}

function modalProps(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    configuration: { event: 'event' },
    onCheckout: () => undefined,
    onRequestClose: () => undefined,
    ...overrides,
  };
}

async function render(overrides: Record<string, unknown> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(SeatLayerPickerModal, modalProps(overrides)));
  });
  return renderer;
}

function adaptive(renderer: ReactTestRenderer) {
  return renderer.root.findByType('adaptive' as any);
}

function modal(renderer: ReactTestRenderer) {
  return renderer.root.findByType('Modal' as any);
}

async function update(renderer: ReactTestRenderer, overrides: Record<string, unknown> = {}) {
  await act(async () => {
    renderer.update(React.createElement(SeatLayerPickerModal, modalProps(overrides)));
  });
}

describe('picker modal renderer', () => {
  it('constructs no scope or controller tree for an initially invisible controlled modal', async () => {
    setup();
    const renderer = await render({ visible: false });
    expect(renderer.toJSON()).toBeNull();
    expect(scopeMounts).toBe(0);
  });

  it('reprovides the current scope once and uses dialog geometry and native system props', async () => {
    setup();
    const safeAreaInsets = { top: 41, right: 17, bottom: 3, left: 29 };
    const rawOptions = { chrome: { systemBars: true } } as any;
    const renderer = await render({ safeAreaInsets, options: rawOptions, testID: 'modal-root' });
    const nativeModal = modal(renderer);
    expect(renderer.root.findAllByType('picker-scope' as any)).toHaveLength(1);
    expect(renderer.root.findAllByType('observer' as any)).toHaveLength(1);
    expect(renderer.root.findAllByType('scope-reprovider' as any)).toHaveLength(1);
    expect(nativeModal.props).toMatchObject({
      visible: true,
      transparent: true,
      animationType: 'fade',
      presentationStyle: 'overFullScreen',
      statusBarTranslucent: true,
    });
    // These props were added after the package's React Native 0.72 floor.
    expect(nativeModal.props).not.toHaveProperty('navigationBarTranslucent');
    expect(nativeModal.props).not.toHaveProperty('allowSwipeDismissal');
    expect(adaptive(renderer).props.options).toBe(rawOptions);
    expect(adaptive(renderer).props.safeAreaInsets).toBe(safeAreaInsets);
    expect(adaptive(renderer).props.presentationActive).toBe(true);
    const barrier = renderer.root.findByProps({ testID: 'seatlayer-modal-barrier' });
    expect(barrier.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      onPress: undefined,
    });
    expect(barrier.props.style).toMatchObject({
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#0000008A',
    });
    const card = renderer.root.findByProps({ testID: 'seatlayer-modal-card' });
    expect(card.props.pointerEvents).toBe('auto');
    expect(barrier.findAllByProps({ testID: 'seatlayer-modal-card' })).toHaveLength(0);
    expect(card.parent?.parent).toBe(barrier.parent);
    expect(card.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ maxWidth: 1180, maxHeight: 820, overflow: 'hidden' }),
      expect.objectContaining({ borderRadius: 18, backgroundColor: '#ffffff' }),
    ]));
  });

  it('uses the local back ladder before every exact host close reason', async () => {
    const { controller } = setup();
    scope.canHandleBack = () => true;
    const requestClose = vi.fn();
    const renderer = await render({ onRequestClose: requestClose, barrierDismissible: true });
    await act(async () => { await modal(renderer).props.onRequestClose(); });
    expect(scope.back).toHaveBeenCalledOnce();
    expect(controller.releasePickerOwnedHold).not.toHaveBeenCalled();
    scope.canHandleBack = () => false;
    await act(async () => { await modal(renderer).props.onRequestClose(); });
    await act(async () => { await renderer.root.findByProps({ testID: 'seatlayer-modal-barrier' }).props.onPress(); });
    await act(async () => { await adaptive(renderer).props.onClose(); });
    expect(requestClose).toHaveBeenCalledExactlyOnceWith('systemBack');
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();

    for (const reason of ['barrier', 'closeButton'] as const) {
      const runtime = setup();
      const host = vi.fn();
      const next = await render({ onRequestClose: host, barrierDismissible: true });
      if (reason === 'barrier') {
        await act(async () => { await next.root.findByProps({ testID: 'seatlayer-modal-barrier' }).props.onPress(); });
      } else {
        await act(async () => { await adaptive(next).props.onClose(); });
      }
      expect(runtime.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
      expect(host).toHaveBeenCalledExactlyOnceWith(reason);
    }
  });

  it('single-flights simultaneous closes and invokes release, onClosed, then the host once', async () => {
    const { controller } = setup();
    let release!: () => void;
    controller.releasePickerOwnedHold.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const order: string[] = [];
    const renderer = await render({
      callbacks: { onClosed: () => { order.push('closed'); } },
      onRequestClose: () => { order.push('host'); },
    });
    const first = adaptive(renderer).props.onClose();
    const second = adaptive(renderer).props.onClose();
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(order).toEqual([]);
    release();
    await act(async () => { await Promise.all([first, second]); });
    expect(order).toEqual(['closed', 'host']);
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
  });

  it('reports one host rejection without retrying a completed close', async () => {
    const { controller } = setup();
    const failure = new Error('host close failed');
    const host = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const closed = vi.fn();
    const renderer = await render({ callbacks: { onClosed: closed }, onRequestClose: host });
    await act(async () => { await adaptive(renderer).props.onClose(); await Promise.resolve(); });
    await act(async () => { await adaptive(renderer).props.onClose(); await Promise.resolve(); });
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledExactlyOnceWith('closeButton');
    expect(host).toHaveBeenCalledOnce();
    expect(scope.reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('programmatically closes without a host echo and immediately surrenders system bars', async () => {
    const { controller } = setup();
    let release!: () => void;
    controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const closed = vi.fn();
    const host = vi.fn();
    const renderer = await render({ callbacks: { onClosed: closed }, onRequestClose: host });
    await update(renderer, { visible: false, callbacks: { onClosed: closed }, onRequestClose: host });
    expect(adaptive(renderer).props.presentationActive).toBe(false);
    release();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledExactlyOnceWith('programmatic');
    expect(host).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
  });

  it('does not double-release or double-notify when a user close is followed by visible=false', async () => {
    const { controller } = setup();
    let release!: () => void;
    controller.releasePickerOwnedHold.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const closed = vi.fn();
    const host = vi.fn();
    const renderer = await render({ callbacks: { onClosed: closed }, onRequestClose: host });
    const close = adaptive(renderer).props.onClose();
    await update(renderer, { visible: false, callbacks: { onClosed: closed }, onRequestClose: host });
    release();
    await act(async () => { await close; await Promise.resolve(); });
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledExactlyOnceWith('closeButton');
    expect(host).toHaveBeenCalledExactlyOnceWith('closeButton');
  });

  it('quarantines a false-to-true request until a fresh keyed scope replaces old cleanup', async () => {
    const { controller } = setup();
    let release!: () => void;
    controller.releasePickerOwnedHold.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const renderer = await render();
    const firstMount = renderer.root.findByType('picker-scope' as any).props.mount;
    await update(renderer, { visible: false });
    await update(renderer, { visible: true });
    expect(modal(renderer).props.visible).toBe(false);
    expect(renderer.root.findByType('picker-scope' as any).props.mount).toBe(firstMount);
    release();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(modal(renderer).props.visible).toBe(true);
    expect(renderer.root.findByType('picker-scope' as any).props.mount).not.toBe(firstMount);
    expect(controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
  });

  it('keeps a hidden replacement mounted while an old programmatic cleanup settles', async () => {
    const first = setup('one');
    let firstRelease!: () => void;
    first.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { firstRelease = resolve; }),
    );
    const renderer = await render();
    await update(renderer, { visible: false, controller: first.controller });
    expect(first.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();

    const replacement = setup('two');
    let replacementRelease!: () => void;
    replacement.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { replacementRelease = resolve; }),
    );
    await update(renderer, { visible: false, controller: replacement.controller });
    expect(replacement.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();

    firstRelease();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.toJSON()).not.toBeNull();
    expect(replacement.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();

    replacementRelease();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.toJSON()).toBeNull();
  });

  it('restarts hidden cleanup after lease replacement and ignores old completion and host failure', async () => {
    const first = setup('one');
    let firstRelease!: () => void;
    first.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { firstRelease = resolve; }),
    );
    let rejectHost!: (error: Error) => void;
    const renderer = await render({ onRequestClose: () => new Promise<void>((_resolve, reject) => { rejectHost = reject; }) });
    const firstClose = adaptive(renderer).props.onClose();
    firstRelease();
    await act(async () => { await firstClose; });
    const replacement = setup('two');
    let replacementRelease!: () => void;
    replacement.controller.releasePickerOwnedHold.mockImplementationOnce(
      () => new Promise<void>((resolve) => { replacementRelease = resolve; }),
    );
    await update(renderer, { visible: false, controller: replacement.controller });
    expect(replacement.controller.releasePickerOwnedHold).toHaveBeenCalledOnce();
    firstRelease();
    rejectHost(new Error('old host failure'));
    await act(async () => { await Promise.resolve(); });
    expect(scope.reportError).not.toHaveBeenCalled();
    expect(renderer.toJSON()).not.toBeNull();
    replacementRelease();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.toJSON()).toBeNull();
  });

  it('forwards latest raw options and checkout ownership; checkout rejection keeps the controlled modal open', async () => {
    setup();
    const firstOptions = { readOnly: false } as any;
    const secondOptions = { readOnly: true, chrome: { systemBars: false } } as any;
    const firstCheckout = vi.fn();
    const rejection = new Error('checkout failed');
    const order: string[] = [];
    const renderer = await render({
      options: firstOptions,
      onCheckout: firstCheckout,
      callbacks: { onContinue: () => { order.push('continue'); } },
    });
    const stableCheckout = adaptive(renderer).props.onCheckout;
    await update(renderer, {
      options: secondOptions,
      onCheckout: () => { order.push('checkout'); return Promise.reject(rejection); },
      callbacks: { onContinue: () => { order.push('continue'); } },
    });
    expect(adaptive(renderer).props.options).toBe(secondOptions);
    expect(adaptive(renderer).props.onCheckout).toBe(stableCheckout);
    const handoff = { holdId: 'hold', expiresAt: 1, currency: 'USD', lineItems: [], total: 0 };
    await expect(adaptive(renderer).props.onCheckout(handoff)).rejects.toBe(rejection);
    expect(order).toEqual(['continue', 'checkout']);
    expect(firstCheckout).not.toHaveBeenCalled();
    expect(modal(renderer).props.visible).toBe(true);
  });

  it('uses slide full-screen presentation without a dialog barrier', async () => {
    setup();
    const renderer = await render({ presentation: 'fullScreen' });
    expect(modal(renderer).props).toMatchObject({
      transparent: false,
      animationType: 'slide',
      presentationStyle: 'fullScreen',
      statusBarTranslucent: false,
    });
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-modal-barrier' })).toHaveLength(0);
    expect(renderer.root.findAllByType('SafeAreaView' as any)).toHaveLength(1);
  });
});
