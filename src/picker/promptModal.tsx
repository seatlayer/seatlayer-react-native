import React, { type ReactNode } from 'react';
import { Modal, useWindowDimensions, type ModalProps } from 'react-native';

import { useSeatLayerPickerBlockedRegionCover } from './blockedRegionsContext';
import { seatLayerPickerTabletShortestSide } from './options';
import { SeatLayerPickerScopeReprovider, useSeatLayerPickerScope } from './SeatLayerPickerScope';

/**
 * iOS stands a modal upright on a phone unless told otherwise, and the whole
 * screen turns with it. Held sideways it opens sideways; held upright, and on a
 * tablet, it is as the platform has it.
 */
export function seatLayerPickerPromptOrientations(
  window: Readonly<{ width: number; height: number }>,
): ModalProps['supportedOrientations'] {
  return window.width > window.height && window.height < seatLayerPickerTabletShortestSide
    ? ['landscape', 'landscape-left', 'landscape-right'] : undefined;
}

/** Shared modal shell: every Android request-close enters the scope back ladder. */
export function SeatLayerPickerPromptModal({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const orientations = seatLayerPickerPromptOrientations(useWindowDimensions());
  // §2.4: a modal standing over the page covers the whole map, so the runtime
  // routes nothing under it while the sheet is up.
  useSeatLayerPickerBlockedRegionCover(visible);
  return (
    <Modal
      transparent
      visible={visible}
      accessibilityViewIsModal
      {...(orientations === undefined ? {} : { supportedOrientations: orientations })}
      onRequestClose={() => { void scope.back(); }}
    >
      <SeatLayerPickerScopeReprovider>{children}</SeatLayerPickerScopeReprovider>
    </Modal>
  );
}
