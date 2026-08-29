import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { SeatLayerPickerBottomSheetFrame } from './SeatLayerPickerBottomSheetFrame';
import { SeatLayerPickerPromptModal } from './promptModal';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import {
  canChooseSeatLayerPickerWideFloor,
  canCompleteSeatLayerPickerWideFloor,
  canOfferSeatLayerPickerWideAllFloors,
  observeSeatLayerPickerWideNavigation,
  reportSeatLayerPickerWideNavigation,
  sameSeatLayerPickerWideNavigationLease,
  seatLayerPickerWideNavigationLease,
  supportsSeatLayerPickerWideNavigation,
  type SeatLayerPickerWideNavigationLease,
} from './wideNavigation';

export interface SeatLayerPickerFloorSelectorProps {
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'floorStripContainer' | 'floorChip' | 'floorChipText'>;
  readonly onFloorChanged?: (floorId: string) => void | Promise<void>;
}

type Flight = Readonly<{ readonly token: object; readonly target: string; readonly lease: SeatLayerPickerWideNavigationLease }>;
type Prompt = ReturnType<SeatLayerPickerScopeValue['claimPrompt']>;

/** Wide-layout compact floor picker. It remains absent when runtime owns floor chrome. */
export function SeatLayerPickerFloorSelector(
  props: SeatLayerPickerFloorSelectorProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  if (!snapshot || snapshot.map.floors.length < 2 ||
    !supportsSeatLayerPickerWideNavigation(scope.controller, 'picker.setFloor')) return null;
  const selectedAll = canOfferSeatLayerPickerWideAllFloors(snapshot, scope.controller) && snapshot.map.floorMode === 'all';
  const active = selectedAll ? undefined : snapshot.map.floors.find((floor) => floor.id === snapshot.map.activeFloorId);
  if (!selectedAll && active === undefined) return null;
  return <FloorSelectorCurrent key={`${scope.sessionId}:${snapshot.sessionId}`} props={props} scope={scope} runtimeSession={snapshot.sessionId} />;
}

