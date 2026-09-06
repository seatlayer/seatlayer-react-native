import React from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { seatLayerPickerMapChromeGround } from './mapChromeTheme';
import type { SeatLayerMapControlsProps } from './SeatLayerMapControls';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { sanitizeSeatLayerPickerStyle } from './styles';
import { seatLayerPickerTokens } from './tokens.g';
import { seatLayerPickerBold } from './boldText';

const segmentPaintHeight = seatLayerPickerTokens.size.viewModeButtonHeight;
/** Air between the two halves, so the bed reads between them and not only around. */
const segmentGap = 2;
/**
 * The bed the two halves stand ON, all round (`picker_map_controls.dart`:
 * `padding: EdgeInsets.all(3)`). Without it the lit half is butted against the
 * track's own hairline, which then prints dark over the accent, and the whole
 * control comes out six points narrow.
 */
const segmentBed = 3;
/**
 * The track's own hairline, which the reference counts as part of the track
 * (`Container`, not `DecoratedBox` — its own comment says so), so the bed the
 * halves stand on is measured INSIDE it.
 */
const trackLine = 1;
/**
 * The air the Map/3D control carries above its own track so that its press
 * target clears the touch floor. The anchor takes it back, or the track lands
 * a bed's depth below the line the test chip opposite it stands on.
 */
export const seatLayerPickerViewModeTrackInset =
  (seatLayerPickerTokens.size.minimumHitTarget -
    seatLayerPickerTokens.size.viewModeControlHeight) / 2;

export function SeatLayerPickerViewModeControlView({
  buyerView,
  disabled,
  style,
  theme,
  slots,
  strings,
  target,
  onPress,
  onLayout,
}: {
  readonly buyerView: 'map' | 'venue3d' | undefined;
  readonly disabled: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>['resolvedTheme'];
  readonly slots: SeatLayerMapControlsProps['slots'];
  readonly strings: ReturnType<typeof useSeatLayerPickerScope>['strings'];
  readonly target: number;
  readonly onPress: (view: 'map' | 'venue3d') => void;
  readonly onLayout?: (width: number) => void;
}): React.ReactElement {
  // A track with the two halves INSIDE it. The bed is what tells a buyer the
  // pair is one control: painted edge to edge, the lit half reads as a block
  // butted against a button rather than as the thumb of a switch.
  const trackInset = seatLayerPickerViewModeTrackInset;
  const paintInset = (target - segmentPaintHeight) / 2;
  const chrome = seatLayerPickerMapChromeGround(theme);
  const segment = (
    label: string,
    spoken: string,
    selected: boolean,
    view: 'map' | 'venue3d',
  ) => (
    <Pressable
      key={view}
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || selected, selected }}
      disabled={disabled || selected}
      onPress={() => onPress(view)}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: target,
        justifyContent: 'center',
        minWidth: theme.layout.viewModeButtonMinWidth,
        opacity: disabled ? 0.45 : pressed && !selected ? 0.72 : 1,
        paddingHorizontal: 8,
      })}
    >
      <View
        pointerEvents="none"
        style={[
          {
            backgroundColor: selected ? theme.colors.accent : 'transparent',
            borderRadius: seatLayerPickerTokens.radius.pill,
            bottom: paintInset,
            left: 0,
            position: 'absolute',
            right: 0,
            top: paintInset,
          },
          slots?.mapControlButton,
        ]}
      />
      <Text
        style={[
          {
            color: selected ? theme.colors.onAccent : theme.colors.mutedText,
            fontFamily: theme.fontFamily,
            fontSize: theme.layout.viewModeLabelFontSize,
            fontWeight: seatLayerPickerBold(800),
            // Four hundredths of the label's own size, as the reference sets it.
            letterSpacing: theme.layout.viewModeLabelFontSize * .04,
          },
          slots?.mapControlLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const mapSelected = buyerView === 'map';
  const venueSelected = buyerView === 'venue3d';
  return (
    <View onLayout={(event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      if (!Number.isFinite(width) || width < 0) return;
      try { onLayout?.(width); } catch { /* Host observation remains isolated. */ }
    }} style={[
      { height: target, paddingHorizontal: segmentBed + trackLine, position: 'relative' },
      sanitizeSeatLayerPickerStyle(style),
      { height: target, paddingHorizontal: segmentBed + trackLine, position: 'relative' },
    ]}>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: chrome.ground,
          borderRadius: seatLayerPickerTokens.radius.pill,
          bottom: trackInset,
          elevation: 3,
          left: 0,
          position: 'absolute',
          right: 0,
          shadowColor: theme.colors.text,
          shadowOffset: { height: 3, width: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          top: trackInset,
        }}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel={strings.translate('venueView')}
        style={{ columnGap: segmentGap, flexDirection: 'row', height: target }}
      >
        {segment(
          strings.translate('mapView'), strings.translate('flat2dMap'), mapSelected, 'map',
        )}
        {segment(
          strings.translate('venue3D'),
          strings.translate('interactive3dVenueView'),
          venueSelected,
          'venue3d',
        )}
      </View>
      <View
        pointerEvents="none"
        style={{
          borderColor: chrome.line,
          borderRadius: seatLayerPickerTokens.radius.pill,
          borderWidth: 1,
          bottom: trackInset,
          left: 0,
          position: 'absolute',
          right: 0,
          top: trackInset,
        }}
      />
    </View>
  );
}
