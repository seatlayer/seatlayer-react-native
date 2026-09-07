import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { SeatLayerCartCellCrossFade } from './cartRowMotion';
import { seatLayerPickerColorAlpha, type resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { seatLayerPickerScaledExtent, seatLayerPickerTypeScaleClamp } from './a11y';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerSheetLayout } from './sheetLayout';
import { seatLayerPickerBold } from './boldText';
import { seatLayerPickerLineWidth } from './lineWidth';
import { seatLayerPickerSeatNoteSpoken, type SeatLayerPickerSeatNote } from './seatNotes';

/**
 * ONE TICKET, ONE CARD — and the same card on every width (spec §3.10.2).
 *
 * A row, not a two-column grid: everything the card needs sits on one baseline,
 * so its trailing edge lands on the panel's own gutter with every other card's.
 * The organizer's notes are a footnote UNDER that line — the card is already a
 * bordered ticket, and a tinted band inside one reads as a card inside a card.
 */

type Theme = ReturnType<typeof resolveSeatLayerPickerMapChromeTheme>;

export interface SeatLayerCartCardSlots {
  readonly cartCardContainer?: StyleProp<ViewStyle>;
  readonly cartCardText?: StyleProp<TextStyle>;
  readonly cartCardActionButton?: StyleProp<ViewStyle>;
  readonly cartCardActionButtonText?: StyleProp<TextStyle>;
}

export interface SeatLayerCartCardProps {
  /** The place name; the only part of the card that ellipsizes. */
  readonly name: string;
  /** Where the seat is and what kind it is, already joined for the grey line. */
  readonly position: string;
  readonly amountText: string;
  readonly categoryColor: string;
  /** Inventory the server has already set aside: a wash, a warmer edge, a lock. */
  readonly held: boolean;
  /** Asked for, not yet answered: drawn at `opacity.removing` and inert. */
  readonly removing: boolean;
  readonly notes: readonly SeatLayerPickerSeatNote[];
  readonly theme: Theme;
  readonly slots?: SeatLayerCartCardSlots;
  /** Reads out the whole card; the parts inside are excluded from semantics. */
  readonly accessibilityLabel: string;
  /** Takes the buyer to the seat on the map — the card's face, not its keys. */
  readonly onPress?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly removeLabel?: string;
  readonly onLocate?: (() => void) | undefined;
  readonly locateLabel?: string;
}

