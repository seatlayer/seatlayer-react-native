import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { SeatLayerPickerPromptLease } from './promptOwnership';
import { SeatLayerPickerPromptModal } from './promptModal';
import { useSeatLayerPickerScope, type SeatLayerPickerScopeValue } from './SeatLayerPickerScope';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import {
  normalizeSeatLayerPickerDecisionPromptInsets,
  type SeatLayerPickerDecisionPromptInsetInput,
} from './decisionPromptInputs';
import {
  SeatLayerPickerDecisionCoordinator,
  createSeatLayerPickerGACandidate,
  projectSeatLayerPickerDecision,
  type SeatLayerPickerDecision,
  type SeatLayerPickerDecisionCandidate,
  type SeatLayerPickerDecisionKind,
  type SeatLayerPickerDecisionScope,
  type SeatLayerPickerTableRemovalOperation,
} from './decisionPrompts';
import { seatLayerPickerTokens } from './tokens.g';

type PromptKind = Extract<SeatLayerPickerDecisionKind, 'ga' | 'table'>;
type PromptSlots = Pick<SeatLayerPickerStyles,
  'confirmCardContainer' | 'confirmCardIdentityText' | 'confirmCardPrimaryButton' |
  'confirmCardPrimaryButtonText' | 'confirmCardSecondaryButton' | 'confirmCardSecondaryButtonText'>;
type DecisionPromptStyles = Readonly<{
  card: StyleProp<ViewStyle> | undefined;
  title: StyleProp<TextStyle> | undefined;
  primary: StyleProp<ViewStyle> | undefined;
  primaryText: StyleProp<TextStyle> | undefined;
  secondary: StyleProp<ViewStyle> | undefined;
  secondaryText: StyleProp<TextStyle> | undefined;
}>;

export interface SeatLayerPickerDecisionObservation {
  readonly decision: SeatLayerPickerDecision;
}
export interface SeatLayerPickerGAPromptProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: PromptSlots;
  readonly safeAreaInsets?: SeatLayerPickerDecisionPromptInsetInput;
  readonly onDismiss?: (event: SeatLayerPickerDecisionObservation) => void;
  readonly onConfirm?: (event: SeatLayerPickerDecisionObservation) => void;
}
export interface SeatLayerPickerTablePromptProps extends SeatLayerPickerGAPromptProps {
  readonly candidate: SeatLayerPickerDecisionCandidate | undefined;
  /** Explicit operational replacement for picker.removeCartLine; observers never control it. */
  readonly onRemoveTable?: SeatLayerPickerTableRemovalOperation;
  readonly onRemoved?: (event: SeatLayerPickerDecisionObservation) => void;
}
export interface SeatLayerPickerSeatTierSelectorProps {
  readonly candidate: SeatLayerPickerDecisionCandidate | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<PromptSlots, 'confirmCardContainer' | 'confirmCardIdentityText'>;
  readonly value?: string | null;
  readonly onValueChange?: (value: string | null) => void;
}

type LeaseHandle = Readonly<{
  lease: SeatLayerPickerPromptLease;
  dismiss: () => boolean;
}>;
type ActivePrompt = Readonly<{
  candidate: SeatLayerPickerDecisionCandidate;
  sourceKey: string;
  handle: LeaseHandle;
  completed: { current: boolean };
  close: () => void;
  isCurrent: () => boolean;
}>;
type DecisionCallbacks = Readonly<{
  dismiss?: (event: SeatLayerPickerDecisionObservation) => void;
  confirm?: (event: SeatLayerPickerDecisionObservation) => void;
  removed?: (event: SeatLayerPickerDecisionObservation) => void;
}>;

