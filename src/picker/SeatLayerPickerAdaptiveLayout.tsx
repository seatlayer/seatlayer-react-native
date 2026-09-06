import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { canRenderSeatLayerPickerAccessibilityFilters, SeatLayerPickerAccessibilityFilters } from './accessibility';
import {
  seatLayerPickerAccessibilityOrder,
  seatLayerPickerFocusOn,
  seatLayerPickerReadingOrderId,
  seatLayerPickerScaledExtent,
  seatLayerPickerTypeScaleClamp,
  type SeatLayerPickerReadingRung,
} from './a11y';
import { useSeatLayerPickerAdaptiveInteraction } from './adaptiveInteraction';
import {
  planSeatLayerPickerAdaptiveLayout,
  planSeatLayerPickerPhoneBands,
  seatLayerPickerAdaptiveInteractionBlocked,
  seatLayerPickerPendingCandidateEpochFor,
  seatLayerPickerPhoneChromeTop,
} from './adaptiveLayoutState';
import { useSeatLayerPickerAdaptiveSheetOpening } from './adaptiveSheetOpening';
import { SeatLayerPickerAttribution } from './attribution';
import type { SeatLayerPickerBuilders } from './builders';
import { SeatLayerConfirmCard } from './SeatLayerConfirmCard';
import { SeatLayerPickerSeatConfirmation } from './SeatLayerPickerSeatConfirmation';
import {
  seatLayerPickerConfirmAddInitial, seatLayerPickerConfirmAddReduce,
  seatLayerPickerConfirmMotionPlan, seatLayerPickerConfirmSwellMs,
  type SeatLayerPickerConfirmAddEvent,
} from './confirmCardMotion';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { SeatLayerCartLandingProvider } from './cartLanding';
import { SpotlightGlass } from './SpotlightGlass';
import { useSeatLayerPickerSeatRemovalSeat } from './seatConfirmationRemoval';
import { useSeatLayerPickerSeatLiftBinding } from './seatLiftBinding';
import { SeatLayerPickerToastLayer, useSeatLayerPickerToastQueue } from './SeatLayerPickerToast';
import { seatLayerPickerHoldLapseNews, seatLayerPickerToastRequest } from './toastBridge';
import { SeatLayerHoldOwnershipNotice } from './SeatLayerHoldOwnershipNotice';
import {
  SeatLayerPickerAccessPanel, SeatLayerPickerSalesClosedStatement,
} from './SeatLayerPickerAccessPanel';
import {
  SeatLayerPickerBookedOverlay, SeatLayerPickerSoldOutOverlay,
} from './SeatLayerPickerStateOverlays';
import type { SeatLayerPickerSelectedSeat } from './models';
import { SeatLayerBestSeatsForm } from './SeatLayerBestSeatsForm';
import { SeatLayerBookButton, SeatLayerCartSheet } from './SeatLayerCartSheet';
import { SeatLayerCartList } from './SeatLayerCartList';
import { SeatLayerDockBar } from './SeatLayerDockBar';
import { SeatLayerFloorStrip } from './SeatLayerFloorStrip';
import { SeatLayerPickerFloorSelector } from './SeatLayerPickerFloorSelector';
import { SeatLayerPickerSectionNavigator } from './SeatLayerPickerSectionNavigator';
import { SeatLayerMapControls, seatLayerPickerMapControlsEdgeInset, seatLayerPickerMapControlsRailTop } from './SeatLayerMapControls';
import { SeatLayerPickerChart } from './SeatLayerPickerChart';
import { SeatLayerPickerGAPrompt, SeatLayerPickerTablePrompt } from './SeatLayerPickerDecisionPrompts';
import { createSeatLayerPickerTableCandidate } from './decisionPrompts';
import { isSeatLayerPickerSnapshotEmpty } from './emptyState';
import { SeatLayerPickerHeader } from './header';
import { SeatLayerPickerHoldCountdown } from './SeatLayerPickerHoldCountdown';
import { SeatLayerPickerHaptics } from './SeatLayerPickerHaptics';
import type { SeatLayerPickerHapticAdapter } from './hapticPlayer';
import { SeatLayerHoldLapseNotice } from './SeatLayerHoldLapseNotice';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { SeatLayerPriceLegend } from './SeatLayerPriceLegend';
import { SeatLayerSeatPanoramaChrome } from './SeatLayerSeatPanoramaChrome';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { SeatLayerPickerScopeBackHandler } from './scopeBackHandler';
import { SeatLayerPickerActionError } from './actionError';
import { invokeSeatLayerPickerCallback } from './callback';
import type { SeatLayerPickerCallbacks } from './callbacks';
import { SeatLayerPickerPromptTransition } from './SeatLayerPickerPromptTransition';
import {
  SeatLayerSelectionFlight,
  type SeatLayerSelectionFlightMoment,
} from './SeatLayerSelectionFlight';
import { planSeatLayerSelectionFlight } from './selectionFlightState';
import { SeatLayerPickerEmptyView, SeatLayerPickerErrorView, SeatLayerPickerLoadingView, SeatLayerPickerTestModeIndicator } from './status';
import { seatLayerPickerTestModeIndicatorCompactHeight } from './testModeIndicator';
import { SeatLayerPickerSystemStatusBar } from './systemStatusBar';
import { SeatLayerVenue3DChrome } from './SeatLayerVenue3DChrome';
import { seatLayerPickerColorAlpha } from './mapChromeTheme';
import { chartSeatLayerPickerColor } from './chartColor';
import { renderSeatLayerPickerAdaptivePart as part } from './adaptiveParts';
import { seatLayerPickerAdaptiveStyles as styles } from './adaptiveStyles';
import { resolveSeatLayerPickerAdaptiveChromeEligibility } from './adaptiveChromeEligibility';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import type { SelectedSeat } from '../types';
import type { SeatLayerPickerOptions } from './options';
import {
  resolveSeatLayerPickerAdaptiveSafeLayout,
  type SeatLayerPickerAdaptiveMeasuredBounds,
} from './adaptiveSafeLayout';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';
import { sanitizeSeatLayerPickerStyle } from './styles';
import { seatLayerPickerTokens } from './tokens.g';

