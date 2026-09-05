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

import { blendSeatLayerPickerColor } from './pickerNavigation';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import {
  canFocusSeatLayerPickerWideSection,
  hasSeatLayerPickerWideNavigationSnapshot,
  observeSeatLayerPickerWideNavigation,
  reportSeatLayerPickerWideNavigation,
  sameSeatLayerPickerWideNavigationLease,
  seatLayerPickerWideNavigationLease,
  supportsSeatLayerPickerWideNavigation,
  type SeatLayerPickerWideNavigationLease,
} from './wideNavigation';
import { seatLayerPickerBoldStyles } from './boldText';

export interface SeatLayerPickerSectionNavigatorProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'dockContainer' | 'dockSectionText'>;
  readonly onSectionFocused?: (sectionId: string) => void | Promise<void>;
}

type Flight = Readonly<{ readonly token: object; readonly sectionId: string; readonly lease: SeatLayerPickerWideNavigationLease }>;

/** Wide-layout section directory. Runtime fallback owns this space when unavailable. */
export function SeatLayerPickerSectionNavigator(
  props: SeatLayerPickerSectionNavigatorProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const snapshot = scope.snapshot;
  if (!snapshot || snapshot.sections.length === 0 ||
    !supportsSeatLayerPickerWideNavigation(scope.controller, 'picker.focusSection')) return null;
  return (
    <SectionNavigatorCurrent
      key={`${scope.sessionId}:${snapshot.sessionId}`}
      props={props}
      scope={scope}
      runtimeSession={snapshot.sessionId}
    />
  );
}

function SectionNavigatorCurrent({
  props,
  runtimeSession,
  scope,
}: Readonly<{
  props: SeatLayerPickerSectionNavigatorProps;
  runtimeSession: string;
  scope: SeatLayerPickerScopeValue;
}>): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(false);
  const scopeRef = useRef(scope);
  const propsRef = useRef(props);
  const leaseRef = useRef<SeatLayerPickerWideNavigationLease>(
    seatLayerPickerWideNavigationLease(scope, runtimeSession),
  );
  const flightRef = useRef<Flight | undefined>(undefined);
  useLayoutEffect(() => { scopeRef.current = scope; propsRef.current = props; });
  useLayoutEffect(() => {
    activeRef.current = true;
    leaseRef.current = seatLayerPickerWideNavigationLease(scope, runtimeSession);
    flightRef.current = undefined;
    setBusy(false);
    return () => { activeRef.current = false; flightRef.current = undefined; };
  }, [runtimeSession, scope.controller, scope.sessionId]);
  const styles = useMemo(
    () => resolveSeatLayerPickerStyles(scope.styles, props.slots),
    [props.slots, scope.styles],
  );
  const start = (sectionId: string) => {
    const current = scopeRef.current;
    const lease = leaseRef.current;
    if (!activeRef.current || flightRef.current || !canFocusSeatLayerPickerWideSection(current, lease, sectionId)) return;
    const flight = Object.freeze({ token: Object.freeze({}), sectionId, lease });
    flightRef.current = flight;
    setBusy(true);
    void Promise.resolve(lease.controller.focusSection(sectionId)).then(
      () => {
        const latest = scopeRef.current;
        const liveLease = leaseRef.current;
        const stillValid = activeRef.current && sameSeatLayerPickerWideNavigationLease(flight.lease, liveLease) &&
          hasSeatLayerPickerWideNavigationSnapshot(latest, flight.lease) &&
          latest.controller.getSnapshot()?.sections.some((section) => section.id === flight.sectionId) === true &&
          supportsSeatLayerPickerWideNavigation(latest.controller, 'picker.focusSection');
        if (stillValid) observeSeatLayerPickerWideNavigation(propsRef.current.onSectionFocused, sectionId);
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
  const target = seatLayerPickerTokens.size.minimumHitTarget;
  const actionBusy = scope.isBusy || busy;
  const active = scope.snapshot?.map.focusedSectionId;
  // Focusing a section normally takes the runtime from this directory into
  // seats. Keep this keyed owner alive until its current command settles.
  if (scope.snapshot?.map.rung === 'seats') return null;
  return (
    <View style={[nativeStyles.root, styles.dockContainer, sanitizeSeatLayerPickerStyle(props.style)]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[nativeStyles.scroll, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row' }]}
      >
        {scope.snapshot?.sections.map((section) => {
          const selected = section.id === active;
          const disabled = actionBusy || selected;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="button"
              accessibilityLabel={section.displayLabel ?? section.label}
              accessibilityState={{ selected, disabled, busy: actionBusy }}
              disabled={disabled}
              onPress={() => start(section.id)}
              style={[nativeStyles.target, { minWidth: target, minHeight: target }]}
            >
              <View style={[nativeStyles.paint, {
                backgroundColor: selected
                  ? scope.resolvedTheme.colors.accent
                  : blendSeatLayerPickerColor(scope.resolvedTheme.colors.text, scope.resolvedTheme.colors.surface, .04, scope.resolvedTheme.colors.surface),
                borderColor: selected ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.divider,
              }, { borderRadius: seatLayerPickerTokens.radius.button }]}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={[nativeStyles.label, {
                  color: selected ? scope.resolvedTheme.colors.onAccent : scope.resolvedTheme.colors.text,
                  fontFamily: scope.resolvedTheme.fontFamily,
                }, styles.dockSectionText]}>
                  {section.displayLabel ?? section.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const nativeStyles = seatLayerPickerBoldStyles(StyleSheet.create({
  root: { width: '100%', minHeight: seatLayerPickerTokens.size.minimumHitTarget },
  scroll: { alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 2 },
  target: { justifyContent: 'center' },
  paint: { height: 40, maxWidth: 180, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
}));
