import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let reduced = false;
type Timing = { readonly config: Record<string, unknown>; readonly stop: ReturnType<typeof vi.fn>; start: (callback?: (result: { finished: boolean }) => void) => void; callback?: (result: { finished: boolean }) => void };
const timings: Timing[] = [];
vi.mock('react-native', () => ({
  Animated: {
    Value: class {
      value: number;
      constructor(value: number) { this.value = value; }
      setValue(value: number) { this.value = value; }
      interpolate(config: Record<string, unknown>) { return config; }
    },
    View: 'AnimatedView',
    timing: (_value: unknown, config: Record<string, unknown>) => {
      const timing: Timing = { config, stop: vi.fn(), start: (callback) => { timing.callback = callback; } };
      timings.push(timing); return timing;
    },
  },
  Easing: { bezier: (...curve: number[]) => curve },
  StyleSheet: { create: <T,>(value: T) => value },
  View: 'View', Text: 'Text',
}));
vi.mock('../src/picker/reducedMotion', () => ({ useSeatLayerPickerReducedMotion: () => reduced }));

import { SeatLayerPickerPromptTransition } from '../src/picker/SeatLayerPickerPromptTransition';

function prompt(label: string): React.ReactElement { return React.createElement('Text', undefined, label); }
function transition(promptNode: React.ReactNode | null, promptKey: string | null, sessionId = 'one'): React.ReactElement {
  return React.createElement(SeatLayerPickerPromptTransition, { prompt: promptNode, promptKey, scrimColor: '#0008', sessionId });
}

function rootStyle(renderer: ReactTestRenderer): readonly Record<string, unknown>[] {
  return renderer.root.findByType('View' as any).props.style;
}

describe('picker prompt transition', () => {
  it('uses generated enter/exit motion and retains an outgoing prompt until exit completes', async () => {
    timings.length = 0; reduced = false; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'a')); });
    expect(timings[0]!.config.duration).toBe(260);
    expect(renderer.root.findByType('View' as any).props.pointerEvents).toBe('auto');
    await act(async () => { renderer.update(transition(null, null)); });
    expect(timings[1]!.config.duration).toBe(180);
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['A']);
    expect(renderer.root.findByType('View' as any).props.pointerEvents).toBe('none');
    await act(async () => { timings[1]!.callback?.({ finished: true }); });
    expect(renderer.root.findAllByType('Text' as any)).toHaveLength(0);
    expect(renderer.root.findByType('View' as any).props.pointerEvents).toBe('none');
    expect(rootStyle(renderer)[1]!.backgroundColor).toBe('transparent');
  });

  it('resolves reduced motion immediately', async () => {
    timings.length = 0; reduced = true; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'a')); });
    expect(timings).toHaveLength(0);
    expect(renderer.root.findByType('View' as any).props.pointerEvents).toBe('auto');
  });

  it('retires old prompt animation/content on replacement and unmount', async () => {
    timings.length = 0; reduced = false; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'a')); });
    reduced = false;
    await act(async () => { renderer.update(transition(prompt('B'), 'b', 'two')); });
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['B']);
    expect(timings[0]!.stop).toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
    expect(timings[timings.length - 1]!.stop).toHaveBeenCalled();
  });

  it('updates a rebuilt prompt with the same stable key without another transition', async () => {
    timings.length = 0; reduced = false; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'stable')); });
    const active = timings[0]!;
    await act(async () => { renderer.update(transition(prompt('Updated'), 'stable')); });
    expect(timings).toHaveLength(1);
    expect(active.stop).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['Updated']);
  });

  it('uses a measured 3.5% pixel projection', async () => {
    timings.length = 0; reduced = false; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'a')); });
    await act(async () => {
      renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { height: 200 } } });
    });
    const current = renderer.root.findAllByType('AnimatedView' as any)[0]!;
    const transform = current.props.style[1].transform[0].translateY as Record<string, unknown>;
    expect(transform.outputRange).toEqual([7.000000000000001, 0]);
    expect(current.props.style[0]).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    });
  });

  it('stops and settles an active transition when reduced motion changes', async () => {
    timings.length = 0; reduced = false; let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(transition(prompt('A'), 'a')); });
    const active = timings[0]!;
    reduced = true;
    await act(async () => { renderer.update(transition(prompt('A'), 'a')); });
    expect(active.stop).toHaveBeenCalledTimes(1);
    expect(timings).toHaveLength(1);
    expect(renderer.root.findAllByType('Text' as any).map((node) => node.children.join(''))).toEqual(['A']);
  });
});
