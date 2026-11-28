import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appState = vi.hoisted(() => ({ currentState: 'active' as string, listeners: new Set<(state: string) => void>() }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFill: {} },
  PixelRatio: { getFontScale: () => 1 },
  AccessibilityInfo: { announceForAccessibility: () => {}, addEventListener: () => ({ remove: () => {} }), isReduceMotionEnabled: async () => false },
  Animated: { Value: class {}, View: 'AnimatedView' }, Easing: {}, I18nManager: { isRTL: false }, Platform: { OS: 'ios', select: (o: any) => o.ios },
  AppState: {
    get currentState() { return appState.currentState; },
    addEventListener: (_: string, listener: (state: string) => void) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));

import { SeatLayerError } from '../src/errors';
import { seatLayerPickerOfflineRetryAfter } from '../src/picker/offlineRetry';
import { SeatLayerPickerErrorStatus, SeatLayerPickerLoadingView } from '../src/picker/status';

const words: Record<string, string> = {
  offline: 'You’re offline', checkConnection: 'Check your connection and try again.', retry: 'Try again',
  mapDidNotLoad: 'The seat map didn’t load', errorMessage: 'Something went wrong.', loading: 'Loading the seat map',
  loadingTakingLonger: 'The seat map is taking longer to load. Please wait…',
  eventUnavailable: 'Tickets can’t be booked here right now.',
};
const strings = { translate: (key: string) => words[key] ?? key };
const theme = {
  themeMode: 'light', fontFamily: undefined, roles: {},
  colors: { accent: '#5b4b8a', onAccent: '#ffffff', text: '#111111', mutedText: '#777777', background: '#ffffff', surface: '#f5f5f5', divider: '#dddddd' },
} as any;

function said(tree: ReactTestRenderer): string[] {
  return tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => String(node.props.children));
}
const owner = {};
function panel(error: unknown, retry = vi.fn()): { tree: ReactTestRenderer; retry: ReturnType<typeof vi.fn> } {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(SeatLayerPickerErrorStatus, { error, retry, retryOwner: owner, strings, theme } as any));
  });
  return { tree, retry };
}

describe('opening the seat map', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    appState.currentState = 'active';
    appState.listeners.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says "You’re offline" when nothing answered, never the error\'s own words', () => {
    const { tree } = panel(SeatLayerError.transport('SeatLayer page load failed: net::ERR_INTERNET_DISCONNECTED'));
    expect(said(tree)).toEqual([words.offline, words.checkConnection, words.retry]);
  });

  it('tries again by itself after 10 and 20 s, then every 30, only while the app is in front', async () => {
    expect([0, 1, 2, 3].map(seatLayerPickerOfflineRetryAfter)).toEqual([10_000, 20_000, 30_000, 30_000]);
    const { retry } = panel(SeatLayerError.timeout('handshake', 45_000));
    await act(async () => { vi.advanceTimersByTime(9_999); });
    expect(retry).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(retry).toHaveBeenCalledTimes(2);
    // In the background it waits.
    act(() => {
      appState.currentState = 'background';
      for (const listener of [...appState.listeners]) listener('background');
    });
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(retry).toHaveBeenCalledTimes(2);
    act(() => {
      appState.currentState = 'active';
      for (const listener of [...appState.listeners]) listener('active');
    });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(retry).toHaveBeenCalledTimes(3);
  });

  it('says a server fault without the line about the connection, and does not retry by itself', async () => {
    const { tree, retry } = panel(SeatLayerError.transport('SeatLayer page returned HTTP 502.'));
    expect(said(tree)).toEqual([words.mapDidNotLoad, words.errorMessage, words.retry]);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(retry).not.toHaveBeenCalled();
  });

  it('says why a server refused the page, not to check the connection, and does not retry by itself', async () => {
    // A run that does not exist: the page reports the server's 404.
    const { tree, retry } = panel(SeatLayerError.bridge({ code: 'not_found', message: 'not_found', details: { status: 404 } }));
    expect(said(tree)).toEqual([words.mapDidNotLoad, words.errorMessage, words.eventUnavailable, words.retry]);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(retry).not.toHaveBeenCalled();
  });

  it('keeps today\'s panel for anything else', () => {
    const { tree } = panel(SeatLayerError.transport('SeatLayer page returned HTTP 404.'));
    expect(said(tree)).toEqual([words.mapDidNotLoad, words.errorMessage, words.checkConnection, words.retry]);
  });

  it('says the opening is taking longer after 8 s', () => {
    scope = {
      controller: {}, isReady: false, sessionId: 1, snapshot: undefined, styles: {}, strings, resolvedTheme: theme,
    };
    let tree!: ReactTestRenderer;
    act(() => { tree = create(React.createElement(SeatLayerPickerLoadingView, {})); });
    expect(said(tree)).toEqual([]);
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(said(tree)).toEqual([words.loadingTakingLonger]);
    expect(tree.root.findByProps({ testID: 'seatlayer-loading-surface' }).props.accessibilityLabel).toBe(words.loadingTakingLonger);
  });
});
