import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

let scope: Record<string, any>;
vi.mock('../src/picker/SeatLayerPickerScope', () => ({
  useSeatLayerPickerScope: () => scope,
  SeatLayerPickerScopeReprovider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('ScopeReprovider', undefined, children),
}));

import { SeatLayerPickerAccessibilityFilters } from '../src/picker/accessibility';
import { SeatLayerPickerAccessibleStepper } from '../src/picker/SeatLayerPickerAccessibleStepper';
import {
  SeatLayerPickerAccessibleTourStore,
  seatLayerPickerAccessibleSectionCount,
  seatLayerPickerSectionAccessibleFree,
  shouldDrawSeatLayerPickerAccessibleStepper,
} from '../src/picker/accessibilityFocus';
import { seatLayerPickerTokens } from '../src/picker/tokens.g';

const english = seatLayerPickerTokens.strings;

function setup(options: {
  needs?: readonly { key: string; count?: number }[];
  active?: readonly string[];
  tour?: boolean;
  counts?: boolean;
  sections?: readonly any[];
} = {}) {
  const calls: unknown[] = [];
  const steps: unknown[] = [];
  let step: any = { id: 's1', label: '205', free: 4, index: 0, total: 6 };
  const snapshot: any = {
    sessionId: 'runtime',
    capabilities: ['accessibilityFilter', ...(options.counts === false ? [] : ['section-access-counts-v1'])],
    sections: options.sections ?? [{ id: 's1', label: '205', accessibleFree: { wheelchair: 4 } }],
    map: {
      rung: 'seats',
      accessibilityFilter: [...(options.active ?? [])],
      hideLimitedView: false,
      colorblindSafe: false,
      accessNeeds: options.needs ?? [{ key: 'wheelchair', count: 12 }, { key: 'companion', count: 0 }],
    },
  };
  const controller = {
    getSnapshot: () => snapshot,
    supportsAccessibleSectionTour: options.tour !== false,
    setAccessibilityFilter: async (keys: readonly string[]) => { calls.push(['filter', ...keys]); },
    setLimitedViewFilter: async (on: boolean) => { calls.push(['limited', on]); },
    setColorblindSafe: async (on: boolean) => { calls.push(['colorblind', on]); },
    focusNextAccessibleSection: async (types: readonly string[] | null) => {
      steps.push(types);
      return step;
    },
    mapController: {
      isReady: true,
      supportsPickerCapability: (key: string) =>
        key === 'native-chrome-contract-v1' || key === 'access-needs-v1',
      supportsPickerCommand: (key: string) => key === 'picker.setAccessibilityFilter',
    },
  };
  const cancelled: number[] = [];
  scope = {
    controller, snapshot, sessionId: 1, isBusy: false, readOnly: false, styles: {},
    presentation: { prompt: null },
    resolvedTheme: {
      colors: {
        text: '#111', background: '#eee', surface: '#fff', divider: '#ccc',
        accent: '#06f', onAccent: '#fff', mutedText: '#555',
      },
      fontFamily: 'Brand',
    },
    strings: {
      translate: (key: string, o?: { count?: number; values?: Record<string, unknown> }) => {
        const table: Record<string, string> = {
          accessibility: english.accessibility,
          accessibilityTitle: english.accessibilityTitle,
          displayOptions: english.displayOptions,
          close: english.close,
          hideLimitedView: english.hideLimitedView,
          colorblindSafe: english.colorblindSafe,
          companionSeatsNote: english.companionSeatsNote,
          accessNoneLeft: english.accessNoneLeft,
          accessJumpFirstSection: english.accessJumpFirstSection,
          accessJumpNextSection: english.accessJumpNextSection,
        };
        if (key === 'accessFreeCount') return `${o?.count} free`;
        if (key === 'accessibleStep') return `${o?.values?.index} of ${o?.values?.total}`;
        if (key === 'accessibleSections') return `${o?.values?.count} sections`;
        return table[key] ?? key;
      },
      accessNeed: (key: string) => key,
    },
    reportError: () => {},
    cancelPending: async () => { cancelled.push(1); return true; },
    back: async () => { scope = { ...scope, presentation: { prompt: null } }; },
    claimPrompt: (_owner: string, kind: string, context: unknown) => ({
      lease: { context },
      open: () => { scope = { ...scope, presentation: { prompt: { kind, context } } }; return true; },
      dismiss: () => { scope = { ...scope, presentation: { prompt: null } }; return true; },
    }),
  };
  return { calls, steps, cancelled, setStep: (next: unknown) => { step = next; } };
}

async function openSheet(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(SeatLayerPickerAccessibilityFilters, { compact: true }));
  });
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: english.accessibility })
      .props.onPress();
    await Promise.resolve();
    renderer.update(React.createElement(SeatLayerPickerAccessibilityFilters, { compact: true }));
  });
  return renderer;
}

