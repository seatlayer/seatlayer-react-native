import React, { type ReactNode } from 'react';
import { Modal } from 'react-native';

import { useSeatLayerPickerBlockedRegionCover } from './blockedRegionsContext';
import { SeatLayerPickerScopeReprovider, useSeatLayerPickerScope } from './SeatLayerPickerScope';

/** Shared modal shell: every Android request-close enters the scope back ladder. */
export function SeatLayerPickerPromptModal({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  // §2.4: a modal standing over the page covers the whole map, so the runtime
  // routes nothing under it while the sheet is up.
  useSeatLayerPickerBlockedRegionCover(visible);
  return (
    <Modal
      transparent
      visible={visible}
      accessibilityViewIsModal
      onRequestClose={() => { void scope.back(); }}
    >
      <SeatLayerPickerScopeReprovider>{children}</SeatLayerPickerScopeReprovider>
    </Modal>
  );
}
