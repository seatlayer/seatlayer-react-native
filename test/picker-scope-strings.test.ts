import { describe, expect, it } from 'vitest';

import type { SeatLayerConfiguration } from '../src/types';
import {
  prepareSeatLayerPickerScopeStringInputs,
  resolveSeatLayerPickerScopeStringResolution,
  resolveSeatLayerPickerScopeStrings,
} from '../src/picker/scopeStrings';
import { reprovideSeatLayerPickerScopeValue } from '../src/picker/scopeReprovider';

const configuration: SeatLayerConfiguration = Object.freeze({ event: 'event-key', locale: 'de-DE' });
const frenchSnapshot = Object.freeze({ event: Object.freeze({ locale: 'fr-CA' }) });

describe('picker scope strings', () => {
  it('selects explicit, snapshot, configuration, and canonical locales in that order', () => {
    const fromSnapshot = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({}), frenchSnapshot as never, configuration);
    const explicit = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({ locale: 'en-GB' }), frenchSnapshot as never, configuration);
    const fromConfiguration = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({}), undefined, configuration);
    const canonical = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({ locale: null }), frenchSnapshot as never, configuration);

    expect(fromSnapshot.translate('close')).toBe('Fermer');
    expect(explicit.translate('findBestSeats', { count: 1 })).toBe('Find 1 best seat');
    expect(fromConfiguration.translate('close')).toBe('Schließen');
    expect(canonical.translate('findBestSeats', { count: 1 })).toBe('Find 1 best seat');
  });

  it('rebuilds an immutable resolver for live locale and override inputs without changing its configuration', () => {
    const french = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({ locale: 'fr' }), undefined, configuration);
    const german = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({
      locale: 'de',
      strings: { close: 'Dismiss picker' },
    }), undefined, configuration);

    expect(french).not.toBe(german);
    expect(french.translate('continueWithTotal', { values: { money: '$20' } })).toBe('Continuer · $20');
    expect(german.translate('close')).toBe('Dismiss picker');
    expect(configuration).toEqual({ event: 'event-key', locale: 'de-DE' });
    expect(Object.isFrozen(german)).toBe(true);
  });

  it('keeps memo inputs stable across unrelated snapshots and changes them only for locale or overrides', () => {
    const overrides = { close: 'Dismiss picker' };
    const inputs = prepareSeatLayerPickerScopeStringInputs({ strings: overrides });
    const first = resolveSeatLayerPickerScopeStringResolution(inputs, {
      revision: 1,
      event: { locale: 'fr' },
    } as never, configuration);
    const unrelatedRevision = resolveSeatLayerPickerScopeStringResolution(inputs, {
      revision: 2,
      event: { locale: 'fr' },
    } as never, configuration);
    const localeChanged = resolveSeatLayerPickerScopeStringResolution(inputs, {
      revision: 3,
      event: { locale: 'de' },
    } as never, configuration);
    const overrideChanged = resolveSeatLayerPickerScopeStringResolution(
      prepareSeatLayerPickerScopeStringInputs({ strings: { close: 'Close now' } }),
      { revision: 2, event: { locale: 'fr' } } as never,
      configuration,
    );

    expect(unrelatedRevision.locale).toBe(first.locale);
    expect(unrelatedRevision.overrideKey).toBe(first.overrideKey);
    expect(localeChanged.locale).not.toBe(first.locale);
    expect(overrideChanged.overrideKey).not.toBe(first.overrideKey);
  });

  it('contains hostile locale and string props without reading their accessors', () => {
    let accessorRead = false;
    const hostile = {} as { locale?: unknown; strings?: unknown };
    Object.defineProperty(hostile, 'locale', {
      get: () => {
        accessorRead = true;
        throw new Error('locale accessor');
      },
    });
    Object.defineProperty(hostile, 'strings', {
      get: () => {
        accessorRead = true;
        throw new Error('strings accessor');
      },
    });
    const proxyOverrides = new Proxy({}, {
      ownKeys: () => { throw new Error('override proxy'); },
    });
    const fromHostile = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs(hostile as never), undefined, configuration);
    const fromProxy = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({ strings: proxyOverrides as never }), undefined, configuration);

    expect(fromHostile.translate('close')).toBe('Schließen');
    expect(fromProxy.translate('close')).toBe('Schließen');
    expect(accessorRead).toBe(false);
  });

  it('keeps the exact resolver identity when a scope value is re-provided', () => {
    const strings = resolveSeatLayerPickerScopeStrings(prepareSeatLayerPickerScopeStringInputs({ locale: 'fr' }), undefined, configuration);
    const value = Object.freeze({ strings, sessionId: 3 });
    const reprovided = reprovideSeatLayerPickerScopeValue(value);

    expect(reprovided).toBe(value);
    expect(reprovided.strings).toBe(strings);
  });
});
