import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SelectedSeat } from '../types';
import { usePickerSingleFlight } from './pickerNavigation';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { seatLayerPickerTokens } from './tokens.g';

type InspectionSlots = Pick<SeatLayerPickerStyles,
  'confirmCardSecondaryButton' | 'confirmCardSecondaryButtonText'>;

export interface SeatLayerPickerSeatInspectionButtonProps {
  readonly label?: string;
  readonly onPress?: (seat: Readonly<SelectedSeat>) => void | Promise<void>;
  readonly seat: Readonly<SelectedSeat>;
  readonly slots?: InspectionSlots;
  readonly style?: StyleProp<ViewStyle>;
}

type InspectionKind = 'seatView' | 'venue3d';

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function runtimeAvailable(
  kind: InspectionKind,
  scope: ReturnType<typeof useSeatLayerPickerScope>,
): boolean {
  if (kind === 'seatView') {
    return scope.snapshot?.capabilities.includes('seatView') === true &&
      supportsSeatLayerPickerSurface(
        scope.controller,
        ['native-chrome-contract-v1', 'seat-view-v1'],
        ['picker.openSeatView'],
      );
  }
  return scope.snapshot?.capabilities.includes('venue3d') === true &&
    supportsSeatLayerPickerSurface(
      scope.controller,
      ['native-chrome-contract-v1', 'venue-3d-v1'],
      ['picker.setBuyerView'],
    );
}

function SeatInspectionButton({
  kind,
  label,
  onPress,
  seat,
  slots: componentSlots,
  style,
}: SeatLayerPickerSeatInspectionButtonProps & { readonly kind: InspectionKind }): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const seatId = clean(seat?.id);
  const seatLabel = clean(seat?.label);
  const customAction = typeof onPress === 'function' ? onPress : undefined;
  const available = seatId !== undefined && seatLabel !== undefined &&
    (customAction !== undefined || runtimeAvailable(kind, scope));
  const request = useRef<Readonly<{
    action: typeof customAction;
    controller: typeof scope.controller;
    seat: Readonly<SelectedSeat>;
    seatId: string;
    seatLabel: string;
    sessionId: number;
  }> | undefined>(undefined);
  const [busy, run] = usePickerSingleFlight(scope.sessionId, scope.reportError, async () => {
    const active = request.current;
    if (!active || active.controller !== scope.controller || active.sessionId !== scope.sessionId ||
      active.seatId !== seatId || active.seatLabel !== seatLabel || active.action !== customAction) return;
    if (active.action) {
      await active.action(active.seat);
      return;
    }
    const controller = scope.controller;
    const live = controller.getSnapshot();
    if (!live || !runtimeAvailable(kind, { ...scope, snapshot: live })) return;
    if (kind === 'seatView') await controller.openSeatView(active.seatId);
    else await controller.setBuyerView('venue3d', { flyToSeatId: active.seatId });
  });
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, componentSlots),
    [componentSlots, scope.styles],
  );
  if (!available) return null;
  const inVenue3D = scope.snapshot?.map.buyerView === 'venue3d';
  const copy = clean(label) ?? (kind === 'seatView'
    ? scope.strings.translate('viewFromHere')
    : inVenue3D ? scope.strings.translate('viewFromHere') : 'See it in 3D');
  const disabled = scope.isBusy || scope.readOnly || busy;
  return <Pressable
    accessibilityLabel={copy}
    accessibilityRole="button"
    accessibilityState={{ busy, disabled }}
    disabled={disabled}
    onPress={() => {
      if (!seatId || !seatLabel) return;
      request.current = Object.freeze({
        action: customAction,
        controller: scope.controller,
        seat,
        seatId,
        seatLabel,
        sessionId: scope.sessionId,
      });
      run();
    }}
    style={nativeStyles.hit}
  >
    <View style={[nativeStyles.paint, {
      backgroundColor: scope.resolvedTheme.colors.surface,
      borderColor: scope.resolvedTheme.colors.divider,
      borderRadius: scope.resolvedTheme.radii.button,
    }, styles.confirmCardSecondaryButton, sanitizeSeatLayerPickerStyle(style), {
      height: seatLayerPickerTokens.size.confirmActionHeight,
      minHeight: seatLayerPickerTokens.size.confirmActionHeight,
    }]}>
      {kind === 'seatView'
        ? <EyeIcon color={scope.resolvedTheme.colors.text} />
        : <CubeIcon color={scope.resolvedTheme.colors.text} />}
      <Text numberOfLines={1} style={[nativeStyles.text, {
        color: scope.resolvedTheme.colors.text,
        fontFamily: scope.resolvedTheme.fontFamily,
      }, styles.confirmCardSecondaryButtonText]}>{copy}</Text>
    </View>
  </Pressable>;
}

/** Reusable view-from-seat action; defaults to the negotiated runtime command. */
export function SeatLayerPickerSeatViewButton(
  props: SeatLayerPickerSeatInspectionButtonProps,
): React.ReactElement | null {
  return <SeatInspectionButton {...props} kind="seatView" />;
}

/** Reusable seat-targeted venue-3D action; defaults to the negotiated runtime command. */
export function SeatLayerPickerSeat3DButton(
  props: SeatLayerPickerSeatInspectionButtonProps,
): React.ReactElement | null {
  return <SeatInspectionButton {...props} kind="venue3d" />;
}

function EyeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={[nativeStyles.eye, { borderColor: color }]}>
    <View style={[nativeStyles.eyeDot, { backgroundColor: color }]} />
  </View>;
}
function CubeIcon({ color }: Readonly<{ color: string }>): React.ReactElement {
  return <View style={[nativeStyles.cube, { borderColor: color }]} />;
}

const nativeStyles = StyleSheet.create({
  hit: { justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget, width: '100%' },
  paint: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 12,
    width: '100%',
  },
  text: { flexShrink: 1, fontSize: 13, fontWeight: '800' },
  eye: { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, height: 10, justifyContent: 'center', width: 16 },
  eyeDot: { borderRadius: 2, height: 4, width: 4 },
  cube: { borderWidth: 1.5, height: 12, transform: [{ rotate: '45deg' }], width: 12 },
});
