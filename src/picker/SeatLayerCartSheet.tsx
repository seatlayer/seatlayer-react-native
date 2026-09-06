import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SeatLayerPickerAttribution } from './attribution';
import { SeatLayerPickerActionError } from './actionError';
import { SeatLayerPickerSalesClosedStatement } from './SeatLayerPickerAccessPanel';
import { SeatLayerBestSeatsForm } from './SeatLayerBestSeatsForm';
import { SeatLayerCartList } from './SeatLayerCartList';
import { SeatLayerHoldLapseNotice } from './SeatLayerHoldLapseNotice';
import {
  seatLayerPickerCardAsking, useSeatLayerPickerSeatRemovalSeat,
} from './seatConfirmationRemoval';
import { SeatLayerSheetHandle } from './sheetHandle';
import { SeatLayerSheetFoot } from './sheetFoot';
import { SeatLayerSheetFinderProvider, useSeatLayerSheetFinder } from './sheetFinder';
import { seatLayerCheckoutCtaState, type SeatLayerCheckoutCtaState } from './checkoutCta';
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from './safeAreaInsets';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartSheet,
  seatLayerCartSheetCeilings,
} from './cartSheetUi';
import {
  seatLayerSheetAnswer,
  seatLayerSheetDetents,
  seatLayerSheetHeightOf,
  seatLayerSheetRubberBanded,
  seatLayerSheetSpring,
  seatLayerSheetTop,
  type SeatLayerSheetDetent,
  type SeatLayerSheetDetents,
} from './sheetDrag';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { supportsSeatLayerPickerSurface } from './surfaces';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerSheetLayout } from './sheetLayout';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import { seatLayerPickerBold } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

/**
 * The buyer's cart, docked at the bottom of the phone.
 *
 * ONE SURFACE, AND THE COLLAPSED SHEET IS THE FOOTER (spec §3.9). It used to be
 * three stacked blocks that had each been designed well on its own and none of
 * which agreed with the others: a chrome band carrying a bespoke one-liner,
 * then a bordered list on its own ground, then a shadowed foot. Two summaries
 * of one cart is two things to keep in step, and they drifted — a buyer with
 * seats already held could not see the button that takes their money, because
 * the foot that carries it was hidden at peek. PORTS MUST NOT REINTRODUCE A
 * PEEK BAR.
 *
 * Collapsed it is the handle, the total line, the button and the by-line; the
 * cards wait behind the handle. Opening lifts the cart's cap and adds what
 * there is no room to read at peek: the closed-sales statement and, on an empty
 * cart, the best-seats form.
 *
 * It never opens itself. A sheet that springs up when a seat is picked covers
 * the map the buyer is still choosing from.
 */

type Scope = ReturnType<typeof useSeatLayerPickerScope>;
type BookSlots = Pick<SeatLayerPickerStyles, 'continueButton' | 'continueButtonText'>;

export interface SeatLayerCartSheetProps {
  readonly expanded: boolean;
  readonly onExpandedChanged: (expanded: boolean) => unknown;
  readonly onCheckout: (handoff: Readonly<SeatLayerPickerCheckoutHandoff>) => unknown;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles,
    'sheetContainer' | 'peekContainer' | 'peekSummaryText' | 'continueButton' |
    'continueButtonText' | 'errorContainer' | 'errorText'>;
  readonly safeAreaBottomInset?: number;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly reserveBottomInset?: boolean;
  readonly cartList?: ReactNode;
  readonly bestSeats?: ReactNode;
  readonly checkoutBar?: ReactNode;
  readonly actionError?: ReactNode;
  readonly holdLapse?: ReactNode;
  /** §3.13.4: the tray states a closed sale; it is not an error and not a toast. */
  readonly salesClosed?: ReactNode;
  /**
   * True while a selection chip is still flying toward the cart. Overrides
   * `SeatLayerCartLandingProvider`; the total line holds its swell until it
   * falls to false.
   */
  readonly cartLanding?: boolean;
}

export interface SeatLayerBookButtonProps {
  readonly onCheckout: (handoff: Readonly<SeatLayerPickerCheckoutHandoff>) => unknown;
  /**
   * Opens the best-seats form, where this button is the only thing on screen
   * and an empty cart would otherwise leave it dead. Null on a width that shows
   * the map beside the panel.
   */
  readonly onFindBestSeats?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: BookSlots;
}

