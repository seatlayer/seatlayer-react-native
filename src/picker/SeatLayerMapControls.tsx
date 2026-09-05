import React, { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import {
  canRenderSeatLayerPickerAccessibilityFilters,
  SeatLayerPickerAccessibilityFilters,
} from './accessibility';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { blendSeatLayerPickerColor, focusedPickerSection, usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { SeatLayerPickerBlockedRegion } from './blockedRegionsContext';
import { seatLayerPickerMapChromeGround } from './mapChromeTheme';
import { seatLayerPickerTokens } from './tokens.g';

export interface SeatLayerMapControlsProps {
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<
    SeatLayerPickerStyles,
    | 'mapControlsContainer'
    | 'mapControlButton'
    | 'mapControlLabel'
    | 'accessibilityControlsContainer'
    | 'accessibilityControlButton'
    | 'accessibilityControlLabel'
  >;
  readonly edgeInset?: number;
  readonly bottomInset?: number;
  readonly enable3D?: boolean;
  readonly showZoomControls?: boolean;
  /** On compact layouts, replace Fit with one level of map return while zoomed in. */
  readonly showStepOutControl?: boolean;
  readonly showZoomToFitControl?: boolean;
  readonly showOverviewControl?: boolean;
  readonly showAccessibilityControl?: boolean;
  readonly includeViewModeControl?: boolean;
  /** Hosts may supply localized zoom labels when generated copy is unavailable. */
  readonly zoomInLabel?: string;
  readonly zoomOutLabel?: string;
  readonly reserveInset?: boolean;
  /** Measures the rendered Map/3D control so a sibling rail can reserve its localized width. */
  readonly onViewModeLayout?: (width: number) => void;
}

const segmentPaintHeight = seatLayerPickerTokens.size.viewModeButtonHeight;
/** Air between the two halves, so the bed reads between them and not only around. */
const segmentGap = 2;
/** §3.5 anchor regions: `size.mapAnchorGap` between members of one region. */
const controlGap = seatLayerPickerTokens.size.mapAnchorGap;
/** The zoom column is a column, not an anchor region; it carries its own gap. */
const zoomColumnGap = seatLayerPickerTokens.size.zoomColumnGap;
/** §3.5: every floating control is inset `size.mapAnchorInset` from the map's edges. */
export const seatLayerPickerMapControlsEdgeInset = seatLayerPickerTokens.size.mapAnchorInset;
/**
 * The top-corner band. The map's own corners are inset by `mapAnchorInset`, but
 * the band along its top edge — the Map/3D control and the test chip — sits
 * higher: they share a line with the price rail above them rather than floating
 * in the map's corner, and the corner inset put them a rung too low.
 */
export const seatLayerPickerMapControlsRailTop = 8;
/**
 * The air the Map/3D control carries above its own track so that its press
 * target clears the touch floor. The anchor takes it back, or the track lands
 * a bed's depth below the line the test chip opposite it stands on.
 */
export const seatLayerPickerViewModeTrackInset =
  (seatLayerPickerTokens.size.minimumHitTarget -
    seatLayerPickerTokens.size.viewModeControlHeight) / 2;

type BottomControlPlan = Readonly<{ height: number; zoomOffset: number }>;

export function planSeatLayerMapBottomControls(
  fit: boolean,
  zoomPair: boolean,
  accessibility: boolean,
  target: number,
): BottomControlPlan {
  if (zoomPair) {
    const zoomOffset = fit ? target + controlGap : 0;
    return Object.freeze({ height: zoomOffset + target * 2 + controlGap, zoomOffset });
  }
  return Object.freeze({ height: fit || accessibility ? target : 0, zoomOffset: 0 });
}

function inset(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

/** Scoped map controls. Its view layer takes already-gated availability and callbacks. */
export function SeatLayerMapControls(props: SeatLayerMapControlsProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const requestedAction = useRef<Readonly<{
    kind: 'overview' | 'zoomIn' | 'zoomOut' | 'fit' | 'map' | 'venue3d';
    sessionId: number;
  }> | undefined>(undefined);
  const [actionBusy, runAction] = usePickerSingleFlight(
    scope.sessionId, scope.reportError, async () => {
      const request = requestedAction.current;
      const action = request?.kind;
      const controller = scope.controller;
      const sessionId = scope.sessionId;
      const latest = controller.getSnapshot();
      if (!action || request?.sessionId !== sessionId || latest === undefined || controller !== scope.controller ||
        latest.map.buyerView !== 'map' && latest.map.buyerView !== 'venue3d') return undefined;
      const currentView = latest.map.buyerView;
      const execute = async (command: string, capabilities: readonly string[], run: () => Promise<unknown>) => {
        if (!supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1', ...capabilities], [command])) {
          return;
        }
        await run();
        if (controller !== scope.controller || sessionId !== scope.sessionId) return;
      };
      if (action === 'overview') {
        if (currentView !== 'map' || focusedPickerSection(latest) === undefined) return undefined;
        await execute('picker.overview', [], () => controller.overview());
      } else if (action === 'fit') {
        if (currentView !== 'map') return undefined;
        await execute('picker.zoomToFit', ['zoom'], () => controller.zoomToFit());
      } else if (action === 'zoomIn') {
        if (currentView !== 'map' || !latest.map.canZoomIn) return undefined;
        await execute('picker.zoomIn', ['zoom'], () => controller.zoomIn());
      } else if (action === 'zoomOut') {
        if (currentView !== 'map' || !latest.map.canZoomOut) return undefined;
        await execute('picker.zoomOut', ['zoom'], () => controller.zoomOut());
      } else {
        if (!latest.capabilities.includes('venue3d') || currentView === action) return undefined;
        await execute('picker.setBuyerView', ['venue-3d-v1'], () => controller.setBuyerView(action));
      }
      return undefined;
    },
  );
  const compact = props.compact ?? true;
  const edgeInset = inset(props.edgeInset, seatLayerPickerMapControlsEdgeInset);
  const bottomInset = inset(props.bottomInset, 0);
  const target = scope.resolvedTheme.layout.minimumHitTarget;
  const supports = (command: string, capabilities: readonly string[] = []) =>
    supportsSeatLayerPickerSurface(
      scope.controller,
      ['native-chrome-contract-v1', ...capabilities],
      [command],
    );
  const buyerView = snapshot?.map.buyerView === 'venue3d'
    ? 'venue3d'
    : snapshot?.map.buyerView === 'map' ? 'map' : undefined;
  const viewAvailable = snapshot !== undefined && props.enable3D !== false &&
    props.includeViewModeControl !== false && snapshot.capabilities.includes('venue3d') &&
    supports('picker.setBuyerView', ['venue-3d-v1']);
  const zoomInLabel = typeof props.zoomInLabel === 'string' && props.zoomInLabel.trim()
    ? props.zoomInLabel.trim() : scope.strings.translate('zoomIn');
  const zoomOutLabel = typeof props.zoomOutLabel === 'string' && props.zoomOutLabel.trim()
    ? props.zoomOutLabel.trim() : scope.strings.translate('zoomOut');
  const zoomPairAvailable = snapshot !== undefined && buyerView === 'map' && !compact &&
    props.showZoomControls === true &&
    supports('picker.zoomIn', ['zoom']) && supports('picker.zoomOut', ['zoom']);
  // §3.5, owner call 2026-09-05. Narrow carries ONE slot in the bottom-right
  // and it carries two directions: `+` at the whole venue, `-` the moment a
  // section is framed or seats are the visible layer. A dimmed `-` answered the
  // wrong question, and the corner must not grow and shrink under the thumb.
  const stepDirection: 'in' | 'out' = snapshot?.map.canZoomOut === true ? 'out' : 'in';
  const stepCommand = stepDirection === 'out' ? 'picker.zoomOut' : 'picker.zoomIn';
  const stepDiscAvailable = snapshot !== undefined && buyerView === 'map' && compact &&
    props.showStepOutControl !== false && supports(stepCommand, ['zoom']);
  const stepOutAvailable = stepDiscAvailable;
  // Fit-to-screen is not drawn on the phone: both back the camera out, one a
  // step at a time and one all at once, and nothing on either round button said
  // which was which. Wide keeps `+`, `-` and fit as they were.
  const fitAvailable = snapshot !== undefined && buyerView === 'map' && !compact &&
    props.showZoomToFitControl !== false && supports('picker.zoomToFit', ['zoom']);
  const showOverview = props.showOverviewControl ?? !compact;
  const overviewAvailable = snapshot !== undefined && buyerView === 'map' &&
    showOverview && focusedPickerSection(snapshot) !== undefined &&
    supports('picker.overview');
  const accessAvailable = buyerView === 'map' &&
    props.showAccessibilityControl !== false &&
    canRenderSeatLayerPickerAccessibilityFilters(scope.controller, snapshot);
  const ownsVisibleControl = viewAvailable || fitAvailable || stepOutAvailable || zoomPairAvailable ||
    overviewAvailable || accessAvailable;
  const bottomPlan = planSeatLayerMapBottomControls(fitAvailable || stepOutAvailable, zoomPairAvailable, accessAvailable, target);
  const insetLease = useMemo(
    () => props.reserveInset ? scope.claimViewportInsetBand('mapControls') : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(
    insetLease,
    compact && ownsVisibleControl && bottomPlan.height > 0
      ? { bottom: bottomInset + edgeInset + bottomPlan.height }
      : undefined,
  );
  if (snapshot === undefined || buyerView === undefined || !ownsVisibleControl) return null;
  const disabled = scope.isBusy || actionBusy;
  const accessibilityControl = accessAvailable
    ? <SeatLayerPickerAccessibilityFilters
        compact={compact}
        modalBottomInset={bottomInset + edgeInset}
        modalHorizontalInset={edgeInset}
        modalTopInset={edgeInset}
        slots={props.slots}
      />
    : null;
  return (
    <SeatLayerMapControlsView
      {...props}
      slots={styles}
      accessibilityControl={accessibilityControl}
      bottomInset={bottomInset}
      zoomBottomOffset={bottomPlan.zoomOffset}
      canFit={fitAvailable}
      canOverview={overviewAvailable}
      canZoomIn={zoomPairAvailable && snapshot.map.canZoomIn}
      canZoomOut={zoomPairAvailable && snapshot.map.canZoomOut}
      compact={compact}
      disabled={disabled}
      edgeInset={edgeInset}
      onFit={() => { requestedAction.current = Object.freeze({ kind: 'fit', sessionId: scope.sessionId }); runAction(); }}
      onOverview={() => { requestedAction.current = Object.freeze({ kind: 'overview', sessionId: scope.sessionId }); runAction(); }}
      onView={(view) => {
        requestedAction.current = Object.freeze({ kind: view, sessionId: scope.sessionId });
        runAction();
      }}
      onZoomIn={() => { requestedAction.current = Object.freeze({ kind: 'zoomIn', sessionId: scope.sessionId }); runAction(); }}
      onZoomOut={() => { requestedAction.current = Object.freeze({ kind: 'zoomOut', sessionId: scope.sessionId }); runAction(); }}
      onStep={() => {
        requestedAction.current = Object.freeze({
          kind: stepDirection === 'out' ? 'zoomOut' : 'zoomIn',
          sessionId: scope.sessionId,
        });
        runAction();
      }}
      stepDirection={stepDirection}
      zoomInLabel={zoomInLabel}
      zoomOutLabel={zoomOutLabel}
      buyerView={buyerView}
      strings={scope.strings}
      theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot)}
      target={target}
      viewBusy={actionBusy}
      venue3DAvailable={viewAvailable}
      onViewModeLayout={props.onViewModeLayout}
      zoomPairAvailable={zoomPairAvailable}
      stepOutAvailable={stepOutAvailable}
      zoomInBusy={actionBusy}
      zoomOutBusy={actionBusy}
      fitBusy={actionBusy}
      overviewBusy={actionBusy}
    />
  );
}

function SeatLayerMapControlsView({
  compact,
  style,
  slots,
  target,
  edgeInset,
  bottomInset = 0,
  zoomBottomOffset,
  zoomInLabel,
  zoomOutLabel,
  buyerView,
  disabled,
  canZoomIn,
  canZoomOut,
  canFit,
  canOverview,
  zoomPairAvailable,
  stepOutAvailable,
  venue3DAvailable,
  zoomInBusy,
  zoomOutBusy,
  fitBusy,
  overviewBusy,
  viewBusy,
  theme,
  strings,
  onOverview,
  onZoomIn,
  onZoomOut,
  onStep,
  stepDirection,
  onFit,
  onView,
  onViewModeLayout,
  accessibilityControl,
}: SeatLayerMapControlsProps & {
  readonly edgeInset: number;
  readonly zoomBottomOffset: number;
  readonly target: number;
  readonly buyerView: 'map' | 'venue3d' | undefined;
  readonly disabled: boolean;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly canFit: boolean;
  readonly canOverview: boolean;
  readonly zoomPairAvailable: boolean;
  readonly stepOutAvailable: boolean;
  readonly venue3DAvailable: boolean;
  readonly onViewModeLayout?: (width: number) => void;
  readonly zoomInBusy: boolean;
  readonly zoomOutBusy: boolean;
  readonly fitBusy: boolean;
  readonly overviewBusy: boolean;
  readonly viewBusy: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly onOverview: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onStep: () => void;
  readonly stepDirection: 'in' | 'out';
  readonly onFit: () => void;
  readonly onView: (view: 'map' | 'venue3d') => void;
  readonly accessibilityControl: ReactNode;
}): React.ReactElement {
  const bottom = edgeInset + bottomInset;
  const onMap = buyerView === 'map';
  const usableZoomInLabel = typeof zoomInLabel === 'string' ? zoomInLabel.trim() : '';
  const usableZoomOutLabel = typeof zoomOutLabel === 'string' ? zoomOutLabel.trim() : '';
  const control = (label: string, enabled: boolean, onPress: () => void, icon: ReactNode) => (
    <SeatLayerMapControlButtonView
      enabled={enabled && !disabled}
      label={label}
      slots={slots}
      theme={theme}
      target={target}
      onPress={onPress}
    >
      {icon}
    </SeatLayerMapControlButtonView>
  );
  const overview = control(
    strings.translate('backToVenue'),
    canOverview && !overviewBusy,
    onOverview,
    <SeatLayerPickerBackIcon color={theme.colors.text} />,
  );
  const zoomIn = !usableZoomInLabel ? null : control(
    usableZoomInLabel,
    canZoomIn && !zoomInBusy,
    onZoomIn,
    <SeatLayerPickerPlusIcon color={theme.colors.text} />,
  );
  const zoomOut = !usableZoomOutLabel ? null : control(
    usableZoomOutLabel,
    canZoomOut && !zoomOutBusy,
    onZoomOut,
    <SeatLayerPickerMinusIcon color={theme.colors.text} />,
  );
  // One slot, two directions. Never dimmed, never moved, never withdrawn.
  const stepDisc = control(
    stepDirection === 'out' ? usableZoomOutLabel : usableZoomInLabel,
    stepOutAvailable && !zoomOutBusy && !zoomInBusy,
    onStep,
    stepDirection === 'out'
      ? <SeatLayerPickerMinusIcon color={theme.colors.text} />
      : <SeatLayerPickerPlusIcon color={theme.colors.text} />,
  );
  const fit = control(
    strings.translate('fitVenue'),
    canFit && !fitBusy,
    onFit,
    <SeatLayerPickerFocusCornersIcon color={theme.colors.text} />,
  );
  const view = venue3DAvailable ? (
    <SeatLayerPickerViewModeControlView
      disabled={disabled || viewBusy}
      buyerView={buyerView}
      slots={slots}
      strings={strings}
      theme={theme}
      target={target}
      onPress={onView}
      onLayout={onViewModeLayout}
    />
  ) : null;
  if (!compact) {
    return (
      <SeatLayerPickerBlockedRegion
        style={[
          { alignSelf: 'flex-end', gap: controlGap },
          slots?.mapControlsContainer,
          sanitizeSeatLayerPickerStyle(style),
        ]}
      >
        {onMap && canOverview ? overview : null}
        {onMap && zoomPairAvailable ? (
          <View style={{ gap: zoomColumnGap }}>{zoomIn}{zoomOut}</View>
        ) : null}
        {onMap && canFit ? fit : null}
        {view}
        {accessibilityControl}
      </SeatLayerPickerBlockedRegion>
    );
  }
  return (
    <View
      pointerEvents="box-none"
      style={[
        { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
        slots?.mapControlsContainer,
        sanitizeSeatLayerPickerStyle(style),
        { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      ]}
    >
      {view ? (
        <SeatLayerPickerBlockedRegion style={{ end: edgeInset, position: 'absolute', top: seatLayerPickerMapControlsRailTop - seatLayerPickerViewModeTrackInset }}>
          {view}
        </SeatLayerPickerBlockedRegion>
      ) : null}
      {onMap && accessibilityControl ? (
        <SeatLayerPickerBlockedRegion style={{ bottom, position: 'absolute', start: edgeInset }}>
          {accessibilityControl}
        </SeatLayerPickerBlockedRegion>
      ) : null}
      {onMap && stepOutAvailable ? (
        <SeatLayerPickerBlockedRegion style={{ bottom, end: edgeInset, position: 'absolute' }}>
          {stepDisc}
        </SeatLayerPickerBlockedRegion>
      ) : null}
      {onMap && canOverview ? (
        <SeatLayerPickerBlockedRegion style={{ position: 'absolute', start: edgeInset, top: edgeInset }}>
          {overview}
        </SeatLayerPickerBlockedRegion>
      ) : null}
    </View>
  );
}

export function SeatLayerMapControlButtonView({
  label,
  enabled,
  active = false,
  selected,
  theme,
  target,
  slots,
  style,
  onPress,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly active?: boolean;
  /** Set only for true toggle controls; ordinary action buttons omit selection semantics. */
  readonly selected?: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly target: number;
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly style?: StyleProp<ViewStyle>;
  readonly onPress: () => void;
  readonly children: ReactNode;
}): React.ReactElement {
  const size = theme.layout.mapControlSize;
  const chrome = seatLayerPickerMapChromeGround(theme);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{
        disabled: !enabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        opacity: enabled ? (pressed ? 0.72 : 1) : 0.4,
        width: target,
      })}
    >
      <View
        style={[
          {
            alignItems: 'center',
            backgroundColor: active
              ? blendSeatLayerPickerColor(theme.colors.accent, chrome.ground, .13, chrome.ground)
              : chrome.ground,
            borderColor: chrome.line,
            borderRadius: theme.radii.button,
            borderWidth: 1,
            elevation: 3,
            height: size,
            justifyContent: 'center',
            shadowColor: theme.colors.text,
            shadowOffset: { height: 3, width: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            width: size,
          },
          slots?.mapControlButton,
          sanitizeSeatLayerPickerStyle(style),
          { height: size, width: size },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

export function SeatLayerPickerViewModeControlView({
  buyerView,
  disabled,
  style,
  theme,
  slots,
  strings,
  target,
  onPress,
  onLayout,
}: {
  readonly buyerView: 'map' | 'venue3d' | undefined;
  readonly disabled: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly target: number;
  readonly onPress: (view: 'map' | 'venue3d') => void;
  readonly onLayout?: (width: number) => void;
}): React.ReactElement {
  // A track with the two halves INSIDE it. The bed is what tells a buyer the
  // pair is one control: painted edge to edge, the lit half reads as a block
  // butted against a button rather than as the thumb of a switch.
  const trackInset = seatLayerPickerViewModeTrackInset;
  const paintInset = (target - segmentPaintHeight) / 2;
  const chrome = seatLayerPickerMapChromeGround(theme);
  const segment = (
    label: string,
    spoken: string,
    selected: boolean,
    view: 'map' | 'venue3d',
  ) => (
    <Pressable
      key={view}
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || selected, selected }}
      disabled={disabled || selected}
      onPress={() => onPress(view)}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        minWidth: theme.layout.viewModeButtonMinWidth,
        opacity: disabled ? 0.45 : pressed && !selected ? 0.72 : 1,
        paddingHorizontal: 8,
      })}
    >
      <View
        pointerEvents="none"
        style={[
          {
            backgroundColor: selected ? theme.colors.accent : 'transparent',
            borderRadius: seatLayerPickerTokens.radius.pill,
            bottom: paintInset,
            left: 0,
            position: 'absolute',
            right: 0,
            top: paintInset,
          },
          slots?.mapControlButton,
        ]}
      />
      <Text
        style={[
          {
            color: selected ? theme.colors.onAccent : theme.colors.mutedText,
            fontFamily: theme.fontFamily,
            fontSize: theme.layout.viewModeLabelFontSize,
            fontWeight: '800',
            letterSpacing: 0.4,
          },
          slots?.mapControlLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const mapSelected = buyerView === 'map';
  const venueSelected = buyerView === 'venue3d';
  return (
    <View onLayout={(event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      if (!Number.isFinite(width) || width < 0) return;
      try { onLayout?.(width); } catch { /* Host observation remains isolated. */ }
    }} style={[{ height: target, position: 'relative' }, sanitizeSeatLayerPickerStyle(style), { height: target, position: 'relative' }]}>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: chrome.ground,
          borderRadius: seatLayerPickerTokens.radius.pill,
          bottom: trackInset,
          elevation: 3,
          left: 0,
          position: 'absolute',
          right: 0,
          shadowColor: theme.colors.text,
          shadowOffset: { height: 3, width: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          top: trackInset,
        }}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel={strings.translate('venueView')}
        style={{ columnGap: segmentGap, flexDirection: 'row', height: target }}
      >
        {segment(
          strings.translate('mapView'), strings.translate('flat2dMap'), mapSelected, 'map',
        )}
        {segment(
          strings.translate('venue3D'),
          strings.translate('interactive3dVenueView'),
          venueSelected,
          'venue3d',
        )}
      </View>
      <View
        pointerEvents="none"
        style={{
          borderColor: chrome.line,
          borderRadius: seatLayerPickerTokens.radius.pill,
          borderWidth: 1,
          bottom: trackInset,
          left: 0,
          position: 'absolute',
          right: 0,
          top: trackInset,
        }}
      />
    </View>
  );
}

export function SeatLayerPickerPlusIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View style={{ backgroundColor: color, height: 2, width: 14 }}>
      <View
        style={{
          backgroundColor: color,
          height: 14,
          left: 6,
          position: 'absolute',
          top: -6,
          width: 2,
        }}
      />
    </View>
  );
}

export function SeatLayerPickerMinusIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={{ backgroundColor: color, height: 2, width: 14 }} />;
}

