import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { seatLayerPickerConfirmIdentity } from './confirmCardIdentity';
import { formatSeatLayerPickerMoney } from './format';
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
  const price = typeof seat.price === 'number' && Number.isFinite(seat.price) ? formatSeatLayerPickerMoney(seat.price, seat.currency ?? scope.snapshot!.currency) : undefined;
  const safe = insets(props.safeAreaInsets);
  const maxWidth = Math.max(0, Math.min(seatLayerPickerTokens.size.confirmCardMaxWidth, viewportWidth - seatLayerPickerTokens.size.confirmCardGutter * 2 - safe.left - safe.right));
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const rtl = I18nManager.isRTL;
  return <View style={[nativeStyles.hit, { maxWidth, marginStart: safe.left, marginEnd: safe.right }]}><View style={[nativeStyles.card, { backgroundColor: scope.resolvedTheme.colors.surface, borderColor: scope.resolvedTheme.colors.divider, borderRadius: seatLayerPickerTokens.radius.card }, styles.confirmCardContainer, sanitizeSeatLayerPickerStyle(props.style), { width: '100%', maxWidth }]}>
    <View style={[nativeStyles.identity, { flexDirection: rtl ? 'row-reverse' : 'row' }]}><View style={[nativeStyles.dot, { backgroundColor: scope.resolvedTheme.colors.accent }]} /><Text accessibilityRole="header" accessibilityLiveRegion="polite" numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.identityText, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.confirmCardIdentityText]}>{identity}</Text>{price ? <Text numberOfLines={1} ellipsizeMode="clip" style={[nativeStyles.price, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{price}</Text> : null}</View>
    {inspection.length ? <View style={[nativeStyles.strip, { backgroundColor: scope.resolvedTheme.colors.surface, borderColor: scope.resolvedTheme.colors.divider, flexDirection: rtl ? 'row-reverse' : 'row' }]}>{inspection.map((action) => <CardButton key={action.kind} label={action.label} busy={busy} onPress={() => run(action.kind)} secondary scope={scope} styles={styles} />)}</View> : null}
    {candidate ? <SeatLayerPickerSeatTierSelector candidate={candidate} value={tierId} onValueChange={setTierId} slots={props.slots} /> : null}
    <View style={[nativeStyles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}><CardButton label={scope.strings.translate('cancel')} busy={busy} onPress={() => run('cancel')} secondary scope={scope} styles={styles} /><CardButton label={scope.strings.translate('select')} busy={busy} onPress={() => run('confirm')} scope={scope} styles={styles} /></View>
  </View></View>;
}

function CardButton({ label, busy, onPress, secondary, scope, styles }: Readonly<{ label: string; busy: boolean; onPress: () => void; secondary?: boolean; scope: SeatLayerPickerConfirmationModel['scope']; styles: ReturnType<typeof resolveSeatLayerPickerStyles> }>): React.ReactElement {
  const button = secondary ? styles.confirmCardSecondaryButton : styles.confirmCardPrimaryButton;
  const text = secondary ? styles.confirmCardSecondaryButtonText : styles.confirmCardPrimaryButtonText;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={nativeStyles.buttonHit}><View style={[nativeStyles.buttonPaint, { backgroundColor: secondary ? scope.resolvedTheme.colors.surface : scope.resolvedTheme.colors.accent, borderColor: secondary ? scope.resolvedTheme.colors.divider : scope.resolvedTheme.colors.accent }, button, { borderRadius: seatLayerPickerTokens.radius.button, opacity: busy ? .5 : 1 }]}><Text numberOfLines={1} style={[nativeStyles.buttonText, { color: secondary ? scope.resolvedTheme.colors.text : scope.resolvedTheme.colors.onAccent, fontFamily: scope.resolvedTheme.fontFamily }, text]}>{label}</Text></View></Pressable>;
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
  hit: { minHeight: seatLayerPickerTokens.size.minimumHitTarget, alignSelf: 'center', width: '100%', justifyContent: 'center' }, card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: seatLayerPickerTokens.size.confirmCardGutter }, identity: { height: seatLayerPickerTokens.size.confirmIdentityHeight, alignItems: 'center', gap: 8 }, dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 }, identityText: { flex: 1, fontSize: 14, fontWeight: '800' }, price: { flexShrink: 0, fontSize: 15, fontWeight: '900' }, strip: { height: seatLayerPickerTokens.size.confirmPhotoHeight, borderWidth: StyleSheet.hairlineWidth, marginTop: 4, gap: 8, paddingHorizontal: 8, alignItems: 'center' }, actions: { gap: 8, marginTop: 10 }, buttonHit: { flex: 1, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' }, buttonPaint: { height: seatLayerPickerTokens.size.confirmActionHeight, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, buttonText: { fontSize: 14, fontWeight: '800' },
});
