import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type {
  SeatLayerPickerSectionSummary,
  SeatLayerPickerSnapshot,
} from './models';
export {
  blendSeatLayerPickerColor,
  parseSeatLayerPickerColor,
  pickerColor,
  type SeatLayerPickerRgba,
} from './colors';

export function focusedPickerSection(
  snapshot: SeatLayerPickerSnapshot | undefined,
): SeatLayerPickerSectionSummary | undefined {
  if (snapshot === undefined) return undefined;
  if (snapshot.map.focusedSection !== undefined) {
    const focused = snapshot.map.focusedSection;
    const summary = snapshot.sections.find((section) => section.id === focused.id);
    return summary === undefined
      ? focused
      : Object.freeze({ ...summary, ...focused });
  }
  const id = snapshot.map.focusedSectionId;
  return id === undefined ? undefined : snapshot.sections.find((section) => section.id === id);
}

export function seatsLeftInPickerSection(
  section: SeatLayerPickerSectionSummary,
  snapshot: SeatLayerPickerSnapshot,
): number | undefined {
  if (section.seatsLeft === undefined) return undefined;
  const names = new Set(
    [section.label, section.displayLabel]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const selectedHere = snapshot.selection.filter((seat) => {
    const label = typeof seat.sectionLabel === 'string'
      ? seat.sectionLabel.trim().toLocaleLowerCase()
      : '';
    return names.has(label);
  }).length;
  return Math.max(0, section.seatsLeft - selectedHere);
}


/** One local mutation at a time; late completion cannot update a replaced scope. */
export function usePickerSingleFlight(
  sessionId: number,
  reportError: (error: unknown) => void,
  action: () => Promise<unknown> | unknown,
): readonly [boolean, () => boolean] {
  const [busy, setBusy] = useState(false);
  const flightRef = useRef<Readonly<{ sessionId: number; active: boolean }>>({ sessionId, active: false });
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const latestRef = useRef({ sessionId, reportError, action });
  useLayoutEffect(() => {
    latestRef.current = { sessionId, reportError, action };
  }, [action, reportError, sessionId]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    if (flightRef.current.sessionId !== sessionId) {
      generationRef.current += 1;
      flightRef.current = { sessionId, active: false };
      setBusy(false);
    }
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, [sessionId]);

  const run = useCallback(() => {
    if (flightRef.current.active ||
      flightRef.current.sessionId !== latestRef.current.sessionId || !mountedRef.current) {
      return false;
    }
    const generation = generationRef.current;
    const active = latestRef.current;
    flightRef.current = { sessionId: active.sessionId, active: true };
    setBusy(true);
    let promise: Promise<unknown>;
    try {
      promise = Promise.resolve(active.action());
    } catch (error) {
      promise = Promise.reject(error);
    }
    void promise.then(
      () => undefined,
      (error: unknown) => {
        if (mountedRef.current && generation === generationRef.current &&
          active.sessionId === latestRef.current.sessionId) {
          try {
            active.reportError(error);
          } catch {
            // Host reporting is observational; it cannot break this surface.
          }
        }
      },
    ).finally(() => {
      if (mountedRef.current && generation === generationRef.current &&
        active.sessionId === latestRef.current.sessionId) {
        flightRef.current = { sessionId: active.sessionId, active: false };
        setBusy(false);
      }
    });
    return true;
  }, []);
  return [busy, run] as const;
}
