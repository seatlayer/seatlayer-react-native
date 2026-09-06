import React from 'react';
import { View, type ViewStyle } from 'react-native';

/**
 * The zoom glyphs, measured off the reference frame rather than drawn to a
 * round number: `Icons.add_rounded` / `Icons.remove_rounded` at twenty points
 * (`picker_map_controls.dart`) print an arm 11.33 pt long and 1.33 pt thick,
 * where these were fourteen by two — a fifth too long and half again as heavy.
 */
const zoomGlyphArm = 11 + 1 / 3;
const zoomGlyphStroke = 4 / 3;

export function SeatLayerPickerPlusIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View style={{ backgroundColor: color, borderRadius: zoomGlyphStroke / 2, height: zoomGlyphStroke, width: zoomGlyphArm }}>
      <View
        style={{
          backgroundColor: color,
          borderRadius: zoomGlyphStroke / 2,
          height: zoomGlyphArm,
          left: (zoomGlyphArm - zoomGlyphStroke) / 2,
          position: 'absolute',
          top: (zoomGlyphStroke - zoomGlyphArm) / 2,
          width: zoomGlyphStroke,
        }}
      />
    </View>
  );
}

export function SeatLayerPickerMinusIcon({ color }: { readonly color: string }): React.ReactElement {
  return <View style={{ backgroundColor: color, borderRadius: zoomGlyphStroke / 2, height: zoomGlyphStroke, width: zoomGlyphArm }} />;
}

export function SeatLayerPickerBackIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View style={{ height: 16, width: 18 }}>
      <View
        style={{
          backgroundColor: color,
          height: 2,
          left: 2,
          position: 'absolute',
          top: 7,
          width: 15,
        }}
      />
      <View
        style={{
          borderColor: color,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          height: 8,
          left: 1,
          position: 'absolute',
          top: 4,
          transform: [{ rotate: '-45deg' }],
          width: 8,
        }}
      />
    </View>
  );
}

export function SeatLayerPickerFocusCornersIcon({ color }: { readonly color: string }): React.ReactElement {
  const corner = (position: ViewStyle, rotate: string) => (
    <View
      key={rotate}
      style={[
        {
          borderColor: color,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          height: 7,
          position: 'absolute',
          transform: [{ rotate }],
          width: 7,
        },
        position,
      ]}
    />
  );
  return (
    <View style={{ height: 16, width: 16 }}>
      {corner({ left: 0, top: 0 }, '0deg')}
      {corner({ right: 0, top: 0 }, '90deg')}
      {corner({ bottom: 0, right: 0 }, '180deg')}
      {corner({ bottom: 0, left: 0 }, '270deg')}
      <View style={{
        backgroundColor: color,
        borderRadius: 2,
        height: 4,
        left: 6,
        position: 'absolute',
        top: 6,
        width: 4,
      }} />
    </View>
  );
}
