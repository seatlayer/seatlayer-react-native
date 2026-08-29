import { describe, expect, it } from 'vitest';

import { reduceSeatLayerPickerBack } from '../src/picker/backNavigation';
import {
  reduceSeatLayerPickerPresentationState,
  seatLayerPickerInitialPresentationState,
  type SeatLayerPickerPresentationState,
} from '../src/picker/presentationState';
import {
  createSeatLayerPickerViewportInsetCoordinator,
  type SeatLayerPickerViewportInsets,
} from '../src/picker/viewportInsets';

class FrameQueue {
  readonly callbacks = new Map<number, () => void>();
  readonly cancelled: number[] = [];
  private nextHandle = 0;

  requestAnimationFrame(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: unknown): void {
    this.cancelled.push(handle as number);
    this.callbacks.delete(handle as number);
  }

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

describe('picker presentation and back ladder', () => {
  it('represents modal context and preserves its object identity', () => {
    const prompt = { kind: 'seatDetails' as const, context: { seatId: 'A-12' } };
    const opened = reduceSeatLayerPickerPresentationState(seatLayerPickerInitialPresentationState, { type: 'openPrompt', prompt });
    expect(opened.prompt).toBe(prompt);
    expect(reduceSeatLayerPickerPresentationState(opened, { type: 'openPrompt', prompt })).toBe(opened);
  });

  it('closes local rungs immediately and defers command-backed rungs to their executor', () => {
    let state: SeatLayerPickerPresentationState = {
      prompt: { kind: 'accessibility' as const },
      sheet: 'expanded' as const,
      pendingConfirmation: { context: { holdId: 'hold_1' } },
      focusedSection: { sectionId: 'balcony' },
      isOverview: false,
    };
    const actions: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const result = reduceSeatLayerPickerBack(state);
      actions.push(result.action.type);
      state = result.state;
    }
    expect(actions).toEqual([
      'dismissPrompt',
      'collapseSheet',
    ]);
    expect(reduceSeatLayerPickerBack(state).action.type).toBe('dismissPendingConfirmation');
    expect(reduceSeatLayerPickerBack(state).state).toBe(state);
    const focused = reduceSeatLayerPickerBack({
      ...seatLayerPickerInitialPresentationState,
      focusedSection: { sectionId: 'balcony' },
      isOverview: false,
    });
    expect(focused.action.type).toBe('showOverview');
    expect(focused.state).toMatchObject({ focusedSection: { sectionId: 'balcony' }, isOverview: false });
    expect(reduceSeatLayerPickerBack({ ...seatLayerPickerInitialPresentationState, isOverview: false }).action.type).toBe('showOverview');
    expect(reduceSeatLayerPickerBack(seatLayerPickerInitialPresentationState).action.type).toBe('delegateToHost');
  });
});

describe('picker viewport insets', () => {
  it('coalesces to one frame and aggregates the maximum per side', () => {
    const frames = new FrameQueue();
    const delivered: SeatLayerPickerViewportInsets[] = [];
    const coordinator = createSeatLayerPickerViewportInsetCoordinator(frames, (insets) => delivered.push(insets));
    coordinator.setBand('header', { top: 56, left: 12 });
    coordinator.setBand('dock', { bottom: 52, left: 8 });
    coordinator.setBand('sheet', { bottom: 100, right: 6 });
    expect(frames.callbacks.size).toBe(1);
    frames.flush();
    expect(delivered).toEqual([{ top: 56, right: 6, bottom: 100, left: 12 }]);
  });

  it('clamps invalid sides, dedupes resolved values, removes bands, and disposes cleanly', () => {
    const frames = new FrameQueue();
    const delivered: SeatLayerPickerViewportInsets[] = [];
    const coordinator = createSeatLayerPickerViewportInsetCoordinator(frames, (insets) => delivered.push(insets));
    coordinator.setBand('confirmation', { top: Number.POSITIVE_INFINITY, right: -4, bottom: Number.NaN, left: 5 });
    frames.flush();
    expect(delivered).toEqual([{ top: 0, right: 0, bottom: 0, left: 5 }]);
    coordinator.setBand('header', { left: 3 });
    frames.flush();
    expect(delivered).toHaveLength(1);
    coordinator.removeBand('confirmation');
    frames.flush();
    expect(delivered[delivered.length - 1]).toEqual({ top: 0, right: 0, bottom: 0, left: 3 });
    coordinator.setBand('immersive', { top: 20 });
    expect(frames.callbacks.size).toBe(1);
    coordinator.dispose();
    expect(frames.cancelled).toHaveLength(1);
    frames.flush();
    coordinator.setBand('header', { top: 99 });
    expect(delivered[delivered.length - 1]).toEqual({ top: 0, right: 0, bottom: 0, left: 3 });
  });
});
