import React, { useEffect, useRef, useState } from 'react';
import { I18nManager, Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { SeatLayerPickerBuyerAssetLoader } from './buyerAssetLoader';
import { blendSeatLayerPickerColor, seatLayerPickerColorAlpha } from './colors';
import { seatLayerPickerConfirmBandInk, type SeatLayerPickerConfirmIdentityCell } from './confirmCardIdentity';
import { seatLayerPickerTokens } from './tokens.g';

/** §3.8.3 — the parts the seat card is assembled from. */

const clamp = seatLayerPickerTokens.type.scaleClamp.card;

export interface ConfirmCardTheme {
  readonly surface: string;
  readonly text: string;
  readonly mutedText: string;
  readonly divider: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly warning: string;
  readonly error: string;
  readonly fontFamily?: string;
}

/**
 * Three labelled cells of EQUAL width, centred, divided by hairlines, with a
 * hairline under the grid. Only a long section drops to the small wrapping
 * type: a numbered section reads as one line of equals with the row and seat.
 */
export function ConfirmIdentityGrid(props: Readonly<{
  cells: readonly SeatLayerPickerConfirmIdentityCell[];
  theme: ConfirmCardTheme;
  valueFontSize?: number;
  longFontSize?: number;
  cellPadding?: Readonly<{ top: number; side: number; bottom: number }>;
}>): React.ReactElement {
  const { theme } = props;
  const value = props.valueFontSize ?? seatLayerPickerTokens.size.confirmIdentityValueFontSize;
  const long = props.longFontSize ?? seatLayerPickerTokens.size.confirmIdentityLongSectionFontSize;
  const pad = props.cellPadding;
  return <View
    style={[styles.grid, {
      borderBottomColor: theme.divider,
      flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
      minHeight: seatLayerPickerTokens.size.confirmIdentityHeight,
    }]}
    testID="seatLayerConfirmIdentity"
  >
    {props.cells.map((cell, index) => <View
      key={`${cell.key}:${index}`}
      style={[styles.cell, {
        borderStartColor: theme.divider,
        borderStartWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
        ...(pad === undefined ? {} : { paddingTop: pad.top, paddingBottom: pad.bottom, paddingHorizontal: pad.side }),
      }]}
    >
      <Text
        maxFontSizeMultiplier={clamp}
        numberOfLines={1}
        style={[styles.cellKey, { color: theme.mutedText, fontFamily: theme.fontFamily }]}
      >{cell.key.toLocaleUpperCase()}</Text>
      <Text
        maxFontSizeMultiplier={clamp}
        numberOfLines={cell.long ? 2 : 1}
        ellipsizeMode="tail"
        style={[styles.cellValue, { color: theme.text, fontFamily: theme.fontFamily, fontSize: cell.long ? long : value }]}
      >{cell.value}</Text>
    </View>)}
  </View>;
}

/**
 * The category's own colour, full bleed, printing two things and nothing else:
 * the name, which takes the room and ellipsises, and the price at the trailing
 * edge, which never truncates. The ink is chosen per colour.
 */
export function ConfirmCategoryBand(props: Readonly<{
  color: string;
  name: string;
  price?: string;
  theme: ConfirmCardTheme;
  padding?: Readonly<{ top: number; bottom: number; leading: number; trailing: number }>;
  priceFontSize?: number;
}>): React.ReactElement {
  const ink = seatLayerPickerConfirmBandInk(props.color);
  const size = seatLayerPickerTokens.size;
  const pad = props.padding ?? {
    top: size.confirmBandPadTop,
    bottom: size.confirmBandPadBottom,
    leading: size.confirmBandPadLeading,
    trailing: size.confirmBandPadTrailing,
  };
  return <View
    style={[styles.band, {
      backgroundColor: props.color,
      flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
      paddingTop: pad.top,
      paddingBottom: pad.bottom,
      paddingStart: pad.leading,
      paddingEnd: pad.trailing,
    }]}
    testID="seatLayerConfirmBand"
  >
    <Text
      maxFontSizeMultiplier={clamp}
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.bandName, { color: ink, fontFamily: props.theme.fontFamily }]}
    >{props.name}</Text>
    {props.price === undefined ? null : <Text
      maxFontSizeMultiplier={clamp}
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[styles.bandPrice, {
        color: ink,
        fontFamily: props.theme.fontFamily,
        fontSize: props.priceFontSize ?? size.confirmBandPriceFontSize,
      }]}
    >{props.price}</Text>}
  </View>;
}

export type SeatLayerPickerSeatPhotoState = 'loading' | 'ready' | 'missing';

export interface SeatLayerPickerSeatPhoto {
  readonly state: SeatLayerPickerSeatPhotoState;
  readonly source?: string;
}

/**
 * The photograph's bytes for one reference.
 *
 * `undefined` from the loader is "no photograph" for every reason at once, and
 * the reference is evicted on a miss so reopening the seat tries again.
 */
