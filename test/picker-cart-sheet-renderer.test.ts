import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const interpolations: unknown[] = [];
const timings: unknown[][] = [];
vi.mock('react-native', () => ({
  AccessibilityInfo: { addEventListener: () => ({ remove: () => {} }), isReduceMotionEnabled: async () => false },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Value: class {
      interpolate(config: unknown) { interpolations.push(config); return 'interpolated'; }
      setValue() {} stopAnimation(done?: (value: number) => void) { done?.(0); }
      addListener() { return 1; } removeListener() {}
    },
    delay: () => ({ start: () => {}, stop: () => {} }),
    loop: () => ({ start: () => {}, stop: () => {} }),
    sequence: () => ({ start: () => {}, stop: () => {} }),
    spring: () => ({ start: () => {}, stop: () => {} }),
    timing: (...args: unknown[]) => { timings.push(args); return { start: () => {}, stop: () => {} }; },
  },
  PanResponder: { create: (config: Record<string, unknown>) => ({ panHandlers: {}, config }) },
  Easing: { bezier: () => 'easing' },
  LayoutAnimation: { configureNext: () => {} },
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 800 }), I18nManager: { isRTL: false },
  StyleSheet: { create: <T,>(value: T) => value, flatten: (value: unknown) => value },
}));
let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope, SeatLayerPickerScopeReprovider: ({ children }: { children?: React.ReactNode }) => React.createElement('ScopeReprovider', undefined, children) }));
import { SeatLayerBookButton, SeatLayerCartSheet } from '../src/picker/SeatLayerCartSheet';
import { SeatLayerCartList } from '../src/picker/SeatLayerCartList';
import { SeatLayerBestSeatsForm } from '../src/picker/SeatLayerBestSeatsForm';
import { SeatLayerHoldLapseNotice } from '../src/picker/SeatLayerHoldLapseNotice';
import { SeatLayerPickerActionError } from '../src/picker/actionError';
import { SeatLayerPickerPromptModal } from '../src/picker/promptModal';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

async function render(element: React.ReactElement) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(element); });
  return renderer;
}

function hasPaint(node: { props: { style?: unknown } }): boolean {
  const styles = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
  return styles.some((style) => Boolean(style) && typeof style === 'object' &&
    (style as { height?: unknown }).height === 44 && (style as { borderRadius?: unknown }).borderRadius === 9);
}

