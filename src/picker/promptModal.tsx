import React, { type ReactNode } from 'react';
import { Modal } from 'react-native';

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
