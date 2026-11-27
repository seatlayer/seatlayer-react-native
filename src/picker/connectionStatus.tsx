import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PixelRatio, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { seatLayerPickerAnnounce } from './a11y';
import { seatLayerPickerBoldStyles } from './boldText';
import type { SeatLayerConnectionShown } from './connection';
import { useSeatLayerPickerConnectionShown } from './connectionHooks';
import { SeatLayerPickerConnectionSign } from './connectionSign';
import { useSeatLayerPickerReducedMotion } from './reducedMotion';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { seatLayerPickerTokens } from './tokens.g';

const size = seatLayerPickerTokens.size;
const motion = seatLayerPickerTokens.motion;

/**
 * Where the status may stand on the map's top line: from `start` to `end` on
 * the line at `top`. When its words do not fit there on one line each, it goes
 * under the line at `belowTop` and takes the map's whole width between the two
 * `inset`s. `maxWidth` caps it on a wide map.
 */
export interface SeatLayerPickerConnectionPlace {
  readonly top: number;
  readonly start: number;
  readonly end: number;
  readonly belowTop: number;
  readonly inset: number;
  readonly maxWidth?: number;
}

/** The widest the status is drawn on a wide map. */
const wideMaxWidth = 360;
/** The wide map's own margin round its corner pieces. */
const wideInset = 12;

/**
 * On a wide map: after the test badge at `badgeTop` (a width of 0 when there is
 * none, undefined until measured), short of the Map/3D control.
 */
export function seatLayerPickerWideConnectionPlace(
  badgeTop: number,
  badgeWidth: number | undefined,
  viewModeWidth: number | undefined,
): SeatLayerPickerConnectionPlace {
  const centred = badgeTop - (size.connectionStatusHeight - size.testChipHeight) / 2;
  return {
    top: Math.max(wideInset, centred),
    start: wideInset + (badgeWidth === undefined ? Number.POSITIVE_INFINITY : badgeWidth > 0 ? badgeWidth + seatLayerPickerTokens.size.mapAnchorGap : 0),
    end: wideInset + (viewModeWidth ?? 0) + size.connectionStatusSwitchGap,
    belowTop: Math.max(wideInset, centred) + size.connectionStatusHeight + seatLayerPickerTokens.size.mapAnchorGap,
    inset: wideInset,
    maxWidth: wideMaxWidth,
  };
}

/** Whether the card's natural width fits beside the badge and the Map/3D control. */
export function seatLayerPickerConnectionFits(
  natural: number,
  mapWidth: number,
  place: SeatLayerPickerConnectionPlace,
): boolean {
  const beside = Math.min(mapWidth - place.start - place.end, place.maxWidth ?? Number.POSITIVE_INFINITY);
  return natural <= beside;
}

/**
 * The connection status on the map: "You’re offline", "Updating…" and "Back
 * online", with "Your seats are still held." under "You’re offline" while a
 * confirmed hold has time left. Takes no touches: the map under it still pans
 * and zooms. Drawn only when the page names `connection-state-v1`.
 */
export function SeatLayerPickerConnectionStatus({ place }: Readonly<{ place: SeatLayerPickerConnectionPlace }>): React.ReactElement | null {
  const shown = useSeatLayerPickerConnectionShown(useSeatLayerPickerScope().controller);
  const [up, setUp] = useState(false);
  if (shown !== 'none' && !up) setUp(true);
  // Nothing is mounted, and nothing animates, until there is something to say.
  return up ? <ConnectionStatusCard gone={() => setUp(false)} place={place} shown={shown} /> : null;
}

