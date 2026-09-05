import React from 'react';
import {
  AccessibilityInfo, Animated, Easing, I18nManager, Pressable, StyleSheet, Text, View,
  findNodeHandle, useWindowDimensions, type StyleProp, type ViewStyle,
} from 'react-native';

import type { SelectedSeat } from '../types';
import { chartSeatLayerPickerColor } from './chartColor';
import { blendSeatLayerPickerColor } from './colors';
import {
  ConfirmAnswerMark, ConfirmCategoryBand, ConfirmCubeGlyph, ConfirmIdentityGrid, ConfirmNotices,
  ConfirmPhotoStrip, useSeatLayerPickerSeatPhoto, type ConfirmCardTheme,
} from './confirmCardParts';
import {
  seatLayerPickerConfirmCancelShare, seatLayerPickerConfirmCardSentence,
  seatLayerPickerConfirmIdentityCells,
} from './confirmCardIdentity';
import {
  seatLayerPickerConfirmAcceptsPress, seatLayerPickerConfirmMotionInitial,
  seatLayerPickerConfirmMotionPlan, seatLayerPickerConfirmMotionReduce,
} from './confirmCardMotion';
import { SeatLayerPickerSeatTierSelector } from './SeatLayerPickerDecisionPrompts';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import {
  SeatLayerPickerConfirmationState, seatLayerPickerConfirmationPrice,
  type SeatLayerPickerConfirmationActionEvent, type SeatLayerPickerConfirmationActions,
  type SeatLayerPickerConfirmationModel,
} from './seatConfirmationState';
import {
  seatLayerPickerConfirmCardModel, useSeatLayerPickerConfirmCardRemoval,
  useSeatLayerPickerSeatEvidence, type SeatLayerPickerConfirmCardModel,
} from './seatConfirmationRemoval';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';

type ConfirmSlots = Pick<SeatLayerPickerStyles,
  'confirmCardContainer' | 'confirmCardIdentityText' | 'confirmCardPrimaryButton' |
  'confirmCardPrimaryButtonText' | 'confirmCardSecondaryButton' | 'confirmCardSecondaryButtonText'>;

/** Horizontal only: this fixed sheet does not claim vertical safe-area space. */
export interface SeatLayerConfirmCardInsets { readonly right?: number; readonly left?: number; }
export type SeatLayerConfirmCardActionEvent = SeatLayerPickerConfirmationActionEvent;
export interface SeatLayerConfirmCardProps extends SeatLayerPickerConfirmationActions {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: ConfirmSlots;
  readonly safeAreaInsets?: SeatLayerConfirmCardInsets;
  /** Internal composition hook: records where a confirmed card should fly from. */
  readonly onConfirmOrigin?: (origin: Readonly<{ x: number; y: number }>) => void;
  /**
   * The band the card covers, measured from the map's foot (§3.8.2). The
   * layout folds it into `picker.frameSeat` so the map pans out from under
   * the sheet; 0 once the card has gone.
   */
  readonly onBandChange?: (band: number) => void;
}

/**
 * §3.8 — the picker's one native moment, as a fixed bottom sheet.
 *
 * It has ONE home, `confirmCardRestInset` above the foot of whatever the
 * chrome has left of the map, on every tap and for every seat. Keeping the
 * seat and its card together is the map's job (§3.8.2), never the card's.
 */
export function SeatLayerConfirmCard(props: SeatLayerConfirmCardProps): React.ReactElement | null {
  const { width } = useWindowDimensions();
  const removal = useSeatLayerPickerConfirmCardRemoval(props);
  return <>
    <SeatLayerPickerConfirmationState {...props}>
      {(model) => <Card model={seatLayerPickerConfirmCardModel(model)} props={props} viewportWidth={width} />}
    </SeatLayerPickerConfirmationState>
    {removal === undefined ? null : <Card model={removal} props={props} viewportWidth={width} />}
  </>;
}