function candidateKey(candidate: SeatLayerPickerDecisionCandidate | undefined): string {
  return candidate === undefined ? '' : JSON.stringify([
    candidate.kind, candidate.scopeSessionId, candidate.snapshotSessionId, candidate.epoch, candidate.id,
  ]);
}
function promptMatches(scope: SeatLayerPickerScopeValue, active: ActivePrompt, kind: PromptKind): boolean {
  return scope.presentation.prompt?.kind === `${kind}Decision` &&
    scope.presentation.prompt.context === active.handle.lease.context;
}
function observe(callback: ((event: SeatLayerPickerDecisionObservation) => void) | undefined, decision: SeatLayerPickerDecision): void {
  try { void Promise.resolve(callback?.(Object.freeze({ decision }))).catch(() => undefined); } catch { /* Observation cannot change picker ownership. */ }
}
function decisionScope(scope: SeatLayerPickerScopeValue): SeatLayerPickerDecisionScope {
  return Object.freeze({ controller: scope.controller, snapshot: scope.snapshot, sessionId: scope.sessionId, readOnly: scope.readOnly, isBusy: scope.isBusy });
}
function decisionStyles(scope: SeatLayerPickerScopeValue, slots: unknown): DecisionPromptStyles {
  const styles = resolveSeatLayerPickerStyles(scope.styles, slots as SeatLayerPickerStyles);
  return Object.freeze({
    card: styles.confirmCardContainer,
    title: styles.confirmCardIdentityText,
    primary: styles.confirmCardPrimaryButton,
    primaryText: styles.confirmCardPrimaryButtonText,
    secondary: styles.confirmCardSecondaryButton,
    secondaryText: styles.confirmCardSecondaryButtonText,
  });
}

function useCoordinator(): Readonly<{
  scope: SeatLayerPickerScopeValue;
  coordinator: SeatLayerPickerDecisionCoordinator;
  state: ReturnType<SeatLayerPickerDecisionCoordinator['getState']>;
}> {
  const scope = useSeatLayerPickerScope();
  const committedScope = useRef<SeatLayerPickerScopeValue>(scope);
  useLayoutEffect(() => { committedScope.current = scope; }, [scope]);
  const coordinatorRef = useRef<SeatLayerPickerDecisionCoordinator | undefined>(undefined);
  if (!coordinatorRef.current) coordinatorRef.current = new SeatLayerPickerDecisionCoordinator(() => decisionScope(committedScope.current));
  const coordinator = coordinatorRef.current;
  const state = useSyncExternalStore(coordinator.subscribe, coordinator.getState, coordinator.getState);
  useLayoutEffect(() => {
    coordinator.reset();
    return () => coordinator.reset();
  }, [coordinator, scope.controller, scope.sessionId]);
  useEffect(() => () => coordinator.dispose(), [coordinator]);
  return Object.freeze({ scope, coordinator, state });
}

