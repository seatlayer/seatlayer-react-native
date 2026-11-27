import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const announced: string[] = [];
vi.mock('react-native', () => {
  class Value {
    constructor(public value: number) {}
    setValue(next: number) { this.value = next; }
    stopAnimation() {}
    interpolate(config: unknown) { return { interpolated: config }; }
  }
  const run = (value: Value, toValue: number) => ({
    start: (done?: (result: { finished: boolean }) => void) => {
      value.setValue(toValue);
      done?.({ finished: true });
    },
    stop: () => {},
  });
  return {
    Animated: {
      Value,
      View: 'AnimatedView',
      timing: (value: Value, config: { toValue: number }) => run(value, config.toValue),
      loop: () => ({ start: () => {}, stop: () => {} }),
    },
    Easing: { linear: (t: number) => t, cubic: (t: number) => t, out: (f: unknown) => f },
    PixelRatio: { getFontScale: () => 1 },
    StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, absoluteFill: { position: 'absolute' } },
    Text: 'Text',
    View: 'View',
    AccessibilityInfo: { announceForAccessibility: (text: string) => announced.push(text) },
  };
});

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));
vi.mock('../src/picker/reducedMotion', () => ({ useSeatLayerPickerReducedMotion: () => false }));

import type { SeatLayerConnectionShown } from '../src/picker/connection';
import {
  SeatLayerPickerConnectionStatus,
  seatLayerPickerConnectionFits,
  seatLayerPickerWideConnectionPlace,
} from '../src/picker/connectionStatus';

const words: Record<string, string> = {
  offline: 'You’re offline', backOnline: 'Back online', updating: 'Updating…', stillHeld: 'Your seats are still held.',
};
let shown: SeatLayerConnectionShown = 'none';
const listeners = new Set<() => void>();
function say(next: SeatLayerConnectionShown): void {
  shown = next;
  for (const listener of [...listeners]) listener();
}

function setup(hold: Record<string, unknown> = {}): void {
  scope = {
    controller: {
      getConnectionShown: () => shown,
      subscribeConnection: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    snapshot: { hold },
    strings: { translate: (key: string) => words[key] ?? key },
    resolvedTheme: {
      themeMode: 'light', fontFamily: undefined,
      colors: { text: '#111111', mutedText: '#777777', background: '#ffffff', surface: '#f5f5f5', divider: '#dddddd', accent: '#ff00ff' },
    },
  };
}

const place = { top: 8, start: 109, end: 107, belowTop: 56, inset: 12 };

function layout(node: ReactTestInstance, width: number): void {
  act(() => {
    node.props.onLayout({ nativeEvent: { layout: { width, height: 36, x: 0, y: 0 } } });
  });
}

function measure(tree: ReactTestRenderer, mapWidth: number, natural: number): void {
  const root = tree.root.findAll((node) => node.props.pointerEvents === 'none' && typeof node.props.onLayout === 'function')[0]!;
  layout(root, mapWidth);
  const card = tree.root.findAll((node) => node.props.importantForAccessibility === 'no-hide-descendants')[0]!
    .findAll((node) => typeof node.props.onLayout === 'function')[0]!;
  layout(card, natural);
}

function texts(tree: ReactTestRenderer): string[] {
  const shownCard = tree.root.findAll((node) => (node.type as unknown) === 'AnimatedView' && node.props.accessibilityLabel !== undefined)[0];
  return shownCard === undefined ? [] : shownCard.findAll((node) => (node.type as unknown) === 'Text').map((node) => String(node.props.children));
}

describe('the connection status card', () => {
  beforeEach(() => {
    shown = 'none';
    listeners.clear();
    announced.length = 0;
    setup();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws nothing while the line is fine', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SeatLayerPickerConnectionStatus, { place }));
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('stands beside the badge when its words fit, takes no touches, and is read once', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SeatLayerPickerConnectionStatus, { place }));
    });
    act(() => say('offline'));
    // 393 - 109 - 107 = 177 of room.
    measure(tree, 393, 150);
    const card = tree.root.findAll((node) => (node.type as unknown) === 'AnimatedView' && node.props.accessibilityLabel !== undefined)[0]!;
    const style = Object.assign({}, ...[card.props.style].flat(3).filter(Boolean));
    expect(style).toMatchObject({ top: 8, start: 109, maxWidth: 177 });
    expect(style.end).toBeUndefined();
    expect(card.props.accessibilityLabel).toBe('You’re offline');
    expect(tree.root.findAll((node) => node.props.pointerEvents === 'none').length).toBeGreaterThan(0);
    expect(texts(tree)).toEqual(['You’re offline']);
    expect(announced).toEqual(['You’re offline']);
  });

  it('goes under the line, the map\'s whole width, when the words do not fit', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SeatLayerPickerConnectionStatus, { place }));
    });
    act(() => say('updating'));
    measure(tree, 320, 150);
    const card = tree.root.findAll((node) => (node.type as unknown) === 'AnimatedView' && node.props.accessibilityLabel !== undefined)[0]!;
    const style = Object.assign({}, ...[card.props.style].flat(3).filter(Boolean));
    expect(style).toMatchObject({ top: 56, start: 12, end: 12 });
    // "Updating…" is not read out.
    expect(announced).toEqual([]);
  });

  it('adds "Your seats are still held." under offline while a confirmed hold has time left, and drops it at 0:00', () => {
    vi.useFakeTimers();
    setup({ active: true, expiresAt: Date.now() + 5000 });
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SeatLayerPickerConnectionStatus, { place }));
    });
    act(() => say('offline'));
    measure(tree, 430, 200);
    expect(texts(tree)).toEqual(['You’re offline', 'Your seats are still held.']);
    expect(announced).toEqual(['You’re offline Your seats are still held.']);
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(texts(tree)).toEqual(['You’re offline']);
  });

  it('fades out and unmounts when the line is fine again', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SeatLayerPickerConnectionStatus, { place }));
    });
    act(() => say('back'));
    measure(tree, 393, 120);
    expect(texts(tree)).toEqual(['Back online']);
    act(() => say('none'));
    expect(tree.toJSON()).toBeNull();
  });

  it('fits by the room between the start and the end, and the wide cap', () => {
    expect(seatLayerPickerConnectionFits(177, 393, place)).toBe(true);
    expect(seatLayerPickerConnectionFits(178, 393, place)).toBe(false);
    const wide = seatLayerPickerWideConnectionPlace(12, 90, 87);
    expect(wide).toMatchObject({ top: 12, start: 114, end: 107, inset: 12, maxWidth: 360 });
    expect(seatLayerPickerConnectionFits(361, 1200, wide)).toBe(false);
    // Not measured yet: it waits under the line rather than run into the badge.
    expect(seatLayerPickerWideConnectionPlace(12, undefined, 87).start).toBe(Number.POSITIVE_INFINITY);
    expect(seatLayerPickerWideConnectionPlace(12, 0, 87).start).toBe(12);
  });
});
