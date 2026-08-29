import React from 'react';
import { StatusBar } from 'react-native';

import { useSeatLayerPickerScope } from './SeatLayerPickerScope';
import { resolveSeatLayerPickerMapChromeTheme } from './mapChromeTheme';

/** Scope-driven system bar adapter; it owns no viewport space or navigation. */
export function SeatLayerPickerSystemStatusBar(): React.ReactElement {
  const scope = useSeatLayerPickerScope();
  const theme = resolveSeatLayerPickerMapChromeTheme(scope.resolvedTheme, scope.snapshot);
  return (
    <StatusBar
      backgroundColor={theme.colors.background}
      barStyle={theme.themeMode === 'dark' ? 'light-content' : 'dark-content'}
    />
  );
}
