import React, { type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  useWindowDimensions,
  View,
  type ModalProps,
} from 'react-native';

import {
  resolveSeatLayerPickerModalPresentation,
  seatLayerPickerModalMaximumHeight,
  seatLayerPickerModalMaximumWidth,
  seatLayerPickerModalOrientations,
  seatLayerPickerModalPresentationInset,
  type SeatLayerPickerModalPresentation,
} from '../picker/modalPresentation';

/** How the buyer asked the modal to close without the page's own ✕. */
export type SeatLayerSurfaceModalCloseReason = 'systemBack' | 'barrier';

export interface SeatLayerSurfaceModalProps {
  readonly visible: boolean;
  readonly presentation?: SeatLayerPickerModalPresentation;
  /** A tap beside the dialog closes it. Off unless asked for. */
  readonly barrierDismissible?: boolean;
  readonly supportedOrientations?: ModalProps['supportedOrientations'];
  /** The page's ground: behind a full-screen page, and the dialog's card. */
  readonly surfaceColor: string;
  readonly cardRadius: number;
  /** What a screen reader calls the barrier when a tap on it closes. */
  readonly closeLabel: string;
  /**
   * The app measures the safe area and hands it to the page, so the modal
   * draws under the status bar and adds no safe area of its own.
   */
  readonly usesHostInsets: boolean;
  /** System Back, or a tap on a dismissible barrier: the page is asked first. */
  readonly onRequestClose: (reason: SeatLayerSurfaceModalCloseReason) => void;
  /** Wraps what the native modal holds, for context a modal does not carry. */
  readonly within?: React.ComponentType<{ readonly children?: ReactNode }>;
  readonly testID?: string;
  readonly children?: ReactNode;
}

/**
 * The frame a SeatLayer page stands in on its own modal: full screen on a
 * phone however it is held, a dialog on a tablet; the page's ground behind it,
 * and system Back sent to the page.
 */
export function SeatLayerSurfaceModal(props: SeatLayerSurfaceModalProps): React.ReactElement {
  const { width, height } = useWindowDimensions();
  const dialog = resolveSeatLayerPickerModalPresentation(props.presentation, width, height) === 'dialog';
  const barrierDismissible = props.barrierDismissible === true;
  const bounded = dialog ? (
    <View pointerEvents="box-none" style={dialogBoundsStyle}>
      <View testID="seatlayer-modal-card" pointerEvents="auto" style={[
        dialogCardStyle,
        { backgroundColor: props.surfaceColor, borderRadius: props.cardRadius },
      ]}>
        {props.children}
      </View>
    </View>
  ) : props.children;
  const safe = props.usesHostInsets ? bounded : (
    <SafeAreaView style={[
      modalRootStyle,
      dialog ? undefined : { backgroundColor: props.surfaceColor },
    ]}>
      {bounded}
    </SafeAreaView>
  );
  const Within = props.within ?? Passthrough;
  return (
    <Modal
      visible={props.visible}
      transparent={dialog}
      animationType={dialog ? 'fade' : 'slide'}
      presentationStyle={dialog ? 'overFullScreen' : 'fullScreen'}
      statusBarTranslucent={props.usesHostInsets}
      supportedOrientations={props.supportedOrientations?.length
        ? props.supportedOrientations : seatLayerPickerModalOrientations}
      onRequestClose={() => props.onRequestClose('systemBack')}
    >
      <Within>
        <View testID={props.testID} style={modalRootStyle}>
          {dialog ? (
            <View style={modalRootStyle}>
              <Pressable
                testID="seatlayer-modal-barrier"
                accessible={barrierDismissible}
                accessibilityElementsHidden={!barrierDismissible}
                accessibilityLabel={barrierDismissible ? props.closeLabel : undefined}
                accessibilityRole={barrierDismissible ? 'button' : undefined}
                onPress={barrierDismissible ? () => props.onRequestClose('barrier') : undefined}
                style={barrierStyle}
              />
              {safe}
            </View>
          ) : safe}
        </View>
      </Within>
    </Modal>
  );
}

function Passthrough({ children }: { readonly children?: ReactNode }): React.ReactElement {
  return <>{children}</>;
}

const modalRootStyle = Object.freeze({ flex: 1 });
const barrierStyle = Object.freeze({
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: '#0000008A',
});
const dialogBoundsStyle = Object.freeze({
  flex: 1,
  justifyContent: 'center' as const,
  padding: seatLayerPickerModalPresentationInset,
});
const dialogCardStyle = Object.freeze({
  alignSelf: 'center' as const,
  width: '100%' as const,
  maxWidth: seatLayerPickerModalMaximumWidth,
  maxHeight: seatLayerPickerModalMaximumHeight,
  flex: 1,
  overflow: 'hidden' as const,
});
