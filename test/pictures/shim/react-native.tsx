/**
 * React Native for the picture tests: react-native-web, with the native rules
 * the browser does not have.
 *
 * - Text grows with the system text size, up to `maxFontSizeMultiplier`.
 * - `left` and `right` follow the reading direction, as they do on an iPhone;
 *   border sides do not (on Android they do).
 * - One bundled font, so a picture does not depend on the machine.
 */
import React, { createContext, forwardRef, useContext } from 'react';
import * as Web from 'react-native-web';

import { picturesSetup } from '../setup';

export * from 'react-native-web';

type AnyProps = Record<string, unknown> & { style?: unknown };

const physical: Readonly<Record<string, string>> = {
  left: 'start',
  marginLeft: 'marginStart',
  marginRight: 'marginEnd',
  paddingLeft: 'paddingStart',
  paddingRight: 'paddingEnd',
  right: 'end',
};

function flat(style: unknown): Record<string, unknown> {
  return (Web.StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

/** Reading right to left, an iPhone swaps left and right, but not border sides. */
function directed(style: unknown): Record<string, unknown> {
  const source = flat(style);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    next[physical[key] ?? key] = key === 'textAlign' && picturesSetup.rtl
      ? value === 'left' ? 'right' : value === 'right' ? 'left' : value
      : value;
  }
  return next;
}

function styled(style: unknown): unknown {
  return typeof style === 'function'
    ? (state: unknown) => directed((style as (state: unknown) => unknown)(state))
    : directed(style);
}

function wrap(Base: React.ElementType, styleKeys: readonly string[] = ['style']) {
  return forwardRef<unknown, AnyProps>(function Directed(props, ref) {
    const next: AnyProps = { ...props };
    for (const key of styleKeys) {
      if (props[key] !== undefined) next[key] = styled(props[key]);
    }
    return <Base {...next} ref={ref} />;
  });
}

export const View = wrap(Web.View as React.ElementType);
const DirectedPressable = wrap(Web.Pressable as React.ElementType);

/** The browser has no `hitSlop`; the layout checks read it from the element. */
export const Pressable = forwardRef<unknown, AnyProps>(function Slop(props, ref) {
  const { hitSlop, ...rest } = props;
  const slop = typeof hitSlop === 'number'
    ? { top: hitSlop, right: hitSlop, bottom: hitSlop, left: hitSlop }
    : hitSlop;
  return (
    <DirectedPressable
      {...rest}
      {...(slop ? { dataSet: { slop: JSON.stringify(slop) } } : {})}
      ref={ref}
    />
  );
});
export const Image = wrap(Web.Image as React.ElementType);
export const ScrollView = wrap(
  Web.ScrollView as React.ElementType,
  ['style', 'contentContainerStyle'],
);
export const SafeAreaView = wrap(Web.SafeAreaView as React.ElementType);

const TextScale = createContext<number | undefined>(undefined);

export const Text = forwardRef<unknown, AnyProps>(function ScaledText(props, ref) {
  const inherited = useContext(TextScale);
  const { allowFontScaling, maxFontSizeMultiplier, ...rest } = props;
  const limit = typeof maxFontSizeMultiplier === 'number' && maxFontSizeMultiplier >= 1
    ? maxFontSizeMultiplier
    : undefined;
  const scale = allowFontScaling === false
    ? 1
    : limit === undefined
      ? inherited ?? picturesSetup.fontScale
      : Math.min(limit, picturesSetup.fontScale);
  const style = directed(props.style);
  const grown = (key: string, value: unknown) =>
    typeof value === 'number' ? value * scale : value;
  const nested = inherited !== undefined;
  const size = style.fontSize ?? (nested ? undefined : 14);
  return (
    <TextScale.Provider value={scale}>
      <Web.Text
        {...(rest as object)}
        ref={ref as never}
        style={{
          ...style,
          ...(nested && style.fontFamily === undefined
            ? {}
            : { fontFamily: picturesSetup.fontFamily }),
          ...(size === undefined ? {} : { fontSize: grown('fontSize', size) }),
          ...(style.lineHeight === undefined
            ? {}
            : { lineHeight: grown('lineHeight', style.lineHeight) }),
          ...(style.letterSpacing === undefined
            ? {}
            : { letterSpacing: grown('letterSpacing', style.letterSpacing) }),
        } as never}
      />
    </TextScale.Provider>
  );
});

export const Animated = {
  ...Web.Animated,
  Image: Web.Animated.createAnimatedComponent(Image as never),
  ScrollView: Web.Animated.createAnimatedComponent(ScrollView as never),
  Text: Web.Animated.createAnimatedComponent(Text as never),
  View: Web.Animated.createAnimatedComponent(View as never),
};

export const I18nManager = {
  ...Web.I18nManager,
  get isRTL(): boolean {
    return picturesSetup.rtl;
  },
};

export const PixelRatio = {
  ...Web.PixelRatio,
  get: () => Web.PixelRatio.get(),
  getFontScale: () => picturesSetup.fontScale,
  roundToNearestPixel: (value: number) => Web.PixelRatio.roundToNearestPixel(value),
};

export function useWindowDimensions() {
  return { ...Web.useWindowDimensions(), fontScale: picturesSetup.fontScale };
}

/** Pictures are of the screen at rest. */
export const AccessibilityInfo = {
  ...Web.AccessibilityInfo,
  addEventListener: () => ({ remove: () => undefined }),
  announceForAccessibility: () => undefined,
  isBoldTextEnabled: () => Promise.resolve(false),
  isReduceMotionEnabled: () => Promise.resolve(true),
  isScreenReaderEnabled: () => Promise.resolve(false),
  prefersCrossFadeTransitions: () => Promise.resolve(false),
  sendAccessibilityEvent: () => undefined,
  setAccessibilityFocus: () => undefined,
};

export const BackHandler = {
  addEventListener: () => ({ remove: () => undefined }),
  exitApp: () => undefined,
};

export const StatusBar = Object.assign(() => null, {
  currentHeight: 0,
  setBarStyle: () => undefined,
});

export const findNodeHandle = () => null;