function canRejectHandoff(controller: Scope['controller']): boolean {
  return supportsSeatLayerPickerSurface(
    controller,
    ['checkout-handoff-reject-v1'],
    ['picker.rejectHandoff'],
  );
}

/**
 * The controller's composite permission. `removingCartLine` is deliberately
 * absent from it: a removal never blocks checkout, because inventory mutations
 * are serialised and a Continue pressed during one is sent after it.
 */
function checkoutAllowed(scope: Scope): boolean {
  const snapshot = scope.controller.getSnapshot();
  return snapshot !== undefined && scope.isReady && !scope.readOnly && !scope.blocksCheckout &&
    scope.pendingSeat === null && !snapshot.event.salesClosed &&
    snapshot.selectionValidity?.isValid !== false &&
    projectSeatLayerCartSheet(snapshot, null).confirmed.items.length > 0 &&
    supportsSeatLayerPickerSurface(scope.controller, ['checkout-handoff-v1'], ['picker.continue']);
}

/** One checkout flight, shared by every surface that draws the call to action. */
function useSeatLayerCheckoutFlight(
  onCheckout: SeatLayerBookButtonProps['onCheckout'],
): Readonly<{ busy: boolean; press: () => void }> {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbackRef = useRef(onCheckout);
  const mountedRef = useRef(true);
  const flightRef = useRef(0);
  const nextFlightRef = useRef(0);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => { scopeRef.current = scope; callbackRef.current = onCheckout; }, [onCheckout, scope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; flightRef.current = 0; nextFlightRef.current += 1; };
  }, []);
  useLayoutEffect(() => {
    flightRef.current = 0;
    nextFlightRef.current += 1;
    setBusy(false);
  }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);
  const checkout = async () => {
    const before = scopeRef.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    if (!lease || flightRef.current || !checkoutAllowed(before)) return;
    const flight = ++nextFlightRef.current;
    flightRef.current = flight;
    setBusy(true);
    try {
      const handoff = await before.controller.checkout();
      if (!before.isSessionActive() || !isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        if (canRejectHandoff(before.controller)) {
          try { await before.controller.rejectHandoff(handoff.holdId); } catch { /* best effort */ }
        }
        return;
      }
      try {
        await Promise.resolve(callbackRef.current(Object.freeze({
          ...handoff,
          lineItems: Object.freeze(handoff.lineItems.map((line) => Object.freeze({ ...line }))),
        })));
      } catch (error) {
        if (canRejectHandoff(before.controller)) {
          try { await before.controller.rejectHandoff(handoff.holdId); } catch { /* best effort */ }
        }
        throw error;
      }
    } catch (error) {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        try { scopeRef.current.reportError(error); } catch { /* contained */ }
      }
    } finally {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        flightRef.current = 0;
        setBusy(false);
      }
    }
  };
  return { busy, press: () => { void checkout(); } };
}

/** The one resolved reading of the call to action, for whichever surface draws it. */
export function useSeatLayerCheckoutCta(
  handoffInFlight: boolean,
  canOfferFind = false,
): SeatLayerCheckoutCtaState {
  const scope = useSeatLayerPickerScope();
  const projection = projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat);
  // No runtime field distinguishes a held line from a freshly picked one, so
  // `Secure more` stays unreachable until one does — exactly as in Flutter.
  return seatLayerCheckoutCtaState({
    canCheckout: checkoutAllowed(scope),
    canOfferFind,
    handoffInFlight,
    label: scope.strings.translate('holdAndCheckout'),
    pendingCount: 0,
    seatCardOpen: scope.pendingSeat !== null,
    snapshot: scope.snapshot,
    strings: scope.strings,
    ticketCount: projection.totals.quantity,
  });
}

/** Whether the finder may be offered at all: the same gate the tray's card is under. */
function bestSeatsAllowed(scope: Scope, offered: boolean): boolean {
  return offered && !scope.pendingSeat && !scope.readOnly && !scope.isBusy && scope.isReady &&
    !scope.snapshot?.event.salesClosed && scope.snapshot?.hold.owner !== 'host' &&
    scope.snapshot?.hold.active !== true &&
    scope.snapshot?.selectionValidity?.isValid !== false &&
    supportsSeatLayerPickerSurface(scope.controller, ['picker-actions-v1'], ['picker.bestAvailable']);
}

