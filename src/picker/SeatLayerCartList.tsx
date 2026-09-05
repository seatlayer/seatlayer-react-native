import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { CartRemovalMarkCoordinator } from './cartRemovalUndoState';
import {
  SeatLayerCartCellCrossFade,
  SeatLayerCartRowArrival,
  SeatLayerCartSwipeToRemove,
} from './cartRowMotion';
import { chartSeatLayerPickerColor } from './chartColor';
import { resolveSeatLayerPickerMapChromeTheme, seatLayerPickerColorAlpha } from './mapChromeTheme';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartRuns,
  projectSeatLayerCartSheet,
  visibleSeatLayerCartRuns,
} from './cartSheetUi';
import { runMembersInSeatOrder, type DenseTicketLine, type DenseTicketRun } from './cartDense';
import {
  seatLayerPickerCartLineKeepsRemove, seatLayerPickerHoldOwnershipStore,
} from './holdOwnership';
import type { SeatLayerPickerCartLine } from './models';

export interface SeatLayerCartListProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles, 'denseLineContainer' | 'denseLineText' | 'denseLineRemoveButton' | 'denseLineRemoveButtonText'>;
  readonly onSeatRemoved?: (line: Readonly<SeatLayerPickerCartLine>) => unknown;
  readonly children?: ReactNode;
}

type Current = ReturnType<typeof useSeatLayerPickerScope>;
type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

function observe(callback: unknown, value: unknown): void {
  if (typeof callback !== 'function') return;
  try { void Promise.resolve(callback(value)).catch(() => {}); } catch { /* Observers cannot affect a cart command. */ }
}

/**
 * The dense, folded confirmed cart — ONE PLATE, rows divided by hairlines
 * rather than each row being its own card (spec §3.10.2).
 *
 * Nothing is said when a line goes: the press is answered by the row itself,
 * which fades to `opacity.removing`, goes inert and stops being swipeable until
 * the snapshot that no longer carries it arrives. A removal that FAILS restores
 * the row and states itself through the inline action error.
 */
