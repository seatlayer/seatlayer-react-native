import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SeatLayerPickerStringResolver } from './locale';
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from './styles';
import type { SeatLayerPickerThemeData } from './theme';
import { seatLayerPickerColorAlpha } from './colors';

/**
 * §3.13.1. The loading surface draws the **venue silhouette**, not a spinner:
 * three concentric seating shells around a stage, in the accent at low opacity,
 * with a thin indeterminate progress strip at the top of the map. The sentence
 * `strings.loading` is announced but not drawn.
 *
 * The shells are plain rounded views rather than paths, so this needs no SVG
 * dependency; a Swift/Compose port should draw the same three arcs around the
 * same stage bar. The breathing sweep is left to the caller's motion layer —
 * under reduced motion the whole surface is simply removed, no fade, no sweep.
 */

type Slots = Pick<SeatLayerPickerStyles, 'statusContainer'>;

export interface SeatLayerPickerLoadingSurfaceProps {
  readonly theme: SeatLayerPickerThemeData;
  readonly strings: SeatLayerPickerStringResolver;
  readonly themeStyles?: SeatLayerPickerThemeStyles;
  readonly slots?: Slots;
  readonly style?: StyleProp<ViewStyle>;
  /** Fraction of the strip that is lit, 0..1. Indeterminate by default. */
  readonly progress?: number;
}

/** Outer to inner, as fractions of the surface's short side. */
const shellScales = [0.94, 0.7, 0.46] as const;
const shellOpacities = [0.1, 0.16, 0.24] as const;
const stripHeight = 2;

export function SeatLayerPickerLoadingSurface(
  props: SeatLayerPickerLoadingSurfaceProps,
): React.ReactElement {
  const slots = resolveSeatLayerPickerStyles(props.themeStyles, props.slots);
  const accent = props.theme.colors.accent;
  const lit = typeof props.progress === 'number' && Number.isFinite(props.progress)
    ? Math.max(0, Math.min(1, props.progress))
    : 0.35;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={props.strings.translate('loading')}
      style={[
        styles.root,
        { backgroundColor: props.theme.colors.background },
        slots.statusContainer,
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
      testID="seatlayer-loading-surface"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.strip}
      >
        <View
          style={{
            backgroundColor: seatLayerPickerColorAlpha(accent, 0.85),
            height: stripHeight,
            width: `${lit * 100}%`,
          }}
        />
      </View>
      <View accessible={false} pointerEvents="none" style={styles.venue}>
        {shellScales.map((scale, index) => (
          <View
            key={scale}
            style={[
              styles.shell,
              {
                borderColor: seatLayerPickerColorAlpha(accent, shellOpacities[index]!),
                height: `${scale * 100}%`,
                width: `${scale * 100}%`,
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.stage,
            { backgroundColor: seatLayerPickerColorAlpha(accent, 0.28) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  strip: { left: 0, position: 'absolute', right: 0, top: 0 },
  venue: { alignItems: 'center', aspectRatio: 1, justifyContent: 'flex-end', maxHeight: '70%', width: '78%' },
  shell: {
    borderRadius: 999,
    borderWidth: 10,
    bottom: 0,
    position: 'absolute',
  },
  stage: { borderRadius: 4, bottom: '14%', height: 8, position: 'absolute', width: '26%' },
});
