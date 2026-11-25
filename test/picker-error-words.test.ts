import { describe, expect, it } from 'vitest';

import { SeatLayerError } from '../src/errors';
import { seatLayerPickerBuyerError, seatLayerPickerErrorWords } from '../src/picker/errorWords';
import { rememberSeatLayerPickerFailure } from '../src/picker/failureLog';
import { createSeatLayerPickerStringResolver } from '../src/picker/locale';
import { seatLayerPickerLocaleStrings } from '../src/picker/strings.g';

const english = createSeatLayerPickerStringResolver({ locale: 'en' });
const word = (key: string) => english.translate(key);

interface Refusal { status?: number | null; message?: string; details?: Record<string, unknown> }

function refused(code: string, { status = 409, message = code, details = {} }: Refusal = {}): SeatLayerError {
  return SeatLayerError.bridge({
    code, message, details: { ...(status === null ? {} : { status }), ...details },
  });
}

async function words(error: unknown, command?: string, payload: any = {}, snapshot?: any) {
  if (command !== undefined) {
    await rememberSeatLayerPickerFailure(Promise.reject(error), command, payload, snapshot).catch(() => undefined);
  }
  return seatLayerPickerErrorWords(error, english);
}
const said = async (error: unknown, command = 'picker.holdSelection', payload: any = {}, snapshot?: any) =>
  (await words(error, command, payload, snapshot)).message;

