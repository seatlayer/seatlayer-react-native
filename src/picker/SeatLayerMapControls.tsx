import React, { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import {
  canRenderSeatLayerPickerAccessibilityFilters,
  SeatLayerPickerAccessibilityFilters,
} from './accessibility';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { focusedPickerSection, pickerColor, usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';

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

const segmentPaintHeight = 32;
const controlGap = 6;
/** Default spacing between a map control and its physical edge. */
export const seatLayerPickerMapControlsEdgeInset = 10;

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
  const zoomInLabel = typeof props.zoomInLabel === 'string' ? props.zoomInLabel.trim() : '';
  const zoomOutLabel = typeof props.zoomOutLabel === 'string' ? props.zoomOutLabel.trim() : '';
  const zoomLabelsAvailable = Boolean(zoomInLabel && zoomOutLabel);
  const zoomPairAvailable = snapshot !== undefined && buyerView === 'map' &&
    props.showZoomControls === true && zoomLabelsAvailable &&
    supports('picker.zoomIn', ['zoom']) && supports('picker.zoomOut', ['zoom']);
  const fitAvailable = snapshot !== undefined && buyerView === 'map' &&
    props.showZoomToFitControl !== false && supports('picker.zoomToFit', ['zoom']);
  const showOverview = props.showOverviewControl ?? !compact;
  const overviewAvailable = snapshot !== undefined && buyerView === 'map' &&
    showOverview && focusedPickerSection(snapshot) !== undefined &&
    supports('picker.overview');
  const accessAvailable = buyerView === 'map' &&
    props.showAccessibilityControl !== false &&
    canRenderSeatLayerPickerAccessibilityFilters(scope.controller, snapshot);
  const ownsVisibleControl = viewAvailable || fitAvailable || zoomPairAvailable ||
    overviewAvailable || accessAvailable;
  const bottomPlan = planSeatLayerMapBottomControls(fitAvailable, zoomPairAvailable, accessAvailable, target);
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
      buyerView={buyerView}
      strings={scope.strings}
      theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot)}
      target={target}
      viewBusy={actionBusy}
      venue3DAvailable={viewAvailable}
      onViewModeLayout={props.onViewModeLayout}
      zoomPairAvailable={zoomPairAvailable}
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
  readonly onFit: () => void;
  readonly onView: (view: 'map' | 'venue3d') => void;
  readonly accessibilityControl: ReactNode;
}): React.ReactElement {
  const bottom = edgeInset + bottomInset;
  const onMap = buyerView === 'map';
  const usableZoomInLabel = typeof zoomInLabel === 'string' ? zoomInLabel.trim() : '';
  const usableZoomOutLabel = typeof zoomOutLabel === 'string' ? zoomOutLabel.trim() : '';
  const control = (label: string, enabled: boolean, onPress: () => void, icon: ReactNode) => (
    <MapButton
      enabled={enabled && !disabled}
      label={label}
      slots={slots}
      theme={theme}
      target={target}
      onPress={onPress}
    >
      {icon}
    </MapButton>
  );
  const overview = control(
    strings.translate('backToVenue'),
    canOverview && !overviewBusy,
    onOverview,
    <BackIcon color={theme.colors.text} />,
  );
  const zoomIn = !usableZoomInLabel ? null : control(
    usableZoomInLabel,
    canZoomIn && !zoomInBusy,
    onZoomIn,
    <PlusIcon color={theme.colors.text} />,
  );
  const zoomOut = !usableZoomOutLabel ? null : control(
    usableZoomOutLabel,
    canZoomOut && !zoomOutBusy,
    onZoomOut,
    <MinusIcon color={theme.colors.text} />,
  );
  const fit = control(
    strings.translate('fitVenue'),
    canFit && !fitBusy,
    onFit,
    <FocusCornersIcon color={theme.colors.text} />,
  );
  const view = venue3DAvailable ? (
    <ViewModeControl
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
      <View
        style={[
          { alignSelf: 'flex-end', gap: 7 },
          slots?.mapControlsContainer,
          sanitizeSeatLayerPickerStyle(style),
        ]}
      >
        {onMap && canOverview ? overview : null}
        {onMap && zoomPairAvailable ? zoomIn : null}
        {onMap && zoomPairAvailable ? zoomOut : null}
        {onMap && canFit ? fit : null}
        {view}
        {accessibilityControl}
      </View>
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
      {view ? <View style={{ end: edgeInset, position: 'absolute', top: edgeInset }}>{view}</View> : null}
      {onMap && accessibilityControl ? (
        <View style={{ bottom, position: 'absolute', start: edgeInset }}>{accessibilityControl}</View>
      ) : null}
      {onMap && canFit ? (
        <View style={{ bottom, end: edgeInset, position: 'absolute' }}>{fit}</View>
      ) : null}
      {onMap && zoomPairAvailable && zoomIn !== null && zoomOut !== null ? (
        <View
          style={{
            bottom: bottom + zoomBottomOffset,
            end: edgeInset,
            gap: controlGap,
            position: 'absolute',
          }}
        >
          {zoomIn}
          {zoomOut}
        </View>
      ) : null}
      {onMap && canOverview ? (
        <View style={{ position: 'absolute', start: edgeInset, top: edgeInset }}>{overview}</View>
      ) : null}
    </View>
  );
}

