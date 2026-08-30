import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { formatSeatLayerPickerMoney, type SeatLayerPickerMoneyFormatter } from './format';
import { chartSeatLayerPickerColor } from './chartColor';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { blendSeatLayerPickerColor, usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  seatLayerPickerMinimumTargetStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';

export interface SeatLayerPriceLegendProps {
  readonly compact?: boolean;
  /** Backdrop sampled by the overflow fade when the rail sits over custom media. */
  readonly edgeFadeColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<
    SeatLayerPickerStyles,
    'legendContainer' | 'legendChipContainer' | 'legendChipText'
  >;
  readonly moneyFormatter?: SeatLayerPickerMoneyFormatter;
  readonly reserveInset?: boolean;
  /** Uses React Native's current layout direction unless a host supplies one. */
  readonly rtl?: boolean;
  /** Resolves a documented platform RTL offset convention when it is known. */
  readonly rtlOffsetMode?: 'auto' | 'logical' | 'reversed';
}

type LegendEdges = Readonly<{ leading: boolean; trailing: boolean }>;
type LegendMetrics = Readonly<{
  contentWidth: number;
  layoutWidth: number;
  offsetX: number;
  logicalOffsetX?: number;
}>;

const edgeWidth = 22;
function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

/** End breathing room helps the final chip clear the fade but is not hidden content itself. */
export function priceLegendVisualContentWidth(contentWidth: number, trailingPadding = edgeWidth): number {
  if (!Number.isFinite(contentWidth)) return 0;
  const padding = Number.isFinite(trailingPadding) ? Math.max(0, trailingPadding) : 0;
  return Math.max(0, contentWidth - padding);
}

function metricFromScroll(event: NativeScrollEvent): LegendMetrics {
  const additive = event as NativeScrollEvent & {
    contentOffsetFromStart?: number;
    logicalContentOffsetX?: number;
  };
  return {
    contentWidth: event.contentSize.width,
    layoutWidth: event.layoutMeasurement.width,
    logicalOffsetX: additive.logicalContentOffsetX ?? additive.contentOffsetFromStart,
    offsetX: event.contentOffset.x,
  };
}

/** Handles deterministic native RTL conventions, with an explicit host override. */
export function priceLegendEdges(
  metrics: LegendMetrics | NativeScrollEvent,
  rtl: boolean,
  mode: SeatLayerPriceLegendProps['rtlOffsetMode'] = 'auto',
): LegendEdges {
  const value = 'contentSize' in metrics ? metricFromScroll(metrics) : metrics;
  const maximum = Math.max(0, value.contentWidth - value.layoutWidth);
  const explicit = value.logicalOffsetX;
  const offset = typeof explicit === 'number' && Number.isFinite(explicit)
    ? clamp(explicit, maximum)
    : rtl && mode !== 'logical'
      ? value.offsetX < 0
        ? clamp(-value.offsetX, maximum)
        : clamp(maximum - value.offsetX, maximum)
      : clamp(value.offsetX, maximum);
  return Object.freeze({ leading: offset > 0.5, trailing: maximum - offset > 0.5 });
}

function sameEdges(left: LegendEdges, right: LegendEdges): boolean {
  return left.leading === right.leading && left.trailing === right.trailing;
}

/** Opaque at the physical viewport edge and transparent towards its content. */
export function priceLegendFadeSteps(leading: boolean, rtl: boolean): readonly number[] {
  const physicalEdge = leading === rtl ? 'right' : 'left';
  return Object.freeze(physicalEdge === 'left' ? [1, 0.5, 0.12] : [0.12, 0.5, 1]);
}

/** Stable data-only key for every snapshot field that changes legend width. */
export function priceLegendMeasurementSignature(
  categories: ReadonlyArray<Readonly<{ key: string; label: string; priceMin: number }>>,
  currency: string,
  compact: boolean,
  rtl: boolean,
  rtlOffsetMode: NonNullable<SeatLayerPriceLegendProps['rtlOffsetMode']>,
  minimumHitTarget: number,
  legendChipFontSize: number,
): string {
  return JSON.stringify({
    categories: categories.map(({ key, label, priceMin }) => [key, label, priceMin]),
    compact,
    currency,
    legendChipFontSize,
    minimumHitTarget,
    rtl,
    rtlOffsetMode,
  });
}

/** Scope adapter for a sellable snapshot-driven price rail. */
export function SeatLayerPriceLegend(props: SeatLayerPriceLegendProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const categories = snapshot?.categories.filter((category) => !category.notForSale) ?? [];
  const canFilter = supportsSeatLayerPickerSurface(
    scope.controller,
    ['native-chrome-contract-v1'],
    ['picker.setCategoryFilter'],
  );
  const selectedKeyRef = useRef<Readonly<{ key: string; sessionId: number }> | undefined>(undefined);
  const [localBusy, toggle] = usePickerSingleFlight(
    scope.sessionId,
    scope.reportError,
    async () => {
      const request = selectedKeyRef.current;
      const key = request?.key;
      const controller = scope.controller;
      const sessionId = scope.sessionId;
      const latest = controller.getSnapshot();
      if (key === undefined || request?.sessionId !== sessionId || controller !== scope.controller || latest === undefined ||
        !supportsSeatLayerPickerSurface(
          controller, ['native-chrome-contract-v1'], ['picker.setCategoryFilter'],
        )) return undefined;
      const selected = latest.map.categoryFilter.includes(key);
      await controller.setCategoryFilter(selected ? [] : [key], !selected);
      if (controller !== scope.controller || sessionId !== scope.sessionId) return undefined;
      return undefined;
    },
  );
  const [bandHeight, setBandHeight] = useState(scope.resolvedTheme.layout.minimumHitTarget);
  // The rail explains the map even where this runtime does not permit filtering.
  const nativeOwned = supportsSeatLayerPickerSurface(
    scope.controller, ['native-chrome-contract-v1'], [],
  );
  const visible = categories.length > 0 && nativeOwned;
  const compact = props.compact ?? false;
  const moneyFormatter = props.moneyFormatter ?? scope.pricing?.formatter;
  const rtl = props.rtl ?? I18nManager.isRTL;
  const rtlOffsetMode = props.rtlOffsetMode ?? 'auto';
  const measurementSignature = priceLegendMeasurementSignature(
    categories,
    snapshot?.currency ?? '',
    compact,
    rtl,
    rtlOffsetMode,
    scope.resolvedTheme.layout.minimumHitTarget,
    scope.resolvedTheme.layout.legendChipFontSize,
  );
  const measurementToken = useMemo(() => Object.freeze({
    session: scope.sessionId,
    signature: measurementSignature,
    moneyFormatter,
    fontFamily: scope.resolvedTheme.fontFamily,
    slots: props.slots,
    style: props.style,
    styles: scope.styles,
  }), [measurementSignature, moneyFormatter, props.slots, props.style, scope.resolvedTheme.fontFamily, scope.sessionId, scope.styles]);
  const bandTokenRef = useRef(measurementToken);
  useLayoutEffect(() => {
    bandTokenRef.current = measurementToken;
    setBandHeight(scope.resolvedTheme.layout.minimumHitTarget);
  }, [measurementToken, scope.resolvedTheme.layout.minimumHitTarget]);
  const insetLease = useMemo(
    () => props.reserveInset ? scope.claimViewportInsetBand('legend') : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(
    insetLease,
    visible && bandHeight !== undefined ? { top: bandHeight } : undefined,
  );
  if (!visible || snapshot === undefined) return null;

  return (
    <SeatLayerPriceLegendView
      key={scope.sessionId}
      {...props}
      categories={categories}
      currency={snapshot.currency}
      disabled={scope.isBusy || localBusy || !canFilter}
      selectedKeys={snapshot.map.categoryFilter}
      measurementToken={measurementToken}
      moneyFormatter={moneyFormatter}
      onFormatterError={scope.reportError}
      slots={styles}
      theme={resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot)}
      onHeight={(event, token) => {
        if (bandTokenRef.current !== token) return;
        const height = event.nativeEvent.layout.height;
        setBandHeight((current) => current !== undefined && Math.abs(current - height) < 0.5
          ? current
          : height);
      }}
      onToggle={(key) => {
        if (!canFilter) return;
        selectedKeyRef.current = Object.freeze({ key, sessionId: scope.sessionId });
        toggle();
      }}
    />
  );
}

function SeatLayerPriceLegendView({
  compact = false,
  edgeFadeColor,
  style,
  slots,
  moneyFormatter,
  rtl = I18nManager.isRTL,
  rtlOffsetMode = 'auto',
  categories,
  currency,
  selectedKeys,
  disabled,
  theme,
  onToggle,
  onHeight,
  measurementToken,
  onFormatterError,
}: SeatLayerPriceLegendProps & {
  readonly categories: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly color: string;
    readonly priceMin: number;
  }>;
  readonly currency: string;
  readonly selectedKeys: readonly string[];
  readonly disabled: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly onToggle: (key: string) => void;
  readonly measurementToken: object;
  readonly onFormatterError: (error: unknown) => void;
  readonly onHeight: (event: LayoutChangeEvent, token: object) => void;
}): React.ReactElement {
  const [edges, setEdges] = useState<LegendEdges>({ leading: false, trailing: false });
  const metricsRef = useRef<LegendMetrics>({ contentWidth: 0, layoutWidth: 0, offsetX: 0 });
  const activeMeasurementRef = useRef(measurementToken);
  useLayoutEffect(() => {
    activeMeasurementRef.current = measurementToken;
    metricsRef.current = { contentWidth: 0, layoutWidth: 0, offsetX: 0 };
    setEdges({ leading: false, trailing: false });
  }, [measurementToken]);
  const updateEdges = useCallback(() => {
    const next = priceLegendEdges(metricsRef.current, rtl, rtlOffsetMode);
    setEdges((current) => sameEdges(current, next) ? current : next);
  }, [rtl, rtlOffsetMode]);
  const onLayout = (event: LayoutChangeEvent) => {
    if (activeMeasurementRef.current !== measurementToken) return;
    const layoutWidth = event.nativeEvent.layout.width;
    metricsRef.current = { ...metricsRef.current, layoutWidth };
    updateEdges();
    onHeight(event, measurementToken);
  };
  const onContentSizeChange = (contentWidth: number) => {
    if (activeMeasurementRef.current !== measurementToken) return;
    metricsRef.current = {
      ...metricsRef.current,
      contentWidth: priceLegendVisualContentWidth(contentWidth),
    };
    updateEdges();
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (activeMeasurementRef.current !== measurementToken) return;
    const metrics = metricFromScroll(event.nativeEvent);
    metricsRef.current = {
      ...metrics,
      contentWidth: priceLegendVisualContentWidth(metrics.contentWidth),
    };
    updateEdges();
  };
  const target = theme.layout.minimumHitTarget;
  const paintHeight = compact ? 30 : 40;
  // Compact legends sit over the renderer. Fade into that canvas rather than
  // painting an opaque sheet-coloured block across the final price chip.
  const fadeColor = edgeFadeColor ?? (compact ? theme.colors.mapBackground : theme.colors.surface);
  return (
    <View
      onLayout={onLayout}
      style={[
        { height: target, justifyContent: 'center', overflow: 'hidden' },
        slots?.legendContainer,
        sanitizeSeatLayerPickerStyle(style),
        { height: target, minHeight: target, overflow: 'hidden' },
      ]}
    >
      <View pointerEvents="box-none" style={{ flex: 1 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: 'center',
            flexDirection: rtl ? 'row-reverse' : 'row',
            gap: compact ? 5 : 6,
            paddingEnd: edgeWidth,
            paddingStart: compact ? 8 : 12,
          }}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {categories.map((category) => {
            const selected = selectedKeys.includes(category.key);
            const fullMoney = formatSeatLayerPickerMoney(
              category.priceMin,
              currency,
              moneyFormatter,
              onFormatterError,
            );
            return (
              <LegendChip
                key={category.key}
                color={chartSeatLayerPickerColor(category.color, theme.colors.accent)}
                compact={compact}
                disabled={disabled}
                label={category.label}
                money={fullMoney}
                paintHeight={paintHeight}
                selected={selected}
                semanticMoney={fullMoney}
                slots={slots}
                target={target}
                theme={theme}
                onPress={() => onToggle(category.key)}
              />
            );
          })}
        </ScrollView>
        {(edges.leading || edges.trailing) ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              bottom: 0,
              flexDirection: rtl ? 'row-reverse' : 'row',
              justifyContent: 'space-between',
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          >
            {edges.leading ? <LegendEdgeFade color={fadeColor} leading rtl={rtl} /> : <View />}
            {edges.trailing ? <LegendEdgeFade color={fadeColor} leading={false} rtl={rtl} /> : <View />}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Core-RN stepped fade: no masked-view dependency and no touch interception. */
function LegendEdgeFade({ color, leading, rtl }: {
  readonly color: string;
  readonly leading: boolean;
  readonly rtl: boolean;
}): React.ReactElement {
  const steps = priceLegendFadeSteps(leading, rtl);
  return (
    <View style={{ flexDirection: 'row', width: edgeWidth }}>
      {steps.map((opacity, index) => (
        <View key={index} style={{ backgroundColor: color, flex: 1, opacity }} />
      ))}
    </View>
  );
}


function LegendChip({
  compact,
  paintHeight,
  target,
  selected,
  disabled,
  label,
  money,
  semanticMoney,
  color,
  theme,
  slots,
  onPress,
}: {
  readonly compact: boolean;
  readonly paintHeight: number;
  readonly target: number;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly money: string;
  readonly semanticMoney: string;
  readonly color: string;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly slots: SeatLayerPriceLegendProps['slots'];
  readonly onPress: () => void;
}): React.ReactElement {
  const textStyle = {
    color: selected ? theme.colors.onAccent : theme.colors.text,
    fontFamily: theme.fontFamily,
    fontSize: compact ? theme.layout.legendChipFontSize : 12,
    fontWeight: '800' as const,
  };
  return (
    <Pressable
      accessibilityLabel={`${label}, ${semanticMoney}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        ...seatLayerPickerMinimumTargetStyle(target),
        height: target,
        opacity: !disabled && pressed ? 0.72 : 1,
      })}
    >
      <View
        style={[
          {
            alignItems: 'center',
            backgroundColor: selected
              ? theme.colors.accent
              : blendSeatLayerPickerColor(
                theme.colors.text,
                theme.colors.surface,
                0.04,
                theme.colors.surface,
              ),
            borderColor: selected ? theme.colors.accent : theme.colors.divider,
            borderRadius: theme.radii.chip,
            borderWidth: 1,
            flexDirection: 'row',
            height: paintHeight,
            paddingHorizontal: compact ? 6 : 10,
          },
          slots?.legendChipContainer,
          { height: paintHeight },
        ]}
      >
        <View
          style={{
            backgroundColor: color,
            borderRadius: 10,
            height: compact ? 8 : 10,
            width: compact ? 8 : 10,
          }}
        />
        {compact ? null : (
          <Text numberOfLines={1} style={[{ ...textStyle, marginStart: 7 }, slots?.legendChipText]}>
            {label}
          </Text>
        )}
        {compact ? null : (
          <View
            style={{
              backgroundColor: theme.colors.mutedText,
              borderRadius: 2,
              height: 3,
              marginHorizontal: 6,
              width: 3,
            }}
          />
        )}
        <Text
          numberOfLines={1}
          style={[{ ...textStyle, marginStart: compact ? 5 : 0 }, slots?.legendChipText]}
        >
          {money}
        </Text>
      </View>
    </Pressable>
  );
}