function FloorSelectorCurrent({
  props,
  runtimeSession,
  scope,
}: Readonly<{
  props: SeatLayerPickerFloorSelectorProps;
  runtimeSession: string;
  scope: SeatLayerPickerScopeValue;
}>): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const activeRef = useRef(false);
  const scopeRef = useRef(scope);
  const propsRef = useRef(props);
  const leaseRef = useRef<SeatLayerPickerWideNavigationLease>(seatLayerPickerWideNavigationLease(scope, runtimeSession));
  const flightRef = useRef<Flight | undefined>(undefined);
  const promptRef = useRef<Prompt>(undefined);
  useLayoutEffect(() => { scopeRef.current = scope; propsRef.current = props; });
  useLayoutEffect(() => {
    activeRef.current = true;
    leaseRef.current = seatLayerPickerWideNavigationLease(scope, runtimeSession);
    flightRef.current = undefined;
    promptRef.current = undefined;
    setBusy(false); setOpen(false);
    return () => {
      activeRef.current = false;
      flightRef.current = undefined;
      promptRef.current?.dismiss();
      promptRef.current = undefined;
    };
  }, [runtimeSession, scope.controller, scope.sessionId]);
  useLayoutEffect(() => {
    if (open && scope.presentation.prompt?.kind !== 'floorSelector') {
      promptRef.current = undefined;
      setOpen(false);
    }
  }, [open, scope.presentation.prompt]);
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const target = seatLayerPickerTokens.size.minimumHitTarget;
  const snapshot = scope.snapshot!;
  const offersAll = canOfferSeatLayerPickerWideAllFloors(snapshot, scope.controller);
  const selectedAll = offersAll && snapshot.map.floorMode === 'all';
  const selectedFloor = selectedAll ? undefined : snapshot.map.floors.find((floor) => floor.id === snapshot.map.activeFloorId);
  const selectedLabel = selectedAll ? scope.strings.translate('allFloors') : selectedFloor!.name;
  const actionBusy = scope.isBusy || busy;
  const close = () => {
    const prompt = promptRef.current;
    if (prompt?.dismiss()) setOpen(false);
  };
  const show = () => {
    if (actionBusy || promptRef.current || !activeRef.current) return;
    const prompt = scopeRef.current.claimPrompt('floorSelector', 'floorSelector');
    if (prompt?.open()) {
      promptRef.current = prompt;
      setOpen(true);
    }
  };
  const choose = (floorId: string) => {
    const current = scopeRef.current;
    const lease = leaseRef.current;
    if (!activeRef.current || flightRef.current || !canChooseSeatLayerPickerWideFloor(current, lease, floorId)) return;
    const flight = Object.freeze({ token: Object.freeze({}), target: floorId, lease });
    flightRef.current = flight;
    setBusy(true);
    void Promise.resolve(lease.controller.setFloor(floorId)).then(
      () => {
        const latest = scopeRef.current;
        if (activeRef.current && sameSeatLayerPickerWideNavigationLease(flight.lease, leaseRef.current) &&
          canCompleteSeatLayerPickerWideFloor(latest, flight.lease, floorId)) {
          close();
          observeSeatLayerPickerWideNavigation(propsRef.current.onFloorChanged, floorId);
        }
      },
      (error: unknown) => {
        if (activeRef.current && sameSeatLayerPickerWideNavigationLease(flight.lease, leaseRef.current)) {
          reportSeatLayerPickerWideNavigation(scopeRef.current, error);
        }
      },
    ).finally(() => {
      if (activeRef.current && sameSeatLayerPickerWideNavigationLease(flight.lease, leaseRef.current) &&
        flightRef.current?.token === flight.token) {
        flightRef.current = undefined;
        setBusy(false);
      }
    });
  };
  const visible = open && scope.presentation.prompt?.kind === 'floorSelector';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectedLabel}
        accessibilityState={{ expanded: visible, disabled: actionBusy, busy: actionBusy }}
        disabled={actionBusy}
        onPress={show}
        style={[nativeStyles.target, { minWidth: target, minHeight: target }]}
      >
        <View style={[nativeStyles.trigger, styles.floorStripContainer, sanitizeSeatLayerPickerStyle(props.style), {
          borderColor: scope.resolvedTheme.colors.divider,
          backgroundColor: blendSeatLayerPickerColor(scope.resolvedTheme.colors.surface, scope.resolvedTheme.colors.background, .94, scope.resolvedTheme.colors.surface),
          borderRadius: seatLayerPickerTokens.radius.button,
        }]}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.triggerText, {
            color: scope.resolvedTheme.colors.text,
            fontFamily: scope.resolvedTheme.fontFamily,
          }, styles.floorChipText]}>{selectedLabel}</Text>
        </View>
      </Pressable>
      <SeatLayerPickerPromptModal visible={visible}>
        <SeatLayerPickerBottomSheetFrame
          borderColor={scope.resolvedTheme.colors.divider}
          maxHeight="60%"
          radius={scope.resolvedTheme.radii.sheet}
          safeAreaInsets={props.safeAreaInsets}
          scrimColor={blendSeatLayerPickerColor(scope.resolvedTheme.colors.text, scope.resolvedTheme.colors.background, .45, scope.resolvedTheme.colors.text)}
          style={[nativeStyles.sheet, styles.floorStripContainer]}
          surfaceColor={scope.resolvedTheme.colors.surface}
        >
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel={scope.strings.translate('close')} onPress={close} style={[nativeStyles.closeTarget, { minWidth: target, minHeight: target }]}>
              <View style={[nativeStyles.closePaint, { borderRadius: seatLayerPickerTokens.radius.button, backgroundColor: scope.resolvedTheme.colors.background }]}>
                <Text style={[nativeStyles.closeText, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{scope.strings.translate('close')}</Text>
              </View>
            </Pressable>
            <ScrollView contentContainerStyle={[nativeStyles.choices, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row' }]}>
              {offersAll ? <Choice label={scope.strings.translate('allFloors')} selected={selectedAll} busy={actionBusy} styles={styles} scope={scope} onPress={() => choose(seatLayerAllFloors)} /> : null}
              {snapshot.map.floors.map((floor) => <Choice key={floor.id} label={floor.name} selected={!selectedAll && floor.id === selectedFloor?.id} busy={actionBusy} styles={styles} scope={scope} onPress={() => choose(floor.id)} />)}
            </ScrollView>
          </View>
        </SeatLayerPickerBottomSheetFrame>
      </SeatLayerPickerPromptModal>
    </>
  );
}

function Choice({ label, selected, busy, styles, scope, onPress }: Readonly<{
  label: string; selected: boolean; busy: boolean; styles: ReturnType<typeof resolveSeatLayerPickerStyles>;
  scope: SeatLayerPickerScopeValue; onPress: () => void;
}>): React.ReactElement {
  const target = seatLayerPickerTokens.size.minimumHitTarget;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: busy || selected, busy }} disabled={busy || selected} onPress={onPress} style={[nativeStyles.choiceTarget, { minWidth: target, minHeight: target }]}>
    <View style={[nativeStyles.choicePaint, styles.floorChip, {
      backgroundColor: selected ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.background,
      borderColor: selected ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.divider,
      borderRadius: seatLayerPickerTokens.radius.button,
    }]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.choiceText, { color: selected ? scope.resolvedTheme.colors.onAccent : scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.floorChipText]}>{label}</Text>
    </View>
  </Pressable>;
}

const nativeStyles = StyleSheet.create({
  target: { justifyContent: 'center' },
  trigger: { height: 40, maxWidth: 180, minWidth: 88, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  triggerText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  sheet: { padding: 8 },
  closeTarget: { alignSelf: 'flex-end', justifyContent: 'center' },
  closePaint: { height: 40, paddingHorizontal: 10, justifyContent: 'center' },
  closeText: { fontSize: 13, fontWeight: '800' },
  choices: { gap: 6, flexWrap: 'wrap' },
  choiceTarget: { justifyContent: 'center' },
  choicePaint: { height: 40, maxWidth: 220, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  choiceText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
});