export function SeatLayerCartCard(props: SeatLayerCartCardProps): React.ReactElement {
  const { theme } = props;
  const slots = props.slots ?? {};
  const surface = props.held
    ? seatLayerPickerColorAlpha(theme.colors.accent, .07)
    : theme.colors.surface;
  return (
    /* THE TICKET IS THE CONTAINER, NOT THE ELEMENT (§4.10). The card reads as
       ONE node — place, position, amount and the organizer's notes in one
       sentence — and the eye and the ✕ stay two buttons of their own. An
       accessible box around the whole row would have folded both of them into
       that sentence and left a buyer using VoiceOver with ink they can see and
       no way to reach, so the name and the press live on the FACE of the card
       and the two keys sit outside it. */
    <View
      accessible={false}
      testID={props.removing ? 'seatlayer-cart-card-removing' : 'seatlayer-cart-card'}
      style={[{
        alignItems: 'center',
        backgroundColor: props.held ? surface : theme.colors.surface,
        borderColor: props.held
          ? seatLayerPickerColorAlpha(theme.colors.accent, .45)
          : theme.colors.divider,
        borderRadius: seatLayerPickerTokens.size.cartCardRadius,
        borderWidth: seatLayerPickerLineWidth,
        flexDirection: 'row',
        // §4.10 — a card is `base × the sheet's clamped scale`.
        minHeight: seatLayerPickerScaledExtent(
          seatLayerPickerSheetLayout(theme).cartCardMinHeight,
          seatLayerPickerTypeScaleClamp('sheet'),
        ),
        // The one beat that says the press landed. It is not a departure — the
        // card is still there — so it fades to a state rather than out.
        opacity: props.removing ? seatLayerPickerTokens.opacity.removing : 1,
        paddingBottom: 4,
        paddingEnd: 4,
        paddingStart: 12,
        paddingTop: 4,
      }, slots.cartCardContainer]}
    >
      <Pressable
        accessible
        accessibilityRole={props.onPress ? 'button' : 'text'}
        accessibilityLabel={props.accessibilityLabel}
        disabled={props.onPress === undefined}
        onPress={props.onPress}
        testID="seatlayer-cart-card-face"
        style={{ alignItems: 'center', flex: 1, flexDirection: 'row' }}
      >
        <CardMark held={props.held} color={props.categoryColor} theme={theme} />
        <View style={{ width: 10 }} />
        <View accessible={false} style={{ flex: 1 }}>
          <Text
            accessible={false}
            maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[{
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
              fontSize: seatLayerPickerTokens.type.cartCardName.size,
              fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartCardName.weight),
            }, slots.cartCardText]}
          >{props.name}</Text>
          {props.position
            ? (
              <SeatLayerCartCellCrossFade token={props.position}>
                <Text
                  accessible={false}
                  maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[{
                    color: theme.colors.mutedText,
                    fontFamily: theme.fontFamily,
                    fontSize: seatLayerPickerTokens.type.cartCardPosition.size,
                    fontVariant: ['tabular-nums'],
                    fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartCardPosition.weight),
                  }, slots.cartCardText]}
                >{props.position}</Text>
              </SeatLayerCartCellCrossFade>
            )
            : null}
          {props.notes.length > 0 ? <SeatLayerCartCardNotes notes={props.notes} theme={theme} /> : null}
        </View>
        <View style={{ width: 8 }} />
        <SeatLayerCartCellCrossFade token={props.amountText}>
          <Text
            accessible={false}
            maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
            numberOfLines={1}
            style={[{
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
              fontSize: seatLayerPickerTokens.type.cartCardAmount.size,
              fontVariant: ['tabular-nums'],
              fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartCardAmount.weight),
            }, slots.cartCardText]}
          >{props.amountText}</Text>
        </SeatLayerCartCellCrossFade>
      </Pressable>
      {/* A HORIZONTAL PAIR, NOT A BORDERED COLUMN, and both boxes are the full
          touch floor exactly — TIGHT, not a minimum: four points per card is
          what puts the fourth card past the collapsed cap. */}
      {props.onLocate
        ? (
          <CardAction
            id="seatlayer-cart-card-locate"
            label={props.locateLabel ?? ''}
            onPress={props.onLocate}
            slots={slots}
            theme={theme}
          ><EyeGlyph color={theme.colors.text} /></CardAction>
        )
        : null}
      {props.onRemove
        ? (
          <CardAction
            disabled={props.removing}
            id="seatlayer-cart-card-remove"
            label={props.removeLabel ?? ''}
            onPress={props.onRemove}
            slots={slots}
            theme={theme}
          >
            <Text
              accessible={false}
              maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
              style={[{ color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: 18 },
                slots.cartCardActionButtonText]}
            >×</Text>
          </CardAction>
        )
        : null}
    </View>
  );
}

/**
 * What the organizer said about the seat, said ONCE and in WORDS, under a
 * hairline of the divider at 72 per cent inside the card.
 *
 * No plate, no ground and no icon: the card is already a bordered ticket, and
 * the column is narrow enough that a plate's padding wrapped "Restricted view"
 * onto two lines. THE GLYPH ROWS BELONG TO THE SEAT CARD (§3.8), not here.
 */
export function SeatLayerCartCardNotes({ notes, theme }: Readonly<{
  notes: readonly SeatLayerPickerSeatNote[];
  theme: Theme;
}>): React.ReactElement {
  return (
    <View
      accessible={false}
      testID="seatlayer-cart-card-notes"
      style={{
        // The rule is as wide as the notes under it, not as wide as the card:
        // a hairline spanning the whole column read as a divider cutting the
        // ticket in two rather than as a footnote's own rule.
        alignSelf: 'flex-start',
        borderTopColor: seatLayerPickerColorAlpha(theme.colors.divider, .72),
        borderTopWidth: seatLayerPickerLineWidth,
        marginTop: seatLayerPickerTokens.size.cartNotePadTop,
        paddingTop: seatLayerPickerTokens.size.cartNotePadTop,
      }}
    >
      {notes.map((note, index) => (
        <Text
          accessible={false}
          key={note.key}
          maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
          style={{
            color: theme.colors.mutedText,
            fontFamily: theme.fontFamily,
            fontSize: seatLayerPickerTokens.type.cartNoteText.size,
            fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartNoteText.weight),
            marginTop: index === 0 ? 0 : seatLayerPickerTokens.size.cartNoteGap,
          }}
        >
          <Text
            maxFontSizeMultiplier={seatLayerPickerTypeScaleClamp('sheet')}
            style={{
              color: theme.colors.text,
              fontWeight: seatLayerPickerBold(seatLayerPickerTokens.type.cartNoteTitle.weight),
            }}
          >{note.title}</Text>
          {note.note === undefined ? '' : ` ${note.note}`}
        </Text>
      ))}
    </View>
  );
}