describe('what a refused action says', () => {
  it('names the seats that were taken, and no standing place', async () => {
    const taken = (...labels: string[]) =>
      refused('conflict', { details: { conflicts: labels.map((label) => ({ label })) } });
    expect(await said(refused('conflict'))).toBe(word('seatsJustTaken'));
    expect(await said(taken('A-12'))).toBe('A-12 is no longer available. Choose another seat.');
    expect(await said(taken('A-12', 'A-13'))).toBe('A-12, A-13 are no longer available. Choose another group.');
    expect(await said(taken('__sl_ga__floor__3'))).toBe(word('seatsJustTaken'));
  });

  it.each([
    ['hold_unavailable', 'seatsJustTaken'], ['invalid_selection', 'seatsJustTaken'],
    ['release_exhausted', 'seatsJustTaken'], ['a_code_from_next_year', 'seatsJustTaken'],
    ['seat_held_for_renewal', 'seatHeldForRenewal'], ['not_for_sale', 'seatUnavailable'],
    ['rate_limited', 'tooManyAttempts'], ['hold_not_active', 'holdExpired'],
    ['hold_not_found', 'savedSeatsNotRestored'], ['key_revoked', 'eventUnavailable'],
    ['forbidden', 'eventUnavailable'], ['event_closed', 'salesClosedToast'],
    ['guests_only', 'guestsOnly'], ['guest_choice_closed', 'guestChoiceClosed'],
    ['companion_pair_required', 'companionPairRequired'],
    ['hold_already_active', 'holdAlreadyHeldTitle'],
    ['sold_out', 'ticketTypeSoldOut'], ['bad_payload', 'eventUnavailable'],
  ])('a hold refused with %s says %s', async (code, key) => {
    expect(await said(refused(code))).toBe(word(key));
  });

  it('asks to check the connection when no server answered', async () => {
    for (const message of ['Failed to fetch', 'Load failed', 'The Internet connection appears to be offline.']) {
      expect(await said(refused('command_failed', { status: null, message }))).toBe(word('checkConnection'));
    }
    expect(await said(refused('command_failed', { status: 502, message: 'request_failed_502' })))
      .toBe(word('checkConnection'));
    expect(await said(refused('temporarily_unavailable', { status: 503 }))).toBe(word('checkConnection'));
    expect(await said(SeatLayerError.timeout('picker.holdSelection', 30_000))).toBe(word('checkConnection'));
    expect(await said(refused('command_failed', { status: null, message: 'seatlayer: seat sales are closed' })))
      .toBe(word('salesClosedToast'));
  });

  it('says how long a pause for maintenance is', async () => {
    const paused = (details = {}) => refused('maintenance_mode', { status: 503, details });
    expect(await said(paused())).toBe(word('maintenancePausedShortly'));
    expect(await said(paused({ retryAfterS: 30 }))).toContain('in about 1 minute.');
    expect(await said(paused({ retryAfterS: 301 }))).toContain('in about 6 minutes.');
    expect(await said(paused({ notice: ' Back at 14:00. ' }))).toBe('Back at 14:00.');
  });

  it('gives Best Available, a removal and more time their own sentences', async () => {
    const best = (code: string) => said(refused(code), 'picker.bestAvailable', { qty: 4 });
    expect(await best('not_enough_together'))
      .toBe('We couldn’t find 4 seats together. Try fewer seats or another ticket type.');
    expect(await best('conflict')).toBe(word('seatsNoLongerAvailableTryAnother'));
    expect(await best('event_closed')).toBe(word('salesClosedToast'));
    const remove = (label: string, snapshot?: any) =>
      said(refused('cart_line_release_failed', { status: null }), 'picker.removeCartLine', { label }, snapshot);
    expect(await remove('A-12')).toBe('Couldn’t remove A-12. Your hold is unchanged.');
    expect(await remove('s1', { cartLines: [{ label: 's1', displayLabel: 'Stalls A-12' }] }))
      .toBe('Couldn’t remove Stalls A-12. Your hold is unchanged.');
    expect(await remove('__sl_ga__floor__1')).toBe('Couldn’t remove General admission. Your hold is unchanged.');
    expect(await said(refused('cannot_extend'), 'picker.extendHold')).toBe(word('couldNotAddMoreTime'));
    expect(await said(refused('not_found'), 'picker.extendHold')).toBe(word('couldNotAddMoreTime'));
  });

  it('says the limit only when its number came with the refusal', async () => {
    const limit = (details: Record<string, unknown>) => said(refused('hold_quantity_exceeded', { details }));
    expect(await limit({ max: 4 })).toBe('You can select up to 4 tickets for this order.');
    expect(await limit({ limit: 6 })).toBe('You can select up to 6 tickets for this order.');
    expect(await limit({ max: 1 })).toBe('You can select up to 1 ticket for this order.');
    expect(await limit({ max: 0 })).toBe(word('seatsJustTaken'));
    expect(await limit({})).toBe(word('seatsJustTaken'));
  });

  it('puts the access panel’s line under its title', async () => {
    expect(await words(refused('buyer_access_expired', { status: 403 })))
      .toEqual({ message: word('accessExpiredTitle'), detail: word('accessExpiredCopy') });
    expect(await words(refused('buyer_access_origin_mismatch', { status: 403 })))
      .toEqual({ message: word('accessUnverifiedTitle'), detail: word('accessUnverifiedCopy') });
  });

  it('never prints a code, a message or the app’s own exception', async () => {
    expect((await words(new Error('not for buyers'))).message).toBe(word('checkConnection'));
    expect((await words('not for buyers')).message).toBe(word('checkConnection'));
    for (const code of ['a_code_from_next_year', 'constructor', '__proto__', 'toString']) {
      expect((await words(refused(code))).message).toBe(word('checkConnection'));
      expect(await said(refused(code), 'picker.zoomToFit')).toBe(word('checkConnection'));
    }
  });

  it('lets an error’s own buyer sentence stand', () => {
    const own = Object.assign(refused('conflict'), { buyerMessage: ' Ask at the desk. ' });
    expect(seatLayerPickerBuyerError(own, english)).toEqual({ message: 'Ask at the desk.' });
    const hostile = Object.create(null, { buyerMessage: { enumerable: true, get: () => { throw new Error('x'); } } });
    expect(seatLayerPickerBuyerError(hostile, english).message).toBe(word('checkConnection'));
  });

  it('is written in every language the picker has', async () => {
    const errors = [
      refused('conflict'), refused('sold_out'), refused('guests_only'), refused('maintenance_mode', { details: { retryAfterS: 300 } }),
      refused('conflict', { details: { conflicts: [{ label: 'A-1' }] } }), new Error('x'),
    ];
    for (const locale of Object.keys(seatLayerPickerLocaleStrings)) {
      const strings = createSeatLayerPickerStringResolver({ locale });
      for (const error of errors) {
        const { message } = seatLayerPickerErrorWords(error, strings);
        expect(message, locale).not.toMatch(/[{}]/);
        if (!locale.startsWith('en')) expect(message, locale).not.toBe(seatLayerPickerErrorWords(error, english).message);
      }
    }
  });
});
