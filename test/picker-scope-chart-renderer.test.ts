import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const rendererLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  View: 'View',
  useColorScheme: () => 'light',
}));

vi.mock('../src/SeatLayerRenderer', () => ({
  SeatLayerRenderer(props: { readonly onUnmount?: () => void }): React.ReactElement {
    useEffect(() => {
      rendererLifecycle.mounts += 1;
      return () => { rendererLifecycle.unmounts += 1; props.onUnmount?.(); };
    }, []);
    return React.createElement('seatlayer-renderer');
  },
}));

import { SeatLayerPickerController } from '../src/picker/controller';
import { SeatLayerPickerScope } from '../src/picker/SeatLayerPickerScope';
import { SeatLayerPickerChart } from '../src/picker/SeatLayerPickerChart';
import type { JsonObject } from '../src/json';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function chartTree(
  controller: SeatLayerPickerController,
  bridgeConfig: JsonObject,
  themeMode: 'light' | 'dark' = 'light',
): React.ReactElement {
  return React.createElement(
    SeatLayerPickerScope,
    { configuration: { event: 'chart-event' }, controller, bridgeConfig, themeMode },
    React.createElement(SeatLayerPickerChart),
  );
}

describe('picker chart scope lifecycle', () => {
  it('does not reload for equivalent inline boot inputs and remounts once for a real boot change', async () => {
    rendererLifecycle.mounts = 0;
    rendererLifecycle.unmounts = 0;
    const controller = new SeatLayerPickerController();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(chartTree(controller, { mode: 'same' })); });
    expect(rendererLifecycle.mounts).toBe(1);
    await act(async () => { tree.update(chartTree(controller, { mode: 'same' })); });
    expect(rendererLifecycle.mounts).toBe(1);
    expect(rendererLifecycle.unmounts).toBe(0);
    await act(async () => { tree.update(chartTree(controller, { mode: 'same' }, 'dark')); });
    expect(rendererLifecycle.mounts).toBe(1);
    expect(rendererLifecycle.unmounts).toBe(0);
    await act(async () => { tree.update(chartTree(controller, { mode: 'changed' })); });
    expect(rendererLifecycle.mounts).toBe(2);
    expect(rendererLifecycle.unmounts).toBe(1);
    act(() => tree.unmount());
  });
});