export function SeatLayerCartList(props: SeatLayerCartListProps): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const current = useRef<Current>(scope);
  const observers = useRef({ onSeatRemoved: props.onSeatRemoved });
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  const marks = useRef(new CartRemovalMarkCoordinator<SeatLayerPickerCartLine>(() => {
    if (mounted.current) setVersion((value) => value + 1);
  }));
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const revision = useRef(-1);
  useLayoutEffect(() => {
    current.current = scope;
    observers.current = { onSeatRemoved: props.onSeatRemoved };
  }, [props.onSeatRemoved, scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; marks.current.dispose(); }; }, []);
  useLayoutEffect(() => {
    marks.current.reset();
    revision.current = -1;
    setOpenRuns(new Set());
    setShowAll(false);
    setVersion((value) => value + 1);
  }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);
  useLayoutEffect(() => {
    const snapshot = scope.snapshot;
    if (!snapshot || snapshot.revision <= revision.current) return;
    revision.current = snapshot.revision;
    // The mark is dropped by the first snapshot that no longer carries the line.
    marks.current.reconcile(snapshot.cartLines);
  }, [scope.snapshot]);

  const projection = useMemo(
    () => projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat),
    [scope.snapshot, scope.pendingSeat, version],
  );
  const renderProjection = {
    ...projection,
    runs: projectSeatLayerCartRuns(scope.snapshot, projection.confirmed.items),
  };
  const visible = visibleSeatLayerCartRuns(renderProjection, showAll);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const visibleRuns = visible.visible;
  if (!visibleRuns.length) return null;
  // §3.13.13 — the line keeps its × while the host owns the hold. Removing it
  // is refused by the runtime, and that refusal is what raises the notice: a
  // control the buyer can press and be told about beats one that has silently
  // gone.
  const canRemove = !scope.readOnly && seatLayerPickerCartLineKeepsRemove(scope.snapshot) &&
    supportsSeatLayerPickerSurface(scope.controller, ['cart-line-remove-v1'], ['picker.removeCartLine']);

  const remove = async (line: DenseTicketLine<SeatLayerPickerCartLine>, run?: DenseTicketRun<SeatLayerPickerCartLine>) => {
    const before = current.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    const live = lease?.controller.getSnapshot();
    if (!lease || !live || before.readOnly ||
      !supportsSeatLayerPickerSurface(before.controller, ['cart-line-remove-v1'], ['picker.removeCartLine'])) return;
    // A run's × removes the whole run, and says so.
    const lines = (run?.isGroup ? run.members : [line]).map((member) => member.item);
    const started = marks.current.beginMany(lines, before.sessionId);
    if (!started.intent || !started.mark) return;
    const token = started.mark.token;
    // Felt, not just seen: the gesture is confirmed under the finger rather
    // than whenever the server finishes.
    try { before.emitHaptic('ticketRemoved'); } catch { /* a cue is advisory */ }
    // §3.10.2 — in flight, but not in the way: `removingCartLine` is the one
    // action that does not block Continue.
    before.setBusyAction('removingCartLine');
    try {
      for (const label of started.intent.labels) {
        // Inventory mutations are serialised by the controller, so a Continue
        // pressed during a removal is sent after it.
        await before.controller.removeCartLine(label);
      }
      if (!mounted.current || !isSeatLayerCartActionCurrent(lease, current.current)) return;
      // A reply that left the line standing is not a removal; the row comes
      // back rather than staying faded for good. Where the line really did go
      // the mark is already spent and this is a no-op.
      marks.current.release(token);
      observe(observers.current.onSeatRemoved, Object.freeze({ ...line.item }));
    } catch (error) {
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current)) {
        marks.current.release(token);
        // A hold the host already owns is not a command failure; it is the
        // "already in checkout" state, and it is told once, in its own notice.
        const raised = seatLayerPickerHoldOwnershipStore(before.controller)
          .raise(error, before.controller.getCheckoutHandoff());
        if (raised) return;
        try { current.current.reportError(error); } catch { /* scope reporting is advisory */ }
      }
    } finally {
      if (isSeatLayerCartActionCurrent(lease, current.current)) current.current.setBusyAction(null);
    }
  };

  const plate = {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.divider,
    borderRadius: seatLayerPickerTokens.radius.base * seatLayerPickerTokens.radius.smallRatio,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden' as const,
  };
  const moreLabel = scope.strings.translate(showAll ? 'showLess' : 'moreCount', {
    count: visible.hiddenCount,
    values: { count: visible.hiddenCount },
  });
  return (
    <View style={[sanitizeSeatLayerPickerStyle(props.style), { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
      <View style={plate} testID="seatlayer-cart-plate">
        {visibleRuns.map((run, index) => {
          const runKey = JSON.stringify(run.members.map((member) =>
            [member.identity.lineKey, member.identity.removalLabel, member.identity.objectId, member.identity.seatId]));
          return (
            <SeatLayerCartRowArrival key={runKey} index={index}>
              <Run
                run={run}
                first={index === 0}
                open={openRuns.has(runKey)}
                canRemove={canRemove}
                marks={marks.current}
                theme={theme}
                styles={styles}
                onToggle={() => setOpenRuns((value) => {
                  const next = new Set(value);
                  if (next.has(runKey)) next.delete(runKey); else next.add(runKey);
                  return next;
                })}
                onRemove={remove}
              />
            </SeatLayerCartRowArrival>
          );
        })}
        {visible.canToggle
          ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={moreLabel}
              accessibilityState={{ expanded: showAll }}
              onPress={() => setShowAll((value) => !value)}
              testID="seatlayer-cart-more-row"
              style={{
                borderTopColor: seatLayerPickerColorAlpha(theme.colors.divider, .7),
                borderTopWidth: StyleSheet.hairlineWidth,
                height: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.denseMoreRowHeight, seatLayerPickerTypeScaleClamp('sheet')),
                justifyContent: 'center',
                paddingHorizontal: 9,
              }}
            >
              <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={[{
                color: theme.colors.accent,
                fontFamily: theme.fontFamily,
                fontSize: seatLayerPickerTokens.type.denseMore.size,
                fontWeight: String(seatLayerPickerTokens.type.denseMore.weight) as 'normal',
              }, styles.denseLineText]}>{moreLabel}</Text>
            </Pressable>
          )
          : null}
      </View>
      {props.children}
    </View>
  );
}