function ConnectionStatusCard({ gone, place, shown }: Readonly<{
  gone: () => void;
  place: SeatLayerPickerConnectionPlace;
  shown: SeatLayerConnectionShown;
}>): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const reduced = useSeatLayerPickerReducedMotion();
  const [drawn, setDrawn] = useState<SeatLayerConnectionShown>(shown);
  const goneNow = useRef(gone);
  goneNow.current = gone;
  const [natural, setNatural] = useState<number>();
  const [mapWidth, setMapWidth] = useState<number>();
  const [, setTick] = useState(0);
  const presence = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  const hold = scope.snapshot?.hold;
  const expiresAt = hold?.active === true && typeof hold.expiresAt === 'number' ? hold.expiresAt : undefined;
  const heldLeft = expiresAt === undefined ? 0 : expiresAt - Date.now();
  const held = drawn === 'offline' && heldLeft > 0;
  const heldNow = useRef(false);
  heldNow.current = heldLeft > 0;

  useEffect(() => {
    // Reduced motion keeps a short fade: a status that blinks in and out is
    // harder to notice than one that fades.
    const duration = reduced ? motion.duration.crossfade : motion.duration.connectionIn;
    if (shown === 'none') {
      const fade = Animated.timing(presence, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      fade.start(({ finished }) => {
        if (finished) goneNow.current();
      });
      return () => fade.stop();
    }
    setDrawn(shown);
    Animated.timing(presence, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return undefined;
  }, [presence, reduced, shown]);

  // "You’re offline" and "Back online" are read once; "Updating…" is not.
  useEffect(() => {
    if (shown === 'none' || shown === 'updating') return;
    const words = shown === 'back'
      ? scope.strings.translate('backOnline')
      : [scope.strings.translate('offline'), ...(heldNow.current ? [scope.strings.translate('stillHeld')] : [])].join(' ');
    seatLayerPickerAnnounce(words);
  }, [scope.strings, shown]);

  useEffect(() => {
    if (drawn !== 'updating' || reduced) {
      ring.stopAnimation();
      return undefined;
    }
    ring.setValue(0);
    const turn = Animated.loop(Animated.timing(ring, {
      toValue: 1, duration: motion.durationOutsideBudget.connectionRing, easing: Easing.linear, useNativeDriver: true,
    }));
    turn.start();
    return () => turn.stop();
  }, [drawn, reduced, ring]);

  // At 0:00 the second line goes: from then the seats are not known to be held
  // until the server has said so.
  useEffect(() => {
    if (!held) return undefined;
    const timer = setTimeout(() => setTick((value) => value + 1), heldLeft + 50);
    return () => clearTimeout(timer);
  }, [held, heldLeft]);

  const theme = scope.resolvedTheme;
  const dark = theme.themeMode === 'dark';
  const title = scope.strings.translate(drawn === 'offline' ? 'offline' : drawn === 'back' ? 'backOnline' : 'updating');
  const line = held ? scope.strings.translate('stillHeld') : undefined;
  const palette = dark ? seatLayerPickerTokens.color.dark : seatLayerPickerTokens.color.light;
  const signColor = drawn === 'offline' ? palette.connectionLost : drawn === 'back' ? palette.connectionBack : theme.colors.mutedText;
  // The sign grows with the words, to the same 1.6 the sheet stops at.
  const signSize = size.connectionStatusSign * Math.min(PixelRatio.getFontScale(), 1.6);
  const card = (stretch: boolean, onLayout?: (event: LayoutChangeEvent) => void) => (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        line === undefined ? styles.oneLine : styles.twoLines,
        stretch ? styles.stretch : null,
        {
          backgroundColor: dark ? theme.colors.surface : theme.colors.background,
          borderColor: theme.colors.divider,
          shadowColor: theme.colors.text,
        },
      ]}
    >
      <SeatLayerPickerConnectionSign color={signColor} ring={ring} shown={drawn} size={signSize} />
      <View style={styles.words}>
        <Text numberOfLines={stretch ? undefined : 1} style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{title}</Text>
        {line === undefined ? null : <Text numberOfLines={stretch ? undefined : 1} style={[styles.line, { color: theme.colors.mutedText, fontFamily: theme.fontFamily }]}>{line}</Text>}
      </View>
    </View>
  );
  const fits = natural !== undefined && mapWidth !== undefined && seatLayerPickerConnectionFits(natural, mapWidth, place);
  const measured = natural !== undefined && mapWidth !== undefined;
  const rise = reduced ? 0 : size.connectionStatusRise;
  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (Number.isFinite(next) && next > 0) setMapWidth((current) => current !== undefined && Math.abs(current - next) < .5 ? current : next);
      }}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {/* Its natural width, measured off the map's width so nothing wraps. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measure}>
        {card(false, (event) => {
          const next = event.nativeEvent.layout.width;
          if (Number.isFinite(next) && next > 0) setNatural((current) => current !== undefined && Math.abs(current - next) < .5 ? current : next);
        })}
      </View>
      {measured ? <Animated.View
        accessible
        accessibilityLabel={[title, ...(line === undefined ? [] : [line])].join(' ')}
        style={[
          styles.place,
          fits
            ? { top: place.top, start: place.start, maxWidth: Math.min(place.maxWidth ?? Number.POSITIVE_INFINITY, (mapWidth ?? 0) - place.start - place.end) }
            : { top: place.belowTop, start: place.inset, end: place.inset },
          {
            opacity: presence,
            transform: [{ translateY: presence.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
          },
        ]}
      >{card(!fits)}</Animated.View> : null}
    </View>
  );
}

const styles = seatLayerPickerBoldStyles(StyleSheet.create({
  measure: { flexDirection: 'row', left: 0, opacity: 0, position: 'absolute', top: 0, width: 4000 },
  place: { position: 'absolute' },
  card: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth > .5 ? StyleSheet.hairlineWidth : 1,
    elevation: 3,
    flexDirection: 'row',
    paddingEnd: size.connectionStatusPadEnd,
    paddingStart: size.connectionStatusPadStart,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: .15,
    shadowRadius: 4,
  },
  oneLine: { borderRadius: size.connectionStatusHeight / 2, minHeight: size.connectionStatusHeight },
  twoLines: { borderRadius: seatLayerPickerTokens.radius.connectionStatusTwoLines, minHeight: size.connectionStatusTwoLineHeight, paddingVertical: 6 },
  stretch: { alignSelf: 'stretch' },
  words: { flexShrink: 1, marginStart: size.connectionStatusSignGap },
  title: { fontSize: size.connectionStatusTitleFont, fontWeight: '600', lineHeight: size.connectionStatusTitleFont * 1.3 },
  line: { fontSize: size.connectionStatusLineFont, fontWeight: '400', lineHeight: size.connectionStatusLineFont * 1.35 },
}));
