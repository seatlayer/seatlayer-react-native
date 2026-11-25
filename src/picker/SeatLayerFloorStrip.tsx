import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { seatLayerAllFloors, type SeatLayerPickerFloorInfo } from './models';
import { seatLayerPickerColorAlpha } from './colors';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerBoldStyles } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

export interface SeatLayerFloorStripProps {
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'floorStripContainer' | 'floorChip' | 'floorChipText'>;
  /** Optional: only a mounted visible strip claims a top viewport band. */
  readonly reserveInset?: boolean;
  readonly onFloorChanged?: (floorId: string) => void | Promise<void>;
  /**
   * The info glyph that closes the track (§3.7). It is drawn only where a host
   * gives it something to do: a control with no action is a dead end, and the
   * spec does not name a runtime command behind it.
   */
  readonly onFloorInfo?: () => void;
}

type Lease = Readonly<{
  readonly controller: SeatLayerPickerScopeValue['controller'];
  readonly scopeSession: number;
  readonly runtimeSession: string;
}>;
type Flight = Readonly<{ readonly token: object; readonly target: string; readonly lease: Lease }>;

/** The all-floors sentinel requires both the capability and a compatible mode. */
export function canOfferSeatLayerAllFloors(
  floorMode: string | undefined,
  supportsFloorStack: boolean,
): boolean {
  return supportsFloorStack && (floorMode === 'single' || floorMode === 'all');
}

export function isSeatLayerPickerFloorSelectionEnabled(selected: boolean, busy: boolean): boolean {
  return !selected && !busy;
}

/** Snapshot-only horizontal floor chooser. One or no floors intentionally draw no chrome. */
export function SeatLayerFloorStrip(props: SeatLayerFloorStripProps): React.ReactElement | null {
  return <SeatLayerMeasuredFloorStrip {...props} />;
}

type MeasuredProps = SeatLayerFloorStripProps & Readonly<{
  /** How wide the whole pill is, with all its levels in it. */
  onWidth?: (width: number) => void;
}>;

/** The same for the picker's own layout, which stands it beside other pieces. */
export function SeatLayerMeasuredFloorStrip(props: MeasuredProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  const floors = snapshot?.map.floors ?? [];
  // Drawn only on a multi-floor venue, and never in the immersive scene.
  if (!snapshot || floors.length < 2 || snapshot.map.buyerView === 'venue3d') return null;
  return <FloorStripCurrent key={`${scope.sessionId}:${snapshot.sessionId}`} scope={scope} snapshotSession={snapshot.sessionId} floors={floors} props={props} />;
}

