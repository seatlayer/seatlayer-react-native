import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nManager, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { CartRemovalMarkCoordinator } from './cartRemovalUndoState';
import { SeatLayerCartRowArrival, SeatLayerCartSwipeToRemove } from './cartRowMotion';
import { SeatLayerCartCard, seatLayerCartCardSpokenLabel } from './cartCard';
import { chartSeatLayerPickerColor } from './chartColor';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle, type SeatLayerPickerStyles } from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerSheetLayout } from './sheetLayout';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartLines,
  projectSeatLayerCartSheet,
} from './cartSheetUi';
import { seatLayerSheetRestoreFraction } from './sheetDrag';
import { seatLayerPickerSeatNotes } from './seatNotes';
import { type SeatLayerTicketLine } from './cartLines';
import {
  seatLayerPickerCartLineKeepsRemove, seatLayerPickerHoldOwnershipStore,
} from './holdOwnership';
import type { SeatLayerPickerCartLine, SeatLayerPickerSelectedSeat } from './models';

export interface SeatLayerCartListProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: Pick<SeatLayerPickerStyles,
    'cartCardContainer' | 'cartCardText' | 'cartCardActionButton' | 'cartCardActionButtonText'>;
  readonly onSeatRemoved?: (line: Readonly<SeatLayerPickerCartLine>) => unknown;
  readonly children?: ReactNode;
}

type Current = ReturnType<typeof useSeatLayerPickerScope>;

function observe(callback: unknown, value: unknown): void {
  if (typeof callback !== 'function') return;
  try { void Promise.resolve(callback(value)).catch(() => {}); } catch { /* Observers cannot affect a cart command. */ }
}

