import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: <T>(value: T) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));

let scope: Record<string, unknown>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({ useSeatLayerPickerScope: () => scope }));
// One frozen snapshot identity: `useSyncExternalStore` compares by reference.
const snapshot = Object.freeze({
  titleKey: 'holdInCheckoutTitle',
  bodyKey: 'holdInCheckoutBody',
  actionKey: 'releaseAndChangeSeats',
});
const store = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
  clear: () => {},
};
vi.mock('../src/picker/holdOwnership', () => ({
  seatLayerPickerHoldOwnershipStore: () => store,
}));

import { SeatLayerHoldOwnershipNotice } from '../src/picker/SeatLayerHoldOwnershipNotice';

describe('§3.13.13 hold-ownership notice', () => {
  it('states the state on the error ground, in ink the ground can carry', () => {
    scope = {
      controller: { releaseHandoffAndChangeSeats: () => Promise.resolve(true) },
      reportError: () => {},
      resolvedTheme: {
        colors: { accent: '#e54558', error: '#B42318', onAccent: '#fff', surface: '#F6F7FB', text: '#172033', mutedText: '#667085', divider: '#ccc' },
        fontFamily: undefined,
      },
      strings: { translate: (key: string) => key },
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerHoldOwnershipNotice, {}));
    });
    const root = renderer.root.findAllByType('View' as never)[0]!;
    const ground = (root.props.style as Record<string, unknown>[])
      .find((part) => part && 'backgroundColor' in part);
    expect(ground?.backgroundColor).toBe('#B42318');

    const texts = renderer.root.findAllByType('Text' as never);
    // Title, body, and the one action — the runtime's own sentence is never shown.
    expect(texts.map((node) => node.props.children))
      .toEqual(['holdInCheckoutTitle', 'holdInCheckoutBody', 'releaseAndChangeSeats']);
    for (const node of texts) {
      const parts = (Array.isArray(node.props.style) ? node.props.style : [node.props.style])
        .filter(Boolean) as Record<string, unknown>[];
      expect(parts.some((part) => part.color === '#FFFFFF')).toBe(true);
    }

    // The action is outlined on the ground, not a filled accent button.
    const action = renderer.root.findByProps({ accessibilityLabel: 'releaseAndChangeSeats' });
    const actionStyle = Object.assign({}, ...(action.props.style as Record<string, unknown>[]));
    expect(actionStyle.borderColor).toBe('#FFFFFF');
    expect(actionStyle.backgroundColor).toBeUndefined();

    // Dismiss is a drawn cross with a full touch target, not the word "Close".
    const dismiss = renderer.root.findByProps({ accessibilityLabel: 'close' });
    expect(dismiss.findAllByType('Text' as never)).toHaveLength(0);
    expect((dismiss.props.style as Record<string, unknown>).width).toBe(44);
  });
});