function Card({ model, props, viewportWidth }: Readonly<{
  model: SeatLayerPickerConfirmCardModel;
  props: SeatLayerConfirmCardProps;
  viewportWidth: number;
}>): React.ReactElement {
  const { scope, seat, mode, candidate, tierId, setTierId, busy, inspection, run } = model;
  const reducedMotion = useSeatLayerPickerReducedMotion();
  const plan = React.useMemo(() => seatLayerPickerConfirmMotionPlan(reducedMotion), [reducedMotion]);
  const [motion, setMotion] = React.useState(() => seatLayerPickerConfirmMotionInitial(plan));
  const motionRef = React.useRef(motion);
  motionRef.current = motion;
  const dispatch = React.useCallback((kind: Parameters<typeof seatLayerPickerConfirmMotionReduce>[1]['kind']) => {
    setMotion((current) => seatLayerPickerConfirmMotionReduce(current, { kind } as never, plan));
  }, [plan]);

  const theme = cardTheme(scope);
  const identityCells = seatLayerPickerConfirmIdentityCells(seat, sectionId(scope, seat), scope.strings.translate);
  const selectedPrice = seatLayerPickerConfirmationPrice(seat, tierId);
  const price = selectedPrice
    ? scope.formatMoney(selectedPrice.amount, selectedPrice.currency ?? scope.snapshot?.currency ?? 'USD')
    : undefined;
  const category = scope.snapshot?.categories.find((item) => item.key === seat.categoryKey);
  const categoryColor = chartSeatLayerPickerColor(category?.color, theme.accent);
  const categoryName = category?.label?.trim() ?? '';
  const sentence = seatLayerPickerConfirmCardSentence(seat, sectionId(scope, seat), scope.strings.translate, [categoryName, price]);

  const evidence = useSeatLayerPickerSeatEvidence(scope, seat);
  const photo = useSeatLayerPickerSeatPhoto(evidence.assetLoader, evidence.photoReference);
  const hasPhoto = evidence.photoReference !== undefined && photo.state !== 'missing';
  const seatViewPill = inspection.find((action) => action.kind === 'seatView');
  const venue3D = inspection.find((action) => action.kind === 'venue3d');
  const sightline = hasPhoto && evidence.sightlineMetres !== undefined
    ? scope.strings.translate('sightline', { values: { m: String(evidence.sightlineMetres) } })
    : undefined;

  const safe = insets(props.safeAreaInsets);
  const maxWidth = Math.max(0, Math.min(
    seatLayerPickerTokens.size.confirmCardMaxWidth,
    viewportWidth - seatLayerPickerTokens.size.confirmCardGutter * 2 - safe.left - safe.right,
  ));
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const rtl = I18nManager.isRTL;
  const cardRef = React.useRef<View>(null);
  const primaryRef = React.useRef<View>(null);

  // The runtime paints the candidate the card is asking about (§3.8.1a). Both
  // questions focus: an add card and a remove card each stand over one seat.
  React.useEffect(() => {
    const controller = scope.controller;
    if (!controller.supportsSelectionFocus) return undefined;
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void controller.setSelectionFocus(seat.id).catch(() => undefined);
    });
    return () => {
      live = false;
      void controller.setSelectionFocus(null).catch(() => undefined);
    };
  }, [scope.controller, seat.id]);

  // The focus lands on the answer the card exists to collect, not on Cancel.
  React.useEffect(() => {
    try {
      const handle = findNodeHandle(primaryRef.current);
      if (typeof handle === 'number') AccessibilityInfo.setAccessibilityFocus(handle);
    } catch { /* Optional platform surface. */ }
  }, []);

  const enter = React.useRef(new Animated.Value(plan.enterMs > 0 ? 0 : 1)).current;
  React.useEffect(() => {
    if (plan.enterMs === 0) { enter.setValue(1); dispatch('entered'); return undefined; }
    const animation = Animated.timing(enter, {
      duration: plan.enterMs, easing: bezier(seatLayerPickerTokens.motion.curve.spring.cubicBezier),
      toValue: 1, useNativeDriver: true,
    });
    animation.start(() => dispatch('entered'));
    return () => animation.stop();
  }, [dispatch, enter, plan.enterMs]);

  const invite = React.useRef(new Animated.Value(0)).current;
  const breathe = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!motion.inviting || plan.inviteDelayMs === undefined) return undefined;
    const sweep = Animated.sequence([
      Animated.delay(plan.inviteDelayMs),
      Animated.timing(invite, {
        duration: plan.inviteSweepMs ?? 0, easing: bezier(seatLayerPickerTokens.motion.curve.easeEnter.cubicBezier),
        toValue: 1, useNativeDriver: true,
      }),
    ]);
    const halo = Animated.sequence([
      Animated.delay(plan.inviteBreatheDelayMs ?? 0),
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { duration: (plan.inviteBreatheMs ?? 0) / 2, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
        Animated.timing(breathe, { duration: (plan.inviteBreatheMs ?? 0) / 2, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
      ])),
    ]);
    sweep.start();
    halo.start();
    return () => { sweep.stop(); halo.stop(); invite.setValue(0); breathe.setValue(0); };
  }, [breathe, invite, motion.inviting, plan]);

  const sweep = React.useRef(new Animated.Value(0)).current;
  const answer = () => {
    if (!seatLayerPickerConfirmAcceptsPress(motionRef.current) || busy) return;
    dispatch('press');
    const commit = () => {
      const card = cardRef.current;
      if (card === null || props.onConfirmOrigin === undefined || !plan.flight) { run('confirm'); return; }
      card.measureInWindow((x, y, width, height) => {
        if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
          props.onConfirmOrigin?.(Object.freeze({ x: x + width / 2, y: y + height / 2 }));
        }
        run('confirm');
      });
    };
    // The cart, the totals and every snapshot-derived surface update on the
    // press tick; only the DEPARTURE waits for the sweep.
    commit();
    if (plan.pressSweepMs === 0) return;
    Animated.timing(sweep, {
      duration: plan.pressSweepMs, easing: bezier(seatLayerPickerTokens.motion.curve.easeEnter.cubicBezier),
      toValue: 1, useNativeDriver: false,
    }).start(() => dispatch('swept'));
  };

  // §4.10 — the card's action row is `base x the card's clamped scale`.
  const actionHeight = seatLayerPickerScaledExtent(
    seatLayerPickerTokens.size.confirmActionHeight,
    seatLayerPickerTypeScaleClamp('card'),
  );
  const remove = mode === 'remove';
  const primaryColor = remove ? theme.error : theme.accent;
  const primaryLabel = motion.answered && !remove
    ? scope.strings.translate('added')
    : remove
      ? scope.strings.translate('removeSeat')
      : scope.strings.translate(seat.objectType === 'seat' || seat.objectType === undefined ? 'addSeat' : 'select');
  const cancelLabel = scope.strings.translate('cancel');
  const squareOnRow = !hasPhoto && venue3D !== undefined;

  return <Animated.View
    accessibilityViewIsModal
    accessibilityLabel={sentence}
    accessibilityActions={[
      Object.freeze({ name: 'activate', label: primaryLabel }),
      Object.freeze({ name: 'cancel', label: cancelLabel }),
    ]}
    onAccessibilityAction={(event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'activate') answer();
      if (event.nativeEvent.actionName === 'cancel') run('cancel');
    }}
    onStartShouldSetResponderCapture={() => { dispatch('engaged'); return false; }}
    ref={cardRef as never}
    onLayout={(event: { nativeEvent: { layout: { height: number } } }) => props.onBandChange?.(
      event.nativeEvent.layout.height + seatLayerPickerTokens.size.confirmCardRestInset,
    )}
    style={[nativeStyles.hit, {
      marginEnd: safe.right, marginStart: safe.left, maxWidth,
      opacity: enter,
      transform: [
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
        { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      ],
    }]}
    testID="seatLayerConfirmCard"
  >
    <View style={[nativeStyles.card, {
      backgroundColor: theme.surface,
      borderColor: blendSeatLayerPickerColor(theme.text, theme.divider, 0.14, theme.surface),
      borderRadius: seatLayerPickerTokens.radius.confirmCard,
      shadowColor: theme.text,
    }, styles.confirmCardContainer, sanitizeSeatLayerPickerStyle(props.style), { maxWidth, width: '100%' }]}>
      <ConfirmIdentityGrid cells={identityCells} theme={theme} />
      <ConfirmCategoryBand color={categoryColor} name={categoryName} price={price} theme={theme} />
      {hasPhoto ? <ConfirmPhotoStrip
        disabled={busy}
        photo={photo}
        pills={[
          ...(seatViewPill ? [{ kind: 'seatView', label: seatViewPill.label, onPress: () => run('seatView') }] : []),
          ...(venue3D ? [{
            kind: 'venue3d', label: venue3D.label,
            accessibilityLabel: scope.strings.translate('seeItIn3D'),
            onPress: () => run('venue3d'),
          }] : []),
        ]}
        sightline={sightline}
        theme={theme}
      /> : null}
      {candidate ? <SeatLayerPickerSeatTierSelector candidate={candidate} value={tierId} onValueChange={setTierId} slots={props.slots} /> : null}
      <ConfirmNotices
        limited={limitedNotice(seat, scope)}
        premium={seat.commercial?.premium === true ? scope.strings.translate('premiumSeat') : undefined}
        theme={theme}
      />
      <View style={[nativeStyles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {squareOnRow ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate('seeItIn3D')}
          disabled={busy}
          onPress={() => run('venue3d')}
          style={[nativeStyles.square, {
            backgroundColor: blendSeatLayerPickerColor(theme.accent, theme.surface, 0.12, theme.surface),
            borderColor: theme.divider,
          }]}
          testID="seatLayerConfirm3dSquare"
        ><ConfirmCubeGlyph color={theme.text} fontFamily={theme.fontFamily} label={scope.strings.translate('venue3D')} /></Pressable> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => run('cancel')}
          style={[nativeStyles.action, { flexBasis: `${seatLayerPickerConfirmCancelShare * 100}%`, flexGrow: 0, flexShrink: 0 }]}
          testID="seatLayerConfirmCancel"
        ><View style={[nativeStyles.actionPaint, { height: actionHeight }, {
          backgroundColor: theme.surface,
          borderColor: theme.divider,
          borderWidth: StyleSheet.hairlineWidth,
        }, styles.confirmCardSecondaryButton]}>
          <Text
            maxFontSizeMultiplier={seatLayerPickerTokens.type.scaleClamp.card}
            numberOfLines={1}
            style={[nativeStyles.actionText, { color: theme.mutedText, fontFamily: theme.fontFamily }, styles.confirmCardSecondaryButtonText]}
          >{cancelLabel}</Text>
        </View></Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onFocus={() => dispatch('engaged')}
          onPress={answer}
          ref={primaryRef as never}
          style={nativeStyles.primary}
          testID="seatLayerConfirmPrimary"
        ><View style={[nativeStyles.actionPaint, { backgroundColor: primaryColor, height: actionHeight, overflow: 'hidden' }, styles.confirmCardPrimaryButton]}>
          <Animated.View
            pointerEvents="none"
            style={[nativeStyles.fill, {
              backgroundColor: blendSeatLayerPickerColor(theme.onAccent, primaryColor, 0.16, primaryColor),
              width: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]}
          />
          <Animated.View pointerEvents="none" style={[nativeStyles.halo, {
            borderColor: primaryColor,
            opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
            transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }],
          }]} />
          <Animated.View pointerEvents="none" style={[nativeStyles.inviteBand, {
            backgroundColor: blendSeatLayerPickerColor(theme.onAccent, primaryColor, 0.22, primaryColor),
            transform: [{ translateX: invite.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] }) }],
          }]} />
          {/* The mark stands in the button from the moment it is offered: it is
              the glyph slot of the answer, tick to accept and cross to release,
              not a confirmation drawn after the fact. */}
          <ConfirmAnswerMark color={theme.onAccent} mode={remove ? 'remove' : 'add'} />
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={seatLayerPickerTokens.type.scaleClamp.card}
            minimumFontScale={0.7}
            numberOfLines={1}
            style={[nativeStyles.actionText, { color: theme.onAccent, fontFamily: theme.fontFamily }, styles.confirmCardPrimaryButtonText]}
          >{primaryLabel}</Text>
        </View></Pressable>
      </View>
    </View>
  </Animated.View>;
}

