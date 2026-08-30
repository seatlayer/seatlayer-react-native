import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextLayoutEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { chartSeatLayerPickerColor } from './chartColor';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { focusedPickerSection, seatsLeftInPickerSection, usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';

export interface SeatLayerDockBarProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'dockContainer' | 'dockSectionText' | 'dockCountText'>;
  readonly safeAreaBottomInset?: number;
  readonly reserveBottomInset?: boolean;
  /** Called after the built-in return to the venue overview completes. */
  readonly onOverview?: () => unknown;
  readonly onSectionChanged?: (sectionId: string) => void;
}

type DockPlan = Readonly<{ count: 'long' | 'short' | 'hidden'; labelled: boolean; lines: 1 | 2 }>;
type MeasuredWidths = Readonly<{ name: number; longCount: number; shortCount: number; overview: number }>;

const unknownWidths: MeasuredWidths = Object.freeze({
  name: Number.NaN,
  longCount: Number.NaN,
  shortCount: Number.NaN,
  overview: Number.NaN,
});
const dotSize = 10;
const stepPaint = 30;
const leadingWidth = 12 + dotSize + 8;
const trailingWidth = 6;
const overviewGap = 4;
const countSeparatorWidth = 16;

export function resolveSeatLayerDockMotionDuration(reducedMotion: boolean, duration: number): number {
  return !reducedMotion && Number.isFinite(duration) && duration >= 0 ? duration : 0;
}

export function shouldRetainSeatLayerDock(
  visible: boolean,
  present: boolean,
  retainedSessionId: number | undefined,
  sessionId: number,
): boolean {
  return visible || (present && retainedSessionId === sessionId);
}

/** The slide offset is one complete dock band, including its safe edge. */
export function seatLayerDockTravelDistance(height: number, bottomInset: number): number {
  const dock = Number.isFinite(height) ? Math.max(0, height) : 0;
  const inset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  return dock + inset;
}

/** A visible dock starts offscreen/transparent unless reduced motion collapses it. */
export function seatLayerDockInitialOpacity(): number { return 0; }

function safeInset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function textWidth(event: TextLayoutEvent): number {
  return event.nativeEvent.lines.reduce((result, line) => Math.max(result, line.width), 0);
}

function allMeasured(widths: MeasuredWidths): boolean {
  return Object.values(widths).every((width) => Number.isFinite(width) && width >= 0);
}

/** Fixed fallback ladder: long count, short, then no count. Venue stays labelled. */
export function planSeatLayerDock(
  width: number,
  widths: MeasuredWidths,
  hasCount: boolean,
  minimumTarget: number,
): DockPlan | undefined {
  if (!Number.isFinite(width) || width <= 0 || !allMeasured(widths)) return undefined;
  const labelledOverview = Math.max(64, 20 + 18 + 8 + widths.overview);
  const roomFor = (count: number, overview: number) =>
    width - leadingWidth - count - minimumTarget * 2 - overviewGap - overview - trailingWidth;
  const rungs: ReadonlyArray<DockPlan['count']> = hasCount
    ? ['long', 'short', 'hidden']
    : ['hidden'];
  for (const count of rungs) {
    const countWidth = count === 'long'
      ? countSeparatorWidth + widths.longCount
      : count === 'short'
        ? countSeparatorWidth + widths.shortCount
        : 0;
    if (widths.name <= roomFor(countWidth, labelledOverview)) {
      return { count, labelled: true, lines: 1 };
    }
  }
  if (widths.name <= roomFor(0, labelledOverview)) {
    return { count: 'hidden', labelled: true, lines: 1 };
  }
  // Preserve the explicit Venue action even when the section name must wrap
  // and ellipsize. Three adjacent chevrons are not distinguishable navigation.
  return { count: 'hidden', labelled: true, lines: 2 };
}

function MeasureText({
  value,
  style,
  onMeasure,
}: {
  readonly value: string;
  readonly style: StyleProp<TextStyle>;
  readonly onMeasure: (event: TextLayoutEvent) => void;
}): React.ReactElement {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onTextLayout={onMeasure}
      style={[style, { left: -10000, opacity: 0, position: 'absolute' }]}
    >
      {value}
    </Text>
  );
}