function usePromptLease(
  kind: PromptKind,
  sourceKey: string,
  resolveCandidate: (scope: SeatLayerPickerScopeValue) => SeatLayerPickerDecisionCandidate | undefined,
  clearExact: (candidate: SeatLayerPickerDecisionCandidate) => void,
  callbacks: React.MutableRefObject<DecisionCallbacks>,
  coordinator: SeatLayerPickerDecisionCoordinator,
  scope: SeatLayerPickerScopeValue,
): ActivePrompt | undefined {
  const [active, setActive] = useState<ActivePrompt | undefined>(undefined);
  const decisionState = useSyncExternalStore(coordinator.subscribe, coordinator.getState, coordinator.getState);
  const dismissedKey = useRef<string | undefined>(undefined);
  const activeRef = useRef<ActivePrompt | undefined>(undefined);
  const committedSourceKey = useRef(sourceKey);
  useLayoutEffect(() => { activeRef.current = active; }, [active]);
  useLayoutEffect(() => { committedSourceKey.current = sourceKey; }, [sourceKey]);
  const retire = (value: ActivePrompt, reportDismissal = true) => {
    const decision = projectSeatLayerPickerDecision(decisionScope(scope), value.candidate);
    coordinator.dismiss(value.candidate.epoch);
    value.handle.dismiss();
    value.close();
    clearExact(value.candidate);
    if (reportDismissal && decision) observe(callbacks.current.dismiss, decision);
    if (activeRef.current === value) setActive(undefined);
  };
  useEffect(() => {
    const prior = activeRef.current;
    if (prior?.completed.current) {
      setActive(undefined);
      return;
    }
    if (dismissedKey.current !== undefined && dismissedKey.current !== sourceKey) dismissedKey.current = undefined;
    if (sourceKey && dismissedKey.current === sourceKey) return;
    const next = resolveCandidate(scope);
    const viable = next !== undefined && next.kind === kind &&
      projectSeatLayerPickerDecision(decisionScope(scope), next) !== undefined;
    if (prior && (!viable || candidateKey(prior.candidate) !== candidateKey(next))) {
      // A newer typed click is a replacement prompt, not an update to the old
      // command. Invalidate its generation before releasing only its lease.
      if (coordinator.getState().inFlight) coordinator.reset();
      // Runtime invalidation and a newer click are not buyer dismissals.
      retire(prior, false);
    }
    if (!next || !viable || activeRef.current || !coordinator.open(next)) return;
    const context = Object.freeze({ sourceKey, candidateEpoch: next.epoch });
    const claimed = scope.claimPrompt(`seatlayer-picker-${kind}-${candidateKey(next)}`, `${kind}Decision`, context);
    if (!claimed || !claimed.open()) {
      coordinator.dismiss(next.epoch);
      return;
    }
    const completed = { current: false };
    setActive(Object.freeze({
      candidate: next,
      sourceKey,
      handle: Object.freeze({ lease: claimed.lease, dismiss: claimed.dismiss }),
      completed,
      close: () => { dismissedKey.current = sourceKey; },
      isCurrent: () => committedSourceKey.current === sourceKey,
    }));
  }, [active, coordinator, kind, resolveCandidate, scope, sourceKey]);
  useEffect(() => {
    if (!active || promptMatches(scope, active, kind)) return;
    if (active.completed.current) {
      setActive(undefined);
      return;
    }
    const decision = projectSeatLayerPickerDecision(decisionScope(scope), active.candidate);
    if (coordinator.getState().inFlight) coordinator.reset();
    else coordinator.dismiss(active.candidate.epoch);
    clearExact(active.candidate);
    active.close();
    if (decision) observe(callbacks.current.dismiss, decision);
    setActive(undefined);
  }, [active, clearExact, coordinator, kind, scope]);
  useEffect(() => {
    if (active && !decisionState.inFlight && decisionState.candidate === undefined && !promptMatches(scope, active, kind)) setActive(undefined);
  }, [active, decisionState.candidate, decisionState.inFlight, kind, scope]);
  useEffect(() => () => {
    const current = activeRef.current;
    if (!current) return;
    coordinator.reset();
    current.handle.dismiss();
    clearExact(current.candidate);
  }, [clearExact, coordinator]);
  return active?.sourceKey === sourceKey ? active : undefined;
}

function PromptButton({
  label, accessibilityLabel, disabled, busy, primary, onPress, scope, styles,
}: Readonly<{
  label: string; accessibilityLabel?: string; disabled: boolean; busy: boolean; primary: boolean; onPress: () => void;
  scope: SeatLayerPickerScopeValue; styles: DecisionPromptStyles;
}>): React.ReactElement {
  const surface = primary ? styles.primary : styles.secondary;
  const text = primary ? styles.primaryText : styles.secondaryText;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} style={stylesNative.hit}>
    <View style={[stylesNative.buttonPaint, { backgroundColor: primary ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.surface, borderColor: primary ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.divider, borderRadius: seatLayerPickerTokens.radius.button, opacity: disabled ? .5 : 1 }, surface]}>
      <Text style={[stylesNative.buttonText, { color: primary ? scope.resolvedTheme.colors.onAccent : scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, text]}>{label}</Text>
    </View>
  </Pressable>;
}

