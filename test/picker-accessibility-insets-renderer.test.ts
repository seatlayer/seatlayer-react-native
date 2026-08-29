import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 800 }),
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children: React.ReactNode }) => React.createElement('ScopeReprovider', undefined, children),
}));

import { SeatLayerPickerAccessibilityFilters } from '../src/picker/accessibility';

function setup() {
  const calls: unknown[] = [];
  const snapshot: any = {
    sessionId: 'runtime', capabilities: ['accessibilityFilter'],
    map: { accessibilityFilter: [], hideLimitedView: false, colorblindSafe: false, accessNeeds: [] },
  };
  const controller = {
    getSnapshot: () => snapshot,
    setAccessibilityFilter: async (keys: readonly string[]) => { calls.push(keys); },
    setLimitedViewFilter: async () => {}, setColorblindSafe: async () => {},
    mapController: {
      isReady: true,
      supportsPickerCapability: (key: string) => key === 'native-chrome-contract-v1',
      supportsPickerCommand: (key: string) => key === 'picker.setAccessibilityFilter',
    },
  };
  scope = {
    controller, snapshot, sessionId: 1, isBusy: false, styles: {},
    presentation: { prompt: null },
    resolvedTheme: { colors: { text: '#111', background: '#eee', surface: '#fff', divider: '#ccc', accent: '#06f', onAccent: '#fff', mutedText: '#555' }, fontFamily: 'Brand' },
    strings: { translate: (key: string) => key, accessNeed: (key: string) => key },
    reportError: () => {},
    back: async () => { scope = { ...scope, presentation: { prompt: null } }; },
    claimPrompt: (_owner: string, kind: string, context: unknown) => ({
      lease: { context },
      open: () => { scope = { ...scope, presentation: { prompt: { kind, context } } }; return true; },
      dismiss: () => { scope = { ...scope, presentation: { prompt: null } }; return true; },
    }),
  };
  return { calls };
}

async function render(props: Record<string, unknown>) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(SeatLayerPickerAccessibilityFilters, props)); });
  return renderer;
}

describe('accessibility prompt safe-area geometry', () => {
  it('keeps the scrim edge-to-edge while forwarding asymmetric full insets through the scoped modal', async () => {
    const runtime = setup();
    const props = { safeAreaInsets: { top: 7, right: 19, bottom: 23, left: 3 }, modalHorizontalInset: 99 };
    const renderer = await render(props);
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'accessibility' }).props.onPress();
      renderer.update(React.createElement(SeatLayerPickerAccessibilityFilters, props));
    });
    expect(renderer.root.findByType('ScopeReprovider' as any)).toBeTruthy();
    expect(renderer.root.findByType('Modal' as any).props.visible).toBe(true);
    expect(renderer.root.findAll((node) => node.props.style?.position === 'absolute' && node.props.style?.top === 0 && node.props.style?.right === 0 && node.props.style?.bottom === 0 && node.props.style?.left === 0)).toHaveLength(1);
    const bounds = renderer.root.findByProps({ pointerEvents: 'box-none' });
    expect(bounds.props.style[1]).toMatchObject({ paddingTop: 23, paddingRight: 35, paddingBottom: 39, paddingLeft: 19 });
    await act(async () => { renderer.root.findAllByProps({ accessible: false }).find((node) => node.props.onPress && node.props.style?.position === 'absolute')!.props.onPress(); });
    expect(runtime.calls).toEqual([]);
    expect(scope.presentation.prompt).toBeNull();
  });

  it('retains scalar inset compatibility and contains hostile full inset input', async () => {
    setup();
    const legacy = await render({ modalTopInset: 4, modalBottomInset: 6, modalHorizontalInset: 9 });
    await act(async () => {
      legacy.root.findByProps({ accessibilityLabel: 'accessibility' }).props.onPress();
      legacy.update(React.createElement(SeatLayerPickerAccessibilityFilters, { modalTopInset: 4, modalBottomInset: 6, modalHorizontalInset: 9 }));
    });
    expect(legacy.root.findByProps({ pointerEvents: 'box-none' }).props.style[1]).toMatchObject({ paddingTop: 20, paddingRight: 25, paddingBottom: 22, paddingLeft: 25 });
    const hostile = Object.create(null, { top: { enumerable: true, get: () => { throw new Error('inset'); } } });
    const hostileRenderer = await render({ safeAreaInsets: hostile });
    await act(async () => {
      hostileRenderer.root.findByProps({ accessibilityLabel: 'accessibility' }).props.onPress();
      hostileRenderer.update(React.createElement(SeatLayerPickerAccessibilityFilters, { safeAreaInsets: hostile }));
    });
    expect(hostileRenderer.root.findByProps({ pointerEvents: 'box-none' }).props.style[1]).toMatchObject({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 });
  });
});
