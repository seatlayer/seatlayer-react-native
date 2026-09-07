import React, { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from './safeAreaInsets';
import { seatLayerPickerLineWidth } from './lineWidth';

export interface SeatLayerPickerBottomSheetFrameProps {
  readonly children: ReactNode;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly scrimColor: string;
  readonly surfaceColor: string;
  readonly borderColor: string;
  readonly radius: number;
  readonly maxHeight?: number | `${number}%`;
  readonly style?: StyleProp<ViewStyle>;
}

/** Inner prompt geometry: an edge-to-edge scrim with a separately safe sheet. */
export function SeatLayerPickerBottomSheetFrame(
  props: SeatLayerPickerBottomSheetFrameProps,
): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const viewport = useWindowDimensions();
  const insets = normalizeSeatLayerPickerSafeAreaInsets(props.safeAreaInsets, viewport);
  const dismiss = () => { void scope.back(); };
  return (
    <View testID="seatlayer-picker-bottom-sheet-scrim" style={[styles.root, { backgroundColor: props.scrimColor }]}>
      <Pressable
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={dismiss}
        style={styles.backdrop}
        testID="seatlayer-picker-bottom-sheet-backdrop"
      />
      <View pointerEvents="box-none" style={[styles.safeBounds, {
        paddingTop: insets.top + 16,
        paddingRight: insets.right + 16,
        paddingBottom: insets.bottom + 16,
        paddingLeft: insets.left + 16,
      }]}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, props.style, {
            backgroundColor: props.surfaceColor,
            borderColor: props.borderColor,
            borderRadius: props.radius,
            maxHeight: props.maxHeight ?? '80%',
          }]}
          testID="seatlayer-picker-bottom-sheet-content"
        >
          {props.children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  safeBounds: { flex: 1, justifyContent: 'flex-end' },
  sheet: { alignSelf: 'stretch', borderWidth: seatLayerPickerLineWidth, flexShrink: 1, overflow: 'hidden' },
});
