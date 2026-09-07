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
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerFontWeight } from './fontWeight';
import { blendSeatLayerPickerColor } from './pickerNavigation';
import { seatLayerPickerColorAlpha } from './mapChromeTheme';
import { seatLayerPickerBold } from './boldText';

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
  const [aboutOpen, setAboutOpen] = useState(false);

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
      // The select is DRAWN at its own 34 and reaches the platform's 44 through
      // slop: given a 44 box each of the two selects grew the track by ten, and
      // the reference's form came out fourteen points short of this one.
      hitSlop={selectReach}
      style={{ minHeight: seatLayerPickerTokens.size.bestSeatsSelectHeight, alignSelf: 'stretch', justifyContent: 'center' }}>
      <View style={[{ alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: 1, flexDirection: 'row', height: seatLayerPickerTokens.size.bestSeatsSelectHeight, paddingEnd: 10, paddingStart: 9 }, styles.bestSeatsSelector]}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={{ color: theme.colors.text, flex: 1, fontFamily: theme.fontFamily, fontSize: seatLayerPickerTokens.type.bestSeatsSelect.size, fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.bestSeatsSelect.weight) }}>{value}</Text>
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
          <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{ color: theme.colors.text, fontFamily: theme.fontFamily }}>{entry.label}</Text>
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
    // ONE CARD, ONE TRACK. The reference draws the three rows on a plate of
    // their own — eight points of padding, an eleven-point corner, a border
    // walked a third of the way from the divider to the accent and a wash of
    // the accent over the surface. Without it the rows read as three loose
    // controls dropped on the sheet. React Native has no gradient of its own,
    // so the reference's .05 → .11 diagonal is drawn at its own mean.
    <View style={[{
      backgroundColor: blendSeatLayerPickerColor(theme.colors.accent, theme.colors.surface, trackWash, theme.colors.surface),
      borderColor: blendSeatLayerPickerColor(
        theme.colors.accent,
        // The divider AS SEEN, not as stated: it is a translucent ink, and
        // blending the accent over its raw channels ignored its own alpha and
        // painted the track's edge near-black (#5D2D40 against the
        // reference's #D79DA9).
        blendSeatLayerPickerColor(theme.colors.divider, theme.colors.surface, 1, theme.colors.divider),
        trackEdge,
        theme.colors.divider,
      ),
      borderRadius: trackRadius,
      borderWidth: 1,
      gap: trackRowGap,
      padding: 8,
    }, styles.bestSeatsContainer, sanitizeSeatLayerPickerStyle(props.style)]}>
      {/* ONE TITLE LINE, AND IT CANNOT WRAP. The card says what it is before
          the buyer reads the controls, which matters most while the action
          below is busy saying "Finding the best seats…" instead of what it
          does. The words are the only part of the line that may shrink, and
          they shrink by truncating: a title that wrapped to two lines was the
          whole cost this card was trying not to pay. */}
      <View style={{ alignItems: 'center', flexDirection: 'row' }}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} accessible={false} style={{ color: theme.colors.accent, fontFamily: theme.fontFamily, fontSize: 14 }}>✦</Text>
        <View style={{ width: 6 }} />
        <Text
          maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID="seatlayer-best-seats-title"
          style={{
            color: theme.colors.text,
            flexShrink: 1,
            fontFamily: theme.fontFamily,
            fontSize: titleSize,
            fontWeight: seatLayerPickerBold(800),
          }}
        >{scope.strings.translate('findSeatsTogether')}</Text>
        {/* The one-line explanation rides behind a ⓘ right after the title,
            not under it as a paragraph. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scope.strings.translate('aboutBestSeats')}
          accessibilityState={{ expanded: aboutOpen }}
          onPress={() => setAboutOpen((open) => !open)}
          testID="seatlayer-best-seats-about"
          hitSlop={aboutReach}
          style={{ alignItems: 'center', justifyContent: 'center', padding: 6 }}
        >
          <View accessible={false} style={{
            alignItems: 'center',
            backgroundColor: aboutOpen ? theme.colors.accent : 'transparent',
            borderColor: aboutOpen ? theme.colors.accent : theme.colors.mutedText,
            borderRadius: aboutGlyphSize / 2,
            borderWidth: 1.2,
            height: aboutGlyphSize,
            justifyContent: 'center',
            width: aboutGlyphSize,
          }}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{
              color: aboutOpen ? theme.colors.onAccent : theme.colors.mutedText,
              fontFamily: theme.fontFamily,
              fontSize: 9.5,
              fontWeight: seatLayerPickerBold(800),
            }}>i</Text>
          </View>
        </Pressable>
      </View>
      {aboutOpen
        ? (
          <Text
            maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
            testID="seatlayer-best-seats-about-text"
            style={{
              color: theme.colors.mutedText,
              fontFamily: theme.fontFamily,
              fontSize: 12,
              marginTop: -2,
            }}
          >{scope.strings.translate('closestGroupChosenInstantly')}</Text>
        )
        : null}
      {/* One decision per row. Where there is exactly one category the select
          is omitted and takes no row; the zone row exists only where the venue
          has zones (spec §3.11). */}
      {categories.length > 1 ? selector(scope.strings.translate('ticketType'), categoryText, 'category') : null}
      {zones.length > 0 ? selector(scope.strings.translate('venueZone'), zoneText, 'zone') : null}
      <View style={{ flexDirection: 'row', gap: trackRowGap, alignItems: 'center' }}>
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
          <View style={[{ alignItems: 'center', backgroundColor: allowed || submitting ? theme.colors.accent : theme.colors.surface, borderColor: allowed || submitting ? 'transparent' : theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: allowed || submitting ? 0 : 1, flexDirection: 'row', gap: 6, height: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.minimumHitTarget, seatLayerPickerTypeScaleClamp('sheet')), justifyContent: 'center', opacity: submitting ? .72 : 1, paddingHorizontal: 10 }, styles.bestSeatsButton]}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} accessible={false} style={{ color: allowed || submitting ? theme.colors.onAccent : theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 13 }}>✦</Text>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} ellipsizeMode="tail" style={[{ color: allowed || submitting ? theme.colors.onAccent : theme.colors.mutedText, flexShrink: 1, fontFamily: theme.fontFamily, fontSize: seatLayerPickerTokens.type.bestSeatsGo.size, fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.bestSeatsGo.weight) }, styles.bestSeatsButtonText]}>{submitting ? scope.strings.translate('findingBestSeats') : scope.strings.translate('findBestSeats', { count, values: { count } })}</Text>
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
  return <View testID="seatlayer-best-seats-stepper" style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.divider, borderRadius: seatLayerPickerTokens.radius.control, borderWidth: 1, flexDirection: 'row', height: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.minimumHitTarget, seatLayerPickerTypeScaleClamp('sheet')), justifyContent: 'space-between', padding: 2, width: seatLayerPickerTokens.size.bestSeatsStepperWidth }}>
    <StepperButton label={scope.strings.translate('fewerTickets')} disabled={decreaseDisabled} onPress={onDecrease} theme={theme}>−</StepperButton>
    <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} accessibilityLabel={scope.strings.translate('ticketCount', { count, values: { count } })} accessibilityLiveRegion="polite" style={{ color: theme.colors.text, flex: 1, fontFamily: theme.fontFamily, fontVariant: ['tabular-nums'], fontWeight: seatLayerPickerBold(800), textAlign: 'center' }}>{count}</Text>
    <StepperButton label={scope.strings.translate('moreTickets')} disabled={increaseDisabled} onPress={onIncrease} theme={theme}>+</StepperButton>
  </View>;
}

