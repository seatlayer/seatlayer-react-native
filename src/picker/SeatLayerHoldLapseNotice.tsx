import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerTokens } from './tokens.g';

export interface SeatLayerHoldLapseNoticeProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'statusContainer' | 'statusText' | 'statusAction' | 'statusActionText' | 'errorContainer' | 'errorText'>;
}

/** Scope-owned lapse notice: it never creates a timer or reinfers a runtime expiry. */
export function SeatLayerHoldLapseNotice(props: SeatLayerHoldLapseNoticeProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const lapse = scope.holdLapse;
  if (!lapse) return null;
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const minutes = typeof lapse.heldForMs === 'number' && Number.isFinite(lapse.heldForMs) && lapse.heldForMs > 0
    ? Math.max(1, Math.ceil(lapse.heldForMs / 60_000)) : undefined;
  const unrecovered = Math.max(0, lapse.lapsedLabels.length - lapse.recoverableLabels.length);
  const offersReselect = lapse.recoverableLabels.length > 0;
  const canReselect = offersReselect && scope.isReady && !scope.isHoldLapseBusy && !scope.readOnly;
  const reselectLabel = scope.strings.translate('reselectSeats', {
    count: lapse.recoverableLabels.length,
    values: { count: lapse.recoverableLabels.length },
  });
  return (
    <View accessibilityLiveRegion="polite" style={[sanitizeSeatLayerPickerStyle(props.style), styles.statusContainer, styles.errorContainer, { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.roles.notice.background, borderBottomWidth: 1, borderColor: theme.roles.notice.border }]}>
      <Text style={[{ color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '700' }, styles.statusText, styles.errorText]}>{scope.strings.translate('holdLapsedTitle')}</Text>
      {minutes === undefined ? null : <Text style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily }, styles.statusText, styles.errorText]}>{scope.strings.translate('holdLapsedBody', { values: { n: minutes } })}</Text>}
      {unrecovered > 0 ? <Text style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily }, styles.statusText, styles.errorText]}>{scope.strings.translate('seatsNotRecovered', { values: { n: unrecovered } })}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {offersReselect ? (
          <Pressable accessibilityRole="button" accessibilityLabel={reselectLabel}
            accessibilityState={{ busy: scope.isHoldLapseBusy, disabled: !canReselect }}
            disabled={!canReselect} onPress={() => { void scope.reselectHoldLapse(); }}
            style={[styles.statusAction, { minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ height: seatLayerPickerTokens.size.confirmActionHeight, minWidth: seatLayerPickerTokens.size.confirmActionHeight, paddingHorizontal: 8, borderRadius: seatLayerPickerTokens.radius.button, justifyContent: 'center', alignItems: 'center', backgroundColor: canReselect ? theme.colors.accent : theme.colors.divider }}>
              <Text numberOfLines={1} style={[{ color: canReselect ? theme.colors.onAccent : theme.colors.mutedText, fontFamily: theme.fontFamily, fontWeight: '700' }, styles.statusActionText]}>{reselectLabel}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={scope.strings.translate('close')}
            onPress={scope.dismissHoldLapse}
            style={[styles.statusAction, { minWidth: seatLayerPickerTokens.size.minimumHitTarget, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ width: seatLayerPickerTokens.size.confirmActionHeight, height: seatLayerPickerTokens.size.confirmActionHeight, borderRadius: seatLayerPickerTokens.radius.button, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface }}>
              <Text accessible={false} style={[{ color: theme.colors.text, fontFamily: theme.fontFamily }, styles.statusActionText]}>×</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}