export function useSeatLayerPickerSeatPhoto(
  loader: SeatLayerPickerBuyerAssetLoader | undefined,
  reference: string | undefined,
): SeatLayerPickerSeatPhoto {
  const [photo, setPhoto] = useState<SeatLayerPickerSeatPhoto>(
    () => reference === undefined || loader === undefined ? { state: 'missing' } : { state: 'loading' },
  );
  const liveRef = useRef(0);
  useEffect(() => {
    const generation = ++liveRef.current;
    if (reference === undefined || loader === undefined) {
      setPhoto({ state: 'missing' });
      return () => { liveRef.current += 1; };
    }
    setPhoto({ state: 'loading' });
    void loader.load(reference).then((source) => {
      if (generation !== liveRef.current) return;
      if (typeof source === 'string' && source.length > 0) setPhoto({ state: 'ready', source });
      else {
        loader.evict(reference);
        setPhoto({ state: 'missing' });
      }
    });
    return () => { liveRef.current += 1; };
  }, [loader, reference]);
  return photo;
}

/**
 * The strip: the neutral gradient while the bytes are in flight, the image
 * over it on arrival, the pills in the trailing bottom corner and the sight
 * line in the trailing top one. A miss takes the whole slot away.
 */
export function ConfirmPhotoStrip(props: Readonly<{
  photo: SeatLayerPickerSeatPhoto;
  theme: ConfirmCardTheme;
  sightline?: string;
  pills: readonly Readonly<{ kind: string; label: string; accessibilityLabel?: string; onPress: () => void }>[];
  disabled?: boolean;
}>): React.ReactElement {
  const { theme } = props;
  const start = blendSeatLayerPickerColor(theme.accent, theme.surface, 0.22, theme.surface);
  const end = blendSeatLayerPickerColor(theme.text, theme.surface, 0.12, theme.surface);
  return <View style={styles.strip} testID="seatLayerConfirmPhotoStrip">
    <View pointerEvents="none" style={styles.stripGround}>
      {Array.from({ length: 16 }, (_, index) => <View
        key={index}
        style={{ backgroundColor: blendSeatLayerPickerColor(end, start, index / 15, theme.surface), flex: 1 }}
      />)}
    </View>
    {props.photo.state === 'ready' && props.photo.source !== undefined
      ? <Image
        accessibilityElementsHidden
        importantForAccessibility="no"
        resizeMode="cover"
        source={{ uri: props.photo.source }}
        style={StyleSheet.absoluteFill}
        testID="seatLayerConfirmPhoto"
      />
      : null}
    {props.sightline === undefined ? null : <View style={[styles.sightPill, { backgroundColor: plate }]} testID="seatLayerConfirmSightline">
      <Text maxFontSizeMultiplier={clamp} numberOfLines={1} style={[styles.sightText, { fontFamily: theme.fontFamily }]}>{props.sightline}</Text>
    </View>}
    <View style={[styles.stripPills, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row' }]}>
      {props.pills.map((pill) => <Pressable
        accessibilityRole="button"
        accessibilityLabel={pill.accessibilityLabel ?? pill.label}
        accessibilityState={{ disabled: props.disabled === true }}
        disabled={props.disabled}
        key={pill.kind}
        onPress={pill.onPress}
        style={[styles.pill, { backgroundColor: plate, opacity: props.disabled === true ? 0.5 : 1 }]}
        testID={`seatLayerConfirmPill-${pill.kind}`}
      >
        <Text maxFontSizeMultiplier={clamp} numberOfLines={1} style={[styles.pillText, { fontFamily: theme.fontFamily }]}>{pill.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

/** A premium chip and a limited-view warning, as their own small blocks. */
export function ConfirmNotices(props: Readonly<{
  premium?: string;
  limited?: string;
  theme: ConfirmCardTheme;
}>): React.ReactElement | null {
  if (props.premium === undefined && props.limited === undefined) return null;
  return <View style={styles.notices} testID="seatLayerConfirmNotices">
    {props.premium === undefined ? null : <Text
      maxFontSizeMultiplier={clamp}
      numberOfLines={1}
      style={[styles.notice, { color: props.theme.accent, fontFamily: props.theme.fontFamily }]}
    >{props.premium}</Text>}
    {props.limited === undefined ? null : <Text
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={clamp}
      numberOfLines={2}
      style={[styles.notice, { color: props.theme.warning, fontFamily: props.theme.fontFamily }]}
    >{props.limited}</Text>}
  </View>;
}

/** The tick the add card draws, and the cross the remove card draws instead. */
export function ConfirmAnswerMark(props: Readonly<{ mode: 'add' | 'remove'; color: string }>): React.ReactElement {
  return props.mode === 'remove'
    ? <View style={styles.cross} testID="seatLayerConfirmCross">
      <View style={[styles.crossBar, { backgroundColor: props.color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.crossBar, { backgroundColor: props.color, transform: [{ rotate: '-45deg' }] }]} />
    </View>
    : <View style={[styles.tick, { borderColor: props.color }]} testID="seatLayerConfirmTick" />;
}

/**
 * The decision row's 3D square: a drawn cube OVER the word, never the word
 * alone. Read on its own, `3D` in a tinted box is a tag; the cube is what says
 * the box is a way into the venue.
 */
export function ConfirmCubeGlyph(props: Readonly<{ color: string; fontFamily?: string; label: string }>): React.ReactElement {
  return <>
    <View accessible={false} style={[styles.cubeMark, { borderColor: props.color }]}>
      <View style={[styles.cubeStem, { backgroundColor: props.color }]} />
      <View style={[styles.cubeEdge, styles.cubeEdgeStart, { backgroundColor: props.color }]} />
      <View style={[styles.cubeEdge, styles.cubeEdgeEnd, { backgroundColor: props.color }]} />
    </View>
    <Text
      maxFontSizeMultiplier={clamp}
      numberOfLines={1}
      style={[styles.cube, { color: props.color, fontFamily: props.fontFamily }]}
    >{props.label}</Text>
  </>;
}

/** Edge length of the drawn cube on the decision row's 3D square. */
const cubeSize = 15;
/** The room inside its 1.4 pt outline, where the corner is actually drawn. */
const cubeInner = cubeSize - 2.8;

/** The dark plate the strip's pills and sight line stand on, in BOTH themes. */
const plate = seatLayerPickerColorAlpha('#0B0F19', 0.62);

const styles = StyleSheet.create({
  grid: { borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  cellKey: {
    fontSize: seatLayerPickerTokens.size.confirmIdentityKeyFontSize,
    fontWeight: '800',
    letterSpacing: seatLayerPickerTokens.size.confirmIdentityKeyFontSize * 0.1,
    textAlign: 'center',
  },
  cellValue: { fontWeight: '800', textAlign: 'center' },
  band: { alignItems: 'center', gap: 10, minHeight: seatLayerPickerTokens.size.confirmBandHeight },
  bandName: { flex: 1, fontSize: seatLayerPickerTokens.size.confirmBandNameFontSize, fontWeight: '800' },
  bandPrice: { flexShrink: 0, fontVariant: ['tabular-nums'], fontWeight: '800' },
  strip: { height: seatLayerPickerTokens.size.confirmPhotoHeight, overflow: 'hidden', position: 'relative' },
  stripGround: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0 },
  stripPills: { bottom: 6, end: 6, gap: 6, position: 'absolute' },
  pill: {
    alignItems: 'center',
    borderRadius: seatLayerPickerTokens.radius.pill,
    height: seatLayerPickerTokens.size.confirmPillHeight,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pillText: { color: '#FFFFFF', fontSize: seatLayerPickerTokens.size.confirmInspectChipFontSize, fontWeight: '800' },
  sightPill: {
    borderRadius: seatLayerPickerTokens.radius.pill,
    end: 6,
    paddingHorizontal: seatLayerPickerTokens.size.confirmSightPadX,
    paddingVertical: seatLayerPickerTokens.size.confirmSightPadY,
    position: 'absolute',
    top: 6,
  },
  sightText: { color: '#FFFFFF', fontSize: seatLayerPickerTokens.size.confirmSightFont, fontWeight: '700' },
  notices: { gap: 4, paddingHorizontal: seatLayerPickerTokens.size.confirmCardGutter, paddingTop: 8 },
  notice: { fontSize: 12, fontWeight: '700' },
  tick: { borderBottomWidth: 2, borderLeftWidth: 2, height: 7, transform: [{ rotate: '-45deg' }], width: 12 },
  cross: { alignItems: 'center', height: 12, justifyContent: 'center', width: 12 },
  crossBar: { height: 2, position: 'absolute', width: 13 },
  cube: { fontSize: seatLayerPickerTokens.size.confirm3dSquareFontSize, fontWeight: '800' },
  // A box with the near corner's three edges inside it: the smallest drawing
  // that still reads as a solid rather than as an empty frame.
  cubeMark: { borderRadius: 3, borderWidth: 1.4, height: cubeSize, marginBottom: 1, width: cubeSize },
  // The near corner of a solid, drawn inside the box's own content edge (the
  // 1.4 pt border, twice): all three strokes MEET at the middle — the vertical
  // edge running down to the floor, and the two top-face edges running up and
  // out to the side walls. Miss the meeting point and the same three strokes
  // read as an arrowhead or a bird.
  cubeStem: {
    height: cubeInner / 2 - 1.6,
    left: cubeInner / 2 - 0.7,
    position: 'absolute',
    top: cubeInner / 2,
    width: 1.4,
  },
  cubeEdge: { height: 1.4, position: 'absolute', top: cubeInner / 2 - 2, width: cubeInner / 2 + 0.3 },
  cubeEdgeStart: { left: 0, transform: [{ rotate: '24deg' }] },
  cubeEdgeEnd: { right: 0, transform: [{ rotate: '-24deg' }] },
});

export type ConfirmCardStyleProp = StyleProp<ViewStyle>;
export type ConfirmCardTextStyleProp = StyleProp<TextStyle>;