function Quantity({
  value, minimum, maximum, onChange, disabled, label, scope, styles,
}: Readonly<{
  value: number; minimum: number; maximum: number; onChange: (value: number) => void; disabled: boolean;
  label: string; scope: SeatLayerPickerScopeValue; styles: DecisionPromptStyles;
}>): React.ReactElement {
  const decrement = () => onChange(Math.max(minimum, value - 1));
  const increment = () => onChange(Math.min(maximum, value + 1));
  const action = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    if (event.nativeEvent.actionName === 'increment' && value < maximum) increment();
    if (event.nativeEvent.actionName === 'decrement' && value > minimum) decrement();
  };
  return <View style={stylesNative.quantity}>
    <PromptButton label="−" accessibilityLabel={scope.strings.translate('fewerTickets')} disabled={disabled || value <= minimum} busy={disabled} primary={false} onPress={decrement} scope={scope} styles={styles} />
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={action} accessibilityState={{ disabled }} accessibilityValue={{ min: minimum, max: maximum, now: value }} style={stylesNative.quantityValue}>
      <Text style={[stylesNative.quantityText, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }]}>{value}</Text>
    </View>
    <PromptButton label="+" accessibilityLabel={scope.strings.translate('moreTickets')} disabled={disabled || value >= maximum} busy={disabled} primary={false} onPress={increment} scope={scope} styles={styles} />
  </View>;
}

function tierGuidance(scope: SeatLayerPickerScopeValue, tier: Readonly<{ buyerMessage?: string; restriction?: string }>): string | undefined {
  if (typeof tier.buyerMessage === 'string' && tier.buyerMessage) return tier.buyerMessage;
  if (tier.restriction !== 'companion') return undefined;
  const key = 'tierCompanionGuidance';
  const resolved = scope.strings.translate(key);
  return resolved === key ? undefined : resolved;
}

function TierChoices({
  decision, value, onChange, disabled, scope, styles,
}: Readonly<{
  decision: Extract<SeatLayerPickerDecision, { kind: 'ga' | 'tier' }>;
  value: string | null | undefined; onChange: (value: string) => void; disabled: boolean;
  scope: SeatLayerPickerScopeValue; styles: DecisionPromptStyles;
}>): React.ReactElement | null {
  const tiers = decision.kind === 'ga' ? decision.area.tiers ?? [] : decision.tiers;
  if (tiers.length === 0) return null;
  const currency = decision.kind === 'ga' ? decision.area.currency ?? scope.snapshot?.currency ?? 'USD' : decision.seat.currency ?? scope.snapshot?.currency ?? 'USD';
  return <View accessibilityRole="radiogroup" style={stylesNative.tiers}>{tiers.map((tier) => {
    const selected = tier.id === value; const guidance = tierGuidance(scope, tier);
    const decisionText = [tier.name, scope.formatMoney(tier.price, tier.currency ?? currency), guidance].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' · ');
    return <Pressable key={tier.id} accessibilityRole="radio" accessibilityLabel={decisionText} accessibilityValue={{ text: decisionText }} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => onChange(tier.id)} style={stylesNative.tierHit}>
      <View style={[stylesNative.tierPaint, { borderColor: selected ? scope.resolvedTheme.colors.accent : scope.resolvedTheme.colors.divider, borderRadius: seatLayerPickerTokens.radius.button }, styles.card]}>
        <Text style={[stylesNative.tierName, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.title]}>{tier.name}</Text>
        {guidance ? <Text style={[stylesNative.guidance, { color: scope.resolvedTheme.colors.mutedText, fontFamily: scope.resolvedTheme.fontFamily }, styles.title]}>{guidance}</Text> : null}
        <Text style={[stylesNative.tierPrice, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.title]}>{scope.formatMoney(tier.price, tier.currency ?? currency)}</Text>
      </View>
    </Pressable>;
  })}</View>;
}

