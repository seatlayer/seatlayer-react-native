import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { SeatLayerConnectionShown } from './connection';
import { seatLayerPickerColorAlpha } from './mapChromeTheme';

/**
 * The three signs differ in shape as well as colour: a crossed-out wifi sign,
 * a turning ring, a tick. Never the club's accent.
 */
export function SeatLayerPickerConnectionSign({ color, ring, shown, size: side }: Readonly<{
  color: string;
  /** Turns the ring; without one it stands still. */
  ring?: Animated.Value;
  shown: SeatLayerConnectionShown;
  size: number;
}>): React.ReactElement {
  const stroke = Math.max(1.5, side / 9);
  if (shown === 'updating') {
    const turn = ring === undefined ? '0deg' : ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const inner = side * .8;
    return <View style={[signStyles.sign, { height: side, width: side }]}>
      <Animated.View style={{
        borderColor: seatLayerPickerColorAlpha(color, .25), borderRadius: inner / 2, borderTopColor: color,
        borderWidth: stroke, height: inner, transform: [{ rotate: turn }], width: inner,
      }} />
    </View>;
  }
  if (shown === 'back') {
    return <View style={[signStyles.sign, { height: side, width: side }]}>
      <View style={{
        borderBottomWidth: stroke, borderColor: color, borderLeftWidth: stroke,
        height: side * .32, marginTop: -side * .12, transform: [{ rotate: '-45deg' }], width: side * .62,
      }} />
    </View>;
  }
  // Three arcs over a dot, struck through.
  const arcs = [1, .68, .36];
  return <View style={[signStyles.sign, { height: side, width: side }]}>
    {arcs.map((share) => {
      const width = side * share;
      return <View key={share} style={{
        borderColor: 'transparent', borderRadius: width / 2, borderTopColor: color, borderWidth: stroke,
        height: width, left: (side - width) / 2, position: 'absolute', top: side * .2 + (side - width) / 2, width,
      }} />;
    })}
    <View style={{
      backgroundColor: color, borderRadius: stroke, height: stroke * 1.4, left: side / 2 - stroke * .7,
      position: 'absolute', top: side * .72, width: stroke * 1.4,
    }} />
    <View style={{
      backgroundColor: color, borderRadius: stroke / 2, height: stroke, left: -side * .06,
      position: 'absolute', top: side / 2 - stroke / 2, transform: [{ rotate: '45deg' }], width: side * 1.12,
    }} />
  </View>;
}

const signStyles = StyleSheet.create({
  sign: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
