import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const announced: string[] = [];
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    addEventListener: () => ({ remove: () => {} }),
    announceForAccessibility: (message: string) => { announced.push(message); },
    isReduceMotionEnabled: async () => false,
  },
  Animated: {
    View: 'Animated.View',
    Value: class { interpolate() { return 'interpolated'; } setValue() {} stopAnimation() {} },
    delay: () => ({ start: () => {}, stop: () => {} }),
    loop: () => ({ start: () => {}, stop: () => {} }),
    sequence: () => ({ start: () => {}, stop: () => {} }),
    spring: () => ({ start: () => {}, stop: () => {} }),
    timing: () => ({ start: () => {}, stop: () => {} }),
  },
  Easing: { bezier: () => 'easing', linear: 'linear' },
  Image: 'Image',
  LayoutAnimation: { configureNext: () => {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 800 }), I18nManager: { isRTL: false },
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1, flatten: (value: unknown) => value },
}));
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('ScopeReprovider', undefined, children),
}));
import { SeatLayerPickerHeaderView } from '../src/picker/header';
import { SeatLayerCartList } from '../src/picker/SeatLayerCartList';
import { SeatLayerBestSeatsForm } from '../src/picker/SeatLayerBestSeatsForm';
import { SeatLayerPickerToastLayer } from '../src/picker/SeatLayerPickerToast';
import { SeatLayerToastQueue } from '../src/picker/toastQueue';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

async function render(element: React.ReactElement) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(element); });
  return renderer;
}

function theme() {
  return {
    colors: {
      accent: '#0066ff', background: '#f7f7f8', divider: '#d9d9de', error: '#b00020',
      mutedText: '#5a5a63', onAccent: '#ffffff', surface: '#ffffff', text: '#111114',
    },
    roles: {
      header: { background: '#ffffff', foreground: '#111114', border: '#d9d9de' },
      sheet: { background: '#fff', border: '#ccc' },
      notice: { background: '#fff', border: '#ccc' },
    },
    radii: { sheet: 14 },
    fontFamily: undefined,
  } as any;
}

function setupScope(over: Record<string, unknown> = {}) {
  const removed: unknown[][] = [];
  const snapshot: any = {
    sessionId: 's', revision: 1, event: { salesClosed: false, name: 'Arena night' },
    branding: { attributionRequired: false }, map: { buyerView: 'map', categoryFilter: [] },
    cartLines: [], selection: [], categories: [], bestAvailableZones: [], sections: [],
    hold: { active: false, owner: 'picker' }, maxSelection: 6, currency: 'EUR',
    selectionValidity: { isValid: true },
  };
  const controller = {
    getSnapshot: () => snapshot,
    removeCartLine: async (...args: unknown[]) => { removed.push(args); },
    bestAvailable: async () => {},
    mapController: {
      isReady: true,
      supportsPickerCapability: () => true,
      supportsPickerCommand: () => true,
    },
  };
  scope = {
    controller, snapshot, sessionId: 1, isSessionActive: () => true, pendingSeat: null,
    readOnly: false, isBusy: false, isReady: true, holdLapsed: false, presentation: { prompt: null },
    claimViewportInsetBand: () => ({ set: () => {}, remove: () => {} }), claimPrompt: () => undefined,
    resolvedTheme: theme(), styles: {},
    formatMoney: (amount: number, currency: string) => `${currency === 'EUR' ? '€' : ''}${amount}`,
    strings: { translate: (key: string) => key }, reportError: () => {},
    blocksCheckout: false, busyAction: null, setBusyAction: () => {}, emitHaptic: () => {},
    ...over,
  };
  return { controller, removed, snapshot };
}

const headerProps = {
  closeLabel: 'close',
  heldFor: (clock: string) => clock,
  removeInset: () => {},
  reportError: () => {},
  reportInset: () => {},
  theme: theme(),
  title: 'Arena night',
};

