import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { seatLayerPickerConfirmIdentity } from './confirmCardIdentity';
import { chartSeatLayerPickerColor } from './chartColor';
import { blendSeatLayerPickerColor } from './colors';
import { SeatLayerPickerSeatTierSelector } from './SeatLayerPickerDecisionPrompts';
import {
  SeatLayerPickerConfirmationState,
  type SeatLayerPickerConfirmationActionEvent,
  type SeatLayerPickerConfirmationActions,
  type SeatLayerPickerConfirmationModel,
} from './seatConfirmationState';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerTokens } from './tokens.g';

type ConfirmSlots = Pick<SeatLayerPickerStyles,
  'confirmCardContainer' | 'confirmCardIdentityText' | 'confirmCardPrimaryButton' |
  'confirmCardPrimaryButtonText' | 'confirmCardSecondaryButton' | 'confirmCardSecondaryButtonText'>;

/** Horizontal only: this inline card does not claim vertical safe-area space. */
export interface SeatLayerConfirmCardInsets { readonly right?: number; readonly left?: number; }
export type SeatLayerConfirmCardActionEvent = SeatLayerPickerConfirmationActionEvent;
export interface SeatLayerConfirmCardProps extends SeatLayerPickerConfirmationActions {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: ConfirmSlots;
  readonly safeAreaInsets?: SeatLayerConfirmCardInsets;
}

/** Compact confirmation presentation over the shared pending-seat action workflow. */
export function SeatLayerConfirmCard(props: SeatLayerConfirmCardProps): React.ReactElement | null {
  const { width } = useWindowDimensions();
  return <SeatLayerPickerConfirmationState {...props}>{(model) => <Card model={model} props={props} viewportWidth={width} />}</SeatLayerPickerConfirmationState>;
}

