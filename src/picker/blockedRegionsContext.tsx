import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import {
  SeatLayerPickerBlockedRegionRegistry,
  type SeatLayerPickerBlockedRegionLease,
  type SeatLayerPickerBlockedRegionSink,
  type SeatLayerPickerMeasuredRect,
} from './blockedRegions';
import type { SeatLayerPickerAnimationFrameScheduler } from './viewportInsets';

/**
 * §2.4. Any lane's chrome registers its rectangle through `useBlockedRegion`
 * without touching this lane's files: wrap the measured control in
 * `SeatLayerPickerBlockedRegion`, or attach the hook's `onLayout`/`ref` pair to
 * a view of its own.
 */

/** Measurable host view. RN's `measureInWindow` is the only accurate source. */
export interface SeatLayerPickerMeasurableView {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}

const SeatLayerPickerBlockedRegionContext =
  createContext<SeatLayerPickerBlockedRegionRegistry | undefined>(undefined);

export interface SeatLayerPickerBlockedRegionProviderProps extends PropsWithChildren {
  readonly scheduler: SeatLayerPickerAnimationFrameScheduler;
  readonly sink: SeatLayerPickerBlockedRegionSink;
  /** `false` while the runtime's hello command table lacks the command. */
  readonly supported: () => boolean;
  readonly reportError?: (error: unknown) => void;
  /** Remounts the registry — and so clears the runtime's list — per session. */
  readonly sessionId?: number;
  readonly registry?: SeatLayerPickerBlockedRegionRegistry;
}

export function SeatLayerPickerBlockedRegionProvider(
  props: SeatLayerPickerBlockedRegionProviderProps,
): React.ReactElement {
  const { children, registry: supplied, sessionId, ...options } = props;
  const owned = useMemo(
    () => supplied ?? new SeatLayerPickerBlockedRegionRegistry(options),
    // A new session is a new runtime; its list starts empty by construction.
    [supplied, sessionId],
  );
  useEffect(() => () => { if (supplied === undefined) owned.dispose(); }, [owned, supplied]);
  return (
    <SeatLayerPickerBlockedRegionContext.Provider value={owned}>
      {children}
    </SeatLayerPickerBlockedRegionContext.Provider>
  );
}

/** `undefined` where no provider is mounted: reporting is then simply not offered. */
export function useSeatLayerPickerBlockedRegionRegistry():
SeatLayerPickerBlockedRegionRegistry | undefined {
  return useContext(SeatLayerPickerBlockedRegionContext);
}

function measure(
  view: SeatLayerPickerMeasurableView | null | undefined,
  deliver: (rect: SeatLayerPickerMeasuredRect | undefined) => void,
): void {
  if (view === null || view === undefined || typeof view.measureInWindow !== 'function') {
    deliver(undefined);
    return;
  }
  try {
    view.measureInWindow((x, y, width, height) => deliver({ x, y, width, height }));
  } catch {
    // A view detached between the layout event and the measurement reports nothing.
    deliver(undefined);
  }
}

export interface SeatLayerPickerBlockedRegionBinding {
  readonly ref: RefObject<SeatLayerPickerMeasurableView | null>;
  readonly onLayout: (event?: LayoutChangeEvent) => void;
  /** Re-measures outside a layout event — a scroll, an animation, a frame tick. */
  readonly remeasure: () => void;
}

/**
 * Measured every drawn frame the control lays out on, and again whenever the
 * caller asks. The rectangle lingers 600 ms after the control leaves.
 */
export function useSeatLayerPickerBlockedRegion(
  enabled = true,
): SeatLayerPickerBlockedRegionBinding {
  const registry = useSeatLayerPickerBlockedRegionRegistry();
  const ref = useRef<SeatLayerPickerMeasurableView | null>(null);
  const leaseRef = useRef<SeatLayerPickerBlockedRegionLease | undefined>(undefined);
  useEffect(() => {
    if (registry === undefined || !enabled) return undefined;
    const lease = registry.claim();
    leaseRef.current = lease;
    measure(ref.current, (rect) => lease.report(rect));
    return () => {
      if (leaseRef.current === lease) leaseRef.current = undefined;
      lease.release();
    };
  }, [enabled, registry]);
  const remeasure = useMemo(
    () => () => {
      const lease = leaseRef.current;
      if (lease === undefined) return;
      measure(ref.current, (rect) => lease.report(rect));
    },
    [],
  );
  return useMemo(
    () => Object.freeze({ ref, onLayout: () => remeasure(), remeasure }),
    [remeasure],
  );
}

/** Covers the whole map while a modal stands over the page. */
export function useSeatLayerPickerBlockedRegionCover(active: boolean): void {
  const registry = useSeatLayerPickerBlockedRegionRegistry();
  useEffect(() => {
    if (registry === undefined || !active) return undefined;
    const lease = registry.claimCover();
    lease.report(undefined);
    return () => lease.release();
  }, [active, registry]);
}

export interface SeatLayerPickerBlockedRegionProps extends PropsWithChildren {
  readonly enabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: ViewStyle['pointerEvents'];
}

/**
 * Wraps one piece of chrome and reports its rectangle. It draws nothing and
 * takes no pointer of its own — the control underneath still competes for the
 * touch exactly as §2.4's rules 1–3 require.
 */
export function SeatLayerPickerBlockedRegion(
  props: SeatLayerPickerBlockedRegionProps,
): React.ReactElement {
  const binding = useSeatLayerPickerBlockedRegion(props.enabled ?? true);
  return (
    <View
      collapsable={false}
      onLayout={binding.onLayout}
      pointerEvents={props.pointerEvents ?? 'box-none'}
      ref={binding.ref as never}
      style={props.style}
    >
      {props.children}
    </View>
  );
}

/** The map surface itself. Every reported rectangle is measured against it. */
export function SeatLayerPickerBlockedRegionSurface(
  props: PropsWithChildren<{ readonly style?: StyleProp<ViewStyle> }>,
): React.ReactElement {
  const registry = useSeatLayerPickerBlockedRegionRegistry();
  const ref = useRef<SeatLayerPickerMeasurableView | null>(null);
  return (
    <View
      collapsable={false}
      onLayout={() => measure(ref.current, (rect) => registry?.setSurface(rect))}
      pointerEvents="box-none"
      ref={ref as never}
      style={props.style}
    >
      {props.children}
    </View>
  );
}
