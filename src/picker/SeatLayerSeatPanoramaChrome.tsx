import React, { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  resolveSeatLayerPickerImmersiveTheme,
  seatLayerImmersiveDuration,
  seatLayerImmersiveInsetPlan,
  seatLayerPanoramaHasContent,
  seatLayerPanoramaIsOwned,
  projectSeatLayerPanoramaWording,
} from './immersiveChrome';
import { seatLayerPickerColorAlpha } from './colors';
import { seatLayerPickerImmersiveCaptionGlass } from './immersiveGlass';
import { useSeatLayerPickerInsetLease } from './insetLeaseLifecycle';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { seatLayerPickerTokens } from './tokens.g';
import type { SeatLayerSeatView } from './models';
import { seatLayerPickerBold } from './boldText';

const captionGlass = seatLayerPickerImmersiveCaptionGlass;
const size = seatLayerPickerTokens.size;

type PanoramaSlots = Pick<
  SeatLayerPickerStyles,
  'seatViewChromeContainer' | 'seatViewChromeButton' | 'seatViewChromeButtonText'
>;

export interface SeatLayerSeatPanoramaChromeProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: PanoramaSlots;
  readonly topInset?: number;
  readonly bottomInset?: number;
  /** Prints the runtime-supplied drag wording without taking its gestures. */
  readonly showDragHint?: boolean;
  /** Opt in only when this standalone component owns the immersive band. */
  readonly reserveInset?: boolean;
}

export interface SeatLayerSeatPanoramaChromeViewProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: PanoramaSlots;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly topInset: number;
  readonly bottomInset: number;
  readonly view: SeatLayerSeatView;
  readonly showDragHint?: boolean;
}

function safeInset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 10;
}

function ownsPanorama(scope: ReturnType<typeof useSeatLayerPickerScope>, view: SeatLayerSeatView | undefined): boolean {
  return seatLayerPanoramaIsOwned({
    hasContent: seatLayerPanoramaHasContent(view),
    hasSnapshotFeature: scope.snapshot?.capabilities.includes('seatView') === true,
    nativeContract: supportsSeatLayerPickerSurface(scope.controller, ['native-chrome-contract-v1'], []),
    nativeSeatViewCapability: scope.controller.mapController.isReady &&
      scope.controller.mapController.supportsPickerCapability('native-seat-view-chrome-v1'),
    seatViewEvent: scope.controller.mapController.isReady &&
      scope.controller.mapController.supportsPickerEvent('seatView.changed'),
  });
}

/**
 * Text-only panorama overlay. The web runtime owns the image, gesture surface,
 * close control, and—by default—the drag hint; this view takes no interaction.
 */
export function SeatLayerSeatPanoramaChromeView(props: SeatLayerSeatPanoramaChromeViewProps): React.ReactElement {
  const rtl = I18nManager.isRTL;
  const slots = resolveSeatLayerPickerStyles({}, props.slots);
  const wording = projectSeatLayerPanoramaWording(props.view);
  return <View
    pointerEvents="none"
    style={[
      styles.root,
      styles.rootSafety,
    ]}
  >
    <View
      accessible={wording.summary !== undefined}
      accessibilityLabel={wording.summary}
      pointerEvents="none"
      style={[styles.content, { top: props.topInset, bottom: props.bottomInset }]}
    >
      <View pointerEvents="none" style={[
        styles.captionStrip,
        // §3.15: the caption strip wears the immersive caption glass, because
        // it floats over the panorama exactly as the 3D deck floats over the scene.
        { backgroundColor: captionGlass.ground, borderColor: captionGlass.border, flexDirection: rtl ? 'row-reverse' : 'row' },
        slots?.seatViewChromeContainer,
        sanitizeSeatLayerPickerStyle(props.style),
      ]}>
        <View pointerEvents="none" style={styles.copy}>
          {wording.title ? <Text numberOfLines={2} style={[styles.title, { color: captionGlass.ink, fontFamily: props.theme.fontFamily, textAlign: rtl ? 'right' : 'left' }]}>{wording.title}</Text> : null}
          {wording.caption ? <Text numberOfLines={2} style={[styles.caption, { color: captionGlass.ink, fontFamily: props.theme.fontFamily, textAlign: rtl ? 'right' : 'left' }]}>{wording.caption}</Text> : null}
        </View>
        {wording.badge ? <View pointerEvents="none" style={[
          styles.badge,
          props.view.real
            ? { backgroundColor: props.theme.colors.accent }
            : { backgroundColor: seatLayerPickerColorAlpha(captionGlass.ink, 0.14) },
          slots?.seatViewChromeButton,
        ]}>
          <Text numberOfLines={1} style={[
            styles.badgeText,
            { color: props.view.real ? props.theme.colors.onAccent : captionGlass.ink, fontFamily: props.theme.fontFamily, textAlign: rtl ? 'right' : 'left' },
            slots?.seatViewChromeButtonText,
          ]}>{wording.badge}</Text>
        </View> : null}
      </View>
      {props.showDragHint === true && wording.dragHint ? <View pointerEvents="none" style={[styles.hintChip, { backgroundColor: captionGlass.ground, borderColor: captionGlass.border, borderWidth: 1 }]}>
        <Text numberOfLines={1} style={[styles.hint, { color: captionGlass.ink, fontFamily: props.theme.fontFamily, textAlign: rtl ? 'right' : 'left' }]}>{wording.dragHint}</Text>
      </View> : null}
    </View>
  </View>;
}

