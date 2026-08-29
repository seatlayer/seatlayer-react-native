import type { SeatLayerPickerSnapshot } from "./models";

export interface SeatLayerPickerAvailabilityOutcome {
  readonly refreshed: boolean;
  readonly lostLabels: readonly string[];
  readonly holdLapsed: boolean;
  readonly lapsedLabels: readonly string[];
  readonly recoverableLabels: readonly string[];
  readonly revision?: number;
  readonly snapshot?: SeatLayerPickerSnapshot;
  readonly heldForMs?: number;
}

export type SeatLayerPickerRecovery = "all" | "partial" | "none";

export function decodeSeatLayerPickerAvailabilityOutcome(
  value: unknown,
): SeatLayerPickerAvailabilityOutcome | undefined {
  try {
    const source = object(value);
    const result = object(field(source, "result")) ?? source;
    if (
      !result ||
      (field(result, "lost") === undefined &&
        field(result, "holdLapsed") === undefined)
    ) {
      return undefined;
    }
    const lapsedCandidate = strings(field(result, "lapsedLabels"));
    const lapsed = lapsedCandidate.length
      ? lapsedCandidate
      : strings(field(result, "lapsed"));
    const lapsedHold = field(result, "holdLapsed") === true;
    const recoverableCandidate = strings(field(result, "recoverableLabels"));
    const recoverableSource = recoverableCandidate.length
      ? recoverableCandidate
      : strings(field(result, "recoverable"));
    const recoverable = Object.freeze(lapsedHold
      ? recoverableSource.filter((label) => lapsed.includes(label))
      : []);
    const revision = nonNegativeInteger(field(result, "revision"));
    const heldForMs = nonNegativeInteger(field(result, "heldForMs"));
    return Object.freeze({
      refreshed: field(result, "refreshed") !== false,
      lostLabels: strings(field(result, "lost")),
      holdLapsed: lapsedHold,
      lapsedLabels: lapsedHold ? lapsed : Object.freeze([]),
      recoverableLabels: recoverable,
      ...(revision === undefined ? {} : { revision }),
      ...(heldForMs === undefined ? {} : { heldForMs }),
    });
  } catch {
    return undefined;
  }
}

export function recoveryOf(
  outcome: SeatLayerPickerAvailabilityOutcome,
): SeatLayerPickerRecovery {
  if (!outcome.recoverableLabels.length) return "none";
  return outcome.recoverableLabels.length >= outcome.lapsedLabels.length
    ? "all"
    : "partial";
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function field(
  value: Record<string, unknown> | undefined,
  key: string,
): unknown {
  if (!value) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function strings(value: unknown): readonly string[] {
  try {
    if (!Array.isArray(value)) return Object.freeze([]);
    const values: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index))?.value;
      if (typeof item !== "string") continue;
      const label = item.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        values.push(label);
      }
    }
    return Object.freeze(values);
  } catch {
    return Object.freeze([]);
  }
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
