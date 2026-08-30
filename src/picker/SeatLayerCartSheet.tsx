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
  LayoutAnimation,
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
import { SeatLayerBestSeatsForm } from './SeatLayerBestSeatsForm';
import { SeatLayerPickerBottomSheetFrame } from './SeatLayerPickerBottomSheetFrame';
import { SeatLayerCartList } from './SeatLayerCartList';
import { SeatLayerHoldLapseNotice } from './SeatLayerHoldLapseNotice';
import { SeatLayerPickerPromptModal } from './promptModal';
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
} from './cartSheetUi';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerMotion } from './motion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { supportsSeatLayerPickerSurface } from './surfaces';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import type { SeatLayerPickerCheckoutHandoff } from './models';

type Scope = ReturnType<typeof useSeatLayerPickerScope>;
type PromptHandle = Exclude<ReturnType<Scope['claimPrompt']>, undefined>;
type BookSlots = Pick<SeatLayerPickerStyles, 'continueButton' | 'continueButtonText'>;
const peekContinuePaintHeight = 34;

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
}

export interface SeatLayerBookButtonProps {
  readonly onCheckout: (handoff: Readonly<SeatLayerPickerCheckoutHandoff>) => unknown;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: BookSlots;
}

function checkoutAllowed(scope: Scope): boolean {
  const snapshot = scope.controller.getSnapshot();
  return snapshot !== undefined && scope.isReady && !scope.readOnly && !scope.isBusy &&
    scope.pendingSeat === null && !snapshot.event.salesClosed &&
    snapshot.selectionValidity?.isValid !== false &&
    projectSeatLayerCartSheet(snapshot, null).confirmed.items.length > 0 &&
    supportsSeatLayerPickerSurface(scope.controller, ['checkout-handoff-v1'], ['picker.continue']);
}

function canRejectHandoff(controller: Scope['controller']): boolean {
  return supportsSeatLayerPickerSurface(
    controller,
    ['checkout-handoff-reject-v1'],
    ['picker.rejectHandoff'],
  );
}

