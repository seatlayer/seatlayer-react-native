import React, { useCallback, useRef } from 'react';
import {
  ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Where a scroll that keeps its foot in view stands: the same distance from
 * its end as before, so growing or shrinking content never moves the part the
 * buyer was looking at. A new scroll stands at its end.
 */
export function seatLayerPickerFootScrollOffset(content: number, viewport: number, fromEnd: number): number {
  if (!Number.isFinite(content) || !Number.isFinite(viewport)) return 0;
  const end = Math.max(0, content - viewport);
  const back = Number.isFinite(fromEnd) && fromEnd > 0 ? fromEnd : 0;
  return Math.max(0, end - back);
}

/**
 * A prompt's body where the screen is too short for all of it: it opens at its
 * foot, with the number and the buttons in sight, and the name is a scroll
 * away. Where everything fits it does not scroll and draws as a plain column.
 */
export function SeatLayerPickerPromptFootScroll({
  children,
  contentContainerStyle,
}: {
  readonly children: React.ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const ref = useRef<ScrollView>(null);
  const content = useRef(0);
  const viewport = useRef(0);
  const fromEnd = useRef(0);
  const pin = useCallback(() => {
    if (content.current <= viewport.current) return;
    ref.current?.scrollTo({ animated: false, y: seatLayerPickerFootScrollOffset(content.current, viewport.current, fromEnd.current) });
  }, []);
  return <ScrollView
    alwaysBounceVertical={false}
    contentContainerStyle={contentContainerStyle}
    keyboardShouldPersistTaps="handled"
    onContentSizeChange={(_width: number, height: number) => { content.current = height; pin(); }}
    onLayout={(event: LayoutChangeEvent) => { viewport.current = event.nativeEvent.layout.height; pin(); }}
    onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      fromEnd.current = Math.max(0, contentSize.height - layoutMeasurement.height - contentOffset.y);
    }}
    ref={ref}
    scrollEventThrottle={16}
    style={footScrollStyle}
    testID="seatlayer-prompt-scroll"
  >{children}</ScrollView>;
}

const footScrollStyle = { flexGrow: 0, flexShrink: 1 } as const;
