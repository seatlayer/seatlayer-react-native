import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { seatLayerAllFloors, type SeatLayerPickerFloorInfo } from './models';
import { blendSeatLayerPickerColor } from './pickerNavigation';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerBoldStyles } from './boldText';

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
  props: SeatLayerFloorStripProps;
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
  const paint = props.compact === false
    ? seatLayerPickerTokens.size.floorChipHeight + 8
    : seatLayerPickerTokens.size.floorChipHeight;
  const actionBusy = scope.isBusy || busy;
  const disabled = actionBusy || !supportsSetFloor;
  const rtl = I18nManager.isRTL;
  return <View style={[
      nativeStyles.root,
      { minHeight: target, height: target },
      styles.floorStripContainer,
      sanitizeSeatLayerPickerStyle(props.style),
      { minHeight: target, height: target },
    ]}
  >
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[nativeStyles.scroll, { flexDirection: rtl ? 'row-reverse' : 'row', paddingHorizontal: seatLayerPickerTokens.size.floorRailPadding }]}>
      {offersAll ? <FloorChip label={scope.strings.translate('allFloors')} selected={selectedAll} disabled={!isSeatLayerPickerFloorSelectionEnabled(selectedAll, disabled)} busy={actionBusy} compact={props.compact !== false} paint={paint} target={target} scope={scope} styles={styles} onPress={() => start(seatLayerAllFloors)} /> : null}
      {floors.map((floor) => {
        const selected = !selectedAll && scope.snapshot?.map.activeFloorId === floor.id;
        return <FloorChip key={floor.id} label={floor.name} selected={selected} disabled={!isSeatLayerPickerFloorSelectionEnabled(selected, disabled)} busy={actionBusy} compact={props.compact !== false} paint={paint} target={target} scope={scope} styles={styles} onPress={() => start(floor.id)} />;
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
              borderColor: scope.resolvedTheme.colors.divider,
              borderRadius: scope.resolvedTheme.radii.pill,
            }]}
          >
            <Text
              allowFontScaling={false}
              style={[nativeStyles.infoGlyph, { color: scope.resolvedTheme.colors.mutedText }]}
            >
              i
            </Text>
          </View>
        </Pressable>
      )}
    </ScrollView>
  </View>;
}

function FloorChip({ label, selected, disabled, busy, compact, paint, target, scope, styles, onPress }: Readonly<{
  label: string;
  selected: boolean;
  disabled: boolean;
  busy: boolean;
  compact: boolean;
  paint: number;
  target: number;
  scope: SeatLayerPickerScopeValue;
  styles: ReturnType<typeof resolveSeatLayerPickerStyles>;
  onPress: () => void;
}>): React.ReactElement {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled, busy }} disabled={disabled} onPress={onPress} style={nativeStyles.target}>
    <View style={[
      nativeStyles.paint,
      {
        height: paint,
        backgroundColor: selected ? scope.resolvedTheme.colors.accent : blendSeatLayerPickerColor(scope.resolvedTheme.colors.text, scope.resolvedTheme.colors.surface, .04, scope.resolvedTheme.colors.surface),
        borderColor: selected ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.divider,
        borderRadius: scope.resolvedTheme.radii.chip,
      },
      styles.floorChip,
      { height: paint },
    ]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.label, { color: selected ? scope.resolvedTheme.colors.onAccent : scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily, fontSize: seatLayerPickerTokens.size.floorChipFontSize }, styles.floorChipText]}>{label}</Text>
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
  root: { justifyContent: 'center', width: '100%' },
  scroll: { alignItems: 'center', gap: seatLayerPickerTokens.size.floorRailGap },
  target: { minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' },
  paint: {
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: 160,
    paddingHorizontal: seatLayerPickerTokens.size.floorChipPaddingX,
  },
  label: { fontSize: seatLayerPickerTokens.size.floorChipFontSize, fontWeight: '800' },
  info: {
    width: seatLayerPickerTokens.size.floorInfoSize,
    height: seatLayerPickerTokens.size.floorInfoSize,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: { fontSize: 13, fontWeight: '800' },
}));
