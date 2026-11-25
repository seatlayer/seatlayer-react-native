import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
  },
  Animated: {
    Value: class { constructor(readonly value: number) {} },
    View: 'AnimatedView',
    timing: () => ({ start: () => undefined, stop: () => undefined }),
  },
  Easing: { bezier: () => 'ease' },
  I18nManager: { isRTL: false }, Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: {
    absoluteFill: {}, create: <T>(value: T) => value,
    flatten: (value: unknown) => Object.assign({}, ...[value].flat(9).filter(Boolean)), hairlineWidth: 0.5,
  },
}));

import { I18nManager } from 'react-native';
import { SeatLayerPickerAccessIcon } from '../src/picker/accessibilityIcon';
import { ConfirmAnswerMark, ConfirmCubeGlyph } from '../src/picker/confirmCardParts';
import { seatLayerPickerDrawnShape, seatLayerPickerJoinedLetters, seatLayerPickerScreenSides } from '../src/picker/drawnShape';
import { SeatLayerPickerBackIcon, SeatLayerPickerFocusCornersIcon } from '../src/picker/mapControlIcons';
import { SeatLayerVenue3DChromeView } from '../src/picker/SeatLayerVenue3DChrome';
import { SeatLayerPickerSparkIcon } from '../src/picker/sparkIcon';
import { resolveSeatLayerPickerTheme } from '../src/picker/theme';

const rtl = (value: boolean) => { (I18nManager as { isRTL: boolean }).isRTL = value; };
afterEach(() => rtl(false));

const style = (node: ReactTestInstance): Record<string, any> =>
  Object.assign({}, ...[node.props.style].flat(9).filter((part) => part && typeof part === 'object'));
const turns = (node: ReactTestInstance) =>
  (style(node).transform ?? []).some((step: Record<string, unknown>) => 'rotate' in step);
const keepsItsSides = (node: ReactTestInstance | null): boolean =>
  node !== null && ((typeof node.type === 'string' && style(node).direction === 'ltr') || keepsItsSides(node.parent));

function render(element: React.ReactElement): ReactTestInstance {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement('Root' as any, null, element)); });
  return renderer.root;
}
function turned(element: React.ReactElement): readonly ReactTestInstance[] {
  return render(element).findAll((node) => typeof node.type === 'string' && turns(node));
}
const color = '#111111';
const venue = (targeted: boolean) => React.createElement(SeatLayerVenue3DChromeView, {
  backLabel: 'Back', backVisible: true, bottomInset: 10, disabled: false, navigationEnabled: true,
  navigationLabel: 'Move', nextEnabled: true, nextLabel: 'Next', onBack: () => undefined, onNavigation: () => undefined,
  onNext: () => undefined, onPrevious: () => undefined, onPrimary: () => undefined, onRecentre: () => undefined,
  onZoomIn: () => undefined, onZoomOut: () => undefined, previousEnabled: true, previousLabel: 'Previous',
  primaryLabel: 'View', primaryVisible: true, recentreEnabled: true, recentreLabel: 'Recentre', targeted,
  theme: resolveSeatLayerPickerTheme({ mode: 'light' } as any), topInset: 10, zoomInLabel: 'In', zoomOutLabel: 'Out',
});

