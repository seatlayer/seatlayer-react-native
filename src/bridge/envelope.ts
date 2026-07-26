import { asInteger, asObject, asString, type JsonValue } from '../json';

export const envelopeMarker = 1;

export type KnownEnvelopeKind = 'hello' | 'init' | 'cmd' | 'res' | 'err' | 'evt';
export type EnvelopeKind = KnownEnvelopeKind | (string & {});

export interface Envelope {
  kind: EnvelopeKind;
  type: string;
  id?: string;
  sequence?: number;
  payload?: JsonValue;
}

export function decodeEnvelope(input: unknown): Envelope | undefined {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  const fields = asObject(raw);
  if (!fields || asInteger(fields.sl) !== envelopeMarker) return undefined;
  const kind = asString(fields.k);
  const type = asString(fields.t);
  if (!kind || !type) return undefined;

  const id = fields.id === undefined || fields.id === null
    ? undefined
    : asString(fields.id);
  if (fields.id !== undefined && fields.id !== null && id === undefined) {
    return undefined;
  }

  const sequence = fields.n === undefined || fields.n === null
    ? undefined
    : asInteger(fields.n);
  if (fields.n !== undefined && fields.n !== null && sequence === undefined) {
    return undefined;
  }

  return {
    kind,
    type,
    ...(id === undefined ? {} : { id }),
    ...(sequence === undefined ? {} : { sequence }),
    ...(fields.p === undefined ? {} : { payload: fields.p as JsonValue }),
  };
}

export function encodeEnvelope(envelope: Envelope): string {
  return JSON.stringify({
    sl: envelopeMarker,
    k: envelope.kind,
    t: envelope.type,
    ...(envelope.id === undefined ? {} : { id: envelope.id }),
    ...(envelope.sequence === undefined ? {} : { n: envelope.sequence }),
    ...(envelope.payload === undefined ? {} : { p: envelope.payload }),
  });
}
