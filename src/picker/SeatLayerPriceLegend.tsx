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
  type TextStyle,
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
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerBold } from './boldText';

export interface SeatLayerPriceLegendProps {
  /**
   * Retained for host compositions. 3.2 gives the rail ONE recipe — a band of
   * its own between the header and the map — so this no longer changes the
   * paint; it only stays part of the measurement signature.
   */
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

const edgeWidth = seatLayerPickerTokens.size.legendRailEdgeFade;
const chipGap = 6;
/**
 * The band's own margin. The rail is a band, not a bleed: the pinned chip's
 * rounded end has to sit inside the surface it is drawn on, the way the header
 * mark beneath it does, or the first price reads as clipped by the screen.
 */
const railInset = 10;

/**
 * §3.2 amount rule. A single price prints as itself; equal minimum and maximum
 * print once; otherwise `{min}+`. A category with no configured price shows its
 * NAME instead of an amount — a chip with no answer is worse than a chip that
 * names its band.
 */
export function seatLayerPickerLegendChipText(
  category: Readonly<{ label: string; priceMin: number; priceMax?: number }>,
  format: (amount: number) => string,
): string {
  const min = category.priceMin;
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return category.label;
  const max = typeof category.priceMax === 'number' && Number.isFinite(category.priceMax)
    ? category.priceMax
    : min;
  return max <= min ? format(min) : `${format(min)}+`;
}

/**
 * §3.2 / §4.9. Only `category-availability-v1`'s `free` is trustworthy: an
 * ABSENT figure means unknown, never zero, and is never struck. `available`
 * reports 0 for a count that has not landed yet, so it can never say sold out.
 */
export function seatLayerPickerLegendSoldOut(
  category: Readonly<{ free?: number }>,
): boolean {
  return typeof category.free === 'number' && Number.isFinite(category.free) &&
    category.free <= 0;
}
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
      // Both exits carry the framing. Turning a band ON frames that band's
      // seats; turning it OFF — by `All prices` or by re-pressing the lit chip —
      // frames the WHOLE venue. The unframed path strands the buyer inside
      // their drill-in while the block melt runs underneath.
      const selected = key !== '' && latest.map.categoryFilter.includes(key);
      await controller.setCategoryFilter(selected || key === '' ? [] : [key], true);
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
      strings={scope.strings}
      onToggle={(key) => {
        if (!canFilter) return;
        selectedKeyRef.current = Object.freeze({ key, sessionId: scope.sessionId });
        toggle();
      }}
    />
  );
}

