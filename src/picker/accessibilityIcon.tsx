import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function SeatLayerPickerAccessIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View accessible={false} style={icons.root}>
      <Text allowFontScaling={false} style={[icons.glyph, { color }]}>♿︎</Text>
    </View>
  );
}

const icons = StyleSheet.create({
  root: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 21, lineHeight: 23, fontWeight: '700' },
});
