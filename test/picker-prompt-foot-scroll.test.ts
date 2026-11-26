import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', View: 'View' }));

import { SeatLayerPickerPromptFootScroll, seatLayerPickerFootScrollOffset } from '../src/picker/promptFootScroll';

function mount() {
  const scrollTo = vi.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SeatLayerPickerPromptFootScroll, null, React.createElement('View')), {
      createNodeMock: () => ({ scrollTo }),
    });
  });
  const scroll = renderer.root.findByProps({ testID: 'seatlayer-prompt-scroll' });
  return {
    scrollTo,
    layout: (height: number) => act(() => scroll.props.onLayout({ nativeEvent: { layout: { height } } })),
    content: (height: number) => act(() => scroll.props.onContentSizeChange(390, height)),
    scrolled: (y: number, content: number, viewport: number) => act(() => scroll.props.onScroll({
      nativeEvent: { contentOffset: { y }, contentSize: { height: content }, layoutMeasurement: { height: viewport } },
    })),
  };
}

describe('a prompt too tall for its screen', () => {
  it('opens at its foot, where the number and the buttons are', () => {
    const view = mount();
    view.layout(300);
    view.content(500);
    expect(view.scrollTo).toHaveBeenLastCalledWith({ animated: false, y: 200 });
  });

  it('keeps the part the buyer scrolled to when its content grows', () => {
    const view = mount();
    view.layout(300);
    view.content(500);
    view.scrolled(100, 500, 300);
    view.content(540);
    expect(view.scrollTo).toHaveBeenLastCalledWith({ animated: false, y: 140 });
  });

  it('does not scroll where it fits', () => {
    const view = mount();
    view.layout(300);
    view.content(280);
    expect(view.scrollTo).not.toHaveBeenCalled();
  });

  it('stands at its end, never past either end', () => {
    expect(seatLayerPickerFootScrollOffset(500, 300, 0)).toBe(200);
    expect(seatLayerPickerFootScrollOffset(500, 300, 999)).toBe(0);
    expect(seatLayerPickerFootScrollOffset(200, 300, 0)).toBe(0);
    expect(seatLayerPickerFootScrollOffset(Number.NaN, 300, 0)).toBe(0);
  });
});