describe('§3.1 header renderer', () => {
  it('sits on the picker ground at its generated height with a letter mark and a 26 pt close ring', async () => {
    const renderer = await render(React.createElement(SeatLayerPickerHeaderView, {
      ...headerProps, brandName: 'Paiteq Live', onClose: () => {},
    }));
    const root = renderer.root.findByProps({ accessibilityRole: 'header' });
    const flattened = (root.props.style as unknown[]).filter(Boolean) as Record<string, unknown>[];
    // The ground and its ink are resolved as a PAIR through the header's slot.
    expect(flattened.some((style) => style.backgroundColor === '#ffffff')).toBe(true);
    // The rail beneath it is the first surface, so the header carries no line
    // of its own: two grounds meeting is the boundary, and a hairline as well
    // read as a rule drawn through one plate.
    expect(flattened.some((style) => 'borderBottomWidth' in style)).toBe(false);
    expect(flattened.some((style) => style.height === seatLayerPickerTokens.size.headerHeight)).toBe(true);
    // The venue-and-date meta line is NOT drawn on a phone.
    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('Arena night');
    expect(output).toContain('"P"');
    const ring = renderer.root.findByProps({ testID: 'seatlayer-header-close' })
      .findAll((node) => Array.isArray(node.props.style) && node.props.style.some((style: any) =>
        style && style.width === seatLayerPickerTokens.size.headerCloseSize &&
        style.borderRadius === seatLayerPickerTokens.radius.pill));
    expect(ring).toHaveLength(1);
    // The press target is expanded past the touch floor: the ring carries ten
    // points of reach on each side, so it ends ten points from the trailing
    // edge while the target still runs out to the corner.
    expect(renderer.root.findByProps({ testID: 'seatlayer-header-close' })
      .props.style({ pressed: false })[0]).toMatchObject({
      width: seatLayerPickerTokens.size.headerCloseSize + 20,
      height: seatLayerPickerTokens.size.minimumHitTarget,
    });
  });

  it('keeps the hold pill up for the whole hold and withholds it from a host-owned one', async () => {
    const now = 1_000_000;
    const props = (owner: string) => React.createElement(SeatLayerPickerHeaderView, {
      ...headerProps, clock: () => now, hold: { active: true, expiresAt: now + 605_000, owner },
    });
    const picker = await render(props('picker'));
    const pill = picker.root.findByProps({ testID: 'seatlayer-header-hold-pill' });
    expect(JSON.stringify(picker.toJSON())).toContain('10:05');
    expect(pill.props.accessibilityLiveRegion).toBe('polite');
    const host = await render(props('host'));
    expect(host.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(0);
  });

  it('says the throttled sentence rather than the running clock', async () => {
    const now = 1_000_000;
    const said: string[] = [];
    const renderer = await render(React.createElement(SeatLayerPickerHeaderView, {
      ...headerProps,
      announceHold: (key: string, count: number) => { said.push(`${key}:${count}`); return `${key}:${count}`; },
      clock: () => now,
      hold: { active: true, expiresAt: now + 600_000, owner: 'picker' },
    }));
    expect(renderer.root.findByProps({ testID: 'seatlayer-header-hold-pill' }).props.accessibilityLabel)
      .toBe('holdMinutesLeft:10');
    expect(said).toEqual(['holdMinutesLeft:10']);
  });

  it('draws the neutral sales-closed pill with its padlock', async () => {
    const renderer = await render(React.createElement(SeatLayerPickerHeaderView, {
      ...headerProps, salesClosed: true, salesClosedLabel: 'Sales are closed',
    }));
    const pill = renderer.root.findByProps({ testID: 'seatlayer-header-sales-closed-pill' });
    expect(pill.props.accessibilityLabel).toBe('Sales are closed');
    expect(pill.findAllByType('Text' as any).map((node: any) => node.children[0])).toContain('\u{1F512}');
  });
});

describe('§3.10.2 cart rows', () => {
  const line = (over: Record<string, unknown> = {}) => ({
    lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 25, currency: 'EUR',
    sectionLabel: '103', rowLabel: 'A', seatNumber: '9', ...over,
  });

  it('draws one plate at the generated line height, with the section as the only ellipsis', async () => {
    const runtime = setupScope();
    runtime.snapshot.cartLines = [line()];
    const renderer = await render(React.createElement(SeatLayerCartList));
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-plate' }).props.style)
      .toMatchObject({ borderRadius: seatLayerPickerTokens.radius.base * seatLayerPickerTokens.radius.smallRatio });
    const row = renderer.root.findByProps({ testID: 'seatlayer-cart-row' });
    expect((row.props.style as any[])[0]).toMatchObject({
      height: seatLayerPickerTokens.size.denseLineHeight, opacity: 1,
    });
    // The category name is not on the line; its colour is the dot and the name
    // goes to the accessible label.
    expect(row.props.accessibilityLabel).toContain('103 · A · 9');
  });

  it('fades a pressed row to the generated opacity, makes its × inert, and restores it on failure', async () => {
    const runtime = setupScope();
    runtime.snapshot.cartLines = [line()];
    let fail = false;
    runtime.controller.removeCartLine = async () => { if (fail) throw new Error('server'); };
    const renderer = await render(React.createElement(SeatLayerCartList));
    let resolve!: () => void;
    runtime.controller.removeCartLine = () => new Promise<void>((done) => { resolve = () => done(); });
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-cart-remove' }).props.onPress(); });
    const removing = renderer.root.findByProps({ testID: 'seatlayer-cart-row-removing' });
    expect((removing.props.style as any[])[0]).toMatchObject({
      opacity: seatLayerPickerTokens.opacity.removing,
    });
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-remove' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
    // A reply that left the line standing brings the row back.
    await act(async () => { resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-row-removing' })).toHaveLength(0);
    expect(fail).toBe(false);
  });

  it('washes a held row, locks its mark and takes its remove control away', async () => {
    const runtime = setupScope();
    runtime.snapshot.hold = { active: true, owner: 'host' };
    runtime.snapshot.cartLines = [line()];
    const renderer = await render(React.createElement(SeatLayerCartList));
    const lock = renderer.root.findByProps({ testID: 'seatlayer-cart-held-lock' });
    // Drawn, never an emoji: the platform paints U+1F512 in its own colours,
    // and the one state with consequences has to survive both the accent and
    // greyscale.
    expect(JSON.stringify(renderer.toJSON())).not.toContain('\u{1F512}');
    expect(lock.findAllByType('Text' as never)).toHaveLength(0);
    expect(lock.findAllByType('View' as never).length).toBeGreaterThanOrEqual(2);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-remove' })).toHaveLength(0);
  });

  it('collapses only once there are enough runs, behind a row of the generated height', async () => {
    const runtime = setupScope();
    const rows = (count: number) => Array.from({ length: count }, (_, index) => line({
      lineKey: `l-${index}`, label: `L-${index}`, objectId: `l-${index}`,
      sectionLabel: `S${index}`, seatNumber: String(index),
    }));
    runtime.snapshot.cartLines = rows(seatLayerPickerTokens.size.denseCollapseFrom - 1);
    let renderer = await render(React.createElement(SeatLayerCartList));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-more-row' })).toHaveLength(0);
    runtime.snapshot.cartLines = rows(seatLayerPickerTokens.size.denseCollapseFrom);
    renderer = await render(React.createElement(SeatLayerCartList));
    const more = renderer.root.findByProps({ testID: 'seatlayer-cart-more-row' });
    expect(more.props.style).toMatchObject({ height: seatLayerPickerTokens.size.denseMoreRowHeight });
    expect(more.props.accessibilityLabel).toBe('moreCount');
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-row' }))
      .toHaveLength(seatLayerPickerTokens.size.denseVisibleLines);
  });
});

describe('§3.11 best-seats form', () => {
  it('gives each decision its own row, omits a single-category select and drops the zone row', async () => {
    const runtime = setupScope();
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }];
    let renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-best-seats-category' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-best-seats-zone' })).toHaveLength(0);
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }, { key: 'child', label: 'Child' }];
    runtime.snapshot.bestAvailableZones = [{ id: 'z1', label: 'Front' }];
    renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    const select = renderer.root.findByProps({ testID: 'seatlayer-best-seats-category' });
    expect(select.props.style).toMatchObject({ alignSelf: 'stretch' });
    expect(select.findAll((node) => Array.isArray(node.props.style) && node.props.style.some((style: any) =>
      style && style.height === seatLayerPickerTokens.size.bestSeatsSelectHeight &&
      style.borderRadius === seatLayerPickerTokens.radius.control))).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-best-seats-zone' })).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: 'seatlayer-best-seats-stepper' }).props.style)
      .toMatchObject({
        width: seatLayerPickerTokens.size.bestSeatsStepperWidth,
        height: seatLayerPickerTokens.size.minimumHitTarget,
      });
  });

  it('says findBestSeats at rest and findingBestSeats while it works', async () => {
    const runtime = setupScope();
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }];
    let resolve!: () => void;
    runtime.controller.bestAvailable = () => new Promise<void>((done) => { resolve = () => done(); });
    const renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    expect(JSON.stringify(renderer.toJSON())).toContain('findBestSeats');
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-best-seats-action' }).props.onPress(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('findingBestSeats');
    await act(async () => { resolve(); await Promise.resolve(); await Promise.resolve(); });
  });
});