function Run({ run, first, open, canRemove, marks, theme, styles, onToggle, onRemove }: Readonly<{
  run: DenseTicketRun<SeatLayerPickerCartLine>;
  first: boolean;
  open: boolean;
  canRemove: boolean;
  marks: CartRemovalMarkCoordinator<SeatLayerPickerCartLine>;
  theme: Theme;
  styles: SeatLayerPickerStyles;
  onToggle: () => void;
  onRemove: (line: DenseTicketLine<SeatLayerPickerCartLine>, run?: DenseTicketRun<SeatLayerPickerCartLine>) => void;
}>): React.ReactElement {
  const head = (
    <DenseLine
      key="summary"
      line={run.members[0]!}
      run={run}
      first={first}
      expanded={open}
      canRemove={canRemove}
      marks={marks}
      theme={theme}
      styles={styles}
      onToggle={run.isGroup ? onToggle : undefined}
      onRemove={onRemove}
    />
  );
  if (!run.isGroup || !open) return <View>{head}</View>;
  // An opened run lists its members in seat order, matching the range its own
  // label states, indented on a faint ground.
  return <View>{head}{runMembersInSeatOrder(run).map((line, index) => (
    <DenseLine
      key={`${line.identity.lineKey ?? line.identity.removalLabel ?? index}`}
      line={line}
      member
      first={false}
      canRemove={canRemove}
      marks={marks}
      theme={theme}
      styles={styles}
      onRemove={onRemove}
    />
  ))}</View>;
}