function setup(hostHold = false) {
  const calls: unknown[][] = [];
  const bestCalls: unknown[][] = [];
  const insets: unknown[] = [];
  const insetLeases: Array<{ retired: boolean }> = [];
  let sessionActive = true;
  const snapshot: any = { sessionId: 's', revision: 1, event: { salesClosed: false }, branding: { attributionRequired: false }, map: { buyerView: 'map', categoryFilter: [] }, cartLines: [{ lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 20, currency: 'USD' }], selection: [], categories: [], bestAvailableZones: [], sections: [], hold: { active: true, owner: hostHold ? 'host' : 'picker' }, maxSelection: 4, currency: 'USD', selectionValidity: { isValid: true } };
  const controller = { getSnapshot: () => snapshot, checkout: async () => ({ holdId: 'origin', expiresAt: 2, currency: 'USD', lineItems: [], total: 20 }), rejectHandoff: async (...args: unknown[]) => { calls.push(args); }, bestAvailable: async (...args: unknown[]) => { bestCalls.push(args); }, mapController: { isReady: true, supportsPickerCapability: (key: string) => key === 'checkout-handoff-v1' || key === 'checkout-handoff-reject-v1' || key === 'picker-actions-v1', supportsPickerCommand: (key: string) => key === 'picker.continue' || key === 'picker.rejectHandoff' || key === 'picker.bestAvailable' } };
  scope = { controller, snapshot, sessionId: 1, isSessionActive: () => sessionActive, pendingSeat: null, readOnly: false, isBusy: false, isReady: true, isHoldLapseBusy: false, holdLapse: undefined, dismissHoldLapse: () => {}, reselectHoldLapse: async () => false, clearError: () => {}, presentation: { prompt: null }, back: async () => { scope = { ...scope, presentation: { prompt: null } }; }, claimViewportInsetBand: () => { const lease = { retired: false }; insetLeases.push(lease); return { set: (value: unknown) => { if (!lease.retired) insets.push(value); }, remove: () => { lease.retired = true; } }; }, claimPrompt: () => undefined, resolvedTheme: { colors: { onAccent: '#fff', text: '#111', accent: '#06f', divider: '#ccc', surface: '#fff', mutedText: '#555', error: '#b00' }, roles: { sheet: { background: '#fff', border: '#ccc' }, notice: { background: '#fff', border: '#ccc' } }, radii: { sheet: 14 }, fontFamily: undefined }, styles: {}, formatMoney: (amount: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${amount}`, strings: { translate: (key: string, value?: any) => key === 'continueWithTotal' ? `Continue · ${value?.values?.money}` : key }, reportError: () => {} };
  return { calls, bestCalls, controller, endSession: () => { sessionActive = false; }, insets, insetLeases, snapshot };
}

describe('cart checkout renderer', () => {
  it('allows a host-owned hold to continue and compensates the exact origin after host rejection', async () => {
    const runtime = setup(true); const renderer = await render(React.createElement(SeatLayerBookButton, { onCheckout: () => Promise.reject(new Error('host')) }));
    const button = renderer.root.findByProps({ accessibilityRole: 'button' });
    // Spec §3.10.3 rung 7: a hold exists with nothing pending.
    expect(button.props.accessibilityLabel).toBe('continueToCheckout');
    await act(async () => { button.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(runtime.calls).toEqual([['origin']]);
  });

  it('walks the checkout label ladder and never repeats the total in the footer', async () => {
    const runtime = setup();
    // Rung 8: tickets, no hold, so the caller's own wording stands.
    runtime.snapshot.hold = { active: false, owner: 'picker' };
    let renderer = await render(React.createElement(SeatLayerBookButton, { onCheckout: () => undefined }));
    let button = renderer.root.findByProps({ accessibilityRole: 'button' });
    expect(button.props.accessibilityLabel).toBe('holdAndCheckout');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('$20');
    // Rung 9: nothing picked.
    runtime.snapshot.cartLines = [];
    renderer = await render(React.createElement(SeatLayerBookButton, { onCheckout: () => undefined }));
    button = renderer.root.findByProps({ accessibilityRole: 'button' });
    expect(button.props.accessibilityLabel).toBe('selectSeats');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    // Rung 1 outranks everything else.
    runtime.snapshot.event.salesClosed = true;
    renderer = await render(React.createElement(SeatLayerBookButton, { onCheckout: () => undefined }));
    expect(renderer.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel).toBe('salesClosedCta');
  });

  it('serializes a rapid double press and drops a stale checkout completion after scope replacement', async () => {
    const runtime = setup(); let resolve!: (value: any) => void; let callbacks = 0;
    runtime.controller.checkout = () => new Promise((done) => { resolve = done; });
    const renderer = await render(React.createElement(SeatLayerBookButton, { onCheckout: () => { callbacks += 1; } }));
    const button = renderer.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    scope = { ...scope, sessionId: 2, snapshot: { ...runtime.snapshot, sessionId: 'replacement' } };
    await act(async () => { renderer.update(React.createElement(SeatLayerBookButton, { onCheckout: () => { callbacks += 1; } })); });
    resolve({ holdId: 'origin', expiresAt: 2, currency: 'USD', lineItems: [], total: 20 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(callbacks).toBe(0);
    expect(runtime.calls).toEqual([['origin']]);
  });

  it('delivers an exact deferred handoff after its CTA unmounts while the picker scope remains active', async () => {
    const runtime = setup();
    let resolve!: (handoff: any) => void;
    let callbacks = 0;
    runtime.controller.checkout = () => new Promise((done) => { resolve = done; });
    const renderer = await render(React.createElement(SeatLayerBookButton, {
      onCheckout: () => { callbacks += 1; },
    }));
    await act(async () => { renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress(); });
    await act(async () => { renderer.unmount(); });
    resolve({ holdId: 'origin', expiresAt: 2, currency: 'USD', lineItems: [], total: 20 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(callbacks).toBe(1);
    expect(runtime.calls).toEqual([]);
  });

  it('rejects an exact deferred handoff after the picker scope retires', async () => {
    const runtime = setup();
    let resolve!: (handoff: any) => void;
    let callbacks = 0;
    runtime.controller.checkout = () => new Promise((done) => { resolve = done; });
    const renderer = await render(React.createElement(SeatLayerBookButton, {
      onCheckout: () => { callbacks += 1; },
    }));
    await act(async () => { renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress(); });
    runtime.endSession();
    await act(async () => { renderer.unmount(); });
    resolve({ holdId: 'origin', expiresAt: 2, currency: 'USD', lineItems: [], total: 20 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(callbacks).toBe(0);
    expect(runtime.calls).toEqual([['origin']]);
  });

  it('keeps a busy reselect action visible and never renders an unresolved lapse duration', async () => {
    setup(); scope.holdLapse = { key: 'lapse', heldForMs: Number.NaN, lapsedLabels: ['A-1', 'A-2'], recoverableLabels: ['A-1'] }; scope.isHoldLapseBusy = true;
    const renderer = await render(React.createElement(SeatLayerHoldLapseNotice));
    const action = renderer.root.findByProps({ accessibilityRole: 'button' });
    expect(action.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('{n}');
  });

  it('shows only close when no recovery exists', async () => {
    setup(); scope.holdLapse = { key: 'lapse', lapsedLabels: ['A-1'], recoverableLabels: [] };
    const renderer = await render(React.createElement(SeatLayerHoldLapseNotice));
    expect(renderer.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel).toBe('close');
  });

  it('mounts the sheet, cart cards, and the empty best-seats form as scoped surfaces', async () => {
    const runtime = setup();
    const sheet = await render(React.createElement(SeatLayerCartSheet, { expanded: false, onExpandedChanged: () => {}, onCheckout: () => {} }));
    expect(sheet.root.findAllByType('View' as any).length).toBeGreaterThan(0);
    const list = await render(React.createElement(SeatLayerCartList));
    expect(list.toJSON()).not.toBeNull();
    runtime.snapshot.cartLines = [];
    const form = await render(React.createElement(SeatLayerBestSeatsForm));
    expect(form.root.findAllByProps({ accessibilityRole: 'button' }).length).toBeGreaterThan(0);
  });

  it('gives the sheet ONE named toggle in both states: the handle', async () => {
    setup();
    const changes: boolean[] = [];
    const props = (expanded: boolean) => React.createElement(SeatLayerCartSheet, {
      expanded, onExpandedChanged: (value: boolean) => { changes.push(value); }, onCheckout: () => {},
    });
    const renderer = await render(props(false));
    // NEVER TWO: a head toggle and a chevron over one action read as two
    // different things to press. The chevron is inside the handle now.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-head-toggle' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-disclosure' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-grabber' })).toHaveLength(0);
    const handle = renderer.root.findByProps({ testID: 'seatlayer-cart-handle' });
    expect(handle.props.accessibilityRole).toBe('button');
    expect(handle.props.accessibilityLabel).toBe('expandCart');
    expect(handle.props.accessibilityState).toMatchObject({ expanded: false });
    // The disc STRADDLES the sheet's own top edge: half over the map, half in
    // the sheet, and nothing drawn under it.
    const band = renderer.root.findByProps({ testID: 'seatlayer-cart-handle-band' });
    expect(band.props.style).toMatchObject({
      position: 'absolute', top: -seatLayerPickerTokens.size.sheetHandleOverhang,
    });
    expect(band.props.style.height)
      .toBe(seatLayerPickerTokens.size.sheetHandleOverhang + seatLayerPickerTokens.size.sheetHeadHeight);
    expect(handle.props.style({ pressed: false })).toMatchObject({
      borderRadius: seatLayerPickerTokens.radius.pill,
      height: seatLayerPickerTokens.size.sheetHandleHeight,
      width: seatLayerPickerTokens.size.sheetHandleWidth,
    });
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-head-strip' }).props.style)
      .toEqual({ height: seatLayerPickerTokens.size.sheetHeadHeight });
    // PORTS MUST NOT REINTRODUCE A PEEK BAR: there is no second summary and no
    // second Continue anywhere on the collapsed sheet.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-continue-pill' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-find-seats' })).toHaveLength(0);
    await act(async () => { handle.props.onPress(); });
    await act(async () => { renderer.update(props(true)); });
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-handle' }).props.accessibilityLabel)
      .toBe('collapseCart');
    await act(async () => { renderer.root.findByProps({ testID: 'seatlayer-cart-handle' }).props.onPress(); });
    expect(changes).toEqual([true, false]);
  });

  it('hides the handle while a confirm card is asking about a seat', async () => {
    setup();
    const renderer = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: () => {}, onCheckout: () => {},
    }));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-handle' })).toHaveLength(1);
    scope = { ...scope, pendingSeat: { id: 'pending', label: 'A-9' } };
    await act(async () => {
      renderer.update(React.createElement(SeatLayerCartSheet, {
        expanded: false, onExpandedChanged: () => {}, onCheckout: () => {},
      }));
    });
    // The disc sat half under the card's scrim, and the card is the only
    // question on the screen until it is answered.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-handle' })).toHaveLength(0);
  });

  it('draws the whole foot collapsed: the total line, the seats it holds, and the button', async () => {
    setup();
    const renderer = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: () => {}, onCheckout: () => {},
    }));
    const total = renderer.root.findByProps({ testID: 'seatlayer-cart-total-line' });
    // "N tickets · total" — and the total is said ONCE, on this line.
    expect(total.props.accessibilityLabel).toBe('ticketCount, $20');
    expect(total.props.accessibilityLiveRegion).toBe('polite');
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-foot-total' }).props.children).toBe('$20');
    // Under the count, the seats held — and the line opens the cards.
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-seats-line' }).props.children)
      .toBe('A \u00b7 1');
    expect(total.props.accessibilityRole).toBe('button');
    // A buyer with seats already held can SEE the button that takes their
    // money: the foot that carries it is never hidden at peek.
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-checkout' }).props.accessibilityLabel)
      .toBe('continueToCheckout');
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-foot' }).props.style)
      .toMatchObject({
        borderTopWidth: 0,
        paddingBottom: seatLayerPickerTokens.size.footPadBottom,
        paddingHorizontal: seatLayerPickerTokens.size.footPadX,
        paddingTop: seatLayerPickerTokens.size.footPadTop,
      });
  });

  it('says "No seats selected" on an empty cart and offers the finder on the same button', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    runtime.snapshot.hold = { active: false, owner: 'picker' };
    const changes: boolean[] = [];
    const renderer = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: (value: boolean) => changes.push(value), onCheckout: () => {},
    }));
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-total-line' }).props.accessibilityLabel)
      .toBe('noSeatsSelected');
    // No seats, so no seats line and no total.
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-seats-line' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-foot-total' })).toHaveLength(0);
    // ONE BUTTON, TWO DOORS: a press opens the sheet on the best-seats form.
    const button = renderer.root.findByProps({ testID: 'seatlayer-cart-checkout' });
    expect(button.props.accessibilityLabel).toBe('findBestSeatsCta');
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => { button.props.onPress(); });
    expect(changes).toEqual([true]);
  });

  it('uses the composition defaults only when their values are omitted', async () => {
    const runtime = setup();
    const sheet = await render(React.createElement(SeatLayerCartSheet, { expanded: true, onExpandedChanged: () => {}, onCheckout: () => {} }));
    expect(sheet.root.findAllByType(SeatLayerHoldLapseNotice)).toHaveLength(1);
    expect(sheet.root.findAllByType(SeatLayerCartList)).toHaveLength(1);
    expect(sheet.root.findAllByType(SeatLayerPickerActionError)).toHaveLength(1);
    expect(sheet.root.findAllByType(SeatLayerBookButton)).toHaveLength(1);
    runtime.snapshot.cartLines = [];
    // §3.11: one form, in the sheet's own body. A filled cart stays a cart.
    const empty = await render(React.createElement(SeatLayerCartSheet, { expanded: true, onExpandedChanged: () => {}, onCheckout: () => {} }));
    expect(empty.root.findAllByType(SeatLayerBestSeatsForm)).toHaveLength(1);
  });

  it('honors explicit null composition values without resurrecting built-ins', async () => {
    const runtime = setup();
    const absent = {
      cartList: null, bestSeats: null, checkoutBar: null, actionError: null, holdLapse: null,
    };
    const sheet = await render(React.createElement(SeatLayerCartSheet, {
      expanded: true, onExpandedChanged: () => {}, onCheckout: () => {}, ...absent,
    }));
    expect(sheet.root.findAllByType(SeatLayerHoldLapseNotice)).toHaveLength(0);
    expect(sheet.root.findAllByType(SeatLayerCartList)).toHaveLength(0);
    expect(sheet.root.findAllByType(SeatLayerPickerActionError)).toHaveLength(0);
    expect(sheet.root.findAllByType(SeatLayerBookButton)).toHaveLength(0);
    runtime.snapshot.cartLines = [];
    const empty = await render(React.createElement(SeatLayerCartSheet, {
      expanded: true, onExpandedChanged: () => {}, onCheckout: () => {}, ...absent,
    }));
    expect(empty.root.findAllByType(SeatLayerBestSeatsForm)).toHaveLength(0);
  });

  it('suppresses the built-in checkout CTA when checkoutBar is explicitly null', async () => {
    setup();
    const suppressed = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, checkoutBar: null, onExpandedChanged: () => {}, onCheckout: () => {},
    }));
    expect(suppressed.root.findAllByProps({ testID: 'seatlayer-cart-checkout' })).toHaveLength(0);
    const defaulted = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: () => {}, onCheckout: () => {},
    }));
    expect(defaulted.root.findAllByProps({ testID: 'seatlayer-cart-checkout' })).toHaveLength(1);
  });

  it('reports the whole collapsed block as the map\'s clearance, never a peek strip', async () => {
    const runtime = setup();
    const renderer = await render(React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: () => {}, onCheckout: () => {}, safeAreaBottomInset: 34,
    }));
    const panel = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]!;
    await act(async () => { panel.props.onLayout({ nativeEvent: { layout: { height: 168 } } }); });
    // Collapsed height is the height of the block it DRAWS — the handle, the
    // capped cart and the whole foot — never a fixed peek.
    expect(runtime.insets).toContainEqual({ bottom: 168 });
    expect(runtime.insetLeases).toHaveLength(1);
    expect(runtime.insetLeases[0]!.retired).toBe(false);
  });

  it('centres the by-line at the foot of the sheet and lets server branding hide it', async () => {
    const runtime = setup();
    runtime.snapshot.branding.attributionRequired = true;
    const props = () => React.createElement(SeatLayerCartSheet, {
      expanded: false, onExpandedChanged: () => {}, onCheckout: () => {}, safeAreaBottomInset: 34,
    });
    const renderer = await render(props());
    expect(renderer.root.findByProps({ accessibilityLabel: 'poweredBy' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-attribution-foot' }).props.style)
      .toMatchObject({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: seatLayerPickerTokens.size.attributionHeight,
      });
    // Server branding is authoritative: a white-label entitlement hides it.
    runtime.snapshot.branding.attributionRequired = false;
    await act(async () => { renderer.update(props()); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'poweredBy' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-attribution-foot' })).toHaveLength(0);
  });

  it('keeps empty guidance semantic while its best-seats controls remain discoverable', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    const renderer = await render(React.createElement(SeatLayerCartSheet, { expanded: true, onExpandedChanged: () => {}, onCheckout: () => {} }));
    expect(renderer.root.findAllByProps({ accessibilityRole: 'text' })
      .some((node) => JSON.stringify(node.props.children).includes('emptyTrayHint'))).toBe(true);
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' }).length).toBeGreaterThan(2);
  });

  it('submits exact best-available filters and disables the same surface for pending or host-held state', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }];
    runtime.snapshot.bestAvailableZones = [{ id: 'z1', label: 'Front' }];
    runtime.snapshot.map.categoryFilter = ['adult'];
    runtime.snapshot.map.focusedSectionId = 's1';
    runtime.snapshot.sections = [{ id: 's1', zoneId: 'z1' }];
    const renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    const buttons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    await act(async () => { buttons[buttons.length - 1]!.props.onPress(); await Promise.resolve(); });
    expect(runtime.bestCalls).toEqual([[2, { categoryKey: 'adult', zoneId: 'z1' }]]);
    scope = { ...scope, pendingSeat: { id: 'pending' } };
    await act(async () => { renderer.update(React.createElement(SeatLayerBestSeatsForm)); });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' }).every((button) => button.props.accessibilityState?.disabled !== false)).toBe(true);
  });

  it('forwards safe insets to the standalone best-seats prompt frame without making the scrim safe-area sized', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    // §3.11: where there is exactly ONE category the select is omitted and
    // takes no row, so a chart with a choice is what opens a chooser.
    runtime.snapshot.categories = [{ key: 'adult', label: 'Adult' }, { key: 'child', label: 'Child' }];
    let claims = 0;
    scope = {
      ...scope,
      claimPrompt: (_owner: string, kind: string, context: unknown) => ({
        lease: { context },
        open: () => { claims += 1; scope = { ...scope, presentation: { prompt: { kind, context } } }; return true; },
        dismiss: () => { scope = { ...scope, presentation: { prompt: null } }; return true; },
      }),
    };
    const safeAreaInsets = { top: 11, right: 17, bottom: 29, left: 5 };
    const form = await render(React.createElement(SeatLayerBestSeatsForm, { safeAreaInsets }));
    await act(async () => { form.root.findByProps({ accessibilityLabel: 'ticketType' }).props.onPress(); });
    await act(async () => { form.update(React.createElement(SeatLayerBestSeatsForm, { safeAreaInsets })); });
    expect(form.root.findByType(SeatLayerPickerPromptModal)).toBeTruthy();
    expect(form.root.findByProps({ testID: 'seatlayer-picker-bottom-sheet-scrim' }).props.style[0]).toMatchObject({ flex: 1 });
    const formSafe = form.root.findAllByProps({ pointerEvents: 'box-none' }).find((node) =>
      Array.isArray(node.props.style) && node.props.style[1]?.paddingRight === 33,
    )!;
    expect(formSafe.props.style[1]).toMatchObject({ paddingTop: 27, paddingRight: 33, paddingBottom: 45, paddingLeft: 21 });
    await act(async () => { form.root.findByProps({ testID: 'seatlayer-picker-bottom-sheet-backdrop' }).props.onPress(); });
    expect(runtime.bestCalls).toEqual([]);

  });

  it('prices the card at its line total, never at a unit the buyer did not pay', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [{ lineKey: 'two', label: 'A-2', objectId: 'two', quantity: 2, unitPrice: 20, currency: 'USD', rowLabel: 'A', seatNumber: '2' }];
    const renderer = await render(React.createElement(SeatLayerCartList));
    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('$40');
    expect(renderer.root.findByProps({ testID: 'seatlayer-cart-card' }).props.accessibilityLabel)
      .toContain('$40');
  });

  it('draws one card per seat and does not repeat the category on the line', async () => {
    const runtime = setup();
    runtime.snapshot.categories = [{ key: 'guest', label: 'Guest tables', color: '#D45C87' }];
    runtime.snapshot.cartLines = [1, 2, 3].map((number) => ({
      categoryKey: 'guest', currency: 'USD', label: `T22-${number}`,
      lineKey: `line-${number}`, objectId: `seat-${number}`, objectType: 'seat',
      quantity: 1, rowLabel: 'T22', seatNumber: String(number),
      sectionLabel: 'Guest Tables', unitPrice: 20,
    }));
    const renderer = await render(React.createElement(SeatLayerCartList));
    expect(renderer.root.findAllByProps({ testID: 'seatlayer-cart-card' })).toHaveLength(3);
    // The type is not repeated where it is already the name of the card: on a
    // chart whose section and category read the same, hearing both is a
    // spoken stutter.
    expect(renderer.root.findByProps({ accessibilityLabel: 'Guest Tables · T22 · 1, $20' })).toBeTruthy();
    const output = JSON.stringify(renderer.toJSON());
    expect(output).not.toContain('Guest tables · Guest Tables');
  });

  it('uses the scoped action-error surface, including its Close control', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    scope = { ...scope, error: { message: 'retry' } };
    const renderer = await render(React.createElement(SeatLayerCartSheet, { expanded: true, onExpandedChanged: () => {}, onCheckout: () => {} }));
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'close' }).length).toBeGreaterThan(0);
  });

  it('keeps disabled best-seat controls truthful with 44 hit targets around 44 painted controls', async () => {
    const runtime = setup();
    runtime.snapshot.cartLines = [];
    scope = { ...scope, readOnly: true, strings: { translate: (key: string) => key === 'findBestSeats' ? 'A deliberately long localized best seats action' : key } };
    const renderer = await render(React.createElement(SeatLayerBestSeatsForm));
    const stepper = renderer.root.findByProps({ testID: 'seatlayer-best-seats-stepper' });
    const keys = stepper.findAllByProps({ accessibilityRole: 'button' })
      .filter((node) => typeof node.props.style === 'object' && node.props.style !== null);
    // The key is painted at the reference's 34 and reaches 44 through slop:
    // a 44 BOX would walk both keys five points off the stepper's geometry.
    expect(keys[0]!.props.style.minHeight).toBe(34);
    expect(keys[0]!.props.hitSlop).toBe(5);
    expect(renderer.root.findAll(hasPaint).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType('Text' as any).some((node) => node.props.numberOfLines === 1)).toBe(true);
  });

  it('swells the count 1.3x with an accent blink, and only once the chip has landed', async () => {
    const runtime = setup();
    const props = (landing: boolean, lines: unknown[]) => {
      // A new snapshot object per revision, as the controller publishes them.
      scope = { ...scope, snapshot: { ...runtime.snapshot, cartLines: lines } };
      return React.createElement(SeatLayerCartSheet, {
        expanded: false, onExpandedChanged: () => {}, onCheckout: () => {}, cartLanding: landing,
      });
    };
    const renderer = await render(props(true, []));
    timings.length = 0;
    // A chip is still in the air: the number holds still.
    await act(async () => {
      renderer.update(props(true, [{ lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 20, currency: 'USD' }]));
    });
    expect(timings.some((call) =>
      (call[1] as { duration?: number }).duration === seatLayerPickerTokens.motion.duration.bump)).toBe(false);
    // It lands, and the swell runs on `motion.duration.bump`.
    await act(async () => {
      renderer.update(props(false, [{ lineKey: 'one', label: 'A-1', objectId: 'one', quantity: 1, unitPrice: 20, currency: 'USD' }]));
    });
    expect(timings.some((call) =>
      (call[1] as { duration?: number }).duration === seatLayerPickerTokens.motion.duration.bump)).toBe(true);
    // Out to 1.3x at forty-five per cent, and back; the ink blinks to the accent.
    expect(interpolations).toContainEqual({ inputRange: [0, .45, 1], outputRange: [1, 1.3, 1] });
    expect(interpolations).toContainEqual({ inputRange: [0, .45, 1], outputRange: ['#111', '#06f', '#111'] });
  });

  it('paints hold-lapse actions at 44 inside their 44 target', async () => {
    setup();
    scope.holdLapse = { key: 'lapse', heldForMs: 1, lapsedLabels: ['A-1'], recoverableLabels: [] };
    const renderer = await render(React.createElement(SeatLayerHoldLapseNotice));
    expect(renderer.root.findByProps({ accessibilityRole: 'button' }).props.style[1].minHeight).toBe(44);
    expect(renderer.root.findAll(hasPaint).length).toBeGreaterThan(0);
  });
});
