import React, { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { SeatLayerPickerHeaderView } from '../picker/header';
import { createSeatLayerPickerStringResolver, type SeatLayerPickerStringResolver } from '../picker/locale';
import type { SeatLayerPickerBranding } from '../picker/models';
import { resolveSeatLayerPickerScopeTheme } from '../picker/scopeTheme';
import {
  prepareSeatLayerPickerScopeStringInputs,
  type SeatLayerPickerScopeStringProps,
} from '../picker/scopeStrings';
import type {
  SeatLayerPickerThemeData,
  SeatLayerPickerThemeOptions,
  SeatLayerThemeMode,
} from '../picker/theme';

/** The palette and the words a page of its own wears in the app's chrome. */
export interface SeatLayerSurfaceLook {
  readonly theme: SeatLayerPickerThemeData;
  readonly strings: SeatLayerPickerStringResolver;
}

export interface SeatLayerSurfaceLookInput extends SeatLayerPickerScopeStringProps {
  readonly themeMode?: SeatLayerThemeMode;
  readonly themeOptions?: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'>;
  /** The organizer's brand, once the page has sent it. */
  readonly branding?: SeatLayerPickerBranding;
  /** The language the page was opened in, when the app names none. */
  readonly pageLocale?: string;
}

/**
 * Resolves a page's palette and words as the event picker does: the app's
 * theme, then the organizer's brand; the app's language, else the page's.
 */
export function useSeatLayerSurfaceLook(input: SeatLayerSurfaceLookInput): SeatLayerSurfaceLook {
  const deviceMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { branding, pageLocale, themeMode = 'auto', themeOptions } = input;
  const theme = useMemo(
    () => resolveSeatLayerPickerScopeTheme(
      themeOptions,
      themeMode,
      deviceMode,
      branding === undefined ? undefined : { branding },
    ),
    [branding, deviceMode, themeMode, themeOptions],
  );
  const words = prepareSeatLayerPickerScopeStringInputs(input);
  const locale = words.hasExplicitLocale ? words.locale : pageLocale;
  const strings = useMemo(
    () => createSeatLayerPickerStringResolver({ locale, overrides: words.overrides }),
    // The override key changes with the overrides' own content.
    [locale, words.overrideKey],
  );
  return useMemo(() => Object.freeze({ theme, strings }), [strings, theme]);
}

export interface SeatLayerSurfaceHeaderProps {
  readonly look: SeatLayerSurfaceLook;
  /** The page's name. Until the page names it, the event picker's loading words. */
  readonly title?: string;
  readonly brandName?: string;
  /** When the buyer's hold ends, in milliseconds since the epoch: the clock. */
  readonly holdExpiresAt?: number;
  /** The page says its line is down: a clock at 0:00 waits in grey. */
  readonly lineDown?: boolean;
  /** The ✕. Without it the header draws none. */
  readonly onClose?: () => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
  readonly topInset?: number;
  /** Changes when a new page takes the place of the last. */
  readonly sessionId?: number;
  readonly clock?: () => number;
}

/**
 * The event picker's header over a page of its own: brand mark, name, the
 * one hold clock and the ✕. The page below it draws no bar of its own.
 */
export function SeatLayerSurfaceHeader(props: SeatLayerSurfaceHeaderProps): React.ReactElement {
  const { strings, theme } = props.look;
  const report = props.onError ?? ignore;
  return (
    <SeatLayerPickerHeaderView
      announceHold={(key, count) => strings.translate(key, { count, values: { count } })}
      brandName={props.brandName}
      clock={props.clock}
      closeLabel={strings.translate('close')}
      heldFor={(clock) => strings.translate('heldFor', { values: { clock } })}
      hold={props.holdExpiresAt === undefined
        ? undefined
        : { active: true, expiresAt: props.holdExpiresAt }}
      lineDown={props.lineDown}
      logoSource={theme.logoSource}
      onClose={props.onClose}
      removeInset={ignore}
      reportError={report}
      reportInset={ignore}
      sessionId={props.sessionId}
      theme={theme}
      title={props.title?.trim() || strings.translate('chooseSeats')}
      topInset={props.topInset}
    />
  );
}

function ignore(): void { /* A page of its own reserves no map inset. */ }