function SeatLayerPriceLegendView({
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
  strings,
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
    readonly priceMax?: number;
    readonly free?: number;
  }>;
  readonly currency: string;
  readonly selectedKeys: readonly string[];
  readonly disabled: boolean;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly onToggle: (key: string) => void;
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly measurementToken: object;
  readonly onFormatterError: (error: unknown) => void;
  readonly onHeight: (event: LayoutChangeEvent, token: object) => void;
}): React.ReactElement {
  const [edges, setEdges] = useState<LegendEdges>({ leading: false, trailing: false });
  const [pinnedWidth, setPinnedWidth] = useState(0);
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
  // 3.2: a band of its own, height `size.topRailHeight`, on the surface with a
  // divider hairline beneath. Not floated over the map: on a busy chart the seat
  // numbers read through the gaps, and the last chip clipped under Map/3D.
  // §4.10 — the band is `base × the surface's clamped scale`, so it grows
  // with what is in it and is unchanged at the platform default of 1.0.
  const bandHeight = Math.max(
    seatLayerPickerScaledExtent(theme.layout.topRailHeight, seatLayerPickerTypeScaleClamp('rail')),
    target,
  );
  const paintHeight = theme.layout.legendChipHeight;
  const fadeColor = edgeFadeColor ?? theme.colors.surface;
  const allSelected = selectedKeys.length === 0;
  return (
    <View
      onLayout={onLayout}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.divider,
          borderBottomWidth: 1,
          height: bandHeight,
          justifyContent: 'center',
          overflow: 'hidden',
        },
        slots?.legendContainer,
        sanitizeSeatLayerPickerStyle(style),
        { height: bandHeight, minHeight: bandHeight, overflow: 'hidden' },
      ]}
    >
      <View pointerEvents="box-none" style={{ flex: 1, paddingHorizontal: railInset }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: 'center',
            flexDirection: rtl ? 'row-reverse' : 'row',
            gap: chipGap,
            paddingEnd: edgeWidth,
            paddingStart: pinnedWidth + chipGap,
          }}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {categories.map((category) => {
            const selected = selectedKeys.includes(category.key);
            const money = seatLayerPickerLegendChipText(
              category,
              (amount) => formatSeatLayerPickerMoney(
                amount, currency, moneyFormatter, onFormatterError,
              ),
            );
            const soldOut = seatLayerPickerLegendSoldOut(category);
            return (
              <LegendChip
                key={category.key}
                color={chartSeatLayerPickerColor(category.color, theme.colors.accent)}
                disabled={disabled || soldOut}
                label={category.label}
                money={money}
                paintHeight={paintHeight}
                selected={selected}
                soldOut={soldOut}
                slots={slots}
                target={target}
                theme={theme}
                onPress={() => onToggle(category.key)}
              />
            );
          })}
        </ScrollView>
        <View
          onLayout={(event: LayoutChangeEvent) => {
            const width = event.nativeEvent.layout.width;
            if (!Number.isFinite(width) || width <= 0) return;
            setPinnedWidth((current) => Math.abs(current - width) < 0.5 ? current : width);
          }}
          pointerEvents="box-none"
          style={{
            bottom: 0,
            justifyContent: 'center',
            position: 'absolute',
            start: 1,
            top: 0,
            // While the scroller has scrolled the pinned chip carries a halo of
            // the band ground, so chips slide UNDER it rather than through it;
            // at rest the halo is off so the first price keeps its rounded end.
            ...(edges.leading ? { backgroundColor: theme.colors.surface } : {}),
          }}
        >
          <LegendChip
            allPrices
            color={theme.colors.accent}
            disabled={disabled}
            label={strings.translate('allPrices')}
            money={strings.translate('allPrices')}
            paintHeight={paintHeight}
            selected={allSelected}
            soldOut={false}
            slots={slots}
            target={target}
            theme={theme}
            onPress={() => onToggle('')}
          />
        </View>
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
  paintHeight,
  target,
  selected,
  disabled,
  soldOut,
  allPrices = false,
  label,
  money,
  color,
  theme,
  slots,
  onPress,
}: {
  readonly paintHeight: number;
  readonly target: number;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly soldOut: boolean;
  /** The pinned first chip: the band's own ground, no colour key, never struck. */
  readonly allPrices?: boolean;
  readonly label: string;
  readonly money: string;
  readonly color: string;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly slots: SeatLayerPriceLegendProps['slots'];
  readonly onPress: () => void;
}): React.ReactElement {
  const dark = theme.themeMode === 'dark';
  const dotSize = theme.layout.legendChipDotSize;
  const ink = selected ? theme.colors.onAccent : theme.colors.text;
  const textStyle: TextStyle = {
    color: ink,
    fontFamily: theme.fontFamily,
    fontSize: theme.layout.legendChipFontSize,
    fontVariant: ['tabular-nums'],
    fontWeight: seatLayerPickerBold(800),
  };
  // 3.2: on LIGHT the dot is the category colour mixed into the surface with a
  // full-strength ring of the category colour — matching how the map tints
  // sections on light. Dark keeps the flat dot. A fixed recipe, not a token.
  // A selected chip inverts, so the dot gains a ring in the ink colour and the
  // colour key survives the inversion.
  const ringColor = selected ? ink : color;
  const dotFill = selected
    ? color
    : dark
      ? color
      : blendSeatLayerPickerColor(color, theme.colors.surface, 0.45, color);
  return (
    <Pressable
      accessibilityLabel={allPrices ? label : `${label}, ${money}`}
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
              : theme.colors.background,
            borderColor: selected ? theme.colors.accent : theme.colors.divider,
            borderRadius: theme.radii.chip,
            borderWidth: 1,
            flexDirection: 'row',
            height: paintHeight,
            opacity: soldOut ? 0.55 : 1,
            paddingHorizontal: 9,
          },
          slots?.legendChipContainer,
          { height: paintHeight },
        ]}
      >
        {allPrices ? null : (
          <View
            style={{
              backgroundColor: dotFill,
              borderColor: ringColor,
              borderRadius: dotSize,
              borderWidth: selected || !dark ? 1.5 : 0,
              height: dotSize,
              marginEnd: 6,
              width: dotSize,
            }}
          />
        )}
        <Text
          maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('rail')}
          numberOfLines={1}
          style={[
            textStyle,
            soldOut ? { textDecorationLine: 'line-through' } : undefined,
            slots?.legendChipText,
          ]}
        >
          {money}
        </Text>
      </View>
    </Pressable>
  );
}
