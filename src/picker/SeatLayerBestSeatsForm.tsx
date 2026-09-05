import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SeatLayerPickerBottomSheetFrame } from './SeatLayerPickerBottomSheetFrame';
import { SeatLayerPickerPromptModal } from './promptModal';
import { blendSeatLayerPickerColor } from './colors';
import type { SeatLayerPickerSafeAreaInsetInput } from './safeAreaInsets';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartSheet,
} from './cartSheetUi';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { supportsSeatLayerPickerSurface } from './surfaces';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerFontWeight } from './fontWeight';

type Scope = ReturnType<typeof useSeatLayerPickerScope>;
type ChoiceKind = 'category' | 'zone';
type PromptHandle = Exclude<ReturnType<Scope['claimPrompt']>, undefined>;
type ChoiceState = Readonly<{ kind: ChoiceKind; handle?: PromptHandle }>;

export interface SeatLayerBestSeatsFormProps {
  readonly initialQuantity?: number;
  /** The cart shortcut supplies this inside its existing prompt lease. */
  readonly allowFilled?: boolean;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles,
    'bestSeatsContainer' | 'bestSeatsSelector' | 'bestSeatsButton' | 'bestSeatsButtonText'>;
  readonly onFound?: (request: Readonly<{
    quantity: number;
    categoryKey?: string;
    zoneId?: string;
  }>) => unknown;
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 1;
}

function observe(callback: unknown, payload: unknown): void {
  if (typeof callback !== 'function') return;
  try { void Promise.resolve(callback(payload)).catch(() => {}); } catch { /* observational */ }
}

function focusedZone(scope: Scope): string | undefined {
  const sectionId = scope.snapshot?.map.focusedSectionId;
  const zoneId = scope.snapshot?.sections.find((section) => section.id === sectionId)?.zoneId;
  return zoneId && scope.snapshot?.bestAvailableZones.some((zone) => zone.id === zoneId)
    ? zoneId
    : undefined;
}

function bestAvailableAllowed(scope: Scope): boolean {
  const snapshot = scope.controller.getSnapshot();
  return snapshot !== undefined && scope.isReady && !scope.readOnly && !scope.isBusy &&
    scope.pendingSeat === null && snapshot.hold.owner !== 'host' &&
    !snapshot.event.salesClosed && snapshot.selectionValidity?.isValid !== false &&
    supportsSeatLayerPickerSurface(scope.controller, ['picker-actions-v1'], ['picker.bestAvailable']);
}

