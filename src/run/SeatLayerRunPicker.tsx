import React, { forwardRef, useMemo, useRef } from 'react';
import { useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

import type { SeatLayerError } from '../errors';
import type { ReadyInfo } from '../types';
import {
  SeatLayerPagePicker,
  useSeatLayerOwnedPageController,
  type SeatLayerPagePickerHandle,
  type SeatLayerPagePickerLook,
} from '../surface/PagePicker';
import { SeatLayerPageModal, type SeatLayerPageModalOptions } from '../surface/PageModal';
import { SeatLayerPageView } from '../surface/PageView';
import {
  seatLayerRunConfigurationKey,
  seatLayerRunConfigurationProblem,
  seatLayerRunPageUrl,
  seatLayerRunProfile,
  type SeatLayerRunConfiguration,
} from './configuration';
import { SeatLayerRunController } from './controller';
import type { SeatLayerRunHandoff } from './models';

/** Receives a run hold when the buyer presses Continue. Price and book it on your server; throw to keep the buyer on the run. */
export type SeatLayerRunContinueCallback = (handoff: SeatLayerRunHandoff) => void | Promise<void>;

/** `requestClose` closes the run, as the ✕ does. */
export type SeatLayerRunPickerHandle = SeatLayerPagePickerHandle;

export interface SeatLayerRunPickerProps extends SeatLayerPagePickerLook {
  /** Which run to open and how. */
  readonly configuration: SeatLayerRunConfiguration;
  /** Receives the hold when the buyer continues to your checkout. */
  readonly onContinue: SeatLayerRunContinueCallback;
  /** The page driver. Without one the picker owns one. */
  readonly controller?: SeatLayerRunController;
  /** A hold is booked (after `controller.markBooked`). */
  readonly onBooked?: (handoff: SeatLayerRunHandoff) => void;
  /** The buyer closed the run; seats not handed off were released. Without it the ✕ is not drawn. */
  readonly onClose?: () => void;
  /** A callback of yours threw, or the header could not draw. */
  readonly onError?: (error: unknown) => void;
}

/**
 * The complete run picker: the header the event picker wears (brand mark,
 * name, hold clock, ✕) over the run page, which draws the map, the seat card
 * and the cart. Give it a definite size; `SeatLayerRunPickerModal` puts it on
 * a modal of its own with Back wired up. It stays light or dark as it opened:
 * the run page cannot repaint in place, and a reload would take the buyer's
 * seats.
 */
export const SeatLayerRunPicker = forwardRef<SeatLayerRunPickerHandle, SeatLayerRunPickerProps>(
  function SeatLayerRunPicker(props, ref) {
    const controller = useSeatLayerOwnedPageController(props.controller, () => new SeatLayerRunController());
    const problem = seatLayerRunConfigurationProblem(props.configuration);
    if (problem !== undefined) throw problem;
    const key = seatLayerRunConfigurationKey(props.configuration);
    const latest = useRef(props);
    latest.current = props;
    const closing = useRef(false);
    return (
      <SeatLayerPagePicker<SeatLayerRunHandoff, SeatLayerRunConfiguration>
        ref={ref}
        controller={controller}
        configuration={props.configuration}
        configurationKey={key}
        page={seatLayerRunPageUrl}
        profileFor={({ theme, resumed }) => seatLayerRunProfile(latest.current.configuration, {
          theme,
          ...(resumed === undefined ? {} : { resumed }),
        })}
        chrome={() => {
          const run = controller.descriptor;
          const branding = controller.status?.branding;
          // Until the page names the run, the bar keeps the event picker's loading words.
          return { title: run?.name, brandName: branding?.brandName ?? run?.name, branding };
        }}
        followsTheme={false}
        insetsCommand="group.setViewportInsets"
        close={props.onClose === undefined ? undefined : async ({ ready }) => {
          if (closing.current) return;
          closing.current = true;
          try {
            // Seats not handed off are released; a hold handed off or booked stays for your server.
            if (ready) await controller.destroy();
            latest.current.onClose?.();
          } finally {
            closing.current = false;
          }
        }}
        readHold={() => controller.readHeldOrder()}
        resumesHold={props.configuration.initialOperationId !== undefined}
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

export interface SeatLayerRunViewProps {
  readonly controller: SeatLayerRunController;
  readonly configuration: SeatLayerRunConfiguration;
  /** The side the page boots on. The run page keeps it. */
  readonly themeMode?: 'light' | 'dark';
  readonly backgroundColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly onReady?: (info: ReadyInfo) => void;
  readonly onLoadError?: (error: SeatLayerError) => void;
}

/**
 * The run page alone, for a layout of your own: its map, performances and
 * cart, with its own header off. Draw the run's name and the hold clock from
 * `controller.descriptor` and `controller.hold`. Give it a definite size.
 */
export function SeatLayerRunView(props: SeatLayerRunViewProps): React.ReactElement {
  const problem = seatLayerRunConfigurationProblem(props.configuration);
  if (problem !== undefined) throw problem;
  return (
    <SeatLayerPageView<SeatLayerRunConfiguration>
      controller={props.controller}
      configuration={props.configuration}
      configurationKey={seatLayerRunConfigurationKey(props.configuration)}
      page={seatLayerRunPageUrl}
      profile={seatLayerRunProfile(props.configuration, { theme: props.themeMode })}
      backgroundColor={props.backgroundColor}
      style={props.style}
      testID={props.testID}
      onReady={props.onReady}
      onLoadError={props.onLoadError}
    />
  );
}

export interface SeatLayerRunPickerModalProps extends SeatLayerRunPickerProps, SeatLayerPageModalOptions {
  /** The buyer closed the run: hide the modal. */
  readonly onClose: () => void;
}

/**
 * The run picker on a modal of its own: full screen on a phone however it is
 * held, a dialog on a tablet. System Back does what ✕ does. Close it from
 * `onContinue` (after your server took the hold) and `onClose`.
 */
export function SeatLayerRunPickerModal(props: SeatLayerRunPickerModalProps): React.ReactElement {
  const picker = useRef<SeatLayerRunPickerHandle>(null);
  // One side for the whole modal, the frame included: the page keeps the side it boots on.
  const device = useColorScheme() === 'dark' ? 'dark' : 'light';
  const asked = props.themeMode === 'light' || props.themeMode === 'dark' ? props.themeMode : device;
  const side = useRef<'light' | 'dark' | undefined>(undefined);
  if (!props.visible) side.current = undefined;
  else side.current ??= asked;
  const themeMode = side.current ?? asked;
  const { visible, presentation, barrierDismissible, supportedOrientations, ...pickerProps } = props;
  const style = useMemo(() => [{ flex: 1 }, props.style], [props.style]);
  return (
    <SeatLayerPageModal {...props} themeMode={themeMode} picker={picker}>
      <SeatLayerRunPicker ref={picker} {...pickerProps} themeMode={themeMode} style={style} />
    </SeatLayerPageModal>
  );
}
