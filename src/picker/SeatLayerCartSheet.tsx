import React, {
  isValidElement,
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
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SeatLayerPickerActionError } from './actionError';
import { SeatLayerPickerSalesClosedStatement } from './SeatLayerPickerAccessPanel';
import { SeatLayerBestSeatsForm } from './SeatLayerBestSeatsForm';
import { SeatLayerCartList } from './SeatLayerCartList';
import { SeatLayerHoldLapseNotice } from './SeatLayerHoldLapseNotice';
import {
  seatLayerPickerCardAsking, useSeatLayerPickerSeatRemovalSeat,
} from './seatConfirmationRemoval';
import { SeatLayerSheetFoot } from './sheetFoot';
import { SeatLayerBookButton } from './checkoutButton';
import { SeatLayerSheetFinderProvider } from './sheetFinder';
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from './safeAreaInsets';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
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
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerCartBarSize } from './cartBarRule';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerSheetLayout } from './sheetLayout';
import type { SeatLayerPickerCheckoutHandoff } from './models';
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
 * Collapsed it is one row: the circle, what the cart holds, the button. The
 * cards wait behind the circle, and with them what there is no room to read in
 * a row: the closed-sales statement and, on an empty cart, the best-seats form.
 *
 * It never opens itself. A sheet that springs up when a seat is picked covers
 * the map the buyer is still choosing from.
 */

export {
  SeatLayerBookButton,
  useSeatLayerCheckoutCta,
  type SeatLayerBookButtonProps,
} from './checkoutButton';

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
  // §3.8.1 — the ONE boolean: an add card or a remove card is asking about a
  // seat, and nothing in the row can be pressed until it is answered.
  const removalSeat = useSeatLayerPickerSeatRemovalSeat();
  const asking = seatLayerPickerCardAsking(scope, removalSeat);

  // Everything that is NOT the cart region, measured rather than assumed: the
  // foot grows with the platform's text size, with a lapse notice and with an
  // inline error, and a cap derived from a guess would clip the button.
  const [footHeight, setFootHeight] = useState(0);
  const [cartNatural, setCartNatural] = useState(0);
  const [extrasNatural, setExtrasNatural] = useState(0);
  const chrome = footHeight + inset;
  const ceilings = seatLayerCartSheetCeilings(window.height, chrome, hasTickets, theme.layout);
  // The list scrolls inside its own box and the map keeps its room. An app's
  // own cap is honoured.
  const appCap = seatLayerPickerSheetLayout(theme).cartPeekMaxHeight;
  const openNatural = Math.min(
    cartNatural + extrasNatural,
    appCap === seatLayerPickerTokens.size.cartPeekMaxHeight ? seatLayerCartBarSize.listMaxHeight : appCap,
  );
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

  // A new seat closes the list: the buyer is back on the map, and the row
  // says what the cart holds now.
  const seatCount = projection.confirmed.items.length;
  const seatsBefore = useRef(seatCount);
  useEffect(() => {
    const grew = seatCount > seatsBefore.current;
    seatsBefore.current = seatCount;
    if (grew && detentRef.current !== 'peek') settleRef.current('peek', 0);
  }, [seatCount]);

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
      style={sanitizeSeatLayerPickerStyle(props.style)}
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
          // The picker's own ground, and one line over it. No shadow: an
          // upward one reads as a grey band over the map.
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.divider,
          borderTopWidth: seatLayerPickerLineWidth,
          paddingBottom: inset,
        }, styles.sheetContainer]}
      >
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
          {props.expanded ? <View style={{ backgroundColor: theme.colors.divider, height: seatLayerPickerLineWidth }} /> : null}
          <SeatLayerSheetFoot
            actionError={actionError}
            asking={asking}
            checkoutBar={checkoutBar}
            checkoutBarIsCustom={!isOwnButton(checkoutBar)}
            expanded={props.expanded}
            holdLapse={holdLapse}
            {...(props.cartLanding === undefined ? {} : { landing: props.cartLanding })}
            onToggle={() => ask(!props.expanded)}
            panHandlers={pan.panHandlers}
            progress={disclosure}
            styles={styles}
            toggleLabel={toggleLabel}
            width={window.width - safeInsets.left - safeInsets.right}
          />
        </View>
      </View>
      </Animated.View>
      </SeatLayerSheetFinderProvider>
    </View>
  );
}

/** The ready-made button, which the row measures; anything else is an app's own part. */
function isOwnButton(part: ReactNode): boolean {
  return isValidElement(part) && part.type === SeatLayerBookButton;
}