function ModalPrompt({
  kind, active, coordinator, scope, slots, style, safeAreaInsets, callbacks, removeOperation,
}: Readonly<{
  kind: PromptKind; active: ActivePrompt; coordinator: SeatLayerPickerDecisionCoordinator; scope: SeatLayerPickerScopeValue;
  slots: unknown; style: StyleProp<ViewStyle> | undefined; safeAreaInsets: SeatLayerPickerDecisionPromptInsetInput | undefined;
  callbacks: React.MutableRefObject<DecisionCallbacks>;
  removeOperation?: SeatLayerPickerTableRemovalOperation;
}>): React.ReactElement | null {
  const state = useSyncExternalStore(coordinator.subscribe, coordinator.getState, coordinator.getState);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const candidate = active.candidate;
  const first = projectSeatLayerPickerDecision(decisionScope(scope), candidate);
  const [quantity, setQuantity] = useState(first?.kind === 'ga' || first?.kind === 'table' ? first.quantity : 1);
  const [tierId, setTierId] = useState<string | undefined>(first?.kind === 'ga' ? first.tierId : undefined);
  const key = candidateKey(candidate);
  const promptKey = useRef(key);
  const decision = projectSeatLayerPickerDecision(decisionScope(scope), candidate, quantity, tierId);
  useEffect(() => {
    if (promptKey.current === key) return;
    promptKey.current = key;
    if (first?.kind === 'ga' || first?.kind === 'table') setQuantity(first.quantity);
    setTierId(first?.kind === 'ga' ? first.tierId : undefined);
  }, [first, key]);
  useEffect(() => {
    if (decision?.kind === 'ga' || decision?.kind === 'table') setQuantity((current) => Math.max(decision.minimum, Math.min(decision.maximum, current)));
  }, [decision?.kind, decision?.kind === 'ga' || decision?.kind === 'table' ? decision.minimum : undefined, decision?.kind === 'ga' || decision?.kind === 'table' ? decision.maximum : undefined]);
  useEffect(() => {
    if (decision?.kind !== 'ga') return;
    const tiers = decision.area.tiers ?? [];
    setTierId((current) => tiers.length === 0 ? undefined : tiers.some((tier) => tier.id === current) ? current : decision.tierId);
  }, [key, decision?.kind === 'ga' ? decision.area.tiers : undefined, decision?.kind === 'ga' ? decision.tierId : undefined]);
  if (!decision || decision.kind === 'tier' || !promptMatches(scope, active, kind)) return null;
  const inFlight = state.inFlight || scope.isBusy;
  const tierIsReady = decision.kind !== 'ga' ||
    ((decision.area.tiers?.length ?? 0) === 0 ? tierId === undefined :
      tierId !== undefined && decision.area.tiers!.some((tier) => tier.id === tierId));
  // A replacement click or removed choice must project its new selection before
  // the command is enabled; strict coordinator validation remains the backstop.
  const canConfirm = !inFlight && promptKey.current === key && tierIsReady;
  const styles = decisionStyles(scope, slots); const insets = normalizeSeatLayerPickerDecisionPromptInsets(safeAreaInsets);
  const localCard = sanitizeSeatLayerPickerStyle(style);
  const dismiss = () => { if (!inFlight) void scope.back(); };
  const confirm = async () => {
    if (!canConfirm || !active.isCurrent() || !promptMatches(scope, active, kind) || coordinator.getState().candidate !== candidate) return;
    const result = await coordinator.commit(quantity, tierId);
    if (!result || !mounted.current) return;
    active.completed.current = true;
    active.close();
    active.handle.dismiss();
    if (candidate.clickEpoch !== undefined) candidate.controller.clearGACandidate(candidate.clickEpoch);
    observe(callbacks.current.confirm, result);
  };
  const remove = async () => {
    if (!active.isCurrent() || !promptMatches(scope, active, kind) || coordinator.getState().candidate !== candidate) return;
    const result = await coordinator.removeTable(removeOperation);
    if (!result || !mounted.current) return;
    active.completed.current = true;
    active.close();
    active.handle.dismiss();
    observe(callbacks.current.removed, result);
  };
  const title = decision.kind === 'ga' ? decision.area.label ?? scope.strings.translate('generalAdmission') : decision.seat.displayLabel ?? decision.seat.label;
  const subtitle = decision.kind === 'ga'
    ? scope.strings.translate('placesAvailable', { values: { count: decision.available }, count: decision.available })
    : scope.strings.translate('chooseTableGuests');
  return <SeatLayerPickerPromptModal visible>
    <Pressable accessible={false} onPress={dismiss} style={[stylesNative.scrim, { backgroundColor: scope.resolvedTheme.colors.text, opacity: .42, paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left }]} />
    <View accessibilityViewIsModal style={[stylesNative.modalLayer, { paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left }]} pointerEvents="box-none">
      <View style={[stylesNative.card, { backgroundColor: scope.resolvedTheme.colors.surface, borderColor: scope.resolvedTheme.colors.divider, borderRadius: seatLayerPickerTokens.radius.card, padding: seatLayerPickerTokens.size.confirmCardGutter }, styles.card, localCard]}>
        <Text accessibilityRole="header" style={[stylesNative.title, { color: scope.resolvedTheme.colors.text, fontFamily: scope.resolvedTheme.fontFamily }, styles.title]}>{title}</Text>
        <Text style={[stylesNative.subtitle, { color: scope.resolvedTheme.colors.mutedText, fontFamily: scope.resolvedTheme.fontFamily }]}>{subtitle}</Text>
        <Quantity value={decision.quantity} minimum={decision.minimum} maximum={decision.maximum} onChange={setQuantity} disabled={inFlight} label={scope.strings.translate(decision.kind === 'table' ? 'chooseTableGuests' : 'chooseTickets')} scope={scope} styles={styles} />
        {decision.kind === 'ga' && (decision.area.tiers?.length ?? 0) > 0 ? <ScrollView style={stylesNative.tierScroll} contentContainerStyle={stylesNative.tierScrollContent}><TierChoices decision={decision} value={tierId ?? decision.tierId} onChange={setTierId} disabled={inFlight} scope={scope} styles={styles} /></ScrollView> : null}
        {state.error ? <Text accessibilityLiveRegion="assertive" style={[stylesNative.error, { color: scope.resolvedTheme.colors.error, fontFamily: scope.resolvedTheme.fontFamily }]}>{scope.strings.translate('errorMessage')}</Text> : null}
        <View style={stylesNative.actions}>
          <PromptButton label={kind === 'ga' ? scope.strings.translate('cancel') : scope.strings.translate('removeSeat')} disabled={inFlight} busy={inFlight} primary={false} onPress={kind === 'ga' ? dismiss : () => { void remove(); }} scope={scope} styles={styles} />
          <PromptButton label={kind === 'ga' ? scope.strings.translate('addTickets') : scope.strings.translate('confirmTable')} disabled={!canConfirm} busy={inFlight} primary onPress={() => { void confirm(); }} scope={scope} styles={styles} />
        </View>
      </View>
    </View>
  </SeatLayerPickerPromptModal>;
}

