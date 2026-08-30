import React, { useMemo, useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Modal: 'Modal' }));

import { SeatLayerPickerInsetOwnership } from '../src/picker/insetOwnership';
import { SeatLayerPickerPromptOwnership } from '../src/picker/promptOwnership';
import { SeatLayerPickerScopeInsetBands } from '../src/picker/scopeInsetBands';
import { SeatLayerPickerBackCoordinator } from '../src/picker/backNavigation';
import { reduceSeatLayerPickerPresentationState, seatLayerPickerInitialPresentationState } from '../src/picker/presentationState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function PromptHarness(): React.ReactElement {
  const ownership = useMemo(() => new SeatLayerPickerPromptOwnership(), []);
  const [visible, setVisible] = useState(false);
  const first = useMemo(
    () => ownership.claim('access', 'accessibility', { source: 'test' })!, [ownership],
  );
  const second = useMemo(() => ownership.claim('cart', 'cart'), [ownership]);
  return React.createElement('prompt-harness', {
    visible,
    secondAccepted: second !== undefined,
    open: () => { if (ownership.isActive(first)) setVisible(true); },
    dismiss: () => { if (ownership.dismiss(first)) setVisible(false); },
  });
}

describe('picker scope ownership', () => {
  it('renders one prompt owner and stale owners cannot dismiss it', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(PromptHarness)); });
    const host = tree.root.findByType('prompt-harness' as any);
    expect(host.props.secondAccepted).toBe(false);
    act(() => host.props.open());
    expect(tree.root.findByType('prompt-harness' as any).props.visible).toBe(true);
    act(() => host.props.dismiss());
    expect(tree.root.findByType('prompt-harness' as any).props.visible).toBe(false);
  });

  it('retires prompt ownership on a session replacement', () => {
    const ownership = new SeatLayerPickerPromptOwnership();
    const old = ownership.claim('access', 'accessibility')!;
    ownership.reset();
    expect(ownership.isActive(old)).toBe(false);
    expect(ownership.claim('cart', 'cart')).toMatchObject({ owner: 'cart' });
  });

  it('guards competing inset owners and clears all retired bands', () => {
    const calls: string[] = [];
    const ownership = new SeatLayerPickerInsetOwnership(
      (band, value) => calls.push(`set:${band}:${value.top}`),
      (band) => calls.push(`remove:${band}`),
    );
    const oldLease = ownership.claim('header');
    const freshLease = ownership.claim('header');
    oldLease.set({ top: 56 });
    oldLease.remove();
    freshLease.set({ top: 72 });
    ownership.reset();
    expect(calls).toEqual(['set:header:72', 'remove:header']);
  });

  it('does not replay retired inset bands into a replacement session', () => {
    const bands = new SeatLayerPickerScopeInsetBands();
    bands.set('header', { top: 56 });
    bands.clear();
    const replayed: string[] = [];
    bands.replay({ setBand: (band) => replayed.push(band) });
    expect(replayed).toEqual([]);
    bands.set('header', { top: 72 });
    bands.replay({ setBand: (band) => replayed.push(band) });
    expect(replayed).toEqual(['header']);
  });

  it('snapshots own inset data and ignores invalid/proxied bands', () => {
    const bands = new SeatLayerPickerScopeInsetBands();
    const source = { top: 56 };
    bands.set('header', source);
    source.top = 999;
    bands.set(42 as never, { top: 88 });
    const trapped = new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error('inset trap'); },
    });
    bands.set('dock', trapped as never);
    const replayed: Array<[string, number | undefined]> = [];
    bands.replay({ setBand: (band, insets) => replayed.push([band, insets.top]) });
    expect(replayed).toEqual([['header', 56], ['dock', 0]]);
  });

  it('consumes exactly one back rung in documented priority order', () => {
    const coordinator = new SeatLayerPickerBackCoordinator();
    const prompt = { ...seatLayerPickerInitialPresentationState, prompt: { kind: 'accessibility' as const } };
    expect(coordinator.begin(prompt, false).action).toEqual({ type: 'dismissPrompt' });
    const sheet = { ...seatLayerPickerInitialPresentationState, sheet: 'expanded' as const };
    expect(coordinator.begin(sheet, false).action).toEqual({ type: 'collapseSheet' });
    const focused = { ...seatLayerPickerInitialPresentationState, isOverview: false, focusedSection: { sectionId: 'a' } };
    const show = coordinator.begin(focused, false);
    expect(show.action).toEqual({ type: 'stepOut' });
    coordinator.complete(show.action);
    const pending = coordinator.begin({ ...seatLayerPickerInitialPresentationState, pendingConfirmation: {} }, false);
    expect(pending.action)
      .toEqual({ type: 'dismissPendingConfirmation' });
    expect(coordinator.begin(seatLayerPickerInitialPresentationState, false).action)
      .toEqual({ type: 'dismissPendingConfirmation' });
    coordinator.complete(pending.action);
    expect(coordinator.begin(seatLayerPickerInitialPresentationState, false).action)
      .toEqual({ type: 'delegateToHost' });
  });

  it('keeps an immediate prompt/sheet above an in-flight lower back rung', () => {
    const coordinator = new SeatLayerPickerBackCoordinator();
    const focused = {
      ...seatLayerPickerInitialPresentationState,
      isOverview: false,
      focusedSection: { sectionId: 'A' },
    };
    const inFlight = coordinator.begin(focused);
    expect(inFlight.action).toEqual({ type: 'stepOut' });
    const prompt = coordinator.begin({ ...focused, prompt: { kind: 'accessibility' } });
    expect(prompt).toMatchObject({ action: { type: 'dismissPrompt' }, started: true });
    const sheet = coordinator.begin({ ...focused, sheet: 'expanded' });
    expect(sheet).toMatchObject({ action: { type: 'collapseSheet' }, started: true });
    expect(coordinator.begin(seatLayerPickerInitialPresentationState)).toMatchObject({
      action: { type: 'stepOut' }, started: false,
    });
  });

  it('keeps equivalent snapshot focus stable and synchronizes the renderer rung', () => {
    const first = reduceSeatLayerPickerPresentationState(
      seatLayerPickerInitialPresentationState,
      { type: 'syncSnapshot', rung: 'seats', focusedSectionId: 'A' },
    );
    const equivalent = reduceSeatLayerPickerPresentationState(
      first, { type: 'syncSnapshot', rung: 'seats', focusedSectionId: 'A' },
    );
    expect(equivalent).toBe(first);
    const overview = reduceSeatLayerPickerPresentationState(
      first, { type: 'syncSnapshot', rung: 'overview', focusedSectionId: null },
    );
    expect(overview).toMatchObject({ mapRung: 'overview', focusedSection: null, isOverview: true });
  });

});