function bezier(curve: readonly number[]): ReturnType<typeof Easing.bezier> {
  return Easing.bezier(curve[0] ?? 0.2, curve[1] ?? 0.8, curve[2] ?? 0.2, curve[3] ?? 1);
}

function cardTheme(scope: SeatLayerPickerConfirmationModel['scope']): ConfirmCardTheme {
  const colors = scope.resolvedTheme.colors;
  return Object.freeze({
    accent: colors.accent,
    divider: colors.divider,
    error: colors.error ?? colors.accent,
    fontFamily: scope.resolvedTheme.fontFamily,
    mutedText: colors.mutedText ?? colors.text,
    onAccent: colors.onAccent,
    surface: colors.surface,
    text: colors.text,
    warning: colors.warning ?? colors.text,
  });
}

function limitedNotice(seat: SelectedSeat, scope: SeatLayerPickerConfirmationModel['scope']): string | undefined {
  // Restricted wins over obstructed.
  if (seat.commercial?.restrictedView === true) return scope.strings.translate('restrictedView');
  if (seat.commercial?.obstructedView === true) return scope.strings.translate('obstructedView');
  return undefined;
}

function sectionId(
  scope: { snapshot?: { sections: readonly { id: string; label: string; displayLabel?: string }[] } },
  seat: { sectionLabel?: string },
): string | undefined {
  const label = seat.sectionLabel?.trim();
  if (!label) return undefined;
  const normalized = label.toLocaleLowerCase();
  return scope.snapshot?.sections.find((section) =>
    section.label.toLocaleLowerCase() === normalized ||
    section.displayLabel?.toLocaleLowerCase() === normalized)?.id;
}

