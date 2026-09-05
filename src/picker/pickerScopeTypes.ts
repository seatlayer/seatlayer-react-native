import type { PropsWithChildren } from 'react';

import type { JsonObject } from '../json';
import type { ReadyInfo, SeatLayerConfiguration } from '../types';
import type { SeatLayerPickerBackAction } from './backNavigation';
import type { SeatLayerChartLoad } from './chartLoad';
import type { SeatLayerChartLoadListener } from './chartLoadSubscription';
import type { SeatLayerPickerController } from './controller';
import type { SeatLayerPickerBusyAction } from './busyState';
import type { SeatLayerPickerHapticCue } from './haptics';
import type { SeatLayerPickerHoldLapse } from './holdLapse';
import type { SeatLayerPickerInsetLease } from './insetOwnership';
import type { SeatLayerPickerStringResolver } from './locale';
import type { SeatLayerPickerSnapshot } from './models';
import type { SeatLayerPickerPricing } from './options';
import type { PendingConfirmationState } from './pendingConfirmationState';
import type {
  SeatLayerPickerLocalPresentationEvent,
  SeatLayerPickerPresentationState,
  SeatLayerPickerPromptKind,
} from './presentationState';
import type { SeatLayerPickerPromptLease } from './promptOwnership';
import type { SeatLayerPickerScopeStringProps } from './scopeStrings';
import type { SeatLayerPickerThemeStyles } from './styles';
import type {
  SeatLayerPickerThemeData,
  SeatLayerPickerThemeOptions,
  SeatLayerThemeMode,
} from './theme';
import type { SeatLayerPickerViewportInsetInput } from './viewportInsets';

export interface SeatLayerPickerAvailability {
  readonly floorStack: boolean;
  readonly viewportInsets: boolean;
  readonly venue3D: boolean;
  readonly seatView: boolean;
  readonly nativeSeatViewChrome: boolean;
}

export interface SeatLayerPickerScopeValue {
  readonly controller: SeatLayerPickerController;
  readonly snapshot: SeatLayerPickerSnapshot | undefined;
  readonly configuration: SeatLayerConfiguration;
  /** Deep-frozen init config of the active runtime, never an unvalidated prop. */
  readonly bridgeConfig: JsonObject;
  readonly themeMode: SeatLayerThemeMode;
  readonly resolvedTheme: SeatLayerPickerThemeData;
  readonly styles: SeatLayerPickerThemeStyles;
  readonly pricing?: SeatLayerPickerPricing;
  /** Formats every amount in scoped native chrome through the same host policy. */
  readonly formatMoney: (amount: number, currency: string) => string;
  /** Immutable native-chrome wording resolved for the active locale. */
  readonly strings: SeatLayerPickerStringResolver;
  readonly presentation: SeatLayerPickerPresentationState;
  readonly error: unknown;
  readonly isBusy: boolean;
  /** What is in flight, when something is. */
  readonly busyAction: SeatLayerPickerBusyAction | null;
  /**
   * §3.10.2: a removal never stands in the way of Continue — the controller
   * serialises the two, and the row itself is the answer to the press.
   */
  readonly blocksCheckout: boolean;
  readonly setBusyAction: (action: SeatLayerPickerBusyAction | null) => void;
  readonly isReady: boolean;
  readonly readOnly: boolean;
  readonly availability: SeatLayerPickerAvailability;
  readonly sessionId: number;
  /** True only while this exact logical picker scope session still owns async work. */
  readonly isSessionActive: () => boolean;
  readonly pendingSeat: PendingConfirmationState['pending'];
  /**
   * Plays one haptic cue now. A gesture whose confirmation must be felt under
   * the finger — a ticket removed — cannot wait for the snapshot the rest of
   * the haptics are read from. Dropped where the host supplied no adapter.
   */
  readonly emitHaptic: (cue: SeatLayerPickerHapticCue) => void;
  /** Remains true after the notice is dismissed so stale hold copy cannot return. */
  readonly holdLapsed: boolean;
  readonly holdLapse: SeatLayerPickerHoldLapse | undefined;
  readonly isHoldLapseBusy: boolean;
  readonly setPresentation: (event: SeatLayerPickerLocalPresentationEvent) => void;
  readonly reportError: (error: unknown) => void;
  readonly clearError: () => void;
  /** Recreates the embedded runtime while preserving this controller's identity. */
  readonly retry: () => Promise<void>;
  readonly markReady: (info?: ReadyInfo) => void;
  /** Subscribes to future runtime chart-load records without replay. */
  readonly subscribeChartLoad: (listener: SeatLayerChartLoadListener) => () => void;
  readonly confirmPending: () => void;
  readonly cancelPending: () => Promise<boolean>;
  readonly dismissHoldLapse: () => void;
  readonly reselectHoldLapse: () => Promise<boolean>;
  readonly setViewportInsetBand: (band: string, insets: SeatLayerPickerViewportInsetInput) => void;
  readonly removeViewportInsetBand: (band: string) => void;
  /** Claims a band for one mounted chrome owner; stale owners cannot clear it. */
  readonly claimViewportInsetBand: (band: string) => SeatLayerPickerInsetLease;
  readonly claimPrompt: (
    owner: string,
    kind: SeatLayerPickerPromptKind,
    context?: unknown,
  ) => Readonly<{ lease: SeatLayerPickerPromptLease; open(): boolean; dismiss(): boolean }> | undefined;
  /** Synchronous BackHandler decision from the latest snapshot/coordinator state. */
  readonly canHandleBack: () => boolean;
  readonly back: () => Promise<SeatLayerPickerBackAction>;
}

export interface SeatLayerPickerScopeProps extends PropsWithChildren, SeatLayerPickerScopeStringProps {
  readonly configuration: SeatLayerConfiguration;
  readonly controller?: SeatLayerPickerController;
  readonly bridgeConfig?: JsonObject;
  readonly themeMode?: SeatLayerThemeMode;
  readonly themeOptions?: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'>;
  /** Host chrome slots; each consumer also applies its own safe-style copy. */
  readonly styles?: SeatLayerPickerThemeStyles;
  /** Global money formatting for native chrome; runtime amounts remain authoritative. */
  readonly pricing?: SeatLayerPickerPricing;
  readonly readOnly?: boolean;
  /** Foreground catch-up refreshes availability unless the host opts out. */
  readonly refreshOnResume?: boolean;
  /** Receives one advertised runtime chart-load record for this active scope session. */
  readonly onChartLoad?: (load: SeatLayerChartLoad) => unknown;
}
