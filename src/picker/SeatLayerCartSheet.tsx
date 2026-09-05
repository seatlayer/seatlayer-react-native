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
  StyleSheet,
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
  SeatLayerCartPeekHead,
  SeatLayerFindSeatsPill,
  SeatLayerPeekContinuePill,
  SeatLayerSheetChevron,
  SeatLayerSheetFoot,
} from './cartPeekHead';
import { seatLayerCheckoutCtaState, type SeatLayerCheckoutCtaState } from './checkoutCta';
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from './safeAreaInsets';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { CartSheetMeasurementCoordinator } from './cartSheetState';
import {
  captureSeatLayerCartActionLease,
  cartSheetMaximumBodyHeight,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartSheet,
  seatLayerCartCheapestPrice,
} from './cartSheetUi';
import {
  seatLayerSheetDetentAt,
  seatLayerSheetDetents,
  seatLayerSheetRubberBanded,
  seatLayerSheetSettle,
  seatLayerSheetSpring,
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
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerFontWeight } from './fontWeight';
import type { SeatLayerPickerCheckoutHandoff } from './models';

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
}

export interface SeatLayerBookButtonProps {
  readonly onCheckout: (handoff: Readonly<SeatLayerPickerCheckoutHandoff>) => unknown;
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

/** One checkout flight, shared by the peek pill and the sheet's own footer. */
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
  const totalText = projection.totals.currency === null
    ? undefined
    : scope.formatMoney(projection.totals.total, projection.totals.currency);
  const cheapest = seatLayerCartCheapestPrice(scope.snapshot);
  // No runtime field distinguishes a held line from a freshly picked one, so
  // `Secure more` stays unreachable until one does — exactly as in Flutter.
  const pendingCount = 0;
  return seatLayerCheckoutCtaState({
    canCheckout: checkoutAllowed(scope),
    canOfferFind,
    handoffInFlight,
    label: scope.strings.translate('holdAndCheckout'),
    pendingCount,
    seatCardOpen: scope.pendingSeat !== null,
    snapshot: scope.snapshot,
    strings: scope.strings,
    ticketCount: projection.totals.quantity,
    ...(totalText === undefined ? {} : { totalText }),
    ...(cheapest === undefined
      ? {}
      : { fromPriceText: scope.formatMoney(cheapest, scope.snapshot?.currency ?? '') }),
  });
}

/**
 * The sheet's footer button (spec §3.10.3). It carries ITS OWN LABEL ONLY — the
 * total is already on the peek bar — and its disabled state is designed rather
 * than a Material grey, which vanishes on the dark scene sheet.
 */