function useCallbacks(callbacks: DecisionCallbacks): React.MutableRefObject<DecisionCallbacks> {
  const current = useRef(callbacks);
  useLayoutEffect(() => { current.current = callbacks; }, [callbacks]);
  return current;
}

/** Controller-store-backed GA prompt. It subscribes only to the typed GA candidate store. */
export function SeatLayerPickerGAPrompt(props: SeatLayerPickerGAPromptProps): React.ReactElement | null {
  const { scope, coordinator } = useCoordinator();
  const click = useSyncExternalStore(scope.controller.subscribeGACandidate, scope.controller.getGACandidate, scope.controller.getGACandidate);
  const callbacks = useCallbacks(Object.freeze({ dismiss: props.onDismiss, confirm: props.onConfirm }));
  const resolve = useMemo(() => (value: SeatLayerPickerScopeValue) => click ? createSeatLayerPickerGACandidate(decisionScope(value), click.clickEpoch, click.areaId) : undefined, [click]);
  const clear = useMemo(() => (candidate: SeatLayerPickerDecisionCandidate) => { if (candidate.clickEpoch !== undefined) candidate.controller.clearGACandidate(candidate.clickEpoch); }, []);
  const active = usePromptLease('ga', click ? `${click.clickEpoch}:${click.areaId}` : '', resolve, clear, callbacks, coordinator, scope);
  return active ? <ModalPrompt kind="ga" active={active} coordinator={coordinator} scope={scope} slots={props.slots} style={props.style} safeAreaInsets={props.safeAreaInsets} callbacks={callbacks} /> : null;
}

/** Scoped variable-table prompt. onRemoveTable is the only host-controlled mutation seam. */
export function SeatLayerPickerTablePrompt(props: SeatLayerPickerTablePromptProps): React.ReactElement | null {
  const { scope, coordinator } = useCoordinator();
  const callbacks = useCallbacks(Object.freeze({ dismiss: props.onDismiss, confirm: props.onConfirm, removed: props.onRemoved }));
  const resolve = useMemo(() => () => props.candidate, [props.candidate]);
  const clear = useMemo(() => () => undefined, []);
  const active = usePromptLease('table', candidateKey(props.candidate), resolve, clear, callbacks, coordinator, scope);
  return active ? <ModalPrompt kind="table" active={active} coordinator={coordinator} scope={scope} slots={props.slots} style={props.style} safeAreaInsets={props.safeAreaInsets} callbacks={callbacks} removeOperation={props.onRemoveTable} /> : null;
}

