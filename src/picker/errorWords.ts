import { SeatLayerError } from '../errors';
import { seatLayerPickerFailureFor } from './failureLog';
import type { SeatLayerPickerStringResolver } from './locale';

/**
 * What a refused action says to the buyer, in the web picker's own sentences.
 *
 * The machine code and the server's message stay with the host's `onError`.
 * The code decides the sentence where it names its own, and otherwise the
 * action the buyer asked for does.
 */
export interface SeatLayerPickerErrorWords {
  readonly message: string;
  /** The line under it, where the picker has one. */
  readonly detail?: string;
}

/** Commands that secure seats, where any refusal means they were not secured. */
const holdCommands: ReadonlySet<string | undefined> = new Set([
  'hold', 'picker.continue', 'picker.holdGA', 'picker.holdSelection',
  'picker.resumeHold', 'picker.setTableQuantity',
]);

/**
 * Failures of the app, the page or the call itself, where asking again cannot
 * help: a page the app cannot speak to, or a call made wrongly.
 */
const cannotRetry: ReadonlySet<string> = new Set([
  'bad_payload', 'destroyed', 'handoff_not_owned', 'holdId_required',
  'idempotency_key_conflict', 'idempotency_key_reused', 'invalid_channel_scope',
  'invalid_expect_extends', 'invalid_idempotency_key', 'invalid_referral',
  'labels_and_holdId_required', 'picker_requires_protocol_2', 'read_only',
  'selections_required', 'sl_incompatible', 'table_quantity_rejected',
  'unsupported_command', 'unsupported_state_contract',
]);

/** The same, where asking again may help. */
const mayRetry: ReadonlySet<string> = new Set([
  'command_failed', 'internal_error', 'not_ready', 'picker_error', 'render_failed',
  'sl_decoding', 'sl_handshake_timeout', 'sl_transport', 'unknown', 'unknown_error',
]);

/** Refusals that are about the seats, whichever action met them. */
const takenCodes: ReadonlySet<string> = new Set([
  'allocation_exhausted', 'conflict', 'hold_unavailable', 'invalid_selection',
  'not_enough_together', 'release_closed', 'release_exhausted',
]);

/**
 * What a web view calls a request that reached no server. Such a failure has
 * no code of its own: it arrives under the page's fallback code with only the
 * browser's message.
 */
const noConnection = new RegExp(
  'failed to fetch|load failed|network ?error|network connection was lost|'
  + 'internet connection appears to be offline|could not connect to the server|'
  + 'request timed out|hostname could not be found',
  'i',
);

/** Codes whose sentence does not depend on what was asked for: key, then line. */
const ownSentences: Readonly<Record<string, readonly [string, string?]>> = {
  sl_timeout: ['checkConnection'],
  host_timeout: ['checkConnection'],
  rate_limited: ['tooManyAttempts'],
  guests_only: ['guestsOnly'],
  guest_choice_closed: ['guestChoiceClosed'],
  event_closed: ['salesClosedToast'],
  companion_pair_required: ['companionPairRequired'],
  ticket_option_not_applicable: ['ticketOptionNotApplicable'],
  cannot_extend: ['couldNotAddMoreTime'],
  channel_paused: ['accessPausedTitle', 'accessPausedCopy'],
  buyer_access_revoked: ['accessRevokedTitle', 'accessRevokedCopy'],
  buyer_access_invalid: ['accessExpiredTitle', 'accessExpiredCopy'],
  buyer_access_expired: ['accessExpiredTitle', 'accessExpiredCopy'],
  access_provider_timeout: ['accessExpiredTitle', 'accessExpiredCopy'],
  access_provider_closed: ['accessExpiredTitle', 'accessExpiredCopy'],
  provider_failed: ['accessExpiredTitle', 'accessExpiredCopy'],
  hold_already_active: ['holdAlreadyHeldTitle', 'holdAlreadyHeldBody'],
  hold_owned_by_host: ['holdAlreadyHeldTitle', 'holdAlreadyHeldBody'],
  hold_selection_mismatch: ['holdAlreadyHeldTitle', 'holdAlreadyHeldBody'],
  no_token: ['accessExpiredTitle', 'accessExpiredCopy'],
  access_provider_unavailable: ['accessUnverifiedTitle', 'accessUnverifiedCopy'],
};

/** Codes with a sentence for every action but a removal and more time. */
const refusalSentences: Readonly<Record<string, string>> = {
  seat_held_for_renewal: 'seatHeldForRenewal',
  channel_access_denied: 'accessUnverifiedCopy',
  hold_not_active: 'holdExpired',
  hold_not_found: 'savedSeatsNotRestored',
  legacy_hold_requires_restart: 'savedSeatsNotRestored',
  order_edit_in_progress: 'eventUnavailable',
  event_not_found: 'eventUnavailable',
  key_not_found: 'eventUnavailable',
  key_revoked: 'eventUnavailable',
  mode_mismatch: 'eventUnavailable',
  org_mismatch: 'eventUnavailable',
  credit_limit_reached: 'eventUnavailable',
};

const standingPlace = '__sl_ga__';

function own<Value>(table: Readonly<Record<string, Value>>, key: string): Value | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The buyer's sentence for `error`: never a code, the server's message or an
 * exception's own text.
 */