/** Scoped focused-section dock with data-only layout below the adapter. */
export function SeatLayerDockBar(props: SeatLayerDockBarProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const snapshot = scope.snapshot;
  const section = focusedPickerSection(snapshot);
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const theme = useMemo(
    () => resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot),
    [scope.resolvedTheme, snapshot],
  );
  const sectionIndex = section === undefined || snapshot === undefined
    ? -1
    : snapshot.sections.findIndex((item) => item.id === section.id);
  const previous = sectionIndex > 0 ? snapshot?.sections[sectionIndex - 1] : undefined;
  const next = snapshot !== undefined && sectionIndex >= 0
    ? snapshot.sections[sectionIndex + 1]
    : undefined;
  const sessionRef = useRef(scope.sessionId);
  useLayoutEffect(() => {
    sessionRef.current = scope.sessionId;
  }, [scope.sessionId]);
  const requestedAction = useRef<Readonly<{
    kind: 'previous' | 'next' | 'overview';
    sessionId: number;
  }> | undefined>(undefined);
  const [actionBusy, runAction] = usePickerSingleFlight(
    scope.sessionId, scope.reportError, async () => {
      const request = requestedAction.current;
      const action = request?.kind;
      const controller = scope.controller;
      const sessionId = scope.sessionId;
      const latest = controller.getSnapshot();
      if (!action || request?.sessionId !== sessionId || sessionRef.current !== sessionId || controller !== scope.controller ||
        latest?.map.rung !== 'seats' || !supportsSeatLayerPickerSurface(
          controller, ['native-chrome-contract-v1'], [
            action === 'overview' ? 'picker.overview' : 'picker.focusSection',
          ],
        )) return undefined;
      if (action === 'overview') {
        await controller.overview();
        if (sessionRef.current === sessionId && controller === scope.controller) {
          notifyOverview(props.onOverview);
        }
        return undefined;
      }
      const current = focusedPickerSection(latest);
      const index = current === undefined ? -1 : latest.sections.findIndex((item) => item.id === current.id);
      const target = action === 'previous'
        ? index > 0 ? latest.sections[index - 1] : undefined
        : index >= 0 ? latest.sections[index + 1] : undefined;
      if (!target) return undefined;
      await controller.focusSection(target.id);
      if (sessionRef.current === sessionId && controller === scope.controller) {
        notifySectionChange(props.onSectionChanged, target.id);
      }
      return undefined;
    },
  );
  const ownsDock = supportsSeatLayerPickerSurface(scope.controller, ['native-chrome-contract-v1'], []);
  const canFocus = supportsSeatLayerPickerSurface(
    scope.controller, ['native-chrome-contract-v1'], ['picker.focusSection'],
  );
  const canOverview = supportsSeatLayerPickerSurface(
    scope.controller, ['native-chrome-contract-v1'], ['picker.overview'],
  );
  const visible = ownsDock && snapshot !== undefined && section !== undefined && snapshot.map.rung === 'seats';
  const [actualHeight, setActualHeight] = useState<number | undefined>(undefined);
  const measurementCopy = section === undefined || snapshot === undefined ? '' :
    `${section.displayLabel ?? section.label}:${seatsLeftInPickerSection(section, snapshot) ?? ''}`;
  const measurementToken = useMemo(() => Object.freeze({
    session: scope.sessionId,
    section: section?.id,
    copy: measurementCopy,
  }), [measurementCopy, props.slots, props.style, scope.sessionId, scope.styles, scope.strings, section?.id, theme.fontFamily]);
  const heightTokenRef = useRef(measurementToken);
  useLayoutEffect(() => {
    heightTokenRef.current = measurementToken;
    setActualHeight(undefined);
  }, [measurementToken]);
  const bottomInset = props.reserveBottomInset === true ? safeInset(props.safeAreaBottomInset) : 0;
  const bandHeight = actualHeight ?? theme.layout.dockBarHeight + bottomInset;
  const insetLease = useMemo(
    () => props.reserveBottomInset ? scope.claimViewportInsetBand('dock') : undefined,
    [props.reserveBottomInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  useSeatLayerPickerInsetLease(insetLease, visible ? { bottom: bandHeight } : undefined);
  const content = !visible || snapshot === undefined || section === undefined ? null : (() => {
    const dominant = snapshot.categories.find((item) => item.key === section.dominantCategoryKey);
    const categoryColor = chartSeatLayerPickerColor(
      dominant?.color,
      chartSeatLayerPickerColor(section.color, theme.colors.accent),
    );
    const disabled = scope.isBusy || actionBusy;
    return (
      <SeatLayerDockBarView
        {...props}
        slots={styles}
        sectionName={section.displayLabel ?? section.label}
        seatsLeft={seatsLeftInPickerSection(section, snapshot)}
        categoryColor={categoryColor}
        theme={theme}
        strings={scope.strings}
        bottomInset={bottomInset}
        measurementToken={measurementToken}
        onHeight={(height, token) => {
          if (heightTokenRef.current !== token) return;
          setActualHeight((current) => current !== undefined && Math.abs(current - height) < 0.5
            ? current : height);
        }}
        previousEnabled={!disabled && canFocus && previous !== undefined}
        nextEnabled={!disabled && canFocus && next !== undefined}
        overviewEnabled={!disabled && canOverview}
        onPrevious={() => {
          if (previous !== undefined) {
            requestedAction.current = Object.freeze({ kind: 'previous', sessionId: scope.sessionId });
            runAction();
          }
        }}
        onNext={() => {
          if (next !== undefined) {
            requestedAction.current = Object.freeze({ kind: 'next', sessionId: scope.sessionId });
            runAction();
          }
        }}
        onOverview={() => {
          requestedAction.current = Object.freeze({ kind: 'overview', sessionId: scope.sessionId });
          runAction();
        }}
      />
    );
  })();
  return (
    <SeatLayerDockPresence
      duration={theme.motion.duration.dock}
      enterCurve={theme.motion.curve.easeEnter.cubicBezier}
      reducedMotion={reducedMotion}
      sessionId={scope.sessionId}
      travelDistance={seatLayerDockTravelDistance(theme.layout.dockBarHeight, bottomInset)}
      visible={visible}
    >
      {content}
    </SeatLayerDockPresence>
  );
}

/** Keeps a same-session dock mounted through its generated exit motion. */
function SeatLayerDockPresence({
  children,
  duration,
  enterCurve,
  reducedMotion,
  sessionId,
  travelDistance,
  visible,
}: {
  readonly children: React.ReactNode;
  readonly duration: number;
  readonly enterCurve: readonly [number, number, number, number];
  readonly reducedMotion: boolean;
  readonly sessionId: number;
  readonly travelDistance: number;
  readonly visible: boolean;
}): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(seatLayerDockInitialOpacity())).current;
  const motionDuration = resolveSeatLayerDockMotionDuration(reducedMotion, duration);
  const [present, setPresent] = useState(visible);
  const retainedRef = useRef<Readonly<{
    sessionId: number;
    children: React.ReactNode;
  }> | undefined>(undefined);
  useLayoutEffect(() => {
    if (visible) {
      // A ref avoids a state-update loop while keeping exit content current
      // after live theme, copy, or slot changes.
      retainedRef.current = Object.freeze({ sessionId, children });
    } else if (retainedRef.current?.sessionId !== sessionId) {
      retainedRef.current = undefined;
    }
  }, [children, sessionId, visible]);
  useLayoutEffect(() => {
    let live = true;
    opacity.stopAnimation();
    if (visible) {
      setPresent(true);
      if (motionDuration === 0) {
        opacity.setValue(1);
        return () => { live = false; };
      }
      Animated.timing(opacity, {
        duration: motionDuration,
        easing: Easing.bezier(...enterCurve),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return () => { live = false; opacity.stopAnimation(); };
    }
    if (retainedRef.current?.sessionId !== sessionId) {
      opacity.setValue(0);
      setPresent(false);
      return () => { live = false; };
    }
    if (motionDuration === 0) {
      opacity.setValue(0);
      setPresent(false);
      retainedRef.current = undefined;
      return () => { live = false; };
    }
    Animated.timing(opacity, {
      duration: motionDuration,
      easing: Easing.bezier(...enterCurve),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!live || !finished) return;
      setPresent(false);
      if (retainedRef.current?.sessionId === sessionId) retainedRef.current = undefined;
    });
    return () => { live = false; opacity.stopAnimation(); };
  }, [motionDuration, opacity, sessionId, visible]);
  const retained = retainedRef.current;
  if (!shouldRetainSeatLayerDock(visible, present, retained?.sessionId, sessionId)) return null;
  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        opacity,
        transform: [{
          translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [travelDistance, 0] }),
        }],
      }}
    >
      {visible ? children : retained?.children}
    </Animated.View>
  );
}