const noSeatView = () => undefined;
const noSeatViewSubscription = () => () => undefined;

export interface SeatLayerPickerAdaptiveLayoutProps {
  readonly options?: SeatLayerPickerOptions;
  readonly builders?: SeatLayerPickerBuilders;
  readonly style?: StyleProp<ViewStyle>;
  readonly onClose?: () => void | Promise<void>;
  /** Checkout ownership is supplied to the cart composition when that part is mounted. */
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => void | Promise<void>;
  readonly onSnapshotChanged?: () => unknown;
  readonly onReady?: SeatLayerPickerCallbacks['onReady'];
  readonly onSeatSelected?: SeatLayerPickerCallbacks['onSeatSelected'];
  readonly onSeatViewOpened?: SeatLayerPickerCallbacks['onSeatViewOpened'];
  readonly onSectionFocused?: SeatLayerPickerCallbacks['onSectionFocused'];
  readonly onSeatRemoved?: SeatLayerPickerCallbacks['onSeatRemoved'];
  /** §3.13.3: the host has been told and may be running its own recovery. */
  readonly hostOwnsAccessRecovery?: boolean;
  readonly hapticAdapter?: SeatLayerPickerHapticAdapter;
  /** Host safe geometry for the measured ready-made surface. */
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  /** Controlled modal cleanup must surrender global native ownership before unmount. */
  readonly presentationActive?: boolean;
}

/** Lets adaptive forward accepted modal-safe geometry while standalone parts remain optional. */
function withSafeArea(
  Component: React.ElementType,
  safeAreaInsets: SeatLayerPickerSafeAreaInsetInput,
  props?: Readonly<Record<string, unknown>>,
): React.ReactElement {
  return React.createElement(Component, { ...props, safeAreaInsets });
}

/**
 * §4.10 — one reading order, declared once at the composition root.
 *
 * React Native has no per-node sort key, so the root names the `nativeID`s it
 * walks in and each surface carries its own. The wrapper is a plain box for a
 * column child and an absolute fill for an overlay, so nothing moves on screen:
 * the order the picker is READ in and the order it is PAINTED in are allowed to
 * disagree, and here they do.
 */
function ordered(
  rung: SeatLayerPickerReadingRung,
  child: React.ReactNode,
  options?: Readonly<{ suffix?: string; overlay?: boolean; hidden?: boolean }>,
): React.ReactElement | null {
  if (child === null || child === undefined || child === false) return null;
  const nativeID = seatLayerPickerReadingOrderId(rung, options?.suffix);
  return options?.overlay === true
    ? <View collapsable={false} nativeID={nativeID} pointerEvents="box-none" style={styles.phoneOverlays} {...underDialog(options.hidden)}>{child}</View>
    : <View collapsable={false} nativeID={nativeID} {...underDialog(options?.hidden)}>{child}</View>;
}

/**
 * §4.10 — what a modal route does to the page under it.
 *
 * While a decision surface is up, everything painted before it — the header,
 * the prices, the map, its chrome, the dock — is hidden from assistive
 * technology. The toasts and the cart are painted after and stay audible on
 * purpose: a toast is the answer to the press, and the cart is what the seat
 * is being added to.
 */
function underDialog(hidden: boolean | undefined): Readonly<Record<string, unknown>> {
  return hidden === true
    ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
    : {};
}