/**
 * The foot's call to action (spec §3.10.3). Full width, and carrying NOTHING
 * BUT ITS OWN LABEL — the total is on the line above it, and stating it twice
 * on one foot is how the button came to be read as a second, different price.
 *
 * ONE BUTTON, TWO DOORS: with an empty cart on a phone it offers the best-seats
 * form instead of a disabled label.
 */
export function SeatLayerBookButton(props: SeatLayerBookButtonProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const flight = useSeatLayerCheckoutFlight(props.onCheckout);
  // The sheet's own door, unless this button was given one of its own.
  const inherited = useSeatLayerSheetFinder();
  const openFinder = props.onFindBestSeats ?? inherited;
  const cta = useSeatLayerCheckoutCta(
    flight.busy,
    openFinder !== undefined && bestSeatsAllowed(scope, true),
  );
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const disabled = !cta.enabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      accessibilityState={{ busy: cta.busy, disabled }}
      disabled={disabled}
      onPress={cta.findsBestSeats ? openFinder : flight.press}
      testID="seatlayer-cart-checkout"
      style={{ justifyContent: 'center' }}
    >
      <View style={[{
        alignItems: 'center',
        alignSelf: 'stretch',
        // Disabled is a DESIGNED state, not a Material grey: a reason stated on
        // a button that cannot be pressed still has to be read, on the dark
        // scene sheet as much as on the light one.
        backgroundColor: disabled ? theme.colors.surface : theme.colors.accent,
        borderColor: disabled ? theme.colors.divider : 'transparent',
        borderRadius: seatLayerPickerTokens.radius.button,
        borderWidth: disabled ? seatLayerPickerLineWidth : 0,
        flexDirection: 'row',
        gap: 8,
        height: seatLayerPickerTokens.size.checkoutButtonHeight,
        justifyContent: 'center',
        paddingHorizontal: 12,
      }, styles.continueButton, sanitizeSeatLayerPickerStyle(props.style)]}>
        {cta.busy ? <Spinner color={disabled ? theme.colors.mutedText : theme.colors.onAccent} /> : null}
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} ellipsizeMode="tail" style={[{
          color: disabled ? theme.colors.mutedText : theme.colors.onAccent,
          flexShrink: 1,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.bookButton.size,
          fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.bookButton.weight),
        }, styles.continueButtonText]}>{cta.label}</Text>
      </View>
    </Pressable>
  );
}

function Spinner({ color }: Readonly<{ color: string }>): React.ReactElement {
  const spin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useSeatLayerPickerReducedMotion();
  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      duration: 900, easing: Easing.linear, toValue: 1, useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, spin]);
  return <Animated.View accessible={false} testID="seatlayer-cart-checkout-spinner" style={{
    borderColor: color,
    borderRadius: 8,
    borderTopColor: 'transparent',
    borderWidth: 2,
    height: 16,
    transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
    width: 16,
  }} />;
}