describe('accessibility sheet applies live (§3.5, Flutter 0.7.3)', () => {
  it('has no Apply step and keeps the sheet open after a flip', async () => {
    const runtime = setup();
    const renderer = await openSheet();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Apply filters' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: english.cancel })).toHaveLength(0);
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'wheelchair' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runtime.calls).toEqual([['filter', 'wheelchair']]);
    expect(scope.presentation.prompt).toMatchObject({ kind: 'accessibility' });
  });

  it('cancels an unanswered seat card before the sheet goes up', async () => {
    const runtime = setup();
    await openSheet();
    expect(runtime.cancelled).toEqual([1]);
  });

  it('closes on the scrim with the camera unchanged', async () => {
    const runtime = setup();
    const renderer = await openSheet();
    await act(async () => {
      renderer.root
        .findAll((node) => node.props.style?.position === 'absolute' && node.props.onPress !== undefined)[0]!
        .props.onPress();
      await Promise.resolve();
    });
    expect(scope.presentation.prompt).toBeNull();
    expect(runtime.calls).toEqual([]);
    expect(runtime.steps).toEqual([]);
  });

  it('shows a sold-out provision dark and an uncounted one plain', async () => {
    setup({ needs: [{ key: 'wheelchair', count: 0 }, { key: 'hearing' }] });
    const renderer = await openSheet();
    expect(renderer.root.findByProps({ accessibilityLabel: 'wheelchair' }).props.accessibilityState)
      .toMatchObject({ checked: false, disabled: true });
    // Absent is not zero: an uncounted provision shows no number and stays live.
    expect(renderer.root.findByProps({ accessibilityLabel: 'hearing' }).props.accessibilityState)
      .toMatchObject({ checked: false, disabled: false });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'None left' })).toHaveLength(0);
  });

  it('turns the count into a jump that applies, closes and takes the first step', async () => {
    const runtime = setup();
    const renderer = await openSheet();
    const jump = renderer.root.findByProps({
      accessibilityLabel: `wheelchair, 12 free, ${english.accessJumpFirstSection}`,
    });
    await act(async () => {
      jump.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(scope.presentation.prompt).toBeNull();
    expect(runtime.calls).toEqual([['filter', 'wheelchair']]);
    expect(runtime.steps).toEqual([['wheelchair']]);
  });

  it('withholds the jump where the runtime does not advertise the flight', async () => {
    setup({ tour: false });
    const renderer = await openSheet();
    expect(renderer.root.findAllByProps({
      accessibilityLabel: `wheelchair, 12 free, ${english.accessJumpFirstSection}`,
    })).toHaveLength(0);
  });
});

describe('accessible-section stepper (§3.4.1)', () => {
  it('prints the section count before the first step and the step after it', async () => {
    const runtime = setup({ active: ['wheelchair'] });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerAccessibleStepper, {}));
    });
    expect(renderer.root.findAllByProps({ children: '1 sections' })).not.toHaveLength(0);
    await act(async () => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runtime.steps).toEqual([['wheelchair']]);
    expect(renderer.root.findAllByProps({ children: '1 of 6' })).not.toHaveLength(0);
  });

  it('goes when the runtime answers null, and is withheld with no filter on', async () => {
    const runtime = setup({ active: ['wheelchair'] });
    runtime.setStep(null);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerAccessibleStepper, {}));
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);

    setup({ active: [] });
    let quiet!: ReactTestRenderer;
    await act(async () => {
      quiet = create(React.createElement(SeatLayerPickerAccessibleStepper, {}));
    });
    expect(quiet.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });
});

describe('accessible-section counting', () => {
  const sections = [
    { id: 'a', label: 'A', accessibleFree: { wheelchair: 2 } },
    { id: 'b', label: 'B', accessibleFree: { wheelchair: 0, companion: 3 } },
    { id: 'c', label: 'C' },
  ] as any[];

  it('counts only sections with a positive entry for an active provision', () => {
    expect(seatLayerPickerAccessibleSectionCount(sections, ['wheelchair'], true)).toBe(1);
    expect(seatLayerPickerAccessibleSectionCount(sections, ['wheelchair', 'companion'], true)).toBe(2);
  });

  it('reports NOT COUNTED rather than zero without the capability', () => {
    expect(seatLayerPickerAccessibleSectionCount(sections, ['wheelchair'], false)).toBeUndefined();
    expect(seatLayerPickerSectionAccessibleFree(sections[2], ['wheelchair'], true)).toBeUndefined();
    expect(seatLayerPickerSectionAccessibleFree(sections[1], ['wheelchair', 'companion'], true)).toBe(3);
  });

  it('never draws the stepper where counts are reported and none is positive', () => {
    const tour = new SeatLayerPickerAccessibleTourStore().getSnapshot();
    expect(shouldDrawSeatLayerPickerAccessibleStepper({
      supportsTour: true, activeTypes: ['wheelchair'], sectionCount: 0, tour,
    })).toBe(false);
    expect(shouldDrawSeatLayerPickerAccessibleStepper({
      supportsTour: true, activeTypes: ['wheelchair'], sectionCount: undefined, tour,
    })).toBe(true);
  });

  it('abandons the walk when the buyer changes the filter', () => {
    const store = new SeatLayerPickerAccessibleTourStore();
    store.accept(['wheelchair'], { id: 'a', label: 'A', free: 2, index: 1, total: 4 });
    expect(store.getSnapshot().step?.index).toBe(1);
    store.observe(['wheelchair', 'companion']);
    expect(store.getSnapshot().step).toBeUndefined();
    expect(store.getSnapshot().retired).toBe(false);
  });
});
