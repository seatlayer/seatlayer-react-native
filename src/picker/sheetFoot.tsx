import React, { useMemo, useState, type ReactNode } from 'react';
import { Animated, Pressable, View, type GestureResponderHandlers } from 'react-native';

import { SeatLayerCartBarProvider, useSeatLayerCartBarUnder } from './cartBarButton';
import { seatLayerCartBarSize as bar } from './cartBarRule';
import { SeatLayerCartBarWords, useSeatLayerCartBarSummary } from './cartBarWords';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';
import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { SeatLayerSheetHandle } from './sheetHandle';
import type { SeatLayerPickerStyles } from './styles';

/**
 * The phone's cart row: the circle that opens the list, what is in the cart and
 * what it comes to, and the way on, on one line. The sheet keeps the room under
 * it. News about the buyer's own seats stands over it.
 */
export interface SeatLayerSheetFootProps {
  readonly holdLapse?: ReactNode;
  readonly actionError?: ReactNode;
  readonly checkoutBar?: ReactNode;
  /** An app's own part in the button's place: it keeps the full width, under the words. */
  readonly checkoutBarIsCustom: boolean;
  readonly expanded: boolean;
  readonly toggleLabel: string;
  readonly onToggle: () => void;
  readonly progress: Animated.Value;
  readonly panHandlers: Partial<GestureResponderHandlers>;
  /** A seat card is asking: nothing in the row can be pressed until it is answered. */
  readonly asking: boolean;
  /** The row's width, before the first layout says it. */
  readonly width: number;
  readonly landing?: boolean;
  readonly styles: Pick<SeatLayerPickerStyles, 'peekSummaryText' | 'continueButtonText'>;
}

export function SeatLayerSheetFoot(props: SeatLayerSheetFootProps): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  const [width, setWidth] = useState(props.width);
  const [besideButton, setBesideButton] = useState<number | undefined>(undefined);
  // The two say nothing most of the time, and then take no room.
  const [news, setNews] = useState(false);
  const row = useMemo(() => ({ onWordsWidth: setBesideButton, width }), [width]);
  const summary = useSeatLayerCartBarSummary();
  const own = useSeatLayerCartBarUnder(width, theme, props.styles.continueButtonText);
  const button = summary.closed ? null : props.checkoutBar;
  const under = button !== null && (props.checkoutBarIsCustom || own.under);
  const besideDisc = Math.max(0, width - bar.padX * 2 - bar.disc - bar.gap);
  const room = button === null || props.checkoutBarIsCustom ? besideDisc : besideButton ?? besideDisc;
  return (
    <View testID="seatlayer-cart-foot">
      <View style={{ paddingHorizontal: bar.padX, paddingTop: news ? bar.padY : 0 }}>
        <View onLayout={(event) => setNews(event.nativeEvent.layout.height > 0)}>
          {props.holdLapse}
          {props.actionError}
        </View>
      </View>
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          if (Number.isFinite(next) && next > 0 && Math.abs(next - width) >= .5) setWidth(next);
        }}
        pointerEvents={props.asking ? 'none' : 'box-none'}
        style={{
          alignItems: under ? 'stretch' : 'center',
          flexDirection: under ? 'column' : 'row',
          gap: under ? bar.underGap : bar.gap,
          opacity: props.asking ? bar.askingOpacity : 1,
          paddingHorizontal: bar.padX,
          paddingTop: bar.padY,
        }}
        testID="seatlayer-cart-row"
      >
        {own.box}
        <View
          style={{
            alignItems: 'center', flexDirection: 'row', gap: bar.gap, minHeight: bar.minHeight,
            ...(under ? {} : { flex: 1, minWidth: 0 }),
          }}
          testID="seatlayer-cart-row-words"
          {...props.panHandlers}
        >
          <SeatLayerSheetHandle
            expanded={props.expanded}
            hidden={props.asking}
            label={props.toggleLabel}
            onPress={props.onToggle}
            progress={props.progress}
            theme={theme}
          />
          {/* The words open the list as the circle does; a screen reader is
              given the circle for it, and reads these as a line. */}
          <Pressable
            accessible
            accessibilityLabel={summary.spoken}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
            onPress={props.onToggle}
            style={{ flex: 1, justifyContent: 'center', minHeight: bar.minHeight, minWidth: 0 }}
            testID="seatlayer-cart-total-line"
          >
            <SeatLayerCartBarWords
              landing={props.landing}
              room={room}
              style={props.styles.peekSummaryText}
              summary={summary}
              theme={theme}
            />
          </Pressable>
        </View>
        {button === null
          ? null
          : props.checkoutBarIsCustom
            ? button
            : <SeatLayerCartBarProvider value={row}>{button}</SeatLayerCartBarProvider>}
      </View>
    </View>
  );
}
