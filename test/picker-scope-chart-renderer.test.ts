import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const rendererLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
const app = vi.hoisted(() => ({ state: 'active', listeners: new Set<(state: string) => void>() }));

vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return app.state; },
    addEventListener: (_name: string, listener: (state: string) => void) => {
      app.listeners.add(listener);
      return { remove: () => app.listeners.delete(listener) };
    },
  },
  View: 'View',
  useColorScheme: () => 'light',
}));

vi.mock('../src/SeatLayerRenderer', () => ({
  SeatLayerRenderer(props: {
    readonly controller?: unknown; readonly onUnmount?: () => void; readonly onPageLost: () => void;
  }): React.ReactElement {
    useEffect(() => {
      rendererLifecycle.mounts += 1;
      return () => { rendererLifecycle.unmounts += 1; props.onUnmount?.(); };
    }, []);
    return React.createElement('seatlayer-renderer', { bridge: props.controller, onPageLost: props.onPageLost });
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

  it('asks the new page of a real boot change to take up the hold, and only then', async () => {
    const controller = new SeatLayerPickerController();
    const keep = vi.spyOn(controller, 'keepHoldForNextPage');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(chartTree(controller, { locale: 'en' })); });
    await act(async () => { tree.update(chartTree(controller, { locale: 'en' }, 'dark')); });
    expect(keep).not.toHaveBeenCalled();
    await act(async () => { tree.update(chartTree(controller, { locale: 'ar' })); });
    expect(keep).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  async function lose(tree: TestRenderer.ReactTestRenderer): Promise<void> {
    await act(async () => {
      tree.root.findByType('seatlayer-renderer' as never).props.onPageLost();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  it('replaces a page the system ended, and waits for the app to be in front', async () => {
    rendererLifecycle.mounts = 0;
    app.state = 'active';
    const controller = new SeatLayerPickerController();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(chartTree(controller, {})); });
    await lose(tree);
    expect(rendererLifecycle.mounts).toBe(2);

    app.state = 'background';
    await lose(tree);
    expect(rendererLifecycle.mounts).toBe(2);
    await act(async () => {
      app.state = 'active';
      for (const listener of [...app.listeners]) listener('active');
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(rendererLifecycle.mounts).toBe(3);

    // A third loss inside a minute is left to the buyer's Try again.
    await lose(tree);
    expect(tree.root.findAllByType('seatlayer-renderer' as never)).toHaveLength(0);
    await act(async () => { await controller.retry(); });
    expect(tree.root.findAllByType('seatlayer-renderer' as never)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('boots with the prices of the app, and does not reload for new ones', async () => {
    rendererLifecycle.mounts = 0;
    const controller = new SeatLayerPickerController();
    const priced = (amount: number) => React.createElement(
      SeatLayerPickerScope,
      { configuration: { event: 'chart-event' }, controller, pricing: { categories: { stalls: amount } } },
      React.createElement(SeatLayerPickerChart),
    );
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(priced(45)); });
    const start = vi.spyOn(controller, 'beginHandshake').mockResolvedValue({} as never);
    tree.root.findByType('seatlayer-renderer' as never).props.bridge.beginHandshake({ send: () => undefined }, { event: 'chart-event' });
    expect(start.mock.calls[0]?.[2]).toMatchObject({ config: { pricing: { prices: { stalls: 45 } } } });
    await act(async () => { tree.update(priced(50)); });
    expect(rendererLifecycle.mounts).toBe(1);
    act(() => tree.unmount());
  });

  it('does not reload after the picker is gone', async () => {
    rendererLifecycle.mounts = 0;
    app.state = 'background';
    const controller = new SeatLayerPickerController();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(chartTree(controller, {})); });
    await lose(tree);
    await act(async () => { tree.unmount(); });
    expect(app.listeners.size).toBe(0);
    app.state = 'active';
  });
});