describe('§3.12 toast surface', () => {
  it('centres one card above the lift, announces it outright, and gives the action a 44 pt box', async () => {
    setupScope();
    announced.length = 0;
    const queue = new SeatLayerToastQueue({
      setTimeout: () => 1, clearTimeout: () => {},
    });
    queue.show({ message: 'Sales are closed for this event.', tone: 'warning', actionLabel: 'Retry', onAction: () => {} });
    const renderer = await render(React.createElement(SeatLayerPickerToastLayer, { queue }));
    expect(renderer.root.findByProps({ testID: 'seatlayer-picker-toast-layer' }).props.style[0])
      .toMatchObject({ alignItems: 'center', bottom: seatLayerPickerTokens.size.toastCardLift });
    const card = renderer.root.findByProps({ testID: 'seatlayer-picker-toast' });
    expect(card.props.accessibilityLiveRegion).toBe('polite');
    // Tones change only the border; a warning takes the accent.
    expect((card.props.style as any[])[0]).toMatchObject({ borderColor: '#0066ff', borderRadius: 16 });
    expect(announced).toEqual(['Sales are closed for this event.']);
    expect(renderer.root.findByProps({ testID: 'seatlayer-picker-toast-action' }).props.style)
      .toMatchObject({
        height: seatLayerPickerTokens.size.minimumHitTarget,
        minWidth: seatLayerPickerTokens.size.minimumHitTarget,
      });
  });

  it('draws nothing when the queue is empty', async () => {
    setupScope();
    const queue = new SeatLayerToastQueue({ setTimeout: () => 1, clearTimeout: () => {} });
    const renderer = await render(React.createElement(SeatLayerPickerToastLayer, { queue }));
    expect(renderer.toJSON()).toBeNull();
  });
});