function insets(value: unknown): Required<SeatLayerConfirmCardInsets> {
  const read = (key: 'left' | 'right'): number => {
    try {
      const descriptor = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.getOwnPropertyDescriptor(value, key) : undefined;
      const number = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      return typeof number === 'number' && Number.isFinite(number) ? Math.max(0, number) : 0;
    } catch { return 0; }
  };
  return { left: read('left'), right: read('right') };
}

const gutter = seatLayerPickerTokens.size.confirmCardGutter;
const nativeStyles = StyleSheet.create({
  hit: { alignSelf: 'center', width: '100%' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    elevation: seatLayerPickerTokens.elevation.confirmCard,
    overflow: 'hidden',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  actions: { gap: 8, padding: gutter },
  action: { justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  primary: { flexGrow: 1, flexShrink: 1, justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  actionPaint: {
    alignItems: 'center',
    borderRadius: seatLayerPickerTokens.radius.button,
    flexDirection: 'row',
    gap: 6,
    height: seatLayerPickerTokens.size.confirmActionHeight,
    justifyContent: 'center',
    paddingHorizontal: 8,
    position: 'relative',
    width: '100%',
  },
  square: {
    alignItems: 'center',
    borderRadius: seatLayerPickerTokens.radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    height: seatLayerPickerTokens.size.minimumHitTarget,
    justifyContent: 'center',
    width: seatLayerPickerTokens.size.minimumHitTarget,
  },
  fill: { bottom: 0, left: 0, position: 'absolute', top: 0 },
  halo: { borderRadius: seatLayerPickerTokens.radius.button, borderWidth: 2, bottom: -2, left: -2, position: 'absolute', right: -2, top: -2 },
  inviteBand: { bottom: 0, position: 'absolute', top: 0, width: 60 },
  actionText: { fontSize: seatLayerPickerTokens.type.confirmAction.size, fontWeight: '800' },
});