/**
 * The buyer's tickets, ONE CARD EACH — and the same card on every width
 * (spec §3.10.2).
 *
 * The phone used to draw a second cart: a bordered plate of hairline-divided
 * lines with consecutive seats folded into runs behind a `+N more`. It saved
 * real pixels and it cost the sheet its coherence. The run model, the fold and
 * the `+N more` are gone; the collapsed sheet caps the list at three cards and
 * a sliver and scrolls instead.
 *
 * Nothing is said when a card goes: the press is answered by the card itself,
 * which fades to `opacity.removing`, goes inert and stops being swipeable until
 * the snapshot that no longer carries it arrives. A removal that FAILS restores
 * the card and states itself through the inline action error.
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
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    current.current = scope;
    observers.current = { onSeatRemoved: props.onSeatRemoved };
  }, [props.onSeatRemoved, scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; marks.current.dispose(); }; }, []);
  useLayoutEffect(() => {
    marks.current.reset();
    revision.current = -1;
    seen.current.clear();
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
  // A seat the card is still asking about is not in the cart yet: it is in the
  // runtime's selection, and listing it before the buyer has said yes shows
  // them a ticket they have not taken.
  const lines = projectSeatLayerCartLines(scope.snapshot, projection.confirmed.items);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  // Arrivals are decided before the early return so a cart that empties and
  // fills again stages its next set rather than landing it all at once.
  const arrivals = lines.map((line) => line.identity.lineKey ?? line.identity.removalLabel ?? '')
    .filter((key) => key.length > 0 && !seen.current.has(key));
  seen.current = new Set(lines.map((line) =>
    line.identity.lineKey ?? line.identity.removalLabel ?? ''));
  if (!lines.length) return null;
  // §3.13.13 — the card keeps its × while the host owns the hold. Removing it
  // is refused by the runtime, and that refusal is what raises the notice: a
  // control the buyer can press and be told about beats one that has gone.
  const canRemove = !scope.readOnly && seatLayerPickerCartLineKeepsRemove(scope.snapshot) &&
    supportsSeatLayerPickerSurface(scope.controller, ['cart-line-remove-v1'], ['picker.removeCartLine']);
  // The same gate the confirm card's strip is under: the host has to allow it,
  // the runtime has to advertise `seatView`, and — because a stand-in the
  // runtime could draw for any seat is never offered — the seat has to carry an
  // authored photograph.
  const canLocate = scope.snapshot?.capabilities?.includes('seatView') === true &&
    supportsSeatLayerPickerSurface(
      scope.controller,
      ['native-chrome-contract-v1', 'seat-view-v1'],
      ['picker.openSeatView'],
    );

  /**
   * Remove immediately. "Immediately" is the CARD, not the server: the runtime
   * re-holds the rest of the cart before it answers, so the card is marked,
   * faded and made inert in the same frame as the press.
   */
  const remove = async (line: SeatLayerTicketLine<SeatLayerPickerCartLine>) => {
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
      // A reply that left the line standing is not a removal; the card comes
      // back rather than staying faded for good.
      marks.current.release(token);
      observe(observers.current.onSeatRemoved, Object.freeze({ ...line.item }));
    } catch (error) {
      if (mounted.current && isSeatLayerCartActionCurrent(lease, current.current)) {
        marks.current.release(token);
        // A hold the host already owns is not a command failure; it is the
        // "already in checkout" state, told once, in its own notice.
        const raised = seatLayerPickerHoldOwnershipStore(before.controller)
          .raise(error, before.controller.getCheckoutHandoff());
        if (raised) return;
        try { current.current.reportError(error); } catch { /* scope reporting is advisory */ }
      }
    } finally {
      if (isSeatLayerCartActionCurrent(lease, current.current)) current.current.setBusyAction(null);
    }
  };

  /**
   * The map frames the seat at its resting place and, on the phone, the sheet
   * steps down so the map is what the buyer sees.
   */
  const showSeat = (seatId: string) => {
    const before = current.current;
    if (before.controller.supportsFrameSeat) {
      void Promise.resolve(before.controller.frameSeat(seatId, { fraction: seatLayerSheetRestoreFraction }))
        .catch(() => { /* framing is a courtesy, never an error the buyer owns */ });
    }
    try { before.setPresentation({ type: 'setSheet', sheet: 'collapsed' }); } catch { /* controlled */ }
  };

  const locate = (seatId: string) => {
    const before = current.current;
    void Promise.resolve(before.controller.openSeatView(seatId)).catch((error) => {
      try { current.current.reportError(error); } catch { /* advisory */ }
    });
  };

  return (
    <View style={[sanitizeSeatLayerPickerStyle(props.style), { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
      {lines.map((line, index) => {
        const key = JSON.stringify([
          line.identity.lineKey, line.identity.removalLabel, line.identity.objectId, line.identity.seatId,
        ]);
        const lineKey = line.identity.lineKey ?? line.identity.removalLabel ?? '';
        return (
          <View key={key} style={index === 0 ? undefined : { marginTop: seatLayerPickerSheetLayout(theme).cartCardGap }}>
            <SeatLayerCartRowArrival index={arrivals.indexOf(lineKey)}>
              <CartCardRow
                canLocate={canLocate}
                canRemove={canRemove}
                line={line}
                marks={marks.current}
                onLocate={locate}
                onRemove={remove}
                onShowSeat={showSeat}
                slots={styles}
                theme={theme}
              />
            </SeatLayerCartRowArrival>
          </View>
        );
      })}
      {props.children}
    </View>
  );
}

function CartCardRow({ canLocate, canRemove, line, marks, onLocate, onRemove, onShowSeat, slots, theme }: Readonly<{
  canLocate: boolean;
  canRemove: boolean;
  line: SeatLayerTicketLine<SeatLayerPickerCartLine>;
  marks: CartRemovalMarkCoordinator<SeatLayerPickerCartLine>;
  onLocate: (seatId: string) => void;
  onRemove: (line: SeatLayerTicketLine<SeatLayerPickerCartLine>) => void;
  onShowSeat: (seatId: string) => void;
  slots: SeatLayerPickerStyles;
  theme: ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;
}>): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const seat = line.selection as Readonly<SeatLayerPickerSelectedSeat> | null;
  const total = line.total;
  const amount = total === null || !line.currency ? '' : scope.formatMoney(total, line.currency);
  // Where the chart has no sections the ticket type names the card instead:
  // `Row D · Seat 1` on its own names nothing a buyer can find in a venue.
  const identityParts = [
    line.section,
    ...(line.rowLabel ? [line.rowLabel] : []),
    ...(line.seatLabel && line.section ? [line.seatLabel] : []),
  ].filter(Boolean);
  // The type joins the grey line — and is read out — only when it is not
  // already the name of the card.
  const typeIsName = line.categoryLabel.toLowerCase() === line.section.toLowerCase();
  const position = [...identityParts.slice(1), ...(typeIsName ? [] : [line.categoryLabel])]
    .filter(Boolean).join(' · ');
  const category = scope.snapshot?.categories.find((item) => item.key === line.categoryKey);
  const categoryColor = chartSeatLayerPickerColor(category?.color, theme.colors.accent);
  const notes = seatLayerPickerSeatNotes(seat, scope.strings);
  const removing = marks.isRemoving(line.item);
  const seatId = seat?.id;
  const card = (
    <SeatLayerCartCard
      accessibilityLabel={seatLayerCartCardSpokenLabel({
        amountText: amount,
        ...(typeIsName ? {} : { categoryLabel: line.categoryLabel }),
        identity: identityParts.join(' · '),
        notes,
      })}
      amountText={amount}
      categoryColor={categoryColor}
      held={line.held}
      name={line.section}
      notes={notes}
      onLocate={canLocate && seatId && seat?.seatViewThumb ? () => onLocate(seatId) : undefined}
      onPress={seatId ? () => onShowSeat(seatId) : undefined}
      onRemove={canRemove ? () => onRemove(line) : undefined}
      position={position}
      removeLabel={`${scope.strings.translate('removeSeat')} ${line.section} ${line.seatLabel}`}
      removing={removing}
      locateLabel={scope.strings.translate('viewFromHere')}
      slots={{
        cartCardActionButton: slots.cartCardActionButton,
        cartCardActionButtonText: slots.cartCardActionButtonText,
        cartCardContainer: slots.cartCardContainer,
        cartCardText: slots.cartCardText,
      }}
      theme={theme}
    />
  );
  // A held card is never swiped: those seats belong to a hold the host owns,
  // and the card says so with a lock.
  return (
    <SeatLayerCartSwipeToRemove
      enabled={canRemove && !line.held && !removing}
      onRemove={() => onRemove(line)}
      plateColor={theme.colors.error}
      plateInk={theme.colors.onAccent}
      radius={seatLayerPickerTokens.size.cartCardRadius}
    >{card}</SeatLayerCartSwipeToRemove>
  );
}