function DenseLine({ line, run, first, member, expanded, canRemove, marks, theme, styles, onToggle, onRemove }: Readonly<{
  line: DenseTicketLine<SeatLayerPickerCartLine>;
  run?: DenseTicketRun<SeatLayerPickerCartLine>;
  first: boolean;
  member?: boolean;
  expanded?: boolean;
  canRemove: boolean;
  marks: CartRemovalMarkCoordinator<SeatLayerPickerCartLine>;
  theme: Theme;
  styles: SeatLayerPickerStyles;
  onToggle?: () => void;
  onRemove: (line: DenseTicketLine<SeatLayerPickerCartLine>, run?: DenseTicketRun<SeatLayerPickerCartLine>) => void;
}>): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const group = run?.isGroup === true ? run : undefined;
  const total = run?.total ?? line.total;
  const amount = total === null || !line.currency ? '' : scope.formatMoney(total, line.currency);
  const unit = line.unitPrice === null || !line.currency ? '' : scope.formatMoney(line.unitPrice, line.currency);
  const seats = run?.seatsLabel ?? line.seatLabel;
  // The SECTION is the only part that ellipsizes — or the seat label where
  // there is no section; the row and seats never shrink.
  const leading = line.section || seats;
  const trailingParts = (line.section ? [line.rowLabel, seats] : [line.rowLabel]).filter(Boolean);
  const identity = [leading, ...trailingParts].filter(Boolean).join(' · ');
  const quantity = run?.quantity ?? line.quantity;
  const quantityAmount = quantity > 1 && unit ? `${quantity} × ${unit}` : '';
  const category = scope.snapshot?.categories.find((item) => item.key === line.categoryKey);
  const categoryColor = chartSeatLayerPickerColor(category?.color, theme.colors.accent);
  // The category NAME is not on the line; its colour is the dot, and the name
  // goes to the accessible label.
  const spokenType = line.categoryLabel.toLowerCase() === line.section.toLowerCase()
    ? '' : `${line.categoryLabel}, `;
  const removing = marks.isRemoving(line.item);
  const held = line.held;
  const removable = canRemove && !held && !removing;
  const row = (
    <View
      accessible
      accessibilityLabel={`${spokenType}${identity}, ${[quantityAmount, amount].filter(Boolean).join(', ')}`}
      style={[{
        alignItems: 'center',
        // A held row is inventory the server has already set aside: a wash of
        // the accent and a bar down its leading edge say so without a word.
        backgroundColor: held
          ? seatLayerPickerColorAlpha(theme.colors.accent, .07)
          : member
            ? seatLayerPickerColorAlpha(theme.colors.divider, .16)
            : 'transparent',
        borderTopColor: seatLayerPickerColorAlpha(theme.colors.divider, .7),
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        flexDirection: 'row',
        // §4.10 — a cart row is `base x the sheet's clamped scale`.
        height: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.denseLineHeight, seatLayerPickerTypeScaleClamp('sheet')),
        opacity: removing ? seatLayerPickerTokens.opacity.removing : 1,
        paddingEnd: 4,
        paddingStart: member ? 26 : 9,
      }, styles.denseLineContainer]}
      testID={removing ? 'seatlayer-cart-row-removing' : 'seatlayer-cart-row'}
    >
      {held
        ? <View accessible={false} pointerEvents="none" style={{ backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .72), bottom: 0, position: 'absolute', start: 0, top: 0, width: 3 }} />
        : null}
      <Pressable
        accessibilityRole={onToggle ? 'button' : undefined}
        accessibilityLabel={onToggle ? identity : undefined}
        accessibilityState={onToggle ? { expanded } : undefined}
        disabled={!onToggle}
        onPress={onToggle}
        style={{ alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: seatLayerPickerTokens.size.minimumHitTarget }}
      >
        <LineMark group={group !== undefined} held={held} open={expanded === true} color={categoryColor} theme={theme} />
        <View style={{ width: 7 }} />
        <SeatLayerCartCellCrossFade token={identity} style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} ellipsizeMode="tail" style={[{
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
            fontSize: seatLayerPickerTokens.type.denseLine.size,
            fontVariant: ['tabular-nums'],
            fontWeight: String(seatLayerPickerTokens.type.denseLine.weight) as 'normal',
          }, styles.denseLineText]}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={{ fontWeight: '800' }}>{leading}</Text>
            {trailingParts.map((part) => (
              <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} key={part} style={{ color: theme.colors.mutedText }}>{` · ${part}`}</Text>
            ))}
          </Text>
        </SeatLayerCartCellCrossFade>
      </Pressable>
      {quantityAmount
        ? (
          <SeatLayerCartCellCrossFade token={quantityAmount}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={[{
              color: theme.colors.mutedText,
              fontFamily: theme.fontFamily,
              fontSize: seatLayerPickerTokens.type.denseMultiplier.size,
              fontVariant: ['tabular-nums'],
              fontWeight: String(seatLayerPickerTokens.type.denseMultiplier.weight) as 'normal',
              marginEnd: 6,
            }, styles.denseLineText]}>{quantityAmount}</Text>
          </SeatLayerCartCellCrossFade>
        )
        : null}
      <SeatLayerCartCellCrossFade token={amount}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={[{
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.denseLine.size,
          fontVariant: ['tabular-nums'],
          fontWeight: '800',
        }, styles.denseLineText]}>{amount}</Text>
      </SeatLayerCartCellCrossFade>
      {canRemove && !held
        ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${scope.strings.translate('removeSeat')} ${identity}`}
            accessibilityState={{ disabled: removing }}
            disabled={removing}
            onPress={() => onRemove(line, group)}
            testID="seatlayer-cart-remove"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: seatLayerPickerTokens.size.minimumHitTarget,
              minWidth: seatLayerPickerTokens.size.minimumHitTarget,
            }}
          >
            <View style={[{
              alignItems: 'center',
              borderRadius: seatLayerPickerTokens.radius.button,
              height: seatLayerPickerTokens.size.denseRemoveSize,
              justifyContent: 'center',
              width: seatLayerPickerTokens.size.denseRemoveSize,
            }, styles.denseLineRemoveButton]}>
              <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 18 }, styles.denseLineRemoveButtonText]}>×</Text>
            </View>
          </Pressable>
        )
        : <View style={{ width: 8 }} />}
    </View>
  );
  // A run's head stands for every seat under it, and a swipe that took six
  // tickets away on one flick is a gesture nobody would trust.
  return (
    <SeatLayerCartSwipeToRemove
      enabled={removable && group === undefined}
      onRemove={() => onRemove(line, group)}
    >
      {row}
    </SeatLayerCartSwipeToRemove>
  );
}

/**
 * What stands at the head of a line: a run's fold control, a category colour,
 * or the lock of a seat the server has already set aside. A LOCK IS NOT A
 * COLOUR — it is the one state with consequences, so it survives greyscale.
 */
function LineMark({ group, held, open, color, theme }: Readonly<{
  group: boolean;
  held: boolean;
  open: boolean;
  color: string;
  theme: Theme;
}>): React.ReactElement {
  if (group) {
    return (
      <View accessible={false} style={{ width: seatLayerPickerTokens.size.denseRunToggleWidth }}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{
          color: theme.colors.mutedText,
          fontFamily: theme.fontFamily,
          fontSize: 13,
          textAlign: 'center',
          transform: [{ rotate: open ? '90deg' : '0deg' }],
        }}>›</Text>
      </View>
    );
  }
  if (held) {
    return (
      <View accessible={false} testID="seatlayer-cart-held-lock" style={{
        alignItems: 'center',
        backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .18),
        borderRadius: 7,
        height: 14,
        justifyContent: 'center',
        width: 14,
      }}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{ color: theme.colors.accent, fontSize: 9 }}>{'\u{1F512}'}</Text>
      </View>
    );
  }
  return <View accessible={false} style={{ backgroundColor: color, borderRadius: 4.5, height: 9, width: 9 }} />;
}
