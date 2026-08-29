import React from 'react';
import { StyleSheet, View } from 'react-native';

export function SeatLayerPickerAccessIcon({ color }: { readonly color: string }): React.ReactElement {
  return (
    <View accessible={false} style={icons.root}>
      <View style={[icons.head, { backgroundColor: color }]} />
      <View style={[icons.body, { backgroundColor: color }]} />
      <View style={[icons.arm, icons.left, { backgroundColor: color }]} />
      <View style={[icons.arm, icons.right, { backgroundColor: color }]} />
      <View style={[icons.leg, icons.leftLeg, { backgroundColor: color }]} />
      <View style={[icons.leg, icons.rightLeg, { backgroundColor: color }]} />
    </View>
  );
}

const icons = StyleSheet.create({
  root: { width: 22, height: 22, alignItems: 'center' },
  head: { width: 5, height: 5, borderRadius: 3 },
  body: { position: 'absolute', top: 7, width: 4, height: 7, borderRadius: 2 },
  arm: { position: 'absolute', top: 9, width: 10, height: 2, borderRadius: 1 },
  left: { transform: [{ translateX: -5 }, { rotate: '-25deg' }] },
  right: { transform: [{ translateX: 5 }, { rotate: '25deg' }] },
  leg: { position: 'absolute', top: 14, width: 9, height: 2, borderRadius: 1 },
  leftLeg: { transform: [{ translateX: -4 }, { rotate: '-35deg' }] },
  rightLeg: { transform: [{ translateX: 4 }, { rotate: '35deg' }] },
});
