import React, { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  planSeatLayerVenue3DAction,
  dispatchSeatLayerVenue3DAction,
  dispatchSeatLayerVenue3DBackOverride,
  dispatchSeatLayerVenue3DNavigationMode,
  resolveSeatLayerPickerImmersiveTheme,
  seatLayerImmersiveDuration,
  seatLayerImmersiveInsetPlan,
  seatLayerImmersiveRequestIsCurrent,
  seatLayerVenue3DCaption,
  seatLayerVenue3DIsOwned,
  seatLayerVenue3DNavigationIsOwned,
  seatLayerVenue3DNeighbours,
  type SeatLayerVenue3DAction,
} from './immersiveChrome';
import { seatLayerPickerColorAlpha } from './colors';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { seatLayerPickerTokens } from './tokens.g';

type VenueSlots = Pick<
  SeatLayerPickerStyles,
  'immersiveChromeContainer' | 'immersiveChromeButton' | 'immersiveChromeButtonText'
>;

export interface SeatLayerVenue3DChromeProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: VenueSlots;
  readonly topInset?: number;
  readonly bottomInset?: number;
  /** Replacement for the built-in map return only. */
  readonly onBackToVenue?: () => Promise<unknown> | unknown;
  /** Opt in only when this standalone component owns the immersive band. */
  readonly reserveInset?: boolean;
}

export interface SeatLayerVenue3DChromeViewProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: VenueSlots;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly topInset: number;
  readonly bottomInset: number;
  readonly caption?: string;
  readonly backLabel: string;
  readonly resetLabel: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly recentreLabel: string;
  readonly navigationLabel?: string;
  readonly previousEnabled: boolean;
  readonly nextEnabled: boolean;
  readonly recentreEnabled: boolean;
  readonly navigationEnabled?: boolean;
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
  readonly onRecentre: () => void;
  readonly onNavigation?: () => void;
}

const target = seatLayerPickerTokens.size.minimumHitTarget;
const paint = seatLayerPickerTokens.size.mapControlSize;

function inset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 10;
}

function canOwnVenue(
  controller: ReturnType<typeof useSeatLayerPickerScope>['controller'],
  snapshot: ReturnType<typeof useSeatLayerPickerScope>['snapshot'],
): boolean {
  return seatLayerVenue3DIsOwned({
    buyerView: snapshot?.map.buyerView,
    hasSnapshotFeature: snapshot?.capabilities.includes('venue3d') === true,
    nativeContract: supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1'], []),
    setBuyerView: supportsSeatLayerPickerSurface(
      controller, ['native-chrome-contract-v1', 'venue-3d-v1'], ['picker.setBuyerView'],
    ),
  });
}

function canChangeNavigationMode(
  controller: ReturnType<typeof useSeatLayerPickerScope>['controller'],
  snapshot: ReturnType<typeof useSeatLayerPickerScope>['snapshot'],
): boolean {
  return seatLayerVenue3DNavigationIsOwned({
    buyerView: snapshot?.map.buyerView,
    hasSnapshotFeature: snapshot?.capabilities.includes('venue3d') === true,
    nativeContract: supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1'], []),
    setBuyerView: supportsSeatLayerPickerSurface(
      controller, ['native-chrome-contract-v1', 'venue-3d-v1'], ['picker.setBuyerView'],
    ),
    navigationCapability: supportsSeatLayerPickerSurface(
      controller, ['native-chrome-contract-v1', 'venue-3d-controls-v1'], [],
    ),
    setNavigationMode: supportsSeatLayerPickerSurface(
      controller, ['native-chrome-contract-v1', 'venue-3d-controls-v1'], ['picker.setVenue3DNavigationMode'],
    ),
  });
}

function OrbitIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={styles.orbitIcon}>
    <View style={[styles.orbitTopArc, { borderColor: color }]} />
    <View style={[styles.orbitBottomArc, { borderColor: color }]} />
    <View style={[styles.orbitArrowLeft, { borderRightColor: color }]} />
    <View style={[styles.orbitArrowRight, { borderLeftColor: color }]} />
  </View>;
}

function FocusIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={styles.focusIcon}>
    <View style={[styles.focusCorner, { borderColor: color, left: 0, top: 0 }]} />
    <View style={[styles.focusCorner, { borderColor: color, right: 0, top: 0, transform: [{ rotate: '90deg' }] }]} />
    <View style={[styles.focusCorner, { borderColor: color, bottom: 0, right: 0, transform: [{ rotate: '180deg' }] }]} />
    <View style={[styles.focusCorner, { borderColor: color, bottom: 0, left: 0, transform: [{ rotate: '270deg' }] }]} />
  </View>;
}

function PanIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={styles.panIcon}>
    <View style={[styles.panHorizontal, { backgroundColor: color }]} />
    <View style={[styles.panVertical, { backgroundColor: color }]} />
    <View style={[styles.panArrowUp, { borderBottomColor: color }]} />
    <View style={[styles.panArrowRight, { borderLeftColor: color }]} />
    <View style={[styles.panArrowDown, { borderTopColor: color }]} />
    <View style={[styles.panArrowLeft, { borderRightColor: color }]} />
  </View>;
}

function Icon({ kind, color, rtl }: { readonly kind: 'back' | 'previous' | 'next' | 'reset' | 'recentre' | 'navigation'; readonly color: string; readonly rtl: boolean }): React.ReactElement {
  if (kind === 'reset') return <OrbitIcon color={color} />;
  if (kind === 'recentre') return <FocusIcon color={color} />;
  if (kind === 'navigation') return <PanIcon color={color} />;
  const pointsRight = (kind === 'next') !== rtl;
  return <View style={[styles.chevron, { borderColor: color, transform: [{ rotate: pointsRight ? '135deg' : '-45deg' }] }]} />;
}

function VenueButton({
  label, kind, enabled, onPress, theme, slots, rtl, labelled = false,
}: {
  readonly label: string;
  readonly kind: 'back' | 'previous' | 'next' | 'reset' | 'recentre' | 'navigation';
  readonly enabled: boolean;
  readonly onPress: () => void;
  readonly theme: SeatLayerVenue3DChromeViewProps['theme'];
  readonly slots: VenueSlots | undefined;
  readonly rtl: boolean;
  readonly labelled?: boolean;
}): React.ReactElement {
  return <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{ disabled: !enabled }}
    disabled={!enabled}
    onPress={onPress}
    style={({ pressed }) => ({ alignItems: 'center', height: target, justifyContent: 'center', minWidth: target, opacity: enabled ? (pressed ? 0.72 : 1) : 0.48 })}
  >
    <View style={[
      styles.button,
      labelled ? styles.labelButton : undefined,
      { backgroundColor: seatLayerPickerColorAlpha(theme.colors.surface, 0.92), borderColor: theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.button },
      slots?.immersiveChromeButton,
      { height: paint, minWidth: labelled ? target : paint },
    ]}>
      <Icon color={theme.colors.text} kind={kind} rtl={rtl} />
      {labelled ? <Text numberOfLines={1} style={[styles.buttonText, { color: theme.colors.text, fontFamily: theme.fontFamily }, slots?.immersiveChromeButtonText]}>{label}</Text> : null}
    </View>
  </Pressable>;
}