function notifyOverview(
  callback: SeatLayerDockBarProps['onOverview'],
): void {
  if (!callback) return;
  try {
    void Promise.resolve(callback()).catch(() => undefined);
  } catch {
    // Host observation must never become a picker error surface.
  }
}

function notifySectionChange(
  callback: SeatLayerDockBarProps['onSectionChanged'],
  sectionId: string,
): void {
  if (callback === undefined) return;
  try {
    void Promise.resolve(callback(sectionId)).catch(() => undefined);
  } catch {
    // Host observation must never become a picker error surface.
  }
}

function SeatLayerDockBarView({
  style,
  slots,
  sectionName,
  seatsLeft,
  categoryColor,
  theme,
  strings,
  bottomInset,
  onHeight,
  measurementToken,
  previousEnabled,
  nextEnabled,
  overviewEnabled,
  onPrevious,
  onNext,
  onOverview,
}: SeatLayerDockBarProps & {
  readonly sectionName: string;
  readonly seatsLeft: number | undefined;
  readonly categoryColor: string;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly bottomInset: number;
  readonly measurementToken: object;
  readonly onHeight: (height: number, token: object) => void;
  readonly previousEnabled: boolean;
  readonly nextEnabled: boolean;
  readonly overviewEnabled: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onOverview: () => void;
}): React.ReactElement {
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<MeasuredWidths>(unknownWidths);
  const activeMeasurementRef = useRef(measurementToken);
  useLayoutEffect(() => {
    activeMeasurementRef.current = measurementToken;
    setWidth(0);
    setWidths(unknownWidths);
  }, [measurementToken]);
  const leftToRight = !I18nManager.isRTL;
  const longCount = seatsLeft === undefined
    ? ''
    : strings.translate('seatsLeft', { count: seatsLeft, values: { count: seatsLeft } });
  const textStyle = {
    color: theme.colors.text,
    fontFamily: theme.fontFamily,
    fontSize: 13,
    fontWeight: '800' as const,
  };
  const countStyle = {
    color: theme.colors.mutedText,
    fontFamily: theme.fontFamily,
    fontSize: 13,
    fontWeight: '600' as const,
  };
  const plan = useMemo(
    () => planSeatLayerDock(width, widths, seatsLeft !== undefined, theme.layout.minimumHitTarget),
    [seatsLeft, theme.layout.minimumHitTarget, width, widths],
  );
  const target = theme.layout.minimumHitTarget;
  // Measurements arrive after the first commit; never leave focused buyers
  // with a blank dock while native text metrics settle.
  const displayPlan: DockPlan = plan ?? {
    count: 'hidden', labelled: true, lines: 2,
  };
  const overviewWidth = Number.isFinite(widths.overview)
    ? Math.max(64, 20 + 18 + 8 + widths.overview)
    : 84;
  const measure = (key: keyof MeasuredWidths) => (event: TextLayoutEvent) => {
    if (activeMeasurementRef.current !== measurementToken) return;
    const next = textWidth(event);
    setWidths((current) => current[key] === next ? current : { ...current, [key]: next });
  };
  const onLayout = (event: LayoutChangeEvent) => {
    if (activeMeasurementRef.current !== measurementToken) return;
    const layout = event.nativeEvent.layout;
    setWidth(layout.width);
    onHeight(layout.height, measurementToken);
  };
  const count = displayPlan.count === 'long'
    ? longCount
    : displayPlan.count === 'short'
      ? String(seatsLeft)
      : undefined;
  return (
    <View
      onLayout={onLayout}
      style={[
        {
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.divider,
          borderTopWidth: 1,
          elevation: theme.elevation.dockBar,
          flexDirection: leftToRight ? 'row' : 'row-reverse',
          height: theme.layout.dockBarHeight + bottomInset,
          paddingBottom: bottomInset,
          shadowColor: theme.colors.text,
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
        },
        slots?.dockContainer,
        sanitizeSeatLayerPickerStyle(style),
        {
          height: theme.layout.dockBarHeight + bottomInset,
          minHeight: theme.layout.dockBarHeight + bottomInset,
          paddingBottom: bottomInset,
        },
      ]}
    >
      <MeasureText
        value={sectionName}
        style={[textStyle, slots?.dockSectionText]}
        onMeasure={measure('name')}
      />
      <MeasureText
        value={longCount}
        style={[countStyle, slots?.dockCountText]}
        onMeasure={measure('longCount')}
      />
      <MeasureText
        value={String(seatsLeft ?? '')}
        style={[countStyle, slots?.dockCountText]}
        onMeasure={measure('shortCount')}
      />
      <MeasureText
        value={strings.translate('overview')}
        style={textStyle}
        onMeasure={measure('overview')}
      />
      {(
        <>
          <View style={{ width: 12 }} />
          <View
            style={{
              backgroundColor: categoryColor,
              borderRadius: dotSize / 2,
              height: dotSize,
              width: dotSize,
            }}
          />
          <View style={{ width: 8 }} />
          <View
            style={{
              alignItems: 'center',
              flex: 1,
              flexDirection: leftToRight ? 'row' : 'row-reverse',
              minWidth: 0,
            }}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={displayPlan.lines}
              style={[
                { ...textStyle, flexShrink: 1, fontSize: displayPlan.lines === 2 ? 12 : 13 },
                slots?.dockSectionText,
              ]}
            >
              {sectionName}
            </Text>
            {count === undefined ? null : (
              <>
                <View
                  style={{
                    backgroundColor: theme.colors.mutedText,
                    borderRadius: 2,
                    height: 3,
                    marginHorizontal: 6,
                    width: 3,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={[countStyle, slots?.dockCountText]}
                >
                  {count}
                </Text>
              </>
            )}
          </View>
          <DockButton
            label={strings.translate('previousSection')}
            enabled={previousEnabled}
            onPress={onPrevious}
            paintBox
            radius={theme.radii.button}
            target={target}
          >
            <Chevron color={theme.colors.text} pointsForward={!leftToRight} />
          </DockButton>
          <DockButton
            label={strings.translate('nextSection')}
            enabled={nextEnabled}
            onPress={onNext}
            paintBox
            radius={theme.radii.button}
            target={target}
          >
            <Chevron color={theme.colors.text} pointsForward={leftToRight} />
          </DockButton>
          <View style={{ width: overviewGap }} />
          <DockButton
            label={strings.translate('backToVenue')}
            enabled={overviewEnabled}
            onPress={onOverview}
            width={overviewWidth}
            target={target}
            radius={theme.radii.button}
          >
            <View
              style={{
                alignItems: 'center',
                flexDirection: leftToRight ? 'row' : 'row-reverse',
              }}
            >
              <VenueOverviewIcon color={theme.colors.text} />
              <View style={{ width: 8 }} />
              <Text numberOfLines={1} style={textStyle}>
                {strings.translate('overview')}
              </Text>
            </View>
          </DockButton>
          <View style={{ width: trailingWidth }} />
        </>
      )}
    </View>
  );
}

function DockButton({
  label,
  enabled,
  onPress,
  width,
  target,
  radius,
  paintBox = false,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly onPress: () => void;
  readonly width?: number;
  readonly target: number;
  readonly radius: number;
  readonly paintBox?: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
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
        minWidth: target,
        opacity: enabled ? (pressed ? 0.72 : 1) : 0.4,
        borderRadius: radius,
        overflow: 'hidden',
        width,
      })}
    >
      {paintBox ? (
        <View
          style={{
            alignItems: 'center',
            borderRadius: radius,
            height: stepPaint,
            justifyContent: 'center',
            overflow: 'hidden',
            width: stepPaint,
          }}
        >
          {children}
        </View>
      ) : children}
    </Pressable>
  );
}

function Chevron({
  color,
  pointsForward,
}: {
  readonly color: string;
  readonly pointsForward: boolean;
}): React.ReactElement {
  return (
    <View
      style={{
        borderColor: color,
        borderLeftWidth: 2,
        borderTopWidth: 2,
        height: 9,
        transform: [{ rotate: pointsForward ? '135deg' : '-45deg' }],
        width: 9,
      }}
    />
  );
}

function VenueOverviewIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View
      testID="seatlayer-dock-venue-icon"
      style={{
        alignItems: 'center',
        borderColor: color,
        borderRadius: 3,
        borderWidth: 1.5,
        height: 16,
        justifyContent: 'space-evenly',
        paddingHorizontal: 3,
        paddingVertical: 2,
        width: 18,
      }}
    >
      <View style={{ backgroundColor: color, borderRadius: 1, height: 2, width: 8 }} />
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View style={{ backgroundColor: color, borderRadius: 2, height: 3, width: 3 }} />
        <View style={{ backgroundColor: color, borderRadius: 2, height: 3, width: 3 }} />
        <View style={{ backgroundColor: color, borderRadius: 2, height: 3, width: 3 }} />
      </View>
    </View>
  );
}
