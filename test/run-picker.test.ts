import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appState = vi.hoisted(() => ({
  currentState: 'active' as string,
  listeners: new Set<(state: string) => void>(),
}));
let scheme: 'light' | 'dark' = 'light';
let screen = { width: 390, height: 844 };

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    isBoldTextEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
  },
  ActivityIndicator: 'ActivityIndicator',
  Animated: {
    Value: class { setValue() {} stopAnimation() {} },
    View: 'Animated.View',
    loop: () => ({ start() {}, stop() {} }),
    sequence: () => ({}),
    timing: () => ({}),
  },
  AppState: {
    get currentState() { return appState.currentState; },
    addEventListener: (_: string, listener: (state: string) => void) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
  Easing: { bezier: () => () => 0 },
  I18nManager: { isRTL: false },
  Image: 'Image',
  Modal: 'Modal',
  Platform: { OS: 'ios', select: (value: Record<string, unknown>) => value.ios ?? value.default },
  Pressable: 'Pressable',
  SafeAreaView: 'SafeAreaView',
  StyleSheet: { create: <T>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View',
  useColorScheme: () => scheme,
  useWindowDimensions: () => screen,
}));

const pages = vi.hoisted(() => ({ frames: [] as unknown[][] }));
vi.mock('react-native-webview', async () => {
  const ReactModule = await import('react');
  const WebView = ReactModule.forwardRef((props: Record<string, unknown>, ref) => {
    const frames = ReactModule.useMemo(() => {
      const list: unknown[] = [];
      pages.frames.push(list);
      return list;
    }, []);
    ReactModule.useImperativeHandle(ref, () => ({
      injectJavaScript(script: string) {
        const literal = /recv\((.*)\); true;$/.exec(script)?.[1];
        if (literal) frames.push(JSON.parse(JSON.parse(literal)));
      },
    }));
    return ReactModule.createElement('WebView', props);
  });
  return { WebView };
});

import { SeatLayerRunController } from '../src/run/controller';
import { seatLayerRunPageUrl } from '../src/run/configuration';
import { SeatLayerRunPicker, SeatLayerRunPickerModal } from '../src/run/SeatLayerRunPicker';
import { SeatLayerPageView } from '../src/surface/PageView';

type Frame = { k: string; t: string; id?: string; p?: Record<string, unknown> };

let renderer: ReactTestRenderer;
let sequence = 0;

beforeEach(() => {
  vi.useFakeTimers();
  pages.frames.length = 0;
  appState.currentState = 'active';
  appState.listeners.clear();
  scheme = 'light';
  screen = { width: 390, height: 844 };
});

afterEach(() => {
  act(() => renderer?.unmount());
  vi.useRealTimers();
});

function webViews(): ReactTestInstance[] {
  return renderer.root.findAllByType('WebView' as never);
}

function page(): ReactTestInstance {
  const views = webViews();
  expect(views).toHaveLength(1);
  return views[0]!;
}

function frames(): Frame[] {
  return pages.frames[pages.frames.length - 1] as Frame[];
}

async function send(message: Record<string, unknown>): Promise<void> {
  await act(async () => {
    page().props.onMessage({ nativeEvent: { url: seatLayerRunPageUrl, data: JSON.stringify({ sl: 1, ...message }) } });
  });
}

async function evt(type: string, payload?: unknown): Promise<void> {
  sequence += 1;
  await send({ k: 'evt', t: type, n: sequence, p: payload });
}

async function boot(commands: string[] = ['group.setViewportInsets']): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(1); });
  await send({
    k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: ['group-surface-v1', 'group-app-shell-v1'],
      commands,
      events: [],
    },
  });
  await evt('sys.ready', { protocol: 2 });
}

async function answerLast(payload: unknown): Promise<void> {
  const command = frames()[frames().length - 1]!;
  await send({ k: 'res', t: command.t, id: command.id, p: payload });
}

const texts = () => renderer.root.findAllByType('Text' as never).map((node) => node.props.children);
const pills = () => renderer.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' });
const commandsSent = (name: string) => frames().filter((frame) => frame.k === 'cmd' && frame.t === name);

const handoff = (operationId = 'pghop_1', holdId = 'pgh_1') => ({
  operationId, holdId, expiresAt: Date.now() + 300_000, performanceKeys: ['ev_1'], seatLabels: ['A-1'],
});

async function mount(element: React.ReactElement): Promise<void> {
  await act(async () => { renderer = create(element); });
}

function band(): Record<string, unknown> {
  return renderer.root.findByType(SeatLayerPageView as never).parent!.props.style as Record<string, unknown>;
}

function ground(testID: string): unknown {
  const root = renderer.root.find((node) => (node.type as unknown) === 'View' && node.props.testID === testID);
  return (root.props.style as Record<string, unknown>[])[0]!.backgroundColor;
}