/**
 * One end of the stepper: a FILLED square key, not a bare glyph. The reference
 * draws a 34 pt square at a seven-point corner, washed in the divider at just
 * over a third, and sets the glyph at fourteen — a thumb finds the key without
 * looking, and the pair reads as a control rather than as two characters.
 */
function StepperButton({ label, disabled, onPress, children, theme }: Readonly<{ label: string; disabled: boolean; onPress: () => void; children: string; theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme> }>): React.ReactElement {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} hitSlop={stepKeyReach} style={{ alignItems: 'center', justifyContent: 'center', minHeight: stepKeySize, width: stepKeySize }}>
    <View pointerEvents="none" style={{ alignItems: 'center', backgroundColor: seatLayerPickerColorAlpha(theme.colors.divider, stepKeyWash), borderRadius: stepKeyRadius, height: stepKeySize, justifyContent: 'center', position: 'absolute', width: stepKeySize }} />
    <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{ color: disabled ? seatLayerPickerColorAlpha(theme.colors.mutedText, .4) : theme.colors.text, fontFamily: theme.fontFamily, fontSize: 14, fontWeight: seatLayerPickerBold(800) }}>{children}</Text>
  </Pressable>;
}

/** The reach a select takes around its own 34 points of paint. */
const selectReach = (seatLayerPickerTokens.size.minimumHitTarget
  - seatLayerPickerTokens.size.bestSeatsSelectHeight) / 2;
/** Edge of the drawn key at each end of the stepper. */
const stepKeySize = 34;
/**
 * The reach around it. The key is DRAWN at 34 because the reference draws it
 * there and the stepper's own 112 is measured to it; the touch it answers is
 * still the platform's 44, taken as slop outside the paint rather than as a
 * wider box that would walk both keys off the reference's geometry.
 */
const stepKeyReach = (seatLayerPickerTokens.size.minimumHitTarget - stepKeySize) / 2;
/** Its corner, and how much of the divider it is washed in. */
const stepKeyRadius = 7;
const stepKeyWash = .35;
/** The form's own plate: corner, wash over the surface, and its border's walk. */
const trackRadius = 11;
const trackWash = .08;
const trackEdge = .34;
/** Six between every row of the track, and between the stepper and its action. */
const trackRowGap = 6;
/** The title's own size; SHORT on purpose, and the only shrinking part. */
const titleSize = 12.5;
/** The ⓘ beside it: a small disc, reaching the platform's floor through slop. */
const aboutGlyphSize = 15;
const aboutReach = (seatLayerPickerTokens.size.minimumHitTarget - aboutGlyphSize - 12) / 2;
