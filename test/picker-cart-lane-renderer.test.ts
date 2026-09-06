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
import { seatLayerSheetRestoreFraction } from '../src/picker/sheetDrag';

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
  const controller: Record<string, any> = {
    getSnapshot: () => snapshot,
    removeCartLine: async (...args: unknown[]) => { removed.push(args); },
    bestAvailable: async () => {},
    supportsFrameSeat: false,
    frameSeat: async () => ({ dy: 0 }),
    openSeatView: async () => {},
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

  it('keeps the hold pill up for the whole hold, whoever owns it', async () => {
    const now = 1_000_000;
    const props = (owner: string, showHoldPill?: boolean) => React.createElement(SeatLayerPickerHeaderView, {
      ...headerProps, clock: () => now, hold: { active: true, expiresAt: now + 605_000, owner },
      ...(showHoldPill === undefined ? {} : { showHoldPill }),
    });
    const picker = await render(props('picker'));
    const pill = picker.root.findByProps({ testID: 'seatlayer-header-hold-pill' });
    expect(JSON.stringify(picker.toJSON())).toContain('10:05');
    expect(pill.props.accessibilityLiveRegion).toBe('polite');
    // The reference draws the clock on a hold handed to the host too: the
    // buyer's time is running either way (§3.1, owner call 2026-09-05).
    const host = await render(props('host'));
    expect(host.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(1);
    expect(JSON.stringify(host.toJSON())).toContain('10:05');
    // The one way it goes away is the host asking, through `showHoldPill`.
    const off = await render(props('host', false));
    expect(off.root.findAllByProps({ testID: 'seatlayer-header-hold-pill' })).toHaveLength(0);
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

describe('§3.10.2 cart cards', () => {
  const line = (over: Record<string, unknown> = {}) => ({
    lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 25, currency: 'EUR',
    sectionLabel: '103', rowLabel: 'A', seatNumber: '9', ...over,
  });

  it('draws a bordered card at the generated height, with the name as the only ellipsis', async () => {
    const runtime = setupScope();
    runtime.snapshot.cartLines = [line()];
    const renderer = await render(React.createElement(SeatLayerCartList));
    // THE PLATE IS GONE: one card per ticket, on its own surface, at the
    // generated corner — not a bordered list inside a bordered sheet.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-plate' })).toHaveLength(0);
    const card = renderer.root.findByProps({ testID: 'seatlayer-cart-card' });
    expect((card.props.style as any[])[0]).toMatchObject({
      backgroundColor: '#ffffff',
      borderRadius: seatLayerPickerTokens.size.cartCardRadius,
      minHeight: seatLayerPickerTokens.size.cartCardMinHeight,
      opacity: 1,
    });
    const texts = card.findAllByType('Text' as never);
    const name = texts.find((node) => node.props.children === '103')!;
    expect(name.props.numberOfLines).toBe(1);
    expect((name.props.style as any[])[0]).toMatchObject({
      fontSize: seatLayerPickerTokens.type.cartCardName.size,
    });
    // Under it, the position at its own smaller size in the muted ink.
    const position = texts.find((node) => node.props.children === 'A · 9')!;
    expect((position.props.style as any[])[0]).toMatchObject({
      color: '#5a5a63', fontSize: seatLayerPickerTokens.type.cartCardPosition.size,
    });
    // The amount is the third of the three card types, and the heaviest.
    const amount = texts.find((node) => node.props.children === '€25')!;
    expect((amount.props.style as any[])[0]).toMatchObject({
      fontSize: seatLayerPickerTokens.type.cartCardAmount.size,
    });
    expect(card.props.accessibilityLabel).toContain('103 · A · 9');
  });

  it('says the seat\'s notes ONCE and in words, under a hairline inside the card', async () => {
    const runtime = setupScope();
    runtime.snapshot.cartLines = [line({ seatId: 'seat-1' })];
    runtime.snapshot.selection = [{
      id: 'seat-1', label: 'A-1', accessibility: ['wheelchair'], wheelchairSpaceType: 'no-seat',
      commercial: { restrictedView: true, premium: true, note: 'Pillar at the aisle end' },
    }];
    const renderer = await render(React.createElement(SeatLayerCartList));
    const notes = renderer.root.findByProps({ testID: 'seatlayer-cart-card-notes' });
    const rows = notes.findAllByType('Text' as never)
      .filter((node) => Array.isArray(node.props.style) === false && node.props.style?.fontSize);
    // The provision replaces the plain wheelchair accommodation, restricted and
    // premium are SEPARATE rows, and the organizer's sentence rides the first
    // selling mark rather than standing on a line of its own.
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(renderer.toJSON())).toContain('Pillar at the aisle end');
    expect(rows[0]!.props.style.fontSize).toBe(seatLayerPickerTokens.type.cartNoteText.size);
    // No glyphs here: the icon rows belong to the seat card (§3.8), and drawing
    // both made the cart read as the same fact printed twice.
    expect(notes.findAllByProps({ testID: 'seatlayer-seat-note-icon' })).toHaveLength(0);
  });

  it('fades a pressed card to the generated opacity, makes its × inert, and restores it on failure', async () => {
    const runtime = setupScope();
    runtime.snapshot.cartLines = [line()];
    let fail = false;
    runtime.controller.removeCartLine = async () => { if (fail) throw new Error('server'); };
    const renderer = await render(React.createElement(SeatLayerCartList));
    let resolve!: () => void;
    runtime.controller.removeCartLine = () => new Promise<void>((done) => { resolve = () => done(); });
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-cart-card-remove' }).props.onPress(); });
    const removing = renderer.root.findByProps({ testID: 'seatlayer-cart-card-removing' });
    expect((removing.props.style as any[])[0]).toMatchObject({
      opacity: seatLayerPickerTokens.opacity.removing,
    });
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-card-remove' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
    // A reply that left the line standing brings the card back.
    await act(async () => { resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-card-removing' })).toHaveLength(0);
    expect(fail).toBe(false);
  });

  it('washes a held card and locks its mark, and keeps its remove control', async () => {
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
    // The dot it replaces is not drawn as well.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-card-dot' })).toHaveLength(0);
    // §3.13.13 — the × stays: pressing it is how a buyer whose hold the host
    // owns is told the state, and how a held card releases one seat.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-card-remove' }).length)
      .toBeGreaterThan(0);
  });

  it('takes the map to the seat and KEEPS the sheet open when a card is pressed', async () => {
    const framed: unknown[][] = [];
    const sheet: unknown[] = [];
    const runtime = setupScope({ setPresentation: (event: unknown) => sheet.push(event) });
    runtime.controller.supportsFrameSeat = true;
    runtime.controller.frameSeat = async (...args: unknown[]) => { framed.push(args); };
    runtime.snapshot.cartLines = [line({ seatId: 'seat-1' })];
    runtime.snapshot.selection = [{ id: 'seat-1', label: 'A-1' }];
    const renderer = await render(React.createElement(SeatLayerCartList));
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-cart-card' }).props.onPress(); });
    expect(framed[0]![0]).toBe('seat-1');
    expect(framed[0]![1]).toMatchObject({ fraction: seatLayerSheetRestoreFraction });
    // Owner call, both platforms: the sheet stays. A tap on a cart card asks
    // "where is this one?", and closing the list the buyer was reading through
    // to answer it made checking a second seat cost a re-open every time.
    expect(sheet).toEqual([]);
  });

  it('draws one card per cart line, with no run model left to fold them', async () => {
    // The folded runs and the `+N more` row went with the dense tokens; the
    // collapsed sheet caps the list and scrolls instead.
    const runtime = setupScope();
    runtime.snapshot.cartLines = Array.from({ length: 6 }, (_, index) => line({
      lineKey: `l-${index}`, label: `L-${index}`, objectId: `l-${index}`,
      sectionLabel: `S${index}`, seatNumber: String(index),
    }));
    const renderer = await render(React.createElement(SeatLayerCartList));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-more-row' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-card' })).toHaveLength(6);
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

  it('carries a one-line title and hides its sentence behind a ⓘ', async () => {
    const runtime = setupScope();
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }];
    const renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    const title = renderer.root.findByProps({ testID: 'seatlayer-best-seats-title' });
    // SHORT on purpose, and it shrinks by truncating: the long form wrapped
    // onto a second line above a card whose whole point is that it is compact.
    expect(title.props.children).toBe('findSeatsTogether');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe('tail');
    // The explanation rides an ⓘ right after the title, not under it.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-best-seats-about-text' })).toHaveLength(0);
    const about = renderer.root.findByProps({ testID: 'seatlayer-best-seats-about' });
    expect(about.props.accessibilityLabel).toBe('aboutBestSeats');
    expect(about.props.accessibilityState).toMatchObject({ expanded: false });
    await act(async () => { about.props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'seatlayer-best-seats-about-text' }).props.children)
      .toBe('closestGroupChosenInstantly');
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
  it('mirrors the header pill: the clock runs whoever owns the hold, and the sentence is throttled', async () => {
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
    expect(host.root.findByProps({ testID: 'seatlayer-hold-countdown' })
      .props.accessibilityLabel).toBe('holdMinutesLeft:2');
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