function FloorStripCurrent({ scope, snapshotSession, floors, props }: Readonly<{
  scope: SeatLayerPickerScopeValue;
  snapshotSession: string;
  floors: readonly SeatLayerPickerFloorInfo[];
  props: MeasuredProps;
}>): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(false);
  const scopeRef = useRef(scope);
  const propsRef = useRef(props);
  const leaseRef = useRef<Lease>(leaseOf(scope, snapshotSession));
  const flightRef = useRef<Flight | undefined>(undefined);
  useLayoutEffect(() => { scopeRef.current = scope; propsRef.current = props; });
  useLayoutEffect(() => {
    activeRef.current = true;
    leaseRef.current = leaseOf(scope, snapshotSession);
    flightRef.current = undefined;
    setBusy(false);
    return () => { activeRef.current = false; flightRef.current = undefined; };
  }, [scope.controller, scope.sessionId, snapshotSession]);

  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const supportsSetFloor = supportsFloor(scope.controller);
  const offersAll = canOfferSeatLayerAllFloors(
    scope.snapshot?.map.floorMode,
    supportsSetFloor && supportsFloorStack(scope.controller),
  );
  const selectedAll = offersAll && scope.snapshot?.map.floorMode === 'all';
  const insetLease = useMemo(
    () => props.reserveInset ? scope.claimViewportInsetBand('floors') : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId],
  );
  useEffect(() => {
    if (!insetLease) return undefined;
    insetLease.set({ top: seatLayerPickerTokens.size.minimumHitTarget });
    return () => insetLease.remove();
  }, [insetLease]);

  const selected = selectedAll ? seatLayerAllFloors : scope.snapshot?.map.activeFloorId;
  const reduceMotion = useSeatLayerPickerReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const places = useRef(new Map<string, LayoutRectangle>());
  const widths = useRef({ content: 0, shown: 0 });
  // The chosen level stands in the pill's middle, or as near as its ends allow.
  const reveal = (animated: boolean) => {
    const place = selected === undefined ? undefined : places.current.get(selected);
    const room = widths.current.content - widths.current.shown;
    if (place === undefined || room <= 0) return;
    const x = Math.max(0, Math.min(room, place.x + (place.width - widths.current.shown) / 2));
    scroller.current?.scrollTo({ animated, x });
  };
  useEffect(() => { reveal(!reduceMotion); }, [selected]);
  const measured = (key: string) => (event: LayoutChangeEvent) => {
    places.current.set(key, event.nativeEvent.layout);
    if (key === selected) reveal(false);
  };

  const start = (target: string) => {
    const current = scopeRef.current;
    const lease = leaseRef.current;
    if (!isLive(activeRef, current, lease) || flightRef.current || !canStartTarget(current, lease, target)) return;
    const flight = Object.freeze({ token: Object.freeze({}), target, lease });
    flightRef.current = flight;
    setBusy(true);
    const task = (async () => {
      await lease.controller.setFloor(target);
      if (!owns(activeRef, flight, scopeRef.current, leaseRef.current) ||
        !canCompleteTarget(scopeRef.current, flight.lease, target)) return;
      observe(propsRef.current.onFloorChanged, target);
    })().catch((error) => {
      if (owns(activeRef, flight, scopeRef.current, leaseRef.current)) report(scopeRef.current, error);
    });
    void task.finally(() => {
      if (!owns(activeRef, flight, scopeRef.current, leaseRef.current)) return;
      flightRef.current = undefined;
      setBusy(false);
    });
  };
  const target = seatLayerPickerTokens.size.minimumHitTarget;
  const compact = props.compact !== false;
  const paint = seatLayerPickerTokens.size.floorChipHeight + (compact ? 0 : 6);
  const pill = paint + seatLayerPickerTokens.size.floorRailPadding * 2;
  const actionBusy = scope.isBusy || busy;
  const disabled = actionBusy || !supportsSetFloor;
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const chip = { busy: actionBusy, compact, paint, styles, theme };
  return <View
    pointerEvents="box-none"
    style={[
      nativeStyles.root,
      { minHeight: target, height: target },
      styles.floorStripContainer,
      sanitizeSeatLayerPickerStyle(props.style),
      { minHeight: target, height: target },
    ]}
  >
    {/* One pill with the levels in it, not a row of loose chips: the pill is
        what says they are one choice. It scrolls inside itself. */}
    <View pointerEvents="box-none" style={nativeStyles.track}>
      <View
        pointerEvents="none"
        style={[nativeStyles.pill, {
          backgroundColor: seatLayerPickerColorAlpha(theme.colors.surface, .92),
          borderColor: theme.colors.divider,
          height: pill,
          top: (target - pill) / 2,
        }]}
      />
      <ScrollView
        contentContainerStyle={nativeStyles.scroll}
        horizontal
        onContentSizeChange={(width) => {
          widths.current.content = width;
          props.onWidth?.(width + seatLayerPickerTokens.size.floorRailPadding * 2);
          reveal(false);
        }}
        onLayout={(event) => {
          widths.current.shown = event.nativeEvent.layout.width;
          reveal(false);
        }}
        ref={scroller}
        showsHorizontalScrollIndicator={false}
        style={nativeStyles.scroller}
      >
        {offersAll ? <FloorChip {...chip} label={scope.strings.translate('allFloors')} selected={selectedAll} disabled={!isSeatLayerPickerFloorSelectionEnabled(selectedAll, disabled)} onLayout={measured(seatLayerAllFloors)} onPress={() => start(seatLayerAllFloors)} /> : null}
        {floors.map((floor) => {
          const chosen = selected === floor.id;
          return <FloorChip {...chip} key={floor.id} label={floor.name} selected={chosen} disabled={!isSeatLayerPickerFloorSelectionEnabled(chosen, disabled)} onLayout={measured(floor.id)} onPress={() => start(floor.id)} />;
        })}
        {props.onFloorInfo === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={scope.strings.translate('allFloors')}
            onPress={props.onFloorInfo}
            style={nativeStyles.target}
          >
            <View
              accessible={false}
              style={[nativeStyles.info, {
                borderColor: theme.colors.divider,
                borderRadius: theme.radii.pill,
              }]}
            >
              <Text
                allowFontScaling={false}
                style={[nativeStyles.infoGlyph, { color: theme.colors.mutedText }]}
              >
                i
              </Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </View>
  </View>;
}

/** A segment of the pill: only the level being drawn wears the accent. */
function FloorChip({ label, selected, disabled, busy, compact, paint, styles, theme, onLayout, onPress }: Readonly<{
  label: string;
  selected: boolean;
  disabled: boolean;
  busy: boolean;
  compact: boolean;
  paint: number;
  styles: ReturnType<typeof resolveSeatLayerPickerStyles>;
  theme: SeatLayerPickerScopeValue['resolvedTheme'];
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}>): React.ReactElement {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled, busy }} disabled={disabled} onLayout={onLayout} onPress={onPress} style={nativeStyles.target}>
    <View style={[
      nativeStyles.paint,
      {
        height: paint,
        backgroundColor: selected ? theme.colors.accent : 'transparent',
        borderRadius: theme.radii.chip,
        paddingHorizontal: seatLayerPickerTokens.size.floorChipPaddingX + (compact ? 0 : 3),
      },
      styles.floorChip,
      { height: paint },
    ]}>
      <Text
        ellipsizeMode="tail"
        maxFontSizeMultiplier={2}
        numberOfLines={1}
        style={[
          nativeStyles.label,
          { color: selected ? theme.colors.onAccent : theme.colors.mutedText, fontFamily: theme.fontFamily },
          compact ? null : nativeStyles.wideLabel,
          styles.floorChipText,
        ]}
      >{label}</Text>
    </View>
  </Pressable>;
}