/** A public-ready scoped CTA with one commit-safe checkout flight. */
export function SeatLayerBookButton(props: SeatLayerBookButtonProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbackRef = useRef(props.onCheckout);
  const mountedRef = useRef(true);
  const flightRef = useRef(0);
  const nextFlightRef = useRef(0);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    scopeRef.current = scope;
    callbackRef.current = props.onCheckout;
  }, [props.onCheckout, scope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; flightRef.current = 0; nextFlightRef.current += 1; };
  }, []);
  useLayoutEffect(() => {
    flightRef.current = 0;
    nextFlightRef.current += 1;
    setBusy(false);
  }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);

  const projection = projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat);
  const total = projection.totals.currency === null
    ? undefined
    : scope.formatMoney(projection.totals.total, projection.totals.currency);
  const label = props.compact
    ? total
      ? scope.strings.translate('continueWithTotal', { values: { money: total } })
      : scope.strings.translate('continueWord')
    : scope.strings.translate('holdAndCheckout');
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const checkout = async () => {
    const before = scopeRef.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    if (!lease || flightRef.current || !checkoutAllowed(before)) return;
    const flight = ++nextFlightRef.current;
    flightRef.current = flight;
    setBusy(true);
    let handoff: SeatLayerPickerCheckoutHandoff | undefined;
    try {
      handoff = await before.controller.checkout();
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
  const disabled = busy || flightRef.current !== 0 || !checkoutAllowed(scope);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled, busy }} onPress={() => { void checkout(); }}
      style={props.compact ? {
        justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget,
      } : {
        justifyContent: 'center', minHeight: 56, paddingBottom: 6, paddingHorizontal: 12, paddingTop: 4,
      }}>
      <View style={[{
        height: props.compact ? peekContinuePaintHeight : 46,
        minWidth: props.compact ? 100 : undefined,
        borderRadius: seatLayerPickerTokens.radius.button,
        backgroundColor: disabled ? theme.colors.divider : theme.colors.accent,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12,
      }, styles.continueButton, sanitizeSeatLayerPickerStyle(props.style), {
        height: props.compact ? peekContinuePaintHeight : 46,
        minWidth: props.compact ? 100 : undefined,
      }]}>
        <Text numberOfLines={1} ellipsizeMode="tail"
          style={[{ color: disabled ? theme.colors.mutedText : theme.colors.onAccent, flexShrink: 1, fontFamily: theme.fontFamily, fontSize: props.compact ? 13 : 15, fontWeight: '800' }, styles.continueButtonText]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Controlled sheet: fixed chrome stays reachable while the ticket list scrolls. */
export function SeatLayerCartSheet(props: SeatLayerCartSheetProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const window = useWindowDimensions();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const measurement = useRef(new CartSheetMeasurementCoordinator());
  const disclosureProgress = useRef(new Animated.Value(props.expanded ? 1 : 0)).current;
  const [sheetHeight, setSheetHeight] = useState(0);
  const [bestPrompt, setBestPrompt] = useState<PromptHandle | undefined>();
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
  const maxSheet = Math.max(0, window.height * seatLayerPickerTokens.size.sheetMaxHeightFraction);
  const bodyCap = hasTickets
    ? cartSheetMaximumBodyHeight(window.height, 0)
    : Math.min(cartSheetMaximumBodyHeight(window.height, 0), seatLayerPickerTokens.size.emptyTrayMaxHeight);
  const promptBodyCap = cartSheetMaximumBodyHeight(window.height, inset);
  const key = measurement.current.begin({
    controller: scope.controller, sessionId: scope.sessionId, runtimeSessionId: runtimeSession, expanded: props.expanded, ownsChrome: true,
  }, 0);
  const insetLease = useMemo(
    () => reserve ? scope.claimViewportInsetBand('cart-sheet') : undefined,
    [reserve, scope.claimViewportInsetBand, scope.controller, scope.sessionId],
  );
  useLayoutEffect(() => {
    setSheetHeight(0);
    bestPrompt?.dismiss();
    setBestPrompt(undefined);
    if (!props.expanded && insetLease) {
      insetLease.set({ bottom: seatLayerPickerTokens.size.peekHeight + inset });
    }
  }, [inset, insetLease, props.expanded, runtimeSession, scope.controller, scope.sessionId]);
  useLayoutEffect(() => {
    if (bestPrompt && scope.presentation.prompt?.context !== bestPrompt.lease.context) {
      setBestPrompt(undefined);
    }
  }, [bestPrompt, scope.presentation.prompt]);
  useLayoutEffect(() => {
    if (props.bestSeats === null && bestPrompt) {
      bestPrompt.dismiss();
      setBestPrompt(undefined);
    }
  }, [bestPrompt, props.bestSeats]);
  useEffect(() => {
    if (!insetLease) return;
    const fallback = seatLayerPickerTokens.size.peekHeight + inset;
    insetLease.set({ bottom: props.expanded
      ? Math.min(maxSheet, sheetHeight || fallback)
      : fallback });
  }, [inset, insetLease, maxSheet, props.expanded, runtimeSession, scope.controller, scope.sessionId, sheetHeight]);
  useEffect(() => {
    if (!insetLease) return undefined;
    return () => insetLease.remove();
  }, [insetLease]);
  useEffect(() => {
    const motion = resolveSeatLayerPickerMotion(
      'sheet',
      reducedMotion,
      props.expanded ? 'easeEnter' : 'easeExit',
    );
    disclosureProgress.stopAnimation();
    if (motion.durationMs === 0) {
      disclosureProgress.setValue(props.expanded ? 1 : 0);
      return undefined;
    }
    const [x1, y1, x2, y2] = motion.curve.cubicBezier;
    const animation = Animated.timing(disclosureProgress, {
      duration: motion.durationMs,
      easing: Easing.bezier(x1, y1, x2, y2),
      toValue: props.expanded ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [disclosureProgress, props.expanded, reducedMotion]);

  const onSheetLayout = (event: LayoutChangeEvent) => {
    const next = measurement.current.measure(key.revision, event.nativeEvent.layout.height);
    if (next !== undefined) setSheetHeight(next);
  };
  const total = projection.totals.currency === null
    ? undefined
    : scope.formatMoney(projection.totals.total, projection.totals.currency);
  const cheapest = scope.snapshot?.categories.reduce<number | undefined>(
    (lowest, category) => !category.notForSale && Number.isFinite(category.priceMin)
      ? Math.min(lowest ?? category.priceMin, category.priceMin) : lowest,
    undefined,
  );
  const summary = hasTickets
    ? props.expanded
      ? scope.strings.translate('ticketCount', { count: projection.totals.quantity, values: { count: projection.totals.quantity } })
      : total
        ? `${scope.strings.translate('ticketCount', { count: projection.totals.quantity, values: { count: projection.totals.quantity } })} · ${total}`
        : scope.strings.translate('ticketCount', { count: projection.totals.quantity, values: { count: projection.totals.quantity } })
    : cheapest === undefined
      ? scope.strings.translate('chooseTickets')
      : scope.strings.translate('fromPrice', { values: { price: scope.formatMoney(cheapest, scope.snapshot?.currency ?? '') } });
  const bestShortcutEnabled = props.bestSeats !== null;
  const bestAllowed = bestShortcutEnabled && hasTickets && !scope.pendingSeat && !scope.readOnly && !scope.isBusy &&
    scope.isReady && !scope.snapshot?.event.salesClosed && scope.snapshot?.hold.owner !== 'host' &&
    scope.snapshot?.selectionValidity?.isValid !== false &&
    supportsSeatLayerPickerSurface(scope.controller, ['picker-actions-v1'], ['picker.bestAvailable']);
  const openBest = () => {
    if (!bestAllowed || bestPrompt) return;
    const context = Object.freeze({ sessionId: scope.sessionId, runtimeSession });
    const handle = scope.claimPrompt('seatlayer-picker-cart-best-seats', 'bestSeats', context);
    if (handle?.open()) setBestPrompt(handle);
  };
  const changeExpanded = () => {
    const motion = resolveSeatLayerPickerMotion(
      'sheet',
      reducedMotion,
      props.expanded ? 'easeExit' : 'easeEnter',
    );
    if (motion.durationMs > 0) {
      try {
        LayoutAnimation.configureNext({
          duration: motion.durationMs,
          create: { type: 'easeInEaseOut', property: 'opacity' },
          update: { type: 'easeInEaseOut' },
          delete: { type: 'easeInEaseOut', property: 'opacity' },
        });
      } catch { /* Layout motion is optional on unsupported native hosts. */ }
    }
    try { void Promise.resolve(props.onExpandedChanged(!props.expanded)).catch(() => {}); } catch { /* controlled callback */ }
  };
  const main = hasTickets
    ? props.cartList === undefined ? <SeatLayerCartList /> : props.cartList
    : props.bestSeats === undefined ? <SeatLayerBestSeatsForm safeAreaInsets={safeInsets} /> : props.bestSeats;
  const shortcut = props.bestSeats === undefined
    ? <SeatLayerBestSeatsForm allowFilled safeAreaInsets={safeInsets} onFound={() => { bestPrompt?.dismiss(); setBestPrompt(undefined); }} />
    : props.bestSeats;
  const holdLapse = props.holdLapse === undefined ? <SeatLayerHoldLapseNotice /> : props.holdLapse;
  const actionError = props.actionError === undefined ? <SeatLayerPickerActionError /> : props.actionError;
  const checkoutBar = props.checkoutBar === undefined ? <SeatLayerBookButton onCheckout={props.onCheckout} /> : props.checkoutBar;
  const toggleLabel = scope.strings.translate(props.expanded ? 'collapseCart' : 'expandCart');
  return (
    <View onLayout={onSheetLayout} style={[sanitizeSeatLayerPickerStyle(props.style), styles.sheetContainer, {
      maxHeight: maxSheet, backgroundColor: theme.roles.sheet.background,
      borderTopColor: theme.roles.sheet.border, borderTopWidth: 1,
    }]}>
      {holdLapse}
      <View style={[styles.peekContainer, { height: seatLayerPickerTokens.size.peekHeight, flexDirection: 'row', alignItems: 'center', paddingStart: 14 }]}>
        <View
          pointerEvents="none"
          testID="seatlayer-cart-handle-rail"
          style={{ position: 'absolute', top: 5, left: 0, width: '100%', alignItems: 'center' }}
        >
          <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: theme.colors.mutedText, opacity: .5 }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded: props.expanded }} hitSlop={6} onPress={changeExpanded}
          style={{ flex: 1, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', paddingTop: 6 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[{ color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: 13, fontWeight: '800' }, styles.peekSummaryText]}>{summary}</Text>
        </Pressable>
        {props.expanded && bestAllowed ? <Pressable accessibilityRole="button" accessibilityLabel={scope.strings.translate('bestSeats')} onPress={openBest} style={{ minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: theme.colors.accent }}>✦</Text></Pressable> : null}
        {!props.expanded && hasTickets && props.checkoutBar !== null ? <SeatLayerBookButton compact onCheckout={props.onCheckout} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded: props.expanded }} onPress={changeExpanded}
          style={({ pressed }) => ({
            width: seatLayerPickerTokens.size.minimumHitTarget,
            minHeight: seatLayerPickerTokens.size.minimumHitTarget,
            justifyContent: 'center', alignItems: 'center', marginStart: 4,
            opacity: pressed ? .62 : 1, zIndex: 1,
          })}
          testID="seatlayer-cart-disclosure">
          <Animated.View style={{
            width: 10, height: 10, borderBottomColor: theme.colors.text,
            borderBottomWidth: 2, borderRightColor: theme.colors.text, borderRightWidth: 2,
            transform: [{ rotate: disclosureProgress.interpolate({ inputRange: [0, 1], outputRange: ['225deg', '45deg'] }) }],
          }} />
        </Pressable>
      </View>
      {props.expanded ? <View style={{ maxHeight: bodyCap, flexShrink: 1 }}>
        {hasTickets ? <>
          <ScrollView contentContainerStyle={{ paddingBottom: 6, paddingHorizontal: 12 }} style={{ flexShrink: 1 }}>{main}</ScrollView>
          {actionError}
          {checkoutBar}
        </> : <View style={{ paddingBottom: 8, paddingHorizontal: 14 }}>
          <Text accessibilityRole="text" style={{ height: 1, opacity: 0, position: 'absolute', width: 1 }}>{scope.strings.translate('emptyTrayHint')}</Text>
          <View>{main}</View>
          {actionError}
        </View>}
        <View testID="seatlayer-cart-safe-footer" style={{ height: Math.max(inset, seatLayerPickerTokens.size.attributionHeight), justifyContent: 'center' }}>
          <SeatLayerPickerAttribution compact />
        </View>
      </View> : inset > 0 ? <View testID="seatlayer-cart-safe-footer" style={{ height: inset }} /> : null}
      {bestShortcutEnabled ? <SeatLayerPickerPromptModal visible={bestPrompt !== undefined}>
        <SeatLayerPickerBottomSheetFrame
          borderColor={theme.roles.sheet.border}
          maxHeight={promptBodyCap}
          radius={theme.radii.sheet}
          safeAreaInsets={safeInsets}
          scrimColor="rgba(0, 0, 0, 0.45)"
          surfaceColor={theme.roles.sheet.background}
        >
          {shortcut}
        </SeatLayerPickerBottomSheetFrame>
      </SeatLayerPickerPromptModal> : null}
    </View>
  );
}