export function SeatLayerPickerBackIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View style={{ height: 16, width: 18 }}>
      <View
        style={{
          backgroundColor: color,
          height: 2,
          left: 2,
          position: 'absolute',
          top: 7,
          width: 15,
        }}
      />
      <View
        style={{
          borderColor: color,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          height: 8,
          left: 1,
          position: 'absolute',
          top: 4,
          transform: [{ rotate: '-45deg' }],
          width: 8,
        }}
      />
    </View>
  );
}

export function SeatLayerPickerFocusCornersIcon({ color }: { readonly color: string }): React.ReactElement {
  const corner = (position: ViewStyle, rotate: string) => (
    <View
      key={rotate}
      style={[
        {
          borderColor: color,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          height: 7,
          position: 'absolute',
          transform: [{ rotate }],
          width: 7,
        },
        position,
      ]}
    />
  );
  return (
    <View style={{ height: 16, width: 16 }}>
      {corner({ left: 0, top: 0 }, '0deg')}
      {corner({ right: 0, top: 0 }, '90deg')}
      {corner({ bottom: 0, right: 0 }, '180deg')}
      {corner({ bottom: 0, left: 0 }, '270deg')}
      <View style={{
        backgroundColor: color,
        borderRadius: 2,
        height: 4,
        left: 6,
        position: 'absolute',
        top: 6,
        width: 4,
      }} />
    </View>
  );
}