/** The whole card, as it is read out. */
export function seatLayerCartCardSpokenLabel(parts: Readonly<{
  categoryLabel?: string;
  identity: string;
  amountText: string;
  notes: readonly SeatLayerPickerSeatNote[];
}>): string {
  return [
    parts.categoryLabel,
    parts.identity,
    parts.amountText,
    ...parts.notes.map(seatLayerPickerSeatNoteSpoken),
  ].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ');
}

/** One of the card's two actions: the glyph stays small, the target does not. */
function CardAction({ children, disabled, id, label, onPress, slots, theme }: Readonly<{
  children: React.ReactNode;
  disabled?: boolean;
  /** Not named `testID`: a composite carrying one is found before its host. */
  id: string;
  label: string;
  onPress: () => void;
  slots: SeatLayerCartCardSlots;
  theme: Theme;
}>): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      onPress={onPress}
      testID={id}
      style={{
        alignItems: 'center',
        height: seatLayerPickerTokens.size.minimumHitTarget,
        justifyContent: 'center',
        width: seatLayerPickerTokens.size.minimumHitTarget,
      }}
    >
      <View
        accessible={false}
        style={[{
          alignItems: 'center',
          borderRadius: 8,
          height: seatLayerPickerTokens.size.minimumHitTarget,
          justifyContent: 'center',
          width: seatLayerPickerTokens.size.minimumHitTarget,
        }, slots.cartCardActionButton]}
      >{children}</View>
    </Pressable>
  );
}

function EyeGlyph({ color }: Readonly<{ color: string }>): React.ReactElement {
  return (
    <View
      accessible={false}
      style={{
        alignItems: 'center', borderColor: color, borderRadius: 9, borderWidth: 1.5,
        height: 11, justifyContent: 'center', width: 18,
      }}
    >
      <View style={{ backgroundColor: color, borderRadius: 2.2, height: 4.4, width: 4.4 }} />
    </View>
  );
}

/**
 * What stands at the head of a card: the category colour, or the lock of a seat
 * the server has already set aside.
 *
 * A LOCK IS NOT A COLOUR — it is the one state with consequences, so it has a
 * mark that survives being read in greyscale.
 */
function CardMark({ held, color, theme }: Readonly<{
  held: boolean;
  color: string;
  theme: Theme;
}>): React.ReactElement {
  if (held) {
    return (
      <View accessible={false} testID="seatlayer-cart-held-lock" style={{
        alignItems: 'center',
        backgroundColor: seatLayerPickerColorAlpha(theme.colors.accent, .18),
        borderRadius: 8.5,
        height: 17,
        justifyContent: 'center',
        width: 17,
      }}>
        {/* DRAWN, never an emoji: the platform paints U+1F512 in its own
            colours, so the one state with consequences arrived as a green and
            yellow picture that neither the accent nor greyscale could reach. */}
        <View style={{
          borderColor: theme.colors.accent,
          borderLeftWidth: 1.3,
          borderRightWidth: 1.3,
          borderTopEndRadius: 2.6,
          borderTopStartRadius: 2.6,
          borderTopWidth: 1.3,
          height: 3.6,
          marginBottom: -0.4,
          width: 5.2,
        }} />
        <View style={{ backgroundColor: theme.colors.accent, borderRadius: 1.4, height: 5, width: 7.6 }} />
      </View>
    );
  }
  // The same hairline the confirm card's band dot carries, for the same reason:
  // a pale category on the panel's own surface is otherwise a disc you cannot
  // find.
  return (
    <View accessible={false} testID="seatlayer-cart-card-dot" style={{
      backgroundColor: color,
      borderColor: seatLayerPickerColorAlpha(theme.colors.text, .22),
      borderRadius: 4.5,
      borderWidth: seatLayerPickerLineWidth,
      height: 9,
      width: 9,
    }} />
  );
}
