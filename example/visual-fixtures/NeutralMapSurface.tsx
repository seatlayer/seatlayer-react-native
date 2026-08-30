import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { resolveSeatLayerPickerImmersiveTheme } from '../../src/picker/immersiveChrome';
import type { SeatLayerPickerThemeData } from '../../src/picker/theme';

/**
 * Deterministic map replacement for native-chrome screenshots. The hosted map
 * is intentionally absent: it would make a local visual fixture network- and
 * renderer-dependent.
 */
export function NeutralMapSurface({
  immersive = false,
  theme,
}: Readonly<{
  immersive?: boolean;
  theme: SeatLayerPickerThemeData;
}>): React.ReactElement {
  if (immersive) {
    const palette = resolveSeatLayerPickerImmersiveTheme(theme);
    return (
      <View testID="seatlayer-visual-fixture-map" style={[styles.root, { backgroundColor: palette.colors.mapBackground }]}>
        <View style={[styles.venueGlow, { backgroundColor: palette.colors.accent }]} />
        <View style={styles.venueScene}>
          <View style={[styles.venueStage, { backgroundColor: palette.colors.surface, borderColor: palette.colors.divider }]}>
            <Text accessible={false} style={[styles.venueStageLabel, { color: palette.colors.mapText, fontFamily: palette.fontFamily }]}>STAGE</Text>
          </View>
          <View style={[styles.venueRow, styles.venueRowBack, { backgroundColor: palette.colors.surface, borderColor: palette.colors.divider }]} />
          <View style={[styles.venueRow, styles.venueRowMiddle, { backgroundColor: palette.colors.mapSelection }]} />
          <View style={[styles.venueRow, styles.venueRowFront, { backgroundColor: palette.colors.accent }]} />
          <View style={[styles.venueWing, styles.venueWingLeft, { backgroundColor: palette.colors.surface, borderColor: palette.colors.divider }]} />
          <View style={[styles.venueWing, styles.venueWingRight, { backgroundColor: palette.colors.surface, borderColor: palette.colors.divider }]} />
        </View>
      </View>
    );
  }
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
  venueGlow: { borderRadius: 140, height: 280, opacity: 0.07, position: 'absolute', top: '20%', width: 280 },
  venueRow: { borderRadius: 18, borderWidth: 1, height: 34, position: 'absolute' },
  venueRowBack: { opacity: 0.78, top: 98, width: 220 },
  venueRowFront: { opacity: 0.58, top: 194, width: 330 },
  venueRowMiddle: { opacity: 0.5, top: 146, width: 278 },
  venueScene: { alignItems: 'center', height: 272, marginTop: 76, width: '100%' },
  venueStage: { alignItems: 'center', borderRadius: 6, borderWidth: 1, height: 44, justifyContent: 'center', width: 154 },
  venueStageLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  venueWing: { borderRadius: 12, borderWidth: 1, height: 104, opacity: 0.64, position: 'absolute', top: 118, width: 50 },
  venueWingLeft: { left: 8, transform: [{ rotate: '-8deg' }] },
  venueWingRight: { right: 8, transform: [{ rotate: '8deg' }] },
});