/** Inline seat-tier selector for the confirmation card; it deliberately has no Select action. */
export function SeatLayerPickerSeatTierSelector(props: SeatLayerPickerSeatTierSelectorProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const decision = projectSeatLayerPickerDecision(decisionScope(scope), props.candidate);
  const key = candidateKey(props.candidate);
  const [localValue, setLocalValue] = useState<string | null>(decision?.kind === 'tier' ? decision.tierId : null);
  const authoritativeRef = useRef<string | undefined>(undefined);
  const tierSignature = decision?.kind === 'tier' ? JSON.stringify(decision.tiers.map((tier) => tier.id)) : '';
  const authoritativeTier = decision?.kind === 'tier' ? decision.tierId : null;
  useEffect(() => {
    if (decision?.kind !== 'tier') return;
    const authority = `${key}:${authoritativeTier ?? ''}:${tierSignature}`;
    const validLocal = localValue !== null && decision.tiers.some((tier) => tier.id === localValue);
    if (authoritativeRef.current === undefined || authoritativeRef.current !== authority || !validLocal) setLocalValue(decision.tierId);
    authoritativeRef.current = authority;
  }, [authoritativeTier, key, localValue, tierSignature]);
  if (decision?.kind !== 'tier') return null;
  const selected = props.value === undefined ? localValue : props.value;
  const tiers = decision.tiers;
  const value = selected !== null && tiers.some((tier) => tier.id === selected) ? selected : decision.tierId;
  const change = (tierId: string) => {
    if (props.value === undefined) setLocalValue(tierId);
    try { void Promise.resolve(props.onValueChange?.(tierId)).catch(() => undefined); } catch { /* Tier observation never controls confirmation ownership. */ }
  };
  const styles = decisionStyles(scope, props.slots); const localStyle = sanitizeSeatLayerPickerStyle(props.style);
  const singleGuidance = tiers.length === 1 ? tierGuidance(scope, tiers[0]!) : undefined;
  if (tiers.length < 2) return singleGuidance ? <Text style={[stylesNative.guidance, { color: scope.resolvedTheme.colors.mutedText, fontFamily: scope.resolvedTheme.fontFamily }, styles.title]}>{singleGuidance}</Text> : null;
  return <View style={[stylesNative.inline, styles.card, localStyle]}>
    <TierChoices decision={decision} value={value} onChange={change} disabled={scope.isBusy} scope={scope} styles={styles} />
  </View>;
}

const stylesNative = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '900' }, subtitle: { marginTop: 3, fontSize: 14 },
  quantity: { minHeight: seatLayerPickerTokens.size.minimumHitTarget, marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  quantityValue: { minWidth: 70, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center', alignItems: 'center' }, quantityText: { fontSize: 24, fontWeight: '700' },
  hit: { flex: 1, minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' }, buttonPaint: { height: seatLayerPickerTokens.size.confirmActionHeight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, paddingHorizontal: 10 }, buttonText: { fontSize: 14, fontWeight: '800' },
  tierScroll: { maxHeight: seatLayerPickerTokens.size.confirmActionHeight * 5 }, tierScrollContent: { paddingBottom: seatLayerPickerTokens.size.confirmCardGutter }, tiers: { marginTop: 14, gap: 8 }, tierHit: { minHeight: seatLayerPickerTokens.size.minimumHitTarget, justifyContent: 'center' }, tierPaint: { minHeight: seatLayerPickerTokens.size.confirmActionHeight, justifyContent: 'center', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 }, tierName: { fontSize: 14, fontWeight: '800' }, tierPrice: { fontSize: 13, fontWeight: '800' }, guidance: { marginTop: 2, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 }, error: { marginTop: 10, fontSize: 13 }, inline: { gap: 8 },
});