function Card({ model, props, viewportWidth }: Readonly<{ model: SeatLayerPickerConfirmationModel; props: SeatLayerConfirmCardProps; viewportWidth: number }>): React.ReactElement {
  const { scope, seat, candidate, tierId, setTierId, busy, inspection, run } = model;
  const identity = seatLayerPickerConfirmIdentity(seat, sectionId(scope, seat), scope.strings.translate);
  const price = typeof seat.price === 'number' && Number.isFinite(seat.price) ? scope.formatMoney(seat.price, seat.currency ?? scope.snapshot!.currency) : undefined;
  const category = scope.snapshot?.categories.find((item) => item.key === seat.categoryKey);
  const seatColor = chartSeatLayerPickerColor(category?.color, scope.resolvedTheme.colors.accent);
  const stripStart = blendSeatLayerPickerColor(scope.resolvedTheme.colors.accent, scope.resolvedTheme.colors.surface, .22, scope.resolvedTheme.colors.surface);
  const stripEnd = blendSeatLayerPickerColor(scope.resolvedTheme.colors.text, scope.resolvedTheme.colors.surface, .12, scope.resolvedTheme.colors.surface);
  const safe = insets(props.safeAreaInsets);
  const maxWidth = Math.max(0, Math.min(seatLayerPickerTokens.size.confirmCardMaxWidth, viewportWidth - seatLayerPickerTokens.size.confirmCardGutter * 2 - safe.left - safe.right));
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const rtl = I18nManager.isRTL;
  return <View style={[nativeStyles.hit, { maxWidth, marginStart: safe.left, marginEnd: safe.right }]}><View style={[nativeStyles.card, {
    backgroundColor: scope.resolvedTheme.colors.surface,
    borderColor: scope.resolvedTheme.colors.divider,
    borderRadius: seatLayerPickerTokens.radius.card,
    shadowColor: scope.resolvedTheme.colors.text,
  }, styles.confirmCardContainer, sanitizeSeatLayerPickerStyle(props.style), { width: '100%', maxWidth }]}>
    <View style={[nativeStyles.identity, { flexDirection: rtl ? 'row-reverse' : 'row' }]}><View style={[nativeStyles.dot, { backgroundColor: seatColor }]} /><Text accessibilityRole="header" accessibilityLiveRegion="polite" numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.identityText, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.confirmCardIdentityText]}>{identity}</Text>{price ? <Text numberOfLines={1} ellipsizeMode="clip" style={[nativeStyles.price, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{price}</Text> : null}</View>
    {inspection.length ? <View style={nativeStyles.strip}>
      <View pointerEvents="none" style={nativeStyles.stripGround}>
        {Array.from({ length: 16 }, (_, index) => <View key={index} style={{ flex: 1, backgroundColor: blendSeatLayerPickerColor(
          stripEnd,
          stripStart,
          index / 15,
          scope.resolvedTheme.colors.surface,
        ) }} />)}
      </View>
      <View style={[nativeStyles.stripActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {inspection.map((action) => <InspectionButton key={action.kind} kind={action.kind} label={action.label} busy={busy} onPress={() => run(action.kind)} scope={scope} styles={styles} />)}
      </View>
    </View> : <View style={nativeStyles.noStripSpace} />}
    {inspection.length ? <View style={nativeStyles.stripSpace} /> : null}
    {candidate ? <SeatLayerPickerSeatTierSelector candidate={candidate} value={tierId} onValueChange={setTierId} slots={props.slots} /> : null}
    <View style={[nativeStyles.actions, { borderTopColor: scope.resolvedTheme.colors.divider, flexDirection: rtl ? 'row-reverse' : 'row' }]}><CardActionButton label={scope.strings.translate('cancel')} busy={busy} onPress={() => run('cancel')} secondary scope={scope} styles={styles} /><CardActionButton label={scope.strings.translate('select')} busy={busy} onPress={() => run('confirm')} scope={scope} styles={styles} /></View>
  </View></View>;
}

function InspectionButton({ kind, label, busy, onPress, scope, styles }: Readonly<{
  kind: 'seatView' | 'venue3d';
  label: string;
  busy: boolean;
  onPress: () => void;
  scope: SeatLayerPickerConfirmationModel['scope'];
  styles: ReturnType<typeof resolveSeatLayerPickerStyles>;
}>): React.ReactElement {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={nativeStyles.inspectionHit}>
    <View style={[nativeStyles.inspectionPaint, {
      backgroundColor: blendSeatLayerPickerColor(scope.resolvedTheme.colors.surface, scope.resolvedTheme.colors.surface, .92, scope.resolvedTheme.colors.surface),
      borderRadius: seatLayerPickerTokens.radius.button,
      opacity: busy ? .5 : 1,
    }, styles.confirmCardSecondaryButton]}>
      {kind === 'seatView' ? <EyeIcon color={scope.resolvedTheme.colors.text} /> : <CubeIcon color={scope.resolvedTheme.colors.text} />}
      <Text numberOfLines={1} style={[nativeStyles.inspectionText, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.confirmCardSecondaryButtonText]}>{label}</Text>
    </View>
  </Pressable>;
}

function CardActionButton({ label, busy, onPress, secondary, scope, styles }: Readonly<{ label: string; busy: boolean; onPress: () => void; secondary?: boolean; scope: SeatLayerPickerConfirmationModel['scope']; styles: ReturnType<typeof resolveSeatLayerPickerStyles> }>): React.ReactElement {
  const button = secondary ? styles.confirmCardSecondaryButton : styles.confirmCardPrimaryButton;
  const text = secondary ? styles.confirmCardSecondaryButtonText : styles.confirmCardPrimaryButtonText;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={nativeStyles.buttonHit}><View style={[nativeStyles.buttonPaint, {
    backgroundColor: secondary
      ? blendSeatLayerPickerColor(scope.resolvedTheme.colors.text, scope.resolvedTheme.colors.surface, .04, scope.resolvedTheme.colors.surface)
      : scope.resolvedTheme.colors.accent,
    opacity: busy ? .5 : 1,
  }, button]}>
    {secondary ? null : <CheckIcon color={scope.resolvedTheme.colors.onAccent} />}
    <Text numberOfLines={1} style={[nativeStyles.buttonText, { color: secondary ? scope.resolvedTheme.colors.text : scope.resolvedTheme.colors.onAccent, fontFamily: scope.resolvedTheme.fontFamily }, text]}>{label}</Text>
  </View></Pressable>;
}

function EyeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={[nativeStyles.eye, { borderColor: color }]}><View style={[nativeStyles.eyeDot, { backgroundColor: color }]} /></View>;
}
function CubeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={[nativeStyles.cube, { borderColor: color }]} />;
}
function CheckIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={[nativeStyles.check, { borderColor: color }]} />;
}
function sectionId(scope: { snapshot?: { sections: readonly { id: string; label: string; displayLabel?: string }[] } }, seat: { sectionLabel?: string }): string | undefined {
  const label = seat.sectionLabel?.trim();
  if (!label) return undefined;
  const normalized = label.toLocaleLowerCase();
  return scope.snapshot?.sections.find((section) => section.label.toLocaleLowerCase() === normalized || section.displayLabel?.toLocaleLowerCase() === normalized)?.id;
}
function insets(value: unknown): Required<SeatLayerConfirmCardInsets> {
  const read = (key: 'left' | 'right'): number => { try { const descriptor = value && typeof value === 'object' && !Array.isArray(value) ? Object.getOwnPropertyDescriptor(value, key) : undefined; const number = descriptor && 'value' in descriptor ? descriptor.value : undefined; return typeof number === 'number' && Number.isFinite(number) ? Math.max(0, number) : 0; } catch { return 0; } };
  return { left: read('left'), right: read('right') };
}
const nativeStyles = StyleSheet.create({
  hit: { alignSelf: 'center', justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget, width: '100%' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    elevation: seatLayerPickerTokens.elevation.confirmCard,
    overflow: 'hidden',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: .2,
    shadowRadius: 18,
  },
  identity: {
    alignItems: 'center',
    gap: 8,
    height: seatLayerPickerTokens.size.confirmIdentityHeight,
    paddingHorizontal: 12,
  },
  dot: { borderRadius: 5, flexShrink: 0, height: 10, width: 10 },
  identityText: { flex: 1, fontSize: 14, fontWeight: '800' },
  price: { flexShrink: 0, fontSize: 15, fontWeight: '900' },
  strip: { height: seatLayerPickerTokens.size.confirmPhotoHeight, overflow: 'hidden', position: 'relative' },
  stripGround: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0 },
  stripActions: { alignItems: 'center', height: '100%', justifyContent: 'space-between', paddingHorizontal: 10 },
  stripSpace: { height: 10 },
  inspectionHit: { justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  inspectionPaint: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 32, paddingHorizontal: 10 },
  inspectionText: { fontSize: 12, fontWeight: '800' },
  eye: { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, height: 10, justifyContent: 'center', width: 16 },
  eyeDot: { borderRadius: 2, height: 4, width: 4 },
  cube: { borderWidth: 1.5, height: 12, transform: [{ rotate: '45deg' }], width: 12 },
  noStripSpace: { height: 5 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  buttonHit: { flex: 1, justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  buttonPaint: { alignItems: 'center', flexDirection: 'row', gap: 6, height: seatLayerPickerTokens.size.confirmActionHeight, justifyContent: 'center', paddingHorizontal: 8, width: '100%' },
  buttonText: { fontSize: 14, fontWeight: '800' },
  check: { borderBottomWidth: 2, borderLeftWidth: 2, height: 7, transform: [{ rotate: '-45deg' }], width: 12 },
});
