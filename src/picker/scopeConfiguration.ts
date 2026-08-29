import { SeatLayerError } from '../errors';
import type { BuyerAccessToken, SeatLayerConfiguration, SelectionValidator } from '../types';

function invalid(message: string): SeatLayerError {
  return new SeatLayerError('bad_payload', message);
}

function plainRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) {
    throw invalid(`${name} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor)) throw invalid(`SeatLayer configuration.${key} cannot be an accessor.`);
  return descriptor.value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = ownValue(record, key);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid(`SeatLayer configuration.${key} must be a string.`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = ownValue(record, key);
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw invalid(`SeatLayer configuration.${key} must be a boolean.`);
  return value;
}

function positiveInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = ownValue(record, key);
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw invalid(`SeatLayer configuration.${key} must be a positive integer.`);
  }
  return value;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalid(`${name} must be an array of strings.`);
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor) || typeof descriptor.value !== 'string') {
      throw invalid(`${name} must be an array of strings.`);
    }
    output.push(descriptor.value);
  }
  if (Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key))) {
    throw invalid(`${name} must not contain named properties.`);
  }
  return output;
}

function optionalStrings(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = ownValue(record, key);
  return value === undefined ? undefined : strings(value, `SeatLayer configuration.${key}`);
}

function stringRecord(value: unknown, name: string): Record<string, string> {
  const record = plainRecord(value, name);
  const output: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    const item = ownValue(record, key);
    if (typeof item !== 'string') throw invalid(`${name}.${key} must be a string.`);
    Object.defineProperty(output, key, { value: item, enumerable: true });
  }
  return output;
}

function token(value: unknown): BuyerAccessToken {
  const record = plainRecord(value, 'SeatLayer configuration.buyerAccessToken');
  const accessToken = ownValue(record, 'token');
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw invalid('SeatLayer configuration.buyerAccessToken.token is required.');
  }
  const expiresAt = ownValue(record, 'expiresAt');
  if (expiresAt !== undefined && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt < 0)) {
    throw invalid('SeatLayer configuration.buyerAccessToken.expiresAt must be finite.');
  }
  return Object.freeze(expiresAt === undefined ? { token: accessToken } : { token: accessToken, expiresAt });
}

function validators(value: unknown): SelectionValidator[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0) {
    throw invalid('SeatLayer configuration.selectionValidators must be a plain array.');
  }
  const output: SelectionValidator[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor)) {
      throw invalid('SeatLayer configuration.selectionValidators must be dense values.');
    }
    const candidate = descriptor.value;
    const record = plainRecord(candidate, 'SeatLayer selection validator');
    const type = ownValue(record, 'type');
    if (type === 'consecutiveSeats' || type === 'noOrphanSeats') {
      output.push(Object.freeze({ type }));
      continue;
    }
    const minimum = ownValue(record, 'minimum');
    if (type !== 'minimumSelectedPlaces' || typeof minimum !== 'number' || !Number.isInteger(minimum) || minimum <= 0) {
      throw invalid('SeatLayer selection validator is invalid.');
    }
    output.push(Object.freeze({ type, minimum }));
  }
  if (Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key))) {
    throw invalid('SeatLayer configuration.selectionValidators must not contain named properties.');
  }
  return output;
}

/** Validated immutable init input; caller-owned nested data never reaches a session. */
export function freezeSeatLayerPickerConfiguration(configuration: SeatLayerConfiguration): SeatLayerConfiguration {
  const record = plainRecord(configuration, 'SeatLayer configuration');
  const event = ownValue(record, 'event');
  if (typeof event !== 'string' || !event.trim()) throw invalid('SeatLayer configuration.event is required.');
  const selectedObjects = optionalStrings(record, 'selectedObjects');
  const selectableValue = ownValue(record, 'selectableObjects');
  const selectableObjects = selectableValue === undefined || selectableValue === null
    ? selectableValue : strings(selectableValue, 'SeatLayer configuration.selectableObjects');
  const tokenValue = ownValue(record, 'buyerAccessToken');
  const provider = ownValue(record, 'buyerAccessTokenProvider');
  if (provider !== undefined && typeof provider !== 'function') {
    throw invalid('SeatLayer configuration.buyerAccessTokenProvider must be callable.');
  }
  const validation = ownValue(record, 'selectionValidators');
  const messages = ownValue(record, 'messages');
  const hostInfo = ownValue(record, 'hostInfo');
  const apiBase = optionalString(record, 'apiBase');
  const publicKey = optionalString(record, 'publicKey');
  const maxSelection = positiveInteger(record, 'maxSelection');
  const places = positiveInteger(record, 'numberOfPlacesToSelect');
  const locale = optionalString(record, 'locale');
  const currency = optionalString(record, 'currency');
  const colorblindSafe = optionalBoolean(record, 'colorblindSafe');
  const initialView = optionalString(record, 'initialView');
  const showsWebSeatTooltip = optionalBoolean(record, 'showsWebSeatTooltip');
  const commandTimeoutMs = positiveInteger(record, 'commandTimeoutMs');
  const handshakeTimeoutMs = positiveInteger(record, 'handshakeTimeoutMs');
  return Object.freeze({
    event,
    ...(apiBase === undefined ? {} : { apiBase }),
    ...(publicKey === undefined ? {} : { publicKey }),
    ...(tokenValue === undefined ? {} : { buyerAccessToken: token(tokenValue) }),
    ...(provider === undefined ? {} : {
      buyerAccessTokenProvider: provider as SeatLayerConfiguration['buyerAccessTokenProvider'],
    }),
    ...(maxSelection === undefined ? {} : { maxSelection }),
    ...(selectedObjects === undefined ? {} : { selectedObjects: Object.freeze(selectedObjects) as string[] }),
    ...(selectableObjects === undefined ? {} : {
      selectableObjects: selectableObjects === null ? null : Object.freeze(selectableObjects) as string[],
    }),
    ...(places === undefined ? {} : { numberOfPlacesToSelect: places }),
    ...(validation === undefined ? {} : {
      selectionValidators: Object.freeze(validators(validation)) as SelectionValidator[],
    }),
    ...(locale === undefined ? {} : { locale }),
    ...(messages === undefined ? {} : { messages: Object.freeze(stringRecord(messages, 'SeatLayer configuration.messages')) }),
    ...(currency === undefined ? {} : { currency }),
    ...(colorblindSafe === undefined ? {} : { colorblindSafe }),
    ...(initialView === undefined ? {} : { initialView }),
    ...(showsWebSeatTooltip === undefined ? {} : { showsWebSeatTooltip }),
    ...(commandTimeoutMs === undefined ? {} : { commandTimeoutMs }),
    ...(handshakeTimeoutMs === undefined ? {} : { handshakeTimeoutMs }),
    ...(hostInfo === undefined ? {} : { hostInfo: Object.freeze(stringRecord(hostInfo, 'SeatLayer configuration.hostInfo')) }),
  });
}
