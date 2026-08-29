import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SeatLayerPickerThemeData } from '../../src/picker/theme';

/**
 * Deterministic map replacement for native-chrome screenshots. The hosted map
 * is intentionally absent: it would make a local visual fixture network- and
 * renderer-dependent.
 */
export function NeutralMapSurface({
  theme,
}: Readonly<{
  theme: SeatLayerPickerThemeData;
}>): React.ReactElement {
  return (
    <View testID="seatlayer-visual-fixture-map" style={[styles.root, { backgroundColor: theme.colors.mapBackground }]}>
      <View style={[styles.stage, { borderColor: theme.colors.divider }]} />
      <View style={[styles.row, { backgroundColor: theme.colors.mapSelection }]} />
      <View style={[styles.row, styles.lowerRow, { backgroundColor: theme.colors.accent }]} />
      <Text accessible={false} style={[styles.label, { color: theme.colors.mapText, fontFamily: theme.fontFamily }]}>Map preview</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  stage: { borderRadius: 4, borderWidth: 1, height: 18, marginBottom: 42, width: 148 },
  row: { borderRadius: 10, height: 20, width: 184 },
  lowerRow: { marginTop: 18, width: 148 },
  label: { fontSize: 12, lineHeight: 16, marginTop: 28 },
});