function MapButton({
  label,
  enabled,
  theme,
  target,
  slots,
  onPress,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly target: number;
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly onPress: () => void;
  readonly children: ReactNode;
}): React.ReactElement {
  const size = theme.layout.mapControlSize;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
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
            backgroundColor: pickerColor(theme.colors.surface, theme.colors.surface, 0.94),
            borderColor: theme.colors.divider,
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
          { borderRadius: theme.radii.button, height: size, width: size },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

function ViewModeControl({
  buyerView,
  disabled,
  theme,
  slots,
  strings,
  target,
  onPress,
  onLayout,
}: {
  readonly buyerView: 'map' | 'venue3d' | undefined;
  readonly disabled: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly target: number;
  readonly onPress: (view: 'map' | 'venue3d') => void;
  readonly onLayout?: (width: number) => void;
}): React.ReactElement {
  const paintInset = (target - segmentPaintHeight) / 2;
  const segment = (label: string, selected: boolean, view: 'map' | 'venue3d') => (
    <Pressable
      key={view}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || selected, selected }}
      disabled={disabled || selected}
      onPress={() => onPress(view)}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        minWidth: 46,
        opacity: disabled ? 0.45 : pressed && !selected ? 0.72 : 1,
        paddingHorizontal: 10,
      })}
    >
      <View
        pointerEvents="none"
        style={[
          {
            backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
            bottom: paintInset,
            left: 0,
            position: 'absolute',
            right: 0,
            top: paintInset,
            ...(view === 'map'
              ? { borderBottomStartRadius: segmentPaintHeight / 2, borderTopStartRadius: segmentPaintHeight / 2 }
              : { borderBottomEndRadius: segmentPaintHeight / 2, borderTopEndRadius: segmentPaintHeight / 2 }),
          },
          slots?.mapControlButton,
        ]}
      />
      <Text
        style={[
          {
            color: selected ? theme.colors.onAccent : theme.colors.text,
            fontFamily: theme.fontFamily,
            fontSize: 12,
            fontWeight: '800',
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
    }} style={{ height: target, position: 'relative' }}>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: segmentPaintHeight / 2,
          bottom: paintInset,
          elevation: 3,
          left: 0,
          position: 'absolute',
          right: 0,
          shadowColor: theme.colors.text,
          shadowOffset: { height: 3, width: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          top: paintInset,
        }}
      />
      <View style={{ flexDirection: 'row', height: target }}>
        {segment(strings.translate('mapView'), mapSelected, 'map')}
        {segment(strings.translate('venue3D'), venueSelected, 'venue3d')}
      </View>
      <View
        pointerEvents="none"
        style={{
          borderColor: theme.colors.divider,
          borderRadius: segmentPaintHeight / 2,
          borderWidth: 1,
          bottom: paintInset,
          left: 0,
          position: 'absolute',
          right: 0,
          top: paintInset,
        }}
      />
    </View>
  );
}

function PlusIcon({ color }: { readonly color: string }): React.ReactElement {
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

function MinusIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={{ backgroundColor: color, height: 2, width: 14 }} />;
}

function BackIcon({ color }: { readonly color: string }): React.ReactElement {
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

function FocusCornersIcon({ color }: { readonly color: string }): React.ReactElement {
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
    </View>
  );
}
