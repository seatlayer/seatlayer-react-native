import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerBold } from './boldText';
import { SeatLayerCartBarButton, useSeatLayerCartBarRow } from './cartBarButton';
import {
  captureSeatLayerCartActionLease,
  isSeatLayerCartActionCurrent,
  projectSeatLayerCartSheet,
} from './cartSheetUi';
import { seatLayerCheckoutCtaState, type SeatLayerCheckoutCtaState } from './checkoutCta';
import { isSeatLayerPickerSoldOut } from './emptyState';
import { seatLayerPickerLineWidth } from './lineWidth';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import type { SeatLayerPickerCheckoutHandoff } from './models';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { useSeatLayerSheetFinder } from './sheetFinder';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from './styles';
import { supportsSeatLayerPickerSurface } from './surfaces';
import { seatLayerPickerTokens } from './tokens.g';

type Scope = ReturnType<typeof useSeatLayerPickerScope>;
type BookSlots = Pick<SeatLayerPickerStyles, 'continueButton' | 'continueButtonText'>;

export interface SeatLayerBookButtonProps {
  readonly onCheckout: (handoff: Readonly<SeatLayerPickerCheckoutHandoff>) => unknown;
  /**
   * Opens the best-seats form, where this button is the only thing on screen
   * and an empty cart would otherwise leave it dead. Null on a width that shows
   * the map beside the panel.
   */
  readonly onFindBestSeats?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: BookSlots;
}

function canRejectHandoff(controller: Scope['controller']): boolean {
  return supportsSeatLayerPickerSurface(
    controller,
    ['checkout-handoff-reject-v1'],
    ['picker.rejectHandoff'],
  );
}

/**
 * The controller's composite permission. `removingCartLine` is deliberately
 * absent from it: a removal never blocks checkout, because inventory mutations
 * are serialised and a Continue pressed during one is sent after it.
 */
function checkoutAllowed(scope: Scope): boolean {
  const snapshot = scope.controller.getSnapshot();
  return snapshot !== undefined && scope.isReady && !scope.readOnly && !scope.blocksCheckout &&
    scope.pendingSeat === null && (!snapshot.event.salesClosed || snapshot.hold.active) &&
    snapshot.selectionValidity?.isValid !== false &&
    projectSeatLayerCartSheet(snapshot, null).confirmed.items.length > 0 &&
    supportsSeatLayerPickerSurface(scope.controller, ['checkout-handoff-v1'], ['picker.continue']);
}

/** One checkout flight, shared by every surface that draws the call to action. */
function useSeatLayerCheckoutFlight(
  onCheckout: SeatLayerBookButtonProps['onCheckout'],
): Readonly<{ busy: 'holding' | 'handing' | undefined; press: () => void }> {
  const scope = useSeatLayerPickerScope();
  const scopeRef = useRef(scope);
  const callbackRef = useRef(onCheckout);
  const mountedRef = useRef(true);
  const flightRef = useRef(0);
  const nextFlightRef = useRef(0);
  const [busy, setBusy] = useState<'holding' | 'handing' | undefined>(undefined);
  useLayoutEffect(() => { scopeRef.current = scope; callbackRef.current = onCheckout; }, [onCheckout, scope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; flightRef.current = 0; nextFlightRef.current += 1; };
  }, []);
  useLayoutEffect(() => {
    flightRef.current = 0;
    nextFlightRef.current += 1;
    setBusy(undefined);
  }, [scope.controller, scope.sessionId, scope.snapshot?.sessionId]);
  const checkout = async () => {
    const before = scopeRef.current;
    const lease = captureSeatLayerCartActionLease(before.controller, before.sessionId);
    if (!lease || flightRef.current || !checkoutAllowed(before)) return;
    const flight = ++nextFlightRef.current;
    flightRef.current = flight;
    // A hold that is already there is only handed over.
    setBusy(before.controller.getSnapshot()?.hold.active === true ? 'handing' : 'holding');
    // Why the last try was refused is not what this one is about.
    before.clearError();
    try {
      const handoff = await before.controller.checkout();
      if (!before.isSessionActive() || !isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        if (canRejectHandoff(before.controller)) {
          try { await before.controller.rejectHandoff(handoff.holdId); } catch { /* best effort */ }
        }
        return;
      }
      if (mountedRef.current && flightRef.current === flight) setBusy('handing');
      try {
        await Promise.resolve(callbackRef.current(Object.freeze({
          ...handoff,
          lineItems: Object.freeze(handoff.lineItems.map((line) => Object.freeze({ ...line }))),
        })));
      } catch (error) {
        if (canRejectHandoff(before.controller)) {
          try { await before.controller.rejectHandoff(handoff.holdId); } catch { /* best effort */ }
        }
        throw error;
      }
    } catch (error) {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        try { scopeRef.current.reportError(error); } catch { /* contained */ }
      }
    } finally {
      if (mountedRef.current && flightRef.current === flight &&
        isSeatLayerCartActionCurrent(lease, scopeRef.current)) {
        flightRef.current = 0;
        setBusy(undefined);
      }
    }
  };
  return { busy, press: () => { void checkout(); } };
}