function leaseOf(scope: SeatLayerPickerScopeValue, runtimeSession: string): Lease {
  return Object.freeze({ controller: scope.controller, scopeSession: scope.sessionId, runtimeSession });
}
function sameLease(left: Lease, right: Lease): boolean {
  return left.controller === right.controller && left.scopeSession === right.scopeSession && left.runtimeSession === right.runtimeSession;
}
function isLive(active: React.MutableRefObject<boolean>, scope: SeatLayerPickerScopeValue, lease: Lease): boolean {
  return active.current && sameLease(leaseOf(scope, scope.snapshot?.sessionId ?? ''), lease);
}
function owns(active: React.MutableRefObject<boolean>, flight: Flight, scope: SeatLayerPickerScopeValue, lease: Lease): boolean {
  return active.current && sameLease(flight.lease, lease) && isLive(active, scope, flight.lease);
}
function supportsFloor(controller: SeatLayerPickerScopeValue['controller']): boolean {
  return controller.mapController.isReady && controller.mapController.supportsPickerCommand('picker.setFloor');
}
function supportsFloorStack(controller: SeatLayerPickerScopeValue['controller']): boolean {
  return controller.mapController.isReady && controller.mapController.supportsPickerCapability('floor-stack-v1') && controller.mapController.supportsPickerCommand('picker.setFloor');
}
function canStartTarget(scope: SeatLayerPickerScopeValue, lease: Lease, target: string): boolean {
  const snapshot = lease.controller.getSnapshot();
  if (!isLive({ current: true }, scope, lease) || !snapshot || snapshot.sessionId !== lease.runtimeSession || !supportsFloor(lease.controller)) return false;
  if (target === seatLayerAllFloors) return canOfferSeatLayerAllFloors(snapshot.map.floorMode, supportsFloorStack(lease.controller)) && snapshot.map.floorMode !== 'all';
  return snapshot.map.floors.some((floor) => floor.id === target) && !(snapshot.map.floorMode !== 'all' && snapshot.map.activeFloorId === target);
}
function canCompleteTarget(scope: SeatLayerPickerScopeValue, lease: Lease, target: string): boolean {
  const snapshot = lease.controller.getSnapshot();
  if (!isLive({ current: true }, scope, lease) || !snapshot || snapshot.sessionId !== lease.runtimeSession || !supportsFloor(lease.controller)) return false;
  if (target === seatLayerAllFloors) return canOfferSeatLayerAllFloors(snapshot.map.floorMode, supportsFloorStack(lease.controller));
  return snapshot.map.floors.some((floor) => floor.id === target);
}
function observe(callback: SeatLayerFloorStripProps['onFloorChanged'], target: string): void {
  try { void Promise.resolve(callback?.(target)).catch(() => undefined); } catch { /* Observation cannot affect floor ownership. */ }
}
function report(scope: SeatLayerPickerScopeValue, error: unknown): void {
  try { scope.reportError(error); } catch { /* Host reporting is observational. */ }
}

const nativeStyles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  track: { maxWidth: '100%' },
  pill: {
    borderRadius: seatLayerPickerTokens.radius.pill,
    borderWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: .18,
    shadowRadius: 2,
  },
  // Cut by a curve inside the pill's own, so a chip never stands past its end.
  scroller: {
    borderRadius: seatLayerPickerTokens.size.minimumHitTarget / 2,
    flexGrow: 0,
    marginHorizontal: seatLayerPickerTokens.size.floorRailPadding,
  },
  scroll: { alignItems: 'center', gap: seatLayerPickerTokens.size.floorRailGap },
  target: { minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' },
  paint: { alignItems: 'center', justifyContent: 'center', maxWidth: 160 },
  label: {
    fontSize: seatLayerPickerTokens.size.floorChipFontSize,
    fontWeight: '600',
    letterSpacing: seatLayerPickerTokens.size.floorChipFontSize * .05,
  },
  wideLabel: { fontSize: seatLayerPickerTokens.size.floorChipFontSize + 1 },
  info: {
    width: seatLayerPickerTokens.size.floorInfoSize,
    height: seatLayerPickerTokens.size.floorInfoSize,
    borderWidth: seatLayerPickerLineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: { fontSize: 13, fontWeight: '800' },
}));