/** Empty-cart compact Best Available controls with a shared modal choice list. */
export function SeatLayerBestSeatsForm(props: SeatLayerBestSeatsFormProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbackRef = useRef(props.onFound);
  const mountedRef = useRef(true);
  const flightRef = useRef(0);
  const nextFlightRef = useRef(0);
  const sessionRef = useRef<Readonly<{ controller: Scope['controller']; scopeSession: number; runtimeSession: string | undefined }> | undefined>(undefined);
  const [quantity, setQuantity] = useState(() => positiveInteger(props.initialQuantity ?? 2));
  const [categoryKey, setCategoryKey] = useState<string | undefined>();
  const [zoneId, setZoneId] = useState<string | undefined>();
  const [choice, setChoice] = useState<ChoiceState | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    scopeRef.current = scope;
    callbackRef.current = props.onFound;
  }, [props.onFound, scope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; flightRef.current = 0; nextFlightRef.current += 1; };
  }, []);
  useLayoutEffect(() => {
    const runtimeSession = scope.snapshot?.sessionId;
    if (sessionRef.current?.controller === scope.controller && sessionRef.current.scopeSession === scope.sessionId && sessionRef.current.runtimeSession === runtimeSession) return;
    sessionRef.current = { controller: scope.controller, scopeSession: scope.sessionId, runtimeSession };
    flightRef.current = 0;
    nextFlightRef.current += 1;
    setSubmitting(false);
    setChoice((previous) => {
      previous?.handle?.dismiss();
      return undefined;
    });
    const maximum = positiveInteger(scope.snapshot?.maxSelection);
    setQuantity(Math.min(Math.max(1, positiveInteger(props.initialQuantity ?? 2)), maximum));
    const filter = scope.snapshot?.map.categoryFilter ?? [];
    setCategoryKey(filter.length === 1 && scope.snapshot?.categories.some(
      (category) => category.key === filter[0] && !category.notForSale,
    ) ? filter[0] : undefined);
    setZoneId(focusedZone(scope));
  }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);
  useLayoutEffect(() => {
    if (choice?.handle && scope.presentation.prompt?.context !== choice.handle.lease.context) {
      setChoice(undefined);
    }
  }, [choice, scope.presentation.prompt]);

  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.pendingSeat, scope.snapshot],
  );
  const snapshot = scope.snapshot;
  if (!snapshot || (projection.confirmed.items.length > 0 && !props.allowFilled)) return null;
  const categories = snapshot.categories.filter((category) => !category.notForSale);
  const zones = snapshot.bestAvailableZones;
  const maximum = positiveInteger(snapshot.maxSelection);
  const count = Math.min(Math.max(1, quantity), maximum);
  const allowed = !submitting && bestAvailableAllowed(scope);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, snapshot);

  const closeChoice = () => {
    choice?.handle?.dismiss();
    setChoice(undefined);
  };
  const openChoice = (kind: ChoiceKind) => {
    if (!allowed || choice) return;
    if (props.allowFilled) {
      setChoice({ kind });
      return;
    }
    const context = Object.freeze({ kind, sessionId: scope.sessionId });
    const handle = scope.claimPrompt('seatlayer-picker-best-seats', 'bestSeats', context);
    if (handle?.open()) setChoice({ kind, handle });
  };
  const submit = async () => {
    const before = scopeRef.current;
    const action = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    const live = action?.controller.getSnapshot();
    if (!action || !live || flightRef.current || !bestAvailableAllowed(before)) return;
    const request = Object.freeze({
      quantity: Math.min(Math.max(1, count), positiveInteger(live.maxSelection)),
      ...(live.categories.some((category) => category.key === categoryKey && !category.notForSale)
        ? { categoryKey } : {}),
      ...(live.bestAvailableZones.some((zone) => zone.id === zoneId) ? { zoneId } : {}),
    });
    const flight = ++nextFlightRef.current;
    flightRef.current = flight;
    setSubmitting(true);
    try {
      await before.controller.bestAvailable(request.quantity, {
        ...(request.categoryKey ? { categoryKey: request.categoryKey } : {}),
        ...(request.zoneId ? { zoneId: request.zoneId } : {}),
      });
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(action, scopeRef.current)) {
        observe(callbackRef.current, request);
        if (props.allowFilled) {
          choice?.handle?.dismiss();
          setChoice(undefined);
        }
      }
    } catch (error) {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(action, scopeRef.current)) {
        try { scopeRef.current.reportError(error); } catch { /* contained */ }
      }
    } finally {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(action, scopeRef.current)) {
        flightRef.current = 0;
        setSubmitting(false);
      }
    }
  };
  const categoryText = categories.find((category) => category.key === categoryKey)?.label
    ?? scope.strings.translate('anyTicketType');
  const zoneText = zones.find((zone) => zone.id === zoneId)?.label
    ?? scope.strings.translate('anyVenueZone');
  const choiceEntries = choice?.kind === 'category'
    ? categories.map((category) => ({ id: category.key, label: category.label }))
    : zones.map((zone) => ({ id: zone.id, label: zone.label }));

  const selector = (label: string, value: string, kind: ChoiceKind) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!allowed}
      accessibilityState={{ disabled: !allowed }} onPress={() => openChoice(kind)}
      testID={`seatlayer-best-seats-${kind}`}
      style={{ minHeight: seatLayerPickerTokens.size.minimumHitTarget, alignSelf: 'stretch', justifyContent: 'center' }}>
      <View style={[{ alignItems: 'center', backgroundColor: blendSeatLayerPickerColor(theme.colors.text, theme.colors.surface, .03, theme.colors.surface), borderColor: theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: 1, flexDirection: 'row', height: seatLayerPickerTokens.size.bestSeatsSelectHeight, paddingHorizontal: 10 }, styles.bestSeatsSelector]}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, flex: 1, fontFamily: theme.fontFamily, fontSize: seatLayerPickerTokens.type.bestSeatsSelect.size, fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.bestSeatsSelect.weight) }}>{value}</Text>
        <View accessible={false} style={{ borderBottomColor: allowed ? theme.colors.mutedText : theme.colors.divider, borderBottomWidth: 1.5, borderRightColor: allowed ? theme.colors.mutedText : theme.colors.divider, borderRightWidth: 1.5, height: 7, marginStart: 8, marginTop: -4, transform: [{ rotate: '45deg' }], width: 7 }} />
      </View>
    </Pressable>
  );
  const choiceList: ReactNode = (
    <View style={{ maxHeight: 360, padding: 12 }}>
      <ScrollView>{[{ id: undefined, label: choice?.kind === 'category' ? scope.strings.translate('anyTicketType') : scope.strings.translate('anyVenueZone') }, ...choiceEntries].map((entry) => (
        <Pressable key={entry.id ?? 'any'} accessibilityRole="radio"
          accessibilityState={{ selected: (choice?.kind === 'category' ? categoryKey : zoneId) === entry.id }}
          accessibilityLabel={entry.label} onPress={() => {
            if (choice?.kind === 'category') setCategoryKey(entry.id); else setZoneId(entry.id);
            closeChoice();
          }} style={{ minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.text, fontFamily: theme.fontFamily }}>{entry.label}</Text>
        </Pressable>
      ))}</ScrollView>
    </View>
  );
  const choices: ReactNode = props.allowFilled ? choiceList : (
    <SeatLayerPickerBottomSheetFrame
      borderColor={theme.roles.sheet.border}
      radius={theme.radii.sheet}
      safeAreaInsets={props.safeAreaInsets}
      scrimColor="rgba(0, 0, 0, 0.45)"
      surfaceColor={theme.roles.sheet.background}
    >
      {choiceList}
    </SeatLayerPickerBottomSheetFrame>
  );
  return (
    <View style={[{ gap: 8 }, styles.bestSeatsContainer, sanitizeSeatLayerPickerStyle(props.style)]}>
      {/* One decision per row. Where there is exactly one category the select
          is omitted and takes no row; the zone row exists only where the venue
          has zones (spec §3.11). */}
      {categories.length > 1 ? selector(scope.strings.translate('ticketType'), categoryText, 'category') : null}
      {zones.length > 0 ? selector(scope.strings.translate('venueZone'), zoneText, 'zone') : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BestSeatsStepper
          allowed={allowed}
          count={count}
          maximum={maximum}
          onDecrease={() => setQuantity((value) => Math.max(1, value - 1))}
          onIncrease={() => setQuantity((value) => Math.min(maximum, value + 1))}
          scope={scope}
          theme={theme}
        />
        <Pressable accessibilityRole="button" disabled={!allowed} accessibilityState={{ disabled: !allowed, busy: submitting }} onPress={() => { void submit(); }} testID="seatlayer-best-seats-action" style={{ minHeight: seatLayerPickerTokens.size.minimumHitTarget, flex: 1, justifyContent: 'center' }}>
          {/* Busy keeps the accent at slight transparency rather than going
              grey; disabled uses the checkout button's designed language. */}
          <View style={[{ alignItems: 'center', backgroundColor: allowed || submitting ? theme.colors.accent : theme.colors.surface, borderColor: allowed || submitting ? 'transparent' : theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: allowed || submitting ? 0 : 1, flexDirection: 'row', gap: 6, height: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', opacity: submitting ? .72 : 1, paddingHorizontal: 8 }, styles.bestSeatsButton]}>
            <Text accessible={false} style={{ color: allowed || submitting ? theme.colors.onAccent : theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 15 }}>✦</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[{ color: allowed || submitting ? theme.colors.onAccent : theme.colors.mutedText, flexShrink: 1, fontFamily: theme.fontFamily, fontSize: seatLayerPickerTokens.type.bestSeatsGo.size, fontWeight: seatLayerPickerFontWeight(seatLayerPickerTokens.type.bestSeatsGo.weight) }, styles.bestSeatsButtonText]}>{submitting ? scope.strings.translate('findingBestSeats') : scope.strings.translate('findBestSeats', { count, values: { count } })}</Text>
          </View>
        </Pressable>
      </View>
      {props.allowFilled ? (choice ? choices : null) : <SeatLayerPickerPromptModal visible={choice !== undefined}>{choices}</SeatLayerPickerPromptModal>}
    </View>
  );
}

function BestSeatsStepper({ allowed, count, maximum, onDecrease, onIncrease, scope, theme }: Readonly<{
  allowed: boolean;
  count: number;
  maximum: number;
  onDecrease: () => void;
  onIncrease: () => void;
  scope: Scope;
  theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;
}>): React.ReactElement {
  const decreaseDisabled = !allowed || count <= 1;
  const increaseDisabled = !allowed || count >= maximum;
  return <View testID="seatlayer-best-seats-stepper" style={{ alignItems: 'center', backgroundColor: blendSeatLayerPickerColor(theme.colors.text, theme.colors.surface, .03, theme.colors.surface), borderColor: theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: 1, flexDirection: 'row', height: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'space-between', width: seatLayerPickerTokens.size.bestSeatsStepperWidth }}>
    <StepperButton label={scope.strings.translate('fewerTickets')} disabled={decreaseDisabled} onPress={onDecrease} theme={theme}>−</StepperButton>
    <Text accessibilityLabel={scope.strings.translate('ticketCount', { count, values: { count } })} accessibilityLiveRegion="polite" style={{ color: theme.colors.text, flex: 1, fontFamily: theme.fontFamily, fontVariant: ['tabular-nums'], fontWeight: '800', textAlign: 'center' }}>{count}</Text>
    <StepperButton label={scope.strings.translate('moreTickets')} disabled={increaseDisabled} onPress={onIncrease} theme={theme}>+</StepperButton>
  </View>;
}

function StepperButton({ label, disabled, onPress, children, theme }: Readonly<{ label: string; disabled: boolean; onPress: () => void; children: string; theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme> }>): React.ReactElement {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={{ alignItems: 'center', justifyContent: 'center', minHeight: seatLayerPickerTokens.size.minimumHitTarget, width: seatLayerPickerTokens.size.minimumHitTarget }}><Text style={{ color: disabled ? theme.colors.mutedText : theme.colors.text, fontFamily: theme.fontFamily, fontSize: 18 }}>{children}</Text></Pressable>;
}
