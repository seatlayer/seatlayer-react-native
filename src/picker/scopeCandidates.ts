import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerScopeInputs } from './scopeReplacement';

export interface SeatLayerPickerScopeCandidate {
  readonly inputs: SeatLayerPickerScopeInputs;
  readonly controller: SeatLayerPickerController | undefined;
}

function ownData(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

/** Inputs are validated/frozen first; compare their data, retaining functions by identity. */
function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right) || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) ||
      !sameData(ownData(left, key), ownData(right, key))) return false;
  }
  return true;
}

function same(
  left: SeatLayerPickerScopeCandidate,
  right: SeatLayerPickerScopeCandidate,
): boolean {
  return left.controller === right.controller &&
    left.inputs.readOnly === right.inputs.readOnly &&
    sameData(left.inputs.configuration, right.inputs.configuration) &&
    sameData(left.inputs.bridgeConfig, right.inputs.bridgeConfig);
}

/** Separates validated boot changes from harmless inline prop recreation. */
export class SeatLayerPickerScopeCandidates {
  private lastSeen: SeatLayerPickerScopeCandidate;
  private accepted: SeatLayerPickerScopeCandidate | undefined;

  constructor(
    initial: SeatLayerPickerScopeCandidate,
    accepted = true,
  ) {
    this.lastSeen = initial;
    this.accepted = accepted ? initial : undefined;
  }

  see(candidate: SeatLayerPickerScopeCandidate): boolean {
    if (same(this.lastSeen, candidate)) return false;
    this.lastSeen = candidate;
    return true;
  }

  get currentAccepted(): SeatLayerPickerScopeCandidate | undefined {
    return this.accepted;
  }

  isAccepted(candidate: SeatLayerPickerScopeCandidate): boolean {
    return this.accepted !== undefined && same(this.accepted, candidate);
  }

  accept(candidate: SeatLayerPickerScopeCandidate): void {
    this.accepted = candidate;
  }
}