/** Context-free immersive chrome; the runtime remains the sole scene owner. */
export function SeatLayerVenue3DChromeView(props: SeatLayerVenue3DChromeViewProps): React.ReactElement {
  const rtl = I18nManager.isRTL;
  const slots = resolveSeatLayerPickerStyles({}, props.slots);
  return <View pointerEvents="box-none" style={[styles.root, slots?.immersiveChromeContainer, sanitizeSeatLayerPickerStyle(props.style), styles.rootSafety]}>
    <View pointerEvents="box-none" style={[styles.backRail, { top: props.topInset, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <VenueButton enabled={!props.disabled} kind="back" label={props.backLabel} labelled onPress={props.onBack} rtl={rtl} slots={slots} theme={props.theme} />
      {props.navigationLabel && props.onNavigation ? <VenueButton enabled={!props.disabled && props.navigationEnabled === true} kind="navigation" label={props.navigationLabel} onPress={props.onNavigation} rtl={rtl} slots={slots} theme={props.theme} /> : null}
    </View>
    <View pointerEvents="box-none" style={[styles.deck, { bottom: props.bottomInset }]}>
      {props.caption ? <View pointerEvents="none" style={[styles.caption, { backgroundColor: seatLayerPickerColorAlpha(props.theme.colors.surface, 0.88), borderColor: props.theme.colors.divider }]}>
        <Text numberOfLines={1} style={[styles.captionText, { color: props.theme.colors.text, fontFamily: props.theme.fontFamily }]}>{props.caption}</Text>
      </View> : null}
      <View pointerEvents="box-none" style={[styles.controls, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <VenueButton enabled={!props.disabled && props.previousEnabled} kind="previous" label={props.previousLabel} onPress={props.onPrevious} rtl={rtl} slots={slots} theme={props.theme} />
        <VenueButton enabled={!props.disabled} kind="reset" label={props.resetLabel} labelled onPress={props.onReset} rtl={rtl} slots={slots} theme={props.theme} />
        <VenueButton enabled={!props.disabled && props.nextEnabled} kind="next" label={props.nextLabel} onPress={props.onNext} rtl={rtl} slots={slots} theme={props.theme} />
        <VenueButton enabled={!props.disabled && props.recentreEnabled} kind="recentre" label={props.recentreLabel} onPress={props.onRecentre} rtl={rtl} slots={slots} theme={props.theme} />
      </View>
    </View>
  </View>;
}

/** Scoped venue-3D controls. It never renders, fetches, or gestures the scene itself. */
export function SeatLayerVenue3DChrome(props: SeatLayerVenue3DChromeProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const snapshot = scope.snapshot;
  const visible = canOwnVenue(scope.controller, snapshot);
  const topInset = inset(props.topInset);
  const bottomInset = inset(props.bottomInset);
  const theme = useMemo(() => resolveSeatLayerPickerImmersiveTheme(scope.resolvedTheme), [scope.resolvedTheme]);
  const slots = useMemo(() => resolveSeatLayerPickerStyles(scope.styles, props.slots), [props.slots, scope.styles]);
  const requestRef = useRef<Readonly<{
    action: SeatLayerVenue3DAction | 'backOverride' | 'navigation';
    controller: ReturnType<typeof useSeatLayerPickerScope>['controller'];
    mode?: string;
    onBackToVenue?: () => Promise<unknown> | unknown;
    sessionId: number;
    runtimeSession?: string;
  }> | undefined>(undefined);
  const [busy, run] = usePickerSingleFlight(scope.sessionId, scope.reportError, async () => {
    const request = requestRef.current;
    const controller = scope.controller;
    const current = controller.getSnapshot();
    if (!request || !seatLayerImmersiveRequestIsCurrent(
      { controller: request.controller, scopeSessionId: request.sessionId, runtimeSessionId: request.runtimeSession },
      { controller, scopeSessionId: scope.sessionId, runtimeSessionId: current?.sessionId },
    )) return undefined;
    if (request.action === 'backOverride') {
      if (!request.onBackToVenue || !canOwnVenue(controller, current)) return undefined;
      await dispatchSeatLayerVenue3DBackOverride(request.onBackToVenue);
    } else if (request.action === 'navigation') {
      if (!request.mode || !canChangeNavigationMode(controller, current)) return undefined;
      await dispatchSeatLayerVenue3DNavigationMode(controller, request.mode);
    } else {
      if (!canOwnVenue(controller, current)) return undefined;
      const plan = planSeatLayerVenue3DAction(request.action, current);
      if (!plan || !supportsSeatLayerPickerSurface(controller, ['native-chrome-contract-v1', 'venue-3d-v1'], ['picker.setBuyerView'])) return undefined;
      await dispatchSeatLayerVenue3DAction(controller, plan);
    }
    if (!seatLayerImmersiveRequestIsCurrent(
      { controller: request.controller, scopeSessionId: request.sessionId, runtimeSessionId: request.runtimeSession },
      { controller, scopeSessionId: scope.sessionId, runtimeSessionId: controller.getSnapshot()?.sessionId },
    )) return undefined;
    return undefined;
  });
  const lease = useMemo(() => props.reserveInset && visible ? scope.claimViewportInsetBand('immersive') : undefined, [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId, visible]);
  useSeatLayerPickerInsetLease(lease, seatLayerImmersiveInsetPlan(visible, topInset, bottomInset));
  const opacity = useRef(new Animated.Value(0)).current;
  useLayoutEffect(() => {
    const animation = Animated.timing(opacity, { duration: seatLayerImmersiveDuration(reducedMotion), easing: Easing.bezier(...theme.motion.curve.easeEnter.cubicBezier), toValue: visible ? 1 : 0, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion, theme.motion.curve.easeEnter.cubicBezier, visible]);
  if (!visible || !snapshot) return null;
  const seats = seatLayerVenue3DNeighbours(snapshot);
  const act = (action: SeatLayerVenue3DAction) => () => {
    requestRef.current = Object.freeze({
      action: action === 'back' && props.onBackToVenue ? 'backOverride' : action,
      controller: scope.controller,
      onBackToVenue: action === 'back' ? props.onBackToVenue : undefined,
      sessionId: scope.sessionId,
      runtimeSession: snapshot.sessionId,
    });
    run();
  };
  const navigationAvailable = canChangeNavigationMode(scope.controller, snapshot);
  const moving = snapshot.map.view3DNavigationMode === 'pan';
  const sectionId = seats.target === undefined ? undefined : snapshot.sections.find((section) =>
    section.label === seats.target?.sectionLabel || section.displayLabel === seats.target?.sectionLabel,
  )?.id;
  const changeNavigation = () => {
    requestRef.current = Object.freeze({
      action: 'navigation',
      controller: scope.controller,
      mode: moving ? 'orbit' : 'pan',
      sessionId: scope.sessionId,
      runtimeSession: snapshot.sessionId,
    });
    run();
  };
  return <Animated.View style={[styles.animatedRoot, { opacity }]} pointerEvents="box-none">
    <SeatLayerVenue3DChromeView
      backLabel={scope.strings.translate('backToVenue')}
      bottomInset={bottomInset}
      caption={seatLayerVenue3DCaption(seats.target, sectionId, scope.strings.translate, scope.strings.translate('viewFromYourSeat'))}
      disabled={scope.isBusy || busy}
      nextEnabled={seats.next !== undefined}
      nextLabel={scope.strings.translate('nextSeat')}
      onBack={act('back')}
      onNext={act('next')}
      onPrevious={act('previous')}
      onRecentre={act('recentre')}
      onReset={act('reset')}
      navigationEnabled={navigationAvailable}
      navigationLabel={navigationAvailable ? scope.strings.translate(moving ? 'moveVenue' : 'rotateVenue') : undefined}
      onNavigation={navigationAvailable ? changeNavigation : undefined}
      previousEnabled={seats.previous !== undefined}
      previousLabel={scope.strings.translate('previousSeat')}
      recentreEnabled={seats.target !== undefined}
      recentreLabel={scope.strings.translate('recentre')}
      resetLabel={scope.strings.translate('openVenue360')}
      slots={slots}
      style={props.style}
      theme={theme}
      topInset={topInset}
    />
  </Animated.View>;
}

/** Alias for the scoped venue-3D chrome. */
export const SeatLayerVenue3D = SeatLayerVenue3DChrome;

const styles = {
  animatedRoot: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
  backRail: { gap: 8, position: 'absolute', start: 10 } as ViewStyle,
  button: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 8 } as ViewStyle,
  buttonText: { fontSize: 13, fontWeight: '800' } as TextStyle,
  caption: { borderRadius: seatLayerPickerTokens.radius.chip, borderWidth: 1, marginBottom: 8, maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 7 } as ViewStyle,
  captionText: { fontSize: 12, fontWeight: '700' } as TextStyle,
  chevron: { borderLeftWidth: 2, borderTopWidth: 2, height: 9, width: 9 } as ViewStyle,
  controls: { alignItems: 'center', gap: 8, justifyContent: 'center' } as ViewStyle,
  deck: { alignItems: 'center', left: 0, position: 'absolute', right: 0 } as ViewStyle,
  focusCorner: { borderLeftWidth: 2, borderTopWidth: 2, height: 6, position: 'absolute', width: 6 } as ViewStyle,
  focusIcon: { height: 16, width: 16 } as ViewStyle,
  labelButton: { paddingHorizontal: 12 } as ViewStyle,
  orbitArrowLeft: { borderBottomColor: 'transparent', borderBottomWidth: 3, borderRightWidth: 4, borderTopColor: 'transparent', borderTopWidth: 3, bottom: 0, height: 0, left: 0, position: 'absolute', width: 0 } as ViewStyle,
  orbitArrowRight: { borderBottomColor: 'transparent', borderBottomWidth: 3, borderLeftWidth: 4, borderTopColor: 'transparent', borderTopWidth: 3, height: 0, position: 'absolute', right: 0, top: 0, width: 0 } as ViewStyle,
  orbitBottomArc: { borderBottomWidth: 2, borderRadius: 9, bottom: 1, height: 10, left: 1, position: 'absolute', width: 16 } as ViewStyle,
  orbitIcon: { height: 16, width: 18 } as ViewStyle,
  orbitTopArc: { borderRadius: 9, borderTopWidth: 2, height: 10, left: 1, position: 'absolute', top: 1, width: 16 } as ViewStyle,
  panArrowDown: { borderLeftColor: 'transparent', borderLeftWidth: 3, borderRightColor: 'transparent', borderRightWidth: 3, borderTopWidth: 4, bottom: 0, height: 0, left: 6, position: 'absolute', width: 0 } as ViewStyle,
  panArrowLeft: { borderBottomColor: 'transparent', borderBottomWidth: 3, borderRightWidth: 4, borderTopColor: 'transparent', borderTopWidth: 3, height: 0, left: 0, position: 'absolute', top: 6, width: 0 } as ViewStyle,
  panArrowRight: { borderBottomColor: 'transparent', borderBottomWidth: 3, borderLeftWidth: 4, borderTopColor: 'transparent', borderTopWidth: 3, height: 0, position: 'absolute', right: 0, top: 6, width: 0 } as ViewStyle,
  panArrowUp: { borderBottomWidth: 4, borderLeftColor: 'transparent', borderLeftWidth: 3, borderRightColor: 'transparent', borderRightWidth: 3, height: 0, left: 6, position: 'absolute', top: 0, width: 0 } as ViewStyle,
  panHorizontal: { height: 2, left: 3, position: 'absolute', top: 8, width: 12 } as ViewStyle,
  panIcon: { height: 18, width: 18 } as ViewStyle,
  panVertical: { height: 12, left: 8, position: 'absolute', top: 3, width: 2 } as ViewStyle,
  root: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
  rootSafety: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
} as const;