/** The one resolved reading of the call to action, for whichever surface draws it. */
export function useSeatLayerCheckoutCta(
  handoffInFlight: boolean,
  canOfferFind = false,
  creatingHold = false,
): SeatLayerCheckoutCtaState {
  const scope = useSeatLayerPickerScope();
  const projection = projectSeatLayerCartSheet(scope.snapshot, scope.pendingSeat);
  // No runtime field distinguishes a held line from a freshly picked one, so
  // `Secure more` stays unreachable until one does — exactly as in Flutter.
  return seatLayerCheckoutCtaState({
    canCheckout: checkoutAllowed(scope),
    canOfferFind,
    creatingHold,
    handoffInFlight,
    label: scope.strings.translate('holdAndCheckout'),
    pendingCount: 0,
    seatCardOpen: scope.pendingSeat !== null,
    snapshot: scope.snapshot,
    strings: scope.strings,
    ticketCount: projection.totals.quantity,
  });
}

/**
 * Whether the finder may be offered at all: the same gate the tray's card is
 * under, MINUS the seat card.
 *
 * A card standing over the map does not take the finder off the ladder — rung
 * 3 says the button "keeps the label the ladder would give it with no card up"
 * and simply holds it down, and it is `seatLayerCheckoutCtaState` that
 * withholds the press. Reading `pendingSeat` here as well made the label fall
 * through to rung 11, so an empty cart with a card up said `Select seats`
 * where the reference says a disabled `Find best seats`.
 */
function bestSeatsAllowed(scope: Scope, offered: boolean): boolean {
  return offered && !scope.readOnly && !scope.isBusy && scope.isReady &&
    !scope.snapshot?.event.salesClosed && scope.snapshot?.hold.owner !== 'host' &&
    scope.snapshot?.hold.active !== true && !isSeatLayerPickerSoldOut(scope.snapshot) &&
    scope.snapshot?.selectionValidity?.isValid !== false &&
    supportsSeatLayerPickerSurface(scope.controller, ['picker-actions-v1'], ['picker.bestAvailable']);
}

/**
 * The call to action (spec §3.10.3), carrying NOTHING BUT ITS OWN LABEL: the
 * total stands beside the count, and stating it twice is how the button came to
 * be read as a second, different price. In the phone's cart row it takes the
 * row's measures; placed anywhere else it is full width.
 *
 * ONE BUTTON, TWO DOORS: with an empty cart on a phone it offers the best-seats
 * form instead of a disabled label.
 */
export function SeatLayerBookButton(props: SeatLayerBookButtonProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const flight = useSeatLayerCheckoutFlight(props.onCheckout);
  // The sheet's own door, unless this button was given one of its own.
  const inherited = useSeatLayerSheetFinder();
  const openFinder = props.onFindBestSeats ?? inherited;
  const cta = useSeatLayerCheckoutCta(
    flight.busy === 'handing',
    openFinder !== undefined && bestSeatsAllowed(scope, true),
    flight.busy === 'holding',
  );
  const row = useSeatLayerCartBarRow();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const styles = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const disabled = !cta.enabled;
  const onPress = cta.findsBestSeats ? openFinder : flight.press;
  if (row !== undefined) {
    return <SeatLayerCartBarButton
      cta={cta}
      onPress={onPress}
      paint={[styles.continueButton, sanitizeSeatLayerPickerStyle(props.style)]}
      textSlot={styles.continueButtonText}
      theme={theme}
      row={row}
    />;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      accessibilityState={{ busy: cta.busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID="seatlayer-cart-checkout"
      style={{ justifyContent: 'center' }}
    >
      <View style={[{
        alignItems: 'center',
        alignSelf: 'stretch',
        // Disabled is a DESIGNED state, not a Material grey: a reason stated on
        // a button that cannot be pressed still has to be read, on the dark
        // scene sheet as much as on the light one.
        backgroundColor: disabled ? theme.colors.surface : theme.colors.accent,
        borderColor: disabled ? theme.colors.divider : 'transparent',
        borderRadius: seatLayerPickerTokens.radius.button,
        borderWidth: disabled ? seatLayerPickerLineWidth : 0,
        flexDirection: 'row',
        gap: 8,
        height: seatLayerPickerTokens.size.checkoutButtonHeight,
        justifyContent: 'center',
        paddingHorizontal: 12,
      }, styles.continueButton, sanitizeSeatLayerPickerStyle(props.style)]}>
        <Text maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')} numberOfLines={1} ellipsizeMode="tail" style={[{
          color: disabled ? theme.colors.mutedText : theme.colors.onAccent,
          flexShrink: 1,
          fontFamily: theme.fontFamily,
          fontSize: seatLayerPickerTokens.type.bookButton.size,
          fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.bookButton.weight),
        }, styles.continueButtonText]}>{cta.label}</Text>
      </View>
    </Pressable>
  );
}