describe('SeatLayerRunPicker', () => {
  it('opens the run page under the event header with its name, clock and ✕', async () => {
    const onContinue = vi.fn();
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue, onClose: () => undefined,
    }));
    expect(page().props.source).toEqual({ uri: seatLayerRunPageUrl });
    expect(texts()).toContain('Choose your seats');
    await boot();
    expect(frames()[0]).toMatchObject({
      k: 'init',
      p: {
        surface: { kind: 'group' },
        config: { performanceGroup: 'pg_1', theme: 'light', header: false, appBar: true, checkout: 'handoff' },
      },
    });
    await evt('group.ready', { performanceGroup: { key: 'pg_1', name: 'Ring cycle', performances: [] } });
    expect(texts()).toContain('Ring cycle');
    expect(texts()).toContain('R');
    expect(pills()).toHaveLength(0);
    await evt('group.hold', { handoff: handoff() });
    expect(pills()).toHaveLength(1);
    await evt('group.checkout', { handoff: handoff() });
    await evt('group.checkout', { handoff: handoff() });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0]![0]).toMatchObject({ operationId: 'pghop_1', seatLabels: ['A-1'] });
  });

  it('on ✕ releases seats not handed off and closes, without asking the page', async () => {
    const onClose = vi.fn();
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined, onClose,
    }));
    await boot();
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-header-close' }).props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-header-close' }).props.onPress(); });
    expect(commandsSent('group.destroy')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    await answerLast({});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once with no page up', async () => {
    const onClose = vi.fn();
    const ref = React.createRef<{ requestClose(): Promise<void> }>();
    await mount(React.createElement(SeatLayerRunPicker, {
      ref, configuration: { run: 'pg_1' }, onContinue: () => undefined, onClose,
    }));
    await act(async () => { await ref.current!.requestClose(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the side it opened on, with no reload', async () => {
    const element = (mode: 'light' | 'dark') => React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined, themeMode: mode, testID: 'run',
    });
    await mount(element('light'));
    await boot();
    const light = ground('run');
    await act(async () => { renderer.update(element('dark')); });
    expect(pages.frames).toHaveLength(1);
    expect(frames().some((frame) => frame.t.endsWith('setThemeMode'))).toBe(false);
    expect(ground('run')).toBe(light);
    act(() => renderer.unmount());
    await mount(element('dark'));
    expect(ground('run')).not.toBe(light);
  });

  it('tells a page that takes the bottom inset, and keeps a band for one that does not', async () => {
    const insets = { top: 47, bottom: 34, left: 0, right: 0 };
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined, safeAreaInsets: insets,
    }));
    await boot();
    expect(commandsSent('group.setViewportInsets')).toEqual([
      expect.objectContaining({ p: { top: 0, right: 0, bottom: 34, left: 0 } }),
    ]);
    expect(band()).toMatchObject({ paddingBottom: 0 });
    act(() => renderer.unmount());

    pages.frames.length = 0;
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined, safeAreaInsets: insets,
    }));
    await boot([]);
    expect(commandsSent('group.setViewportInsets')).toHaveLength(0);
    expect(band()).toMatchObject({ paddingBottom: 34 });
  });

  it('reads the hold it opens on, so the bar shows its clock', async () => {
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1', initialHoldId: 'pgh_kept', initialOperationId: 'pghop_kept' },
      onContinue: () => undefined,
    }));
    await boot([]);
    expect(frames()[0]!.p!.config).toMatchObject({ initialHoldId: 'pgh_kept', initialOperationId: 'pghop_kept' });
    expect(commandsSent('group.getHeldOrder')).toHaveLength(1);
    await answerLast({ heldOrder: handoff('pghop_kept', 'pgh_kept') });
    expect(pills()).toHaveLength(1);
  });

  it('opens a lost page again on the same hold', async () => {
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined,
    }));
    await boot();
    await evt('group.hold', { handoff: handoff('pghop_now', 'pgh_now') });
    await act(async () => { page().props.onContentProcessDidTerminate(); });
    await boot();
    expect(pages.frames).toHaveLength(2);
    expect(frames()[0]!.p!.config).toMatchObject({ initialHoldId: 'pgh_now', initialOperationId: 'pghop_now' });
    expect(commandsSent('group.getHeldOrder')).toHaveLength(1);
  });

  it('uses the controller it is given and reports its booked hold', async () => {
    const controller = new SeatLayerRunController();
    const onBooked = vi.fn();
    await mount(React.createElement(SeatLayerRunPicker, {
      configuration: { run: 'pg_1' }, onContinue: () => undefined, controller, onBooked,
    }));
    await boot();
    expect(controller.isReady).toBe(true);
    await evt('group.booked', { handoff: { ...handoff(), bookingState: 'booked' } });
    expect(onBooked).toHaveBeenCalledTimes(1);
  });
});

describe('SeatLayerRunPickerModal', () => {
  it('sends system Back to the close, on a frame that keeps the side it opened on', async () => {
    const onClose = vi.fn();
    const element = () => React.createElement(SeatLayerRunPickerModal, {
      visible: true, configuration: { run: 'pg_1' }, onContinue: () => undefined, onClose,
    });
    await mount(element());
    await boot();
    const frame = () => renderer.root.findByType('SafeAreaView' as never).props.style;
    const light = frame();
    scheme = 'dark';
    await act(async () => { renderer.update(element()); });
    expect(frame()).toEqual(light);
    await act(async () => { renderer.root.findByType('Modal' as never).props.onRequestClose(); });
    expect(commandsSent('group.destroy')).toHaveLength(1);
    await answerLast({});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
