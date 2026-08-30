import React, { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { canRenderSeatLayerPickerAccessibilityFilters, SeatLayerPickerAccessibilityFilters } from './accessibility';
import { useSeatLayerPickerAdaptiveInteraction } from './adaptiveInteraction';
import {
  planSeatLayerPickerAdaptiveLayout,
  planSeatLayerPickerPhoneBands,
  seatLayerPickerAdaptiveInteractionBlocked,
  seatLayerPickerPendingCandidateEpochFor,
  seatLayerPickerPhoneChromeTop,
  seatLayerPickerPhoneLegendHeight,
  seatLayerPickerPhoneRailGap,
  seatLayerPickerPhoneRailTop,
} from './adaptiveLayoutState';
import { useSeatLayerPickerAdaptiveSheetOpening } from './adaptiveSheetOpening';
import { SeatLayerPickerAttribution } from './attribution';
import type { SeatLayerPickerBuilders } from './builders';
import { SeatLayerConfirmCard } from './SeatLayerConfirmCard';
import { SeatLayerPickerSeatConfirmation } from './SeatLayerPickerSeatConfirmation';
import { SeatLayerBestSeatsForm } from './SeatLayerBestSeatsForm';
import { SeatLayerBookButton, SeatLayerCartSheet } from './SeatLayerCartSheet';
import { SeatLayerCartList } from './SeatLayerCartList';
import { SeatLayerDockBar } from './SeatLayerDockBar';
import { SeatLayerFloorStrip } from './SeatLayerFloorStrip';
import { SeatLayerPickerFloorSelector } from './SeatLayerPickerFloorSelector';
import { SeatLayerPickerSectionNavigator } from './SeatLayerPickerSectionNavigator';
import { SeatLayerMapControls, seatLayerPickerMapControlsEdgeInset } from './SeatLayerMapControls';
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
import { SeatLayerPickerEmptyView, SeatLayerPickerErrorView, SeatLayerPickerLoadingView, SeatLayerPickerTestModeIndicator } from './status';
import { seatLayerPickerTestModeIndicatorCompactHeight } from './testModeIndicator';
import { SeatLayerPickerSystemStatusBar } from './systemStatusBar';
import { SeatLayerVenue3DChrome } from './SeatLayerVenue3DChrome';
import { seatLayerPickerColorAlpha } from './mapChromeTheme';
import { renderSeatLayerPickerAdaptivePart as part } from './adaptiveParts';
import { seatLayerPickerAdaptiveStyles as styles } from './adaptiveStyles';
import { resolveSeatLayerPickerAdaptiveChromeEligibility } from './adaptiveChromeEligibility';
import type { SeatLayerPickerCheckoutHandoff } from './models';
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
  readonly onCartUndo?: (labels: readonly string[]) => unknown;
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

/** Inner adaptive composition. The outer route, provider, and page lifecycle remain host-owned. */
export function SeatLayerPickerAdaptiveLayout({
  builders,
  onClose,
  onCheckout,
  onCartUndo,
  onSeatRemoved,
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
  const [bounds, setBounds] = useState<SeatLayerPickerAdaptiveMeasuredBounds | undefined>(undefined);
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
  const phoneDockVisible = !wide && plan.options.chrome.dock && nativeChrome && snapshot?.map.rung === 'seats' &&
    focusedSection !== undefined;
  const chromeEligibility = resolveSeatLayerPickerAdaptiveChromeEligibility({
    controller: scope.controller, snapshot, seatView,
    enable3D: plan.options.enable3D, enableSeatView: plan.options.enableSeatView,
    fit: plan.options.chrome.fit, hasFocusedSection: focusedSection !== undefined,
    map3D: plan.options.chrome.map3D, overview: plan.options.chrome.overview,
  });
  const panoramaVisible = chromeEligibility.panorama;
  const phoneControls = !wide && plan.options.chrome.mapControls
    ? Object.freeze({
      bottom: !panoramaVisible && chromeEligibility.canFit,
      left: !panoramaVisible && chromeEligibility.canOverview,
      right: chromeEligibility.canSwitchView,
    })
    : Object.freeze({ bottom: false, left: false, right: false });
  const [viewModeWidth, setViewModeWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => { setViewModeWidth(undefined); }, [phoneControls.right, scope.resolvedTheme, scope.sessionId, scope.snapshot?.sessionId, scope.strings]);
  const categoriesVisible = nativeChrome && (snapshot?.categories.some((category) => !category.notForSale) ?? false);
  const floorsVisible = (snapshot?.map.floors.length ?? 0) > 1;
  const venueMode = snapshot?.map.buyerView === 'venue3d';
  const venueVisible = venueMode && plan.options.chrome.venue3D && plan.options.enable3D && nativeChrome &&
    snapshot?.capabilities.includes('venue3d') === true && scope.controller.mapController.supportsPickerCapability('venue-3d-v1') &&
    scope.controller.mapController.supportsPickerCommand('picker.setBuyerView');
  const floorStripVisible = !venueMode && !panoramaVisible && plan.options.chrome.floorStrip &&
    (wide || !plan.options.chrome.floorSelector) && floorsVisible && nativeChrome &&
    scope.controller.mapController.supportsPickerCommand('picker.setFloor');
  const floorSelectorVisible = !venueMode && !panoramaVisible && plan.options.chrome.floorSelector &&
    (!wide || !plan.options.chrome.floorStrip) && floorsVisible &&
    scope.controller.mapController.isReady && nativeChrome &&
    scope.controller.mapController.supportsPickerCommand('picker.setFloor');
  const testBadgeVisible = snapshot?.event.mode === 'test' && nativeChrome;
  const accessibilityVisible = !venueMode && !panoramaVisible && nativeChrome && plan.options.chrome.accessibility &&
    canRenderSeatLayerPickerAccessibilityFilters(scope.controller, snapshot);
  const priceRailAvailable = plan.options.chrome.priceLegend && categoriesVisible;
  const legendVisible = priceRailAvailable && (!phoneControls.right || viewModeWidth !== undefined);
  const legendHeight = legendVisible
    ? seatLayerPickerPhoneLegendHeight : 0;
  const floorHeight = floorStripVisible
    ? seatLayerPickerTokens.size.minimumHitTarget : 0;
  const immersiveTopInset = priceRailAvailable ? seatLayerPickerPhoneLegendHeight : seatLayerPickerMapControlsEdgeInset;
  const topControlsHeight = phoneControls.left || phoneControls.right ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerPhoneChromeTop : 0;
  const legendTop = seatLayerPickerPhoneRailTop;
  const legendLeft = phoneControls.left
    ? seatLayerPickerMapControlsEdgeInset + seatLayerPickerTokens.size.minimumHitTarget + seatLayerPickerPhoneRailGap
    : 0;
  const legendRight = phoneControls.right && viewModeWidth !== undefined
    ? seatLayerPickerMapControlsEdgeInset + viewModeWidth + seatLayerPickerPhoneRailGap
    : seatLayerPickerTokens.size.minimumHitTarget;
  const floorTop = floorStripVisible ? Math.max(seatLayerPickerPhoneChromeTop, legendHeight > 0 ? legendTop + legendHeight : 0, topControlsHeight) : 0;
  const topRailHeight = venueMode && venueVisible
    ? immersiveTopInset + seatLayerPickerTokens.size.minimumHitTarget
    : Math.max(legendHeight > 0 ? legendTop + legendHeight : 0, topControlsHeight, floorTop + floorHeight);
  const badgeTop = topRailHeight > 0 ? topRailHeight + seatLayerPickerPhoneRailGap : seatLayerPickerPhoneRailTop;
  const topHeight = testBadgeVisible ? badgeTop + seatLayerPickerTestModeIndicatorCompactHeight : topRailHeight;
  const bottomInset = phoneDockVisible ? seatLayerPickerTokens.size.dockBarHeight : 0;
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
  const seatActive = scope.isReady && !scope.readOnly && !gaActive && !tableActive &&
    scope.pendingSeat !== null && plan.options.confirmSelection && plan.options.chrome.confirmCard;
  const confirmationAction = ({ action, seat }: { action: string; seat: unknown }) => {
    if (action === 'confirm') invokeSeatLayerPickerCallback(onSeatSelected, seat as never, scope.reportError);
    if (action === 'seatView' || action === 'venue3d') invokeSeatLayerPickerCallback(onSeatViewOpened, seat as never, scope.reportError);
  };
  const promptPart = gaActive
    ? part(builders, scope, 'generalAdmissionPrompt', <SeatLayerPickerGAPrompt safeAreaInsets={safeLayout.insets} />)
    : tableActive
      ? part(builders, scope, 'tablePrompt', <SeatLayerPickerTablePrompt candidate={tableCandidate} safeAreaInsets={safeLayout.insets} />)
      : seatActive
        ? part(builders, scope, wide ? 'seatConfirmation' : 'confirmCard', wide
          ? <SeatLayerPickerSeatConfirmation showSeatView={plan.options.enableSeatView} show3D={plan.options.enable3D} onAction={confirmationAction} />
          : <SeatLayerConfirmCard showSeatView={plan.options.enableSeatView} show3D={plan.options.enable3D} onAction={confirmationAction} />)
        : null;
  const prompt = promptPart;
  const promptVisible = prompt !== null;
  const promptKey = gaActive ? `ga:${gaClick?.areaId ?? ''}:${gaClick?.clickEpoch ?? ''}`
    : tableActive ? `table:${pendingId ?? ''}:${candidateEpoch ?? ''}`
      : seatActive ? `seat:${pendingId ?? ''}:${candidateEpoch ?? ''}` : null;
  const shouldRetirePending = scope.pendingSeat !== null && !gaActive && !promptVisible &&
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
  const blocked = seatLayerPickerAdaptiveInteractionBlocked(
    scope.isReady,
    fatal ? scope.error : undefined,
    promptVisible || scope.presentation.prompt !== null || emptySnapshot,
  );
  useSeatLayerPickerAdaptiveInteraction(scope, blocked);
  const mapInsetLease = useMemo(
    () => phoneInsetsVisible ? scope.claimViewportInsetBand('adaptive-phone') : undefined,
    [phoneInsetsVisible, scope.claimViewportInsetBand, scope.controller, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(mapInsetLease, phoneInsetsVisible ? phoneBands : undefined);
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
  const chart = <View pointerEvents={blocked ? 'none' : 'auto'} style={styles.chartOwner} testID="seatlayer-chart-owner">{part(builders, scope, 'map', <SeatLayerPickerChart onReady={onReady} />)}</View>;
  const holdCountdown = plan.options.chrome.header && plan.options.chrome.holdPill
    ? part(builders, scope, 'holdCountdown', <SeatLayerPickerHoldCountdown />)
    : null;
  const header = plan.options.chrome.header
    ? part(builders, scope, 'header', <SeatLayerPickerHeader
      compact={!wide}
      holdCountdown={holdCountdown}
      onClose={onClose}
      options={{ hideEventDetails: plan.options.hideEventDetails, showHoldPill: plan.options.chrome.holdPill }}
      reserveInset={false}
      showEventDetails={!plan.options.hideEventDetails}
      showHoldPill={plan.options.chrome.holdPill}
    />)
    : null;
  const legend = legendVisible
    ? part(builders, scope, 'legend', <SeatLayerPriceLegend
      compact={!wide}
      edgeFadeColor={panoramaVisible ? seatLayerPickerTokens.color.dark.mapBackground : undefined}
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
  const controls = plan.options.chrome.mapControls && chromeEligibility.mapControls
    ? part(builders, scope, 'mapControls', <SeatLayerMapControls
      compact={!wide}
      enable3D={plan.options.enable3D && plan.options.chrome.map3D}
      showAccessibilityControl={false}
      showOverviewControl={!panoramaVisible && plan.options.chrome.overview}
      showZoomControls={!panoramaVisible && plan.options.chrome.zoom}
      showZoomToFitControl={!panoramaVisible && plan.options.chrome.fit}
      includeViewModeControl
      onViewModeLayout={setViewModeWidth}
      bottomInset={phoneDockVisible ? seatLayerPickerTokens.size.dockBarHeight : 0}
      reserveInset={false}
    />)
    : null;
  const accessibility = accessibilityVisible
    ? part(builders, scope, 'accessibilityFilters', withSafeArea(SeatLayerPickerAccessibilityFilters, safeLayout.insets, { compact: !wide }))
    : null;
  const status = fatal
    ? part(builders, scope, 'error', <SeatLayerPickerErrorView />)
    : !scope.isReady ? part(builders, scope, 'loading', <SeatLayerPickerLoadingView />)
      : emptySnapshot
        ? part(builders, scope, 'empty', <SeatLayerPickerEmptyView />)
        : null;
  const actionError = ticketPanelVisible
    ? part(builders, scope, 'actionError', <SeatLayerPickerActionError />)
    : null;
  const dock = phoneDockVisible
    ? part(builders, scope, 'dockBar', <SeatLayerDockBar onSectionChanged={onSectionFocused} reserveBottomInset={false} />)
    : null;
  const holdLapse = plan.options.announceHoldLapse && ticketPanelVisible
    ? part(builders, scope, 'holdLapse', <SeatLayerHoldLapseNotice />)
    : null;
  const cartList = ticketPanelVisible
    ? part(builders, scope, 'cartList', <SeatLayerCartList
      onSeatRemoved={onSeatRemoved === undefined ? undefined : (line) =>
        invokeSeatLayerPickerCallback(onSeatRemoved, line.label, scope.reportError)}
      onUndo={onCartUndo}
    />)
    : null;
  const bestAvailable = plan.options.enableBestAvailable
    ? part(builders, scope, 'bestAvailable', withSafeArea(SeatLayerBestSeatsForm, safeLayout.insets))
    : null;
  const checkout = ticketPanelVisible
    ? part(builders, scope, 'checkoutBar', <SeatLayerBookButton onCheckout={onCheckout} compact={false} />)
    : null;
  const cartSheet = !wide && ticketPanelVisible
    ? part(builders, scope, 'cartSheet', withSafeArea(SeatLayerCartSheet, safeLayout.insets, {
      expanded: scope.presentation.sheet === 'expanded',
      onExpandedChanged: (expanded: boolean) => scope.setPresentation({ type: 'setSheet', sheet: expanded ? 'expanded' : 'collapsed' }),
      onCheckout, reserveBottomInset: false, cartList, bestSeats: bestAvailable,
      checkoutBar: checkout, actionError, holdLapse,
    }))
    : null;

  return (
    <View onLayout={onLayout} style={[styles.root, sanitizeSeatLayerPickerStyle(style)]} testID={`seatlayer-adaptive-${plan.layout}`}>
      {presentationActive && plan.options.chrome.systemBars ? <SeatLayerPickerSystemStatusBar /> : null}
      {presentationActive && plan.options.haptics && hapticAdapter ? <SeatLayerPickerHaptics adapter={hapticAdapter} /> : null}
      {presentationActive ? <SeatLayerPickerScopeBackHandler /> : null}
      <View style={[styles.safeAreaContent, {
        backgroundColor: scope.resolvedTheme.colors.surface,
        paddingBottom: safeLayout.insets.bottom,
        paddingEnd: safeLayout.insets.right,
        paddingStart: safeLayout.insets.left,
        paddingTop: safeLayout.insets.top,
      }]} testID="seatlayer-adaptive-safe-content">
        {header}
        <View style={wide ? styles.wide : styles.phone}>
        <View style={styles.map}>
          {chart}
          {wide ? null : <View pointerEvents="box-none" style={styles.phoneOverlays}>
            <View pointerEvents="box-none" style={[styles.legendRail, { left: legendLeft, right: legendRight, top: legendTop }]}>{legend}</View>
            <View pointerEvents="box-none" style={styles.controlsOverlay}>{controls}</View>
            {venueMode ? null : <View pointerEvents="box-none" style={[styles.floorRail, { top: floorTop }]}>{floors}</View>}
            {testBadgeVisible ? <View pointerEvents="box-none" style={[styles.testRail, { top: badgeTop }]}><SeatLayerPickerTestModeIndicator compact /></View> : null}
            <View pointerEvents="box-none" style={[styles.accessRail, { bottom: bottomInset + seatLayerPickerMapControlsEdgeInset }]}>{accessibility}</View>
            {venueMode ? null : <View pointerEvents="box-none" style={[styles.floorSelectorRail, { bottom: bottomInset + seatLayerPickerMapControlsEdgeInset + Math.max(
              accessibilityVisible ? seatLayerPickerTokens.size.minimumHitTarget : 0,
              phoneControls.bottom ? seatLayerPickerTokens.size.minimumHitTarget : 0,
            ) + (floorSelectorVisible && (accessibilityVisible || phoneControls.bottom) ? seatLayerPickerPhoneRailGap : 0) }]}>{floorSelector}</View>}
            <View pointerEvents="box-none" style={styles.dockRail}>{dock}</View>
          </View>}
          {wide ? <View pointerEvents="box-none" style={styles.wideMapOverlays}>
            {testBadgeVisible ? <View pointerEvents="box-none" style={[styles.wideTestRail, { top: venueMode && venueVisible ? 62 : 12 }]}><SeatLayerPickerTestModeIndicator compact={false} /></View> : null}
            <View pointerEvents="box-none" style={styles.wideControlsRail}>{controls}</View>
            <View pointerEvents="box-none" style={styles.wideFloorSelectorRail}>{floorSelector}</View>
          </View> : null}
          {venueVisible ? part(builders, scope, 'venue3D', <SeatLayerVenue3DChrome bottomInset={wide ? 10 : seatLayerPickerMapControlsEdgeInset + bottomInset} reserveInset={!wide} topInset={wide ? 10 : immersiveTopInset} />) : null}
          {plan.options.chrome.seatViewChrome && chromeEligibility.panorama ? part(builders, scope, 'seatViewChrome', <SeatLayerSeatPanoramaChrome bottomInset={wide ? 12 : seatLayerPickerMapControlsEdgeInset + bottomInset} reserveInset={!wide} topInset={wide ? 12 : immersiveTopInset} />) : null}
          {status === null ? <SeatLayerPickerPromptTransition
            prompt={prompt}
            promptKey={promptKey}
            scrimColor={seatLayerPickerColorAlpha(scope.resolvedTheme.colors.surface, .64)}
            sessionId={`${scope.sessionId}:${snapshot?.sessionId ?? ''}`}
          /> : null}
          {status === null ? null : <View style={[styles.owner, {
            backgroundColor: seatLayerPickerColorAlpha(
              scope.resolvedTheme.colors.background,
              fatal ? .98 : .94,
            ),
          }]}>{status}</View>}
        </View>
        {wide ? <View style={[styles.rail, { width: plan.sideRailWidth, backgroundColor: scope.resolvedTheme.colors.surface, borderStartColor: scope.resolvedTheme.colors.divider }]} testID="seatlayer-wide-rail">
          {legend}{floors ? <View style={styles.wideFloors}>{floors}</View> : null}{sections}
          {bestAvailable || accessibility ? <View style={styles.wideAssist}>{bestAvailable}{accessibility}</View> : null}
          {ticketPanelVisible ? <ScrollView style={[styles.wideCart, { borderColor: scope.resolvedTheme.colors.divider }]} contentContainerStyle={styles.wideCartContent}>{holdLapse}{cartList}</ScrollView> : null}
          {ticketPanelVisible ? actionError : null}
          <SeatLayerPickerAttribution compact={false} />
          {ticketPanelVisible ? checkout : null}
        </View> : <>{cartSheet}<View pointerEvents="box-none" style={styles.phoneFooter} testID="seatlayer-phone-footer">{cartSheet === null ? <>{holdLapse}{actionError}<SeatLayerPickerAttribution /></> : null}</View></>}
        </View>
      </View>
    </View>
  );
}