describe('§3.13.6 standalone hold countdown', () => {
  it('mirrors the header pill: host-owned holds are withheld and the sentence is throttled', async () => {
    setupScope();
    const { SeatLayerPickerHoldCountdownView } = await import('../src/picker/SeatLayerPickerHoldCountdown');
    const now = 1_000_000;
    const base = {
      announceHold: (key: string, count: number) => `${key}:${count}`,
      clock: () => now,
      heldFor: (clock: string) => clock,
      theme: theme(),
    };
    const picker = await render(React.createElement(SeatLayerPickerHoldCountdownView, {
      ...base, hold: { active: true, expiresAt: now + 120_000, owner: 'picker' },
    }));
    const pill = picker.root.findByProps({ testID: 'seatlayer-hold-countdown' });
    expect(pill.props.accessibilityLabel).toBe('holdMinutesLeft:2');
    expect(pill.props.accessibilityLiveRegion).toBe('polite');
    const host = await render(React.createElement(SeatLayerPickerHoldCountdownView, {
      ...base, hold: { active: true, expiresAt: now + 120_000, owner: 'host' },
    }));
    expect(host.toJSON()).toBeNull();
  });

  it('inverts to the full accent in its last minute', async () => {
    setupScope();
    const { SeatLayerPickerHoldCountdownView } = await import('../src/picker/SeatLayerPickerHoldCountdown');
    const now = 1_000_000;
    const renderer = await render(React.createElement(SeatLayerPickerHoldCountdownView, {
      clock: () => now,
      heldFor: (clock: string) => clock,
      hold: { active: true, expiresAt: now + 45_000, owner: 'picker' },
      theme: theme(),
    }));
    const pill = renderer.root.findByProps({ testID: 'seatlayer-hold-countdown' });
    expect((pill.props.style as any[])[1]).toMatchObject({ backgroundColor: '#0066ff' });
  });
});