/** A real bottom sheet: the finger moves it, and a spring puts it down. */
export function SeatLayerCartSheet(props: SeatLayerCartSheetProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const window = useWindowDimensions();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const theme = useMemo(
    () => resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot),
    [scope.resolvedTheme, scope.snapshot],
  );
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const reserve = props.reserveBottomInset !== false;
  const safeInsets = normalizeSeatLayerPickerSafeAreaInsets(
    props.safeAreaInsets === undefined ? { bottom: props.safeAreaBottomInset } : props.safeAreaInsets,
    window,
  );
  const inset = reserve ? safeInsets.bottom : 0;
  const runtimeSession = scope.snapshot?.sessionId;
  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.pendingSeat, scope.snapshot],
  );
  const hasTickets = projection.confirmed.items.length > 0;
  const attributionRequired = scope.snapshot?.branding.attributionRequired === true;
  // The handle leaves while a confirm card is up: the disc sat half under the
  // card's scrim, and the card is the only question on the screen until it is
  // answered.
  const removalSeat = useSeatLayerPickerSeatRemovalSeat();
  // §3.8.1 — the ONE boolean. The handle used to read `pendingSeat` alone,
  // which left it drawn under the REMOVE card: a second thing to press while
  // the card is the only question on screen.
  const confirming = seatLayerPickerCardAsking(scope, removalSeat);

  // Everything that is NOT the cart region, measured rather than assumed: the
  // foot grows with the platform's text size, with a lapse notice and with an
  // inline error, and a cap derived from a guess would clip the button.
  const [footHeight, setFootHeight] = useState(0);
  const [cartNatural, setCartNatural] = useState(0);
  const [extrasNatural, setExtrasNatural] = useState(0);
  const headHeight = seatLayerPickerSheetLayout(theme).sheetHeadHeight;
  const chrome = headHeight + footHeight + inset;
  const ceilings = seatLayerCartSheetCeilings(window.height, chrome, hasTickets, theme.layout);
  // THREE CARDS AND A SLIVER OF THE FOURTH, open or shut: the cart scrolls
  // inside its own box and the map keeps its room.
  const openNatural = Math.min(cartNatural, seatLayerPickerSheetLayout(theme).cartPeekMaxHeight) + extrasNatural;
  const detents = useMemo(() => seatLayerSheetDetents({
    content: Math.max(0, Math.min(openNatural, ceilings.body)),
    full: Math.max(0, Math.min(openNatural, ceilings.full)),
  }), [ceilings.body, ceilings.full, openNatural]);

  const extent = useRef(new Animated.Value(0)).current;
  const extentValue = useRef(0);
  const detentRef = useRef<SeatLayerSheetDetent>(props.expanded ? 'content' : 'peek');
  const detentsRef = useRef<SeatLayerSheetDetents>(detents);
  detentsRef.current = detents;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const expandedRef = useRef(props.expanded);
  const changeRef = useRef(props.onExpandedChanged);
  changeRef.current = props.onExpandedChanged;
  useEffect(() => {
    const id = extent.addListener(({ value }) => { extentValue.current = value; });
    return () => extent.removeListener(id);
  }, [extent]);

  const settle = (detent: SeatLayerSheetDetent, velocity: number, publish = true) => {
    detentRef.current = detent;
    const target = seatLayerSheetHeightOf(detentsRef.current, detent);
    if (publish) {
      const open = detent !== 'peek';
      if (open !== expandedRef.current) {
        expandedRef.current = open;
        try { void Promise.resolve(changeRef.current(open)).catch(() => {}); } catch { /* controlled */ }
      }
    }
    // §4.4 — a spring has no reduced form, so under reduced motion the sheet is
    // simply at its detent.
    if (reducedMotionRef.current) {
      extent.setValue(target);
      extentValue.current = target;
      return;
    }
    Animated.spring(extent, {
      damping: seatLayerSheetSpring.damping,
      mass: seatLayerSheetSpring.mass,
      stiffness: seatLayerSheetSpring.stiffness,
      toValue: target,
      useNativeDriver: false,
      velocity,
    }).start();
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // The host — or the map, which collapses the sheet when the buyer taps it —
  // has moved the sheet. Full is never entered this way: it is a place the
  // buyer's own finger reaches.
  useEffect(() => {
    expandedRef.current = props.expanded;
    if (props.expanded === (detentRef.current !== 'peek')) return;
    settleRef.current(props.expanded ? 'content' : 'peek', 0, false);
  }, [props.expanded]);
  // A new session is a new cart: the sheet starts where the host says it does.
  useLayoutEffect(() => {
    detentRef.current = props.expanded ? 'content' : 'peek';
    const target = seatLayerSheetHeightOf(detentsRef.current, detentRef.current);
    extent.setValue(target);
    extentValue.current = target;
  }, [runtimeSession, scope.controller, scope.sessionId]);
  // Keep the sheet standing on its own detent when the detent itself moves — a
  // rotated phone, a cart that grew, a keyboard that took the screen.
  useEffect(() => {
    const resting = seatLayerSheetHeightOf(detents, detentRef.current);
    if (Math.abs(extentValue.current - resting) < .5 || dragging.current) return;
    extent.setValue(resting);
    extentValue.current = resting;
  }, [detents, extent]);

  const dragging = useRef(false);
  const raw = useRef(0);
  const travel = useRef(0);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      extent.stopAnimation((value) => { extentValue.current = value; });
      dragging.current = true;
      travel.current = 0;
      raw.current = extentValue.current;
    },
    onPanResponderMove: (_event, gesture) => {
      // Up grows the sheet: the finger and the top edge move together. Below
      // peek there is nowhere to shrink, so the band gives and the whole
      // surface leaves the bottom edge with the finger.
      travel.current = -gesture.dy;
      const next = seatLayerSheetRubberBanded(
        raw.current + travel.current, 0, seatLayerSheetTop(detentsRef.current),
      );
      extent.setValue(next);
      extentValue.current = next;
    },
    onPanResponderRelease: (_event, gesture) => {
      dragging.current = false;
      const stops = detentsRef.current;
      const velocity = -gesture.vy * 1_000;
      const detent = seatLayerSheetAnswer(
        stops, detentRef.current, extentValue.current, velocity, -gesture.dy,
      );
      settleRef.current(detent, velocity);
    },
    onPanResponderTerminate: () => {
      dragging.current = false;
      settleRef.current(detentRef.current, 0, false);
    },
  })).current;

  // The map's clearance is the sheet: the whole collapsed block, and whatever
  // the open one has lifted above it.
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const insetLease = useMemo(
    () => reserve ? scope.claimViewportInsetBand('cart-sheet') : undefined,
    [reserve, scope.claimViewportInsetBand, scope.controller, scope.sessionId],
  );
  useEffect(() => {
    if (!insetLease) return;
    insetLease.set({ bottom: collapsedHeight + (props.expanded ? detents.content : 0) });
  }, [collapsedHeight, detents.content, insetLease, props.expanded, runtimeSession, scope.controller, scope.sessionId]);
  useEffect(() => {
    if (!insetLease) return undefined;
    return () => insetLease.remove();
  }, [insetLease]);

  const disclosure = useRef(new Animated.Value(props.expanded ? 1 : 0)).current;
  useEffect(() => {
    const motion = resolveSeatLayerPickerMotion('chevron', reducedMotion, props.expanded ? 'easeEnter' : 'easeExit');
    disclosure.stopAnimation();
    if (motion.durationMs === 0) {
      disclosure.setValue(props.expanded ? 1 : 0);
      return undefined;
    }
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(disclosure, {
      duration: motion.durationMs, easing: Easing.bezier(x1, y1, x2, y2),
      toValue: props.expanded ? 1 : 0, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [disclosure, props.expanded, reducedMotion]);

  const ask = (open: boolean) => settleRef.current(open ? 'content' : 'peek', 0);
  const cartList = props.cartList === undefined ? <SeatLayerCartList /> : props.cartList;
  const bestSeats = props.bestSeats === undefined
    ? <SeatLayerBestSeatsForm safeAreaInsets={safeInsets} /> : props.bestSeats;
  const holdLapse = props.holdLapse === undefined ? <SeatLayerHoldLapseNotice /> : props.holdLapse;
  const actionError = props.actionError === undefined ? <SeatLayerPickerActionError /> : props.actionError;
  const salesClosed = props.salesClosed === undefined
    ? <SeatLayerPickerSalesClosedStatement /> : props.salesClosed;
  const checkoutBar = props.checkoutBar === undefined
    ? <SeatLayerBookButton onCheckout={props.onCheckout} />
    : props.checkoutBar;
  const toggleLabel = scope.strings.translate(props.expanded ? 'collapseCart' : 'expandCart');
  // The cart region never goes below zero: an overdrag past peek moves the
  // whole surface off the bottom edge instead, and the spring puts it back.
  const body = extent.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' });
  const belowPeek = extent.interpolate({ inputRange: [-1, 0], outputRange: [1, 0], extrapolateRight: 'clamp' });

  return (
    <View
      // The disc's upper half is drawn OUTSIDE this box; a clipped parent
      // neither paints nor hit-tests it.
      style={[{ overflow: 'visible' }, sanitizeSeatLayerPickerStyle(props.style)]}
      testID="seatlayer-cart-sheet"
    >
      {/* The empty cart's way in to the best-seats form. Still a FORM, not a
          verb: the form only exists inside the open sheet, so the press opens
          the sheet on it — and a host-supplied checkout bar keeps the door. */}
      <SeatLayerSheetFinderProvider onFindBestSeats={() => ask(true)}>
      <Animated.View style={{ transform: [{ translateY: belowPeek }] }}>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          if (!props.expanded) setCollapsedHeight(event.nativeEvent.layout.height);
        }}
        style={[{
          // The PANEL'S own ground, not the card's: the cards inside are on
          // `surface`, and a sheet painted the same colour would leave them
          // with nothing to sit on.
          backgroundColor: theme.roles.sheet.background,
          // A hairline and nothing else above it: an upward shadow read as a
          // grey band over the map on a phone.
          borderTopColor: theme.colors.divider,
          borderTopLeftRadius: seatLayerPickerTokens.radius.sheet,
          borderTopRightRadius: seatLayerPickerTokens.radius.sheet,
          borderTopWidth: seatLayerPickerLineWidth,
          // A HAIRLINE AND NOTHING ELSE ABOVE IT. The web's upward shadow
          // read as a grey band over the map on a phone — a few points of
          // nothing between the venue and the handle — and the disc is lifted
          // by its own shadow instead.
          elevation: seatLayerPickerTokens.elevation.sheet,
          paddingBottom: inset,
        }, styles.sheetContainer]}
      >
        {/* The lower half of the handle, and NOTHING DRAWN UNDER IT: no
            divider, no band. */}
        <View style={{ height: headHeight }} testID="seatlayer-cart-head-strip" />
        <Animated.View style={{ height: body, overflow: 'hidden' }} testID="seatlayer-cart-region">
          <ScrollView
            // The list scrolls inside its own box rather than pushing the
            // sheet: the map keeps its room whatever the cart holds.
            contentContainerStyle={{ paddingHorizontal: seatLayerPickerTokens.size.cartTrayPadX }}
            style={{ flexGrow: 0 }}
          >
            {/* An empty cart takes no gutters at all: the tray's own padding
                around nothing is a band of daylight under the handle. */}
            <View
              onLayout={(event) => setCartNatural(event.nativeEvent.layout.height)}
              style={hasTickets
                ? {
                  paddingBottom: seatLayerPickerTokens.size.cartTrayPadBottom,
                  paddingTop: seatLayerPickerTokens.size.cartTrayPadTop,
                }
                : undefined}
            >{hasTickets ? cartList : null}</View>
            {/* The extras stay LAID OUT while the sheet is shut — off-screen,
                not unmounted — so the sheet always knows how tall it would open
                to, and opens straight to it rather than springing to a guess. */}
            <View
              onLayout={(event) => setExtrasNatural(event.nativeEvent.layout.height)}
              pointerEvents={props.expanded ? 'auto' : 'none'}
              style={props.expanded
                ? { paddingBottom: seatLayerPickerTokens.size.cartTrayPadBottom, paddingTop: hasTickets ? 0 : seatLayerPickerTokens.size.cartTrayPadTop }
                : { left: 0, opacity: 0, paddingBottom: seatLayerPickerTokens.size.cartTrayPadBottom, position: 'absolute', right: 0, top: 0 }}
              testID="seatlayer-cart-extras"
            >
              {salesClosed}
              {hasTickets
                ? null
                : (
                  <>
                    {/* The hint is read out, never drawn: on a screen showing a
                        seat map and a form for finding seats, a sentence saying
                        you may tap a seat is the tray's tallest element saying
                        the least. */}
                    <Text
                      accessibilityRole="text"
                      maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
                      style={{ height: 1, opacity: 0, position: 'absolute', width: 1 }}
                    >{scope.strings.translate('emptyTrayHint')}</Text>
                    {bestSeats}
                  </>
                )}
            </View>
          </ScrollView>
        </Animated.View>
        <View onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}>
          <SeatLayerSheetFoot
            actionError={actionError}
            attribution={attributionRequired ? <SeatLayerPickerAttribution compact /> : null}
            checkoutBar={checkoutBar}
            collapsed={!props.expanded}
            divider={props.expanded && hasTickets}
            holdLapse={holdLapse}
            {...(props.cartLanding === undefined ? {} : { landing: props.cartLanding })}
            onOpenCart={() => ask(true)}
            totalStyle={styles.peekSummaryText}
          />
        </View>
      </View>
      </Animated.View>
      </SeatLayerSheetFinderProvider>
      {confirming
        ? null
        : (
          <SeatLayerSheetHandle
            expanded={props.expanded}
            label={toggleLabel}
            onPress={() => ask(!props.expanded)}
            panHandlers={pan.panHandlers}
            progress={disclosure}
            theme={theme}
          />
        )}
    </View>
  );
}