export function seatLayerPickerErrorWords(
  error: unknown,
  strings: SeatLayerPickerStringResolver,
): SeatLayerPickerErrorWords {
  const say = (key: string, detailKey?: string): SeatLayerPickerErrorWords => ({
    message: strings.translate(key),
    ...(detailKey === undefined ? {} : { detail: strings.translate(detailKey) }),
  });
  const count = (key: string, value: number): SeatLayerPickerErrorWords => ({
    message: strings.translate(key, { count: value, values: { count: value } }),
  });
  // An exception of the app's own: its request may go through a second time.
  if (!(error instanceof SeatLayerError)) return say('checkConnection');

  const failure = seatLayerPickerFailureFor(error);
  const command = failure?.command;
  const { code } = error;
  const meta = error.details?.meta;
  const status = finite(meta?.status);
  const pageMessage = error.details?.message ?? '';
  // The page's fallback codes carry a status when the server did answer, with
  // nothing more to say about it.
  const answered = (!cannotRetry.has(code) && !mayRetry.has(code))
    || (status !== undefined && (code === 'command_failed' || code === 'picker_error'));
  // Neither the action's sentence nor one of the code's own is true of it.
  const other = say(cannotRetry.has(code) ? 'eventUnavailable' : 'checkConnection');

  if (code === 'maintenance_mode') {
    const notice = typeof meta?.notice === 'string' ? meta.notice.trim() : '';
    if (notice) return { message: notice };
    const seconds = finite(meta?.retryAfterS);
    return seconds === undefined || seconds < 0
      ? say('maintenancePausedShortly')
      : count('maintenancePaused', Math.max(1, Math.ceil(seconds / 60)));
  }
  const sentence = own(ownSentences, code);
  if (sentence) return say(...sentence);
  if (code.startsWith('buyer_access_') && code.endsWith('_mismatch')) {
    return say('accessUnverifiedTitle', 'accessUnverifiedCopy');
  }
  const unanswered = status === undefined
    ? noConnection.test(pageMessage)
    : status === 503 || (status >= 500 && pageMessage.startsWith('request_failed'));
  if (unanswered) return say('checkConnection');
  if (pageMessage.includes('seat sales are closed')) return say('salesClosedToast');

  // A removal and more time have their own sentence for every refusal; what
  // else was asked for is refused for a reason the code names.
  if (command !== 'picker.removeCartLine' && command !== 'picker.extendHold') {
    if (code === 'hold_quantity_exceeded') {
      const limit = finite(meta?.max) ?? finite(meta?.limit);
      if (limit === 1) return say('maxOneTicketForOrder');
      if (limit !== undefined && limit > 1) return count('maxTicketsForOrder', limit);
    }
    const refusal = own(refusalSentences, code);
    if (refusal) return say(refusal);
    if ((code === 'forbidden' || code === 'not_found')
      && (command === 'picker.bestAvailable' || holdCommands.has(command))) {
      return say('eventUnavailable');
    }
  }

  if (command === 'picker.bestAvailable') {
    if (!answered) return other;
    if (code === 'not_enough_together' && failure?.quantity !== undefined) {
      return count('couldNotFindSeatsTogether', failure.quantity);
    }
    return say(code === 'sold_out' ? 'ticketTypeSoldOut' : 'seatsNoLongerAvailableTryAnother');
  }
  if (command === 'picker.removeCartLine') {
    const label = failure?.label;
    if (label === undefined || !answered) return other;
    return {
      message: strings.translate('couldNotRemoveLabel', {
        values: { label: label.startsWith(standingPlace) ? strings.translate('generalAdmission') : label },
      }),
    };
  }
  if (command === 'picker.extendHold' && answered) return say('couldNotAddMoreTime');

  // A standing place has no name of its own to lose, and its area may well
  // have more: only seats are named.
  const named = (error.conflicts ?? [])
    .map((conflict) => conflict.label ?? '')
    .filter((label) => label !== '')
    .slice(0, 3)
    .filter((label) => !label.startsWith(standingPlace));
  if (named.length > 0) {
    return {
      message: strings.translate(
        named.length === 1 ? 'labelNoLongerAvailable' : 'labelsNoLongerAvailable',
        { values: { labels: named.join(', ') } },
      ),
    };
  }
  if (code === 'sold_out') return say('ticketTypeSoldOut');
  if (code === 'not_for_sale') return say('seatUnavailable');
  if (takenCodes.has(code) || (answered && holdCommands.has(command))) return say('seatsJustTaken');
  return other;
}

/** The sentence an app gave the error itself, which the picker says as it is. */
export function seatLayerPickerOwnBuyerMessage(error: unknown): string | undefined {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  try {
    const field = Object.getOwnPropertyDescriptor(error, 'buyerMessage');
    const value: unknown = field?.enumerable && 'value' in field ? field.value : undefined;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The error's own sentence, or the picker's for it. */
export function seatLayerPickerBuyerError(
  error: unknown,
  strings: SeatLayerPickerStringResolver,
): SeatLayerPickerErrorWords {
  const message = seatLayerPickerOwnBuyerMessage(error);
  return message === undefined ? seatLayerPickerErrorWords(error, strings) : { message };
}