describe('drawn shapes in a right-to-left interface', () => {
  const shapes: ReadonlyArray<readonly [string, () => React.ReactElement, number]> = [
    ['the back arrow', () => React.createElement(SeatLayerPickerBackIcon, { color }), 1],
    ['the four corners of the fit button', () => React.createElement(SeatLayerPickerFocusCornersIcon, { color }), 4],
    ['the tick on the seat card', () => React.createElement(ConfirmAnswerMark, { color, mode: 'add' }), 1],
    ['the cube on the seat card', () => React.createElement(ConfirmCubeGlyph, { color, label: '3D' }), 2],
    ['the 3D bar with a seat', () => venue(true), 6],
    ['the 3D bar without one', () => venue(false), 4],
  ];
  it.each(shapes)('%s keeps its sides', (_name, shape, least) => {
    rtl(true);
    const found = turned(shape());
    expect(found.length).toBeGreaterThanOrEqual(least);
    expect(found.every(keepsItsSides)).toBe(true);
  });

  it.each([
    ['the wheelchair, upright', React.createElement(SeatLayerPickerAccessIcon, { color, variant: 'iso' })],
    ['the wheelchair, leaning forward', React.createElement(SeatLayerPickerAccessIcon, { color, variant: 'forward' } as any)],
    ['the stars of Find seats', React.createElement(SeatLayerPickerSparkIcon, { color, ground: '#FFFFFF' })],
  ])('%s is the same mark either way', (_name, shape) => {
    const first = render(shape).findAll((node) => typeof node.type === 'string' && (node.type as string) !== 'Root')[0]!;
    expect(style(first).direction).toBe('ltr');
  });

  it('only the back arrow is turned round with the reading direction', () => {
    const arrow = () => style(render(React.createElement(SeatLayerPickerBackIcon, { color }))
      .findAll((node) => (node.type as unknown) === 'View')[0]!).transform;
    expect(arrow()).toBeUndefined();
    rtl(true);
    expect(arrow()).toEqual([{ scaleX: -1 }]);
  });

  it('the 3D steps point where they go: next to the left, previous to the right', () => {
    const way = (label: string) => style(render(venue(true))
      .findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === label)[0]!
      .findAll((node) => typeof node.type === 'string' && turns(node))[0]!).transform[0].rotate;
    expect([way('Previous'), way('Next')]).toEqual(['-45deg', '135deg']);
    rtl(true);
    expect([way('Previous'), way('Next')]).toEqual(['135deg', '-45deg']);
  });

  it('every other shape, and what stands at a point of the map, keeps its sides', () => {
    const folder = fileURLToPath(new URL('../src/picker/', import.meta.url));
    for (const name of ['SeatLayerDockBar.tsx', 'SeatLayerBestSeatsForm.tsx', 'SeatLayerPickerFloorSelector.tsx',
      'SpotlightGlass.tsx', 'SeatLayerSelectionFlight.tsx']) {
      const source = readFileSync(folder + name, 'utf8');
      expect(source.match(/seatLayerPickerDrawnShape\b(?!,? ?.*from)/g)).toHaveLength(1);
    }
  });

  it('no row is turned round twice', () => {
    const folder = fileURLToPath(new URL('../src/picker/', import.meta.url));
    const reversed = readdirSync(folder).filter((name) => /\.tsx?$/.test(name)).filter((name) => readFileSync(folder + name, 'utf8').includes("'row-reverse'"));
    // The price legend turns its row only for a host that asks for the other way.
    expect(reversed).toEqual(['SeatLayerPriceLegend.tsx']);
    expect(seatLayerPickerDrawnShape).toEqual({ direction: 'ltr' });
  });
});

describe('letters that join', () => {
  it('have no spacing between them, and every other text keeps its own', () => {
    expect(seatLayerPickerJoinedLetters('عرض المقاعد')).toEqual({ letterSpacing: 0 });
    expect(seatLayerPickerJoinedLetters('Balcony بلكونة')).toEqual({ letterSpacing: 0 });
    for (const text of ['SECTION', 'הצגת מושבים', '한국어', '', undefined]) {
      expect(seatLayerPickerJoinedLetters(text)).toBeNull();
    }
  });
});

describe('the phone’s own sides', () => {
  it('stay where they are while the interface turns round', () => {
    const camera = { left: 59, right: 0 };
    expect(seatLayerPickerScreenSides(camera)).toEqual({ paddingLeft: 59, paddingRight: 0 });
    // The platform draws `paddingRight` on the left here.
    rtl(true);
    expect(seatLayerPickerScreenSides(camera)).toEqual({ paddingLeft: 0, paddingRight: 59 });
    expect(seatLayerPickerScreenSides(camera, 16)).toEqual({ paddingLeft: 16, paddingRight: 75 });
  });
});
