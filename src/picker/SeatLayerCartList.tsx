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
import { seatLayerPickerFontWeight } from './fontWeight';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartLines,
  projectSeatLayerCartSheet,
} from './cartSheetUi';
import { type DenseTicketLine } from './cartDense';
import {
  seatLayerPickerCartLineKeepsRemove, seatLayerPickerHoldOwnershipStore,
} from './holdOwnership';
import type { SeatLayerPickerCartLine } from './models';
import { seatLayerPickerBold } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';

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
 * The confirmed cart — ONE PLATE, one row per ticket, rows divided by
 * hairlines.
 *
 * MINIMUM SURFACE. The folded dense list this used to draw (runs, the `+N
 * more` row, the expandable member rows) went with the `size.dense*` /
 * `type.dense*` tokens; the cart cards of spec §3.10 that replace it are not
 * built here. What stands is one plain row per cart line, so the removal,
 * swipe, held-lock and hold-ownership behaviour keeps its tests while the
 * card surface is authored.
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
  const revision = useRef(-1);
  useLayoutEffect(() => {
    current.current = scope;
    observers.current = { onSeatRemoved: props.onSeatRemoved };
  }, [props.onSeatRemoved, scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; marks.current.dispose(); }; }, []);
  useLayoutEffect(() => {
    marks.current.reset();
    revision.current = -1;
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
  const lines = projectSeatLayerCartLines(scope.snapshot, projection.confirmed.items);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  if (!lines.length) return null;
  // §3.13.13 — the line keeps its × while the host owns the hold. Removing it
  // is refused by the runtime, and that refusal is what raises the notice: a
  // control the buyer can press and be told about beats one that has silently
  // gone.
  const canRemove = !scope.readOnly && seatLayerPickerCartLineKeepsRemove(scope.snapshot) &&
    supportsSeatLayerPickerSurface(scope.controller, ['cart-line-remove-v1'], ['picker.removeCartLine']);

  const remove = async (line: DenseTicketLine<SeatLayerPickerCartLine>) => {
    const before = current.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    const live = lease?.controller.getSnapshot();
    if (!lease || !live || before.readOnly ||
      !supportsSeatLayerPickerSurface(before.controller, ['cart-line-remove-v1'], ['picker.removeCartLine'])) return;
    const started = marks.current.beginMany([line.item], before.sessionId);
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
    borderWidth: seatLayerPickerLineWidth,
    overflow: 'hidden' as const,
  };
  return (
    <View style={[sanitizeSeatLayerPickerStyle(props.style), { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
      <View style={plate} testID="seatlayer-cart-plate">
        {lines.map((line, index) => {
          const key = JSON.stringify([
            line.identity.lineKey, line.identity.removalLabel, line.identity.objectId, line.identity.seatId,
          ]);
          return (
            <SeatLayerCartRowArrival key={key} index={index}>
              <CartLineRow
                line={line}
                first={index === 0}
                canRemove={canRemove}
                marks={marks.current}
                theme={theme}
                styles={styles}
                onRemove={remove}
              />
            </SeatLayerCartRowArrival>
          );
        })}
      </View>
      {props.children}
    </View>
  );
}

function CartLineRow({ line, first, canRemove, marks, theme, styles, onRemove }: Readonly<{
  line: DenseTicketLine<SeatLayerPickerCartLine>;
  first: boolean;
  canRemove: boolean;
  marks: CartRemovalMarkCoordinator<SeatLayerPickerCartLine>;
  theme: Theme;
  styles: SeatLayerPickerStyles;
  onRemove: (line: DenseTicketLine<SeatLayerPickerCartLine>) => void;
}>): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const total = line.total;
  const amount = total === null || !line.currency ? '' : scope.formatMoney(total, line.currency);
  const unit = line.unitPrice === null || !line.currency ? '' : scope.formatMoney(line.unitPrice, line.currency);
  const seats = line.seatLabel;
  // The SECTION is the only part that ellipsizes — or the seat label where
  // there is no section; the row and seats never shrink.
  const leading = line.section || seats;
  const trailingParts = (line.section ? [line.rowLabel, seats] : [line.rowLabel]).filter(Boolean);
  const identity = [leading, ...trailingParts].filter(Boolean).join(' · ');
  const quantity = line.quantity;
  const quantityAmount = quantity > 1 && unit ? `${quantity} × ${unit}` : '';
  const category = scope.snapshot?.categories.find((item) => item.key === line.categoryKey);
  const categoryColor = chartSeatLayerPickerColor(category?.color, theme.colors.accent);
  // The category NAME is not on the line; its colour is the dot, and the name
  // goes to the accessible label.
  const spokenType = line.categoryLabel.toLowerCase() === line.section.toLowerCase()
    ? '' : `${line.categoryLabel}, `;
  const removing = marks.isRemoving(line.item);
  const held = line.held;
  const removable = canRemove && !removing;
  const row = (
    <View
      accessible
      accessibilityLabel={`${spokenType}${identity}, ${[quantityAmount, amount].filter(Boolean).join(', ')}`}
      style={[{
        alignItems: 'center',
        // A held row is inventory the server has already set aside: a wash of
        // the accent and a bar down its leading edge say so without a word.
        backgroundColor: held ? seatLayerPickerColorAlpha(theme.colors.accent, .07) : 'transparent',
        borderTopColor: seatLayerPickerColorAlpha(theme.colors.divider, .7),
        borderTopWidth: first ? 0 : seatLayerPickerLineWidth,
        flexDirection: 'row',
        // §4.10 — a cart row is `base x the sheet's clamped scale`.
        minHeight: seatLayerPickerScaledExtent(seatLayerPickerTokens.size.cartCardMinHeight, seatLayerPickerTypeScaleClamp('sheet')),
        opacity: removing ? seatLayerPickerTokens.opacity.removing : 1,
        paddingEnd: 4,
        paddingStart: 9,
      }, styles.denseLineContainer]}
      testID={removing ? 'seatlayer-cart-row-removing' : 'seatlayer-cart-row'}
    >
      {held
        ? <View accessible={false} pointerEvents="none" style={{ backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .72), bottom: 0, position: 'absolute', start: 0, top: 0, width: 3 }} />
        : null}
      <View
        accessible={false}
        style={{ alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: seatLayerPickerTokens.size.minimumHitTarget }}
      >
        <LineMark held={held} color={categoryColor} theme={theme} />
        <View style={{ width: 7 }} />
        <SeatLayerCartCellCrossFade token={identity} style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} ellipsizeMode="tail" style={[{
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
            fontSize: seatLayerPickerTokens.type.cartCardName.size,
            fontVariant: ['tabular-nums'],
            fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartCardName.weight),
          }, styles.denseLineText]}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={{ fontWeight: seatLayerPickerBold(700) }}>{leading}</Text>
            {/* ONLY THE SEPARATOR IS MUTED. The row letter and the seat number
                are the identity the buyer is checking against the map, and the
                reference keeps them in the line's own ink; muting them made two
                thirds of every cart line read as a caption. */}
            {trailingParts.map((part) => (
              <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} key={part}>
                <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={{ color: theme.colors.mutedText }}>{' · '}</Text>{part}
              </Text>
            ))}
          </Text>
        </SeatLayerCartCellCrossFade>
      </View>
      {quantityAmount
        ? (
          <SeatLayerCartCellCrossFade token={quantityAmount}>
            <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={[{
              color: theme.colors.mutedText,
              fontFamily: theme.fontFamily,
              fontSize: seatLayerPickerTokens.type.cartCardPosition.size,
              fontVariant: ['tabular-nums'],
              fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartCardPosition.weight),
              marginEnd: 6,
            }, styles.denseLineText]}>{quantityAmount}</Text>
          </SeatLayerCartCellCrossFade>
        )
        : null}
      <SeatLayerCartCellCrossFade token={amount}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} style={[{
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.cartCardAmount.size,
          fontVariant: ['tabular-nums'],
          fontWeight: seatLayerPickerBold(800),
        }, styles.denseLineText]}>{amount}</Text>
      </SeatLayerCartCellCrossFade>
      {canRemove
        ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${scope.strings.translate('removeSeat')} ${identity}`}
            accessibilityState={{ disabled: removing }}
            disabled={removing}
            onPress={() => onRemove(line)}
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
              justifyContent: 'center',
              // MINIMUM SURFACE: the plate sized itself from `size.denseRemoveSize`,
              // which went with the dense list. The pressable's hit target is what
              // holds the × until the cart card authors its own control.
              minHeight: seatLayerPickerTokens.size.minimumHitTarget,
              minWidth: seatLayerPickerTokens.size.minimumHitTarget,
            }, styles.denseLineRemoveButton]}>
              <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} style={[{ color: theme.colors.mutedText, fontFamily: theme.fontFamily, fontSize: 18 }, styles.denseLineRemoveButtonText]}>×</Text>
            </View>
          </Pressable>
        )
        : <View style={{ width: 8 }} />}
    </View>
  );
  return (
    <SeatLayerCartSwipeToRemove
      enabled={removable}
      onRemove={() => onRemove(line)}
    >
      {row}
    </SeatLayerCartSwipeToRemove>
  );
}

/**
 * What stands at the head of a line: a category colour, or the lock of a seat
 * the server has already set aside. A LOCK IS NOT A COLOUR — it is the one
 * state with consequences, so it survives greyscale.
 */
function LineMark({ held, color, theme }: Readonly<{
  held: boolean;
  color: string;
  theme: Theme;
}>): React.ReactElement {
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
        {/* DRAWN, never an emoji: the platform paints U+1F512 in its own
            colours, so the one state with consequences arrived as a green and
            yellow picture that neither the accent nor greyscale could reach. */}
        <View style={{
          borderColor: theme.colors.accent,
          borderTopStartRadius: 2.6,
          borderTopEndRadius: 2.6,
          borderTopWidth: 1.3,
          borderLeftWidth: 1.3,
          borderRightWidth: 1.3,
          height: 3.6,
          marginBottom: -0.4,
          width: 5.2,
        }} />
        <View style={{
          backgroundColor: theme.colors.accent,
          borderRadius: 1.4,
          height: 5,
          width: 7.6,
        }} />
      </View>
    );
  }
  return <View accessible={false} style={{ backgroundColor: color, borderRadius: 4.5, height: 9, width: 9 }} />;
}
