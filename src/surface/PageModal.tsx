import React from 'react';
import type { ModalProps } from 'react-native';

import type { SeatLayerPickerModalPresentation } from '../picker/modalPresentation';
import type { SeatLayerPagePickerHandle, SeatLayerPagePickerLook } from './PagePicker';
import { useSeatLayerSurfaceLook } from './SurfaceHeader';
import { SeatLayerSurfaceModal } from './SurfaceModal';

/** How a picker on a page of its own sits on its modal. */
export interface SeatLayerPageModalOptions {
  readonly visible: boolean;
  readonly presentation?: SeatLayerPickerModalPresentation;
  /** A tap beside the dialog does what ✕ does. Off unless asked for. */
  readonly barrierDismissible?: boolean;
  readonly supportedOrientations?: ModalProps['supportedOrientations'];
}

/**
 * @internal The modal a picker on a page of its own sits on: full screen on a
 * phone however it is held, a dialog on a tablet. System Back does what ✕ does.
 */
export function SeatLayerPageModal(props: SeatLayerPageModalOptions & SeatLayerPagePickerLook & {
  readonly picker: React.RefObject<SeatLayerPagePickerHandle | null>;
  readonly children: React.ReactNode;
}): React.ReactElement {
  // The organizer's brand never sets the ground, so the frame needs no status.
  const look = useSeatLayerSurfaceLook({
    themeMode: props.themeMode,
    themeOptions: props.themeOptions,
    locale: props.locale,
    strings: props.strings,
  });
  return (
    <SeatLayerSurfaceModal
      visible={props.visible}
      presentation={props.presentation}
      barrierDismissible={props.barrierDismissible}
      supportedOrientations={props.supportedOrientations}
      surfaceColor={look.theme.colors.surface}
      cardRadius={look.theme.radii.card}
      closeLabel={look.strings.translate('close')}
      usesHostInsets={props.safeAreaInsets !== undefined}
      onRequestClose={() => { void props.picker.current?.requestClose(); }}
    >
      {props.children}
    </SeatLayerSurfaceModal>
  );
}
