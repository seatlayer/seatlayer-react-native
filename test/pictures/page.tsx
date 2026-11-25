import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/800.css';
import '@fontsource/roboto/900.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/700.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import {
  SeatLayerPickerVisualFixture,
  type SeatLayerVisualFixtureScenario,
} from '../fixtures/PickerVisualFixture';
import { picturesSetup } from './setup';

const dir = picturesSetup.rtl ? 'rtl' : 'ltr';
document.documentElement.dir = dir;

createRoot(document.getElementById('root')!).render(
  // The start and end of a style follow the direction of the view around it.
  <View {...{ dir }} style={{ flex: 1 }}>
    <SeatLayerPickerVisualFixture
      mode={picturesSetup.mode}
      scenario={picturesSetup.scenario as SeatLayerVisualFixtureScenario}
      device={{ insets: picturesSetup.insets, rtl: picturesSetup.rtl }}
    />
  </View>,
);
