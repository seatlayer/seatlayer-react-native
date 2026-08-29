import type { SeatLayerPickerAvailabilityOutcome } from "./availability";

export interface SeatLayerPickerHoldLapse {
  readonly key: string;
  readonly lapsedLabels: readonly string[];
  readonly recoverableLabels: readonly string[];
  readonly heldForMs?: number;
  readonly revision?: number;
}

export function holdLapseFromOutcome(
  outcome: SeatLayerPickerAvailabilityOutcome,
  configuredHoldTtlMs?: unknown,
): SeatLayerPickerHoldLapse | undefined {
  if (!outcome.holdLapsed) return undefined;
  return Object.freeze({
    key: "unassigned",
    lapsedLabels: labels(outcome.lapsedLabels),
    recoverableLabels: labels(outcome.recoverableLabels),
    ...(outcome.revision === undefined ? {} : { revision: outcome.revision }),
    ...(duration(outcome.heldForMs, configuredHoldTtlMs) === undefined
      ? {}
      : { heldForMs: duration(outcome.heldForMs, configuredHoldTtlMs) }),
  });
}

/** Runtime outcome wins; a safe bridge TTL supplies held-minutes copy. */
export function seatLayerPickerHoldDuration(
  outcomeValue: unknown,
  configuredValue: unknown,
): number | undefined {
  return duration(outcomeValue, configuredValue);
}

export function seatLayerPickerConfiguredHoldTtl(config: unknown): number | undefined {
  if (!config || typeof config !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(config, "holdTtlMs");
    return descriptor && "value" in descriptor
      ? positiveSafeInteger(descriptor.value)
      : undefined;
  } catch {
    return undefined;
  }
}

function duration(outcomeValue: unknown, configuredValue: unknown): number | undefined {
  return positiveSafeInteger(outcomeValue) ?? positiveSafeInteger(configuredValue);
}

function positiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

/** Keep the current offer until an outcome covers strictly more lapses. */
export function preferHoldLapse(
  current: SeatLayerPickerHoldLapse | undefined,
  candidate: SeatLayerPickerHoldLapse | undefined,
): SeatLayerPickerHoldLapse | undefined {
  if (!candidate) return current;
  if (!current) return freezeLapse(candidate);
  return candidate.lapsedLabels.length > current.lapsedLabels.length
    ? freezeLapse(candidate, current.key)
    : current;
}

function freezeLapse(
  lapse: SeatLayerPickerHoldLapse,
  key = lapse.key,
): SeatLayerPickerHoldLapse {
  return Object.freeze({
    ...lapse,
    key,
    lapsedLabels: labels(lapse.lapsedLabels),
    recoverableLabels: labels(lapse.recoverableLabels),
  });
}

function labels(values: readonly string[]): readonly string[] {
  return Object.freeze(
    values.reduce<string[]>((result, value) => {
      const label = value.trim();
      if (label && !result.includes(label)) result.push(label);
      return result;
    }, []),
  );
}