/** Scoped passive panorama wording. It never requests, loads, or draws media. */
export function SeatLayerSeatPanoramaChrome(props: SeatLayerSeatPanoramaChromeProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const view = useSyncExternalStore(
    scope.controller.subscribeSeatView,
    scope.controller.getSeatView,
    scope.controller.getSeatView,
  );
  const visible = ownsPanorama(scope, view);
  const topInset = safeInset(props.topInset);
  const bottomInset = safeInset(props.bottomInset);
  const theme = useMemo(() => resolveSeatLayerPickerImmersiveTheme(scope.resolvedTheme), [scope.resolvedTheme]);
  const slots = useMemo(() => resolveSeatLayerPickerStyles(scope.styles, props.slots), [props.slots, scope.styles]);
  const lease = useMemo(
    () => props.reserveInset && visible ? scope.claimViewportInsetBand('immersive') : undefined,
    [props.reserveInset, scope.claimViewportInsetBand, scope.sessionId, visible],
  );
  useSeatLayerPickerInsetLease(lease, seatLayerImmersiveInsetPlan(visible, topInset, bottomInset));
  const opacity = useRef(new Animated.Value(0)).current;
  useLayoutEffect(() => {
    const animation = Animated.timing(opacity, {
      duration: seatLayerImmersiveDuration(reducedMotion),
      easing: Easing.bezier(...theme.motion.curve.easeEnter.cubicBezier),
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion, theme.motion.curve.easeEnter.cubicBezier, visible]);
  if (!visible || !view) return null;
  return <Animated.View pointerEvents="none" style={[styles.animatedRoot, { opacity }]}>
    <SeatLayerSeatPanoramaChromeView
      bottomInset={bottomInset}
      slots={slots}
      style={props.style}
      theme={theme}
      topInset={topInset}
      view={view}
      showDragHint={props.showDragHint}
    />
  </Animated.View>;
}

/** Alias for the passive seat-view wording chrome. */
export const SeatLayerSeatViewChrome = SeatLayerSeatPanoramaChrome;

const styles = {
  animatedRoot: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
  badge: {
    alignSelf: 'flex-start',
    borderRadius: seatLayerPickerTokens.radius.chip,
    maxWidth: 132,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  } as ViewStyle,
  badgeText: { fontSize: 12, fontWeight: seatLayerPickerBold(800), letterSpacing: 0.2 } as TextStyle,
  caption: { fontSize: size.immersiveCaptionFontSize, fontWeight: seatLayerPickerBold(600), lineHeight: 17, marginTop: 3 } as TextStyle,
  captionStrip: { alignItems: 'flex-start', alignSelf: 'stretch', borderRadius: seatLayerPickerTokens.radius.chip, borderWidth: 1, gap: 10, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 10 } as ViewStyle,
  content: { alignItems: 'stretch', bottom: 0, justifyContent: 'flex-end', left: 18, position: 'absolute', right: 18, top: 0 } as ViewStyle,
  copy: { flex: 1, minWidth: 0 } as ViewStyle,
  hint: { fontSize: size.immersiveCaptionFontSize, fontWeight: seatLayerPickerBold(600) } as TextStyle,
  hintChip: { alignSelf: 'center', borderRadius: seatLayerPickerTokens.radius.chip, marginTop: 8, maxWidth: '92%', paddingHorizontal: 10, paddingVertical: 5 } as ViewStyle,
  root: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
  rootSafety: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as ViewStyle,
  title: { fontSize: size.immersiveCaptionFontSize + 2, fontWeight: seatLayerPickerBold(800), lineHeight: 18 } as TextStyle,
} as const;
