import React, { useState } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { blendSeatLayerPickerColor, parseSeatLayerPickerColor, pickerColor } from './colors';
import { SeatLayerPickerSeatTierSelector } from './SeatLayerPickerDecisionPrompts';
import {
  SeatLayerPickerConfirmationState,
  seatLayerPickerConfirmationPrice,
  type SeatLayerPickerConfirmationActionEvent,
  type SeatLayerPickerConfirmationActions,
  type SeatLayerPickerConfirmationModel,
} from './seatConfirmationState';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerTokens } from './tokens.g';

type WideSlots = Pick<SeatLayerPickerStyles,
  'confirmCardContainer' | 'confirmCardIdentityText' | 'confirmCardPrimaryButton' |
  'confirmCardPrimaryButtonText' | 'confirmCardSecondaryButton' | 'confirmCardSecondaryButtonText'>;

export interface SeatLayerPickerSeatConfirmationProps extends SeatLayerPickerConfirmationActions {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: WideSlots;
}
export type SeatLayerPickerSeatConfirmationActionEvent = SeatLayerPickerConfirmationActionEvent;

/** Wide picker confirmation presentation; the action workflow remains shared with ConfirmCard. */
export function SeatLayerPickerSeatConfirmation(props: SeatLayerPickerSeatConfirmationProps): React.ReactElement | null {
  return <SeatLayerPickerConfirmationState {...props}>{(model) => <WideCard model={model} props={props} />}</SeatLayerPickerConfirmationState>;
}

