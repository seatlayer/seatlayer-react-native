import React, { forwardRef, useMemo, useRef } from 'react';
import type { ModalProps, StyleProp, ViewStyle } from 'react-native';

import type { SeatLayerError } from '../errors';
import type { SeatLayerPickerModalPresentation } from '../picker/modalPresentation';
import type { ReadyInfo } from '../types';
import {
  SeatLayerPagePicker,
  useSeatLayerOwnedPageController,
  type SeatLayerPagePickerHandle,
  type SeatLayerPagePickerLook,
} from '../surface/PagePicker';
import { SeatLayerPageView } from '../surface/PageView';
import { useSeatLayerSurfaceLook } from '../surface/SurfaceHeader';
import { SeatLayerSurfaceModal } from '../surface/SurfaceModal';
import {
  seatLayerSeasonConfigurationKey,
  seatLayerSeasonConfigurationProblem,
  seatLayerSeasonPageUrl,
  seatLayerSeasonProfile,
  type SeatLayerSeasonConfiguration,
} from './configuration';
import { SeatLayerSeasonController } from './controller';
import type { SeatLayerSeasonCloseOutcome, SeatLayerSeasonHandoff } from './models';

/** Receives a Season hold when the buyer presses Continue. Book it on your server; throw to keep the buyer on the Season. */
export type SeatLayerSeasonContinueCallback = (handoff: SeatLayerSeasonHandoff) => void | Promise<void>;

/** How a close the buyer asked for ended, and the hold it was about. */
export type SeatLayerSeasonCloseCallback = (
  outcome: SeatLayerSeasonCloseOutcome,
  operationId: string | undefined,
) => void;

/** `requestClose` asks the page, as the ✕ does. */
export type SeatLayerSeasonPickerHandle = SeatLayerPagePickerHandle;

export interface SeatLayerSeasonPickerProps extends SeatLayerPagePickerLook {
  /** Which Season to open and how. */
  readonly configuration: SeatLayerSeasonConfiguration;
  /** Receives the hold when the buyer continues to your checkout. */
  readonly onContinue: SeatLayerSeasonContinueCallback;
  /** The page driver. Without one the picker owns one. */
  readonly controller?: SeatLayerSeasonController;
  /** A hold this picker made is booked (after `controller.markBooked`). */
  readonly onBooked?: (handoff: SeatLayerSeasonHandoff) => void;
  /** The buyer closed the Season. Without it the ✕ is not drawn. */
  readonly onClose?: SeatLayerSeasonCloseCallback;
  /** A callback of yours threw, or the header could not draw. */
  readonly onError?: (error: unknown) => void;
}

/**
 * The complete Season picker: the header the event picker wears (brand mark,
 * name, hold clock, ✕) over the Season page, which draws the package, the
 * dates, the map and the cart. Give it a definite size;
 * `SeatLayerSeasonPickerModal` puts it on a modal of its own with Back wired up.
 */
export const SeatLayerSeasonPicker = forwardRef<SeatLayerSeasonPickerHandle, SeatLayerSeasonPickerProps>(
  function SeatLayerSeasonPicker(props, ref) {
    const controller = useSeatLayerOwnedPageController(props.controller, () => new SeatLayerSeasonController());
    const problem = seatLayerSeasonConfigurationProblem(props.configuration);
    if (problem !== undefined) throw problem;
    const key = seatLayerSeasonConfigurationKey(props.configuration);
    const latest = useRef(props);
    latest.current = props;
    return (
      <SeatLayerPagePicker<SeatLayerSeasonHandoff, SeatLayerSeasonConfiguration>
        ref={ref}
        controller={controller}
        configuration={props.configuration}
        configurationKey={key}
        page={seatLayerSeasonPageUrl}
        profileFor={({ theme, resumed }) => seatLayerSeasonProfile(latest.current.configuration, {
          theme,
          ...(resumed === undefined ? {} : { operationId: resumed?.operationId ?? null }),
        })}
        chrome={() => {
          const status = controller.status;
          return {
            // Until the page names the Season, the bar keeps the event picker's loading words.
            title: status?.seasonName,
            brandName: status?.branding?.brandName ?? status?.seasonName,
            branding: status?.branding,
          };
        }}
        followsTheme
        insetsCommand="season.setViewportInsets"
        setThemeMode={(mode) => controller.setThemeMode(mode)}
        close={props.onClose === undefined ? undefined : async ({ ready, held, bookedOperationId }) => {
          // With no page to ask, the seats the buyer holds stay held.
          const closed = ready
            ? await controller.requestClose()
            : held === undefined || held.operationId === bookedOperationId
              ? { outcome: 'closed' }
              : { outcome: 'kept', operationId: held.operationId };
          if (closed.outcome === 'stayed') return;
          latest.current.onClose?.(closed.outcome, closed.operationId);
        }}
        onContinue={(handoff) => latest.current.onContinue(handoff)}
        onBooked={(handoff) => latest.current.onBooked?.(handoff)}
        onError={(error) => latest.current.onError?.(error)}
        themeMode={props.themeMode}
        themeOptions={props.themeOptions}
        locale={props.locale}
        strings={props.strings}
        safeAreaInsets={props.safeAreaInsets}
        style={props.style}
        testID={props.testID}
      />
    );
  },
);

