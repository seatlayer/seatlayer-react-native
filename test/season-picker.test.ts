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

import { SeatLayerSeasonController } from '../src/season/controller';
import { seatLayerSeasonPageUrl } from '../src/season/configuration';
import {
  SeatLayerSeasonPicker,
  SeatLayerSeasonPickerModal,
} from '../src/season/SeatLayerSeasonPicker';

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
    page().props.onMessage({ nativeEvent: { url: seatLayerSeasonPageUrl, data: JSON.stringify({ sl: 1, ...message }) } });
  });
}

async function evt(type: string, payload?: unknown): Promise<void> {
  sequence += 1;
  await send({ k: 'evt', t: type, n: sequence, p: payload });
}

async function boot(): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(1); });
  await send({
    k: 'hello', t: 'hello',
    p: {
      protocol: { min: 2, max: 2 },
      capabilities: ['season-surface-v1', 'season-app-shell-v1'],
      commands: ['season.requestClose', 'season.setViewportInsets'],
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

const handoff = (operationId = 'sop_1') => ({
  seasonKey: 'sea_1', planActivationId: 'pa_1', operationId, holdId: 'h_1', expiresAt: Date.now() + 300_000,
});

async function mount(element: React.ReactElement): Promise<void> {
  await act(async () => { renderer = create(element); });
}

describe('SeatLayerSeasonPicker', () => {
  it('opens the Season page under the event header with its name, clock and ✕', async () => {
    const onContinue = vi.fn();
    const onClose = vi.fn();
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1', publicKey: 'pk_test' },
      onContinue,
      onClose,
    }));
    expect(page().props.source).toEqual({ uri: seatLayerSeasonPageUrl });
    expect(texts()).toContain('Choose your seats');
    await boot();
    expect(frames()[0]).toMatchObject({
      k: 'init',
      p: {
        surface: { kind: 'season' },
        config: { publicKey: 'pk_test', season: 'sea_1', theme: 'light', appBar: true },
      },
    });
    await evt('season.status', { kind: 'ready', season: { name: 'Season 2027' }, branding: { brandName: 'Riverside' } });
    expect(texts()).toContain('Season 2027');
    expect(texts()).toContain('R');
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(0);
    await evt('season.hold', { handoff: handoff() });
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(1);
    await evt('season.continue', { handoff: handoff() });
    await evt('season.continue', { handoff: handoff() });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0]![0]).toMatchObject({ operationId: 'sop_1' });
  });

  it('asks the page on ✕ and tells the app how it ended', async () => {
    const onClose = vi.fn();
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' }, onContinue: () => undefined, onClose,
    }));
    await boot();
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-header-close' }).props.onPress(); });
    expect(frames()[frames().length - 1]).toMatchObject({ k: 'cmd', t: 'season.requestClose' });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await answerLast({ outcome: 'stayed' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-header-close' }).props.onPress(); });
    await answerLast({ outcome: 'kept', operationId: 'sop_1' });
    expect(onClose).toHaveBeenCalledWith('kept', 'sop_1');
  });

  it('with no page up, keeps a held hold and closes an empty one', async () => {
    const onClose = vi.fn();
    const ref = React.createRef<{ requestClose(): Promise<void> }>();
    await mount(React.createElement(SeatLayerSeasonPicker, {
      ref, configuration: { season: 'sea_1' }, onContinue: () => undefined, onClose,
    }));
    await act(async () => { await ref.current!.requestClose(); });
    expect(onClose).toHaveBeenLastCalledWith('closed', undefined);
    await boot();
    await evt('season.hold', { handoff: handoff('sop_held') });
    await act(async () => { page().props.onContentProcessDidTerminate(); });
    appState.currentState = 'background';
    await act(async () => { await ref.current!.requestClose(); });
    expect(onClose).toHaveBeenLastCalledWith('kept', 'sop_held');
  });

  it('opens a lost page again on the same hold, and stops after pages keep being lost', async () => {
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1', initialOperationId: 'sop_first' }, onContinue: () => undefined,
    }));
    await boot();
    expect(frames()[0]!.p!.config).toMatchObject({ initialOperationId: 'sop_first' });
    await evt('season.hold', { handoff: handoff('sop_now') });
    await act(async () => { page().props.onContentProcessDidTerminate(); });
    await boot();
    expect(pages.frames).toHaveLength(2);
    expect(frames()[0]!.p!.config).toMatchObject({ initialOperationId: 'sop_now' });
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(0);

    await act(async () => { page().props.onRenderProcessGone(); });
    await boot();
    await act(async () => { page().props.onRenderProcessGone(); });
    expect(webViews()).toHaveLength(0);
    expect(texts()).toContain('The seat map didn’t load');
    const retry = renderer.root.findAll((node) => node.props.accessibilityLabel === 'Try again' && typeof node.props.onPress === 'function')[0]!;
    await act(async () => { retry.props.onPress(); });
    expect(webViews()).toHaveLength(1);
  });

  it('waits for the buyer to come back before opening a page lost in the background', async () => {
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' }, onContinue: () => undefined,
    }));
    await boot();
    appState.currentState = 'background';
    await act(async () => { page().props.onContentProcessDidTerminate(); });
    expect(pages.frames).toHaveLength(1);
    appState.currentState = 'active';
    await act(async () => { for (const listener of [...appState.listeners]) listener('active'); });
    expect(pages.frames).toHaveLength(2);
  });

  it('shows the event picker failure view for a Season that cannot open, with Try again', async () => {
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' }, onContinue: () => undefined,
    }));
    await act(async () => { vi.advanceTimersByTime(1); });
    await send({
      k: 'hello', t: 'hello',
      p: { protocol: { min: 2, max: 2 }, capabilities: ['season-surface-v1', 'season-app-shell-v1'], commands: [], events: [] },
    });
    await evt('sys.error', { code: 'not_found', message: 'Season not found' });
    expect(webViews()).toHaveLength(0);
    expect(texts()).toContain('The seat map didn’t load');
    expect(texts()).not.toContain('Season not found');
  });

  it('repaints the page in place when the side changes, and tells it the bottom inset', async () => {
    const element = (mode: 'light' | 'dark') => React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' },
      onContinue: () => undefined,
      themeMode: mode,
      safeAreaInsets: { top: 47, bottom: 34, left: 0, right: 0 },
    });
    await mount(element('light'));
    await boot();
    expect(frames().filter((frame) => frame.t === 'season.setViewportInsets')).toEqual([
      expect.objectContaining({ p: { top: 0, right: 0, bottom: 34, left: 0 } }),
    ]);
    await act(async () => { renderer.update(element('dark')); });
    expect(frames().filter((frame) => frame.t === 'season.setThemeMode')).toEqual([
      expect.objectContaining({ p: { mode: 'dark' } }),
    ]);
    expect(pages.frames).toHaveLength(1);
  });

  it('tells the page when the app goes to the background and comes back', async () => {
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' }, onContinue: () => undefined,
    }));
    await boot();
    await act(async () => { for (const listener of [...appState.listeners]) listener('background'); });
    expect(frames()[frames().length - 1]).toMatchObject({ t: 'season.lifecycle', p: { state: 'background' } });
  });

  it('uses the controller it is given and reports its booked hold', async () => {
    const controller = new SeatLayerSeasonController();
    const onBooked = vi.fn();
    await mount(React.createElement(SeatLayerSeasonPicker, {
      configuration: { season: 'sea_1' }, onContinue: () => undefined, controller, onBooked,
    }));
    await boot();
    expect(controller.isReady).toBe(true);
    await evt('season.hold', { handoff: handoff() });
    await evt('season.status', { kind: 'booked', operationId: 'sop_1' });
    expect(onBooked).toHaveBeenCalledTimes(1);
  });
});

describe('SeatLayerSeasonPickerModal', () => {
  it('sends system Back to the page', async () => {
    const onClose = vi.fn();
    await mount(React.createElement(SeatLayerSeasonPickerModal, {
      visible: true, configuration: { season: 'sea_1' }, onContinue: () => undefined, onClose,
    }));
    await boot();
    await act(async () => { renderer.root.findByType('Modal' as never).props.onRequestClose(); });
    expect(frames()[frames().length - 1]).toMatchObject({ t: 'season.requestClose' });
    await answerLast({ outcome: 'released' });
    expect(onClose).toHaveBeenCalledWith('released', undefined);
  });
});