export function SeatLayerBookButton(props: SeatLayerBookButtonProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const flight = useSeatLayerCheckoutFlight(props.onCheckout);
  const cta = useSeatLayerCheckoutCta(flight.busy);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const disabled = !cta.enabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      accessibilityState={{ busy: cta.busy, disabled }}
      disabled={disabled}
      onPress={flight.press}
      testID="seatlayer-cart-checkout"
      style={{ justifyContent: 'center', paddingBottom: 6, paddingHorizontal: 12, paddingTop: 6 }}
    >
      <View style={[{
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: disabled ? theme.colors.surface : theme.colors.accent,
        borderColor: disabled ? theme.colors.divider : 'transparent',
        borderRadius: seatLayerPickerTokens.radius.button,
        borderWidth: disabled ? StyleSheet.hairlineWidth : 0,
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
          fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.bookButton.weight),
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

/** A real bottom sheet: peek, content and full detents, tracking the finger. */
export function SeatLayerCartSheet(props: SeatLayerCartSheetProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const window = useWindowDimensions();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const measurement = useRef(new CartSheetMeasurementCoordinator());
  const disclosureProgress = useRef(new Animated.Value(props.expanded ? 1 : 0)).current;
  const summarySwell = useRef(new Animated.Value(0)).current;
  const previousConfirmedQuantity = useRef<number | undefined>(undefined);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const runtimeSession = scope.snapshot?.sessionId;
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
  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.pendingSeat, scope.snapshot],
  );
  const hasTickets = projection.confirmed.items.length > 0;
  const confirmedQuantity = projection.totals.quantity;
  const attributionRequired = scope.snapshot?.branding.attributionRequired === true;
  // THE BAR IS EXACTLY ITS HEAD. The collapsed clip is derived from the head
  // the sheet holds — never a second number.
  const headHeight = Math.max(
    seatLayerPickerTokens.size.minimumHitTarget,
    // §4.10 — the collapsed bar grows with what is in it; unchanged at 1.0.
    seatLayerPickerScaledExtent(
      theme.layout?.peekHeight ?? seatLayerPickerTokens.size.peekHeight,
      seatLayerPickerTypeScaleClamp('peek'),
    ),
  );
  const openHeadHeight = seatLayerPickerTokens.size.sheetOpenHeadHeight +
    seatLayerPickerTokens.size.peekClockLift;
  const detents = useMemo(() => seatLayerSheetDetents({
    bottomInset: inset,
    contentHeight: contentHeight + openHeadHeight,
    hasTickets,
    peekHeight: headHeight,
    viewportHeight: window.height,
  }), [contentHeight, hasTickets, headHeight, inset, openHeadHeight, window.height]);
  const bodyCap = cartSheetMaximumBodyHeight(window.height, inset, headHeight);
  const key = measurement.current.begin({
    controller: scope.controller, sessionId: scope.sessionId, runtimeSessionId: runtimeSession, expanded: props.expanded, ownsChrome: true,
  }, 0);
  const insetLease = useMemo(
    () => reserve ? scope.claimViewportInsetBand('cart-sheet') : undefined,
    [reserve, scope.claimViewportInsetBand, scope.controller, scope.sessionId],
  );
  useLayoutEffect(() => {
    setSheetHeight(0);
    previousConfirmedQuantity.current = undefined;
    summarySwell.stopAnimation();
    summarySwell.setValue(0);
    if (!props.expanded && insetLease) insetLease.set({ bottom: detents.peek });
  }, [detents.peek, insetLease, props.expanded, runtimeSession, scope.controller, scope.sessionId]);
  useEffect(() => {
    const previous = previousConfirmedQuantity.current;
    previousConfirmedQuantity.current = confirmedQuantity;
    if (previous === undefined || confirmedQuantity <= previous) return undefined;
    // The count swells once when it changes while collapsed — the only feedback
    // a buyer gets that a tap on the map reached the cart with the sheet shut.
    const motion = resolveSeatLayerPickerMotion('bump', reducedMotion, 'spring');
    summarySwell.stopAnimation();
    summarySwell.setValue(0);
    if (motion.durationMs === 0) return undefined;
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(summarySwell, {
      duration: motion.durationMs,
      easing: Easing.bezier(x1, y1, x2, y2),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [confirmedQuantity, reducedMotion, summarySwell]);
  useEffect(() => {
    if (!insetLease) return;
    insetLease.set({
      bottom: props.expanded ? Math.min(detents.full, sheetHeight || detents.peek) : detents.peek,
    });
  }, [detents.full, detents.peek, insetLease, props.expanded, runtimeSession, scope.controller, scope.sessionId, sheetHeight]);
  useEffect(() => {
    if (!insetLease) return undefined;
    return () => insetLease.remove();
  }, [insetLease]);
  useEffect(() => {
    const motion = resolveSeatLayerPickerMotion('sheet', reducedMotion, props.expanded ? 'easeEnter' : 'easeExit');
    disclosureProgress.stopAnimation();
    if (motion.durationMs === 0) {
      disclosureProgress.setValue(props.expanded ? 1 : 0);
      return undefined;
    }
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(disclosureProgress, {
      duration: motion.durationMs, easing: Easing.bezier(x1, y1, x2, y2),
      toValue: props.expanded ? 1 : 0, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [disclosureProgress, props.expanded, reducedMotion]);

  const changeExpanded = (next = !props.expanded) => {
    if (next === props.expanded) return;
    try { void Promise.resolve(props.onExpandedChanged(next)).catch(() => {}); } catch { /* controlled callback */ }
  };
  // The whole head is the toggle: a drag up past a small threshold opens, a
  // drag down past it collapses. Springs, not tweens.
  const dragHeight = useRef(new Animated.Value(detents.peek)).current;
  const dragging = useRef(false);
  // The pan responder is built once; the live preference is read through a ref.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const expandedRef = useRef(props.expanded);
  expandedRef.current = props.expanded;
  const detentsRef = useRef(detents);
  detentsRef.current = detents;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      dragging.current = true;
      const stops = detentsRef.current;
      dragHeight.setValue(expandedRef.current ? stops.content : stops.peek);
    },
    onPanResponderMove: (_event, gesture) => {
      const stops = detentsRef.current;
      const from = expandedRef.current ? stops.content : stops.peek;
      dragHeight.setValue(seatLayerSheetRubberBanded(from - gesture.dy, stops));
    },
    onPanResponderRelease: (_event, gesture) => {
      dragging.current = false;
      const stops = detentsRef.current;
      const from = expandedRef.current ? stops.content : stops.peek;
      const settled = seatLayerSheetSettle(from - gesture.dy, -gesture.vy * 1_000, stops);
      // §4.4 — a spring has no reduced form, so under reduced motion the sheet
      // is simply at its detent. Everything sequenced behind it runs at once.
      if (reducedMotionRef.current) {
        dragHeight.setValue(settled);
      } else {
        Animated.spring(dragHeight, {
          damping: seatLayerSheetSpring.damping,
          mass: seatLayerSheetSpring.mass,
          stiffness: seatLayerSheetSpring.stiffness,
          toValue: settled,
          useNativeDriver: false,
        }).start();
      }
      changeExpanded(seatLayerSheetDetentAt(settled, stops) !== 'peek');
    },
  })).current;

  const onSheetLayout = (event: LayoutChangeEvent) => {
    const next = measurement.current.measure(key.revision, event.nativeEvent.layout.height);
    if (next !== undefined) setSheetHeight(next);
  };
  const bestShortcutEnabled = props.bestSeats !== null;
  // `Find seats` is withheld where the form would be refused: a performance
  // group, closed sales, or an existing hold.
  const bestAllowed = bestShortcutEnabled && !scope.pendingSeat && !scope.readOnly && !scope.isBusy &&
    scope.isReady && !scope.snapshot?.event.salesClosed && scope.snapshot?.hold.owner !== 'host' &&
    scope.snapshot?.hold.active !== true &&
    scope.snapshot?.selectionValidity?.isValid !== false &&
    supportsSeatLayerPickerSurface(scope.controller, ['picker-actions-v1'], ['picker.bestAvailable']);
  const flight = useSeatLayerCheckoutFlight(props.onCheckout);
  const cta = useSeatLayerCheckoutCta(flight.busy, bestAllowed && !hasTickets);
  const peek = cta.peekLine;
  const main = hasTickets
    ? props.cartList === undefined ? <SeatLayerCartList /> : props.cartList
    : props.bestSeats === undefined ? <SeatLayerBestSeatsForm safeAreaInsets={safeInsets} /> : props.bestSeats;
  const holdLapse = props.holdLapse === undefined ? <SeatLayerHoldLapseNotice /> : props.holdLapse;
  const actionError = props.actionError === undefined ? <SeatLayerPickerActionError /> : props.actionError;
  const salesClosed = props.salesClosed === undefined
    ? <SeatLayerPickerSalesClosedStatement /> : props.salesClosed;
  const checkoutBar = props.checkoutBar === undefined ? <SeatLayerBookButton onCheckout={props.onCheckout} /> : props.checkoutBar;
  // Exactly ONE named toggle in either state: the head while collapsed, the
  // chevron while open. Never both.
  const toggleLabel = scope.strings.translate(props.expanded ? 'collapseCart' : 'expandCart');
  const attribution = attributionRequired
    ? <SeatLayerSheetFoot><SeatLayerPickerAttribution compact /></SeatLayerSheetFoot>
    : null;
  const action = props.expanded
    ? <SeatLayerSheetChevron label={toggleLabel} theme={theme} progress={disclosureProgress} onPress={() => changeExpanded()} />
    : peek.offerFind
      // Pressing it opens the sheet on the best-seats form, whose body IS the
      // form: there is no second surface to claim.
      ? <SeatLayerFindSeatsPill label={scope.strings.translate('findSeats')} theme={theme} onPress={() => changeExpanded(true)} />
      // The peek pill is NEVER rendered disabled: the states that would
      // disable it render a different line instead.
      : peek.pillLabel !== null && props.checkoutBar !== null && !cta.peekStatesReason
        ? (
          <SeatLayerPeekContinuePill
            busy={cta.busy}
            label={peek.pillLabel}
            onPress={flight.press}
            style={styles.continueButton}
            textStyle={styles.continueButtonText}
            theme={theme}
            total={peek.total}
          />
        )
        : null;
  return (
    <View onLayout={onSheetLayout} style={[sanitizeSeatLayerPickerStyle(props.style), styles.sheetContainer, {
      backgroundColor: theme.roles.sheet.background,
      borderTopColor: theme.roles.sheet.border,
      borderTopLeftRadius: seatLayerPickerTokens.radius.sheet,
      borderTopRightRadius: seatLayerPickerTokens.radius.sheet,
      borderTopWidth: StyleSheet.hairlineWidth,
      elevation: seatLayerPickerTokens.elevation.sheet,
      maxHeight: detents.full,
    }]}>
      {holdLapse}
      <SeatLayerCartPeekHead
        action={action}
        containerStyle={styles.peekContainer}
        expanded={props.expanded}
        height={(props.expanded ? openHeadHeight : headHeight) + seatLayerPickerTokens.size.peekClockLift}
        line={peek}
        onToggle={() => changeExpanded()}
        panHandlers={pan.panHandlers}
        summaryStyle={styles.peekSummaryText}
        summarySwell={summarySwell}
        theme={theme}
        toggleLabel={toggleLabel}
      />
      {/* At peek, every child except the head is not drawn. */}
      {props.expanded
        ? (
          <View style={{ flexShrink: 1, maxHeight: bodyCap }}>
            {hasTickets
              ? (
                <>
                  <ScrollView
                    contentContainerStyle={{ paddingBottom: 6, paddingHorizontal: 12 }}
                    onContentSizeChange={(_width, height) => setContentHeight(height)}
                    style={{ flexShrink: 1 }}
                  >{main}</ScrollView>
                  {salesClosed}
                  {actionError}
                  {checkoutBar}
                </>
              )
              : (
                <View style={{ paddingBottom: 8, paddingHorizontal: 14 }}>
                  <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} accessibilityRole="text" style={{ height: 1, opacity: 0, position: 'absolute', width: 1 }}>{scope.strings.translate('emptyTrayHint')}</Text>
                  <View>{main}</View>
                  {salesClosed}
                  {actionError}
                </View>
              )}
            <View testID="seatlayer-cart-safe-footer" style={{ paddingBottom: inset }}>{attribution}</View>
          </View>
        )
        : (
          // THE BAR IS EXACTLY ITS HEAD. Collapsed, the credit lives INSIDE the
          // safe strip below the head rather than in a row of its own: given a
          // row, the bar grows past the head it is meant to be and the head's
          // own buttons lose the bottom of their band. Nothing is drawn where
          // there is no strip to draw it in.
          <View
            testID="seatlayer-cart-safe-footer"
            style={{ alignItems: 'center', height: inset, justifyContent: 'center', overflow: 'hidden' }}
          >{inset > 0 ? attribution : null}</View>
        )}
    </View>
  );
}
