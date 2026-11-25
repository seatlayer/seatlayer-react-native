import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({}));

import { SeatLayerPickerAttribution } from '../src/picker/attribution';

describe('SeatLayerPickerAttribution', () => {
  it('draws nothing, whatever it is given', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SeatLayerPickerAttribution, {
        compact: false, visible: true, slots: { attributionText: { color: '#000' } },
      }));
    });
    expect(renderer.toJSON()).toBeNull();
  });
});