/** Inner adaptive composition. The outer route, provider, and page lifecycle remain host-owned. */
export function SeatLayerPickerAdaptiveLayout({
  builders,
  onClose,
  onCheckout,
  onSeatRemoved,
  hostOwnsAccessRecovery = false,
  onSectionFocused,
  onSeatSelected,
  onSeatViewOpened,
  onSnapshotChanged,
  onReady,
  options,
  style,
  hapticAdapter,
  safeAreaInsets,
  presentationActive = true,
}: SeatLayerPickerAdaptiveLayoutProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const rootRef = useRef<View>(null);
  /** §4.10 — where focus returns when a decision surface hands the screen back. */
  const mapRegionRef = useRef<View>(null);
  const confirmOriginRef = useRef<Readonly<{ x: number; y: number }> | undefined>(undefined);
  const flightSequenceRef = useRef(0);
  const [selectionFlight, setSelectionFlight] = useState<SeatLayerSelectionFlightMoment | undefined>(undefined);
  // §3.8.4/§3.9 — the add choreography is one sentence, and this is its only
  // tense: press launches the chip and HOLDS the lift, the landing swells the
  // foot, the swell ending releases the map. Three surfaces read it; none of
  // them times itself off the press.
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const addPlan = useMemo(() => seatLayerPickerConfirmMotionPlan(reducedMotion), [reducedMotion]);
  const [addStage, setAddStage] = useState(seatLayerPickerConfirmAddInitial);
  const advanceAdd = useCallback((event: SeatLayerPickerConfirmAddEvent) => {
    setAddStage((current) => seatLayerPickerConfirmAddReduce(current, event, addPlanRef.current));
  }, []);
  const addPlanRef = useRef(addPlan);
  addPlanRef.current = addPlan;
  // §3.8.2 — `picker.frameSeat` is camera only and publishes no snapshot, so a
  // seat's reported `screenPoint` is where it sat BEFORE the lift. The hole
  // adds this, or it lands a whole lift band below the seat.
  const [anchorDy, setAnchorDy] = useState(0);
  const [bounds, setBounds] = useState<SeatLayerPickerAdaptiveMeasuredBounds | undefined>(undefined);
  const [mapHeight, setMapHeight] = useState(0);
  // The band the seat card covers, measured from the map's foot (§3.8.2).
  const [cardBand, setCardBand] = useState(0);
  const safeLayout = useMemo(
    () => resolveSeatLayerPickerAdaptiveSafeLayout(bounds, safeAreaInsets),
    [bounds, safeAreaInsets],
  );
  const plan = useMemo(
    () => planSeatLayerPickerAdaptiveLayout(safeLayout.usableWidth, options),
    [options, safeLayout.usableWidth],
  );
  const wide = plan.layout === 'wide';
  const openingKey = seatLayerPickerPendingCandidateEpochFor({
    id: 'adaptive-sheet', controller: scope.controller, scopeSessionId: scope.sessionId, runtimeSessionId: scope.snapshot?.sessionId,
  });
  useSeatLayerPickerAdaptiveSheetOpening(
    scope, openingKey, plan.options.chrome.cartSheet, plan.options.panelInitiallyCollapsed,
  );
  const gaClick = useSyncExternalStore(
    scope.controller.subscribeGACandidate,
    scope.controller.getGACandidate,
    scope.controller.getGACandidate,
  );
  const snapshot = scope.snapshot;
  const nativeChrome = scope.controller.mapController.isReady &&
    scope.controller.mapController.supportsPickerCapability('native-chrome-contract-v1');
  const seatView = useSyncExternalStore(
    scope.controller.subscribeSeatView ?? noSeatViewSubscription,
    scope.controller.getSeatView ?? noSeatView,
    scope.controller.getSeatView ?? noSeatView,
  );
  const focusedSectionId = snapshot?.map.focusedSectionId ?? scope.presentation.focusedSection?.sectionId;
  const focusedSection = typeof focusedSectionId === 'string'
    ? snapshot?.sections.find((section) => section.id === focusedSectionId)
    : snapshot?.map.focusedSection;
  const chromeEligibility = resolveSeatLayerPickerAdaptiveChromeEligibility({
    controller: scope.controller, snapshot, seatView,
    enable3D: plan.options.enable3D, enableSeatView: plan.options.enableSeatView,
    fit: plan.options.chrome.fit, hasFocusedSection: focusedSection !== undefined,
    map3D: plan.options.chrome.map3D, overview: plan.options.chrome.overview,
  });
  const panoramaVisible = chromeEligibility.panorama;
  // Full native panorama chrome requires the negotiated contract. A legacy
  // runtime may still report the exact open seat view; that is sufficient to
  // stand map chrome down while this pending seat is being inspected.
  const panoramaUp = panoramaVisible || (
    scope.pendingSeat?.id !== undefined && seatView?.seatId === scope.pendingSeat.id
  );
  const venueMode = snapshot?.map.buyerView === 'venue3d';
  const immersiveInspectionVisible = panoramaUp || venueMode;
  const dockVisible = !venueMode && !panoramaUp && plan.options.chrome.showDockBar && nativeChrome &&
    snapshot?.map.rung === 'seats' && focusedSection !== undefined;
  const phoneControls = !wide && !panoramaUp && plan.options.chrome.mapControls
    ? Object.freeze({
      bottom: chromeEligibility.canFit,
      left: chromeEligibility.canOverview,
      right: chromeEligibility.canSwitchView,
    })
    : Object.freeze({ bottom: false, left: false, right: false });
  const [viewModeWidth, setViewModeWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => { setViewModeWidth(undefined); }, [phoneControls.right, scope.resolvedTheme, scope.sessionId, scope.snapshot?.sessionId, scope.strings]);
  const categoriesVisible = nativeChrome && (snapshot?.categories.some((category) => !category.notForSale) ?? false);
  const floorsVisible = (snapshot?.map.floors.length ?? 0) > 1;
  const venueVisible = venueMode && !panoramaUp && plan.options.chrome.venue3D && plan.options.enable3D && nativeChrome &&
    snapshot?.capabilities.includes('venue3d') === true && scope.controller.mapController.supportsPickerCapability('venue-3d-v1') &&
    scope.controller.mapController.supportsPickerCommand('picker.setBuyerView');
  const floorStripVisible = !venueMode && !panoramaUp && plan.options.chrome.floorStrip &&
    (wide || !plan.options.chrome.floorSelector) && floorsVisible && nativeChrome &&
    scope.controller.mapController.supportsPickerCommand('picker.setFloor');
  const floorSelectorVisible = !venueMode && !panoramaUp && plan.options.chrome.floorSelector &&
    (!wide || !plan.options.chrome.floorStrip) && floorsVisible &&
    scope.controller.mapController.isReady && nativeChrome &&
    scope.controller.mapController.supportsPickerCommand('picker.setFloor');
  const testBadgeVisible = snapshot?.event.mode === 'test' && nativeChrome;
  const [testBadgeWidth, setTestBadgeWidth] = useState<number | undefined>(undefined);
  const testBadgeCopy = testBadgeVisible ? scope.strings.translate('testMode') : '';
  useLayoutEffect(() => {
    setTestBadgeWidth(undefined);
  }, [scope.sessionId, snapshot?.sessionId, testBadgeCopy, testBadgeVisible]);
  // §3.5, 0.9.1: the disc HEADS the map's control column on both compositions,
  // so it is drawn BY that column and cannot outlive it. A host that turns the
  // column off turns the disc off with it — and, decisively, stops the phone
  // leasing the runtime a bottom band for a control nobody drew.
  //
  // The disc is not a camera control, though, so it is its own reason for the
  // column to exist: a runtime that answers no zoom, fit or overview command
  // still filters seats, and gating the disc on the camera's eligibility took
  // the filter off that buyer's map entirely.
  const accessibilityVisible = !venueMode && !panoramaUp && nativeChrome && plan.options.chrome.accessibility &&
    plan.options.chrome.mapControls &&
    canRenderSeatLayerPickerAccessibilityFilters(scope.controller, snapshot);
  const priceRailAvailable = plan.options.chrome.priceLegend && categoriesVisible;
  // A band between the header and the map cannot collide with the Map / 3D
  // control, so it no longer waits for that control to be measured: the wait
  // was what kept the rail off the phone entirely when the measurement never
  // arrived. It is simply not drawn while an immersive scene is up (§3.2).
  const legendVisible = !panoramaUp && !venueMode && priceRailAvailable;
  const floorHeight = floorStripVisible
    ? seatLayerPickerTokens.size.minimumHitTarget : 0;
  // The 3D scene owns its own top-left corner. Price categories can still be
  // available while their rail is absent from that corner, so using the
  // legend height here pushed “Back to venue” into the middle of the scene.
  // Keep it on the same top edge as the Map / 3D control instead.
  const immersiveTopInset = seatLayerPickerMapControlsEdgeInset;
  const topControlsHeight = phoneControls.left || phoneControls.right ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerPhoneChromeTop : 0;
  // §3.2: the price rail is a band of its own between the header and the map,
  // never floated over it — on a busy chart the seat numbers read through the
  // chip gaps and the last chip clips under the Map / 3D control.
  const backPillDrawn = venueMode && venueVisible;
  const floorTop = floorStripVisible ? Math.max(seatLayerPickerPhoneChromeTop, topControlsHeight) : 0;
  const topRailHeight = backPillDrawn
    ? immersiveTopInset + seatLayerPickerTokens.size.minimumHitTarget
    : Math.max(topControlsHeight, floorTop + floorHeight);
  // The chip stands on the map's top band, the line the Map/3D control shares,
  // and not in the map's corner: `mapAnchorInset` is the corner's inset and put
  // the chip a rung below the control it is drawn beside. Its LEFT is still the
  // corner inset. Only the immersive scene's back pill, which owns that corner,
  // pushes it down.
  const badgeTop = backPillDrawn
    ? seatLayerPickerTokens.size.immersiveBackPillHeight + seatLayerPickerTokens.size.mapAnchorGap
    : seatLayerPickerMapControlsRailTop;
  const topHeight = Math.max(
    topRailHeight,
    testBadgeVisible ? badgeTop + seatLayerPickerTestModeIndicatorCompactHeight : 0,
  );
  // §4.10 — the dock's reported band has to be the height it DRAWS, or a
  // focused section lands under a dock that grew with the buyer's type.
  const drawnDockHeight = seatLayerPickerScaledExtent(
    seatLayerPickerTokens.size.dockBarHeight,
    seatLayerPickerTypeScaleClamp('dock'),
  );
  const bottomInset = dockVisible ? drawnDockHeight : 0;
  const phoneBands = planSeatLayerPickerPhoneBands({
    topHeight,
    dockHeight: bottomInset,
    controlBottomHeight: phoneControls.bottom ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerTokens.size.minimumHitTarget : 0,
    floorSelectorBottomHeight: !wide && floorSelectorVisible
      ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerTokens.size.minimumHitTarget : 0,
    accessibilityBottomHeight: accessibilityVisible
      ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerTokens.size.minimumHitTarget : 0,
    venueBottomHeight: 0,
  });
  const phoneInsetsVisible = !wide && (phoneBands.top > 0 || phoneBands.bottom > 0);
  const fatal = !scope.isReady && scope.error !== undefined;
  const emptySnapshot = scope.isReady && isSeatLayerPickerSnapshotEmpty(snapshot);
  const ticketPanelVisible = plan.options.chrome.cartSheet && !emptySnapshot;
  const pendingId = typeof scope.pendingSeat?.id === 'string' ? scope.pendingSeat.id : undefined;
  const candidateEpoch = pendingId === undefined ? undefined : seatLayerPickerPendingCandidateEpochFor({
    id: pendingId,
    controller: scope.controller,
    scopeSessionId: scope.sessionId,
    runtimeSessionId: snapshot?.sessionId,
  });
  const tableCandidate = pendingId !== undefined && candidateEpoch !== undefined && (snapshot?.revision ?? 0) > 0
    ? createSeatLayerPickerTableCandidate({
      controller: scope.controller, snapshot, sessionId: scope.sessionId,
      readOnly: scope.readOnly, isBusy: scope.isBusy,
    }, pendingId, candidateEpoch)
    : undefined;
  const gaActive = scope.isReady && !scope.readOnly && gaClick !== undefined;
  const tableActive = scope.isReady && !scope.readOnly && !gaActive && tableCandidate !== undefined;
  // §3.8/§3.8.4a — the card asks one of two questions about one seat. The add
  // is a pending confirmation; the remove is a retap of a carted seat, which
  // has no pending confirmation at all, so gating the card on one hid it.
  const removalSeat = useSeatLayerPickerSeatRemovalSeat();
  const cardEligible = scope.isReady && !scope.readOnly && !gaActive && !tableActive &&
    !immersiveInspectionVisible && plan.options.chrome.confirmCard;
  const removeActive = cardEligible && removalSeat !== null;
  const seatActive = cardEligible && scope.pendingSeat !== null && plan.options.confirmSelection;
  const cardActive = seatActive || removeActive;
  const cardSeat = (scope.pendingSeat ?? removalSeat) as SeatLayerPickerSelectedSeat | null;
  const cardSeatId = typeof cardSeat?.id === 'string' && cardActive ? cardSeat.id : null;
  const confirmationAction = ({ action, seat }: { action: string; seat: unknown }) => {
    if (action === 'confirm') invokeSeatLayerPickerCallback(onSeatSelected, seat as never, scope.reportError);
    if (action === 'seatView' || action === 'venue3d') invokeSeatLayerPickerCallback(onSeatViewOpened, seat as never, scope.reportError);
    if (action !== 'confirm') return;
    advanceAdd({ kind: 'press' });
    const origin = confirmOriginRef.current;
    confirmOriginRef.current = undefined;
    const root = rootRef.current;
    if (wide || !ticketPanelVisible || origin === undefined || root === null) return;
    const selected = seat as SelectedSeat;
    const category = scope.snapshot?.categories.find((item) => item.key === selected.categoryKey);
    const color = chartSeatLayerPickerColor(category?.color, scope.resolvedTheme.colors.accent);
    const sessionId = scope.sessionId;
    root.measureInWindow((x, y, width, height) => {
      if (scope.sessionId !== sessionId) return;
      const path = planSeatLayerSelectionFlight({ x, y, width, height }, origin, safeLayout.insets.bottom);
      if (!path) return;
      setSelectionFlight(Object.freeze({ id: ++flightSequenceRef.current, color, ...path }));
    });
  };
  const promptPart = gaActive
    ? part(builders, scope, 'generalAdmissionPrompt', <SeatLayerPickerGAPrompt safeAreaInsets={safeLayout.insets} />)
    : tableActive
      ? part(builders, scope, 'tablePrompt', <SeatLayerPickerTablePrompt candidate={tableCandidate} safeAreaInsets={safeLayout.insets} />)
      : (wide ? seatActive : cardActive)
        ? part(builders, scope, wide ? 'seatConfirmation' : 'confirmCard', wide
          ? <SeatLayerPickerSeatConfirmation showSeatView={plan.options.enableSeatView} show3D={plan.options.enable3D} onAction={confirmationAction} />
          : <SeatLayerConfirmCard
            showSeatView={plan.options.enableSeatView}
            show3D={plan.options.enable3D}
            onAction={confirmationAction}
            onConfirmOrigin={(origin) => { confirmOriginRef.current = origin; }}
            onBandChange={setCardBand}
          />)
        : null;
  const prompt = promptPart;
  const promptVisible = prompt !== null;
  // A card, a general-admission prompt or a table prompt: any of them owns the
  // screen while it is up.
  const decisionUp = promptVisible || scope.presentation.prompt !== null;
  const promptKey = gaActive ? `ga:${gaClick?.areaId ?? ''}:${gaClick?.clickEpoch ?? ''}`
    : tableActive ? `table:${pendingId ?? ''}:${candidateEpoch ?? ''}`
      : seatActive ? `seat:${pendingId ?? ''}:${candidateEpoch ?? ''}`
        : removeActive ? `remove:${removalSeat?.label ?? ''}` : null;
  const shouldRetirePending = scope.pendingSeat !== null && !gaActive && !immersiveInspectionVisible && !promptVisible &&
    scope.presentation.prompt === null;
  const retiredPendingRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const key = pendingId === undefined || candidateEpoch === undefined ? undefined : `${pendingId}:${candidateEpoch}`;
    if (!shouldRetirePending || key === undefined || retiredPendingRef.current === key) return;
    retiredPendingRef.current = key;
    scope.confirmPending();
  }, [candidateEpoch, pendingId, scope.confirmPending, shouldRetirePending]);
  useLayoutEffect(() => {
    if (!shouldRetirePending) retiredPendingRef.current = undefined;
  }, [shouldRetirePending]);
  useLayoutEffect(() => { if (!cardActive) setCardBand(0); }, [cardActive]);
  // The swell owns the last beat: when it ends the map may put itself back.
  // Under reduced motion the press has already released, and this never runs.
  useEffect(() => {
    if (!addStage.swelling) return undefined;
    const ms = seatLayerPickerConfirmSwellMs(addPlan);
    if (ms <= 0) { advanceAdd({ kind: 'swelled' }); return undefined; }
    const timer = setTimeout(() => advanceAdd({ kind: 'swelled' }), ms);
    return () => clearTimeout(timer);
  }, [addPlan, addStage.swelling, advanceAdd]);
  // A card that went away without an answer is owed nothing; a new session is
  // a new runtime and the choreography never carries across one.
  useEffect(() => {
    if (cardActive) return;
    advanceAdd({ kind: 'dismissed' });
  }, [advanceAdd, cardActive, scope.sessionId]);
  // §4.10 — a decision surface that hands the screen back, accepted or
  // cancelled, returns focus to the map region. Falling to the top of the tree
  // would put a buyer back at the header after every seat.
  const decisionWasUp = useRef(false);
  useEffect(() => {
    if (decisionWasUp.current && !decisionUp) seatLayerPickerFocusOn(mapRegionRef.current);
    decisionWasUp.current = decisionUp;
  }, [decisionUp]);
  // §3.8.2 — one lift per session: the runtime pans the map out from under the
  // card where it can, and is given the card's band as a viewport inset where
  // it cannot. Never both.
  // The lift is held past the card's own life while the chip is still flying:
  // releasing it on the press slid the seat out from under the chip mid-air.
  const heldLiftSeatRef = useRef<string | null>(null);
  if (cardSeatId !== null) heldLiftSeatRef.current = cardSeatId;
  const liftSeatId = wide ? null : cardSeatId ?? (addStage.liftHeld ? heldLiftSeatRef.current : null);
  const liftInset = useSeatLayerPickerSeatLiftBinding({
    bottom: phoneBands.bottom,
    controller: scope.controller,
    mapHeight,
    onAnchorDy: setAnchorDy,
    revision: snapshot?.revision ?? 0,
    seatId: liftSeatId,
    sessionId: scope.sessionId,
    sheet: wide ? 0 : cardBand,
    top: phoneBands.top,
  });
  const leaseBands = liftInset > phoneBands.bottom
    ? Object.freeze({ top: phoneBands.top, bottom: liftInset })
    : phoneBands;
  const blocked = seatLayerPickerAdaptiveInteractionBlocked(
    scope.isReady,
    fatal ? scope.error : undefined,
    (!immersiveInspectionVisible && (promptVisible || scope.presentation.prompt !== null)) || emptySnapshot,
  );
  useSeatLayerPickerAdaptiveInteraction(scope, blocked);
  const mapInsetLease = useMemo(
    () => phoneInsetsVisible ? scope.claimViewportInsetBand('adaptive-phone') : undefined,
    [phoneInsetsVisible, scope.claimViewportInsetBand, scope.controller, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(mapInsetLease, phoneInsetsVisible ? leaseBands : undefined);
  // §4.7 reveal-after-framing. A wide layout, or a phone with no chrome over
  // the map, has nothing to report and so is framed as soon as it is ready.
  const [framed, setFramed] = useState(false);
  useLayoutEffect(() => { setFramed(false); }, [scope.controller, scope.sessionId]);
  useLayoutEffect(() => {
    if (scope.isReady && !framed) setFramed(true);
  }, [framed, leaseBands, scope.isReady]);
  const rungRef = useRef<Readonly<{ controller: typeof scope.controller; sessionId: number; rung: string | undefined }>>({
    controller: scope.controller,
    sessionId: scope.sessionId,
    rung: scope.presentation.mapRung,
  });
  useLayoutEffect(() => {
    const previous = rungRef.current;
    const descended = previous.controller === scope.controller && previous.sessionId === scope.sessionId &&
      previous.rung === 'seats' && scope.presentation.mapRung === 'overview';
    if ((promptVisible || scope.presentation.prompt !== null || descended) && scope.presentation.sheet !== 'collapsed') {
      scope.setPresentation({ type: 'setSheet', sheet: 'collapsed' });
    }
    rungRef.current = { controller: scope.controller, sessionId: scope.sessionId, rung: scope.presentation.mapRung };
  }, [promptVisible, scope.controller, scope.presentation.mapRung, scope.presentation.prompt, scope.presentation.sheet, scope.sessionId, scope.setPresentation]);
  useLayoutEffect(() => {
    try { void Promise.resolve(onSnapshotChanged?.()).catch(() => undefined); } catch { /* Observation is isolated. */ }
  }, [onSnapshotChanged, scope.snapshot]);
  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0) return;
    setBounds((previous) => previous?.width === width && previous.height === height ? previous : Object.freeze({ width, height }));
  };
  // §4.10 — ONE node, and it says so. The seats are drawn on a canvas inside a
  // web view, which exposes nothing to assistive technology, so a buyer
  // listening to this screen cannot explore the venue. The honest thing is to
  // name the region and say where the controls that DO pick a seat are, rather
  // than leave a silent rectangle filling most of the screen. Per-seat nodes
  // are a runtime gap — see the spec's §4.9.
  const venueName = snapshot?.event?.venue ?? snapshot?.event?.name ?? plan.options.eventName ??
    scope.strings.translate('venueView');
  const chart = <View
    accessible
    accessibilityHint={scope.strings.translate('venueMapHint')}
    accessibilityLabel={scope.strings.translate('venueMap', { values: { venue: venueName } })}
    accessibilityRole="image"
    collapsable={false}
    nativeID={seatLayerPickerReadingOrderId('map')}
    pointerEvents={blocked ? 'none' : 'auto'}
    ref={mapRegionRef}
    style={styles.chartOwner}
    {...underDialog(decisionUp)}
    testID="seatlayer-chart-owner"
  >
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.chartOwner}
    >{part(builders, scope, 'map', <SeatLayerPickerChart onReady={onReady} />)}</View>
  </View>;
  const holdCountdown = plan.options.chrome.header && plan.options.chrome.holdPill
    ? part(builders, scope, 'holdCountdown', <SeatLayerPickerHoldCountdown />)
    : null;
  const header = plan.options.chrome.header
    ? part(builders, scope, 'header', <SeatLayerPickerHeader
      compact={!wide}
      holdCountdown={holdCountdown}
      onClose={onClose}
      options={{
        eventName: plan.options.eventName,
        hideEventDetails: plan.options.hideEventDetails,
        showHoldPill: plan.options.chrome.holdPill && plan.options.showHoldPill,
      }}
      reserveInset={false}
      showEventDetails={!plan.options.hideEventDetails}
      showHoldPill={plan.options.chrome.holdPill && plan.options.showHoldPill}
    />)
    : null;
  const legend = legendVisible
    ? part(builders, scope, 'legend', <SeatLayerPriceLegend
      compact={!wide}
      edgeFadeColor={panoramaUp ? seatLayerPickerTokens.color.dark.mapBackground : undefined}
      reserveInset={false}
    />)
    : null;
  const floors = floorStripVisible
    ? part(builders, scope, 'floorStrip', <SeatLayerFloorStrip compact={!wide} reserveInset={false} />)
    : null;
  const floorSelector = floorSelectorVisible
    ? part(builders, scope, 'floorSelector', withSafeArea(SeatLayerPickerFloorSelector, safeLayout.insets))
    : null;
  const sections = wide && nativeChrome
    ? part(builders, scope, 'sectionNavigator', <SeatLayerPickerSectionNavigator onSectionFocused={onSectionFocused} />)
    : null;
  const accessibility = accessibilityVisible
    ? part(builders, scope, 'accessibilityFilters', withSafeArea(SeatLayerPickerAccessibilityFilters, safeLayout.insets, { compact: !wide }))
    : null;
  // Panorama owns the complete gesture surface and its web close button. The
  // Map / 3D switch occupies that same top-right slot, so leaving it mounted
  // hides the buyer's only exit behind native chrome.
  const controls = !panoramaUp && plan.options.chrome.mapControls &&
    (chromeEligibility.mapControls || accessibilityVisible)
    ? part(builders, scope, 'mapControls', <SeatLayerMapControls
      compact={!wide}
      enable3D={plan.options.enable3D && plan.options.chrome.map3D}
      showAccessibilityControl
      showOverviewControl={plan.options.chrome.overview}
      showZoomControls={plan.options.chrome.zoom}
      showZoomToFitControl={plan.options.chrome.fit}
      zoomInLabel="Zoom in"
      zoomOutLabel="Zoom out"
      // §3.5, 0.9.1: the accessibility disc HEADS the column. It used to be
      // anchored bottom-left on its own, which put two ways to reach the same
      // filter on the same map once the column grew one.
      accessibilityControl={accessibility}
      // Map | 3D is drawn in the top rail by this same component on both
      // compositions, and it is not a member of the disc column, so there is
      // nothing to withhold on a phone.
      includeViewModeControl
      cardAsking={cardActive}
      onViewModeLayout={setViewModeWidth}
      bottomInset={dockVisible ? drawnDockHeight : 0}
      reserveInset={false}
    />)
    : null;
  // §3.12 — one toast at a time, fed by the buyer-state machine's own
  // payloads. `reselectLapsedSeats` is the only recovery there is.
  const toasts = useSeatLayerPickerToastQueue();
  const toldRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const news = seatLayerPickerHoldLapseNews(scope.holdLapse, scope.holdLapsed, scope.strings.locale);
    if (news === undefined) { toldRef.current = undefined; return; }
    if (toldRef.current === news.key) return;
    toldRef.current = news.key;
    toasts.show(seatLayerPickerToastRequest(news, scope));
  }, [scope.holdLapse, scope.holdLapsed, scope.strings, toasts]);
  const toastLayer = <SeatLayerPickerToastLayer
    lift={wide ? undefined : bottomInset + seatLayerPickerTokens.size.toastCardLift}
    onFocusReturn={() => seatLayerPickerFocusOn(mapRegionRef.current)}
    queue={toasts.queue}
  />;
  const status = fatal
    ? part(builders, scope, 'error', <SeatLayerPickerErrorView />)
    : !scope.isReady || !framed
      ? part(builders, scope, 'loading', <SeatLayerPickerLoadingView framed={framed} />)
      : emptySnapshot
        ? part(builders, scope, 'empty', <SeatLayerPickerEmptyView />)
        : null;
  // §3.13.13 — the hand-off notice is its own inline statement, never the
  // command error: a hold the host owns is a state, not a failure.
  const actionError = ticketPanelVisible
    ? part(builders, scope, 'actionError', <>
      <SeatLayerHoldOwnershipNotice />
      <SeatLayerPickerActionError />
    </>)
    : null;
  const dock = dockVisible
    ? part(builders, scope, 'dockBar', <SeatLayerDockBar onSectionChanged={onSectionFocused} reserveBottomInset={false} />)
    : null;
  const holdLapse = plan.options.announceHoldLapse && ticketPanelVisible
    ? part(builders, scope, 'holdLapse', <SeatLayerHoldLapseNotice />)
    : null;
  const cartList = ticketPanelVisible
    ? part(builders, scope, 'cartList', <SeatLayerCartList
      onSeatRemoved={onSeatRemoved === undefined ? undefined : (line) =>
        invokeSeatLayerPickerCallback(onSeatRemoved, line.label, scope.reportError)}
    />)
    : null;
  const bestAvailable = plan.options.enableBestAvailable
    ? part(builders, scope, 'bestAvailable', withSafeArea(SeatLayerBestSeatsForm, safeLayout.insets))
    : null;
  const checkout = ticketPanelVisible
    ? part(builders, scope, 'checkoutBar', <SeatLayerBookButton onCheckout={onCheckout} />)
    : null;
  const cartSheet = !wide && ticketPanelVisible
    ? part(builders, scope, 'cartSheet', withSafeArea(SeatLayerCartSheet, safeLayout.insets, {
      expanded: scope.presentation.sheet === 'expanded',
      onExpandedChanged: (expanded: boolean) => scope.setPresentation({ type: 'setSheet', sheet: expanded ? 'expanded' : 'collapsed' }),
      onCheckout, reserveBottomInset: true, cartList, bestSeats: bestAvailable,
      checkoutBar: checkout, actionError, holdLapse,
      salesClosed: <SeatLayerPickerSalesClosedStatement />,
    }))
    : null;

  // §4.10 — the ONE reading order, declared here and nowhere else. Sibling
  // surfaces are all ordered or none are, so every surface that is mounted
  // appears: a group with some ordered members falls back to geometry for the
  // rest, which is how the map came to be read before the prices.
  const readingOrder = seatLayerPickerAccessibilityOrder([
    { rung: 'header', mounted: header !== null },
    { rung: 'rail', mounted: !wide && legend !== null },
    { rung: 'rail', mounted: wide && legend !== null, suffix: 'wide' },
    { rung: 'map', mounted: true },
    { rung: 'mapChrome', mounted: true },
    { rung: 'mapChrome', mounted: venueVisible, suffix: 'venue3d' },
    { rung: 'mapChrome', mounted: plan.options.chrome.seatViewChrome && chromeEligibility.panorama, suffix: 'seat-view' },
    { rung: 'dock', mounted: dock !== null },
    { rung: 'dock', mounted: wide && sections !== null },
    { rung: 'prompt', mounted: status === null && !immersiveInspectionVisible },
    { rung: 'notice', mounted: true, suffix: 'toast' },
    { rung: 'notice', mounted: status !== null, suffix: 'status' },
    { rung: 'notice', mounted: !wide, suffix: 'foot' },
    { rung: 'notice', mounted: true, suffix: 'states' },
    { rung: 'sheet', mounted: !wide && cartSheet !== null },
    { rung: 'sheet', mounted: wide && ticketPanelVisible, suffix: 'wide' },
  ]);

  return (
    <SeatLayerCartLandingProvider landing={addStage.stage === 'flying'}>
    <View
      ref={rootRef}
      onLayout={onLayout}
      style={[styles.root, sanitizeSeatLayerPickerStyle(style)]}
      testID={`seatlayer-adaptive-${plan.layout}`}
      {...readingOrder}
    >
      {presentationActive && plan.options.chrome.systemBars ? <SeatLayerPickerSystemStatusBar /> : null}
      {presentationActive && plan.options.haptics && hapticAdapter ? <SeatLayerPickerHaptics adapter={hapticAdapter} /> : null}
      {presentationActive ? <SeatLayerPickerScopeBackHandler /> : null}
      <View style={[styles.safeAreaContent, {
        backgroundColor: scope.resolvedTheme.colors.surface,
        paddingBottom: wide ? safeLayout.insets.bottom : 0,
        paddingEnd: safeLayout.insets.right,
        paddingStart: safeLayout.insets.left,
        paddingTop: safeLayout.insets.top,
      }]} testID="seatlayer-adaptive-safe-content">
        {ordered('header', header, { hidden: decisionUp })}
        {wide || legend === null ? null : <View style={[styles.legendBand, {
          backgroundColor: scope.resolvedTheme.colors.surface,
          borderBottomColor: scope.resolvedTheme.colors.divider,
          height: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.topRailHeight, seatLayerPickerTypeScaleClamp('rail')),
        }]} nativeID={seatLayerPickerReadingOrderId('rail')} testID="seatlayer-price-band" {...underDialog(decisionUp)}>{legend}</View>}
        <View style={wide ? styles.wide : styles.phone}>
        <View onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          if (!Number.isFinite(next) || next < 0) return;
          setMapHeight((current) => Math.abs(current - next) < .5 ? current : next);
        }} style={styles.map}>
          {chart}
          {wide ? null : <SpotlightGlass anchorDy={anchorDy} screenPoint={cardSeat?.screenPoint} visible={cardActive} />}
          {wide ? null : <View collapsable={false} nativeID={seatLayerPickerReadingOrderId('mapChrome')} pointerEvents="box-none" style={styles.phoneOverlays} {...underDialog(decisionUp)}>
            <View pointerEvents="box-none" style={styles.controlsOverlay}>{controls}</View>
            {venueMode ? null : <View pointerEvents="box-none" style={[styles.floorRail, { top: floorTop }]}>{floors}</View>}
            {testBadgeVisible ? <View
              onLayout={(event) => {
                const next = event.nativeEvent.layout.width;
                if (!Number.isFinite(next) || next <= 0) return;
                setTestBadgeWidth((current) => current !== undefined && Math.abs(current - next) < .5 ? current : next);
              }}
              pointerEvents="box-none"
              style={[styles.testRail, { top: badgeTop }]}
            ><SeatLayerPickerTestModeIndicator compact /></View> : null}
            {/* The accessibility disc has moved into the control column, so
                the bottom-left corner is the floor selector's alone. */}
            {venueMode ? null : <View pointerEvents="box-none" style={[styles.floorSelectorRail, { bottom: bottomInset + seatLayerPickerMapControlsEdgeInset }]}>{floorSelector}</View>}
          </View>}
          {/* §4.10 — the dock is its own rung, so it is never read between two
              halves of the map's chrome. It is absolutely positioned either
              way, so lifting it out of the overlay stack paints identically. */}
          {dock === null ? null : <View collapsable={false} nativeID={seatLayerPickerReadingOrderId('dock')} pointerEvents="box-none" style={styles.dockRail} {...underDialog(decisionUp)}>{dock}</View>}
          {wide ? <View collapsable={false} nativeID={seatLayerPickerReadingOrderId('mapChrome')} pointerEvents="box-none" style={styles.wideMapOverlays} {...underDialog(decisionUp)}>
            {testBadgeVisible ? <View pointerEvents="box-none" style={[styles.wideTestRail, { top: venueMode && venueVisible ? 62 : 12 }]}><SeatLayerPickerTestModeIndicator compact={false} /></View> : null}
            <View pointerEvents="box-none" style={styles.wideControlsRail}>{controls}</View>
            <View pointerEvents="box-none" style={styles.wideFloorSelectorRail}>{floorSelector}</View>
          </View> : null}
          {ordered('mapChrome', venueVisible ? part(builders, scope, 'venue3D', <SeatLayerVenue3DChrome bottomInset={wide ? 10 : seatLayerPickerMapControlsEdgeInset + bottomInset} reserveInset={!wide} topInset={wide ? 10 : immersiveTopInset} />) : null, { overlay: true, suffix: 'venue3d' })}
          {ordered('mapChrome', plan.options.chrome.seatViewChrome && chromeEligibility.panorama ? part(builders, scope, 'seatViewChrome', <SeatLayerSeatPanoramaChrome bottomInset={wide ? 12 : seatLayerPickerMapControlsEdgeInset + bottomInset} reserveInset={!wide} topInset={wide ? 12 : immersiveTopInset} />) : null, { overlay: true, suffix: 'seat-view' })}
          {ordered('prompt', status === null && !immersiveInspectionVisible ? <SeatLayerPickerPromptTransition
            anchor={!wide && cardActive ? 'foot' : 'centre'}
            // The card rests over the DOCK's band, not over the whole bottom
            // band the runtime is told about. The floating discs and the
            // accessibility key are drawn ON the map and the card is allowed
            // to pass in front of them; measuring the card's home against them
            // instead pushed it 56 points up the map, half a card away from
            // where the reference puts it.
            bottomInset={bottomInset}
            prompt={prompt}
            promptKey={promptKey}
            scrimColor={!wide && cardActive
              ? 'transparent'
              : seatLayerPickerColorAlpha(scope.resolvedTheme.colors.surface, .64)}
            sessionId={`${scope.sessionId}:${snapshot?.sessionId ?? ''}`}
          /> : null, { overlay: true })}
          {ordered('notice', toastLayer, { overlay: true, suffix: 'toast' })}
          {status === null ? null : <View collapsable={false} nativeID={seatLayerPickerReadingOrderId('notice', 'status')} style={[styles.owner, {
            backgroundColor: seatLayerPickerColorAlpha(
              scope.resolvedTheme.colors.background,
              fatal ? .98 : .94,
            ),
          }]}>{status}</View>}
        </View>
        {wide ? <View style={[styles.rail, { width: plan.sideRailWidth, backgroundColor: scope.resolvedTheme.colors.surface, borderStartColor: scope.resolvedTheme.colors.divider }]} testID="seatlayer-wide-rail">
          {ordered('rail', legend, { suffix: 'wide' })}{floors ? <View style={styles.wideFloors}>{floors}</View> : null}{ordered('dock', sections)}
          {bestAvailable ? <View style={styles.wideAssist}>{bestAvailable}</View> : null}
          {ordered('sheet', ticketPanelVisible ? <ScrollView style={[styles.wideCart, { borderColor: scope.resolvedTheme.colors.divider }]} contentContainerStyle={styles.wideCartContent}>{holdLapse}{cartList}</ScrollView> : null, { suffix: 'wide' })}
          {ticketPanelVisible ? actionError : null}
          {ticketPanelVisible ? <SeatLayerPickerSalesClosedStatement /> : null}
          <View style={styles.trailingAttribution} testID="seatlayer-wide-attribution"><SeatLayerPickerAttribution compact={false} /></View>
          {ticketPanelVisible ? checkout : null}
        </View> : <>{ordered('sheet', cartSheet)}<View collapsable={false} nativeID={seatLayerPickerReadingOrderId('notice', 'foot')} pointerEvents="box-none" style={[styles.phoneFooter, { paddingBottom: cartSheet === null ? safeLayout.insets.bottom : 0 }]} testID="seatlayer-phone-footer">{cartSheet === null ? <>{holdLapse}{actionError}<View style={styles.trailingAttribution} testID="seatlayer-phone-attribution"><SeatLayerPickerAttribution /></View></> : null}</View></>}
        </View>
      </View>
      <View collapsable={false} nativeID={seatLayerPickerReadingOrderId('notice', 'states')} pointerEvents="box-none" style={styles.phoneOverlays}>
        <SeatLayerPickerSoldOutOverlay />
        {plan.options.showBookedOverlay ? <SeatLayerPickerBookedOverlay onBackToMap={onClose} /> : null}
        <SeatLayerPickerAccessPanel hostOwnsRecovery={hostOwnsAccessRecovery} />
      </View>
      {selectionFlight === undefined ? null : <SeatLayerSelectionFlight
        key={selectionFlight.id}
        moment={selectionFlight}
        onComplete={(id) => {
          setSelectionFlight((current) => current?.id === id ? undefined : current);
          advanceAdd({ kind: 'landed' });
        }}
      />}
    </View>
    </SeatLayerCartLandingProvider>
  );
}