export interface SeatLayerSeasonViewProps {
  readonly controller: SeatLayerSeasonController;
  readonly configuration: SeatLayerSeasonConfiguration;
  /** The side the page boots on. Follow a later flip with `controller.setThemeMode`. */
  readonly themeMode?: 'light' | 'dark';
  readonly backgroundColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly onReady?: (info: ReadyInfo) => void;
  readonly onLoadError?: (error: SeatLayerError) => void;
}

/**
 * The Season page alone, for a layout of your own: its package step, map and
 * cart. It leaves the Season's name and the hold clock to the app: draw them
 * from `controller.status` and `controller.hold`. Give it a definite size.
 */
export function SeatLayerSeasonView(props: SeatLayerSeasonViewProps): React.ReactElement {
  const problem = seatLayerSeasonConfigurationProblem(props.configuration);
  if (problem !== undefined) throw problem;
  return (
    <SeatLayerPageView<SeatLayerSeasonConfiguration>
      controller={props.controller}
      configuration={props.configuration}
      configurationKey={seatLayerSeasonConfigurationKey(props.configuration)}
      page={seatLayerSeasonPageUrl}
      profile={seatLayerSeasonProfile(props.configuration, { theme: props.themeMode })}
      backgroundColor={props.backgroundColor}
      style={props.style}
      testID={props.testID}
      onReady={props.onReady}
      onLoadError={props.onLoadError}
    />
  );
}

export interface SeatLayerSeasonPickerModalProps extends SeatLayerSeasonPickerProps {
  readonly visible: boolean;
  /** The buyer closed the Season: hide the modal. */
  readonly onClose: SeatLayerSeasonCloseCallback;
  readonly presentation?: SeatLayerPickerModalPresentation;
  /** A tap beside the dialog asks the page, as ✕ does. Off unless asked for. */
  readonly barrierDismissible?: boolean;
  readonly supportedOrientations?: ModalProps['supportedOrientations'];
}

/**
 * The Season picker on a modal of its own: full screen on a phone however it
 * is held, a dialog on a tablet. System Back asks the page, as ✕ does. Close
 * it from `onContinue` (after your server took the hold) and `onClose`.
 */
export function SeatLayerSeasonPickerModal(props: SeatLayerSeasonPickerModalProps): React.ReactElement {
  const picker = useRef<SeatLayerSeasonPickerHandle>(null);
  // The organizer's brand never sets the ground, so the frame needs no status.
  const look = useSeatLayerSurfaceLook({
    themeMode: props.themeMode,
    themeOptions: props.themeOptions,
    locale: props.locale,
    strings: props.strings,
  });
  const { visible, presentation, barrierDismissible, supportedOrientations, ...pickerProps } = props;
  const style = useMemo(() => [{ flex: 1 }, props.style], [props.style]);
  return (
    <SeatLayerSurfaceModal
      visible={visible}
      presentation={presentation}
      barrierDismissible={barrierDismissible}
      supportedOrientations={supportedOrientations}
      surfaceColor={look.theme.colors.surface}
      cardRadius={look.theme.radii.card}
      closeLabel={look.strings.translate('close')}
      usesHostInsets={props.safeAreaInsets !== undefined}
      onRequestClose={() => { void picker.current?.requestClose(); }}
    >
      <SeatLayerSeasonPicker ref={picker} {...pickerProps} style={style} />
    </SeatLayerSurfaceModal>
  );
}
