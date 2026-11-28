import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let screen = { width: 390, height: 844 };
let scheme: 'light' | 'dark' = 'light';
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
  },
  Animated: {
    Value: class { setValue() {} stopAnimation() {} },
    View: 'Animated.View',
    loop: () => ({ start() {}, stop() {} }),
    sequence: () => ({}),
    timing: () => ({}),
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

import { SeatLayerSurfaceModal } from '../src/surface/SurfaceModal';
import {
  SeatLayerSurfaceHeader,
  useSeatLayerSurfaceLook,
  type SeatLayerSurfaceLook,
  type SeatLayerSurfaceLookInput,
} from '../src/surface/SurfaceHeader';

afterEach(() => {
  screen = { width: 390, height: 844 };
  scheme = 'light';
});

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(element); });
  return renderer;
}

function modal(overrides: Partial<React.ComponentProps<typeof SeatLayerSurfaceModal>> = {}) {
  return React.createElement(SeatLayerSurfaceModal, {
    visible: true,
    surfaceColor: '#fafafa',
    cardRadius: 18,
    closeLabel: 'Close',
    usesHostInsets: false,
    onRequestClose: () => undefined,
    testID: 'surface',
    ...overrides,
  }, React.createElement('page'));
}

describe('SeatLayerSurfaceModal', () => {
  it('stands a phone page full screen on its ground, with Back sent to the page', async () => {
    const onRequestClose = vi.fn();
    const renderer = await render(modal({ onRequestClose }));
    const native = renderer.root.findByType('Modal' as never);
    expect(native.props).toMatchObject({
      visible: true,
      transparent: false,
      animationType: 'slide',
      presentationStyle: 'fullScreen',
      statusBarTranslucent: false,
    });
    expect(native.props.supportedOrientations).toContain('landscape');
    const safe = renderer.root.findByType('SafeAreaView' as never);
    expect(safe.props.style).toEqual([{ flex: 1 }, { backgroundColor: '#fafafa' }]);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-modal-barrier' })).toHaveLength(0);
    native.props.onRequestClose();
    expect(onRequestClose).toHaveBeenCalledWith('systemBack');
  });

  it('is a dialog on a tablet, its barrier closing only when allowed', async () => {
    screen = { width: 1024, height: 768 };
    const onRequestClose = vi.fn();
    const renderer = await render(modal({ onRequestClose }));
    expect(renderer.root.findByType('Modal' as never).props).toMatchObject({
      transparent: true,
      animationType: 'fade',
      presentationStyle: 'overFullScreen',
    });
    const card = renderer.root.findByProps({ testID: 'seatlayer-modal-card' });
    expect(card.props.style[1]).toEqual({ backgroundColor: '#fafafa', borderRadius: 18 });
    const closed = renderer.root.findByProps({ testID: 'seatlayer-modal-barrier' });
    expect(closed.props.onPress).toBeUndefined();
    expect(closed.props.accessible).toBe(false);

    await act(async () => { renderer.update(modal({ onRequestClose, barrierDismissible: true })); });
    const open = renderer.root.findByProps({ testID: 'seatlayer-modal-barrier' });
    expect(open.props.accessibilityLabel).toBe('Close');
    open.props.onPress();
    expect(onRequestClose).toHaveBeenCalledWith('barrier');
  });

  it('adds no safe area when the app hands the page its own, and keeps an asked presentation', async () => {
    screen = { width: 1024, height: 768 };
    const renderer = await render(modal({ usesHostInsets: true, presentation: 'fullScreen' }));
    expect(renderer.root.findAllByType('SafeAreaView' as never)).toHaveLength(0);
    expect(renderer.root.findByType('Modal' as never).props).toMatchObject({
      presentationStyle: 'fullScreen',
      statusBarTranslucent: true,
    });
  });

  it('wraps what the native modal holds', async () => {
    const Within = ({ children }: { children?: React.ReactNode }) =>
      React.createElement('within', undefined, children);
    const renderer = await render(modal({ within: Within }));
    const within = renderer.root.findByType('within' as never);
    expect(within.findByType('page' as never)).toBeDefined();
  });
});

function LookProbe(props: SeatLayerSurfaceLookInput & {
  readonly onLook: (look: SeatLayerSurfaceLook) => void;
}): null {
  props.onLook(useSeatLayerSurfaceLook(props));
  return null;
}

async function lookOf(input: SeatLayerSurfaceLookInput): Promise<SeatLayerSurfaceLook> {
  let look!: SeatLayerSurfaceLook;
  await render(React.createElement(LookProbe, { ...input, onLook: (value) => { look = value; } }));
  return look;
}

describe('a page header outside the event picker', () => {
  it('follows the device side, the organizer brand and the page language', async () => {
    scheme = 'dark';
    const dark = await lookOf({ branding: { attributionRequired: false, accent: '#0a7d32' }, pageLocale: 'de' });
    expect(dark.theme.themeMode).toBe('dark');
    expect(dark.theme.colors.accent.toLowerCase()).toBe('#0a7d32');
    expect(dark.strings.translate('close')).toBe('Schließen');

    scheme = 'light';
    const app = await lookOf({ themeMode: 'dark', locale: 'fr', pageLocale: 'de' });
    expect(app.theme.themeMode).toBe('dark');
    expect(app.strings.translate('close')).toBe('Fermer');
  });

  it('draws the event header: the name, the one hold clock and the ✕', async () => {
    const look = await lookOf({});
    const onClose = vi.fn();
    const now = 1_000_000;
    const renderer = await render(React.createElement(SeatLayerSurfaceHeader, {
      look,
      title: 'Season 2027',
      brandName: 'Riverside',
      holdExpiresAt: now + 65_000,
      clock: () => now,
      onClose,
    }));
    const texts = renderer.root.findAllByType('Text' as never).map((node) => node.props.children);
    expect(texts).toContain('Season 2027');
    expect(texts).toContain('R');
    const pill = renderer.root.findByProps({ testID: 'seatlayer-header-hold-pill' });
    expect(pill.props.accessibilityLabel).toContain('1:05');
    renderer.root.findByProps({ testID: 'seatlayer-header-close' }).props.onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading words until the page names itself, with no clock or ✕ unasked', async () => {
    const look = await lookOf({});
    const renderer = await render(React.createElement(SeatLayerSurfaceHeader, { look }));
    const texts = renderer.root.findAllByType('Text' as never).map((node) => node.props.children);
    expect(texts).toContain(look.strings.translate('chooseSeats'));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-header-close' })).toHaveLength(0);
  });

  it('waits in grey at 0:00 while the page line is down', async () => {
    const look = await lookOf({});
    const now = 5_000;
    const renderer = await render(React.createElement(SeatLayerSurfaceHeader, {
      look,
      holdExpiresAt: now - 1,
      clock: () => now,
      lineDown: true,
    }));
    const pill = renderer.root.findByProps({ testID: 'seatlayer-header-hold-pill' });
    const ink = pill.findAllByType('Text' as never)[0]!.props.style[1].color;
    expect(ink).toBe(look.theme.colors.mutedText);
  });
});