function WideCard({ model, props }: Readonly<{ model: SeatLayerPickerConfirmationModel; props: SeatLayerPickerSeatConfirmationProps }>): React.ReactElement {
  const { height } = useWindowDimensions();
  const [parentWidth, setParentWidth] = useState<number | undefined>(undefined);
  const { scope, seat, candidate, tierId, setTierId, busy, inspection, run } = model;
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const category = scope.snapshot?.categories.find((item) => item.key === seat.categoryKey);
  const categoryColor = pickerColor(
    parseSeatLayerPickerColor(category?.color) ? category?.color : undefined,
    scope.resolvedTheme.colors.accent,
  );
  const fields = identityFields(seat);
  const limited = seat.commercial?.restrictedView === true || seat.commercial?.obstructedView === true;
  const wheelchair = Boolean(seat.wheelchairSpaceType) || (seat.accessibility ?? []).some((value) => value.toLocaleLowerCase().includes('wheelchair'));
  const limitedMessage = clean(seat.commercial?.note);
  const accessibilityMessage = wheelchair ? scope.strings.accessNeed('wheelchair') : undefined;
  const selectedPrice = seatLayerPickerConfirmationPrice(seat, tierId);
  const price = selectedPrice
    ? scope.formatMoney(selectedPrice.amount, selectedPrice.currency ?? scope.snapshot?.currency ?? 'USD')
    : undefined;
  const rtl = I18nManager.isRTL;
  const stackInspection = parentWidth !== undefined && parentWidth < 330;
  return <View style={nativeStyles.center}><View onLayout={(event) => setParentWidth(layoutWidth(event))} style={[nativeStyles.hit, { maxHeight: Math.max(0, height * .72) }]}><View style={[nativeStyles.card, { backgroundColor: scope.resolvedTheme.colors.surface, borderColor: scope.resolvedTheme.colors.divider, borderRadius: seatLayerPickerTokens.radius.card }, styles.confirmCardContainer, sanitizeSeatLayerPickerStyle(props.style)]}>
    <ScrollView contentContainerStyle={nativeStyles.scroll}>
      <View style={[nativeStyles.grid, { flexDirection: rtl ? 'row-reverse' : 'row', borderColor: scope.resolvedTheme.colors.divider }]}>{fields.map((field, index) => <View key={`${index}:${field.value}`} style={[nativeStyles.field, { borderColor: scope.resolvedTheme.colors.divider }]}>{field.label ? <Text numberOfLines={1} style={[nativeStyles.fieldLabel, { color: scope.resolvedTheme.colors.mutedText, fontFamily: scope.resolvedTheme.fontFamily }]}>{field.label}</Text> : null}<Text accessibilityRole="header" numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.fieldValue, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.confirmCardIdentityText]}>{field.value}</Text></View>)}</View>
      <View style={[nativeStyles.categoryBand, { backgroundColor: blendSeatLayerPickerColor(categoryColor, scope.resolvedTheme.colors.surface, .1, scope.resolvedTheme.colors.surface), borderColor: categoryColor, flexDirection: rtl ? 'row-reverse' : 'row' }]}><View style={[nativeStyles.categoryDot, { backgroundColor: categoryColor, borderColor: scope.resolvedTheme.colors.text }]} />{clean(category?.label) ? <Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.categoryLabel, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{clean(category?.label)}</Text> : <View style={nativeStyles.categorySpacer} />}{price ? <Text numberOfLines={1} ellipsizeMode="clip" style={[nativeStyles.price, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{price}</Text> : null}</View>
      <View style={nativeStyles.body}>{candidate ? <SeatLayerPickerSeatTierSelector candidate={candidate} value={tierId} onValueChange={setTierId} slots={props.slots} /> : null}
        {limited ? <LimitedNotice message={limitedMessage} color={scope.resolvedTheme.colors.warning} mutedColor={scope.resolvedTheme.colors.mutedText} /> : null}
        {wheelchair && accessibilityMessage ? <Notice title={scope.strings.translate('accessibilityTitle')} message={accessibilityMessage} color={scope.resolvedTheme.colors.accent} mutedColor={scope.resolvedTheme.colors.mutedText} /> : null}
        {inspection.length ? <View testID="seatConfirmationInspection" style={[nativeStyles.inspection, { flexDirection: stackInspection ? 'column' : rtl ? 'row-reverse' : 'row' }]}>{inspection.map((action) => <Action key={action.kind} label={action.label} busy={busy} onPress={() => run(action.kind)} scope={scope} styles={styles} secondary />)}</View> : null}
        <View style={[nativeStyles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}><Action label={scope.strings.translate('cancel')} busy={busy} onPress={() => run('cancel')} scope={scope} styles={styles} secondary /><Action label={scope.strings.translate('select')} busy={busy} onPress={() => run('confirm')} scope={scope} styles={styles} /></View>
      </View>
    </ScrollView>
  </View></View></View>;
}

function Action({ label, busy, onPress, secondary, scope, styles }: Readonly<{ label: string; busy: boolean; onPress: () => void; secondary?: boolean; scope: SeatLayerPickerConfirmationModel['scope']; styles: ReturnType<typeof resolveSeatLayerPickerStyles> }>): React.ReactElement {
  const button = secondary ? styles.confirmCardSecondaryButton : styles.confirmCardPrimaryButton;
  const text = secondary ? styles.confirmCardSecondaryButtonText : styles.confirmCardPrimaryButtonText;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={nativeStyles.actionHit}><View style={[nativeStyles.actionPaint, { backgroundColor: secondary ? scope.resolvedTheme.colors.surface : scope.resolvedTheme.colors.accent, borderColor: secondary ? scope.resolvedTheme.colors.divider : scope.resolvedTheme.colors.accent, borderRadius: seatLayerPickerTokens.radius.button, opacity: busy ? .5 : 1 }, button]}><Text numberOfLines={1} style={[nativeStyles.actionText, { color: secondary ? scope.resolvedTheme.colors.text : scope.resolvedTheme.colors.onAccent, fontFamily: scope.resolvedTheme.fontFamily }, text]}>{label}</Text></View></Pressable>;
}
// Not live regions: a notice is part of the card's own statement and does
// not change while the card is up.
function Notice({ title, message, color, mutedColor }: Readonly<{ title: string; message: string; color: string; mutedColor: string }>): React.ReactElement {
  return <View style={[nativeStyles.notice, { borderColor: color }]}><Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.noticeTitle, { color }]}>{title}</Text><Text style={[nativeStyles.noticeText, { color: mutedColor }]}>{message}</Text></View>;
}
function LimitedNotice({ message, color, mutedColor }: Readonly<{ message: string | undefined; color: string; mutedColor: string }>): React.ReactElement | null {
  if (message) return <View style={[nativeStyles.notice, { borderColor: color }]}><Text style={[nativeStyles.noticeText, { color: mutedColor }]}>{message}</Text></View>;
  // The generated catalog has no non-imperative restricted-view notice yet.
  return null;
}
function identityFields(seat: SeatLayerPickerConfirmationModel['seat']): readonly Readonly<{ label?: string; value: string }>[] {
  const section = clean(seat.sectionLabel);
  const row = clean(seat.rowLabel);
  const rowHeading = clean(seat.displayType);
  const place = clean(seat.seatNumber ?? seat.displayLabel ?? seat.label);
  return Object.freeze([
    ...(section ? [Object.freeze({ value: section })] : []),
    ...(row ? [Object.freeze({ ...(rowHeading ? { label: rowHeading } : {}), value: row })] : []),
    ...(place ? [Object.freeze({ value: place })] : []),
  ]);
}
function clean(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function layoutWidth(event: unknown): number | undefined {
  try {
    const width = event && typeof event === 'object' && 'nativeEvent' in event && event.nativeEvent && typeof event.nativeEvent === 'object' && 'layout' in event.nativeEvent && event.nativeEvent.layout && typeof event.nativeEvent.layout === 'object' && 'width' in event.nativeEvent.layout ? event.nativeEvent.layout.width : undefined;
    return typeof width === 'number' && Number.isFinite(width) && width >= 0 ? width : undefined;
  } catch { return undefined; }
}
const nativeStyles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 12 }, hit: { width: '100%', maxWidth: 430, minHeight: seatLayerPickerTokens.size.minimumHitTarget }, card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', maxHeight: '100%' }, scroll: { flexGrow: 1 }, grid: { borderBottomWidth: StyleSheet.hairlineWidth }, field: { flex: 1, minHeight: 62, padding: 10, borderEndWidth: StyleSheet.hairlineWidth, justifyContent: 'center' }, fieldLabel: { fontSize: 11, fontWeight: '800' }, fieldValue: { fontSize: 15, fontWeight: '900' }, categoryBand: { minHeight: 58, alignItems: 'center', gap: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth }, categoryDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 }, categorySpacer: { flex: 1 }, categoryLabel: { flex: 1, fontSize: 16, fontWeight: '800' }, price: { fontSize: 19, fontWeight: '900' }, body: { gap: 10, padding: 16 }, notice: { borderStartWidth: 3, paddingStart: 10, gap: 2 }, noticeTitle: { fontSize: 13, fontWeight: '900' }, noticeText: { fontSize: 13 }, inspection: { gap: 8 }, actions: { gap: 10 }, actionHit: { flex: 1, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' }, actionPaint: { height: seatLayerPickerTokens.size.confirmActionHeight, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }, actionText: { fontSize: 14, fontWeight: '800' },
});
